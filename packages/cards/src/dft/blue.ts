/** Aetherdrift — cartes bleues. */
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

/** Affinité pour les artefacts (702.41) : {1} de moins par artefact que vous contrôlez. */
const AFFINITY_ARTIFACTS = { generic: amount.count({ types: ["Artifact"], controller: "you" }) };

export const BLUE: Record<string, CardScript> = {
  "Bounce Off": { spell: spell([targetCreatureOrVehicle()], [fx.bounce(ref.target())]) },
  "Diversion Unit": {
    abilities: [
      activated({
        mana: "{U}",
        sacrifice: true,
        targets: [target.spell("t", { types: ["Instant", "Sorcery"] }, "éphémère ou rituel")],
        effects: fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counter(ref.target())),
        label: "Contrecarrez un éphémère ou un rituel",
      }),
    ],
  },
  "Flood the Engine": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "créature ou Véhicule" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez le permanent enchanté" }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Perd toutes ses capacités" }),
      doesntUntap("attached"),
    ],
  },
  "Gearseeker Serpent": {
    costReduction: AFFINITY_ARTIFACTS,
    abilities: [
      activated({ mana: "{5}{U}", effects: [fx.pump(ref.self, 0, 0, ["unblockable"])], label: "Imblocable ce tour-ci" }),
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
  Hulldrifter: { abilities: [triggered(when.entersSelf, [fx.draw(2)], { label: "Piochez deux cartes" })] },
  "Memory Guardian": { costReduction: AFFINITY_ARTIFACTS },
  "Midnight Mangler": {
    abilities: [
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        { condition: cond.opponentsTurn, label: "Créature pendant les autres tours" },
      ),
    ],
  },
  "Mu Yanling, Wind Rider": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(VEHICLE)], { label: "Véhicule 3/2" }),
      staticAbility({ subtype: "Vehicle", controller: "you" }, { addKeywords: ["flying"] }, { label: "Vos Véhicules volent" }),
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you", keyword: "flying" }), [fx.draw(1)], {
        label: "Piochez",
      }),
    ],
  },
  "Nimble Thopterist": { abilities: [triggered(when.entersSelf, [fx.createTokens(THOPTER)], { label: "Thopter 1/1" })] },
  "Roadside Blowout": {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { manaValue: 1 }) },
    spell: spell([targetCreatureOrVehicle("t", { controller: "opponent" })], [fx.bounce(ref.target()), fx.draw(1)]),
  },
  "Scrounging Skyray": {
    abilities: [
      triggered(when.discardBatch(), [fx.addCounters(ref.self, amount.eventAmount)], { label: "Autant de marqueurs +1/+1" }),
    ],
  },
  "Spectral Interference": {
    spell: spell(
      [target.spell("t", { types: ["Artifact", "Creature"] }, "sort d'artefact ou de créature")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
    ),
  },
  "Spell Pierce": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
    ),
  },
  "Stall Out": {
    spell: spell([targetCreatureOrVehicle()], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 3)]),
  },
  "Stock Up": { spell: spell([], [fx.lookAtTop(5, { count: 2, rest: "bottom" })]) },
  "Thopter Fabricator": {
    abilities: [triggered(when.draw(2), [fx.createTokens(THOPTER)], { label: "Deuxième carte piochée : Thopter 1/1" })],
  },
  "Transit Mage": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Chercher un artefact de VM 4 ou 5 ?",
          fx.search({ types: ["Artifact"], anyOf: [{ manaValue: 4 }, { manaValue: 5 }] }),
        ),
        { label: "Artefact de VM 4 ou 5" },
      ),
    ],
  },
  "Trip Up": { spell: spell([target.nonland("t")], [fx.topOrBottom(ref.target())]) },
  "Unstoppable Plan": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.permanentsOf(ref.you, { notTypes: ["Land"] }))], {
        label: "Dégagez vos permanents non-terrain",
      }),
    ],
  },
};
