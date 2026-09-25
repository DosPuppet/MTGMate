/**
 * Interpréteur d'effets. Les effets sont des données (voir types.ts) : l'état reste sérialisable,
 * et une résolution pourra être suspendue sur un choix du joueur puis reprise.
 */
import {
  createTokenCopy,
  createTokens,
  type DamageSource,
  dealDamage,
  destroy,
  drawCard,
  gainLife,
  loseLife,
  putIntoGraveyard,
  removeFromCombat,
  sourceFromObject,
} from "./actions";
import { canPay, costToText, manaValue, payMana } from "./mana";
import { addReplacement } from "./replacement";
import { counterItem } from "./stack";
import {
  alivePlayers,
  bump,
  changeCounters,
  chars,
  counterCount,
  emit,
  isCreature,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  P1P1,
  shuffle,
} from "./state";
import { matchesCard, matchesObjectFilter } from "./targets";
import { checkCondition, createDelayed, pushInline } from "./triggers";
import type {
  Amount,
  ChoiceRequest,
  ChoiceValue,
  Condition,
  Effect,
  GameState,
  Keyword,
  LayerMods,
  MoveSpec,
  ObjectId,
  PlayerId,
  Ref,
  Resolution,
  TriggerEventData,
  Zone,
} from "./types";

export interface EffectContext {
  controller: PlayerId;
  /** Sort : l'objet sur la pile. Capacité : le permanent source. */
  sourceId: ObjectId;
  sourceDefId: string;
  /** Informations de dernière connaissance de la source. */
  sourceSnapshot: { keywords: Keyword[]; power: number };
  /** Cibles encore légales à la résolution. */
  targets: Record<string, string[]>;
  x: number;
  kicked: boolean;
  /** Capacité déclenchée : données de l'événement déclencheur. */
  event?: TriggerEventData;
  /** Valeurs mémorisées pendant la résolution (voir `store`). */
  vars?: Record<string, ChoiceValue[]>;
}

/** Mémorise une valeur de résolution (« si vous le faites », « la vie perdue de cette façon »). */
function store(r: Resolution, name: string | undefined, n: number): void {
  if (!name) return;
  r.vars[`$${name}`] = [n];
}

function readVar(ctx: EffectContext, name: string): number {
  return Number(ctx.vars?.[`$${name}`]?.[0] ?? 0);
}

/** Condition évaluée pendant la résolution (elle peut dépendre du kicker ou des valeurs mémorisées). */
export function evalCondition(s: GameState, ctx: EffectContext, c: Condition): boolean {
  switch (c.kind) {
    case "kicked":
      return ctx.kicked;
    case "var":
      return readVar(ctx, c.name) >= (c.atLeast ?? 1);
    case "not":
      return !evalCondition(s, ctx, c.cond);
    case "all":
      return c.of.every((x) => evalCondition(s, ctx, x));
    case "refLife": {
      const p = resolveRef(s, ctx, c.ref)[0];
      return !!p && s.players[p]?.life === c.equals;
    }
    default:
      return checkCondition(s, c, ctx.controller, ctx.sourceId);
  }
}

export function resolveRef(s: GameState, ctx: EffectContext, ref: Ref): string[] {
  switch (ref.kind) {
    case "target":
      return ctx.targets[ref.id] ?? [];
    case "self":
      return [ctx.sourceId];
    case "you":
      return [ctx.controller];
    case "eachOpponent":
      return opponentsOf(s, ctx.controller);
    case "eachPlayer":
      return alivePlayers(s);
    case "eventObject": {
      const ev = ctx.event;
      if (!ev?.objectId) return [];
      // L'objet tel qu'il est encore, sinon ce qu'il est devenu après son changement de zone.
      if (s.objects[ev.objectId] || s.stack.some((x) => x.id === ev.objectId)) return [ev.objectId];
      return ev.newObjectId && s.objects[ev.newObjectId] ? [ev.newObjectId] : [];
    }
    case "eventPlayer":
      return ctx.event?.player ? [ctx.event.player] : [];
    case "controllerOf":
      return resolveRef(s, ctx, ref.ref).flatMap((id) => {
        if (isPlayer(s, id)) return [id];
        const o = s.objects[id];
        if (o) return [o.zone === "battlefield" || o.zone === "stack" ? o.controller : o.owner];
        const item = s.stack.find((x) => x.id === id);
        if (item) return [item.controller];
        return s.lki[id] ? [s.lki[id].controller] : [];
      });
    case "stored":
      return (ctx.vars?.[`$ids:${ref.name}`] ?? []).map(String).filter((id) => !!s.objects[id]);
  }
}

