/**
 * Names to choose (the engine's "name" question: card name, land card name, creature type): the catalog of every
 * known card, which the interface searches (French names first) without the question listing the game's cards. The
 * answer sent is always the English (canonical) name.
 */
import { CARDS, nameCatalog } from "@mtgx/cards";
import { CREATURE_TYPES, type NameCatalog, type NameKind, registerNameCatalog } from "@mtgx/engine";
import { normalize } from "./decks/search";
import type { Lang } from "./i18n";

let registered = false;

/**
 * The name catalog, registered in the engine of this thread (replays); to be passed to the game worker, which does
 * not import `@mtgx/cards`.
 */
export function hostNameCatalog(): NameCatalog {
  const c = nameCatalog();
  if (!registered) registerNameCatalog(c);
  registered = true;
  return c;
}

let french: Map<string, string> | undefined;

/** French name of a card or a face (English name otherwise). */
export function frenchName(name: string): string {
  if (!french) {
    french = new Map();
    for (const c of Object.values(CARDS))
      for (const d of [c, ...(c.faceDefs ?? [])]) if (d.fr?.name && !french.has(d.name)) french.set(d.name, d.fr.name);
  }
  return french.get(name) ?? name;
}

/** Label of a name in the interface language (creature types stay in English). */
export function nameLabel(name: string, of: NameKind, lang: Lang): string {
  return of === "creatureType" || lang === "en" ? name : frenchName(name);
}

interface Entry {
  name: string;
  /** Label in the interface language, then in the other language, normalized (no accents, lower case). */
  main: string;
  other: string;
  label: string;
}

const entries = new Map<string, Entry[]>();

function entriesOf(of: NameKind, lang: Lang): Entry[] {
  const key = `${of}:${lang}`;
  let out = entries.get(key);
  if (!out) {
    const names = of === "creatureType" ? CREATURE_TYPES : of === "land" ? nameCatalog().lands : nameCatalog().cards;
    out = names.map((name) => {
      const label = nameLabel(name, of, lang);
      const other = lang === "en" && of !== "creatureType" ? frenchName(name) : name;
      return { name, label, main: normalize(label), other: normalize(other) };
    });
    out.sort((a, b) => a.label.localeCompare(b.label, lang));
    entries.set(key, out);
  }
  return out;
}

/**
 * Catalog names matching the search, the closest first: start of the name in the interface language, start of one of
 * its words, then anywhere; then the same in the other language. Empty search: nothing.
 */
export function searchNames(of: NameKind, query: string, lang: Lang, limit = 40): string[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const score = (e: Entry): number => {
    for (const [i, text] of [e.main, e.other].entries()) {
      if (text.startsWith(q)) return i * 3;
      if (text.includes(` ${q}`) || text.includes(`-${q}`) || text.includes(`'${q}`)) return i * 3 + 1;
      if (text.includes(q)) return i * 3 + 2;
    }
    return -1;
  };
  const hits: [Entry, number][] = [];
  for (const e of entriesOf(of, lang)) {
    const s = score(e);
    if (s >= 0) hits.push([e, s]);
  }
  // Stable sort: at equal score, the catalog's alphabetical order.
  return hits
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([e]) => e.name);
}
