/**
 * Commander : préconstruit « Counter Blitz » de Final Fantasy X (Tidus, Yuna's Guardian, vert, blanc, bleu). Marqueurs de
 * toutes sortes, déplacés, proliférés ; Gardiens et invocations (Sagas créatures).
 */
import type { CardScript, ModeDef, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  CLUE,
  chapter,
  cmp,
  cond,
  entersWith,
  escalate,
  eventReplacement,
  evolve,
  fx,
  manaAbility,
  ref,
  SPIRIT,
  spell,
  staticAbility,
  TO_PLAYER_OR_PLANESWALKER,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Vos créatures avec un marqueur (n'importe quelle sorte). */
const COUNTERED_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "any" };
const P1P1_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "+1/+1" };
const SQUID: TokenSpec = {
  name: "Squid",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Squid"],
  power: 1,
  toughness: 1,
  abilities: [blockAbility(block.landwalk("Island", "Traversée des îles"))],
  text: "Islandwalk",
};
/** « Quand [un permanent à vous] est mis dans un cimetière depuis le champ de bataille » */
const toGraveyard = (who: ObjectFilter): TriggerSpec => ({ on: "leaves", who, to: "graveyard" });
const mode = (label: string, targets: ModeDef["targets"], effects: ModeDef["effects"]): ModeDef => ({
  label,
  targets,
  effects,
});

