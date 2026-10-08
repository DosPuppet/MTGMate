/** Shared pieces of Avatar: The Last Airbender (TLA): the DSL and the tokens come from the previous sets (via lci/common.ts). */
export * from "../lci/common";

import type { TokenSpec } from "@mtgx/engine";
import { block, blockAbility, firebending } from "../fdn/common";
import { DRAGON } from "../lci/common";

/** 4/4 flying Dragon with firebending 4 (Avatar Roku). */
export const DRAGON_FIREBENDING: TokenSpec = {
  ...DRAGON,
  abilities: [firebending(4)],
  text: "Flying\nFirebending 4",
};

/** Ally: 1/1 white creature (Appa). */
export const ALLY: TokenSpec = { name: "Ally", colors: ["W"], types: ["Creature"], subtypes: ["Ally"], power: 1, toughness: 1 };

/** 1/1 colorless Spirit of Realm of Koh: "can't block or be blocked by non-Spirit creatures". */
export const SPIRIT_KOH: TokenSpec = {
  name: "Spirit",
  colors: [],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 1,
  toughness: 1,
  abilities: [
    blockAbility(block.notBy({ notSubtype: "Spirit" }, "Can't be blocked by non-Spirit creatures")),
    blockAbility(block.onlyBlocks({ subtype: "Spirit" }, "Can block only Spirits")),
  ],
  text: "This token can't block or be blocked by non-Spirit creatures.",
};

/** Soldier: 2/2 red creature with firebending 1. */
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

/** Monk: 1/1 red creature with prowess. */
export const MONK_R: TokenSpec = {
  name: "Monk",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Monk"],
  power: 1,
  toughness: 1,
  keywords: ["prowess"],
};

/** Bear: 4/4 green creature. */
export const BEAR_4: TokenSpec = { name: "Bear", colors: ["G"], types: ["Creature"], subtypes: ["Bear"], power: 4, toughness: 4 };
