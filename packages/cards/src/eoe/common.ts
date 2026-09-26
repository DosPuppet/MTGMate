/**
 * Éléments propres à Edge of Eternities (EOE) : jetons Lander, Robot, Drone, Soldat humain, Munitions.
 * Le DSL et les filtres génériques viennent de Foundations (fdn/common.ts).
 */
import { dsl, type ObjectFilter, type TokenSpec } from "@mtgx/engine";

export * from "../fdn/common";

const { activated, triggered, fx, ref, target, when } = dsl;

/** Lander : « {2}, {T}, sacrifiez ce jeton : cherchez une carte de terrain de base, mettez-la sur le champ de bataille engagée. » */
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
      label: "Terrain de base",
    }),
  ],
  text: "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
};

/** Robot : créature-artefact incolore 2/2. */
export const ROBOT: TokenSpec = {
  name: "Robot",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot"],
  power: 2,
  toughness: 2,
};

/** Drone : créature-artefact incolore 1/1 avec le vol, « ne peut bloquer que des créatures avec le vol ». */
export const DRONE: TokenSpec = {
  name: "Drone",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Drone"],
  power: 1,
  toughness: 1,
  keywords: ["flying", "canBlockOnlyFlyers"],
  text: "Flying\nThis token can block only creatures with flying.",
};

/** Soldat humain : créature blanche 1/1. */
export const HUMAN_SOLDIER: TokenSpec = {
  name: "Human Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Human", "Soldier"],
  power: 1,
  toughness: 1,
};

/** Munitions : artefact avec « Quand ce jeton quitte le champ de bataille, il inflige 2 blessures à n'importe quelle cible ». */
export const MUNITIONS: TokenSpec = {
  name: "Munitions",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [triggered(when.leavesSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 blessures" })],
  text: "When this token leaves the battlefield, it deals 2 damage to any target.",
};

/** « Créez un jeton Lander. » */
export const lander = (n = 1) => fx.createTokens(LANDER, n);

/** « créature ou artefact » */
export const CREATURE_OR_ARTIFACT: ObjectFilter = { types: ["Creature", "Artifact"] };
/** « deux créatures engagées ou plus » */
export const TWO_TAPPED = dsl.cond.controls({ types: ["Creature"], tapped: true }, 2);
/** « créature ou Vaisseau » */
export const CREATURE_OR_SPACECRAFT: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { subtype: "Spacecraft" }] };
