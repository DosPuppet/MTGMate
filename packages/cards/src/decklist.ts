/**
 * Decklists : lecture (formats MTGA et MTGO, noms anglais ou français), export et validation
 * des règles de construction (60 cartes minimum, 4 exemplaires maximum, réserve de 15)
 * et de la légalité dans le format (Standard).
 */
import type { CardDef, Format } from "@mtgx/engine";

export type DeckEntries = [number, string][];

export interface DeckIssue {
  /** Numéro de ligne (1 = première ligne). */
  line: number;
  text: string;
  kind: "unknown" | "syntax" | "ignored" | "unimplemented" | "illegal";
  message: string;
  /** Nom anglais proposé pour une carte inconnue. */
  suggestion?: string;
}

export interface ParsedDeck {
  name?: string;
  main: DeckEntries;
  sideboard: DeckEntries;
  issues: DeckIssue[];
}

export interface DeckValidation {
  format: Format;
  /** Respecte les règles de construction et la légalité des cartes dans le format. */
  legal: boolean;
  /** Toutes les cartes sont gérées par le moteur. */
  playable: boolean;
  mainCount: number;
  sideCount: number;
  errors: string[];
  warnings: string[];
}

export const DECK_RULES = { minMain: 60, maxSide: 15, maxCopies: 4 } as const;

export const FORMAT_LABELS: Record<Format, string> = { standard: "Standard" };

/** Seul format du périmètre pour l'instant. */
export const DEFAULT_FORMAT: Format = "standard";

/** Problème de légalité d'une carte dans un format, ou undefined si elle y est légale. */
export function legalityIssue(c: CardDef, format: Format = DEFAULT_FORMAT): string | undefined {
  const label = FORMAT_LABELS[format];
  switch (c.legalities?.[format]) {
    case "legal":
      return undefined;
    case "banned":
      return `${c.name} est bannie en ${label}`;
    case undefined:
      return `${c.name} : légalité en ${label} inconnue`;
    default:
      return `${c.name} n'est pas légale en ${label}`;
  }
}

/** Forme comparable d'un nom : minuscules, sans accents ni ponctuation. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}

/** Index des noms (anglais et français) vers le nom anglais canonique. */
export class CardIndex {
  private readonly byName = new Map<string, string>();

  constructor(readonly cards: Record<string, CardDef>) {
    for (const c of Object.values(cards)) {
      if (c.isToken) continue;
      this.byName.set(normalizeName(c.name), c.name);
      if (c.fr?.name) this.byName.set(normalizeName(c.fr.name), c.name);
      // Carte « à préparer » : certains exports écrivent « Créature // Sort ».
      if (c.prepareFace) this.byName.set(normalizeName(`${c.name} // ${c.prepareFace.name}`), c.name);
    }
  }

  find(name: string): string | undefined {
    return this.byName.get(normalizeName(name));
  }

  /** Nom anglais le plus proche (au plus 2 fautes, 3 pour les noms longs). */
  suggest(name: string): string | undefined {
    const n = normalizeName(name);
    let best: string | undefined;
    let bestD = n.length > 12 ? 3 : 2;
    for (const [key, canonical] of this.byName) {
      const d = distance(n, key);
      if (d <= bestD) {
        best = canonical;
        bestD = d;
      }
    }
    return best;
  }
}

const HEADERS: Record<string, "main" | "side" | "ignore" | "about"> = {
  deck: "main",
  main: "main",
  maindeck: "main",
  "main deck": "main",
  sideboard: "side",
  reserve: "side",
  réserve: "side",
  commander: "ignore",
  companion: "ignore",
  compagnon: "ignore",
  about: "about",
};

const LINE = /^(?:(SB):\s*)?(\d+)\s*[xX]?\s+(.+?)\s*$/;
const SET_SUFFIX = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+[\w-]+)?(?:\s+\*[A-Z]\*)?$/;

function add(entries: DeckEntries, n: number, name: string): void {
  const existing = entries.find((e) => e[1] === name);
  if (existing) existing[0] += n;
  else entries.push([n, name]);
}

/**
 * Lit une decklist texte :
 * - MTGA : `4 Llanowar Elves (FDN) 227`, sections `Deck` / `Sideboard`, `About` + `Name …` ;
 * - MTGO : `4 Llanowar Elves`, `4x …`, préfixe `SB:`, réserve après une ligne vide ;
 * - noms anglais ou français, commentaires `//` et `#`.
 */
