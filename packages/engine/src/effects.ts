/**
 * Interpréteur d'effets. Les effets sont des données (voir types.ts) : l'état reste sérialisable,
 * et une résolution pourra être suspendue sur un choix du joueur puis reprise.
 */

import { type DamageSource, payLife, removeFromCombat, sourceFromObject } from "./actions";
import { copiedDefId, linkedColors, linkedTotalPower } from "./layers";
import { manaValue } from "./mana";
import { HANDLERS as COUNTERS_HANDLERS } from "./ops/counters";
import { HANDLERS as DAMAGE_HANDLERS } from "./ops/damage";
import { HANDLERS as FLOW_HANDLERS } from "./ops/flow";
import { HANDLERS as MANA_HANDLERS } from "./ops/mana";
import { HANDLERS as PERMANENTS_HANDLERS } from "./ops/permanents";
import { HANDLERS as PLAYERS_HANDLERS } from "./ops/players";
import { HANDLERS as SPELLS_HANDLERS } from "./ops/spells";
import { HANDLERS as ZONES_HANDLERS } from "./ops/zones";
import type { EntersContext } from "./replacement";
import { spellView } from "./stack";
import {
  alivePlayers,
  bump,
  changeCounters,
  chars,
  emit,
  isCreature,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  rulesEvent,
  shuffle,
  snapshot,
} from "./state";
import { playerStatics } from "./statics";
import { matchesCard, matchesObjectFilter, matchesView, protectedFrom, resolveFilter, sourceView } from "./targets";
import { checkCondition, mostLife } from "./triggers";
import { countTurnEvents } from "./turnlog";
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
  ManaCost,
  MoveSpec,
  ObjectFilter,
  ObjectId,
  PlayerId,
  Ref,
  Resolution,
  TargetSpec,
  TriggerEventData,
  Zone,
} from "./types";
import { BASIC_LAND_TYPES } from "./types";

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
  /** Cartes défaussées pour payer le coût additionnel du sort. */
  discarded?: ObjectId[];
  tappedForCost?: ObjectId[];
  /** Cartes exilées pour payer le coût (matériaux d'une fabrication). */
  costExiled?: ObjectId[];
  /** Créature renvoyée en main pour le Web-slinging. */
  costBounced?: ObjectId[];
}

/** Caractéristiques d'un objet vivant, ou ses dernières informations connues. */
export function viewOf(s: GameState, id: string): LkiSnapshot | undefined {
  if (s.objects[id]) return snapshot(s, id);
  return s.lki[id];
}

/** Mémorise une valeur de résolution (« si vous le faites », « la vie perdue de cette façon »). */
export function store(r: Resolution, name: string | undefined, n: number): void {
  if (!name) return;
  r.vars[`$${name}`] = [n];
}

export function readVar(ctx: EffectContext, name: string): number {
  return Number(ctx.vars?.[`$${name}`]?.[0] ?? 0);
}

/** Condition évaluée pendant la résolution (elle peut dépendre du kicker ou des valeurs mémorisées). */
/**
 * Une spécification de cible dont des valeurs dépendent de la partie, rendue concrète dans ce contexte : nombre de cibles
 * (`countAmount`), valeur de mana exacte (`manaValueAmount`) ou maximale (`maxManaValueAmount`), valeur de mana totale
 * (`maxTotalManaValueAmount`). Évaluée au ciblage et à la résolution.
 */
export function concreteSpec(s: GameState, ctx: EffectContext, t: TargetSpec): TargetSpec {
  if (
    t.countAmount === undefined &&
    t.manaValueAmount === undefined &&
    t.maxManaValueAmount === undefined &&
    t.maxTotalManaValueAmount === undefined
  )
    return t;
  const out: TargetSpec = { ...t, countAmount: undefined, manaValueAmount: undefined, maxManaValueAmount: undefined };
  if (t.countAmount !== undefined) out.count = Math.max(0, evalAmount(s, ctx, t.countAmount));
  if (t.maxTotalManaValueAmount !== undefined) {
    out.maxTotalManaValue = evalAmount(s, ctx, t.maxTotalManaValueAmount);
    out.maxTotalManaValueAmount = undefined;
  }
  const extra: ObjectFilter = {
    ...(t.manaValueAmount !== undefined ? { manaValue: evalAmount(s, ctx, t.manaValueAmount) } : {}),
    ...(t.maxManaValueAmount !== undefined ? { maxManaValue: evalAmount(s, ctx, t.maxManaValueAmount) } : {}),
  };
  if (Object.keys(extra).length) {
    const f = t.filter;
    out.filter = {
      ...f,
      objects: f.objects ? { ...f.objects, ...extra } : f.objects,
      cards: f.cards ? { ...f.cards, filter: { ...f.cards.filter, ...extra } } : undefined,
    };
  }
  return out;
}

