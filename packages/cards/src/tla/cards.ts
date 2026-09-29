/**
 * Avatar: The Last Airbender — cartes des decks du méta (phase 1 du plan P4, lot M1) : maîtrise de la terre
 * (`fx.earthbend`). L'extension n'est pas encore couverte en entier.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CLUE,
  cond,
  cost,
  entersWith,
  fx,
  manaAbility,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Ba Sing Se": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Engagé, sauf si vous contrôlez un terrain de base",
      }),
      manaAbility("G"),
      activated({
        mana: "{2}{G}",
        tap: true,
        sorcerySpeed: true,
        targets: [LAND_YOU_CONTROL],
        effects: fx.earthbend(ref.target(), 2),
        label: "Maîtrise de la terre 2",
      }),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Earthbender Ascension": {
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 2), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre 2, puis un terrain de base",
      }),
      triggered(
        when.landfall,
        [
          fx.counters(ref.self, "quest"),
          ...fx.when(
            cond.counterAtLeast("quest", 4),
            fx.reflexive(
              [target.creature("t", { controller: "you" })],
              [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["trample"] })],
            ),
          ),
        ],
        { label: "Marqueur de quête ; à 4 ou plus, +1/+1 et piétinement" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Callous Inspector": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.you), fx.createTokens(CLUE)], { label: "1 blessure à vous, un Indice" }),
    ],
  },
  "Deadly Precision": {
    additionalCost: {
      sacrifice: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, count: 1, orPay: cost("{4}") },
    },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Obsessive Pursuit": {
    abilities: [
      triggered(when.entersSelf, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Perdez 1 PV, un Indice" }),
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Perdez 1 PV, un Indice" }),
      triggered(
        when.attackWith(1),
        [
          fx.addCounters(ref.target(), amount.sacrificedThisTurn),
          ...fx.when(cond.amountAtLeast(amount.sacrificedThisTurn, 3), fx.modify(ref.target(), { addKeywords: ["lifelink"] })),
        ],
        {
          targets: [target.creature("t", { attacking: true })],
          label: "X marqueurs +1/+1 (permanents sacrifiés ce tour-ci)",
        },
      ),
    ],
  },
  "Wan Shi Tong, Librarian": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, amount.sourceX), fx.draw(amount.per(amount.sourceX, 2))], {
        label: "X marqueurs +1/+1, piochez X/2 cartes",
      }),
      triggered(when.search("opponent"), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "Marqueur +1/+1, piochez" }),
    ],
  },
  "Day of Black Sun": {
    spell: spell(
      [],
      [
        fx.modifyAll({ types: ["Creature"], maxManaValueX: true }, { loseAllAbilities: true }),
        fx.destroyAll({ types: ["Creature"], maxManaValueX: true }),
      ],
    ),
  },
  "Raven Eagle": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
            ...fx.when(cond.v("c"), fx.createTokens(CLUE)),
          ],
          { targets: [target.optional(target.cardInGraveyard("t", {}, "any"))], label: "Exiler une carte d'un cimetière" },
        ),
      ),
      triggered(when.draw(2), fx.drain(1), { label: "Chaque adversaire perd 1 PV, vous en gagnez 1" }),
    ],
  },
};
