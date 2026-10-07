/**
 * The Hobbit — cartes bleues (lot A). Recrutement : « piochez une carte, puis défaussez une carte ; si vous avez défaussé
 * une carte non-terrain, créez un jeton Humain Soldat 1/1 blanc » (`recruit`, dans hob/common.ts).
 */
import type { CardType, ModeDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  equipAbility,
  eventReplacement,
  fx,
  modal,
  mode,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const INSTANT_SORCERY: ObjectFilter = { types: ["Instant", "Sorcery"] };

/** Recrutement : piochez, défaussez ; une carte non-terrain défaussée donne un Humain Soldat 1/1. */
/** « Exilez [la cible] ; si vous le faites, renvoyez-la au début de la prochaine étape de fin. » */
const FLICKER_UNTIL_END_STEP = [
  fx.exileCard(ref.target(), { name: "k" }),
  fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
];

/**
 * Burglar's Plot : « deux permanents non-terrains ciblés qui partagent un type de carte ». Un mode par type de carte
 * (approximation : la contrainte « partagent un type de carte » n'existe pas sur les cibles).
 */
const SHARED_TYPES: [CardType, string][] = [
  ["Artifact", "artefacts"],
  ["Creature", "créatures"],
  ["Enchantment", "enchantements"],
  ["Planeswalker", "planeswalkers"],
  ["Battle", "batailles"],
];
const exchangeModes: ModeDef[] = SHARED_TYPES.map(([type, label]) =>
  mode(
    `Échangez le contrôle de deux ${label}`,
    [
      target.permanent("a", [type], { notTypes: ["Land"] }, `${label} non-terrain`),
      { ...target.permanent("b", [type], { notTypes: ["Land"] }, `${label} non-terrain`), otherThan: ["a"] },
    ],
    [fx.exchangeControl(ref.target("a"), ref.target("b"))],
  ),
);

export const BLUE: Record<string, CardScript> = {
  // --- Bilbo, Luckwearer // Burglar's Plot ----------------------------------
  "Bilbo, Luckwearer": {
    keywords: ["unblockable"],
    abilities: [triggered(when.combatDamageToPlayer, fx.loot(1), { label: "Piochez une carte, puis défaussez une carte" })],
  },
  "Burglar's Plot": { spell: modal(...exchangeModes) },

  "Bilbo, Thief in the Night": {
    abilities: [
      {
        // Approximation : les sorts lancés depuis le cimetière ou l'exil (pas depuis le dessus de la bibliothèque).
        kind: "costReduction",
        filter: {},
        generic: 1,
        fromZones: ["graveyard", "exile"],
        label: "Sorts lancés d'ailleurs que votre main : {1} de moins",
      },
      triggered(
        when.attacksSelf,
        [
          fx.castNow(ref.filtered(ref.graveyardOf(ref.you), { types: ["Artifact", "Instant", "Sorcery"] }), {
            after: "exile",
          }),
        ],
        { label: "Lancez un artefact, un éphémère ou un rituel de votre cimetière" },
      ),
    ],
  },

  // --- Bilbo Baggins, Burglar // Take a Glance ------------------------------
  "Bilbo Baggins, Burglar": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Take a Glance": { spell: spell([], [fx.scry(2)]) },

  "Confusticate and Bebother": {
    spell: modal(
      mode(
        "Contrecarrez un sort à moins que son contrôleur ne paie {4}",
        [target.spell()],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
      ),
      mode("Piochez deux cartes, puis défaussez une carte", [], [fx.draw(2), fx.discard(1)]),
    ),
  },
  "Elven Raft-Steerer": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode("Engagez une créature adverse", [target.creature("t", { controller: "opponent" })], [fx.tap(ref.target())]),
          mode(
            "Dégagez une créature que vous contrôlez",
            [target.creature("t", { controller: "you" })],
            [fx.untap(ref.target())],
          ),
        ],
        { label: "Atterrissage : engagez une créature adverse ou dégagez une des vôtres" },
      ),
    ],
  },
  "Elvenking's Harper": {
    abilities: [
      activated({
        mana: "{4}{U}",
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une créature ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  "Enchanted River's Grasp": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.tap(ref.attached), fx.removeCounters(ref.attached, amount.countersOn(ref.attached, "any"))],
        { label: "Engagez la créature enchantée et retirez-en tous les marqueurs" },
      ),
      staticAbility(
        "attached",
        { loseAllAbilities: true, addKeywords: ["doesntUntap"] },
        { label: "Perd toutes ses capacités et ne se dégage pas" },
      ),
    ],
  },
  "Fateful Discovery": {
    abilities: [triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Gandalf, Wandering Wizard": {
    // Garde {3} : lue dans le texte.
    abilities: [
      activated({
        mana: "{6}",
        effects: [
          fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          // Son propriétaire pioche, même si Gandalf n'est plus sur le champ de bataille.
          fx.draw(3, ref.ownerOf(ref.selfCard)),
        ],
        label: "Son propriétaire le mélange dans sa bibliothèque et pioche trois cartes",
      }),
    ],
  },
  "Great Gilded Boat": {
    // Équipage 2 : lu dans le texte.
    abilities: [triggered(when.attackWith(), recruit(), { label: "Recrutement" })],
  },
  "Lakeshore Apothecary": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Deuxième carte piochée : un marqueur +1/+1" })],
  },

  // --- Lake-town Mariners // Gone Fishing -----------------------------------
  "Lake-town Mariners": {},
  "Gone Fishing": {
    spell: spell(
      [
        target.exactly(
          2,
          target.permanent("t", ["Creature", "Land"], { controller: "you" }, "créatures et/ou terrains que vous contrôlez"),
        ),
      ],
      [fx.exileCard(ref.target(), { name: "k" }), fx.toBattlefield(ref.stored("k"))],
    ),
  },

  "Long Lake Nuisance": {
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recrutement" })],
  },
  "The Lord of the Eagles": {
    costReduction: {
      generic: amount.totalPower({ types: ["Creature"], controller: "you", keyword: "flying" }),
    },
  },
  "Mirkwood Meditator": {
    abilities: [
      triggered(
        when.landfall,
        fx.may("Sa force et son endurance de base deviennent 4/2 ?", fx.modify(ref.self, { setPower: 4, setToughness: 2 })),
        { label: "Atterrissage : F/E de base 4/2 jusqu'à la fin du tour" },
      ),
    ],
  },

  // --- Most Decrepit Old Bird // Speak Secrets ------------------------------
  "Most Decrepit Old Bird": {
    abilities: [staticAbility("self", { power: 1, toughness: 1 }, { condition: cond.threshold, label: "Seuil : +1/+1" })],
  },
  "Speak Secrets": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          INSTANT_SORCERY,
          { to: "hand" },
          { pool: ref.stored("m"), prompt: "Un éphémère ou un rituel" },
        ),
      ],
    ),
  },

  "Old Fat Spider Can't See Me": {
    abilities: [
      chapter([1], [fx.modifyWhileSource(ref.target(), { addKeywords: ["hexproof"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Chapitre I — Une de vos créatures a la défense talismanique tant que la Saga reste",
      }),
      // Approximation : la prévention est accordée à la créature comme une capacité (elle cesse si elle perd ses capacités).
      chapter(
        [2],
        [
          fx.modifyWhileSource(ref.target(), {
            addAbilities: [
              eventReplacement({
                event: "damage",
                source: { self: true },
                modify: { prevent: true },
                label: "Prévenez toutes les blessures qu'elle infligerait",
              }),
            ],
          }),
        ],
        {
          targets: [target.upTo(1, target.creature())],
          label: "Chapitre II — Prévenez les blessures de jusqu'à une créature tant que la Saga reste",
        },
      ),
      chapter([3, 4], [fx.draw(1)], { label: "Chapitres III, IV — Piochez une carte" }),
    ],
  },
  "Plunder the Trollshaws": {
    flashback: "{3}{U}",
    spell: spell(
      [],
      [...fx.when(cond.spellCastFromGraveyard, fx.draw(2)), ...fx.when(cond.not(cond.spellCastFromGraveyard), fx.draw(1))],
    ),
  },
  "Ravenhill Flock": {
    abilities: [triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "Un marqueur +1/+1" })],
  },
  "Riddles in the Dark": { spell: spell([], [fx.piles(4)]) },
  "Roll-Roll-Roll-Roll": {
    abilities: [
      chapter([1, 2, 3, 4], FLICKER_UNTIL_END_STEP, {
        targets: [
          target.upTo(
            1,
            target.permanent("t", ["Creature", "Land"], { controller: "you" }, "créature ou terrain que vous contrôlez"),
          ),
        ],
        label: "Exilez jusqu'à une de vos créatures ou un de vos terrains ; il revient à la prochaine étape de fin",
      }),
    ],
  },
  "Sound the Trumpets": {
    spell: spell(
      [target.spell()],
      [fx.counter(ref.target()), ...fx.when(cond.targetMatches("t", { maxManaValue: 2 }), recruit())],
    ),
  },
  "Uncover the Moon-Letters": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.may("Piocher X cartes (le mana dépensé), puis en défausser deux ?", fx.draw(amount.eventManaSpent), fx.discard(2)),
        { label: "Sort non-créature : piochez X cartes, puis défaussez-en deux" },
      ),
    ],
  },
  "Uneasy Partings": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { attacking: true, token: false }) },
    spell: spell([target.creature()], [fx.topOrBottom(ref.target())]),
  },
  "Wizard's Staff": {
    // Équiper {3} : lu dans le texte.
    abilities: [
      staticAbility("attached", { addKeywords: ["prowess"] }, { label: "La créature équipée a la prouesse" }),
      playerStatic({
        triggerMod: { effect: "again", sources: { attachedToSource: true } },
        label: "Les capacités déclenchées de la créature équipée se déclenchent une fois de plus",
      }),
      equipAbility({ mana: "{1}", filter: { subtype: "Wizard" }, label: "Équiper Sorcier {1}" }),
    ],
  },
};
