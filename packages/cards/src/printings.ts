/**
 * Printings table (`data/printings.json`, `tools/import-printings.ts`): the other appearances of each card on Scryfall,
 * which a deck can choose for its art. Outside the main package (`@mtgx/cards/printings`): the interface loads it only
 * on demand (deck builder, decklist import); the server uses it to check the printing of a deck line.
 */
import { type CardDef, customArtSet, keyedPrinting, printingKey } from "@mtgx/engine";
import data from "../data/printings.json";

/** A printing offered for a card. */
export interface PrintingOption {
  /** Key of the deck line (`DeckEntry[2]`); absent: the card's own printing. */
  key?: string;
  set: string;
  number: string;
  /** Set name (English) and year of the printing, when the table knows them. */
  setName?: string;
  year?: number;
  /** Language of a card printed in a single language other than English ("ja": Japanese Mystical Archive). */
  lang?: string;
}

const TABLE = data as { sets: Record<string, string>; cards: Record<string, string> };
const parsed = new Map<string, PrintingOption[]>();

/** The table's printings for a card (from the most recent to the oldest). */
function tableOptions(name: string): PrintingOption[] {
  let out = parsed.get(name);
  if (!out) {
    out = (TABLE.cards[name]?.split(";") ?? []).map((entry) => {
      const [set = "", number = "", id = "", year, lang] = entry.split(" ");
      const setName = TABLE.sets[set];
      return {
        key: printingKey(set, number, id),
        set,
        number,
        ...(setName ? { setName } : {}),
        ...(year ? { year: Number(year) } : {}),
        ...(lang ? { lang } : {}),
      };
    });
    parsed.set(name, out);
  }
  return out;
}

/** Every printing offered for a card: its own, those of the catalog's reprint sets, then the table. */
export function printingOptions(c: CardDef): PrintingOption[] {
  return [
    { set: c.origin ?? c.set ?? "", number: c.number ?? "" },
    ...(c.printings ?? []).map((p) => ({ key: p.key, set: p.set, number: p.number })),
    ...tableOptions(c.name),
  ];
}

/** Is the key a known printing of the card? */
export function hasPrinting(c: CardDef, key: string): boolean {
  // Custom printing, of any art set: always accepted (the interface keeps the card's image if there is none).
  if (customArtSet(key) !== undefined) return true;
  if (c.printings?.some((p) => p.key === key)) return true;
  return !!keyedPrinting(key) && tableOptions(c.name).some((p) => p.key === key);
}

/** The printing of a card from its set and number ("(STA) 42" of a decklist). */
export function findPrinting(c: CardDef, set: string, number: string): string | undefined {
  const up = set.toUpperCase();
  return printingOptions(c).find((p) => p.key && p.set === up && p.number === number)?.key;
}
