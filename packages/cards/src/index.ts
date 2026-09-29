import type { CardDef } from "@mtgx/engine";
import { DECKS, type DeckList } from "./decks";
import { toCardDef } from "./scryfall";
import { SETS } from "./sets";

export {
  CardIndex,
  DECK_RULES,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckIssue,
  type DeckValidation,
  deckColors,
  FORMAT_LABELS,
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
export { type CardSet, isMainSet, SET_BY_CODE, SETS } from "./sets";
export { type TokenLike, tokenImage } from "./tokenImages";
export { TOKEN_SPECS } from "./tokens";

/** Toutes les cartes connues, indexées par nom anglais (toutes extensions ; une réimpression garde la première). */
export const CARDS: Record<string, CardDef> = {};
for (const set of SETS) {
  for (const raw of set.data) CARDS[raw.name] ??= toCardDef(raw, set.scripts[raw.name], set.code, set.scripts);
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

export function deckById(id: string): DeckList {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Deck inconnu : ${id}`);
  return d;
}

export const implementedCards = (): CardDef[] => Object.values(CARDS).filter((c) => c.implemented);
