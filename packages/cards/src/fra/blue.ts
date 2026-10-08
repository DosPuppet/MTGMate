/** Reality Fracture — blue cards. */
import {
  ANGEL_3,
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  doesntUntap,
  empower,
  entersWith,
  fx,
  ILLUSION,
  loyalty,
  modal,
  mode,
  PEER_REVIEW,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  walkersHave,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Cryotheory Adept": {
    abilities: [
      activated({
        mana: "{3}{U}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)],
        label: "Tap and stun a creature",
      }),
    ],
  },
  "Divining Duelist": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Tap target creature", [target.creature("t")], [fx.tap(ref.target())]),
        mode("Untap target creature", [target.creature("t")], [fx.untap(ref.target())]),
        mode("Draw then discard", [], fx.loot(1)),
      ]),
    ],
  },
  "Icy Reception": {
    spell: modal(
      mode(
        "Counter a creature or legendary spell unless its controller pays {3}",
        [target.spell("t", { anyOf: [{ types: ["Creature"] }, { legendary: true }] }, "creature or legendary spell")],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counter(ref.target())),
      ),
      mode("-5/-0", [target.creature("t")], [fx.pump(ref.target(), -5, 0)]),
    ),
  },
  "Perfected Theory": {
    spell: modal(
      mode("Base power and toughness 1/1", [target.creature("t")], [fx.modify(ref.target(), { setPower: 1, setToughness: 1 })]),
      mode("Base power and toughness 4/5", [target.creature("t")], [fx.modify(ref.target(), { setPower: 4, setToughness: 5 })]),
    ),
  },
  "Precise Redaction": {
    spell: spell([target.spell("t", { colors: ["W", "B"] }, "white or black spell")], [fx.counter(ref.target())]),
  },
  "Surveillance Phantasm": {
    abilities: [
      staticAbility(
        "self",
        { removeKeywords: ["defender"] },
        {
          condition: cond.scried,
          label: "Can attack (scry or surveil this turn)",
        },
      ),
      activated({ mana: "{3}{U}", effects: [fx.surveil(1)], label: "Surveil 1" }),
    ],
  },
  "Arni, Humble Scribe": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, token: false }), [fx.untap(ref.self)], {
        label: "untaps",
      }),
      activated({ tap: true, effects: fx.loot(1), label: "Draw then discard" }),
    ],
  },
  "Geist of Saint Thalia": {
    abilities: [costReducer({ notTypes: ["Creature"] }, 1, "Noncreature spells: {1} less")],
  },
  "Hapatra, the Desert Frost": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "taps and stuns",
      }),
      activated({ mana: "{2}{U}", targets: [target.creature("t")], effects: [fx.untap(ref.target())], label: "Untap" }),
    ],
  },
  "Lyra, Tolarian Archangel": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_3)], {
        condition: cond.drewAtLeast(3),
        label: "3 cards drawn: 3/3 Angel",
      }),
      activated({
        mana: "{3}{U}{U}",
        effects: [
          fx.modify(ref.self, {
            addAbilities: [triggered(when.combatDamageToPlayer, [fx.draw(2)], { label: "draw two cards" })],
          }),
        ],
        label: "Combat damage: draw two cards",
      }),
    ],
  },
  "Proft, Consulting Detective": {
    abilities: [
      triggered(
        when.scryOrSurveil,
        fx.mayPay("{2}", "Pay {2}: +1/+1 counter and draw a card?", fx.addCounters(ref.self, 1), fx.draw(1)),
        { label: "scry/surveil" },
      ),
    ],
  },
  "Ruric Thar, Biomagus": {
    abilities: [
      // "Prowess, prowess": the second instance (the first is read from the text).
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 1, 1)], { label: "Prowess" }),
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, [fx.draw(1)], { label: "targeted: draw" }),
    ],
  },
  "Tetsuko Umezawa, Fugitive": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] },
        { addKeywords: ["unblockable"] },
        { label: "Can't be blocked (power or toughness 1 or less)" },
      ),
    ],
  },
  "Traxos, Academy Guardian": { costReduction: { generic: 2, condition: cond.castThisTurn(1, true) } },
  "Yuriko, Hope from the Shadows": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("-X/-0", [target.creature("t")], [fx.pump(ref.target(), amount.neg(amount.cardsIn("graveyard")), 0)]),
        mode("Surveil 2", [], [fx.surveil(2)]),
      ]),
    ],
  },
  "Undulating Witness": {
    abilities: [activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, -1)], label: "+1/-1" })],
  },
  "Samut, Tyrant of Naktamun": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Instant", "Sorcery"] }, keywords: ["splitSecond"] },
        label: "Your instants and sorceries have split second",
      }),
    ],
  },
  "Diviner of Victory": {
    prepareSpell: spell(
      [target.creature("t", { controller: "opponent", maxManaValue: 3 })],
      [fx.bounce(ref.target()), fx.surveil(1)],
    ),
    abilities: [entersWith({ prepared: true }), triggered(when.scryOrSurveil, [fx.pump(ref.self, 1, 1)], { label: "+1/+1" })],
  },
  "Infinite Coursework": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached), fx.prepare(ref.attached, false)], {
        label: "taps and unprepares the creature",
      }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Loses all abilities" }),
      doesntUntap("attached"),
    ],
  },
  "Semester Foreseer": {
    prepareSpell: PEER_REVIEW,
    abilities: [entersWith({ prepared: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "surveil 1" })],
  },
  Countersculpt: {
    // "As an additional cost, behold a Jace or pay {1}."
    additionalCost: { behold: { filter: { subtype: "Jace" }, orPay: { generic: 1, colored: {}, x: 0 } } },
    spell: spell([target.spell("t")], [fx.counter(ref.target()), empower(1)]),
  },
  "Jace's Machinations": { spell: spell([], [fx.instantJaceLoyalty, empower(8)]) },
  "Mindseeker Oculus": {
    abilities: [triggered(when.entersSelf, [empower(4)], { label: "Empower Jace 4" })],
  },
  "Plan for All Outcomes": {
    abilities: [
      triggered(when.entersSelf, [fx.topOrBottom(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }, "other nonland permanent"))],
        label: "on top or bottom of the library",
      }),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [empower(1)], {
        condition: cond.castThisTurn(1, true, true),
        label: "first noncreature spell: empower Jace 1",
      }),
    ],
  },
  "Protege's Awakening": { spell: spell([], [empower(6), fx.draw(1)]) },
  "Theorist's Proxy": {
    abilities: [
      triggered(when.entersSelf, [empower(3)], { label: "Empower Jace 3" }),
      activated({ mana: "{U}", sacrifice: true, effects: [fx.nextSpellUncounterable], label: "Next spell can't be countered" }),
    ],
  },
  "Way of the Cryomancer": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      walkersHave(
        loyalty(-3, { effects: [fx.copyNextSpell], label: "Copy the next instant or sorcery spell" }),
        "Planeswalkers: [−3] copy",
      ),
    ],
  },
  "Way of the Mind Sculptor": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      triggered(when.loyaltyActivated(2), [fx.draw(1)], { label: "two counters removed: draw" }),
    ],
  },
  "The Theorist, Jace Beleren": {
    abilities: [
      triggered(when.step("draw", "opponent"), [fx.draw(1)], { label: "draw a card" }),
      loyalty(1, { effects: [fx.createTokens(ILLUSION)], label: "1/1 Illusion" }),
      loyalty(-2, {
        targets: [
          target.upTo(
            1,
            targetObj(
              "t",
              { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent" },
              "artifact or creature an opponent controls",
            ),
          ),
        ],
        effects: [fx.bounce(ref.target())],
        label: "Return an artifact or creature",
      }),
      loyalty(-6, {
        effects: [fx.draw(3), fx.addCountersAll(CREATURE_YOU_CONTROL, amount.cardsIn("hand"))],
        label: "Draw three cards, counters",
      }),
    ],
  },
};
