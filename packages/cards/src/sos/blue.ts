/** Secrets of Strixhaven — cartes bleues. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  ELEMENTAL_UR,
  entersWith,
  FRACTAL,
  fx,
  INCREMENT,
  INSTANT_SORCERY,
  manaAbility,
  OPUS,
  OPUS_BIG,
  opusInstead,
  playerStatic,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

/** Restriction du mana : « dépensez ce mana uniquement pour lancer un sort d'éphémère ou de rituel ». */
const INSTANT_SORCERY_ONLY = { spell: INSTANT_SORCERY };

export const BLUE: Record<string, CardScript> = {
  "Banishing Betrayal": {
    spell: spell([target.nonland()], [fx.bounce(ref.target()), fx.surveil(1)]),
  },
  "Campus Composer": {
    // Parade {2} : lue dans le texte.
    prepareSpell: spell([], [fx.createTokens(ELEMENTAL_UR)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Chase Inspiration": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 0, 3, ["hexproof"])]),
  },
  "Deluge Virtuoso": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature adverse, un marqueur d'étourdissement",
      }),
      triggered(OPUS, opusInstead([fx.pump(ref.self, 1, 1)], [fx.pump(ref.self, 2, 2)]), {
        label: "Opus : +1/+1 (+2/+2 si cinq mana ou plus)",
      }),
    ],
  },
  "Divergent Equation": {
    exileOnResolve: true,
    spell: spell(
      [
        {
          ...target.upTo(
            99,
            target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière"),
          ),
          countX: "upTo",
        },
      ],
      [fx.toHand(ref.target())],
    ),
  },
  "Echocasting Symposium": {
    // Paradigme : lu dans le texte. Le jeton est créé par vous, puis donné au joueur ciblé (approximation).
    spell: spell(
      [target.player("p"), target.creature("c", { controller: "you" })],
      [fx.copyToken(ref.target("c"), { store: "copy" }), fx.giveControl(ref.stored("copy"), ref.target("p"))],
    ),
  },
  "Encouraging Aviator": {
    prepareSpell: spell([target.creature()], [fx.modify(ref.target(), { addKeywords: ["flying"] })]),
    abilities: [triggered(when.attacksSelf, [fx.prepare(ref.self)], { label: "Devient préparée" })],
  },
  "Exhibition Tidecaller": {
    abilities: [
      triggered(OPUS, opusInstead([fx.mill(3, ref.target())], [fx.mill(10, ref.target())]), {
        targets: [target.player()],
        label: "Opus : le joueur ciblé meule trois cartes (dix si cinq mana ou plus)",
      }),
    ],
  },
  "Flow State": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.not(
            cond.all(
              cond.amountAtLeast(amount.countIn("graveyard", { types: ["Instant"] }), 1),
              cond.amountAtLeast(amount.countIn("graveyard", { types: ["Sorcery"] }), 1),
            ),
          ),
          fx.lookAtTop(3, { count: 1, exact: true, rest: "bottom" }),
        ),
        ...fx.when(
          cond.all(
            cond.amountAtLeast(amount.countIn("graveyard", { types: ["Instant"] }), 1),
            cond.amountAtLeast(amount.countIn("graveyard", { types: ["Sorcery"] }), 1),
          ),
          fx.lookAtTop(3, { count: 2, exact: true, rest: "bottom" }),
        ),
      ],
    ),
  },
  "Fractal Anomaly": {
    spell: spell([], [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), amount.cardsDrawnThisTurn)]),
  },
  Fractalize: {
    spell: spell(
      [target.creature()],
      [fx.modify(ref.target(), { setColors: ["G", "U"], setSubtypes: ["Fractal"] }, "endOfTurn", amount.plus(amount.x, 1))],
    ),
  },
  "Harmonized Trio": {
    prepareSpell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryTop" },
          { count: 2, min: 2, prompt: "Mettez deux cartes de votre main au-dessus de votre bibliothèque" },
        ),
      ],
    ),
    abilities: [
      activated({
        tap: true,
        tapOthers: { filter: { types: ["Creature"], controller: "you" }, count: 2 },
        effects: [fx.prepare(ref.self)],
        label: "Engagez deux créatures : devient préparée",
      }),
    ],
  },
  Homesickness: {
    spell: spell(
      [target.player("p"), target.upTo(2, target.creature("c"))],
      [fx.draw(2, ref.target("p")), fx.tap(ref.target("c")), fx.counters(ref.target("c"), "stun", 1)],
    ),
  },
  "Hydro-Channeler": {
    abilities: [
      manaAbility("U", 1, { restriction: INSTANT_SORCERY_ONLY }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaChoice(1, undefined, INSTANT_SORCERY_ONLY)],
        label: "Un mana de n'importe quelle couleur (éphémères et rituels)",
      }),
    ],
  },
  "Jadzi, Steward of Fate": {
    prepareSpell: spell(
      [],
      [fx.createTokens(FRACTAL, amount.x), fx.addCountersAll({ subtype: "Fractal", controller: "you" }, amount.x)],
    ),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.entersSelf, fx.loot(2), { label: "Piochez deux cartes, puis défaussez-en deux" }),
    ],
  },
  "Landscape Painter": {
    prepareSpell: spell([], [fx.draw(2)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Matterbending Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Renvoyez jusqu'à une autre créature dans la main de son propriétaire",
      }),
      triggered(when.castSpell("you", { hasX: true }), [fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "Sort avec {X} : ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  Mathemagics: {
    spell: spell([target.player("p")], [fx.draw(amount.pow(2, amount.x), ref.target("p"))]),
  },
  "Muse Seeker": {
    abilities: [
      triggered(OPUS, [fx.draw(1), ...fx.when(cond.not(OPUS_BIG), fx.discard(1))], {
        label: "Opus : piochez, puis défaussez sauf si cinq mana ou plus",
      }),
    ],
  },
  "Muse's Encouragement": {
    spell: spell([], [fx.createTokens(ELEMENTAL_UR), fx.surveil(2)]),
  },
  "Orysa, Tide Choreographer": {
    costReduction: {
      generic: 3,
      condition: cond.amountAtLeast(amount.totalToughness({ types: ["Creature"], controller: "you" }), 10),
    },
    abilities: [triggered(when.entersSelf, [fx.draw(2)], { label: "Piochez deux cartes" })],
  },
  "Pensive Professor": {
    abilities: [
      INCREMENT,
      triggered(when.countersPut("self", "+1/+1"), [fx.draw(1)], { label: "Des marqueurs +1/+1 : piochez une carte" }),
    ],
  },
  Procrastinate: {
    spell: spell([target.creature()], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", amount.plus(amount.x, amount.x))]),
  },
  "Run Behind": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { attacking: true }) },
    spell: spell([target.creature()], [fx.topOrBottom(ref.target())]),
  },
  "Skycoach Conductor": {
    // Flash, vol et vigilance : lus dans le texte.
    prepareSpell: spell(
      [target.creature("t", { controller: "you", notSubtype: "Pilot" })],
      [fx.exileCard(ref.target(), { name: "a" }), fx.toBattlefield(ref.stored("a"))],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Spellbook Seeker": {
    prepareSpell: spell([], fx.loot(2)),
    abilities: [entersWith({ prepared: true })],
  },
  "Tester of the Tangential": {
    abilities: [
      INCREMENT,
      triggered(
        when.yourCombat,
        [
          fx.payX("payer X pour déplacer X marqueurs +1/+1 ?", "x"),
          ...fx.when(
            cond.v("x"),
            fx.reflexive(
              [target.creature("t", { other: true })],
              [fx.removeCounters(ref.self, amount.v("x"), "+1/+1", "m"), fx.addCounters(ref.target(), amount.v("m"))],
              undefined,
              ["x"],
            ),
          ),
        ],
        { label: "Payez {X} : déplacez X marqueurs +1/+1 sur une autre créature" },
      ),
    ],
  },
  "Textbook Tabulator": {
    abilities: [INCREMENT, triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
  "Wisdom of Ages": {
    exileOnResolve: true,
    spell: spell(
      [],
      [
        fx.moveAll("graveyard", ref.you, INSTANT_SORCERY, { to: "hand" }),
        fx.emblem("Wisdom of Ages", "You have no maximum hand size.", [
          playerStatic({ noMaxHandSize: true, label: "Pas de taille de main maximale" }),
        ]),
      ],
    ),
  },
  "Brush Off": {
    costReduction: { generic: 1, colored: { U: 1 }, condition: cond.targetMatches("t", INSTANT_SORCERY) },
    spell: spell([target.spell()], [fx.counter(ref.target())]),
  },
};
