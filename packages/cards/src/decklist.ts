/**
 * Decklists : lecture (formats MTGA et MTGO, noms anglais ou français), export et validation
 * des règles de construction (60 cartes minimum, 4 exemplaires maximum, réserve de 15 ; en Commander, 100 cartes dont
 * le commandant, singleton, identité de couleur) et de la légalité dans le format.
 */
import { type CardDef, type Color, colorIdentity, type Format, keyedPrinting, withinIdentity } from "@mtgx/engine";
import commanderData from "../data/commander.json";
import { preconFor } from "./decks";

/**
 * Lignes d'un deck : [nombre, nom anglais, impression ?]. Une ligne par nom ; l'impression (« SPG-13 » d'une réédition,
 * PLAN-G, ou « STA-42@<id> » de la table des impressions, `printings.ts`) choisit l'illustration de tous ses
 * exemplaires, sans rien changer aux règles ni à la légalité.
 */
export type DeckEntries = DeckEntry[];
export type DeckEntry = [number, string, string?];

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
  /** Section « Commander » (ou marque `*CMDR*` de Moxfield) : le ou les commandants (PLAN-E). */
  commander?: DeckEntries;
  main: DeckEntries;
  sideboard: DeckEntries;
  issues: DeckIssue[];
}

export interface DeckValidation {
  format: Format;
  /** Commander : le ou les commandants retenus (noms). */
  commanders?: string[];
  /** Commander : identité de couleur du deck (celle du ou des commandants), dans l'ordre WUBRG. */
  identity?: Color[];
  /**
   * Commander : cartes de la liste des Game Changers, et tranche estimée (0 → « 1–2 », jusqu'à 3 → « 3 », au-delà →
   * « 4+ ») ; indicatives seulement, jamais une erreur.
   */
  gameChangers?: string[];
  bracket?: "1–2" | "3" | "4+";
  /** Respecte les règles de construction et la légalité des cartes dans le format. */
  legal: boolean;
  /** Toutes les cartes sont gérées par le moteur. */
  playable: boolean;
  mainCount: number;
  /** Taille minimale du deck principal : 60, ou moins pour un deck de bienvenue préconstruit. */
  minMain: number;
  /** Deck de bienvenue (préconstruit de 40 cartes, joué tel quel). */
  welcome: boolean;
  sideCount: number;
  errors: string[];
  warnings: string[];
}

export const DECK_RULES = { minMain: 60, maxSide: 15, maxCopies: 4 } as const;

export const FORMAT_LABELS: Record<Format, string> = {
  standard: "Standard",
  unlimited: "Sans limite",
  commander: "Commander",
};

/** Formats proposés, dans l'ordre d'affichage. */
export const FORMATS: readonly Format[] = ["standard", "unlimited", "commander"];
/** Formats des parties en ligne (tous, depuis les salons de 2 à 4 joueurs, PLAN-E E13). */
export const ONLINE_FORMATS: readonly Format[] = FORMATS;

/** Commander (PLAN-E) : taille exacte du deck, commandant compris. */
export const COMMANDER_DECK_SIZE = 100;
const COMMANDER = commanderData as { banned: string[]; notLegal: string[]; gameChangers: string[] };
const COMMANDER_BANNED = new Set(COMMANDER.banned);
const COMMANDER_NOT_LEGAL = new Set(COMMANDER.notLegal);
const GAME_CHANGERS = new Set(COMMANDER.gameChangers);
const frontName = (name: string) => name.split(" // ")[0] as string;

/** La carte est-elle sur la liste des Game Changers (`cards/data/commander.json`) ? */
export function isGameChanger(c: CardDef): boolean {
  return GAME_CHANGERS.has(frontName(c.name));
}

export const DEFAULT_FORMAT: Format = "standard";

export function isFormat(v: unknown): v is Format {
  return typeof v === "string" && (FORMATS as readonly string[]).includes(v);
}

