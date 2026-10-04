/**
 * Interpréteur d'effets. Les effets sont des données (voir types.ts) : l'état reste sérialisable,
 * et une résolution pourra être suspendue sur un choix du joueur puis reprise.
 */

import { type DamageSource, payLife, removeFromCombat, sourceFromObject } from "./actions";
import { copiedDefId } from "./layers";
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
  castInfoOf,
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
import {
  ALL_CREATURE_TYPES,
  matchesCard,
  matchesObjectFilter,
  matchesView,
  NON_CREATURE_SUBTYPES,
  protectedFrom,
  resolveFilter,
  sourceView,
} from "./targets";
import { checkCondition, mostLife, pushInline } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type {
  AggregateProperty,
  Amount,
  ChoiceRequest,
  ChoiceValue,
  Condition,
  CostPaid,
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
import { BASIC_LAND_TYPES, PERMANENT_TYPES } from "./types";

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
  /** Objets payés pour le coût de ce qui se résout ; créature renvoyée en main pour le Web-slinging. */
  paid?: CostPaid & { bounced?: ObjectId[] };
}

/**
 * Bornes du filtre qui dépendent de ce qui se résout : « … X ou moins », le X (Day of Black Sun, Doppelgang) ; « de force
 * supérieure à celle de la créature ciblée » (Fell the Mighty) ; « qui partage un type de créature avec elle » (Shared
 * Animosity : l'objet de l'événement).
 */
export function withX(s: GameState, f: ObjectFilter, ctx: EffectContext): ObjectFilter {
  if (f.powerAboveOf) {
    const id = resolveRef(s, ctx, f.powerAboveOf).find((x) => s.objects[x]?.zone === "battlefield");
    // Sans objet désigné encore sur le champ de bataille, rien ne correspond.
    f = { ...f, powerAboveOf: undefined, minPower: id ? chars(s, id).power + 1 : Number.POSITIVE_INFINITY };
  }
  if (f.sharesCreatureTypeWith) {
    const id = resolveRef(s, ctx, f.sharesCreatureTypeWith).find((x) => s.objects[x]);
    const v = id ? snapshot(s, id) : undefined;
    const all = !!v && (v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES));
    const types = v ? v.subtypes.filter((st) => !NON_CREATURE_SUBTYPES.has(st)) : [];
    // Un changelin partage chacun de ses types avec toute créature (approché : toute créature).
    f = all
      ? { ...f, sharesCreatureTypeWith: undefined, types: [...(f.types ?? []), "Creature"] }
      : { ...f, sharesCreatureTypeWith: undefined, anySubtype: types };
  }
  const x = ctx.x;
  if (!f.maxToughnessX && !f.manaValueX && !f.maxManaValueX) return f;
  return {
    ...f,
    maxToughnessX: undefined,
    manaValueX: undefined,
    maxManaValueX: undefined,
    ...(f.maxToughnessX ? { maxToughness: x } : {}),
    ...(f.manaValueX ? { manaValue: x } : {}),
    ...(f.maxManaValueX ? { maxManaValue: x } : {}),
  };
}

