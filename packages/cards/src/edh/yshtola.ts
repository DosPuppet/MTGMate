/**
 * Commander (PLAN-E, E12): Y'shtola, Night's Blessed deck (Esper, drain and control). Life loss of opponents (turn
 * log), noncreature spells, taxes on spells and attacks, cumulative upkeep (read from the text),
 * printed rebound.
 */
import type { CardScript, Condition, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  fx,
  loyalty,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };

/** "An opponent lost N or more life this turn." */
const opponentLostLife = (n: number): Condition =>
  cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eachOpponent, cond.amountAtLeast(amount.lifeLostThisTurn, n))), 1);

/** "If it isn't that player's turn" (the player of the event). */
const notEventPlayersTurn: Condition = cond.not(
  cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eventPlayer, cond.yourTurn)), 1),
);

/** "Whenever a player casts their second spell each turn." */
const SECOND_SPELL_ANY: TriggerSpec = { on: "castSpell", by: "any", nth: 2 };

/** "Whenever enchanted creature deals damage to an opponent." */
const ENCHANTED_DAMAGES_OPPONENT = when.dealsDamage({ attached: "host" }, { to: { players: "opponent" } });
/** "Whenever this creature deals damage to an opponent" (granted ability). */
const SELF_DAMAGES_OPPONENT = when.dealsDamage("self", { to: { players: "opponent" } });

