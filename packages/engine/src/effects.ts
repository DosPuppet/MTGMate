/**
 * Interpréteur d'effets. Les effets sont des données (voir types.ts) : l'état reste sérialisable,
 * et une résolution pourra être suspendue sur un choix du joueur puis reprise.
 */
import {
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
import { addReplacement } from "./replacement";
import { bump, chars, emit, isCreature, isPlayer, moveObject, newId, nextTimestamp, onBattlefield, opponentsOf } from "./state";
import { matchesObjectFilter } from "./targets";
import type {
  Amount,
  ChoiceRequest,
  Effect,
  GameState,
  Keyword,
  ObjectId,
  PlayerId,
  Ref,
  Resolution,
  TriggerEventData,
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
    case "eventObject": {
      const ev = ctx.event;
      if (!ev?.objectId) return [];
      // L'objet tel qu'il est encore, sinon ce qu'il est devenu après son changement de zone.
      if (s.objects[ev.objectId]) return [ev.objectId];
      return ev.newObjectId && s.objects[ev.newObjectId] ? [ev.newObjectId] : [];
    }
    case "eventPlayer":
      return ctx.event?.player ? [ctx.event.player] : [];
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
    case "totalPower":
      return boardAmount(s, a, ctx.controller, ctx.sourceId);
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
      for (const t of resolveRef(s, ctx, e.to)) dealDamage(s, src, t, amount, false);
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
    case "doubleCounters": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone === "battlefield" && o.counters.p1p1 > 0) {
          o.counters.p1p1 *= 2;
          bump(s);
        }
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
      for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) loseLife(s, p, n);
      return;
    }
    case "createTokens": {
      createTokens(s, ctx.controller, e.token, evalAmount(s, ctx, e.count));
      return;
    }
    case "addCounters": {
      const n = evalAmount(s, ctx, e.amount);
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone === "battlefield") {
          o.counters.p1p1 += n;
          bump(s);
        }
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
      for (const p of resolveRef(s, ctx, e.who)) {
        if (r.vars[key(`done-${p}`)]) continue;
        const hand = s.players[p]?.hand ?? [];
        let chosen: string[];
        if (hand.length <= n) chosen = [...hand];
        else {
          const answer = r.vars[key(`discard-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`discard-${p}`),
                request: {
                  type: "pick",
                  intent: "discard",
                  prompt: `Défaussez ${n} carte(s)`,
                  options: [...hand],
                  min: n,
                  max: n,
                  suggested: hand.slice(0, n),
                },
              },
            };
          }
          chosen = answer.map(String);
        }
        r.vars[key(`done-${p}`)] = [1];
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
          (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, e.filter),
        );
        let chosen: string[];
        if (candidates.length <= n) chosen = candidates;
        else {
          const answer = r.vars[key(`sac-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`sac-${p}`),
                request: {
                  type: "pick",
                  intent: "sacrifice",
                  prompt: `Sacrifiez ${n} permanent(s)`,
                  options: candidates,
                  min: n,
                  max: n,
                  suggested: candidates.slice(0, n),
                },
              },
            };
          }
          chosen = answer.map(String);
        }
        r.vars[key(`done-${p}`)] = [1];
        for (const id of chosen) if (onBattlefield(s, id)) putIntoGraveyard(s, id);
      }
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
