/** Shared elements of Marvel Super Heroes (MSH): the DSL and the tokens come from the earlier sets (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";

/** Doombot (Castle Doom): 3/3 colorless Robot Villain artifact creature. */
export const DOOMBOT: TokenSpec = {
  name: "Doombot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Villain"],
  power: 3,
  toughness: 3,
};

/** Villain: 2/1 black creature with menace. */
export const VILLAIN: TokenSpec = {
  name: "Villain",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Villain"],
  power: 2,
  toughness: 1,
  keywords: ["menace"],
};

/** Hero: 3/2 white creature with vigilance. */
export const HERO: TokenSpec = {
  name: "Hero",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Hero"],
  power: 3,
  toughness: 2,
  keywords: ["vigilance"],
};

/** Robot Villain: 2/2 colorless artifact creature. */
export const ROBOT_VILLAIN: TokenSpec = {
  name: "Robot Villain",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Villain"],
  power: 2,
  toughness: 2,
};

/** Wall: 0/4 colorless creature with defender. */
export const WALL_C: TokenSpec = {
  name: "Wall",
  colors: [],
  types: ["Creature"],
  subtypes: ["Wall"],
  power: 0,
  toughness: 4,
  keywords: ["defender"],
};

/** Insect: 1/1 green creature. */
export const INSECT_G: TokenSpec = {
  name: "Insect",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Insect"],
  power: 1,
  toughness: 1,
};

/** Merfolk: 1/1 blue creature. */
export const MERFOLK_BLUE: TokenSpec = {
  name: "Merfolk",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Merfolk"],
  power: 1,
  toughness: 1,
};
