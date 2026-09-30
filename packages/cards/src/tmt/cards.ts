/**
 * Teenage Mutant Ninja Turtles — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore
 * couverte en entier.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  MUTAGEN,
  NINJA_TURTLE_SPIRIT,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Escape Tunnel": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Chercher un terrain de base",
      }),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une créature de force 2 ou moins ne peut pas être bloquée",
      }),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Leatherhead, Swamp Stalker": {
    abilities: [
      entersWith({ counters: 1, counterKind: "hexproof", label: "Arrive avec un marqueur de défense talismanique" }),
      triggered(
        when.combatDamageToPlayer,
        fx.may(
          "Retirer un marqueur de Leatherhead pour détruire un artefact ou un enchantement ?",
          fx.removeCounters(ref.self, 1, undefined, "removed"),
          fx.when(
            cond.v("removed"),
            fx.reflexive(
              [
                target.permanent(
                  "t",
                  ["Artifact", "Enchantment"],
                  { controller: "opponent" },
                  "artefact ou enchantement adverse",
                ),
              ],
              [fx.destroy(ref.target())],
            ),
          ),
        ),
        { label: "Retirer un marqueur : détruire un artefact ou un enchantement" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Dream Beavers": {
    abilities: [triggered(when.entersSelf, [...fx.drain(1), fx.scry(1)], { label: "Drain 1, regard 1" })],
  },
  "Mutagen Man, Living Ooze": {
    abilities: [
      playerStatic({ abilityCost: { source: { types: ["Artifact"], token: true }, reduce: 1 } }),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN, amount.sourceX)], { label: "X jetons Mutagène" }),
    ],
  },
  "The Ooze": {
    abilities: [
      triggered(
        when.leaves({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }),
        [fx.createTokens(MUTAGEN, amount.countersOn(ref.eventObject, "+1/+1"))],
        { label: "Un Mutagène par marqueur +1/+1" },
      ),
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target()), fx.createTokens(MUTAGEN)],
        label: "Exiler une carte d'un cimetière, un Mutagène",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  Skateboard: {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Engage un permanent",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["haste"] }, { label: "+1/+0 et célérité" }),
    ],
  },
  "The Last Ronin's Technique": {
    // Faufilement {1}{W} : lu dans le texte (coût alternatif, un attaquant non bloqué retourne en main).
    spell: spell(
      [],
      [
        ...fx.when(cond.sneaked, fx.createTappedTokens(NINJA_TURTLE_SPIRIT, 3, { attacking: true })),
        ...fx.when(cond.not(cond.sneaked), fx.createTokens(NINJA_TURTLE_SPIRIT, 3)),
      ],
    ),
  },
  "Cool but Rude": {
    abilities: [
      triggered(
        when.attackWith(1),
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        {
          label: "Défausse facultative : piochez",
        },
      ),
    ],
    classLevels: [
      [triggered(when.discard("you"), [fx.damage(2, ref.eachOpponent)], { label: "2 blessures à chaque adversaire" })],
      [
        triggered(when.classLevel(3), [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })], {
          label: "Cherchez une carte, puis défaussez au hasard",
        }),
      ],
    ],
  },
  "Casey Jones, Vigilante": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.delayedAt("yourNextUpkeep", [fx.discard(3, ref.you, { random: true })])], {
        label: "Piochez trois cartes ; au prochain entretien, défaussez-en trois au hasard",
      }),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Michelangelo's Technique": {
    // Faufilement {3}{G} : lu dans le texte.
    spell: spell(
      [],
      [
        fx.lookAtTop(8, {
          count: 2,
          filter: { types: ["Creature"] },
          maxTotalManaValue: 6,
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },
};
