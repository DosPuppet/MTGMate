/** Elements of Teenage Mutant Ninja Turtles (TMT): Mutagen token. The DSL and the common tokens come from lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";
import { activated, fx, ref, target } from "../lci/common";

export * from "../lci/common";

/** Mutagen: artifact with "{1}, {T}, Sacrifice this token: a +1/+1 counter on target creature (sorcery speed)". */
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
      label: "A +1/+1 counter",
    }),
  ],
  text: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
};

/** Ninja Turtle Spirit: 1/1 white creature (The Last Ronin's Technique). */
export const NINJA_TURTLE_SPIRIT: TokenSpec = {
  name: "Ninja Turtle Spirit",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Ninja", "Turtle", "Spirit"],
  power: 1,
  toughness: 1,
};

/** Mutant: 2/2 red creature. */
export const MUTANT: TokenSpec = {
  name: "Mutant",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Mutant"],
  power: 2,
  toughness: 2,
};

/** Ninja: 1/1 black creature. */
export const NINJA: TokenSpec = {
  name: "Ninja",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Ninja"],
  power: 1,
  toughness: 1,
};

/** Robot: 1/1 colorless artifact creature. */
export const ROBOT_1: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 1,
  toughness: 1,
};

/** Insect Warrior: 1/1 black creature. */
export const INSECT_WARRIOR: TokenSpec = {
  name: "Insect Warrior",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Insect", "Warrior"],
  power: 1,
  toughness: 1,
};

/** Dinosaur Soldier: 2/2 white creature. */
export const DINOSAUR_SOLDIER: TokenSpec = {
  name: "Dinosaur Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Dinosaur", "Soldier"],
  power: 2,
  toughness: 2,
};
