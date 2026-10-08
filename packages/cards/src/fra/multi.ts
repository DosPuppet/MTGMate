/** Reality Fracture — multicolored cards. */
import {
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  empower,
  entersWith,
  fx,
  HEARTWOOD,
  LEVIATHAN,
  LOTUS,
  loyalty,
  modal,
  mode,
  OMIT_VARIABLES,
  PEER_REVIEW,
  ref,
  SCULPTURE_TREASURE,
  SEED_SUTURE,
  SOUL_TETHER,
  spell,
  staticAbility,
  THOPTER,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VICIOUS_VERSE,
  walkersHave,
  when,
} from "./common";

/** "Return this card from your graveyard to the battlefield with a finality counter." */
const returnWithFinality = (mana: string, activationCondition: Parameters<typeof activated>[0]["activationCondition"]) =>
  activated({
    mana,
    fromGraveyard: true,
    activationCondition,
    effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
    label: "Return with a finality counter",
  });

export const MULTI: Record<string, CardScript> = {
  "Aerid Konstrari": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      triggered(when.diesSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      activated({
        mana: "{6}",
        effects: [fx.createTokens(HEARTWOOD), fx.pump(ref.self, amount.count({ types: ["Artifact"], controller: "you" }), 0)],
        label: "Heartwood, then +X/+0",
      }),
    ],
  },
  "Blessed Ghoul": {
    abilities: [activated({ mana: "{2}{W/B}", fromGraveyard: true, effects: [fx.toHand(ref.self)], label: "Return to hand" })],
  },
  Bloombrute: {
    abilities: [
      triggered(when.gainLife, [fx.draw(1)], { oncePerTurn: true, label: "draw a card" }),
      activated({
        mana: "{4}{G}{W}",
        targets: [target.creature("t")],
        effects: [fx.modify(ref.target(), { addKeywords: ["trample", "lifelink"] })],
        label: "Trample and lifelink",
      }),
    ],
  },
  "Charge the Sanctum": {
    spell: modal(
      mode("Your creatures +2/+0", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0)]),
      mode(
        "+2/+0, first strike and +1/+1 counter",
        [target.creature("t")],
        [fx.pump(ref.target(), 2, 0, ["firstStrike"]), fx.addCounters(ref.target(), 1)],
      ),
    ),
  },
  "Denzilore Fatehold": {
    abilities: [
      triggered(when.scryOrSurveil, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        label: "scry/surveil: counter on each creature",
      }),
    ],
  },
  "Desperate Futurescribe": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          ...fx.when(cond.scried, fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.not(cond.scried), fx.pump(ref.target(), 1, 1)),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+1/+1 (or counter)" },
      ),
    ],
  },
  "Ferocity of the Hunt": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["deathtouch"] }, { label: "+1/+0 with deathtouch" }),
      triggered(when.dies({ attached: "host" }), [fx.toBattlefield(ref.eventObject, { tapped: true })], {
        label: "returns tapped",
      }),
    ],
  },
  "Frostbite Pyromental": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(2)], { label: "draw two cards" }),
      triggered(when.eachEndStep, [fx.sacrificeIt(ref.self)], { label: "sacrificed" }),
    ],
  },
  "Grim Repriser": { abilities: [returnWithFinality("{B}{R}", cond.opponentDealtNoncombatDamage)] },
  "Ingris Stingerquill": {
    abilities: [
      triggered(when.attacks({ types: ["Creature"], controller: "you" }), [fx.damage(1, ref.eachOpponent, ref.eventObject)], {
        label: "the attacker deals 1 damage",
      }),
      activated({
        mana: "{4}",
        effects: [fx.createTokens(CADET), fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["haste"])],
        label: "Cadet, then haste",
      }),
    ],
  },
  "Konstrari Charm": {
    spell: modal(
      mode("6 damage to a flying creature", [target.creature("t", { keyword: "flying" })], [fx.damage(6, ref.target())]),
      mode(
        "Two +1/+1 counters, trample",
        [target.creature("t")],
        [fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["trample"] })],
      ),
      mode("Add {C}{C}{C}", [], [fx.addMana("C", "C", "C")]),
    ),
  },
  "Kwia Vigorbloom": {
    abilities: [triggered(when.gainLife, [fx.createTokens(LOTUS)], { oncePerTurn: true, label: "Lotus" })],
  },
  "Primal Witchstalker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4),
          fx.reflexive(
            [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard")],
            [fx.toBattlefield(ref.target(), { tapped: true })],
          ),
        ],
        { label: "mills 4, then a land returns" },
      ),
    ],
  },
  "Proctor of Potential": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.surveil(1)], { label: "surveil 1" }),
      returnWithFinality("{W}{U}", cond.scried),
    ],
  },
  "Solarium Sentry": {
    abilities: [triggered(when.castSpell("opponent", { maxManaValue: 2 }), [fx.gainLife(2)], { label: "+2 life" })],
  },
  "Solitary Cell": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.nonland(
            "t",
            { controller: "opponent", maxManaValue: 3 },
            "nonland permanent an opponent controls (mana value 3 or less)",
          ),
        ],
        label: "exiles until it leaves",
      }),
      activated({
        mana: "{1}",
        tap: true,
        discard: 1,
        discardFilter: { legendary: true },
        effects: [fx.draw(1)],
        label: "Discard a legendary card: draw",
      }),
    ],
  },
  "Stingerquill Charm": {
    spell: modal(
      mode("3 damage", [target.any()], [fx.damage(3, ref.target())]),
      mode(
        "First strike and deathtouch",
        [target.creature("t")],
        [fx.modify(ref.target(), { addKeywords: ["firstStrike", "deathtouch"] })],
      ),
      mode(
        "Cadet with haste",
        [],
        [fx.createTokens(CADET, 1, undefined, "cadet"), fx.modify(ref.stored("cadet"), { addKeywords: ["haste"] })],
      ),
    ),
  },
  "Stinging Vitriol": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.damage(2, ref.target()), fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" })],
    ),
  },
  "Tenured Tethermage": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.createTokens({ ...HEARTWOOD, tapped: true }, 2)),
        ],
        { label: "sacrifice a land: two Heartwoods" },
      ),
      activated({
        tapOthers: { filter: { types: ["Artifact"], controller: "you" }, count: 2 },
        effects: [fx.addCounters(ref.self, 2)],
        label: "Two +1/+1 counters",
      }),
    ],
  },
  "Theorix Charm": {
    spell: modal(
      mode(
        "Counter a noncreature spell unless its controller pays {2}",
        [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
      ),
      mode("-2/-2", [target.creature("t")], [fx.pump(ref.target(), -2, -2)]),
      mode("Mill 3, then draw", [], [fx.mill(3), fx.draw(1)]),
    ),
  },
  "Vigorbloom Charm": {
    spell: modal(
      mode(
        "Hexproof and indestructible",
        [targetObj("t", { permanent: true, controller: "you" }, "permanent you control")],
        [fx.modify(ref.target(), { addKeywords: ["hexproof", "indestructible"] })],
      ),
      mode("Draw a card, +3 life", [], [fx.draw(1), fx.gainLife(3)]),
      mode(
        "+1/+1 counter, then fight",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.addCounters(ref.target("a"), 1), fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Mabel, Valley Hero": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { enteredThisTurn: true })],
        label: "counter on a creature that entered this turn",
      }),
    ],
  },
  "Saheeli, Jewel of Avishkar": {
    abilities: [
      staticAbility({ subtype: "Thopter", controller: "you" }, { addKeywords: ["haste"] }, { label: "Haste (Thopters)" }),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(THOPTER)], { label: "Thopter" }),
    ],
  },
  "Vraska, Soul of Stone": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you", anyOf: [{ types: ["Creature"] }] },
        { addKeywords: ["vigilance"] },
        {
          label: "Vigilance (artifact creatures)",
        },
      ),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(SCULPTURE_TREASURE)], {
        label: "Sculpture Treasure",
      }),
    ],
  },
  "Vraska, the Cutting Glare": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.createTokens(TREASURE, 1, ref.controllerOf(ref.target()))], {
        targets: [targetObj("t", { permanent: true, controller: "opponent" }, "permanent an opponent controls")],
        condition: cond.controls({ types: ["Land"] }, 6),
        label: "six lands: destroy a permanent",
      }),
    ],
  },
  "Emergency Phytomedic": { prepareSpell: SEED_SUTURE, abilities: [entersWith({ prepared: true })] },
  "Fatehold Chronologist": { prepareSpell: PEER_REVIEW, abilities: [entersWith({ prepared: true })] },
  "Konstrari Improviser": { prepareSpell: SOUL_TETHER, abilities: [entersWith({ prepared: true })] },
  "Paradox Shaper": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "becomes prepared" }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Card from your graveyard on the bottom of your library",
      }),
    ],
  },
  "Prudent Fateseer": {
    prepareSpell: PEER_REVIEW,
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.scryOrSurveil, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0)], {
        oncePerTurn: true,
        label: "your creatures +1/+0",
      }),
    ],
  },
  "Stingerquill Voxmancer": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "becomes prepared" }),
    ],
  },
  "Theorix Metamage": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility(
        "self",
        { power: 1, addKeywords: ["flying"] },
        { condition: cond.threshold, label: "Threshold: +1/+0 and flying" },
      ),
    ],
  },
  "Vigorbloom Vanguard": {
    prepareSpell: SEED_SUTURE,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["vigilance"] },
        {
          label: "Vigilance (with a +1/+1 counter)",
        },
      ),
    ],
  },
  "Whiplash Wordsmith": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility(
        "self",
        { addKeywords: ["flying", "haste"] },
        {
          condition: cond.opponentDealtNoncombatDamage,
          label: "Flying and haste (noncombat damage)",
        },
      ),
    ],
  },
  "Woodwork Prodigy": {
    prepareSpell: SOUL_TETHER,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "becomes prepared" }),
    ],
  },
  "Avatar of Burgeoning Echoes": {
    abilities: [
      triggered(when.landfall, [empower(2)], { label: "Landfall: empower Jace 2" }),
      walkersHave(
        loyalty(-10, {
          targets: [target.creature("t")],
          effects: [fx.addCounters(ref.target(), amount.count({ types: ["Land"], controller: "you" }))],
          label: "A counter for each land",
        }),
        "Planeswalkers: [−10]",
      ),
    ],
  },
  "Mind Meanderer": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["vigilance"] },
        {
          condition: cond.controls({ types: ["Planeswalker"], subtype: "Jace" }),
          label: "Vigilance (with a Jace)",
        },
      ),
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "fight",
      }),
    ],
  },
  "Tam's Resistance": {
    spell: spell(
      [target.upTo(1, target.creature("t"))],
      [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] }), empower(4)],
    ),
  },
  "Craftwork Crusher": {
    // "Choose two —": the three possible pairs.
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("4 damage and a Cadet", [target.creatureOrPlaneswalker("t")], [fx.damage(4, ref.target()), fx.createTokens(CADET)]),
        mode("4 damage and draw", [target.creatureOrPlaneswalker("t")], [fx.damage(4, ref.target()), fx.draw(1)]),
        mode("A Cadet and draw", [], [fx.createTokens(CADET), fx.draw(1)]),
      ]),
    ],
  },
  "Entrust the Spark": {
    spell: spell(
      [],
      [
        fx.sacrifice(ref.you, { types: ["Planeswalker"] }, 1, { optional: true, store: "s" }),
        ...fx.when(cond.v("s"), fx.search({ types: ["Planeswalker"] }, { to: "battlefield" })),
      ],
    ),
  },
  "Vindictive Triumph": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [
        fx.exileCard(ref.target(), { name: "x", filter: { maxManaValue: 3 } }),
        ...fx.when(
          cond.v("x"),
          fx.moveTo(ref.stored("x"), { to: "battlefield", tapped: true, underYourControl: true }, { name: "y" }),
          fx.delayed([fx.exile(ref.target("y"))], { y: ref.stored("y") }),
        ),
      ],
    ),
  },
  "Edgar, Ancient Bloodlord": {
    abilities: [
      triggered(
        when.dies({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.gainLife(1)],
        { label: "+1 life" },
      ),
      activated({
        mana: "{2}",
        sacrificeOther: {
          filter: { ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true },
        },
        effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: ["menace"] })],
        label: "+1/+1 counter and menace",
      }),
    ],
  },
  "Kiora of Salt and Sand": {
    abilities: [
      triggered(when.attackWith(), [fx.untap(ref.target()), fx.modify(ref.target(), { addKeywords: ["unblockable"] })], {
        targets: [target.creature("t", { attacking: true })],
        condition: cond.activatedLoyalty,
        label: "untaps an attacker, unblockable",
      }),
      walkersHave(
        loyalty(-8, { effects: [fx.createTokens(LEVIATHAN)], label: "8/8 Leviathan" }),
        "Planeswalkers: [−8] Leviathan",
      ),
    ],
  },
  "Tam, the Possibility": {
    abilities: [
      costReducer({ types: ["Planeswalker"] }, 1, "Planeswalkers: {1} less"),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        tap: true,
        effects: [fx.proliferate(amount.distinctSubtypes({ types: ["Planeswalker"], controller: "you" }))],
        label: "Proliferate X times",
      }),
    ],
  },
};
