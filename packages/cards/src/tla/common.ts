/** Éléments communs de Avatar: The Last Airbender (TLA) : le DSL et les jetons viennent des extensions précédentes (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";
import { DRAGON, fx, triggered, when } from "../lci/common";

/** Dragon 4/4 volant avec la maîtrise du feu 4 (Avatar Roku). */
export const DRAGON_FIREBENDING: TokenSpec = {
  ...DRAGON,
  abilities: [triggered(when.attacksSelf, [fx.addManaUntilEndOfTurn("R", "R", "R", "R")], { label: "Maîtrise du feu 4" })],
  text: "Flying\nFirebending 4",
};
