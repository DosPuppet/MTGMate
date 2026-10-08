/** Common elements of Marvel's Spider-Man (SPM): the DSL and the tokens come from the previous sets (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";

/** Human Citizen: 1/1 green and white creature. */
export const HUMAN_CITIZEN: TokenSpec = {
  name: "Human Citizen",
  colors: ["G", "W"],
  types: ["Creature"],
  subtypes: ["Human", "Citizen"],
  power: 1,
  toughness: 1,
};

/** Spider: 2/1 green creature with reach. */
export const SPIDER_21: TokenSpec = {
  name: "Spider",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Spider"],
  power: 2,
  toughness: 1,
  keywords: ["reach"],
};

/** Robot: 1/1 colorless artifact creature with flying. */
export const ROBOT_FLYER: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};

/** Illusion Villain: 3/3 blue creature. */
export const ILLUSION_VILLAIN: TokenSpec = {
  name: "Illusion Villain",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Illusion", "Villain"],
  power: 3,
  toughness: 3,
};
