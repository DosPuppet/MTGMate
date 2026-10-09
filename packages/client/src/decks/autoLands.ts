/**
 * Automatic basic lands (PLAN-L L9): fills a deck up to its size with basic lands, spread by the colored symbols of
 * its spells. The other cards stay as they are; the basics already there are replaced (their printing is kept).
 */
import { CARDS, type DeckEntries, type DeckEntry } from "@mtgx/cards";
import type { Color } from "@mtgx/engine";

const BASIC_OF: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const COLORS: Color[] = ["W", "U", "B", "R", "G"];

const isBasic = (name: string) => !!CARDS[name]?.supertypes.includes("Basic");

/** Colored mana symbols of the spells (hybrid: half a symbol for each of its colors), lands excluded. */
export function colorPips(entries: DeckEntries): Record<Color, number> {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const [n, name] of entries) {
    const c = CARDS[name];
    if (!c || c.types.includes("Land")) continue;
    for (const col of COLORS) pips[col] += n * (c.manaCost?.colored[col] ?? 0);
    for (const pair of c.manaCost?.hybrid ?? []) for (const m of pair) if (m in BASIC_OF) pips[m as Color] += n / pair.length;
  }
  return pips;
}

/**
 * The deck with `size` cards, basic lands completing the other cards: largest remainder of the symbols' shares, and at
 * least one land of each color used when there is room; `identity` (Commander) keeps only those colors. `null` when
 * there is no room or no color to follow.
 */
export function withBasicLands(main: DeckEntries, size: number, identity?: readonly Color[]): DeckEntries | null {
  const others = main.filter(([, name]) => !isBasic(name));
  const room = size - others.reduce((a, [n]) => a + n, 0);
  if (room <= 0) return null;
  const pips = colorPips(others);
  const colors = COLORS.filter((c) => pips[c] > 0 && (!identity || identity.includes(c)));
  if (colors.length === 0) return null;
  const total = colors.reduce((a, c) => a + pips[c], 0);
  const share = colors.map((c) => (room * pips[c]) / total);
  const counts = share.map(Math.floor);
  // Largest remainder for the lands left.
  const order = colors.map((_, i) => i).sort((a, b) => (share[b] ?? 0) - (counts[b] ?? 0) - ((share[a] ?? 0) - (counts[a] ?? 0)));
  for (let left = room - counts.reduce((a, b) => a + b, 0), k = 0; left > 0; left--, k++) {
    const i = order[k % order.length] as number;
    counts[i] = (counts[i] ?? 0) + 1;
  }
  // A color used gets at least one land, taken from the most represented.
  if (room >= colors.length)
    for (let i = 0; i < colors.length; i++)
      if (counts[i] === 0) {
        const most = counts.indexOf(Math.max(...counts));
        counts[most] = (counts[most] ?? 0) - 1;
        counts[i] = 1;
      }
  const printing = (name: string) => main.find(([, n]) => n === name)?.[2];
  const basics = colors.flatMap((c, i): DeckEntry[] => {
    const n = counts[i] ?? 0;
    const name = BASIC_OF[c];
    const key = printing(name);
    return n > 0 ? [key ? [n, name, key] : [n, name]] : [];
  });
  return [...others, ...basics];
}
