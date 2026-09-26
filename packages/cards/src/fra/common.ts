/**
 * Éléments propres à Reality Fracture : jetons (Cadet, Heartwood, Lotus…) et filtres.
 * Le DSL et les filtres génériques viennent de Foundations (fdn/common.ts).
 */
import { type Amount, dsl, type Effect, type TokenSpec } from "@mtgx/engine";
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
  // « {T} : ajoutez {G} » vient du type Forêt (305.6).
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
export const ILLUSION = creature("Illusion", ["U"], ["Illusion"], 1, 1);
export const LEVIATHAN = creature("Leviathan", ["U"], ["Leviathan"], 8, 8, { keywords: ["hexproof"] });
/** Ajani's Pridemate : Chat Soldat blanc 2/2 avec « chaque fois que vous gagnez des PV, marqueur +1/+1 ». */
export const AJANIS_PRIDEMATE = creature("Ajani's Pridemate", ["W"], ["Cat", "Soldier"], 2, 2, {
  abilities: [dsl.triggered(dsl.when.gainLife, [dsl.fx.addCounters(dsl.ref.self, 1)], { label: "marqueur +1/+1" })],
  text: "Whenever you gain life, put a +1/+1 counter on this token.",
});

// ---------------------------------------------------------------------------
// Sorts préparés partagés (plusieurs créatures ont le même sort)
// ---------------------------------------------------------------------------

const { spell: spellOf, fx: fxs, ref: refs, target: targets } = dsl;

/** Seed Suture : « Mettez un marqueur +1/+1 sur une créature ciblée. Vous gagnez 1 point de vie. » */
export const SEED_SUTURE = spellOf([targets.creature("t")], [fxs.addCounters(refs.target(), 1), fxs.gainLife(1)]);
/** Peer Review : « Créez un jeton Cadet. Surveillez 1. » */
export const PEER_REVIEW = spellOf([], [fxs.createTokens(CADET), fxs.surveil(1)]);
/** Omit Variables : « Meulez trois cartes. » */
export const OMIT_VARIABLES = spellOf([], [fxs.mill(3)]);
/** Vicious Verse : « 1 blessure à un adversaire ciblé. » */
export const VICIOUS_VERSE = spellOf([targets.player("t", "opponent")], [fxs.damage(1, refs.target())]);
/** Soul Tether : « Créez un jeton Heartwood. » */
export const SOUL_TETHER = spellOf([], [fxs.createTokens(HEARTWOOD)]);

// ---------------------------------------------------------------------------
// Empower Jace
// ---------------------------------------------------------------------------

/** « jeton de planeswalker Jace bleu avec "[−1] : Surveillez 1." et "[−3] : Piochez une carte." » */
export const JACE_TOKEN: TokenSpec = {
  name: "Jace",
  colors: ["U"],
  types: ["Planeswalker"],
  subtypes: ["Jace"],
  abilities: [
    dsl.loyalty(-1, { effects: [fxs.surveil(1)], label: "Surveillance 1" }),
    dsl.loyalty(-3, { effects: [fxs.draw(1)], label: "Piochez une carte" }),
  ],
  text: "[−1]: Surveil 1.\n[−3]: Draw a card.",
};

/** « Renforcez Jace N » : N marqueurs de loyauté sur votre jeton Jace (créé s'il n'y en a pas). */
export const empower = (n: Amount): Effect => ({ op: "empowerJace", amount: n, token: JACE_TOKEN });

/** « Les planeswalkers que vous contrôlez ont "[capacité de loyauté]". » */
export const walkersHave = (ability: ReturnType<typeof dsl.loyalty>, label: string) =>
  dsl.staticAbility({ types: ["Planeswalker"], controller: "you" }, { addAbilities: [ability] }, { label });