/**
 * Contexte d'évaluation hors résolution (statiques, coûts, conditions de déclenchement, taille de main…) : ni cibles, ni
 * X, ni valeurs mémorisées. Le seul constructeur de ce contexte (PLAN-C, lot C10) ; `kicked` : celui de la source.
 */
export function staticContext(
  s: GameState,
  controller: PlayerId,
  sourceId = "",
  opts: { sourceDefId?: string; event?: TriggerEventData; eventObject?: ObjectId } = {},
): EffectContext {
  const event =
    opts.event || opts.eventObject ? { ...opts.event, objectId: opts.eventObject ?? opts.event?.objectId } : undefined;
  return {
    controller,
    sourceId,
    sourceDefId: opts.sourceDefId ?? ((sourceId && s.objects[sourceId]?.defId) || ""),
    sourceSnapshot: { keywords: [], power: 0 },
    targets: {},
    x: 0,
    kicked: false,
    ...(event ? { event: event as TriggerEventData } : {}),
  };
}

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
    case "mostLife": {
      const p = c.ref ? resolveRef(s, ctx, c.ref).find((x) => isPlayer(s, x)) : ctx.controller;
      return !!p && mostLife(s, p);
    }
    case "refLife": {
      const p = resolveRef(s, ctx, c.ref)[0];
      return !!p && s.players[p]?.life === c.equals;
    }
    case "refMatches": {
      // « du type choisi » : le choix de la source (ses dernières informations si elle a été sacrifiée : A Killer Among Us).
      const f = resolveFilter(s, c.filter, ctx.sourceId);
      return resolveRef(s, ctx, c.ref).some((id) => {
        const v = viewOf(s, id);
        return !!v && matchesView(v, f, ctx.controller, ctx.sourceId);
      });
    }
    case "beholdSharingType": {
      const found = resolveRef(s, ctx, c.ref);
      const v = found[0] ? viewOf(s, found[0]) : undefined;
      if (!v) return false;
      const pl = s.players[ctx.controller];
      const candidates = [
        ...s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller && isCreature(s, id)),
        ...(pl?.hand ?? []).filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Creature")),
      ].filter((id) => !found.includes(id) && id !== ctx.sourceId);
      const views = candidates.map((id) => viewOf(s, id)).filter((x): x is NonNullable<typeof x> => !!x);
      // Types possibles : ceux de l'objet, ou (changelin) ceux des créatures à contempler.
      const types = new Set(
        (v.keywords.includes("changeling") ? views.flatMap((x) => x.subtypes) : v.subtypes).filter((t) => t !== "*"),
      );
      return [...types].some(
        (t) => views.filter((x) => matchesView(x, { subtype: t }, ctx.controller, ctx.sourceId)).length >= c.count,
      );
    }
    case "targetMatches":
      // « Si [la cible] … » pendant la résolution (cible encore présente, ou ses dernières informations).
      return (ctx.targets[c.spec] ?? []).some((id) => {
        // Encore sur le champ de bataille : le filtre complet (« arrivée ce tour-ci »… : Malamet Battle Glyph).
        if (s.objects[id]?.zone === "battlefield") return matchesObjectFilter(s, ctx.controller, id, c.filter, ctx.sourceId);
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
    case "amountGreater":
      return evalAmount(s, ctx, c.a) > evalAmount(s, ctx, c.b);
    case "amountAtLeast":
      return evalAmount(s, ctx, c.amount) >= c.n;
    case "any":
      return c.of.some((x) => evalCondition(s, ctx, x));
    case "refLostLife":
      return resolveRef(s, ctx, c.ref).some((p) => (s.players[p]?.turnStats.lifeLost ?? 0) > 0);
    case "handAtMost":
      return resolveRef(s, ctx, c.ref).some((p) => !!s.players[p] && (s.players[p]?.hand.length ?? 0) <= c.n);
    case "targetChosen":
      return (ctx.targets[c.spec] ?? []).length > 0;
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
      if (ev.newObjectId && s.objects[ev.newObjectId]) return [ev.newObjectId];
      // Parti sans laisser d'objet (jeton, copie) : ses dernières informations connues (marqueurs, définition copiée).
      return s.lki[ev.objectId] ? [ev.objectId] : [];
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
    case "costDiscarded":
      return (ctx.discarded ?? []).filter((id) => !!s.objects[id]);
    case "union":
      return [...new Set(ref.of.flatMap((r) => resolveRef(s, ctx, r)))];
    case "except": {
      const out = new Set(resolveRef(s, ctx, ref.exclude));
      return resolveRef(s, ctx, ref.ref).filter((id) => !out.has(id));
    }
    case "filtered":
      return resolveRef(s, ctx, ref.ref).filter(
        (id) => !!s.objects[id] && matchesCard(s, ctx.controller, id, { ...ref.filter, controller: undefined }, ctx.sourceId),
      );
    case "libraryTop":
      return resolveRef(s, ctx, ref.who).flatMap((p) => (s.players[p]?.library[0] ? [s.players[p]?.library[0] as string] : []));
    case "costExiled":
      return [...(ctx.costExiled ?? [])];
    case "sameNameInGraveyard": {
      const names = new Set(resolveRef(s, ctx, ref.ref).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name));
      return (s.players[ctx.controller]?.graveyard ?? []).filter((id) => names.has(s.defs[s.objects[id]?.defId ?? ""]?.name));
    }
    case "costBounced":
      return [...(ctx.costBounced ?? (ctx.sourceId ? s.objects[ctx.sourceId]?.costBounced : undefined) ?? [])];
    case "targetsOfEventObject": {
      // Le sort lancé (l'objet de l'événement) : ses cibles, d'après son élément de pile.
      const id = ctx.event?.objectId;
      const item = s.stack.find((x) => x.id === id || x.sourceId === id);
      return item ? Object.values(item.targets).flat() : [];
    }
    case "abilitiesFromEventObject": {
      const src = ctx.event?.objectId;
      const resolving = s.resolving?.item.id;
      return s.stack
        .filter((x) => x.kind !== "spell" && x.id !== resolving && x.sourceId === src)
        .map((x) => x.id)
        .slice(-1);
    }
    case "stackItemsOf": {
      const players = resolveRef(s, ctx, ref.who);
      const resolving = s.resolving?.item.id;
      return s.stack.filter((x) => x.id !== resolving && players.includes(x.controller)).map((x) => x.id);
    }
    case "exiledCardsOf": {
      const players = resolveRef(s, ctx, ref.who);
      return s.exile.filter((id) => {
        const o = s.objects[id];
        return !!o && players.includes(o.owner) && !o.faceDown && !o.cardCopy && !o.preparedFor;
      });
    }
    case "allGraveyards":
      return s.playerOrder.flatMap((p) => s.players[p]?.graveyard ?? []);
    case "graveyardOf":
      return resolveRef(s, ctx, ref.who).flatMap((p) => s.players[p]?.graveyard ?? []);
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
    case "handOf": {
      const max = ref.maxManaValue !== undefined ? evalAmount(s, ctx, ref.maxManaValue) : Number.POSITIVE_INFINITY;
      return resolveRef(s, ctx, ref.player).flatMap((p) =>
        (s.players[p]?.hand ?? []).filter(
          (id) =>
            matchesCard(s, ctx.controller, id, { ...ref.filter, controller: undefined }, ctx.sourceId) &&
            manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= max,
        ),
      );
    }
    case "playersWithMost": {
      const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
      const f = { ...ref.filter, controller: undefined };
      const count = (p: string) =>
        s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f, ctx.sourceId)).length;
      const most = Math.max(0, ...alive.map(count));
      return alive.filter((p) => count(p) === most);
    }
    case "permanentsOf": {
      const players = resolveRef(s, ctx, ref.player);
      const f = { ...ref.filter, controller: undefined };
      return s.battlefield.filter(
        (id) => players.includes(s.objects[id]?.controller ?? "") && matchesObjectFilter(s, ctx.controller, id, f, ctx.sourceId),
      );
    }
    case "defendingPlayer": {
      const atk = s.combat?.attackers.find((a) => a.id === ctx.sourceId);
      if (!atk) return [];
      if (isPlayer(s, atk.defender)) return [atk.defender];
      const pw = s.objects[atk.defender];
      return pw ? [pw.controller] : [];
    }
    case "attached": {
      const host = s.objects[ctx.sourceId]?.attachedTo ?? s.lki[ctx.sourceId]?.attachedTo;
      // Aura de joueur (Grievous Wound) : le joueur enchanté.
      return host && (onBattlefield(s, host) || isPlayer(s, host)) ? [host] : [];
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
      // La créature de l'événement qui a quitté le champ de bataille (« quand elle meurt, X étant sa force ») : sa force au
      // moment de partir (608.2h, dernières informations connues), pas celle de la carte qu'elle est devenue.
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone] : undefined;
      if (lki) return Math.max(0, lki.power);
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
    case "totalToughness":
      return s.battlefield
        .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
        .reduce((n, id) => n + Math.max(0, chars(s, id).toughness), 0);
    case "counterKindsAmong": {
      const kinds = new Set<string>();
      for (const id of s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, a.filter, ctx.sourceId)))
        for (const [k, n] of Object.entries(s.objects[id]?.counters ?? {})) if (n > 0) kinds.add(k);
      return kinds.size;
    }
    case "lifeGainedThisTurn":
      return s.players[ctx.controller]?.turnStats.lifeGained ?? 0;
    case "countersOn": {
      // L'objet de l'événement qui a quitté le champ de bataille (« quand une créature avec des marqueurs meurt ») : ses
      // marqueurs au moment de partir (dernières informations connues), pas ceux de la carte qu'il est devenu.
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone]?.counters : undefined;
      const id = resolveRef(s, ctx, a.ref)[0];
      const counters = lki ?? ((id && (s.objects[id]?.counters ?? s.lki[id]?.counters)) || {});
      // « le nombre de marqueurs sur … » (Warden of the Grove) : tous types confondus.
      if (a.counter === "any") return Object.values(counters).reduce((n, k) => n + Math.max(0, k), 0);
      return counters[a.counter] ?? 0;
    }
    case "colorsAmong": {
      const colors = new Set<string>();
      for (const id of s.battlefield) {
        if (matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          for (const c of chars(s, id).colors) colors.add(c);
      }
      return colors.size;
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
    case "pow":
      return a.base ** Math.min(20, Math.max(0, evalAmount(s, ctx, a.of)));
    case "var":
      return readVar(ctx, a.name);
    case "lifeTotal":
      return Math.max(0, s.players[ctx.controller]?.life ?? 0);
    case "graveyardsWithAtLeast":
      return s.playerOrder.filter((p) => !s.players[p]?.lost && (s.players[p]?.graveyard.length ?? 0) >= a.n).length;
    case "manaValueOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? (viewOf(s, id)?.manaValue ?? manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)) : 0;
    }
    case "toughnessOf": {
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone] : undefined;
      if (lki) return Math.max(0, lki.toughness);
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? Math.max(0, viewOf(s, id)?.toughness ?? 0) : 0;
    }
    case "colorsOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? (viewOf(s, id)?.colors.length ?? 0) : 0;
    }
    case "maxPower":
      if (a.zone === "graveyard")
        return Math.max(
          0,
          ...(s.players[ctx.controller]?.graveyard ?? [])
            .filter((id) => matchesCard(s, ctx.controller, id, a.filter, ctx.sourceId))
            .map((id) => s.defs[s.objects[id]?.defId ?? ""]?.power ?? 0),
        );
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
    case "manaSpent": {
      // Un éphémère ou un rituel qui se résout : le mana dépensé est sur l'élément de pile (Molten Note).
      const item = s.resolving?.item.id === ctx.sourceId ? s.resolving.item : s.stack.find((x) => x.id === ctx.sourceId);
      return s.objects[ctx.sourceId]?.manaSpent ?? item?.manaSpent ?? 0;
    }
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0;
    case "spellsCastThisTurn":
      return s.players[ctx.controller]?.turnStats.spellsCast ?? 0;
    case "cardsDrawnThisTurn":
      return s.players[ctx.controller]?.turnStats.cardsDrawn ?? 0;
    case "creaturesDiedThisTurn":
      return countTurnEvents(s, { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"] }, ctx.controller);
    case "totalManaValue":
      if (a.zone === "exile")
        return (
          s.exile
            .filter((id) => s.objects[id]?.owner === ctx.controller)
            .filter((id) => matchesCard(s, ctx.controller, id, { ...a.filter, controller: undefined }, ctx.sourceId))
            // 708.2 : une carte exilée face cachée a une valeur de mana de 0.
            .reduce((n, id) => n + (s.objects[id]?.faceDown ? 0 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)), 0)
        );
      return s.battlefield
        .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
        .reduce((n, id) => n + (snapshot(s, id).manaValue ?? 0), 0);
    case "devotion": {
      let n = 0;
      for (const id of s.battlefield) {
        if (s.objects[id]?.controller !== ctx.controller) continue;
        const cost = s.defs[copiedDefId(s, id)]?.manaCost;
        n += cost?.colored[a.color] ?? 0;
        n += (cost?.hybrid ?? []).filter((h) => h.includes(a.color)).length;
        n += (cost?.twoHybrid ?? []).filter((c) => c === a.color).length;
      }
      return n;
    }
    case "cardTypesOf": {
      const types = new Set(resolveRef(s, ctx, a.ref).flatMap((id) => s.defs[s.objects[id]?.defId ?? ""]?.types ?? []));
      return types.size;
    }
    case "eventColorsSpent": {
      const id = ctx.event?.objectId;
      const spent = (id ? s.stack.find((x) => x.id === id)?.spentColors : undefined) ?? {};
      return (["W", "U", "B", "R", "G"] as const).filter((c) => (spent[c] ?? 0) > 0).length;
    }
    case "manaSpentOf":
      return resolveRef(s, ctx, a.ref).reduce((n, id) => n + (s.stack.find((x) => x.id === id)?.manaSpent ?? 0), 0);
    case "eventX": {
      const id = ctx.event?.objectId;
      return (id ? s.stack.find((x) => x.id === id)?.x : undefined) ?? 0;
    }
    case "eventManaSpent": {
      const id = ctx.event?.objectId;
      return (id ? s.stack.find((x) => x.id === id)?.manaSpent : undefined) ?? 0;
    }
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
    case "maxManaValue":
      return Math.max(
        0,
        ...s.battlefield
          .filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId))
          .map((id) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)),
      );
    case "manaSymbolsOf": {
      // Namor the Sub-Mariner : « autant que de symboles de mana bleu dans son coût de mana » (le sort de l'événement).
      const id = resolveRef(s, ctx, a.ref)[0];
      const cost = id ? s.defs[s.objects[id]?.defId ?? s.lki[id]?.defId ?? ""]?.manaCost : undefined;
      if (!cost) return 0;
      return (
        (cost.colored[a.color] ?? 0) +
        (cost.hybrid ?? []).filter((h) => h.includes(a.color)).length +
        (cost.twoHybrid ?? []).filter((m) => m === a.color).length
      );
    }
    case "maxSharingCreatureType": {
      const ids = s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId));
      const changelings = ids.filter((id) => chars(s, id).keywords.includes("changeling")).length;
      const per = new Map<string, number>();
      for (const id of ids) {
        const c = chars(s, id);
        if (c.keywords.includes("changeling")) continue;
        for (const t of new Set(c.subtypes)) per.set(t, (per.get(t) ?? 0) + 1);
      }
      return changelings + Math.max(0, ...per.values());
    }
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
    case "max":
      return Math.max(0, ...a.of.map((x) => evalAmount(s, ctx, x)));
    case "maxPowerInHand":
      return Math.max(
        0,
        ...(s.players[ctx.controller]?.hand ?? []).map((id) => {
          const d = s.defs[s.objects[id]?.defId ?? ""];
          return d?.types.includes("Creature") ? (d.power ?? 0) : 0;
        }),
      );
    case "opponentsLostLife":
      return opponentsOf(s, ctx.controller).filter((p) => (s.players[p]?.turnStats.lifeLost ?? 0) > 0).length;
    case "sourceX":
      return s.objects[ctx.sourceId]?.castX ?? 0;
    case "unlockedDoorNames": {
      const names = new Set<string>();
      for (const id of s.battlefield) {
        const o = s.objects[id];
        if (o?.controller !== ctx.controller) continue;
        const faces = s.defs[o.defId]?.faceDefs ?? [];
        for (const d of o.unlocked ?? []) if (faces[d]) names.add(faces[d].name);
      }
      return names.size;
    }
    case "unlockedDoors":
      return s.battlefield.reduce(
        (n, id) => n + (s.objects[id]?.controller === ctx.controller ? (s.objects[id]?.unlocked?.length ?? 0) : 0),
        0,
      );
    case "cardTypesInGraveyard": {
      const types = new Set<string>();
      for (const id of s.players[ctx.controller]?.graveyard ?? [])
        for (const t of s.defs[s.objects[id]?.defId ?? ""]?.types ?? []) types.add(t);
      return types.size;
    }
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
      const basics = BASIC_LAND_TYPES;
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
    case "colorsSpent": {
      const item = s.resolving?.item.id === ctx.sourceId ? s.resolving.item : s.stack.find((x) => x.id === ctx.sourceId);
      const spent = item?.spentColors ?? s.objects[ctx.sourceId]?.spentColors ?? {};
      return (["W", "U", "B", "R", "G"] as const).filter((c) => (spent[c] ?? 0) > 0).length;
    }
    case "lkiDamage":
      return s.objects[ctx.sourceId]?.damage ?? s.lki[ctx.sourceId]?.damage ?? 0;
    case "lkiCounters": {
      const counters = s.objects[ctx.sourceId]?.counters ?? s.lki[ctx.sourceId]?.counters ?? {};
      return counters[a.counter] ?? 0;
    }
    case "lifeLostThisTurn":
      return s.players[ctx.controller]?.turnStats.lifeLost ?? 0;
    case "cardsIn":
      return s.players[ctx.controller]?.[a.zone].length ?? 0;
    case "inExile":
      return resolveRef(s, ctx, a.ref).filter((id) => s.objects[id]?.zone === "exile").length;
    case "opponentsWithMoreInHand": {
      const mine = s.players[ctx.controller]?.hand.length ?? 0;
      return opponentsOf(s, ctx.controller).filter((p) => (s.players[p]?.hand.length ?? 0) > mine).length;
    }
    case "totalPowerOf":
      return resolveRef(s, ctx, a.ref).reduce(
        (n, id) => n + Math.max(0, s.objects[id]?.zone === "battlefield" ? chars(s, id).power : (s.lki[id]?.power ?? 0)),
        0,
      );
    case "greatestManaValueOf":
      return Math.max(0, ...resolveRef(s, ctx, a.ref).map((id) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost)));
    case "colorPairsAmong": {
      const pairs = new Set<string>();
      for (const id of s.battlefield) {
        if (!matchesObjectFilter(s, ctx.controller, id, a.filter, ctx.sourceId)) continue;
        const colors = chars(s, id).colors;
        if (colors.length === 2) pairs.add([...colors].sort().join(""));
      }
      return pairs.size;
    }
    case "opponentsWithHandAtMost":
      return opponentsOf(s, ctx.controller).filter((p) => (s.players[p]?.hand.length ?? 0) <= a.n).length;
    case "turnEvents":
      if (!a.of) return countTurnEvents(s, a.query, ctx.controller);
      return resolveRef(s, ctx, a.of)
        .filter((x) => isPlayer(s, x))
        .reduce((n, p) => n + countTurnEvents(s, a.query, ctx.controller, p), 0);
    case "lkiPower":
      return Math.max(0, ctx.sourceSnapshot.power);
    case "caveManaSpent":
      return s.objects[ctx.sourceId]?.caveMana ?? 0;
    case "linkedTotalPower":
      return linkedTotalPower(s, s.objects[ctx.sourceId]?.linked);
    case "linkedColors":
      return linkedColors(s, s.objects[ctx.sourceId]?.linked).length;
    case "attackersThisTurn":
      return s.players[ctx.controller]?.turnStats.attackers ?? 0;
    case "untappedInUntapStep":
      return s.players[ctx.controller]?.turnStats.untappedInUntapStep ?? 0;
    case "permanentTypesInGraveyard": {
      const types = new Set<string>();
      const PERMANENT = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];
      for (const id of s.players[ctx.controller]?.graveyard ?? [])
        for (const t of s.defs[s.objects[id]?.defId ?? ""]?.types ?? []) if (PERMANENT.includes(t)) types.add(t);
      return types.size;
    }
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

