/** The Lost Caverns of Ixalan — colorless artifacts and lands. */
import {
  type Color,
  type Effect,
  type Keyword,
  type ManaAbilityDef,
  msg,
  type ObjectFilter,
  type TargetSpec,
} from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  CAVE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  entersWith,
  fx,
  GNOME,
  MAP,
  manaAbility,
  playerStatic,
  ref,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const LAND_OR_CAVE: ObjectFilter = { anyOf: [BASIC_LAND, { types: ["Land"], subtype: "Cave" }] };

/** "{N}, {T}: Add one mana of any color." */
const paidMana = (mana: string): ManaAbilityDef => ({ ...manaAbility([...ANY]), cost: { tap: true, mana: cost(mana) } });

/** "Restless" lands: tapped, two-colored, animated, with an attack trigger. */
const restless = (
  colors: [Color, Color],
  animate: { mana: string; subtype: string; power: number; toughness: number; keywords?: Keyword[] },
  onAttack: { effects: Effect[]; targets?: TargetSpec[]; label: string },
): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Enters tapped" }),
    manaAbility(colors),
    activated({
      mana: animate.mana,
      effects: [
        fx.modify(ref.self, {
          addTypes: ["Creature"],
          addSubtypes: [animate.subtype],
          setPower: animate.power,
          setToughness: animate.toughness,
          setColors: colors,
          addKeywords: animate.keywords,
        }),
      ],
      label: msg("Becomes a {power}/{toughness} creature", { power: animate.power, toughness: animate.toughness }),
    }),
    triggered(when.attacksSelf, onAttack.effects, { targets: onAttack.targets, label: onAttack.label }),
  ],
});

