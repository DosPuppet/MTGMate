/** Reality Fracture — cartes blanches. */
import {
  AJANIS_PRIDEMATE,
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  empower,
  entersWith,
  fx,
  loyalty,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ref,
  SEED_SUTURE,
  spell,
  staticAbility,
  THOPTER,
  target,
  targetObj,
  triggered,
  triggeredModal,
  walkersHave,
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
  "Gideon's Memorial": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", token: true },
        { power: 1, addKeywords: ["vigilance"] },
        {
          label: "Jetons de créature : +1/+0 et vigilance",
        },
      ),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Planeswalker"] } } }),
      activated({
        mana: "{1}{W}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { inCombat: true })],
        effects: [fx.damage(4, ref.target())],
        label: "Défaussez : 4 blessures à une créature attaquante ou bloqueuse",
      }),
    ],
  },
  "Blossom-Blessed Angel": { prepareSpell: SEED_SUTURE, abilities: [entersWith({ prepared: true })] },
  "Academic Ascent": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2, ["flying"]), empower(2)]),
  },
  "Campus Crier": {
    abilities: [
      activated({ mana: "{1}", fromGraveyard: true, exileSelf: true, effects: [empower(2)], label: "Renforcez Jace 2" }),
    ],
  },
  "Hexhaven Battalion": { spell: spell([], [fx.createTokens(CADET, 3), empower(2)]) },
  "Repurposed Enforcer": {
    abilities: [triggered(when.attacksSelf, [empower(amount.count(CREATURE_YOU_CONTROL))], { label: "Renforcez Jace X" })],
  },
  "Way of the Healer": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Renforcez Jace 5" }),
      walkersHave(
        loyalty(-2, { effects: [fx.createTokens(CADET), fx.surveil(1)], label: "Cadet, surveillance 1" }),
        "Planeswalkers : [−2] Cadet",
      ),
    ],
  },
  "Way of the Mentor": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Renforcez Jace 5" }),
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Planeswalker"], controller: "you" }, 1, "loyalty")], {
        label: "loyauté sur chaque planeswalker",
      }),
    ],
  },
  "Loyal Tutor": { spell: spell([], [fx.search({ types: ["Planeswalker"] }, { to: "libraryTop" })]) },
  "Refute Destiny": {
    spell: spell([target.creatureOrPlaneswalker("t", { colors: ["G", "U"] })], [fx.exileCard(ref.target()), fx.surveil(1)]),
  },
  "Your Fate Ends Here": {
    spell: spell([target.creatureOrPlaneswalker("t", { minManaValue: 3 })], [fx.destroy(ref.target()), fx.surveil(1)]),
  },
  "Ajani Resolute": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "loyalty", 1)], { label: "marqueur de loyauté" }),
      loyalty(0, { effects: [fx.gainLife(1)], label: "Vous gagnez 1 PV" }),
      loyalty(-4, { effects: [fx.createTokens(AJANIS_PRIDEMATE)], label: "Ajani's Pridemate" }),
      loyalty(-10, {
        effects: [
          fx.emblem("Emblème d'Ajani", "Les créatures que vous contrôlez gagnent +2/+2.", [
            staticAbility(CREATURE_YOU_CONTROL, { power: 2, toughness: 2 }, { label: "+2/+2" }),
          ]),
        ],
        label: "emblème",
      }),
    ],
  },
  "Liliana the Faultless": {
    abilities: [
      triggered(
        when.enters({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.gainLife(1)],
        { label: "+1 PV" },
      ),
      // Approximation : la défausse est faite à la résolution (pas comme coût).
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creatureOrPlaneswalker("t", { controller: "you", other: true })],
        effects: [
          fx.discard(1, ref.you, { store: "d" }),
          ...fx.when(cond.v("d"), fx.modify(ref.target(), { addKeywords: ["hexproof"] })),
        ],
        label: "Défausser : défense talismanique",
      }),
    ],
  },
  "Teyo, Lightshield Expert": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { addKeywords: ["hexproof"] }),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty", 1)),
        ],
        {
          targets: [targetObj("t", { permanent: true, controller: "you" }, "permanent que vous contrôlez")],
          label: "défense talismanique",
        },
      ),
    ],
  },
};
