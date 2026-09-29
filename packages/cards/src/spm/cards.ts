/**
 * Marvel's Spider-Man — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte en
 * entier.
 */
import { activated, amount, type CardScript, cond, fx, manaAbility, ref, target, triggered, when } from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Hydro-Man, Fluid Felon": {
    abilities: [
      triggered(when.castSpell("you", { colors: ["U"] }), [fx.pump(ref.self, 1, 1)], {
        condition: cond.sourceMatches({ types: ["Creature"] }),
        label: "+1/+1 jusqu'à la fin du tour",
      }),
      triggered(
        when.yourEndStep,
        [
          fx.untap(ref.self),
          // « Jusqu'à votre prochain tour, il devient un terrain et gagne « {T} : ajoutez {U} ». » (ce n'est plus une créature).
          fx.modify(ref.self, { setTypes: ["Land"], setSubtypes: [], addAbilities: [manaAbility("U")] }, "untilYourNextTurn"),
        ],
        { label: "Se dégage et devient un terrain jusqu'à votre prochain tour" },
      ),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Sandman, Shifting Scoundrel": {
    cdaPT: amount.count({ types: ["Land"], controller: "you" }),
    keywords: ["cantBeBlockedByPowerLE2"],
    abilities: [
      activated({
        mana: "{3}{G}{G}",
        fromGraveyard: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        effects: [fx.toBattlefield(ref.selfCard, { tapped: true }), fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Revient avec une carte de terrain de votre cimetière",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Superior Spider-Man": {
    entersAsCopyOfGraveyard: { filter: { types: ["Creature"] }, name: "Superior Spider-Man", power: 4, toughness: 4 },
    entersAsCopyAddSubtypes: ["Spider", "Human", "Hero"],
  },
};
