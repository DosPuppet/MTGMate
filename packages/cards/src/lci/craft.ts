/** The Lost Caverns of Ixalan — cartes à fabriquer (Craft with …) et leurs versos. Scripts par nom de face. */
import {
  ARTIFACT_ENTERED,
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  craft,
  descend,
  entersWith,
  fx,
  GNOME,
  GOLEM_4,
  manaAbility,
  mode,
  ref,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ARTIFACT = { filter: { types: ["Artifact" as const] }, count: 1 };
const CREATURE = { filter: { types: ["Creature" as const] }, count: 1 };
const ARTIFACT_OR_CREATURE_TARGET = targetObj("t", ARTIFACT_OR_CREATURE, "artefact ou créature");
const mayMillTwo = [...fx.may("Meuler deux cartes ?", fx.mill(2))];

export const CRAFT: Record<string, CardScript> = {
  // --- Blanc ------------------------------------------------------------------
  "Clay-Fired Bricks": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true, subtype: "Plains" }), fx.gainLife(2)], {
        label: "Plaine de base en main, +2 PV",
      }),
      craft("{5}{W}{W}", ARTIFACT),
    ],
  },
  "Cosmium Kiln": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME, 2)], { label: "Deux Gnomes 1/1" }),
      staticAbility(CREATURE_YOU_CONTROL, { power: 1, toughness: 1 }, { label: "Vos créatures +1/+1" }),
    ],
  },
  "Market Gnome": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 PV, piochez" }),
      triggered({ on: "leaves", who: "self", to: "exile", whileCrafting: true }, [fx.gainLife(1), fx.draw(1)], {
        label: "Exilé pour une fabrication : +1 PV, piochez",
      }),
    ],
  },
  "Oteclan Landmark": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }), craft("{2}{W}", ARTIFACT)],
  },
  "Oteclan Levitator": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["flying"])], {
        targets: [target.creature("t", { attacking: true, notKeyword: "flying" })],
        label: "Vol",
      }),
    ],
  },
  "Spring-Loaded Sawblades": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t", { tapped: true, controller: "opponent" })],
        label: "5 blessures",
      }),
      craft("{3}{W}", ARTIFACT),
    ],
  },
  "Bladewheel Chariot": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Artifact"] }, count: 2 },
        effects: [fx.animateVehicle()],
        label: "Engagez deux artefacts : devient une créature",
      }),
    ],
  },
  // --- Bleu -------------------------------------------------------------------
  "Braided Net": {
    abilities: [
      entersWith({ counters: 3, counterKind: "net", label: "Arrive avec trois marqueurs de filet" }),
      activated({
        tap: true,
        removeCounters: { kind: "net", n: 1 },
        targets: [target.nonland("t", { other: true })],
        effects: [fx.tap(ref.target()), fx.modify(ref.target(), { addKeywords: ["noActivatedAbilities"] })],
        label: "Engagez un permanent non-terrain",
      }),
      craft("{1}{U}", ARTIFACT),
    ],
  },
  "Braided Quipu": {
    abilities: [
      activated({
        mana: "{3}{U}",
        tap: true,
        effects: [
          fx.draw(amount.count({ types: ["Artifact"], controller: "you" })),
          fx.moveTo(ref.self, { to: "libraryTop", fromTop: 3 }),
        ],
        label: "Une carte par artefact, puis troisième depuis le dessus",
      }),
    ],
  },
  "Inverted Iceberg": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(1), fx.draw(1)], { label: "Meulez une carte, piochez-en une" }),
      craft("{4}{U}{U}", ARTIFACT),
    ],
  },
  "Iceberg Titan": {
    abilities: [
      triggeredModal(
        when.attacksSelf,
        [
          mode("Engagez un artefact ou une créature", [ARTIFACT_OR_CREATURE_TARGET], [fx.tap(ref.target())]),
          mode("Dégagez un artefact ou une créature", [ARTIFACT_OR_CREATURE_TARGET], [fx.untap(ref.target())]),
        ],
        { label: "Engagez ou dégagez" },
      ),
    ],
  },
  "Lodestone Needle": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)], {
        targets: [target.optional(ARTIFACT_OR_CREATURE_TARGET)],
        label: "Engagez-le, deux marqueurs d'étourdissement",
      }),
      craft("{2}{U}", ARTIFACT),
    ],
  },
  "Guidestone Compass": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.explore(ref.target())],
        label: "Une créature explore",
      }),
    ],
  },
  "Waterlogged Hulk": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(1)], label: "Meulez une carte" }),
      craft("{3}{U}", { filter: { subtype: "Island" }, count: 1 }),
    ],
  },
  "Watertight Gondola": {
    abilities: [
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: descend(8), label: "Descente 8 — imblocable" }),
    ],
  },
  // --- Noir -------------------------------------------------------------------
  "Tithing Blade": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        label: "Chaque adversaire sacrifie une créature",
      }),
      craft("{4}{B}", CREATURE),
    ],
  },
  "Consuming Sepulcher": { abilities: [triggered(when.yourUpkeep, [...fx.drain(1)], { label: "Drain 1" })] },
  "Visage of Dread": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target(), { filter: ARTIFACT_OR_CREATURE, chooser: "controller" })], {
        targets: [target.player("t", "opponent")],
        label: "Défausse d'un artefact ou d'une créature",
      }),
      craft("{5}{B}", { filter: { types: ["Creature"] }, count: 2 }),
    ],
  },
  "Dread Osseosaur": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) => triggered(t, mayMillTwo, { label: "Meulez deux cartes" })),
  },
  // --- Rouge ------------------------------------------------------------------
  "Dire Flail": {
    abilities: [staticAbility("attached", { power: 2 }, { label: "+2/+0" }), craft("{3}{R}{R}", ARTIFACT)],
  },
  "Dire Blunderbuss": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(
        when.attacks({ attachedToSource: true }),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(
            cond.v("s"),
            fx.reflexive([target.creature()], [fx.damage(amount.powerOf(ref.eventObject), ref.target(), ref.eventObject)]),
          ),
        ],
        { label: "Sacrifiez un artefact : blessures égales à sa force" },
      ),
    ],
  },
  "Idol of the Deep King": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 blessures" }),
      craft("{2}{R}", ARTIFACT),
    ],
  },
  "Sovereign's Macuahuitl": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Saheeli's Lattice": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))], {
        label: "Défaussez : piochez deux cartes",
      }),
      craft("{4}{R}", { filter: { subtype: "Dinosaur" }, count: 1, orMore: true }),
    ],
  },
  "Mastercraft Raptor": { cdaPower: amount.linkedTotalPower },
  // --- Vert -------------------------------------------------------------------
  "Jade Seedstones": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target())], {
        targets: [{ ...target.upTo(3, target.creature("t", { controller: "you" })), optional: false }],
        label: "Répartissez trois marqueurs +1/+1",
      }),
      craft("{5}{G}{G}", { ...CREATURE, preferHighManaValue: true }),
    ],
  },
  "Jadeheart Attendant": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(amount.manaValueOf(ref.linked))], {
        label: "PV égaux à la valeur de mana de la carte exilée",
      }),
    ],
  },
  "Kaslem's Stonetree": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(6, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "bottom" })],
        { label: "Un terrain engagé parmi les six cartes du dessus" },
      ),
      craft("{5}{G}", { filter: { subtype: "Cave" }, count: 1 }),
    ],
  },
  // --- Multicolore et incolore ----------------------------------------------------
  "Master's Guide-Mural": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(GOLEM_4)], { label: "Golem 4/4" }), craft("{4}{W}{W}{U}", ARTIFACT)],
  },
  "Master's Manufactory": {
    abilities: [
      activated({
        tap: true,
        activationCondition: ARTIFACT_ENTERED,
        effects: [fx.createTokens(GOLEM_4)],
        label: "Golem 4/4",
      }),
    ],
  },
  "Sunbird Standard": {
    abilities: [manaAbility(["W", "U", "B", "R", "G"]), craft("{5}", { count: 1, orMore: true, distinctColors: true })],
  },
  "Sunbird Effigy": {
    cdaPT: amount.linkedColors,
    abilities: [
      activated({
        tap: true,
        effects: [{ op: "addManaColorsAmong", filter: {}, linked: true }],
        label: "Un mana de chaque couleur des cartes exilées",
      }),
    ],
  },
  "Throne of the Grim Captain": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(2)], label: "Meulez deux cartes" }),
      craft("{4}", {
        count: 4,
        each: [{ subtype: "Dinosaur" }, { subtype: "Merfolk" }, { subtype: "Pirate" }, { subtype: "Vampire" }],
      }),
    ],
  },
  "The Grim Captain": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.eachOpponent, { nonland: true }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield", tapped: true, attacking: true, underYourControl: true },
            { count: 1, min: 0, pool: ref.linked, prompt: "Carte de créature exilée à mettre en jeu attaquante" },
          ),
        ],
        { label: "Sacrifice adverse ; une créature exilée attaque" },
      ),
    ],
  },
};
