/** Éléments de The Hobbit (HOB) : jetons. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { AbilityDef, TokenSpec } from "@mtgx/engine";
import { activated, fx, ref, staticAbility, target } from "../lci/common";

export * from "../lci/common";

/** Nain : créature rouge 2/2. */
export const DWARF: TokenSpec = {
  name: "Dwarf",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dwarf"],
  power: 2,
  toughness: 2,
};

/** Loup : créature verte 2/2. */
export const WOLF: TokenSpec = { name: "Wolf", colors: ["G"], types: ["Creature"], subtypes: ["Wolf"], power: 2, toughness: 2 };

/** Humain Soldat : créature blanche 1/1. */
export const HUMAN_SOLDIER: TokenSpec = {
  name: "Human Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Human", "Soldier"],
  power: 1,
  toughness: 1,
};

/** Elfe : créature verte 1/1. */
export const ELF: TokenSpec = { name: "Elf", colors: ["G"], types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1 };

/** Ours : créature verte 2/2. */
export const BEAR: TokenSpec = { name: "Bear", colors: ["G"], types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 2 };

/** Oiseau Soldat : créature blanche 4/4 avec le vol. */
export const BIRD_SOLDIER: TokenSpec = {
  name: "Bird Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Bird", "Soldier"],
  power: 4,
  toughness: 4,
  keywords: ["flying"],
};

/** Dragon : créature rouge 6/6 avec le vol. */
export const DRAGON_6: TokenSpec = {
  name: "Dragon",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dragon"],
  power: 6,
  toughness: 6,
  keywords: ["flying"],
};

/** Stone Boulder : créature-artefact Mur incolore 3/1 avec le défenseur. */
export const STONE_BOULDER: TokenSpec = {
  name: "Stone Boulder",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Wall"],
  power: 3,
  toughness: 1,
  keywords: ["defender"],
};

const equip = (mana: string): AbilityDef =>
  activated({
    mana,
    sorcerySpeed: true,
    targets: [target.creature("t", { controller: "you" })],
    effects: [fx.attach(ref.target())],
    label: `Équiper ${mana}`,
  });

/** Axe : Équipement incolore, « la créature équipée a +1/+0 », équiper {2}. */
export const AXE: TokenSpec = {
  name: "Axe",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [staticAbility("attached", { power: 1 }, { label: "+1/+0" }), equip("{2}")],
  text: "Equipped creature gets +1/+0.\nEquip {2}",
};
