/**
 * Légalité des cibles (règle 115).
 */
import { chars, hasKeyword, snapshot } from "./layers";
import { obj } from "./state";
import type { CardType, GameState, LkiSnapshot, ObjectFilter, ObjectId, PlayerId, TargetSpec } from "./types";

const PERMANENT_TYPES: readonly CardType[] = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];

/** Le filtre s'applique-t-il à ces caractéristiques (objet vivant ou dernières informations connues) ? */
export function matchesView(v: LkiSnapshot, f: ObjectFilter, perspective: PlayerId, sourceId?: ObjectId): boolean {
  if (f.types && !f.types.some((t) => v.types.includes(t))) return false;
  if (f.notTypes?.some((t) => v.types.includes(t))) return false;
  if (f.subtype && !v.subtypes.includes(f.subtype)) return false;
  if (f.controller === "you" && v.controller !== perspective) return false;
  if (f.controller === "opponent" && v.controller === perspective) return false;
  if (f.keyword && !v.keywords.includes(f.keyword)) return false;
  if (f.notKeyword && v.keywords.includes(f.notKeyword)) return false;
  if (f.other && v.id === sourceId) return false;
  if (f.self && v.id !== sourceId) return false;
  if (f.nontoken && v.isToken) return false;
  if (f.minPower !== undefined && v.power < f.minPower) return false;
  if (f.attacking !== undefined && !!v.attacking !== f.attacking) return false;
  if (f.maxManaValue !== undefined && (v.manaValue ?? 0) > f.maxManaValue) return false;
  if (f.manaValue !== undefined && (v.manaValue ?? 0) !== f.manaValue) return false;
  if (f.name && v.name !== f.name) return false;
  if (f.tapped !== undefined && !!v.tapped !== f.tapped) return false;
  if (f.colors && !f.colors.some((c) => v.colors.includes(c))) return false;
  if (f.withCounter && !((v.counters?.[f.withCounter] ?? 0) > 0)) return false;
  if (f.inCombat && !v.attacking && !v.blocking) return false;
  if (f.anySubtype && !f.anySubtype.some((t) => v.subtypes.includes(t))) return false;
  if (f.notSubtype && v.subtypes.includes(f.notSubtype)) return false;
  if (f.minManaValue !== undefined && (v.manaValue ?? 0) < f.minManaValue) return false;
  if (f.maxPower !== undefined && v.power > f.maxPower) return false;
  if (f.basic && !v.supertypes.includes("Basic")) return false;
  if (f.permanent && !v.types.some((t) => PERMANENT_TYPES.includes(t))) return false;
  if (f.nonland && v.types.includes("Land")) return false;
  if (f.anyOf && !f.anyOf.some((g) => matchesView(v, g, perspective, sourceId))) return false;
  return true;
}

/** Force de la source (vivante, sinon dernière information connue). */
function sourcePower(s: GameState, sourceId?: ObjectId): number {
  if (!sourceId) return 0;
  if (s.objects[sourceId]?.zone === "battlefield") return chars(s, sourceId).power;
  return s.lki[sourceId]?.power ?? 0;
}

/** Remplace les bornes dynamiques du filtre par leur valeur actuelle. */
function resolveFilter(s: GameState, f: ObjectFilter, sourceId?: ObjectId): ObjectFilter {
  if (!f.maxManaValueSourcePower) return f;
  return { ...f, maxManaValueSourcePower: undefined, maxManaValue: sourcePower(s, sourceId) };
}

/** Filtre appliqué à une carte dans n'importe quelle zone (cimetière, bibliothèque, main…). */
export function matchesCard(s: GameState, controller: PlayerId, id: ObjectId, f: ObjectFilter, sourceId?: ObjectId): boolean {
  const o = s.objects[id];
  if (!o) return false;
  f = resolveFilter(s, f, sourceId);
  return (
    matchesView(snapshot(s, id), { ...f, controller: undefined }, controller, sourceId) &&
    (f.controller === undefined || (f.controller === "you" ? o.owner === controller : o.owner !== controller))
  );
}

