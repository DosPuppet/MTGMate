/** Aetherdrift — blue cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_VEHICLE,
  cond,
  doesntUntap,
  fx,
  manaAbility,
  ref,
  spell,
  staticAbility,
  THOPTER,
  target,
  targetCreatureOrVehicle,
  triggered,
  VEHICLE,
  when,
  whenCycled,
} from "./common";

/** Affinity for artifacts (702.41): {1} less for each artifact you control. */
const AFFINITY_ARTIFACTS = { generic: amount.count({ types: ["Artifact"], controller: "you" }) };

export const BLUE: Record<string, CardScript> = {
  "Bounce Off": { spell: spell([targetCreatureOrVehicle()], [fx.bounce(ref.target())]) },
  "Diversion Unit": {
    abilities: [
      activated({
        mana: "{U}",
        sacrifice: true,
        targets: [target.spell("t", { types: ["Instant", "Sorcery"] }, "instant or sorcery")],
        effects: fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counter(ref.target())),
        label: "Counter an instant or sorcery",
      }),
    ],
  },
  "Flood the Engine": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "creature or Vehicle" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the enchanted permanent" }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Loses all abilities" }),
      doesntUntap("attached"),
    ],
  },
  "Gearseeker Serpent": {
    costReduction: AFFINITY_ARTIFACTS,
    abilities: [
      activated({ mana: "{5}{U}", effects: [fx.pump(ref.self, 0, 0, ["unblockable"])], label: "Unblockable this turn" }),
    ],
  },
  "Guidelight Optimizer": {
    abilities: [manaAbility("U", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  },
  "Howler's Heavy": {
    abilities: [
      whenCycled([fx.pump(ref.target(), -3, 0)], {
        targets: [targetCreatureOrVehicle("t", { controller: "opponent" })],
        label: "-3/-0",
      }),
    ],
  },
  Hulldrifter: { abilities: [triggered(when.entersSelf, [fx.draw(2)], { label: "Draw two cards" })] },
  "Memory Guardian": { costReduction: AFFINITY_ARTIFACTS },
  "Midnight Mangler": {
    abilities: [
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        { condition: cond.opponentsTurn, label: "Creature during other turns" },
      ),
    ],
  },
  "Mu Yanling, Wind Rider": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(VEHICLE)], { label: "3/2 Vehicle" }),
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { addKeywords: ["flying"] },
        { label: "Your Vehicles have flying" },
      ),
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you", keyword: "flying" }), [fx.draw(1)], {
        label: "Draw",
      }),
    ],
  },
  "Nimble Thopterist": { abilities: [triggered(when.entersSelf, [fx.createTokens(THOPTER)], { label: "1/1 Thopter" })] },
  "Roadside Blowout": {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { manaValue: 1 }) },
    spell: spell([targetCreatureOrVehicle("t", { controller: "opponent" })], [fx.bounce(ref.target()), fx.draw(1)]),
  },
  "Scrounging Skyray": {
    abilities: [
      triggered(when.discardBatch(), [fx.addCounters(ref.self, amount.eventAmount)], { label: "That many +1/+1 counters" }),
    ],
  },
  "Spectral Interference": {
    spell: spell(
      [target.spell("t", { types: ["Artifact", "Creature"] }, "artifact or creature spell")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
    ),
  },
  "Spell Pierce": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
    ),
  },
  "Stall Out": {
    spell: spell([targetCreatureOrVehicle()], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 3)]),
  },
  "Stock Up": { spell: spell([], [fx.lookAtTop(5, { count: 2, rest: "bottom" })]) },
  "Thopter Fabricator": {
    abilities: [triggered(when.draw(2), [fx.createTokens(THOPTER)], { label: "Second card drawn: 1/1 Thopter" })],
  },
  "Transit Mage": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Search for an artifact with mana value 4 or 5?",
          fx.search({ types: ["Artifact"], anyOf: [{ manaValue: 4 }, { manaValue: 5 }] }),
        ),
        { label: "Artifact with mana value 4 or 5" },
      ),
    ],
  },
  "Trip Up": { spell: spell([target.nonland("t")], [fx.topOrBottom(ref.target())]) },
  "Unstoppable Plan": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.permanentsOf(ref.you, { notTypes: ["Land"] }))], {
        label: "Untap your nonland permanents",
      }),
    ],
  },
};
