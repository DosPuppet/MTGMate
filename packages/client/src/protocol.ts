/** Messages échangés entre l'interface et le Web Worker qui fait tourner la partie. */
import type { AiLevel, ScriptAction } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardDef, CardFace, Decision, GameEvent, GameRecord, GameView } from "@mtgx/engine";

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
    /** Cartes ajoutées au cimetière de ce joueur (flashback, harmonie). */
    graveyard?: string[];
    tokens?: [number, string][];
    /** Aura ou Équipement de ce joueur, attaché à une créature (nom) de `hostPlayer` (ce joueur par défaut). */
    attach?: [card: string, host: string, hostPlayer?: string][];
    /** Marqueurs posés sur un permanent (nom) de ce joueur, après la mise en jeu. */
    counters?: [card: string, kind: string, n: number][];
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

/** Partie mise en scène (tutoriel) : état de départ connu et adversaire scripté (ou une IA du niveau indiqué). */
export interface ScenarioSpec {
  you: ScenarioSide;
  opponent: ScenarioSide;
  active: "you" | "opponent";
  turn?: number;
  mulligan?: boolean;
  opponentPlays: ScriptAction[] | AiLevel;
}

export type ToWorker =
  | {
      type: "start";
      seed: number;
      playerName: string;
      playerDeck: DeckEntries;
      /** Premier joueur imposé (manche suivante d'un BO3 : le perdant de la précédente) ; absent : tirage au sort. */
      startingPlayer?: string;
      aiDecks: DeckEntries[];
      /** Définitions des cartes utilisées (par nom) : le worker n'embarque pas toute la base de cartes. */
      defs: Record<string, CardDef>;
      sandbox?: Sandbox;
      /** Mode rapide des tests d'interface (dev) : l'IA joue sans pause. */
      fast?: boolean;
      /** Tutoriel : partie mise en scène au lieu de decks mélangés (les decks sont alors vides). */
      scenario?: ScenarioSpec;
      /** Niveau des IA adverses (moyen par défaut). */
      aiLevel?: AiLevel;
    }
  /**
   * Reprise d'une partie sauvegardée (page rouverte) : l'enregistrement est rejoué, puis la partie continue contre des IA
   * du niveau indiqué.
   */
  | {
      type: "resume";
      record: GameRecord;
      defs: Record<string, CardDef>;
      aiLevel?: AiLevel;
      fast?: boolean;
    }
  /** Tutoriel : l'adversaire attend (explication à l'écran). */
  | { type: "pause"; paused: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  /** Enregistrement de la partie (export pour un replay ou pour signaler un bug). */
  | { type: "export" };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  | { type: "error"; message: string }
  /** Enregistrement demandé ; null si la partie n'est pas enregistrée (tutoriel, bac à sable). */
  | { type: "record"; record: GameRecord | null }
  /**
   * Sauvegarde de la partie (reprise à la réouverture de la page) : l'en-tête de l'enregistrement au départ, puis les
   * décisions nouvelles et les points de contrôle.
   */
  | { type: "saved"; header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }
  /** Reprise impossible (la partie ne se rejoue plus à l'identique, par exemple après une mise à jour du moteur). */
  | { type: "resumeFailed"; message: string };