/** Problème de légalité d'une carte dans un format, ou undefined si elle y est légale. */
export function legalityIssue(c: CardDef, format: Format = DEFAULT_FORMAT): string | undefined {
  const label = FORMAT_LABELS[format];
  // Carte assemblée (verso commun de deux cartes à assemblage) : elle n'existe pas seule.
  if (c.meldResult) return `${c.name} est une carte assemblée : elle ne se met pas dans un deck`;
  // Sans limite : toute carte du catalogue, quelle que soit sa légalité.
  if (format === "unlimited") return undefined;
  // Commander : la liste de bannissement et les cartes non légales de `commander.json` (Scryfall).
  if (format === "commander") {
    if (COMMANDER_BANNED.has(frontName(c.name))) return `${c.name} est bannie en ${label}`;
    if (COMMANDER_NOT_LEGAL.has(frontName(c.name))) return `${c.name} n'est pas légale en ${label}`;
    return undefined;
  }
  switch (c.legalities?.standard) {
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
    // Cartes à plusieurs faces : le recto seul (MTGA), « A/B » (MTGO) et le nom français du recto,
    // sans écraser le nom d'une autre carte.
    for (const c of Object.values(cards)) {
      const [front, back] = c.faceDefs ?? [];
      if (c.isToken || !front) continue;
      const alias = (n: string | undefined) => {
        const key = n ? normalizeName(n) : "";
        if (key && !this.byName.has(key)) this.byName.set(key, c.name);
      };
      alias(front.name);
      alias(front.fr?.name);
      if (back) alias(`${front.name}/${back.name}`);
      if (back && front.fr?.name && back.fr?.name) alias(`${front.fr.name} // ${back.fr.name}`);
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

const HEADERS: Record<string, "main" | "side" | "commander" | "ignore" | "about"> = {
  deck: "main",
  main: "main",
  maindeck: "main",
  "main deck": "main",
  sideboard: "side",
  reserve: "side",
  réserve: "side",
  commander: "commander",
  commandant: "commander",
  companion: "ignore",
  compagnon: "ignore",
  about: "about",
};

const LINE = /^(?:(SB):\s*)?(\d+)\s*[xX]?\s+(.+?)\s*$/;
const SET_SUFFIX = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w-]+))?(?:\s+\*[A-Z]\*)?(?:\s+\*CMDR\*)?$/;
/** Marque d'un commandant dans une liste Moxfield (`1 Edgar Markov (C17) 36 *CMDR*`). */
const CMDR_MARK = /\s+\*CMDR\*$/;

/** Ajoute des exemplaires ; la première impression citée pour un nom vaut pour tous ses exemplaires. */
function add(entries: DeckEntries, n: number, name: string, printing?: string): void {
  const existing = entries.find((e) => e[1] === name);
  if (!existing) entries.push(printing ? [n, name, printing] : [n, name]);
  else {
    existing[0] += n;
    if (printing && !existing[2]) existing[2] = printing;
  }
}

/**
 * Lit une decklist texte :
 * - MTGA : `4 Llanowar Elves (FDN) 227`, sections `Deck` / `Sideboard`, `About` + `Name …` ;
 * - MTGO : `4 Llanowar Elves`, `4x …`, préfixe `SB:`, réserve après une ligne vide ;
 * - noms anglais ou français, commentaires `//` et `#`.
 */
