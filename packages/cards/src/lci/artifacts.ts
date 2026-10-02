/** The Lost Caverns of Ixalan — artefacts incolores et terrains. */
import type { Color, Effect, Keyword, ManaAbilityDef, ObjectFilter, TargetSpec } from "@mtgx/engine";
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

/** « {N}, {T} : ajoutez un mana de n'importe quelle couleur. » */
const paidMana = (mana: string): ManaAbilityDef => ({ ...manaAbility([...ANY]), cost: { tap: true, mana: cost(mana) } });

/** Terrains « Restless » : engagés, bicolores, animables, avec un déclencheur d'attaque. */
const restless = (
  colors: [Color, Color],
  animate: { mana: string; subtype: string; power: number; toughness: number; keywords?: Keyword[] },
  onAttack: { effects: Effect[]; targets?: TargetSpec[]; label: string },
): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Arrive engagé" }),
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
      label: `Devient une créature ${animate.power}/${animate.toughness}`,
    }),
    triggered(when.attacksSelf, onAttack.effects, { targets: onAttack.targets, label: onAttack.label }),
  ],
});

/** Cavernes « Hidden » : engagées ; « {4}{C}, {T}, sacrifiez ce terrain : découverte 4. Rituel. » */
const hiddenCave = (c: Color): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Arrive engagé" }),
    manaAbility(c),
    activated({
      mana: `{4}{${c}}`,
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      effects: [fx.discover(4)],
      label: "Découverte 4",
    }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  "Careening Mine Cart": { abilities: [triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })] },
  "Cartographer's Companion": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MAP)], { label: "Jeton Carte" })],
  },
  "Compass Gnome": {
    abilities: [
      triggered(when.entersSelf, [fx.search(LAND_OR_CAVE, { to: "libraryTop" })], {
        label: "Terrain de base ou Caverne sur le dessus",
      }),
    ],
  },
  "Disruptor Wanderglyph": {
    abilities: [
      triggered(when.attacksSelf, [fx.exileCard(ref.target())], {
        targets: [target.cardInGraveyard("t", {}, "opponent", "carte du cimetière d'un adversaire")],
        label: "Exilez une carte d'un cimetière adverse",
      }),
    ],
  },
  "Hoverstone Pilgrim": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Carte d'un cimetière sous la bibliothèque",
      }),
    ],
  },
  "Hunter's Blowgun": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      staticAbility(
        "attached",
        { addKeywords: ["deathtouch"] },
        { condition: cond.yourTurn, label: "Contact mortel (votre tour)" },
      ),
      staticAbility("attached", { addKeywords: ["reach"] }, { condition: cond.not(cond.yourTurn), label: "Portée (sinon)" }),
    ],
  },
  "Runaway Boulder": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(6, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "6 blessures",
      }),
    ],
  },
  "Scampering Surveyor": {
    abilities: [
      triggered(when.entersSelf, [fx.search(LAND_OR_CAVE, { to: "battlefield", tapped: true })], {
        label: "Terrain de base ou Caverne engagé",
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
        { label: "Marqueur +1/+1 sur la créature équipée" },
      ),
    ],
  },
  "Threefold Thunderhulk": {
    abilities: [
      entersWith({ counters: 3, label: "Arrive avec trois marqueurs +1/+1" }),
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [fx.createTokens(GNOME, amount.powerOf(ref.self))], { label: "Gnomes (sa force)" }),
      ),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Marqueur +1/+1",
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
        label: "Regard 1, marqueur de repère",
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
        label: "Sacrifiez un Trésor : piochez",
      }),
    ],
  },
  // --- Terrains -----------------------------------------------------------------
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
        label: "Deux marqueurs +1/+1",
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
        label: "Devient une créature 3/3",
      }),
    ],
  },
  "Forgotten Monument": {
    abilities: [
      manaAbility("C"),
      staticAbility(
        { ...CAVE, controller: "you", other: true },
        { addAbilities: [manaAbility([...ANY], 1, { payLife: 1 })] },
        { label: "Autres Cavernes : {T}, 1 PV : un mana de n'importe quelle couleur" },
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
        label: "Terrain de base engagé",
      }),
    ],
  },
  "Restless Anchorage": restless(
    ["W", "U"],
    { mana: "{1}{W}{U}", subtype: "Bird", power: 2, toughness: 3, keywords: ["flying"] },
    { effects: [fx.createTokens(MAP)], label: "Jeton Carte" },
  ),
  "Restless Prairie": restless(
    ["G", "W"],
    { mana: "{2}{G}{W}", subtype: "Llama", power: 3, toughness: 3 },
    { effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, other: true }, 1, 1)], label: "Autres créatures +1/+1" },
  ),
  "Restless Reef": restless(
    ["U", "B"],
    { mana: "{2}{U}{B}", subtype: "Shark", power: 4, toughness: 4, keywords: ["deathtouch"] },
    { effects: [fx.mill(4, ref.target())], targets: [target.player()], label: "Un joueur meule quatre cartes" },
  ),
  "Restless Ridgeline": restless(
    ["R", "G"],
    { mana: "{2}{R}{G}", subtype: "Dinosaur", power: 3, toughness: 4 },
    {
      effects: [fx.pump(ref.target(), 2, 0), fx.untap(ref.target())],
      targets: [target.creature("t", { attacking: true, other: true })],
      label: "+2/+0 et dégagez-la",
    },
  ),
  "Restless Vents": restless(
    ["B", "R"],
    { mana: "{1}{B}{R}", subtype: "Insect", power: 2, toughness: 3, keywords: ["menace"] },
    {
      effects: [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
      label: "Défaussez, puis piochez",
    },
  ),
  "Volatile Fault": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", { types: ["Land"], nonbasic: true, controller: "opponent" }, "terrain non de base adverse")],
        effects: [
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target())),
          fx.createTokens(TREASURE),
        ],
        label: "Détruisez un terrain non de base",
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
        label: "Exilez-la du cimetière : découverte 5",
      }),
    ],
  },
  "Chimil, the Inner Sun": {
    abilities: [
      playerStatic({ uncounterable: {}, label: "Vos sorts ne peuvent pas être contrecarrés" }),
      triggered(when.yourEndStep, [fx.discover(5)], { label: "Découverte 5" }),
    ],
  },
  "Digsite Conservator": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [{ ...target.upTo(4, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        effects: [fx.exileCard(ref.target())],
        label: "Exilez jusqu'à quatre cartes d'un cimetière",
      }),
      triggered(when.diesSelf, [...fx.mayPay("{4}", "Payer {4} pour découvrir 4 ?", fx.discover(4))], {
        label: "{4} : découverte 4",
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
              targets: [targetObj("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "artefact ou créature")],
              effects: [fx.tap(ref.target())],
              label: "Engagez un artefact ou une créature",
            }),
            activated({ mana: "{8}", tap: true, effects: [fx.discover(10)], label: "Découverte 10" }),
          ],
        },
        { label: "Portée, engager, découverte 10" },
      ),
    ],
  },
  "Hidden Cataract": hiddenCave("U"),
  "Hidden Courtyard": hiddenCave("W"),
  "Hidden Necropolis": hiddenCave("B"),
  "Hidden Nursery": hiddenCave("G"),
  "Hidden Volcano": hiddenCave("R"),
};
