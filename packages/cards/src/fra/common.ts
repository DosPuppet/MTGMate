/**
 * Éléments propres à Reality Fracture : jetons (Cadet, Heartwood, Lotus…) et filtres.
 * Le DSL et les filtres génériques viennent de Foundations (fdn/common.ts).
 */
import type { TokenSpec } from "@mtgx/engine";
import { manaAbility } from "../fdn/common";

export * from "../fdn/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** « jeton de créature Sorcier Soldat incolore 2/2 appelé Cadet » */
export const CADET = creature("Cadet", [], ["Wizard", "Soldier"], 2, 2);

/** « jeton Heartwood : artefact rouge et vert avec "{T} : ajoutez {R} ou {G}." » */
export const HEARTWOOD: TokenSpec = {
  name: "Heartwood",
  colors: ["R", "G"],
  types: ["Artifact"],
  subtypes: [],
  abilities: [manaAbility(["R", "G"])],
  text: "{T}: Add {R} or {G}.",
};

/** « jeton d'artefact incolore appelé Lotus avec "{T}, sacrifiez ce jeton : ajoutez trois manas d'une même couleur." » */
export const LOTUS: TokenSpec = {
  name: "Lotus",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 3, { sacrifice: true })],
  text: "{T}, Sacrifice this token: Add three mana of any one color.",
};

/** « jeton de créature-terrain Forêt Tentacule verte 3/3 » (avec « {T} : ajoutez {G} »). */
export const FOREST_TENTACLE: TokenSpec = {
  name: "Forest Tentacle",
  colors: ["G"],
  types: ["Land", "Creature"],
  subtypes: ["Forest", "Tentacle"],
  power: 3,
  toughness: 3,
  abilities: [manaAbility("G")],
  text: "{T}: Add {G}.",
};

export const THOPTER: TokenSpec = {
  name: "Thopter",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Thopter"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};

/** Vraska, Soul of Stone : créature-artefact Sculpture Trésor 1/1 avec la capacité de mana du Trésor. */
export const SCULPTURE_TREASURE: TokenSpec = {
  name: "Sculpture Treasure",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Sculpture", "Treasure"],
  power: 1,
  toughness: 1,
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
  text: "{T}, Sacrifice this token: Add one mana of any color.",
};

export const BEAST_TRAMPLE = creature("Beast", ["G"], ["Beast"], 4, 4, { keywords: ["trample"] });
export const ANGEL_3 = creature("Angel", ["U"], ["Angel"], 3, 3, { keywords: ["flying"] });
export const MOWU = creature("Mowu", ["G"], ["Dog"], 3, 3, { legendary: true });
