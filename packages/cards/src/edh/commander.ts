/**
 * Commander (PLAN-E, E6) : cartes qui citent le commandant ou les adversaires du format multijoueur. Mana de l'identité
 * du commandant (903.4), « si vous contrôlez un commandant », éminence (113.6), mana des terrains adverses, « deux
 * adversaires ou plus ».
 */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  ANY_COLOR,
  amount,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  spell,
  target,
  triggered,
  VAMPIRE_BLACK,
  when,
} from "./common";

/** « Si vous contrôlez un commandant, vous pouvez lancer ce sort sans payer son coût de mana. » */
const freeWithCommander = {
  mana: "{0}",
  condition: cond.controls({ commander: true }),
  label: "Sans payer son coût de mana (vous contrôlez un commandant)",
};

/** « Arrive engagé, sauf si vous avez deux adversaires ou plus » (Battlebond, Commander Legends). */
const twoOpponentsLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.amountAtLeast(amount.refCount(ref.eachOpponent), 2)),
      label: "Engagé, sauf avec deux adversaires ou plus",
    }),
    manaAbility([a, b]),
  ],
});

export const COMMANDER_CARDS: Record<string, CardScript> = {
  "Command Tower": { abilities: [manaAbility(ANY_COLOR, 1, { commanderIdentity: true })] },
  "Arcane Signet": { abilities: [manaAbility(ANY_COLOR, 1, { commanderIdentity: true })] },
  "Path of Ancestry": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(ANY_COLOR, 1, {
        commanderIdentity: true,
        // « Quand ce mana est dépensé pour lancer un sort de créature qui partage un type de créature avec votre
        // commandant, regard 1. »
        rider: { spell: { types: ["Creature"], sharesCreatureTypeWith: ref.commanders() }, effects: [fx.scry(1)] },
      }),
    ],
  },
  "Exotic Orchard": { abilities: [manaAbility(ANY_COLOR, 1, { likeLands: { controller: "opponent" } })] },
  "Fellwar Stone": { abilities: [manaAbility(ANY_COLOR, 1, { likeLands: { controller: "opponent" } })] },
  "Luxury Suite": twoOpponentsLand("B", "R"),
  "Vault of Champions": twoOpponentsLand("W", "B"),
  "Morphic Pool": twoOpponentsLand("U", "B"),
  "Sea of Clouds": twoOpponentsLand("W", "U"),
  "Spire Garden": twoOpponentsLand("R", "G"),
  "Undergrowth Stadium": twoOpponentsLand("B", "G"),
  "Rejuvenating Springs": twoOpponentsLand("G", "U"),
  "Fierce Guardianship": {
    altCost: freeWithCommander,
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")], [fx.counter(ref.target())]),
  },
  "Deadly Rollick": {
    altCost: freeWithCommander,
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Flawless Maneuver": {
    altCost: freeWithCommander,
    spell: spell([], [fx.pumpAll({ controller: "you" }, 0, 0, ["indestructible"])]),
  },
  // Éminence : la première capacité fonctionne aussi depuis la zone de commandement.
  "Edgar Markov": {
    abilities: [
      triggered(when.castSpell("you", { subtype: "Vampire", other: true }), [fx.createTokens(VAMPIRE_BLACK)], {
        fromCommand: true,
        label: "Éminence : jeton Vampire",
      }),
      triggered(when.attacksSelf, [fx.addCountersAll({ subtype: "Vampire", controller: "you", types: ["Creature"] })], {
        label: "+1/+1 sur chaque Vampire",
      }),
    ],
  },
};
