/** Foundations — cartes rouges. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DRAGON,
  DRAGON_5,
  entersWith,
  fx,
  GOBLIN,
  INSTANT_SORCERY,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Fanatical Firebrand": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.any()],
        effects: [fx.damage(1, ref.target(), ref.self)],
        label: "1 blessure",
      }),
    ],
  },
  "Shivan Dragon": { abilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })] },
  "Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
  Boltwave: { spell: spell([], [fx.damage(3, ref.eachOpponent)]) },
  Abrade: {
    spell: modal(
      mode("3 blessures à une créature", [target.creature()], [fx.damage(3, ref.target())]),
      mode("Détruire un artefact", [target.permanent("t", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target())]),
    ),
  },
  "Sure Strike": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"])]) },
  "Kindled Fury": { spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"])]) },
  "Dragon Fodder": { spell: spell([], [fx.createTokens(GOBLIN, 2)]) },
  "Thrill of Possibility": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2)]) },
  "Seize the Spoils": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2), fx.createTokens(TREASURE)]) },
  "Bulk Up": {
    flashback: "{4}{R}{R}",
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)]),
  },
  "Dragonlord's Servant": { abilities: [costReducer({ subtype: "Dragon" }, 1, "Dragons : {1} de moins")] },
  "Rapacious Dragon": { abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE, 2)], { label: "deux Trésors" })] },
  "Brass's Bounty": { spell: spell([], [fx.createTokens(TREASURE, amount.count({ types: ["Land"], controller: "you" }))]) },
  "Obliterating Bolt": {
    spell: spell(
      [target.permanent("t", ["Creature", "Planeswalker"], {}, "créature ou planeswalker")],
      [fx.exileIfDies(ref.target()), fx.damage(4, ref.target())],
    ),
  },
  "Scorching Dragonfire": {
    spell: spell(
      [target.permanent("t", ["Creature", "Planeswalker"], {}, "créature ou planeswalker")],
      [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())],
    ),
  },
  "Goblin Boarders": { abilities: [entersWith({ counters: 1, condition: cond.raid, label: "Raid : arrive avec un marqueur" })] },
  "Kargan Dragonrider": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.controls({ subtype: "Dragon" }), label: "Vol avec un Dragon" },
      ),
    ],
  },
  "Goblin Oriflamme": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", attacking: true }, { power: 1 })],
  },
  "Viashino Pyromancer": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target(), ref.self)], {
        targets: [target.player()],
        label: "2 blessures au joueur ciblé",
      }),
    ],
  },
  "Dragon Trainer": { abilities: [triggered(when.entersSelf, [fx.createTokens(DRAGON)], { label: "Dragon 4/4" })] },
  "Gorehorn Raider": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target(), ref.self)], {
        targets: [target.any()],
        condition: cond.raid,
        label: "Raid : 2 blessures",
      }),
    ],
  },
  "Searslicer Goblin": {
    abilities: [triggered(when.yourEndStep, [fx.createTokens(GOBLIN)], { condition: cond.raid, label: "Raid : Gobelin" })],
  },
  "Firebrand Archer": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent, ref.self)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  Guttersnipe: {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.damage(2, ref.eachOpponent, ref.self)], {
        label: "2 blessures à chaque adversaire",
      }),
    ],
  },
  "Impact Tremors": {
    abilities: [
      triggered(when.enters(CREATURE_YOU_CONTROL), [fx.damage(1, ref.eachOpponent, ref.self)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  "Spitfire Lagac": {
    abilities: [
      triggered(when.landfall, [fx.damage(1, ref.eachOpponent, ref.self)], { label: "1 blessure à chaque adversaire" }),
    ],
  },
  "Crackling Cyclops": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 3, 0)], { label: "+3/+0" })],
  },
  "Battle-Rattle Shaman": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.optional(target.creature())],
        label: "+2/+0 à une créature",
      }),
    ],
  },
  "Battlesong Berserker": {
    abilities: [
      triggered(when.attackWith(1), [fx.pump(ref.target(), 1, 0, ["menace"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+0 et menace",
      }),
    ],
  },
  "Courageous Goblin": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 1, 0, ["menace"])], { condition: cond.ferocious, label: "+1/+0 et menace" }),
    ],
  },
  Electroduplicate: {
    flashback: "{2}{R}{R}",
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
    ),
  },
  "Goblin Negotiation": {
    spell: spell(
      [target.creature()],
      [fx.damageStoringExcess(amount.x, ref.target(), "excess"), fx.createTokens(GOBLIN, amount.v("excess"))],
    ),
  },
  "Incinerating Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(6, ref.target()), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
    ),
  },
  "Rite of the Dragoncaller": {
    abilities: [triggered(when.castSpell("you", INSTANT_SORCERY), [fx.createTokens(DRAGON_5)], { label: "Dragon 5/5 volant" })],
  },
  "Slumbering Cerberus": {
    keywords: ["doesntUntap"],
    abilities: [triggered(when.eachEndStep, [fx.untap(ref.self)], { condition: cond.morbid, label: "Morbide : se dégage" })],
  },
  "Sower of Chaos": {
    abilities: [
      activated({
        mana: "{2}{R}",
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })],
        label: "Une créature ne peut pas bloquer",
      }),
    ],
  },
  "Axgard Cavalry": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Célérité",
      }),
    ],
  },
  "Drakuseth, Maw of Flames": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(4, ref.target("a"), ref.self), fx.damage(3, ref.target("b"), ref.self)], {
        targets: [target.any("a"), { ...target.upTo(2, target.any("b")), otherThan: ["a"], label: "jusqu'à deux autres cibles" }],
        label: "4 blessures, puis 3 et 3",
      }),
    ],
  },
  "Firespitter Whelp": {
    abilities: [
      triggered(
        when.castSpell("you", { anyOf: [{ notTypes: ["Creature"] }, { subtype: "Dragon" }] }),
        [fx.damage(1, ref.eachOpponent, ref.self)],
        { label: "1 blessure à chaque adversaire" },
      ),
    ],
  },
  "Frenzied Goblin": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{R}",
          "Payer {R} : la créature ne peut pas bloquer ?",
          fx.modify(ref.target(), { addKeywords: ["cantBlock"] }),
        ),
        {
          targets: [target.creature()],
          label: "{R} : ne peut pas bloquer",
        },
      ),
    ],
  },
  "Goblin Surprise": {
    spell: modal(
      mode("Vos créatures +2/+0", [], [fx.pumpAll({ controller: "you" }, 2, 0)]),
      mode("Deux Gobelins 1/1", [], [fx.createTokens(GOBLIN, 2)]),
    ),
  },
  "Heartfire Immolator": {
    abilities: [
      activated({
        mana: "{R}",
        sacrifice: true,
        targets: [target.creatureOrPlaneswalker()],
        effects: [fx.damage(amount.powerOf(ref.self), ref.target(), ref.self)],
        label: "Blessures égales à sa force",
      }),
    ],
  },
  "Hidetsugu's Second Rite": {
    spell: spell([target.player()], [...fx.when(cond.refLife(ref.target(), 10), fx.damage(10, ref.target()))]),
  },
  "Krenko, Mob Boss": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.createTokens(GOBLIN, amount.count({ subtype: "Goblin", controller: "you" }))],
        label: "Un Gobelin par Gobelin",
      }),
    ],
  },
  "Seismic Rupture": { spell: spell([], [fx.damageAll(2, { notKeyword: "flying" })]) },
  Slagstorm: {
    spell: modal(
      mode("3 blessures à chaque créature", [], [fx.damageAll(3, {})]),
      mode("3 blessures à chaque joueur", [], [fx.damageAll(3, undefined, ref.eachPlayer)]),
    ),
  },
};
