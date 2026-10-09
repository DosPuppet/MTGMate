/** Lorwyn Eclipsed: colorless cards and lands. */
import type { Color } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  costReducer,
  eventReplacement,
  fx,
  manaAbility,
  ref,
  SHAPESHIFTER,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY = ["W", "U", "B", "R", "G"] as const;

/** The colors, with the label of their ability ("this creature becomes white"). */
const COLORS: { color: Color; label: string }[] = [
  { color: "W", label: "Add {W}; this creature becomes white until end of turn" },
  { color: "U", label: "Add {U}; this creature becomes blue until end of turn" },
  { color: "B", label: "Add {B}; this creature becomes black until end of turn" },
  { color: "R", label: "Add {R}; this creature becomes red until end of turn" },
  { color: "G", label: "Add {G}; this creature becomes green until end of turn" },
];

/** "Choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk": the eight tribes of Lorwyn. */
const LORWYN_TRIBES = ["Elemental", "Elf", "Faerie", "Giant", "Goblin", "Kithkin", "Merfolk", "Treefolk"];

export const ARTIFACTS: Record<string, CardScript> = {
  // Equip {2} read from the text.
  "Mirrormind Crown": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        instead: { copyOfAttached: true, firstEachTurn: true, may: true },
        modify: {},
        label: "The first tokens each turn: copies of the equipped creature",
      }),
    ],
  },
  "Gathering Stone": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      costReducer({ chosen: "subtype" }, 1, "Spells of the chosen type you cast cost {1} less"),
      ...[when.entersSelf, when.yourUpkeep].map((w) =>
        triggered(
          w,
          [
            fx.lookAtTop(1, { filter: { chosen: "subtype" }, rest: "top", store: "g" }),
            ...fx.when(
              cond.not(cond.v("g")),
              ...fx.may("Put the top card into your graveyard?", fx.moveTo(ref.libraryTop(ref.you), { to: "graveyard" })),
            ),
          ],
          { label: "Look at the top card: of the chosen type, into your hand; otherwise, into your graveyard if you wish" },
        ),
      ),
    ],
  },
  // --- Colorless changelings -------------------------------------------------
  "Changeling Wayfinder": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land card?", fx.search(BASIC_LAND)), {
        label: "Search for a basic land card and put it into your hand",
      }),
    ],
  },
  "Rooftop Percher": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.gainLife(3)], {
        targets: [target.upTo(2, target.cardInGraveyard("t", {}, "any", "card in a graveyard"))],
        label: "Exile up to two cards from graveyards; you gain 3 life",
      }),
    ],
  },

  // --- Artifacts ----------------------------------------------------------------
  "Chronicle of Victory": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", chosen: "subtype" },
        { power: 2, toughness: 2, addKeywords: ["firstStrike", "trample"] },
        { label: "Your creatures of the chosen type: +2/+2, first strike and trample" },
      ),
      triggered(when.castSpell("you", { chosen: "subtype" }), [fx.draw(1)], {
        label: "Spell of the chosen type: draw a card",
      }),
    ],
  },
  "Dawn-Blessed Pennant": {
    // A creature type chosen as it enters, among the eight tribes of Lorwyn.
    asEnters: [fx.chooseForSelf("creatureType", { options: LORWYN_TRIBES })],
    abilities: [
      triggered(when.enters({ controller: "you", chosen: "subtype" }), [fx.gainLife(1)], {
        label: "A permanent of the chosen type enters under your control: you gain 1 life",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { chosen: "subtype" }, "you", "card of the chosen type in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a card of the chosen type from your graveyard to your hand",
      }),
    ],
  },
  "Foraging Wickermaw": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      // "{1}: Add one mana of any color. This creature becomes that color until end of turn. Activate only once each
      // turn." One ability per color; "once each turn" for all of them: the creature must still be colorless (it takes
      // the color of the mana until end of turn).
      ...COLORS.map(({ color, label }) =>
        activated({
          mana: "{1}",
          oncePerTurn: true,
          activationCondition: cond.sourceMatches({ colorCount: 0 }),
          effects: [fx.addMana(color), fx.modify(ref.self, { setColors: [color] })],
          label,
        }),
      ),
    ],
  },
  "Puca's Eye": {
    abilities: [
      // The color is chosen during resolution, after the draw (Mondo Gecko: color fixed in the effect).
      triggered(
        when.entersSelf,
        [fx.draw(1), fx.chooseForSelf("color"), fx.modify(ref.self, { setColorsChosen: true }, "permanent")],
        { label: "Draw a card, then choose a color: this artifact becomes that color" },
      ),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.amountAtLeast(amount.colorsAmong(), 5),
        effects: [fx.draw(1)],
        label: "Draw a card (five colors among your permanents)",
      }),
    ],
  },

  // --- Equipment ----------------------------------------------------------------
  "Stalactite Dagger": {
    // Equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SHAPESHIFTER)], {
        label: "Create a 1/1 colorless Shapeshifter token with changeling",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, allCreatureTypes: true },
        { label: "+1/+1; the equipped creature has all creature types" },
      ),
    ],
  },

  // --- Land ----------------------------------------------------------------------
  "Eclipsed Realms": {
    asEnters: [fx.chooseForSelf("creatureType", { options: LORWYN_TRIBES })],
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { chosen: "subtype" }, abilityOfSource: { chosen: "subtype" } },
      }),
    ],
  },
};
