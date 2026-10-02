/**
 * Événements d'affichage (`GameEvent`) : le moteur est synchrone, un collecteur global suffit. Module sans dépendance
 * d'exécution, pour que tout fichier puisse émettre sans entrer dans le cycle d'imports du moteur.
 */
import type { GameEvent } from "./types";

let sink: GameEvent[] | null = null;

export function collectEvents<T>(fn: () => T): [T, GameEvent[]] {
  const previous = sink;
  const events: GameEvent[] = [];
  sink = events;
  try {
    return [fn(), events];
  } finally {
    sink = previous;
  }
}

export function emit(event: GameEvent): void {
  sink?.push(event);
}
