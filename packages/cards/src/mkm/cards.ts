/**
 * Murders at Karlov Manor — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte
 * en entier.
 */
import { activated, type CardScript, cond, entersWith, fx, ref, spell, staticAbility, target, triggered, when } from "./common";

/** Terrains à surveillance : arrivent engagés, surveillance 1 ; le mana vient de leurs types de terrain de base. */
const surveilLand: CardScript = {
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
};

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Thundering Falls": surveilLand,

  // --- Lot M2 -----------------------------------------------------------------
  "Vengeful Tracker": {
    abilities: [
      triggered(when.sacrifice({ types: ["Artifact"] }, false, true), [fx.damage(2, ref.eventPlayer)], {
        label: "2 blessures à l'adversaire qui sacrifie un artefact",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Meticulous Archive": surveilLand,
  "No More Lies": {
    spell: spell([target.spell()], fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counterExile(ref.target()))),
  },
  "Deadly Cover-Up": {
    // Réunir des preuves 6 (coût additionnel facultatif) : lu dans le texte.
    spell: spell([], [fx.destroyAll({ types: ["Creature"] }), ...fx.when(cond.kicked, fx.exileNamesakes)]),
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Case of the Uneaten Feast": {
    abilities: [triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.gainLife(1)], { label: "Gagnez 1 PV" })],
    caseToSolve: cond.lifeGainedAtLeast(5),
    caseSolved: [
      activated({
        sacrifice: true,
        effects: [fx.thisTurn({ castCreaturesFromGraveyard: true })],
        label: "Ce tour-ci, lancez vos cartes de créature depuis votre cimetière",
      }),
    ],
  },
  "Warleader's Call": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
};
