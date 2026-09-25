/** Foundations — cartes multicolores. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  ELF_WARRIOR,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ref,
  SOLDIER,
  SPIRIT,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const MULTI: Record<string, CardScript> = {
  "Alesha, Who Laughs at Fate": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.yourEndStep, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValueSourcePower: true },
            "you",
            "créature de valeur de mana ≤ la force d'Alesha",
          ),
        ],
        condition: cond.raid,
        label: "Raid : réanime une créature",
      }),
    ],
  },
  "Anthem of Champions": { abilities: [staticAbility(CREATURE_YOU_CONTROL, { power: 1, toughness: 1 })] },
  "Ashroot Animist": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self), ["trample"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+X/+X et piétinement",
      }),
    ],
  },
  "Dreadwing Scavenger": {
    abilities: [
      triggered(when.entersSelf, fx.loot(1), { label: "pioche puis défausse" }),
      triggered(when.attacksSelf, fx.loot(1), { label: "pioche puis défausse" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        { condition: cond.threshold, label: "Seuil : +1/+1 et contact mortel" },
      ),
    ],
  },
  "Fiendish Panda": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], notSubtype: "Bear", maxManaValueSourcePower: true },
            "you",
            "créature non-Ours de valeur de mana ≤ sa force",
          ),
        ],
        label: "réanime une créature",
      }),
    ],
  },
  "Kykar, Zephyr Awakener": {
    abilities: [
      triggeredModal(when.castSpell("you", { notTypes: ["Creature"] }), [
        mode(
          "Exiler une autre créature (elle revient à l'étape de fin)",
          [target.creature("t", { controller: "you", other: true })],
          [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        ),
        mode("Esprit 1/1 volant", [], [fx.createTokens(SPIRIT)]),
      ]),
    ],
  },
  "Perforating Artist": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.eachOpponent, 3, { discard: true, sacrifice: { nonland: true } })], {
        condition: cond.raid,
        label: "Raid : 3 PV sauf sacrifice ou défausse",
      }),
    ],
  },
  "Wardens of the Cycle": {
    abilities: [
      triggeredModal(
        when.yourEndStep,
        [mode("Vous gagnez 2 PV", [], [fx.gainLife(2)]), mode("Piochez, perdez 1 PV", [], [fx.draw(1), fx.loseLife(1)])],
        { condition: cond.morbid, label: "Morbide" },
      ),
    ],
  },
  "Zimone, Paradox Sculptor": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "marqueurs +1/+1",
      }),
      activated({
        mana: "{G}{U}",
        tap: true,
        targets: [
          target.upTo(2, targetObj("t", { types: ["Creature", "Artifact"], controller: "you" }, "créature ou artefact à vous")),
        ],
        effects: [fx.doubleAllCounters(ref.target())],
        label: "Doubler les marqueurs",
      }),
    ],
  },
  "Balmor, Battlemage Captain": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pumpAll({ controller: "you" }, 1, 0, ["trample"])], {
        label: "vos créatures +1/+0 et piétinement",
      }),
    ],
  },
  "Empyrean Eagle": {
    abilities: [staticAbility({ ...OTHER_CREATURE_YOU_CONTROL, keyword: "flying" }, { power: 1, toughness: 1 })],
  },
  "Good-Fortune Unicorn": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.eventObject, 1)], { label: "marqueur +1/+1" }),
    ],
  },
  "Heroic Reinforcements": {
    spell: spell([], [fx.createTokens(SOLDIER, 2), fx.pumpAll({ controller: "you" }, 1, 1, ["haste"])]),
  },
  "Lathril, Blade of the Elves": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.createTokens(ELF_WARRIOR, amount.eventAmount)], { label: "Elfes guerriers" }),
      activated({
        tap: true,
        tapOthers: { filter: { subtype: "Elf" }, count: 10 },
        effects: fx.drain(10),
        label: "Engager dix Elfes : draine 10",
      }),
    ],
  },
  "Ruby, Daring Tracker": {
    abilities: [
      manaAbility(["R", "G"]),
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 2)], { condition: cond.ferocious, label: "+2/+2" }),
    ],
  },
  "Tatyova, Benthic Druid": {
    abilities: [triggered(when.landfall, [fx.gainLife(1), fx.draw(1)], { label: "+1 PV, piochez" })],
  },
};
