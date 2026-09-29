/**
 * Enregistrement d'une partie : graine, joueurs et decks (dans l'ordre), puis toutes les décisions appliquées.
 * Le moteur étant déterministe, rejouer ces décisions redonne exactement la même partie : reprise d'une partie en
 * ligne après un redémarrage du serveur, replays, export d'une partie pour signaler un bug.
 *
 * Les decks sont enregistrés par noms de cartes : `resolve` redonne les définitions au rejeu.
 */
import { createGame, type GameOptions, type StepResult, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export const RECORD_FORMAT = "mtgx-game";
export const RECORD_VERSION = 1;

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  version: typeof RECORD_VERSION;
  seed: number;
  /**
   * Premier joueur imposé à la création (absent : tiré au sort par le moteur, ce qui consomme son hasard ; le rejeu doit
   * refaire ce tirage, pas le remplacer par son résultat).
   */
  startingPlayer?: PlayerId;
  startingLife?: number;
  players: { id: PlayerId; name: string; deck: string[] }[];
  /** Décisions appliquées, dans l'ordre : [joueur qui a décidé, décision]. */
  decisions: [PlayerId, Decision][];
  /** Date de début (ISO), pour l'affichage. */
  createdAt?: string;
}

/** Crée la partie et l'enregistrement qui permettra de la rejouer. */
export function createRecordedGame(opts: GameOptions): StepResult & { record: GameRecord } {
  const result = createGame(opts);
  const record: GameRecord = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    seed: opts.seed,
    startingPlayer: opts.startingPlayer,
    startingLife: opts.startingLife,
    players: opts.players.map((p) => ({ id: p.id, name: p.name, deck: p.deck.map((c) => c.name) })),
    decisions: [],
    createdAt: new Date().toISOString(),
  };
  return { ...result, record };
}

/** Vérifie la forme d'un enregistrement reçu (fichier importé, disque du serveur). */
export function isGameRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  return (
    !!r &&
    r.format === RECORD_FORMAT &&
    r.version === RECORD_VERSION &&
    Number.isInteger(r.seed) &&
    (r.startingPlayer === undefined || typeof r.startingPlayer === "string") &&
    Array.isArray(r.players) &&
    r.players.every((p) => typeof p?.id === "string" && typeof p.name === "string" && Array.isArray(p.deck)) &&
    Array.isArray(r.decisions) &&
    r.decisions.every((d) => Array.isArray(d) && typeof d[0] === "string" && !!d[1] && typeof d[1] === "object")
  );
}

function initial(record: GameRecord, resolve: (name: string) => CardDef): StepResult {
  return createGame({
    seed: record.seed,
    startingPlayer: record.startingPlayer,
    startingLife: record.startingLife,
    players: record.players.map((p) => ({ id: p.id, name: p.name, deck: p.deck.map(resolve) })),
  });
}

/** Rejoue la partie jusqu'à la décision `upTo` (exclue ; toutes par défaut) : état et événements produits. */
export function replayGame(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  upTo = record.decisions.length,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = initial(record, resolve);
  const all = [...events];
  for (const [player, d] of record.decisions.slice(0, upTo)) {
    ({ state, events } = submit(state, player, d));
    all.push(...events);
  }
  return { state, events: all };
}

/** Tous les états de la partie : le départ, puis un par décision (replays pas à pas). */
export function replayStates(record: GameRecord, resolve: (name: string) => CardDef): GameState[] {
  let { state } = initial(record, resolve);
  const out = [state];
  for (const [player, d] of record.decisions) {
    state = submit(state, player, d).state;
    out.push(state);
  }
  return out;
}
