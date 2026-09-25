/**
 * Primitives de manipulation de l'état : identifiants, hasard déterministe,
 * événements, zones et caractéristiques calculées (couches).
 */
import type { CardDef, GameEvent, GameObject, GameState, LkiSnapshot, ManaType, ObjectId, PlayerId, Step, Zone } from "./types";

// ---------------------------------------------------------------------------
// Événements : le moteur est synchrone, un collecteur global suffit.
// ---------------------------------------------------------------------------

let sink: GameEvent[] | null = null;

export function collectEvents<T>(fn: () => T): [T, GameEvent[]] {
  const previous = sink;
  const events: GameEvent[] = [];
  sink = events;
  try {
    return [fn(), events];
  } finally {
    sink = previous;
  }
}

export function emit(event: GameEvent): void {
  sink?.push(event);
}

// ---------------------------------------------------------------------------
// Événements de règles : écoutés par le module des déclencheurs (triggers.ts).
// Distincts des GameEvent, qui ne servent qu'à l'affichage.
// ---------------------------------------------------------------------------

export type RulesEvent =
  | {
      e: "zone";
      oldId: ObjectId | null;
      newId: ObjectId | null;
      from: Zone | null;
      to: Zone;
      /** Caractéristiques au moment du départ du champ de bataille. */
      lki: LkiSnapshot | null;
    }
  | { e: "cast"; player: PlayerId; stackId: ObjectId }
  | { e: "attack"; attacker: ObjectId; defender: PlayerId }
  | { e: "damage"; sourceId: ObjectId | null; target: string; amount: number; combat: boolean }
  | { e: "step"; step: Step; active: PlayerId }
  | { e: "lifeGain"; player: PlayerId; amount: number };

/** Signale un événement de règles : les capacités déclenchées correspondantes sont mises en attente. */
export function rulesEvent(s: GameState, ev: RulesEvent): void {
  detectTriggers(s, ev);
}

