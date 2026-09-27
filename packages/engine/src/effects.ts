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
  removeFromCombat,
  sacrifice,
  setSpeed,
  sourceFromObject,
} from "./actions";
import { copiedDefId } from "./layers";
import { availableMana, canPay, costToText, manaValue, payMana } from "./mana";
import { addReplacement } from "./replacement";
import { bounceSpell, copySpellItem, counterItem, plotCard, stackItemSpecs } from "./stack";
import {
  alivePlayers,
  apnapOrder,
  bump,
  changeCounters,
  chars,
  counterCount,
  createObject,
  emit,
  hasKeyword,
  isCreature,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  P1P1,
  random,
  registerDef,
  removeFromGame,
  rulesEvent,
  setPrepared,
  shuffle,
  snapshot,
  tapObject,
  turnFaceUp,
  unlockDoor,
} from "./state";
import { doublers, playerStatic } from "./statics";
import { legalTargets, matchesCard, matchesObjectFilter, matchesView } from "./targets";
import { checkCondition, createDelayed, pushInline } from "./triggers";
import { eliminate, endTheTurn } from "./turn";
import type {
  Amount,
  ChoiceRequest,
  ChoiceValue,
  Condition,
  Effect,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ManaType,
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
  /** Permanents sacrifiés pour le coût de la capacité. */
  sacrificed?: ObjectId[];
  tappedForCost?: ObjectId[];
}

/** Caractéristiques d'un objet vivant, ou ses dernières informations connues. */
function viewOf(s: GameState, id: string): LkiSnapshot | undefined {
  if (s.objects[id]) return snapshot(s, id);
  return s.lki[id];
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
    case "refMatches":
      return resolveRef(s, ctx, c.ref).some((id) => {
        const v = viewOf(s, id);
        return !!v && matchesView(v, c.filter, ctx.controller, ctx.sourceId);
      });
    case "targetMatches":
      // « Si [la cible] … » pendant la résolution (cible encore présente, ou ses dernières informations).
      return (ctx.targets[c.spec] ?? []).some((id) => {
        const v = s.lki[id] && !s.objects[id] ? s.lki[id] : viewOf(s, id);
        return !!v && matchesView(v, c.filter, ctx.controller, ctx.sourceId);
      });
    case "eventObjectMatches": {
      const id = ctx.event?.objectId;
      const v = id ? (s.lki[id] ?? viewOf(s, id)) : undefined;
      return !!v && matchesView(v, c.filter, ctx.controller, ctx.sourceId);
    }
    case "xAtLeast":
      return ctx.x >= c.n;
    case "amountAtLeast":
      return evalAmount(s, ctx, c.amount) >= c.n;
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
      // Objets mémorisés, encore présents ou connus par leurs dernières informations (sacrifiés…).
      return (ctx.vars?.[`$ids:${ref.name}`] ?? []).map(String).filter((id) => !!s.objects[id] || !!s.lki[id]);
    case "selfCard": {
      // « Cette carte » : l'objet qui porte la même identité physique que la source, où qu'il soit.
      const uid = s.objects[ctx.sourceId]?.uid ?? s.lki[ctx.sourceId]?.uid;
      if (!uid) return [];
      const found = Object.values(s.objects).find((o) => o.uid === uid);
      return found ? [found.id] : [];
    }
    case "linked": {
      const linked = s.objects[ctx.sourceId]?.linked ?? s.lki[ctx.sourceId]?.linked ?? [];
      return linked.filter((id) => !!s.objects[id]);
    }
    case "costSacrificed":
      return ctx.sacrificed ?? [];
    case "libraryTop":
      return resolveRef(s, ctx, ref.who).flatMap((p) => (s.players[p]?.library[0] ? [s.players[p]?.library[0] as string] : []));
    case "exiledCardsOf": {
      const players = resolveRef(s, ctx, ref.who);
      return s.exile.filter((id) => {
        const o = s.objects[id];
        return !!o && players.includes(o.owner) && !o.faceDown && !o.cardCopy && !o.preparedFor;
      });
    }
    case "allGraveyards":
      return s.playerOrder.flatMap((p) => s.players[p]?.graveyard ?? []);
    case "crewedBy": {
      const c = s.objects[ctx.sourceId]?.crewedBy;
      return c && c.turn === s.turn.number ? c.ids.filter((id) => onBattlefield(s, id)) : [];
    }
    case "playersWithoutMaxSpeed":
      return s.playerOrder.filter((p) => !s.players[p]?.lost && (s.players[p]?.speed ?? 0) < 4);
    case "exiledWith":
      return s.linkedExile
        .filter((l) => l.sourceId === ctx.sourceId)
        .flatMap((l) => l.cards)
        .filter((id) => s.objects[id]?.zone === "exile");
    case "permanentsOf": {
      const players = resolveRef(s, ctx, ref.player);
      const f = { ...ref.filter, controller: undefined };
      return s.battlefield.filter(
        (id) => players.includes(s.objects[id]?.controller ?? "") && matchesObjectFilter(s, ctx.controller, id, f, ctx.sourceId),
      );
    }
    case "attached": {
      const host = s.objects[ctx.sourceId]?.attachedTo ?? s.lki[ctx.sourceId]?.attachedTo;
      return host && onBattlefield(s, host) ? [host] : [];
    }
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
      if (s.lki[id]) return Math.max(0, s.lki[id].power);
      // Carte hors du champ de bataille (Close Encounter : carte exilée) : force imprimée.
      return Math.max(0, s.defs[s.objects[id]?.defId ?? ""]?.power ?? 0);
    }
    case "eventAmount":
      return ctx.event?.amount ?? 0;
    case "count":
      if (a.zone && a.zone !== "battlefield") {
        const players =
          a.whose === "all" ? alivePlayers(s) : a.whose === "opponents" ? opponentsOf(s, ctx.controller) : [ctx.controller];
        return players
          .flatMap((p) =>
            a.zone === "exile"
              ? s.exile.filter((id) => s.objects[id]?.owner === p)
              : (s.players[p]?.[a.zone as "graveyard" | "hand"] ?? []),
          )
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
    case "neg":
      return -evalAmount(s, ctx, a.of);
    case "div":
      return Math.floor(evalAmount(s, ctx, a.of) / a.by);
    case "var":
      return readVar(ctx, a.name);
    case "lifeTotal":
      return Math.max(0, s.players[ctx.controller]?.life ?? 0);
    case "manaValueOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? (viewOf(s, id)?.manaValue ?? manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)) : 0;
    }
    case "toughnessOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? Math.max(0, viewOf(s, id)?.toughness ?? 0) : 0;
    }
    case "colorsOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? (viewOf(s, id)?.colors.length ?? 0) : 0;
    }
    case "maxPower":
      return Math.max(
        0,
        ...s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .map((id) => chars(s, id).power),
      );
    case "halfLife": {
      const p = resolveRef(s, ctx, a.who).find((x) => isPlayer(s, x));
      return p ? Math.ceil(Math.max(0, s.players[p]?.life ?? 0) / 2) : 0;
    }
    case "landsEnteredThisTurn":
      return s.players[ctx.controller]?.turnStats.landsEntered ?? 0;
    case "manaSpent":
      return s.objects[ctx.sourceId]?.manaSpent ?? 0;
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0;
    case "spellsCastThisTurn":
      return s.players[ctx.controller]?.turnStats.spellsCast ?? 0;
    case "cardsDrawnThisTurn":
      return s.players[ctx.controller]?.turnStats.cardsDrawn ?? 0;
    case "creaturesDiedThisTurn":
      return s.turn.creaturesDied ?? 0;
    case "distinctPowers": {
      const ids = s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId));
      return new Set(ids.map((id) => chars(s, id).power)).size;
    }
    case "cardTypesAmong": {
      const ids = s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId));
      return new Set(ids.flatMap((id) => chars(s, id).types)).size;
    }
    case "refCount":
      return resolveRef(s, ctx, a.ref).length;
    case "noncreatureCastBy": {
      const p = resolveRef(s, ctx, a.who).find((x) => isPlayer(s, x));
      return p ? (s.players[p]?.turnStats.noncreatureCast ?? 0) : 0;
    }
    case "maxManaValue":
      return Math.max(
        0,
        ...s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .map((id) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)),
      );
    case "countersAmong":
      return s.battlefield
        .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
        .reduce((n, id) => n + Math.max(0, s.objects[id]?.counters[a.counter] ?? 0), 0);
    case "cardTypesInGraveyards": {
      const types = new Set<string>();
      for (const p of s.playerOrder)
        for (const id of s.players[p]?.graveyard ?? [])
          for (const t of s.defs[s.objects[id]?.defId ?? ""]?.types ?? []) types.add(t);
      return types.size;
    }
    case "milledThisTurn":
      return resolveRef(s, ctx, a.who).reduce((n, p) => n + (s.players[p]?.turnStats.milled ?? 0), 0);
    case "cardsDiscardedThisTurn":
      return s.players[ctx.controller]?.turnStats.cardsDiscarded ?? 0;
    case "maxToughness":
      return Math.max(
        0,
        ...s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .map((id) => chars(s, id).toughness),
      );
    case "maxManaValueInGraveyard":
      return Math.max(
        0,
        ...(s.players[ctx.controller]?.graveyard ?? []).map((id) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)),
      );
    case "distinctColors":
      return new Set(
        s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .flatMap((id) => chars(s, id).colors),
      ).size;
    case "distinctSubtypes":
      return new Set(
        s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .flatMap((id) => chars(s, id).subtypes),
      ).size;
    case "basicLandTypes": {
      const basics = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
      const lands = s.battlefield.filter(
        (id) => s.objects[id]?.controller === ctx.controller && chars(s, id).types.includes("Land"),
      );
      return basics.filter((t) => lands.some((id) => chars(s, id).subtypes.includes(t))).length;
    }
    case "distinctNames":
      return new Set(
        s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .map((id) => chars(s, id).name),
      ).size;
    case "lkiCounters": {
      const counters = s.objects[ctx.sourceId]?.counters ?? s.lki[ctx.sourceId]?.counters ?? {};
      return counters[a.counter] ?? 0;
    }
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
    sacrificed: r.item.sacrificed,
    tappedForCost: r.item.tappedForCost,
  };
}

function nameOf(s: GameState, id: string): string {
  return s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
}

