/** Breaking News (OTP) : scripts des cartes (PLAN-G). */
import { altCostMode, amount, type CardScript, escalate, fx, ref, spell, target } from "../tdm/common";

export const CARDS: Record<string, CardScript> = {
  "Collective Defiance": {
    spell: escalate(
      "{1}",
      {
        label: "Le joueur ciblé défausse sa main, puis pioche autant",
        targets: [target.player("p")],
        effects: [fx.discard(999, ref.target("p"), { store: "n" }), fx.draw(amount.v("n"), ref.target("p"))],
      },
      { label: "4 blessures à la créature ciblée", targets: [target.creature("c")], effects: [fx.damage(4, ref.target("c"))] },
      {
        label: "3 blessures à l'adversaire ou au planeswalker ciblé",
        targets: [
          { id: "o", label: "adversaire ou planeswalker", filter: { players: "opponent", objects: { types: ["Planeswalker"] } } },
        ],
        effects: [fx.damage(3, ref.target("o"))],
      },
    ),
  },
  "Fierce Retribution": {
    spell: altCostMode(
      "Fendre",
      "{5}{W}",
      { targets: [target.creature("t", { attacking: true })], effects: [fx.destroy(ref.target())] },
      { targets: [target.creature()], effects: [fx.destroy(ref.target())] },
    ),
  },
  "Skewer the Critics": {
    // Spectacle {R} : lu dans le texte.
    spell: spell([target.any()], [fx.damage(3, ref.target())]),
  },
};
