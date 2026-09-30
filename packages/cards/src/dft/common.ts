/**
 * Éléments propres à Aetherdrift (DFT) : jetons Pilote, Servo, Éléphant, Véhicule, Dinosaure Dragon, Insecte ;
 * filtres « créature ou Véhicule », « Monture ou Véhicule ». Le DSL vient de Foundations (fdn/common.ts).
 */
import { dsl, type ObjectFilter, type TargetSpec, type TokenSpec } from "@mtgx/engine";

export * from "../eoe/common";
export { THOPTER } from "../fra/common";

/** Pilote : créature incolore 1/1 qui monte et équipe comme si sa force était supérieure de 2. */
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

/** Servo : créature-artefact incolore 1/1. */
export const SERVO: TokenSpec = {
  name: "Servo",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Servo"],
  power: 1,
  toughness: 1,
};

/** Éléphant : créature verte 3/3. */
export const ELEPHANT: TokenSpec = {
  name: "Elephant",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Elephant"],
  power: 3,
  toughness: 3,
};

/** Véhicule : artefact incolore 3/2 avec « Équipage 1 ». */
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

/** Dinosaure Dragon : créature rouge 4/4 avec le vol. */
export const DINOSAUR_DRAGON: TokenSpec = {
  name: "Dinosaur Dragon",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dinosaur", "Dragon"],
  power: 4,
  toughness: 4,
  keywords: ["flying"],
};

/** Insecte : créature verte 1/1 (Aatchik). */
export const GREEN_INSECT: TokenSpec = {
  name: "Insect",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Insect"],
  power: 1,
  toughness: 1,
};

/** « créature ou Véhicule » */
export const CREATURE_OR_VEHICLE: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] };
/** « Monture ou Véhicule » */
export const MOUNT_OR_VEHICLE: ObjectFilter = { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] };

export const targetCreatureOrVehicle = (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
  id,
  label: "créature ou Véhicule",
  filter: { objects: { ...CREATURE_OR_VEHICLE, ...extra } },
});

/** « Whenever this creature attacks while saddled, … » */
export const whileSaddled = (
  effects: Parameters<typeof dsl.triggered>[1],
  opts: { targets?: TargetSpec[]; label?: string } = {},
) => dsl.triggered(dsl.when.attacksSelf, effects, { ...opts, condition: dsl.cond.saddled });

/** Cycle avec un déclencheur « quand vous cyclez cette carte » (depuis le cimetière). */
export const whenCycled = (effects: Parameters<typeof dsl.triggered>[1], opts: { targets?: TargetSpec[]; label?: string } = {}) =>
  dsl.triggered(dsl.when.cycleSelf, effects, { ...opts, fromGraveyard: true });

/** « Create a 1/1 colorless Pilot creature token with … » */
export const pilot = (n: Parameters<typeof dsl.fx.createTokens>[1] = 1) => dsl.fx.createTokens(PILOT, n);
