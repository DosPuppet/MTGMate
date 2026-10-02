/** Avatar: The Last Airbender — cartes incolores et terrains. */
import type { ManaType } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CLUE,
  cond,
  entersWith,
  firebending,
  fx,
  manaAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** « Ce terrain arrive engagé à moins que vous ne contrôliez un terrain de base. » */
const unlessBasic = entersWith({
  tapped: true,
  condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
  label: "Engagé, sauf si vous contrôlez un terrain de base",
});

/** Terrains bicolores « arrive engagé ; {4}, {T}, sacrifiez ce terrain : piochez une carte ». */
const cyclingLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({ mana: "{4}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
  ],
});

/** « {1}, {T} : ajoutez un mana de n'importe quelle couleur. » */
const filterAnyColor = activated({
  mana: "{1}",
  tap: true,
  effects: [fx.addManaChoice(1)],
  label: "Un mana de n'importe quelle couleur",
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Leçons incolores --------------------------------------------------------
  "Aang's Journey": {
    kicker: "{2}",
    spell: spell(
      [],
      [
        fx.search(BASIC_LAND, { to: "hand" }),
        // Kické : un terrain de base et une carte de Sanctuaire (deux recherches, chacune suivie d'un mélange).
        ...fx.when(cond.kicked, fx.search({ subtype: "Shrine" }, { to: "hand" })),
        fx.gainLife(2),
      ],
    ),
  },
  Energybending: {
    spell: spell(
      [],
      [
        fx.modifyAll(
          { types: ["Land"], controller: "you" },
          { addSubtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
          "endOfTurn",
        ),
        fx.draw(1),
      ],
    ),
  },
  "Zuko's Exile": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Enchantment"], {}, "artefact, créature ou enchantement")],
      [fx.exile(ref.target()), fx.createTokens(CLUE, 1, ref.controllerOf(ref.target()))],
    ),
  },

  // --- Artefacts ---------------------------------------------------------------
  "Barrels of Blasting Jelly": {
    abilities: [
      activated({ mana: "{1}", oncePerTurn: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
      activated({
        mana: "{5}",
        tap: true,
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(5, ref.target())],
        label: "5 blessures à une créature",
      }),
    ],
  },
  "Bender's Waterskin": {
    abilities: [
      // Approximation (comme Thousand Moons Infantry) : se dégage au début de l'entretien de chaque adversaire.
      triggered(when.step("upkeep", "opponent"), [fx.untap(ref.self)], { label: "Se dégage pendant le tour adverse" }),
      manaAbility(ANY_COLOR),
    ],
  },
  "Fire Nation Warship": {
    // Portée et équipage 2 : lus dans le texte. « Meurt » : mis au cimetière depuis le champ de bataille, créature ou non.
    abilities: [triggered(when.putIntoGraveyardSelf, [fx.createTokens(CLUE)], { label: "Un Indice" })],
  },
  "Kyoshi Battle Fan": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALLY, 1, undefined, "a"), fx.attach(ref.stored("a"))], {
        label: "Un Allié 1/1, puis attachez-lui l'Équipement",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Meteor Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Détruisez un permanent",
      }),
      staticAbility("attached", { power: 3, toughness: 3 }, { label: "+3/+3" }),
    ],
  },
  "Trusty Boomerang": {
    abilities: [
      // La capacité est portée par l'Équipement et engage la créature équipée (« {T} » de la créature).
      activated({
        mana: "{1}",
        tapAttached: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target()), fx.bounce(ref.self)],
        label: "Engagez une créature, puis Trusty Boomerang revient dans la main",
      }),
    ],
  },
  "The Walls of Ba Sing Se": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["indestructible"] },
        { label: "Vos autres permanents sont indestructibles" },
      ),
    ],
  },

  // --- Terrains ----------------------------------------------------------------
  "Agna Qel'a": {
    abilities: [
      unlessBasic,
      manaAbility("U"),
      activated({ mana: "{2}{U}", tap: true, effects: fx.loot(1), label: "Piochez, puis défaussez une carte" }),
    ],
  },
  "Airship Engine Room": cyclingLand("U", "R"),
  "Boiling Rock Prison": cyclingLand("B", "R"),
  "Fire Nation Palace": {
    abilities: [
      unlessBasic,
      manaAbility("R"),
      activated({
        mana: "{1}{R}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { addAbilities: [firebending(4)] }, "endOfTurn")],
        label: "Maîtrise du feu 4 jusqu'à la fin du tour",
      }),
    ],
  },
  "Foggy Bottom Swamp": cyclingLand("B", "G"),
  "Jasmine Dragon Tea Shop": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { subtype: "Ally" }, abilityOfSource: { subtype: "Ally" } } }),
      activated({ mana: "{5}", tap: true, effects: [fx.createTokens(ALLY)], label: "Un Allié 1/1" }),
    ],
  },
  "Kyoshi Village": cyclingLand("G", "W"),
  "Meditation Pools": cyclingLand("G", "U"),
  "Misty Palms Oasis": cyclingLand("W", "B"),
  "North Pole Gates": cyclingLand("W", "U"),
  "Omashu City": cyclingLand("R", "G"),
  "Rumble Arena": {
    // Vigilance : lue dans le texte.
    abilities: [triggered(when.entersSelf, [fx.scry(1)], { label: "Regard 1" }), manaAbility("C"), filterAnyColor],
  },
  "Secret Tunnel": {
    keywords: ["unblockable"],
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [
          {
            ...target.creature("t", { controller: "you" }),
            count: 2,
            shareCreatureType: true,
            label: "deux créatures que vous contrôlez qui partagent un type",
          },
        ],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Deux créatures imblocables ce tour-ci",
      }),
    ],
  },
  "Serpent's Pass": cyclingLand("U", "B"),
  "Sun-Blessed Peak": cyclingLand("R", "W"),
  "White Lotus Hideout": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { anyOf: [{ subtype: "Lesson" }, { subtype: "Shrine" }] } } }),
      filterAnyColor,
    ],
  },
  "White Lotus Tile": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        tap: true,
        effects: [fx.addManaChoice(amount.maxSharingCreatureType({ types: ["Creature"], controller: "you" }))],
        label: "X mana d'une même couleur (X : le plus de créatures partageant un type)",
      }),
    ],
  },
};
