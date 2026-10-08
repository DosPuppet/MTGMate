/** Tarkir: Dragonstorm — white cards. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  flurry,
  fx,
  MONK,
  modal,
  mode,
  ref,
  SOLDIER_2,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Arashin Sunshield": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exile up to two cards from a single graveyard",
      }),
      activated({
        mana: "{W}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Tap a creature",
      }),
    ],
  },
  "Bearer of Glory": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike during your turn" },
      ),
      activated({ mana: "{4}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Your creatures get +1/+1" }),
    ],
  },
  "Coordinated Maneuver": {
    spell: modal(
      mode(
        "Damage equal to the number of your creatures",
        [target.creatureOrPlaneswalker()],
        [fx.damage(amount.count(CREATURE_YOU_CONTROL), ref.target())],
      ),
      mode("Destroy an enchantment", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
    ),
  },
  // Mobilize 3 and 1: read from the text.
  "Dalkovan Packbeasts": {},
  "Dragonback Lancer": {},
  "Duty Beyond Death": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell(
      [],
      [fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["indestructible"] }), fx.addCountersAll(CREATURE_YOU_CONTROL, 1)],
    ),
  },
  "Furious Forebear": {
    abilities: [
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        fx.mayPay("{1}{W}", "pay {1}{W} to return this card from your graveyard to your hand?", fx.toHand(ref.selfCard)),
        { fromGraveyard: true, label: "One of your creatures dies: {1}{W}, returns to hand" },
      ),
    ],
  },
  "Lightfoot Technique": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["flying", "indestructible"] })],
    ),
  },
  "Loxodon Battle Priest": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+1 counter on another creature of yours",
      }),
    ],
  },
  "Mardu Devotee": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }), devotee(["R", "W", "B"])],
  },
  "Osseous Exhale": {
    // "As an additional cost to cast this spell, you may behold a Dragon": done on casting, remembered by the spell.
    additionalCost: { behold: { filter: DRAGON_CARD } },
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [fx.damage(5, ref.target()), ...fx.when(cond.beheld, fx.gainLife(2))],
    ),
  },
  "Rally the Monastery": {
    costReduction: { generic: 2, condition: cond.castThisTurn(1) },
    spell: modal(
      mode("Two 1/1 Monks with prowess", [], [fx.createTokens(MONK, 2)]),
      mode(
        "Up to two of your creatures get +2/+2",
        [target.upTo(2, target.creature("p", { controller: "you" }))],
        [fx.pump(ref.target("p"), 2, 2)],
      ),
      mode("Destroy a creature with power 4 or greater", [target.creature("d", { minPower: 4 })], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Rebellious Strike": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0), fx.draw(1)]) },
  "Salt Road Packbeast": {
    // Affinity for creatures.
    costReduction: { generic: amount.count(CREATURE_YOU_CONTROL) },
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Smile at Death": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })], {
        targets: [
          target.upTo(
            2,
            target.cardInGraveyard("t", { types: ["Creature"], maxPower: 2 }, "you", "creature card with power 2 or less"),
          ),
        ],
        label: "Returns up to two creatures with power 2 or less, with a +1/+1 counter",
      }),
    ],
  },
  "Starry-Eyed Skyrider": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature of yours gains flying",
      }),
      staticAbility(
        { types: ["Creature"], token: true, attacking: true, controller: "you" },
        { addKeywords: ["flying"] },
        { label: "Your attacking tokens have flying" },
      ),
    ],
  },
  "Static Snare": {
    costReduction: { generic: amount.count({ types: ["Creature"], attacking: true }) },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [targetObj("t", { types: ["Artifact", "Creature"], controller: "opponent" }, "opponent's artifact or creature")],
        label: "Exiles an opponent's artifact or creature for as long as it remains",
      }),
    ],
  },
  "Stormbeacon Blade": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(
        when.attacks({ attached: "host" }),
        fx.when(cond.controls({ types: ["Creature"], attacking: true, controller: "you" }, 3), fx.draw(1)),
        { label: "Three or more attackers: draw a card" },
      ),
    ],
  },
  "Stormplain Detainment": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "opponent's nonland permanent")],
        label: "Exiles an opponent's nonland permanent for as long as it remains",
      }),
    ],
  },
  "Sunpearl Kirin": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // "If it was a token, draw": checked before the bounce (the token ceases to exist).
          ...fx.when(cond.refMatches(ref.target(), { token: true }), fx.bounce(ref.target()), fx.draw(1)),
          ...fx.when(cond.not(cond.refMatches(ref.target(), { token: true })), fx.bounce(ref.target())),
        ],
        {
          targets: [target.optional(target.nonland("t", { controller: "you", other: true }, "other nonland permanent of yours"))],
          label: "Returns another permanent of yours; a token: draw",
        },
      ),
    ],
  },
  "Teeming Dragonstorm": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER_2, 2)], { label: "Two 2/2 Soldiers" }), dragonstorm()],
  },
  "Tempest Hawk": {
    // "A deck can have any number of cards named Tempest Hawk": read by validateDeck.
    abilities: [
      triggered(when.combatDamageToPlayer, fx.may("search for a Tempest Hawk?", fx.search({ name: "Tempest Hawk" })), {
        label: "Search for a Tempest Hawk",
      }),
    ],
  },

  // --- Batch B ----------------------------------------------------------------
  "Anafenza, Unyielding Lineage": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false, other: true }), [fx.endure(ref.self, 2)], {
        label: "Another nontoken creature of yours dies: endure 2",
      }),
    ],
  },
  "Descendant of Storms": {
    abilities: [
      triggered(when.attacksSelf, fx.mayPay("{1}{W}", "pay {1}{W} to endure 1?", fx.endure(ref.self, 1)), {
        label: "{1}{W}: endure 1",
      }),
    ],
  },
  "Fortress Kin-Guard": {
    abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 1)], { label: "Endure 1" })],
  },
  "Poised Practitioner": {
    abilities: [flurry([fx.addCounters(ref.self, 1), fx.scry(1)], "+1/+1 counter, scry 1")],
  },
  "Riling Dawnbreaker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature of yours gets +1/+0",
      }),
    ],
  },
  "Signaling Roar": { spell: spell([], [fx.createTokens(SOLDIER_2)]) },
  "Wayspeaker Bodyguard": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, notTypes: ["Land"], maxManaValue: 2 },
            "you",
            "nonland permanent card with MV 2 or less",
          ),
        ],
        label: "A nonland permanent with MV 2 or less returns to hand",
      }),
      flurry([fx.tap(ref.target())], "tap an opponent's creature", [target.creature("t", { controller: "opponent" })]),
    ],
  },
};
