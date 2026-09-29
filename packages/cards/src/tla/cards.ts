/**
 * Avatar: The Last Airbender — cartes des decks du méta (phase 1 du plan P4, lot M1) : maîtrise de la terre
 * (`fx.earthbend`). L'extension n'est pas encore couverte en entier.
 */
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
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
};
