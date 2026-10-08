/** Outlaws of Thunder Junction — black cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  fx,
  mercenary,
  OUTLAW,
  OUTLAW_CREATURE,
  ref,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  ZOMBIE_ROGUE,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Ambush Gigapede": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -2, -2)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-2/-2",
      }),
    ],
  },
  "Blacksnag Buzzard": { abilities: [entersWith({ counters: 1, condition: cond.morbid })] },
  "Blood Hustler": {
    abilities: [
      triggered(when.crime, [fx.addCounters(ref.self, 1)], { oncePerTurn: true, label: "+1/+1 counter" }),
      activated({
        mana: "{3}{B}",
        targets: [target.player("t", "opponent")],
        effects: fx.drain(1, ref.target()),
        label: "Drain 1",
      }),
    ],
  },
  "Boneyard Desecrator": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.addCounters(ref.self, 1), fx.when(cond.refMatches(ref.costSacrificed, OUTLAW), fx.createTokens(TREASURE))],
        label: "+1/+1 counter (Treasure if outlaw)",
      }),
    ],
  },
  "Consuming Ashes": {
    spell: spell(
      [target.creature("t")],
      [fx.when(cond.targetMatches("t", { maxManaValue: 3 }), fx.surveil(2)), fx.exile(ref.target())],
    ),
  },
  "Corrupted Conviction": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.draw(2)]),
  },
  "Desert's Due": {
    spell: spell(
      [target.creature("t")],
      [
        fx.pump(
          ref.target(),
          amount.plus(-2, amount.neg(amount.count({ subtype: "Desert", controller: "you" }))),
          amount.plus(-2, amount.neg(amount.count({ subtype: "Desert", controller: "you" }))),
        ),
      ],
    ),
  },
  "Desperate Bloodseeker": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2, ref.target())], {
        targets: [target.player("t")],
        label: "Target player mills two cards",
      }),
    ],
  },
  "Forsaken Miner": {
    abilities: [
      staticAbility("self", { addKeywords: ["cantBlock"] }, { label: "Can't block" }),
      triggered(when.crime, fx.mayPay("{B}", "Pay {B} to return it?", fx.toBattlefield(ref.self)), {
        fromGraveyard: true,
        label: "Returns from the graveyard",
      }),
    ],
  },
  "Gisa, the Hellraiser": {
    abilities: [
      staticAbility(
        { anyOf: [{ subtype: "Skeleton" }, { subtype: "Zombie" }], types: ["Creature"], controller: "you" },
        { power: 1, toughness: 1, addKeywords: ["menace"] },
        { label: "+1/+1 and menace" },
      ),
      triggered(when.crime, [fx.createTappedTokens(ZOMBIE_ROGUE, 2)], {
        oncePerTurn: true,
        label: "Two tapped Zombie Rogues",
      }),
    ],
  },
  "Hollow Marauder": {
    costReduction: { generic: amount.countIn("graveyard", { types: ["Creature"] }) },
    abilities: [
      triggered(
        when.entersSelf,
        // Each targeted opponent discards a single card: those who didn't discard a card with mana value 4 or greater are the
        // targeted opponents minus the discarded cards with mana value 4 or greater.
        [
          fx.discard(1, ref.target(), { store: "big", storeFilter: { minManaValue: 4 } }),
          fx.draw(amount.plus(amount.refCount(ref.target()), amount.neg(amount.v("big")))),
        ],
        { targets: [target.upTo(3, target.player("t", "opponent"))], label: "Discards; otherwise draw" },
      ),
    ],
  },
  "Insatiable Avarice": {
    spell: spree(
      { cost: "{2}", label: "Search for a card, put it on top", effects: [fx.search({}, { to: "libraryTop" })] },
      {
        cost: "{B}{B}",
        label: "A player draws three cards and loses 3 life",
        targets: [target.player("p")],
        effects: [fx.draw(3, ref.target("p")), fx.loseLife(3, ref.target("p"))],
      },
    ),
  },
  "Lively Dirge": {
    spell: spree(
      { cost: "{1}", label: "A card from your library into your graveyard", effects: [fx.search({}, { to: "graveyard" })] },
      {
        cost: "{2}",
        label: "Up to two creatures (total mana value 4 or less)",
        targets: [
          {
            ...target.upTo(2, target.cardInGraveyard("c", { types: ["Creature"] }, "you", "creature card")),
            maxTotalManaValue: 4,
          },
        ],
        effects: [fx.toBattlefield(ref.target("c"))],
      },
    ),
  },
  "Mourner's Surprise": {
    spell: spell(
      [target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card"))],
      [fx.toHand(ref.target()), mercenary()],
    ),
  },
  "Neutralize the Guards": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.pump(ref.permanentsOf(ref.target(), { types: ["Creature"] }), -1, -1), fx.surveil(2)],
    ),
  },
  "Nezumi Linkbreaker": { abilities: [triggered(when.diesSelf, [mercenary()], { label: "1/1 Mercenary" })] },
  "Overzealous Muscle": {
    abilities: [
      triggered(when.crime, [fx.pump(ref.self, 0, 0, ["indestructible"])], { condition: cond.yourTurn, label: "Indestructible" }),
    ],
  },
  "Pitiless Carnage": {
    spell: spell([], [fx.sacrifice(ref.you, { permanent: true }, 60, { optional: true, store: "s" }), fx.draw(amount.v("s"))]),
  },
  "Rakish Crew": {
    abilities: [
      triggered(when.entersSelf, [mercenary()], { label: "1/1 Mercenary" }),
      triggered(when.dies({ ...OUTLAW_CREATURE, controller: "you" }), fx.drain(1), { label: "Drain 1" }),
    ],
  },
  "Rattleback Apothecary": {
    abilities: [
      // "Your choice of" is not a mode: the keyword is chosen during resolution (608.2d).
      triggered(
        when.crime,
        [
          ...fx.mayForStore(
            ref.you,
            "Does the creature gain menace? (otherwise, lifelink)",
            "m",
            fx.pump(ref.target(), 0, 0, ["menace"]),
          ),
          ...fx.when(cond.not(cond.v("m")), fx.pump(ref.target(), 0, 0, ["lifelink"])),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Your choice of menace or lifelink" },
      ),
    ],
  },
  "Raven of Fell Omens": {
    abilities: [triggered(when.crime, fx.drain(1), { oncePerTurn: true, label: "Drain 1" })],
  },
  "Rictus Robber": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ZOMBIE_ROGUE)], { condition: cond.morbid, label: "2/2 Zombie Rogue" }),
    ],
  },
  "Rooftop Assassin": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", damaged: true })],
        label: "Destroy a damaged creature",
      }),
    ],
  },
  "Rush of Dread": {
    spell: spree(
      {
        cost: "{1}",
        label: "They sacrifice half their creatures",
        targets: [target.player("a", "opponent")],
        effects: [
          fx.sacrifice(
            ref.target("a"),
            { types: ["Creature"] },
            amount.per(amount.plus(amount.count({ types: ["Creature"], controller: "opponent" }), 1), 2),
          ),
        ],
      },
      {
        cost: "{2}",
        label: "They discard half their hand",
        targets: [target.player("b", "opponent")],
        effects: [fx.discard(amount.per(amount.plus(amount.countIn("hand", {}, "opponents"), 1), 2), ref.target("b"))],
      },
      {
        cost: "{2}",
        label: "They lose half their life",
        targets: [target.player("c", "opponent")],
        effects: [fx.loseLife(amount.halfLife(ref.target("c")), ref.target("c"))],
      },
    ),
  },
  "Servant of the Stinger": {
    abilities: [
      triggered(
        when.combatDamage("self", true),
        [fx.sacrifice(ref.you, { self: true }, 1, { optional: true, store: "s" }), fx.when(cond.v("s"), fx.search({}))],
        { condition: cond.crime, label: "Sacrifice it: search for a card" },
      ),
    ],
  },
  "Shoot the Sheriff": {
    spell: spell([target.creature("t", { noneOfSubtypes: OUTLAW.anySubtype })], [fx.destroy(ref.target())]),
  },
  Skulduggery: {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 1, 1), fx.pump(ref.target("b"), -1, -1)],
    ),
  },
  "Treasure Dredger": {
    abilities: [activated({ mana: "{1}", tap: true, payLife: 1, effects: [fx.createTokens(TREASURE)], label: "Treasure" })],
  },
  "Unfortunate Accident": {
    spell: spree(
      {
        cost: "{2}{B}",
        label: "Destroy a creature",
        targets: [target.creature("c")],
        effects: [fx.destroy(ref.target("c"))],
      },
      { cost: "{1}", label: "1/1 Mercenary", effects: [mercenary()] },
    ),
  },
  "Unscrupulous Contractor": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.player("t")], [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())])),
        ],
        { label: "Sacrifice a creature: a player draws two cards and loses 2 life" },
      ),
    ],
  },
  "Vadmir, New Blood": {
    abilities: [
      triggered(when.crime, [fx.addCounters(ref.self, 1)], { oncePerTurn: true, label: "+1/+1 counter" }),
      staticAbility(
        "self",
        { addKeywords: ["menace", "lifelink"] },
        {
          condition: cond.counterAtLeast("+1/+1", 4),
          label: "Menace and lifelink (4 counters)",
        },
      ),
    ],
  },
  "Vault Plunderer": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1, ref.target()), fx.loseLife(1, ref.target())], {
        targets: [target.player("t")],
        label: "Target player draws a card and loses 1 life",
      }),
    ],
  },
};
