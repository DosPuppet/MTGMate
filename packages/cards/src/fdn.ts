/**
 * Comportement des cartes de Foundations (FDN).
 * Les caractéristiques (coût, types, F/E, mots-clés) viennent de Scryfall ;
 * on ne décrit ici que ce qui ne se déduit pas des mots-clés.
 */
import { type CardScript, dsl, type TokenSpec } from "@mtgx/engine";

const {
  target,
  ref,
  fx,
  amount,
  spell,
  modal,
  mode,
  manaAbility,
  activated,
  triggered,
  when,
  cond,
  staticAbility,
  entersWith,
  costReducer,
} = dsl;

const GOBLIN: TokenSpec = { name: "Goblin", colors: ["R"], types: ["Creature"], subtypes: ["Goblin"], power: 1, toughness: 1 };
const DRAGON: TokenSpec = {
  name: "Dragon",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Dragon"],
  power: 4,
  toughness: 4,
  keywords: ["flying"],
};
const ELF_WARRIOR: TokenSpec = {
  name: "Elf Warrior",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Elf", "Warrior"],
  power: 1,
  toughness: 1,
};
const BEAST: TokenSpec = { name: "Beast", colors: ["G"], types: ["Creature"], subtypes: ["Beast"], power: 4, toughness: 4 };
const TREASURE: TokenSpec = {
  name: "Treasure",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Treasure"],
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
  text: "{T}, Sacrifice this artifact: Add one mana of any color.",
};
const FOOD: TokenSpec = {
  name: "Food",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Food"],
  abilities: [activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" })],
  text: "{2}, {T}, Sacrifice this artifact: You gain 3 life.",
};
const CREATURE_YOU_CONTROL = { types: ["Creature" as const], controller: "you" as const };

export const FDN_SCRIPTS: Record<string, CardScript> = {
  // --- Vert ---
  "Llanowar Elves": { abilities: [manaAbility("G")] },
  "Druid of the Cowl": { abilities: [manaAbility("G")] },
  "Giant Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3)]) },
  "Bite Down": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        target.permanent("b", ["Creature", "Planeswalker"], { controller: "opponent" }, "créature ou planeswalker adverse"),
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  Overrun: { spell: spell([], [fx.pumpAll({ controller: "you" }, 3, 3, ["trample"])]) },
  "Primal Might": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), amount.x, amount.x), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wildheart Invoker": {
    abilities: [
      activated({
        mana: "{8}",
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 5, 5, ["trample"])],
        label: "+5/+5 et piétinement",
      }),
    ],
  },

  // --- Rouge ---
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

  // --- Coûts : additionnels, flashback, réductions, Trésors et Nourriture ---
  "Thrill of Possibility": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2)]) },
  "Seize the Spoils": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2), fx.createTokens(TREASURE)]) },
  "Bulk Up": {
    flashback: "{4}{R}{R}",
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)]),
  },
  "Think Twice": { flashback: "{2}{U}", spell: spell([], [fx.draw(1)]) },
  Opt: { spell: spell([], [fx.scry(1), fx.draw(1)]) },
  "Ghalta, Primal Hunger": { costReduction: { generic: amount.totalPower({ types: ["Creature"], controller: "you" }) } },
  "Dragonlord's Servant": { abilities: [costReducer({ subtype: "Dragon" }, 1, "Dragons : {1} de moins")] },
  "Rapacious Dragon": { abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE, 2)], { label: "deux Trésors" })] },
  "Brass's Bounty": { spell: spell([], [fx.createTokens(TREASURE, amount.count({ types: ["Land"], controller: "you" }))]) },
  "Eager Trufflesnout": { abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(FOOD)], { label: "Nourriture" })] },
  "Arbiter of Woe": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.draw(1), fx.gainLife(2)],
        { label: "défausse, -2 PV ; vous piochez, +2 PV" },
      ),
    ],
  },

  // --- Remplacements et prévention ---
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
  "Mossborn Hydra": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.landfall, [fx.doubleCounters(ref.self)], { label: "double ses marqueurs" }),
    ],
  },
  "Heroes' Bane": {
    abilities: [
      entersWith({ counters: 4 }),
      activated({
        mana: "{2}{G}{G}",
        effects: [fx.addCounters(ref.self, amount.powerOf(ref.self))],
        label: "X marqueurs (X = sa force)",
      }),
    ],
  },
  "Diregraf Ghoul": { abilities: [entersWith({ tapped: true })] },
  "Fleeting Flight": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"]), fx.preventCombatDamage(ref.target())],
    ),
  },

  // --- Capacités statiques ---
  "Imperious Perfect": {
    abilities: [
      staticAbility(
        { subtype: "Elf", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Autres Elfes +1/+1" },
      ),
      activated({ mana: "{G}", tap: true, effects: [fx.createTokens(ELF_WARRIOR)], label: "Elfe guerrier 1/1" }),
    ],
  },
  "Dwynen, Gilt-Leaf Daen": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Elf", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(
        when.attacksSelf,
        [fx.gainLife(amount.count({ types: ["Creature"], subtype: "Elf", controller: "you", attacking: true }))],
        { label: "1 PV par Elfe attaquant" },
      ),
    ],
  },
  "Kargan Dragonrider": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.controls({ subtype: "Dragon" }), label: "Vol avec un Dragon" },
      ),
    ],
  },
  "Aggressive Mammoth": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["trample"] })],
  },
  "Goblin Oriflamme": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", attacking: true }, { power: 1 })],
  },
  "Garruk's Uprising": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], minPower: 4 }),
        label: "piochez une carte",
      }),
      staticAbility({ types: ["Creature"], controller: "you" }, { addKeywords: ["trample"] }),
      triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 4 }), [fx.draw(1)], {
        label: "piochez une carte",
      }),
    ],
  },

  // --- Capacités déclenchées ---
  "Viashino Pyromancer": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target(), ref.self)], {
        targets: [target.player()],
        label: "2 blessures au joueur ciblé",
      }),
    ],
  },
  "Dragon Trainer": { abilities: [triggered(when.entersSelf, [fx.createTokens(DRAGON)], { label: "Dragon 4/4" })] },
  "Pelakka Wurm": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(7)], { label: "+7 PV" }),
      triggered(when.diesSelf, [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
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
  "Elfsworn Giant": { abilities: [triggered(when.landfall, [fx.createTokens(ELF_WARRIOR)], { label: "Elfe guerrier 1/1" })] },
  "Rampaging Baloths": { abilities: [triggered(when.landfall, [fx.createTokens(BEAST)], { label: "Bête 4/4" })] },
  "Spitfire Lagac": {
    abilities: [
      triggered(when.landfall, [fx.damage(1, ref.eachOpponent, ref.self)], { label: "1 blessure à chaque adversaire" }),
    ],
  },
  "Wary Thespian": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "surveillance 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "surveillance 1" }),
    ],
  },
  "Needletooth Pack": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 2)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.morbid,
        label: "Morbide : deux marqueurs +1/+1",
      }),
    ],
  },
  "Dwynen's Elite": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ELF_WARRIOR)], {
        condition: cond.controls({ types: ["Creature"], subtype: "Elf", other: true }),
        label: "Elfe guerrier 1/1",
      }),
    ],
  },
  "Beast-Kin Ranger": {
    abilities: [triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true }), [fx.pump(ref.self, 1, 0)], { label: "+1/+0" })],
  },
  "Crackling Cyclops": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 3, 0)], { label: "+3/+0" })],
  },
  "Nessian Hornbeetle": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: cond.controls({ types: ["Creature"], other: true, minPower: 4 }),
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Battle-Rattle Shaman": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.optional(target.creature())],
        label: "+2/+0 à une créature",
      }),
    ],
  },
};
