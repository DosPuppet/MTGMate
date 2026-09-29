/**
 * Wilds of Eldraine — cartes des decks du méta (phase 1 du plan P4, lot M1). Le Marchandage (702.166) est lu dans le
 * texte (`scryfall.ts` : kicker « sacrifiez un artefact, un enchantement ou un jeton »). L'extension n'est pas encore
 * couverte en entier.
 */
import { amount, type CardScript, cond, fx, INSTANT_SORCERY, ref, spell, target } from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Sleight of Hand": { spell: spell([], [fx.lookAtTop(2, { count: 1, to: { to: "hand" }, rest: "bottom" })]) },
  // --- Rouge -----------------------------------------------------------------
  "Hearth Elemental": {
    // {X} de moins : cartes d'éphémère, de rituel et/ou avec une Aventure dans votre cimetière.
    costReduction: {
      generic: amount.plus(
        amount.countIn("graveyard", INSTANT_SORCERY),
        amount.countIn("graveyard", { notTypes: ["Instant", "Sorcery"], adventure: true }),
      ),
    },
  },
  "Stoke Genius": { spell: spell([], [fx.discard(amount.cardsIn("hand")), fx.draw(2)]) },
  "Torch the Tower": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.exileIfDies(ref.target()), fx.damage(amount.kicked(3, 2), ref.target()), ...fx.when(cond.kicked, fx.scry(1))],
    ),
  },
};
