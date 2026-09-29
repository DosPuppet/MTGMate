/**
 * Tarkir: Dragonstorm — cartes des decks du méta (phase 1 du plan P4, lot M1). L'Harmonie (702.180) est lue dans le
 * texte (`scryfall.ts`) : lancée depuis le cimetière comme un flashback, une créature engagée réduit le coût. L'extension
 * sera couverte en entier en phase 2.
 */
import { activated, type CardScript, fx, playerStatic, ref, spell, target, triggered, when } from "./common";

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

  // --- Lot M2 -----------------------------------------------------------------
  "Strategic Betrayal": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.sacrifice(ref.target(), { types: ["Creature"] }, 1, { exile: true }),
        fx.moveAll("graveyard", ref.target(), {}, { to: "exile" }),
      ],
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Voice of Victory": {
    // Mobilisation 2 : lue dans le texte.
    abilities: [playerStatic({ opponentsCantCastYourTurn: true })],
  },
  "Qarsi Revenant": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [
          fx.counters(ref.target(), "flying"),
          fx.counters(ref.target(), "deathtouch"),
          fx.counters(ref.target(), "lifelink"),
        ],
        label: "Renouveau : vol, contact mortel et lien de vie",
      }),
    ],
  },
};