export function parseDeckList(
  text: string,
  index: CardIndex,
  /** Impression d'une carte d'après « (SET) numéro » au-delà de ses rééditions (`findPrinting` de la table). */
  findPrinting?: (c: CardDef, set: string, number: string) => string | undefined,
): ParsedDeck {
  const out: ParsedDeck = { main: [], sideboard: [], issues: [] };
  let section: "main" | "side" | "commander" | "ignore" | "about" = "main";
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
    const marked = CMDR_MARK.test(m[3] as string);
    const suffix = SET_SUFFIX.exec(m[3] as string);
    const cardText = (m[3] as string).replace(SET_SUFFIX, "").replace(CMDR_MARK, "").trim();
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
    const c = index.cards[name];
    // « (SPG) 13 » : une impression de la carte (réédition, ou de la table), retenue pour son illustration.
    const key = suffix?.[2] ? `${suffix[1]?.toUpperCase()}-${suffix[2]}` : undefined;
    const printing =
      key && c?.printings?.some((p) => p.key === key)
        ? key
        : c && suffix?.[1] && suffix[2]
          ? findPrinting?.(c, suffix[1], suffix[2])
          : undefined;
    if (section === "commander" || marked) {
      out.commander ??= [];
      add(out.commander, count, name, printing);
    } else add(toSide ? out.sideboard : out.main, count, name, printing);
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
  deck: { name?: string; commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  opts: { format?: "mtga" | "plain"; lang?: "en" | "fr" } = {},
): string {
  const format = opts.format ?? "mtga";
  const line = ([n, name, key]: DeckEntry) => {
    const c = cards[name];
    const p = key ? (c?.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
    const origin = c?.origin ?? c?.set;
    const set = p ? ` (${p.set}) ${p.number}` : origin && c?.number ? ` (${origin}) ${c.number}` : "";
    if (format === "mtga") return `${n} ${exportName(c, name)}${set}`;
    return `${n} ${(opts.lang === "fr" && c?.fr?.name) || name}`;
  };
  const side = deck.sideboard ?? [];
  if (format === "mtga") {
    const parts = [
      ...(deck.name ? ["About", `Name ${deck.name}`, ""] : []),
      ...(deck.commander?.length ? ["Commander", ...deck.commander.map(line), ""] : []),
      "Deck",
      ...deck.main.map(line),
    ];
    if (side.length) parts.push("", "Sideboard", ...side.map(line));
    return `${parts.join("\n")}\n`;
  }
  const commander = deck.commander?.length ? ["Commander", ...deck.commander.map(line), "", "Deck"] : [];
  return `${[...commander, ...deck.main.map(line), ...(side.length ? ["", ...side.map(line)] : [])].join("\n")}\n`;
}

/** Nom exporté : le nom complet « A // B » pour une carte scindée, le recto seul pour les autres cartes à plusieurs faces. */
function exportName(c: CardDef | undefined, name: string): string {
  if (!c?.faceDefs?.length || c.layout === "split") return name;
  return c.faceDefs[0]?.name ?? name;
}

/** « Un deck peut contenir n'importe quel nombre de cartes appelées … » (Hare Apparent, Relentless Rats…). */
const ANY_NUMBER = /A deck can have any number of cards named/;
/** « Un deck peut contenir jusqu'à N cartes appelées … » (Seven Dwarves, Nazgûl) : N exemplaires, même en Commander. */
const UP_TO = /A deck can have up to (\w+) cards named/;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/** Exemplaires permis d'une carte : `max` par défaut, tous pour un terrain de base ou « n'importe quel nombre ». */
function copiesAllowed(c: CardDef, max: number): number {
  if (c.supertypes.includes("Basic") || ANY_NUMBER.test(c.text ?? "")) return Number.POSITIVE_INFINITY;
  const upTo = UP_TO.exec(c.text ?? "");
  return upTo ? (NUMBER_WORDS[upTo[1] as string] ?? max) : max;
}

/** Peut-elle être un commandant (903.3) : créature légendaire, ou « peut être votre commandant » ? */
export function canBeCommander(c: CardDef): boolean {
  return (c.supertypes.includes("Legendary") && c.types.includes("Creature")) || /can be your commander/.test(c.text ?? "");
}

const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

/**
 * Règles de construction : 60 cartes minimum, 4 exemplaires maximum (sauf terrains de base), réserve de 15,
 * cartes légales dans le format (réserve comprise), d'après les légalités Scryfall importées.
 * Exception : un deck identique à un deck de bienvenue préconstruit (40 cartes) se joue tel quel.
 */
export function validateDeck(
  deck: { commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  format: Format = DEFAULT_FORMAT,
): DeckValidation {
  if (format === "commander") return validateCommanderDeck(deck, cards);
  const errors: string[] = [];
  const warnings: string[] = [];
  const side = deck.sideboard ?? [];
  const mainCount = count(deck.main);
  const sideCount = count(side);
  const precon = preconFor(deck.main);
  const welcome = !!precon && mainCount < DECK_RULES.minMain;
  const minMain = welcome ? mainCount : DECK_RULES.minMain;
  if (mainCount < minMain) errors.push(`Le deck contient ${mainCount} cartes (minimum ${minMain})`);
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
    if (n > copiesAllowed(c, DECK_RULES.maxCopies)) {
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
    minMain,
    welcome,
    sideCount,
    errors,
    warnings,
  };
}

/**
 * Commander (903.5, PLAN-E) : un commandant (créature légendaire ou « peut être votre commandant » ; les paires,
 * partenaire ou historique, attendent un deck qui en a), exactement 100 cartes commandant compris, un exemplaire de
 * chaque carte sauf les terrains de base (et « n'importe quel nombre », « jusqu'à N »), toutes dans l'identité de couleur
 * du commandant, aucune bannie ni non légale (`commander.json`), pas de réserve. Les Game Changers et la tranche estimée
 * sont donnés à titre indicatif.
 */
function validateCommanderDeck(
  deck: { commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const commanderEntries = deck.commander ?? [];
  const commanders = commanderEntries.map(([, name]) => name);
  const sideCount = count(deck.sideboard ?? []);
  const mainCount = count(deck.main) + count(commanderEntries);
  if (commanders.length === 0) errors.push("Choisissez un commandant");
  else if (commanders.length > 1 || count(commanderEntries) > 1)
    errors.push("Paire de commandants (partenaire, historique…) pas encore gérée : un seul commandant");
  if (mainCount !== COMMANDER_DECK_SIZE)
    errors.push(`Le deck contient ${mainCount} cartes, commandant compris (il en faut exactement ${COMMANDER_DECK_SIZE})`);
  if (sideCount > 0) errors.push("Pas de réserve en Commander");
  const identity = new Set<Color>();
  for (const name of commanders) {
    const c = cards[name];
    if (!c) continue;
    if (!canBeCommander(c)) errors.push(`${name} ne peut pas être votre commandant (créature légendaire attendue)`);
    for (const color of colorIdentity(c)) identity.add(color);
  }
  const deckIdentity = (["W", "U", "B", "R", "G"] as Color[]).filter((x) => identity.has(x));
  const totals = new Map<string, number>();
  for (const [n, name] of [...commanderEntries, ...deck.main]) totals.set(name, (totals.get(name) ?? 0) + n);
  let playable = true;
  const gameChangers: string[] = [];
  for (const [name, n] of totals) {
    const c = cards[name];
    if (!c) {
      errors.push(`Carte inconnue : ${name}`);
      playable = false;
      continue;
    }
    if (n > copiesAllowed(c, 1)) errors.push(`${name} : ${n} exemplaires (un seul en Commander)`);
    if (commanders.length && !withinIdentity(colorIdentity(c), deckIdentity))
      errors.push(`${name} est hors de l'identité de couleur du commandant`);
    const illegal = legalityIssue(c, "commander");
    if (illegal) errors.push(illegal);
    if (isGameChanger(c)) gameChangers.push(name);
    if (!c.implemented) {
      playable = false;
      warnings.push(`${name} n'est pas encore jouable`);
    }
  }
  return {
    format: "commander",
    legal: errors.length === 0,
    playable: playable && errors.length === 0,
    mainCount,
    minMain: COMMANDER_DECK_SIZE,
    welcome: false,
    sideCount,
    errors,
    warnings,
    commanders,
    identity: deckIdentity,
    gameChangers,
    bracket: gameChangers.length === 0 ? "1–2" : gameChangers.length <= 3 ? "3" : "4+",
  };
}

/** Couleurs d'un deck (d'après ses sorts). */
export function deckColors(main: DeckEntries, cards: Record<string, CardDef>): string[] {
  const set = new Set<string>();
  for (const [, name] of main) for (const c of cards[name]?.colors ?? []) set.add(c);
  return ["W", "U", "B", "R", "G"].filter((c) => set.has(c));
}

/**
 * Réserve entre deux manches (BO3) : le nouveau deck doit contenir exactement les mêmes cartes, deck et réserve réunis,
 * et rester légal et jouable. Renvoie le problème, ou null si l'échange est valable.
 */
export function sideboardSwapError(
  original: { main: DeckEntries; sideboard?: DeckEntries },
  next: { main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  format: Format = DEFAULT_FORMAT,
): string | null {
  const totals = (d: { main: DeckEntries; sideboard?: DeckEntries }) => {
    const m = new Map<string, number>();
    for (const [n, name] of [...d.main, ...(d.sideboard ?? [])]) m.set(name, (m.get(name) ?? 0) + n);
    return m;
  };
  const a = totals(original);
  const b = totals(next);
  if (a.size !== b.size || [...a].some(([name, n]) => b.get(name) !== n))
    return "Le deck et la réserve doivent contenir les mêmes cartes qu'au début du match.";
  const v = validateDeck(next, cards, format);
  if (!v.legal) return v.errors[0] ?? "Deck illégal.";
  if (!v.playable) return "Le deck contient des cartes pas encore jouables.";
  return null;
}
