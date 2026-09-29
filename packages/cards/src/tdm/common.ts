/** Éléments de Tarkir: Dragonstorm (TDM) : jetons. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";

export * from "../lci/common";

/** Moine : créature blanche 1/1 avec la prouesse. */
export const MONK: TokenSpec = {
  name: "Monk",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Monk"],
  power: 1,
  toughness: 1,
  keywords: ["prowess"],
};

/** Guerrier : créature rouge 1/1 (mobilisation, Dalkovan Encampment). */
export const WARRIOR_R: TokenSpec = {
  name: "Warrior",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Warrior"],
  power: 1,
  toughness: 1,
};
