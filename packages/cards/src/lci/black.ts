/** The Lost Caverns of Ixalan — black cards. */
import {
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  CAVES,
  type CardScript,
  cond,
  descend,
  equipAbility,
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
const mayMillTwo = (label = "Mill two cards") =>
  triggered(when.entersSelf, [...fx.may("Mill two cards?", fx.mill(2))], { label });

export const BLACK: Record<string, CardScript> = {
  "Abyssal Gorestalker": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, CREATURE, 2)], {
        label: "Each player sacrifices two creatures",
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
        ...fx.may("Mill two cards?", fx.mill(2)),
        fx.pickFromZone("graveyard", CREATURE, { to: "hand" }, { count: 2, min: 0, prompt: "Up to two creature cards" }),
      ],
    ),
  },
  "Bloodthorn Flail": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
      equipAbility({ mana: "{3}", label: "Equip — {3}" }),
      equipAbility({ discard: 1, label: "Equip — discard a card" }),
    ],
  },
  "Chupacabra Echo": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), amount.neg(PERMANENT_CARDS), amount.neg(PERMANENT_CARDS))], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Fathomless descent — −X/−X",
      }),
    ],
  },
  "Dead Weight": {
    enchant: { filter: CREATURE, label: "creature" },
    abilities: [staticAbility("attached", { power: -2, toughness: -2 }, { label: "−2/−2" })],
  },
  "Deathcap Marionette": { abilities: [mayMillTwo()] },
  Defossilize: {
    spell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "creature card from your graveyard")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "back" }), fx.explore(ref.stored("back"), 2)],
    ),
  },
  "Echo of Dusk": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        { condition: descend(4), label: "Descend 4 — +1/+1 and lifelink" },
      ),
    ],
  },
  "Fanatical Offering": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1 } },
    spell: spell([], [fx.draw(2), fx.createTokens(MAP)]),
  },
  "Fungal Fortitude": {
    enchant: { filter: CREATURE, label: "creature" },
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(when.dies({ attached: "host" }), [fx.toBattlefield(ref.eventObject, { tapped: true })], {
        label: "Returns tapped",
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
        { label: "Deathtouch and lifelink, dread counter" },
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
        label: "Draw, lose 1 life",
      }),
    ],
  },
  "Greedy Freebooter": {
    abilities: [triggered(when.diesSelf, [fx.scry(1), fx.createTokens(TREASURE)], { label: "Scry 1 and Treasure" })],
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
      triggered(when.entersSelf, [fx.draw(1), fx.loseLife(1)], { label: "Draw, lose 1 life" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1), fx.loseLife(1)], { label: "Draw, lose 1 life" }),
    ],
  },
  "Queen's Bay Paladin": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) =>
      triggered(t, [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { counters: FINALITY })], {
        targets: [target.optional(target.cardInGraveyard("t", { subtype: "Vampire" }, "you", "Vampire card"))],
        label: "Vampire from the graveyard (finality)",
      }),
    ),
  },
  "Rampaging Spiketail": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0 and indestructible",
      }),
    ],
  },
  "Ray of Ruin": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }, { types: ["Land"], basic: false }] },
          "creature, Vehicle or nonbasic land",
        ),
      ],
      [fx.exile(ref.target()), fx.scry(1)],
    ),
  },
  "Screaming Phantom": { abilities: [triggered(when.attacksSelf, [fx.mill(1)], { label: "Mill a card" })] },
  "Skullcap Snail": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromOwnHand(ref.target(), "x")], {
        targets: [target.player("t", "opponent")],
        label: "The opponent exiles a card from their hand",
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
        targets: [target.cardInGraveyard("t", CREATURE, "you", "creature card from your graveyard")],
        effects: [fx.toBattlefield(ref.target(), { counters: FINALITY })],
        label: "Creature from the graveyard (finality)",
      }),
    ],
  },
  "Stinging Cave Crawler": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], {
        condition: descend(4),
        label: "Descend 4 — draw, lose 1 life",
      }),
    ],
  },
  "Synapse Necromage": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(FUNGUS, 2)], { label: "Two 1/1 Fungi" })],
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
        label: "+1/+1 counter and menace",
      }),
    ],
  },
  "Broodrage Mycoid": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FUNGUS)], { condition: cond.descended, label: "Descend — 1/1 Fungus" }),
    ],
  },
  "Canonized in Blood": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.descended,
        label: "Descend — +1/+1 counter",
      }),
      activated({
        mana: "{5}{B}{B}",
        sacrifice: true,
        effects: [fx.createTokens(VAMPIRE_DEMON)],
        label: "4/3 Vampire Demon",
      }),
    ],
  },
  "Corpses of the Lost": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Skeleton", controller: "you" },
        { power: 1, addKeywords: ["haste"] },
        {
          label: "Skeletons: +1/+0 and haste",
        },
      ),
      triggered(when.entersSelf, [fx.createTokens(SKELETON_PIRATE)], { label: "2/2 Skeleton Pirate" }),
      triggered(when.yourEndStep, [...fx.mayPayLife(1, "Pay 1 life to return it to your hand?", fx.toHand(ref.self))], {
        condition: cond.descended,
        label: "Descend — 1 life: return it to your hand",
      }),
    ],
  },
  "Deep Goblin Skulltaker": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.descended,
        label: "Descend — +1/+1 counter",
      }),
    ],
  },
  "Primordial Gnawer": { abilities: [triggered(when.diesSelf, [fx.discover(3)], { label: "Discover 3" })] },
  "Stalactite Stalker": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.descended,
        label: "Descend — +1/+1 counter",
      }),
      activated({
        mana: "{2}{B}",
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), amount.neg(amount.lkiPower), amount.neg(amount.lkiPower))],
        label: "−X/−X (its power)",
      }),
    ],
  },
};
