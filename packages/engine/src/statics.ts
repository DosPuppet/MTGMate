/**
 * Capacités statiques « globales » lues sur les permanents (et emblèmes) d'un joueur :
 * défense talismanique du joueur, « ne peut pas perdre », doublements, préventions…
 */
import { chars, obj } from "./state";
import type {
  AbilityDef,
  DoublerAbilityDef,
  GameState,
  ObjectId,
  PlayerId,
  PlayerStaticAbilityDef,
  PreventionAbilityDef,
} from "./types";

type Entry = { id: ObjectId; ab: AbilityDef };

/** Index des capacités par contrôleur, recalculé seulement quand l'état change (même clé que le cache des couches). */
const cache = new WeakMap<GameState, { key: string; byPlayer: Map<PlayerId, Entry[]> }>();

function index(s: GameState): Map<PlayerId, Entry[]> {
  const key = `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.byPlayer;
  const byPlayer = new Map<PlayerId, Entry[]>();
  const add = (p: PlayerId, e: Entry) => {
    const list = byPlayer.get(p);
    if (list) list.push(e);
    else byPlayer.set(p, [e]);
  };
  for (const id of s.battlefield) {
    const p = obj(s, id).controller;
    for (const ab of chars(s, id).abilities) add(p, { id, ab });
  }
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.command ?? []) {
      for (const ab of s.defs[obj(s, id).defId]?.abilities ?? []) add(p, { id, ab });
    }
  }
  cache.set(s, { key, byPlayer });
  return byPlayer;
}

/** Capacités des permanents (et emblèmes) que contrôle ce joueur, avec leur source. */
export function controlledAbilitiesWithSource(s: GameState, player: PlayerId): Entry[] {
  return index(s).get(player) ?? [];
}

export function playerStatic(s: GameState, player: PlayerId, key: keyof Omit<PlayerStaticAbilityDef, "kind" | "label">): boolean {
  return controlledAbilitiesWithSource(s, player).some(({ ab }) => ab.kind === "playerStatic" && !!ab[key]);
}

/** Nombre de doubleurs d'un type contrôlés par ce joueur (616.1 : ils se cumulent, ×2 chacun). */
export function doublers(s: GameState, player: PlayerId, key: keyof Omit<DoublerAbilityDef, "kind" | "label">): number {
  return controlledAbilitiesWithSource(s, player).filter(({ ab }) => ab.kind === "doubler" && !!ab[key]).length;
}

/** Préventions statiques des permanents de tous les joueurs, avec leur contrôleur et leur source. */
export function preventions(s: GameState): { controller: PlayerId; sourceId: ObjectId; ab: PreventionAbilityDef }[] {
  const out: { controller: PlayerId; sourceId: ObjectId; ab: PreventionAbilityDef }[] = [];
  for (const [controller, list] of index(s)) {
    for (const { id, ab } of list)
      if (ab.kind === "prevention" && s.objects[id]?.zone === "battlefield") out.push({ controller, sourceId: id, ab });
  }
  return out;
}
