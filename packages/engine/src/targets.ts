/**
 * Légalité des cibles (règle 115).
 */
import { hasKeyword, obj } from "./state";
import type { GameState, ObjectFilter, ObjectId, PlayerId, TargetSpec } from "./types";

export function matchesObjectFilter(s: GameState, controller: PlayerId, id: ObjectId, f: ObjectFilter): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  const d = s.defs[o.defId];
  if (!d) return false;
  if (f.types && !f.types.some((t) => d.types.includes(t))) return false;
  if (f.controller === "you" && o.controller !== controller) return false;
  if (f.controller === "opponent" && o.controller === controller) return false;
  if (f.keyword && !hasKeyword(s, id, f.keyword)) return false;
  if (f.notKeyword && hasKeyword(s, id, f.notKeyword)) return false;
  return true;
}

export function isLegalTarget(s: GameState, controller: PlayerId, spec: TargetSpec, id: string): boolean {
  const player = s.players[id];
  if (player) {
    if (player.lost || !spec.filter.players) return false;
    if (spec.filter.players === "you") return id === controller;
    if (spec.filter.players === "opponent") return id !== controller;
    return true;
  }
  if (!spec.filter.objects || !matchesObjectFilter(s, controller, id, spec.filter.objects)) return false;
  // Défense talismanique : ne peut pas être la cible de sorts ou capacités adverses.
  if (obj(s, id).controller !== controller && hasKeyword(s, id, "hexproof")) return false;
  return true;
}

export function legalTargets(s: GameState, controller: PlayerId, spec: TargetSpec): string[] {
  const out: string[] = [];
  if (spec.filter.players) for (const p of s.playerOrder) if (isLegalTarget(s, controller, spec, p)) out.push(p);
  if (spec.filter.objects) for (const id of s.battlefield) if (isLegalTarget(s, controller, spec, id)) out.push(id);
  return out;
}

/** Vérifie un choix de cibles complet pour une liste de spécifications. */
export function validateTargets(
  s: GameState,
  controller: PlayerId,
  specs: TargetSpec[],
  chosen: Record<string, string[]> = {},
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const spec of specs) {
    const ids = chosen[spec.id] ?? [];
    if (ids.length > 1) throw new Error("Une seule cible par mot « cible »");
    if (ids.length === 0 && !spec.optional) throw new Error(`Cible manquante : ${spec.label ?? spec.id}`);
    for (const id of ids) if (!isLegalTarget(s, controller, spec, id)) throw new Error(`Cible illégale : ${id}`);
    result[spec.id] = ids;
  }
  return result;
}
