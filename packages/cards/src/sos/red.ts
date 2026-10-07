/**
 * Secrets of Strixhaven — cartes rouges (lot A). La préparation (« arrive préparée ») passe par `entersWith` et
 * `prepareSpell` ; l'Opus par `OPUS` et `opusInstead` (common.ts) ; garde (« payez N points de vie »),
 * célérité, menace et autres mots-clés sont lus dans le texte.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  ELEMENTAL_UR,
  entersWith,
  fx,
  INSTANT_SORCERY,
  modal,
  mode,
  OPUS,
  OPUS_BIG,
  opusInstead,
  ref,
  SPIRIT_RW,
  spell,
  spree,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** « Vous pouvez défausser une carte. Si vous le faites, piochez une carte. » */
const mayRummage = [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))];

/** Steal the Show, premier mode : le joueur ciblé défausse autant de cartes qu'il veut, puis en pioche autant. */
const wheelSome = [fx.discard(60, ref.target("p"), { optional: true, store: "d" }), fx.draw(amount.v("d"), ref.target("p"))];
/** Steal the Show, second mode : autant de blessures que de cartes d'éphémère et de rituel dans votre cimetière. */
const spellsInGraveyard = [fx.damage(amount.countIn("graveyard", INSTANT_SORCERY), ref.target("c"))];

