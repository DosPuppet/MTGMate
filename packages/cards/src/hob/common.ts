/** Éléments de The Hobbit (HOB) : jetons. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";

export * from "../lci/common";

/** Nain : créature rouge 2/2. */
export const DWARF: TokenSpec = {
  name: "Dwarf",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dwarf"],
  power: 2,
  toughness: 2,
};

/** Loup : créature verte 2/2. */
export const WOLF: TokenSpec = { name: "Wolf", colors: ["G"], types: ["Creature"], subtypes: ["Wolf"], power: 2, toughness: 2 };
