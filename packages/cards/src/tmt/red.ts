/** Teenage Mutant Ninja Turtles — red cards (lot A). */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  FOOD_ABILITY,
  fx,
  MUTANT,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT_1,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Alliance: "whenever another creature you control enters". */
const ALLIANCE = when.enters(OTHER_CREATURE_YOU_CONTROL);

/** The artifacts your opponents control (Broadcast Takeover). */
const OPPONENT_ARTIFACTS = ref.permanentsOf(ref.eachOpponent, { types: ["Artifact"] });

export const RED: Record<string, CardScript> = {
  "Bot Bashing Time": {
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(6, ref.target())]),
  },
  "Broadcast Takeover": {
    // Untapped and given haste before the change of control: the result is the same as in the printed order.
    spell: spell(
      [],
      [
        fx.untap(OPPONENT_ARTIFACTS),
        fx.modify(OPPONENT_ARTIFACTS, { addKeywords: ["haste"] }),
        fx.gainControl(OPPONENT_ARTIFACTS),
      ],
    ),
  },
  // Haste: read from the text.
  "Casey Jones, Jury-Rig Justiciar": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: { types: ["Artifact"] }, rest: "bottom" })], {
        label: "Look at the top four cards: an artifact to your hand",
      }),
    ],
  },
  // Trample: read from the text.
  "General Traag, Heart of Stone": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Artifact"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.creature()], [fx.damage(4, ref.target())])),
        ],
        { label: "Sacrifice another artifact: 4 damage to a creature" },
      ),
    ],
  },
  // Equip {2}: read from the text.
  "Hard-Won Jitte": {
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double strike" })],
  },
  // Equip {R}: read from the text.
  "Improvised Arsenal": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1 },
        { per: { types: ["Artifact"], controller: "you" }, label: "+1/+0 for each artifact you control" },
      ),
      activated({ mana: "{4}{R}", effects: [fx.copyToken(ref.self)], label: "A token copy of this Equipment" }),
    ],
  },
  // Sneak {R}: read from the text.
  "Jennika's Technique": {
    spell: spell([], [fx.damageAll(2, { types: ["Creature"] })]),
  },
  "Manhole Missile": {
    spell: spell(
      [target.creature()],
      [
        fx.damage(3, ref.target()),
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryBottom" },
          { min: 0, store: "b", prompt: "A card from your hand on the bottom of your library (then draw)" },
        ),
        ...fx.when(cond.v("b"), fx.draw(1)),
      ],
    ),
  },
  "Mouser Attack!": {
    spell: modal(
      mode("A 1/1 Robot token", [], [fx.createTokens(ROBOT_1)]),
      mode("+3/+0 and first strike", [target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"])]),
    ),
  },
  "Mouser Foundry": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "A 1/1 Robot token" }),
      triggered(when.leavesSelf, [fx.createTokens(ROBOT_1)], { label: "A 1/1 Robot token" }),
      activated({
        mana: "{4}{R}",
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(3, ref.target())],
        label: "3 damage to a creature",
      }),
    ],
  },
  // Trample: read from the text.
  "Mutant Town Musicians": {
    abilities: [triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance: +1/+0" })],
  },
  "Null Group Biological Assets": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Has first strike during your turn" },
      ),
      triggered(when.attacksSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Optional discard: draw",
      }),
    ],
  },
  "Old Hob, Alleycat Blues": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(MUTANT, 1, undefined, "m"),
          fx.modify(ref.stored("m"), { addKeywords: ["haste"] }),
          fx.delayed([fx.destroy(ref.target("m"))], { m: ref.stored("m") }),
        ],
        { label: "A 2/2 Mutant with haste, destroyed at the end step" },
      ),
      activated({
        mana: "{1}{W}",
        targets: [target.creature("t", { attacking: true, token: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "An attacking token gains indestructible",
      }),
    ],
  },
  "Purple Dragon Punks": {
    abilities: [manaAbility("R", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  },
  // Menace: read from the text.
  "Raphael, Most Attitude": {
    abilities: [
      triggered(ALLIANCE, fx.may("Exile the top card of your library?", fx.exileTop(ref.you, 1, "r"), fx.link(ref.stored("r"))), {
        label: "Alliance: exile the top card",
      }),
      triggered(when.attacksSelf, [fx.grantPlay(ref.linked, { oneOf: true })], {
        label: "You may play a card exiled with Raphael this turn",
      }),
    ],
  },
  "Raphael, Ninja Destroyer": {
    keywords: ["mustBeBlocked"],
    abilities: [
      triggered(when.isDealtDamage, [{ op: "addManaUntilEndOfTurn", mana: ["R"], times: amount.eventAmount }], {
        label: "Enrage: that much {R}, kept until end of turn",
      }),
    ],
  },
  // Sneak {1}{R}{R}: read from the text.
  "Raphael, the Nightwatcher": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", attacking: true },
        { addKeywords: ["doubleStrike"] },
        { label: "Attacking creatures you control have double strike" },
      ),
    ],
  },
  "Raphael, Tough Turtle": {
    abilities: [
      triggered(ALLIANCE, [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Alliance: 1 damage to an opponent",
      }),
    ],
  },
  // Sneak {2}{R}: read from the text.
  "Raphael's Technique": {
    spell: spell([], [fx.mayWheel]),
  },
  "Ravenous Robots": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Artifact"] }), [fx.createTokens(ROBOT_1)], {
        label: "A 1/1 Robot token",
      }),
      activated({
        mana: "{R}",
        tap: true,
        effects: [fx.modifyAll({ types: ["Creature"], token: true, controller: "you" }, { addKeywords: ["haste"] })],
        label: "Creature tokens you control gain haste",
      }),
    ],
  },
  "Rock Soldiers": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          target.optional(target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "noncreature artifact (up to one)")),
        ],
        label: "Destroys up to one noncreature artifact",
      }),
    ],
  },
  "Slash, Reptile Rampager": {
    abilities: [
      triggered(ALLIANCE, [fx.damage(2, ref.eachOpponent)], { label: "Alliance: 2 damage to each opponent" }),
      triggered(when.attacksSelf, [fx.createTokens(MUTANT)], { label: "A 2/2 Mutant token" }),
    ],
  },
  "Spicy Oatmeal Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.target()), fx.damage(3, ref.you)], {
        targets: [target.any()],
        label: "4 damage to any target and 3 to you",
      }),
      FOOD_ABILITY,
    ],
  },
  "Wingnut, Bat on the Belfry": {
    abilities: [
      // "Your choice": chosen on resolution (608.2d).
      triggered(
        ALLIANCE,
        fx.yourChoice("Wingnut gains…", "k", [
          { label: msg("ctx:gains|Flying"), effects: [fx.pump(ref.self, 0, 0, ["flying"])] },
          { label: msg("ctx:gains|Menace"), effects: [fx.pump(ref.self, 0, 0, ["menace"])] },
          { label: msg("ctx:gains|Haste"), effects: [fx.pump(ref.self, 0, 0, ["haste"])] },
        ]),
        { label: "Alliance: flying, menace or haste" },
      ),
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 1, 0)], {
        label: "Other attackers get +1/+0",
      }),
    ],
  },
  // Reach, trample and Mountaincycling {2}: read from the text.
  "Zog, Triceraton Castaway": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })], {
        targets: [target.creature()],
        label: "A creature can't block this turn",
      }),
    ],
  },
};
