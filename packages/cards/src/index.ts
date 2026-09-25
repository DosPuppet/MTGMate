import type { CardDef } from "@mtgx/engine";
import fdnData from "../data/fdn.json";
import { DECKS, type DeckList } from "./decks";
import { FDN_SCRIPTS } from "./fdn/index";
import { type RawCard, toCardDef } from "./scryfall";

export {
  CardIndex,
  DECK_RULES,
  type DeckEntries,
  type DeckIssue,
  type DeckValidation,
  deckColors,
  normalizeName,
  type ParsedDeck,
  parseDeckList,
  serializeDeckList,
  validateDeck,
} from "./decklist";
export { DECKS, type DeckList } from "./decks";
export { onlyKeywords, type RawCard, slug, toCardDef } from "./scryfall";

/** Toutes les cartes connues, indexées par nom anglais. */
export const CARDS: Record<string, CardDef> = {};
for (const raw of fdnData as RawCard[]) CARDS[raw.name] = toCardDef(raw, FDN_SCRIPTS[raw.name]);

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

/** Cartes du set principal Foundations (numéros 1 à 281, terrains de base compris). */
export function isMainSet(c: CardDef): boolean {
  return !c.isToken && c.set === "FDN" && Number.parseInt(c.number ?? "999", 10) <= 281;
}
