/** Teenage Mutant Ninja Turtles — cartes blanches (lot A). */
import type { Effect, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cmp,
  cond,
  DINOSAUR_SOLDIER,
  FOOD,
  fx,
  MUTANT,
  mode,
  NINJA,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Alliance : « chaque fois qu'une autre créature arrive sous votre contrôle ». */
const ALLIANCE = when.enters({ ...CREATURES_YOU_CONTROL, other: true });

export const WHITE: Record<string, CardScript> = {
  "Action News Crew": {
    // Vigilance : lue dans le texte. Canalisation : capacité activée depuis la main, en défaussant la carte.
    abilities: [
      activated({
        mana: "{6}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.addCountersAll(CREATURES_YOU_CONTROL, 1), fx.draw(1)],
        label: "Canalisation : un marqueur +1/+1 sur chacune de vos créatures, piochez une carte",
      }),
    ],
  },
  "Agent Bishop, Man in Black": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Un marqueur +1/+1 sur chacune de jusqu'à deux créatures",
      }),
    ],
  },
  "April O'Neil, Kunoichi Trainee": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      blockAbility(block.notBy({ minPower: 3 }, "Imblocable par les créatures de force 3 ou plus")),
    ],
  },
  "Dimensional Exile": {
    enchant: { filter: { types: ["Land"], basic: true, controller: "you" }, label: "terrain de base que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exile une créature adverse jusqu'à son départ",
      }),
    ],
  },
  "East Wind Avatar": {
    abilities: [triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance : +1/+0 jusqu'à la fin du tour" })],
  },
  "Featherbrained Filcher": {
    abilities: [triggered(when.leavesSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" })],
  },
  "Grounded for Life": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Hamato Guardian Stance": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["flying"]), fx.scry(1)]),
  },
  "High-Flying Ace": {
    abilities: [
      activated({
        mana: "{3}{W}",
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { not: { keyword: "flying" } }), label: "créature sans le vol" }],
        effects: [fx.modify(ref.target(), { addKeywords: ["flying"] })],
        label: "Une créature sans le vol gagne le vol",
      }),
    ],
  },
  "Jennika, Bad Apple Big Sister": {
    // Cycle de Plaine {2} : lu dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "Un Mutant 2/2 rouge" })],
  },
  "Koya, Death from Above": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileCard(ref.target(), { name: "k" }),
          // « Vous pouvez payer {3}{B}. Si vous ne le faites pas, renvoyez cette carte » : à moins que vous ne payiez.
          fx.delayed([fx.unlessPays(ref.you, { mana: "{3}{B}" }, fx.toBattlefield(ref.target("k")))], { k: ref.stored("k") }),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Exile une autre créature ; elle revient en fin de tour à moins que vous ne payiez {3}{B}",
        },
      ),
    ],
  },
  "Leader's Talent": {
    abilities: [
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { attacking: true }), label: "créature attaquante" }],
        label: "Un marqueur +1/+1 sur une créature attaquante",
      }),
    ],
    classLevels: [
      [
        triggered(when.leaves({ ...CREATURES_YOU_CONTROL, withCounter: "any" }), [fx.gainLife(2)], {
          label: "Une de vos créatures avec un marqueur part : gagnez 2 PV",
        }),
      ],
      [
        triggered(when.castSpell("you"), [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
          label: "Un marqueur +1/+1 sur chacune de vos créatures",
        }),
      ],
    ],
  },
  "Leonardo, Big Brother": {
    // Faufilement {W} : lu dans le texte.
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { ...CREATURES_YOU_CONTROL, other: true }, label: "+1/+0 pour chacune de vos autres créatures" },
      ),
    ],
  },
  "Leonardo, Cutting Edge": {
    // Faufilement {W} et lien de vie : lus dans le texte.
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "Un marqueur +1/+1" })],
  },
  "Leonardo, Leader in Blue": {
    // Faufilement {3}{W}{W} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 0)], {
        condition: cond.castVia("sneak"),
        label: "Faufilé : vos créatures gagnent +2/+0",
      }),
      activated({
        mana: "{1}{W}",
        effects: [fx.modify(ref.self, { addKeywords: ["firstStrike"] })],
        label: "Initiative jusqu'à la fin du tour",
      }),
    ],
  },
  "Leonardo, Sewer Samurai": {
    // Faufilement {2}{W}{W} et double initiative : lus dans le texte.
    abilities: [
      playerStatic({
        playFrom: {
          zone: "graveyard",
          filter: { types: ["Creature"], anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] },
          what: "spells",
          finality: true,
        },
        condition: cond.yourTurn,
      }),
    ],
  },
  "Leonardo's Technique": {
    // Faufilement {1}{W} : lu dans le texte.
    spell: spell(
      [
        target.between(
          1,
          2,
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins"),
        ),
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Lita, Little Orphan Amphibian": {
    abilities: [
      triggeredModal(
        ALLIANCE,
        [
          mode("Un marqueur +1/+1 sur Lita", [], [fx.addCounters(ref.self, 1)]),
          mode("Une Nourriture", [], [fx.createTokens(FOOD)]),
          mode("Regard 1", [], [fx.scry(1)]),
        ],
        { uniqueModes: "turn", label: "Alliance : un mode pas encore choisi ce tour-ci" },
      ),
    ],
  },
  "Mighty Mutanimals": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "Un Mutant 2/2 rouge" }),
      triggered(ALLIANCE, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Alliance : un marqueur +1/+1 sur une de vos créatures",
      }),
    ],
  },
  "Prehistoric Pet": {
    abilities: [
      blockAbility(
        block.notBy({ compare: [cmp.power(">", amount.sourcePower)] }, "Imblocable par les créatures de force supérieure"),
      ),
      activated({
        mana: "{1}{W}",
        tap: true,
        activationCondition: cond.yourTurn,
        targets: [{ ...target.creature("t", { controller: "you", other: true }), label: "autre créature que vous contrôlez" }],
        effects: [fx.bounce(ref.target())],
        label: "Renvoie une autre de vos créatures en main",
      }),
    ],
  },
  "Quintessential Katana": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            triggered(when.combatDamage("self"), [fx.untap(ref.self), fx.gainLife(2)], {
              label: "Blessures de combat : se dégage, gagnez 2 PV",
            }),
          ],
        },
        { label: "+1/+1 ; blessures de combat : se dégage et 2 PV" },
      ),
      triggered(
        when.enters({ subtype: "Ninja", controller: "you" }),
        fx.may("Attacher Quintessential Katana à ce Ninja ?", fx.attach(ref.eventObject)),
        { label: "Vous pouvez l'attacher au Ninja arrivé" },
      ),
    ],
  },
  "Sally Pride, Lioness Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTANT, amount.count({ ...CREATURES_YOU_CONTROL, token: false }))], {
        label: "X Mutants 2/2 (X : vos créatures non-jetons)",
      }),
      triggered(when.attacksSelf, [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
        label: "Un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Triceraton Commander": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DINOSAUR_SOLDIER, amount.sourceX)], {
        label: "X Dinosaures Soldats 2/2 blancs",
      }),
      triggered(when.attacksSelf, [fx.pumpAll({ subtype: "Dinosaur", controller: "you", other: true }, 1, 1, ["flying"])], {
        label: "Vos autres Dinosaures gagnent +1/+1 et le vol",
      }),
    ],
  },
  "Turncoat Kunoichi": {
    // Faufilement {2}{W}{B} : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.castVia("sneak"), fx.exile(ref.target())),
          ...fx.when(cond.not(cond.castVia("sneak")), fx.exileUntilLeaves(ref.target())),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Exile une créature adverse jusqu'à son départ (pour de bon si faufilée)",
        },
      ),
    ],
  },
  "Turtles Forever": {
    // Approximation : seulement la bibliothèque (rien « hors de la partie ») ; moins de quatre cartes trouvées, l'adversaire
    // choisit parmi celles-ci.
    spell: spell(
      [],
      [
        {
          ...fx.search({ types: ["Creature"], legendary: true }, { to: "hand" }, 4, undefined, "f"),
          distinctNames: true,
        } as Effect,
        fx.chooseAmong(ref.stored("f"), ref.eachOpponent, "c1", { anyZone: true }),
        fx.chooseAmong(ref.stored("c1Rest"), ref.eachOpponent, "c2", { anyZone: true }),
        fx.moveTo(ref.stored("c2Rest"), { to: "libraryTop", shuffle: true }),
      ],
    ),
  },
  "Uneasy Alliance": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Ne peut ni attaquer ni bloquer" }),
      activated({
        mana: "{5}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.exile(ref.attached), fx.createTokens(NINJA)],
        label: "Exile la créature enchantée, un Ninja 1/1",
      }),
    ],
  },
};
