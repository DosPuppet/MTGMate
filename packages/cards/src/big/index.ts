/**
 * The Big Score (BIG) : 30 cartes (hideaway, copies d'artefacts, Rest in Peace, Grand Abolisher…).
 * Les aides et jetons viennent d'Outlaws of Thunder Junction (otj/common.ts).
 */
import type { CardScript, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BAT,
  CLUE,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  eventReplacement,
  FOOD,
  fx,
  graveyardReplacement,
  investigate,
  MAP,
  manaAbility,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "../otj/common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

const artifactCreature = (
  name: string,
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({
  name,
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes,
  power,
  toughness,
  ...extra,
});
const GNOME = artifactCreature("Gnome", ["Gnome"], 1, 1);
const GOLEM = artifactCreature("Golem", ["Golem"], 3, 3);
const CONSTRUCT = artifactCreature("Construct", ["Construct"], 0, 0, {
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 par artefact" },
    ),
  ],
  text: "This token gets +1/+1 for each artifact you control.",
});
/** Sang : « {1}, {T}, défaussez une carte, sacrifiez ce jeton : piochez une carte » (défausse à la résolution). */
const BLOOD: TokenSpec = {
  name: "Blood",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Blood"],
  abilities: [
    activated({
      mana: "{1}",
      tap: true,
      sacrifice: true,
      activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 1),
      effects: [fx.discard(1), fx.draw(1)],
      label: "Défaussez, piochez",
    }),
  ],
  text: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.",
};

