/**
 * Taille automatique des cartes du champ de bataille (comme sur MTGA) : la plus grande largeur de carte
 * qui fait tenir la rangée de créatures et la rangée de terrains dans la place réellement disponible,
 * sans retour à la ligne.
 */
import type { ObjectView } from "@mtgx/engine";

export const CARD_RATIO = 1.395;
export const LAND_SCALE = 0.72;
const LAND_OVERLAP = 0.74; // recouvrement des terrains identiques empilés (voir .perm-group.stacked)
const MIN_W = 36;
const MAX_W = 160;

/** Terrains identiques regroupés en piles (même définition, même état engagé). */
export function landGroups(lands: ObjectView[]): ObjectView[][] {
  const groups: ObjectView[][] = [];
  const byKey = new Map<string, ObjectView[]>();
  for (const o of lands) {
    const key = `${o.defId}|${o.tapped}`;
    let g = byKey.get(key);
    if (!g) {
      g = [];
      byKey.set(key, g);
      groups.push(g);
    }
    g.push(o);
  }
  return groups;
}

/** Largeur de carte maximale pour une zone de `width` × `height` pixels. */
export function fitCardWidth(width: number, height: number, others: ObjectView[], lands: ObjectView[]): number {
  const padX = 28;
  const gap = 10;
  // Hauteur : rangée des créatures (+10 de marge, +16 pour l'avancée en attaque) + rangée des terrains + espacements.
  const byHeight = (height - 10 - 16 - 6 - 8) / (CARD_RATIO * (1 + LAND_SCALE));

  // Largeur, rangée des créatures : une carte engagée occupe sa hauteur.
  const tapped = others.filter((o) => o.tapped).length;
  const units = others.length - tapped + tapped * CARD_RATIO;
  const byCreatures = units > 0 ? (width - padX - gap * (others.length - 1)) / units : MAX_W;

  // Largeur, rangée des terrains : piles avec recouvrement.
  const groups = landGroups(lands);
  let landUnits = 0;
  for (const g of groups) {
    const slot = g[0]?.tapped ? CARD_RATIO : 1;
    landUnits += LAND_SCALE * (slot + (g.length - 1) * (slot - LAND_OVERLAP));
  }
  const byLands = landUnits > 0 ? (width - padX - gap * (groups.length - 1)) / landUnits : MAX_W;

  return Math.floor(Math.max(MIN_W, Math.min(MAX_W, byHeight, byCreatures, byLands)));
}
