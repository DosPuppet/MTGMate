/**
 * Tarkir: Dragonstorm — cartes des decks du méta (phase 1 du plan P4, lot M1). L'Harmonie (702.180) est lue dans le
 * texte (`scryfall.ts`) : lancée depuis le cimetière comme un flashback, une créature engagée réduit le coût. L'extension
 * sera couverte en entier en phase 2.
 */
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  MONK,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Winternight Stories": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Creature"] } })]),
  },
  // --- Vert ------------------------------------------------------------------
  "Surrak, Elusive Hunter": {
    cantBeCountered: true,
    abilities: [
      triggered(when.targetedByOpponent({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], {
        label: "Piochez une carte",
      }),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Strategic Betrayal": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.sacrifice(ref.target(), { types: ["Creature"] }, 1, { exile: true }),
        fx.moveAll("graveyard", ref.target(), {}, { to: "exile" }),
      ],
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Voice of Victory": {
    // Mobilisation 2 : lue dans le texte.
    abilities: [playerStatic({ opponentsCantCastYourTurn: true })],
  },
  "Qarsi Revenant": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [
          fx.counters(ref.target(), "flying"),
          fx.counters(ref.target(), "deathtouch"),
          fx.counters(ref.target(), "lifelink"),
        ],
        label: "Renouveau : vol, contact mortel et lien de vie",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Dispelling Exhale": {
    // « Vous pouvez contempler un Dragon » en coût additionnel : vérifié à la résolution.
    spell: spell(
      [target.spell()],
      [
        ...fx.when(
          cond.behold({ subtype: "Dragon" }),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
        ),
        ...fx.when(
          cond.not(cond.behold({ subtype: "Dragon" })),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Inevitable Defeat": {
    cantBeCountered: true,
    spell: spell([target.nonland()], [fx.exile(ref.target()), fx.loseLife(3, ref.controllerOf(ref.target())), fx.gainLife(3)]),
  },
  "Jeskai Revelation": {
    spell: spell(
      [{ id: "b", label: "sort ou permanent", filter: { spells: {}, objects: { permanent: true } } }, target.any("d")],
      [fx.bounce(ref.target("b")), fx.damage(4, ref.target("d")), fx.createTokens(MONK, 2), fx.draw(2), fx.gainLife(4)],
    ),
  },
  "Mistrise Village": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ anySubtype: ["Mountain", "Forest"] })),
        label: "Engagé, sauf si vous contrôlez une Montagne ou une Forêt",
      }),
      manaAbility("U"),
      activated({
        mana: "{U}",
        tap: true,
        effects: [fx.nextSpellUncounterable],
        label: "Le prochain sort ne peut pas être contrecarré",
      }),
    ],
  },
  "Sarkhan, Dragon Ascendant": {
    abilities: [
      triggered(when.entersSelf, fx.when(cond.behold({ subtype: "Dragon" }), fx.createTokens(TREASURE)), {
        label: "En contemplant un Dragon : un Trésor",
      }),
      triggered(
        when.enters({ subtype: "Dragon", controller: "you" }),
        [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addSubtypes: ["Dragon"], addKeywords: ["flying"] })],
        { label: "Marqueur +1/+1 ; Dragon volant jusqu'à la fin du tour" },
      ),
    ],
  },
  "Maelstrom of the Spirit Dragon": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { anySubtype: ["Dragon", "Omen"] } } }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ subtype: "Dragon" }, { to: "hand" })],
        label: "Chercher une carte de Dragon",
      }),
    ],
  },
  "Magmatic Hellkite": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.search(
            BASIC_LAND,
            { to: "battlefield", tapped: true, counters: { kind: "stun", n: 1 } },
            1,
            ref.controllerOf(ref.target()),
          ),
        ],
        {
          targets: [target.permanent("t", ["Land"], { nonbasic: true, controller: "opponent" }, "terrain non de base adverse")],
          label: "Détruit un terrain non de base",
        },
      ),
    ],
  },
  "Clarion Conqueror": {
    abilities: [
      staticAbility(
        { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Planeswalker"] }] },
        { addKeywords: ["noActivatedAbilities"] },
        { label: "Les capacités activées des artefacts, créatures et planeswalkers ne peuvent pas être activées" },
      ),
    ],
  },
  "Twinmaw Stormbrood": { abilities: [triggered(when.entersSelf, [fx.gainLife(5)], { label: "Gagnez 5 PV" })] },
  "Charring Bite": { spell: spell([target.creature("t", { notKeyword: "flying" })], [fx.damage(5, ref.target())]) },
  "United Battlefront": {
    spell: spell(
      [],
      [
        fx.lookAtTop(7, {
          count: 2,
          filter: { permanent: true, notTypes: ["Creature", "Land"], maxManaValue: 3 },
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },
};
