/**
 * Teenage Mutant Ninja Turtles — cartes bleues (lot A). Faufilement, cycle de terrain et affinité : lus dans le texte
 * (l'affinité s'écrit en réduction de coût, comme en Aetherdrift).
 */
import type { Effect, Ref, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  MUTAGEN,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ARTIFACT_YOU_CONTROL: TargetSpec = target.permanent(
  "t",
  ["Artifact"],
  { controller: "you" },
  "artefact que vous contrôlez",
);

/**
 * « Mettez trois marqueurs +1/+1 sur [l'artefact]. Si ce n'est pas une créature, il devient une créature Robot 0/0 en
 * plus de ses autres types » (Donatello, Mutant Mechanic ; Does Machines, niveau 3).
 */
const roboticize = (what: Ref): Effect[] => [
  fx.addCounters(what, 3),
  ...fx.when(
    cond.not(cond.refMatches(what, { types: ["Creature"] })),
    fx.modify(what, { addTypes: ["Creature"], addSubtypes: ["Robot"], setPower: 0, setToughness: 0 }, "permanent"),
  ),
];

/** « Vous pouvez engager ou dégager la créature ciblée » : deux modes et un mode vide (Granite Witness). */
const tapOrUntapCreature = [
  mode("Engagez la créature ciblée", [target.creature()], [fx.tap(ref.target())]),
  mode("Dégagez la créature ciblée", [target.creature()], [fx.untap(ref.target())]),
  mode("Ne rien faire", [], []),
];

/**
 * Kitsune : « deux autres créatures ciblées contrôlées par des joueurs différents ». L'échange se fait entre la vôtre et
 * celle d'un adversaire (approximation : deux créatures de deux adversaires, à plus de deux joueurs, ne s'échangent pas).
 */
const KITSUNE_TARGETS: TargetSpec = {
  ...target.exactly(2, target.creature("t", { other: true })),
  differentPlayers: true,
  label: "deux autres créatures de joueurs différents",
};
const kitsuneExchange = fx.may(
  "Échanger le contrôle des deux créatures ciblées ?",
  fx.exchangeControl(
    ref.except(ref.target(), ref.permanentsOf(ref.eachOpponent, {})),
    ref.except(ref.target(), ref.permanentsOf(ref.you, {})),
  ),
);

export const BLUE: Record<string, CardScript> = {
  "April, Reporter of the Weird": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(amount.eventAmount), fx.discard(1)], {
        label: "Piochez autant de cartes que de blessures, puis défaussez une carte",
      }),
    ],
  },
  "Bespoke Bō": {
    // Équiper {3} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }, "autre permanent non-terrain"))],
        label: "Renvoyez jusqu'à un autre permanent non-terrain",
      }),
      staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["vigilance"] }, { label: "+2/+1 et la vigilance" }),
    ],
  },
  "Buzz Bots": {
    abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Crustacean Commando": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "Un jeton Mutagène" })],
  },
  "Does Machines": {
    // Coûts de niveau lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.draw(2), fx.discard(2)], {
        label: "Meulez deux cartes, piochez-en deux, puis défaussez-en deux",
      }),
    ],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.toHand(ref.target())], {
          targets: [target.upTo(2, target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact"))],
          label: "Renvoyez jusqu'à deux cartes d'artefact de votre cimetière en main",
        }),
      ],
      [
        triggered(when.yourCombat, roboticize(ref.target()), {
          targets: [ARTIFACT_YOU_CONTROL],
          label: "Trois marqueurs +1/+1 sur un de vos artefacts, qui devient un Robot 0/0",
        }),
      ],
    ],
  },
  "Donatello, Gadget Master": {
    // Faufilement {1}{U} : lu dans le texte.
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.copyToken(ref.target())], {
        targets: [ARTIFACT_YOU_CONTROL],
        label: "Un jeton copie d'un de vos artefacts",
      }),
    ],
  },
  "Donatello, Mutant Mechanic": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [ARTIFACT_YOU_CONTROL],
        effects: roboticize(ref.target()),
        label: "Trois marqueurs +1/+1 sur un de vos artefacts, qui devient un Robot 0/0",
      }),
      // « s'il avait des marqueurs » : dans le filtre (dernières informations connues), comme Host of the Hereafter.
      triggered(
        { on: "leaves", who: { types: ["Artifact"], controller: "you", withCounter: "any" }, to: "graveyard" },
        [fx.lkiCountersTo(ref.target())],
        {
          targets: [
            target.optional(
              target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez"),
            ),
          ],
          label: "Ses marqueurs vont sur un de vos artefacts ou une de vos créatures",
        },
      ),
    ],
  },
  "Donatello, Turtle Techie": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Artifact"] }),
        label: "Si vous contrôlez un artefact, piochez une carte",
      }),
    ],
  },
  "Donatello, Way with Machines": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.self, 1)], {
        label: "Un artefact arrive sous votre contrôle : un marqueur +1/+1",
      }),
    ],
  },
  "Donatello's Technique": {
    // Faufilement {U} : lu dans le texte.
    spell: spell([], [fx.draw(2)]),
  },
  "Kitsune, Dragon's Daughter": {
    abilities: [
      triggered(when.entersSelf, kitsuneExchange, {
        targets: [KITSUNE_TARGETS],
        label: "Vous pouvez échanger le contrôle de deux autres créatures",
      }),
      triggered(when.combatDamageToPlayer, kitsuneExchange, {
        targets: [KITSUNE_TARGETS],
        label: "Vous pouvez échanger le contrôle de deux autres créatures",
      }),
    ],
  },
  "Kitsune's Technique": {
    // Faufilement {1}{U} : lu dans le texte. « La moitié, arrondie au supérieur » : une carte, puis la moitié du reste
    // arrondie à l'inférieur (même nombre ; approximation : deux événements de meule).
    spell: spell([target.player("t", "opponent")], [fx.mill(1, ref.target()), fx.millHalf(ref.target())]),
  },
  "Krang, Master Mind": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.plus(4, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 4)),
        label: "Moins de quatre cartes en main : piochez jusqu'à quatre",
      }),
      staticAbility(
        "self",
        { power: 1 },
        { per: { types: ["Artifact"], controller: "you", other: true }, label: "+1/+0 par autre artefact que vous contrôlez" },
      ),
    ],
  },
  Metalhead: {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { other: true }, "autre artefact ou créature"))],
        label: "Renvoyez jusqu'à un autre artefact ou une autre créature",
      }),
      activated({
        mana: "{R}",
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["menace", "haste"])],
        label: "Un marqueur +1/+1, la menace et la célérité",
      }),
    ],
  },
  "Mind Transfer Protocol": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 5 }), fx.draw(1)],
    ),
  },
  "Ooze Spill": {
    spell: spell([target.spell()], [fx.counter(ref.target()), fx.createTokens(MUTAGEN)]),
  },
  "Ray Fillet, Man Ray": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "Un jeton Mutagène" }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: { types: ["Creature"], controller: "you" }, kind: "+1/+1" },
        effects: [fx.draw(1)],
        label: "Retirez un marqueur +1/+1 d'une de vos créatures : piochez une carte",
      }),
    ],
  },
  "Renet, Temporal Apprentice": {
    // « arrivé ce tour-ci » : passé sous le contrôle de son contrôleur actuel ce tour-ci (`enteredThisTurn`).
    abilities: [
      triggered(
        when.entersSelf,
        [fx.bounce(ref.permanentsOf(ref.eachPlayer, { nonland: true, other: true, enteredThisTurn: true }))],
        { label: "Renvoyez chaque autre permanent non-terrain arrivé ce tour-ci" },
      ),
    ],
  },
  "Retro-Mutation": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { setSubtypes: ["Turtle"], setPower: 0, setToughness: 1, loseAllAbilities: true, addKeywords: ["cantAttack"] },
        { label: "Tortue 0/1 de base, sans capacité, ne peut pas attaquer" },
      ),
    ],
  },
  "Return to the Sewers": {
    spell: spell([target.creature()], [fx.topOrBottom(ref.target()), fx.createTokens(MUTAGEN)]),
  },
  "Sewer-veillance Cam": {
    abilities: [
      triggeredModal(when.entersSelf, tapOrUntapCreature, { label: "Vous pouvez engager ou dégager une créature" }),
      triggeredModal(when.leavesSelf, tapOrUntapCreature, { label: "Vous pouvez engager ou dégager une créature" }),
      activated({ mana: "{3}{U}", sacrifice: true, effects: [fx.draw(2)], label: "Piochez deux cartes" }),
    ],
  },
  "Stockman, Mad Fly-entist": {
    // Cycle d'Île {2} : lu dans le texte.
    abilities: [triggered(when.entersSelf, fx.loot(1), { label: "Piochez une carte, puis défaussez une carte" })],
  },
  "Turtles in Time": {
    exileOnResolve: true,
    spell: spell([], [fx.bounce(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] })), fx.mayShuffleHandGraveyardDraw(7)]),
  },
  "Utrom Scientists": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.upTo(1, target.creature())],
        label: "Engagez jusqu'à une créature ; un marqueur d'étourdissement",
      }),
    ],
  },
};
