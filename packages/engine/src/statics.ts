import type { AmountMod } from "./modifiers";
import { alivePlayers, chars, commandZoneAbilities, newId, nextTimestamp, obj, opponentsOf, snapshot } from "./state";
import { matchesObjectFilter, matchesView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import type {
  AbilityDef,
  EventReplacement,
  GameState,
  ObjectId,
  PlayerEffect,
  PlayerId,
  PlayerStaticAbilityDef,
  PreventionAbilityDef,
} from "./types";

type Entry = { id: ObjectId; ab: AbilityDef };

/**
 * Index des capacités par contrôleur, recalculé seulement quand l'état change (même clé que le cache des couches) ; les
 * statiques de joueur y sont aussi rangées par clé, et les remplacements d'événement par sorte d'événement (PLAN-C, C15).
 */
interface Index {
  key: string;
  byPlayer: Map<PlayerId, Entry[]>;
  statics: Map<PlayerId, Map<string, Entry[]>>;
  replacements: Map<string, { p: PlayerId; e: Entry }[]>;
}
const cache = new WeakMap<GameState, Index>();

/** Copie de l'état : la copie reprend l'index de l'original, validé par sa clé (voir `carryLayerCache`). */
export function carryStaticsCache(from: GameState, to: GameState): void {
  const hit = cache.get(from);
  if (hit) cache.set(to, hit);
}
const NOT_KEYS = new Set(["kind", "label", "condition", "affects"]);

function current(s: GameState): Index {
  const key = `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit;
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
    // Zone de commandement : les emblèmes (un commandant qui attend d'être lancé n'a pas de capacité active, 113.6).
    for (const id of s.players[p]?.command ?? []) {
      for (const ab of commandZoneAbilities(s, id)) add(p, { id, ab });
    }
  }
  const statics = new Map<PlayerId, Map<string, Entry[]>>();
  const replacements = new Map<string, { p: PlayerId; e: Entry }[]>();
  // Statiques de joueur : rangées pour chaque joueur qu'elles concernent (son contrôleur, ses adversaires, ou tous).
  const keysOf = (p: PlayerId) => {
    let m = statics.get(p);
    if (!m) {
      m = new Map();
      statics.set(p, m);
    }
    return m;
  };
  for (const [p, list] of byPlayer) {
    keysOf(p);
    for (const e of list) {
      if (e.ab.kind === "playerStatic") {
        const affected = e.ab.affects === "each" ? alivePlayers(s) : e.ab.affects === "opponents" ? opponentsOf(s, p) : [p];
        for (const k of Object.keys(e.ab)) {
          if (NOT_KEYS.has(k) || !(e.ab as unknown as Record<string, unknown>)[k]) continue;
          for (const q of affected) {
            const byKey = keysOf(q);
            const l = byKey.get(k);
            if (l) l.push(e);
            else byKey.set(k, [e]);
          }
        }
      } else if (e.ab.kind === "eventReplacement") {
        const l = replacements.get(e.ab.event);
        if (l) l.push({ p, e });
        else replacements.set(e.ab.event, [{ p, e }]);
      }
    }
  }
  const out = { key, byPlayer, statics, replacements };
  cache.set(s, out);
  return out;
}

function index(s: GameState): Map<PlayerId, Entry[]> {
  return current(s).byPlayer;
}

/** Capacités des permanents (et emblèmes) que contrôle ce joueur, avec leur source. */
export function controlledAbilitiesWithSource(s: GameState, player: PlayerId): Entry[] {
  return index(s).get(player) ?? [];
}

export type PlayerStaticKey = keyof Omit<PlayerStaticAbilityDef, "kind" | "label" | "condition">;

/** Effets sur ce joueur encore en vigueur (créés par des résolutions, `s.playerEffects`). */
function liveEffects(s: GameState, player: PlayerId): PlayerEffect[] {
  return s.playerEffects.filter((e) => e.player === player && (e.until === null || s.turn.number <= e.until));
}

/**
 * Statiques de joueur en vigueur pour ce joueur : celles des permanents et emblèmes qu'il contrôle dont la condition est
 * remplie, puis les effets sur lui (`s.playerEffects`, sans source). Seul accès aux statiques de joueur : ne jamais
 * filtrer `controlledAbilitiesWithSource` sur `kind === "playerStatic"` à la main (condition et effets oubliés).
 */
export function playerStatics(
  s: GameState,
  player: PlayerId,
  /** Seulement celles qui portent cette clé ; la condition des autres n'est pas évaluée (une condition peut lire une statique). */
  key: PlayerStaticKey,
): { id?: ObjectId; ab: PlayerStaticAbilityDef; timestamp?: number }[] {
  const out: { id?: ObjectId; ab: PlayerStaticAbilityDef; timestamp?: number }[] = [];
  for (const { id, ab } of current(s).statics.get(player)?.get(key) ?? []) {
    // La condition se lit du point de vue du contrôleur de la source (`affects` : la statique touche d'autres joueurs).
    const controller = (id && s.objects[id]?.controller) || player;
    if (ab.kind === "playerStatic" && (!ab.condition || checkCondition(s, ab.condition, controller, id))) out.push({ id, ab });
  }
  for (const e of liveEffects(s, player)) if (e.ability[key]) out.push({ ab: e.ability, timestamp: e.timestamp });
  return out;
}

/** Un remplacement d'événement chiffré en vigueur : son contrôleur, sa source (capacité imprimée) ou son effet (bouclier). */
export interface ActiveReplacement {
  r: EventReplacement;
  controller: PlayerId;
  sourceId?: ObjectId;
  /** Effet de joueur qui le porte : un bouclier à usage unique (615.7) est retiré quand il s'applique. */
  effectId?: string;
  once?: boolean;
}

/**
 * Remplacements d'événements chiffrés en vigueur (R1) : capacités `eventReplacement` des permanents et emblèmes de chaque
 * joueur encore en partie (condition remplie), puis effets de joueur qui portent un `replacement`.
 */
export function eventReplacements(s: GameState, event: EventReplacement["event"]): ActiveReplacement[] {
  const out: ActiveReplacement[] = [];
  const printed = current(s).replacements.get(event) ?? [];
  for (const p of s.playerOrder) {
    if (s.players[p]?.lost) continue;
    for (const { p: q, e } of printed) {
      const { id, ab } = e;
      if (q === p && ab.kind === "eventReplacement" && (!ab.condition || checkCondition(s, ab.condition, p, id)))
        out.push({ r: ab, controller: p, sourceId: id });
    }
    for (const e of liveEffects(s, p)) {
      const r = e.ability.replacement;
      if (r?.event === event) out.push({ r, controller: p, effectId: e.id, once: e.once });
    }
  }
  return out;
}

/**
 * Le remplacement vise-t-il ce joueur ou ce permanent ? `to` est relatif au contrôleur du remplacement (le permanent
 * compte pour son contrôleur) ; `toFilter` : un permanent correspondant.
 */
export function recipientMatches(s: GameState, a: ActiveReplacement, target: string): boolean {
  const r = a.r;
  const player = !!s.players[target];
  const victim = player ? target : s.objects[target]?.controller;
  if (!victim) return false;
  if (r.toFilter && (player || !matchesObjectFilter(s, a.controller, target, r.toFilter, a.sourceId))) return false;
  switch (r.to) {
    case "you":
      return player && target === a.controller;
    case "yourSide":
      return victim === a.controller;
    case "opponent":
      return player && opponentsOf(s, a.controller).includes(target);
    case "opponentSide":
      return opponentsOf(s, a.controller).includes(victim);
    default:
      return true;
  }
}

/** Le joueur concerné par un remplacement, sans filtre de permanent (`to` vu du contrôleur du remplacement). */
export function playerSide(s: GameState, a: ActiveReplacement, player: PlayerId): boolean {
  switch (a.r.to) {
    case "you":
    case "yourSide":
      return player === a.controller;
    case "opponent":
    case "opponentSide":
      return opponentsOf(s, a.controller).includes(player);
    default:
      return true;
  }
}

/**
 * Modifications d'un événement chiffré (R1, 616.1) : les remplacements en vigueur qui s'appliquent (`applies`), en
 * « autant plus N » et « le double » ; `prevented` : l'un d'eux empêche l'événement (Mornsong Aria : « les joueurs ne
 * peuvent pas piocher »). Les boucliers à usage unique qui s'appliquent sont retirés.
 */
export function quantityMods(
  s: GameState,
  event: EventReplacement["event"],
  applies: (a: ActiveReplacement) => boolean,
): { mods: AmountMod[]; prevented: boolean } {
  const mods: AmountMod[] = [];
  let prevented = false;
  for (const a of eventReplacements(s, event)) {
    if (!applies(a)) continue;
    if (a.r.modify.prevent) prevented = true;
    if (a.r.modify.add) mods.push({ add: a.r.modify.add });
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
    consumeReplacement(s, a);
  }
  return { mods, prevented };
}

/** Retire un bouclier « la prochaine fois que » qui vient de s'appliquer (615.7). */
export function consumeReplacement(s: GameState, a: ActiveReplacement): void {
  if (!a.once || !a.effectId) return;
  s.playerEffects = s.playerEffects.filter((e) => e.id !== a.effectId);
  s.version += 1;
}

export function playerStatic(s: GameState, player: PlayerId, key: PlayerStaticKey): boolean {
  return playerStatics(s, player, key).length > 0;
}

/** Le joueur ne peut pas perdre de points de vie (« votre total de points de vie ne peut pas changer ») ? */
export function lifeLossPrevented(s: GameState, player: PlayerId): boolean {
  return eventReplacements(s, "lifeLoss").some((a) => a.r.modify.prevent && recipientMatches(s, a, player));
}

/**
 * Points de vie qu'un joueur peut payer (119.4) : son total, ou aucun s'il ne peut pas perdre de points de vie (119.8,
 * Teferi's Protection). Payer 0 PV reste toujours possible.
 */
export function payableLife(s: GameState, player: PlayerId): number {
  const life = s.players[player]?.life ?? 0;
  return lifeLossPrevented(s, player) ? Math.min(life, 0) : life;
}

/**
 * Le joueur a-t-il la protection contre une source contrôlée par `from` (702.16) ? Contre tout (702.16j), ou contre ses
 * adversaires (une source d'un autre joueur).
 */
export function playerProtectedFrom(
  s: GameState,
  player: PlayerId,
  from: PlayerId | undefined,
  /** La source (Serra's Emissary : protection contre le type de carte choisi). */
  sourceId?: ObjectId,
): boolean {
  return playerStatics(s, player, "protection").some(({ id, ab }) => {
    const p = ab.protection;
    if (p === "everything") return true;
    if (p === "opponents") return from !== player;
    if (!p || !sourceId) return false;
    const holder = id ? s.objects[id] : undefined;
    const v = s.objects[sourceId] ? snapshot(s, sourceId) : s.lki[sourceId];
    return !!v && matchesView(v, holder ? withChosen(p, holder) : p, player, id);
  });
}

/** Somme d'une statique de joueur numérique (un booléen vaut 1) : capacités contrôlées et effets en vigueur. */
export function playerStaticTotal(s: GameState, player: PlayerId, key: PlayerStaticKey): number {
  let n = 0;
  for (const { ab } of playerStatics(s, player, key)) {
    const v = ab[key];
    n += typeof v === "number" ? v : v ? 1 : 0;
  }
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
    timestamp: nextTimestamp(s),
  });
  s.version += 1; // des caractéristiques peuvent en dépendre
}

/** Retire le premier effet à usage unique de ce joueur qui porte `key` ; true s'il y en avait un. */
export function consumePlayerEffect(s: GameState, player: PlayerId, key: PlayerStaticKey): boolean {
  const live = liveEffects(s, player).find((e) => e.once && !!e.ability[key]);
  if (!live) return false;
  s.playerEffects = s.playerEffects.filter((e) => e !== live);
  // Des capacités statiques ou des F/E peuvent dépendre des effets du joueur (comme `consumeReplacement`).
  s.version += 1;
  return true;
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
