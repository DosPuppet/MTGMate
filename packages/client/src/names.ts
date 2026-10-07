/**
 * Noms à choisir (question « nom » du moteur : nom de carte, de carte de terrain, type de créature) : le catalogue de
 * toutes les cartes connues, que l'interface parcourt (noms français d'abord) sans que la question liste les cartes de
 * la partie. La réponse envoyée est toujours le nom anglais (canonique).
 */
import { CARDS, nameCatalog } from "@mtgx/cards";
import { CREATURE_TYPES, type NameCatalog, type NameKind, registerNameCatalog } from "@mtgx/engine";
import { normalize } from "./decks/search";
import type { Lang } from "./i18n";

let registered = false;

/**
 * Le catalogue des noms, enregistré dans le moteur de ce fil (replays) ; à transmettre au worker de partie, qui
 * n'importe pas `@mtgx/cards`.
 */
export function hostNameCatalog(): NameCatalog {
  const c = nameCatalog();
  if (!registered) registerNameCatalog(c);
  registered = true;
  return c;
}

let french: Map<string, string> | undefined;

/** Nom français d'une carte ou d'une face (nom anglais sinon). */
export function frenchName(name: string): string {
  if (!french) {
    french = new Map();
    for (const c of Object.values(CARDS))
      for (const d of [c, ...(c.faceDefs ?? [])]) if (d.fr?.name && !french.has(d.name)) french.set(d.name, d.fr.name);
  }
  return french.get(name) ?? name;
}

/** Libellé d'un nom dans la langue de l'interface (les types de créature restent en anglais). */
export function nameLabel(name: string, of: NameKind, lang: Lang): string {
  return of === "creatureType" || lang === "en" ? name : frenchName(name);
}

interface Entry {
  name: string;
  /** Libellé dans la langue de l'interface, puis l'autre langue, normalisés (sans accents, minuscules). */
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
 * Noms du catalogue qui correspondent à la recherche, les plus proches d'abord : début du nom dans la langue de
 * l'interface, début d'un de ses mots, puis n'importe où ; ensuite les mêmes dans l'autre langue. Recherche vide : rien.
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
  // Tri stable : à score égal, l'ordre alphabétique du catalogue.
  return hits
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([e]) => e.name);
}
