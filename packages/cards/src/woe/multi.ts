/** Wilds of Eldraine — cartes multicolores. */
import type { ManaRestriction } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CELEBRATION,
  cond,
  costReducer,
  entersWith,
  FOOD,
  fx,
  RAT_NO_BLOCK,
  ref,
  target,
  triggered,
  when,
} from "./common";

/**
 * Troyan : « ce mana ne peut servir qu'à lancer des sorts de valeur de mana 5 ou plus, ou des sorts avec {X} dans leur
 * coût de mana ». Approximation : le moteur ne sait pas filtrer un sort sur la présence de {X} ; seule la valeur de mana
 * (sans X) est lue, ce qui est plus restrictif que la carte.
 */
const TROYAN_MANA: ManaRestriction = { spell: { minManaValue: 5 } };

export const MULTI: Record<string, CardScript> = {
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
