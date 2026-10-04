/** Through the Ages (FCA) : scripts des cartes (PLAN-G). */
import { altCostMode, type CardScript, fx, INSTANT_SORCERY, ref, spell, TREASURE, target, triggered, when } from "../tdm/common";

export const CARDS: Record<string, CardScript> = {
  "Light Up the Stage": {
    // Spectacle {R} : lu dans le texte.
    spell: spell([], [fx.exileTop(ref.you, 2, "l"), fx.grantPlay(ref.stored("l"), { untilYourNextTurn: true })]),
  },
  "Mizzix's Mastery": {
    spell: altCostMode(
      "Surcharge",
      "{5}{R}{R}{R}",
      {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        effects: [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 999), fx.exileOnResolve],
      },
      {
        effects: [
          fx.moveTo(ref.zone("graveyard", ref.you, INSTANT_SORCERY), { to: "exile" }, { name: "c" }),
          fx.castCopiesFree([ref.stored("c")], 999),
          fx.exileOnResolve,
        ],
      },
    ),
  },
  "Ragavan, Nimble Pilferer": {
    // Ruée {1}{R} : lue dans le texte.
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [fx.createTokens(TREASURE), fx.exileTop(ref.eventPlayer, 1, "r"), fx.grantPlay(ref.stored("r"))],
        { label: "Un Trésor ; exilez sa carte du dessus, lançable ce tour-ci" },
      ),
    ],
  },
};
