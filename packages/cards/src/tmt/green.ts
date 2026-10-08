/**
 * Teenage Mutant Ninja Turtles — green cards (lot A). Sneak and typecycling (Forestcycling) are read from the text;
 * Disappear is a condition on the turn log.
 */
import type { ObjectFilter, TargetSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  eventReplacement,
  FOOD,
  FOOD_ABILITY,
  fx,
  MUTAGEN,
  manaAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t"): TargetSpec => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "creature controlled by an opponent",
});
/** Disappear: a permanent left the battlefield under your control this turn. */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);
/** "Whenever an artifact an opponent controls is put into a graveyard from the battlefield." */
const OPPONENT_ARTIFACT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Artifact"], controller: "opponent" },
  to: "graveyard",
};
const MUTAGEN_LABEL = "A Mutagen token";

export const GREEN: Record<string, CardScript> = {
  "Courier of Comestibles": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "Search your library for a Food card?",
            fx.search({ subtype: "Food" }, { to: "hand" }, 1, undefined, "found"),
          ),
          ...fx.when(cond.not(cond.amountAtLeast(amount.refCount(ref.stored("found")), 1)), fx.createTokens(FOOD)),
        ],
        { label: "Search for a Food; otherwise, create a Food token" },
      ),
    ],
  },
  "Cowabunga!": {
    spell: spell(
      [],
      [
        fx.lookAtTop(4, {
          filter: { anyOf: [{ anySubtype: ["Mutant", "Ninja", "Turtle"] }, { types: ["Land"] }] },
          rest: "bottom",
        }),
      ],
    ),
  },
  // Deathtouch: read from the text.
  "Frog Butler": {
    abilities: [
      manaAbility([...ANY_COLOR]),
      activated({
        mana: "{2}",
        effects: [fx.pump(ref.self, 0, 0, ["reach"])],
        label: "Gains reach until end of turn",
      }),
    ],
  },
  // Trample: read from the text.
  "Groundchuck & Dirtbag": {
    abilities: [
      // Triggered mana ability (605.1b): a mana replacement (R1, family I), like Badgermole Cub.
      eventReplacement({
        event: "mana",
        source: { types: ["Land"] },
        to: "you",
        extraMana: "G",
        modify: { add: 1 },
        label: "A land tapped for mana: an additional {G}",
      }),
    ],
  },
  // Flash: read from the text.
  "Guac & Marshmallow Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2), fx.untap(ref.target())], {
        targets: [target.creature()],
        label: "+2/+2 until end of turn, then untap it",
      }),
      FOOD_ABILITY,
    ],
  },
  "Michelangelo, Game Master": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: DISAPPEAR,
        label: "Disappear — a +1/+1 counter on Michelangelo",
      }),
    ],
  },
  // Sneak {2}{G}{G}: read from the text.
  "Michelangelo, Improviser": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield" },
            { min: 0, prompt: "You may put a creature card from your hand onto the battlefield" },
          ),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, prompt: "You may put a land card from your hand onto the battlefield" },
          ),
        ],
        { label: "A creature and/or a land from your hand onto the battlefield" },
      ),
    ],
  },
  "Michelangelo, Mutant BFF": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "any" },
        { addBlockRules: [block.atMost(1)] },
        { label: "Creatures you control with a counter can't be blocked by more than one creature" },
      ),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
      triggered(when.attacksSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
    ],
  },
  "Michelangelo, Weirdness to 11": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "An additional +1/+1 counter on your creatures",
      }),
    ],
  },
  // Reach: read from the text.
  "Mona Lisa, Science Geek": {
    abilities: [manaAbility([...ANY_COLOR], 1, { selfPower: true })],
  },
  "Mutant Chain Reaction": {
    spell: spell(
      [
        target.upTo(1, {
          id: "t",
          label: "artifact, enchantment or creature with flying",
          filter: {
            objects: { anyOf: [{ types: ["Artifact", "Enchantment"] }, { types: ["Creature"], keyword: "flying" }] },
          },
        }),
      ],
      [fx.destroy(ref.target()), fx.createTokens(MUTAGEN)],
    ),
  },
  // Sneak {2}{G}: read from the text.
  "New Generation's Technique": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)]),
  },
  // Equip {3}: read from the text.
  "Novel Nunchaku": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.attach(ref.target("c")),
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.attached), 1),
            fx.reflexive([target.upTo(1, OPPONENT_CREATURE("d"))], [fx.fight(ref.attached, ref.target("d"))]),
          ),
        ],
        {
          targets: [YOUR_CREATURE("c")],
          label: "Attaches to a creature you control, which fights a creature an opponent controls",
        },
      ),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["trample"] }, { label: "+1/+1 and trample" }),
    ],
  },
  "Party Dude": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD, 1, ref.eachPlayer)], {
        label: "Each player creates a Food token",
      }),
    ],
    classLevels: [
      [
        triggered(OPPONENT_ARTIFACT_TO_GRAVEYARD, [fx.draw(1)], {
          label: "An opponent's artifact goes to the graveyard: draw",
        }),
      ],
      [
        // "Whenever one or more of your opponents are attacked": by any player, and a player
        // (not a planeswalker).
        triggered(
          when.attackWith(1, { attacking: "opponent" }, true),
          [fx.pump(ref.target(), amount.cardsIn("hand"), amount.cardsIn("hand"))],
          {
            targets: [target.upTo(1, target.creature("t", { attacking: true }))],
            label: "An attacking creature gets +X/+X (cards in hand)",
          },
        ),
      ],
    ],
  },
  // Reach, trample: read from the text.
  "Primordial Pachyderm": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "Gain 2 life" })],
  },
  "Ragamuffin Raptor": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.upTo(
            1,
            target.cardInGraveyard(
              "t",
              { anyOf: [{ types: ["Creature"] }, { subtype: "Food" }] },
              "you",
              "creature or Food card in your graveyard",
            ),
          ),
        ],
        label: "Returns a creature or Food card from your graveyard to your hand",
      }),
    ],
  },
  // Forestcycling {2}: read from the text.
  "Rocksteady, Crash Courser": {
    abilities: [
      blockAbility(block.atMost(1)),
      staticAbility(
        { types: ["Creature"], subtype: "Boar", controller: "you" } satisfies ObjectFilter,
        { addBlockRules: [block.atMost(1)] },
        { label: "Your Boars can't be blocked by more than one creature" },
      ),
    ],
  },
  "Saved by the Shell": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Turtle" }) },
    spell: spell(
      [YOUR_CREATURE()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["trample", "hexproof", "indestructible"])],
    ),
  },
  Tenderize: {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  // Flying: read from the text.
  "Transdimensional Bovine": {
    abilities: [manaAbility([...ANY_COLOR], 2)],
  },
  // Flash: read from the text.
  "Turtle Power!": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Turtle", controller: "you" },
        { power: 2, toughness: 2 },
        {
          label: "Your Turtles get +2/+2",
        },
      ),
    ],
  },
  "Venus, Torn Between Worlds": {
    abilities: [
      triggered(when.isDealtDamage, [fx.addCounters(ref.self, amount.eventAmount)], {
        label: "As many +1/+1 counters as damage dealt to it",
      }),
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", withCounter: "any" }, true),
        fx.mayPay("{U}", "Pay {U} to draw a card?", fx.draw(1)),
        { label: "A creature you control with a counter deals damage to a player: pay {U}, draw" },
      ),
    ],
  },
  // Trample: read from the text.
  "West Wind Avatar": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(
          trigger,
          [
            fx.sacrifice(ref.you, { anyOf: [{ token: true }, { types: ["Land"] }] }, 1, { optional: true, store: "s" }),
            ...fx.when(cond.v("s"), fx.gainLife(3)),
          ],
          { label: "You may sacrifice a token or a land: gain 3 life" },
        ),
      ),
      triggered(when.yourEndStep, [fx.draw(1)], { condition: DISAPPEAR, label: "Disappear — draw a card" }),
    ],
  },
  "Zoo Escapees": {
    abilities: [triggered(when.leavesSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL })],
  },
};
