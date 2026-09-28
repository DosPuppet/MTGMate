/**
 * Éléments propres à The Lost Caverns of Ixalan (LCI) : jetons Gnome, Champignon, Dinosaure, Vampire, Golem…,
 * filtres des Cavernes. Le DSL et les jetons génériques viennent de Bloomburrow (via blb/common.ts).
 */
import type { Amount, Condition, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { amount, cond } from "../blb/common";

export * from "../blb/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Gnome : créature-artefact incolore 1/1. */
export const GNOME: TokenSpec = { ...creature("Gnome", [], ["Gnome"], 1, 1), types: ["Artifact", "Creature"] };
/** Champignon : créature noire 1/1 avec « ce jeton ne peut pas bloquer ». */
export const FUNGUS: TokenSpec = creature("Fungus", ["B"], ["Fungus"], 1, 1, {
  keywords: ["cantBlock"],
  text: "This token can't block.",
});
export const DINOSAUR_3_3: TokenSpec = creature("Dinosaur", ["G"], ["Dinosaur"], 3, 3);
export const DINOSAUR_EGG: TokenSpec = creature("Dinosaur Egg", ["G"], ["Dinosaur", "Egg"], 0, 1);
export const ANGEL_4: TokenSpec = creature("Angel", ["W"], ["Angel"], 4, 4, { keywords: ["flying", "vigilance"] });
export const MERFOLK_HEXPROOF: TokenSpec = creature("Merfolk", ["U"], ["Merfolk"], 1, 1, { keywords: ["hexproof"] });
export const SKELETON_PIRATE: TokenSpec = creature("Skeleton Pirate", ["B"], ["Skeleton", "Pirate"], 2, 2);
export const VAMPIRE_LIFELINK: TokenSpec = creature("Vampire", ["W"], ["Vampire"], 1, 1, { keywords: ["lifelink"] });
export const VAMPIRE_DEMON: TokenSpec = creature("Vampire Demon", ["W", "B"], ["Vampire", "Demon"], 4, 3, {
  keywords: ["flying"],
});
export const GOLEM_4: TokenSpec = { ...creature("Golem", ["W", "U"], ["Golem"], 4, 4), types: ["Artifact", "Creature"] };
export const SPIRIT_3_2: TokenSpec = creature("Spirit", ["R", "W"], ["Spirit"], 3, 2);
/** Fungus Dinosaur (The Skullspore Nexus) : créature verte X/X. */
export const FUNGUS_DINOSAUR: TokenSpec = creature("Fungus Dinosaur", ["G"], ["Fungus", "Dinosaur"], 0, 0);

const ARTIFACT_OR_CREATURE_YOU: ObjectFilter = {
  anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }],
  controller: "you",
};
/** Gnome Soldier (Thousand Moons Smithy) : F/E égales au nombre d'artefacts et/ou de créatures que vous contrôlez. */
export const GNOME_SOLDIER: TokenSpec = {
  name: "Gnome Soldier",
  colors: ["W"],
  types: ["Artifact", "Creature"],
  subtypes: ["Gnome", "Soldier"],
  cdaPT: amount.count(ARTIFACT_OR_CREATURE_YOU),
  text: "This token's power and toughness are each equal to the number of artifacts and/or creatures you control.",
};

/** « artefact ou créature » (et « artefacts et/ou créatures que vous contrôlez »). */
export const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
export const ARTIFACT_OR_CREATURE_YOURS: ObjectFilter = ARTIFACT_OR_CREATURE_YOU;
export const OTHER_ARTIFACT_OR_CREATURE_YOURS: ObjectFilter = { ...ARTIFACT_OR_CREATURE_YOU, other: true };
export const DINOSAUR_YOU: ObjectFilter = { types: ["Creature"], subtype: "Dinosaur", controller: "you" };
export const CAVE: ObjectFilter = { types: ["Land"], subtype: "Cave" };

/** « le nombre de Cavernes que vous contrôlez plus le nombre de cartes de Caverne dans votre cimetière » */
export const CAVES: Amount = amount.plus(
  amount.count({ ...CAVE, controller: "you" }),
  amount.countIn("graveyard", { subtype: "Cave" }),
);

/** Carte de permanent (Descente) : artefact, bataille, créature, enchantement, terrain ou planeswalker. */
export const PERMANENT_CARD: ObjectFilter = { permanent: true };
/** Descente profonde (fathomless descent) : le nombre de cartes de permanent dans votre cimetière. */
export const PERMANENT_CARDS: Amount = amount.countIn("graveyard", PERMANENT_CARD);
/** Descente N : « s'il y a N cartes de permanent ou plus dans votre cimetière ». */
export const descend = (n: 4 | 8): Condition => cond.amountAtLeast(PERMANENT_CARDS, n);
/** « si un artefact est arrivé sur le champ de bataille sous votre contrôle ce tour-ci » */
export const ARTIFACT_ENTERED = cond.controls({ types: ["Artifact"], controller: "you", enteredThisTurn: true });