/** La référence `zone` : les objets d'une zone des joueurs désignés, correspondant au filtre. */
function zoneObjects(s: GameState, ctx: EffectContext, ref: Extract<Ref, { kind: "zone" }>): string[] {
  const players = resolveRef(s, ctx, ref.who);
  const f = ref.filter ? { ...withX(s, ref.filter, ctx), controller: undefined } : undefined;
  const card = (id: ObjectId) => !f || matchesCard(s, ctx.controller, id, f, ctx.sourceId);
  switch (ref.zone) {
    case "battlefield":
      return s.battlefield.filter(
        (id) =>
          players.includes(s.objects[id]?.controller ?? "") && matchesObjectFilter(s, ctx.controller, id, f ?? {}, ctx.sourceId),
      );
    case "graveyard":
      return players.flatMap((p) => s.players[p]?.graveyard ?? []).filter(card);
    case "hand": {
      const max = ref.maxManaValue !== undefined ? evalAmount(s, ctx, ref.maxManaValue) : Number.POSITIVE_INFINITY;
      return players.flatMap((p) =>
        (s.players[p]?.hand ?? []).filter((id) => card(id) && manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= max),
      );
    }
    case "exile":
      // Face visible seulement ; ni les copies de cartes ni les copies de sorts préparés.
      return s.exile.filter((id) => {
        const o = s.objects[id];
        return !!o && players.includes(o.owner) && !o.faceDown && !o.cardCopy && !o.preparedFor && card(id);
      });
    case "stack": {
      const resolving = s.resolving?.item.id;
      return s.stack.filter((x) => x.id !== resolving && players.includes(x.controller)).map((x) => x.id);
    }
  }
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
    case "handAtMost":
      return resolveRef(s, ctx, c.ref).some((p) => !!s.players[p] && (s.players[p]?.hand.length ?? 0) <= c.n);
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
    case "union":
      return [...new Set(ref.of.flatMap((r) => resolveRef(s, ctx, r)))];
    case "combatPartners": {
      const of = new Set(resolveRef(s, ctx, ref.ref));
      const out = new Set<ObjectId>();
      for (const a of s.combat?.attackers ?? []) {
        if (of.has(a.id)) for (const b of a.blockers) out.add(b);
        if (a.blockers.some((b) => of.has(b))) out.add(a.id);
      }
      return [...out].filter((id) => s.objects[id]?.zone === "battlefield");
    }
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
    case "sameName": {
      // Les noms sont lus maintenant, avant ce que fait l'effet (sur le champ de bataille : le nom calculé).
      const nameOf_ = (id: string) => (onBattlefield(s, id) ? chars(s, id).name : s.defs[s.objects[id]?.defId ?? ""]?.name);
      const names = new Set(resolveRef(s, ctx, ref.ref).map(nameOf_));
      if (ref.zone === "battlefield") return s.battlefield.filter((id) => names.has(chars(s, id).name));
      return (s.players[ctx.controller]?.graveyard ?? []).filter((id) => names.has(s.defs[s.objects[id]?.defId ?? ""]?.name));
    }
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
    case "playersWhere":
      return resolveRef(s, ctx, ref.of).filter((p) => isPlayer(s, p) && evalCondition(s, { ...ctx, controller: p }, ref.where));
    case "crewedBy": {
      const c = s.objects[ctx.sourceId]?.crewedBy;
      return c && c.turn === s.turn.number ? c.ids.filter((id) => onBattlefield(s, id)) : [];
    }
    case "exiledWith":
      return s.linkedExile
        .filter((l) => l.sourceId === ctx.sourceId)
        .flatMap((l) => l.cards)
        .filter((id) => s.objects[id]?.zone === "exile");
    case "playersWithMost": {
      const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
      const f = { ...ref.filter, controller: undefined };
      const count = (p: string) =>
        s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f, ctx.sourceId)).length;
      const most = Math.max(0, ...alive.map(count));
      return alive.filter((p) => count(p) === most);
    }
    case "defendingPlayer": {
      const atk = s.combat?.attackers.find((a) => a.id === ctx.sourceId);
      if (!atk) return [];
      if (isPlayer(s, atk.defender)) return [atk.defender];
      const pw = s.objects[atk.defender];
      return pw ? [pw.controller] : [];
    }
    case "cost":
      switch (ref.paid) {
        case "sacrificed":
          return ctx.paid?.sacrificed ?? [];
        case "discarded":
          return (ctx.paid?.discarded ?? []).filter((id) => !!s.objects[id]);
        case "exiled":
          return [...(ctx.paid?.exiled ?? [])];
        case "bounced":
          return [...(ctx.paid?.bounced ?? s.objects[ctx.sourceId]?.cast?.costBounced ?? [])];
      }
      return [];
    case "zone":
      return zoneObjects(s, ctx, ref);
    case "attachmentsOf": {
      const hosts = new Set(resolveRef(s, ctx, ref.ref));
      return s.battlefield.filter((id) => hosts.has(s.objects[id]?.attachedTo ?? ""));
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
    case "aggregate":
      return aggregate(s, ctx, a);
    case "spent":
      return (a.of ? resolveRef(s, ctx, a.of) : [ctx.sourceId]).reduce((n, id) => n + spentOn(s, id, a.what), 0);
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
    case "halfLife": {
      const p = resolveRef(s, ctx, a.who).find((x) => isPlayer(s, x));
      return p ? Math.ceil(Math.max(0, s.players[p]?.life ?? 0) / 2) : 0;
    }
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0;
    case "refCount":
      return resolveRef(s, ctx, a.ref).length;
    case "manaSymbols": {
      // Dévotion : vos permanents (coût de ce qu'ils copient) ; sinon les objets désignés (dernières informations connues).
      const ids = a.of ? resolveRef(s, ctx, a.of) : s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller);
      return ids.reduce((n, id) => {
        const defId = onBattlefield(s, id) ? copiedDefId(s, id) : (s.objects[id]?.defId ?? s.lki[id]?.defId ?? "");
        const cost = s.defs[defId]?.manaCost;
        if (!cost) return n;
        return (
          n +
          (cost.colored[a.color] ?? 0) +
          (cost.hybrid ?? []).filter((h) => h.includes(a.color)).length +
          (cost.twoHybrid ?? []).filter((m) => m === a.color).length
        );
      }, 0);
    }
    case "max":
      return Math.max(0, ...a.of.map((x) => evalAmount(s, ctx, x)));
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
    case "lkiDamage":
      return s.objects[ctx.sourceId]?.damage ?? s.lki[ctx.sourceId]?.damage ?? 0;
    case "cardsIn":
      return s.players[ctx.controller]?.[a.zone].length ?? 0;
    case "inExile":
      return resolveRef(s, ctx, a.ref).filter((id) => s.objects[id]?.zone === "exile").length;
    case "opponentsWithMoreInHand": {
      const mine = s.players[ctx.controller]?.hand.length ?? 0;
      return opponentsOf(s, ctx.controller).filter((p) => (s.players[p]?.hand.length ?? 0) > mine).length;
    }
    case "turnEvents":
      if (!a.of) return countTurnEvents(s, a.query, ctx.controller);
      return resolveRef(s, ctx, a.of)
        .filter((x) => isPlayer(s, x))
        .reduce((n, p) => n + countTurnEvents(s, a.query, ctx.controller, p), 0);
    case "lkiPower":
      return Math.max(0, ctx.sourceSnapshot.power);
    case "untappedInUntapStep":
      return s.players[ctx.controller]?.turnStats.untappedInUntapStep ?? 0;
  }
}