function moveAndLog(s: GameState, id: ObjectId, to: "hand" | "exile" | "graveyard"): void {
  const o = s.objects[id];
  if (!o) return;
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to });
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
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to: zone });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  const newId_ = moveObject(s, id, zone, {
    controller: spec.to === "battlefield" ? (spec.underYourControl ? controller : o.owner) : undefined,
    position: spec.to === "libraryBottom" ? "bottom" : "top",
  });
  // « … N-ième depuis le dessus de la bibliothèque » (Riptide Gearhulk).
  if (newId_ && spec.to === "libraryTop" && spec.fromTop && spec.fromTop > 1) {
    const lib = s.players[o.owner]?.library;
    if (lib && lib[0] === newId_) {
      lib.shift();
      lib.splice(Math.min(spec.fromTop - 1, lib.length), 0, newId_);
    }
  }
  const moved = newId_ ? s.objects[newId_] : undefined;
  // Marqueurs sur une carte exilée (« exilez-la avec un marqueur de butin », Tinybones).
  if (moved && zone === "exile" && spec.counters) changeCounters(s, moved, spec.counters.kind, spec.counters.n);
  if (!moved || zone !== "battlefield") return newId_;
  if (spec.tapped || spec.attacking) moved.tapped = true;
  if (spec.attacking && s.combat) {
    // 508.4 : il attaque sans avoir été déclaré ; il attaque ce qu'attaque une créature de son contrôleur.
    const defender =
      s.combat.attackers.find((a) => s.objects[a.id]?.controller === moved.controller)?.defender ??
      opponentsOf(s, moved.controller)[0] ??
      "";
    s.combat.attackers.push({ id: moved.id, defender, blockers: [], blocked: false });
  }
  // « … sur le champ de bataille transformée » : le verso d'une carte recto-verso transformable.
  const back = s.defs[moved.defId]?.layout === "transform" ? s.defs[moved.defId]?.faceDefs?.[1] : undefined;
  if (spec.transformed && back) {
    moved.faceDefId = back.id;
    // 714.3a : une Saga au verso (FIN) arrive avec un marqueur de savoir ; les remplacements d'arrivée ont lu le recto.
    if (back.saga) changeCounters(s, moved, "lore", 1);
    bump(s);
  }
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

/** Peut-on attacher cette Aura ou cet Équipement à ce permanent ? (301.5c, 303.4d) */
export function canAttach(s: GameState, what: ObjectId, to: ObjectId): boolean {
  const a = s.objects[what];
  if (a?.zone !== "battlefield" || !onBattlefield(s, to) || what === to) return false;
  const d = s.defs[a.defId];
  // 702.16c : protection contre tout — ni enchantée, ni équipée.
  if (hasKeyword(s, to, "protectionFromEverything")) return false;
  if (d?.enchant) return matchesObjectFilter(s, a.controller, to, d.enchant.filter, what);
  if (chars(s, what).subtypes.includes("Equipment")) return isCreature(s, to);
  return false;
}

/** 701.3 : attache l'objet ; sans effet si c'est impossible ou s'il y est déjà attaché. */
export function attach(s: GameState, what: ObjectId, to: ObjectId): void {
  const a = s.objects[what];
  if (!a || a.attachedTo === to || !canAttach(s, what, to)) return;
  a.attachedTo = to;
  a.timestamp = nextTimestamp(s); // 613.7e : nouvel horodatage
  bump(s);
  emit({ type: "attach", objectId: what, defId: a.defId, to, toDefId: s.objects[to]?.defId ?? "" });
}

/** Signale une carte défaussée (déclencheurs « chaque fois qu'un adversaire défausse une carte »). */
export function announceDiscard(s: GameState, player: PlayerId, card: ObjectId | null): void {
  if (card) rulesEvent(s, { e: "discard", player, cards: [card] });
}

/** Fin d'une défausse : « chaque fois que vous défaussez une ou plusieurs cartes » (une fois, avec leur nombre). */
export function announceDiscardBatch(s: GameState, player: PlayerId, count: number): void {
  if (count > 0) rulesEvent(s, { e: "discardBatch", player, count });
}

/** Numéro du prochain tour de ce joueur (tour en cours exclu). */
function nextTurnOf(s: GameState, player: PlayerId): number {
  const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
  const i = alive.indexOf(s.turn.active);
  for (let k = 1; k <= alive.length; k++) if (alive[(i + k) % alive.length] === player) return s.turn.number + k;
  return s.turn.number + alive.length;
}

/** Permet à un joueur de jouer ces cartes exilées jusqu'à la fin de ce tour, ou de son prochain tour. */
export function grantPlay(
  s: GameState,
  player: PlayerId,
  cards: ObjectId[],
  until: "thisTurn" | "yourNextTurn" | "forever",
  opts: {
    free?: boolean;
    anyTime?: boolean;
    condition?: Condition;
    source?: ObjectId;
    extraCost?: number;
    landsTapped?: boolean;
    anyMana?: boolean;
  },
): void {
  const last = until === "forever" ? Number.MAX_SAFE_INTEGER : until === "thisTurn" ? s.turn.number : nextTurnOf(s, player);
  s.playPermissions = [...(s.playPermissions ?? []), ...cards.map((card) => ({ card, player, until: last, ...opts }))];
}

/** Identité physique de la carte désignée (pour un effet qui dure tant qu'elle reste exilée). */
function exiledUid(s: GameState, ctx: EffectContext, ref: Ref): string | undefined {
  const id = resolveRef(s, ctx, ref)[0];
  return id ? s.objects[id]?.uid : undefined;
}

/**
 * Met une carte sur le champ de bataille face cachée sous le contrôle de `controller`. Elle pourra être retournée
 * pour son coût de mana si c'est une carte de créature, ou pour son coût de déguisement (701.34c, 701.58c).
 */
export function putFaceDown(s: GameState, controller: PlayerId, id: ObjectId, ward: boolean): ObjectId | null {
  const o = s.objects[id];
  if (!o || o.zone === "battlefield") return null;
  const d = s.defs[o.defId];
  const upCosts = [...(d?.disguise ? [d.disguise] : []), ...(d?.types.includes("Creature") && d.manaCost ? [d.manaCost] : [])];
  emit({ type: "moved", owner: o.owner, from: o.zone, to: "battlefield" });
  return moveObject(s, id, "battlefield", { controller, faceDown: { ward, upCosts } });
}

