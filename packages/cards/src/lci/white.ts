/** The Lost Caverns of Ixalan — white cards. */
import {
  ANGEL_4,
  ARTIFACT_OR_CREATURE,
  ARTIFACT_OR_CREATURE_YOURS,
  activated,
  amount,
  BAT_1,
  CAVE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  fx,
  GNOME,
  MAP,
  modal,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Abuelo's Awakening": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }] },
          "you",
          "artifact or non-Aura enchantment card from your graveyard",
        ),
      ],
      [
        // The X counters, the Spirit creature type and flying are in place on entering (614.1c: "a creature enters" sees
        // it). Approximation: its base P/T become 1/1 just after it enters.
        fx.moveTo(
          ref.target(),
          {
            to: "battlefield",
            counters: { kind: "+1/+1", n: amount.x },
            addTypes: ["Creature"],
            addSubtypes: ["Spirit"],
            addKeywords: ["flying"],
          },
          { name: "back" },
        ),
        fx.modify(ref.stored("back"), { setPower: 1, setToughness: 1 }, "permanent"),
      ],
    ),
  },
  "Acrobatic Leap": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["flying"]), fx.untap(ref.target())]),
  },
  "Adaptive Gemguard": {
    abilities: [
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE, count: 2, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Attentive Sunscribe": { abilities: [triggered(when.tapsSelf, [fx.scry(1)], { label: "Scry 1" })] },
  "Cosmium Blast": {
    spell: spell([target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })], [fx.damage(4, ref.target())]),
  },
  "Deconstruction Hammer": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            activated({
              mana: "{3}",
              tap: true,
              grantor: "sacrifice",
              targets: [targetObj("t", { types: ["Artifact", "Enchantment"] }, "artifact or enchantment")],
              effects: [fx.destroy(ref.target())],
              label: "Sacrifice Deconstruction Hammer: destroy an artifact or enchantment",
            }),
          ],
        },
        { label: '+1/+1 and "{3}, {T}, Sacrifice Deconstruction Hammer: Destroy target artifact or enchantment"' },
      ),
    ],
  },
  "Dusk Rose Reliquary": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1 } },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [targetObj("t", { ...ARTIFACT_OR_CREATURE, controller: "opponent" }, "opponent's artifact or creature")],
        label: "Exile until it leaves",
      }),
    ],
  },
  "Envoy of Okinec Ahau": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.createTokens(GNOME)], label: "1/1 Gnome" })],
  },
  "Family Reunion": {
    spell: modal(
      mode("+1/+1", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)]),
      mode("Hexproof", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["hexproof"])]),
    ),
  },
  "Get Lost": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment", "Planeswalker"] }, "creature, enchantment or planeswalker")],
      [fx.createTokens(MAP, 2, ref.controllerOf(ref.target())), fx.destroy(ref.target())],
    ),
  },
  "Glorifier of Suffering": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...ARTIFACT_OR_CREATURE, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.upTo(2, target.creature())], [fx.addCounters(ref.target(), 1)])),
        ],
        { label: "Sacrifice: +1/+1 counters" },
      ),
    ],
  },
  "Guardian of the Great Door": {
    additionalCost: {
      tap: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Land"] }] }, count: 4 },
    },
  },
  "Helping Hand": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less")],
      [fx.toBattlefield(ref.target(), { tapped: true })],
    ),
  },
  "Ironpaw Aspirant": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Kinjalli's Dawnrunner": { abilities: [triggered(when.entersSelf, [fx.explore()], { label: "Explore" })] },
  "Malamet War Scribe": {
    abilities: [triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 1)], { label: "+2/+1" })],
  },
  "Might of the Ancestors": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0, ["vigilance"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0 and vigilance",
      }),
    ],
  },
  "Miner's Guidewing": {
    abilities: [
      triggered(when.diesSelf, [fx.explore(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature explores",
      }),
    ],
  },
  "Oltec Archaeologists": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Artifact card into your hand",
            [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card from your graveyard")],
            [fx.toHand(ref.target())],
          ),
          mode("Scry 3", [], [fx.scry(3)]),
        ],
        { label: "Archaeologists" },
      ),
    ],
  },
  "Oltec Cloud Guard": { abilities: [triggered(when.entersSelf, [fx.createTokens(GNOME)], { label: "1/1 Gnome" })] },
  Petrify: {
    enchant: { filter: ARTIFACT_OR_CREATURE, label: "artifact or creature" },
    abilities: [
      staticAbility(
        "attached",
        { addKeywords: ["cantAttack", "cantBlock", "noActivatedAbilities"] },
        { label: "Can't attack or block, activated abilities blocked" },
      ),
    ],
  },
  "Quicksand Whirlpool": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Resplendent Angel": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_4)], {
        condition: cond.lifeGainedAtLeast(5),
        label: "4/4 Angel",
      }),
      activated({
        mana: "{3}{W}{W}{W}",
        effects: [fx.pump(ref.self, 2, 2, ["lifelink"])],
        label: "+2/+2 and lifelink",
      }),
    ],
  },
  "Sanguine Evangelist": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 1, 0)], {
        label: "Battle cry",
      }),
      triggered(when.entersSelf, [fx.createTokens(BAT_1)], { label: "1/1 Bat" }),
      triggered(when.diesSelf, [fx.createTokens(BAT_1)], { label: "1/1 Bat" }),
    ],
  },
  "Soaring Sandwing": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 life" })] },
  "Thousand Moons Crackshot": {
    abilities: [
      triggered(
        when.attacksSelf,
        [...fx.mayPay("{2}{W}", "Pay {2}{W} to tap a creature?", fx.reflexive([target.creature()], [fx.tap(ref.target())]))],
        { label: "Tap a creature" },
      ),
    ],
  },
  "Tinker's Tote": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME, 2)], { label: "Two 1/1 Gnomes" }),
      activated({ mana: "{W}", sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" }),
    ],
  },
  "Vanguard of the Rose": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible",
      }),
    ],
  },
  "Warden of the Inner Sky": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying", "vigilance"] },
        // Three or more counters, of any kinds.
        { condition: cond.amountAtLeast(amount.countersOn(ref.self, "any"), 3), label: "Flying and vigilance (three counters)" },
      ),
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE_YOURS, count: 3, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 1), fx.scry(1)],
        label: "Put a +1/+1 counter, scry 1",
      }),
    ],
  },
  "Bat Colony": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BAT_1, amount.caveManaSpent)], {
        label: "A Bat for each mana from a Cave",
      }),
      triggered(when.enters({ ...CAVE, controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Ruin-Lurker Bat": {
    abilities: [triggered(when.yourEndStep, [fx.scry(1)], { condition: cond.descended, label: "Descend — scry 1" })],
  },
};
