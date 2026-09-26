/** Messages échangés entre l'interface et le Web Worker qui fait tourner la partie. */
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardFace, Decision, GameEvent, GameView } from "@mtgx/engine";

/**
 * Bac à sable (mode dev, tests d'interface) : permanents et jetons mis en jeu au début de la partie,
 * par joueur ("p1" = vous, "p2"… = IA).
 */
export type Sandbox = Record<
  string,
  {
    cards?: string[];
    tokens?: [number, string][];
    /** Aura ou Équipement de ce joueur, attaché à une créature (nom) de `hostPlayer` (ce joueur par défaut). */
    attach?: [card: string, host: string, hostPlayer?: string][];
  }
>;

export type ToWorker =
  | {
      type: "start";
      seed: number;
      playerName: string;
      playerDeck: DeckEntries;
      aiDecks: DeckEntries[];
      sandbox?: Sandbox;
    }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  | { type: "error"; message: string };
