/**
 * Éléments communs de Wilds of Eldraine (WOE) : Rôles (jetons-Auras, 303.7, 704.5y), Célébration et jetons de
 * l'extension. Le DSL et les jetons génériques viennent des extensions précédentes (via lci/common.ts).
 */
import type { AbilityDef, Condition, dsl, LayerMods, Ref, TokenSpec } from "@mtgx/engine";
import { amount, cond, cost, fx, ref, staticAbility, triggered, wardAbility, when } from "../lci/common";

export * from "../lci/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Chevalier : créature blanche 2/2 avec la vigilance. */
export const KNIGHT_VIGILANCE: TokenSpec = creature("Knight", ["W"], ["Knight"], 2, 2, { keywords: ["vigilance"] });
/** Humain : créature blanche 1/1. */
export const HUMAN_W: TokenSpec = creature("Human", ["W"], ["Human"], 1, 1);

/** Un Rôle : jeton d'enchantement incolore, Aura (« Enchant creature »), sous-type Role. */
const role = (name: string, abilities: AbilityDef[], text: string): TokenSpec => ({
  name: `${name} Role`,
  colors: [],
  types: ["Enchantment"],
  subtypes: ["Aura", "Role"],
  enchant: { filter: { types: ["Creature"] }, label: "créature" },
  abilities,
  text: `Enchant creature\n${text}`,
});

const plusOne = (label: string, extra: LayerMods = {}) =>
  staticAbility("attached", { power: 1, toughness: 1, ...extra }, { label });

/** Cursed Role : « la créature enchantée est 1/1 ». */
export const CURSED_ROLE = role(
  "Cursed",
  [staticAbility("attached", { setPower: 1, setToughness: 1 }, { label: "La créature enchantée est 1/1" })],
  "Enchanted creature is 1/1.",
);
/** Monster Role : +1/+1 et le piétinement. */
export const MONSTER_ROLE = role(
  "Monster",
  [plusOne("+1/+1 et le piétinement", { addKeywords: ["trample"] })],
  "Enchanted creature gets +1/+1 and has trample.",
);
/** Royal Role : +1/+1 et la garde {1}. */
export const ROYAL_ROLE = role(
  "Royal",
  [plusOne("+1/+1 et la garde {1}", { addAbilities: [wardAbility({ mana: cost("{1}") })] })],
  "Enchanted creature gets +1/+1 and has ward {1}.",
);
/** Sorcerer Role : +1/+1 et « chaque fois que cette créature attaque, regard 1 ». */
export const SORCERER_ROLE = role(
  "Sorcerer",
  [
    plusOne("+1/+1 ; en attaquant, regard 1", {
      addAbilities: [triggered(when.attacksSelf, [fx.scry(1)], { label: "Regard 1" })],
    }),
  ],
  'Enchanted creature gets +1/+1 and has "Whenever this creature attacks, scry 1."',
);
/** Wicked Role : +1/+1 ; mis dans un cimetière, chaque adversaire perd 1 point de vie. */
export const WICKED_ROLE = role(
  "Wicked",
  [
    plusOne("+1/+1"),
    triggered({ on: "leaves", who: "self", to: "graveyard" }, [fx.loseLife(1, ref.eachOpponent)], {
      label: "Chaque adversaire perd 1 point de vie",
    }),
  ],
  "Enchanted creature gets +1/+1.\nWhen this token is put into a graveyard, each opponent loses 1 life.",
);
/** Young Hero Role : « chaque fois que cette créature attaque, si son endurance est de 3 ou moins, un marqueur +1/+1 ». */
export const YOUNG_HERO_ROLE = role(
  "Young Hero",
  [
    staticAbility(
      "attached",
      {
        addAbilities: [
          triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], {
            condition: cond.sourceMatches({ maxToughness: 3 }),
            label: "Endurance de 3 ou moins : un marqueur +1/+1",
          }),
        ],
      },
      { label: "En attaquant, si son endurance est de 3 ou moins : un marqueur +1/+1" },
    ),
  ],
  'Enchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it."',
);

/**
 * « Créez un jeton Rôle [N] attaché à [la créature] » (ou à chacune des créatures désignées) : rien n'est créé pour une
 * créature qui n'est plus sur le champ de bataille (303.7b) ; un autre Rôle du même joueur sur elle part au cimetière
 * (704.5y).
 */
export function createRole(token: TokenSpec, to: Ref = ref.target()): dsl.Effects {
  return [fx.createTokens(token, 1, undefined, undefined, to)];
}

/** Célébration : « si deux permanents non-terrain ou plus sont arrivés sous votre contrôle ce tour-ci ». */
export const CELEBRATION: Condition = cond.amountAtLeast(
  amount.turnEvents({ event: "zone", to: "battlefield", notTypes: ["Land"], who: "you" }),
  2,
);