// ---------------------------------------------------------------------------
// Copie de l'état : le moteur mute une copie, les états déjà renvoyés ne changent jamais.
// ---------------------------------------------------------------------------

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = deepClone((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Copie profonde de l'état, sauf les définitions de cartes (immuables, partagées).
 * Beaucoup plus rapide qu'Immer pour notre usage (simulations de l'IA) : voir tools/bench.ts.
 */
export function cloneState(s: GameState): GameState {
  const { defs, ...rest } = s;
  const copy = deepClone(rest) as GameState;
  copy.defs = { ...defs };
  return copy;
}

// ---------------------------------------------------------------------------
// Identifiants, horodatages, hasard (mulberry32, état stocké dans la partie)
// ---------------------------------------------------------------------------

export function newId(s: GameState, prefix = "o"): string {
  return `${prefix}${s.nextId++}`;
}

export function nextTimestamp(s: GameState): number {
  s.timestamp += 1;
  return s.timestamp;
}

export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

export function emptyPool(): Record<ManaType, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export function obj(s: GameState, id: ObjectId): GameObject {
  const o = s.objects[id];
  if (!o) throw new Error(`Objet inconnu : ${id}`);
  return o;
}

export function defOf(s: GameState, id: ObjectId): CardDef {
  const d = s.defs[obj(s, id).defId];
  if (!d) throw new Error(`Définition inconnue pour ${id}`);
  return d;
}

export function isPlayer(s: GameState, id: string): boolean {
  return id in s.players;
}

// ---------------------------------------------------------------------------
// Joueurs (N joueurs : duel, multijoueur, Commander)
// ---------------------------------------------------------------------------

export function isAlive(s: GameState, p: PlayerId): boolean {
  return !!s.players[p] && !s.players[p]?.lost;
}

export function alivePlayers(s: GameState): PlayerId[] {
  return s.playerOrder.filter((p) => isAlive(s, p));
}

/** Adversaires encore en jeu, dans l'ordre du tour à partir du joueur suivant. */
export function opponentsOf(s: GameState, p: PlayerId): PlayerId[] {
  const i = s.playerOrder.indexOf(p);
  const rotated = [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
  return rotated.filter((q) => q !== p && isAlive(s, q));
}

/** Prochain joueur en jeu dans l'ordre du tour (le joueur lui-même s'il est seul). */
export function nextPlayer(s: GameState, p: PlayerId): PlayerId {
  return opponentsOf(s, p)[0] ?? p;
}

/** Ordre APNAP (101.4) : joueur actif d'abord, puis les autres dans l'ordre du tour. */
export function apnapOrder(s: GameState): PlayerId[] {
  const active = s.turn.active;
  return [...(isAlive(s, active) ? [active] : []), ...opponentsOf(s, active)];
}

export function onBattlefield(s: GameState, id: ObjectId): boolean {
  return s.objects[id]?.zone === "battlefield";
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function zoneArray(s: GameState, o: GameObject): ObjectId[] | null {
  switch (o.zone) {
    case "battlefield":
      return s.battlefield;
    case "exile":
      return s.exile;
    case "stack":
      return null; // géré par s.stack
    default:
      return s.players[o.owner]?.[o.zone] ?? null;
  }
}

export function createObject(
  s: GameState,
  defId: string,
  owner: PlayerId,
  zone: Zone,
  opts: { uid?: string; isToken?: boolean; controller?: PlayerId } = {},
): GameObject {
  const id = newId(s);
  bump(s);
  const o: GameObject = {
    id,
    uid: opts.uid ?? `c${id}`,
    defId,
    owner,
    controller: opts.controller ?? owner,
    zone,
    tapped: false,
    damage: 0,
    deathtouched: false,
    counters: { p1p1: 0, m1m1: 0 },
    controlledSince: s.turn.number,
    timestamp: nextTimestamp(s),
    isToken: opts.isToken ?? false,
  };
  s.objects[id] = o;
  const arr = zoneArray(s, o);
  arr?.push(id);
  return o;
}

/**
 * Déplace un objet vers une autre zone. L'objet devient un nouvel objet (400.7) :
 * on renvoie son nouvel identifiant, ou null s'il cesse d'exister (jeton quittant le champ de bataille).
 */
export function moveObject(
  s: GameState,
  id: ObjectId,
  to: Zone,
  opts: { controller?: PlayerId; position?: "top" | "bottom"; enters?: EntersContext } = {},
): ObjectId | null {
  const o = obj(s, id);
  to = replaceDestination(s, o, to);
  const from = zoneArray(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  const lki = o.zone === "battlefield" ? snapshot(s, id) : null;
  if (lki) {
    s.lki[id] = lki;
    if (to === "graveyard" && lki.types.includes("Creature")) s.turn.creatureDied = true;
  }
  const from0 = o.zone;
  delete s.objects[id];
  if (o.isToken && to !== "battlefield") {
    bump(s);
    // Un jeton qui quitte le champ de bataille cesse d'exister, mais il « meurt » bien (déclencheurs).
    rulesEvent(s, { e: "zone", oldId: id, newId: null, from: from0, to, lki });
    return null;
  }

  const moved = createObject(s, o.defId, o.owner, to, {
    uid: o.uid,
    isToken: o.isToken,
    controller: to === "battlefield" || to === "stack" ? (opts.controller ?? o.controller) : o.owner,
  });
  if (to === "library" && opts.position !== "bottom") {
    const lib = s.players[o.owner]?.library;
    if (lib) {
      lib.pop();
      lib.unshift(moved.id);
    }
  }
  if (to === "battlefield") applyEntersReplacements(s, moved, opts.enters ?? {});
  rulesEvent(s, { e: "zone", oldId: id, newId: moved.id, from: from0, to, lki });
  return moved.id;
}

// ---------------------------------------------------------------------------
// Caractéristiques calculées : voir layers.ts (réexportées ici pour commodité).
// ---------------------------------------------------------------------------

import { bump, snapshot } from "./layers";
import { applyEntersReplacements, type EntersContext, replaceDestination } from "./replacement";
import { detectTriggers } from "./triggers";

export {
  bump,
  type Characteristics,
  chars,
  creaturesControlledBy,
  hasKeyword,
  hasType,
  isCreature,
  isSummoningSick,
  snapshot,
} from "./layers";
