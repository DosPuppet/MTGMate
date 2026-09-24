import type { CardDef } from "@mtgx/engine";
import fdnData from "../data/fdn.json";
import { DECKS, type DeckList } from "./decks";
import { FDN_SCRIPTS } from "./fdn";
import { type RawCard, toCardDef } from "./scryfall";

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

export function buildDeck(list: DeckList): CardDef[] {
  const out: CardDef[] = [];
  for (const [n, name] of list.cards) for (let i = 0; i < n; i++) out.push(card(name));
  return out;
}

export function deckById(id: string): DeckList {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Deck inconnu : ${id}`);
  return d;
}

export const implementedCards = (): CardDef[] => Object.values(CARDS).filter((c) => c.implemented);