/** « Forge of Heroes » : mana incolore, ou un marqueur sur un commandant arrivé ce tour-ci. */
const FORGE_OF_HEROES: CardScript = {
  abilities: [
    manaAbility("C"),
    activated({
      tap: true,
      targets: [
        { ...target.permanent("t", [], { commander: true, enteredThisTurn: true }), label: "commandant arrivé ce tour-ci" },
      ],
      effects: [
        ...fx.when(cond.targetMatches("t", { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
        ...fx.when(cond.targetMatches("t", { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty")),
      ],
      label: "Un marqueur sur un commandant arrivé ce tour-ci",
    }),
  ],
};

export const EDH_COUNTER_BLITZ: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  "Tidus, Yuna's Guardian": {
    abilities: [
      triggered(
        when.yourCombat,
        fx.may("Déplacer un marqueur d'une de vos créatures sur une autre ?", fx.moveCounter(ref.target("a"), ref.target("b"))),
        {
          targets: [
            { ...target.creature("a", { controller: "you", withCounter: "any" }), label: "créature à vous avec un marqueur" },
            { ...target.creature("b", { controller: "you" }), otherThan: ["a"], label: "une autre créature à vous" },
          ],
          label: "Déplacez un marqueur d'une de vos créatures sur une autre",
        },
      ),
      // Encouragement : « faites ceci une seule fois par tour » (la limite n'est consommée que si vous piochez).
      triggered(
        when.combatDamageBatch(COUNTERED_YOU),
        [
          ...fx.mayForStore(ref.you, "Piocher une carte et proliférer ?", "c", fx.draw(1), fx.proliferate()),
          ...fx.when(cond.v("c"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Encouragement : piochez une carte et proliférez (une fois par tour)" },
      ),
    ],
  },

  // --- Gardiens et légendes -----------------------------------------------------------------------------------------
  // Vigilance : lue dans le texte.
  "Auron, Venerated Guardian": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCounters(ref.self, 1),
          fx.reflexive(
            [
              {
                ...target.creature("t", { controller: "opponent", compare: [cmp.power("<", amount.sourcePower)] }),
                label: "créature du joueur défenseur de force inférieure à celle d'Auron",
              },
            ],
            [fx.exileUntilLeaves(ref.target())],
          ),
        ],
        { label: "Étoile filante : un marqueur, puis exilez une créature plus faible tant qu'Auron reste" },
      ),
    ],
  },
  "Gatta and Luzzu": {
    // Flash : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), {
            addAbilities: [
              eventReplacement({
                event: "damage",
                toFilter: { self: true },
                modify: { prevent: true },
                onPrevent: { countersOnDamaged: "+1/+1" },
                label: "Blessures prévenues : autant de marqueurs +1/+1",
              }),
            ],
          }),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Ce tour-ci, ses blessures deviennent des marqueurs" },
      ),
    ],
  },
  "Kimahri, Valiant Guardian": {
    // Vigilance : lue dans le texte.
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.self, 1),
          fx.tap(ref.target()),
          ...fx.may(
            "Kimahri devient-il une copie de cette créature ?",
            fx.becomeCopy(ref.self, ref.target(), "permanent", {
              except: { setName: "Kimahri, Valiant Guardian", addKeywords: ["vigilance"] },
              keepAbilities: [0],
            }),
          ),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Rage Ronso : un marqueur, engagez une créature adverse, Kimahri peut en devenir une copie",
        },
      ),
    ],
  },
  // Vol : lu dans le texte.
  "Lord Jyscal Guado": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(CLUE)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "counters", who: "you", types: ["Creature"] }), 1),
        label: "Vous avez mis un marqueur sur une créature ce tour-ci : enquêtez",
      }),
    ],
  },
  "Lulu, Stern Guardian": {
    abilities: [
      triggered(when.opponentAttacksYouWith(1), [fx.counters(ref.target(), "stun")], {
        targets: [{ ...target.creature("t", { attacking: "you" }), label: "créature qui vous attaque" }],
        label: "Un marqueur d'étourdissement sur une créature qui vous attaque",
      }),
      activated({ mana: "{3}{U}", effects: [fx.proliferate()], label: "Proliférez" }),
    ],
  },
  "Maester Seymour": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), amount.powerOf(ref.self))], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Autant de marqueurs +1/+1 que sa force sur une autre de vos créatures",
      }),
      // Monstruosité X : une seule fois (« si elle n'est pas monstrueuse »).
      activated({
        mana: "{3}{G}{G}",
        once: true,
        effects: [fx.addCounters(ref.self, amount.countersAmong(CREATURE_YOU, "any"))],
        label: "Monstruosité X (X : marqueurs parmi vos créatures)",
      }),
    ],
  },
  "O'aka, Traveling Merchant": {
    abilities: [
      activated({
        tap: true,
        removeCounterFrom: { filter: { notTypes: ["Land"] }, kind: "+1/+1" },
        effects: [fx.draw(1)],
        label: "Retirez un marqueur +1/+1 d'un de vos permanents non-terrains : piochez une carte",
      }),
    ],
  },
  "Rikku, Resourceful Guardian": {
    abilities: [
      triggered(
        when.youPutCounters({ types: ["Creature"] }),
        [
          fx.modify(ref.eventObject, {
            addBlockRules: [{ cantBeBlockedBy: { controller: "opponent" }, label: "Imblocable par les créatures adverses" }],
          }),
        ],
        { label: "Elle ne peut pas être bloquée par les créatures de vos adversaires ce tour-ci" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          { ...target.creature("a", { controller: "opponent", withCounter: "any" }), label: "créature adverse avec un marqueur" },
          target.creature("b", { controller: "you" }),
        ],
        effects: [fx.moveCounter(ref.target("a"), ref.target("b"))],
        label: "Vol : déplacez un marqueur d'une créature adverse sur une des vôtres",
      }),
    ],
  },
  // Lien de vie : lu dans le texte.
  "Shelinda, Yevon Acolyte": {
    abilities: [
      triggered(
        when.enters({ ...CREATURE_YOU, other: true }),
        [
          ...fx.when(
            cond.amountGreater(amount.powerOf(ref.self), amount.powerOf(ref.eventObject)),
            fx.addCounters(ref.eventObject, 1),
          ),
          ...fx.when(
            cond.not(cond.amountGreater(amount.powerOf(ref.self), amount.powerOf(ref.eventObject))),
            fx.addCounters(ref.self, 1),
          ),
        ],
        { label: "Un marqueur sur la nouvelle créature si elle est plus faible, sinon sur Shelinda" },
      ),
    ],
  },
  // Vol, piétinement : lus dans le texte.
  "Sin, Unending Cataclysm": {
    // « En arrivant, retirez tous les marqueurs d'un nombre quelconque d'artefacts, de créatures et d'enchantements. Sin
    // arrive avec X marqueurs +1/+1, X étant le double du nombre de marqueurs retirés ainsi. »
    asEnters: [
      fx.chooseAmong(
        ref.permanentsOf(ref.eachPlayer, {
          anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }],
          withCounter: "any",
        }),
        ref.you,
        "sin",
        { anyNumber: true, prompt: "Sin : retirez tous les marqueurs d'un nombre quelconque de ces permanents" },
      ),
      fx.removeCounters(ref.stored("sin"), 999, undefined, "n"),
      fx.addCounters(ref.self, amount.plus(amount.v("n"), amount.v("n"))),
    ],
    abilities: [
      triggered(
        when.diesSelf,
        [fx.lkiCountersTo(ref.target()), fx.moveTo(ref.eventObject, { to: "libraryTop" }), fx.shuffle(ref.you)],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Ses marqueurs sur une de vos créatures, puis mélangez-la dans votre bibliothèque",
        },
      ),
    ],
  },
  "Tromell, Seymour's Butler": {
    abilities: [
      entersWith({
        affects: { ...CREATURE_YOU, token: false, other: true },
        counters: 1,
        label: "Vos autres créatures non-jetons arrivent avec un marqueur +1/+1 de plus",
      }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.proliferate(amount.count({ ...CREATURE_YOU, token: false, enteredThisTurn: true }))],
        label: "Proliférez X fois (X : vos créatures non-jetons arrivées ce tour-ci)",
      }),
    ],
  },
  // Portée, piétinement : lus dans le texte.
  "Wakka, Devoted Guardian": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.destroy(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [target.upTo(1, target.permanent("t", ["Artifact"], { controller: "opponent" }, "artefact de ce joueur"))],
        label: "Détruisez un artefact de ce joueur et un marqueur +1/+1 sur Wakka",
      }),
      triggered(when.yourEndStep, [fx.addCountersAll({ ...CREATURE_YOU, other: true }, 1)], {
        condition: cond.sourceMatches({ countersPutByYouThisTurn: true }),
        label: "Capitaine de blitzball : un marqueur +1/+1 sur chacune de vos autres créatures",
      }),
    ],
  },
  "Yuna, Grand Summoner": {
    abilities: [
      // Approximation : les deux marqueurs vont au sort de créature payé avec ce mana (et non au prochain lancé ce tour-ci).
      manaAbility(ANY_COLOR, 1, {
        rider: { spell: { types: ["Creature"] }, effects: [fx.spellArrivalCounters(ref.eventObject, 2)] },
      }),
      triggered(
        toGraveyard({ permanent: true, controller: "you", other: true, withCounter: "any" }),
        fx.may(
          "Mettre autant de marqueurs +1/+1 sur une créature ?",
          fx.addCounters(ref.target(), amount.countersOn(ref.eventObject, "any")),
        ),
        {
          targets: [target.creature()],
          label: "Un de vos permanents avec des marqueurs va au cimetière : autant de marqueurs +1/+1",
        },
      ),
    ],
  },

  // --- Autres créatures ---------------------------------------------------------------------------------------------
  "Altered Ego": {
    cantBeCountered: true,
    // « … sauf qu'elle arrive avec X marqueurs +1/+1 supplémentaires » (X du sort ; 0 si elle n'a pas été lancée).
    asEnters: [fx.chooseCopy({ types: ["Creature"] }, { anyController: true, counters: { kind: "+1/+1", n: amount.x } })],
  },
  "Bane of Progress": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, "d"),
          fx.addCounters(ref.self, amount.refCount(ref.stored("d"))),
        ],
        { label: "Détruisez tous les artefacts et enchantements ; un marqueur par permanent détruit" },
      ),
    ],
  },
  "Chasm Skulker": {
    abilities: [
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "Vous piochez : un marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.createTokens(SQUID, amount.lkiCounters("+1/+1"))], {
        label: "Autant de Calmars 1/1 avec la traversée des îles que de marqueurs",
      }),
    ],
  },
  "Chocobo Knights": {
    abilities: [
      triggered(when.attackWith(), [fx.pumpAll(COUNTERED_YOU, 0, 0, ["doubleStrike"])], {
        label: "Vous attaquez : vos créatures avec des marqueurs gagnent la double initiative",
      }),
    ],
  },
  "Duskshell Crawler": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Un marqueur +1/+1",
      }),
      staticAbility(P1P1_YOU, { addKeywords: ["trample"] }, { label: "Vos créatures avec un marqueur +1/+1 ont le piétinement" }),
    ],
  },
  "Fathom Mage": {
    abilities: [
      evolve,
      // Approximation : une seule question pour un groupe de marqueurs ; autant de cartes que de marqueurs mis.
      triggered(
        when.countersPut("self", "+1/+1"),
        fx.may("Piocher une carte par marqueur +1/+1 ?", fx.draw(amount.eventAmount)),
        { label: "Un marqueur +1/+1 : vous pouvez piocher une carte" },
      ),
    ],
  },
  "Forgotten Ancient": {
    abilities: [
      triggered(when.castSpell("any"), fx.may("Mettre un marqueur +1/+1 sur Forgotten Ancient ?", fx.addCounters(ref.self, 1)), {
        label: "Un sort est lancé : un marqueur +1/+1",
      }),
      // Approximation : tous ses marqueurs vont sur une seule autre créature.
      triggered(
        when.yourUpkeep,
        fx.may(
          "Déplacer ses marqueurs +1/+1 sur une autre créature ?",
          fx.removeCounters(ref.self, 999, "+1/+1", "m"),
          fx.addCounters(ref.target(), amount.v("m")),
        ),
        { targets: [target.upTo(1, target.creature("t", { other: true }))], label: "Déplacez ses marqueurs +1/+1" },
      ),
    ],
  },
  "Generous Patron": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { other: true }))],
        label: "Soutien 2",
      }),
      triggered(when.youPutCounters({ types: ["Creature"], controller: "opponent" }), [fx.draw(1)], {
        label: "Vous mettez des marqueurs sur une créature adverse : piochez une carte",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Grateful Apparition": {
    abilities: [triggered(when.combatDamage("self", TO_PLAYER_OR_PLANESWALKER), [fx.proliferate()], { label: "Proliférez" })],
  },
  "Gyre Sage": {
    abilities: [evolve, { ...manaAbility("G"), amountCounters: "+1/+1" }],
  },
  "Incubation Druid": {
    abilities: [
      manaAbility(ANY_COLOR, 1, { likeLands: {}, condition: cond.not(cond.counterAtLeast("+1/+1", 1)) }),
      manaAbility(ANY_COLOR, 3, { likeLands: {}, condition: cond.counterAtLeast("+1/+1", 1) }),
      activated({
        mana: "{3}{G}{G}",
        effects: fx.when(cond.not(cond.counterAtLeast("+1/+1", 1)), fx.addCounters(ref.self, 3)),
        label: "Adaptation 3",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Luminous Broodmoth": {
    abilities: [
      triggered(
        when.dies({ ...CREATURE_YOU, not: { keyword: "flying" } }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "flying", n: 1 } })],
        { label: "Une de vos créatures sans le vol meurt : elle revient avec un marqueur de vol" },
      ),
    ],
  },
  "Rampant Rejuvenator": {
    abilities: [
      entersWith({ counters: 2, label: "Deux marqueurs +1/+1" }),
      triggered(when.diesSelf, [fx.search(BASIC_LAND, { to: "battlefield" }, amount.powerOf(ref.eventObject))], {
        label: "Cherchez autant de terrains de base que sa force",
      }),
    ],
  },
  "Scholar of New Horizons": {
    abilities: [
      entersWith({ counters: 1, label: "Un marqueur +1/+1" }),
      // Choix automatique : la Plaine arrive sur le champ de bataille dès que c'est permis.
      activated({
        tap: true,
        removeCounterFrom: { filter: {}, kind: "+1/+1" },
        effects: [
          ...fx.when(cond.opponentHasMore("lands"), fx.search({ subtype: "Plains" }, { to: "battlefield", tapped: true })),
          ...fx.when(cond.not(cond.opponentHasMore("lands")), fx.search({ subtype: "Plains" }, { to: "hand" })),
        ],
        label: "Retirez un marqueur : cherchez une carte de Plaine",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Sunscorch Regent": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.addCounters(ref.self, 1), fx.gainLife(1)], {
        label: "Un adversaire lance un sort : un marqueur +1/+1 et 1 PV",
      }),
    ],
  },

  // --- Invocations (Sagas créatures) --------------------------------------------------------------------------------
  // Initiative : lue dans le texte.
  "Summon: Ixion": {
    abilities: [
      chapter([1], [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Aéroétincelle : exilez une créature adverse tant que cette Saga reste",
      }),
      chapter([2, 3], [fx.addCounters(ref.target(), 1), fx.gainLife(2)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "Un marqueur +1/+1 sur jusqu'à deux de vos créatures ; 2 PV",
      }),
    ],
  },
  // Célérité : lue dans le texte. Un mode au hasard (dé à trois faces) ; les cibles des trois modes sont choisies d'abord.
  "Summon: Magus Sisters": {
    abilities: [
      chapter(
        [1, 2, 3],
        [
          fx.rollDie(3, "m"),
          ...fx.when(cond.all(cond.v("m", 1), cond.not(cond.v("m", 2))), fx.addCounters(ref.target("t"), 3)),
          ...fx.when(cond.all(cond.v("m", 2), cond.not(cond.v("m", 3))), fx.counters(ref.target("t"), "shield"), fx.gainLife(3)),
          ...fx.when(cond.v("m", 3), fx.fight(ref.self, ref.target("f"))),
        ],
        {
          targets: [target.creature("t"), target.upTo(1, target.creature("f", { controller: "opponent" }))],
          label: "Au hasard : trois marqueurs +1/+1, un marqueur de bouclier et 3 PV, ou un combat",
        },
      ),
    ],
  },
  // Vol : lu dans le texte.
  "Summon: Valefor": {
    abilities: [
      chapter([1], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 1, { greatestManaValue: true, to: "hand" })], {
        label: "Ailes soniques : chaque adversaire renvoie en main une de ses créatures de plus grande valeur de mana",
      }),
      chapter([2, 3, 4], [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.upTo(1, target.creature())],
        label: "Engagez une créature et mettez-lui un marqueur d'étourdissement",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Summon: Yojimbo": {
    abilities: [
      chapter([1], [fx.exileCard(ref.target())], {
        targets: [
          {
            id: "t",
            label: "artefact, enchantement ou créature engagée adverse",
            filter: {
              objects: {
                controller: "opponent",
                anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], tapped: true }],
              },
            },
          },
        ],
        label: "Exilez un artefact, un enchantement ou une créature engagée adverse",
      }),
      chapter([2, 3], [fx.untilYourNextTurn({ attackTax: 2 })], {
        label: "Jusqu'à votre prochain tour, chaque créature qui vous attaque coûte {2}",
      }),
      chapter(
        [4],
        [
          fx.createTokens(
            TREASURE,
            amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Creature"], minPower: 4 }))),
          ),
        ],
        { label: "Un Trésor par adversaire qui contrôle une créature de force 4 ou plus" },
      ),
    ],
  },

  // --- Artefacts et enchantements -----------------------------------------------------------------------------------
  "Blitzball Stadium": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature(), countAmount: amount.sourceX, minCount: 0, label: "jusqu'à X créatures" }],
        label: "Soutien X",
      }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.modify(ref.target(), {
            addKeywords: ["unblockable"],
            addAbilities: [
              triggered(when.combatDamageToPlayer, [fx.draw(amount.counterKindsAmong({ self: true }))], {
                label: "Piochez une carte par sorte de marqueur sur elle",
              }),
            ],
          }),
        ],
        label: "Droit au but ! : imblocable, et pioche par sorte de marqueur quand elle blesse un joueur",
      }),
    ],
  },
  "Bred for the Hunt": {
    abilities: [
      triggered(when.combatDamage(P1P1_YOU, true), fx.may("Piocher une carte ?", fx.draw(1)), {
        label: "Une de vos créatures avec un marqueur +1/+1 blesse un joueur : vous pouvez piocher",
      }),
    ],
  },
  "Everflowing Chalice": {
    // Multikicker {2} : lu dans le texte (X = nombre de fois).
    abilities: [
      entersWith({ counters: amount.x, counterKind: "charge", label: "Un marqueur de charge par kicker payé" }),
      { ...manaAbility("C"), amountCounters: "charge" },
    ],
  },
  "Fight Rigging": {
    abilities: [
      // Dissimulation 5 : la carte est exilée face cachée (vous seul la voyez).
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, { count: 1, to: { to: "exile", faceDown: "you" }, rest: "bottom", store: "h" }),
          fx.link(ref.stored("h")),
        ],
        { label: "Dissimulation 5" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), 1),
          fx.when(
            cond.controls({ types: ["Creature"], controller: "you", minPower: 7 }),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Un marqueur +1/+1 ; force 7 ou plus : jouez la carte cachée",
        },
      ),
    ],
  },
  "Inexorable Tide": {
    abilities: [triggered(when.castSpell("you"), [fx.proliferate()], { label: "Vous lancez un sort : proliférez" })],
  },
  "Path of Discovery": {
    abilities: [
      triggered(when.enters(CREATURE_YOU), [fx.explore(ref.eventObject)], {
        label: "Une de vos créatures arrive : elle explore",
      }),
    ],
  },
  "Resourceful Defense": {
    abilities: [
      triggered(when.leaves({ permanent: true, controller: "you", withCounter: "any" }), [fx.lkiCountersTo(ref.target())], {
        targets: [target.permanent("t", [], { controller: "you" }, "permanent que vous contrôlez")],
        label: "Ses marqueurs sur un de vos permanents",
      }),
      // Approximation : tous les marqueurs +1/+1 sont déplacés (pas « un nombre quelconque » de chaque sorte).
      activated({
        mana: "{4}{W}",
        targets: [
          target.permanent("a", [], { controller: "you", withCounter: "any" }, "permanent à vous avec des marqueurs"),
          { ...target.permanent("b", [], { controller: "you" }, "un autre permanent à vous"), otherThan: ["a"] },
        ],
        effects: [fx.removeCounters(ref.target("a"), 999, "+1/+1", "m"), fx.addCounters(ref.target("b"), amount.v("m"))],
        label: "Déplacez les marqueurs +1/+1 d'un de vos permanents sur un autre",
      }),
    ],
  },
  "Sphere Grid": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU, true), [fx.addCounters(ref.eventObject, 1)], {
        label: "Une de vos créatures blesse un joueur : un marqueur +1/+1 sur elle",
      }),
      staticAbility(P1P1_YOU, { addKeywords: ["reach", "trample"] }, { label: "Déblocage : portée et piétinement" }),
    ],
  },
  "Summoner's Sending": {
    abilities: [
      triggered(
        when.yourEndStep,
        fx.may(
          "Exiler une carte de créature d'un cimetière pour un Esprit 1/1 ?",
          fx.exileCard(ref.target()),
          fx.createTokens(SPIRIT, 1, undefined, "s"),
          ...fx.when(cond.amountAtLeast(amount.manaValueOf(ref.target()), 4), fx.addCounters(ref.stored("s"), 1)),
        ),
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
          label: "Exilez une carte de créature d'un cimetière : un Esprit 1/1 volant",
        },
      ),
    ],
  },

  "Forge of Heroes": FORGE_OF_HEROES,

  // --- Éphémères et rituels -----------------------------------------------------------------------------------------
  // Approximation : l'escalade se paie {1} par mode en plus (et non en engageant une créature dégagée).
  "Collective Effort": {
    spell: escalate(
      "{1}",
      {
        label: "Détruisez une créature de force 4 ou plus",
        targets: [{ ...target.creature("c", { minPower: 4 }), label: "créature de force 4 ou plus" }],
        effects: [fx.destroy(ref.target("c"))],
      },
      {
        label: "Détruisez un enchantement",
        targets: [target.permanent("e", ["Enchantment"], {}, "enchantement")],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        label: "Un marqueur +1/+1 sur chaque créature du joueur ciblé",
        targets: [target.player("p")],
        effects: [fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1)],
      },
    ),
  },
  "Damning Verdict": {
    spell: spell([], [fx.destroyAll({ types: ["Creature"], not: { withCounter: "any" } })]),
  },
  "Destroy Evil": {
    spell: {
      modes: [
        mode(
          "Détruisez une créature d'endurance 4 ou plus",
          [{ ...target.creature("c", { minToughness: 4 }), label: "créature d'endurance 4 ou plus" }],
          [fx.destroy(ref.target("c"))],
        ),
        mode(
          "Détruisez un enchantement",
          [target.permanent("e", ["Enchantment"], {}, "enchantement")],
          [fx.destroy(ref.target("e"))],
        ),
      ],
    },
  },
  "Promise of Loyalty": {
    spell: spell(
      [],
      fx.forEachPlayer(ref.eachPlayer, (p) => [
        fx.sacrifice(p, { types: ["Creature"] }, amount.plus(amount.refCount(ref.permanentsOf(p, { types: ["Creature"] })), -1)),
        fx.counters(ref.permanentsOf(p, { types: ["Creature"] }), "vow"),
        fx.modifyWhileCounter(
          ref.permanentsOf(p, { types: ["Creature"], withCounter: "vow" }),
          {
            addBlockRules: [{ cantAttackPlayer: "you", label: "Ne peut pas attaquer le lanceur de Promise of Loyalty" }],
          },
          "vow",
        ),
      ]),
    ),
  },
  "Protection Magic": {
    spell: spell([target.upTo(3, target.creature())], [fx.counters(ref.target(), "shield")]),
  },
  "Pull from Tomorrow": {
    spell: spell([], [fx.draw(amount.x), fx.discard(1)]),
  },
  "Three Visits": {
    spell: spell([], [fx.search({ subtype: "Forest" }, { to: "battlefield" })]),
  },
  "Yuna's Decision": {
    spell: {
      modes: [
        mode(
          "Poursuivre le pèlerinage",
          [],
          [
            fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { store: "s" }),
            ...fx.when(
              cond.v("s"),
              fx.draw(1),
              fx.pickFromZone(
                "hand",
                { types: ["Creature"] },
                { to: "battlefield" },
                { min: 0, prompt: "Une carte de créature à mettre sur le champ de bataille" },
              ),
              fx.pickFromZone(
                "hand",
                { types: ["Land"] },
                { to: "battlefield" },
                { min: 0, prompt: "Une carte de terrain à mettre sur le champ de bataille" },
              ),
            ),
          ],
        ),
        mode(
          "Trouver une autre voie",
          [
            {
              ...target.cardInGraveyard("g", { permanent: true }, "you", "cartes de permanent de votre cimetière"),
              count: 2,
              minCount: 1,
            },
          ],
          [fx.toHand(ref.target("g"))],
        ),
      ],
    },
  },
  "Yuna's Whistle": {
    spell: spell(
      [],
      [
        fx.revealUntilN({ types: ["Creature"] }, 1, { to: "hand" }, "w"),
        fx.reflexive(
          [target.creature("t", { controller: "you" })],
          [fx.addCounters(ref.target(), amount.manaValueOf(ref.target("w")))],
          { w: ref.stored("w") },
        ),
      ],
    ),
  },
};
