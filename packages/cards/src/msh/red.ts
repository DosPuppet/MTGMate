/** Marvel Super Heroes — red cards. */
import {
  activated,
  amount,
  block,
  bothIfKicked,
  type CardScript,
  cmp,
  cond,
  costReducer,
  eventReplacement,
  fx,
  mode,
  oneOrMore,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VILLAIN,
  when,
} from "./common";

/** "You may sacrifice an artifact or discard a card. If you do, draw N cards." */
const sacrificeOrDiscardToDraw = (n: number) => [
  fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
  ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.draw(n)),
];

/** "Any other target" (an ability of the source that can't target it). */
const anyOtherTarget = (id = "t") => {
  const t = target.any(id);
  return {
    ...t,
    label: "any other target",
    filter: { ...t.filter, objects: { ...t.filter.objects, other: true } },
  };
};

/** Hawkeye's three arrows. */
const TRICK_ARROWS = [
  {
    label: "Net — target creature can't block this turn",
    targets: [target.creature("c")],
    effects: [fx.modify(ref.target("c"), { addKeywords: ["cantBlock"] })],
  },
  { label: "Explosive — 2 damage to target player", targets: [target.player("p")], effects: [fx.damage(2, ref.target("p"))] },
  { label: "Boomerang — discard a card, then draw a card", effects: [fx.discard(1), fx.draw(1)] },
];

