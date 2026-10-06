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
/** Les cinq couleurs, pour « un mana de n'importe quelle couleur ». */
export const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];
