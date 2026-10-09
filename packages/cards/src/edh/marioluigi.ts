/**
 * Commander: "Mario & Luigi" deck (partners Bruse Tarl, Boorish Herder and Reyhan, Last of the Abzan; five colors;
 * Brainstorm's list on Archidekt). +1/+1 counters (Cathars' Crusade, Conclave Mentor, Ghave, Mikaeus, Gavony
 * Township), legendary creatures (Kethis, Jirina Kudro, Henzie's blitz), commander casts counted.
 */
import type { CardScript, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  cmp,
  cond,
  costReducer,
  entersWith,
  eventReplacement,
  fx,
  loyalty,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TO_PLAYER,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const WITH_COUNTER: ObjectFilter = { ...CREATURES_YOU, withCounter: "+1/+1" };
/** "Put a +1/+1 counter on each creature you control." */
const counterOnEach = fx.addCountersAll(CREATURES_YOU, 1);

const EGG: TokenSpec = {
  name: "Egg",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Egg"],
  power: 0,
  toughness: 1,
  keywords: ["defender"],
};
const BEAST_3: TokenSpec = { name: "Beast", colors: ["G"], types: ["Creature"], subtypes: ["Beast"], power: 3, toughness: 3 };
const SAPROLING: TokenSpec = {
  name: "Saproling",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Saproling"],
  power: 1,
  toughness: 1,
};
const HUMAN_SOLDIER: TokenSpec = {
  name: "Human Soldier",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Human", "Soldier"],
  power: 1,
  toughness: 1,
};
const BANANA: TokenSpec = {
  name: "Banana",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [
    activated({
      tap: true,
      sacrifice: true,
      effects: [fx.addManaChoice(1, ["R", "G"]), fx.gainLife(2)],
      label: "Add {R} or {G}, gain 2 life",
    }),
  ],
  text: "{T}, Sacrifice this token: Add {R} or {G}. You gain 2 life.",
};

export const EDH_MARIO_LUIGI: Record<string, CardScript> = {
  // --- Commanders (Partner: read from the text by the deck rules) -----------------------------------------------------
  "Bruse Tarl, Boorish Herder": {
    abilities: [when.entersSelf, when.attacksSelf].map((trigger) =>
      triggered(trigger, [fx.modify(ref.target(), { addKeywords: ["doubleStrike", "lifelink"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature you control gains double strike and lifelink until end of turn",
      }),
    ),
  },
  "Reyhan, Last of the Abzan": {
    abilities: [
      entersWith({ counters: 3 }),
      // "Dies or is put into the command zone": from the battlefield to the graveyard or the command zone.
      // "If it had one or more +1/+1 counters": read at resolution, from its last known information.
      triggered(
        when.zoneChange(["battlefield"], { to: ["graveyard", "command"], filter: CREATURES_YOU }),
        fx.when(
          cond.amountAtLeast(amount.countersOn(ref.eventObject), 1),
          fx.may(
            "Put that many +1/+1 counters on the target creature?",
            fx.addCounters(ref.target(), amount.countersOn(ref.eventObject)),
          ),
        ),
        {
          targets: [target.creature()],
          label: "A creature with +1/+1 counters dies or goes to the command zone: move that many counters",
        },
      ),
    ],
  },

  // --- Creatures ------------------------------------------------------------------------------------------------------
  "Abzan Falconer": {
    // Outlast {W}: read from the text.
    abilities: [
      staticAbility(WITH_COUNTER, { addKeywords: ["flying"] }, { label: "Your creatures with a +1/+1 counter have flying" }),
    ],
  },
  "Atla Palani, Nest Tender": {
    abilities: [
      activated({ mana: "{2}", tap: true, effects: [fx.createTokens(EGG)], label: "Create a 0/1 Egg with defender" }),
      triggered(
        when.dies({ subtype: "Egg", controller: "you" }),
        [fx.revealUntil({ types: ["Creature"] }, { to: "battlefield" })],
        {
          label: "An Egg dies: reveal until a creature card and put it onto the battlefield",
        },
      ),
    ],
  },
  "Champion of Lambholt": {
    abilities: [
      staticAbility(
        CREATURES_YOU,
        { addBlockRules: [{ cantBeBlockedByWeakerThan: "source", label: "Can't be blocked by creatures weaker than Champion" }] },
        { label: "Creatures with power less than Champion's can't block your creatures" },
      ),
      triggered(when.enters({ ...CREATURES_YOU, other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another creature enters: a +1/+1 counter on it",
      }),
    ],
  },
  "Conclave Mentor": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "+1/+1 counters on your creatures: that many plus one",
      }),
      triggered(when.diesSelf, [fx.gainLife(amount.powerOf(ref.eventObject))], {
        label: "Dies: you gain life equal to its power",
      }),
    ],
  },
  "Dusk Legion Duelist": {
    // Vigilance: read from the text.
    abilities: [
      triggered(when.countersPut("self", "+1/+1"), [fx.draw(1)], {
        oncePerTurn: true,
        label: "+1/+1 counters on it: draw a card (once each turn)",
      }),
    ],
  },
  "Ghave, Guru of Spores": {
    abilities: [
      entersWith({ counters: 5 }),
      activated({
        mana: "{1}",
        removeCounterFrom: { filter: CREATURES_YOU, kind: "+1/+1" },
        effects: [fx.createTokens(SAPROLING)],
        label: "Remove a +1/+1 counter from a creature you control: a 1/1 Saproling",
      }),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] }, includeSelf: true },
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Sacrifice a creature: a +1/+1 counter on target creature",
      }),
    ],
  },
  "Grenzo, Dungeon Warden": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({
        mana: "{2}",
        effects: [
          fx.moveTo(ref.libraryBottom(ref.you), { to: "graveyard" }, { name: "g" }),
          ...fx.when(
            cond.refMatches(ref.stored("g"), { types: ["Creature"], compare: [cmp.power("<=", amount.sourcePower)] }),
            fx.toBattlefield(ref.stored("g")),
          ),
        ],
        label: "Bottom card into the graveyard; a creature with power up to Grenzo's enters",
      }),
    ],
  },
  'Henzie "Toolbox" Torre': {
    abilities: [
      playerStatic({
        altCostAll: { blitz: { reduce: amount.commanderCasts }, filter: { types: ["Creature"], minManaValue: 4 } },
        label: "Your creature spells with mana value 4 or greater have blitz (their mana cost, {1} less per commander cast)",
      }),
    ],
  },
  "Jirina Kudro": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HUMAN_SOLDIER, amount.commanderCasts)], {
        label: "A 1/1 Human Soldier for each time you've cast a commander from the command zone",
      }),
      staticAbility(
        { subtype: "Human", controller: "you", other: true },
        { power: 2 },
        { label: "Other Humans you control get +2/+0" },
      ),
    ],
  },
  "Kethis, the Hidden Hand": {
    abilities: [
      costReducer({ legendary: true }, 1, "Legendary spells you cast cost {1} less"),
      activated({
        exileFromGraveyard: { filter: { legendary: true }, count: 2 },
        effects: [fx.thisTurn({ playFrom: { zone: "graveyard", filter: { legendary: true } } })],
        label: "Exile two legendary cards: legendary cards in your graveyard are playable this turn",
      }),
    ],
  },
  "Kibo, Uktabi Prince": {
    abilities: [
      activated({ tap: true, effects: [fx.createTokens(BANANA, 1, ref.eachPlayer)], label: "Each player creates a Banana" }),
      triggered(
        when.zoneChange(["battlefield"], { to: ["graveyard"], filter: { types: ["Artifact"], controller: "opponent" } }),
        [fx.addCountersAll({ ...CREATURES_YOU, anySubtype: ["Ape", "Monkey"] }, 1)],
        { label: "An opponent's artifact goes to a graveyard: a +1/+1 counter on each Ape and Monkey you control" },
      ),
      triggered(when.attacksSelf, [fx.sacrifice(ref.defendingPlayer, { types: ["Artifact"] }, 1)], {
        label: "Attacks: the defending player sacrifices an artifact",
      }),
    ],
  },
  "Kresh the Bloodbraided": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], other: true }),
        fx.may(
          "Put X +1/+1 counters on Kresh (X: that creature's power)?",
          fx.addCounters(ref.self, amount.powerOf(ref.eventObject)),
        ),
        { label: "Another creature dies: you may put X +1/+1 counters on Kresh (its power)" },
      ),
    ],
  },
  "Loyal Guardian": {
    // Trample: read from the text.
    abilities: [
      triggered(when.yourCombat, [counterOnEach], {
        condition: cond.controls({ commander: true }),
        label: "Lieutenant — a +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Mikaeus, the Lunarch": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({ tap: true, effects: [fx.addCounters(ref.self, 1)], label: "A +1/+1 counter on Mikaeus" }),
      activated({
        tap: true,
        removeCounters: { kind: "+1/+1", n: 1 },
        effects: [fx.addCountersAll({ ...CREATURES_YOU, other: true }, 1)],
        label: "Remove a +1/+1 counter from Mikaeus: a +1/+1 counter on each other creature you control",
      }),
    ],
  },
  "Saskia the Unyielding": {
    // Vigilance, haste: read from the text.
    asEnters: [fx.chooseForSelf("player")],
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: CREATURES_YOU, to: TO_PLAYER },
        [fx.damage(amount.eventAmount, ref.chosenPlayer, ref.eventObject)],
        { label: "A creature you control deals combat damage to a player: as much to the chosen player" },
      ),
    ],
  },
  "The Balrog of Moria": {
    // Trample, haste, cycling: read from the text.
    abilities: [
      triggered(
        when.diesSelf,
        fx.may(
          "Exile The Balrog of Moria?",
          fx.exileCard(ref.selfCard),
          fx.reflexive(
            [{ ...target.upTo(5, target.creature("t", { controller: "opponent" })), differentPlayers: true }],
            [fx.exile(ref.target())],
          ),
        ),
        { label: "Dies: you may exile it; then exile up to one creature of each opponent" },
      ),
      triggered(when.cycleSelf, [fx.createTokens(TREASURE, 2)], {
        fromGraveyard: true,
        label: "When you cycle it: two Treasure tokens",
      }),
    ],
  },
  "Tuskguard Captain": {
    // Outlast {G}: read from the text.
    abilities: [
      staticAbility(WITH_COUNTER, { addKeywords: ["trample"] }, { label: "Your creatures with a +1/+1 counter have trample" }),
    ],
  },

  // --- Planeswalkers --------------------------------------------------------------------------------------------------
  "Jiang Yanggu, Wildcrafter": {
    abilities: [
      staticAbility(
        WITH_COUNTER,
        { addAbilities: [manaAbility(ANY_COLOR)] },
        {
          label: 'Your creatures with a +1/+1 counter have "{T}: Add one mana of any color"',
        },
      ),
      loyalty(-1, {
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "A +1/+1 counter on target creature",
      }),
    ],
  },
  "Samut, the Tested": {
    abilities: [
      loyalty(1, {
        targets: [target.upTo(1, target.creature())],
        effects: [fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })],
        label: "Up to one creature gains double strike",
      }),
      loyalty(-2, {
        targets: [target.between(1, 2, target.any())],
        effects: [fx.damageDivided(2, ref.target())],
        label: "2 damage divided among one or two targets",
      }),
      loyalty(-7, {
        effects: [fx.search({ types: ["Creature", "Planeswalker"] }, { to: "battlefield" }, 2)],
        label: "Up to two creature and/or planeswalker cards onto the battlefield",
      }),
    ],
  },

  // --- Artifacts, enchantments and lands ------------------------------------------------------------------------------
  "Boros Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("R", "W")], label: "Add {R}{W}" })] },
  "Golgari Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("B", "G")], label: "Add {B}{G}" })] },
  "Cathars' Crusade": {
    abilities: [
      triggered(when.enters(CREATURES_YOU), [counterOnEach], {
        label: "A creature you control enters: a +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Elemental Bond": {
    abilities: [
      triggered(when.enters({ ...CREATURES_YOU, minPower: 3 }), [fx.draw(1)], {
        label: "A creature with power 3 or greater enters: draw a card",
      }),
    ],
  },
  "Greater Good": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.draw(amount.powerOf(ref.costSacrificed)), fx.discard(3)],
        label: "Sacrifice a creature: draw cards equal to its power, then discard three cards",
      }),
    ],
  },
  "Invigorating Hot Spring": {
    abilities: [
      entersWith({ counters: 4 }),
      staticAbility(
        { ...CREATURES_YOU, modified: true },
        { addKeywords: ["haste"] },
        { label: "Modified creatures you control have haste" },
      ),
      activated({
        removeCounters: { kind: "+1/+1", n: 1 },
        sorcerySpeed: true,
        oncePerTurn: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Move a +1/+1 counter to a creature you control (once each turn)",
      }),
    ],
  },
  "Mayael's Aria": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          ...fx.when(cond.controls({ types: ["Creature"], minPower: 5 }), counterOnEach),
          ...fx.when(cond.controls({ types: ["Creature"], minPower: 10 }), fx.gainLife(10)),
          ...fx.when(cond.controls({ types: ["Creature"], minPower: 20 }), fx.winGame),
        ],
        { label: "Power 5: counters; power 10: 10 life; power 20: you win the game" },
      ),
    ],
  },
  "Gavony Township": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}{G}{W}",
        tap: true,
        effects: [counterOnEach],
        label: "A +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Kazuul's Cliffs": { abilities: [entersWith({ tapped: true }), manaAbility("R")] },

  // --- Spells ---------------------------------------------------------------------------------------------------------
  "Beast Within": {
    spell: spell(
      [target.permanent("t", [], {}, "permanent")],
      [fx.destroy(ref.target()), fx.createTokens(BEAST_3, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Kazuul's Fury": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([target.any()], [fx.damage(amount.powerOf(ref.costSacrificed), ref.target())]),
  },
  "Nature's Lore": { spell: spell([], [fx.search({ subtype: "Forest" }, { to: "battlefield" })]) },
  "Overwhelming Stampede": {
    spell: spell([], [fx.pumpAll(CREATURES_YOU, amount.maxPower(CREATURES_YOU), amount.maxPower(CREATURES_YOU), ["trample"])]),
  },
  "Single Combat": {
    spell: spell(
      [],
      [
        fx.keep(ref.eachPlayer, "one", { types: ["Creature", "Planeswalker"] }, { chooser: "each", fate: "sacrifice" }),
        {
          op: "playerEffect",
          ability: { castLimit: { who: "you", maxSpells: 0, spellTypes: { types: ["Creature", "Planeswalker"] } } },
          who: ref.eachPlayer,
          duration: "throughYourNextTurn",
        },
      ],
    ),
  },
};
