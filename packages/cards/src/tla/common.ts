/** Éléments communs de Avatar: The Last Airbender (TLA) : le DSL et les jetons viennent des extensions précédentes (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";
import { block, blockAbility, firebending } from "../fdn/common";
import { DRAGON } from "../lci/common";

/** Dragon 4/4 volant avec la maîtrise du feu 4 (Avatar Roku). */
export const DRAGON_FIREBENDING: TokenSpec = {
  ...DRAGON,
  abilities: [firebending(4)],
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
  keywords: ["cantBlock"],
  abilities: [blockAbility(block.notBy({ notSubtype: "Spirit" }, "Imblocable par les créatures non-Esprits"))],
  text: "This token can't block or be blocked by non-Spirit creatures.",
};

/** Soldat : créature rouge 2/2 avec la maîtrise du feu 1. */
export const SOLDIER_FIRE: TokenSpec = {
  name: "Soldier",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Soldier"],
  power: 2,
  toughness: 2,
  abilities: [firebending(1)],
  text: "Firebending 1",
};

/** Moine : créature rouge 1/1 avec la prouesse. */
export const MONK_R: TokenSpec = {
  name: "Monk",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Monk"],
  power: 1,
  toughness: 1,
  keywords: ["prowess"],
};

/** Ours : créature verte 4/4. */
export const BEAR_4: TokenSpec = { name: "Bear", colors: ["G"], types: ["Creature"], subtypes: ["Bear"], power: 4, toughness: 4 };
