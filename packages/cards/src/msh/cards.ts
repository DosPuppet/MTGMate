/**
 * Marvel Super Heroes — cartes des decks du méta (phase 1 du plan P4). Le Travail d'équipe (Teamwork) est lu dans le
 * texte (`scryfall.ts` : kicker « engagez des créatures de force totale N »). L'extension n'est pas encore couverte en
 * entier.
 */
import { amount, type CardScript, cond, fx, manaAbility, ref, spell, target, triggered, when } from "./common";

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
};
