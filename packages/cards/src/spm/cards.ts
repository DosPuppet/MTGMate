/**
 * Marvel's Spider-Man — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte en
 * entier.
 */
import { activated, amount, type CardScript, cond, fx, manaAbility, ref, staticAbility, target, triggered, when } from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Bleu ------------------------------------------------------------------
  "Hydro-Man, Fluid Felon": {
    abilities: [
      triggered(when.castSpell("you", { colors: ["U"] }), [fx.pump(ref.self, 1, 1)], {
        condition: cond.sourceMatches({ types: ["Creature"] }),
        label: "+1/+1 jusqu'à la fin du tour",
      }),
      triggered(
        when.yourEndStep,
        [
          fx.untap(ref.self),
          // « Jusqu'à votre prochain tour, il devient un terrain et gagne « {T} : ajoutez {U} ». » (ce n'est plus une créature).
          fx.modify(ref.self, { setTypes: ["Land"], setSubtypes: [], addAbilities: [manaAbility("U")] }, "untilYourNextTurn"),
        ],
        { label: "Se dégage et devient un terrain jusqu'à votre prochain tour" },
      ),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Sandman, Shifting Scoundrel": {
    cdaPT: amount.count({ types: ["Land"], controller: "you" }),
    keywords: ["cantBeBlockedByPowerLE2"],
    abilities: [
      activated({
        mana: "{3}{G}{G}",
        fromGraveyard: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        effects: [fx.toBattlefield(ref.selfCard, { tapped: true }), fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Revient avec une carte de terrain de votre cimetière",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Superior Spider-Man": {
    entersAsCopyOfGraveyard: { filter: { types: ["Creature"] }, name: "Superior Spider-Man", power: 4, toughness: 4 },
    entersAsCopyAddSubtypes: ["Spider", "Human", "Hero"],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Multiversal Passage": {
    // Le type de terrain de base est choisi en jouant le terrain (une option par type) ; « payez 2 PV » est lu dans le texte.
    chooseOnEnter: "landType",
    abilities: [staticAbility("self", { addChosenLandType: true }, { label: "Est du type choisi" })],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Aunt May": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.gainLife(1), ...fx.when(cond.eventObjectMatches({ subtype: "Spider" }), fx.addCounters(ref.eventObject, 1))],
        { label: "Gagnez 1 PV (Araignée : marqueur +1/+1)" },
      ),
    ],
  },
  "Carnage, Crimson Chaos": {
    // Chaos {B}{R} : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveTo(ref.target(), { to: "battlefield" }, { name: "c" }),
          fx.modify(
            ref.stored("c"),
            {
              addKeywords: ["mustAttack"],
              addAbilities: [triggered(when.combatDamageToPlayer, [fx.sacrificeIt(ref.self)], { label: "Sacrifiez-la" })],
            },
            "permanent",
          ),
        ],
        {
          targets: [
            target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins"),
          ],
          label: "Renvoie une créature, qui attaque et se sacrifie après avoir blessé un joueur",
        },
      ),
    ],
  },
};
