/** Éléments de Teenage Mutant Ninja Turtles (TMT) : jeton Mutagène. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";
import { activated, fx, ref, target } from "../lci/common";

export * from "../lci/common";

/** Mutagène : artefact avec « {1}, {T}, sacrifiez ce jeton : un marqueur +1/+1 sur la créature ciblée (rituel) ». */
export const MUTAGEN: TokenSpec = {
  name: "Mutagen",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Mutagen"],
  abilities: [
    activated({
      mana: "{1}",
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      targets: [target.creature()],
      effects: [fx.addCounters(ref.target(), 1)],
      label: "Un marqueur +1/+1",
    }),
  ],
  text: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
};

/** Esprit Tortue Ninja : créature blanche 1/1 (The Last Ronin's Technique). */
export const NINJA_TURTLE_SPIRIT: TokenSpec = {
  name: "Ninja Turtle Spirit",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Ninja", "Turtle", "Spirit"],
  power: 1,
  toughness: 1,
};

/** Mutant : créature rouge 2/2. */
export const MUTANT: TokenSpec = {
  name: "Mutant",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Mutant"],
  power: 2,
  toughness: 2,
};

/** Ninja : créature noire 1/1. */
export const NINJA: TokenSpec = {
  name: "Ninja",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Ninja"],
  power: 1,
  toughness: 1,
};

/** Robot : créature-artefact incolore 1/1. */
export const ROBOT_1: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 1,
  toughness: 1,
};

/** Insecte Guerrier : créature noire 1/1. */
export const INSECT_WARRIOR: TokenSpec = {
  name: "Insect Warrior",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Insect", "Warrior"],
  power: 1,
  toughness: 1,
};

/** Dinosaure Soldat : créature blanche 2/2. */
export const DINOSAUR_SOLDIER: TokenSpec = {
  name: "Dinosaur Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Dinosaur", "Soldier"],
  power: 2,
  toughness: 2,
};