export const EDH_YSHTOLA: Record<string, CardScript> = {
  "Y'shtola, Night's Blessed": {
    abilities: [
      triggered(when.eachEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "lifeLoss", sum: true, perPlayer: true }), 4),
        label: "A player lost 4 or more life this turn: draw",
      }),
      triggered(when.castSpell("you", { ...NONCREATURE, minManaValue: 3 }), [fx.damage(2, ref.eachOpponent), fx.gainLife(2)], {
        label: "Noncreature spell with MV 3 or greater: 2 damage to each opponent, gain 2 life",
      }),
    ],
  },
  "Emet-Selch of the Third Seat": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard"],
        label: "Spells cast from your graveyard: {2} less",
      },
      // "Do this only once each turn": the limit is used up only if the spell is cast.
      triggered(
        when.loseLife("opponent"),
        [fx.castNow(ref.target(), { after: "exile", storeCast: "cast" }), ...fx.when(cond.v("cast"), fx.doneOncePerTurn)],
        {
          targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery card")],
          batched: true,
          oncePerTurn: "ifDone",
          label: "One or more opponents lose life: cast an instant or sorcery from your graveyard",
        },
      ),
    ],
  },
  "Esper Sentinel": {
    abilities: [
      // "Their first noncreature spell each turn": a trigger condition, not a rechecked "if".
      triggered(
        when.castSpell("opponent", NONCREATURE),
        fx.unlessPays(ref.eventPlayer, { genericAmount: amount.powerOf(ref.self) }, fx.draw(1)),
        {
          triggerCondition: cond.not(cond.amountAtLeast(amount.noncreatureCastBy(ref.eventPlayer), 2)),
          label: "An opponent's first noncreature spell this turn: draw, unless they pay {X}",
        },
      ),
    ],
  },
  "Kambal, Consul of Allocation": {
    abilities: [
      triggered(when.castSpell("opponent", NONCREATURE), [fx.loseLife(2, ref.eventPlayer), fx.gainLife(2)], {
        label: "An opponent casts a noncreature spell: they lose 2 life, you gain 2 life",
      }),
    ],
  },
  "Lotho, Corrupt Shirriff": {
    abilities: [
      triggered(SECOND_SPELL_ANY, [fx.loseLife(1), fx.createTokens(TREASURE)], {
        label: "A player casts their second spell each turn: lose 1 life, create a Treasure",
      }),
    ],
  },
  "Lyse Hext": {
    abilities: [
      costReducer(NONCREATURE, 1, "Noncreature spells you cast cost {1} less"),
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike"] },
        {
          condition: cond.amountAtLeast(amount.noncreatureCastBy(ref.you), 2),
          label: "Two noncreature spells cast this turn: double strike",
        },
      ),
    ],
  },
  "Orcish Bowmasters": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target()), fx.amass(ref.you, "Orc", 1)], {
        targets: [target.any("t")],
        label: "1 damage, then amass Orcs 1",
      }),
      triggered(when.drawExceptTurnDraw("opponent"), [fx.damage(1, ref.target()), fx.amass(ref.you, "Orc", 1)], {
        targets: [target.any("t")],
        label: "An opponent draws (except the first draw of their draw step): 1 damage, then amass Orcs 1",
      }),
    ],
  },
  "Papalymo Totolymo": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], {
        label: "Noncreature spell: 1 damage to each opponent, gain 1 life",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.sacrifice(ref.playersWhere(ref.eachOpponent, cond.lostLife), { types: ["Creature"] }, 1, { greatestPower: true }),
        ],
        label: "Each opponent who lost life this turn sacrifices their creature with the greatest power",
      }),
    ],
  },
  "Sheoldred, the Apocalypse": {
    abilities: [
      triggered(when.draw(undefined, "you"), [fx.gainLife(2)], { label: "You draw: gain 2 life" }),
      triggered(when.draw(undefined, "opponent"), [fx.loseLife(2, ref.eventPlayer)], {
        label: "An opponent draws: they lose 2 life",
      }),
    ],
  },
  "Tataru Taru": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), ...fx.mayFor(ref.target(), "Draw a card?", fx.draw(1, ref.target()))], {
        targets: [target.player("t", "opponent")],
        label: "Draw; target opponent may draw",
      }),
      triggered(when.draw(undefined, "opponent"), [fx.createTokens({ ...TREASURE, tapped: true })], {
        condition: notEventPlayersTurn,
        oncePerTurn: true,
        label: "Scions' Secretary: an opponent draws outside their turn, a tapped Treasure (once each turn)",
      }),
    ],
  },
  "Irenicus's Vile Duplication": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["flying"], nonlegendary: true })],
    ),
  },
  // Rebound: keyword read from the text.
  "Quantum Misalignment": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.copyToken(ref.target(), { nonlegendary: true })]),
  },
  Mindcrank: {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.mill(amount.eventAmount, ref.eventPlayer)], {
        label: "An opponent loses life: they mill that many cards",
      }),
    ],
  },
  "Bloodchief Ascension": {
    abilities: [
      triggered(when.eachEndStep, fx.may("Put a quest counter?", fx.counters(ref.self, "quest")), {
        condition: opponentLostLife(2),
        label: "An opponent lost 2 or more life this turn: quest counter",
      }),
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "stack", "exile", "command"], {
          to: ["graveyard"],
          whose: "opponent",
          filter: { token: false },
        }),
        fx.may("Have that player lose 2 life?", fx.loseLife(2, ref.eventPlayer), fx.gainLife(2)),
        {
          condition: cond.counterAtLeast("quest", 3),
          label: "A card goes to an opponent's graveyard: they lose 2 life, you gain 2 life",
        },
      ),
    ],
  },
  "Helm of the Ghastlord": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        { attached: "host", colors: ["U"] },
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(SELF_DAMAGES_OPPONENT, [fx.draw(1)], { label: "Damage to an opponent: draw" })],
        },
        { label: "Blue enchanted creature: +1/+1 and draw" },
      ),
      staticAbility(
        { attached: "host", colors: ["B"] },
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            triggered(SELF_DAMAGES_OPPONENT, [fx.discard(1, ref.eventPlayer)], {
              label: "Damage to an opponent: they discard",
            }),
          ],
        },
        { label: "Black enchanted creature: +1/+1 and discard" },
      ),
    ],
  },
  // Cumulative upkeep {1}: read from the text.
  "Mystic Remora": {
    abilities: [
      triggered(
        when.castSpell("opponent", NONCREATURE),
        [fx.unlessPays(ref.eventPlayer, { mana: "{4}" }, fx.may("Draw a card?", fx.draw(1)))],
        { label: "An opponent casts a noncreature spell: you may draw, unless they pay {4}" },
      ),
    ],
  },
  "Ophidian Eye": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(ENCHANTED_DAMAGES_OPPONENT, fx.may("Draw a card?", fx.draw(1)), {
        label: "Enchanted creature deals damage to an opponent: you may draw",
      }),
    ],
  },
  Propaganda: {
    abilities: [playerStatic({ attackTax: 2, label: "Attacking you: {2} for each creature" })],
  },
  "Teferi, Time Raveler": {
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", sorceryTiming: true },
        label: "Your opponents cast spells only any time they could cast a sorcery",
      }),
      loyalty(1, {
        effects: [fx.untilYourNextTurn({ spellKeywords: { filter: { types: ["Sorcery"] }, keywords: ["flash"] } })],
        label: "Until your next turn, sorceries you cast have flash",
      }),
      loyalty(-3, {
        targets: [
          target.upTo(
            1,
            target.permanent("t", ["Artifact", "Creature", "Enchantment"], {}, "artifact, creature, or enchantment"),
          ),
        ],
        effects: [fx.bounce(ref.target()), fx.draw(1)],
        label: "Return up to one artifact, creature, or enchantment; draw",
      }),
    ],
  },
};
