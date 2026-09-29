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

/** Allié : créature blanche 1/1 (Appa). */
export const ALLY: TokenSpec = { name: "Ally", colors: ["W"], types: ["Creature"], subtypes: ["Ally"], power: 1, toughness: 1 };

/** Esprit incolore 1/1 de Realm of Koh : « ne peut pas bloquer ni être bloqué par des créatures non-Esprits ». */
export const SPIRIT_KOH: TokenSpec = {
  name: "Spirit",
  colors: [],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 1,
  toughness: 1,
  keywords: ["cantBlock", "cantBeBlockedByNonSpirits"],
  text: "This token can't block or be blocked by non-Spirit creatures.",
};
