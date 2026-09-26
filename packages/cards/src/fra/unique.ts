/**
 * Reality Fracture — lot F : cartes uniques (mécaniques propres à une seule carte, légendes, planeswalkers).
 * Non gérées : Emrakul, the Exigent Doom ; Uldaros Theorix ; Hall of Echoes.
 */
import type { AbilityDef, ActivatedAbilityDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BEAST_TRAMPLE,
  CADET,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  DRAGON_5,
  empower,
  entersWith,
  fx,
  loyalty,
  loyaltyX,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };
const CREATURE_OR_WALKER: ObjectFilter = { types: ["Creature", "Planeswalker"] };

/** Capacité de loyauté activable seulement sous condition. */
const withCondition = (ab: ActivatedAbilityDef, c: ActivatedAbilityDef["activationCondition"]): ActivatedAbilityDef => ({
  ...ab,
  activationCondition: c,
});

/** Face Yourself : « À l'étape de fin, si vous ne contrôlez pas de planeswalker, sacrifiez cette créature. » */
const SACRIFICE_WITHOUT_WALKER: AbilityDef = triggered(when.eachEndStep, [fx.sacrificeIt(ref.self)], {
  condition: cond.not(cond.controls({ types: ["Planeswalker"] })),
  label: "Sans planeswalker : sacrifiez-la",
});

/** Seasoned Cryomancer : « engagez jusqu'à N créatures ciblées, un marqueur d'étourdissement sur chacune ». */
const cryoReflexive = (n: number) =>
  fx.reflexive([target.upTo(n, target.creature("t"))], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)]);

