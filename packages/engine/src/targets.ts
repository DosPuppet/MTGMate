/**
 * Légalité des cibles (règle 115).
 */
import { RulesError } from "./errors";
import { chars, hasKeyword, snapshot } from "./layers";
import { obj } from "./state";
import { playerStatic } from "./statics";
import type { CardType, Color, GameState, LkiSnapshot, ObjectFilter, ObjectId, PlayerId, TargetSpec } from "./types";

const PERMANENT_TYPES: readonly CardType[] = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];

/** Le filtre s'applique-t-il à ces caractéristiques (objet vivant ou dernières informations connues) ? */
export function matchesView(v: LkiSnapshot, f: ObjectFilter, perspective: PlayerId, sourceId?: ObjectId): boolean {
  if (f.types && !f.types.some((t) => v.types.includes(t))) return false;
  if (f.notTypes?.some((t) => v.types.includes(t))) return false;
  if (f.subtype && !hasSubtype(v, f.subtype)) return false;
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
  if (f.anySubtype && !f.anySubtype.some((t) => hasSubtype(v, t))) return false;
  if (f.notSubtype && hasSubtype(v, f.notSubtype)) return false;
  if (f.token !== undefined && v.isToken !== f.token) return false;
  if (f.minToughness !== undefined && v.toughness < f.minToughness) return false;
  if (f.nonbasic && v.supertypes.includes("Basic")) return false;
  if (f.damagedBySource && !(sourceId && v.damagedBy?.includes(sourceId))) return false;
  if (f.minManaValue !== undefined && (v.manaValue ?? 0) < f.minManaValue) return false;
  if (f.maxPower !== undefined && v.power > f.maxPower) return false;
  if (f.basic && !v.supertypes.includes("Basic")) return false;
  if (f.permanent && !v.types.some((t) => PERMANENT_TYPES.includes(t))) return false;
  if (f.nonland && v.types.includes("Land")) return false;
  if (f.anyOf && !f.anyOf.some((g) => matchesView(v, g, perspective, sourceId))) return false;
  if (f.legendary !== undefined && v.supertypes.includes("Legendary") !== f.legendary) return false;
  if (f.maxToughness !== undefined && v.toughness > f.maxToughness) return false;
  return true;
}

/** Marqueur de sous-type : « a tous les types de créature » (Soulstone Sanctuary). */
export const ALL_CREATURE_TYPES = "*";

/** Sous-types qui ne sont pas des types de créature (terrains, artefacts, enchantements). */
const NON_CREATURE_SUBTYPES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Equipment",
  "Aura",
  "Treasure",
  "Food",
  "Clue",
  "Saga",
  "Vehicle",
]);

function hasSubtype(v: LkiSnapshot, t: string): boolean {
  if (v.subtypes.includes(t)) return true;
  // Changelin : tous les types de créature, dans toutes les zones (702.73a).
  if (v.keywords.includes("changeling") && !NON_CREATURE_SUBTYPES.has(t)) return true;
  return v.subtypes.includes(ALL_CREATURE_TYPES) && v.types.includes("Creature") && !NON_CREATURE_SUBTYPES.has(t);
}

/** Remplace « du type / de la couleur choisis » par le choix fait par la source en arrivant. */
export function withChosen(
  f: ObjectFilter,
  source: { chosen?: { creatureType?: string; color?: Color } } | undefined,
): ObjectFilter {
  if (!f.subtypeChosen && !f.colorChosen) return f;
  const out: ObjectFilter = { ...f, subtypeChosen: undefined, colorChosen: undefined };
  // Sans choix (arrivée sans résolution), rien ne correspond.
  if (f.subtypeChosen) out.subtype = source?.chosen?.creatureType ?? "—";
  if (f.colorChosen) out.colors = source?.chosen?.color ? [source.chosen.color] : [];
  return out;
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
  // « mise dans un cimetière ce tour-ci » : l'objet a été créé dans sa zone pendant ce tour.
  if (f.enteredThisTurn && o.controlledSince !== s.turn.number) return false;
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
    // « Vous avez la défense talismanique » (Crystal Barricade).
    if (id !== controller && playerStatic(s, id, "hexproof")) return false;
    if (spec.filter.players === "you") return id === controller;
    if (spec.filter.players === "opponent") return id !== controller;
    return true;
  }
  // Sort ou capacité sur la pile (« sort ou capacité ciblé avec une seule cible »).
  const stackItem = s.stack.find((x) => x.id === id);
  if (stackItem && spec.filter.stackItems) {
    const n = Object.values(stackItem.targets).flat().length;
    return !spec.filter.stackItems.singleTarget || n === 1;
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
  // Protection contre tout : ne peut être la cible de rien (702.16b).
  if (hasKeyword(s, id, "protectionFromEverything")) return false;
  // Défense talismanique contre les éphémères / le noir / le blanc : selon la source adverse.
  if (obj(s, id).controller !== controller && sourceId) {
    const src = s.objects[sourceId];
    const d = src ? s.defs[src.defId] : undefined;
    const colors = src ? chars(s, sourceId).colors : [];
    if (hasKeyword(s, id, "hexproofFromInstants") && d?.types.includes("Instant")) return false;
    if (hasKeyword(s, id, "hexproofFromBlack") && colors.includes("B")) return false;
    if (hasKeyword(s, id, "hexproofFromWhite") && colors.includes("W")) return false;
  }
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
  if (spec.filter.stackItems)
    for (const item of s.stack) if (item.id !== sourceId && !out.includes(item.id) && ok(item.id)) out.push(item.id);
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
    const hostSpec = spec.attachedToTarget;
    if (hostSpec && ids.some((id) => !(chosen[hostSpec] ?? []).includes(s.objects[id]?.attachedTo ?? ""))) {
      throw new RulesError("La cible doit être attachée à l'autre cible");
    }
    for (const other of spec.otherThan ?? []) {
      if (ids.some((id) => (chosen[other] ?? []).includes(id))) throw new RulesError("Ces cibles doivent être différentes");
    }
    if (ids.length > max) throw new RulesError(max === 1 ? "Une seule cible par mot « cible »" : `${max} cibles au maximum`);
    if (new Set(ids).size !== ids.length) throw new RulesError("Même cible choisie deux fois");
    if (ids.length === 0 && !spec.optional) throw new RulesError(`Cible manquante : ${spec.label ?? spec.id}`);
    if (!spec.optional && !spec.kickedCount && ids.length < max) throw new RulesError(`${max} cibles requises`);
    for (const id of ids)
      if (!isLegalTarget(s, controller, spec, id, opts.sourceId)) throw new RulesError(`Cible illégale : ${id}`);
    const holders = ids.map((id) => s.objects[id]?.[s.objects[id]?.zone === "battlefield" ? "controller" : "owner"] ?? id);
    if (spec.samePlayer && new Set(holders).size > 1) throw new RulesError("Les cibles doivent appartenir au même joueur");
    if (spec.differentPlayers && new Set(holders).size !== holders.length)
      throw new RulesError("Les cibles doivent être contrôlées par des joueurs différents");
    result[spec.id] = ids;
  }
  return result;
}
