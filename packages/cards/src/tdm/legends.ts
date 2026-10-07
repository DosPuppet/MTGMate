/** Tarkir: Dragonstorm — légendaires et cartes uniques (lot C). */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  castPermission,
  chapter,
  cond,
  costReducer,
  ELEPHANT_5,
  eventReplacement,
  flurry,
  fx,
  INSTANT_SORCERY,
  loyalty,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  renew,
  SOLDIER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
  ZOMBIE_DRUID,
} from "./common";

/** « Permanent d'une ou plusieurs couleurs » (Ugin). */
const COLORED_PERMANENT = targetObj("t", { not: { colorCount: 0 } }, "permanent d'une ou plusieurs couleurs");
const TOTAL_TOUGHNESS = amount.totalToughness(CREATURE_YOU_CONTROL);
const COLORS = ["W", "U", "B", "R", "G"] as const;

/** Felothar : « vous pouvez sacrifier un permanent non-terrain ; quand vous le faites, un marqueur +1/+1 sur chacune de vos créatures ». */
const FELOTHAR = [
  fx.sacrifice(ref.you, { notTypes: ["Land"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.v("s"), fx.reflexive([], [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)])),
];

export const LEGENDS: Record<string, CardScript> = {
  // --- Incolore -----------------------------------------------------------------
  "Ugin, Eye of the Storms": {
    abilities: [
      triggered(when.castSelf, [fx.exile(ref.target())], {
        targets: [target.optional(COLORED_PERMANENT)],
        label: "Exilez jusqu'à un permanent coloré",
      }),
      triggered(when.castSpell("you", { colorCount: 0 }), [fx.exile(ref.target())], {
        targets: [target.optional(COLORED_PERMANENT)],
        label: "Sort incolore : exilez jusqu'à un permanent coloré",
      }),
      loyalty(2, { effects: [fx.gainLife(3), fx.draw(1)], label: "Gagnez 3 PV, piochez une carte" }),
      loyalty(0, { effects: [fx.addMana("C", "C", "C")], label: "Ajoutez {C}{C}{C}" }),
      loyalty(-11, {
        effects: [
          fx.search({ colorCount: 0, notTypes: ["Land"] }, { to: "exile" }, 99, undefined, "u"),
          fx.grantPlay(ref.stored("u"), { free: true }),
        ],
        label: "Exilez des cartes incolores non-terrain : lancez-les gratuitement ce tour-ci",
      }),
    ],
  },

  // --- Blanc -------------------------------------------------------------------
  "Elspeth, Storm Slayer": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        modify: { times: 2 },
        label: "Les jetons créés sous votre contrôle : le double",
      }),
      loyalty(1, { effects: [fx.createTokens(SOLDIER)], label: "Un Soldat 1/1" }),
      loyalty(0, {
        effects: [
          fx.addCountersAll(CREATURE_YOU_CONTROL, 1),
          fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["flying"] }, "untilYourNextTurn"),
        ],
        label: "Un marqueur +1/+1 et le vol jusqu'à votre prochain tour pour vos créatures",
      }),
      loyalty(-3, {
        targets: [target.creature("t", { controller: "opponent", minManaValue: 3 })],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez une créature adverse de VM 3 ou plus",
      }),
    ],
  },

  // --- Bleu --------------------------------------------------------------------
  "Taigam, Master Opportunist": {
    abilities: [
      flurry(
        [fx.copySpell(ref.eventObject, 1), fx.suspend(ref.eventObject, 4)],
        "copiez ce sort, puis exilez-le suspendu avec quatre marqueurs de temps",
      ),
    ],
  },

  // --- Noir --------------------------------------------------------------------
  "Hundred-Battle Veteran": {
    castFromGraveyard: { finality: true },
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 4 },
        {
          condition: cond.amountAtLeast(amount.counterKindsAmong(CREATURE_YOU_CONTROL), 3),
          label: "Trois sortes de marqueurs parmi vos créatures : +2/+4",
        },
      ),
    ],
  },
  "Krumar Initiate": {
    abilities: [
      activated({
        mana: "{X}{B}",
        tap: true,
        payLifeX: true,
        sorcerySpeed: true,
        effects: [fx.endure(ref.self, amount.x)],
        label: "Payez X PV : endurance X",
      }),
    ],
  },
  "Rot-Curse Rakshasa": {
    abilities: [
      renew(
        "{X}{B}{B}",
        [{ ...target.upTo(99, target.creature()), countX: true }],
        [fx.counters(ref.target(), "decayed")],
        "un marqueur de décomposition sur chacune de X créatures",
      ),
    ],
  },
  "The Sibsig Ceremony": {
    abilities: [
      costReducer({ types: ["Creature"] }, 2, "Vos sorts de créature coûtent {2} de moins"),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", cast: true }),
        [fx.destroy(ref.eventObject), fx.createTokens(ZOMBIE_DRUID)],
        { label: "Une de vos créatures lancées arrive : détruisez-la, un Zombie Druide 2/2" },
      ),
    ],
  },
  "Sidisi, Regent of the Mire": {
    // La cible (VM X + 1) est choisie quand le coût est payé : capacité réflexive (timing).
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [
          fx.reflexive(
            [
              {
                ...target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de VM X + 1"),
                manaValueAmount: amount.plus(amount.manaValueOf(ref.costSacrificed), 1),
              },
            ],
            [fx.toBattlefield(ref.target())],
          ),
        ],
        label: "Sacrifiez une créature de VM X : une créature de VM X + 1 revient",
      }),
    ],
  },

  // --- Rouge -------------------------------------------------------------------
  Dracogenesis: {
    abilities: [
      castPermission({
        freeFrom: "any",
        freeFilter: { subtype: "Dragon" },
        label: "Sorts de Dragon sans payer leur coût de mana",
      }),
    ],
  },

  // --- Vert --------------------------------------------------------------------
  "Formation Breaker": {
    abilities: [
      blockAbility(block.notBy({ powerBelowSource: true }, "Imblocable par les créatures de force inférieure")),
      staticAbility(
        "self",
        { power: 1, toughness: 2 },
        { condition: cond.controls(CREATURE_WITH_COUNTER), label: "Une de vos créatures a un marqueur : +1/+2" },
      ),
    ],
  },

  // --- Multicolore ---------------------------------------------------------------
  "All-Out Assault": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        {
          label: "Vos créatures : +1/+1 et le contact mortel",
        },
      ),
      triggered(
        when.entersSelf,
        [
          fx.extraCombatAfterMain,
          fx.emblem(
            "All-Out Assault",
            "When you next attack this turn, untap each creature you control.",
            [
              triggered(when.attackWith(1), [fx.untapAll({ types: ["Creature"] })], {
                oncePerTurn: true,
                label: "Dégagez chaque créature que vous contrôlez",
              }),
            ],
            false,
            true,
          ),
        ],
        {
          condition: cond.all(cond.yourTurn, cond.any(cond.step("main1"), cond.step("main2"))),
          label: "Pendant votre phase principale : un combat et une phase principale supplémentaires",
        },
      ),
    ],
  },
  "Betor, Kin to All": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.draw(1),
          ...fx.when(cond.amountAtLeast(TOTAL_TOUGHNESS, 20), fx.untapAll({ types: ["Creature"] })),
          // « chaque adversaire perd la moitié de ses points de vie » : chacun d'après les siens.
          ...fx.when(
            cond.amountAtLeast(TOTAL_TOUGHNESS, 40),
            fx.forEachPlayer(ref.eachOpponent, (p) => [fx.loseLife(amount.halfLife(p), p)]),
          ),
        ],
        {
          condition: cond.amountAtLeast(TOTAL_TOUGHNESS, 10),
          label: "Endurance totale 10 : piochez ; 20 : dégagez ; 40 : chaque adversaire perd la moitié de ses PV",
        },
      ),
    ],
  },
  "Call the Spirit Dragons": {
    abilities: [
      staticAbility(
        { subtype: "Dragon", controller: "you" },
        { addKeywords: ["indestructible"] },
        {
          label: "Vos Dragons sont indestructibles",
        },
      ),
      triggered(
        when.yourUpkeep,
        [
          ...COLORS.flatMap((c) => [
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Dragon", colors: [c] }), ref.you, `d${c}`),
            fx.addCounters(ref.stored(`d${c}`), 1),
          ]),
          ...fx.when(cond.amountAtLeast(amount.refCount(ref.union(...COLORS.map((c) => ref.stored(`d${c}`)))), 5), fx.winGame),
        ],
        { label: "Pour chaque couleur, un marqueur +1/+1 sur un de vos Dragons ; cinq Dragons : vous gagnez" },
      ),
    ],
  },
  "Eshki Dragonclaw": {
    abilities: [
      triggered(when.yourCombat, [fx.draw(1), fx.addCounters(ref.self, 2)], {
        condition: cond.all(
          cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Creature"] }), 1),
          cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", notTypes: ["Creature"] }), 1),
        ),
        label: "Un sort de créature et un sort non-créature ce tour-ci : piochez, deux marqueurs +1/+1",
      }),
    ],
  },
  "Felothar, Dawn of the Abzan": {
    abilities: [
      triggered(when.entersSelf, FELOTHAR, { label: "Sacrifiez un permanent non-terrain : un marqueur +1/+1 sur vos créatures" }),
      triggered(when.attacksSelf, FELOTHAR, {
        label: "Sacrifiez un permanent non-terrain : un marqueur +1/+1 sur vos créatures",
      }),
    ],
  },
  "Kotis, the Fangkeeper": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.eventPlayer, amount.eventAmount, "x"),
          fx.castNow(ref.stored("x"), { free: true, many: true, maxManaValue: amount.eventAmount }),
        ],
        { label: "Exilez X cartes de sa bibliothèque : lancez gratuitement celles de VM X ou moins" },
      ),
    ],
  },
  "Mardu Siegebreaker": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.optional(target.creature("t", { controller: "you", other: true }))],
        label: "Exilez une autre de vos créatures tant qu'il reste",
      }),
      triggered(
        when.attacksSelf,
        [fx.copyToken(ref.exiledWith, { tapped: true, attackEach: ref.eachOpponent, sacrificeAtEndStep: true })],
        { label: "Pour chaque adversaire, un jeton copie de la carte exilée, engagé et l'attaquant" },
      ),
    ],
  },
  "Narset, Jeskai Waymaster": {
    abilities: [
      triggered(
        when.yourEndStep,
        fx.may(
          "défausser votre main pour piocher autant de cartes que de sorts lancés ce tour-ci ?",
          fx.discard(amount.cardsIn("hand")),
          fx.draw(amount.spellsCastThisTurn),
        ),
        { label: "Défaussez votre main : piochez une carte par sort lancé ce tour-ci" },
      ),
    ],
  },
  "Roar of Endless Song": {
    abilities: [
      chapter([1, 2], [fx.createTokens(ELEPHANT_5)], { label: "Un Éléphant 5/5" }),
      chapter([3], [fx.doublePT(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Doublez la force et l'endurance de vos créatures",
      }),
    ],
  },
  "Shiko, Paragon of the Way": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.castCopiesFree([ref.stored("x")], 3)], {
        targets: [
          target.cardInGraveyard("t", { notTypes: ["Land"], maxManaValue: 3 }, "you", "carte non-terrain de VM 3 ou moins"),
        ],
        label: "Exilez une carte de VM 3 ou moins : lancez-en une copie gratuitement",
      }),
    ],
  },
  "Songcrafter Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.grantHarmonize(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel")],
        label: "Un éphémère ou un rituel de votre cimetière gagne l'harmonie",
      }),
    ],
  },
  "Stalwart Successor": {
    abilities: [
      triggered(when.countersPut(CREATURE_YOU_CONTROL, undefined, true), [fx.addCounters(ref.eventObject, 1)], {
        label: "Premiers marqueurs du tour sur une de vos créatures : un marqueur +1/+1 de plus",
      }),
    ],
  },
  "Teval, Arbiter of Virtue": {
    abilities: [
      playerStatic({ spellKeywords: { filter: {}, keywords: ["delve"] }, label: "Les sorts que vous lancez ont la cave" }),
      triggered(when.castSpell("you"), [fx.loseLife(amount.manaValueOf(ref.eventObject))], {
        label: "Vous perdez autant de PV que la valeur de mana du sort",
      }),
    ],
  },
  "Ureni, the Song Unending": {
    abilities: [
      protectionAbility(protection.from({ colors: ["W", "B"] }, "Protection contre le blanc et contre le noir")),
      triggered(when.entersSelf, [fx.damageDivided(amount.count({ types: ["Land"], controller: "you" }), ref.target())], {
        targets: [target.upTo(99, target.creatureOrPlaneswalker("t", { controller: "opponent" }))],
        label: "X blessures réparties entre les créatures et planeswalkers adverses (X : vos terrains)",
      }),
    ],
  },
  "Zurgo, Thunder's Decree": {
    // Mobilisation 2 : lue dans le texte.
    abilities: [
      staticAbility(
        { subtype: "Warrior", token: true, controller: "you" },
        { addKeywords: ["cantBeSacrificed"] },
        {
          condition: cond.all(cond.yourTurn, cond.step("end")),
          label: "Pendant votre étape de fin, vos jetons Guerrier ne peuvent pas être sacrifiés",
        },
      ),
    ],
  },

  // --- Lot D : remplacements de blessures (R1) ------------------------------------
  "Neriv, Heart of the Storm": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { types: ["Creature"], controller: "you", enteredThisTurn: true },
        modify: { times: 2 },
        label: "Vos créatures arrivées ce tour-ci infligent le double de blessures",
      }),
    ],
  },
  "New Way Forward": {
    spell: spell(
      [],
      [
        fx.shield(
          {
            event: "damage",
            to: "you",
            modify: { prevent: true },
            onPrevent: { reflexive: [fx.damage(amount.eventAmount, ref.eventPlayer), fx.draw(amount.eventAmount)] },
          },
          true,
        ),
      ],
    ),
  },
};
