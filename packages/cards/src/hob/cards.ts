/**
 * The Hobbit — cartes des decks du méta (phase 1 du plan P4, lot M1) : contempler (`cond.behold`). L'extension n'est pas
 * encore couverte en entier.
 */
import { activated, BASIC_LAND, type CardScript, cond, fx, ref } from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Elven Passage": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        sacrifice: true,
        effects: [
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, undefined, "land"),
          // « Vous pouvez contempler un Elfe. Si vous le faites, dégagez ce terrain. »
          ...fx.when(cond.behold({ subtype: "Elf" }), fx.untap(ref.stored("land"))),
        ],
        label: "Chercher un terrain de base (dégagé en contemplant un Elfe)",
      }),
    ],
  },
};
