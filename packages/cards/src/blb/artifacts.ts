/** Bloomburrow — artifacts, lands and special cards (no. 262 and beyond). */
import type { ManaAbilityDef } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  doesntUntap,
  FISH,
  FOOD,
  fx,
  kin,
  manaAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const ANY: ("W" | "U" | "B" | "R" | "G")[] = ["W", "U", "B", "R", "G"];

/** "{T}: Add {C}." and "{T}: Add [color]. Spend this mana only to cast a creature spell." */
const village = (color: "W" | "U" | "B" | "R" | "G") => [
  manaAbility("C"),
  manaAbility(color, 1, { restriction: { spell: { types: ["Creature"] } } }),
];

/** Mana ability with a mana cost in addition to {T} (Hidden Grotto, Three Tree City). */
const paidMana = (mana: string, opts: Partial<ManaAbilityDef> = {}): ManaAbilityDef => ({
  ...manaAbility(ANY),
  cost: { tap: true, mana: cost(mana) },
  ...opts,
});

export const ARTIFACTS: Record<string, CardScript> = {
  "Barkform Harvester": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you", "card in your graveyard")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Puts a card from the graveyard on the bottom of the library",
      }),
    ],
  },
  "Bumbleflower's Sharepot": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Food" }),
      activated({
        mana: "{5}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        label: "Destroys a nonland permanent",
      }),
    ],
  },
  "Fountainport Bell": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land (put on top)?", fx.search(BASIC_LAND, { to: "libraryTop" })), {
        label: "Basic land on top of the library",
      }),
      activated({ mana: "{1}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Heirloom Epic": {
    abilities: [
      activated({
        mana: "{4}",
        tap: true,
        sorcerySpeed: true,
        // Approximation: creatures can't help pay this cost.
        effects: [fx.draw(1)],
        label: "Draw a card",
      }),
    ],
  },
  "Patchwork Banner": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", chosen: "subtype" },
        { power: 1, toughness: 1 },
        { label: "+1/+1" },
      ),
      manaAbility(ANY),
    ],
  },
  "Short Bow": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["reach", "vigilance"] },
        { label: "+1/+1, reach, vigilance" },
      ),
    ],
  },
  "Starforged Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        condition: cond.gift,
        targets: [target.creature("t", { controller: "you" })],
        label: "Attaches to a creature",
      }),
      staticAbility("attached", { power: 3, toughness: 3, removeKeywords: ["flying"] }, { label: "+3/+3, loses flying" }),
    ],
  },
  "Tangle Tumbler": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 2 },
        effects: [fx.animateVehicle()],
        label: "Tap two tokens: becomes a creature",
      }),
    ],
  },
  "Fabled Passage": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, undefined, "p"),
          ...fx.when(cond.controls({ types: ["Land"] }, 4), fx.untap(ref.stored("p"))),
        ],
        label: "Searches for a basic land",
      }),
    ],
  },
  Fountainport: {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifice a token: draw",
      }),
      activated({ mana: "{3}", tap: true, payLife: 1, effects: [fx.createTokens(FISH)], label: "1/1 Fish" }),
      activated({ mana: "{4}", tap: true, effects: [fx.createTokens(TREASURE)], label: "Treasure" }),
    ],
  },
  "Hidden Grotto": {
    abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }), manaAbility("C"), paidMana("{1}")],
  },
  "Lilypad Village": {
    abilities: [
      ...village("U"),
      activated({
        mana: "{U}",
        tap: true,
        activationCondition: cond.controls(kin(["Bird", "Frog", "Otter", "Rat"], { enteredThisTurn: true })),
        effects: [fx.surveil(2)],
        label: "Surveil 2",
      }),
    ],
  },
  "Lupinflower Village": {
    abilities: [
      ...village("W"),
      activated({
        mana: "{1}{W}",
        tap: true,
        sacrifice: true,
        effects: [fx.lookAtTop(6, { filter: { types: ["Creature"], anySubtype: ["Bat", "Bird", "Mouse", "Rabbit"] } })],
        label: "Looks at six cards: Bat, Bird, Mouse or Rabbit",
      }),
    ],
  },
  "Mudflat Village": {
    abilities: [
      ...village("B"),
      activated({
        mana: "{1}{B}",
        tap: true,
        sacrifice: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], anySubtype: ["Bat", "Lizard", "Rat", "Squirrel"] },
            "you",
            "Bat, Lizard, Rat or Squirrel",
          ),
        ],
        effects: [fx.toHand(ref.target())],
        label: "Gets back a card",
      }),
    ],
  },
  "Oakhollow Village": {
    abilities: [
      ...village("G"),
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addCountersAll(kin(["Frog", "Rabbit", "Raccoon", "Squirrel"], { enteredThisTurn: true }), 1)],
        label: "+1/+1 counters on the newcomers",
      }),
    ],
  },
  "Rockface Village": {
    abilities: [
      ...village("R"),
      activated({
        mana: "{R}",
        tap: true,
        sorcerySpeed: true,
        targets: [targetObj("t", kin(["Lizard", "Mouse", "Otter", "Raccoon"]), "Lizard, Mouse, Otter or Raccoon")],
        effects: [fx.pump(ref.target(), 1, 0, ["haste"])],
        label: "+1/+0, haste",
      }),
    ],
  },
  "Three Tree City": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      manaAbility("C"),
      paidMana("{2}", { amountOf: { kind: "count", filter: { types: ["Creature"], controller: "you", chosen: "subtype" } } }),
    ],
  },
  // Special cards (outside the main set).
  "Serra Redeemer": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }),
        [fx.addCounters(ref.eventObject, 2)],
        { label: "Two +1/+1 counters" },
      ),
    ],
  },
  "Charmed Sleep": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Taps the creature" }), doesntUntap("attached")],
  },
  "Mind Spring": { spell: spell([], [fx.draw(amount.x)]) },
  "Thieving Otter": {
    abilities: [triggered(when.dealsDamage("self", { to: { players: "opponent" } }), [fx.draw(1)], { label: "Draw a card" })],
  },
  "Flame Lash": { spell: spell([target.any()], [fx.damage(4, ref.target())]) },
  Colossification: {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Taps the creature" }),
      staticAbility("attached", { power: 20, toughness: 20 }, { label: "+20/+20" }),
    ],
  },
  "Rabid Bite": {
    spell: spell(
      [
        target.creature("t", { controller: "you" }),
        targetObj("u", { types: ["Creature"], controller: "opponent" }, "creature you don't control"),
      ],
      [fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())],
    ),
  },
  "Sword of Vengeance": {
    abilities: [
      staticAbility(
        "attached",
        { power: 2, addKeywords: ["firstStrike", "vigilance", "trample", "haste"] },
        { label: "+2/+0, first strike, vigilance, trample, haste" },
      ),
    ],
  },
};
