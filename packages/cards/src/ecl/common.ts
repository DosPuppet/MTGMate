/**
 * Éléments propres à Lorwyn Eclipsed (ECL) : jetons. Le DSL et les jetons communs viennent des extensions précédentes
 * (via lci/common.ts).
 */
import type { TokenSpec } from "@mtgx/engine";

export * from "../lci/common";

/** Sylvin (Sapling Nursery) : créature verte 3/4 avec la portée. */
export const TREEFOLK_REACH: TokenSpec = {
  name: "Treefolk",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Treefolk"],
  power: 3,
  toughness: 4,
  keywords: ["reach"],
};
