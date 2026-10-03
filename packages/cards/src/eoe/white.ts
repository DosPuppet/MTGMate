/** Edge of Eternities — cartes blanches. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_SPACECRAFT,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  eventReplacement,
  fx,
  HUMAN_SOLDIER,
  LANDER,
  lander,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT,
  ref,
  spell,
  staticAbility,
  TWO_TAPPED,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "All-Fates Stalker": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { notSubtype: "Assassin" }))],
        label: "Exilez une créature jusqu'à son départ",
      }),
    ],
  },
  "Auxiliary Boosters": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT, 1, undefined, "r"), fx.attach(ref.stored("r"))], {
        label: "Robot 2/2, attaché",
      }),
      staticAbility("attached", { power: 1, toughness: 2, addKeywords: ["flying"] }, { label: "+1/+2 et le vol" }),
    ],
  },
  "Beyond the Quiet": {
    spell: spell([], [fx.moveAll("battlefield", ref.eachPlayer, CREATURE_OR_SPACECRAFT, { to: "exile" })]),
  },
  "Brightspear Zealot": {
    abilities: [staticAbility("self", { power: 2 }, { condition: cond.castThisTurn(2), label: "+2/+0 (deux sorts lancés)" })],
  },
  "Cosmogrand Zenith": {
    abilities: [
      triggeredModal(
        when.castNthSpell(2),
        [
          mode("Deux Soldats humains 1/1", [], [fx.createTokens(HUMAN_SOLDIER, 2)]),
          mode("Un marqueur +1/+1 sur chaque créature", [], [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)]),
        ],
        { label: "Deuxième sort du tour" },
      ),
    ],
  },
  "Dawnstrike Vanguard": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCountersAll(OTHER_CREATURE_YOU_CONTROL, 1)], {
        condition: TWO_TAPPED,
        label: "Marqueurs +1/+1 sur vos autres créatures",
      }),
    ],
  },
  "Dockworker Drone": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), amount.lkiCounters("+1/+1"))], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Ses marqueurs sur une créature",
      }),
    ],
  },
  "Dual-Sun Adepts": {
    abilities: [activated({ mana: "{5}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Vos créatures +1/+1" })],
  },
  "Dual-Sun Technique": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 0, 0, ["doubleStrike"]), fx.when(cond.targetMatches("t", { withCounter: "+1/+1" }), fx.draw(1))],
    ),
  },
  "Emergency Eject": {
    spell: spell([target.nonland("t")], [fx.destroy(ref.target()), fx.createTokens(LANDER, 1, ref.controllerOf(ref.target()))]),
  },
  "Exalted Sunborn": {
    abilities: [eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Deux fois plus de jetons" })],
  },
  "Exosuit Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [
          target.upTo(1, {
            id: "t",
            label: "autre permanent que vous contrôlez",
            filter: { objects: { controller: "you", other: true } },
          }),
        ],
        label: "Renvoyez un de vos permanents",
      }),
    ],
  },
  "Flight-Deck Coordinator": {
    abilities: [triggered(when.yourEndStep, [fx.gainLife(2)], { condition: TWO_TAPPED, label: "+2 PV" })],
  },
  "Focus Fire": {
    spell: spell(
      [target.creature("t", { inCombat: true })],
      [fx.damage(amount.plus(2, amount.count({ ...CREATURE_OR_SPACECRAFT, controller: "you" })), ref.target())],
    ),
  },
  "Haliya, Guided by Light": {
    abilities: [
      triggered(when.enters({ ...CREATURE_OR_ARTIFACT, controller: "you" }), [fx.gainLife(1)], { label: "+1 PV" }),
      triggered(when.yourEndStep, [fx.draw(1)], { condition: cond.lifeGainedAtLeast(3), label: "Piochez (3 PV gagnés)" }),
    ],
  },
  Honor: { spell: spell([target.creature("t")], [fx.addCounters(ref.target(), 1), fx.draw(1)]) },
  "Honored Knight-Captain": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HUMAN_SOLDIER)], { label: "Soldat humain 1/1" }),
      activated({
        mana: "{4}{W}{W}",
        sacrifice: true,
        effects: [fx.search({ subtype: "Equipment" }, { to: "battlefield" })],
        label: "Cherchez un Équipement",
      }),
    ],
  },
  "Knight Luminary": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(HUMAN_SOLDIER)], { label: "Soldat humain 1/1" })],
  },
  "Luxknight Breacher": {
    abilities: [entersWith({ counters: amount.count({ ...CREATURE_OR_ARTIFACT, controller: "you", other: true }) })],
  },
  "Radiant Strike": {
    spell: spell(
      [
        {
          id: "t",
          label: "artefact ou créature engagée",
          filter: { objects: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"], tapped: true }] } },
        },
      ],
      [fx.destroy(ref.target()), fx.gainLife(3)],
    ),
  },
  "Rayblade Trooper": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", nontoken: true, withCounter: "+1/+1" }),
        [fx.createTokens(HUMAN_SOLDIER)],
        { label: "Soldat humain 1/1" },
      ),
    ],
  },
  "Reroute Systems": {
    spell: modal(
      mode(
        "Indestructible",
        [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        [fx.pump(ref.target(), 0, 0, ["indestructible"])],
      ),
      mode("2 blessures à une créature engagée", [target.creature("t", { tapped: true })], [fx.damage(2, ref.target())]),
    ),
  },
  "Seam Rip": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent", maxManaValue: 2 })],
        label: "Exilez un permanent jusqu'à son départ",
      }),
    ],
  },
  "Squire's Lightblade": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["firstStrike"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le, initiative",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Starfield Shepherd": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({
            anyOf: [
              { types: ["Land"], basic: true, subtype: "Plains" },
              { types: ["Creature"], maxManaValue: 1 },
            ],
          }),
        ],
        { label: "Cherchez une Plaine ou une petite créature" },
      ),
    ],
  },
  "Starfighter Pilot": {
    abilities: [triggered(when.tapsSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  },
  "Sunstar Expansionist": {
    abilities: [
      triggered(when.entersSelf, [lander()], {
        condition: cond.opponentHasMore("lands"),
        label: "Lander (un adversaire a plus de terrains)",
      }),
      triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall : +1/+0" }),
    ],
  },
  "Sunstar Lightsmith": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "Marqueur +1/+1 et pioche" }),
    ],
  },
  "Weftblade Enhancer": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t"))],
        label: "Marqueurs +1/+1",
      }),
    ],
  },
  "Zealous Display": {
    spell: spell(
      [],
      [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0), fx.when(cond.not(cond.yourTurn), fx.untapUpTo({ types: ["Creature"] }, 99))],
    ),
  },
};
