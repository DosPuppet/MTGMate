/** Foundations — cartes bleues. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  costReducer,
  DRAKE,
  FAERIE,
  flashForAll,
  fx,
  INSTANT_SORCERY,
  manaAbility,
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
};