export function evalAmount(s: GameState, ctx: EffectContext, a: Amount): number {
  if (typeof a === "number") return a;
  switch (a.kind) {
    case "x":
      return ctx.x;
    case "kicked":
      return ctx.kicked ? a.yes : a.no;
    case "powerOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      if (!id) return 0;
      if (onBattlefield(s, id)) return Math.max(0, chars(s, id).power);
      if (id === ctx.sourceId) return Math.max(0, ctx.sourceSnapshot.power);
      return Math.max(0, s.lki[id]?.power ?? 0);
    }
    case "eventAmount":
      return ctx.event?.amount ?? 0;
    case "count":
      if (a.zone && a.zone !== "battlefield") {
        const players =
          a.whose === "all" ? alivePlayers(s) : a.whose === "opponents" ? opponentsOf(s, ctx.controller) : [ctx.controller];
        return players
          .flatMap((p) => s.players[p]?.[a.zone as "graveyard" | "hand"] ?? [])
          .filter((id) => matchesCard(s, ctx.controller, id, { ...a.filter, controller: undefined }, ctx.sourceId)).length;
      }
      return boardAmount(s, a, ctx.controller, ctx.sourceId);
    case "totalPower":
      return boardAmount(s, a, ctx.controller, ctx.sourceId);
    case "lifeGainedThisTurn":
      return s.players[ctx.controller]?.turnStats.lifeGained ?? 0;
    case "countersOn": {
      const id = resolveRef(s, ctx, a.ref)[0];
      const counters = (id && (s.objects[id]?.counters ?? s.lki[id]?.counters)) || {};
      return counters[a.counter] ?? 0;
    }
    case "differentManaValues": {
      const values = new Set<number>();
      for (const id of s.battlefield) {
        const o = s.objects[id];
        if (o?.controller !== ctx.controller || chars(s, id).types.includes("Land")) continue;
        values.add(manaValue(s.defs[o.defId]?.manaCost));
      }
      return values.size;
    }
    case "sum":
      return a.of.reduce<number>((n, x) => n + evalAmount(s, ctx, x), 0);
    case "var":
      return readVar(ctx, a.name);
    case "lifeTotal":
      return Math.max(0, s.players[ctx.controller]?.life ?? 0);
    case "cardsIn":
      return s.players[ctx.controller]?.[a.zone].length ?? 0;
  }
}

/** Quantités qui ne dépendent que du plateau (comptes, force totale), vues d'un joueur. */
export function boardAmount(
  s: GameState,
  a: Extract<Amount, { kind: "count" | "totalPower" }>,
  controller: PlayerId,
  sourceId?: ObjectId,
): number {
  const ids = s.battlefield.filter((id) => matchesObjectFilter(s, controller, id, a.filter, sourceId));
  if (a.kind === "count") return ids.length;
  return ids.reduce((n, id) => n + Math.max(0, chars(s, id).power), 0);
}

function damageSource(s: GameState, ctx: EffectContext, ref?: Ref): DamageSource | null {
  if (!ref || (ref.kind === "self" && !onBattlefield(s, ctx.sourceId))) {
    return { defId: ctx.sourceDefId, controller: ctx.controller, keywords: ctx.sourceSnapshot.keywords };
  }
  const id = resolveRef(s, ctx, ref)[0];
  if (!id || !onBattlefield(s, id)) return null;
  return sourceFromObject(s, id);
}

function addPump(s: GameState, affected: ObjectId[], power: number, toughness: number, keywords: Keyword[] = []): void {
  if (affected.length === 0) return;
  bump(s);
  s.effects.push({
    id: newId(s, "e"),
    timestamp: nextTimestamp(s),
    affected,
    power,
    toughness,
    addKeywords: keywords,
    duration: "endOfTurn",
  });
}

