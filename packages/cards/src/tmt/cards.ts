/**
 * Teenage Mutant Ninja Turtles — cards of the meta decks (phase 1 of plan P4, lot M1). The other cards of the set are
 * in the per-color files.
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
  // --- Lands -----------------------------------------------------------------
  "Escape Tunnel": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Search for a basic land, tapped",
      }),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "A creature with power 2 or less can't be blocked",
      }),
    ],
  },
  // --- Green -----------------------------------------------------------------
  "Leatherhead, Swamp Stalker": {
    abilities: [
      entersWith({ counters: 1, counterKind: "hexproof", label: "Enters with a hexproof counter" }),
      triggered(
        when.combatDamageToPlayer,
        fx.may(
          "Remove a counter from Leatherhead to destroy an artifact or enchantment?",
          fx.removeCounters(ref.self, 1, undefined, "removed"),
          fx.when(
            cond.v("removed"),
            fx.reflexive(
              [
                target.of(
                  ref.eventPlayer,
                  target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment that player controls"),
                ),
              ],
              [fx.destroy(ref.target())],
            ),
          ),
        ),
        { label: "Remove a counter to destroy an artifact or enchantment" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Dream Beavers": {
    abilities: [triggered(when.entersSelf, [...fx.drain(1), fx.scry(1)], { label: "Drain 1, scry 1" })],
  },
  "Mutagen Man, Living Ooze": {
    abilities: [
      playerStatic({ abilityCost: { source: { types: ["Artifact"], token: true }, reduce: 1 } }),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN, amount.sourceX)], { label: "X Mutagen tokens" }),
    ],
  },
  "The Ooze": {
    abilities: [
      triggered(
        when.leaves({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }),
        [fx.createTokens(MUTAGEN, amount.countersOn(ref.eventObject, "+1/+1"))],
        { label: "A Mutagen for each +1/+1 counter" },
      ),
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target()), fx.createTokens(MUTAGEN)],
        label: "Exile a card from a graveyard, a Mutagen",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  Skateboard: {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Taps a permanent",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["haste"] }, { label: "ctx:short|+1/+0 and haste" }),
    ],
  },
  "The Last Ronin's Technique": {
    // Sneak {1}{W}: read from the text (alternative cost, an unblocked attacker returns to hand).
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
          label: "Optional discard: draw",
        },
      ),
    ],
    classLevels: [
      [triggered(when.discard("you"), [fx.damage(2, ref.eachOpponent)], { label: "2 damage to each opponent" })],
      [
        triggered(when.classLevel(3), [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })], {
          label: "Search for a card, then discard at random",
        }),
      ],
    ],
  },
  "Casey Jones, Vigilante": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.delayedAt("yourNextUpkeep", [fx.discard(3, ref.you, { random: true })])], {
        label: "Draw three cards; at your next upkeep, discard three at random",
      }),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Michelangelo's Technique": {
    // Sneak {3}{G}: read from the text.
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
