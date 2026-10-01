/** Lorwyn Eclipsed — cartes rouges. */
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  entersWith,
  eventReplacement,
  fx,
  GOBLIN_BR,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

const ELEMENTAL = { subtype: "Elemental" };
const ELEMENTAL_YOU_CONTROL = { types: ["Creature" as const], subtype: "Elemental", controller: "you" as const };

/** « Exilez les N cartes du dessus de votre bibliothèque. Jusqu'à la fin de votre prochain tour, vous pouvez les jouer. » */
const exileTopPlayable = (n: Parameters<typeof fx.exileTop>[1], name = "x") => [
  fx.exileTop(ref.you, n, name),
  fx.grantPlay(ref.stored(name), { untilYourNextTurn: true }),
];

/** « Vous pouvez flétrir N. Si vous le faites, … » */
const mayBlight = (n: number, ...effects: Parameters<typeof fx.when>[1][]) => [
  ...fx.may(`Flétrir ${n} ?`, fx.blight(n, ref.you, "blighted")),
  ...fx.when(cond.v("blighted"), ...effects),
];

/**
 * « Créature avec une force et une endurance totales de 5 ou moins » : F ≤ k et E ≤ 5 − k pour un k de 0 à 5 (exact pour
 * les forces positives ou nulles).
 */
const TOTAL_PT_5: { anyOf: { maxPower: number; maxToughness: number }[] } = {
  anyOf: [0, 1, 2, 3, 4, 5].map((k) => ({ maxPower: k, maxToughness: 5 - k })),
};

