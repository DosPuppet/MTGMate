/** Edge of Eternities — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_SPACECRAFT,
  cond,
  fx,
  lander,
  modal,
  mode,
  ROBOT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const OTHER_CREATURE_OR_ARTIFACT = { ...CREATURE_OR_ARTIFACT, other: true };
const CREATURE_OR_WALKER = ["Creature", "Planeswalker"] as const;

export const BLACK: Record<string, CardScript> = {
  "Archenemy's Charm": {
    spell: modal(
      mode("Exilez une créature ou un planeswalker", [target.creatureOrPlaneswalker("t")], [fx.exile(ref.target())]),
      mode(
        "Reprenez une ou deux cartes de créature ou de planeswalker",
        [target.between(1, 2, target.cardInGraveyard("t", { types: [...CREATURE_OR_WALKER] }))],
        [fx.toHand(ref.target())],
      ),
      mode(
        "Deux marqueurs +1/+1 et le lien de vie",
        [target.creature("t", { controller: "you" })],
        [fx.addCounters(ref.target(), 2), fx.pump(ref.target(), 0, 0, ["lifelink"])],
      ),
    ),
  },
  "Beamsaw Prospector": { abilities: [triggered(when.diesSelf, [lander()], { label: "Lander" })] },
  "Comet Crawler": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, OTHER_CREATURE_OR_ARTIFACT, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.pump(ref.self, 2, 0)),
        ],
        { label: "Sacrifiez : +2/+0" },
      ),
    ],
  },
  "Dark Endurance": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { blocking: true }) },
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 0, ["indestructible"])]),
  },
  "Decode Transmissions": {
    spell: spell(
      [],
      [fx.draw(2), fx.when(cond.void, fx.loseLife(2, ref.eachOpponent)), fx.when(cond.not(cond.void), fx.loseLife(2))],
    ),
  },
  Depressurize: {
    spell: spell(
      [target.creature("t")],
      [fx.pump(ref.target(), -3, 0), fx.when(cond.targetMatches("t", { maxPower: 0 }), fx.destroy(ref.target()))],
    ),
  },
  "Dubious Delicacy": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -3, -3)], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "-3/-3",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(3, ref.target())],
        label: "Un adversaire perd 3 PV",
      }),
    ],
  },
  "Elegy Acolyte": {
    abilities: [
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you" }), [fx.draw(1), fx.loseLife(1)], {
        label: "Piochez, perdez 1 PV",
      }),
      triggered(when.yourEndStep, [fx.createTokens(ROBOT)], { condition: cond.void, label: "Vide : Robot 2/2" }),
    ],
  },
  "Embrace Oblivion": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ARTIFACT, count: 1 } },
    spell: spell(
      [{ id: "t", label: "créature ou Vaisseau", filter: { objects: CREATURE_OR_SPACECRAFT } }],
      [fx.destroy(ref.target())],
    ),
  },
  "Faller's Faithful": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.when(cond.not(cond.targetMatches("t", { damaged: true })), fx.draw(2, ref.controllerOf(ref.target()))),
          fx.destroy(ref.target()),
        ],
        { targets: [target.upTo(1, target.creature("t", { other: true }))], label: "Détruisez une autre créature" },
      ),
    ],
  },
  "Gravblade Heavy": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["deathtouch"] },
        {
          condition: cond.controls({ types: ["Artifact"] }),
          label: "+1/+0 et le contact mortel avec un artefact",
        },
      ),
    ],
  },
  Gravkill: {
    spell: spell(
      [{ id: "t", label: "créature ou Vaisseau", filter: { objects: CREATURE_OR_SPACECRAFT } }],
      [fx.exile(ref.target())],
    ),
  },
  "Gravpack Monoist": {
    abilities: [triggered(when.diesSelf, [fx.createTappedTokens(ROBOT)], { label: "Robot 2/2 engagé" })],
  },
  Hylderblade: {
    abilities: [
      staticAbility("attached", { power: 3, toughness: 1 }, { label: "+3/+1" }),
      triggered(when.yourEndStep, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.void,
        label: "Vide : attachez-le",
      }),
    ],
  },
  "Hymn of the Faller": {
    spell: spell([], [fx.surveil(1), fx.draw(1), fx.loseLife(1), fx.when(cond.void, fx.draw(1))]),
  },
  "Insatiable Skittermaw": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.void, label: "Vide : marqueur +1/+1" }),
    ],
  },
  "Lightless Evangel": {
    abilities: [
      triggered(when.sacrifice(OTHER_CREATURE_OR_ARTIFACT), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
    ],
  },
  "Monoist Circuit-Feeder": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pump(ref.target("a"), amount.count({ types: ["Artifact"], controller: "you" }), 0),
          fx.pump(ref.target("b"), 0, amount.neg(amount.count({ types: ["Artifact"], controller: "you" }))),
        ],
        {
          targets: [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
          label: "+X/+0 et -0/-X",
        },
      ),
    ],
  },
  "Perigee Beckoner": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), {
            power: 2,
            addAbilities: [
              triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Revient engagée" }),
            ],
          }),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+2/+0, revient si elle meurt" },
      ),
    ],
  },
  "Scrounge for Eternity": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ARTIFACT, count: 1 } },
    spell: spell(
      [target.cardInGraveyard("t", { ...CREATURE_OR_SPACECRAFT, maxManaValue: 5 }, "you", "carte de créature ou de Vaisseau")],
      [fx.toBattlefield(ref.target()), lander()],
    ),
  },
  "Sunset Saboteur": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Marqueur +1/+1 sur une créature adverse",
      }),
    ],
  },
  "Susurian Voidborn": {
    abilities: [
      triggered(when.dies({ ...CREATURE_OR_ARTIFACT, controller: "you" }), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "Drain 1",
      }),
    ],
  },
  "Swarm Culler": {
    abilities: [
      triggered(
        when.tapsSelf,
        [fx.sacrifice(ref.you, OTHER_CREATURE_OR_ARTIFACT, 1, { optional: true, store: "s" }), fx.when(cond.v("s"), fx.draw(1))],
        { label: "Sacrifiez : piochez" },
      ),
    ],
  },
  "Temporal Intervention": {
    costReduction: { generic: 2, condition: cond.void },
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" })],
    ),
  },
  "Timeline Culler": {},
  "Tragic Trajectory": {
    spell: spell(
      [target.creature("t")],
      [fx.when(cond.void, fx.pump(ref.target(), -10, -10)), fx.when(cond.not(cond.void), fx.pump(ref.target(), -2, -2))],
    ),
  },
  "Umbral Collar Zealot": {
    abilities: [
      activated({ sacrificeOther: { filter: OTHER_CREATURE_OR_ARTIFACT }, effects: [fx.surveil(1)], label: "Surveillance 1" }),
    ],
  },
  "Virus Beetle": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Chaque adversaire défausse" })],
  },
  "Voidforged Titan": {
    abilities: [triggered(when.yourEndStep, [fx.draw(1), fx.loseLife(1)], { condition: cond.void, label: "Vide : piochez" })],
  },
  "Vote Out": { spell: spell([target.creature("t")], [fx.destroy(ref.target())]) },
};
