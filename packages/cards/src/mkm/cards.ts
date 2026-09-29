/**
 * Murders at Karlov Manor — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte
 * en entier.
 */
import { type CardScript, entersWith, fx, ref, triggered, when } from "./common";

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
};