export const RED: Record<string, CardScript> = {
  Lavaleaper: {
    abilities: [
      staticAbility({ types: ["Creature"] }, { addKeywords: ["haste"] }, { label: "Toutes les créatures ont la célérité" }),
      eventReplacement({
        event: "mana",
        source: { types: ["Land"], basic: true },
        modify: { add: 1 },
        label: "Un terrain de base engagé pour du mana en produit un de plus",
      }),
    ],
  },
  // --- Ashling (recto-verso) ---------------------------------------------------
  "Ashling, Rekindled": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
          label: "Vous pouvez défausser une carte ; si vous le faites, piochez une carte",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{U}", "Payer {U} pour transformer Ashling ?", fx.transform()), {
        label: "Vous pouvez payer {U} : transformez Ashling",
      }),
    ],
  },
  "Ashling, Rimebound": {
    abilities: [
      // « Ajoutez deux mana d'une même couleur ; ne le dépensez que pour des sorts de VM 4 ou plus » (mana restreint).
      ...[when.transformsSelf, when.step("main1", "you")].map((w) =>
        triggered(w, [fx.addManaChoice(2, undefined, { spell: { minManaValue: 4 } })], {
          label: "Deux mana d'une même couleur, pour des sorts de VM 4 ou plus",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{R}", "Payer {R} pour transformer Ashling ?", fx.transform()), {
        label: "Vous pouvez payer {R} : transformez Ashling",
      }),
    ],
  },
  "Goliath Daydreamer": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"] }, fromHand: true },
        [fx.exileOnResolveWith(ref.eventObject, "dream")],
        { label: "Le sort sera exilé avec un marqueur de rêve au lieu d'aller au cimetière" },
      ),
      triggered(
        when.attacksSelf,
        [fx.castNow(ref.filtered(ref.exiledCardsOf(ref.you), { withCounter: "dream" }), { free: true })],
        { label: "Lancez gratuitement un sort exilé avec un marqueur de rêve" },
      ),
    ],
  },
  // Vol et flétrissure lus dans le texte.
  "Spinerock Tyrant": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"] }, singleTarget: true },
        fx.may(
          "Copier ce sort ? (les deux sorts gagnent la flétrissure)",
          fx.modify(ref.eventObject, { addKeywords: ["wither"] }),
          fx.copySpell(ref.eventObject, 1),
        ),
        { label: "Copiez le sort à cible unique ; les deux gagnent la flétrissure" },
      ),
    ],
  },
  "Lasting Tarfire": {
    abilities: [
      triggered(when.eachEndStep, [fx.damage(2, ref.eachOpponent)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "counters", who: "you", types: ["Creature"] }), 1),
        label: "Vous avez mis un marqueur sur une créature ce tour-ci : 2 blessures à chaque adversaire",
      }),
    ],
  },
  // Double initiative lue dans le texte ; Vivid : force égale au nombre de couleurs parmi vos permanents.
  Squawkroaster: { cdaPower: amount.colorsAmong() },
  // « En coût additionnel, flétrissez X » : lu dans le texte (`xCost: "blight"`, X au plus la plus grande endurance).
  "Soul Immolation": {
    spell: spell([], [fx.damageAll(amount.x, { types: ["Creature"], controller: "opponent" }, ref.eachOpponent)]),
  },
  "Champion of the Path": champion("Elemental", [
    triggered(
      when.enters({ types: ["Creature"], subtype: "Elemental", controller: "you", other: true }),
      [fx.damage(amount.powerOf(ref.eventObject), ref.eachOpponent, ref.eventObject)],
      { label: "L'Élémental inflige des blessures égales à sa force à chaque adversaire" },
    ),
  ]),
  "Boldwyr Aggressor": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Giant", controller: "you", other: true },
        { addKeywords: ["doubleStrike"] },
        { label: "Vos autres Géants ont la double initiative" },
      ),
    ],
  },
  "Boneclub Berserker": {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { per: { types: ["Creature"], subtype: "Goblin", controller: "you", other: true }, label: "+2/+0 par autre Gobelin" },
      ),
    ],
  },
  "Boulder Dash": {
    spell: spell(
      [target.any("a"), { ...target.any("b"), otherThan: ["a"], label: "une autre cible" }],
      [fx.damage(2, ref.target("a")), fx.damage(1, ref.target("b"))],
    ),
  },
  "Brambleback Brute": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs −1/−1" }),
      // « Retirez un marqueur de cette créature » : les marqueurs −1/−1, les seuls qu'elle porte d'ordinaire.
      activated({
        mana: "{1}{R}",
        removeCounters: { kind: "any", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })],
        label: "Une créature ne peut pas bloquer ce tour-ci",
      }),
    ],
  },
  "Burning Curiosity": {
    // Flétrir 1 en coût additionnel facultatif : lu dans le texte (kicker « blight »).
    spell: spell([], exileTopPlayable(amount.kicked(3, 2))),
  },
  "Cinder Strike": {
    // Flétrir 1 en coût additionnel facultatif : lu dans le texte (kicker « blight »).
    spell: spell([target.creature()], [fx.damage(amount.kicked(4, 2), ref.target())]),
  },
  "Collective Inferno": {
    // Convocation lue dans le texte.
    chooseOnEnter: "creatureType",
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you", subtypeChosen: true },
        modify: { times: 2 },
        label: "Vos sources du type choisi infligent le double de blessures",
      }),
    ],
  },
  "Elder Auntie": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(GOBLIN_BR)], { label: "Un jeton Gobelin 1/1" })],
  },
  "End-Blaze Epiphany": {
    // « Quand cette créature meurt ce tour-ci » : emblème du tour lié à la cible (comme Turn Inside Out).
    spell: spell(
      [target.creature()],
      [
        fx.damage(amount.x, ref.target()),
        fx.emblem(
          "End-Blaze Epiphany",
          "When that creature dies this turn, exile a number of cards from the top of your library equal to its power, then choose a card exiled this way. Until the end of your next turn, you may play that card.",
          [
            triggered(
              when.dies({ linkedToSource: true }),
              [
                fx.exileTop(ref.you, amount.powerOf(ref.eventObject), "x"),
                fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true, oneOf: true }),
              ],
              { label: "Exilez autant de cartes que sa force ; vous pouvez jouer l'une d'elles" },
            ),
          ],
          false,
          true,
          "e",
        ),
        fx.link(ref.target(), ref.stored("e")),
      ],
    ),
  },
  "Enraged Flamecaster": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.damage(2, ref.eachOpponent)], {
        label: "2 blessures à chaque adversaire",
      }),
    ],
  },
  "Explosive Prodigy": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.colorsAmong(), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Vivid : X blessures à une créature adverse",
      }),
    ],
  },
  "Feed the Flames": {
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },
  "Flame-Chain Mauler": {
    abilities: [activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 1, 0, ["menace"])], label: "+1/+0 et la menace" })],
  },
  Flamebraider: {
    // Approximation : deux mana d'une même couleur (et non « en toute combinaison de couleurs »).
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        restriction: { spell: ELEMENTAL, abilityOfSource: ELEMENTAL },
      }),
    ],
  },
  "Flamekin Gildweaver": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Un Trésor" })],
  },
  Giantfall: {
    spell: modal(
      mode(
        "Votre créature inflige des blessures égales à sa force à une créature adverse",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode("Détruit un artefact", [target.permanent("c", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target("c"))]),
    ),
  },
  Goatnap: {
    spell: spell(
      [target.creature()],
      [
        fx.gainControl(ref.target()),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
        ...fx.when(cond.targetMatches("t", { subtype: "Goat" }), fx.pump(ref.target(), 3, 0)),
      ],
    ),
  },
  "Gristle Glutton": {
    abilities: [
      activated({
        tap: true,
        blight: 1,
        effects: [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        label: "Défaussez une carte, puis piochez",
      }),
    ],
  },
  "Hexing Squelcher": {
    // Sa propre garde (« Payez 2 PV ») est lue dans le texte.
    cantBeCountered: true,
    abilities: [
      // Approximation : seuls vos sorts d'éphémère, de rituel et de créature sont protégés.
      playerStatic({ protectSpells: true, protectCreatureSpells: true, label: "Vos sorts ne peuvent pas être contrecarrés" }),
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { addKeywords: ["ward"], addAbilities: [wardAbility({ life: 2 })] },
        { label: "Vos autres créatures ont « Garde — Payez 2 PV »" },
      ),
    ],
  },
  "Impolite Entrance": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["trample", "haste"]), fx.draw(1)]),
  },
  "Kindle the Inner Flame": {
    // Flashback {1}{R} en contemplant trois Élémentaux (vos Élémentaux et les cartes d'Élémental de votre main).
    flashback: "{1}{R}",
    castCondition: cond.any(
      cond.not(cond.amountAtLeast(amount.countIn("graveyard", { self: true }), 1)),
      cond.amountAtLeast(amount.plus(amount.count(ELEMENTAL_YOU_CONTROL), amount.countIn("hand", ELEMENTAL)), 3),
    ),
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
    ),
  },
  "Kulrath Zealot": {
    // Recyclage de terrain de base lu dans le texte.
    abilities: [
      triggered(when.entersSelf, exileTopPlayable(1), {
        label: "Exilez la carte du dessus ; jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Meek Attack": {
    abilities: [
      activated({
        mana: "{1}{R}",
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"], ...TOTAL_PT_5 },
            { to: "battlefield" },
            { min: 0, store: "m", prompt: "Créature de force et d'endurance totales de 5 ou moins" },
          ),
          fx.modify(ref.stored("m"), { addKeywords: ["haste"] }, "permanent"),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("m") }),
        ],
        label: "Mettez une petite créature de votre main sur le champ de bataille",
      }),
    ],
  },
  "Reckless Ransacking": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 2), fx.createTokens(TREASURE)]),
  },
  "Scuzzback Scrounger": {
    abilities: [
      triggered(when.step("main1", "you"), mayBlight(1, fx.createTokens(TREASURE)), {
        label: "Flétrir 1 : un Trésor",
      }),
    ],
  },
  "Sizzling Changeling": {
    abilities: [
      triggered(when.diesSelf, exileTopPlayable(1), {
        label: "Exilez la carte du dessus ; jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Soulbright Seeker": {
    costReduction: beholdOrPay("Elemental", 2),
    abilities: [
      activated({
        mana: "{R}",
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["trample"]),
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))), fx.addMana("R", "R", "R", "R")),
        ],
        label: "Le piétinement ; à la troisième résolution du tour, {R}{R}{R}{R}",
      }),
    ],
  },
  "Sourbread Auntie": {
    abilities: [
      triggered(when.entersSelf, mayBlight(2, fx.createTokens(GOBLIN_BR, 2)), {
        label: "Flétrir 2 : deux jetons Gobelin 1/1",
      }),
    ],
  },
  "Sting-Slinger": {
    abilities: [
      activated({
        mana: "{1}{R}",
        tap: true,
        blight: 1,
        effects: [fx.damage(2, ref.eachOpponent)],
        label: "2 blessures à chaque adversaire",
      }),
    ],
  },
  Tweeze: {
    spell: spell(
      [target.any()],
      [fx.damage(3, ref.target()), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
    ),
  },
  "Warren Torchmaster": {
    abilities: [
      triggered(when.yourCombat, mayBlight(1, fx.reflexive([target.creature()], [fx.pump(ref.target(), 0, 0, ["haste"])])), {
        label: "Flétrir 1 : une créature gagne la célérité",
      }),
    ],
  },
};
