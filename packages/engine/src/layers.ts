/**
 * Système de couches (613) : caractéristiques calculées des objets.
 *
 * Toutes les caractéristiques du champ de bataille sont calculées en une passe, couche par couche,
 * les effets de chaque couche étant appliqués par ordre d'horodatage :
 *   4 types · 5 couleurs · 6 capacités · 7b F/E fixées · 7c modifications et marqueurs · 7d échange.
 * Les effets viennent de deux sources : les effets continus issus de résolutions (s.effects, ensemble
 * d'objets verrouillé) et les capacités statiques des permanents (ensemble réévalué à chaque calcul).
 *
 * Le résultat est mis en cache par état et par `s.version`, que le moteur incrémente à chaque changement
 * pouvant affecter les caractéristiques (voir `bump`). Le fuzz vérifie que le cache ne diverge jamais.
 * Limites actuelles : pas de couche 1 (copie) ni 2 (changement de contrôle), pas de dépendances (613.8).
 */
import { manaValue } from "./mana";
import { counterPT, obj } from "./state";
import { ALL_CREATURE_TYPES, matchesView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import type {
  AbilityDef,
  Amount,
  CardType,
  Color,
  GameObject,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
} from "./types";

export interface Characteristics {
  name: string;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  toughness: number;
  keywords: Keyword[];
  /** Capacités non-mot-clé effectives (vides si l'objet a perdu toutes ses capacités). */
  abilities: AbilityDef[];
  controller: PlayerId;
}

/** Invalide le cache des caractéristiques. */
export function bump(s: GameState): void {
  s.version += 1;
}

/** 604.3 / 613.4a : F/E définies par une capacité (« égales au nombre de cartes dans les cimetières adverses »). */
function cdaValue(s: GameState, o: GameObject, a: Amount): number {
  if (typeof a === "number") return a;
  if (a.kind !== "count") return 0;
  if (!a.zone || a.zone === "battlefield") {
    // « égales au nombre de créatures que vous contrôlez » (types imprimés : pas de récursion dans les couches).
    const types = a.filter.types;
    return s.battlefield.filter((id) => {
      const x = obj(s, id);
      if (a.filter.controller === "you" && x.controller !== o.controller) return false;
      return !types || types.some((t) => s.defs[x.defId]?.types.includes(t));
    }).length;
  }
  const zone = a.zone;
  const players =
    a.whose === "all"
      ? s.playerOrder
      : a.whose === "opponents"
        ? s.playerOrder.filter((p) => p !== o.controller)
        : [o.controller];
  const types = a.filter.types;
  return players
    .filter((p) => !s.players[p]?.lost)
    .flatMap((p) => s.players[p]?.[zone] ?? [])
    .filter((id) => !types || types.some((t) => s.defs[obj(s, id).defId]?.types.includes(t))).length;
}

function base(s: GameState, o: GameObject): Characteristics {
  const d = s.defs[o.defId];
  if (!d) throw new Error(`Définition inconnue : ${o.defId}`);
  const cda = d.cdaPT === undefined ? undefined : cdaValue(s, o, d.cdaPT);
  const cdaPower = d.cdaPower === undefined ? undefined : cdaValue(s, o, d.cdaPower);
  return {
    name: d.name,
    types: [...d.types],
    subtypes: [...d.subtypes],
    supertypes: [...d.supertypes],
    colors: [...d.colors],
    power: cdaPower ?? cda ?? d.power ?? 0,
    toughness: cda ?? d.toughness ?? 0,
    keywords: [...d.keywords],
    abilities: d.abilities,
    controller: o.controller,
  };
}

interface Applied {
  timestamp: number;
  mods: LayerMods;
  /** Objets concernés : fixés (résolution) ou déterminés au moment de la couche (statique). */
  affected: ObjectId[] | { sourceId: ObjectId; controller: PlayerId; filter: "self" | "attached" | ObjectFilter };
}

const cache = new WeakMap<GameState, { key: string; map: Map<ObjectId, Characteristics> }>();
let computing = false;

function view(s: GameState, id: ObjectId, c: Characteristics, o: GameObject, attacking: boolean): LkiSnapshot {
  return {
    id,
    defId: o.defId,
    owner: o.owner,
    controller: c.controller,
    types: c.types,
    subtypes: c.subtypes,
    supertypes: c.supertypes,
    colors: c.colors,
    power: c.power,
    toughness: c.toughness,
    keywords: c.keywords,
    isToken: o.isToken,
    attacking,
    name: c.name,
    manaValue: manaValue(s.defs[o.defId]?.manaCost),
    tapped: o.tapped,
    uid: o.uid,
    linked: o.linked,
    damagedBy: o.damagedBy,
    attachedTo: o.attachedTo,
    blocking: !!s.combat?.blockers.some((b) => b.id === id),
    counters: o.counters,
  };
}

/** Vue d'un objet à partir de ses caractéristiques imprimées (pendant le calcul des couches). */
function snapshotBase(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  return view(s, id, base(s, o), o, false);
}

/** Calcule, sans cache, les caractéristiques de tous les objets du champ de bataille. */
export function computeBattlefield(s: GameState): Map<ObjectId, Characteristics> {
  const out = new Map<ObjectId, Characteristics>();
  const attacking = new Set(s.combat?.attackers.map((a) => a.id) ?? []);
  for (const id of s.battlefield) out.set(id, base(s, obj(s, id)));

  const applied: Applied[] = s.effects.map((e) => ({ timestamp: e.timestamp, mods: e, affected: e.affected }));
  // Capacités statiques des permanents. Une source qui perd toutes ses capacités (Witness Protection,
  // effet « perd toutes ses capacités ») n'applique plus les siennes ; approximation de 613.8 à un niveau.
  const lost = new Set<ObjectId>();
  for (const e of s.effects) if (e.loseAllAbilities) for (const id of e.affected) lost.add(id);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!o.attachedTo) continue;
    for (const ab of s.defs[o.defId]?.abilities ?? []) {
      if (ab.kind === "static" && ab.affects === "attached" && ab.mods.loseAllAbilities) lost.add(o.attachedTo);
    }
  }
  const prev = computing;
  computing = true;
  // Sources de capacités statiques : permanents, puis emblèmes (zone de commandement).
  const emblems = s.playerOrder.flatMap((p) => s.players[p]?.command ?? []);
  try {
    for (const id of [...s.battlefield, ...emblems]) {
      if (lost.has(id)) continue;
      const o = obj(s, id);
      for (const ab of s.defs[o.defId]?.abilities ?? []) {
        if (ab.kind !== "static") continue;
        if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) continue;
        let mods = ab.mods;
        if (ab.per || ab.perCounter) {
          // « +1/+1 pour chaque Forêt » / « pour chaque marqueur de camaraderie sur cet artefact ».
          const f = ab.per ? withChosen(ab.per, o) : null;
          const n = f
            ? s.battlefield.filter((x) => matchesView(snapshotBase(s, x), f, o.controller, id)).length
            : (o.counters[ab.perCounter as string] ?? 0);
          mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
        }
        const affects = typeof ab.affects === "string" ? ab.affects : withChosen(ab.affects, o);
        if (mods.addChosenSubtype && o.chosen?.creatureType) {
          mods = { ...mods, addSubtypes: [...(mods.addSubtypes ?? []), o.chosen.creatureType] };
        }
        applied.push({
          timestamp: o.timestamp,
          mods,
          affected: { sourceId: id, controller: o.controller, filter: affects },
        });
      }
    }
  } finally {
    computing = prev;
  }
  applied.sort((a, b) => a.timestamp - b.timestamp);

  const targets = (a: Applied): ObjectId[] => {
    if (Array.isArray(a.affected)) return a.affected.filter((id) => out.has(id));
    const { sourceId, controller, filter } = a.affected;
    if (filter === "self") return out.has(sourceId) ? [sourceId] : [];
    if (filter === "attached") {
      const host = obj(s, sourceId).attachedTo;
      return host && out.has(host) ? [host] : [];
    }
    const ids: ObjectId[] = [];
    for (const [id, c] of out) {
      if (matchesView(view(s, id, c, obj(s, id), attacking.has(id)), filter, controller, sourceId)) ids.push(id);
    }
    return ids;
  };
  // Les ensembles des capacités statiques sont déterminés au moment où leur couche s'applique (613.6) :
  // on les fige à la première couche où l'effet agit.
  const fixed = new Map<Applied, ObjectId[]>();
  const affectedBy = (a: Applied) => {
    let ids = fixed.get(a);
    if (!ids) {
      ids = targets(a);
      fixed.set(a, ids);
    }
    return ids;
  };
  const layer = (has: (m: LayerMods) => boolean, apply: (c: Characteristics, m: LayerMods) => void) => {
    for (const a of applied) if (has(a.mods)) for (const id of affectedBy(a)) apply(out.get(id) as Characteristics, a.mods);
  };

  // Couche 4 : types (et nom, pour Witness Protection).
  layer(
    (m) => !!(m.addTypes || m.addSubtypes || m.setTypes || m.setSubtypes || m.setName || m.allCreatureTypes),
    (c, m) => {
      if (m.setTypes) {
        c.types = [...m.setTypes];
        c.subtypes = [...(m.setSubtypes ?? [])];
      } else if (m.setSubtypes) c.subtypes = [...m.setSubtypes];
      if (m.setName) c.name = m.setName;
      if (m.allCreatureTypes && !c.subtypes.includes(ALL_CREATURE_TYPES)) c.subtypes.push(ALL_CREATURE_TYPES);
      for (const t of m.addTypes ?? []) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.addSubtypes ?? []) if (!c.subtypes.includes(t)) c.subtypes.push(t);
    },
  );
  // Couche 5 : couleurs.
  layer(
    (m) => !!m.setColors,
    (c, m) => {
      c.colors = [...(m.setColors ?? [])];
    },
  );
  // Couche 6 : capacités.
  layer(
    (m) => !!(m.addKeywords?.length || m.removeKeywords?.length || m.loseAllAbilities || m.addAbilities?.length),
    (c, m) => {
      if (m.loseAllAbilities) {
        c.keywords = [];
        c.abilities = [];
      }
      for (const k of m.removeKeywords ?? []) c.keywords = c.keywords.filter((x) => x !== k);
      for (const k of m.addKeywords ?? []) if (!c.keywords.includes(k)) c.keywords.push(k);
      if (m.addAbilities?.length) c.abilities = [...c.abilities, ...m.addAbilities];
    },
  );
  // Couche 7b : F/E fixées.
  layer(
    (m) => m.setPower !== undefined || m.setToughness !== undefined,
    (c, m) => {
      if (m.setPower !== undefined) c.power = m.setPower;
      if (m.setToughness !== undefined) c.toughness = m.setToughness;
    },
  );
  // Couche 7c : marqueurs, puis modifications (tout est additif : l'ordre n'importe pas).
  for (const [id, c] of out) {
    const o = obj(s, id);
    c.power += counterPT(o);
    c.toughness += counterPT(o);
  }
  layer(
    (m) => !!(m.power || m.toughness),
    (c, m) => {
      c.power += m.power ?? 0;
      c.toughness += m.toughness ?? 0;
    },
  );
  // Couche 7d : échange.
  layer(
    (m) => !!m.switchPT,
    (c) => {
      [c.power, c.toughness] = [c.toughness, c.power];
    },
  );
  return out;
}