/** Nombre de permanents correspondant au filtre, vus d'un joueur. */
export function boardAmount(
  s: GameState,
  a: Extract<Amount, { kind: "count" }>,
  controller: PlayerId,
  sourceId?: ObjectId,
): number {
  return s.battlefield.filter((id) => matchesObjectFilter(s, controller, id, a.filter, sourceId)).length;
}

const PERMANENT = new Set<string>(PERMANENT_TYPES);

/** Valeurs d'une propriété d'un objet (une seule pour un nombre, plusieurs pour des couleurs, des types…). */
function propertyValues(s: GameState, id: ObjectId, property: AggregateProperty, counter?: string): (number | string)[] {
  const o = s.objects[id];
  // Sur le champ de bataille : les caractéristiques calculées ; un objet parti : ses dernières informations connues ;
  // ailleurs : la carte imprimée (708.2 : face cachée, valeur de mana 0).
  const here = o?.zone === "battlefield";
  const v: Pick<LkiSnapshot, "power" | "toughness" | "colors" | "types" | "subtypes" | "name"> | undefined = here
    ? chars(s, id)
    : o
      ? undefined
      : s.lki[id];
  const d = o && !v ? s.defs[o.defId] : undefined;
  const counters = (here ? o.counters : o ? o.counters : s.lki[id]?.counters) ?? {};
  switch (property) {
    case "power":
      return [v ? v.power : (d?.power ?? 0)];
    case "toughness":
      return [v ? v.toughness : (d?.toughness ?? 0)];
    case "manaValue":
      return [
        here ? (snapshot(s, id).manaValue ?? 0) : !o ? (s.lki[id]?.manaValue ?? 0) : o.faceDown ? 0 : manaValue(d?.manaCost),
      ];
    case "color":
      return v ? v.colors : (d?.colors ?? []);
    case "colorPair": {
      const colors = v ? v.colors : (d?.colors ?? []);
      return colors.length === 2 ? [[...colors].sort().join("")] : [];
    }
    case "cardType":
      return v ? v.types : (d?.types ?? []);
    case "permanentType":
      return (v ? v.types : (d?.types ?? [])).filter((t) => PERMANENT.has(t));
    case "subtype":
      return v ? v.subtypes : (d?.subtypes ?? []);
    case "basicLandType":
      return (v ? v.subtypes : (d?.subtypes ?? [])).filter((t) => (BASIC_LAND_TYPES as readonly string[]).includes(t));
    case "name":
      return [v ? (v.name ?? "") : (d?.name ?? "")];
    case "counterKind":
      return Object.entries(counters)
        .filter(([, n]) => n > 0)
        .map(([k]) => k);
    case "counters":
      return [Math.max(0, counters[counter ?? ""] ?? 0)];
  }
}

