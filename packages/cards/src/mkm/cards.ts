/**
 * Murders at Karlov Manor — cards of the meta decks (phase 1 of plan P4, lot M1). The other cards of the set are in the
 * per-color files.
 */
import { activated, type CardScript, cond, entersWith, fx, ref, spell, staticAbility, target, triggered, when } from "./common";

/** Surveil lands: enter tapped, surveil 1; their mana comes from their basic land types. */
const surveilLand: CardScript = {
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" })],
};

export const CARDS: Record<string, CardScript> = {
  // --- Lands -----------------------------------------------------------------
  "Thundering Falls": surveilLand,

  // --- Lot M2 -----------------------------------------------------------------
  "Vengeful Tracker": {
    abilities: [
      triggered(when.sacrifice({ types: ["Artifact"] }, false, true), [fx.damage(2, ref.eventPlayer)], {
        label: "2 damage to the opponent who sacrifices an artifact",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Meticulous Archive": surveilLand,
  "No More Lies": {
    spell: spell([target.spell()], fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counterExile(ref.target()))),
  },
  "Deadly Cover-Up": {
    // Collect evidence 6 (optional additional cost): read from the text.
    spell: spell([], [fx.destroyAll({ types: ["Creature"] }), ...fx.when(cond.kicked, fx.exileNamesakes)]),
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Case of the Uneaten Feast": {
    abilities: [triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.gainLife(1)], { label: "Gain 1 life" })],
    caseToSolve: cond.lifeGainedAtLeast(5),
    caseSolved: [
      activated({
        sacrifice: true,
        effects: [fx.thisTurn({ playFrom: { zone: "graveyard", filter: { types: ["Creature"] }, what: "spells" } })],
        label: "This turn, you may cast creature cards from your graveyard",
      }),
    ],
  },
  "Warleader's Call": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 damage to each opponent",
      }),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Steamcore Scholar": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(2),
          fx.discard(2, ref.you, {
            unlessFilter: { anyOf: [{ types: ["Instant", "Sorcery"] }, { types: ["Creature"], keyword: "flying" }] },
          }),
        ],
        { label: "Draw two cards, then discard two (or one)" },
      ),
    ],
  },
  "Underground Mortuary": surveilLand,
};
