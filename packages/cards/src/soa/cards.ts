/** Mystical Archive (SOA) : scripts des cartes (PLAN-G). */
import { altCostMode, BASIC_LAND, type CardScript, fx, ref, target } from "../tdm/common";

const NOT_YOURS_NONLAND = target.nonland("t", { controller: "opponent" }, "permanent non-terrain que vous ne contrôlez pas");

export const CARDS: Record<string, CardScript> = {
  "Cyclonic Rift": {
    spell: altCostMode(
      "Surcharge",
      "{6}{U}",
      { targets: [NOT_YOURS_NONLAND], effects: [fx.bounce(ref.target())] },
      { effects: [fx.bounce(ref.permanentsOf(ref.eachOpponent, { notTypes: ["Land"] }))] },
    ),
  },
  "Winds of Abandon": {
    // Le contrôleur de chaque créature exilée cherche autant de terrains de base que de ses créatures exilées (le
    // nombre est lu du point de vue de celui qui cherche ; une créature exilée a son propriétaire pour contrôleur).
    spell: altCostMode(
      "Surcharge",
      "{4}{W}{W}",
      {
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [
          fx.moveTo(ref.target(), { to: "exile" }, { name: "x" }),
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.stored("x"))),
        ],
      },
      {
        effects: [
          fx.moveTo(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }), { to: "exile" }, { name: "x" }),
          fx.search(
            BASIC_LAND,
            { to: "battlefield", tapped: true },
            { kind: "refCount", ref: ref.filtered(ref.stored("x"), { controller: "you" }) },
            ref.controllerOf(ref.stored("x")),
          ),
        ],
      },
    ),
  },
};
