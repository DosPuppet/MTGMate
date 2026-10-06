/**
 * Decks Commander (PLAN-E) : `docs/commander/decks/<id>.txt`, une decklist par deck (« // Nom — … » en première ligne,
 * section `Commander` puis `Deck`). Ce sont aussi les listes que lit l'import par nom du pseudo-ensemble EDH
 * (`npm run import-cards -- edh`). Lus par `npm run coverage -- --deck <id|all>` et par les tests des decks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, CardIndex, type DeckEntries, parseDeckList } from "@mtgx/cards";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "commander", "decks");

export interface CommanderDeckFile {
  /** Nom du fichier sans extension (`edgar-markov`). */
  id: string;
  name: string;
  commander: DeckEntries;
  main: DeckEntries;
  /** Noms de cartes inconnus du catalogue (à importer : `npm run import-cards -- edh`). */
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
