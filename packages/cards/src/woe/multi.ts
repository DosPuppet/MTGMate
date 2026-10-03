/** Wilds of Eldraine — cartes multicolores. */
import type { ManaRestriction, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CELEBRATION,
  chapter,
  cond,
  costReducer,
  createRole,
  entersWith,
  FOOD,
  fx,
  MONSTER_ROLE,
  mode,
  RAT_NO_BLOCK,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/**
 * Troyan : « ce mana ne peut servir qu'à lancer des sorts de valeur de mana 5 ou plus, ou des sorts avec {X} dans leur
 * coût de mana ».
 */
const TROYAN_MANA: ManaRestriction = { spell: { anyOf: [{ minManaValue: 5 }, { hasX: true }] } };

/** « Chaque fois que vous engagez une créature dégagée qu'un adversaire contrôle » (Hylda, Sharae). */
const YOU_TAP_OPPONENT_CREATURE: TriggerSpec = {
  on: "taps",
  who: { types: ["Creature"], controller: "opponent" },
  byYou: true,
};
/** Élémental : créature blanche et bleue 4/4 (Hylda of the Icy Crown). */
const ELEMENTAL_WU: TokenSpec = {
  name: "Elemental",
  colors: ["W", "U"],
  types: ["Creature"],
  subtypes: ["Elemental"],
  power: 4,
  toughness: 4,
};

export const MULTI: Record<string, CardScript> = {
  "The Apprentice's Folly": {
    abilities: [
      chapter([1, 2], [fx.copyToken(ref.target(), { nonlegendary: true, addSubtypes: ["Reflection"], addKeywords: ["haste"] })], {
        targets: [
          target.creature("t", {
            controller: "you",
            nontoken: true,
            notSameNameAs: { token: true, controller: "you" },
          }),
        ],
        label: "Chapitres I et II — Un jeton copie (Reflet, non légendaire, célérité)",
      }),
      chapter([3], [fx.sacrifice(ref.you, { subtype: "Reflection" }, 99)], { label: "Chapitre III — Sacrifiez vos Reflets" }),
    ],
  },
  "Yenna, Redtooth Regent": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent("t", ["Enchantment"], { controller: "you", notSameNameAs: { controller: "you" } }, "enchantement"),
        ],
        effects: [
          fx.copyToken(ref.target(), { nonlegendary: true, store: "y" }),
          ...fx.when(cond.refMatches(ref.stored("y"), { subtype: "Aura" }), fx.untap(ref.self), fx.scry(2)),
        ],
        label: "Un jeton copie (non légendaire) d'un de vos enchantements ; une Aura : dégagez Yenna, regard 2",
      }),
    ],
  },
  // Vol lu dans le texte.
  "Likeness Looter": {
    abilities: [
      activated({ tap: true, effects: fx.loot(1), label: "Piochez une carte, puis défaussez une carte" }),
      activated({
        mana: "{X}",
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de valeur de mana X")],
        effects: [
          fx.becomeCopy(ref.self, ref.target(), "permanent", {
            addKeywords: ["flying"],
            keepAbilities: [1],
            ifManaValue: amount.x,
          }),
        ],
        label: "Devient une copie d'une carte de créature de VM X de votre cimetière (avec le vol et cette capacité)",
      }),
    ],
  },
  "Faunsbane Troll": {
    abilities: [
      triggered(when.entersSelf, createRole(MONSTER_ROLE, ref.self), { label: "Un Rôle Monstre attaché à elle" }),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { subtype: "Aura", attachedToSelf: true }, count: 1 },
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.exileIfDies(ref.target()), fx.fight(ref.self, ref.target())],
        label: "Sacrifiez une Aura attachée : elle se bat contre une créature (exilée si elle meurt ce tour-ci)",
      }),
    ],
  },
  // Menace lue dans le texte. Comme Will, Scion of Peace : la réduction est accordée à Rowan pour le tour.
  "Rowan, Scion of War": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        effects: [
          fx.modify(ref.self, {
            addAbilities: [
              costReducer({ colors: ["B", "R"] }, 0, "Vos sorts noirs et/ou rouges coûtent {X} de moins (PV perdus)", {
                genericAmount: amount.lifeLostThisTurn,
              }),
            ],
          }),
        ],
        label: "Vos sorts noirs et/ou rouges coûtent {X} de moins ce tour-ci",
      }),
    ],
  },
  // Le mode est choisi au déclenchement, puis {1} est payé ou non (au lieu de « payez {1} ; quand vous le faites, choisissez »).
  "Hylda of the Icy Crown": {
    abilities: [
      // « Vous pouvez payer {1}. Quand vous le faites, choisissez un — » : le mode est choisi par la capacité réflexive.
      triggered(
        YOU_TAP_OPPONENT_CREATURE,
        fx.mayPay(
          "{1}",
          "Payer {1} ?",
          fx.reflexiveModal([
            mode("Un Élémental 4/4", [], [fx.createTokens(ELEMENTAL_WU)]),
            mode(
              "Un marqueur +1/+1 sur chaque créature que vous contrôlez",
              [],
              [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
            ),
            mode("Regard 2, puis piochez une carte", [], [fx.scry(2), fx.draw(1)]),
          ]),
        ),
        { label: "Vous engagez une créature adverse : vous pouvez payer {1}" },
      ),
    ],
  },
  "Sharae of Numbing Depths": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature adverse, marqueur d'étourdissement",
      }),
      triggered(YOU_TAP_OPPONENT_CREATURE, [fx.draw(1)], {
        oncePerTurn: true,
        label: "Vous engagez une créature adverse : piochez une carte (une fois par tour)",
      }),
    ],
  },
  "Eriette of the Charmed Apple": {
    abilities: [
      staticAbility(
        { types: ["Creature"], enchanted: "byYou" },
        { addBlockRules: [{ cantAttackSourceController: true, label: "Ne peut pas attaquer le contrôleur d'Eriette" }] },
        { label: "Les créatures enchantées par vos Auras ne peuvent pas vous attaquer" },
      ),
      triggered(
        when.yourEndStep,
        [
          fx.loseLife(amount.count({ subtype: "Aura", controller: "you" }), ref.eachOpponent),
          fx.gainLife(amount.count({ subtype: "Aura", controller: "you" })),
        ],
        { label: "Chaque adversaire perd X PV, vous en gagnez X (X : vos Auras)" },
      ),
    ],
  },
  "Syr Armont, the Redeemer": {
    abilities: [
      triggered(when.entersSelf, createRole(MONSTER_ROLE), {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Un Rôle Monstre attaché à une autre créature que vous contrôlez",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", enchanted: true },
        { power: 1, toughness: 1 },
        { label: "Vos créatures enchantées : +1/+1" },
      ),
    ],
  },
  "Ash, Party Crasher": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], {
        condition: CELEBRATION,
        label: "Célébration — un marqueur +1/+1 sur Ash",
      }),
    ],
  },
  "The Goose Mother": {
    abilities: [
      entersWith({ counters: amount.x, label: "Arrive avec X marqueurs +1/+1" }),
      // « La moitié de X Nourritures, arrondie à l'unité supérieure » : (X + 1) / 2, arrondi à l'inférieur.
      triggered(when.entersSelf, [fx.createTokens(FOOD, amount.per(amount.plus(amount.sourceX, 1), 2))], {
        label: "La moitié de X Nourritures (arrondie au supérieur)",
      }),
      triggered(
        when.attacksSelf,
        [fx.sacrifice(ref.you, { subtype: "Food" }, 1, { optional: true, store: "f" }), ...fx.when(cond.v("f"), fx.draw(1))],
        { label: "Vous pouvez sacrifier une Nourriture pour piocher une carte" },
      ),
    ],
  },
  "Greta, Sweettooth Scourge": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      activated({
        mana: "{G}",
        sacrificeOther: { filter: { subtype: "Food" } },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Un marqueur +1/+1 sur une créature",
      }),
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { subtype: "Food" } },
        effects: [fx.draw(1), fx.loseLife(1)],
        label: "Piochez une carte et perdez 1 point de vie",
      }),
    ],
  },
  "Neva, Stalked by Nightmares": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] },
            "you",
            "carte de créature ou d'enchantement de votre cimetière",
          ),
        ],
        label: "Renvoie une carte de créature ou d'enchantement en main",
      }),
      triggered(
        { on: "leaves", who: { types: ["Enchantment"], controller: "you" }, to: "graveyard" },
        [fx.addCounters(ref.self, 1), fx.scry(1)],
        { label: "Un enchantement mis au cimetière : un marqueur +1/+1, puis regard 1" },
      ),
    ],
  },
  "Obyra, Dreaming Duelist": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Faerie", controller: "you", other: true }),
        [fx.loseLife(1, ref.eachOpponent)],
        { label: "Chaque adversaire perd 1 point de vie" },
      ),
    ],
  },
  "Totentanz, Swarm Piper": {
    abilities: [
      // « Totentanz ou une autre créature non-jeton que vous contrôlez » : Totentanz est elle-même non-jeton.
      triggered(when.dies({ types: ["Creature"], controller: "you", nontoken: true }), [fx.createTokens(RAT_NO_BLOCK)], {
        label: "Un Rat 1/1 qui ne peut pas bloquer",
      }),
      activated({
        mana: "{1}{B}",
        targets: [target.creature("t", { subtype: "Rat", attacking: true, controller: "you" })],
        effects: [fx.pump(ref.target(), 0, 0, ["deathtouch"])],
        label: "Un Rat attaquant gagne le contact mortel",
      }),
    ],
  },
  "Troyan, Gutsy Explorer": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addManaChoice(1, ["G"], TROYAN_MANA), fx.addManaChoice(1, ["U"], TROYAN_MANA)],
        label: "Ajoutez {G}{U} (sorts de VM 5 ou plus)",
      }),
      activated({ mana: "{U}", tap: true, effects: fx.loot(1), label: "Piochez, puis défaussez" }),
    ],
  },
  "Will, Scion of Peace": {
    abilities: [
      // Approximation : la réduction est accordée à Will jusqu'à la fin du tour (elle cesse s'il quitte le champ de
      // bataille) ; X est lu à chaque sort lancé (points de vie gagnés ce tour-ci).
      activated({
        tap: true,
        sorcerySpeed: true,
        effects: [
          fx.modify(ref.self, {
            addAbilities: [
              costReducer({ colors: ["W", "U"] }, 0, "Vos sorts blancs et/ou bleus coûtent {X} de moins (PV gagnés)", {
                genericAmount: amount.lifeGainedThisTurn,
              }),
            ],
          }),
        ],
        label: "Vos sorts blancs et/ou bleus coûtent {X} de moins ce tour-ci",
      }),
    ],
  },
};
