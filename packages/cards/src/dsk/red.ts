/** Duskmourn — red cards. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ENCHANTMENT,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  eerie,
  fx,
  GREMLIN,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Betrayer's Bargain": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ENCHANTMENT, count: 1, orPay: cost("{2}") } },
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },
  "Boilerbilges Ripper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ENCHANTMENT, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(2, ref.target())])),
        ],
        { label: "Sacrifice a creature or enchantment: 2 damage" },
      ),
    ],
  },
  Chainsaw: {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "3 damage to a creature",
      }),
      triggered(when.dies({ types: ["Creature"] }), [fx.counters(ref.self, "rev", 1)], {
        batched: true,
        label: "Rev counter",
      }),
      staticAbility("attached", { power: 1 }, { perCounter: "rev", label: "+X/+0 (rev counters)" }),
    ],
  },
  "Clockwork Percussionist": {
    abilities: [triggered(when.diesSelf, [fx.impulse(1, "yourNextTurn")], { label: "Exile the top card, playable" })],
  },
  "Diversion Specialist": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.impulse(1)],
        label: "Exile the top card, playable this turn",
      }),
    ],
  },
  "Fear of Being Hunted": { keywords: ["mustBeBlocked"] },
  "Fear of Burning Alive": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.eachOpponent)], { label: "4 damage to each opponent" }),
      triggered(
        when.dealsDamage({}, { noncombatOnly: true, to: { players: "opponent" }, anySourceYouControl: true }),
        [fx.damage(amount.eventAmount, ref.target())],
        {
          condition: cond.delirium,
          targets: [target.of(ref.eventPlayer, target.creature("t"), "creature that player controls")],
          label: "Delirium — that much damage to one of their creatures",
        },
      ),
    ],
  },
  "Fear of Missing Out": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1), fx.draw(1)], { label: "Discard a card, then draw" }),
      // "Attacks for the first time each turn": the first attack is recorded even without delirium.
      triggered(when.attacksSelf, [fx.untap(ref.target()), fx.extraCombat], {
        condition: cond.delirium,
        oncePerTurn: "firstEvent",
        targets: [target.creature()],
        label: "Delirium — untap a creature, additional combat phase",
      }),
    ],
  },
  Glassworks: {
    abilities: [
      triggered(when.unlockThisDoor, [fx.damage(4, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "4 damage to a creature an opponent controls",
      }),
    ],
  },
  "Shattered Yard": {
    abilities: [triggered(when.yourEndStep, [fx.damage(1, ref.eachOpponent)], { label: "1 damage to each opponent" })],
  },
  "Hand That Feeds": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0, ["menace"])], {
        condition: cond.delirium,
        label: "Delirium — +2/+0 and menace",
      }),
    ],
  },
  "Impossible Inferno": {
    spell: spell([target.creature()], [fx.damage(6, ref.target()), ...fx.when(cond.delirium, fx.impulse(1, "yourNextTurn"))]),
  },
  "Infernal Phantom": {
    abilities: [
      eerie([fx.pump(ref.self, 2, 0)], { label: "+2/+0" }),
      triggered(when.diesSelf, [fx.damage(amount.powerOf(ref.self), ref.target())], {
        targets: [target.any()],
        label: "Damage equal to its power",
      }),
    ],
  },
  "Irreverent Gremlin": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }),
        // "Do this only once each turn": only if a card was discarded.
        fx.may(
          "Discard a card to draw?",
          fx.discard(1, ref.you, { store: "d" }),
          fx.when(cond.v("d"), fx.draw(1), fx.doneOncePerTurn),
        ),
        { oncePerTurn: "ifDone", label: "Discard, then draw a card" },
      ),
    ],
  },
  "Most Valuable Slayer": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 1, 0, ["firstStrike"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "+1/+0 and first strike",
      }),
    ],
  },
  "Painter's Studio": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.exileTop(ref.you, 2, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })], {
        label: "Exile the top two cards, playable",
      }),
    ],
  },
  "Defaced Gallery": {
    abilities: [
      triggered(when.attackWith(), [fx.pumpAll({ ...CREATURE_YOU_CONTROL, attacking: true }, 1, 0)], {
        label: "Your attackers +1/+0",
      }),
    ],
  },
  "Piggy Bank": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Treasure token" })],
  },
  Pyroclasm: { spell: spell([], [fx.damageAll(2, { types: ["Creature"] })]) },
  "Ragged Playmate": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "A creature with power 2 or less can't be blocked",
      }),
    ],
  },
  "Rampaging Soulrager": {
    abilities: [
      staticAbility(
        "self",
        { power: 3 },
        {
          condition: cond.amountAtLeast(amount.unlockedDoors, 2),
          label: "+3/+0 (two unlocked doors)",
        },
      ),
    ],
  },
  "Razorkin Hordecaller": {
    abilities: [triggered(when.attackWith(), [fx.createTokens(GREMLIN)], { label: "1/1 Gremlin token" })],
  },
  "Razorkin Needlehead": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike during your turn" },
      ),
      triggered(when.draw(undefined, "opponent"), [fx.damage(1, ref.eventPlayer)], { label: "1 damage to the player who draws" }),
    ],
  },
  "Ripchain Razorkin": {
    abilities: [
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.draw(1)],
        label: "Sacrifice a land: draw a card",
      }),
    ],
  },
  "Ticket Booth": {
    abilities: [triggered(when.unlockThisDoor, [fx.manifestDread], { label: "Manifest dread" })],
  },
  "Tunnel of Hate": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 0, 0, ["doubleStrike"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "Double strike",
      }),
    ],
  },
  "Untimely Malfunction": {
    spell: modal(
      mode("Destroy one artifact", [target.permanent("a", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target("a"))]),
      mode("Change the target of a spell or ability", [target.stackItemSingleTarget("s")], [fx.changeTarget(ref.target("s"))]),
      mode(
        "One or two creatures can't block",
        [target.between(1, 2, target.creature("c"))],
        [fx.pump(ref.target("c"), 0, 0, ["cantBlock"])],
      ),
    ),
  },
  "Vengeful Possession": {
    spell: spell(
      [target.creature()],
      [
        fx.gainControl(ref.target()),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
        ...fx.may("Discard a card to draw?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
      ],
    ),
  },
  "Vicious Clown": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }), [fx.pump(ref.self, 2, 0)], {
        label: "+2/+0",
      }),
    ],
  },
  "Violent Urge": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 1, 0, ["firstStrike"]), ...fx.when(cond.delirium, fx.pump(ref.target(), 0, 0, ["doubleStrike"]))],
    ),
  },
};
