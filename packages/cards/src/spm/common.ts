/** Éléments communs de Marvel's Spider-Man (SPM) : le DSL et les jetons viennent des extensions précédentes (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";

/** Citoyen humain : créature verte et blanche 1/1. */
export const HUMAN_CITIZEN: TokenSpec = {
  name: "Human Citizen",
  colors: ["G", "W"],
  types: ["Creature"],
  subtypes: ["Human", "Citizen"],
  power: 1,
  toughness: 1,
};

/** Araignée : créature verte 2/1 avec la portée. */
export const SPIDER_21: TokenSpec = {
  name: "Spider",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Spider"],
  power: 2,
  toughness: 1,
  keywords: ["reach"],
};

/** Robot : créature-artefact incolore 1/1 avec le vol. */
export const ROBOT_FLYER: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};

/** Illusion Méchant : créature bleue 3/3. */
export const ILLUSION_VILLAIN: TokenSpec = {
  name: "Illusion Villain",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Illusion", "Villain"],
  power: 3,
  toughness: 3,
};
