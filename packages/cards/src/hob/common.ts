/** The Hobbit (HOB) building blocks: tokens. The DSL and the common tokens come from lci/common.ts. */
import { type Effect, msg, type TokenSpec } from "@mtgx/engine";
import { cond, equipAbility, fx, ref, staticAbility } from "../lci/common";

export * from "../lci/common";

/** Dwarf: 2/2 red creature. */
export const DWARF: TokenSpec = {
  name: "Dwarf",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dwarf"],
  power: 2,
  toughness: 2,
};

/** Wolf: 2/2 green creature. */
export const WOLF: TokenSpec = { name: "Wolf", colors: ["G"], types: ["Creature"], subtypes: ["Wolf"], power: 2, toughness: 2 };

/** Human Soldier: 1/1 white creature. */
export const HUMAN_SOLDIER: TokenSpec = {
  name: "Human Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Human", "Soldier"],
  power: 1,
  toughness: 1,
};

/** Elf: 1/1 green creature. */
export const ELF: TokenSpec = { name: "Elf", colors: ["G"], types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1 };

/** Bear: 2/2 green creature. */
export const BEAR: TokenSpec = { name: "Bear", colors: ["G"], types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 2 };

/** Bird Soldier: 4/4 white creature with flying. */
export const BIRD_SOLDIER: TokenSpec = {
  name: "Bird Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Bird", "Soldier"],
  power: 4,
  toughness: 4,
  keywords: ["flying"],
};

/** Dragon: 6/6 red creature with flying. */
export const DRAGON_6: TokenSpec = {
  name: "Dragon",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dragon"],
  power: 6,
  toughness: 6,
  keywords: ["flying"],
};

/** Stone Boulder: 3/1 colorless Wall artifact creature with defender. */
export const STONE_BOULDER: TokenSpec = {
  name: "Stone Boulder",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Wall"],
  power: 3,
  toughness: 1,
  keywords: ["defender"],
};

/** Axe: colorless Equipment, "Equipped creature gets +1/+0", equip {2}. */
export const AXE: TokenSpec = {
  name: "Axe",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [
    staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    equipAbility({ mana: "{2}", label: msg("Equip {cost}", { cost: "{2}" }) }),
  ],
  text: "Equipped creature gets +1/+0.\nEquip {2}",
};

/**
 * Recruit (The Hobbit): "Draw a card, then discard a card. If you discarded a nonland card this way, create a 1/1
 * Human Soldier token"; `v`: the variable of the discarded card (a name of its own for each recruit of the same
 * ability).
 */
export const recruit = (v = "recruited"): Effect[] => [
  fx.draw(1),
  fx.discard(1, ref.you, { store: v, storeFilter: { notTypes: ["Land"] } }),
  ...fx.when(cond.v(v), fx.createTokens(HUMAN_SOLDIER)),
];
