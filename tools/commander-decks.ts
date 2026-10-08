/**
 * Commander decks (PLAN-E): `docs/commander/decks/<id>.txt`, one decklist per deck ("// Name — …" on the first line,
 * `Commander` section then `Deck`). These are also the lists read by the by-name import of the EDH pseudo-set
 * (`npm run import-cards -- edh`). Read by `npm run coverage -- --deck <id|all>` and by the deck tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, CardIndex, type DeckEntries, parseDeckList } from "@mtgx/cards";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "commander", "decks");

export interface CommanderDeckFile {
  /** File name without extension (`edgar-markov`). */
  id: string;
  name: string;
  commander: DeckEntries;
  main: DeckEntries;
  /** Card names unknown to the catalog (to import: `npm run import-cards -- edh`). */
  unknown: string[];
}

let cache: CommanderDeckFile[] | null = null;

export function commanderDecks(): CommanderDeckFile[] {
  if (cache) return cache;
  const index = new CardIndex(CARDS);
  cache = readdirSync(DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(DIR, file), "utf8");
      const d = parseDeckList(text, index);
      return {
        id: file.replace(/\.txt$/, ""),
        name: /^\/\/\s*(.+?)\s*(?:—|\.|$)/m.exec(text)?.[1] ?? file,
        commander: d.commander ?? [],
        main: d.main,
        unknown: d.issues.filter((i) => i.kind === "unknown").map((i) => i.text),
      };
    });
  return cache;
}
