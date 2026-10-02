/**
 * Remplacements qui modifient un nombre (616.1) : blessures, marqueurs, points de vie gagnés, cartes piochées. Quand
 * plusieurs s'appliquent au même événement, chacun s'applique une fois (614.5) et l'ordre est choisi par le joueur
 * affecté (ou le contrôleur de l'objet affecté). Rien ne peut suspendre le moteur au milieu d'un événement : le choix est
 * fait pour ce joueur, au mieux de ses intérêts (`prefer`), et documenté comme choix automatique.
 */
import { capReached, MAX_AMOUNT, MAX_PERMUTED } from "./limits";

/** Un remplacement : « autant plus N », « le double », « au moins N » (Ojer Axonil). */
export interface AmountMod {
  add?: number;
  times?: number;
  atLeast?: number;
}

function applyOne(v: number, m: AmountMod): number {
  // Un événement sans quantité (0 blessure, 0 marqueur) n'a rien à remplacer.
  if (v <= 0) return v;
  if (m.add !== undefined) return v + m.add;
  if (m.times !== undefined) return v * m.times;
  if (m.atLeast !== undefined) return Math.max(v, m.atLeast);
  return v;
}

function applyInOrder(base: number, mods: AmountMod[]): number {
  return mods.reduce(applyOne, base);
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i] as T, ...p];
  }
}

/** Tous les résultats possibles selon l'ordre d'application (un seul si l'ordre n'y change rien). */
export function replacementOutcomes(base: number, mods: AmountMod[]): number[] {
  const kinds = new Set(mods.map((m) => (m.add !== undefined ? "add" : m.times !== undefined ? "times" : "atLeast")));
  // Des remplacements tous du même genre commutent (sommes, produits) : l'ordre ne change rien.
  if (mods.length <= 1 || (kinds.size === 1 && !kinds.has("atLeast"))) return [applyInOrder(base, mods)];
  // Au-delà, l'ordre du code (celui des sources) : trop de permutations, et aucune carte n'en demande autant.
  if (mods.length > MAX_PERMUTED) {
    capReached("permutations");
    return [applyInOrder(base, mods)];
  }
  const out = new Set<number>();
  for (const order of permutations(mods)) out.add(applyInOrder(base, order));
  return [...out];
}

/**
 * Le résultat retenu pour le joueur affecté : le plus petit (« min » : blessures qu'il subit, marqueurs nuisibles) ou le
 * plus grand (« max » : points de vie qu'il gagne, marqueurs sur ses permanents, cartes qu'il pioche).
 */
export function chooseReplacementOrder(base: number, mods: AmountMod[], prefer: "min" | "max"): number {
  const outcomes = replacementOutcomes(base, mods);
  // Des doubleurs qui se multiplient donnent vite un nombre infini en JavaScript (inutilisable dans l'état, sérialisé en
  // JSON) : le résultat est plafonné (voir docs/approximations.md).
  const best = prefer === "min" ? Math.min(...outcomes) : Math.max(...outcomes);
  if (best > MAX_AMOUNT) capReached("amount");
  return Math.min(MAX_AMOUNT, best);
}
