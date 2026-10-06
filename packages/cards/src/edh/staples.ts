/**
 * Commander (PLAN-E, E9) : sorts communs et moteurs des decks Commander. Tuteurs, contresorts, destructions de masse,
 * protection du joueur (Teferi's Protection, The One Ring), doublement de jetons, moteurs de pioche et de drain.
 */
import type { CardScript, EventReplacement, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCostMode,
  amount,
  cond,
  costReducer,
  eventReplacement,
  fx,
  manaAbility,
  modal,
  oneOrMore,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** Créature Changelin incolore 3/2 avec le changelin (Black Market Connections). */
const SHAPESHIFTER_3_2: TokenSpec = {
  name: "Shapeshifter",
  colors: [],
  types: ["Creature"],
  subtypes: ["Shapeshifter"],
  power: 3,
  toughness: 2,
  keywords: ["changeling"],
};

/** « Votre total de points de vie ne peut pas changer » : ni gain ni perte (119.7, 119.8 : ni paiement de PV). */
const lifeCantChange = (["lifeGain", "lifeLoss"] as const).map((event) =>
  fx.untilYourNextTurn({ replacement: { event, to: "you", modify: { prevent: true } } satisfies EventReplacement }),
);

/** « Sort ou permanent non-terrain qu'un adversaire contrôle. » */
const OPPONENT_SPELL_OR_NONLAND: TargetSpec = {
  id: "t",
  label: "sort ou permanent non-terrain d'un adversaire",
  filter: { spells: { controller: "opponent" }, objects: { permanent: true, notTypes: ["Land"], controller: "opponent" } },
};

const CREATURE_OF_CHOSEN_TYPE = { types: ["Creature" as const], subtypeChosen: true };

export const EDH_STAPLES: Record<string, CardScript> = {
  // --- Protection ---
  "Teferi's Protection": {
    exileOnResolve: true,
    spell: spell(
      [],
      [...lifeCantChange, fx.untilYourNextTurn({ protection: "everything" }), fx.phaseOut(ref.permanentsOf(ref.you, {}))],
    ),
  },
  "The One Ring": {
    // Indestructible : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.untilYourNextTurn({ protection: "everything" })], {
        condition: cond.wasCast,
        label: "Lancé : protection contre tout jusqu'à votre prochain tour",
      }),
      triggered(when.yourUpkeep, [fx.loseLife(amount.countersOn(ref.self, "burden"))], {
        label: "Vous perdez 1 PV par marqueur de fardeau",
      }),
      activated({
        tap: true,
        effects: [fx.counters(ref.self, "burden"), fx.draw(amount.countersOn(ref.self, "burden"))],
        label: "Un marqueur de fardeau, puis piochez une carte par marqueur",
      }),
    ],
  },

  // --- Tuteurs ---
  "Demonic Tutor": { spell: spell([], [fx.search({}, { to: "hand" })]) },
  // Approximation : la carte cherchée n'est pas révélée.
  "Enlightened Tutor": {
    spell: spell([], [fx.search({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, { to: "libraryTop" })]),
  },

  // --- Contresorts ---
  "Force of Negation": {
    altCost: {
      mana: "{0}",
      condition: cond.not(cond.yourTurn),
      label: "Force of Negation — exilez une carte bleue de votre main (hors de votre tour)",
      pay: { exileFromHand: { filter: { colors: ["U"] }, count: 1 } },
    },
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")], [fx.counterExile(ref.target())]),
  },
  Rewind: {
    spell: spell([target.spell()], [fx.counter(ref.target()), fx.untapUpTo({ types: ["Land"] }, 4)]),
  },
  Unwind: {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      [fx.counter(ref.target()), fx.untapUpTo({ types: ["Land"] }, 3)],
    ),
  },

  // --- Destructions ---
  "Snuff Out": {
    altCost: {
      mana: "{0}",
      condition: cond.controls({ subtype: "Swamp" }),
      label: "Snuff Out — payez 4 PV (vous contrôlez un Marais)",
      pay: { life: 4 },
    },
    spell: spell([target.creature("t", { not: { colors: ["B"] } })], [{ op: "destroy", what: ref.target(), noRegenerate: true }]),
  },
  Vindicate: {
    spell: spell([{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }], [fx.destroy(ref.target())]),
  },
  Damn: {
    spell: altCostMode(
      "Surcharge",
      "{2}{W}{W}",
      { targets: [target.creature()], effects: [{ op: "destroy", what: ref.target(), noRegenerate: true }] },
      { effects: [fx.destroyAll({ types: ["Creature"] }, undefined, true)] },
    ),
  },
  // « Payez X points de vie » en coût additionnel : lu dans le texte.
  "Toxic Deluge": {
    spell: spell([], [fx.pumpAll({ types: ["Creature"] }, amount.neg(amount.x), amount.neg(amount.x))]),
  },
  Farewell: {
    spell: modal(
      ...oneOrMore(
        { label: "Exilez tous les artefacts", effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Artifact"] }))] },
        { label: "Exilez toutes les créatures", effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }))] },
        {
          label: "Exilez tous les enchantements",
          effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Enchantment"] }))],
        },
        {
          label: "Exilez tous les cimetières",
          effects: [fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })],
        },
      ),
    ),
  },

  // --- Pioche et tempo ---
  "Frantic Search": {
    spell: spell([], [fx.draw(2), fx.discard(2), fx.untapUpTo({ types: ["Land"] }, 3)]),
  },
  "Village Rites": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.draw(2)]),
  },
  "Sink into Stupor": { spell: spell([OPPONENT_SPELL_OR_NONLAND], [fx.bounce(ref.target())]) },
  // Verso : « vous pouvez payer 3 PV ; sinon, il arrive engagé » est lu dans le texte.
  "Soporific Springs": { abilities: [manaAbility("U")] },
  "Black Market Connections": {
    abilities: [
      triggeredModal(
        { on: "step", step: "main", whose: "you", nth: 1 },
        oneOrMore(
          { label: "Trésor, 1 PV", effects: [fx.createTokens(TREASURE), fx.loseLife(1)] },
          { label: "Piochez, 2 PV", effects: [fx.draw(1), fx.loseLife(2)] },
          { label: "Changelin 3/2, 3 PV", effects: [fx.createTokens(SHAPESHIFTER_3_2), fx.loseLife(3)] },
        ),
        { label: "Première phase principale : choisissez un ou plusieurs" },
      ),
    ],
  },

  // --- Artefacts et enchantements ---
  Skullclamp: {
    // Équiper {1} : lu dans le texte.
    abilities: [
      staticAbility("attached", { power: 1, toughness: -1 }, { label: "+1/-1" }),
      triggered(when.dies({ attachedToSource: true }), [fx.draw(2)], {
        label: "La créature équipée meurt : piochez deux cartes",
      }),
    ],
  },
  "Phyrexian Altar": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addManaChoice(1)],
        label: "Sacrifiez une créature : un mana de n'importe quelle couleur",
      }),
    ],
  },
  "Herald's Horn": {
    chooseOnEnter: "creatureType",
    abilities: [
      costReducer(CREATURE_OF_CHOSEN_TYPE, 1, "Vos sorts de créature du type choisi coûtent {1} de moins"),
      triggered(when.yourUpkeep, [fx.lookAtTop(1, { filter: CREATURE_OF_CHOSEN_TYPE, rest: "top" })], {
        label: "Regardez la carte du dessus : une créature du type choisi peut aller dans votre main",
      }),
    ],
  },
  "Vanquisher's Banner": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility(
        { ...CREATURE_OF_CHOSEN_TYPE, controller: "you" },
        { power: 1, toughness: 1 },
        {
          label: "Vos créatures du type choisi : +1/+1",
        },
      ),
      triggered(when.castSpell("you", CREATURE_OF_CHOSEN_TYPE), [fx.draw(1)], {
        label: "Sort de créature du type choisi : piochez une carte",
      }),
    ],
  },
  "Anointed Procession": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        modify: { times: 2 },
        label: "Deux fois plus de jetons sous votre contrôle",
      }),
    ],
  },
  "Exquisite Blood": {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.gainLife(amount.eventAmount)], {
        label: "Un adversaire perd des PV : vous en gagnez autant",
      }),
    ],
  },
  "Blade of the Bloodchief": {
    // Équiper {1} : lu dans le texte.
    abilities: [
      triggered(
        when.dies({ types: ["Creature"] }),
        [
          ...fx.when(cond.refMatches(ref.attached, { subtype: "Vampire" }), fx.counters(ref.attached, "+1/+1", 2)),
          ...fx.when(cond.not(cond.refMatches(ref.attached, { subtype: "Vampire" })), fx.counters(ref.attached, "+1/+1", 1)),
        ],
        { label: "Une créature meurt : un marqueur +1/+1 sur la créature équipée (deux si c'est un Vampire)" },
      ),
    ],
  },
};