export const UNIQUE: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Enlightened Confidant": {
    abilities: [
      triggered(when.yourEndStep, [fx.surveil(1, { maxManaValue: amount.lifeGainedThisTurn })], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Surveillance 1 ; une carte assez chère revient en main",
      }),
    ],
  },
  "Kindred Judgment": { spell: spell([], [fx.destroyAllButChosenType]) },
  "Danitha, Sword of Hope": {
    abilities: [
      triggered(
        when.castSpell("you", { subtype: "Equipment" }, { objects: CREATURE_YOU_CONTROL, orFilter: true }),
        [fx.draw(1)],
        { oncePerTurn: true, label: "Piochez une carte (une fois par tour)" },
      ),
    ],
  },
  "Ghalta the Immovable": {
    costReduction: { generic: amount.maxToughness(CREATURE_YOU_CONTROL) },
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addKeywords: ["attacksDespiteDefender", "assignsToughness"] },
        { label: "Attaquent malgré le défenseur ; blessent selon l'endurance si elle est plus grande" },
      ),
    ],
  },
  "Thalia, the Survivor": {
    abilities: [
      {
        kind: "costReduction",
        filter: { notTypes: ["Creature"] },
        generic: -1,
        opponents: true,
        label: "Sorts non-créature adverses : {1} de plus",
      },
    ],
  },
  "Tomik, Orzhov Lawmage": {
    abilities: [
      playerStatic({ walkersMaxOneAttacker: true, label: "Une seule créature peut attaquer chacun de vos planeswalkers" }),
      activated({
        tap: true,
        targets: [target.creature("t", { withCounter: "+1/+1" })],
        effects: [fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Vol jusqu'à la fin du tour",
      }),
    ],
  },
  "Yoshimaru, Beloved Companion": {
    abilities: [
      playerStatic({ plusOneCounterBonus: true, label: "Un marqueur +1/+1 de plus sur vos créatures" }),
      activated({
        mana: "{6}",
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur +1/+1 sur une créature légendaire",
      }),
    ],
  },
  "Yuriko, Blade of the Mighty": {
    abilities: [
      playerStatic({ noSpellsDuringCombat: true, label: "Pendant le combat : ni sorts ni capacités" }),
      triggered(when.attacks(CREATURE_YOU_CONTROL), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        condition: cond.attackingAlone,
        label: "Attaque seule : double initiative",
      }),
    ],
  },

  // --- Bleu ------------------------------------------------------------------
  "Cruel Calculations": {
    spell: spell([target.player("t")], [fx.draw(amount.milledThisTurn(ref.target()))]),
  },
  "Seasoned Cryomancer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(2),
          fx.discard(2, ref.you, { store: "n", storeFilter: { notTypes: ["Land"] } }),
          fx.when(cond.v("n", 2), cryoReflexive(2)),
          fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), cryoReflexive(1)),
        ],
        { label: "Piochez 2, défaussez 2, étourdissez" },
      ),
      activated({
        mana: "{3}{U}{U}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.draw(2)],
        label: "Depuis le cimetière : piochez deux cartes",
      }),
    ],
  },
  "Sphinx of False Conclusions": {
    abilities: [
      triggered(when.attacksSelf, fx.loot(1), { label: "Piochez, puis défaussez" }),
      triggered(when.diesSelf, fx.when(cond.eventObjectMatches({ nontoken: true }), fx.copyToken(ref.eventObject)), {
        label: "Jeton copie",
      }),
    ],
  },
  "Sphinx's Approach": {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { name: "Sphinx's Approach" }), 4),
          fx.may(
            "exiler ce sort et quatre Sphinx's Approach pour chercher un Sphinx ?",
            fx.exileOnResolve,
            fx.pickFromZone("graveyard", { name: "Sphinx's Approach" }, { to: "exile" }, { count: 4, min: 4 }),
            fx.search({ types: ["Creature"], subtype: "Sphinx" }, { to: "battlefield" }),
          ),
        ),
      ],
    ),
  },
  "Variable Chaser": {
    prepareSpell: spell([], [fx.mayWheel]),
    abilities: [entersWith({ prepared: true })],
  },
  "Chandra, Chill of Compliance": {
    abilities: [
      loyalty(1, {
        effects: [fx.surveil(1, { filter: { notTypes: ["Creature", "Land"] } })],
        label: "Surveillance 1 ; un non-créature non-terrain revient en main",
      }),
      loyalty(1, { effects: [fx.addMana("U")], label: "Ajoutez {U}" }),
      loyaltyX({
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", amount.x)],
        label: "Engagez, X marqueurs d'étourdissement",
      }),
      loyalty(-6, {
        effects: [
          fx.emblem("Emblème de Chandra", "Chaque fois que vous lancez un sort, piochez une carte.", [
            triggered(when.castSpell("you"), [fx.draw(1)], { label: "Piochez une carte" }),
          ]),
        ],
        label: "Emblème",
      }),
    ],
  },
  "Fblthp, Impossibly Lost": {
    abilities: [
      triggered(
        when.combatDamage({ controller: "you" }, true),
        [
          fx.draw(2),
          fx.when(cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1)), fx.winGame),
          fx.moveTo(ref.self, { to: "libraryTop" }),
          fx.shuffle(),
        ],
        { condition: cond.yourTurn, oncePerTurn: true, label: "Piochez deux cartes, mélangez Fblthp" },
      ),
    ],
  },
  "Jace, Reality Sculptor": {
    abilities: [
      loyalty(1, { effects: [empower(amount.count({ subtype: "Island", controller: "you" }))], label: "Renforcez Jace X" }),
      loyalty(-3, {
        effects: [
          fx.emblem(
            "Emblème de Jace (jusqu'à votre prochain tour)",
            "Chaque fois qu'une créature vous attaque ou attaque un planeswalker que vous contrôlez, elle gagne -5/-0.",
            [
              triggered(when.attacksYou(CREATURE), [fx.pump(ref.eventObject, -5, 0)], {
                label: "L'attaquant gagne -5/-0",
              }),
            ],
            true,
          ),
        ],
        label: "Jusqu'à votre prochain tour : attaquants -5/-0",
      }),
      withCondition(
        loyalty(0, { effects: [fx.exileLibraryButBottom(ref.eachOpponent)], label: "Exilez les bibliothèques adverses" }),
        cond.amountAtLeast(amount.countersAmong({ subtype: "Jace", controller: "you" }, "loyalty"), 25),
      ),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Break Under Pressure": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), CREATURE_OR_WALKER, 1, { greatestManaValue: true }), fx.gainLife(2)],
    ),
  },
  /** Arena (BO1) : « hors du jeu » n'existe pas, le sort ne fait rien. */
  "Extrapolate the Impossible": { spell: spell([], []) },
  "Danitha, Spear of Agony": {
    abilities: [
      triggered(when.castSpell("you", undefined, { opponent: true, objects: { controller: "opponent" } }), [
        fx.addCounters(ref.self, 1),
      ]),
    ],
  },
  "Gallia, Tragic Host": {
    abilities: [
      activated({
        mana: "{4}{B}",
        fromGraveyard: true,
        exileFromGraveyard: { filter: CREATURE },
        effects: [fx.toBattlefield(ref.self, { tapped: true, counters: { kind: "+1/+1", n: 1 } })],
        label: "Revient engagée avec un marqueur +1/+1",
      }),
    ],
  },
  "Garruk, Veiled Butcher": {
    abilities: [
      playerStatic({ opponentCreaturesDieToExile: true, label: "Les créatures adverses sont exilées au lieu de mourir" }),
      loyalty(2, {
        targets: [target.upTo(1, target.creature("t"))],
        effects: [fx.modify(ref.target(), { power: -4, toughness: -1 }, "untilYourNextTurn")],
        label: "-4/-1 jusqu'à votre prochain tour",
      }),
      loyalty(-2, {
        effects: [
          fx.sacrifice(ref.you, CREATURE, 1, { store: "me" }),
          fx.sacrifice(ref.eachOpponent, CREATURE),
          fx.when(cond.v("me"), fx.createTokens(BEAST_TRAMPLE)),
        ],
        label: "Chaque joueur sacrifie une créature",
      }),
      loyalty(-3, {
        effects: [
          fx.discard(2, ref.eachOpponent, { store: "nl", storeFilter: { notTypes: ["Land"] } }),
          fx.when(cond.not(cond.v("nl", 2)), fx.draw(1)),
        ],
        label: "Chaque adversaire défausse deux cartes",
      }),
    ],
  },
  "Gideon the Oathless": {
    abilities: [
      triggered(when.enters(CREATURE_OPP), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "1 blessure au contrôleur",
      }),
      triggered(when.loyaltyActivated(undefined, true), [fx.damage(1, ref.eventPlayer)], { label: "1 blessure" }),
    ],
  },
  "Loot, the Anomaly": {
    abilities: [
      staticAbility("self", { addKeywords: ["absolutePowerDamage"] }, { label: "Force négative : blesse comme si positive" }),
      activated({
        sacrificeOther: { filter: { ...CREATURE_OR_WALKER, other: true } },
        activationCondition: cond.threshold,
        effects: [fx.pump(ref.self, -2, 0)],
        label: "Seuil : -2/-0",
      }),
    ],
  },

  // --- Rouge -----------------------------------------------------------------
  "Command the Stage": {
    spell: spell(
      [],
      [
        // Les marqueurs d'abord : le Cadet créé n'est pas concerné (« chaque autre jeton Sorcier »).
        fx.addCountersAll({ types: ["Creature"], subtype: "Wizard", token: true, controller: "you" }, 1),
        fx.createTokens(CADET),
      ],
    ),
    abilities: [
      triggered(when.step("upkeep", "any"), [fx.toHand(ref.selfCard)], {
        fromGraveyard: true,
        condition: cond.opponentDealtNoncombatDamageLastTurn,
        label: "Revient en main",
      }),
    ],
  },
  "Curse-Marred Demon": {
    abilities: [
      triggered(when.entersSelf, [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })], {
        label: "Cherchez une carte, défaussez au hasard",
      }),
    ],
  },
  "Draconic Visitor": {
    abilities: [playerStatic({ replaceArtifactTokens: DRAGON_5, label: "Jetons d'artefact : Dragons 5/5 volants à la place" })],
  },
  "Face Yourself": {
    spell: spell(
      [target.player("p")],
      [
        fx.copyToken(ref.permanentsOf(ref.target("p"), CREATURE), {
          addKeywords: ["haste"],
          addAbilities: [SACRIFICE_WITHOUT_WALKER],
        }),
      ],
    ),
  },
  "Identity Echo": {
    abilities: [
      activated({
        mana: "{3}{R}",
        sorcerySpeed: true,
        targets: [target.creatureOrPlaneswalker("t", { controller: "you" })],
        effects: [fx.exile(ref.target()), fx.revealUntil(CREATURE_OR_WALKER, { to: "battlefield" })],
        label: "Exilez-la, révélez jusqu'à une créature ou un planeswalker",
      }),
    ],
  },
  "Pyre Rhymer": {
    prepareSpell: spell([], [fx.extraMountainMana]),
    abilities: [entersWith({ prepared: true })],
  },
  "Chandra, Torch of Defiance": {
    abilities: [
      loyalty(1, {
        effects: [
          fx.exileTop(ref.you, 1, "c"),
          // Approximation : un terrain ne peut pas être lancé, d'où les 2 blessures ; sinon, la carte est lançable ce tour-ci.
          fx.when(cond.refMatches(ref.stored("c"), { types: ["Land"] }), fx.damage(2, ref.eachOpponent)),
          fx.when(cond.not(cond.refMatches(ref.stored("c"), { types: ["Land"] })), fx.grantPlay(ref.stored("c"))),
        ],
        label: "Exilez la carte du dessus, vous pouvez la lancer",
      }),
      loyalty(1, { effects: [fx.addMana("R", "R")], label: "Ajoutez {R}{R}" }),
      loyalty(-3, { targets: [target.creature("t")], effects: [fx.damage(4, ref.target())], label: "4 blessures" }),
      loyalty(-7, {
        effects: [
          fx.emblem(
            "Emblème de Chandra",
            "Chaque fois que vous lancez un sort, cet emblème inflige 5 blessures à n'importe quelle cible.",
            [triggered(when.castSpell("you"), [fx.damage(5, ref.target())], { targets: [target.any()], label: "5 blessures" })],
          ),
        ],
        label: "Emblème",
      }),
    ],
  },
  "Jiang Yanggu, Alone": {
    abilities: [
      triggered(
        when.attacks(CREATURE_YOU_CONTROL),
        [fx.discard(1), fx.draw(1), fx.addCounters(ref.eventObject, amount.cardsDiscardedThisTurn)],
        { condition: cond.attackingAlone, label: "Défaussez, piochez, marqueurs +1/+1" },
      ),
    ],
  },
  "Tetsuko Umezawa, Pursuer": {
    abilities: [
      triggered(
        when.blocks({ types: ["Creature"], controller: "opponent", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] }),
        [fx.damage(1, ref.controllerOf(ref.eventObject))],
        { label: "1 blessure au contrôleur du bloqueur" },
      ),
    ],
  },
  "Tomik, Izzet Sparkmage": {
    abilities: [playerStatic({ noncombatDamageBonus: true, label: "Blessures non de combat aux adversaires : +1" })],
  },

  // --- Vert ------------------------------------------------------------------
  Gardenize: {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.counters(ref.self, "charge", 1)], { label: "Marqueur de charge" }),
      triggered(when.step("main1"), [fx.addManaTimes(amount.countersOn(ref.self, "charge"), "G")], {
        label: "{G} par marqueur de charge",
      }),
    ],
  },
  "Hexhaven Invigorator": {
    abilities: [
      triggered(
        when.isDealtDamage,
        fx.may(
          "chercher des terrains ?",
          fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, amount.eventAmount),
        ),
        { label: "Autant de terrains que de blessures" },
      ),
    ],
  },
  Omnipresence: {
    abilities: [
      castPermission({
        freeFromHand: true,
        freeMaxManaValueCreatures: true,
        label: "Sorts de valeur de mana ≤ vos créatures : sans payer leur coût",
      }),
    ],
  },
  Tarmogoyf: {
    cdaPower: amount.cardTypesInGraveyards,
    cdaToughness: amount.plus(amount.cardTypesInGraveyards, 1),
  },
  "Garruk, Curse Breaker": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 4 }), [fx.draw(1)], {
        label: "Piochez une carte",
      }),
      loyalty(2, {
        targets: [target.upTo(2, target.permanent("t", ["Land"], {}, "terrain"))],
        effects: [fx.untap(ref.target())],
        label: "Dégagez jusqu'à deux terrains",
      }),
      loyalty(-3, { effects: [fx.createTokens(BEAST_TRAMPLE)], label: "Bête 4/4 piétinement" }),
      loyalty(-4, {
        effects: [
          fx.emblem(
            "Emblème de Garruk (jusqu'à votre prochain tour)",
            "Chaque fois qu'une ou plusieurs créatures attaquent un de vos adversaires, elles gagnent +2/+2 et le piétinement.",
            [
              triggered(when.attackWith(1), [fx.pumpAll({ attacking: true, controller: "you" }, 2, 2, ["trample"])], {
                label: "Attaquants +2/+2, piétinement",
              }),
            ],
            true,
          ),
        ],
        label: "Jusqu'à votre prochain tour : attaquants +2/+2",
      }),
    ],
  },
  "Loot, the Nexus": {
    abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { distinctPowers: true })],
  },
  "Ruric Thar, Magecrusher": {
    cantBeCountered: true,
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.not(cond.sourceDealtCombatDamage), label: "Défense talismanique (pas encore de blessures de combat)" },
      ),
    ],
  },

  // --- Multicolores et artefacts --------------------------------------------
  "Clash of Elements": { spell: spell([target.nonland("t")], [fx.topOrBottom(ref.target(), 2)]) },
  "Fatehold Charm": {
    spell: modal(
      mode("Piochez, renforcez Jace 2", [], [fx.draw(1), empower(2)]),
      mode(
        "Renvoyez un sort ou une créature",
        [{ id: "t", label: "sort ou créature", filter: { spells: {}, objects: CREATURE } }],
        [fx.bounce(ref.target())],
      ),
      mode("Vos créatures : +1/+2", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 2)]),
    ),
  },
  "Null Summoner": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.target(), { nonland: true })], {
        targets: [target.player("t", "opponent")],
        condition: cond.wasCast,
        label: "Exilez une carte non-terrain de sa main",
      }),
      castPermission({ linkedCards: true, condition: cond.threshold, label: "Seuil : lancez la carte exilée" }),
    ],
  },
  "Recursive Recruitment": {
    flashback: "{6}{U}{B}",
    spell: spell(
      [],
      [
        fx.createTokens(CADET, 2, undefined, "c"),
        fx.when(cond.spellCastFromGraveyard, fx.addCounters(ref.stored("c"), amount.per(amount.countIn("graveyard"), 3))),
      ],
    ),
  },
  "Twinned Vision": {
    flashback: "{1}{U/R}{U/R}",
    flashbackDiscard: 1,
    spell: spell([], [fx.when(cond.spellCastFromHand, fx.draw(1)), fx.when(cond.not(cond.spellCastFromHand), fx.draw(2))]),
  },
  "Twisted Fates": {
    spell: spell(
      [target.nonland("t"), target.player("p")],
      [fx.destroy(ref.target()), fx.addCounters(ref.permanentsOf(ref.target("p"), CREATURE), 1)],
    ),
  },
  "Warrior's Blades": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target()), fx.gainLife(3)], {
        targets: [target.any()],
        label: "3 blessures, gagnez 3 PV",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Hapatra, the Desert Fang": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1", amount.maxManaValueInGraveyard)], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "Marqueurs -1/-1",
      }),
    ],
  },
  "Karn, Gilded Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.distinctColors({ types: ["Artifact"], controller: "you", other: true }))], {
        label: "Une carte par couleur parmi vos autres artefacts",
      }),
    ],
  },
  "Karn, Argent Defender": {
    abilities: [playerStatic({ noEntersTriggers: true, label: "L'arrivée d'artefacts et de créatures ne déclenche rien" })],
  },
};