/** Résultat d'un effet : terminé, question au joueur (la résolution est suspendue), ou saut d'effets. */
export type OpResult = undefined | { ask: { player: PlayerId; request: ChoiceRequest; key: string } } | { skip: number };

export function contextOf(r: Resolution): EffectContext {
  return {
    controller: r.controller,
    sourceId: r.item.sourceId,
    sourceDefId: r.item.sourceDefId,
    sourceSnapshot: r.item.sourceSnapshot,
    targets: r.targets,
    x: r.item.x,
    kicked: r.item.kicked,
    event: r.item.event,
    vars: r.vars,
  };
}

function nameOf(s: GameState, id: string): string {
  return s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
}

function moveAndLog(s: GameState, id: ObjectId, to: "hand" | "exile" | "graveyard"): void {
  const o = s.objects[id];
  if (!o) return;
  emit({ type: "moved", objectId: id, defId: o.defId, from: o.zone, to });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  moveObject(s, id, to);
}

/** Ajoute un effet continu (couches) à des objets. */
function addEffect(s: GameState, ids: ObjectId[], mods: LayerMods, duration: "endOfTurn" | "permanent"): void {
  if (ids.length === 0) return;
  bump(s);
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: ids, duration, ...mods });
}

/** Déplace un objet selon une destination d'effet ; renvoie son nouvel identifiant. */
export function moveWithSpec(s: GameState, controller: PlayerId, id: ObjectId, spec: MoveSpec): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  const zone: Zone = spec.to === "libraryTop" || spec.to === "libraryBottom" ? "library" : (spec.to as Zone);
  emit({ type: "moved", objectId: id, defId: o.defId, from: o.zone, to: zone });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  const newId_ = moveObject(s, id, zone, {
    controller: spec.to === "battlefield" ? (spec.underYourControl ? controller : o.owner) : undefined,
    position: spec.to === "libraryBottom" ? "bottom" : "top",
  });
  const moved = newId_ ? s.objects[newId_] : undefined;
  if (!moved || zone !== "battlefield") return newId_;
  if (spec.tapped) moved.tapped = true;
  if (spec.counters) changeCounters(s, moved, spec.counters.kind, spec.counters.n);
  if (spec.addTypes || spec.addSubtypes || spec.addKeywords) {
    addEffect(
      s,
      [moved.id],
      { addTypes: spec.addTypes, addSubtypes: spec.addSubtypes, addKeywords: spec.addKeywords },
      "permanent",
    );
  }
  return newId_;
}

/** Cartes d'une zone appartenant à des joueurs donnés. */
function zoneCards(s: GameState, players: string[], zone: "graveyard" | "library" | "hand"): ObjectId[] {
  return players.flatMap((p) => s.players[p]?.[zone] ?? []);
}

/**
 * Exécute un effet. Les effets qui demandent un choix renvoient `ask` : la résolution est suspendue,
 * puis l'effet est rejoué une fois la réponse rangée dans `r.vars[key]`.
 */
