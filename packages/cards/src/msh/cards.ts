/**
 * Marvel Super Heroes — cartes des decks du méta (phase 1 du plan P4). Le Travail d'équipe (Teamwork) est lu dans le
 * texte (`scryfall.ts` : kicker « engagez des créatures de force totale N »). L'extension n'est pas encore couverte en
 * entier.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  manaAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Lot M2 -----------------------------------------------------------------
  "Hidden Lair": {
    abilities: [
      manaAbility("C"),
      manaAbility(["U", "B"], 1, {
        condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
      }),
    ],
  },
  "The Wondrous Wasp": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.modifyWhileSource(ref.target(), { loseAllAbilities: true })], {
        targets: [target.upTo(1, target.creature())],
        label: "Engage une créature, qui perd ses capacités",
      }),
    ],
  },
  "We Say Thee Nay!": {
    spell: spell(
      [target.spell()],
      fx.unlessPays(ref.controllerOf(ref.target()), { genericAmount: amount.kicked(4, 2) }, fx.counter(ref.target())),
    ),
  },
  "Wolverine, Fierce Fighter": {
    keywords: ["damageHealsFirst"],
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Se bat contre une autre créature",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "M.O.D.O.K.": {
    abilities: [
      activated({ payLife: 3, activationCondition: cond.yourTurn, effects: [fx.connive(ref.self)], label: "Complote (3 PV)" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { power: -1, toughness: -1 },
        {
          label: "Les créatures adverses ont -1/-1",
        },
      ),
    ],
  },
  "Captain Marvel, Earth's Protector": {
    abilities: [
      activated({
        mana: "{5}{W}{W}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.counters(ref.self, "indestructible")],
        label: "Montée en puissance : marqueurs +1/+1 et indestructible",
      }),
    ],
  },
};
