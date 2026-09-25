/** Foundations — cartes multicolores. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  ELF_WARRIOR,
  entersWith,
  fx,
  INSTANT_SORCERY,
  KOMAS_COIL,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  PHYREXIAN_GOBLIN,
  playerStatic,
  ref,
  SOLDIER,
  SPIRIT,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const MULTI: Record<string, CardScript> = {
  "Alesha, Who Laughs at Fate": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.yourEndStep, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValueSourcePower: true },
            "you",
            "créature de valeur de mana ≤ la force d'Alesha",
          ),
        ],
        condition: cond.raid,
        label: "Raid : réanime une créature",
      }),
    ],
  },
  "Koma, World-Eater": {
    cantBeCountered: true,
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(KOMAS_COIL, 4)], { label: "quatre Koma's Coil 3/3" })],
  },
  "Anthem of Champions": { abilities: [staticAbility(CREATURE_YOU_CONTROL, { power: 1, toughness: 1 })] },
  "Ashroot Animist": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self), ["trample"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+X/+X et piétinement",
      }),
    ],
  },
  "Dreadwing Scavenger": {
    abilities: [
      triggered(when.entersSelf, fx.loot(1), { label: "pioche puis défausse" }),
      triggered(when.attacksSelf, fx.loot(1), { label: "pioche puis défausse" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        { condition: cond.threshold, label: "Seuil : +1/+1 et contact mortel" },
      ),
    ],
  },
  "Fiendish Panda": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], notSubtype: "Bear", maxManaValueSourcePower: true },
            "you",
            "créature non-Ours de valeur de mana ≤ sa force",
          ),
        ],
        label: "réanime une créature",
      }),
    ],
  },
  "Kykar, Zephyr Awakener": {
    abilities: [
      triggeredModal(when.castSpell("you", { notTypes: ["Creature"] }), [
        mode(
          "Exiler une autre créature (elle revient à l'étape de fin)",
          [target.creature("t", { controller: "you", other: true })],
          [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        ),
        mode("Esprit 1/1 volant", [], [fx.createTokens(SPIRIT)]),
      ]),
    ],
  },
  "Perforating Artist": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.eachOpponent, 3, { discard: true, sacrifice: { nonland: true } })], {
        condition: cond.raid,
        label: "Raid : 3 PV sauf sacrifice ou défausse",
      }),
    ],
  },
  "Wardens of the Cycle": {
    abilities: [
      triggeredModal(
        when.yourEndStep,
        [mode("Vous gagnez 2 PV", [], [fx.gainLife(2)]), mode("Piochez, perdez 1 PV", [], [fx.draw(1), fx.loseLife(1)])],
        { condition: cond.morbid, label: "Morbide" },
      ),
    ],
  },
  "Zimone, Paradox Sculptor": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "marqueurs +1/+1",
      }),
      activated({
        mana: "{G}{U}",
        tap: true,
        targets: [
          target.upTo(2, targetObj("t", { types: ["Creature", "Artifact"], controller: "you" }, "créature ou artefact à vous")),
        ],
        effects: [fx.doubleAllCounters(ref.target())],
        label: "Doubler les marqueurs",
      }),
    ],
  },
  "Balmor, Battlemage Captain": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pumpAll({ controller: "you" }, 1, 0, ["trample"])], {
        label: "vos créatures +1/+0 et piétinement",
      }),
    ],
  },
  "Empyrean Eagle": {
    abilities: [staticAbility({ ...OTHER_CREATURE_YOU_CONTROL, keyword: "flying" }, { power: 1, toughness: 1 })],
  },
  "Good-Fortune Unicorn": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.eventObject, 1)], { label: "marqueur +1/+1" }),
    ],
  },
  "Heroic Reinforcements": {
    spell: spell([], [fx.createTokens(SOLDIER, 2), fx.pumpAll({ controller: "you" }, 1, 1, ["haste"])]),
  },
  "Lathril, Blade of the Elves": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.createTokens(ELF_WARRIOR, amount.eventAmount)], { label: "Elfes guerriers" }),
      activated({
        tap: true,
        tapOthers: { filter: { subtype: "Elf" }, count: 10 },
        effects: fx.drain(10),
        label: "Engager dix Elfes : draine 10",
      }),
    ],
  },
  "Ruby, Daring Tracker": {
    abilities: [
      manaAbility(["R", "G"]),
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 2)], { condition: cond.ferocious, label: "+2/+2" }),
    ],
  },
  "Tatyova, Benthic Druid": {
    abilities: [triggered(when.landfall, [fx.gainLife(1), fx.draw(1)], { label: "+1 PV, piochez" })],
  },
  "Elenda, Saint of Dusk": {
    keywords: ["hexproofFromInstants"],
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["menace"] },
        { condition: cond.lifeAboveStart(1), label: "+1/+1 et menace" },
      ),
      staticAbility("self", { power: 5, toughness: 5 }, { condition: cond.lifeAboveStart(10), label: "+5/+5" }),
    ],
  },
  "Niv-Mizzet, Visionary": {
    abilities: [
      playerStatic({ noMaxHandSize: true, label: "Pas de taille de main maximale" }),
      triggered(
        when.dealsDamage({}, { anySourceYouControl: true, noncombatOnly: true, toOpponent: true }),
        [fx.draw(amount.eventAmount)],
        { label: "piochez autant de cartes" },
      ),
    ],
  },
  "Consuming Aberration": {
    cdaPT: amount.countIn("graveyard", {}, "opponents"),
    abilities: [
      triggered(when.castSpell("you"), [fx.millUntil(ref.eachOpponent, { types: ["Land"] })], {
        label: "chaque adversaire meule jusqu'à un terrain",
      }),
    ],
  },
  "Muldrotha, the Gravetide": {
    abilities: [castPermission({ graveyardPermanentTypes: true, label: "Un permanent de chaque type depuis le cimetière" })],
  },
  Progenitus: {
    keywords: ["protectionFromEverything"],
    shuffleIntoLibrary: true,
  },
  "Thousand-Year Storm": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.copySpell(ref.eventObject, amount.eventAmount)], {
        label: "copie le sort",
      }),
    ],
  },

  // --- Réimpressions ---
  "Aurelia, the Warleader": {
    abilities: [
      triggered(when.attacksSelf, [fx.untapUpTo({ types: ["Creature"] }, 99), fx.extraCombat], {
        oncePerTurn: true,
        label: "dégage vos créatures, combat supplémentaire",
      }),
    ],
  },
  "Ayli, Eternal Pilgrim": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(amount.toughnessOf(ref.costSacrificed))],
        label: "Sacrifier une créature : PV égaux à son endurance",
      }),
      activated({
        mana: "{1}{W}{B}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        activationCondition: cond.lifeAboveStart(10),
        targets: [target.nonland()],
        effects: [fx.exileCard(ref.target())],
        label: "Sacrifier une créature : exiler un permanent",
      }),
    ],
  },
  "Boros Charm": {
    spell: modal(
      mode(
        "4 blessures à un joueur ou planeswalker",
        [{ id: "t", label: "joueur ou planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
        [fx.damage(4, ref.target())],
      ),
      mode("Vos permanents sont indestructibles", [], [fx.modifyAll({ controller: "you" }, { addKeywords: ["indestructible"] })]),
      mode("Double initiative", [target.creature()], [fx.pump(ref.target(), 0, 0, ["doubleStrike"])]),
    ),
  },
  Cloudblazer: { abilities: [triggered(when.entersSelf, [fx.gainLife(2), fx.draw(2)], { label: "+2 PV, piochez deux cartes" })] },
  "Deadly Brew": {
    spell: spell(
      [],
      [
        fx.sacrifice(ref.you, { types: ["Creature", "Planeswalker"] }, 1, { store: "mine" }),
        fx.sacrifice(ref.eachOpponent, { types: ["Creature", "Planeswalker"] }),
        ...fx.when(
          cond.v("mine"),
          fx.may(
            "Renvoyer une autre carte de permanent de votre cimetière en main ?",
            fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { excludeStored: "mine" }),
          ),
        ),
      ],
    ),
  },
  "Drogskol Reaver": { abilities: [triggered(when.gainLife, [fx.draw(1)], { label: "piochez une carte" })] },
  "Dryad Militant": {
    abilities: [playerStatic({ exileInstantsSorceries: true, label: "Éphémères et rituels exilés au lieu du cimetière" })],
  },
  "Enigma Drake": { cdaPower: amount.countIn("graveyard", INSTANT_SORCERY) },
  "Garna, Bloodfist of Keld": {
    abilities: [
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, other: true }),
        [
          ...fx.when(cond.eventObjectMatches({ attacking: true }), fx.draw(1)),
          ...fx.when(cond.not(cond.eventObjectMatches({ attacking: true })), fx.damage(1, ref.eachOpponent, ref.self)),
        ],
        { label: "attaquante : piochez ; sinon 1 blessure" },
      ),
    ],
  },
  "Halana and Alena, Partners": {
    abilities: [
      triggered(
        when.yourCombat,
        [fx.addCounters(ref.target(), amount.powerOf(ref.self)), fx.pump(ref.target(), 0, 0, ["haste"])],
        {
          targets: [target.creature("t", { controller: "you", other: true })],
          label: "X marqueurs et célérité",
        },
      ),
    ],
  },
  "Immersturm Predator": {
    abilities: [
      triggered(when.tapsSelf, [fx.exileCard(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "exile une carte, marqueur +1/+1",
      }),
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Sacrifier une créature : indestructible, engagé",
      }),
    ],
  },
  "Maelstrom Pulse": { spell: spell([target.nonland()], [fx.destroySameName(ref.target())]) },
  Mortify: {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment"] }, "créature ou enchantement")],
      [fx.destroy(ref.target())],
    ),
  },
  "Ovika, Enigma Goliath": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          fx.createTokens(PHYREXIAN_GOBLIN, amount.manaValueOf(ref.eventObject), undefined, "g"),
          fx.pump(ref.stored("g"), 0, 0, ["haste"]),
        ],
        { label: "X Gobelins phyrexians avec la célérité" },
      ),
    ],
  },
  "Prime Speaker Zegana": {
    abilities: [
      entersWith({
        counters: amount.maxPower({ types: ["Creature"], controller: "you" }),
        label: "Marqueurs : plus grande force",
      }),
      triggered(when.entersSelf, [fx.draw(amount.powerOf(ref.self))], { label: "piochez autant que sa force" }),
    ],
  },
  "Savage Ventmaw": {
    abilities: [
      triggered(when.attacksSelf, [fx.addManaUntilEndOfTurn("R", "R", "R", "G", "G", "G")], { label: "{R}{R}{R}{G}{G}{G}" }),
    ],
  },
  "Teach by Example": { spell: spell([], [fx.copyNextSpell]) },
  "Trygon Predator": {
    abilities: [
      triggered(when.combatDamageToPlayer, fx.may("Détruire l'artefact ou l'enchantement ciblé ?", fx.destroy(ref.target())), {
        targets: [
          target.optional(
            target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
          ),
        ],
        label: "détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Unflinching Courage": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["trample", "lifelink"] },
        { label: "+2/+2, piétinement, lien de vie" },
      ),
    ],
  },
  "Wilt-Leaf Liege": {
    opponentDiscardToBattlefield: true,
    abilities: [
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, colors: ["G"] },
        { power: 1, toughness: 1 },
        { label: "Autres créatures vertes +1/+1" },
      ),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, colors: ["W"] },
        { power: 1, toughness: 1 },
        { label: "Autres créatures blanches +1/+1" },
      ),
    ],
  },
};
