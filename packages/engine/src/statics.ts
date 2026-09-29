/**
 * Capacités statiques « globales » lues sur les permanents (et emblèmes) d'un joueur :
 * défense talismanique du joueur, « ne peut pas perdre », doublements, préventions…
 */
import { snapshot } from "./layers";
import { chars, newId, obj } from "./state";
import { matchesView } from "./targets";
import { checkCondition } from "./triggers";
import type {
  AbilityDef,
  DoublerAbilityDef,
  GameObject,
  GameState,
  ObjectId,
  PlayerEffect,
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

type PlayerStaticKey = keyof Omit<PlayerStaticAbilityDef, "kind" | "label" | "condition">;

/** Effets sur ce joueur encore en vigueur (créés par des résolutions, `s.playerEffects`). */
function liveEffects(s: GameState, player: PlayerId): PlayerEffect[] {
  return s.playerEffects.filter((e) => e.player === player && (e.until === null || s.turn.number <= e.until));
}

export function playerStatic(s: GameState, player: PlayerId, key: PlayerStaticKey): boolean {
  return (
    controlledAbilitiesWithSource(s, player).some(
      ({ id, ab }) => ab.kind === "playerStatic" && !!ab[key] && (!ab.condition || checkCondition(s, ab.condition, player, id)),
    ) || liveEffects(s, player).some((e) => !!e.ability[key])
  );
}

/** Somme d'une statique de joueur numérique (un booléen vaut 1) : capacités contrôlées et effets en vigueur. */
export function playerStaticTotal(s: GameState, player: PlayerId, key: PlayerStaticKey): number {
  const value = (ab: PlayerStaticAbilityDef) => {
    const v = ab[key];
    return typeof v === "number" ? v : v ? 1 : 0;
  };
  let n = 0;
  for (const { id, ab } of controlledAbilitiesWithSource(s, player))
    if (ab.kind === "playerStatic" && (!ab.condition || checkCondition(s, ab.condition, player, id))) n += value(ab);
  for (const e of liveEffects(s, player)) n += value(e.ability);
  return n;
}

/** Valeurs d'une statique de joueur portées par les effets en vigueur (« ne peut pas attaquer ce joueur »). */
export function playerEffectValues<K extends PlayerStaticKey>(
  s: GameState,
  player: PlayerId,
  key: K,
): NonNullable<PlayerStaticAbilityDef[K]>[] {
  return liveEffects(s, player)
    .map((e) => e.ability[key])
    .filter((v): v is NonNullable<PlayerStaticAbilityDef[K]> => v !== undefined && v !== null && v !== false);
}

/** Crée un effet sur un joueur jusqu'à la fin du tour `until` (null : toute la partie). */
export function addPlayerEffect(
  s: GameState,
  player: PlayerId,
  ability: Omit<PlayerStaticAbilityDef, "kind">,
  until: number | null,
  once = false,
): void {
  s.playerEffects.push({
    id: newId(s, "pe"),
    player,
    ability: { kind: "playerStatic", ...ability },
    until,
    once: once || undefined,
  });
  s.version += 1; // des caractéristiques peuvent en dépendre
}

/** Retire le premier effet à usage unique de ce joueur qui porte `key` ; true s'il y en avait un. */
export function consumePlayerEffect(s: GameState, player: PlayerId, key: PlayerStaticKey): boolean {
  const live = liveEffects(s, player).find((e) => e.once && !!e.ability[key]);
  if (!live) return false;
  s.playerEffects = s.playerEffects.filter((e) => e !== live);
  return true;
}

/** Nombre de doubleurs d'un type contrôlés par ce joueur (616.1 : ils se cumulent, ×2 chacun). */
export function doublers(
  s: GameState,
  player: PlayerId,
  key: keyof Omit<DoublerAbilityDef, "kind" | "label" | "countersFilter" | "condition">,
): number {
  return controlledAbilitiesWithSource(s, player).filter(({ ab }) => ab.kind === "doubler" && !!ab[key] && !ab.countersFilter)
    .length;
}

/** Nombre de jetons créés pour un : Doubling Season (×2) et Ojer Taq (×3, jetons de créature). */
export function tokenMultiplier(s: GameState, player: PlayerId, creature: boolean): number {
  return 2 ** doublers(s, player, "tokens") * (creature ? 3 ** doublers(s, player, "creatureTokensTriple") : 1);
}

/** Doublements de marqueurs sur ce permanent, filtrés compris (Loading Zone : créatures, Vaisseaux, Planètes). */
export function counterDoublers(s: GameState, o: GameObject): number {
  return controlledAbilitiesWithSource(s, o.controller).filter(
    ({ id, ab }) =>
      ab.kind === "doubler" &&
      !!ab.counters &&
      (!ab.countersFilter || matchesView(snapshot(s, o.id), ab.countersFilter, o.controller, id)),
  ).length;
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
