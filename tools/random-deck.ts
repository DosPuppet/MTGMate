/**
 * Decks aléatoires pour le fuzz et le tournoi d'IA : 60 cartes sur deux couleurs, 24 terrains de base,
 * 36 cartes gérées par le moteur (`set` : d'abord celles de l'extension).
 */
import { mulberry32 } from "@mtgx/ai";
import { implementedCards } from "@mtgx/cards";
import type { CardDef, Color } from "@mtgx/engine";

const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
let all: CardDef[] | null = null;

export function randomDeck(seed: number, set?: string): CardDef[] {
  all ??= implementedCards();
  const ALL = all;
  const rand = mulberry32(seed);
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, 2);
  const fits = (c: CardDef) => !c.types.includes("Land") && c.colors.length > 0 && c.colors.every((x) => colors.includes(x));
  const spells = ALL.filter(fits);
  const own = set ? ALL.filter((c) => c.set === set && (fits(c) || (!c.types.includes("Land") && c.colors.length === 0))) : [];
  const deck: CardDef[] = [];
  // Extension ciblée : trois quarts des sorts viennent d'elle (s'il y en a), le reste des autres cartes gérées.
  for (let i = 0; i < 36 && spells.length; i++) {
    const from = own.length && i < 27 ? own : spells;
    deck.push(from[Math.floor(rand() * from.length)] as CardDef);
  }
  for (let i = 0; i < 24; i++) {
    const land = ALL.find((c) => c.name === BASICS[colors[i % 2] as Color]);
    if (land) deck.push(land);
  }
  return deck;
}
