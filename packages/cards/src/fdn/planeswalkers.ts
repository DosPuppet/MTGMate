/** Foundations — planeswalkers (loyauté de départ lue dans les données Scryfall). */
import {
  ART_ENCH_OR_FLYER,
  amount,
  CAT_2,
  type CardScript,
  CREATURE_YOU_CONTROL,
  fx,
  loyalty,
  NINJA,
  ref,
  target,
  targetObj,
  triggered,
  when,
  ZOMBIE,
} from "./common";

export const PLANESWALKERS: Record<string, CardScript> = {
  "Ajani, Caller of the Pride": {
    abilities: [
      loyalty(1, {
        targets: [target.optional(target.creature())],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "marqueur +1/+1 sur jusqu'à une créature",
      }),
      loyalty(-3, {
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["flying", "doubleStrike"])],
        label: "vol et double initiative",
      }),
      loyalty(-8, { effects: [fx.createTokens(CAT_2, amount.lifeTotal)], label: "X Chats 2/2 (X = votre vie)" }),
    ],
  },
  "Kaito, Cunning Infiltrator": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU_CONTROL, true), [fx.counters(ref.self, "loyalty", 1)], {
        label: "marqueur de loyauté",
      }),
      loyalty(1, {
        targets: [target.optional(target.creature("t", { controller: "you" }))],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] }), ...fx.loot(1)],
        label: "imblocable, piochez puis défaussez",
      }),
      loyalty(-2, { effects: [fx.createTokens(NINJA)], label: "Ninja 2/1" }),
      loyalty(-9, {
        effects: [
          fx.emblem("Emblème de Kaito", "À chaque fois qu'un joueur lance un sort, vous créez un jeton Ninja 2/1 bleu.", [
            triggered(when.castSpell("any"), [fx.createTokens(NINJA)], { label: "Ninja 2/1" }),
          ]),
        ],
        label: "emblème",
      }),
    ],
  },
  "Chandra, Flameshaper": {
    abilities: [
      loyalty(2, { effects: [fx.addMana("R", "R", "R"), fx.impulse(3)], label: "{R}{R}{R}, exil de 3 cartes, jouez-en une" }),
      loyalty(1, {
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "copie avec célérité",
      }),
      loyalty(-4, {
        targets: [target.upTo(8, targetObj("t", { types: ["Creature", "Planeswalker"] }, "créatures et/ou planeswalkers"))],
        effects: [fx.damageDivided(8, ref.target())],
        label: "8 blessures réparties",
      }),
    ],
  },
  "Liliana, Dreadhorde General": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.draw(1)], { label: "piochez une carte" }),
      loyalty(1, { effects: [fx.createTokens(ZOMBIE)], label: "Zombie 2/2" }),
      loyalty(-4, {
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 2)],
        label: "chaque joueur sacrifie 2 créatures",
      }),
      loyalty(-9, {
        effects: [fx.keepOnePerType(ref.eachOpponent)],
        label: "chaque adversaire garde un permanent de chaque type",
      }),
    ],
  },
  "Vivien Reid": {
    abilities: [
      loyalty(1, {
        effects: [fx.lookAtTop(4, { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] } })],
        label: "regardez 4 cartes, prenez une créature ou un terrain",
      }),
      loyalty(-3, {
        targets: [targetObj("t", ART_ENCH_OR_FLYER, "artefact, enchantement ou créature volante")],
        effects: [fx.destroy(ref.target())],
        label: "détruit",
      }),
      loyalty(-8, {
        effects: [
          fx.emblem(
            "Emblème de Vivien",
            "Les créatures que vous contrôlez gagnent +2/+2 et ont la vigilance, le piétinement et l'indestructible.",
            [
              {
                kind: "static",
                affects: CREATURE_YOU_CONTROL,
                mods: { power: 2, toughness: 2, addKeywords: ["vigilance", "trample", "indestructible"] },
              },
            ],
          ),
        ],
        label: "emblème",
      }),
    ],
  },
};
