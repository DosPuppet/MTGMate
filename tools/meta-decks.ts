/**
 * Decks du méta Standard relevés pour le plan P4 (`docs/meta/<date>/`, un fichier texte par archétype : « // Nom (part %) »,
 * deck, puis réserve). Lus par le test `cards/test/meta-decks.test.ts` et par `npm run fuzz -- --pool meta`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, CardIndex, type DeckEntries, parseDeckList, validateDeck } from "@mtgx/cards";

export const META_DATE = "2026-09-29";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "meta", META_DATE);

export interface MetaDeck {
  file: string;
  name: string;
  /** Part du méta, en %. */
  share: number;
  main: DeckEntries;
  sideboard: DeckEntries;
  /** Noms de cartes non reconnus (doit rester vide). */
  unknown: string[];
  /** Deck principal et réserve légaux et entièrement gérés par le moteur. */
  playable: boolean;
}

let cache: MetaDeck[] | null = null;

export function metaDecks(): MetaDeck[] {
  if (cache) return cache;
  const index = new CardIndex(CARDS);
  cache = readdirSync(DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(DIR, file), "utf8");
      const head = /^\/\/\s*(.+?)\s*\(([\d.]+)%\)/.exec(text);
      const d = parseDeckList(text, index);
      const v = validateDeck(d, CARDS);
      const sideOk = d.sideboard.every(([, n]) => CARDS[n]?.implemented);
      return {
        file,
        name: head?.[1] ?? file,
        share: Number(head?.[2] ?? 0),
        main: d.main,
        sideboard: d.sideboard,
        unknown: d.issues.filter((i) => i.kind === "unknown").map((i) => i.text),
        playable: v.playable && sideOk,
      };
    });
  return cache;
}
