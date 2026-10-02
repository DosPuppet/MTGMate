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

/** Méchant : créature noire 2/1 avec la menace. */
export const VILLAIN: TokenSpec = {
  name: "Villain",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Villain"],
  power: 2,
  toughness: 1,
  keywords: ["menace"],
};

/** Héros : créature blanche 3/2 avec la vigilance. */
export const HERO: TokenSpec = {
  name: "Hero",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Hero"],
  power: 3,
  toughness: 2,
  keywords: ["vigilance"],
};

/** Robot Méchant : créature-artefact incolore 2/2. */
export const ROBOT_VILLAIN: TokenSpec = {
  name: "Robot Villain",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Villain"],
  power: 2,
  toughness: 2,
};

/** Mur : créature incolore 0/4 avec le défenseur. */
export const WALL_C: TokenSpec = {
  name: "Wall",
  colors: [],
  types: ["Creature"],
  subtypes: ["Wall"],
  power: 0,
  toughness: 4,
  keywords: ["defender"],
};

/** Insecte : créature verte 1/1. */
export const INSECT_G: TokenSpec = {
  name: "Insect",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Insect"],
  power: 1,
  toughness: 1,
};

/** Ondin : créature bleue 1/1. */
export const MERFOLK_BLUE: TokenSpec = {
  name: "Merfolk",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Merfolk"],
  power: 1,
  toughness: 1,
};
