import type { CardDef } from "@mtgx/engine";
import legalityOverrides from "../data/legality-overrides.json";
import { DECKS, type DeckList } from "./decks";
import { toCardDef } from "./scryfall";
import { SETS } from "./sets";

interface LegalityOverride {
  legalities: Record<string, string>;
  since?: string;
  source?: string;
}

export {
  CardIndex,
  DECK_RULES,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckEntry,
  type DeckIssue,
  type DeckValidation,
  deckColors,
  FORMAT_LABELS,
  FORMATS,
  isFormat,
  legalityIssue,
  normalizeName,
  type ParsedDeck,
  parseDeckList,
  serializeDeckList,
  sideboardSwapError,
  validateDeck,
} from "./decklist";
export { DECKS, type DeckList } from "./decks";
export { HANDLED_LAYOUTS, onlyKeywords, type RawCard, type RawFace, slug, toCardDef } from "./scryfall";
export { EXCLUDED_REPRINTS } from "./setRegistry";
export { type CardSet, isMainSet, SET_BY_CODE, SETS } from "./sets";
export { type TokenLike, tokenImage } from "./tokenImages";
export { TOKEN_SPECS } from "./tokens";

/** Toutes les cartes connues, indexées par nom anglais (toutes extensions ; une réimpression garde la première). */
export const CARDS: Record<string, CardDef> = {};
for (const set of SETS) {
  for (const raw of set.data) {
    const known = CARDS[raw.name];
    if (!known) {
      const def = toCardDef(raw, set.scripts[raw.name], set.code, set.scripts);
      if (raw.origin) def.origin = raw.origin;
      CARDS[raw.name] = def;
    }
    // Réédition d'une carte déjà connue (PLAN-G) : une impression de plus, avec son illustration, que le deck peut choisir.
    else if (set.reprint && raw.image !== known.image) {
      const key = `${set.code}-${raw.number}`;
      if (!known.printings?.some((p) => p.key === key))
        known.printings = [
          ...(known.printings ?? []),
          {
            key,
            set: set.code,
            number: raw.number,
            image: raw.image,
            artCrop: raw.artCrop,
            ...(raw.fr?.image && raw.fr.image !== known.fr?.image ? { frImage: raw.fr.image } : {}),
          },
        ];
    }
  }
}
// Dérogations aux légalités importées (PLAN-C, C19) : un bannissement annoncé, en vigueur avant le prochain réimport.
// Format : { "<nom anglais>": { "legalities": { "standard": "banned" }, "since": "AAAA-MM-JJ", "source": "<annonce>" } }.
for (const [name, o] of Object.entries(legalityOverrides as Record<string, LegalityOverride>)) {
  const c = CARDS[name];
  if (!c) throw new Error(`legality-overrides.json : carte inconnue « ${name} »`);
  c.legalities = { ...c.legalities, ...o.legalities };
}
// Assemblage : chaque partie embarque la définition de la carte assemblée (enregistrée avec elle dans la partie).
for (const c of Object.values(CARDS)) {
  if (c.meld?.result && !c.meldResult) c.meldResultDef = CARDS[c.meld.result];
}

export function card(name: string): CardDef {
  const c = CARDS[name];
  if (!c) throw new Error(`Carte inconnue : ${name}`);
  return c;
}

export function cardById(id: string): CardDef | undefined {
  return Object.values(CARDS).find((c) => c.id === id) ?? CARDS[id];
}

export function buildDeck(list: Pick<DeckList, "main">): CardDef[] {
  const out: CardDef[] = [];
  for (const [n, name] of list.main) for (let i = 0; i < n; i++) out.push(card(name));
  return out;
}

/**
 * Impression choisie pour chaque carte de `buildDeck` (même ordre), ou `undefined` si le deck n'en choisit aucune :
 * à passer dans `PlayerSetup.printings` (le moteur ignore une impression que la carte n'a pas).
 */
export function deckPrintings(list: Pick<DeckList, "main">): (string | null)[] | undefined {
  if (!list.main.some((e) => e[2])) return undefined;
  return list.main.flatMap(([n, , key]) => Array.from({ length: n }, () => key ?? null));
}

export function deckById(id: string): DeckList {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Deck inconnu : ${id}`);
  return d;
}

export const implementedCards = (): CardDef[] => Object.values(CARDS).filter((c) => c.implemented);
