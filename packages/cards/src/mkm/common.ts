/**
 * Éléments communs de Murders at Karlov Manor (MKM) : jetons de l'extension et aides du suspect (701.60). Le DSL et les
 * jetons communs (Indice, Thopter, Chien…) viennent des extensions précédentes (via lci/common.ts).
 */
import type { ObjectFilter, TokenSpec } from "@mtgx/engine";
import { fx, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes: [name], power, toughness, ...extra });

/** Détective : créature blanche et bleue 2/2. */
export const DETECTIVE: TokenSpec = creature("Detective", ["W", "U"], 2, 2);
/** Squelette : créature noire 2/1. */
export const SKELETON_B: TokenSpec = creature("Skeleton", ["B"], 2, 1);
/** Esprit : créature blanche et noire 1/1 avec le vol. */
export const SPIRIT_WB: TokenSpec = creature("Spirit", ["W", "B"], 1, 1, { keywords: ["flying"] });
/** Loup : créature verte et blanche 5/5 avec le piétinement. */
export const WOLF_GW: TokenSpec = creature("Wolf", ["G", "W"], 5, 5, { keywords: ["trample"] });
/** Araignée : créature noire et verte 2/1 avec la portée et la menace. */
export const SPIDER_BG: TokenSpec = creature("Spider", ["B", "G"], 2, 1, { keywords: ["reach", "menace"] });
/** Diablotin : créature rouge 2/2 avec « quand ce jeton meurt, il inflige 2 blessures à chaque adversaire ». */
export const IMP: TokenSpec = creature("Imp", ["R"], 2, 2, {
  abilities: [triggered(when.diesSelf, [fx.damage(2, ref.eachOpponent)], { label: "2 blessures à chaque adversaire" })],
  text: "When this token dies, it deals 2 damage to each opponent.",
});
/** Merfolk : créature bleue 1/1. */
export const MERFOLK_U: TokenSpec = creature("Merfolk", ["U"], 1, 1);

/** « créature suspecte » (701.60). */
export const SUSPECTED: ObjectFilter = { types: ["Creature"], suspected: true };
