/** Listes de decks seules (sans les données de cartes) : utilisable côté interface sans alourdir le bundle. */
import rougeBrulure from "../decks/rouge-brulure.json";
import vertColosses from "../decks/vert-colosses.json";

/** Un deck : cartes par nom anglais (clé canonique), avec leur nombre d'exemplaires. */
export interface DeckList {
  id: string;
  name: string;
  description?: string;
  colors: string[];
  cover?: string;
  main: [number, string][];
  sideboard?: [number, string][];
  /** Deck préconstruit (lecture seule) ou créé par l'utilisateur. */
  builtin?: boolean;
}

export const DECKS: DeckList[] = [vertColosses, rougeBrulure].map((d) => ({ ...(d as DeckList), builtin: true }));
