/** Reality Fracture — nonbasic lands. */
import type { ManaType } from "@mtgx/engine";
import { activated, type CardScript, cond, empower, entersWith, fx, manaAbility, ref, target, triggered, when } from "./common";

/** Slow lands: "enters tapped unless you control two or more other lands". */
const slowLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
      label: "Tapped, unless with two other lands",
    }),
    manaAbility([a, b]),
  ],
});

/** "Enters tapped unless you control a planeswalker." */
const walkerLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Planeswalker"] })),
      label: "Tapped, unless with a planeswalker",
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
        label: "six Forests: +3/+3",
      }),
      manaAbility("G"),
    ],
  },
  "Room of Refuge": {
    asEnters: [fx.chooseForSelf("color")],
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
        label: "Two +1/+1 counters",
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
        label: "A creature that attacked becomes prepared",
      }),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature("t")],
        effects: [fx.prepare(ref.target())],
        label: "A creature becomes prepared",
      }),
    ],
  },
  "Theorist's Sanctum": {
    // "As this land enters, you may behold a Jace. If you don't, it enters tapped" (PLAN-L L5).
    asEnters: [...fx.mayBehold({ subtype: "Jace" })],
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.beheld), label: "Tapped, unless you behold a Jace" }),
      activated({ mana: "{2}{U}", tap: true, effects: [empower(2)], label: "Empower Jace 2" }),
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
