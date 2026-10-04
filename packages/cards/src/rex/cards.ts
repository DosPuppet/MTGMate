/** Jurassic World Collection (REX) : scripts des cartes (PLAN-G). */
import type { Effect } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

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
  // — G4e : sous-lot difficile —
  "Grim Giganotosaurus": {
    abilities: [
      // Monstruosité 10 (701.37) : « monstrueuse » est noté par un marqueur, qui déclenche la capacité suivante.
      activated({
        mana: "{10}{B}{G}",
        reduction: { generic: amount.count({ types: ["Creature"], controller: "opponent", minPower: 4 }) },
        activationCondition: cond.not(cond.amountAtLeast(amount.countersOn(ref.self, "monstrous"), 1)),
        effects: [fx.addCounters(ref.self, 10), fx.counters(ref.self, "monstrous")],
        label: "Monstruosité 10",
      }),
      triggered(
        { on: "countersPut", who: "self", kind: "monstrous" },
        [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], other: true })],
        {
          label: "Devient monstrueuse : détruisez tous les autres artefacts et créatures",
        },
      ),
    ],
  },
  // Menace : lue dans le texte.
  "Indoraptor, the Perfect Hybrid": {
    abilities: [
      // Soif de sang X (702.54) : X, les blessures infligées à vos adversaires ce tour-ci.
      entersWith({
        counters: amount.turnEvents({ event: "damage", who: "opponent", toPlayer: true, sum: true }),
        label: "Soif de sang X",
      }),
      triggered(
        when.isDealtDamage,
        [
          // L'adversaire choisi au hasard : le premier adversaire (exact en duel).
          {
            op: "unlessPay",
            who: ref.eachOpponent,
            sacrifice: 1,
            sacrificeFilter: { types: ["Creature"], token: false },
            skip: 1,
          } as Effect,
          fx.damage(amount.powerOf(ref.self), ref.eachOpponent),
        ],
        { label: "Rage : un adversaire subit des blessures égales à sa force, à moins de sacrifier une créature non-jeton" },
      ),
    ],
  },
  "Henry Wu, InGen Geneticist": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Human", controller: "you" },
        {
          addAbilities: [
            // Exploitation (702.110) : « vous pouvez sacrifier une créature » ; Henry Wu en tire une carte (et un Trésor).
            triggered(
              when.entersSelf,
              [
                fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "x" }),
                ...fx.when(cond.refMatches(ref.stored("x"), { notSubtype: "Human" }), fx.draw(1)),
                ...fx.when(cond.refMatches(ref.stored("x"), { notSubtype: "Human", minPower: 3 }), fx.createTokens(TREASURE)),
              ],
              { label: "Exploitation" },
            ),
          ],
        },
        { label: "Henry Wu et vos autres Humains ont l'exploitation" },
      ),
    ],
  },
};
