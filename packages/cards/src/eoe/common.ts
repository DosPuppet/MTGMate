/**
 * Elements specific to Edge of Eternities (EOE): Lander, Robot, Drone, Human Soldier and Munitions tokens.
 * The DSL and the generic filters come from Foundations (fdn/common.ts).
 */
import { dsl, type ObjectFilter, type TokenSpec } from "@mtgx/engine";

export * from "../fdn/common";

const { activated, triggered, fx, ref, target, when } = dsl;

/** Lander: "{2}, {T}, Sacrifice this token: search for a basic land card, put it onto the battlefield tapped." */
export const LANDER: TokenSpec = {
  name: "Lander",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Lander"],
  abilities: [
    activated({
      mana: "{2}",
      tap: true,
      sacrifice: true,
      effects: [fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })],
      label: "Basic land",
    }),
  ],
  text: "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
};

/** Robot: 2/2 colorless artifact creature. */
export const ROBOT: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 2,
  toughness: 2,
};

/** Sliver: 1/1 colorless creature (Thrumming Hivepool). */
export const SLIVER: TokenSpec = {
  name: "Sliver",
  colors: [],
  types: ["Creature"],
  subtypes: ["Sliver"],
  power: 1,
  toughness: 1,
};

/** Drone: 1/1 colorless artifact creature with flying and "can block only creatures with flying". */
export const DRONE: TokenSpec = {
  name: "Drone",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Drone"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
  abilities: [dsl.blockAbility(dsl.block.onlyBlocks({ keyword: "flying" }, "Can block only creatures with flying"))],
  text: "Flying\nThis token can block only creatures with flying.",
};

/** Human Soldier: 1/1 white creature. */
export const HUMAN_SOLDIER: TokenSpec = {
  name: "Human Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Human", "Soldier"],
  power: 1,
  toughness: 1,
};

/** Munitions: artifact with "When this token leaves the battlefield, it deals 2 damage to any target". */
export const MUNITIONS: TokenSpec = {
  name: "Munitions",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [triggered(when.leavesSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 damage" })],
  text: "When this token leaves the battlefield, it deals 2 damage to any target.",
};

/** "Create a Lander token." */
export const lander = (n = 1) => fx.createTokens(LANDER, n);

/** "creature or artifact" */
export const CREATURE_OR_ARTIFACT: ObjectFilter = { types: ["Creature", "Artifact"] };
/** "two or more tapped creatures" */
export const TWO_TAPPED = dsl.cond.controls({ types: ["Creature"], tapped: true }, 2);
/** "creature or Spacecraft" */
export const CREATURE_OR_SPACECRAFT: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { subtype: "Spacecraft" }] };
