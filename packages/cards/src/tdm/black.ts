/** Tarkir: Dragonstorm — black cards. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  fx,
  modal,
  mode,
  ref,
  renew,
  spell,
  target,
  triggered,
  WARRIOR_R,
  when,
  ZOMBIE_DRUID,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Abzan Devotee": {
    abilities: [
      devotee(["W", "B", "G"]),
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from your graveyard to your hand",
      }),
    ],
  },
  "Aggressive Negotiations": {
    spell: spell(
      [target.player("p", "opponent"), target.optional(target.creature("c", { controller: "you" }))],
      [
        fx.discard(1, ref.target("p"), { chooser: "controller", filter: { notTypes: ["Land"] }, exile: true }),
        fx.addCounters(ref.target("c"), 1),
      ],
    ),
  },
  "Alesha's Legacy": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { addKeywords: ["deathtouch", "indestructible"] })],
    ),
  },
  "Avenger of the Fallen": {
    // Mobilize X: X is the number of creature cards in your graveyard.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.createTappedTokens(WARRIOR_R, amount.countIn("graveyard", { types: ["Creature"] }), {
            attacking: true,
            store: "mob",
          }),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("mob") }),
        ],
        { label: "Mobilize X (creature cards in your graveyard)" },
      ),
    ],
  },
  "Caustic Exhale": {
    // "As an additional cost, behold a Dragon or pay {1}".
    additionalCost: { behold: { filter: DRAGON_CARD, orPay: { generic: 1, colored: {}, x: 0 } } },
    spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3)]),
  },
  "Corroding Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(2), fx.surveil(2)], {
        label: "Each opponent loses 2 life, you gain 2; surveil 2",
      }),
      dragonstorm(),
    ],
  },
  "Cruel Truths": { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Delta Bloodflies": {
    abilities: [
      triggered(when.attacksSelf, [fx.loseLife(1, ref.eachOpponent)], {
        condition: cond.controls(CREATURE_WITH_COUNTER),
        label: "One of your creatures has a counter: each opponent loses 1 life",
      }),
    ],
  },
  "Desperate Measures": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 1, -1),
        fx.whenThisTurn(when.dies({ controller: "you" }), ref.target(), [fx.draw(2)], { label: "Draw two cards" }),
      ],
    ),
  },
  "Dragon's Prey": {
    costReduction: { generic: -2, condition: cond.targetMatches("t", { subtype: "Dragon" }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Gurmag Rakshasa": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target("a"), -2, -2), fx.pump(ref.target("b"), 2, 2)], {
        targets: [target.creature("a", { controller: "opponent" }), target.creature("b", { controller: "you" })],
        label: "An opponent's creature gets -2/-2, one of yours +2/+2",
      }),
    ],
  },
  "Nightblade Brigade": { abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" })] },
  "Salt Road Skirmish": {
    spell: spell(
      [target.creature()],
      [
        fx.destroy(ref.target()),
        fx.createTokens(WARRIOR_R, 2, undefined, "w"),
        fx.modify(ref.stored("w"), { addKeywords: ["haste"] }),
        fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("w") }),
      ],
    ),
  },
  "Unburied Earthcarver": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifice another creature: +1/+1 counter",
      }),
    ],
  },
  "Unrooted Ancestor": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] }), fx.tap(ref.self)],
        label: "Sacrifice another creature: indestructible, tap it",
      }),
    ],
  },
  "Venerated Stormsinger": {
    // Mobilize 1: read from the text.
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1), {
        label: "One of your creatures dies: each opponent loses 1 life, you gain 1",
      }),
    ],
  },
  "Wail of War": {
    spell: modal(
      mode(
        "An opponent's creatures get -1/-1",
        [target.player("p", "opponent")],
        [fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), -1, -1)],
      ),
      mode(
        "Up to two creature cards return to hand",
        [target.upTo(2, target.cardInGraveyard("g", { types: ["Creature"] }, "you", "creature card in your graveyard"))],
        [fx.toHand(ref.target("g"))],
      ),
    ),
  },
  "Worthy Cost": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exile(ref.target())]),
  },
  "Yathan Tombguard": {
    abilities: [
      triggered(when.combatDamage(CREATURE_WITH_COUNTER, true), [fx.draw(1), fx.loseLife(1)], {
        label: "One of your creatures with a counter damages a player: draw, lose 1 life",
      }),
    ],
  },

  // --- Batch B ----------------------------------------------------------------
  "Adorned Crocodile": {
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(ZOMBIE_DRUID)], { label: "A 2/2 Zombie Druid" }),
      renew("{B}", [target.creature()], [fx.addCounters(ref.target(), 1)], "+1/+1 counter on a creature"),
    ],
  },
  "Alchemist's Assistant": {
    abilities: [renew("{1}{B}", [target.creature()], [fx.counters(ref.target(), "lifelink")], "lifelink counter on a creature")],
  },
  "Feral Deathgorger": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exile up to two cards from a single graveyard",
      }),
    ],
  },
  "Dusk Sight": {
    spell: spell([target.optional(target.creature())], [fx.addCounters(ref.target(), 1), fx.draw(1)]),
  },
  "Kin-Tree Nurturer": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 1)], { label: "Endure 1" })] },
  "Sandskitter Outrider": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 2)], { label: "Endure 2" })] },
  "Exude Toxin": {
    spell: spell([], [fx.pumpAll({ types: ["Creature"], notSubtype: "Dragon" }, amount.neg(amount.x), amount.neg(amount.x))]),
  },
  "Sinkhole Surveyor": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1), fx.endure(ref.self, 1)], { label: "Lose 1 life; endure 1" })],
  },
  "Purging Stormbrood": {
    abilities: [
      triggered(when.entersSelf, [fx.removeCounters(ref.target(), 1000)], {
        targets: [target.optional(target.creature())],
        label: "Remove all the counters from a creature",
      }),
    ],
  },
  "Absorb Essence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["lifelink", "hexproof"])]),
  },
};
