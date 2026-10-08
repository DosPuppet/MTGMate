/** Listes de decks seules (sans les données de cartes) : utilisable côté interface sans alourdir le bundle. */

import type { Format } from "@mtgx/engine";
import bienvenueBlanc from "../decks/bienvenue-blanc.json";
import bienvenueBleu from "../decks/bienvenue-bleu.json";
import bienvenueNoir from "../decks/bienvenue-noir.json";
import bienvenueRouge from "../decks/bienvenue-rouge.json";
import bienvenueVert from "../decks/bienvenue-vert.json";
import cmdCounterBlitz from "../decks/cmd-counter-blitz.json";
import cmdEdgarMarkov from "../decks/cmd-edgar-markov.json";
import cmdFantasticFour from "../decks/cmd-fantastic-four.json";
import cmdMultiverseReforged from "../decks/cmd-multiverse-reforged.json";
import cmdMutantMenace from "../decks/cmd-mutant-menace.json";
import cmdNissa from "../decks/cmd-nissa.json";
import cmdRakdos from "../decks/cmd-rakdos.json";
import cmdTurtlePower from "../decks/cmd-turtle-power.json";
import cmdUrDragon from "../decks/cmd-ur-dragon.json";
import cmdVision from "../decks/cmd-vision.json";
import cmdYshtola from "../decks/cmd-yshtola.json";
import finCloud from "../decks/fin-cloud.json";
import finSephiroth from "../decks/fin-sephiroth.json";
import meta4cControl from "../decks/meta-4c-control.json";
import metaDimirMidrange from "../decks/meta-dimir-midrange.json";
import metaIzzetSpellementals from "../decks/meta-izzet-spellementals.json";
import metaJundSacrifice from "../decks/meta-jund-sacrifice.json";
import metaMonoGreenLandfall from "../decks/meta-mono-green-landfall.json";
import type { DeckEntries } from "./decklist";

/** Un deck : cartes par nom anglais (clé canonique), avec leur nombre d'exemplaires. */
export interface DeckList {
  id: string;
  name: string;
  description?: string;
  colors: string[];
  cover?: string;
  /** Commander (PLAN-E) : le commandant (une ligne), à part du deck. */
  commander?: DeckEntries;
  main: DeckEntries;
  sideboard?: DeckEntries;
  /** Format du deck, quand il n'est pas le Standard (un deck Commander se valide en Commander). */
  format?: Format;
  /** Deck préconstruit (lecture seule) ou créé par l'utilisateur. */
  builtin?: boolean;
  /**
   * Commander : bracket déclaré par la source de la liste (Wizards annonce ses préconstruits en bracket 2 ; une liste
   * EDHREC ou Moxfield, celui de son auteur). Le nombre de Game Changers (`validateDeck`) n'en donne qu'un plancher.
   */
  bracket?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Decks de bienvenue (40 cartes, Foundations), le Starter Kit Final Fantasy, les cinq premiers decks du méta Standard
 * (relevé du 29/09/2026, `docs/meta/`), réserve comprise, puis les decks Commander (PLAN-E, `docs/commander/decks/`).
 */
export const DECKS: DeckList[] = [
  bienvenueBlanc,
  bienvenueBleu,
  bienvenueNoir,
  bienvenueRouge,
  bienvenueVert,
  finSephiroth,
  finCloud,
  metaIzzetSpellementals,
  metaMonoGreenLandfall,
  metaDimirMidrange,
  metaJundSacrifice,
  meta4cControl,
  cmdEdgarMarkov,
  cmdYshtola,
  cmdUrDragon,
  cmdRakdos,
  cmdMultiverseReforged,
  cmdTurtlePower,
  cmdCounterBlitz,
  cmdFantasticFour,
  cmdMutantMenace,
  cmdNissa,
  cmdVision,
].map((d) => ({ ...(d as DeckList), builtin: true }));

const deckKey = (main: DeckEntries) => {
  const totals = new Map<string, number>();
  for (const [n, name] of main) totals.set(name, (totals.get(name) ?? 0) + n);
  return [...totals].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).join("|");
};
const PRECON_BY_KEY = new Map(DECKS.map((d) => [deckKey(d.main), d]));

/** Préconstruit dont le deck principal est identique (quels que soient l'ordre et le découpage des lignes). */
export function preconFor(main: DeckEntries): DeckList | undefined {
  return PRECON_BY_KEY.get(deckKey(main));
}
