/**
 * Primitives de manipulation de l'état : identifiants, hasard déterministe,
 * événements, zones et caractéristiques calculées (couches).
 */
import type {
  CardDef,
  CardType,
  Color,
  GameEvent,
  GameObject,
  GameState,
  Keyword,
  ManaType,
  ObjectId,
  PlayerId,
  Zone,
} from "./types";

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

export function opponentOf(s: GameState, p: PlayerId): PlayerId {
  const other = s.playerOrder.find((q) => q !== p);
  if (!other) throw new Error("Pas d'adversaire");
  return other;
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
  opts: { controller?: PlayerId; position?: "top" | "bottom" } = {},
): ObjectId | null {
  const o = obj(s, id);
  const from = zoneArray(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  delete s.objects[id];
  if (o.isToken && to !== "battlefield") return null;

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
  return moved.id;
}

// ---------------------------------------------------------------------------
// Caractéristiques calculées (système de couches simplifié : 6 et 7a–7c)
// ---------------------------------------------------------------------------

export interface Characteristics {
  name: string;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  toughness: number;
  keywords: Keyword[];
}

export function chars(s: GameState, id: ObjectId): Characteristics {
  const o = obj(s, id);
  const d = defOf(s, id);
  const keywords = new Set<Keyword>(d.keywords);
  let power = d.power ?? 0;
  let toughness = d.toughness ?? 0;
  if (o.zone === "battlefield") {
    // Couche 7c : marqueurs puis effets, dans l'ordre d'horodatage.
    power += o.counters.p1p1 - o.counters.m1m1;
    toughness += o.counters.p1p1 - o.counters.m1m1;
    for (const e of s.effects) {
      if (!e.affected.includes(id)) continue;
      for (const k of e.addKeywords) keywords.add(k); // couche 6
      power += e.power;
      toughness += e.toughness;
    }
  }
  return {
    name: d.name,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power,
    toughness,
    keywords: [...keywords],
  };
}

export function hasType(s: GameState, id: ObjectId, t: CardType): boolean {
  return defOf(s, id).types.includes(t);
}

export function hasKeyword(s: GameState, id: ObjectId, k: Keyword): boolean {
  return chars(s, id).keywords.includes(k);
}

export function isCreature(s: GameState, id: ObjectId): boolean {
  return hasType(s, id, "Creature");
}

/** Numéro du tour le plus récent de ce joueur en duel (0 s'il n'a pas encore joué). */
function mostRecentTurnOf(s: GameState, p: PlayerId): number {
  return s.turn.active === p ? s.turn.number : s.turn.number - 1;
}

/**
 * Mal d'invocation (302.6) : une créature ne peut attaquer ni utiliser {T} que si son contrôleur
 * la contrôle sans interruption depuis le début de son tour le plus récent.
 */
export function isSummoningSick(s: GameState, id: ObjectId): boolean {
  const o = obj(s, id);
  if (!isCreature(s, id) || hasKeyword(s, id, "haste")) return false;
  const recent = mostRecentTurnOf(s, o.controller);
  return !(recent >= 1 && o.controlledSince < recent);
}

export function creaturesControlledBy(s: GameState, p: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => obj(s, id).controller === p && isCreature(s, id));
}
