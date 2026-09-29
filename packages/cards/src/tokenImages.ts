/**
 * Images des jetons : les jetons du moteur n'ont pas d'image ; on prend celle d'un jeton Scryfall correspondant
 * (data/tokens.json, `npm run import-tokens`). Même nom obligatoire ; puis mêmes F/E, mêmes couleurs, même ligne de type.
 */
import TOKENS from "../data/tokens.json";

interface TokenArt {
  name: string;
  typeLine: string;
  power?: number;
  toughness?: number;
  colors: string[];
  text: string;
  image: string;
  set: string;
}

const BY_NAME = new Map<string, TokenArt[]>();
for (const t of TOKENS as TokenArt[]) {
  const key = t.name.toLowerCase();
  BY_NAME.set(key, [...(BY_NAME.get(key) ?? []), t]);
}

const sameColors = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c) => b.includes(c));

/** Ce qu'on sait d'un jeton affiché (face de carte du moteur). */
export interface TokenLike {
  name: string;
  typeLine: string;
  basePower?: number;
  baseToughness?: number;
  colors?: readonly string[];
}

/** URL de l'image Scryfall du jeton le plus proche, ou undefined si aucun jeton de ce nom n'est connu. */
export function tokenImage(t: TokenLike): string | undefined {
  const cands = BY_NAME.get(t.name.toLowerCase());
  if (!cands?.length) return undefined;
  const typeWords = (s: string) => s.replace(/—.*/, "").split(/\s+/).filter(Boolean);
  const score = (c: TokenArt) =>
    (c.power === t.basePower && c.toughness === t.baseToughness ? 4 : 0) +
    (t.colors && sameColors(c.colors, t.colors) ? 2 : 0) +
    (typeWords(c.typeLine).every((w) => t.typeLine.includes(w)) ? 1 : 0);
  // À score égal, l'ordre du fichier : les extensions les plus récentes d'abord.
  return [...cands].sort((a, b) => score(b) - score(a))[0]?.image;
}