export function damageSource(s: GameState, ctx: EffectContext, ref?: Ref): DamageSource | null {
  if (!ref || (ref.kind === "self" && !onBattlefield(s, ctx.sourceId))) {
    // 120.3 : une capacité d'un permanent inflige ses blessures avec ce permanent pour source (Trance Kuja).
    if (!ref && onBattlefield(s, ctx.sourceId) && s.objects[ctx.sourceId]?.defId === ctx.sourceDefId) {
      return sourceFromObject(s, ctx.sourceId);
    }
    // Un sort qui se résout : il est identifié par son élément de pile (Imodane, the Pyrohammer).
    const spell =
      s.resolving?.item.kind === "spell" && s.resolving.item.sourceId === ctx.sourceId ? s.resolving.item.id : undefined;
    // Lo and Li : « vos sorts de Leçon ont le lien de vie » (statique lue au moment des blessures).
    const d = s.defs[ctx.sourceDefId];
    const granted = d
      ? playerStatics(s, ctx.controller, "spellKeywords")
          .filter(
            ({ ab }) => ab.spellKeywords && matchesView(spellView(d, ctx.controller), ab.spellKeywords.filter, ctx.controller),
          )
          .flatMap(({ ab }) => ab.spellKeywords?.keywords ?? [])
      : [];
    const keywords = granted.length ? [...new Set([...ctx.sourceSnapshot.keywords, ...granted])] : ctx.sourceSnapshot.keywords;
    return { defId: ctx.sourceDefId, controller: ctx.controller, keywords, stackId: spell };
  }
  const id = resolveRef(s, ctx, ref)[0];
  if (!id || !onBattlefield(s, id)) return null;
  return sourceFromObject(s, id);
}

