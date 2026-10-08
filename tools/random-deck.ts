/**
 * Random decks for the fuzz and the AI tournament: 60 cards in two colors (three once in four), 24 lands (of which up
 * to 8 nonbasic lands that produce these colors), 36 cards handled by the engine, colorless ones included (`set`: those
 * of the set first). The whole pool can come up: three-color cards, colorless cards, nonbasic lands
 * (PLAN-C in docs/history.md, lot C2).
 */
import { mulberry32 } from "@mtgx/ai";
import { implementedCards, legalityIssue } from "@mtgx/cards";
import { type CardDef, type Color, colorIdentity, withinIdentity } from "@mtgx/engine";

const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
let all: CardDef[] | null = null;

/** Colors that the mana abilities of a card produce ("C" for colorless). */
function produced(c: CardDef): string[] {
  return c.abilities.flatMap((ab) => (ab.kind === "mana" ? ab.produce : []));
}

export function randomDeck(seed: number, set?: string): CardDef[] {
  all ??= implementedCards();
  const ALL = all;
  const rand = mulberry32(seed);
  const n = rand() < 0.25 ? 3 : 2;
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, n);
  const fits = (c: CardDef) => !c.types.includes("Land") && c.colors.every((x) => colors.includes(x));
  const spells = ALL.filter(fits);
  const own = set ? ALL.filter((c) => c.set === set && fits(c)) : [];
  const deck: CardDef[] = [];
  // Targeted set: three quarters of the spells come from it (if it has any), the rest from the other handled cards.
  for (let i = 0; i < 36 && spells.length; i++) {
    const from = own.length && i < 27 ? own : spells;
    deck.push(from[Math.floor(rand() * from.length)] as CardDef);
  }
  // Nonbasic lands that produce only these colors (or colorless), at most 4 copies each.
  const lands = ALL.filter(
    (c) =>
      c.types.includes("Land") &&
      !c.supertypes.includes("Basic") &&
      produced(c).every((x) => x === "C" || colors.includes(x as Color)),
  );
  const nonBasic = lands.length ? Math.floor(rand() * 9) : 0;
  for (let i = 0; i < nonBasic; i++) {
    const land = lands[Math.floor(rand() * lands.length)] as CardDef;
    if (deck.filter((c) => c.name === land.name).length < 4) deck.push(land);
  }
  for (let i = 0; deck.length < 60; i++) {
    const land = ALL.find((c) => c.name === BASICS[colors[i % n] as Color]);
    if (land) deck.push(land);
  }
  return deck;
}

/**
 * Random Commander deck (PLAN-E): a commander (handled legendary creature, of at least one color; `set`: from the set
 * first), then 99 cards within its color identity, one copy of each except basic lands: 61 spells (three quarters from
 * the targeted set if it has any), up to 10 nonbasic lands, basic lands.
 * `commanders`: the index of the commander (0).
 */
export function randomCommanderDeck(seed: number, set?: string): { deck: CardDef[]; commanders: number[] } {
  all ??= implementedCards();
  const ALL = all.filter((c) => !legalityIssue(c, "commander"));
  const rand = mulberry32(seed);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)] as T;
  const legends = ALL.filter(
    (c) => c.supertypes.includes("Legendary") && c.types.includes("Creature") && colorIdentity(c).length > 0,
  );
  const own = set ? legends.filter((c) => c.set === set) : [];
  const commander = pick(own.length ? own : legends);
  const identity = colorIdentity(commander);
  const fits = (c: CardDef) => c.name !== commander.name && withinIdentity(colorIdentity(c), identity);
  const spells = ALL.filter((c) => !c.types.includes("Land") && fits(c));
  const ownSpells = set ? spells.filter((c) => c.set === set) : [];
  const deck: CardDef[] = [commander];
  const names = new Set<string>();
  const add = (c: CardDef) => {
    if (names.has(c.name)) return false;
    names.add(c.name);
    deck.push(c);
    return true;
  };
  for (let tries = 0; deck.length < 62 && tries < 2000; tries++)
    add(pick(ownSpells.length && rand() < 0.75 ? ownSpells : spells));
  const lands = ALL.filter((c) => c.types.includes("Land") && !c.supertypes.includes("Basic") && fits(c));
  for (let i = 0, n = lands.length ? 10 : 0; i < n * 3 && deck.length < 72; i++) add(pick(lands));
  for (let i = 0; deck.length < 100; i++) {
    const land = ALL.find((c) => c.name === BASICS[identity[i % identity.length] as Color]);
    if (!land) break;
    deck.push(land);
  }
  return { deck, commanders: [0] };
}
