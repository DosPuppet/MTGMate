/** Teenage Mutant Ninja Turtles — colorless cards and lands (lot A). */
import type { ManaType, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  MUTANT,
  manaAbility,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** Other artifact creatures you control. */
const OTHER_ARTIFACT_CREATURES: ObjectFilter = {
  types: ["Artifact"],
  anyOf: [{ types: ["Creature"] }],
  controller: "you",
  other: true,
};

/** Ninja or Turtle. */
const NINJA_OR_TURTLE: ObjectFilter = { anySubtype: ["Ninja", "Turtle"] };

/** Two-color lands "enters tapped; when it enters, you gain 1 life". */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "You gain 1 life" }),
    manaAbility([a, b]),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artifacts ---------------------------------------------------------------
  "Chrome Dome": {
    abilities: [
      staticAbility(OTHER_ARTIFACT_CREATURES, { power: 1 }, { label: "Your other artifact creatures: +1/+0" }),
      activated({
        mana: "{5}",
        targets: [target.permanent("t", ["Artifact"], { controller: "you", other: true }, "other artifact you control")],
        effects: [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "A token copy of another artifact you control, with haste, sacrificed at end of turn",
      }),
    ],
  },
  "Everything Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Search for a basic land card" }),
      activated({
        mana: "{2}{W}{U}{B}{R}{G}",
        tap: true,
        sacrifice: true,
        targets: [target.player("p"), target.any("d"), target.upTo(1, target.creature("c"))],
        effects: [
          fx.gainLife(3, ref.target("p")),
          fx.draw(1, ref.target("p")),
          fx.discard(1, ref.eachOpponent),
          fx.damage(3, ref.target("d")),
          fx.addCounters(ref.target("c"), 3),
        ],
        label: "3 life and a card, opponents discard, 3 damage, three +1/+1 counters",
      }),
    ],
  },
  Henchbots: {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Exile a tapped creature an opponent controls until the Henchbots leave",
      }),
    ],
  },
  "Krang, Utrom Warlord": {
    // Flying, trample, indestructible and haste: read from the text.
    abilities: [
      staticAbility(
        OTHER_ARTIFACT_CREATURES,
        { addKeywords: ["flying", "trample", "indestructible", "haste"] },
        { label: "Your other artifact creatures: flying, trample, indestructible, haste" },
      ),
    ],
  },
  "Omni-Cheese Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      // Mana ability (605.3b): with no target, it adds mana.
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.addManaChoice(1)],
        label: "One mana of any color",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "You gain 3 life" }),
    ],
  },
  Technodrome: {
    // Reach and trample: read from the text.
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        { condition: cond.not(cond.sourceMatches({ minPower: 6 })), label: "Can't attack or block with power less than 6" },
      ),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.draw(1), fx.addCounters(ref.self, 1)],
        label: "Draw a card and a +1/+1 counter",
      }),
    ],
  },
  "Turtle Blimp": {
    // Flying and crew 2: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "A 2/2 Mutant" })],
  },
  "Turtle Van": {
    // Crew 1: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCounters(ref.target(), 1),
          fx.when(cond.refMatches(ref.target(), { anySubtype: ["Mutant", "Ninja", "Turtle"] }), fx.doubleCounters(ref.target())),
        ],
        {
          targets: [{ ...target.creature("t", { crew: "source" }), label: "creature that crewed this Vehicle this turn" }],
          label: "A +1/+1 counter on a creature that crewed it (doubled if Mutant, Ninja or Turtle)",
        },
      ),
    ],
  },
  "Weather Maker": {
    abilities: [
      triggered(when.landfall, [fx.counters(ref.self, "charge")], { label: "Landfall: a charge counter" }),
      manaAbility(ANY_COLOR),
      activated({
        tap: true,
        removeCounters: { kind: "charge", n: 2 },
        effects: [fx.addMana("C", "C")],
        label: "Remove two charge counters: {C}{C}",
      }),
      activated({
        tap: true,
        removeCounters: { kind: "charge", n: 3 },
        targets: [target.any()],
        effects: [fx.damage(3, ref.target())],
        label: "Remove three charge counters: 3 damage",
      }),
    ],
  },

  // --- Lands -------------------------------------------------------------------
  "Dimension X": gainLand("R", "W"),
  "Foot Headquarters": gainLand("W", "B"),
  "Illegitimate Business": gainLand("B", "G"),
  "Mutant Town": gainLand("G", "U"),
  "Northampton Farm": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { owner: "you" })],
        effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
        label: "Exile a creature you own",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.chooseAmong(ref.filtered(ref.linked, { types: ["Creature"] }), ref.you, "c", { anyZone: true }),
          fx.toBattlefield(ref.stored("c"), { underYourControl: true }),
          // The other cards exiled with this land (the chosen creature has already changed zones).
          fx.toHand(ref.linked),
        ],
        label: "An exiled creature returns under your control, the other cards to hand",
      }),
    ],
  },
  "TCRI Building": gainLand("U", "R"),
  "Turtle Lair": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: NINJA_OR_TURTLE } }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t", NINJA_OR_TURTLE)],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "A Ninja or Turtle can't be blocked this turn",
      }),
    ],
  },
};