export function addPump(s: GameState, affected: ObjectId[], power: number, toughness: number, keywords: Keyword[] = []): void {
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
export type OpResult =
  | undefined
  | { ask: { player: PlayerId; request: ChoiceRequest; key: string } }
  | { castNow: { player: PlayerId; cards: ObjectId[]; prompt: string; key: string } }
  | { skip: number };

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
    discarded: r.item.discarded,
    tappedForCost: r.item.tappedForCost,
    costExiled: r.item.costExiled,
    costBounced: r.item.costBounced,
  };
}

export function nameOf(s: GameState, id: string): string {
  return s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
}

export function moveAndLog(s: GameState, id: ObjectId, to: "hand" | "exile" | "graveyard"): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  return moveObject(s, id, to);
}

/** Ajoute un effet continu (couches) à des objets. */
export function addEffect(s: GameState, ids: ObjectId[], mods: LayerMods, duration: "endOfTurn" | "permanent"): void {
  if (ids.length === 0) return;
  bump(s);
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: ids, duration, ...mods });
}

/** Déplace un objet selon une destination d'effet ; renvoie son nouvel identifiant. */
/** `choices` : choix d'arrivée faits pendant la résolution (ce que copie un Clone, ce qu'enchante une Aura, les points de */
/** vie payés pour un terrain choc). */
export function moveWithSpec(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  spec: MoveSpec,
  choices?: Pick<EntersContext, "copyOf" | "copyMods" | "copyChosen" | "attachTo" | "chosen" | "shockPaid">,
): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  // Vannifar : « enveloppez d'une cape une carte de votre main ».
  if (spec.to === "battlefield" && spec.cloak) return putFaceDown(s, controller, id, true);
  const zone: Zone = spec.to === "libraryTop" || spec.to === "libraryBottom" ? "library" : (spec.to as Zone);
  // Exilée face cachée (406.3) : les joueurs qui peuvent la regarder.
  const viewers =
    zone === "exile" && spec.faceDown
      ? spec.faceDown === "you"
        ? [controller]
        : spec.faceDown === "owner"
          ? [o.owner]
          : []
      : undefined;
  emit({
    type: "moved",
    owner: o.owner,
    objectId: id,
    defId: o.defId,
    from: o.zone,
    to: zone,
    ...(viewers ? { faceDown: viewers } : {}),
  });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  const newController = spec.to === "battlefield" ? (spec.underYourControl ? controller : o.owner) : undefined;
  // Terrain choc : les points de vie sont payés en arrivant, par le joueur qui le contrôlera.
  const shock = s.defs[o.defId]?.shockLand;
  if (choices?.shockPaid && shock && newController) payLife(s, newController, shock);
  const mods = { addTypes: spec.addTypes, addSubtypes: spec.addSubtypes, addKeywords: spec.addKeywords };
  const newId_ = moveObject(s, id, zone, {
    controller: newController,
    position: spec.to === "libraryBottom" ? "bottom" : "top",
    transformed: spec.transformed,
    tapped: spec.tapped || spec.attacking,
    // Marqueurs, types et attaque : en place avant l'événement d'arrivée (614.1c, 614.12, 508.4).
    enters:
      spec.to === "battlefield"
        ? {
            counters: spec.counters ? [spec.counters] : undefined,
            mods: { ...mods, setTypes: spec.setTypes, setSubtypes: spec.setSubtypes },
            attacking: spec.attacking && s.combat ? attackingDefender(s, newController ?? o.owner) : undefined,
            ...choices,
          }
        : undefined,
  });
  // « … N-ième depuis le dessus de la bibliothèque » (Riptide Gearhulk).
  if (newId_ && spec.to === "libraryTop" && spec.fromTop && spec.fromTop > 1) {
    const lib = s.players[o.owner]?.library;
    if (lib && lib[0] === newId_) {
      lib.shift();
      lib.splice(Math.min(spec.fromTop - 1, lib.length), 0, newId_);
    }
  }
  // « Mélangez-le dans la bibliothèque de son propriétaire. »
  if (newId_ && zone === "library" && spec.shuffle) shuffle(s, s.players[o.owner]?.library ?? []);
  const moved = newId_ ? s.objects[newId_] : undefined;
  // Marqueurs sur une carte exilée (« exilez-la avec un marqueur de butin », Tinybones).
  if (moved && zone === "exile" && spec.counters) changeCounters(s, moved, spec.counters.kind, spec.counters.n);
  if (moved && zone === "exile" && viewers) moved.exiledFaceDown = viewers;
  // Le verso (712.14), l'état engagé, les marqueurs, les types et l'attaque sont posés par `moveObject` avant l'événement
  // d'arrivée (voir `EntersContext`).
  return newId_;
}

