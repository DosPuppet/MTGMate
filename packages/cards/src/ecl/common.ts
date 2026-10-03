/**
 * Éléments propres à Lorwyn Eclipsed (ECL) : jetons. Le DSL et les jetons communs viennent des extensions précédentes
 * (via lci/common.ts).
 */
import type { AbilityDef, CardScript, TokenSpec } from "@mtgx/engine";
import { activated, fx, manaAbility, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Sylvin (Sapling Nursery) : créature verte 3/4 avec la portée. */
export const TREEFOLK_REACH: TokenSpec = creature("Treefolk", ["G"], ["Treefolk"], 3, 4, { keywords: ["reach"] });
/** Kithkin : créature verte et blanche 1/1. */
export const KITHKIN: TokenSpec = creature("Kithkin", ["G", "W"], ["Kithkin"], 1, 1);
/** Ondin : créature blanche et bleue 1/1. */
export const MERFOLK_WU: TokenSpec = creature("Merfolk", ["W", "U"], ["Merfolk"], 1, 1);
/** Gobelin : créature noire et rouge 1/1. */
export const GOBLIN_BR: TokenSpec = creature("Goblin", ["B", "R"], ["Goblin"], 1, 1);
/** Faerie : créature bleue et noire 1/1 avec le vol. */
export const FAERIE_UB: TokenSpec = creature("Faerie", ["U", "B"], ["Faerie"], 1, 1, { keywords: ["flying"] });
/** Changeforme : créature incolore 1/1 avec le changelin. */
export const SHAPESHIFTER: TokenSpec = creature("Shapeshifter", [], ["Shapeshifter"], 1, 1, { keywords: ["changeling"] });
/** Elfe : créature noire et verte 2/2. */
export const ELF_BG: TokenSpec = creature("Elf", ["B", "G"], ["Elf"], 2, 2);
/** Élan : créature verte 3/3. */
export const ELK: TokenSpec = creature("Elk", ["G"], ["Elk"], 3, 3);
/** Ver : créature noire et verte 1/1. */
export const WORM_BG: TokenSpec = creature("Worm", ["B", "G"], ["Worm"], 1, 1);
/** Mutavault : terrain, « {T} : ajoutez {C} » et « {1} : devient une créature 2/2 de tous les types jusqu'à la fin du tour ». */
export const MUTAVAULT: TokenSpec = {
  name: "Mutavault",
  colors: [],
  types: ["Land"],
  subtypes: [],
  abilities: [
    manaAbility(["C"]),
    activated({
      mana: "{1}",
      effects: [fx.modify(ref.self, { addTypes: ["Creature"], addKeywords: ["changeling"], setPower: 2, setToughness: 2 })],
      label: "Devient une créature 2/2 de tous les types jusqu'à la fin du tour",
    }),
  ],
  text: "{T}: Add {C}.\n{1}: This token becomes a 2/2 creature with all creature types until end of turn. It's still a land.",
};

/**
 * Champions (« contemplez un [type] et exilez-le » en coût additionnel ; « quand cette créature quitte le champ de
 * bataille, renvoyez la carte exilée dans la main de son propriétaire ») : un permanent que vous contrôlez ou une carte
 * de votre main, choisi par le moteur, lié à la créature.
 */
export function champion(subtype: string, abilities: AbilityDef[]): CardScript {
  return {
    additionalCost: { exile: { filter: { subtype }, count: 1, fromHand: true } },
    abilities: [
      ...abilities,
      triggered(when.leavesSelf, [fx.toHand(ref.linked)], { label: "La carte exilée revient dans la main de son propriétaire" }),
    ],
  };
}

/**
 * « En coût additionnel, contemplez un [type] ou payez {N} » : un permanent que vous contrôlez ou une autre carte de votre
 * main (révélée), sinon {N} de plus.
 */
export const beholdOrPay = (subtype: string, n: number): CardScript["additionalCost"] => ({
  behold: { filter: { subtype }, orPay: { generic: n, colored: {}, x: 0 } },
});
