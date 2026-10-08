/**
 * Marvel Super Heroes — cards of the meta decks (phase 1 of plan P4). Teamwork is read from the text (`scryfall.ts`:
 * kicker "tap creatures with total power N"). The other cards of the set are in the per-color files.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  DOOMBOT,
  eventReplacement,
  fx,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Lot M2 -----------------------------------------------------------------
  "Hidden Lair": {
    abilities: [
      manaAbility("C"),
      manaAbility(["U", "B"], 1, {
        condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
      }),
    ],
  },
  "The Wondrous Wasp": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.modifyWhileSource(ref.target(), { loseAllAbilities: true })], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap a creature; it loses its abilities",
      }),
    ],
  },
  "We Say Thee Nay!": {
    spell: spell(
      [target.spell()],
      fx.unlessPays(ref.controllerOf(ref.target()), { genericAmount: amount.kicked(4, 2) }, fx.counter(ref.target())),
    ),
  },
  "Wolverine, Fierce Fighter": {
    keywords: ["damageHealsFirst"],
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Fights another creature",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "M.O.D.O.K.": {
    abilities: [
      activated({ payLife: 3, activationCondition: cond.yourTurn, effects: [fx.connive(ref.self)], label: "Connive (3 life)" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { power: -1, toughness: -1 },
        {
          label: "Creatures your opponents control get -1/-1",
        },
      ),
    ],
  },
  "Captain Marvel, Earth's Protector": {
    abilities: [
      activated({
        mana: "{5}{W}{W}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.counters(ref.self, "indestructible")],
        label: "Power-up: +1/+1 and indestructible counters",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Thor, God of Thunder": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "t" }), fx.grantPlay(ref.stored("t"), { untilYourNextTurn: true })],
        {
          targets: [
            target.cardInGraveyard(
              "t",
              { anyOf: [{ subtype: "Equipment" }, { types: ["Instant"] }, { types: ["Sorcery"] }] },
              "you",
              "Equipment, instant or sorcery card from your graveyard",
            ),
          ],
          label: "Exile a card: playable until the end of your next turn",
        },
      ),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.damage(amount.manaValueOf(ref.eventObject), ref.target())],
        {
          targets: [target.any()],
          label: "Damage equal to the spell's mana value",
        },
      ),
    ],
  },
  "The Mind Stone": {
    abilities: [
      manaAbility("W"),
      activated({ mana: "{5}{W}", tap: true, effects: [fx.harness], label: "Harness The Mind Stone" }),
      triggered(when.yourEndStep, [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        condition: cond.harnessed,
        targets: [target.upTo(1, target.nonland("t", { controller: "you", other: true }))],
        label: "∞ — Exile, then return a nonland permanent",
      }),
    ],
  },
  "Castle Doom": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Artifact"] } } }),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        sorcerySpeed: true,
        effects: [fx.createTokens(DOOMBOT)],
        label: "A 3/3 Doombot",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Mjölnir, Hammer of Thor": {
    // Worthy equip {1}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "4 damage",
      }),
      eventReplacement({
        event: "damage",
        source: { attached: "host", controller: "you" },
        modify: { times: 2 },
        label: "Doubles the damage dealt by the equipped creature",
      }),
      activated({
        mana: "{2}{R}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.damageAll(2, { types: ["Creature"] })],
        label: "2 damage to each creature",
      }),
    ],
  },
  "Political Triumph": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.scry(1), fx.counters(ref.self, "plan")], {
        label: "Scry 1, a plan counter",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [fx.sacrificeIt(ref.self), fx.draw(1), fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Fourth counter: sacrifice it, draw, +1/+1 counter on your creatures",
        },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Avengers Disassembled": {
    spell: modal(
      mode("3 damage to each creature", [], [fx.damageAll(3, { types: ["Creature"] })]),
      mode(
        "Destroy a land",
        [target.permanent("t", ["Land"])],
        [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target()))],
      ),
      mode(
        "Both",
        [target.permanent("t", ["Land"])],
        [
          fx.damageAll(3, { types: ["Creature"] }),
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ],
      ),
    ),
  },
  "Doctor Doom": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DOOMBOT, 2)], { label: "Two 3/3 Doombots" }),
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        {
          condition: cond.any(
            cond.controls({ types: ["Artifact"], anyOf: [{ types: ["Creature"] }] }),
            cond.controls({ subtype: "Plan" }),
          ),
          label: "Indestructible with an artifact creature or a Plan",
        },
      ),
      triggered(when.yourEndStep, [fx.draw(1), fx.loseLife(1)], { label: "Draw, lose 1 life" }),
    ],
  },
  "Gleaming Bastion": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U"], 1, {
        condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
      }),
    ],
  },
  "Jennifer Walters": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" } }),
      activated({ mana: "{3}{G}{W}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform her" }),
    ],
  },
  "The Sensational She-Hulk": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" } }),
      triggered(
        when.dealtDamage({ types: ["Creature"], controller: "you" }),
        fx.may("Deal that much damage to a target?", fx.damage(amount.eventAmount, ref.target())),
        { oncePerTurn: true, targets: [target.any()], label: "That much damage to any target" },
      ),
    ],
  },
};