/**
 * 508.4 : défenseur d'un permanent mis sur le champ de bataille attaquant, faute de choix : ce qu'attaque une créature de
 * son contrôleur, sinon son premier adversaire.
 */
export function attackingDefender(s: GameState, controller: PlayerId): string {
  return (
    s.combat?.attackers.find((a) => s.objects[a.id]?.controller === controller)?.defender ?? opponentsOf(s, controller)[0] ?? ""
  );
}

/** Peut-on attacher cette Aura ou cet Équipement à ce permanent ? (301.5c, 303.4d) */
export function canAttach(s: GameState, what: ObjectId, to: ObjectId): boolean {
  const a = s.objects[what];
  if (a?.zone !== "battlefield" || !onBattlefield(s, to) || what === to) return false;
  const d = s.defs[a.defId];
  // 702.16c : protection — ni enchantée, ni équipée par ce qui correspond à sa qualité.
  if (protectedFrom(s, to, sourceView(s, what))) return false;
  if (d?.enchant) return matchesObjectFilter(s, a.controller, to, d.enchant.filter, what);
  if (chars(s, what).subtypes.includes("Equipment")) return isCreature(s, to);
  return false;
}

/** 701.3 : attache l'objet ; sans effet si c'est impossible ou s'il y est déjà attaché. */
export function attach(s: GameState, what: ObjectId, to: ObjectId): boolean {
  const a = s.objects[what];
  if (!a || a.attachedTo === to || !canAttach(s, what, to)) return false;
  a.attachedTo = to;
  a.timestamp = nextTimestamp(s); // 613.7e : nouvel horodatage
  bump(s);
  emit({ type: "attach", objectId: what, defId: a.defId, to, toDefId: s.objects[to]?.defId ?? "" });
  return true;
}