/** Quantum Riddler : avec une carte en main ou moins, « si vous deviez piocher, vous piochez une carte de plus ». */
export function drawBonus(s: GameState, player: PlayerId, n: number): number {
  if (n <= 0) return 0;
  // Vnwxt, Verbose Host : chaque pioche est doublée.
  const double = playerStatic(s, player, "drawDouble") ? n : 0;
  if ((s.players[player]?.hand.length ?? 0) > 1) return double;
  return double + (playerStatic(s, player, "drawPlusOneWhenHandSmall") ? 1 : 0);
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
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: ids,
        duration: e.duration,
        ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
        ...(e.untilLeavesExile ? { untilExiledUid: exiledUid(s, ctx, e.untilLeavesExile) } : {}),
        ...e.mods,
      });
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
      for (const id of resolveRef(s, ctx, e.what)) counterItem(s, id, ctx.sourceDefId, e.exile);
      return;
    }
    case "unlessPay": {
      const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      if (!p) return;
      // « à moins que son contrôleur ne paie {X} » (Syncopate) : X est celui du sort.
      const mana = e.mana?.x ? { ...e.mana, x: 0, generic: e.mana.generic + e.mana.x * ctx.x } : e.mana;
      // Garde à coût composé (Ovika : {3} et 3 PV) : les deux parties doivent être payables.
      const hand = s.players[p]?.hand ?? [];
      const canDo =
        (!mana || canPay(s, p, mana)) &&
        (s.players[p]?.life ?? 0) >= (e.life ?? 0) &&
        (!e.discard || hand.length > 0) &&
        s.battlefield.filter((id) => s.objects[id]?.controller === p).length >= (e.sacrifice ?? 0);
      if (!canDo) return;
      const answer = r.vars[key("unless")];
      if (!answer) {
        const what = [
          mana ? costToText(mana) : "",
          e.life ? `${e.life} points de vie` : "",
          e.discard ? "défausser une carte" : "",
          e.sacrifice ? `sacrifier ${e.sacrifice} permanents` : "",
        ]
          .filter(Boolean)
          .join(" et ");
        return {
          ask: {
            player: p,
            key: key("unless"),
            request: {
              type: "yesNo",
              intent: "unlessPay",
              prompt: `${nameOf(s, ctx.sourceId)} : payer ${what} pour l'éviter ?`,
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] !== 1) return;
      // Garde « défaussez une carte » (Gideon the Oathless) : le joueur choisit la carte.
      if (e.discard) {
        // Garde « défaussez une carte au hasard » (Alpharael, Stonechosen).
        if (e.discardRandom && !r.vars[key("unlessCard")]) {
          const pool = [...hand];
          shuffle(s, pool);
          r.vars[key("unlessCard")] = pool.slice(0, 1);
        }
        const card = r.vars[key("unlessCard")];
        if (!card) {
          const cheapest = [...hand].sort(
            (a, b) =>
              manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
          );
          return {
            ask: {
              player: p,
              key: key("unlessCard"),
              request: {
                type: "pick",
                intent: "discard",
                prompt: "Choisissez la carte à défausser",
                options: [...hand],
                min: 1,
                max: 1,
                suggested: cheapest.slice(0, 1),
              },
            },
          };
        }
        const id = String(card[0]);
        if (!hand.includes(id)) return;
        emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
        announceDiscard(s, p, moveObject(s, id, "graveyard"));
        announceDiscardBatch(s, p, 1);
      }
      // Garde « sacrifiez trois permanents » (Emrakul, the Exigent Doom).
      if (e.sacrifice) {
        const perms = s.battlefield.filter((id) => s.objects[id]?.controller === p);
        const chosen = r.vars[key("unlessSac")];
        if (!chosen) {
          const cheapest = [...perms].sort(
            (a, b) =>
              manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
          );
          return {
            ask: {
              player: p,
              key: key("unlessSac"),
              request: {
                type: "pick",
                intent: "sacrifice",
                prompt: `Sacrifiez ${e.sacrifice} permanents`,
                options: perms,
                min: e.sacrifice,
                max: e.sacrifice,
                suggested: cheapest.slice(0, e.sacrifice),
              },
            },
          };
        }
        const ids = chosen.map(String).filter((id) => perms.includes(id));
        if (ids.length < e.sacrifice) return;
        for (const id of ids) sacrifice(s, id);
      }
      if (mana) {
        if (!canPay(s, p, mana)) return;
        payMana(s, p, mana);
      }
      if (e.life) loseLife(s, p, e.life);
      // « S'il le fait, … » (Divert Disaster).
      store(r, e.paidStore, 1);
      return { skip: e.skip };
    }
    case "attach": {
      // Plusieurs Équipements vers une même créature (Beatrix, Loyal General).
      const to = resolveRef(s, ctx, e.to)[0];
      if (to) for (const what of resolveRef(s, ctx, e.what)) attach(s, what, to);
      return;
    }
    case "addMana": {
      const pool = s.players[ctx.controller]?.manaPool;
      const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
      if (pool) for (const m of e.mana) pool[m] += times;
      return;
    }
    case "extraMountainMana": {
      const pl = s.players[ctx.controller];
      if (pl)
        pl.extraMountainMana = {
          turn: s.turn.number,
          n: (pl.extraMountainMana?.turn === s.turn.number ? pl.extraMountainMana.n : 0) + 1,
        };
      return;
    }
    case "mayWheel": {
      // « Chaque joueur peut défausser sa main et piocher sept cartes » : choix dans l'ordre APNAP, puis tout se fait ensemble.
      const order = apnapOrder(s);
      for (const p of order) {
        if (r.vars[key(`wheel-${p}`)]) continue;
        const hand = s.players[p]?.hand.length ?? 0;
        return {
          ask: {
            player: p,
            key: key(`wheel-${p}`),
            request: {
              type: "yesNo",
              intent: "may",
              prompt: `${nameOf(s, ctx.sourceId)} : défausser votre main (${hand} carte(s)) et piocher sept cartes ?`,
              suggested: [hand < 4 ? 1 : 0],
            },
          },
        };
      }
      const yes = order.filter((p) => r.vars[key(`wheel-${p}`)]?.[0] === 1);
      for (const p of yes) {
        const hand = [...(s.players[p]?.hand ?? [])];
        if (hand.length === 0) continue;
        emit({ type: "discard", player: p, defIds: hand.map((id) => s.objects[id]?.defId ?? "") });
        for (const id of hand) announceDiscard(s, p, moveObject(s, id, "graveyard"));
        announceDiscardBatch(s, p, hand.length);
      }
      for (const p of yes) for (let i = 0; i < 7; i++) drawCard(s, p);
      return;
    }
    case "destroyAllButChosenType": {
      const creatures = s.battlefield.filter((id) => isCreature(s, id));
      const tally = new Map<string, number>();
      for (const id of creatures) {
        const mine = s.objects[id]?.controller === ctx.controller;
        for (const t of chars(s, id).subtypes) tally.set(t, (tally.get(t) ?? 0) + (mine ? 1 : -1));
      }
      const options = [...tally.keys()].sort();
      let chosen: string | undefined;
      if (options.length > 0) {
        const answer = r.vars[key("type")];
        if (!answer) {
          const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? options[0];
          return {
            ask: {
              player: ctx.controller,
              key: key("type"),
              request: {
                type: "pick",
                intent: "chooseOnEnter",
                prompt: "Choisissez un type de créature (les autres créatures seront détruites)",
                options,
                labels: Object.fromEntries(options.map((o) => [o, o])),
                min: 1,
                max: 1,
                suggested: [best as string],
              },
            },
          };
        }
        chosen = String(answer[0]);
      }
      const kept = chosen;
      const doomed = creatures.filter((id) => !kept || !matchesObjectFilter(s, ctx.controller, id, { subtype: kept }));
      for (const id of doomed) destroy(s, id);
      return;
    }
    case "exileFromHandLinked": {
      const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      if (!p) return;
      const hand = s.players[p]?.hand ?? [];
      const options = hand.filter((id) => matchesCard(s, p, id, { ...e.filter, controller: undefined }));
      if (options.length === 0) return;
      const answer = r.vars[key("pick")];
      if (!answer) {
        const best = [...options].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: ctx.controller,
            key: key("pick"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: "Choisissez la carte à exiler",
              options,
              min: 1,
              max: 1,
              suggested: best.slice(0, 1),
            },
          },
        };
      }
      const id = String(answer[0]);
      if (!options.includes(id)) return;
      const moved = moveObject(s, id, "exile");
      const src = s.objects[ctx.sourceId];
      if (moved && src) src.linked = [...(src.linked ?? []), moved];
      return;
    }
    case "exileLibraryButBottom": {
      for (const p of resolveRef(s, ctx, e.who)) {
        const lib = s.players[p]?.library ?? [];
        for (const id of lib.slice(0, Math.max(0, lib.length - 1))) moveObject(s, id, "exile");
      }
      return;
    }
    case "addManaChoice": {
      const answer = r.vars[key("color")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("color"),
            request: {
              type: "pick",
              intent: "manaColor",
              prompt: "Choisissez la couleur du mana",
              options: ["W", "U", "B", "R", "G"],
              labels: { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" },
              min: 1,
              max: 1,
              suggested: ["G"],
            },
          },
        };
      }
      const pool = s.players[ctx.controller]?.manaPool;
      if (pool) pool[String(answer[0]) as ManaType] += evalAmount(s, ctx, e.n);
      return;
    }
    case "impulse": {
      const player = s.players[ctx.controller];
      if (!player) return;
      let exiled = r.vars[key("impulse")]?.map(String);
      if (!exiled) {
        exiled = [];
        for (const id of player.library.slice(0, e.n)) {
          const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
          if (n) exiled.push(n);
        }
        r.vars[key("impulse")] = exiled;
      }
      if (exiled.length === 0) return;
      const chosen = exiled.length === 1 ? exiled : r.vars[key("impulsePick")]?.map(String);
      if (!chosen) {
        return {
          ask: {
            player: ctx.controller,
            key: key("impulsePick"),
            request: {
              type: "pick",
              intent: "impulse",
              prompt: "Choisissez la carte exilée que vous pourrez jouer ce tour-ci",
              options: exiled,
              min: 1,
              max: 1,
              suggested: [exiled[0] as string],
            },
          },
        };
      }
      grantPlay(s, ctx.controller, chosen, e.until === "yourNextTurn" ? "yourNextTurn" : "thisTurn", {});
      return;
    }
    case "damageDivided": {
      const src = damageSource(s, ctx);
      if (!src) return;
      const total = evalAmount(s, ctx, e.total);
      const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id) || isPlayer(s, id));
      if (among.length === 0 || total <= 0) return;
      let split: number[];
      if (among.length === 1) split = [total];
      else {
        const answer = r.vars[key("divide")];
        if (!answer) {
          const each = Math.floor(total / among.length);
          const suggested = among.map((_, i) => each + (i < total - each * among.length ? 1 : 0));
          return {
            ask: {
              player: ctx.controller,
              key: key("divide"),
              request: {
                type: "divide",
                intent: "divideDamage",
                prompt: `Répartissez ${total} blessures entre les cibles`,
                among,
                total,
                minEach: total >= among.length ? 1 : 0,
                suggested,
              },
            },
          };
        }
        split = answer.map(Number);
      }
      among.forEach((id, i) => {
        dealDamage(s, src, id, split[i] ?? 0, false);
      });
      return;
    }
    case "keepOnePerType": {
      const TYPES = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"] as const;
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p) || r.vars[key(`kdone-${p}`)]) continue;
        const mine = s.battlefield.filter((id) => s.objects[id]?.controller === p);
        const kept = new Set<string>();
        for (const t of TYPES) {
          const ofType = mine.filter((id) => chars(s, id).types.includes(t));
          if (ofType.length === 0) continue;
          if (ofType.length === 1) {
            kept.add(ofType[0] as string);
            continue;
          }
          const answer = r.vars[key(`keep-${p}-${t}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`keep-${p}-${t}`),
                request: {
                  type: "pick",
                  intent: "keepPerType",
                  prompt: `Choisissez le permanent de type ${t} que vous gardez`,
                  options: ofType,
                  min: 1,
                  max: 1,
                  suggested: [ofType[0] as string],
                },
              },
            };
          }
          kept.add(String(answer[0]));
        }
        r.vars[key(`kdone-${p}`)] = [1];
        for (const id of mine) if (!kept.has(id) && onBattlefield(s, id)) sacrifice(s, id);
      }
      return;
    }
    case "emblem": {
      const defId = `emblem:${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      s.defs[defId] ??= {
        id: defId,
        name: e.name,
        typeLine: "Emblème",
        manaCost: null,
        manaCostText: "",
        colors: [],
        supertypes: [],
        types: [],
        subtypes: [],
        keywords: [],
        abilities: e.abilities,
        text: e.text,
        implemented: true,
        isToken: true,
      };
      const emblem = createObject(s, defId, ctx.controller, "command", { isToken: true });
      if (e.untilYourNextTurn) emblem.expiresAtTurnOf = ctx.controller;
      if (e.thisTurn) emblem.expiresEndOfTurn = true;
      bump(s);
      return;
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
      // « une autre carte » : les objets mémorisés, reconnus par leur identité physique (ils ont changé de zone).
      const stored = (e.excludeStored ? r.vars[`$ids:${e.excludeStored}`] : undefined)?.map(String) ?? [];
      const excludedUids = new Set(stored.map((id) => s.objects[id]?.uid ?? s.lki[id]?.uid).filter(Boolean));
      const maxMv = e.maxManaValue !== undefined ? evalAmount(s, ctx, e.maxManaValue) : undefined;
      const pool = (e.pool ? resolveRef(s, ctx, e.pool) : (s.players[ctx.controller]?.[e.zone] ?? [])).filter(
        (id) =>
          !!s.objects[id] &&
          !excludedUids.has(s.objects[id]?.uid) &&
          matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined, maxManaValue: maxMv }, ctx.sourceId),
      );
      const count = Math.min(evalAmount(s, ctx, e.count), pool.length);
      if (count <= 0) return;
      const min = Math.min(e.min ?? count, count);
      let picked = pool.length === count && min === count ? pool : null;
      if (!picked && e.random) {
        const shuffled = [...pool];
        shuffle(s, shuffled);
        picked = shuffled.slice(0, count);
      }
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
      const moved = picked.map((id) => moveWithSpec(s, ctx.controller, id, e.to)).filter((x): x is string => !!x);
      if (e.store) r.vars[`$ids:${e.store}`] = moved;
      store(r, e.store, moved.length);
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
        const owner = o.owner;
        moveWithSpec(s, ctx.controller, id, { to: answer[0] === "top" ? "libraryTop" : "libraryBottom" });
        // Clash of Elements : « si il le fait, [la source] lui inflige 2 blessures ».
        const src = e.topDamage && answer[0] === "top" ? damageSource(s, ctx) : null;
        if (src && e.topDamage) dealDamage(s, src, owner, e.topDamage, false);
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
            announceDiscard(s, p, moveObject(s, id, "graveyard"));
          } else if (onBattlefield(s, id)) sacrifice(s, id);
        }
        if (choice === "discard") announceDiscardBatch(s, p, picked.length);
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
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p)) continue;
        for (let i = 0; i < n + drawBonus(s, p, n); i++) drawCard(s, p);
      }
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
      const created: string[] = [];
      const pt = e.pt !== undefined ? evalAmount(s, ctx, e.pt) : undefined;
      const token = pt === undefined ? e.token : { ...e.token, power: pt, toughness: pt };
      for (const p of e.for ? resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x)) : [ctx.controller])
        created.push(...createTokens(s, p, token, n));
      if (e.tapped || e.attacking) {
        for (const id of created) {
          const o = s.objects[id];
          if (o) o.tapped = true;
        }
        bump(s);
      }
      if (e.attacking && s.combat) {
        // 508.4 : ils attaquent sans avoir été déclarés (pas de déclencheur « attaque »).
        const defender =
          s.combat.attackers.find((a) => a.id === ctx.sourceId)?.defender ?? opponentsOf(s, ctx.controller)[0] ?? "";
        for (const id of created) s.combat.attackers.push({ id, defender, blockers: [], blocked: false });
      }
      if (e.store) r.vars[`$ids:${e.store}`] = created;
      return;
    }
    case "empowerJace": {
      // « Mettez N marqueurs de loyauté sur un jeton Jace que vous contrôlez ; si vous n'en contrôlez pas, créez-en un d'abord. »
      const n = Math.max(0, evalAmount(s, ctx, e.amount));
      const isJaceToken = (id: string) => {
        const o = s.objects[id];
        const c = chars(s, id);
        return !!o?.isToken && o.controller === ctx.controller && c.types.includes("Planeswalker") && c.subtypes.includes("Jace");
      };
      let jace = s.battlefield.find(isJaceToken);
      if (!jace) jace = createTokens(s, ctx.controller, e.token, 1)[0];
      const o = jace ? s.objects[jace] : undefined;
      if (o && n > 0) changeCounters(s, o, "loyalty", n);
      return;
    }
    case "proliferate": {
      const times = evalAmount(s, ctx, e.times);
      const bad = new Set(["-1/-1", "stun"]);
      for (let t = 0; t < times; t++) {
        for (const id of [...s.battlefield]) {
          const o = s.objects[id];
          if (!o) continue;
          const mine = o.controller === ctx.controller;
          for (const [kind, n] of Object.entries(o.counters)) {
            if (n > 0 && (mine ? !bad.has(kind) : bad.has(kind))) changeCounters(s, o, kind, 1);
          }
        }
        for (const p of opponentsOf(s, ctx.controller)) {
          const pl = s.players[p];
          if (pl && (pl.poison ?? 0) > 0) pl.poison = (pl.poison ?? 0) + 1;
        }
      }
      return;
    }
    case "removeCounters": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        let left = e.n;
        const order = ["loyalty", "+1/+1", ...Object.keys(o.counters).filter((k) => k !== "loyalty" && k !== "+1/+1")];
        for (const kind of order) {
          const take = Math.min(left, o.counters[kind] ?? 0);
          if (take > 0) changeCounters(s, o, kind, -take);
          left -= take;
        }
      }
      return;
    }
    case "instantJaceLoyalty": {
      const p = s.players[ctx.controller];
      if (p) p.jaceInstantTurn = s.turn.number;
      return;
    }
    case "extraLandThisTurn": {
      const p = s.players[ctx.controller];
      if (!p) return;
      const cur = p.extraLandsTurn?.turn === s.turn.number ? p.extraLandsTurn.n : 0;
      p.extraLandsTurn = { turn: s.turn.number, n: cur + 1 };
      return;
    }
    case "nextSpellUncounterable": {
      const p = s.players[ctx.controller];
      if (p) p.nextSpellUncounterableTurn = s.turn.number;
      return;
    }
    case "prepare": {
      const f = e.filter;
      const ids = f
        ? s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, f, ctx.sourceId))
        : e.what
          ? resolveRef(s, ctx, e.what)
          : [];
      for (const id of ids) {
        const o = s.objects[id];
        if (o?.zone === "battlefield") setPrepared(s, o, e.value);
      }
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
      for (const id of resolveRef(s, ctx, e.what)) {
        if (onBattlefield(s, id)) moveAndLog(s, id, "hand");
        else if (s.stack.some((x) => x.id === id && x.kind === "spell")) bounceSpell(s, id);
      }
      return;
    }
    case "exile": {
      for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) moveAndLog(s, id, "exile");
      return;
    }
    case "mill": {
      const n = evalAmount(s, ctx, e.amount);
      let matching = 0;
      const f = e.store?.filter;
      for (const p of resolveRef(s, ctx, e.who)) {
        const library = s.players[p]?.library ?? [];
        const count = e.halfLibrary
          ? Math.floor(library.length / 2)
          : e.graveyardSize
            ? (s.players[p]?.graveyard.length ?? 0)
            : n;
        for (const id of library.slice(0, count)) {
          if (f && matchesCard(s, ctx.controller, id, { ...f, controller: undefined })) matching++;
          const uid = s.objects[id]?.uid;
          moveAndLog(s, id, "graveyard");
          // Les cartes meulées sont mémorisées (Dredger's Insight : « parmi les cartes meulées »).
          const gy = s.players[p]?.graveyard ?? [];
          const now = gy.find((x) => s.objects[x]?.uid === uid);
          if (e.store && now) r.vars[`$ids:${e.store.name}`] = [...(r.vars[`$ids:${e.store.name}`] ?? []), now];
        }
      }
      if (e.store) store(r, e.store.name, f ? matching : n);
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
      // « Chaque fois que vous regardez ou surveillez » (Reality Fracture).
      player.turnStats.scried += 1;
      bump(s); // des capacités statiques en dépendent (Surveillance Phantasm)
      rulesEvent(s, { e: "scry", player: ctx.controller });
      if (scry) {
        player.library = [...order, ...rest, ...picked.map(String)];
        emit({ type: "scry", player: ctx.controller, top: order.length, bottom: picked.length });
      } else {
        player.library = [...order, ...rest];
        // Enlightened Confidant, Chandra : certaines des cartes ainsi mises au cimetière vont ensuite en main.
        const toHand = e.op === "surveil" ? e.toHand : undefined;
        const maxMv = toHand?.maxManaValue !== undefined ? evalAmount(s, ctx, toHand.maxManaValue) : Number.POSITIVE_INFINITY;
        for (const id of picked.map(String)) {
          const back =
            !!toHand &&
            manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= maxMv &&
            (!toHand.filter || matchesCard(s, ctx.controller, id, { ...toHand.filter, controller: undefined }));
          const uid = s.objects[id]?.uid;
          player.library.push(id); // temporaire : moveAndLog le retire de la bibliothèque
          moveAndLog(s, id, "graveyard");
          const now = back ? player.graveyard.find((g) => s.objects[g]?.uid === uid) : undefined;
          if (now) moveAndLog(s, now, "hand");
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
        const unless = e.unlessFilter;
        const exempt = unless ? hand.filter((id) => matchesCard(s, p, id, { ...unless, controller: undefined })) : [];
        if (unless && exempt.length > 0) {
          // « Défaussez deux cartes à moins de défausser une carte d'artefact » : une carte d'artefact, ou deux cartes.
          const answer = r.vars[key(`discard-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`discard-${p}`),
                request: {
                  type: "pick",
                  intent: "discard",
                  prompt: `Défaussez ${n} cartes, ou une seule carte correspondante`,
                  options: [...hand],
                  min: 1,
                  max: Math.min(n, hand.length),
                  suggested: [exempt[0] as string],
                },
              },
            };
          }
          chosen = answer.map(String);
          // Une seule carte qui ne correspond pas : il faut en défausser une autre.
          if (chosen.length < n && !chosen.some((id) => exempt.includes(id))) {
            chosen = [...chosen, ...hand.filter((id) => !chosen.includes(id)).slice(0, n - chosen.length)];
          }
        } else if (hand.length <= n && !e.optional && !e.chooser) chosen = [...hand];
        else if (hand.length === 0) chosen = [];
        else if (e.random) {
          // « … au hasard »
          const pool = [...hand];
          shuffle(s, pool);
          chosen = pool.slice(0, n);
        } else {
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
        const sf = e.storeFilter;
        const counted = sf
          ? chosen.filter((id) => matchesCard(s, p, id, { ...sf, controller: undefined })).length
          : chosen.length;
        store(r, e.store, readVar(ctx, e.store ?? "") + counted);
        if (chosen.length === 0) continue;
        if (e.exile) {
          // Intimidation Tactics : la carte choisie est exilée (ce n'est pas une défausse).
          for (const id of chosen) moveObject(s, id, "exile");
          continue;
        }
        emit({ type: "discard", player: p, defIds: chosen.map((id) => s.objects[id]?.defId ?? "") });
        for (const id of chosen) {
          // Wilt-Leaf Liege : défaussée par un effet adverse, elle va sur le champ de bataille.
          const toField = p !== ctx.controller && !!s.defs[s.objects[id]?.defId ?? ""]?.opponentDiscardToBattlefield;
          const moved = toField ? moveObject(s, id, "battlefield") : moveObject(s, id, "graveyard");
          if (!toField) announceDiscard(s, p, moved);
          // Les cartes défaussées, pour `ref.stored` (Ninja's Blades : « la valeur de mana de la carte défaussée »).
          if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
        }
        announceDiscardBatch(s, p, chosen.length);
      }
      return;
    }
    case "sacrifice": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) {
        if (r.vars[key(`done-${p}`)]) continue;
        let candidates = s.battlefield.filter(
          (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, e.filter, ctx.sourceId),
        );
        if (e.greatestManaValue && candidates.length) {
          const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
          const max = Math.max(...candidates.map(mv));
          candidates = candidates.filter((id) => mv(id) === max);
        }
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
        if (e.exile) {
          // « … l'exile » : les cartes exilées sont mémorisées (pour les lier à la source).
          const exiled = chosen
            .filter((id) => onBattlefield(s, id))
            .map((id) => moveWithSpec(s, ctx.controller, id, { to: "exile" }))
            .filter((x): x is string => !!x);
          if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...exiled];
          continue;
        }
        if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...chosen];
        for (const id of chosen) if (onBattlefield(s, id)) sacrifice(s, id);
      }
      return;
    }
    case "tap": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        const wasTapped = o.tapped;
        if (e.untap) {
          o.tapped = false;
          bump(s);
          if (wasTapped) rulesEvent(s, { e: "untap", objectId: id });
        } else tapObject(s, o);
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
      let destroyed = 0;
      const f = e.filter.maxToughnessX ? { ...e.filter, maxToughnessX: undefined, maxToughness: ctx.x } : e.filter;
      const uids = new Set<string>();
      for (const id of s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, f, ctx.sourceId))) {
        const uid = s.objects[id]?.uid;
        if (destroy(s, id)) {
          destroyed++;
          if (uid !== undefined) uids.add(uid);
        }
      }
      store(r, e.store, destroyed);
      // Les cartes « mises au cimetière de cette façon » (Zero Point Ballad).
      if (e.store) {
        r.vars[`$ids:${e.store}`] = s.playerOrder.flatMap((p) =>
          (s.players[p]?.graveyard ?? []).filter((id) => uids.has(s.objects[id]?.uid ?? "")),
        );
      }
      return;
    }
    case "removeCounterFromEach": {
      // Dyadrine : les N permanents qui ont le plus de marqueurs de ce type.
      const withCounter = s.battlefield
        .filter((x) => (s.objects[x]?.counters[e.kind] ?? 0) > 0)
        .filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId))
        .sort((a, b) => (s.objects[b]?.counters[e.kind] ?? 0) - (s.objects[a]?.counters[e.kind] ?? 0));
      const done = withCounter.length >= e.n;
      if (done)
        for (const id of withCounter.slice(0, e.n)) {
          const o = s.objects[id];
          if (o) changeCounters(s, o, e.kind, -1);
        }
      store(r, e.store, done ? 1 : 0);
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
      for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) sacrifice(s, id);
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
    case "payCostOf": {
      const id = resolveRef(s, ctx, e.what)[0];
      const cost = s.defs[s.objects[id ?? ""]?.defId ?? ""]?.manaCost;
      store(r, e.store, 0);
      if (!id || !cost || !canPay(s, ctx.controller, cost)) return;
      const answer = r.vars[key("paycost")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("paycost"),
            request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
          },
        };
      }
      if (answer[0] !== 1 || !canPay(s, ctx.controller, cost)) return;
      payMana(s, ctx.controller, cost);
      store(r, e.store, 1);
      return;
    }
    case "chooseCardName": {
      if (r.vars.$name) return;
      const answer = r.vars[key("name")];
      if (!answer) {
        // Pas d'information cachée : les noms sont triés, la suggestion vient des cimetières (publics).
        const names = [
          ...new Set(
            Object.values(s.defs)
              .filter((d) => !d.isToken && !d.meldResult)
              .map((d) => d.name),
          ),
        ].sort();
        const opp = opponentsOf(s, ctx.controller)[0];
        const seen = (opp ? (s.players[opp]?.graveyard ?? []) : []).map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name ?? "");
        const suggested = seen.find((n) => names.includes(n)) ?? names[0] ?? "";
        return {
          ask: {
            player: ctx.controller,
            key: key("name"),
            request: {
              type: "pick",
              intent: "chooseOnEnter",
              prompt: "Choisissez un nom de carte",
              options: names,
              labels: Object.fromEntries(names.map((n) => [n, n])),
              min: 1,
              max: 1,
              suggested: [suggested],
            },
          },
        };
      }
      r.vars.$name = [String(answer[0])];
      return;
    }
    case "exileNamed": {
      const name = String(r.vars.$name?.[0] ?? "");
      if (!name) return;
      for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
        const pl = s.players[p];
        if (!pl) continue;
        const named = [...pl.graveyard, ...pl.hand, ...pl.library].filter(
          (x) => s.defs[s.objects[x]?.defId ?? ""]?.name === name,
        );
        for (const x of named.slice(0, e.max)) moveObject(s, x, "exile");
        shuffle(s, pl.library);
      }
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
      if (e.life && (s.players[ctx.controller]?.life ?? 0) < e.life) return { skip: e.skip };
      payMana(s, ctx.controller, e.cost);
      if (e.life) loseLife(s, ctx.controller, e.life);
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
          : zoneCards(s, players, e.from).filter((id) =>
              matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }, ctx.sourceId),
            );
      const moved = ids.map((id) => moveWithSpec(s, ctx.controller, id, e.spec)).filter((x): x is string => !!x);
      if (e.store) r.vars[`$ids:${e.store}`] = moved;
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
      store(r, e.store, picked.length);
      const taken = picked.map((id) => moveWithSpec(s, ctx.controller, id, e.to)).filter((x): x is string => !!x);
      if (e.store) r.vars[`$ids:${e.store}`] = taken;
      if (e.rest === "graveyard") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "graveyard" });
      else if (e.rest === "hand") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "hand" });
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
      // Chaque joueur désigné cherche dans SA bibliothèque (Demolition Field) ; par défaut, le contrôleur.
      for (const p of e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller]) {
        if (r.vars[key(`sdone-${p}`)]) continue;
        const player = s.players[p];
        if (!player) continue;
        const count = evalAmount(s, ctx, e.count);
        const exactMv = e.manaValue !== undefined ? evalAmount(s, ctx, e.manaValue) : undefined;
        const options = player.library.filter((id) =>
          matchesCard(s, p, id, exactMv === undefined ? e.filter : { ...e.filter, manaValue: exactMv }, ctx.sourceId),
        );
        let picked: string[] = [];
        if (options.length > 0 && count > 0) {
          const answer = r.vars[key(`search-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`search-${p}`),
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
          // « avec des noms différents » : un seul exemplaire de chaque nom.
          if (e.distinctNames) {
            const names = new Set<string>();
            picked = picked.filter((id) => {
              const n = s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
              if (names.has(n)) return false;
              names.add(n);
              return true;
            });
          }
        }
        r.vars[key(`sdone-${p}`)] = [1];
        // 701.23 : on mélange après la recherche ; « sur le dessus » s'applique après le mélange.
        const toTop = e.to.to === "libraryTop";
        for (const id of picked) {
          if (toTop) continue;
          const moved = moveWithSpec(s, p, id, e.to);
          if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
        }
        shuffle(s, player.library);
        if (toTop) for (const id of picked) player.library = [id, ...player.library.filter((x) => x !== id)];
      }
      return;
    }
    case "copyToken": {
      // Doubling Season s'applique aussi aux jetons copies.
      const n = (e.count === undefined ? 1 : evalAmount(s, ctx, e.count)) * 2 ** doublers(s, ctx.controller, "tokens");
      for (const id of resolveRef(s, ctx, e.of)) {
        const model = s.objects[id] ?? undefined;
        const defId = model?.defId ?? s.lki[id]?.defId;
        if (!defId) continue;
        for (let i = 0; i < n; i++) {
          const token = createTokenCopy(s, ctx.controller, defId);
          const tok = s.objects[token];
          if (e.tapped && tok) tapObject(s, tok);
          if (e.addTypes?.length) addEffect(s, [token], { addTypes: e.addTypes }, "permanent");
          if (e.addKeywords?.length) addEffect(s, [token], { addKeywords: e.addKeywords }, "permanent");
          if (e.addSubtypes?.length) addEffect(s, [token], { addSubtypes: e.addSubtypes }, "permanent");
          if (e.legendary) addEffect(s, [token], { addSupertypes: ["Legendary"] }, "permanent");
          if (e.addAbilities?.length) addEffect(s, [token], { addAbilities: e.addAbilities }, "permanent");
          if (e.pt !== undefined) addEffect(s, [token], { setPower: e.pt, setToughness: e.pt }, "permanent");
          if (e.attacking && s.combat) {
            // Calamity : « engagé et attaquant » (il attaque ce qu'attaque une de vos créatures).
            const tok = s.objects[token];
            if (tok) tok.tapped = true;
            const defender =
              s.combat.attackers.find((a) => s.objects[a.id]?.controller === ctx.controller)?.defender ??
              opponentsOf(s, ctx.controller)[0] ??
              "";
            s.combat.attackers.push({ id: token, defender, blockers: [], blocked: false });
          }
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
      // Valeurs figées maintenant (« avec un marqueur de moins »), lues ensuite avec amount.v(nom).
      const vars: Record<string, ChoiceValue[]> = {};
      for (const [k, a] of Object.entries(e.vars ?? {})) vars[`$${k}`] = [evalAmount(s, ctx, a)];
      createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: [], effects: e.effects, bound, vars }, e.at);
      return;
    }
    case "reduceSpeed": {
      for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
        const speed = s.players[p]?.speed ?? 0;
        const others = s.playerOrder.filter((q) => q !== p && !s.players[q]?.lost).map((q) => s.players[q]?.speed ?? 0);
        if (speed > 1 && others.every((o) => speed > o)) setSpeed(s, p, speed - 1);
      }
      return;
    }
    case "sacrificeElseDiscard": {
      for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
        if (r.vars[key(`sed-${p}`)]) continue;
        const candidates = s.battlefield.filter(
          (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, e.filter, ctx.sourceId),
        );
        const hand = s.players[p]?.hand ?? [];
        const pool = candidates.length ? candidates : hand;
        if (pool.length === 0) {
          r.vars[key(`sed-${p}`)] = [1];
          continue;
        }
        let chosen = pool.length === 1 ? [pool[0] as string] : null;
        if (!chosen) {
          const answer = r.vars[key(`sedpick-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`sedpick-${p}`),
                request: {
                  type: "pick",
                  intent: candidates.length ? "sacrifice" : "discard",
                  prompt: candidates.length ? "Sacrifiez un permanent" : "Défaussez une carte",
                  options: pool,
                  min: 1,
                  max: 1,
                  suggested: [pool[0] as string],
                },
              },
            };
          }
          chosen = answer
            .map(String)
            .filter((id) => pool.includes(id))
            .slice(0, 1);
          if (chosen.length === 0) chosen = [pool[0] as string];
        }
        r.vars[key(`sed-${p}`)] = [1];
        const id = chosen[0] as string;
        if (candidates.length) sacrifice(s, id);
        else {
          emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
          announceDiscard(s, p, moveObject(s, id, "graveyard"));
          announceDiscardBatch(s, p, 1);
        }
      }
      return;
    }
    case "controlNextTurn": {
      const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      if (p) s.turnControl = { player: p, by: ctx.controller };
      return;
    }
    case "devour": {
      if (r.vars.$devoured) return;
      const fromGy = !!e.graveyardUpToX;
      const options = fromGy
        ? (s.players[ctx.controller]?.graveyard ?? []).filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId))
        : s.battlefield.filter(
            (id) =>
              s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
          );
      const max = fromGy ? Math.min(ctx.x, options.length) : options.length;
      const answer = options.length ? r.vars[key("devour")] : [];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("devour"),
            request: {
              type: "pick",
              intent: "sacrifice",
              prompt: fromGy
                ? `${nameOf(s, ctx.sourceId)} : exilez jusqu'à ${max} carte(s) de votre cimetière`
                : `${nameOf(s, ctx.sourceId)} : dévorer (sacrifiez autant de permanents que vous voulez)`,
              options,
              min: 0,
              max,
              suggested: fromGy ? options.slice(0, max) : [],
            },
          },
        };
      }
      const chosen = answer
        .map(String)
        .filter((id) => options.includes(id))
        .slice(0, max);
      if (fromGy) {
        r.vars["$ids:devoured"] = chosen.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
      } else for (const id of chosen) sacrifice(s, id);
      r.vars.$devoured = [chosen.length];
      return;
    }
    case "chooseCopy": {
      if (r.vars.$copyOf) return;
      const options = s.battlefield.filter(
        (id) =>
          s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
      );
      const answer = options.length ? r.vars[key("copy")] : [];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("copy"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: `${nameOf(s, ctx.sourceId)} : vous pouvez la faire arriver comme copie d'un permanent`,
              options,
              min: 0,
              max: 1,
              suggested: options.slice(0, 1),
            },
          },
        };
      }
      const picked = answer.map(String).find((id) => options.includes(id));
      r.vars.$copyOf = picked ? [copiedDefId(s, picked)] : [];
      return;
    }
    case "becomeCopyKeepAbilities": {
      const card = resolveRef(s, ctx, e.what)[0];
      const self = s.objects[ctx.sourceId];
      const d = s.defs[s.objects[card ?? ""]?.defId ?? ""];
      if (!card || !d || self?.zone !== "battlefield") return;
      // « … sauf qu'elle est 0/0 et a cette capacité » : ses capacités activées imprimées sont conservées.
      const own = (s.defs[self.defId]?.abilities ?? []).filter((a) => a.kind === "activated");
      addEffect(s, [self.id], { copyOf: d.id, setPower: 0, setToughness: 0, addAbilities: own }, "permanent");
      return;
    }
    case "revealUntilN": {
      const player = s.players[ctx.controller];
      if (!player) return;
      const found: string[] = [];
      let i = 0;
      for (; i < player.library.length && found.length < e.n; i++) {
        const id = player.library[i] as string;
        if (matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined })) found.push(id);
      }
      const revealed = player.library.slice(0, i);
      emit({ type: "reveal", player: ctx.controller, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
      const rest = revealed.filter((id) => !found.includes(id));
      for (const id of found) moveWithSpec(s, ctx.controller, id, e.to);
      const lib = player.library.filter((id) => !rest.includes(id));
      shuffle(s, rest);
      player.library = [...lib, ...rest];
      return;
    }
    case "chooseOnEnter": {
      if (r.vars.$chosen) return;
      const answer = r.vars[key("chosen")];
      const kind = e.kind;
      if (!answer) {
        let options: string[];
        if (kind === "color") options = ["W", "U", "B", "R", "G"];
        else if (kind === "cardName") {
          // Sorcerous Spyglass : on regarde la main d'un adversaire (ses cartes d'abord), puis on nomme une carte.
          const opp = opponentsOf(s, ctx.controller)[0];
          const inHand = (opp ? (s.players[opp]?.hand ?? []) : []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? "");
          const all = Object.values(s.defs)
            .filter((d) => !d.isToken)
            .map((d) => d.name);
          options = [...new Set([...inHand.filter(Boolean), ...s.battlefield.map((id) => chars(s, id).name), ...all.sort()])];
        } else {
          const set = new Set<string>();
          for (const d of Object.values(s.defs))
            if (d.types.includes("Creature") && !d.isToken) for (const t of d.subtypes) set.add(t);
          options = [...set].sort();
        }
        // Suggestion : le type ou la couleur les plus présents chez le contrôleur.
        const tally = new Map<string, number>();
        const pl = s.players[ctx.controller];
        for (const id of [
          ...s.battlefield.filter((x) => s.objects[x]?.controller === ctx.controller),
          ...(pl?.hand ?? []),
          ...(pl?.library ?? []),
        ]) {
          const d = s.defs[s.objects[id]?.defId ?? ""];
          const keys = kind === "color" ? (d?.colors ?? []) : d?.types.includes("Creature") ? d.subtypes : [];
          for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
        }
        const best =
          kind === "cardName"
            ? options[0]
            : ([...tally.entries()].sort((a, b) => b[1] - a[1]).find(([k]) => options.includes(k))?.[0] ?? options[0]);
        const COLOR: Record<string, string> = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };
        return {
          ask: {
            player: ctx.controller,
            key: key("chosen"),
            request: {
              type: "pick",
              intent: "chooseOnEnter",
              prompt:
                kind === "color"
                  ? "Choisissez une couleur"
                  : kind === "cardName"
                    ? "Choisissez un nom de carte (les cartes de la main adverse sont en tête)"
                    : "Choisissez un type de créature",
              options,
              labels: kind === "color" ? COLOR : Object.fromEntries(options.map((o) => [o, o])),
              min: 1,
              max: 1,
              suggested: [best as string],
            },
          },
        };
      }
      r.vars.$chosen = [kind, String(answer[0])];
      return;
    }
    case "piles": {
      const player = s.players[ctx.controller];
      if (!player) return;
      const top = player.library.slice(0, e.n);
      if (top.length === 0) return;
      const down = r.vars[key("down")];
      if (!down) {
        return {
          ask: {
            player: ctx.controller,
            key: key("down"),
            request: {
              type: "pick",
              intent: "piles",
              prompt: "Choisissez les cartes de la pile face cachée (les autres forment la pile face visible)",
              options: top,
              min: 0,
              max: top.length,
              suggested: top.slice(0, Math.ceil(top.length / 2)),
            },
          },
        };
      }
      const faceDown = down.map(String);
      const faceUp = top.filter((id) => !faceDown.includes(id));
      const opp = opponentsOf(s, ctx.controller)[0];
      let pick = r.vars[key("pile")]?.[0];
      if (pick === undefined && opp) {
        const names = faceUp.map((id) => nameOf(s, id)).join(", ") || "aucune carte";
        return {
          ask: {
            player: opp,
            key: key("pile"),
            request: {
              type: "pick",
              intent: "piles",
              prompt: `${nameOf(s, ctx.sourceId)} : choisissez la pile que l'adversaire met dans sa main (l'autre va au cimetière)`,
              options: ["down", "up"],
              labels: { down: `Pile face cachée (${faceDown.length} carte(s))`, up: `Pile face visible : ${names}` },
              min: 1,
              max: 1,
              suggested: [faceDown.length >= faceUp.length ? "up" : "down"],
            },
          },
        };
      }
      pick ??= "down";
      const toHand = pick === "down" ? faceDown : faceUp;
      for (const id of top) moveWithSpec(s, ctx.controller, id, { to: toHand.includes(id) ? "hand" : "graveyard" });
      return;
    }
    case "grantFlashback": {
      const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
      s.turn.flashbackGranted = [...(s.turn.flashbackGranted ?? []), ...ids];
      if (e.free) s.turn.freeFlashbackGranted = [...(s.turn.freeFlashbackGranted ?? []), ...ids];
      return;
    }
    case "endTurn": {
      endTheTurn(s, r);
      return;
    }
    case "exchangeControl": {
      const a = resolveRef(s, ctx, e.a)[0];
      const b = resolveRef(s, ctx, e.b)[0];
      const oa = a ? s.objects[a] : undefined;
      const ob = b ? s.objects[b] : undefined;
      // 701.10 : l'échange n'a lieu que si les deux permanents sont encore là.
      if (oa?.zone !== "battlefield" || ob?.zone !== "battlefield" || oa.controller === ob.controller) return;
      const [ca, cb] = [oa.controller, ob.controller];
      removeFromCombat(s, oa.id);
      removeFromCombat(s, ob.id);
      oa.controller = cb;
      ob.controller = ca;
      oa.controlledSince = s.turn.number;
      ob.controlledSince = s.turn.number;
      bump(s);
      return;
    }
    case "gainControlWhileSource": {
      if (!onBattlefield(s, ctx.sourceId)) return;
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || o.controller === ctx.controller) continue;
        s.auraControl = [...(s.auraControl ?? []), { host: id, aura: ctx.sourceId, original: o.controller, by: ctx.controller }];
        removeFromCombat(s, id);
        o.controller = ctx.controller;
        o.controlledSince = s.turn.number;
        if (e.restrict) {
          s.effects.push({
            id: newId(s, "e"),
            timestamp: nextTimestamp(s),
            affected: [id],
            duration: "permanent",
            addKeywords: ["cantAttack", "cantBlock"],
            whileSource: ctx.sourceId,
          });
        }
        bump(s);
      }
      return;
    }
    case "setBasePTAll": {
      const n = evalAmount(s, ctx, e.amount);
      const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
      addEffect(s, ids, e.powerOnly ? { setPower: n } : { setPower: n, setToughness: n }, "endOfTurn");
      return;
    }
    case "addManaColorsAmong": {
      const pool = s.players[ctx.controller]?.manaPool;
      if (!pool) return;
      const colors = new Set(
        s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
          .flatMap((id) => chars(s, id).colors),
      );
      for (const c of colors) pool[c] += 1;
      return;
    }
    case "plot": {
      for (const id of resolveRef(s, ctx, e.what)) plotCard(s, id);
      return;
    }
    case "copyNextExhaust": {
      const pl = s.players[ctx.controller];
      if (pl) pl.copyNextExhaustTurn = s.turn.number;
      return;
    }
    case "gainControl": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || o.controller === ctx.controller) continue;
        s.controlChanges = [...(s.controlChanges ?? []), { id, original: o.controller }];
        removeFromCombat(s, id);
        o.controller = ctx.controller;
        o.controlledSince = s.turn.number;
        bump(s);
      }
      return;
    }
    case "copySpell": {
      const n = evalAmount(s, ctx, e.count);
      for (const id of resolveRef(s, ctx, e.what)) {
        const item = s.stack.find((x) => x.id === id);
        if (!item) continue;
        for (let i = 0; i < n; i++) {
          if (item.kind === "spell") copySpellItem(s, item, ctx.controller);
          // Copie d'une capacité activée ou déclenchée (Return the Favor, Ertha Jo) : mêmes cibles.
          else
            s.stack.push({ ...item, id: newId(s, "copy"), controller: ctx.controller, copy: true, targets: { ...item.targets } });
        }
      }
      return;
    }
    case "mayShuffleHandGraveyardDraw": {
      for (const p of apnapOrder(s)) {
        if (r.vars[key(`shuf-${p}`)] === undefined) {
          const answer = r.vars[key(`shufq-${p}`)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(`shufq-${p}`),
                request: {
                  type: "yesNo",
                  intent: "may",
                  prompt: `${nameOf(s, ctx.sourceId)} : mélanger main et cimetière dans la bibliothèque et piocher ${e.n} cartes ?`,
                  suggested: [(s.players[p]?.hand.length ?? 0) < 4 ? 1 : 0],
                },
              },
            };
          }
          r.vars[key(`shuf-${p}`)] = [answer[0] === 1 ? 1 : 0];
        }
      }
      for (const p of apnapOrder(s)) {
        if (r.vars[key(`shuf-${p}`)]?.[0] !== 1) continue;
        const pl = s.players[p];
        if (!pl) continue;
        for (const id of [...pl.hand, ...pl.graveyard]) moveObject(s, id, "library");
        shuffle(s, pl.library);
        for (let i = 0; i < e.n; i++) drawCard(s, p);
      }
      return;
    }
    case "coinFlip": {
      const won = random(s) < 0.5;
      emit({ type: "coinFlip", player: ctx.controller, won });
      store(r, e.store, won ? 1 : 0);
      return;
    }
    case "extraUpkeeps": {
      const n = evalAmount(s, ctx, e.amount);
      for (let i = 0; i < n; i++) rulesEvent(s, { e: "step", step: "upkeep", active: s.turn.active });
      return;
    }
    case "plotOnResolve": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const item = s.stack.find((x) => x.id === id && x.kind === "spell");
        if (item) item.plotOnResolve = true;
      }
      return;
    }
    case "noncombatBonusThisTurn": {
      const pl = s.players[ctx.controller];
      if (!pl) return;
      const n = evalAmount(s, ctx, e.amount);
      const cur = pl.noncombatBonusTurn?.turn === s.turn.number ? pl.noncombatBonusTurn.n : 0;
      pl.noncombatBonusTurn = { turn: s.turn.number, n: cur + n };
      return;
    }
    case "flickerChosen": {
      const options = s.battlefield.filter(
        (id) =>
          s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
      );
      const answer = options.length ? r.vars[key("flicker")] : [];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("flicker"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: `${nameOf(s, ctx.sourceId)} : choisissez les permanents à exiler puis renvoyer`,
              options,
              min: 0,
              max: options.length,
              suggested: options,
            },
          },
        };
      }
      let ids = answer.map(String).filter((id) => options.includes(id));
      const times = Math.max(1, evalAmount(s, ctx, e.times));
      for (let t = 0; t < times; t++) {
        const exiled = ids.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
        ids = exiled
          .map((id) => moveObject(s, id, "battlefield", { controller: s.objects[id]?.owner }))
          .filter((x): x is string => !!x);
      }
      return;
    }
    case "millUntil": {
      for (const p of resolveRef(s, ctx, e.who)) {
        const pl = s.players[p];
        if (!pl) continue;
        const i = pl.library.findIndex((id) => matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }));
        const cards = i < 0 ? [...pl.library] : pl.library.slice(0, i + 1);
        for (const id of cards) moveAndLog(s, id, "graveyard");
      }
      return;
    }
    case "exileTop": {
      const exiled: string[] = [];
      for (const p of resolveRef(s, ctx, e.who)) {
        const n = evalAmount(s, ctx, e.n);
        for (const id of (s.players[p]?.library ?? []).slice(0, n)) {
          const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
          if (n) exiled.push(n);
        }
      }
      r.vars[`$ids:${e.store}`] = exiled;
      return;
    }
    case "giveControl": {
      const to = resolveRef(s, ctx, e.to).find((x) => isPlayer(s, x));
      if (!to) return;
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || o.controller === to) continue;
        removeFromCombat(s, id);
        o.controller = to;
        o.controlledSince = s.turn.number;
        bump(s);
      }
      return;
    }
    case "untapUpTo": {
      const ids = s.battlefield.filter(
        (id) =>
          s.objects[id]?.controller === ctx.controller &&
          s.objects[id]?.tapped &&
          matchesObjectFilter(s, ctx.controller, id, e.filter),
      );
      for (const id of ids.slice(0, e.n)) {
        const o = s.objects[id];
        if (!o) continue;
        o.tapped = false;
        bump(s);
        rulesEvent(s, { e: "untap", objectId: id });
      }
      return;
    }
    case "exileOnResolve": {
      r.item.flashback = true;
      return;
    }
    case "poison": {
      const n = evalAmount(s, ctx, e.n);
      for (const p of resolveRef(s, ctx, e.who)) {
        const pl = s.players[p];
        if (!pl || n <= 0) continue;
        pl.poison = (pl.poison ?? 0) + n;
        emit({ type: "poison", player: p, amount: n, total: pl.poison });
      }
      return;
    }
    case "destroySameName": {
      for (const id of resolveRef(s, ctx, e.what)) {
        if (!onBattlefield(s, id)) continue;
        const name = chars(s, id).name;
        const all = s.battlefield.filter((x) => chars(s, x).name === name);
        for (const x of all) destroy(s, x);
      }
      return;
    }
    case "countersDivided": {
      const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id));
      if (among.length === 0) return;
      let split: number[];
      if (among.length === 1) split = [e.total];
      else {
        const answer = r.vars[key("cdivide")];
        if (!answer) {
          const each = Math.floor(e.total / among.length);
          return {
            ask: {
              player: ctx.controller,
              key: key("cdivide"),
              request: {
                type: "divide",
                intent: "divideCounters",
                prompt: `Répartissez ${e.total} marqueurs +1/+1 entre les cibles`,
                among,
                total: e.total,
                minEach: 1,
                suggested: among.map((_, i) => each + (i < e.total - each * among.length ? 1 : 0)),
              },
            },
          };
        }
        split = answer.map(Number);
      }
      among.forEach((id, i) => {
        const o = s.objects[id];
        if (o) changeCounters(s, o, P1P1, split[i] ?? 0);
      });
      return;
    }
    case "payX": {
      if (r.vars[`$${e.store}`]) return;
      const max = availableMana(s, ctx.controller);
      const answer = r.vars[key("payx")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("payx"),
            request: {
              type: "number",
              intent: "payX",
              prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`,
              min: 0,
              max,
              suggested: [max],
            },
          },
        };
      }
      const x = Math.min(Number(answer[0]), max);
      if (x > 0 && canPay(s, ctx.controller, { generic: x, colored: {}, x: 0 })) {
        payMana(s, ctx.controller, { generic: x, colored: {}, x: 0 });
        store(r, e.store, x);
      } else store(r, e.store, 0);
      return;
    }
    case "changeTarget": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const item = s.stack.find((x) => x.id === id);
        if (!item) continue;
        const entries = Object.entries(item.targets).filter(([, ids]) => ids.length > 0);
        const [specId, current] = entries[0] ?? [];
        if (entries.length !== 1 || !specId || current?.length !== 1) continue;
        const spec = stackItemSpecs(s, item).find((x) => x.id === specId);
        if (!spec) continue;
        const options = legalTargets(s, item.controller, spec, item.sourceId).filter((x) => x !== current[0] && x !== item.id);
        if (options.length === 0) continue;
        const answer = r.vars[key(`ct-${id}`)];
        if (!answer) {
          return {
            ask: {
              player: ctx.controller,
              key: key(`ct-${id}`),
              request: {
                type: "pick",
                intent: "changeTarget",
                prompt: "Choisissez la nouvelle cible",
                options,
                min: 0,
                max: 1,
                suggested: [options[0] as string],
              },
            },
          };
        }
        if (answer[0] !== undefined) item.targets = { ...item.targets, [specId]: [String(answer[0])] };
      }
      return;
    }
    case "extraCombat": {
      s.turn.extraCombats = (s.turn.extraCombats ?? 0) + 1;
      return;
    }
    case "addManaUntilEndOfTurn": {
      const pl = s.players[ctx.controller];
      if (!pl) return;
      pl.manaKeep ??= {};
      for (const m of e.mana) {
        pl.manaPool[m] += 1;
        pl.manaKeep[m] = (pl.manaKeep[m] ?? 0) + 1;
      }
      return;
    }
    case "copyNextSpell": {
      s.nextSpellCopies = [...(s.nextSpellCopies ?? []), { player: ctx.controller, turn: s.turn.number }];
      return;
    }
    case "winGame": {
      eliminate(s, opponentsOf(s, ctx.controller));
      return;
    }
    case "loseGame": {
      eliminate(s, [ctx.controller]);
      return;
    }
    case "countResolution": {
      const k = `${ctx.sourceId}:${ctx.sourceDefId}`;
      s.turn.resolutionCounts = { ...(s.turn.resolutionCounts ?? {}), [k]: (s.turn.resolutionCounts?.[k] ?? 0) + 1 };
      store(r, e.store, s.turn.resolutionCounts[k] ?? 0);
      return;
    }
    case "hellkite": {
      const victims = s.objects[ctx.sourceId]?.combatDamagedPlayers ?? [];
      for (const id of s.battlefield.filter((x) => {
        const o = s.objects[x];
        return (
          !!o && victims.includes(o.controller) && !chars(s, x).types.includes("Land") && (viewOf(s, x)?.manaValue ?? 0) === ctx.x
        );
      })) {
        destroy(s, id);
      }
      return;
    }
    case "link": {
      const o = s.objects[ctx.sourceId];
      if (o) o.linked = [...(o.linked ?? []), ...resolveRef(s, ctx, e.what)];
      // Territory Forge : les capacités de la source dépendent des cartes liées.
      bump(s);
      return;
    }
    case "grantPlay": {
      const ids = resolveRef(s, ctx, e.what).filter(
        (id) => s.objects[id]?.zone === "exile" || s.objects[id]?.zone === "graveyard",
      );
      if (e.forOwner) {
        for (const id of ids) {
          const owner = s.objects[id]?.owner ?? ctx.controller;
          grantPlay(s, owner, [id], e.forever ? "forever" : "thisTurn", {
            free: e.free,
            anyTime: e.anyTime,
            extraCost: e.extraCost,
            landsTapped: e.landsTapped,
          });
        }
        return;
      }
      grantPlay(s, ctx.controller, ids, e.forever ? "forever" : e.untilYourNextTurn ? "yourNextTurn" : "thisTurn", {
        free: e.free,
        anyTime: e.anyTime,
        anyMana: e.anyMana,
        condition: e.condition,
        source: ctx.sourceId,
      });
      return;
    }
    case "exileUntil": {
      // Exiler depuis le dessus jusqu'à une carte correspondante ; seule cette dernière est mémorisée.
      const lib = s.players[ctx.controller]?.library ?? [];
      let found: string | null = null;
      while (lib.length && !found) {
        const top = lib[0] as string;
        const match = matchesCard(s, ctx.controller, top, { ...e.filter, controller: undefined });
        const moved = moveWithSpec(s, ctx.controller, top, { to: "exile" });
        if (match) found = moved;
      }
      r.vars[`$ids:${e.store}`] = found ? [found] : [];
      return;
    }
    case "setLife": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) {
        const pl = s.players[p];
        if (!pl) continue;
        if (n < pl.life) loseLife(s, p, pl.life - n);
        else if (n > pl.life) gainLife(s, p, n - pl.life);
      }
      return;
    }
    case "exileFromOwnHand": {
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p) || r.vars[key(`xh-${p}-done`)]) continue;
        const hand = s.players[p]?.hand ?? [];
        if (hand.length === 0) continue;
        const answer = r.vars[key(`xh-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`xh-${p}`),
              request: {
                type: "pick",
                intent: "pickCards",
                prompt: "Exilez une carte de votre main",
                options: [...hand],
                min: 1,
                max: 1,
                suggested: hand.slice(0, 1),
              },
            },
          };
        }
        r.vars[key(`xh-${p}-done`)] = [1];
        const id = String(answer[0]);
        if (!hand.includes(id)) continue;
        const moved = moveWithSpec(s, p, id, { to: "exile" });
        if (moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
      }
      return;
    }
    case "tapOrSacrifice": {
      // Command Bridge : engager un permanent dégagé (au choix), sinon sacrifier la source.
      const src = s.objects[ctx.sourceId];
      if (src?.zone !== "battlefield") return;
      const untapped = s.battlefield.filter(
        (id) => id !== src.id && s.objects[id]?.controller === ctx.controller && !s.objects[id]?.tapped,
      );
      const answer = untapped.length ? r.vars[key("tapOrSac")] : [];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("tapOrSac"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: `${nameOf(s, ctx.sourceId)} : engagez un permanent dégagé (sinon il est sacrifié)`,
              options: untapped,
              min: 0,
              max: 1,
              suggested: untapped.slice(0, 1),
            },
          },
        };
      }
      const picked = answer.map(String).find((id) => untapped.includes(id));
      if (picked) tapObject(s, s.objects[picked] as NonNullable<(typeof s.objects)[string]>);
      else sacrifice(s, src.id);
      return;
    }
    case "becomeCopy": {
      const model = resolveRef(s, ctx, e.of).find((id) => onBattlefield(s, id));
      const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
      if (!model || ids.length === 0) return;
      bump(s);
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: ids,
        duration: e.duration,
        copyOf: copiedDefId(s, model),
      });
      return;
    }
    case "transform": {
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        const d = o ? s.defs[o.defId] : undefined;
        const back = d?.layout === "transform" ? d.faceDefs?.[1] : undefined;
        if (o?.zone !== "battlefield" || !back) continue;
        o.faceDefId = o.faceDefId === back.id ? undefined : back.id;
        bump(s);
        emit({ type: "transform", objectId: id, defId: o.faceDefId ?? o.defId });
      }
      return;
    }
    case "meld": {
      // 701.42a : il faut posséder et contrôler les deux permanents.
      const src = s.objects[ctx.sourceId];
      const result = src ? s.defs[src.defId]?.meldResultDef : undefined;
      const partner = s.battlefield.find(
        (id) =>
          id !== ctx.sourceId &&
          s.objects[id]?.owner === ctx.controller &&
          s.objects[id]?.controller === ctx.controller &&
          chars(s, id).name === e.with,
      );
      if (src?.zone !== "battlefield" || src.owner !== ctx.controller || !partner || !result) return;
      registerDef(s, result);
      const parts = [src, s.objects[partner]].map((o) => ({ defId: o?.defId ?? "", uid: o?.uid ?? "" }));
      const exiled = [ctx.sourceId, partner].map((id) => moveObject(s, id, "exile"));
      for (const id of exiled) if (id) removeFromGame(s, id);
      const melded = createObject(s, result.id, ctx.controller, "battlefield");
      melded.melded = parts;
      melded.timestamp = nextTimestamp(s);
      bump(s);
      emit({ type: "token", objectId: melded.id, defId: result.id, controller: ctx.controller });
      rulesEvent(s, { e: "zone", oldId: exiled[0] ?? null, newId: melded.id, from: "exile", to: "battlefield", lki: null });
      return;
    }
    case "explore": {
      // 701.44a : révéler la carte du dessus ; un terrain va en main ; sinon, un marqueur +1/+1 sur la créature et
      // son contrôleur peut mettre la carte au cimetière.
      const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
      const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
      for (const id of ids) {
        for (let n = 0; n < times; n++) {
          const k = `explore-${id}-${n}`;
          if (r.vars[key(`${k}-done`)]) continue;
          const o = s.objects[id];
          const p = o?.controller;
          const lib = p ? (s.players[p]?.library ?? []) : [];
          const top = lib[0];
          if (!o || !p || !top) {
            r.vars[key(`${k}-done`)] = [1];
            if (o) rulesEvent(s, { e: "explore", objectId: id, land: false });
            continue;
          }
          const land = !!s.defs[s.objects[top]?.defId ?? ""]?.types.includes("Land");
          if (!land) {
            const answer = r.vars[key(k)];
            if (!answer) {
              return {
                ask: {
                  player: p,
                  key: key(k),
                  request: {
                    type: "yesNo",
                    intent: "may",
                    prompt: `Exploration : mettre ${nameOf(s, top)} dans votre cimetière ?`,
                    suggested: [0],
                  },
                },
              };
            }
            r.vars[key(`${k}-done`)] = [1];
            emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
            changeCounters(s, o, P1P1, 1);
            if (answer[0] === 1) moveAndLog(s, top, "graveyard");
          } else {
            r.vars[key(`${k}-done`)] = [1];
            emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
            moveAndLog(s, top, "hand");
          }
          rulesEvent(s, { e: "explore", objectId: id, land });
        }
      }
      return;
    }
    case "connive": {
      // 701.50a : piocher, défausser ; si une carte non-terrain est défaussée, un marqueur +1/+1 sur la créature.
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        const p = o?.controller;
        if (!o || !p || r.vars[key(`connive-${id}-done`)]) continue;
        if (!r.vars[key(`connive-${id}-drew`)]) {
          drawCard(s, p);
          r.vars[key(`connive-${id}-drew`)] = [1];
        }
        const hand = s.players[p]?.hand ?? [];
        if (hand.length === 0) {
          r.vars[key(`connive-${id}-done`)] = [1];
          continue;
        }
        const answer = r.vars[key(`connive-${id}`)];
        if (!answer) {
          const cheapest = [...hand].sort(
            (a, b) =>
              manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
          );
          return {
            ask: {
              player: p,
              key: key(`connive-${id}`),
              request: {
                type: "pick",
                intent: "discard",
                prompt: "Connivence : choisissez la carte à défausser",
                options: [...hand],
                min: 1,
                max: 1,
                suggested: cheapest.slice(0, 1),
              },
            },
          };
        }
        r.vars[key(`connive-${id}-done`)] = [1];
        const card = String(answer[0]);
        if (!hand.includes(card)) continue;
        const nonland = !s.defs[s.objects[card]?.defId ?? ""]?.types.includes("Land");
        emit({ type: "discard", player: p, defIds: [s.objects[card]?.defId ?? ""] });
        announceDiscard(s, p, moveObject(s, card, "graveyard"));
        announceDiscardBatch(s, p, 1);
        if (nonland && onBattlefield(s, id)) changeCounters(s, o, P1P1, 1);
      }
      return;
    }
    case "saddle": {
      for (const id of e.what ? resolveRef(s, ctx, e.what) : [ctx.sourceId]) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        o.saddledTurn = s.turn.number;
        bump(s);
        rulesEvent(s, { e: "saddled", objectId: o.id });
      }
      return;
    }
    case "putFaceDown": {
      // Manifester (701.34) / cape (701.58) : face cachée, sous le contrôle du contrôleur de l'effet.
      for (const id of resolveRef(s, ctx, e.what)) putFaceDown(s, ctx.controller, id, e.ward);
      return;
    }
    case "manifestDread": {
      const library = s.players[ctx.controller]?.library ?? [];
      const top = library.slice(0, 2);
      if (top.length === 0) return;
      let chosen = top[0] as string;
      if (top.length === 2) {
        const answer = r.vars[key("dread")];
        if (!answer) {
          const creature = top.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Creature"));
          return {
            ask: {
              player: ctx.controller,
              key: key("dread"),
              request: {
                type: "pick",
                intent: "pickCards",
                prompt: "Manifestation effroyable : la carte à manifester (l'autre va au cimetière)",
                options: top,
                min: 1,
                max: 1,
                suggested: [creature ?? (top[0] as string)],
              },
            },
          };
        }
        chosen = String(answer[0]);
      }
      const rest = top.filter((id) => id !== chosen);
      putFaceDown(s, ctx.controller, chosen, false);
      for (const id of rest) moveAndLog(s, id, "graveyard");
      rulesEvent(s, { e: "manifestDread", player: ctx.controller });
      return;
    }
    case "turnFaceUp": {
      for (const id of resolveRef(s, ctx, e.what)) turnFaceUp(s, id);
      return;
    }
    case "warpExile": {
      for (const id of resolveRef(s, ctx, e.what)) {
        if (!onBattlefield(s, id)) continue;
        const exiled = moveWithSpec(s, ctx.controller, id, { to: "exile" });
        const o = exiled ? s.objects[exiled] : undefined;
        if (o) o.warpExiledTurn = s.turn.number;
      }
      return;
    }
    case "station": {
      // 702.184a : des marqueurs de charge égaux à la force de la créature engagée (Tapestry Warden : son endurance si
      // elle est plus grande).
      const o = s.objects[ctx.sourceId];
      const tapped = ctx.tappedForCost?.[0];
      if (o?.zone !== "battlefield" || !tapped) return;
      const c = s.objects[tapped] ? chars(s, tapped) : s.lki[tapped];
      if (!c) return;
      const byToughness = playerStatic(s, ctx.controller, "stationByToughness") && c.toughness > c.power;
      const n = Math.max(0, byToughness ? c.toughness : c.power);
      if (n > 0) changeCounters(s, o, "charge", n);
      return;
    }
    case "setClassLevel": {
      const o = s.objects[ctx.sourceId];
      if (o?.zone !== "battlefield" || (o.classLevel ?? 1) >= e.level) return;
      o.classLevel = e.level;
      bump(s);
      rulesEvent(s, { e: "classLevel", objectId: o.id, level: e.level });
      return;
    }
    case "solveCase": {
      const o = s.objects[ctx.sourceId];
      if (o?.zone !== "battlefield" || o.solved) return;
      o.solved = true;
      bump(s);
      return;
    }
    case "unlockDoor": {
      for (const id of resolveRef(s, ctx, e.what)) unlockDoor(s, id, e.door);
      return;
    }
    case "noLegendRuleThisTurn": {
      const pl = s.players[ctx.controller];
      if (pl) pl.noLegendRuleTurn = s.turn.number;
      return;
    }
    case "castCopiesFree": {
      // Uldaros Theorix : les cartes exilées sont copiées ; le joueur choisit lesquelles lancer (valeur de mana
      // totale limitée). Approximation : les copies choisies se lancent gratuitement ce tour-ci, à tout moment.
      const cards = [...new Set(e.what.flatMap((w) => resolveRef(s, ctx, w)))].filter((id) => !!s.objects[id]);
      if (cards.length === 0) return;
      const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
      const answer = r.vars[key("copies")];
      if (!answer) {
        const suggested: string[] = [];
        let total = 0;
        for (const id of [...cards].sort((a, b) => mv(b) - mv(a))) {
          if (total + mv(id) > e.maxTotalManaValue) continue;
          suggested.push(id);
          total += mv(id);
        }
        return {
          ask: {
            player: ctx.controller,
            key: key("copies"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: `Copies à lancer gratuitement (valeur de mana totale ${e.maxTotalManaValue} ou moins)`,
              options: cards,
              min: 0,
              max: cards.length,
              suggested,
            },
          },
        };
      }
      let total = 0;
      const copies: string[] = [];
      for (const id of answer.map(String)) {
        const o = s.objects[id];
        if (!o || !cards.includes(id) || total + mv(id) > e.maxTotalManaValue) continue;
        total += mv(id);
        const copy = createObject(s, o.defId, ctx.controller, "exile");
        copy.cardCopy = true;
        copies.push(copy.id);
      }
      grantPlay(s, ctx.controller, copies, "thisTurn", { free: true, anyTime: true });
      return;
    }
    case "reflexive": {
      pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: e.targets, effects: e.effects });
      return;
    }
    case "may": {
      // « [Ce joueur] peut… » : la question est posée au joueur désigné (un adversaire, Terrapact Intimidator).
      const asked = e.who ? (resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) ?? ctx.controller) : ctx.controller;
      const answer = r.vars[key("may")];
      if (!answer) {
        return {
          ask: {
            player: asked,
            key: key("may"),
            request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
          },
        };
      }
      if (e.store) store(r, e.store, answer[0] === 1 ? 1 : 0);
      return answer[0] === 1 ? undefined : { skip: e.skip };
    }
  }
}
