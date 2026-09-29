/** Éléments communs de Marvel Super Heroes (MSH) : le DSL et les jetons viennent des extensions précédentes (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";

/** Doombot (Castle Doom) : créature-artefact incolore 3/3 Robot Méchant. */
export const DOOMBOT: TokenSpec = {
  name: "Doombot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Villain"],
  power: 3,
  toughness: 3,
};