/** Signale une carte défaussée (déclencheurs « chaque fois qu'un adversaire défausse une carte »). */
export function announceDiscard(s: GameState, player: PlayerId, card: ObjectId | null): void {
  // Chaos (Mayhem) : la carte défaussée ce tour-ci peut être lancée depuis le cimetière.
  const o = card ? s.objects[card] : undefined;
  if (o) o.discardedTurn = s.turn.number;
  if (card) rulesEvent(s, { e: "discard", player, cards: [card] });
}

/** Fin d'une défausse : « chaque fois que vous défaussez une ou plusieurs cartes » (une fois, avec leur nombre). */
export function announceDiscardBatch(s: GameState, player: PlayerId, count: number): void {
  if (count > 0) rulesEvent(s, { e: "discardBatch", player, count });
}

/** Numéro du prochain tour de ce joueur (tour en cours exclu). */
export function nextTurnOf(s: GameState, player: PlayerId): number {
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
  until: "thisTurn" | "yourNextTurn" | "yourNextEndStep" | "forever" | number,
  opts: {
    free?: boolean;
    anyTime?: boolean;
    condition?: Condition;
    source?: ObjectId;
    extraCost?: number;
    landsTapped?: boolean;
    anyMana?: boolean;
    exileAfter?: boolean;
    bottomAfter?: boolean;
    group?: string;
    orHand?: boolean;
    now?: boolean;
    flashback?: boolean;
    harmonize?: boolean;
    cost?: ManaCost;
    payLifeManaValue?: boolean;
    adventureOnly?: boolean;
  },
): void {
  const last =
    typeof until === "number"
      ? until
      : until === "forever"
        ? Number.MAX_SAFE_INTEGER
        : until === "thisTurn" || (until === "yourNextEndStep" && beforeYourEndStep(s, player))
          ? s.turn.number
          : nextTurnOf(s, player);
  const endStep = until === "yourNextEndStep" ? { beforeEndStep: true } : {};
  s.playPermissions = [
    ...(s.playPermissions ?? []),
    ...cards.map((card) => ({ card, player, until: last, ...endStep, ...opts })),
  ];
}

