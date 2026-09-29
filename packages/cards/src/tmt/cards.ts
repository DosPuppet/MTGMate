/**
 * Teenage Mutant Ninja Turtles — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore
 * couverte en entier.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  MUTAGEN,
  playerStatic,
  ref,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Escape Tunnel": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Chercher un terrain de base",
      }),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une créature de force 2 ou moins ne peut pas être bloquée",
      }),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Leatherhead, Swamp Stalker": {
    abilities: [
      entersWith({ counters: 1, counterKind: "hexproof", label: "Arrive avec un marqueur de défense talismanique" }),
      triggered(
        when.combatDamageToPlayer,
        fx.may(
          "Retirer un marqueur de Leatherhead pour détruire un artefact ou un enchantement ?",
          fx.removeCounters(ref.self, 1, undefined, "removed"),
          fx.when(
            cond.v("removed"),
            fx.reflexive(
              [
                target.permanent(
                  "t",
                  ["Artifact", "Enchantment"],
                  { controller: "opponent" },
                  "artefact ou enchantement adverse",
                ),
              ],
              [fx.destroy(ref.target())],
            ),
          ),
        ),
        { label: "Retirer un marqueur : détruire un artefact ou un enchantement" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Dream Beavers": {
    abilities: [triggered(when.entersSelf, [...fx.drain(1), fx.scry(1)], { label: "Drain 1, regard 1" })],
  },
  "Mutagen Man, Living Ooze": {
    abilities: [
      playerStatic({ activatedReduction: { filter: { types: ["Artifact"], token: true }, n: 1 } }),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN, amount.sourceX)], { label: "X jetons Mutagène" }),
    ],
  },
  "The Ooze": {
    abilities: [
      triggered(
        when.leaves({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }),
        [fx.createTokens(MUTAGEN, amount.countersOn(ref.eventObject, "+1/+1"))],
        { label: "Un Mutagène par marqueur +1/+1" },
      ),
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target()), fx.createTokens(MUTAGEN)],
        label: "Exiler une carte d'un cimetière, un Mutagène",
      }),
    ],
  },
};
