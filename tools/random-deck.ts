/**
 * Decks aléatoires pour le fuzz et le tournoi d'IA : 60 cartes sur deux couleurs (trois une fois sur quatre), 24 terrains
 * (dont jusqu'à 8 terrains non basiques qui produisent ces couleurs), 36 cartes gérées par le moteur, incolores comprises
 * (`set` : d'abord celles de l'extension). Tout le pool peut sortir : cartes à trois couleurs, incolores, terrains non
 * basiques (docs/plans/PLAN-C.md, lot C2).
 */
import { mulberry32 } from "@mtgx/ai";
import { implementedCards } from "@mtgx/cards";
import type { CardDef, Color } from "@mtgx/engine";

const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
let all: CardDef[] | null = null;

/** Couleurs que produisent les capacités de mana d'une carte (« C » pour l'incolore). */
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
  // Extension ciblée : trois quarts des sorts viennent d'elle (s'il y en a), le reste des autres cartes gérées.
  for (let i = 0; i < 36 && spells.length; i++) {
    const from = own.length && i < 27 ? own : spells;
    deck.push(from[Math.floor(rand() * from.length)] as CardDef);
  }
  // Terrains non basiques qui ne produisent que ces couleurs (ou de l'incolore), au plus 4 exemplaires chacun.
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
