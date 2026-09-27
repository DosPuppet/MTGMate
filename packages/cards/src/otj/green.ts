/** Outlaws of Thunder Junction — cartes vertes. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  ELEMENTAL,
  entersWith,
  fx,
  manaAbility,
  ref,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VARMINT,
  when,
  whileSaddled,
} from "./common";

const BASIC_OR_DESERT = { types: ["Land" as const], anyOf: [{ basic: true }, { subtype: "Desert" }] };
const POWER_4 = cond.controls({ types: ["Creature"], minPower: 4 });

export const GREEN: Record<string, CardScript> = {
  "Aloe Alchemist": {
    abilities: [
      triggered(when.plottedSelf, [fx.pump(ref.target(), 3, 2, ["trample"])], {
        targets: [target.creature("t")],
        label: "Comploté : +3/+2 et le piétinement",
      }),
    ],
  },
  "Beastbond Outcaster": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: POWER_4, label: "Piochez" })],
  },
  "Betrayal at the Vault": {
    spell: spell(
      [target.creature("a", { controller: "you" }), { ...target.exactly(2, target.creature("b")), otherThan: ["a"] }],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Bristlepack Sentry": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        { condition: POWER_4, label: "Peut attaquer (force 4)" },
      ),
    ],
  },
  "Bristly Bill, Spine Sower": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "Marqueur +1/+1" }),
      activated({
        mana: "{3}{G}{G}",
        effects: [fx.doubleCounters(ref.permanentsOf(ref.you, { types: ["Creature"] }))],
        label: "Doublez les marqueurs +1/+1",
      }),
    ],
  },
  Cactarantula: {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Desert" }) },
    abilities: [
      triggered({ on: "becomesTarget", who: "self", byOpponent: true }, fx.may("Piocher une carte ?", fx.draw(1)), {
        label: "Ciblée : piochez",
      }),
    ],
  },
  "Colossal Rattlewurm": {
    flashIf: cond.controls({ subtype: "Desert" }),
    abilities: [
      activated({
        mana: "{1}{G}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.search({ subtype: "Desert" }, { to: "battlefield", tapped: true })],
        label: "Désert engagé",
      }),
    ],
  },
  "Dance of the Tumbleweeds": {
    spell: spree(
      { cost: "{1}", label: "Terrain de base ou Désert", effects: [fx.search(BASIC_OR_DESERT, { to: "battlefield" })] },
      {
        cost: "{3}",
        label: "Élémental X/X",
        effects: [fx.createXXToken(ELEMENTAL, amount.count({ types: ["Land"], controller: "you" }))],
      },
    ),
  },
  "Drover Grizzly": {
    abilities: [whileSaddled([fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["trample"])], { label: "Vos créatures : piétinement" })],
  },
  "Freestrider Commando": {
    abilities: [
      entersWith({ counters: 2, condition: cond.not(cond.all(cond.wasCast, cond.amountAtLeast(amount.manaSpent, 1))) }),
    ],
  },
  "Freestrider Lookout": {
    abilities: [
      triggered(
        when.crime,
        [fx.lookAtTop(5, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "bottom" })],
        { oncePerTurn: true, label: "Un terrain parmi les cinq du dessus" },
      ),
    ],
  },
  "Full Steam Ahead": {
    spell: spell([], [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 2, ["trample", "cantBeBlockedByMoreThanOne"])]),
  },
  "Giant Beaver": {
    abilities: [
      // Approximation : une créature ciblée que vous contrôlez (et non une de celles qui l'ont montée).
      whileSaddled([fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Gold Rush": {
    spell: spell(
      [target.upTo(1, target.creature("t"))],
      [
        fx.createTokens(TREASURE),
        fx.pump(
          ref.target(),
          amount.plus(
            amount.count({ subtype: "Treasure", controller: "you" }),
            amount.count({ subtype: "Treasure", controller: "you" }),
          ),
          amount.plus(
            amount.count({ subtype: "Treasure", controller: "you" }),
            amount.count({ subtype: "Treasure", controller: "you" }),
          ),
        ),
      ],
    ),
  },
  "Goldvein Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(when.diesSelf, [fx.createTappedTokens(TREASURE, amount.powerOf(ref.self))], {
        label: "Autant de Trésors engagés",
      }),
    ],
  },
  "Hardbristle Bandit": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      triggered(when.crime, [fx.untap(ref.self)], { oncePerTurn: true, label: "Dégagez-le" }),
    ],
  },
  "Intrepid Stablemaster": {
    abilities: [
      manaAbility("G"),
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        restriction: { spell: { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] } },
      }),
    ],
  },
  "Map the Frontier": {
    spell: spell([], [fx.search(BASIC_OR_DESERT, { to: "battlefield", tapped: true }, 2)]),
  },
  "Ornery Tumblewagg": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "Marqueur +1/+1",
      }),
      whileSaddled([fx.doubleCounters(ref.target())], { targets: [target.creature("t")], label: "Doublez ses marqueurs" }),
    ],
  },
  "Outcaster Greenblade": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_OR_DESERT)], { label: "Terrain de base ou Désert en main" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Desert", controller: "you" }, label: "+1/+1 par Désert" },
      ),
    ],
  },
  "Outcaster Trailblazer": {
    abilities: [
      triggered(when.entersSelf, [fx.addManaChoice(1)], { label: "Un mana de n'importe quelle couleur" }),
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, minPower: 4 }), [fx.draw(1)], {
        label: "Piochez",
      }),
    ],
  },
  "Patient Naturalist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { types: ["Land"] }, { to: "hand" }, { pool: ref.stored("m"), store: "l" }),
          fx.when(cond.not(cond.v("l")), fx.createTokens(TREASURE)),
        ],
        { label: "Meulez trois cartes, un terrain en main (sinon Trésor)" },
      ),
    ],
  },
  "Railway Brawler": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.addCounters(ref.eventObject, amount.powerOf(ref.eventObject))],
        {
          label: "Autant de marqueurs que sa force",
        },
      ),
    ],
  },
  "Rambling Possum": {
    abilities: [whileSaddled([fx.pump(ref.self, 1, 2)], { label: "+1/+2" })],
  },
  "Raucous Entertainer": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addCountersAll({ ...CREATURE_YOU_CONTROL, enteredThisTurn: true }, 1)],
        label: "Marqueur sur vos créatures arrivées ce tour-ci",
      }),
    ],
  },
  "Reach for the Sky": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 3, toughness: 2, addKeywords: ["reach"] }, { label: "+3/+2 et la portée" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { fromGraveyard: true, label: "Piochez" }),
    ],
  },
  "Rise of the Varmints": {
    spell: spell([], [fx.createTokens(VARMINT, amount.countIn("graveyard", { types: ["Creature"] }))]),
  },
  "Smuggler's Surprise": {
    spell: spree(
      {
        cost: "{2}",
        label: "Meulez quatre cartes, reprenez-en deux",
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature", "Land"] },
            { to: "hand" },
            { pool: ref.stored("m"), count: 2, min: 0 },
          ),
        ],
      },
      {
        cost: "{4}{G}",
        label: "Jusqu'à deux créatures de votre main",
        effects: [fx.pickFromZone("hand", { types: ["Creature"] }, { to: "battlefield" }, { count: 2, min: 0 })],
      },
      {
        cost: "{1}",
        label: "Vos créatures de force 4 : protégées",
        effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, minPower: 4 }, 0, 0, ["hexproof", "indestructible"])],
      },
    ),
  },
  "Snakeskin Veil": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["hexproof"])],
    ),
  },
  "Spinewoods Armadillo": {
    abilities: [
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.search(BASIC_OR_DESERT), fx.gainLife(3)],
        label: "Terrain de base ou Désert, +3 PV",
      }),
    ],
  },
  "Spinewoods Paladin": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 PV" })] },
  "Stubborn Burrowfiend": {
    abilities: [
      triggered(
        when.saddled,
        [
          fx.mill(2),
          fx.pump(
            ref.self,
            amount.countIn("graveyard", { types: ["Creature"] }),
            amount.countIn("graveyard", { types: ["Creature"] }),
          ),
        ],
        { oncePerTurn: true, label: "Meulez deux cartes, +X/+X" },
      ),
    ],
  },
  "Throw from the Saddle": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.when(cond.targetMatches("a", { subtype: "Mount" }), fx.addCounters(ref.target("a"), 1)),
        fx.when(cond.not(cond.targetMatches("a", { subtype: "Mount" })), fx.pump(ref.target("a"), 1, 1)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
  "Trash the Town": {
    spell: spree(
      {
        cost: "{2}",
        label: "Deux marqueurs +1/+1",
        targets: [target.creature("a")],
        effects: [fx.addCounters(ref.target("a"), 2)],
      },
      {
        cost: "{1}",
        label: "Piétinement",
        targets: [target.creature("b")],
        effects: [fx.pump(ref.target("b"), 0, 0, ["trample"])],
      },
      {
        cost: "{1}",
        label: "Blessures de combat : piochez deux cartes",
        targets: [target.creature("c")],
        effects: [
          fx.modify(ref.target("c"), {
            addAbilities: [triggered(when.combatDamage("self", true), [fx.draw(2)], { label: "Piochez deux cartes" })],
          }),
        ],
      },
    ),
  },
  "Tumbleweed Rising": {
    spell: spell([], [fx.createXXToken(ELEMENTAL, amount.maxPower({ types: ["Creature"], controller: "you" }))]),
  },
  "Voracious Varmint": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un artefact ou un enchantement",
      }),
    ],
  },
};
