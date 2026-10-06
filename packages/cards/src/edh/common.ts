/**
 * Éléments partagés par les scripts du pseudo-ensemble Commander (EDH, PLAN-E) : le DSL et les jetons des autres
 * extensions (par Tarkir: Dragonstorm), plus ceux des decks Commander.
 */
import type { ManaType, TokenSpec } from "@mtgx/engine";

export * from "../tdm/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Vampire noir 1/1 (Edgar Markov). */
export const VAMPIRE_BLACK: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 1, 1);
/** Vampire noir 2/2 avec le vol (Bloodline Keeper). */
export const VAMPIRE_FLYING: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 2, 2, { keywords: ["flying"] });
/** Vampire blanc et noir 1/1 avec le lien de vie (Edgar Markov's Coffin). */
export const VAMPIRE_WB_LIFELINK: TokenSpec = creature("Vampire", ["W", "B"], ["Vampire"], 1, 1, { keywords: ["lifelink"] });
/** Les cinq couleurs, pour « un mana de n'importe quelle couleur ». */
export const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];
