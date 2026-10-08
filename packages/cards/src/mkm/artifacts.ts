/** Murders at Karlov Manor — colorless cards and lands. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  equipAbility,
  fx,
  investigate,
  manaAbility,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const FIVE_COLORS = ["W", "U", "B", "R", "G"] as const;

/** Surveil lands: enter tapped, surveil 1; their mana comes from their basic land types. */
const surveilLand: CardScript = {
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" })],
};

/** "Equip Detective {1}": like Equip, but only onto a Detective you control. */
const EQUIP_DETECTIVE = equipAbility({
  mana: "{1}",
  filter: { subtype: "Detective" },
  targetLabel: "Detective you control",
  label: "Equip Detective {1}",
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Colorless ---------------------------------------------------------------
  "Case of the Shattered Pact": {
    abilities: [triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Search for a basic land card" })],
    caseToSolve: cond.amountAtLeast(amount.colorsAmong(), 5),
    caseSolved: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 0, 0, ["flying", "doubleStrike", "vigilance"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Flying, double strike and vigilance",
      }),
    ],
  },
  "Gravestone Strider": {
    abilities: [
      activated({
        mana: "{1}",
        oncePerTurn: true,
        effects: [fx.addManaChoice(1)],
        label: "One mana of any color (once per turn)",
      }),
      activated({
        mana: "{2}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target())],
        label: "Exile a card from a graveyard",
      }),
    ],
  },
  "Lumbering Laundry": {
    abilities: [
      activated({
        mana: "{2}",
        effects: [fx.thisTurn({ lookAt: "faceDown" })],
        label: "This turn, you can look at face-down creatures your opponents control",
      }),
    ],
  },
  "Magnetic Snuffler": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "eq" }), fx.attach(ref.self, ref.stored("eq"))],
        {
          targets: [target.cardInGraveyard("t", { subtype: "Equipment" }, "you", "Equipment card in your graveyard")],
          label: "Return an Equipment attached to this creature",
        },
      ),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.addCounters(ref.self, 1)], { label: "A +1/+1 counter" }),
    ],
  },
  "Magnifying Glass": {
    abilities: [manaAbility("C"), activated({ mana: "{4}", tap: true, effects: [investigate(1)], label: "Investigate" })],
  },
  "Sanitation Automaton": {
    abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" })],
  },
  "Thinking Cap": {
    // "Equip {3}" is read from the text.
    abilities: [staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }), EQUIP_DETECTIVE],
  },

  // --- Lands -------------------------------------------------------------------
  "Commercial District": surveilLand,
  "Elegant Parlor": surveilLand,
  "Hedge Maze": surveilLand,
  "Lush Portico": surveilLand,
  "Raucous Theater": surveilLand,
  "Shadowy Backstreet": surveilLand,
  "Undercity Sewers": surveilLand,
  "Public Thoroughfare": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.entersSelf,
        [
          fx.tapChosen({ anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] }, "tapped", { exactly: 1 }),
          ...fx.when(cond.not(cond.v("tapped")), fx.sacrificeIt(ref.self)),
        ],
        { label: "Tap an untapped artifact or land, or sacrifice it" },
      ),
      manaAbility([...FIVE_COLORS]),
    ],
  },
  "Scene of the Crime": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility("C"),
      manaAbility([...FIVE_COLORS], 1, { tapAnother: "creature" }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  Cryptex: {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { collectEvidence: 3, addCounter: "unlock" }),
      activated({
        sacrifice: true,
        activationCondition: cond.counterAtLeast("unlock", 5),
        effects: [fx.surveil(3), fx.draw(3)],
        label: "Sacrifice it: surveil 3, then draw three cards",
      }),
    ],
  },
  "Branch of Vitu-Ghazi": {
    // Disguise {3}: read from the text; the land card is cast face down.
    abilities: [
      manaAbility("C"),
      triggered(when.turnedFaceUp, [fx.addManaChoice(2, undefined, undefined, true)], {
        label: "Two mana of one color, kept until end of turn",
      }),
    ],
  },
};
