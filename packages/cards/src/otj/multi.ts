/** Outlaws of Thunder Junction — multicolor and colorless cards, lands. */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  ANGEL_3,
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  investigate,
  MOUNT_OR_VEHICLE,
  manaAbility,
  mercenary,
  OTHER_CREATURE_YOU_CONTROL,
  OUTLAW_CREATURE,
  OX,
  ref,
  SPIRIT_2,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VAMPIRE_ROGUE,
  wardAbility,
  when,
  whileSaddled,
} from "./common";

const NO_HAND_SPELL = cond.not(cond.handSpellThisTurn);
const LEGENDARY_CREATURE_YOU = { types: ["Creature" as const], controller: "you" as const, legendary: true };
const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/** Dual Desert: enters tapped, 1 damage to target opponent. */
const desertDual = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.damage(1, ref.target())], { targets: [target.player("t", "opponent")], label: "1 damage" }),
    manaAbility([a, b]),
  ],
});
/** Fast land: enters tapped unless you control two or fewer other lands. */
const fastland = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [entersWith({ tapped: true, condition: cond.controls({ types: ["Land"], other: true }, 3) }), manaAbility([a, b])],
});

export const MULTI: Record<string, CardScript> = {
  // --- Multicolor ------------------------------------------------------------
  "Akul the Unrepentant": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true }, count: 3 },
        sorcerySpeed: true,
        oncePerTurn: true,
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield" },
            { min: 0, prompt: "A creature from your hand" },
          ),
        ],
        label: "A creature from your hand",
      }),
    ],
  },
  "Annie Flash, the Veteran": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target(), { tapped: true })], {
        condition: cond.wasCast,
        targets: [target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "permanent card")],
        label: "A permanent with mana value 3 or less returns tapped",
      }),
      triggered(when.tapsSelf, [fx.exileTop(ref.you, 2, "a"), fx.grantPlay(ref.stored("a"))], {
        label: "Exile two cards, playable this turn",
      }),
    ],
  },
  "At Knifepoint": {
    abilities: [
      staticAbility(
        { ...OUTLAW_CREATURE, controller: "you" },
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike" },
      ),
      triggered(when.crime, [mercenary()], { oncePerTurn: true, label: "1/1 Mercenary" }),
    ],
  },
  "Badlands Revival": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("c", { types: ["Creature"] }, "you", "creature card")),
        { ...target.upTo(1, target.cardInGraveyard("p", { permanent: true }, "you", "permanent card")), otherThan: ["c"] },
      ],
      [fx.toBattlefield(ref.target("c")), fx.toHand(ref.target("p"))],
    ),
  },
  "Baron Bertram Graywater": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.createTokens(VAMPIRE_ROGUE)], {
        oncePerTurn: true,
        label: "1/1 Vampire Rogue",
      }),
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { types: ["Creature", "Artifact"], other: true } },
        effects: [fx.draw(1)],
        label: "Draw",
      }),
    ],
  },
  "Bruse Tarl, Roving Rancher": {
    abilities: [
      staticAbility(
        { subtype: "Ox", controller: "you" },
        { addKeywords: ["doubleStrike"] },
        { label: "Your Oxen: double strike" },
      ),
      ...(["entersSelf", "attacksSelf"] as const).map((w) =>
        triggered(
          when[w],
          [
            fx.exileTop(ref.you, 1, "b"),
            fx.when(cond.refMatches(ref.stored("b"), { types: ["Land"] }), fx.createTokens(OX)),
            fx.when(
              cond.not(cond.refMatches(ref.stored("b"), { types: ["Land"] })),
              fx.grantPlay(ref.stored("b"), { untilYourNextTurn: true }),
            ),
          ],
          { label: "Exile the top card: Ox, or castable" },
        ),
      ),
    ],
  },
  "Cactusfolk Sureshot": {
    abilities: [
      triggered(
        when.step("beginCombat"),
        [fx.pumpAll({ ...OTHER_CREATURE_YOU_CONTROL, minPower: 4 }, 0, 0, ["trample", "haste"])],
        {
          label: "Trample and haste (power 4)",
        },
      ),
    ],
  },
  "Congregation Gryff": {
    abilities: [
      whileSaddled(
        [
          fx.pump(
            ref.self,
            amount.count({ subtype: "Mount", controller: "you" }),
            amount.count({ subtype: "Mount", controller: "you" }),
          ),
        ],
        { label: "+X/+X (your Mounts)" },
      ),
    ],
  },
  "Form a Posse": { spell: spell([], [mercenary(amount.x)]) },
  "Honest Rutstein": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
        label: "Return a creature",
      }),
      { kind: "costReduction", filter: { types: ["Creature"] }, generic: 1, label: "Creature spells: cost {1} less" },
    ],
  },
  "Intimidation Campaign": {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(1), fx.draw(1)], { label: "Drain 1, draw" }),
      triggered(when.crime, fx.may("Return this enchantment to its owner's hand?", fx.bounce(ref.self)), {
        label: "Return it to hand",
      }),
    ],
  },
  "Jem Lightfoote, Sky Explorer": {
    abilities: [triggered(when.yourEndStep, [fx.draw(1)], { condition: NO_HAND_SPELL, label: "Draw" })],
  },
  "Jolene, Plundering Pugilist": {
    abilities: [
      triggered(when.attackWith(1), [fx.createTokens(TREASURE)], {
        condition: cond.controls({ types: ["Creature"], attacking: true, minPower: 4 }),
        label: "Treasure",
      }),
      activated({
        mana: "{1}{R}",
        sacrificeOther: { filter: { subtype: "Treasure" } },
        targets: [target.any("t")],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage",
      }),
    ],
  },
  "Kellan Joins Up": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "hand",
            { notTypes: ["Land"], maxManaValue: 3 },
            { to: "exile" },
            { min: 0, store: "k", prompt: "You may plot a card" },
          ),
          fx.plot(ref.stored("k")),
        ],
        { label: "Plot a card from your hand" },
      ),
      triggered(when.enters(LEGENDARY_CREATURE_YOU), [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        label: "A +1/+1 counter on each creature",
      }),
    ],
  },
  "Kraum, Violent Cacophony": {
    abilities: [triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "+1/+1 counter, draw" })],
  },
  "Malcolm, the Eyes": { abilities: [triggered(when.castNthSpell(2), [investigate()], { label: "Investigate" })] },
  "Marchesa, Dealer of Death": {
    abilities: [
      triggered(when.crime, fx.mayPay("{1}", "Pay {1}?", fx.lookAtTop(2, { count: 1, rest: "graveyard", exact: true })), {
        label: "One of the top two cards into your hand",
      }),
    ],
  },
  "Miriam, Herd Whisperer": {
    abilities: [
      staticAbility(
        { ...MOUNT_OR_VEHICLE, controller: "you" },
        { addKeywords: ["hexproof"] },
        { condition: cond.yourTurn, label: "Hexproof" },
      ),
      triggered(when.attacks({ ...MOUNT_OR_VEHICLE, controller: "you" }), [fx.addCounters(ref.eventObject, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Pillage the Bog": {
    spell: spell(
      [],
      [
        fx.lookAtTop(
          amount.plus(amount.count({ types: ["Land"], controller: "you" }), amount.count({ types: ["Land"], controller: "you" })),
          { count: 1, rest: "bottom", exact: true },
        ),
      ],
    ),
  },
  "Rakdos Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 2 } })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
        label: "A creature returns with two counters",
      }),
      triggered(when.dies(LEGENDARY_CREATURE_YOU), [fx.damage(amount.powerOf(ref.eventObject), ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Damage equal to its power",
      }),
    ],
  },
  "Ruthless Lawbringer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.nonland("t")], [fx.destroy(ref.target())])),
        ],
        { label: "Sacrifice a creature: destroy a nonland permanent" },
      ),
    ],
  },
  "Selvala, Eager Trailblazer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [mercenary()], { label: "1/1 Mercenary" }),
      manaAbility(ALL_COLORS, 1, { distinctPowers: true }),
    ],
  },
  "Seraphic Steed": { abilities: [whileSaddled([fx.createTokens(ANGEL_3)], { label: "3/3 flying Angel" })] },
  "Slick Sequence": {
    spell: spell([target.any("t")], [fx.damage(2, ref.target()), fx.when(cond.castThisTurn(2), fx.draw(1))]),
  },
  "Vial Smasher, Gleeful Grenadier": {
    abilities: [
      triggered(when.enters({ ...OUTLAW_CREATURE, controller: "you", other: true }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 damage",
      }),
    ],
  },
  "Vraska Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1, "deathtouch")], {
        label: "Deathtouch counter",
      }),
      triggered(when.combatDamage(LEGENDARY_CREATURE_YOU, true), [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Wrangler of the Damned": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(SPIRIT_2)], { condition: NO_HAND_SPELL, label: "2/2 flying Spirit" }),
    ],
  },
  "Wylie Duke, Atiin Hero": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 life, draw" })],
  },

  // --- Colorless -------------------------------------------------------------
  "Bandit's Haul": {
    abilities: [
      triggered(when.crime, [fx.counters(ref.self, "loot", 1)], { oncePerTurn: true, label: "Loot counter" }),
      manaAbility(ALL_COLORS),
      activated({ mana: "{2}", tap: true, removeCounters: { kind: "loot", n: 2 }, effects: [fx.draw(1)], label: "Draw" }),
    ],
  },
  "Boom Box": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [
          target.upTo(1, target.permanent("a", ["Artifact"])),
          target.upTo(1, target.creature("c")),
          target.upTo(1, target.permanent("l", ["Land"])),
        ],
        effects: [fx.destroy(ref.target("a")), fx.destroy(ref.target("c")), fx.destroy(ref.target("l"))],
        label: "Destroy an artifact, a creature and a land",
      }),
    ],
  },
  "Gold Pan": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Treasure" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Lavaspur Boots": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["haste"], addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        {
          label: "+1/+0, haste and ward {1}",
        },
      ),
    ],
  },
  "Mobile Homestead": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        { condition: cond.controls({ subtype: "Mount" }), label: "Haste (Mount)" },
      ),
      triggered(
        when.attacksSelf,
        [fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "top" })],
        { label: "A land from the top, tapped" },
      ),
    ],
  },
  "Oasis Gardener": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 life" }), manaAbility(ALL_COLORS)],
  },
  "Redrock Sentinel": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.draw(1), fx.createTokens(TREASURE)],
        label: "Draw, Treasure",
      }),
    ],
  },
  "Silver Deputy": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Search for a basic land or a Desert?",
          fx.search({ types: ["Land"], anyOf: [{ basic: true }, { subtype: "Desert" }] }, { to: "libraryTop" }),
        ),
        { label: "Land on top of your library" },
      ),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 1, 0)],
        label: "+1/+0",
      }),
    ],
  },
  "Sterling Hound": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" })] },
  "Tomb Trawler": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you", "card")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "A card on the bottom of your library",
      }),
    ],
  },

  // --- Lands -----------------------------------------------------------------
  "Abraded Bluffs": desertDual("R", "W"),
  "Bristling Backwoods": desertDual("R", "G"),
  "Creosote Heath": desertDual("G", "W"),
  "Eroded Canyon": desertDual("U", "R"),
  "Festering Gulch": desertDual("B", "G"),
  "Forlorn Flats": desertDual("W", "B"),
  "Jagged Barrens": desertDual("B", "R"),
  "Lonely Arroyo": desertDual("W", "U"),
  "Lush Oasis": desertDual("G", "U"),
  "Soured Springs": desertDual("U", "B"),
  "Arid Archway": {
    abilities: [
      entersWith({ tapped: true }),
      // The land is not targeted (chosen on resolution) and can be this one; another Desert returned: surveil 1.
      triggered(
        when.entersSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"] }), ref.you, "land", {
            prompt: "Choose the land to return to hand",
          }),
          fx.bounce(ref.stored("land")),
          fx.when(cond.refMatches(ref.stored("land"), { subtype: "Desert", other: true }), fx.surveil(1)),
        ],
        { label: "Return a land" },
      ),
      manaAbility("C", 2),
    ],
  },
  "Conduit Pylons": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
    ],
  },
  "Mirage Mesa": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
  "Sandstorm Verge": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["cantBlock"])],
        label: "Can't block",
      }),
    ],
  },
  "Bucolic Ranch": {
    abilities: [
      manaAbility("C"),
      manaAbility(ALL_COLORS, 1, { restriction: { spell: { subtype: "Mount" } } }),
      activated({
        mana: "{3}",
        tap: true,
        // "If you don't put it into your hand, you may put it on the bottom of your library."
        effects: [
          fx.lookAtTop(1, { filter: { subtype: "Mount" }, count: 1, rest: "top", store: "m" }),
          fx.when(
            cond.not(cond.v("m")),
            fx.may("Put the top card on the bottom of your library?", [
              fx.moveTo(ref.libraryTop(ref.you), { to: "libraryBottom" }),
            ]),
          ),
        ],
        label: "A Mount from the top into your hand",
      }),
    ],
  },
  "Blooming Marsh": fastland("B", "G"),
  "Botanical Sanctum": fastland("G", "U"),
  "Concealed Courtyard": fastland("W", "B"),
  "Inspiring Vantage": fastland("R", "W"),
  "Spirebluff Canal": fastland("U", "R"),
};