/** "Hidden" Caves: tapped; "{4}{C}, {T}, Sacrifice this land: Discover 4. Activate only as a sorcery." */
const hiddenCave = (c: Color): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Enters tapped" }),
    manaAbility(c),
    activated({
      mana: `{4}{${c}}`,
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      effects: [fx.discover(4)],
      label: "Discover 4",
    }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  "Careening Mine Cart": { abilities: [triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Treasure" })] },
  "Cartographer's Companion": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MAP)], { label: "Map token" })],
  },
  "Compass Gnome": {
    abilities: [
      triggered(when.entersSelf, [fx.search(LAND_OR_CAVE, { to: "libraryTop" })], {
        label: "Basic land or Cave on top",
      }),
    ],
  },
  "Disruptor Wanderglyph": {
    abilities: [
      triggered(when.attacksSelf, [fx.exileCard(ref.target())], {
        targets: [target.cardInGraveyard("t", {}, "opponent", "card in an opponent's graveyard")],
        label: "Exile a card from an opponent's graveyard",
      }),
    ],
  },
  "Hoverstone Pilgrim": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Card from a graveyard on the bottom of the library",
      }),
    ],
  },
  "Hunter's Blowgun": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      staticAbility("attached", { addKeywords: ["deathtouch"] }, { condition: cond.yourTurn, label: "Deathtouch (your turn)" }),
      staticAbility("attached", { addKeywords: ["reach"] }, { condition: cond.not(cond.yourTurn), label: "Reach (otherwise)" }),
    ],
  },
  "Runaway Boulder": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(6, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "6 damage",
      }),
    ],
  },
  "Scampering Surveyor": {
    abilities: [
      triggered(when.entersSelf, [fx.search(LAND_OR_CAVE, { to: "battlefield", tapped: true })], {
        label: "Tapped basic land or Cave",
      }),
    ],
  },
  "Tarrian's Soulcleaver": {
    abilities: [
      staticAbility("attached", { addKeywords: ["vigilance"] }, { label: "Vigilance" }),
      triggered(
        when.zoneChange(["battlefield"], {
          to: ["graveyard"],
          filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], other: true },
          whose: "any",
        }),
        [fx.addCounters(ref.attached, 1)],
        { label: "+1/+1 counter on the equipped creature" },
      ),
    ],
  },
  "Threefold Thunderhulk": {
    abilities: [
      entersWith({ counters: 3, label: "Enters with three +1/+1 counters" }),
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [fx.createTokens(GNOME, amount.powerOf(ref.self))], { label: "Gnomes (its power)" }),
      ),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Treasure Map": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [
          fx.scry(1),
          fx.counters(ref.self, "landmark", 1),
          ...fx.when(
            cond.counterAtLeast("landmark", 3),
            fx.removeCounters(ref.self, 3, "landmark"),
            fx.transform(),
            fx.createTokens(TREASURE, 3),
          ),
        ],
        label: "Scry 1, landmark counter",
      }),
    ],
  },
  "Treasure Cove": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Treasure" } },
        effects: [fx.draw(1)],
        label: "Sacrifice a Treasure: draw",
      }),
    ],
  },
  // --- Lands --------------------------------------------------------------------
  "Captivating Cave": {
    abilities: [
      manaAbility("C"),
      paidMana("{1}"),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 2)],
        label: "Two +1/+1 counters",
      }),
    ],
  },
  "Cavernous Maw": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        activationCondition: cond.amountAtLeast(
          amount.plus(
            amount.count({ ...CAVE, controller: "you", other: true }),
            amount.countIn("graveyard", { subtype: "Cave" }),
          ),
          3,
        ),
        effects: [fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 3, setToughness: 3 })],
        label: msg("Becomes a {power}/{toughness} creature", { power: 3, toughness: 3 }),
      }),
    ],
  },
  "Forgotten Monument": {
    abilities: [
      manaAbility("C"),
      staticAbility(
        { ...CAVE, controller: "you", other: true },
        { addAbilities: [manaAbility([...ANY], 1, { payLife: 1 })] },
        { label: "Other Caves: {T}, 1 life: one mana of any color" },
      ),
    ],
  },
  "Promising Vein": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Tapped basic land",
      }),
    ],
  },
  "Restless Anchorage": restless(
    ["W", "U"],
    { mana: "{1}{W}{U}", subtype: "Bird", power: 2, toughness: 3, keywords: ["flying"] },
    { effects: [fx.createTokens(MAP)], label: "Map token" },
  ),
  "Restless Prairie": restless(
    ["G", "W"],
    { mana: "{2}{G}{W}", subtype: "Llama", power: 3, toughness: 3 },
    { effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, other: true }, 1, 1)], label: "Other creatures +1/+1" },
  ),
  "Restless Reef": restless(
    ["U", "B"],
    { mana: "{2}{U}{B}", subtype: "Shark", power: 4, toughness: 4, keywords: ["deathtouch"] },
    { effects: [fx.mill(4, ref.target())], targets: [target.player()], label: "A player mills four cards" },
  ),
  "Restless Ridgeline": restless(
    ["R", "G"],
    { mana: "{2}{R}{G}", subtype: "Dinosaur", power: 3, toughness: 4 },
    {
      effects: [fx.pump(ref.target(), 2, 0), fx.untap(ref.target())],
      targets: [target.creature("t", { attacking: true, other: true })],
      label: "+2/+0 and untap it",
    },
  ),
  "Restless Vents": restless(
    ["B", "R"],
    { mana: "{1}{B}{R}", subtype: "Insect", power: 2, toughness: 3, keywords: ["menace"] },
    {
      effects: [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
      label: "Discard, then draw a card",
    },
  ),
  "Volatile Fault": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", { types: ["Land"], basic: false, controller: "opponent" }, "opponent's nonbasic land")],
        effects: [
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target())),
          fx.createTokens(TREASURE),
        ],
        label: "Destroy an opponent's nonbasic land",
      }),
    ],
  },
  "Buried Treasure": {
    abilities: [
      manaAbility([...ANY], 1, { sacrifice: true }),
      activated({
        mana: "{5}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.discover(5)],
        label: "Exile it from the graveyard: discover 5",
      }),
    ],
  },
  "Chimil, the Inner Sun": {
    abilities: [
      playerStatic({ uncounterable: {}, label: "Your spells can't be countered" }),
      triggered(when.yourEndStep, [fx.discover(5)], { label: "Discover 5" }),
    ],
  },
  "Digsite Conservator": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [{ ...target.upTo(4, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        effects: [fx.exileCard(ref.target())],
        label: "Exile up to four cards from a graveyard",
      }),
      triggered(when.diesSelf, [...fx.mayPay("{4}", "Pay {4} to discover 4?", fx.discover(4))], {
        label: "{4}: discover 4",
      }),
    ],
  },
  "Swashbuckler's Whip": {
    abilities: [
      staticAbility(
        "attached",
        {
          addKeywords: ["reach"],
          addAbilities: [
            activated({
              mana: "{2}",
              tap: true,
              targets: [targetObj("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "artifact or creature")],
              effects: [fx.tap(ref.target())],
              label: "Tap an artifact or creature",
            }),
            activated({ mana: "{8}", tap: true, effects: [fx.discover(10)], label: "Discover 10" }),
          ],
        },
        { label: "Reach, tap, discover 10" },
      ),
    ],
  },
  "Hidden Cataract": hiddenCave("U"),
  "Hidden Courtyard": hiddenCave("W"),
  "Hidden Necropolis": hiddenCave("B"),
  "Hidden Nursery": hiddenCave("G"),
  "Hidden Volcano": hiddenCave("R"),
};