export const BIG_SCRIPTS: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Collector's Cage": {
    abilities: [
      // Hideaway 5 : la carte est exilée face cachée (vous seul la voyez).
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, { count: 1, to: { to: "exile", faceDown: "you" }, rest: "bottom", store: "h" }),
          fx.link(ref.stored("h")),
        ],
        { label: "Hideaway 5" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.addCounters(ref.target(), 1),
          fx.when(
            cond.amountAtLeast(amount.distinctPowers(CREATURE_YOU_CONTROL), 3),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        label: "Marqueur +1/+1 (trois forces différentes : jouez la carte cachée)",
      }),
    ],
  },
  "Grand Abolisher": {
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn", abilities: "artifactsCreaturesEnchantments" },
        condition: cond.yourTurn,
        label: "Pendant votre tour, vos adversaires sont bloqués",
      }),
    ],
  },
  "Oltec Matterweaver": {
    abilities: [
      triggeredModal(when.castSpell("you", { types: ["Creature"] }), [
        mode("Gnome 1/1", [], [fx.createTokens(GNOME)]),
        mode(
          "Copie d'un jeton d'artefact",
          [targetObj("t", { types: ["Artifact"], token: true, controller: "you" }, "jeton d'artefact que vous contrôlez")],
          [fx.copyToken(ref.target())],
        ),
      ]),
    ],
  },
  "Rest in Peace": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })], {
        label: "Exilez tous les cimetières",
      }),
      graveyardReplacement({ label: "Ce qui irait au cimetière est exilé" }),
    ],
  },

  // --- Bleu ------------------------------------------------------------------
  "Esoteric Duplicator": {
    abilities: [
      triggered(
        when.sacrifice({ types: ["Artifact"] }),
        fx.mayPay(
          "{2}",
          "Payer {2} pour copier l'artefact à l'étape de fin ?",
          fx.delayed([fx.copyToken(ref.target("a"))], { a: ref.eventObject }),
        ),
        { label: "Copie de l'artefact sacrifié" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez" }),
    ],
  },
  "Simulacrum Synthesizer": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", other: true, minManaValue: 3 }),
        [fx.createTokens(CONSTRUCT)],
        {
          label: "Assemblage 0/0",
        },
      ),
    ],
  },
  "Worldwalker Helm": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Artifact"], not: { name: "Map" } },
        plus: MAP,
        modify: {},
        label: "Un jeton Carte en plus de vos jetons d'artefact",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [targetObj("t", { types: ["Artifact"], token: true, controller: "you" }, "jeton d'artefact que vous contrôlez")],
        effects: [fx.copyToken(ref.target())],
        label: "Copiez un jeton d'artefact",
      }),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Greed's Gambit": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.gainLife(6), fx.createTokens(BAT, 3)], {
        label: "Piochez 3, +6 PV, trois Chauves-souris",
      }),
      triggered(when.yourEndStep, [fx.discard(1), fx.loseLife(2), fx.sacrifice(ref.you, { types: ["Creature"] })], {
        label: "Défaussez, perdez 2 PV, sacrifiez une créature",
      }),
      triggered(when.leavesSelf, [fx.discard(3), fx.loseLife(6), fx.sacrifice(ref.you, { types: ["Creature"] }, 3)], {
        label: "Défaussez 3, perdez 6 PV, sacrifiez 3 créatures",
      }),
    ],
  },
  "Harvester of Misery": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], other: true }, -2, -2)], {
        label: "Les autres créatures -2/-2",
      }),
      activated({
        mana: "{1}{B}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), -2, -2)],
        label: "-2/-2",
      }),
    ],
  },
  "Hostile Investigator": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Il défausse",
      }),
      triggered(when.discardBatch("any"), [investigate()], { oncePerTurn: true, label: "Enquêtez" }),
    ],
  },

  // --- Rouge -----------------------------------------------------------------
  "Generous Plunderer": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.may(
          "Créer un Trésor ?",
          fx.createTokens(TREASURE),
          fx.reflexive(
            [target.player("t", "opponent")],
            [{ op: "createTokens", token: TREASURE, count: 1, for: ref.target(), tapped: true }],
          ),
        ),
        { label: "Trésor (un adversaire en crée un engagé)" },
      ),
      triggered(
        when.attacksSelf,
        [fx.damage(amount.refCount(ref.permanentsOf(ref.defendingPlayer, { types: ["Artifact"] })), ref.defendingPlayer)],
        { label: "Blessures égales à ses artefacts" },
      ),
    ],
  },
  "Legion Extruder": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 blessures" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.createTokens(GOLEM)],
        label: "Golem 3/3",
      }),
    ],
  },
  "Memory Vessel": {
    abilities: [
      // Approximation : on ne peut pas interdire de jouer les cartes de la main.
      activated({
        tap: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.exileTop(ref.eachPlayer, 7, "m"), fx.grantPlay(ref.stored("m"), { for: "owner", untilYourNextTurn: true })],
        label: "Chaque joueur exile sept cartes, jouables",
      }),
    ],
  },
  "Molten Duplication": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez")],
      [fx.copyToken(ref.target(), { addTypes: ["Artifact"], addKeywords: ["haste"], sacrificeAtEndStep: true })],
    ),
  },
  "Territory Forge": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "f" }), fx.link(ref.stored("f"))], {
        condition: cond.wasCast,
        targets: [target.permanent("t", ["Artifact", "Land"], {}, "artefact ou terrain")],
        label: "Exilez un artefact ou un terrain",
      }),
      staticAbility("self", { gainLinkedActivated: true }, { label: "Capacités activées de la carte exilée" }),
    ],
  },

  // --- Vert ------------------------------------------------------------------
  "Ancient Cornucopia": {
    abilities: [
      triggered(
        when.castSpell("you", {
          anyOf: [{ colors: ["W"] }, { colors: ["U"] }, { colors: ["B"] }, { colors: ["R"] }, { colors: ["G"] }],
        }),
        fx.may("Gagner 1 PV par couleur du sort ?", fx.gainLife(amount.colorsOf(ref.eventObject))),
        { oncePerTurn: true, label: "+1 PV par couleur" },
      ),
      manaAbility([...ALL_COLORS]),
    ],
  },
  "Bristlebud Farmer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD, 2)], { label: "Deux Nourritures" }),
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { subtype: "Food" }, 1, { optional: true, store: "f" }),
          fx.when(
            cond.v("f"),
            fx.mill(3, ref.you, { name: "m" }),
            fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { pool: ref.stored("m"), min: 0 }),
          ),
        ],
        { label: "Sacrifiez une Nourriture : meulez trois cartes, reprenez un permanent" },
      ),
    ],
  },
  "Omenpath Journey": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }, { to: "exile" }, 5, undefined, "o"), fx.link(ref.stored("o"))], {
        label: "Exilez jusqu'à cinq terrains",
      }),
      triggered(
        when.yourEndStep,
        [fx.pickFromZone("graveyard", {}, { to: "battlefield", tapped: true }, { pool: ref.linked, random: true })],
        { label: "Un terrain exilé au hasard, engagé" },
      ),
    ],
  },
  "Sandstorm Salvager": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GOLEM)], { label: "Golem 3/3" }),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.addCountersAll({ ...CREATURE_YOU_CONTROL, token: true }, 1),
          fx.pumpAll({ ...CREATURE_YOU_CONTROL, token: true }, 0, 0, ["trample"]),
        ],
        label: "Vos jetons de créature : marqueur et piétinement",
      }),
    ],
  },
  "Vaultborn Tyrant": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ self: true }, { types: ["Creature"], controller: "you", minPower: 4, other: true }] }),
        [fx.gainLife(3), fx.draw(1)],
        { label: "+3 PV, piochez" },
      ),
      triggered(when.diesSelf, [fx.copyToken(ref.eventObject, { addTypes: ["Artifact"] })], {
        condition: cond.not(cond.sourceMatches({ token: true })),
        label: "Copie artefact",
      }),
    ],
  },

  // --- Multicolores et incolores ---------------------------------------------
  "Loot, the Key to Everything": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.exileTop(ref.you, amount.cardTypesAmong({ controller: "you", notTypes: ["Land"], other: true }), "l"),
          fx.grantPlay(ref.stored("l")),
        ],
        { label: "Exilez X cartes, jouables ce tour-ci" },
      ),
    ],
  },
  "Pest Control": { spell: spell([], [fx.destroyAll({ notTypes: ["Land"], permanent: true, maxManaValue: 1 })]) },
  "Lost Jitte": {
    abilities: [
      triggered(when.combatDamage({ types: ["Creature"], attached: "host" }), [fx.counters(ref.self, "charge", 1)], {
        label: "Marqueur de charge",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.permanent("t", ["Land"])],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un terrain",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["cantBlock"])],
        label: "Ne peut pas bloquer",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        activationCondition: cond.controls({ types: ["Creature"], attached: "host" }),
        effects: [fx.addCounters(ref.attached, 1)],
        label: "Marqueur +1/+1 sur la créature équipée",
      }),
    ],
  },
  "Lotus Ring": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 3,
          toughness: 3,
          addKeywords: ["vigilance"],
          addAbilities: [manaAbility([...ALL_COLORS], 3, { sacrifice: true })],
        },
        { label: "+3/+3, vigilance, « {T}, sacrifiez : trois mana »" },
      ),
    ],
  },
  "Nexus of Becoming": {
    abilities: [
      triggered(
        when.step("beginCombat"),
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Artifact", "Creature"] },
            { to: "exile" },
            { min: 0, store: "n", prompt: "Vous pouvez exiler un artefact ou une créature" },
          ),
          fx.copyToken(ref.stored("n"), { addTypes: ["Artifact", "Creature"], addSubtypes: ["Golem"], pt: 3 }),
        ],
        { label: "Piochez, copie Golem 3/3" },
      ),
    ],
  },
  "Sword of Wealth and Power": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [protection.from({ types: ["Instant", "Sorcery"] }, "Protection contre les éphémères et les rituels")],
        },
        { label: "+2/+2, protection" },
      ),
      triggered(
        when.combatDamage({ types: ["Creature"], attached: "host" }, true),
        [fx.createTokens(TREASURE), fx.copyNextSpell],
        {
          label: "Trésor, prochain éphémère ou rituel copié",
        },
      ),
    ],
  },
  "Torpor Orb": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "none", on: "enter", entering: { types: ["Creature"] }, everyone: true },
        label: "L'arrivée de créatures ne déclenche rien",
      }),
    ],
  },
  "Transmutation Font": {
    abilities: [
      activated({ tap: true, effects: [fx.createTokens(BLOOD)], label: "Jeton Sang" }),
      activated({ tap: true, effects: [fx.createTokens(CLUE)], label: "Jeton Indice" }),
      activated({ tap: true, effects: [fx.createTokens(FOOD)], label: "Jeton Nourriture" }),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Artifact"], token: true }, count: 3, differentNames: true },
        effects: [fx.search({ types: ["Artifact"] }, { to: "battlefield" })],
        label: "Un artefact de la bibliothèque",
      }),
    ],
  },

  // --- Terrains --------------------------------------------------------------
  "Fomori Vault": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 1),
        effects: [
          fx.discard(1),
          fx.lookAtTop(amount.count({ types: ["Artifact"], controller: "you" }), { count: 1, rest: "bottom" }),
        ],
        label: "Défaussez, une carte parmi X",
      }),
    ],
  },
  "Tarnation Vista": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["W"], 1, { produceChosen: true }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaColorsAmong({ controller: "you", permanent: true, multicolored: false })],
        label: "Un mana de chaque couleur de vos permanents monocolores",
      }),
    ],
  },
};
