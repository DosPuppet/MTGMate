/**
 * Tarkir: Dragonstorm — cartes des decks du méta (phase 1 du plan P4, lot M1). L'Harmonie (702.180) est lue dans le
 * texte (`scryfall.ts`) : lancée depuis le cimetière comme un flashback, une créature engagée réduit le coût. L'extension
 * sera couverte en entier en phase 2.
 */
import { type CardScript, fx, ref, spell, triggered, when } from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Winternight Stories": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Creature"] } })]),
  },
  // --- Vert ------------------------------------------------------------------
  "Surrak, Elusive Hunter": {
    cantBeCountered: true,
    abilities: [
      triggered(when.targetedByOpponent({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], {
        label: "Piochez une carte",
      }),
    ],
  },
};
