/** Messages échangés entre l'interface et le Web Worker qui fait tourner la partie. */
import type { ScriptAction } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardDef, CardFace, Decision, GameEvent, GameView } from "@mtgx/engine";

/**
 * Bac à sable (mode dev, tests d'interface) : permanents et jetons mis en jeu au début de la partie,
 * par joueur ("p1" = vous, "p2"… = IA).
 */
export type Sandbox = Record<
  string,
  {
    cards?: string[];
    /** Cartes ajoutées à la main de ce joueur. */
    hand?: string[];
    tokens?: [number, string][];
    /** Aura ou Équipement de ce joueur, attaché à une créature (nom) de `hostPlayer` (ce joueur par défaut). */
    attach?: [card: string, host: string, hostPlayer?: string][];
  }
>;

/** Un camp d'une partie mise en scène (tutoriel), par noms de cartes. */
export interface ScenarioSide {
  name?: string;
  life?: number;
  /** Bibliothèque dans l'ordre : la première carte est le dessus. */
  library: string[];
  hand: string[];
  battlefield?: (string | { card: string; tapped?: boolean; sick?: boolean })[];
  graveyard?: string[];
}

/** Partie mise en scène (tutoriel) : état de départ connu et adversaire scripté (ou l'IA heuristique). */
export interface ScenarioSpec {
  you: ScenarioSide;
  opponent: ScenarioSide;
  active: "you" | "opponent";
  turn?: number;
  mulligan?: boolean;
  opponentPlays: ScriptAction[] | "heuristic";
}

export type ToWorker =
  | {
      type: "start";
      seed: number;
      playerName: string;
      playerDeck: DeckEntries;
      aiDecks: DeckEntries[];
      /** Définitions des cartes utilisées (par nom) : le worker n'embarque pas toute la base de cartes. */
      defs: Record<string, CardDef>;
      sandbox?: Sandbox;
      /** Mode rapide des tests d'interface (dev) : l'IA joue sans pause. */
      fast?: boolean;
      /** Tutoriel : partie mise en scène au lieu de decks mélangés (les decks sont alors vides). */
      scenario?: ScenarioSpec;
    }
  /** Tutoriel : l'adversaire attend (explication à l'écran). */
  | { type: "pause"; paused: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  | { type: "error"; message: string };
