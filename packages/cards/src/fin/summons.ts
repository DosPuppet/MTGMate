/** Final Fantasy — "Summon" Saga creatures (lot B). */
import type { CardScript } from "@mtgx/engine";
import { amount, chapter, chocobo, cond, fx, KNIGHT_2, ref, target, triggered, when } from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const OTHERS = { ...YOURS, other: true };
const SEA = ["Kraken", "Leviathan", "Merfolk", "Octopus", "Serpent"];

export const SUMMONS: Record<string, CardScript> = {
  "Summon: Choco/Mog": { abilities: [chapter([1, 2, 3, 4], [fx.pumpAll(OTHERS, 1, 0)], { label: "Stampede! +1/+0" })] },
  "Summon: Knights of Round": {
    abilities: [
      chapter([1, 2, 3, 4], [fx.createTokens(KNIGHT_2, 3)], { label: "Three 2/2 Knights" }),
      chapter([5], [fx.pumpAll(OTHERS, 2, 2), fx.addCountersAll(OTHERS, 1, "indestructible")], { label: "Ultimate End" }),
    ],
  },
  "Summon: Primal Garuda": {
    abilities: [
      chapter([1], [fx.damage(4, ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Aerial Blast: 4 damage",
      }),
      chapter([2, 3], [fx.pump(ref.target(), 1, 0, ["flying"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Slipstream: +1/+0 and flying",
      }),
    ],
  },
  "Summon: Leviathan": {
    abilities: [
      chapter([1], [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], noneOfSubtypes: SEA }, { to: "hand" })], {
        label: "Return non-sea creatures",
      }),
      chapter(
        [2, 3],
        [
          fx.emblem(
            "Summon: Leviathan",
            "Until end of turn, whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks, draw a card.",
            [
              triggered(when.attacks({ types: ["Creature"], anyOf: SEA.map((subtype) => ({ subtype })) }), [fx.draw(1)], {
                label: "Draw",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "Sea creature attacks: draw" },
      ),
    ],
  },
  "Summon: Shiva": {
    abilities: [
      chapter([1, 2], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Heavenly Strike",
      }),
      chapter([3], [fx.draw(amount.count({ types: ["Creature"], controller: "opponent", tapped: true }))], {
        label: "Diamond Dust",
      }),
    ],
  },
  "Summon: Anima": {
    abilities: [
      chapter([1, 2, 3], [fx.draw(1), fx.loseLife(1)], { label: "Pain" }),
      chapter([4], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }), fx.loseLife(3, ref.eachOpponent)], {
        label: "Oblivion",
      }),
    ],
  },
  "Summon: Esper Ramuh": {
    abilities: [
      chapter([1], [fx.damage(amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Judgment Bolt",
      }),
      chapter([2, 3], [fx.pumpAll({ ...YOURS, subtype: "Wizard" }, 1, 0)], { label: "Wizards get +1/+0" }),
    ],
  },
  "Summon: G.F. Cerberus": {
    abilities: [
      chapter([1], [fx.surveil(1)], { label: "Surveil 1" }),
      chapter([2], [fx.copyNextSpell], { label: "Double: copy the next instant or sorcery" }),
      chapter([3], [fx.copyNextSpell, fx.copyNextSpell], { label: "Triple: copy it twice" }),
    ],
  },
  "Summon: G.F. Ifrit": {
    abilities: [
      chapter(
        [1, 2],
        [fx.may("Discard a card to draw?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1)))],
        { label: "Discard, then draw" },
      ),
      chapter([3, 4], [fx.addMana("R")], { label: "Add {R}" }),
    ],
  },
  "Summon: Fat Chocobo": {
    abilities: [
      chapter([1], [chocobo()], { label: "Wark: 2/2 Chocobo" }),
      chapter([2, 3, 4], [fx.pumpAll(YOURS, 0, 0, ["trample"])], { label: "Kerplunk: trample" }),
    ],
  },
  "Summon: Titan": {
    abilities: [
      chapter([1], [fx.mill(5)], { label: "Mill five cards" }),
      chapter([2], [fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Lands return from your graveyard",
      }),
      chapter(
        [3],
        [
          fx.pump(
            ref.target(),
            amount.count({ types: ["Land"], controller: "you" }),
            amount.count({ types: ["Land"], controller: "you" }),
            ["trample"],
          ),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+X/+X and trample" },
      ),
    ],
  },
};