export function runEffect(s: GameState, r: Resolution, e: Effect): OpResult {
  const ctx = contextOf(r);
  const key = (suffix: string) => `${r.pc}:${suffix}`;
  switch (e.op) {
    case "damage": {
      const src = damageSource(s, ctx, e.source);
      if (!src) return;
      const amount = evalAmount(s, ctx, e.amount);
      for (const t of resolveRef(s, ctx, e.to)) {
        if (e.storeExcess && onBattlefield(s, t) && isCreature(s, t)) {
          // 120.4a : blessures au-delà des blessures mortelles.
          const lethal = src.keywords.includes("deathtouch")
            ? Math.min(1, chars(s, t).toughness - (s.objects[t]?.damage ?? 0))
            : chars(s, t).toughness - (s.objects[t]?.damage ?? 0);
          store(r, e.storeExcess, Math.max(0, amount - Math.max(0, lethal)));
        }
        dealDamage(s, src, t, amount, false);
      }
      return;
    }
    case "fight": {
      const a = resolveRef(s, ctx, e.a)[0];
      const b = resolveRef(s, ctx, e.b)[0];
      // 701.12b : si l'une des créatures n'est plus là, aucune blessure n'est infligée.
      if (!a || !b || !onBattlefield(s, a) || !onBattlefield(s, b) || !isCreature(s, a) || !isCreature(s, b)) return;
      const pa = chars(s, a).power;
      const pb = chars(s, b).power;
      const sa = sourceFromObject(s, a);
      const sb = sourceFromObject(s, b);
      dealDamage(s, sa, b, pa, false);
      dealDamage(s, sb, a, pb, false);
      return;
    }
    case "pump": {
      const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
      addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
      return;
    }
    case "pumpAll": {
      const ids = s.battlefield.filter((id) => isCreature(s, id) && matchesObjectFilter(s, ctx.controller, id, e.filter));
      addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
      return;
    }
    case "modify": {
      const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
      if (ids.length === 0) return;
      bump(s);
      s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: ids, duration: e.duration, ...e.mods });
      return;
    }
    case "destroy": {
      for (const id of resolveRef(s, ctx, e.what)) destroy(s, id);
      return;
    }
    case "exileIfDies":
    case "preventCombatDamage": {
      addReplacement(
        s,
        e.op,
        resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id)),
        newId(s, "r"),
      );
      return;
    }
    case "counter": {
      for (const id of resolveRef(s, ctx, e.what)) counterItem(s, id, ctx.sourceDefId);
      return;
    }
    case "unlessPay": {
      const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      if (!p) return;
      const mana = e.mana;
      const canDo = mana ? canPay(s, p, mana) : (s.players[p]?.life ?? 0) >= (e.life ?? 0);
      if (!canDo) return;
      const answer = r.vars[key("unless")];
      if (!answer) {
        const what = mana ? `payer ${costToText(mana)}` : `payer ${e.life} points de vie`;
        return {
          ask: {
            player: p,
            key: key("unless"),
            request: {
              type: "yesNo",
              intent: "unlessPay",
              prompt: `${nameOf(s, ctx.sourceId)} : ${what} pour l'éviter ?`,
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] !== 1) return;
      if (mana) {
        if (!canPay(s, p, mana)) return;
        payMana(s, p, mana);
      } else loseLife(s, p, e.life ?? 0);
      return { skip: e.skip };
    }
    case "allowCastFromGraveyard": {
      const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
      s.turn.mayCastFromGraveyard = [...(s.turn.mayCastFromGraveyard ?? []), ...ids];
      return;
    }
    case "doubleAllCounters": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        for (const [kind, n] of Object.entries({ ...o.counters })) if (n > 0) changeCounters(s, o, kind, n);
      }
      return;
    }
    case "exileUntilLeaves": {
      // 610.3c : si la source a déjà quitté le champ de bataille, rien n'est exilé.
      if (!onBattlefield(s, ctx.sourceId)) return;
      const cards: string[] = [];
      for (const id of resolveRef(s, ctx, e.what)) {
        if (!onBattlefield(s, id)) continue;
        const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
        if (n) cards.push(n);
      }
      if (cards.length) s.linkedExile.push({ sourceId: ctx.sourceId, cards });
      return;
    }
    case "pickFromZone": {
      const pool = (s.players[ctx.controller]?.[e.zone] ?? []).filter((id) =>
        matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }, ctx.sourceId),
      );
      const count = Math.min(evalAmount(s, ctx, e.count), pool.length);
      if (count <= 0) return;
      const min = Math.min(e.min ?? count, count);
      let picked = pool.length === count && min === count ? pool : null;
      if (!picked) {
        const answer = r.vars[key("pickZone")];
        if (!answer) {
          return {
            ask: {
              player: ctx.controller,
              key: key("pickZone"),
              request: {
                type: "pick",
                intent: "pickCards",
                prompt: e.prompt ?? `Choisissez ${count} carte(s)`,
                options: pool,
                min,
                max: count,
                suggested: pool.slice(0, count),
              },
            },
          };
        }
        picked = answer.map(String);
      }
      for (const id of picked) moveWithSpec(s, ctx.controller, id, e.to);
      return;
    }
    case "libraryTopOrBottom": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        const answer = r.vars[key(`tb-${id}`)];
        if (!answer) {
          return {
            ask: {
              player: o.owner,
              key: key(`tb-${id}`),
              request: {
                type: "pick",
                intent: "topOrBottom",
                prompt: `${nameOf(s, id)} : au-dessus ou au-dessous de votre bibliothèque ?`,
                options: ["top", "bottom"],
                labels: { top: "Au-dessus", bottom: "Au-dessous" },
                min: 1,
                max: 1,
                suggested: [o.controller === ctx.controller ? "top" : "bottom"],
              },
            },
          };
        }
        moveWithSpec(s, ctx.controller, id, { to: answer[0] === "top" ? "libraryTop" : "libraryBottom" });
      }
      return;
    }
    case "punisher": {
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p) || r.vars[key(`pdone-${p}`)]) continue;
        const hand = s.players[p]?.hand ?? [];
        const f = e.sacrifice;
        const perms = f ? s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f)) : [];
        const options = ["life", ...(e.discard && hand.length ? ["discard"] : []), ...(perms.length ? ["sacrifice"] : [])];
        let choice = options.length === 1 ? "life" : r.vars[key(`punish-${p}`)]?.[0];
        if (choice === undefined) {
          return {
            ask: {
              player: p,
              key: key(`punish-${p}`),
              request: {
                type: "pick",
                intent: "punisher",
                prompt: `${nameOf(s, ctx.sourceId)} : choisissez`,
                options,
                labels: { life: `Perdre ${e.loseLife} PV`, discard: "Défausser une carte", sacrifice: "Sacrifier un permanent" },
                min: 1,
                max: 1,
                suggested: [options[options.length - 1] as string],
              },
            },
          };
        }
        choice = String(choice);
        if (choice === "life") {
          loseLife(s, p, e.loseLife);
          r.vars[key(`pdone-${p}`)] = [1];
          continue;
        }
        const pool = choice === "discard" ? hand : perms;
        const picked = pool.length === 1 ? [pool[0] as string] : r.vars[key(`punishPick-${p}`)]?.map(String);
        if (!picked) {
          return {
            ask: {
              player: p,
              key: key(`punishPick-${p}`),
              request: {
                type: "pick",
                intent: choice === "discard" ? "discard" : "sacrifice",
                prompt: choice === "discard" ? "Défaussez une carte" : "Sacrifiez un permanent",
                options: [...pool],
                min: 1,
                max: 1,
                suggested: [pool[0] as string],
              },
            },
          };
        }
        r.vars[key(`pdone-${p}`)] = [1];
        for (const id of picked) {
          if (choice === "discard") {
            emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
            moveObject(s, id, "graveyard");
          } else if (onBattlefield(s, id)) putIntoGraveyard(s, id);
        }
      }
      return;
    }
    case "revealUntil": {
      const player = s.players[ctx.controller];
      if (!player) return;
      const i = player.library.findIndex((id) => matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }));
      const revealed = i < 0 ? [...player.library] : player.library.slice(0, i + 1);
      const found = i < 0 ? null : (player.library[i] as string);
      const rest = revealed.filter((id) => id !== found);
      if (found) moveWithSpec(s, ctx.controller, found, e.to);
      const lib = player.library.filter((id) => !rest.includes(id));
      shuffle(s, rest);
      player.library = [...lib, ...rest];
      return;
    }
    case "doubleCounters": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone === "battlefield") changeCounters(s, o, P1P1, counterCount(o, P1P1));
      }
      return;
    }
    case "draw": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) for (let i = 0; i < n; i++) drawCard(s, p);
      return;
    }
    case "gainLife": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) gainLife(s, p, n);
      return;
    }
    case "loseLife": {
      const n = evalAmount(s, ctx, e.amount);
      let lost = 0;
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p)) continue;
        loseLife(s, p, n);
        lost += n;
      }
      store(r, e.store, lost);
      return;
    }
    case "createTokens": {
      const n = evalAmount(s, ctx, e.count);
      for (const p of e.for ? resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x)) : [ctx.controller])
        createTokens(s, p, e.token, n);
      return;
    }
    case "addCounters": {
      const n = evalAmount(s, ctx, e.amount);
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone === "battlefield") changeCounters(s, o, e.kind ?? P1P1, n);
      }
      return;
    }
    case "bounce": {
      for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) moveAndLog(s, id, "hand");
      return;
    }
    case "exile": {
      for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) moveAndLog(s, id, "exile");
      return;
    }
    case "mill": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) {
        for (const id of (s.players[p]?.library ?? []).slice(0, n)) moveAndLog(s, id, "graveyard");
      }
      return;
    }
    case "scry":
    case "surveil": {
      const library = s.players[ctx.controller]?.library ?? [];
      const top = library.slice(0, evalAmount(s, ctx, e.amount));
      if (top.length === 0) return;
      const scry = e.op === "scry";
      const picked = r.vars[key("pick")];
      if (!picked) {
        return {
          ask: {
            player: ctx.controller,
            key: key("pick"),
            request: {
              type: "pick",
              intent: scry ? "scryBottom" : "surveilGraveyard",
              prompt: scry
                ? `Regard ${top.length} : choisissez les cartes à mettre au-dessous de votre bibliothèque`
                : `Surveillance ${top.length} : choisissez les cartes à mettre dans votre cimetière`,
              options: top,
              min: 0,
              max: top.length,
              suggested: [],
            },
          },
        };
      }
      const keep = top.filter((id) => !picked.includes(id));
      let order = keep;
      if (keep.length > 1) {
        const answer = r.vars[key("order")];
        if (!answer) {
          return {
            ask: {
              player: ctx.controller,
              key: key("order"),
              request: {
                type: "order",
                intent: "scryOrder",
                prompt: "Ordre des cartes remises au-dessus (la première sera piochée en premier)",
                items: keep,
                suggested: keep,
              },
            },
          };
        }
        order = answer.map(String);
      }
      const player = s.players[ctx.controller];
      if (!player) return;
      const rest = player.library.slice(top.length);
      if (scry) {
        player.library = [...order, ...rest, ...picked.map(String)];
        emit({ type: "scry", player: ctx.controller, top: order.length, bottom: picked.length });
      } else {
        player.library = [...order, ...rest];
        for (const id of picked.map(String)) {
          player.library.push(id); // temporaire : moveAndLog le retire de la bibliothèque
          moveAndLog(s, id, "graveyard");
        }
      }
      return;
    }
    case "discard": {
      const n = evalAmount(s, ctx, e.amount);
      const f = e.filter;
      for (const p of resolveRef(s, ctx, e.who)) {
        if (r.vars[key(`done-${p}`)]) continue;
        const hand = (s.players[p]?.hand ?? []).filter((id) => !f || matchesCard(s, p, id, { ...f, controller: undefined }));
        const chooser = e.chooser === "controller" ? ctx.controller : p;
        let chosen: string[];
        if (hand.length <= n && !e.optional && !e.chooser) chosen = [...hand];
        else if (hand.length === 0) chosen = [];
        else {
          const answer = r.vars[key(`discard-${p}`)];
          if (!answer) {
            const max = Math.min(n, hand.length);
            return {
              ask: {
                player: chooser,
                key: key(`discard-${p}`),
                request: {
                  type: "pick",
                  intent: "discard",
                  prompt:
                    chooser === p
                      ? `${e.optional ? "Vous pouvez défausser" : "Défaussez"} ${n} carte(s)`
                      : `Choisissez ${max} carte(s) que ce joueur défausse`,
                  options: [...hand],
                  min: e.optional ? 0 : max,
                  max,
                  suggested: e.optional ? [] : hand.slice(0, max),
                },
              },
            };
          }
          chosen = answer.map(String);
        }
        r.vars[key(`done-${p}`)] = [1];
        store(r, e.store, readVar(ctx, e.store ?? "") + chosen.length);
        if (chosen.length === 0) continue;
        emit({ type: "discard", player: p, defIds: chosen.map((id) => s.objects[id]?.defId ?? "") });
        for (const id of chosen) moveObject(s, id, "graveyard");
      }
      return;
    }
    case "sacrifice": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) {
        if (r.vars[key(`done-${p}`)]) continue;
        const candidates = s.battlefield.filter(
          (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, e.filter, ctx.sourceId),
        );
        let chosen: string[];
        if (candidates.length <= n && !e.optional) chosen = candidates;
        else if (candidates.length === 0) chosen = [];
        else {
          const answer = r.vars[key(`sac-${p}`)];
          if (!answer) {
            const max = Math.min(n, candidates.length);
            return {
              ask: {
                player: p,
                key: key(`sac-${p}`),
                request: {
                  type: "pick",
                  intent: "sacrifice",
                  prompt: `${e.optional ? "Vous pouvez sacrifier" : "Sacrifiez"} ${n} permanent(s)`,
                  options: candidates,
                  min: e.optional ? 0 : max,
                  max,
                  suggested: e.optional ? [] : candidates.slice(0, max),
                },
              },
            };
          }
          chosen = answer.map(String);
        }
        r.vars[key(`done-${p}`)] = [1];
        store(r, e.store, readVar(ctx, e.store ?? "") + chosen.length);
        for (const id of chosen) if (onBattlefield(s, id)) putIntoGraveyard(s, id);
      }
      return;
    }
    case "tap": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone === "battlefield") o.tapped = !e.untap;
      }
      return;
    }
    case "damageAll": {
      const src = damageSource(s, ctx);
      if (!src) return;
      const amount = evalAmount(s, ctx, e.amount);
      if (e.filter) {
        const f = e.filter;
        for (const id of s.battlefield.filter(
          (x) => isCreature(s, x) && matchesObjectFilter(s, ctx.controller, x, f, ctx.sourceId),
        )) {
          dealDamage(s, src, id, amount, false);
        }
      }
      if (e.players) for (const p of resolveRef(s, ctx, e.players)) dealDamage(s, src, p, amount, false);
      return;
    }
    case "destroyAll": {
      for (const id of s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId)))
        destroy(s, id);
      return;
    }
    case "addCountersAll": {
      const n = evalAmount(s, ctx, e.amount);
      for (const id of s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId))) {
        const o = s.objects[id];
        if (o) changeCounters(s, o, e.kind ?? P1P1, n);
      }
      return;
    }
    case "modifyAll": {
      const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
      addEffect(s, ids, e.mods, "endOfTurn");
      return;
    }
    case "sacrificeIt": {
      for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) putIntoGraveyard(s, id);
      return;
    }
    case "moveTo": {
      const ids = resolveRef(s, ctx, e.what);
      const f = e.store?.filter;
      if (e.store)
        store(
          r,
          e.store.name,
          ids.filter((id) => !f || matchesCard(s, ctx.controller, id, { ...f, controller: undefined })).length,
        );
      const moved: string[] = [];
      for (const id of ids) {
        const n = moveWithSpec(s, ctx.controller, id, e.spec);
        if (n) moved.push(n);
      }
      if (e.store) r.vars[`$ids:${e.store.name}`] = moved;
      return;
    }
    case "mayPay": {
      if (!canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
      const answer = r.vars[key("pay")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("pay"),
            request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
          },
        };
      }
      if (answer[0] !== 1 || !canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
      payMana(s, ctx.controller, e.cost);
      return;
    }
    case "moveAll": {
      const players = resolveRef(s, ctx, e.whose).filter((p) => isPlayer(s, p));
      const ids =
        e.from === "battlefield"
          ? s.battlefield.filter(
              (id) =>
                players.includes(s.objects[id]?.controller ?? "") &&
                matchesObjectFilter(s, ctx.controller, id, { ...e.filter, controller: undefined }, ctx.sourceId),
            )
          : zoneCards(s, players, "graveyard").filter((id) =>
              matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }, ctx.sourceId),
            );
      for (const id of ids) moveWithSpec(s, ctx.controller, id, e.spec);
      return;
    }
    case "if": {
      return evalCondition(s, ctx, e.cond) ? undefined : { skip: e.skip };
    }
    case "shuffle": {
      for (const p of resolveRef(s, ctx, e.who)) {
        const pl = s.players[p];
        if (pl) shuffle(s, pl.library);
      }
      return;
    }
    case "lookAtTop": {
      const player = s.players[ctx.controller];
      if (!player) return;
      const top = player.library.slice(0, evalAmount(s, ctx, e.n));
      if (top.length === 0) return;
      const maxMv = e.maxManaValue === undefined ? undefined : evalAmount(s, ctx, e.maxManaValue);
      const filter = maxMv === undefined ? e.filter : { ...e.filter, maxManaValue: maxMv };
      const options = top.filter((id) => !filter || matchesCard(s, ctx.controller, id, filter, ctx.sourceId));
      const count = evalAmount(s, ctx, e.count);
      let picked: string[] = [];
      if (options.length > 0 && count > 0) {
        const answer = r.vars[key("look")];
        if (!answer) {
          return {
            ask: {
              player: ctx.controller,
              key: key("look"),
              request: {
                type: "pick",
                intent: "lookAtTop",
                prompt: `Vous regardez les ${top.length} cartes du dessus : choisissez-en jusqu'à ${count}`,
                options,
                min: 0,
                max: Math.min(count, options.length),
                suggested: options.slice(0, Math.min(count, options.length)),
              },
            },
          };
        }
        picked = answer.map(String);
      }
      const rest = top.filter((id) => !picked.includes(id));
      for (const id of picked) moveWithSpec(s, ctx.controller, id, e.to);
      if (e.rest === "graveyard") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "graveyard" });
      else if (e.rest === "bottom") {
        // Ordre aléatoire (« dans un ordre aléatoire »).
        const lib = player.library.filter((id) => !rest.includes(id));
        const shuffled = [...rest];
        shuffle(s, shuffled);
        player.library = [...lib, ...shuffled];
      }
      return;
    }
    case "search": {
      const player = s.players[ctx.controller];
      if (!player) return;
      const count = evalAmount(s, ctx, e.count);
      const options = player.library.filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId));
      let picked: string[] = [];
      if (options.length > 0 && count > 0) {
        const answer = r.vars[key("search")];
        if (!answer) {
          return {
            ask: {
              player: ctx.controller,
              key: key("search"),
              request: {
                type: "pick",
                intent: "search",
                prompt: `Cherchez dans votre bibliothèque : jusqu'à ${count} carte(s)`,
                options,
                min: 0,
                max: Math.min(count, options.length),
                suggested: options.slice(0, Math.min(count, options.length)),
              },
            },
          };
        }
        picked = answer.map(String);
      }
      // 701.23 : on mélange après la recherche ; « sur le dessus » s'applique après le mélange.
      const toTop = e.to.to === "libraryTop";
      for (const id of picked) if (!toTop) moveWithSpec(s, ctx.controller, id, e.to);
      shuffle(s, player.library);
      if (toTop) for (const id of picked) player.library = [id, ...player.library.filter((x) => x !== id)];
      return;
    }
    case "copyToken": {
      const n = e.count === undefined ? 1 : evalAmount(s, ctx, e.count);
      for (const id of resolveRef(s, ctx, e.of)) {
        const model = s.objects[id] ?? undefined;
        const defId = model?.defId ?? s.lki[id]?.defId;
        if (!defId) continue;
        for (let i = 0; i < n; i++) {
          const token = createTokenCopy(s, ctx.controller, defId);
          if (e.addKeywords?.length) addEffect(s, [token], { addKeywords: e.addKeywords }, "permanent");
          if (e.sacrificeAtEndStep) {
            createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
              targets: [],
              effects: [{ op: "sacrificeIt", what: { kind: "target", id: "copy" } }],
              bound: { copy: [token] },
              label: "sacrifier la copie",
            });
          }
        }
      }
      return;
    }
    case "delayed": {
      const bound: Record<string, string[]> = {};
      for (const [k, ref] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, ref);
      createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: [], effects: e.effects, bound });
      return;
    }
    case "reflexive": {
      pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: e.targets, effects: e.effects });
      return;
    }
    case "may": {
      const answer = r.vars[key("may")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("may"),
            request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
          },
        };
      }
      return answer[0] === 1 ? undefined : { skip: e.skip };
    }
  }
}
