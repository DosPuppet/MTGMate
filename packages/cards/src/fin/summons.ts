/** Final Fantasy — créatures-Sagas « Summon » (lot B). */
import type { CardScript } from "@mtgx/engine";
import { amount, chapter, chocobo, cond, fx, KNIGHT_2, ref, target, triggered, when } from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const OTHERS = { ...YOURS, other: true };
const SEA = ["Kraken", "Leviathan", "Merfolk", "Octopus", "Serpent"];

export const SUMMONS: Record<string, CardScript> = {
  "Summon: Choco/Mog": { abilities: [chapter([1, 2, 3, 4], [fx.pumpAll(OTHERS, 1, 0)], { label: "Débandade ! +1/+0" })] },
  "Summon: Knights of Round": {
    abilities: [
      chapter([1, 2, 3, 4], [fx.createTokens(KNIGHT_2, 3)], { label: "Trois Chevaliers 2/2" }),
      chapter([5], [fx.pumpAll(OTHERS, 2, 2), fx.addCountersAll(OTHERS, 1, "indestructible")], { label: "Ultime fin" }),
    ],
  },
  "Summon: Primal Garuda": {
    abilities: [
      chapter([1], [fx.damage(4, ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Rafale aérienne : 4 blessures",
      }),
      chapter([2, 3], [fx.pump(ref.target(), 1, 0, ["flying"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Sillage : +1/+0 et le vol",
      }),
    ],
  },
  "Summon: Leviathan": {
    abilities: [
      chapter([1], [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], noneOfSubtypes: SEA }, { to: "hand" })], {
        label: "Renvoyez les créatures non marines",
      }),
      chapter(
        [2, 3],
        [
          fx.emblem(
            "Summon: Leviathan",
            "Until end of turn, whenever a Kraken, Leviathan, Merfolk, Octopus, or Serpent attacks, draw a card.",
            [
              triggered(when.attacks({ types: ["Creature"], anyOf: SEA.map((subtype) => ({ subtype })) }), [fx.draw(1)], {
                label: "Piochez",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "Créature marine attaquante : piochez" },
      ),
    ],
  },
  "Summon: Shiva": {
    abilities: [
      chapter([1, 2], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Frappe céleste",
      }),
      chapter([3], [fx.draw(amount.count({ types: ["Creature"], controller: "opponent", tapped: true }))], {
        label: "Poussière de diamant",
      }),
    ],
  },
  "Summon: Anima": {
    abilities: [
      chapter([1, 2, 3], [fx.draw(1), fx.loseLife(1)], { label: "Douleur" }),
      chapter([4], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }), fx.loseLife(3, ref.eachOpponent)], {
        label: "Oubli",
      }),
    ],
  },
  "Summon: Esper Ramuh": {
    abilities: [
      chapter([1], [fx.damage(amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Foudre du jugement",
      }),
      chapter([2, 3], [fx.pumpAll({ ...YOURS, subtype: "Wizard" }, 1, 0)], { label: "Sorciers +1/+0" }),
    ],
  },
  "Summon: G.F. Cerberus": {
    abilities: [
      chapter([1], [fx.surveil(1)], { label: "Surveillance 1" }),
      chapter([2], [fx.copyNextSpell], { label: "Double : copiez le prochain éphémère ou rituel" }),
      chapter([3], [fx.copyNextSpell, fx.copyNextSpell], { label: "Triple : copiez-le deux fois" }),
    ],
  },
  "Summon: G.F. Ifrit": {
    abilities: [
      chapter(
        [1, 2],
        [fx.may("Défausser une carte pour piocher ?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1)))],
        { label: "Défaussez, piochez" },
      ),
      chapter([3, 4], [fx.addMana("R")], { label: "Ajoutez {R}" }),
    ],
  },
  "Summon: Fat Chocobo": {
    abilities: [
      chapter([1], [chocobo()], { label: "Wark : Chocobo 2/2" }),
      chapter([2, 3, 4], [fx.pumpAll(YOURS, 0, 0, ["trample"])], { label: "Plouf : le piétinement" }),
    ],
  },
  "Summon: Titan": {
    abilities: [
      chapter([1], [fx.mill(5)], { label: "Meulez cinq cartes" }),
      chapter([2], [fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Les terrains du cimetière reviennent",
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
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+X/+X et le piétinement" },
      ),
    ],
  },
};
