/** Foundations — cartes blanches. */
import {
  activated,
  amount,
  CAT,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  FOOD,
  fx,
  HUMAN,
  KNIGHT,
  OTHER_CREATURE_YOU_CONTROL,
  RABBIT,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  WITH_P1P1,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Fleeting Flight": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"]), fx.preventCombatDamage(ref.target())],
    ),
  },
  "Arahbo, the First Fang": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Cat", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(when.enters({ types: ["Creature"], subtype: "Cat", controller: "you", nontoken: true }), [fx.createTokens(CAT)], {
        label: "Chat 1/1",
      }),
    ],
  },
  "Armasaur Guide": {
    abilities: [
      triggered(when.attackWith(3), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Cat Collector": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
      triggered(when.gainLifeFirst, [fx.createTokens(CAT)], { condition: cond.yourTurn, label: "Chat 1/1" }),
    ],
  },
  "Claws Out": {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Cat", controller: "you" }) },
    spell: spell([], [fx.pumpAll({ controller: "you" }, 2, 2)]),
  },
  "Dauntless Veteran": {
    abilities: [triggered(when.attacksSelf, [fx.pumpAll({ controller: "you" }, 1, 1)], { label: "vos créatures +1/+1" })],
  },
  "Dazzling Angel": {
    abilities: [triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], { label: "+1 PV" })],
  },
  "Divine Resilience": {
    kicker: "{2}{W}",
    spell: spell(
      [{ ...target.creature("t", { controller: "you" }), kickedCount: 99 }],
      [fx.pump(ref.target(), 0, 0, ["indestructible"])],
    ),
  },
  "Exemplar of Light": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.countersPut("self", "+1/+1"), [fx.draw(1)], { oncePerTurn: true, label: "piochez une carte" }),
    ],
  },
  "Felidar Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you", other: true }))],
        label: "marqueurs +1/+1",
      }),
    ],
  },
  "Guarded Heir": { abilities: [triggered(when.entersSelf, [fx.createTokens(KNIGHT, 2)], { label: "deux Chevaliers 3/3" })] },
  "Hare Apparent": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(RABBIT, amount.count({ types: ["Creature"], name: "Hare Apparent", controller: "you", other: true }))],
        { label: "Lapins 1/1" },
      ),
    ],
  },
  "Helpful Hunter": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "piochez une carte" })] },
  "Inspiring Paladin": {
    abilities: [
      staticAbility("self", { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
      staticAbility(WITH_P1P1, { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
    ],
  },
  "Joust Through": {
    spell: spell(
      [targetObj("t", { types: ["Creature"], inCombat: true }, "créature attaquante ou bloqueuse")],
      [fx.damage(3, ref.target()), fx.gainLife(1)],
    ),
  },
  "Prideful Parent": { abilities: [triggered(when.entersSelf, [fx.createTokens(CAT)], { label: "Chat 1/1" })] },
  "Raise the Past": {
    spell: spell([], [fx.moveAll("graveyard", ref.you, { types: ["Creature"], maxManaValue: 2 }, { to: "battlefield" })]),
  },
  "Skyknight Squire": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      staticAbility(
        "self",
        { addKeywords: ["flying"], addSubtypes: ["Knight"] },
        { condition: cond.counterAtLeast("+1/+1", 3), label: "Vol et Chevalier (3 marqueurs)" },
      ),
    ],
  },
  "Squad Rallier": {
    abilities: [
      activated({
        mana: "{2}{W}",
        effects: [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 2 } })],
        label: "Regarder les 4 cartes du dessus",
      }),
    ],
  },
  "Sun-Blessed Healer": {
    kicker: "{1}{W}",
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { permanent: true, nonland: true, maxManaValue: 2 })],
        condition: cond.kicked,
        label: "Kicker : retour d'un permanent",
      }),
    ],
  },
  "Valkyrie's Call": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", nontoken: true, notSubtype: "Angel" }),
        [
          fx.toBattlefield(ref.eventObject, {
            counters: { kind: "+1/+1", n: 1 },
            addKeywords: ["flying"],
            addSubtypes: ["Angel"],
          }),
        ],
        { label: "revient en Ange" },
      ),
    ],
  },
  "Vanguard Seraph": { abilities: [triggered(when.gainLifeFirst, [fx.surveil(1)], { label: "surveillance 1" })] },
  "Ajani's Pridemate": { abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" })] },
  "Angel of Finality": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.target(), {}, { to: "exile" })], {
        targets: [target.player()],
        label: "exile un cimetière",
      }),
    ],
  },
  "Authority of the Consuls": {
    abilities: [
      entersWith({ tapped: true, affects: CREATURE_OPP, label: "Les créatures adverses arrivent engagées" }),
      triggered(when.enters(CREATURE_OPP), [fx.gainLife(1)], { label: "+1 PV" }),
    ],
  },
  "Banishing Light": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "exile jusqu'à son départ",
      }),
    ],
  },
  "Cathar Commando": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruire un artefact ou un enchantement",
      }),
    ],
  },
  "Day of Judgment": { spell: spell([], [fx.destroyAll({ types: ["Creature"] })]) },
  "Make Your Move": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], minPower: 4 }] },
          "artefact, enchantement ou créature de force 4 ou plus",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Mischievous Pup": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.optional(targetObj("t", { controller: "you", other: true }, "autre permanent que vous contrôlez"))],
        label: "renvoie un permanent",
      }),
    ],
  },
  "Resolute Reinforcements": { abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER)], { label: "Soldat 1/1" })] },
  "Stroke of Midnight": {
    spell: spell([target.nonland()], [fx.destroy(ref.target()), fx.createTokens(HUMAN, 1, ref.controllerOf(ref.target()))]),
  },
  "Youthful Valkyrie": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, subtype: "Angel", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "marqueur +1/+1",
      }),
    ],
  },
};