export function parseDeckList(text: string, index: CardIndex): ParsedDeck {
  const out: ParsedDeck = { main: [], sideboard: [], issues: [] };
  let section: "main" | "side" | "ignore" | "about" = "main";
  let sawHeader = false;
  let sawBlankAfterCards = false;
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const n = i + 1;
    if (!line) {
      if (out.main.length > 0) sawBlankAfterCards = true;
      return;
    }
    if (line.startsWith("//") || line.startsWith("#")) return;
    const header = HEADERS[normalizeName(line)] ?? HEADERS[line.toLowerCase()];
    if (header) {
      sawHeader = true;
      section = header;
      if (header === "ignore") out.issues.push({ line: n, text: line, kind: "ignored", message: `Section « ${line} » ignorée` });
      return;
    }
    if (section === "about") {
      const m = /^name\s+(.+)$/i.exec(line);
      if (m) out.name = m[1];
      return;
    }
    const m = LINE.exec(line);
    if (!m) {
      out.issues.push({ line: n, text: line, kind: "syntax", message: "Ligne non reconnue (attendu : « 4 Nom de la carte »)" });
      return;
    }
    if (section === "ignore") return;
    const count = Number(m[2]);
    const cardText = (m[3] as string).replace(SET_SUFFIX, "").trim();
    const name = index.find(cardText);
    if (!name) {
      const suggestion = index.suggest(cardText);
      out.issues.push({
        line: n,
        text: line,
        kind: "unknown",
        message: `Carte inconnue : « ${cardText} »${suggestion ? ` — vouliez-vous dire « ${suggestion} » ?` : ""}`,
        suggestion,
      });
      return;
    }
    const toSide = m[1] === "SB" || section === "side" || (!sawHeader && sawBlankAfterCards);
    add(toSide ? out.sideboard : out.main, count, name);
    const c = index.cards[name];
    const illegal = c && legalityIssue(c);
    if (illegal) out.issues.push({ line: n, text: line, kind: "illegal", message: illegal });
    if (!c?.implemented) {
      out.issues.push({ line: n, text: line, kind: "unimplemented", message: `${name} n'est pas encore jouable` });
    }
  });
  return out;
}

/**
 * Exporte une decklist.
 * - "mtga" : sections `Deck` / `Sideboard`, noms anglais avec code de set et numéro (importable dans MTG Arena) ;
 * - "plain" : `4 Nom`, réserve après une ligne vide (format MTGO), éventuellement avec les noms français.
 */
export function serializeDeckList(
  deck: { name?: string; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  opts: { format?: "mtga" | "plain"; lang?: "en" | "fr" } = {},
): string {
  const format = opts.format ?? "mtga";
  const line = ([n, name]: [number, string]) => {
    const c = cards[name];
    if (format === "mtga") return `${n} ${name}${c?.set && c.number ? ` (${c.set}) ${c.number}` : ""}`;
    return `${n} ${(opts.lang === "fr" && c?.fr?.name) || name}`;
  };
  const side = deck.sideboard ?? [];
  if (format === "mtga") {
    const parts = [...(deck.name ? ["About", `Name ${deck.name}`, ""] : []), "Deck", ...deck.main.map(line)];
    if (side.length) parts.push("", "Sideboard", ...side.map(line));
    return `${parts.join("\n")}\n`;
  }
  return `${[...deck.main.map(line), ...(side.length ? ["", ...side.map(line)] : [])].join("\n")}\n`;
}

/** « Un deck peut contenir n'importe quel nombre de cartes appelées … » (Hare Apparent, Relentless Rats…). */
const ANY_NUMBER = /A deck can have any number of cards named/;

const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

/**
 * Règles de construction : 60 cartes minimum, 4 exemplaires maximum (sauf terrains de base), réserve de 15,
 * cartes légales dans le format (réserve comprise), d'après les légalités Scryfall importées.
 */
export function validateDeck(
  deck: { main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  format: Format = DEFAULT_FORMAT,
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const side = deck.sideboard ?? [];
  const mainCount = count(deck.main);
  const sideCount = count(side);
  if (mainCount < DECK_RULES.minMain) errors.push(`Le deck contient ${mainCount} cartes (minimum ${DECK_RULES.minMain})`);
  if (sideCount > DECK_RULES.maxSide) errors.push(`La réserve contient ${sideCount} cartes (maximum ${DECK_RULES.maxSide})`);
  const totals = new Map<string, number>();
  for (const [n, name] of [...deck.main, ...side]) totals.set(name, (totals.get(name) ?? 0) + n);
  let playable = true;
  const inMain = new Set(deck.main.map(([, name]) => name));
  for (const [name, n] of totals) {
    const c = cards[name];
    if (!c) {
      errors.push(`Carte inconnue : ${name}`);
      playable = false;
      continue;
    }
    if (n > DECK_RULES.maxCopies && !c.supertypes.includes("Basic") && !ANY_NUMBER.test(c.text ?? "")) {
      errors.push(`${name} : ${n} exemplaires (maximum ${DECK_RULES.maxCopies})`);
    }
    const illegal = legalityIssue(c, format);
    if (illegal) errors.push(illegal);
    if (!c.implemented) {
      // Seul le deck principal est joué : une carte non gérée en réserve n'empêche pas de jouer.
      if (inMain.has(name)) playable = false;
      warnings.push(`${name} n'est pas encore jouable${inMain.has(name) ? "" : " (réserve)"}`);
    }
  }
  return {
    format,
    legal: errors.length === 0,
    playable: playable && errors.length === 0,
    mainCount,
    sideCount,
    errors,
    warnings,
  };
}

/** Couleurs d'un deck (d'après ses sorts). */
export function deckColors(main: DeckEntries, cards: Record<string, CardDef>): string[] {
  const set = new Set<string>();
  for (const [, name] of main) for (const c of cards[name]?.colors ?? []) set.add(c);
  return ["W", "U", "B", "R", "G"].filter((c) => set.has(c));
}
