/** Reality Fracture — terrains non de base. */
import type { ManaType } from "@mtgx/engine";
import { activated, type CardScript, cond, entersWith, fx, manaAbility, ref, target, triggered, when } from "./common";

/** Terrains lents : « arrive engagé, sauf si vous contrôlez au moins deux autres terrains ». */
const slowLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
      label: "Engagé, sauf avec deux autres terrains",
    }),
    manaAbility([a, b]),
  ],
});

export const LANDS: Record<string, CardScript> = {
  "Deserted Beach": slowLand("W", "U"),
  "Haunted Ridge": slowLand("B", "R"),
  "Overgrown Farmland": slowLand("G", "W"),
  "Rockfall Vale": slowLand("R", "G"),
  "Shipwreck Marsh": slowLand("U", "B"),
  "Roiling Canopy": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.enters({ subtype: "Forest", controller: "you" }), [fx.pump(ref.target(), 3, 3)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.controls({ subtype: "Forest" }, 6),
        label: "six Forêts : +3/+3",
      }),
      manaAbility("G"),
    ],
  },
  "Room of Refuge": {
    chooseOnEnter: "color",
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["W"], 1, { produceChosen: true }),
      activated({
        mana: "{5}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.addCounters(ref.target(), 2)],
        label: "Deux marqueurs +1/+1",
      }),
    ],
  },
};
