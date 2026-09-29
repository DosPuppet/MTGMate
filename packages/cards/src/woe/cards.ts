/**
 * Wilds of Eldraine — cartes des decks du méta (phase 1 du plan P4, lot M1). Le Marchandage (702.166) est lu dans le
 * texte (`scryfall.ts` : kicker « sacrifiez un artefact, un enchantement ou un jeton »). L'extension n'est pas encore
 * couverte en entier.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  INSTANT_SORCERY,
  RAT_NO_BLOCK,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

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

  // --- Lot M2 -----------------------------------------------------------------
  "Disdainful Stroke": {
    spell: spell([target.spell("t", { minManaValue: 4 }, "sort de VM 4 ou plus")], [fx.counter(ref.target())]),
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Candy Trail": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.draw(1)],
        label: "Gagnez 3 PV, piochez",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Song of Totentanz": {
    spell: spell(
      [],
      [
        fx.createTokens(RAT_NO_BLOCK, amount.x),
        fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["haste"] }),
      ],
    ),
  },
};
