/** Foundations — artefacts incolores. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  FISH,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  ref,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Équipements (« Équiper {N} » est lu dans le texte) ---
  "Fishing Pole": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        tapAttached: true,
        effects: [fx.counters(ref.self, "bait", 1)],
        label: "Engager la créature équipée : marqueur d'appât",
      }),
      triggered(
        when.attachedUntaps,
        [...fx.when(cond.counterAtLeast("bait", 1), fx.counters(ref.self, "bait", -1), fx.createTokens(FISH))],
        { label: "retire un appât : Poisson 1/1" },
      ),
    ],
  },
  "Leyline Axe": {
    leyline: true,
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["doubleStrike", "trample"] },
        { label: "+1/+1, double initiative, piétinement" },
      ),
    ],
  },
  "Quick-Draw Katana": {
    abilities: [
      staticAbility(
        "attached",
        { power: 2, addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Pendant votre tour : +2/+0, initiative" },
      ),
    ],
  },
  "Adventuring Gear": {
    abilities: [triggered(when.landfall, [fx.pump(ref.attached, 2, 2)], { label: "créature équipée +2/+2" })],
  },
  "Goldvein Pick": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }),
      triggered(when.attachedDealsCombatDamageToPlayer, [fx.createTokens(TREASURE)], { label: "Trésor" }),
    ],
  },
  "Swiftfoot Boots": {
    abilities: [staticAbility("attached", { addKeywords: ["hexproof", "haste"] }, { label: "Défense talismanique et célérité" })],
  },
  "Ravenous Amulet": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        effects: [fx.draw(1), fx.counters(ref.self, "soul", 1)],
        label: "Sacrifier une créature : piochez",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.loseLife(amount.countersOn(ref.self, "soul"), ref.eachOpponent)],
        label: "Chaque adversaire perd 1 PV par marqueur d'âme",
      }),
    ],
  },
  "Scrawling Crawler": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachPlayer)], { label: "chaque joueur pioche" }),
      triggered(when.draw(undefined, "opponent"), [fx.loseLife(1, ref.eventPlayer)], { label: "perd 1 PV" }),
    ],
  },
  "Burnished Hart": {
    abilities: [
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)],
        label: "Deux terrains de base",
      }),
    ],
  },
  "Campus Guide": {
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "libraryTop" })), {
        label: "terrain de base au-dessus",
      }),
    ],
  },
  "Gleaming Barrier": { abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })] },
  Juggernaut: { keywords: ["mustAttack", "cantBeBlockedByWalls"] },
  "Meteor Golem": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "détruit un permanent",
      }),
    ],
  },
  "Solemn Simulacrum": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
        { label: "terrain de base engagé" },
      ),
      triggered(when.diesSelf, fx.may("Piocher une carte ?", fx.draw(1)), { label: "piochez une carte" }),
    ],
  },
  "Banner of Kinship": {
    chooseOnEnter: "creatureType",
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], controller: "you", subtypeChosen: true }),
        counterKind: "fellowship",
        label: "Marqueurs de camaraderie",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", subtypeChosen: true },
        { power: 1, toughness: 1 },
        { perCounter: "fellowship", label: "+1/+1 par marqueur de camaraderie" },
      ),
    ],
  },
  "Heraldic Banner": {
    chooseOnEnter: "color",
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you", colorChosen: true }, { power: 1 }, { label: "+1/+0" }),
      manaAbility(["W"], 1, { produceChosen: true }),
    ],
  },

  // --- Réimpressions ---
  "Adaptive Automaton": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility("self", { addChosenSubtype: true }, { label: "A le type choisi" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, subtypeChosen: true },
        { power: 1, toughness: 1 },
        {
          label: "Autres créatures du type choisi +1/+1",
        },
      ),
    ],
  },
  "Basilisk Collar": {
    abilities: [
      staticAbility("attached", { addKeywords: ["deathtouch", "lifelink"] }, { label: "Contact mortel et lien de vie" }),
    ],
  },
  "Cultivator's Caravan": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  "Darksteel Colossus": { shuffleIntoLibrary: true },
  "Diamond Mare": {
    chooseOnEnter: "color",
    abilities: [triggered(when.castSpell("you", { colorChosen: true }), [fx.gainLife(1)], { label: "+1 PV" })],
  },
  "Expedition Map": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] })],
        label: "Chercher un terrain",
      }),
    ],
  },
  "Feldon's Cane": {
    abilities: [
      activated({
        tap: true,
        exileSelf: true,
        effects: [fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }), fx.shuffle()],
        label: "Mélanger le cimetière dans la bibliothèque",
      }),
    ],
  },
  Fireshrieker: { abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double initiative" })] },
  "Gate Colossus": {
    keywords: ["cantBeBlockedByPowerLE2"],
    costReduction: { generic: amount.count({ subtype: "Gate", controller: "you" }) },
    abilities: [
      triggered(
        when.enters({ subtype: "Gate", controller: "you" }),
        fx.may("Remettre Gate Colossus du cimetière au-dessus de la bibliothèque ?", fx.moveTo(ref.self, { to: "libraryTop" })),
        { fromGraveyard: true, label: "revient au-dessus de la bibliothèque" },
      ),
    ],
  },
  "Gilded Lotus": { abilities: [manaAbility(["W", "U", "B", "R", "G"], 3)] },
  "Goblin Firebomb": {
    abilities: [
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", {}, "permanent")],
        effects: [fx.destroy(ref.target())],
        label: "Détruire un permanent",
      }),
    ],
  },
  "Hedron Archive": {
    abilities: [
      manaAbility("C", 2),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.draw(2)], label: "Piochez deux cartes" }),
    ],
  },
  "Mazemind Tome": {
    abilities: [
      activated({ tap: true, addCounters: { kind: "page", n: 1 }, effects: [fx.scry(1)], label: "Regard 1" }),
      activated({
        mana: "{2}",
        tap: true,
        addCounters: { kind: "page", n: 1 },
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
      triggered(when.countersPut("self", "page"), [fx.exileCard(ref.self), fx.gainLife(4)], {
        condition: cond.counterAtLeast("page", 4),
        label: "exilé, +4 PV",
      }),
    ],
  },
  "Pirate's Cutlass": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you", subtype: "Pirate" })],
        label: "s'attache à un Pirate",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Pyromancer's Goggles": {
    abilities: [manaAbility("R", 1, { rider: { spell: { ...INSTANT_SORCERY, colors: ["R"] }, effect: "copy" } })],
  },
  "Ramos, Dragon Engine": {
    abilities: [
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, amount.colorsOf(ref.eventObject))], {
        label: "un marqueur par couleur",
      }),
      activated({
        removeCounters: { kind: "+1/+1", n: 5 },
        oncePerTurn: true,
        effects: [fx.addMana("W", "W", "U", "U", "B", "B", "R", "R", "G", "G")],
        label: "Retirer 5 marqueurs : {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}",
      }),
    ],
  },
  "Sorcerous Spyglass": { chooseOnEnter: "cardName" },
  "Soul-Guide Lantern": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.cardInGraveyard("t", {}, "any")],
        label: "exile une carte d'un cimetière",
      }),
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.moveAll("graveyard", ref.eachOpponent, {}, { to: "exile" })],
        label: "Exiler les cimetières adverses",
      }),
      activated({ mana: "{1}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Steel Hellkite": {
    abilities: [
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
      activated({ mana: "{X}", oncePerTurn: true, effects: [fx.hellkite], label: "Détruire les permanents de valeur X" }),
    ],
  },
  "Three Tree Mascot": {
    keywords: ["changeling"],
    abilities: [
      activated({ mana: "{1}", oncePerTurn: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
    ],
  },
};
