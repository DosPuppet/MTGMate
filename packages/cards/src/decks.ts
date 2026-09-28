/** Listes de decks seules (sans les données de cartes) : utilisable côté interface sans alourdir le bundle. */
import bienvenueBlanc from "../decks/bienvenue-blanc.json";
import bienvenueBleu from "../decks/bienvenue-bleu.json";
import bienvenueNoir from "../decks/bienvenue-noir.json";
import bienvenueRouge from "../decks/bienvenue-rouge.json";
import bienvenueVert from "../decks/bienvenue-vert.json";
import finCloud from "../decks/fin-cloud.json";
import finSephiroth from "../decks/fin-sephiroth.json";

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

/** Decks de bienvenue (40 cartes, Foundations), puis le Starter Kit Final Fantasy. */
export const DECKS: DeckList[] = [
  bienvenueBlanc,
  bienvenueBleu,
  bienvenueNoir,
  bienvenueRouge,
  bienvenueVert,
  finSephiroth,
  finCloud,
].map((d) => ({ ...(d as DeckList), builtin: true }));

const deckKey = (main: [number, string][]) => {
  const totals = new Map<string, number>();
  for (const [n, name] of main) totals.set(name, (totals.get(name) ?? 0) + n);
  return [...totals].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).join("|");
};
const PRECON_BY_KEY = new Map(DECKS.map((d) => [deckKey(d.main), d]));

/** Préconstruit dont le deck principal est identique (quels que soient l'ordre et le découpage des lignes). */
export function preconFor(main: [number, string][]): DeckList | undefined {
  return PRECON_BY_KEY.get(deckKey(main));
}
