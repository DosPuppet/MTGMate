/** Tarkir: Dragonstorm — multicolored cards (except legendaries and unique cards, in legends.ts). */
import type { Effect } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  DRAGON,
  ELEPHANT_5,
  entersWith,
  flurry,
  fx,
  GOBLIN,
  mode,
  playerStatic,
  ref,
  renew,
  SPIRIT_W,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** "When you next cast a spell this turn, copy it" (Flamehold Grappler). */
const COPY_NEXT_SPELL: Effect = { op: "playerEffect", ability: { nextSpell: { copy: true } }, once: true };

export const MULTI: Record<string, CardScript> = {
  "Auroral Procession": { spell: spell([target.cardInGraveyard()], [fx.toHand(ref.target())]) },
  "Awaken the Honored Dead": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], { targets: [target.nonland()], label: "Destroy a nonland permanent" }),
      chapter([2], [fx.mill(3)], { label: "Mill three cards" }),
      chapter(
        [3],
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
                  "you",
                  "creature or land card in your graveyard",
                ),
              ],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Discard a card: a creature or a land returns to hand" },
      ),
    ],
  },
  "Bone-Cairn Butcher": {
    // Mobilize 2: read from the text.
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, attacking: true, controller: "you" },
        { addKeywords: ["deathtouch"] },
        { label: "Your attacking tokens have deathtouch" },
      ),
    ],
  },
  "Death Begets Life": {
    spell: spell(
      [],
      [fx.destroyAll({ anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] }, "d"), fx.draw(amount.v("d"))],
    ),
  },
  "Defibrillating Current": {
    spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target()), fx.gainLife(2)]),
  },
  "Dragonback Assault": {
    abilities: [
      triggered(when.entersSelf, [fx.damageAll(3, { types: ["Creature", "Planeswalker"] })], {
        label: "3 damage to each creature and each planeswalker",
      }),
      triggered(when.landfall, [fx.createTokens(DRAGON)], { label: "Landfall: a 4/4 flying Dragon" }),
    ],
  },
  "Dragonclaw Strike": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.doublePT(ref.target("a")), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Effortless Master": {
    abilities: [
      entersWith({
        counters: 2,
        condition: cond.castThisTurn(2),
        label: "Two spells cast this turn: enters with two +1/+1 counters",
      }),
    ],
  },
  "Fangkeeper's Familiar": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Gain 3 life, surveil 3", [], [fx.gainLife(3), fx.surveil(3)]),
        mode("Destroy an enchantment", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
        mode(
          "Counter a creature spell",
          [target.spell("s", { types: ["Creature"] }, "creature spell")],
          [fx.counter(ref.target("s"))],
        ),
      ]),
    ],
  },
  "Flamehold Grappler": {
    abilities: [triggered(when.entersSelf, [COPY_NEXT_SPELL], { label: "Copy the next spell cast this turn" })],
  },
  "Glacial Dragonhunt": {
    spell: spell(
      [],
      [
        fx.draw(1),
        fx.discard(1, ref.you, { optional: true, store: "d", storeFilter: { notTypes: ["Land"] } }),
        ...fx.when(cond.v("d"), fx.reflexive([target.creature()], [fx.damage(3, ref.target())])),
      ],
    ),
  },
  "Gurmag Nightwatch": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        label: "Look at three cards: one may stay on top, the rest into the graveyard",
      }),
    ],
  },
  "Hardened Tactician": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifice a token: draw a card",
      }),
    ],
  },
  "Host of the Hereafter": {
    abilities: [
      entersWith({ counters: 2, label: "Enters with two +1/+1 counters" }),
      // "if it had counters on it": in the filter (last known information).
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "any" }), [fx.lkiCountersTo(ref.target())], {
        targets: [target.optional(target.creature("t", { controller: "you" }))],
        label: "A creature of yours with counters dies: its counters go on one of your creatures",
      }),
    ],
  },
  "Jeskai Shrinekeeper": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.gainLife(1), fx.draw(1)], { label: "Gain 1 life, draw a card" })],
  },
  "Karakyk Guardian": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.not(cond.sourceDealtDamage), label: "Hexproof as long as it hasn't dealt damage" },
      ),
    ],
  },
  "Kin-Tree Severance": {
    spell: spell([targetObj("t", { minManaValue: 3 }, "permanent with mana value 3 or greater")], [fx.exile(ref.target())]),
  },
  "Kishla Skimmer": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.draw(1)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "A card leaves your graveyard during your turn: draw (once per turn)",
      }),
    ],
  },
  "Lie in Wait": {
    // The damage (equal to the card's power) is dealt before the return to hand: same result.
    spell: spell(
      [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "creature card in your graveyard"), target.creature("d")],
      [fx.damage(amount.powerOf(ref.target("c")), ref.target("d")), fx.toHand(ref.target("c"))],
    ),
  },
  "Lotuslight Dancers": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({ colors: ["B"] }, { to: "graveyard" }),
          fx.search({ colors: ["G"] }, { to: "graveyard" }),
          fx.search({ colors: ["U"] }, { to: "graveyard" }),
        ],
        { label: "A black, a green and a blue card into the graveyard" },
      ),
    ],
  },
  "Mammoth Bellow": { spell: spell([], [fx.createTokens(ELEPHANT_5)]) },
  "Marshal of the Lost": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.pump(
            ref.target(),
            amount.count({ types: ["Creature"], attacking: true }),
            amount.count({ types: ["Creature"], attacking: true }),
          ),
        ],
        { targets: [target.creature()], label: "A creature gets +X/+X (X: the attackers)" },
      ),
    ],
  },
  "Monastery Messenger": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.target(), { to: "libraryTop" })], {
        targets: [
          target.optional(target.cardInGraveyard("t", { notTypes: ["Land", "Creature"] }, "you", "noncreature, nonland card")),
        ],
        label: "A noncreature, nonland card from your graveyard on top of your library",
      }),
    ],
  },
  Perennation: {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
      [
        fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "hexproof", n: 1 } }, { name: "b" }),
        fx.counters(ref.stored("b"), "indestructible"),
      ],
    ),
  },
  "Rakshasa's Bargain": { spell: spell([], [fx.lookAtTop(4, { count: 2, rest: "graveyard", exact: true })]) },
  "Rediscover the Way": {
    abilities: [
      chapter([1, 2], [fx.lookAtTop(3, { count: 1, rest: "bottom", exact: true })], {
        label: "Look at three cards: one to hand",
      }),
      chapter(
        [3],
        [
          fx.emblem(
            "Rediscover the Way",
            "Whenever you cast a noncreature spell this turn, target creature you control gains double strike until end of turn.",
            [
              triggered(
                when.castSpell("you", { notTypes: ["Creature"] }),
                [fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })],
                {
                  targets: [target.creature("t", { controller: "you" })],
                  label: "One of your creatures gains double strike",
                },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "This turn, your noncreature spells grant double strike" },
      ),
    ],
  },
  "Reigning Victor": {
    // Mobilize 1: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature()],
        label: "A creature gets +1/+0 and indestructible",
      }),
    ],
  },
  "Reputable Merchant": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter on one of your creatures",
      }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter on one of your creatures",
      }),
    ],
  },
  "Revival of the Ancestors": {
    abilities: [
      chapter([1], [fx.createTokens(SPIRIT_W, 3)], { label: "Three 1/1 Spirits" }),
      chapter([2], [fx.countersDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.creature("t", { controller: "you" }))],
        label: "Distribute three +1/+1 counters",
      }),
      chapter([3], [fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["trample", "lifelink"] })], {
        label: "Your creatures gain trample and lifelink",
      }),
    ],
  },
  "Riverwheel Sweep": {
    spell: spell(
      [target.creature()],
      [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 3), fx.impulse(2, "yourNextTurn")],
    ),
  },
  "Severance Priest": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.target(), { notTypes: ["Land"] }, false, undefined, true)], {
        targets: [target.player("t", "opponent")],
        label: "Exile a nonland card from an opponent's hand",
      }),
      triggered(
        when.leavesSelf,
        [
          {
            op: "createTokens",
            token: SPIRIT_W,
            count: 1,
            pt: amount.manaValueOf(ref.linked),
            for: ref.ownerOf(ref.linked),
          },
        ],
        { label: "The owner of the exiled card creates an X/X Spirit" },
      ),
    ],
  },
  "Skirmish Rhino": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Each opponent loses 2 life, you gain 2" })],
  },
  "Sonic Shrieker": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target()), fx.gainLife(2), fx.discard(1, ref.target())], {
        targets: [target.any()],
        label: "2 damage, gain 2 life; a damaged player discards a card",
      }),
    ],
  },
  "Temur Battlecrier": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 0,
        genericAmount: amount.count({ types: ["Creature"], controller: "you", minPower: 4 }),
        condition: cond.yourTurn,
        label: "During your turn, your spells cost {1} less for each creature with power 4 or greater",
      },
    ],
  },
  "Temur Tawnyback": { abilities: [triggered(when.entersSelf, fx.loot(1), { label: "Draw, and then discard" })] },
  "Thunder of Unity": {
    abilities: [
      chapter([1], [fx.draw(2), fx.loseLife(2)], { label: "Draw two cards, lose 2 life" }),
      chapter(
        [2, 3],
        [
          fx.emblem(
            "Thunder of Unity",
            "Whenever a creature you control enters this turn, each opponent loses 1 life and you gain 1 life.",
            [
              triggered(when.enters(CREATURE_YOU_CONTROL), fx.drain(1), {
                label: "Each opponent loses 1 life, you gain 1",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "This turn, your creatures that enter drain 1 life" },
      ),
    ],
  },
  "Yathan Roadwatcher": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4),
          fx.reflexive(
            [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less")],
            [fx.toBattlefield(ref.target())],
          ),
        ],
        { condition: cond.wasCast, label: "Mill four cards: a creature with MV 3 or less returns" },
      ),
    ],
  },

  // --- Batch B ----------------------------------------------------------------
  "Armament Dragon": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.creature("t", { controller: "you" }))],
        label: "Distribute three +1/+1 counters among your creatures",
      }),
    ],
  },
  "Barrensteppe Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Abzan", "Mardu"] })],
    abilities: [
      triggered(when.yourEndStep, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        condition: cond.chosenMode("Abzan"),
        label: "Abzan — a +1/+1 counter on each creature you control",
      }),
      triggered(when.yourEndStep, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        condition: cond.all(cond.chosenMode("Mardu"), cond.amountAtLeast(amount.yourCreaturesDiedThisTurn, 1)),
        label: "Mardu — a creature of yours died this turn: each opponent sacrifices a creature",
      }),
    ],
  },
  "Frostcliff Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Jeskai", "Temur"] })],
    abilities: [
      triggered(when.combatDamageBatch(CREATURE_YOU_CONTROL), [fx.draw(1)], {
        condition: cond.chosenMode("Jeskai"),
        label: "Jeskai — your creatures damage a player: draw a card",
      }),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 1, addKeywords: ["trample", "haste"] },
        { condition: cond.chosenMode("Temur"), label: "Temur — your creatures: +1/+0, trample and haste" },
      ),
    ],
  },
  "Glacierwood Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Temur", "Sultai"] })],
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.mill(4, ref.target())], {
        targets: [target.player()],
        condition: cond.chosenMode("Temur"),
        label: "Temur — instant or sorcery: a player mills four cards",
      }),
      playerStatic({
        playFrom: { zone: "graveyard", what: "lands" },
        condition: cond.chosenMode("Sultai"),
        label: "Sultai — you may play lands from your graveyard",
      }),
    ],
  },
  "Hollowmurk Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Sultai", "Abzan"] })],
    abilities: [
      triggered(when.countersPut(CREATURE_YOU_CONTROL), [fx.draw(1)], {
        condition: cond.chosenMode("Sultai"),
        oncePerTurn: true,
        label: "Sultai — a counter is put on one of your creatures: draw (once per turn)",
      }),
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["menace"] })], {
        targets: [target.creature("t", { attacking: true })],
        condition: cond.chosenMode("Abzan"),
        label: "Abzan — +1/+1 counter and menace on an attacking creature",
      }),
    ],
  },
  "Windcrag Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Mardu", "Jeskai"] })],
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "attack" },
        condition: cond.chosenMode("Mardu"),
        label: "Mardu — an attacking creature triggers your abilities an additional time",
      }),
      triggered(
        when.yourUpkeep,
        [fx.createTokens(GOBLIN, 1, undefined, "g"), fx.modify(ref.stored("g"), { addKeywords: ["lifelink", "haste"] })],
        { condition: cond.chosenMode("Jeskai"), label: "Jeskai — a 1/1 Goblin with lifelink and haste this turn" },
      ),
    ],
  },
  "Cori Mountain Stalwart": {
    abilities: [flurry([fx.damage(2, ref.eachOpponent), fx.gainLife(2)], "2 damage to each opponent, gain 2 life")],
  },
  "Kheru Goldkeeper": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(TREASURE)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Cards leave your graveyard during your turn: a Treasure",
      }),
      renew(
        "{2}{B}{G}{U}",
        [target.creature()],
        [fx.addCounters(ref.target(), 2), fx.counters(ref.target(), "flying")],
        "two +1/+1 counters and a flying counter",
      ),
    ],
  },
};
