/**
 * Standard meta decks collected for plan P4 (`docs/meta/<date>/`, one text file per archetype: "// Name (share %)",
 * deck, then sideboard). Read by the test `cards/test/meta-decks.test.ts` and by `npm run fuzz -- --pool meta`.
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
  /** Share of the meta, in %. */
  share: number;
  main: DeckEntries;
  sideboard: DeckEntries;
  /** Card names not recognized (must stay empty). */
  unknown: string[];
  /** Main deck and sideboard legal and fully handled by the engine. */
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
