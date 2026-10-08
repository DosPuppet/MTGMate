/**
 * The Hobbit — black cards (lot A). Flying, deathtouch, menace, equip and "can't block" (technical keyword) are read
 * from the text or written here; amass Goblins: `fx.amass`.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  cost,
  fx,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** "an artifact or creature" (sacrifice costs). */
const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
const CREATURE_CARD = target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card from your graveyard");

export const BLACK: Record<string, CardScript> = {
  "Along the Crooked Way": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [CREATURE_CARD],
        label: "A creature card from your graveyard returns to hand",
      }),
      triggered(
        when.zoneChange(["graveyard"], { filter: { types: ["Creature"] }, whose: "you" }),
        [fx.amass(ref.you, "Goblin", 1)],
        { label: "A creature card leaves your graveyard: amass Goblins 1" },
      ),
      activated({
        mana: "{1}{B}",
        effects: [
          fx.modifyAll({ types: ["Creature"], anySubtype: ["Goblin", "Orc"], controller: "you" }, { addKeywords: ["menace"] }),
        ],
        label: "Your Goblins and Orcs gain menace",
      }),
    ],
  },
  "Bilbo's Deadly Slice": { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Crude Bent Blade": {
    // Equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"] })], {
        targets: [target.player("t", "opponent")],
        label: "An opponent sacrifices a creature",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Down, Down to Goblin-town": {
    abilities: [
      chapter([1], [fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } })], {
        targets: [target.player("t", "opponent")],
        label: "Chapter I — An opponent discards a nonland card of your choice",
      }),
      chapter([2], [fx.amass(ref.you, "Goblin", 1)], { label: "Chapter II — Amass Goblins 1" }),
      chapter([3, 4], [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "Chapters III, IV — An opponent loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Dreaded Bat-Cloud": { costReduction: { generic: 3, condition: cond.morbid } },
  "Front Porch Sentries": {
    abilities: [
      triggered(when.diesSelf, [fx.pump(ref.target(), -1, -1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "An opponent's creature gets -1/-1",
      }),
    ],
  },
  "Gathering of Darkness": {
    spell: spell([target.upTo(1, CREATURE_CARD)], [fx.toHand(ref.target()), fx.amass(ref.you, "Goblin", 3)]),
  },
  "Gnashing of Teeth": {
    spell: modal(
      mode(
        "A creature gets -5/-5 (exiled if it dies)",
        [target.creature("c")],
        [fx.exileIfDies(ref.target("c")), fx.pump(ref.target("c"), -5, -5)],
      ),
      mode(
        "A player's creatures get -1/-1",
        [target.player("p")],
        [fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), -1, -1)],
      ),
    ),
  },
  // --- Gollum, Silent Slinker // Meager Meal: menace is read from the text. ---
  "Gollum, Silent Slinker": {},
  "Meager Meal": {
    spell: spell(
      [target.upTo(1, target.creature("c")), target.player("p")],
      [fx.addCounters(ref.target("c"), 1), fx.gainLife(2, ref.target("p"))],
    ),
  },
  "Gollum the Abandoned": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.loseLife(2, ref.eachOpponent)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "opponent", "card from an opponent's graveyard"))],
        label: "Exile a card from an opponent's graveyard; each opponent loses 2 life",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: ARTIFACT_OR_CREATURE },
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from the graveyard to hand",
      }),
    ],
  },
  "Great Fierce Bee": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.scry(1)], {
        batched: true,
        label: "One or more other creatures die: scry 1",
      }),
    ],
  },
  // --- Great Ugly-Looking Goblin // Clap! Snap! ---
  "Great Ugly-Looking Goblin": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["menace"] },
        { label: "Your creatures with a +1/+1 counter have menace" },
      ),
    ],
  },
  "Clap! Snap!": { spell: spell([], [fx.amass(ref.you, "Goblin", 2)]) },
  "Rage into the Valley": {
    spell: spell([], [fx.draw(1), fx.loseLife(1), fx.amass(ref.you, "Goblin", 2)]),
  },
  "Ravening Warg": {
    abilities: [
      triggered(when.attacksSelf, [fx.gainLife(2)], {
        condition: cond.ferocious,
        label: "Ferocious: you gain 2 life",
      }),
    ],
  },
  "Reverent Howl": {
    spell: modal(
      mode(
        "A player draws two cards and loses 2 life",
        [target.player("p")],
        [fx.draw(2, ref.target("p")), fx.loseLife(2, ref.target("p"))],
      ),
      mode("A creature gets +2/+2 and gains lifelink", [target.creature("c")], [fx.pump(ref.target("c"), 2, 2, ["lifelink"])]),
    ),
  },
  "Rhovanion Rampager": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.addCounters(ref.self, amount.powerOf(ref.stored("s")))),
        ],
        { label: "Optional sacrifice: +1/+1 counters equal to its power" },
      ),
      triggered(when.diesSelf, [fx.amass(ref.you, "Goblin", amount.lkiPower)], {
        label: "Amass Goblins X (its power)",
      }),
    ],
  },
  "Stir Up Trouble": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1, orPay: cost("{4}") } },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Stony-Voiced Goblins": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Each opponent discards a card" })],
  },
};
