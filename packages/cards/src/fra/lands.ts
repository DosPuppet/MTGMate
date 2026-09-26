/** Reality Fracture — terrains non de base. */
import type { ManaType } from "@mtgx/engine";
import { activated, type CardScript, cond, empower, entersWith, fx, manaAbility, ref, target, triggered, when } from "./common";

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

/** « Arrive engagé, sauf si vous contrôlez un planeswalker. » */
const walkerLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Planeswalker"] })),
      label: "Engagé, sauf avec un planeswalker",
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
  "Hexhaven Dueling Arena": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { attackedThisTurn: true })],
        effects: [fx.prepare(ref.target())],
        label: "Une créature qui a attaqué devient préparée",
      }),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature("t")],
        effects: [fx.prepare(ref.target())],
        label: "Une créature devient préparée",
      }),
    ],
  },
  "Theorist's Sanctum": {
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.beholdJace), label: "Engagé, sauf en contemplant un Jace" }),
      activated({ mana: "{2}{U}", tap: true, effects: [empower(2)], label: "Renforcez Jace 2" }),
    ],
  },
  "Dedicated Commons": walkerLand("R", "W"),
  "Fatehold Annex": walkerLand("W", "U"),
  "Formidable Commons": walkerLand("B", "G"),
  "Innovative Commons": walkerLand("U", "R"),
  "Konstrari Annex": walkerLand("R", "G"),
  "Meticulous Commons": walkerLand("W", "B"),
  "Stingerquill Annex": walkerLand("B", "R"),
  "Theorix Annex": walkerLand("U", "B"),
  "Transformative Commons": walkerLand("G", "U"),
  "Vigorbloom Annex": walkerLand("G", "W"),
};
