/** Jurassic World Collection (REX) : scripts des cartes (PLAN-G). */
import { activated, amount, type CardScript, cond, fx, ref, spell, staticAbility, target, triggered, when } from "../tdm/common";

export const CARDS: Record<string, CardScript> = {
  "Don't Move": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Creature"], tapped: true }),
        fx.emblem(
          "Don't Move",
          "Jusqu'à votre prochain tour, chaque fois qu'une créature devient engagée, détruisez-la.",
          [
            triggered({ on: "taps", who: { types: ["Creature"] } }, [fx.destroy(ref.eventObject)], {
              label: "Une créature devient engagée : détruisez-la",
            }),
          ],
          true,
        ),
      ],
    ),
  },
  "Spitting Dilophosaurus": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "Un marqueur −1/−1 sur jusqu'à une créature",
      }),
      triggered(when.attacksSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "Un marqueur −1/−1 sur jusqu'à une créature",
      }),
      staticAbility(
        { types: ["Creature"], controller: "opponent", withCounter: "-1/-1" },
        { addKeywords: ["cantBlock"] },
        {
          label: "Les créatures adverses avec un marqueur −1/−1 ne peuvent pas bloquer",
        },
      ),
    ],
  },
  "Life Finds a Way": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", token: false, minPower: 4 }),
        [
          // Peuplement (701.30) : une copie d'un jeton de créature que vous contrôlez.
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], token: true }), ref.you, "p", {
            prompt: "Peuplez : un jeton de créature",
          }),
          fx.copyToken(ref.stored("p")),
        ],
        { label: "Une de vos créatures non-jetons de force 4 ou plus arrive : peuplez" },
      ),
    ],
  },
  "Savage Order": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], minPower: 4 }, count: 1 } },
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], subtype: "Dinosaur" }, { to: "battlefield" }, 1, undefined, "d"),
        fx.modify(ref.stored("d"), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
      ],
    ),
  },
  "Compy Swarm": {
    abilities: [
      triggered(when.step("end"), [fx.copyToken(ref.self, { tapped: true })], {
        condition: cond.morbid,
        label: "Une créature est morte ce tour-ci : un jeton copie engagé",
      }),
    ],
  },
  "Ellie and Alan, Paleontologists": {
    abilities: [
      activated({
        tap: true,
        exileFromGraveyard: { filter: { types: ["Creature"] }, count: 1 },
        sorcerySpeed: true,
        effects: [fx.discover(amount.manaValueOf(ref.costExiled))],
        label: "Découverte X (la valeur de mana de la carte exilée)",
      }),
    ],
  },
  "Permission Denied": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      [
        fx.counter(ref.target()),
        fx.thisTurn({ castLimit: { who: "opponents", maxSpells: 0, spellTypes: { notTypes: ["Creature"] } } }),
      ],
    ),
  },
  "Ravenous Tyrannosaurus": {
    devour: { filter: { types: ["Creature"] }, n: 3 },
    abilities: [
      triggered(
        when.attacksSelf,
        [
          { op: "damage", amount: amount.powerOf(ref.self), to: ref.target(), storeExcess: "ex" },
          fx.damage(amount.v("ex"), ref.controllerOf(ref.target())),
        ],
        {
          targets: [target.optional(target.creature("t", { other: true }))],
          label: "Blessures égales à sa force à une autre créature ; l'excès à son contrôleur",
        },
      ),
    ],
  },
};
