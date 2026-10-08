/** Bloomburrow — white cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersAndSacrificed,
  FISH,
  FLYER_YOU,
  FOOD_ABILITY,
  fx,
  GAINED_OR_LOST,
  kin,
  mode,
  NONFLYER_YOU,
  pawprint,
  playerStatic,
  RABBIT,
  ref,
  spell,
  staticAbility,
  TOKEN_YOU,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  valiant,
  WALL,
  when,
} from "./common";

const RABBIT_BAT_BIRD_MOUSE = ["Rabbit", "Bat", "Bird", "Mouse"];

export const WHITE: Record<string, CardScript> = {
  "Beza, the Bounding Spring": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.opponentHasMore("lands"), fx.createTokens(TREASURE)),
          ...fx.when(cond.opponentHasMore("life"), fx.gainLife(4)),
          ...fx.when(cond.opponentHasMore("creatures"), fx.createTokens(FISH, 2)),
          ...fx.when(cond.opponentHasMore("hand"), fx.draw(1)),
        ],
        { label: "Catch-up: Treasure, 4 life, Fish, card" },
      ),
    ],
  },
  "Brave-Kin Duo": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 1, 1)],
        label: "+1/+1",
      }),
    ],
  },
  "Builder's Talent": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(WALL)], { label: "0/4 Wall with defender" })],
    classLevels: [
      [
        triggered(when.enters({ controller: "you", notTypes: ["Creature", "Land"] }), [fx.addCounters(ref.target(), 1)], {
          targets: [target.creature("t", { controller: "you" })],
          batched: true,
          label: "+1/+1 counter",
        }),
      ],
      [
        triggered(when.classLevel(3), [fx.toBattlefield(ref.target())], {
          targets: [
            target.cardInGraveyard(
              "t",
              { permanent: true, notTypes: ["Creature", "Land"] },
              "you",
              "noncreature, nonland permanent card",
            ),
          ],
          label: "Returns a noncreature permanent",
        }),
      ],
    ],
  },
  "Caretaker's Talent": {
    abilities: [triggered(when.enters(TOKEN_YOU), [fx.draw(1)], { batched: true, oncePerTurn: true, label: "Draw a card" })],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.copyToken(ref.target())], {
          targets: [targetObj("t", TOKEN_YOU, "token you control")],
          label: "Copy of a token",
        }),
      ],
      [staticAbility({ types: ["Creature"], token: true, controller: "you" }, { power: 2, toughness: 2 }, { label: "+2/+2" })],
    ],
  },
  "Carrot Cake": {
    abilities: [...entersAndSacrificed([fx.createTokens(RABBIT), fx.scry(1)], "1/1 Rabbit, scry 1"), FOOD_ABILITY],
  },
  "Crumb and Get It": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 2, 2), ...fx.when(cond.gift, fx.pump(ref.target(), 0, 0, ["indestructible"]))],
    ),
  },
  "Dawn's Truce": {
    spell: spell(
      [],
      [
        fx.emblem("Dawn's Truce", msg("You have hexproof until end of turn."), [playerStatic({ hexproof: true })], false, true),
        fx.modifyAll({ controller: "you" }, { addKeywords: ["hexproof"] }),
        ...fx.when(cond.gift, fx.modifyAll({ controller: "you" }, { addKeywords: ["indestructible"] })),
      ],
    ),
  },
  "Dewdrop Cure": {
    spell: spell(
      [
        {
          ...target.upTo(
            2,
            target.cardInGraveyard(
              "t",
              { types: ["Creature"], maxManaValue: 2 },
              "you",
              "creature card with mana value 2 or less",
            ),
          ),
          kickedCount: 3,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Driftgloom Coyote": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.refMatches(ref.target(), { maxPower: 2 }), fx.addCounters(ref.self, 1)),
          fx.exileUntilLeaves(ref.target()),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Exiles a creature an opponent controls" },
      ),
    ],
  },
  "Essence Channeler": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying", "vigilance"] },
        { condition: cond.lostLife, label: "Flying and vigilance" },
      ),
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      triggered(when.diesSelf, [fx.lkiCountersTo(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Its counters onto a creature",
      }),
    ],
  },
  "Feather of Flight": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 and gains flying" }),
    ],
  },
  "Flowerfoot Swordmaster": {
    abilities: [valiant([fx.pumpAll(kin(["Mouse"]), 1, 0)], { label: "Mouse +1/+0" })],
  },
  "Harvestrite Host": {
    abilities: [
      triggered(
        when.enters(kin(["Rabbit"])),
        [
          fx.pump(ref.target(), 1, 0),
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "+1/+0 (a card the second time)" },
      ),
    ],
  },
  "Hop to It": { spell: spell([], [fx.createTokens(RABBIT, 3)]) },
  "Intrepid Rabbit": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1",
      }),
    ],
  },
  "Jackdaw Savior": {
    abilities: [
      triggered(when.dies(FLYER_YOU), [fx.toBattlefield(ref.target())], {
        targets: [
          {
            ...target.cardInGraveyard("t", { types: ["Creature"] }, "you", "other creature card with lesser mana value"),
            // "Lesser" than that of the creature that died (which therefore can't be chosen), on targeting then on
            // resolution (608.2b).
            maxManaValueAmount: amount.plus(amount.manaValueOf(ref.eventObject), -1),
          },
        ],
        label: "Returns a creature with lesser MV",
      }),
    ],
  },
  "Jolly Gerbils": {
    abilities: [triggered(when.giveGift, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Lifecreed Duo": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)], { label: "+1 life" }),
    ],
  },
  "Mabel's Mettle": {
    spell: spell(
      [target.creature("t"), { ...target.upTo(1, target.creature("u")), otherThan: ["t"] }],
      [fx.pump(ref.target(), 2, 2), fx.pump(ref.target("u"), 1, 1)],
    ),
  },
  "Mouse Trapper": {
    abilities: [
      valiant([fx.tap(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Taps a creature",
      }),
    ],
  },
  "Nettle Guard": {
    abilities: [
      valiant([fx.pump(ref.self, 0, 2)], { label: "+0/+2" }),
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy an artifact or enchantment",
      }),
    ],
  },
  "Parting Gust": {
    spell: spell(
      [target.creature("t", { token: false })],
      [
        fx.exileCard(ref.target(), { name: "k" }),
        ...fx.when(
          cond.not(cond.gift),
          fx.delayed([fx.toBattlefield(ref.target("k"), { counters: { kind: "+1/+1", n: 1 } })], { k: ref.stored("k") }),
        ),
      ],
    ),
  },
  "Pileated Provisioner": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "creature without flying you control")],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Rabbit Response": {
    spell: spell(
      [],
      [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 1), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Rabbit" }), fx.scry(2))],
    ),
  },
  "Repel Calamity": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ minPower: 4 }, { minToughness: 4 }] },
          "creature with power or toughness 4 or greater",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Salvation Swan": {
    abilities: [
      triggered(
        when.enters(kin(["Bird"])),
        [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"), { counters: { kind: "flying", n: 1 } })], { k: ref.stored("k") }),
        ],
        {
          targets: [target.upTo(1, targetObj("t", NONFLYER_YOU, "creature without flying you control"))],
          label: "Exiles a creature (it returns with a flying counter)",
        },
      ),
    ],
  },
  "Season of the Burrow": {
    spell: pawprint(
      { pips: 1, label: "1/1 Rabbit", effects: [fx.createTokens(RABBIT)] },
      {
        pips: 2,
        label: "Exiles a nonland permanent (its controller draws)",
        targets: [target.nonland("t")],
        effects: [fx.draw(1, ref.controllerOf(ref.target())), fx.exile(ref.target())],
      },
      {
        pips: 3,
        label: "Returns a permanent with MV 3 or less (indestructible counter)",
        targets: [target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "permanent card with MV 3 or less")],
        effects: [fx.toBattlefield(ref.target(), { counters: { kind: "indestructible", n: 1 } })],
      },
    ),
  },
  "Seasoned Warrenguard": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0)], {
        condition: cond.controls({ token: true }),
        label: "+2/+0 (you control a token)",
      }),
    ],
  },
  "Sonar Strike": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }, { tapped: true }] },
          "attacking, blocking or tapped creature",
        ),
      ],
      [fx.damage(4, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Bat" }), fx.gainLife(3))],
    ),
  },
  "Star Charter": {
    abilities: [
      triggered(when.yourEndStep, [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 3 } })], {
        condition: GAINED_OR_LOST,
        label: "Looks at 4 cards: a creature with power 3 or less",
      }),
    ],
  },
  "Starfall Invocation": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Creature"] }, "d"),
        ...fx.when(
          cond.gift,
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield", underYourControl: true },
            { pool: ref.stored("d"), prompt: "Creature to return" },
          ),
        ),
      ],
    ),
  },
  "Thistledown Players": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target())], {
        targets: [target.nonland("t")],
        label: "Untaps a nonland permanent",
      }),
    ],
  },
  "Valley Questcaller": {
    abilities: [
      triggered(when.enters(kin(RABBIT_BAT_BIRD_MOUSE, { other: true })), [fx.scry(1)], { batched: true, label: "Scry 1" }),
      staticAbility(kin(RABBIT_BAT_BIRD_MOUSE, { other: true }), { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Warren Elder": {
    abilities: [activated({ mana: "{3}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Your creatures +1/+1" })],
  },
  "Warren Warleader": {
    abilities: [
      triggeredModal(when.attackWith(1), [
        mode("Rabbit tapped and attacking", [], [fx.createTappedTokens(RABBIT, 1, { attacking: true })]),
        mode("Attackers +1/+1", [], [fx.pumpAll({ types: ["Creature"], controller: "you", attacking: true }, 1, 1)]),
      ]),
    ],
  },
  "Wax-Wane Witness": {
    abilities: [triggered(when.lifeChange, [fx.pump(ref.self, 1, 0)], { condition: cond.yourTurn, label: "+1/+0" })],
  },
  "Whiskervale Forerunner": {
    // The chosen card stays on top of the library (the rest on the bottom); during your turn, you may put it onto the
    // battlefield; otherwise, it goes into your hand.
    abilities: [
      valiant(
        [
          fx.lookAtTop(5, {
            filter: { types: ["Creature"], maxManaValue: 3 },
            to: { to: "libraryTop" },
            rest: "bottom",
            store: "w",
          }),
          ...fx.when(
            cond.all(cond.yourTurn, cond.v("w")),
            fx.mayForStore(ref.you, "Put the creature onto the battlefield?", "bf", fx.toBattlefield(ref.stored("w"))),
          ),
          ...fx.when(cond.not(cond.v("bf")), fx.toHand(ref.stored("w"))),
        ],
        { label: "Looks at 5 cards: a creature with MV 3 or less" },
      ),
    ],
  },
};