/** Objets d'un agrégat : désignés (`of`), d'une zone (`zone`, `whose`), ou du filtre sur le champ de bataille. */
function aggregateObjects(s: GameState, ctx: EffectContext, a: Extract<Amount, { kind: "aggregate" }>): ObjectId[] {
  if (a.of) {
    const ids = resolveRef(s, ctx, a.of);
    return a.filter ? ids.filter((id) => matchesCard(s, ctx.controller, id, a.filter as ObjectFilter, ctx.sourceId)) : ids;
  }
  const filter = a.filter ?? {};
  if (!a.zone) return s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, filter, ctx.sourceId));
  const zone = a.zone;
  const players =
    a.whose === "all" ? alivePlayers(s) : a.whose === "opponents" ? opponentsOf(s, ctx.controller) : [ctx.controller];
  return players
    .flatMap((p) => (zone === "exile" ? s.exile.filter((id) => s.objects[id]?.owner === p) : (s.players[p]?.[zone] ?? [])))
    .filter((id) => matchesCard(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId));
}

/** `Amount` `aggregate` : somme, plus grande valeur, valeurs différentes ou type de créature le plus partagé. */
function aggregate(s: GameState, ctx: EffectContext, a: Extract<Amount, { kind: "aggregate" }>): number {
  const ids = aggregateObjects(s, ctx, a);
  if (a.fn === "mostShared") {
    // Le plus grand nombre d'objets qui ont un type de créature en commun ; un changelin les a tous.
    const views = ids.map((id) => viewOf(s, id)).filter((v): v is LkiSnapshot => !!v);
    const changelings = views.filter((v) => v.keywords.includes("changeling")).length;
    const per = new Map<string, number>();
    for (const v of views) {
      if (v.keywords.includes("changeling")) continue;
      for (const t of new Set(v.subtypes)) per.set(t, (per.get(t) ?? 0) + 1);
    }
    return changelings + Math.max(0, ...per.values());
  }
  const values = ids.flatMap((id) => propertyValues(s, id, a.property, a.counter));
  if (a.fn === "distinct") return new Set(values).size;
  const numbers = values.map(Number);
  if (a.fn === "max") return Math.max(0, ...numbers);
  return numbers.reduce((n, x) => n + Math.max(0, x), 0);
}

/**
 * Ce qui a été dépensé pour lancer l'objet : le sort sur la pile (ou qui se résout), sinon le permanent qu'il est devenu.
 */
function spentOn(s: GameState, id: ObjectId, what: "x" | "mana" | "colors" | "cave"): number {
  switch (what) {
    case "x": {
      const item = s.resolving?.item.id === id ? s.resolving.item : s.stack.find((x) => x.id === id);
      return item?.x ?? s.objects[id]?.x ?? 0;
    }
    case "mana":
      return castInfoOf(s, id, true)?.manaSpent ?? 0;
    case "colors": {
      const spent = castInfoOf(s, id)?.spentColors ?? {};
      return (["W", "U", "B", "R", "G"] as const).filter((c) => (spent[c] ?? 0) > 0).length;
    }
    case "cave":
      return castInfoOf(s, id, true)?.caveMana ?? 0;
  }
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
    paid: { ...r.item.paid, bounced: r.item.cast?.costBounced },
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
  // Distorsion : lançable depuis l'exil à partir du tour suivant.
  if (moved && zone === "exile" && spec.warp) moved.warpExiledTurn = s.turn.number;
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

/**
 * Met une carte défaussée à sa place (701.9) : au cimetière, ou en exil si elle a la folie (702.35a) ; dans ce cas, une
 * capacité déclenchée « lancez-la pour son coût de folie, sinon mettez-la dans votre cimetière » est mise en attente.
 */
export function moveDiscarded(s: GameState, player: PlayerId, card: ObjectId): ObjectId | null {
  const d = s.defs[s.objects[card]?.defId ?? ""];
  if (!d?.madness) return moveObject(s, card, "graveyard");
  const exiled = moveObject(s, card, "exile");
  if (exiled) {
    const c: Ref = { kind: "target", id: "c" };
    pushInline(s, player, exiled, d.id, {
      targets: [],
      effects: [
        { op: "castNow", what: c, cost: d.madness },
        { op: "moveTo", what: c, spec: { to: "graveyard" } },
      ],
      bound: { c: [exiled] },
      label: "Folie : lancez-la pour son coût de folie, sinon elle va au cimetière",
    });
  }
  return exiled;
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