export const RED: Record<string, CardScript> = {
  "Ancestral Anger": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), amount.plus(1, amount.countIn("graveyard", { name: "Ancestral Anger" })), 0, ["trample"]),
        fx.draw(1),
      ],
    ),
  },
  // Convergence : X = couleurs de mana dépensées ; les cartes exilées se jouent jusqu'à la fin de votre prochain tour.
  "Archaic's Agony": {
    spell: spell(
      [target.creature()],
      [
        fx.damageStoringExcess(amount.colorsSpent, ref.target(), "e"),
        fx.exileTop(ref.you, amount.v("e"), "x"),
        fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true }),
      ],
    ),
  },
  "Artistic Process": {
    spell: modal(
      mode("6 blessures à une créature", [target.creature()], [fx.damage(6, ref.target())]),
      mode(
        "2 blessures à chaque créature que vous ne contrôlez pas",
        [],
        [fx.damageAll(2, { types: ["Creature"], controller: "opponent" })],
      ),
      mode(
        "Un Élémental 3/3 volant, avec la célérité ce tour-ci",
        [],
        [fx.createTokens(ELEMENTAL_UR, 1, undefined, "e"), fx.pump(ref.stored("e"), 0, 0, ["haste"])],
      ),
    ),
  },
  // Sort préparé : Seething Song.
  "Blazing Firesinger": {
    prepareSpell: spell([], [fx.addManaTimes(5, "R")]),
    abilities: [entersWith({ prepared: true })],
  },
  // Célérité lue dans le texte.
  "Charging Strifeknight": {
    abilities: [activated({ tap: true, discard: 1, effects: [fx.draw(1)], label: "Défaussez une carte : piochez une carte" })],
  },
  "Duel Tactics": {
    flashback: "{1}{R}",
    spell: spell([target.creature()], [fx.damage(1, ref.target()), fx.pump(ref.target(), 0, 0, ["cantBlock"])]),
  },
  // Initiative lue dans le texte ; sort préparé : Lightning Bolt.
  "Emeritus of Conflict": {
    prepareSpell: spell([target.any()], [fx.damage(3, ref.target())]),
    abilities: [triggered(when.castNthSpell(3), [fx.prepare(ref.self)], { label: "Troisième sort du tour : devient préparée" })],
  },
  "Expressive Firedancer": {
    abilities: [
      triggered(OPUS, [fx.pump(ref.self, 1, 1), ...fx.when(OPUS_BIG, fx.pump(ref.self, 0, 0, ["doubleStrike"]))], {
        label: "Opus : +1/+1 ; cinq mana ou plus : double initiative",
      }),
    ],
  },
  // Menace lue dans le texte.
  "Garrison Excavator": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(SPIRIT_RW)], {
        batched: true,
        label: "Des cartes quittent votre cimetière : un Esprit 2/2",
      }),
    ],
  },
  // Sort préparé : Craft with Pride.
  "Goblin Glasswright": {
    prepareSpell: spell([], [fx.createTokens(TREASURE)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Heated Argument": {
    spell: spell(
      [target.creature()],
      [
        fx.damage(6, ref.target()),
        fx.pickFromZone(
          "graveyard",
          {},
          { to: "exile" },
          { count: 1, min: 0, store: "g", prompt: "Vous pouvez exiler une carte de votre cimetière" },
        ),
        ...fx.when(cond.v("g"), fx.damage(2, ref.controllerOf(ref.target()))),
      ],
    ),
  },
  // Paradigme lu dans le texte.
  "Improvisation Capstone": {
    spell: spell([], [fx.exileUntilTotalManaValue(ref.you, 4, "x"), fx.castNow(ref.stored("x"), { free: true, many: true })]),
  },
  "Living History": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIRIT_RW)], { label: "Un Esprit 2/2" }),
      triggered(when.attackWith(1), [fx.pump(ref.target(), 2, 0)], {
        condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1),
        targets: [target.creature("t", { attacking: true })],
        label: "Une carte a quitté votre cimetière : +2/+0 à une créature attaquante",
      }),
    ],
  },
  // Célérité lue dans le texte ; sort préparé : Rocket Volley.
  "Maelstrom Artisan": {
    prepareSpell: spell([target.permanent("t", ["Land"], { basic: false }, "terrain non-base")], [fx.destroy(ref.target())]),
    abilities: [entersWith({ prepared: true })],
  },
  // Garde (payez 3 points de vie) lue dans le texte.
  "Mica, Reader of Ruins": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Sacrifiez un artefact : copiez le sort" },
      ),
    ],
  },
  // Menace lue dans le texte.
  "Molten-Core Maestro": {
    abilities: [
      triggered(OPUS, [fx.addCounters(ref.self, 1), ...fx.when(OPUS_BIG, fx.addManaTimes(amount.powerOf(ref.self), "R"))], {
        label: "Opus : un marqueur +1/+1 ; cinq mana ou plus : {R} autant que sa force",
      }),
    ],
  },
  // Vol lu dans le texte ; sort préparé : Striking Palette.
  "Pigment Wrangler": {
    prepareSpell: spell([], [fx.copyNextSpell]),
    abilities: [entersWith({ prepared: true })],
  },
  "Rubble Rouser": {
    abilities: [
      triggered(when.entersSelf, mayRummage, { label: "Défaussez une carte pour en piocher une" }),
      // Capacité de mana (605.1a) : la capacité réflexive « quand vous le faites » se déclenche ensuite.
      activated({
        tap: true,
        exileFromGraveyard: { filter: {} },
        effects: [fx.addMana("R"), fx.reflexive([], [fx.damage(1, ref.eachOpponent)])],
        label: "Exilez une carte de votre cimetière : ajoutez {R}, 1 blessure à chaque adversaire",
      }),
    ],
  },
  "Steal the Show": {
    spell: modal(
      mode("Le joueur défausse des cartes, puis en pioche autant", [target.player("p")], wheelSome),
      mode("Blessures à une créature ou un planeswalker", [target.creatureOrPlaneswalker("c")], spellsInGraveyard),
      mode("Les deux", [target.player("p"), target.creatureOrPlaneswalker("c")], [...wheelSome, ...spellsInGraveyard]),
    ),
  },
  // Garde (payez 2 points de vie) lue dans le texte ; sort préparé : Awaken the Ages.
  "Strife Scholar": {
    prepareSpell: spell([], [fx.createTokens(SPIRIT_RW, 2)]),
    abilities: [entersWith({ prepared: true })],
  },
  // Piétinement lu dans le texte.
  "Tackle Artist": {
    abilities: [
      triggered(OPUS, opusInstead([fx.addCounters(ref.self, 1)], [fx.addCounters(ref.self, 2)]), {
        label: "Opus : un marqueur +1/+1 (deux si cinq mana ou plus)",
      }),
    ],
  },
  // Portée lue dans le texte.
  "Thunderdrum Soloist": {
    abilities: [
      triggered(OPUS, opusInstead([fx.damage(1, ref.eachOpponent)], [fx.damage(3, ref.eachOpponent)]), {
        label: "Opus : 1 blessure à chaque adversaire (3 si cinq mana ou plus)",
      }),
    ],
  },
  "Tome Blast": {
    flashback: "{4}{R}",
    spell: spell([target.any()], [fx.damage(2, ref.target())]),
  },
  "Unsubtle Mockery": {
    spell: spell([target.creature()], [fx.damage(4, ref.target()), fx.surveil(1)]),
  },
  "Zealous Lorecaster": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        label: "Renvoie un éphémère ou un rituel du cimetière en main",
      }),
    ],
  },
  "Magmablood Archaic": {
    abilities: [
      entersWith({ counters: amount.colorsSpent, label: "Convergence : un marqueur +1/+1 par couleur de mana dépensée" }),
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [fx.pumpAll({ types: ["Creature"], controller: "you" }, amount.eventColorsSpent, 0)],
        { label: "Éphémère ou rituel : vos créatures +1/+0 par couleur de mana dépensée pour le lancer" },
      ),
    ],
  },
  "Choreographed Sparks": {
    // « Ce sort ne peut pas être copié » : lu dans le texte. « Un ou les deux » : deux modes sans coût en plus.
    spell: spree(
      {
        cost: "{0}",
        label: "Copiez un sort d'éphémère ou de rituel que vous contrôlez",
        targets: [
          target.spell("a", { ...INSTANT_SORCERY, controller: "you" }, "sort d'éphémère ou de rituel que vous contrôlez"),
        ],
        effects: [fx.copySpell(ref.target("a"), 1)],
      },
      {
        cost: "{0}",
        label: "Copiez un sort de créature que vous contrôlez (célérité, sacrifiée en fin de tour)",
        targets: [target.spell("b", { types: ["Creature"], controller: "you" }, "sort de créature que vous contrôlez")],
        effects: [fx.copySpell(ref.target("b"), 1, { haste: true, sacrificeAtEndStep: true })],
      },
    ),
  },
};
