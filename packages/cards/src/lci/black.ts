/** The Lost Caverns of Ixalan — cartes noires. */
import {
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  CAVES,
  type CardScript,
  cond,
  descend,
  FUNGUS,
  fx,
  MAP,
  manaAbility,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  PERMANENT_CARDS,
  ref,
  SKELETON_PIRATE,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  VAMPIRE_DEMON,
  when,
} from "./common";

const CREATURE = { types: ["Creature" as const] };
const FINALITY = { kind: "finality", n: 1 };
const mayMillTwo = (label = "Meulez deux cartes") =>
  triggered(when.entersSelf, [...fx.may("Meuler deux cartes ?", fx.mill(2))], { label });

export const BLACK: Record<string, CardScript> = {
  "Abyssal Gorestalker": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, CREATURE, 2)], {
        label: "Chaque joueur sacrifie deux créatures",
      }),
    ],
  },
  "Acolyte of Aclazotz": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [...fx.drain(1)],
        label: "Drain 1",
      }),
    ],
  },
  "Another Chance": {
    spell: spell(
      [],
      [
        ...fx.may("Meuler deux cartes ?", fx.mill(2)),
        fx.pickFromZone("graveyard", CREATURE, { to: "hand" }, { count: 2, min: 0, prompt: "Jusqu'à deux cartes de créature" }),
      ],
    ),
  },
  "Bloodthorn Flail": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
      activated({
        mana: "{3}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.attach(ref.target())],
        label: "Équiper — {3}",
      }),
      activated({
        discard: 1,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.attach(ref.target())],
        label: "Équiper — défaussez une carte",
      }),
    ],
  },
  "Chupacabra Echo": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), amount.neg(PERMANENT_CARDS), amount.neg(PERMANENT_CARDS))], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Descente profonde — −X/−X",
      }),
    ],
  },
  "Dead Weight": {
    enchant: { filter: CREATURE, label: "créature" },
    abilities: [staticAbility("attached", { power: -2, toughness: -2 }, { label: "−2/−2" })],
  },
  "Deathcap Marionette": { abilities: [mayMillTwo()] },
  Defossilize: {
    spell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "back" }), fx.explore(ref.stored("back"), 2)],
    ),
  },
  "Echo of Dusk": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        { condition: descend(4), label: "Descente 4 — +1/+1 et lien de vie" },
      ),
    ],
  },
  "Fanatical Offering": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1 } },
    spell: spell([], [fx.draw(2), fx.createTokens(MAP)]),
  },
  "Fungal Fortitude": {
    enchant: { filter: CREATURE, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(when.dies({ attachedToSource: true }), [fx.toBattlefield(ref.eventObject, { tapped: true })], {
        label: "Revient engagée",
      }),
    ],
  },
  "Gargantuan Leech": { costReduction: { generic: CAVES } },
  "Grasping Shadows": {
    abilities: [
      triggered(
        when.attacksAlone({ types: ["Creature"], controller: "you" }),
        [
          fx.pump(ref.eventObject, 0, 0, ["deathtouch", "lifelink"]),
          fx.counters(ref.self, "dread", 1),
          ...fx.when(cond.counterAtLeast("dread", 3), fx.transform()),
        ],
        { label: "Contact mortel et lien de vie, marqueur d'effroi" },
      ),
    ],
  },
  "Shadows' Lair": {
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{B}",
        tap: true,
        removeCounters: { kind: "dread", n: 1 },
        effects: [fx.draw(1), fx.loseLife(1)],
        label: "Piochez, perdez 1 PV",
      }),
    ],
  },
  "Greedy Freebooter": {
    abilities: [triggered(when.diesSelf, [fx.scry(1), fx.createTokens(TREASURE)], { label: "Regard 1 et Trésor" })],
  },
  "Join the Dead": {
    spell: spell(
      [target.creature()],
      [...fx.when(cond.not(descend(4)), fx.pump(ref.target(), -5, -5)), ...fx.when(descend(4), fx.pump(ref.target(), -10, -10))],
    ),
  },
  "Malicious Eclipse": {
    spell: spell([], [fx.pumpAll(CREATURE, -2, -2), fx.exileIfDies(ref.permanentsOf(ref.eachOpponent, CREATURE))]),
  },
  "Mephitic Draught": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), fx.loseLife(1)], { label: "Piochez, perdez 1 PV" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1), fx.loseLife(1)], { label: "Piochez, perdez 1 PV" }),
    ],
  },
  "Queen's Bay Paladin": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) =>
      triggered(t, [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { counters: FINALITY })], {
        targets: [target.optional(target.cardInGraveyard("t", { subtype: "Vampire" }, "you", "carte de Vampire"))],
        label: "Vampire du cimetière (finalité)",
      }),
    ),
  },
  "Rampaging Spiketail": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0 et indestructible",
      }),
    ],
  },
  "Ray of Ruin": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }, { types: ["Land"], basic: false }] },
          "créature, Véhicule ou terrain non de base",
        ),
      ],
      [fx.exile(ref.target()), fx.scry(1)],
    ),
  },
  "Screaming Phantom": { abilities: [triggered(when.attacksSelf, [fx.mill(1)], { label: "Meulez une carte" })] },
  "Skullcap Snail": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromOwnHand(ref.target(), "x")], {
        targets: [target.player("t", "opponent")],
        label: "L'adversaire exile une carte de sa main",
      }),
    ],
  },
  "Soulcoil Viper": {
    abilities: [
      activated({
        mana: "{B}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière")],
        effects: [fx.toBattlefield(ref.target(), { counters: FINALITY })],
        label: "Créature du cimetière (finalité)",
      }),
    ],
  },
  "Stinging Cave Crawler": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], {
        condition: descend(4),
        label: "Descente 4 — piochez, perdez 1 PV",
      }),
    ],
  },
  "Synapse Necromage": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(FUNGUS, 2)], { label: "Deux Champignons 1/1" })],
  },
  "Terror Tide": {
    spell: spell([], [fx.pumpAll(CREATURE, amount.neg(PERMANENT_CARDS), amount.neg(PERMANENT_CARDS))]),
  },
  "Vito's Inquisitor": {
    abilities: [
      activated({
        mana: "{B}",
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["menace"])],
        label: "Marqueur +1/+1 et menace",
      }),
    ],
  },
  "Broodrage Mycoid": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FUNGUS)], { condition: cond.descended, label: "Descente — Champignon 1/1" }),
    ],
  },
  "Canonized in Blood": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.descended,
        label: "Descente — marqueur +1/+1",
      }),
      activated({
        mana: "{5}{B}{B}",
        sacrifice: true,
        effects: [fx.createTokens(VAMPIRE_DEMON)],
        label: "Vampire Démon 4/3",
      }),
    ],
  },
  "Corpses of the Lost": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Skeleton", controller: "you" },
        { power: 1, addKeywords: ["haste"] },
        {
          label: "Squelettes : +1/+0 et célérité",
        },
      ),
      triggered(when.entersSelf, [fx.createTokens(SKELETON_PIRATE)], { label: "Squelette Pirate 2/2" }),
      triggered(when.yourEndStep, [...fx.mayPayLife(1, "Payer 1 PV pour la reprendre en main ?", fx.toHand(ref.self))], {
        condition: cond.descended,
        label: "Descente — 1 PV : reprenez-la",
      }),
    ],
  },
  "Deep Goblin Skulltaker": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.descended,
        label: "Descente — marqueur +1/+1",
      }),
    ],
  },
  "Primordial Gnawer": { abilities: [triggered(when.diesSelf, [fx.discover(3)], { label: "Découverte 3" })] },
  "Stalactite Stalker": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.descended,
        label: "Descente — marqueur +1/+1",
      }),
      activated({
        mana: "{2}{B}",
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), amount.neg(amount.lkiPower), amount.neg(amount.lkiPower))],
        label: "−X/−X (sa force)",
      }),
    ],
  },
};
