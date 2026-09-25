/** Messages échangés entre l'interface et le Web Worker qui fait tourner la partie. */
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardFace, Decision, GameEvent, GameView } from "@mtgx/engine";

export type ToWorker =
  | { type: "start"; seed: number; playerName: string; playerDeck: DeckEntries; aiDecks: DeckEntries[] }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  | { type: "error"; message: string };