/** C'est le tour de ce joueur, avant son étape de fin : « votre prochaine étape de fin » est celle de ce tour. */
function beforeYourEndStep(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && s.turn.step !== "end" && s.turn.step !== "cleanup";
}

/** Une permission de jouer encore valable : avant la fin de son dernier tour, ou avant son étape de fin. */
export function permissionActive(s: GameState, p: { until: number; beforeEndStep?: boolean }): boolean {
  if (p.until > s.turn.number) return true;
  if (p.until < s.turn.number) return false;
  return !(p.beforeEndStep && (s.turn.step === "end" || s.turn.step === "cleanup"));
}

/** Identité physique de la carte désignée (pour un effet qui dure tant qu'elle reste exilée). */
export function exiledUid(s: GameState, ctx: EffectContext, ref: Ref): string | undefined {
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
  const stats = s.players[controller]?.turnStats;
  if (stats) stats.faceDownOrUp = (stats.faceDownOrUp ?? 0) + 1;
  return moveObject(s, id, "battlefield", { controller, faceDown: { ward, upCosts } });
}

/** Cartes d'une zone appartenant à des joueurs donnés. */
export function zoneCards(s: GameState, players: string[], zone: "graveyard" | "library" | "hand"): ObjectId[] {
  return players.flatMap((p) => s.players[p]?.[zone] ?? []);
}

