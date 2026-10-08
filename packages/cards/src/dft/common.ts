/**
 * Aetherdrift (DFT) specifics: Pilot, Servo, Elephant, Vehicle, Dinosaur Dragon and Insect tokens; "creature or
 * Vehicle" and "Mount or Vehicle" filters. The DSL comes from Foundations (fdn/common.ts).
 */
import { dsl, type ObjectFilter, type TargetSpec, type TokenSpec } from "@mtgx/engine";

export * from "../eoe/common";
export { THOPTER } from "../fra/common";

/** Pilot: 1/1 colorless creature that saddles and crews as though its power were 2 greater. */
export const PILOT: TokenSpec = {
  name: "Pilot",
  colors: [],
  types: ["Creature"],
  subtypes: ["Pilot"],
  power: 1,
  toughness: 1,
  abilities: [dsl.powerRuleAbility(dsl.powerFor.pilot)],
  text: "This token saddles Mounts and crews Vehicles as though its power were 2 greater.",
};

/** Servo: 1/1 colorless artifact creature. */
export const SERVO: TokenSpec = {
  name: "Servo",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Servo"],
  power: 1,
  toughness: 1,
};

/** Elephant: 3/3 green creature. */
export const ELEPHANT: TokenSpec = {
  name: "Elephant",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Elephant"],
  power: 3,
  toughness: 3,
};

/** Vehicle: 3/2 colorless artifact with "Crew 1". */
export const VEHICLE: TokenSpec = {
  name: "Vehicle",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Vehicle"],
  power: 3,
  toughness: 2,
  abilities: [dsl.crewAbility(1)],
  text: "Crew 1",
};

/** Dinosaur Dragon: 4/4 red creature with flying. */
export const DINOSAUR_DRAGON: TokenSpec = {
  name: "Dinosaur Dragon",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dinosaur", "Dragon"],
  power: 4,
  toughness: 4,
  keywords: ["flying"],
};

/** Insect: 1/1 green creature (Aatchik). */
export const GREEN_INSECT: TokenSpec = {
  name: "Insect",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Insect"],
  power: 1,
  toughness: 1,
};

/** "creature or Vehicle" */
export const CREATURE_OR_VEHICLE: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] };
/** "Mount or Vehicle" */
export const MOUNT_OR_VEHICLE: ObjectFilter = { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] };

export const targetCreatureOrVehicle = (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
  id,
  label: "creature or Vehicle",
  filter: { objects: { ...CREATURE_OR_VEHICLE, ...extra } },
});

/** « Whenever this creature attacks while saddled, … » */
export const whileSaddled = (
  effects: Parameters<typeof dsl.triggered>[1],
  opts: { targets?: TargetSpec[]; label?: string } = {},
) => dsl.triggered(dsl.when.attacksSelf, effects, { ...opts, condition: dsl.cond.saddled });

/** Cycling with a "when you cycle this card" trigger (from the graveyard). */
export const whenCycled = (effects: Parameters<typeof dsl.triggered>[1], opts: { targets?: TargetSpec[]; label?: string } = {}) =>
  dsl.triggered(dsl.when.cycleSelf, effects, { ...opts, fromGraveyard: true });

/** « Create a 1/1 colorless Pilot creature token with … » */
export const pilot = (n: Parameters<typeof dsl.fx.createTokens>[1] = 1) => dsl.fx.createTokens(PILOT, n);
