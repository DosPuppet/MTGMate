/**
 * Table des impressions (`data/printings.json`, `tools/import-printings.ts`) : les autres apparences de chaque carte sur
 * Scryfall, que le deck peut choisir pour son illustration. Hors du paquet principal (`@mtgx/cards/printings`) :
 * l'interface ne la charge qu'à la demande (éditeur de deck, import d'une decklist) ; le serveur s'en sert pour vérifier
 * l'impression d'une ligne de deck.
 */
import { type CardDef, keyedPrinting, printingKey } from "@mtgx/engine";
import data from "../data/printings.json";

/** Une impression proposée pour une carte. */
export interface PrintingOption {
  /** Clé de la ligne de deck (`DeckEntry[2]`) ; absente : l'impression de la carte elle-même. */
  key?: string;
  set: string;
  number: string;
  /** Nom de l'ensemble (anglais) et année de l'impression, quand la table les connaît. */
  setName?: string;
  year?: number;
  /** Langue d'une carte imprimée dans une seule langue autre que l'anglais (« ja » : Archives mystiques japonaises). */
  lang?: string;
}

const TABLE = data as { sets: Record<string, string>; cards: Record<string, string> };
const parsed = new Map<string, PrintingOption[]>();

/** Les impressions de la table pour une carte (du plus récent au plus ancien). */
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

/** Toutes les impressions proposées pour une carte : la sienne, celles des rééditions du catalogue, puis la table. */
export function printingOptions(c: CardDef): PrintingOption[] {
  return [
    { set: c.set ?? "", number: c.number ?? "" },
    ...(c.printings ?? []).map((p) => ({ key: p.key, set: p.set, number: p.number })),
    ...tableOptions(c.name),
  ];
}

/** La clé est-elle une impression connue de la carte ? */
export function hasPrinting(c: CardDef, key: string): boolean {
  if (c.printings?.some((p) => p.key === key)) return true;
  return !!keyedPrinting(key) && tableOptions(c.name).some((p) => p.key === key);
}

/** L'impression d'une carte d'après son ensemble et son numéro (« (STA) 42 » d'une decklist). */
export function findPrinting(c: CardDef, set: string, number: string): string | undefined {
  const up = set.toUpperCase();
  return printingOptions(c).find((p) => p.key && p.set === up && p.number === number)?.key;
}