function battlefieldChars(s: GameState): Map<ObjectId, Characteristics> {
  const key = `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.map;
  const map = computeBattlefield(s);
  cache.set(s, { key, map });
  return map;
}

export function chars(s: GameState, id: ObjectId): Characteristics {
  const o = obj(s, id);
  // Pendant le calcul (conditions des capacités statiques), on lit les caractéristiques de base.
  if (o.zone !== "battlefield" || computing) return base(s, o);
  return battlefieldChars(s).get(id) ?? base(s, o);
}

export function hasType(s: GameState, id: ObjectId, t: CardType): boolean {
  return chars(s, id).types.includes(t);
}

export function hasKeyword(s: GameState, id: ObjectId, k: Keyword): boolean {
  return chars(s, id).keywords.includes(k);
}

export function isCreature(s: GameState, id: ObjectId): boolean {
  return hasType(s, id, "Creature");
}

/**
 * Mal d'invocation (302.6) : une créature ne peut attaquer ni utiliser {T} que si son contrôleur
 * la contrôle sans interruption depuis le début de son tour le plus récent.
 */
export function isSummoningSick(s: GameState, id: ObjectId): boolean {
  const o = obj(s, id);
  if (!isCreature(s, id) || hasKeyword(s, id, "haste")) return false;
  const recent = s.players[o.controller]?.lastTurnStarted ?? 0;
  return !(recent >= 1 && o.controlledSince < recent);
}

export function creaturesControlledBy(s: GameState, p: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => obj(s, id).controller === p && isCreature(s, id));
}

/** Instantané des caractéristiques actuelles d'un objet (dernières informations connues). */
export function snapshot(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  const c = chars(s, id);
  return {
    ...view(s, id, c, o, !!s.combat?.attackers.some((a) => a.id === id)),
    abilities: c.abilities,
    counters: { ...o.counters },
  };
}
