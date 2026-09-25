/**
 * Éléments partagés par les scripts de Foundations : DSL, jetons, filtres courants.
 */
import { dsl, type ObjectFilter, type TargetSpec, type TokenSpec } from "@mtgx/engine";

export const {
  target,
  ref,
  fx,
  amount,
  spell,
  modal,
  mode,
  manaAbility,
  activated,
  triggered,
  triggeredModal,
  when,
  cond,
  staticAbility,
  entersWith,
  costReducer,
  flashForAll,
  loyalty,
} = dsl;

/** Cible quelconque décrite par un filtre d'objets. */
export function targetObj(id: string, filter: ObjectFilter, label: string): TargetSpec {
  return { id, label, filter: { objects: filter } };
}

export const CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
export const OTHER_CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you", other: true };
export const CREATURE_OPP: ObjectFilter = { types: ["Creature"], controller: "opponent" };
export const INSTANT_SORCERY: ObjectFilter = { types: ["Instant", "Sorcery"] };
export const BASIC_LAND: ObjectFilter = { types: ["Land"], basic: true };
export const WITH_P1P1: ObjectFilter = { types: ["Creature"], controller: "you", withCounter: "+1/+1" };
/** « artefact, enchantement ou créature avec le vol » */
export const ART_ENCH_OR_FLYER: ObjectFilter = {
  anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], keyword: "flying" }],
};

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

export const GOBLIN = creature("Goblin", ["R"], ["Goblin"], 1, 1);
export const DRAGON = creature("Dragon", ["R"], ["Dragon"], 4, 4, { keywords: ["flying"] });
export const DRAGON_5 = creature("Dragon", ["R"], ["Dragon"], 5, 5, { keywords: ["flying"] });
export const ELF_WARRIOR = creature("Elf Warrior", ["G"], ["Elf", "Warrior"], 1, 1);
export const BEAST = creature("Beast", ["G"], ["Beast"], 4, 4);
export const CAT = creature("Cat", ["W"], ["Cat"], 1, 1);
export const KNIGHT = creature("Knight", ["W"], ["Knight"], 3, 3);
export const RABBIT = creature("Rabbit", ["W"], ["Rabbit"], 1, 1);
export const SOLDIER = creature("Soldier", ["W"], ["Soldier"], 1, 1);
export const HUMAN = creature("Human", ["W"], ["Human"], 1, 1);
export const SPIRIT = creature("Spirit", ["W"], ["Spirit"], 1, 1, { keywords: ["flying"] });
export const FAERIE = creature("Faerie", ["U"], ["Faerie"], 1, 1, { keywords: ["flying"] });
export const DRAKE = creature("Drake", ["U"], ["Drake"], 2, 2, { keywords: ["flying"] });
export const SCION_OF_THE_DEEP = creature("Scion of the Deep", ["U"], ["Octopus"], 8, 8, { legendary: true });
export const RAT = creature("Rat", ["B"], ["Rat"], 1, 1);
export const INSECT = creature("Insect", ["B", "G"], ["Insect"], 1, 1, { keywords: ["flying"] });
export const KOMAS_COIL = creature("Koma's Coil", ["U"], ["Serpent"], 3, 3);
export const FISH = creature("Fish", ["U"], ["Fish"], 1, 1);
export const NINJA = creature("Ninja", ["U"], ["Ninja"], 2, 1);
export const ZOMBIE = creature("Zombie", ["B"], ["Zombie"], 2, 2);
export const CAT_2 = creature("Cat", ["W"], ["Cat"], 2, 2);
export const RACCOON = creature("Raccoon", ["G"], ["Raccoon"], 3, 3);

export const TREASURE: TokenSpec = {
  name: "Treasure",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Treasure"],
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
  text: "{T}, Sacrifice this artifact: Add one mana of any color.",
};
export const FOOD: TokenSpec = {
  name: "Food",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Food"],
  abilities: [activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" })],
  text: "{2}, {T}, Sacrifice this artifact: You gain 3 life.",
};

export type { CardScript } from "@mtgx/engine";
