/** Listes de decks seules (sans les données de cartes) : utilisable côté interface sans alourdir le bundle. */
import rougeBrulure from "../decks/rouge-brulure.json";
import vertColosses from "../decks/vert-colosses.json";

export interface DeckList {
  id: string;
  name: string;
  description: string;
  colors: string[];
  cover?: string;
  cards: [number, string][];
}

export const DECKS: DeckList[] = [vertColosses as DeckList, rougeBrulure as DeckList];
