/** Outlaws of Thunder Junction — cartes rouges. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  DINOSAUR_3_1,
  fx,
  mercenary,
  mode,
  OUTLAW,
  OUTLAW_CREATURE,
  ref,
  SCORPION_DRAGON,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
  whileSaddled,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Brimstone Roundup": {
    abilities: [triggered(when.castNthSpell(2), [mercenary()], { label: "Mercenaire 1/1" })],
  },
  "Caught in the Crossfire": {
    spell: spree(
      { cost: "{1}", label: "2 blessures à chaque hors-la-loi", effects: [fx.damageAll(2, OUTLAW_CREATURE)] },
      {
        cost: "{1}",
        label: "2 blessures à chaque non-hors-la-loi",
        effects: [fx.damageAll(2, { types: ["Creature"], noneOfSubtypes: OUTLAW.anySubtype })],
      },
    ),
  },
  "Cunning Coyote": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 1, ["haste"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+1 et la célérité",
      }),
    ],
  },
  "Deadeye Duelist": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure",
      }),
    ],
  },
  "Demonic Ruckus": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["menace", "trample"] },
        { label: "+1/+1, menace et piétinement" },
      ),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { fromGraveyard: true, label: "Piochez" }),
    ],
  },
  "Discerning Peddler": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), fx.when(cond.v("d"), fx.draw(1))], {
        label: "Défaussez : piochez",
      }),
    ],
  },
  "Explosive Derailment": {
    spell: spree(
      {
        cost: "{2}",
        label: "4 blessures à une créature",
        targets: [target.creature("c")],
        effects: [fx.damage(4, ref.target("c"))],
      },
      {
        cost: "{2}",
        label: "Détruisez un artefact",
        targets: [target.permanent("a", ["Artifact"])],
        effects: [fx.destroy(ref.target("a"))],
      },
    ),
  },
  Ferocification: {
    abilities: [
      triggeredModal(when.step("beginCombat"), [
        mode("+2/+0", [target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 0)]),
        mode(
          "Menace et célérité",
          [target.creature("t", { controller: "you" })],
          [fx.pump(ref.target(), 0, 0, ["menace", "haste"])],
        ),
      ]),
    ],
  },
  "Gila Courser": {
    abilities: [
      whileSaddled([fx.exileTop(ref.you, 1, "g"), fx.grantPlay(ref.stored("g"), { untilYourNextTurn: true })], {
        label: "Exilez la carte du dessus, jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Hell to Pay": {
    spell: spell(
      [target.creature("t")],
      [fx.damageStoringExcess(amount.x, ref.target(), "e"), fx.createTappedTokens(TREASURE, amount.v("e"))],
    ),
  },
  "Hellspur Brute": { costReduction: { generic: amount.count({ ...OUTLAW, controller: "you" }) } },
  "Hellspur Posse Boss": {
    abilities: [
      staticAbility({ ...OUTLAW_CREATURE, controller: "you", other: true }, { addKeywords: ["haste"] }, { label: "Célérité" }),
      triggered(when.entersSelf, [mercenary(2)], { label: "Deux Mercenaires 1/1" }),
    ],
  },
  "Highway Robbery": {
    spell: spell(
      [],
      [
        fx.discard(1, ref.you, { optional: true, store: "d" }),
        fx.when(cond.not(cond.v("d")), fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "l" })),
        fx.when(cond.not(cond.all(cond.not(cond.v("d")), cond.not(cond.v("l")))), fx.draw(2)),
      ],
    ),
  },
  "Irascible Wolverine": {
    abilities: [
      triggered(when.entersSelf, [fx.exileTop(ref.you, 1, "w"), fx.grantPlay(ref.stored("w"))], {
        label: "Exilez la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  "Iron-Fist Pulverizer": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.damage(2, ref.target()), fx.scry(1)], {
        targets: [target.player("t", "opponent")],
        label: "2 blessures, regard 1",
      }),
    ],
  },
  "Longhorn Sharpshooter": {
    abilities: [
      triggered(when.plottedSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "Comploté : 2 blessures" }),
    ],
  },
  "Magda, the Hoardmaster": {
    abilities: [
      triggered(when.crime, [fx.createTappedTokens(TREASURE)], { oncePerTurn: true, label: "Trésor engagé" }),
      activated({
        sacrificeOther: { filter: { subtype: "Treasure" }, count: 3 },
        sorcerySpeed: true,
        effects: [fx.createTokens(SCORPION_DRAGON)],
        label: "Dragon Scorpion 4/4",
      }),
    ],
  },
  "Mine Raider": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], {
        condition: cond.controls({ ...OUTLAW_CREATURE, other: true }),
        label: "Trésor",
      }),
    ],
  },
  "Outlaws' Fury": {
    spell: spell(
      [],
      [
        fx.pumpAll({ types: ["Creature"], controller: "you" }, 2, 0),
        fx.when(
          cond.controls(OUTLAW_CREATURE),
          fx.exileTop(ref.you, 1, "o"),
          fx.grantPlay(ref.stored("o"), { untilYourNextTurn: true }),
        ),
      ],
    ),
  },
  "Prickly Pair": { abilities: [triggered(when.entersSelf, [mercenary()], { label: "Mercenaire 1/1" })] },
  "Quick Draw": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.player("p", "opponent")],
      [
        fx.pump(ref.target("a"), 1, 1, ["firstStrike"]),
        fx.modify(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), {
          removeKeywords: ["firstStrike", "doubleStrike"],
        }),
      ],
    ),
  },
  "Quilled Charger": { abilities: [whileSaddled([fx.pump(ref.self, 1, 2, ["menace"])], { label: "+1/+2 et la menace" })] },
  "Reckless Lackey": {
    abilities: [
      activated({ mana: "{2}{R}", sacrifice: true, effects: [fx.draw(1), fx.createTokens(TREASURE)], label: "Piochez, Trésor" }),
    ],
  },
  "Rodeo Pyromancers": {
    abilities: [triggered(when.castNthSpell(1), [fx.addMana("R", "R")], { label: "Ajoutez {R}{R}" })],
  },
  "Scalestorm Summoner": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(DINOSAUR_3_1)], {
        condition: cond.controls({ types: ["Creature"], minPower: 4 }),
        label: "Dinosaure 3/1",
      }),
    ],
  },
  "Scorching Shot": { spell: spell([target.creature("t")], [fx.damage(5, ref.target())]) },
  "Slickshot Show-Off": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" })],
  },
  "Stingerback Terror": {
    abilities: [staticAbility("self", { power: -1, toughness: -1 }, { perHand: true, label: "-1/-1 par carte en main" })],
  },
  "Take for a Ride": {
    flashIf: cond.crime,
    spell: spell(
      [target.creature("t")],
      [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])],
    ),
  },
  "Thunder Salvo": {
    spell: spell([target.creature("t")], [fx.damage(amount.plus(1, amount.spellsCastThisTurn), ref.target())]),
  },
  "Trick Shot": {
    spell: spell(
      [target.creature("a"), { ...target.upTo(1, target.creature("b", { token: true })), otherThan: ["a"] }],
      [fx.damage(6, ref.target("a")), fx.damage(2, ref.target("b"))],
    ),
  },
};