export function matchesObjectFilter(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  f: ObjectFilter,
  sourceId?: ObjectId,
): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  return matchesView(snapshot(s, id), resolveFilter(s, f, sourceId), controller, sourceId);
}

export function isLegalTarget(s: GameState, controller: PlayerId, spec: TargetSpec, id: string, sourceId?: ObjectId): boolean {
  const player = s.players[id];
  if (player) {
    if (player.lost || !spec.filter.players) return false;
    if (spec.filter.players === "you") return id === controller;
    if (spec.filter.players === "opponent") return id !== controller;
    return true;
  }
  const o = s.objects[id];
  if (o && o.zone === "stack") {
    // Sort sur la pile (l'identifiant de l'objet est celui de l'élément de pile).
    const f = spec.filter.spells;
    return !!f && s.stack.some((x) => x.id === id && x.kind === "spell") && matchesView(snapshot(s, id), f, controller, sourceId);
  }
  if (o && o.zone === "graveyard") {
    const cards = spec.filter.cards;
    if (!cards) return false;
    if (cards.whose === "you" && o.owner !== controller) return false;
    if (cards.whose === "opponent" && o.owner === controller) return false;
    return matchesCard(s, controller, id, { ...cards.filter, controller: undefined }, sourceId);
  }
  if (!spec.filter.objects || !matchesObjectFilter(s, controller, id, spec.filter.objects, sourceId)) return false;
  // Défense talismanique : ne peut pas être la cible de sorts ou capacités adverses.
  if (obj(s, id).controller !== controller && hasKeyword(s, id, "hexproof")) return false;
  return true;
}

export function legalTargets(s: GameState, controller: PlayerId, spec: TargetSpec, sourceId?: ObjectId): string[] {
  const out: string[] = [];
  const ok = (id: string) => isLegalTarget(s, controller, spec, id, sourceId);
  if (spec.filter.players) for (const p of s.playerOrder) if (ok(p)) out.push(p);
  if (spec.filter.objects) for (const id of s.battlefield) if (ok(id)) out.push(id);
  if (spec.filter.cards) for (const p of s.playerOrder) for (const id of s.players[p]?.graveyard ?? []) if (ok(id)) out.push(id);
  if (spec.filter.spells)
    for (const item of s.stack) if (item.kind === "spell" && item.id !== sourceId && ok(item.id)) out.push(item.id);
  return out;
}

/** Vérifie un choix de cibles complet pour une liste de spécifications. */
export function validateTargets(
  s: GameState,
  controller: PlayerId,
  specs: TargetSpec[],
  chosen: Record<string, string[]> = {},
  opts: { kicked?: boolean; sourceId?: ObjectId } = {},
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const spec of specs) {
    const ids = chosen[spec.id] ?? [];
    const max = (opts.kicked && spec.kickedCount) || spec.count || 1;
    for (const other of spec.otherThan ?? []) {
      if (ids.some((id) => (chosen[other] ?? []).includes(id))) throw new Error("Ces cibles doivent être différentes");
    }
    if (ids.length > max) throw new Error(max === 1 ? "Une seule cible par mot « cible »" : `${max} cibles au maximum`);
    if (new Set(ids).size !== ids.length) throw new Error("Même cible choisie deux fois");
    if (ids.length === 0 && !spec.optional) throw new Error(`Cible manquante : ${spec.label ?? spec.id}`);
    if (!spec.optional && !spec.kickedCount && ids.length < max) throw new Error(`${max} cibles requises`);
    for (const id of ids) if (!isLegalTarget(s, controller, spec, id, opts.sourceId)) throw new Error(`Cible illégale : ${id}`);
    const holders = ids.map((id) => s.objects[id]?.[s.objects[id]?.zone === "battlefield" ? "controller" : "owner"] ?? id);
    if (spec.samePlayer && new Set(holders).size > 1) throw new Error("Les cibles doivent appartenir au même joueur");
    if (spec.differentPlayers && new Set(holders).size !== holders.length)
      throw new Error("Les cibles doivent être contrôlées par des joueurs différents");
    result[spec.id] = ids;
  }
  return result;
}
