import type { CardDef, TokenSpec } from "@mtgx/engine";
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
  validateDeck,
} from "./decklist";
export { DECKS, type DeckList } from "./decks";
export { type CardSet, isMainSet, SET_BY_CODE, SETS } from "./sets";

import { CAT, DOG, FOOD, GOBLIN, RABBIT, SOLDIER, SPIRIT, TREASURE } from "./fdn/common";

/** Jetons courants, par nom : bac à sable de l'interface (mode dev) et tests. */
export const TOKEN_SPECS: Record<string, TokenSpec> = {
  Cat: CAT,
  Dog: DOG,
  Food: FOOD,
  Goblin: GOBLIN,
  Rabbit: RABBIT,
  Soldier: SOLDIER,
  Spirit: SPIRIT,
  Treasure: TREASURE,
};
export { onlyKeywords, type RawCard, slug, toCardDef } from "./scryfall";

/** Toutes les cartes connues, indexées par nom anglais (toutes extensions ; une réimpression garde la première). */
export const CARDS: Record<string, CardDef> = {};
for (const set of SETS) {
  for (const raw of set.data) CARDS[raw.name] ??= toCardDef(raw, set.scripts[raw.name], set.code);
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
