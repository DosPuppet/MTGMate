/**
 * Wilds of Eldraine — cartes des decks du méta (phase 1 du plan P4, lot M1). Le Marchandage (702.166) est lu dans le
 * texte (`scryfall.ts` : kicker « sacrifiez un artefact, un enchantement ou un jeton »). L'extension n'est pas encore
 * couverte en entier.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  FOOD,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  RAT_NO_BLOCK,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Sleight of Hand": { spell: spell([], [fx.lookAtTop(2, { count: 1, to: { to: "hand" }, rest: "bottom" })]) },
  // --- Rouge -----------------------------------------------------------------
  "Hearth Elemental": {
    // {X} de moins : cartes d'éphémère, de rituel et/ou avec une Aventure dans votre cimetière.
    costReduction: {
      generic: amount.plus(
        amount.countIn("graveyard", INSTANT_SORCERY),
        amount.countIn("graveyard", { notTypes: ["Instant", "Sorcery"], adventure: true }),
      ),
    },
  },
  "Stoke Genius": { spell: spell([], [fx.discard(amount.cardsIn("hand")), fx.draw(2)]) },
  "Torch the Tower": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.exileIfDies(ref.target()), fx.damage(amount.kicked(3, 2), ref.target()), ...fx.when(cond.kicked, fx.scry(1))],
    ),
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Disdainful Stroke": {
    spell: spell([target.spell("t", { minManaValue: 4 }, "sort de VM 4 ou plus")], [fx.counter(ref.target())]),
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Candy Trail": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.draw(1)],
        label: "Gagnez 3 PV, piochez",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Song of Totentanz": {
    spell: spell(
      [],
      [
        fx.createTokens(RAT_NO_BLOCK, amount.x),
        fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["haste"] }),
      ],
    ),
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Bramble Familiar": {
    abilities: [
      manaAbility("G"),
      activated({ mana: "{1}{G}", tap: true, discard: 1, effects: [fx.bounce(ref.self)], label: "Renvoyez-la dans la main" }),
    ],
  },
  "Fetch Quest": {
    spell: spell(
      [],
      [
        fx.mill(7, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }, { types: ["Land"] }] },
          { to: "battlefield" },
          { count: 1, pool: ref.stored("m"), prompt: "Une carte de créature, d'enchantement ou de terrain meulée" },
        ),
      ],
    ),
  },
  "Mosswood Dreadknight": {
    abilities: [
      triggered(when.diesSelf, [fx.grantPlay(ref.selfCard, { untilYourNextTurn: true })], {
        label: "Lançable depuis le cimetière (en Aventure) jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Dread Whispers": { spell: spell([], [fx.draw(1), fx.loseLife(1)]) },
  "Restless Cottage": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["B", "G"]),
      activated({
        mana: "{2}{B}{G}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Horror"],
            setPower: 4,
            setToughness: 4,
            setColors: ["B", "G"],
          }),
        ],
        label: "Devient une créature Horreur 4/4",
      }),
      triggered(when.attacksSelf, [fx.createTokens(FOOD), fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "Une Nourriture, exile une carte d'un cimetière",
      }),
    ],
  },
  "Scalding Viper": {
    abilities: [
      triggered(when.castSpell("opponent", { maxManaValue: 3 }), [fx.damage(1, ref.eventPlayer)], {
        label: "1 blessure au lanceur",
      }),
    ],
  },
  "Steam Clean": { spell: spell([target.nonland()], [fx.bounce(ref.target())]) },
  "The End": {
    costReduction: { generic: 2, condition: cond.not(cond.lifeAtLeast(6)) },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exileWithNamesakes(ref.target())]),
  },
};
