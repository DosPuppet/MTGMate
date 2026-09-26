/** Reality Fracture — cartes blanches. */
import {
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ref,
  spell,
  THOPTER,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Fateshaper Aspirant": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "Récupérer une carte légendaire",
          [target.cardInGraveyard("t", { legendary: true }, "you", "carte légendaire de votre cimetière")],
          [fx.toHand(ref.target())],
        ),
        mode(
          "Marqueur +1/+1, vigilance et indestructible",
          [target.creature("t")],
          [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance", "indestructible"] })],
        ),
      ]),
    ],
  },
  "Flickering Hound": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.exileCard(ref.target(), { name: "blink" }), fx.toBattlefield(ref.stored("blink"))],
        {
          targets: [target.upTo(1, target.creature("t", OTHER_CREATURE_YOU_CONTROL))],
          label: "fait clignoter une autre créature",
        },
      ),
    ],
  },
  "Generous Revival": {
    flashback: "{4}{W}",
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de valeur 3 ou moins")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Germinate Recruits": { spell: spell([], [fx.createTokens(CADET, amount.lifeGainedThisTurn)]) },
  "Graft Surgeon": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), amount.lkiCounters("+1/+1"))], {
        targets: [target.upTo(1, target.creature("t", CREATURE_YOU_CONTROL))],
        label: "transmet ses marqueurs",
      }),
    ],
  },
  "Guiding Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(
        when.yourCombat,
        fx.may(
          "Retirer un marqueur +1/+1 pour en mettre un sur chacune de vos autres créatures ?",
          fx.counters(ref.self, "+1/+1", -1),
          fx.addCountersAll(OTHER_CREATURE_YOU_CONTROL, 1),
        ),
        { condition: cond.counterAtLeast("+1/+1", 1), label: "partage un marqueur" },
      ),
    ],
  },
  "Memory Trap": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "exile jusqu'à son départ",
      }),
    ],
  },
  "Predictive Preparations": {
    flashback: "{3}{W}",
    spell: spell([target.upTo(2, target.creature("t"))], [fx.addCounters(ref.target(), 1)]),
  },
  "Prophesied End": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.not(cond.refMatches(ref.target(), { attacking: true })), fx.draw(1, ref.controllerOf(ref.target()))),
        fx.destroy(ref.target()),
      ],
    ),
  },
  "Return to the Light Realms": {
    spell: spell([], [fx.moveAll("graveyard", ref.you, { permanent: true, nonland: true }, { to: "battlefield" })]),
  },
  "Shatterwing Pegasus": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Vos créatures +1/+1" })],
  },
  "Surgical Precision": {
    spell: modal(
      mode(
        "Détruire une créature d'endurance 4 ou plus",
        [target.creature("t", { minToughness: 4 })],
        [fx.destroy(ref.target()), fx.gainLife(1)],
      ),
      mode("Piochez une carte, +2 PV", [], [fx.draw(1), fx.gainLife(2)]),
    ),
  },
  "Unflinching Hortimancer": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" })],
  },
  "Koth of the Homestead": {
    abilities: [
      triggered(when.landfall, [fx.gainLife(1)], { label: "Landfall : +1 PV" }),
      triggered(when.enters({ subtype: "Plains", controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "Plaine : marqueur +1/+1",
      }),
    ],
  },
  "Lyra, Archangel of Dawn": {
    abilities: [
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Creature"], subtype: "Angel", controller: "you" }, 1)], {
        label: "marqueur sur chaque Ange",
      }),
    ],
  },
  "Rescue Girl, First Responder": {
    abilities: [
      activated({
        tap: true,
        targets: [targetObj("t", { permanent: true, controller: "you", other: true }, "autre permanent que vous contrôlez")],
        effects: [fx.bounce(ref.target())],
        activationCondition: cond.yourTurn,
        label: "Renvoyer un autre permanent en main",
      }),
    ],
  },
  "Saheeli, Consul of Oversight": {
    abilities: [
      triggered(when.scryOrSurveil, [fx.createTokens(THOPTER)], { oncePerTurn: true, label: "Regard/surveillance : Thopter" }),
    ],
  },
};
