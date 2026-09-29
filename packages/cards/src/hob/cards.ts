/**
 * The Hobbit — cartes des decks du méta (phase 1 du plan P4, lot M1) : contempler (`cond.behold`). L'extension n'est pas
 * encore couverte en entier.
 */
import { activated, amount, BASIC_LAND, type CardScript, cond, fx, ref, TREASURE, target, triggered, when } from "./common";

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

  // --- Lot M2 -----------------------------------------------------------------
  "Azog, Moria's Ruin": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.draw(1)),
          fx.destroy(ref.target()),
          fx.amass(ref.controllerOf(ref.target()), "Goblin", amount.powerOf(ref.target())),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Détruit une créature ; son contrôleur amasse des Gobelins",
        },
      ),
    ],
  },
  "The Sackville-Bagginses": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }], other: true }, 1, {
            optional: true,
            store: "s",
          }),
          ...fx.when(cond.v("s"), fx.draw(1), fx.createTokens(TREASURE)),
        ],
        { label: "Sacrifice facultatif : piochez, un Trésor" },
      ),
      triggered(when.sacrifice({ token: true }), [fx.loseLife(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire perd 1 PV",
      }),
    ],
  },
};