/** When exactly `k` was paid: a reflexive ability offering the combinations of at most `k` of the modes. */
const upToModes = (k: number, modes: typeof TRICK_ARROWS) => {
  const sizeOf = (mask: number) => [...mask.toString(2)].filter((b) => b === "1").length;
  // `oneOrMore` lists the combinations by mask, from 1 up.
  const combos = oneOrMore(...modes).filter((_, i) => sizeOf(i + 1) <= k);
  const paid = cond.all(cond.amountAtLeast(amount.v("x"), k), cond.not(cond.amountAtLeast(amount.v("x"), k + 1)));
  return fx.when(paid, fx.reflexiveModal(combos));
};
export const RED: Record<string, CardScript> = {
  // Prowess: read from the text.
  "Crimson Operative": {
    abilities: [
      triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], {
        label: "Exiles the top card, playable until the end of your next turn",
      }),
    ],
  },
  "Death to Our Enemies": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.createTappedTokens(TREASURE), fx.counters(ref.self, "plan")],
        { label: "A tapped Treasure and a plan counter" },
      ),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.between(1, 2, target.any())], [fx.damageDivided(7, ref.target())])),
        ],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Fourth counter: sacrifice it, 7 damage divided between one or two targets",
        },
      ),
    ],
  },
  "Fin Fang Foom": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Instant", "Sorcery"] }, { objects: { types: ["Artifact", "Land"] } }),
        [fx.copySpell(ref.eventObject, 1), fx.addCounters(ref.self, 2)],
        { label: "Copy the spell, two +1/+1 counters" },
      ),
    ],
  },
  /**
   * "You may pay {1} up to three times. When you do, choose up to that many —": one payment of X (at most 3), then one
   * reflexive ability whose modes are the combinations of at most X of the three (PLAN-L L5).
   */
  "Hawkeye, Master Marksman": {
    abilities: [
      triggered(
        when.tapsSelf,
        [fx.payX("Pay {1} up to three times?", "x", 3), ...[1, 2, 3].flatMap((k) => upToModes(k, TRICK_ARROWS))],
        { label: "Trick Arrows" },
      ),
    ],
  },
  "Hawkeye's Bow": {
    // Equip {1}: read from the text.
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["reach"] }, { label: "+1/+0 and reach" }),
      triggered({ on: "taps", who: { attached: "host" } }, [fx.damage(1, ref.eachOpponent, ref.eventObject)], {
        label: "Equipped creature deals 1 damage to each opponent",
      }),
    ],
  },
  "Hex Magic": {
    spell: spell(
      [],
      [
        fx.moveAll("hand", ref.you, {}, { to: "exile" }, "h"),
        fx.draw(amount.refCount(ref.stored("h"))),
        fx.grantPlay(ref.stored("h"), { untilYourNextTurn: true }),
      ],
    ),
  },
  "Hire a Crew": {
    spell: spell([], [fx.createTokens(VILLAIN), fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 0)]),
  },
  // Teamwork 4: read from the text (`cond.kicked`).
  "HULK SMASH!": {
    spell: bothIfKicked(
      mode(
        "Destroys a noncreature artifact",
        [target.permanent("a", ["Artifact"], { notTypes: ["Creature"] })],
        [fx.destroy(ref.target("a"))],
      ),
      mode(
        "Your creature deals damage equal to its power",
        [target.creature("c", { controller: "you" }), target.creature("o", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("c")), ref.target("o"), ref.target("c"))],
      ),
      "Both (teamwork)",
    ),
  },
  "Human Torch, Johnny Storm": {
    abilities: [
      triggered(when.draw(), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        condition: cond.controls({ subtype: "Hero", other: true }),
        label: "With another Hero: 1 damage to an opponent",
      }),
      activated({
        mana: "{6}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 3)],
        label: "Power-up: three +1/+1 counters",
      }),
    ],
  },
  "HYDRA Assault Robot": {
    abilities: [
      triggered(
        when.enters({ controller: "you", other: true, anyOf: [{ subtype: "Villain" }, { types: ["Artifact"] }] }),
        [fx.damage(1, ref.target())],
        { targets: [target.player("t", "opponent")], label: "1 damage to an opponent" },
      ),
    ],
  },
  "Iron Fist, Living Weapon": {
    abilities: [
      triggered(
        when.castSpell("you", undefined, { objects: { types: ["Creature"], controller: "you" } }),
        [
          fx.modify(ref.self, {
            addAbilities: [
              activated({
                tap: true,
                targets: [anyOtherTarget()],
                effects: [fx.damage(amount.powerOf(ref.self), ref.target())],
                label: "Damage equal to its power to another target",
              }),
            ],
          }),
        ],
        { label: 'Gains "{T}: damage equal to its power"' },
      ),
    ],
  },
  "Jessica Jones, Private Eye": {
    abilities: [
      activated({
        tap: true,
        addCounters: { kind: "stun", n: 1 },
        effects: [fx.exileTop(ref.you, amount.powerOf(ref.self), "j"), fx.grantPlay(ref.stored("j"))],
        label: "Exile the top X cards, playable this turn",
      }),
    ],
  },
  "K'un-Lun Warrior": {
    abilities: [
      triggered(when.entersSelf, sacrificeOrDiscardToDraw(1), {
        label: "Sacrifice an artifact or discard a card: draw",
      }),
    ],
  },
  "Machinesmith Automaton": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "A +1/+1 counter",
      }),
    ],
  },
  "Misty Knight, Hero for Hire": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        discard: 1,
        effects: [fx.draw(amount.cardsDiscardedThisTurn)],
        label: "Draw a card for each card discarded this turn",
      }),
    ],
  },
  "Photon Blast Barrage": {
    spell: spell([target.creature()], [fx.damage(1, ref.target())]),
    abilities: [triggered(when.castSelf, [fx.copySpell(ref.self, amount.eventX)], { label: "Copy this spell X times" })],
  },
  // Haste: read from the text.
  "Quicksilver, Brash Blur": {
    leyline: true,
    abilities: [
      activated({
        mana: "{4}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.counters(ref.self, "doubleStrike")],
        label: "Power-up: a +1/+1 counter and a double strike counter",
      }),
    ],
  },
  // Reach, trample: read from the text.
  "Red Hulk": {
    abilities: [
      triggered(
        when.isDealtDamage,
        [fx.addCounters(ref.self, 1), fx.reflexive([anyOtherTarget()], [fx.damage(amount.countersOn(ref.self), ref.target())])],
        { label: "Enrage: a +1/+1 counter, then as much damage as counters" },
      ),
    ],
  },
  // Teamwork 2: read from the text.
  "Repulsor Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(5, ref.target()), ...fx.when(cond.kicked, fx.damage(2, ref.controllerOf(ref.target())))],
    ),
  },
  "The Scarlet Witch": {
    abilities: [
      costReducer(
        { types: ["Instant", "Sorcery"], minManaValue: 4 },
        0,
        "Instants and sorceries with mana value 4 or greater cost {X} less (X: its power)",
        { genericAmount: amount.powerOf(ref.self) },
      ),
    ],
  },
  // Haste: read from the text.
  "Speed, Young Avenger": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.mayPay(
          "{1}",
          "Pay {1}: a creature with haste can't be blocked except by creatures with haste?",
          fx.reflexive(
            [{ ...target.creature("t", { keyword: "haste" }), label: "creature with haste" }],
            [
              fx.modify(ref.target(), {
                addBlockRules: [block.notBy({ not: { keyword: "haste" } }, "Can't be blocked except by creatures with haste")],
              }),
            ],
          ),
        ),
        { label: "Pay {1}: can't be blocked except by creatures with haste" },
      ),
    ],
  },
  "Stark Industries Executive": {
    abilities: [activated({ mana: "{2}", tap: true, effects: [fx.createTokens(TREASURE)], label: "A Treasure" })],
  },
  // Flash: read from the text.
  "Super Speed": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["firstStrike"] })], {
        label: "Enchanted creature gains first strike until end of turn",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["haste"] }, { label: "+1/+0 and haste" }),
    ],
  },
  // Teamwork 1: read from the text.
  "Team Tactics": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), { addKeywords: ["doubleStrike"] }),
        ...fx.when(cond.kicked, fx.modify(ref.target(), { addKeywords: ["trample"] })),
      ],
    ),
  },
  "Truck Toss": {
    costReduction: { generic: 2, condition: cond.controls({ subtype: "Vehicle" }) },
    spell: spell([target.any()], [fx.damage(4, ref.target())]),
  },
  "Vision of Love": { spell: spell([], sacrificeOrDiscardToDraw(2)) },
  // Haste: read from the text.
  "Volcanic Villain": {
    abilities: [
      activated({
        mana: "{5}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Power-up: two +1/+1 counters",
      }),
    ],
  },
  // Flying: read from the text.
  "Wonder Man, Hollywood Hero": {
    abilities: [
      playerStatic({ powerUpExtraUses: 1, label: "Your power-up abilities can be activated one more time" }),
      activated({
        mana: "{5}{R}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Power-up: two +1/+1 counters",
      }),
    ],
  },
  // Reach: read from the text.
  "Hawkeye, Young Avenger": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        combat: false,
        modify: { add: amount.powerOf(ref.self) },
        label: "Sources you control deal that much more noncombat damage as its power",
      }),
    ],
  },
  "Evil's Thrall": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(
          cond.amountGreater(amount.maxManaValue({ subtype: "Villain", controller: "you" }), amount.manaValueOf(ref.target())),
          fx.gainControl(ref.target(), { untilEndOfYourNextTurn: true }),
        ),
        ...fx.when(
          cond.not(
            cond.amountGreater(amount.maxManaValue({ subtype: "Villain", controller: "you" }), amount.manaValueOf(ref.target())),
          ),
          fx.gainControl(ref.target()),
        ),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
      ],
    ),
  },
  "Loki Laufeyson": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [
          {
            op: "playerEffect",
            ability: {
              nextSpell: {
                filter: { types: ["Instant", "Sorcery"], compare: [cmp.manaValue("<=", amount.sourcePower)] },
                copy: true,
              },
            },
            once: true,
          },
        ],
        label: "Your next instant or sorcery with mana value at most its power this turn is copied",
      }),
      activated({
        mana: "{4}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Power-up: two +1/+1 counters",
      }),
    ],
  },
};