/**
 * Exécute un effet. Les effets qui demandent un choix renvoient `ask` : la résolution est suspendue,
 * puis l'effet est rejoué une fois la réponse rangée dans `r.vars[key]`.
 */
/** Traitement d'un `op` d'effet : s, résolution, effet (typé selon son `op`), contexte, clé de choix. */
type Handler<E extends Effect> = (
  s: GameState,
  r: Resolution,
  e: E,
  ctx: EffectContext,
  key: (suffix: string) => string,
) => OpResult;
type AnyHandler = Handler<never>;
/** Table `op → traitement`, découpée par domaine dans `ops/`. */
export type OpHandlers = { [K in Effect["op"]]?: Handler<Extract<Effect, { op: K }>> };

let allHandlers: OpHandlers | null = null;
/** Assemblée au premier appel (les modules `ops/` importent effects.ts). */
function handlers(): OpHandlers {
  const all: OpHandlers =
    allHandlers ??
    Object.assign(
      {},
      COUNTERS_HANDLERS,
      DAMAGE_HANDLERS,
      FLOW_HANDLERS,
      MANA_HANDLERS,
      PERMANENTS_HANDLERS,
      PLAYERS_HANDLERS,
      SPELLS_HANDLERS,
      ZONES_HANDLERS,
    );
  allHandlers = all;
  return all;
}

export function runEffect(s: GameState, r: Resolution, e: Effect): OpResult {
  const ctx = contextOf(r);
  const key = (suffix: string) => `${r.pc}:${suffix}`;
  const handler = (handlers() as Record<string, AnyHandler | undefined>)[e.op];
  return handler ? handler(s, r, e as never, ctx, key) : undefined;
}
