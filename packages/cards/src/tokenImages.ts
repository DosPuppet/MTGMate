/**
 * Token images: the engine's tokens have no image; we take that of a matching Scryfall token (data/tokens.json,
 * `npm run import-tokens`). Same name required; then same P/T, same colors, same type line.
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

/** What is known about a displayed token (engine card face). */
export interface TokenLike {
  name: string;
  typeLine: string;
  basePower?: number;
  baseToughness?: number;
  colors?: readonly string[];
}

/** URL of the Scryfall image of the closest token, or undefined if no token of that name is known. */
export function tokenImage(t: TokenLike): string | undefined {
  const cands = BY_NAME.get(t.name.toLowerCase());
  if (!cands?.length) return undefined;
  const typeWords = (s: string) => s.replace(/—.*/, "").split(/\s+/).filter(Boolean);
  const score = (c: TokenArt) =>
    (c.power === t.basePower && c.toughness === t.baseToughness ? 4 : 0) +
    (t.colors && sameColors(c.colors, t.colors) ? 2 : 0) +
    (typeWords(c.typeLine).every((w) => t.typeLine.includes(w)) ? 1 : 0);
  // On equal scores, the file order: the most recent sets first.
  return [...cands].sort((a, b) => score(b) - score(a))[0]?.image;
}
