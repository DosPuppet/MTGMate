/** Foundations — cartes bleues. */
import {
  activated,
  amount,
  type CardScript,
  castPermission,
  cond,
  costReducer,
  DRAKE,
  FAERIE,
  flashForAll,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  playerStatic,
  prevention,
  ref,
  SCION_OF_THE_DEEP,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Think Twice": { flashback: "{2}{U}", spell: spell([], [fx.draw(1)]) },
  Opt: { spell: spell([], [fx.scry(1), fx.draw(1)]) },
  "Arcane Epiphany": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Wizard" }) },
    spell: spell([], [fx.draw(3)]),
  },
  "Archmage of Runes": {
    abilities: [
      costReducer(INSTANT_SORCERY, 1, "Éphémères et rituels : {1} de moins"),
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Bigfin Bouncer": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "renvoie une créature adverse",
      }),
    ],
  },
  "Cephalid Inkmage": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(3)], { label: "surveillance 3" }),
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: cond.threshold, label: "Seuil : imblocable" }),
    ],
  },
  "Clinquant Skymage": {
    abilities: [triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" })],
  },
  "Drake Hatcher": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.counters(ref.self, "incubation", amount.eventAmount)], {
        label: "marqueurs d'incubation",
      }),
      activated({
        removeCounters: { kind: "incubation", n: 3 },
        effects: [fx.createTokens(DRAKE)],
        label: "Drake 2/2 volant (3 marqueurs)",
      }),
    ],
  },
  "Erudite Wizard": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" })],
  },
  "Faebloom Trick": {
    spell: spell(
      [],
      [fx.createTokens(FAERIE, 2), fx.reflexive([target.creature("t", { controller: "opponent" })], [fx.tap(ref.target())])],
    ),
  },
  "Grappling Kraken": {
    abilities: [
      triggered(when.landfall, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "engage et étourdit",
      }),
    ],
  },
  "High Fae Trickster": { abilities: [flashForAll("Vos sorts ont le flash")] },
  "Homunculus Horde": {
    abilities: [triggered(when.draw(2), [fx.copyToken(ref.self)], { label: "jeton copie" })],
  },
  "Icewind Elemental": { abilities: [triggered(when.entersSelf, fx.loot(1), { label: "pioche puis défausse" })] },
  "Inspiration from Beyond": {
    flashback: "{5}{U}{U}",
    spell: spell(
      [],
      [
        fx.mill(3),
        fx.pickFromZone("graveyard", INSTANT_SORCERY, { to: "hand" }, { prompt: "Renvoyez un éphémère ou un rituel en main" }),
      ],
    ),
  },
  "Kiora, the Rising Tide": {
    abilities: [
      triggered(when.entersSelf, fx.loot(2), { label: "piochez 2, défaussez 2" }),
      triggered(when.attacksSelf, fx.may("Créer Scion of the Deep (8/8) ?", fx.createTokens(SCION_OF_THE_DEEP)), {
        condition: cond.threshold,
        label: "Seuil : Scion of the Deep",
      }),
    ],
  },
  "Lunar Insight": { spell: spell([], [fx.draw(amount.differentManaValues)]) },
  "Mischievous Mystic": {
    abilities: [triggered(when.draw(2), [fx.createTokens(FAERIE)], { label: "Faerie 1/1 volante" })],
  },
  "Rune-Sealed Wall": { abilities: [activated({ tap: true, effects: [fx.surveil(1)], label: "Surveillance 1" })] },
  "Skyship Buccaneer": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.raid, label: "Raid : piochez une carte" })],
  },
  "Strix Lookout": {
    abilities: [activated({ mana: "{1}{U}", tap: true, effects: fx.loot(1), label: "Piochez puis défaussez" })],
  },
  "Uncharted Voyage": { spell: spell([target.creature()], [fx.topOrBottom(ref.target()), fx.surveil(1)]) },
  Aetherize: {
    spell: spell([], [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], attacking: true }, { to: "hand" })]),
  },
  "Brineborn Cutthroat": {
    abilities: [
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
        condition: cond.opponentsTurn,
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Extravagant Replication": {
    abilities: [
      triggered(when.yourUpkeep, [fx.copyToken(ref.target())], {
        targets: [targetObj("t", { controller: "you", nonland: true, other: true }, "autre permanent non-terrain à vous")],
        label: "jeton copie",
      }),
    ],
  },
  "Fleeting Distraction": { spell: spell([target.creature()], [fx.pump(ref.target(), -1, 0), fx.draw(1)]) },
  "Lightshell Duo": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "surveillance 2" })] },
  Micromancer: {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un éphémère ou un rituel de valeur 1 ?", fx.search({ ...INSTANT_SORCERY, manaValue: 1 })),
        { label: "cherche un sort de valeur 1" },
      ),
    ],
  },
  "Mocking Sprite": { abilities: [costReducer(INSTANT_SORCERY, 1, "Éphémères et rituels : {1} de moins")] },
  "Run Away Together": {
    spell: spell(
      [{ ...target.exactly(2, target.creature()), differentPlayers: true, label: "deux créatures de joueurs différents" }],
      [fx.bounce(ref.target())],
    ),
  },
  "Self-Reflection": {
    flashback: "{3}{U}",
    spell: spell([target.creature("t", { controller: "you" })], [fx.copyToken(ref.target())]),
  },
  Refute: { spell: spell([target.spell()], [fx.counter(ref.target()), ...fx.loot(1)]) },
  "Essence Scatter": {
    spell: spell([target.spell("t", { types: ["Creature"] }, "sort de créature")], [fx.counter(ref.target())]),
  },
  "An Offer You Can't Refuse": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      [fx.counter(ref.target()), fx.createTokens(TREASURE, 2, ref.controllerOf(ref.target()))],
    ),
  },
  "Tolarian Terror": { costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) } },
  "Imprisoned in the Moon": {
    enchant: {
      filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }, { types: ["Planeswalker"] }] },
      label: "créature, terrain ou planeswalker",
    },
    abilities: [
      staticAbility(
        "attached",
        { setTypes: ["Land"], setSubtypes: [], setColors: [], loseAllAbilities: true, addAbilities: [manaAbility("C")] },
        { label: "Terrain incolore « {T} : ajoutez {C} »" },
      ),
    ],
  },
  "Witness Protection": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        {
          loseAllAbilities: true,
          setTypes: ["Creature"],
          setSubtypes: ["Citizen"],
          setColors: ["G", "W"],
          setPower: 1,
          setToughness: 1,
          setName: "Legitimate Businessperson",
        },
        { label: "Citoyen 1/1 sans capacités" },
      ),
    ],
  },
  "Spectral Sailor": { abilities: [activated({ mana: "{3}{U}", effects: [fx.draw(1)], label: "Piochez une carte" })] },
  "Curator of Destinies": {
    cantBeCountered: true,
    abilities: [triggered(when.entersSelf, [fx.piles(5)], { label: "deux piles" })],
  },
  "Sphinx of Forgotten Lore": {
    abilities: [
      triggered(when.attacksSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "éphémère ou rituel de votre cimetière")],
        label: "flashback accordé",
      }),
    ],
  },
  Omniscience: { abilities: [castPermission({ freeFromHand: true, label: "Sorts de votre main sans payer leur coût" })] },
  "Time Stop": { spell: spell([], [fx.endTurn]) },

  // --- Réimpressions ---
  "Arcanis the Omnipotent": {
    abilities: [
      activated({ tap: true, effects: [fx.draw(3)], label: "Piochez trois cartes" }),
      activated({ mana: "{2}{U}{U}", effects: [fx.toHand(ref.self)], label: "Revenir en main" }),
    ],
  },
  "Burrog Befuddler": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -1, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-1/-0",
      }),
    ],
  },
  Cancel: { spell: spell([target.spell()], [fx.counter(ref.target())]) },
  "Chart a Course": {
    spell: spell([], [fx.draw(2), ...fx.when(cond.not(cond.raid), fx.discard(1))]),
  },
  Confiscate: {
    enchant: { filter: { permanent: true }, label: "permanent" },
    controlsEnchanted: true,
  },
  "Corsair Captain": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Trésor" }),
      staticAbility(
        { types: ["Creature"], subtype: "Pirate", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Autres Pirates +1/+1",
        },
      ),
    ],
  },
  "Dictate of Kruphix": {
    abilities: [triggered(when.step("draw", "any"), [fx.draw(1, ref.eventPlayer)], { label: "une carte de plus" })],
  },
  "Dive Down": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 0, 3, ["hexproof"])]),
  },
  "Eaten by Piranhas": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, setSubtypes: ["Skeleton"], setColors: ["B"], setPower: 1, setToughness: 1 },
        { label: "Squelette noir 1/1 sans capacités" },
      ),
    ],
  },
  "Exclusion Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "renvoie une créature adverse",
      }),
    ],
  },
  "Finale of Revelation": {
    spell: spell(
      [],
      [
        ...fx.when(cond.not(cond.xAtLeast(10)), fx.draw(amount.x)),
        ...fx.when(
          cond.xAtLeast(10),
          fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }),
          fx.shuffle(),
          fx.draw(amount.x),
          fx.untapUpTo({ types: ["Land"] }, 5),
          fx.emblem("Finale of Revelation", "Vous n'avez pas de taille de main maximale.", [
            playerStatic({ noMaxHandSize: true }),
          ]),
        ),
        fx.exileOnResolve,
      ],
    ),
  },
  Flashfreeze: {
    spell: spell([target.spell("t", { colors: ["R", "G"] }, "sort rouge ou vert")], [fx.counter(ref.target())]),
  },
  "Fog Bank": {
    abilities: [
      prevention({ self: true }, { combatOnly: true, label: "Blessures de combat reçues prévenues" }),
      prevention({}, { combatOnly: true, bySource: true, label: "Blessures de combat infligées prévenues" }),
    ],
  },
  "Gateway Sneak": {
    abilities: [
      triggered(when.enters({ subtype: "Gate", controller: "you" }), [fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "imblocable ce tour-ci",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Harbinger of the Tides": {
    flashExtraCost: "{2}",
    abilities: [
      triggered(when.entersSelf, fx.may("Renvoyer la créature engagée ciblée ?", fx.bounce(ref.target())), {
        targets: [targetObj("t", { types: ["Creature"], controller: "opponent", tapped: true }, "créature adverse engagée")],
        label: "renvoie une créature engagée",
      }),
    ],
  },
  "Into the Roil": {
    kicker: "{1}{U}",
    spell: spell([target.nonland()], [fx.toHand(ref.target()), ...fx.when(cond.kicked, fx.draw(1))]),
  },
  "Kitesail Corsair": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.sourceMatches({ attacking: true }), label: "Vol en attaque" },
      ),
    ],
  },
  "Mystic Archaeologist": {
    abilities: [activated({ mana: "{3}{U}{U}", effects: [fx.draw(2)], label: "Piochez deux cartes" })],
  },
  "Mystical Teachings": {
    flashback: "{5}{B}",
    spell: spell([], [fx.search({ anyOf: [{ types: ["Instant"] }, { keyword: "flash" }] })]),
  },
  Negate: { spell: spell([target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")], [fx.counter(ref.target())]) },
  "Quick Study": { spell: spell([], [fx.draw(2)]) },
  "Rite of Replication": {
    kicker: "{5}",
    spell: spell([target.creature()], [fx.copyToken(ref.target(), { count: amount.kicked(5, 1) })]),
  },
  "River's Rebuke": {
    spell: spell([target.player()], [fx.moveAll("battlefield", ref.target(), { nonland: true }, { to: "hand" })]),
  },
  "Shipwreck Dowser": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "éphémère ou rituel de votre cimetière")],
        label: "récupère un éphémère ou un rituel",
      }),
    ],
  },
  "Sphinx of the Final Word": {
    cantBeCountered: true,
    abilities: [playerStatic({ protectSpells: true, label: "Vos éphémères et rituels ne peuvent pas être contrecarrés" })],
  },
  "Starlight Snare": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "engage la créature" }),
      staticAbility("attached", { addKeywords: ["doesntUntap"] }, { label: "Ne se dégage pas" }),
    ],
  },
  "Storm Fleet Spy": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.raid, label: "Raid : piochez une carte" })],
  },
  "Tempest Djinn": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { subtype: "Island", basic: true, controller: "you" }, label: "+1/+0 par Île de base" },
      ),
    ],
  },
  Unsummon: { spell: spell([target.creature()], [fx.bounce(ref.target())]) },
  "Voracious Greatshark": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target())], {
        targets: [target.spell("t", { types: ["Artifact", "Creature"] }, "sort d'artefact ou de créature")],
        label: "contrecarre un sort",
      }),
    ],
  },
};
