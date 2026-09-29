/**
 * Teenage Mutant Ninja Turtles — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore
 * couverte en entier.
 */
import { activated, BASIC_LAND, type CardScript, cond, entersWith, fx, ref, target, triggered, when } from "./common";

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
};
