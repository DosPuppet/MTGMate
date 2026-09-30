/** Aetherdrift — cartes noires. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  cond,
  fx,
  pilot,
  powerFor,
  powerRuleAbility,
  ref,
  spell,
  staticAbility,
  target,
  targetCreatureOrVehicle,
  targetObj,
  triggered,
  when,
  ZOMBIE,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Back on Track": {
    spell: spell(
      [target.cardInGraveyard("t", CREATURE_OR_VEHICLE, "you", "carte de créature ou de Véhicule")],
      [fx.toBattlefield(ref.target()), pilot()],
    ),
  },
  Bloodghast: {
    abilities: [
      staticAbility("self", { addKeywords: ["cantBlock"] }, { label: "Ne peut pas bloquer" }),
      staticAbility("self", { addKeywords: ["haste"] }, { condition: cond.opponentLifeAtMost(10), label: "Célérité" }),
      triggered(when.landfall, fx.may("Renvoyer Bloodghast sur le champ de bataille ?", fx.toBattlefield(ref.self)), {
        fromGraveyard: true,
        label: "Landfall : revient du cimetière",
      }),
    ],
  },
  "Carrion Cruiser": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(2),
          fx.pickFromZone(
            "graveyard",
            CREATURE_OR_VEHICLE,
            { to: "hand" },
            { prompt: "Reprenez une carte de créature ou de Véhicule" },
          ),
        ],
        { label: "Meulez deux cartes, reprenez une créature ou un Véhicule" },
      ),
    ],
  },
  "Chitin Gravestalker": { costReduction: { generic: amount.countIn("graveyard", CREATURE_OR_ARTIFACT) } },
  "Cryptcaller Chariot": {
    abilities: [
      triggered(when.discardBatch(), [fx.createTappedTokens(ZOMBIE, amount.eventAmount)], { label: "Autant de Zombies engagés" }),
    ],
  },
  "Deathless Pilot": {
    abilities: [
      powerRuleAbility(powerFor.pilot),
      activated({ mana: "{3}{B}", fromGraveyard: true, effects: [fx.toHand(ref.self)], label: "Revenir en main" }),
    ],
  },
  "Engine Rat": {
    abilities: [activated({ mana: "{5}{B}", effects: [fx.loseLife(2, ref.eachOpponent)], label: "Chaque adversaire perd 2 PV" })],
  },
  "Grim Bauble": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -2, -2)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-2/-2",
      }),
      activated({ mana: "{2}{B}", tap: true, sacrifice: true, effects: [fx.surveil(2)], label: "Surveillance 2" }),
    ],
  },
  "Grim Javelineer": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.modify(ref.target(), {
            power: 1,
            addAbilities: [triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
          }),
        ],
        { targets: [target.creature("t", { attacking: true })], label: "+1/+0" },
      ),
    ],
  },
  "Hellish Sideswipe": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ARTIFACT, count: 1 } },
    spell: spell(
      [targetCreatureOrVehicle()],
      [fx.destroy(ref.target()), fx.when(cond.refMatches(ref.costSacrificed, { subtype: "Vehicle" }), fx.draw(1))],
    ),
  },
  "Locust Spray": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -1, -1)]) },
  "Maximum Overdrive": {
    spell: spell(
      [target.creature("t")],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["deathtouch", "indestructible"])],
    ),
  },
  "Pactdoll Terror": {
    abilities: [triggered(when.enters({ types: ["Artifact"], controller: "you" }), fx.drain(1), { label: "Drain 1" })],
  },
  "Quag Feast": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Creature", "Planeswalker"] }, { subtype: "Vehicle" }] },
          "créature, planeswalker ou Véhicule",
        ),
      ],
      [
        fx.mill(2),
        fx.when(
          cond.amountAtLeast(amount.plus(amount.cardsIn("graveyard"), amount.neg(amount.manaValueOf(ref.target()))), 0),
          fx.destroy(ref.target()),
        ),
      ],
    ),
  },
  "Ripclaw Wrangler": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Chaque adversaire défausse" })],
  },
  "Risky Shortcut": { spell: spell([], [fx.draw(2), fx.loseLife(2, ref.eachPlayer)]) },
  "Shefet Archfiend": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], other: true }, -2, -2)], {
        label: "Les autres créatures -2/-2",
      }),
    ],
  },
  "Spin Out": { spell: spell([targetCreatureOrVehicle()], [fx.destroy(ref.target())]) },
  "Syphon Fuel": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -6, -6), fx.gainLife(2)]) },
  "Wreckage Wickerfolk": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })] },
  "Wretched Doll": {
    abilities: [activated({ mana: "{B}", tap: true, effects: [fx.surveil(1)], label: "Surveillance 1" })],
  },
};
