/** Reality Fracture — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  modal,
  mode,
  OMIT_VARIABLES,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Cast Away Doubt": { spell: spell([], [fx.draw(2), fx.damage(2, ref.eachPlayer)]) },
  "Darklight Phoenix": {
    abilities: [
      triggered(when.yourCombat, [fx.toBattlefield(ref.self)], {
        condition: cond.creaturesDied(2),
        fromGraveyard: true,
        label: "Deux créatures mortes : revient du cimetière",
      }),
    ],
  },
  "Last Gasp": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -3, -3)]) },
  "Multiply by Zero": {
    spell: spell([target.creature("t")], [fx.modify(ref.target(), { setPower: 0, setToughness: 0 })]),
  },
  "Rampart Hunter": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["deathtouch"])], {
        targets: [target.creature("t")],
        label: "+2/+2 et contact mortel",
      }),
    ],
  },
  "Rank Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" })],
  },
  "Rise of the Deathbringer": {
    spell: modal(
      mode(
        "Piocher selon la plus grande force, perdre autant de PV",
        [],
        [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL)), fx.loseLife(amount.maxPower(CREATURE_YOU_CONTROL))],
      ),
      mode("Toutes les créatures -3/-3", [], [fx.pumpAll({ types: ["Creature"] }, -3, -3)]),
    ),
  },
  "Screeching Soulbreaker": {
    abilities: [triggered(when.attacksSelf, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], { label: "1 blessure, +1 PV" })],
  },
  "Theoretical Necromancer": {
    abilities: [
      activated({
        mana: "{3}{B}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "autre carte de créature")],
        effects: [fx.toHand(ref.target())],
        label: "Récupérer une créature",
      }),
    ],
  },
  "Tinybones, Pocket Nuisance": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" }),
      triggered(when.discard("any"), [fx.damage(1, ref.eachOpponent)], { label: "défausse : 1 blessure" }),
    ],
  },
  "Apex Witchstalker": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 PV" }),
      triggered(when.diesSelf, [fx.gainLife(2)], { label: "+2 PV" }),
    ],
  },
  "Proft, Sinister Mastermind": {
    castCondition: cond.threshold,
    abilities: [
      activated({
        mana: "{B}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), -3, -1)],
        label: "Défaussez : -3/-1",
      }),
    ],
  },
  "Liliana the Repentant": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], controller: "you", other: true }),
        [fx.mill(2)],
        { label: "meule 2" },
      ),
      // Exhaust : une seule activation.
      activated({
        mana: "{5}{B}",
        once: true,
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] },
            "you",
            "carte de créature ou de planeswalker de votre cimetière",
          ),
        ],
        effects: [fx.toBattlefield(ref.target()), fx.addCounters(ref.self, 1)],
        label: "Épuisement : réanimer",
      }),
    ],
  },
  "Bloodline Recollector": {
    prepareSpell: spell([target.player("t")], [fx.draw(3, ref.target()), fx.loseLife(3, ref.target())]),
    abilities: [
      triggered(when.eachEndStep, [fx.prepare(ref.self)], {
        condition: cond.creaturesDied(3),
        label: "trois créatures mortes : préparée",
      }),
    ],
  },
  "Void Extrapolator": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility("self", { power: 1, toughness: 1 }, { condition: cond.threshold, label: "Seuil : +1/+1" }),
    ],
  },
};
