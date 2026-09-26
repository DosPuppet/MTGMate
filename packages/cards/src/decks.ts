/** Listes de decks seules (sans les données de cartes) : utilisable côté interface sans alourdir le bundle. */
import fraDedicatedCadets from "../decks/fra-dedicated-cadets.json";
import fraFateholdJace from "../decks/fra-fatehold-jace.json";
import fraFormidableCimetiere from "../decks/fra-formidable-cimetiere.json";
import fraInnovativePrepare from "../decks/fra-innovative-prepare.json";
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

/** Foundations d'abord (les tests et le bench utilisent les deux premiers), puis Reality Fracture. */
export const DECKS: DeckList[] = [
  vertColosses,
  rougeBrulure,
  fraFateholdJace,
  fraInnovativePrepare,
  fraFormidableCimetiere,
  fraDedicatedCadets,
].map((d) => ({ ...(d as DeckList), builtin: true }));
