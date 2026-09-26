/**
 * Protocole du jeu en ligne (WebSocket, JSON). Types partagés : le client les importe en `import type`.
 * Le serveur fait autorité : il valide les decks et chaque décision (RulesError du moteur).
 */
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardFace, Decision, GameEvent, GameView } from "@mtgx/engine";

/** Sièges d'un duel : identifiants des joueurs dans le moteur. */
export type Seat = "p1" | "p2";

/** Minuteur de la décision en cours (durées relatives : pas de dépendance à l'horloge du client). */
export interface Clock {
  /** Joueur qui doit décider. */
  player: Seat;
  /** Temps restant à la réception du message (ms). */
  remainingMs: number;
  /** Durée totale d'une décision (ms). */
  totalMs: number;
  /** Durée pendant laquelle la corde s'affiche (ms, fin du temps). */
  ropeMs: number;
  /** Expirations déjà subies par joueur (défaite à `maxTimeouts`). */
  timeouts: Record<Seat, number>;
  maxTimeouts: number;
}

export interface RoomInfo {
  code: string;
  seat: Seat;
  /** Jeton de reconnexion du destinataire (à garder pour `rejoin`). */
  token: string;
  status: "waiting" | "playing" | "over";
  players: { seat: Seat; name: string; connected: boolean; rematch: boolean }[];
}

export type ClientMessage =
  | { type: "create"; name: string; deck: DeckEntries }
  | { type: "join"; code: string; name: string; deck: DeckEntries }
  | { type: "rejoin"; token: string }
  | { type: "leave" }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  | { type: "rematch" };

export type ErrorCode = "deck" | "name" | "room" | "full" | "token" | "rules" | "state";

export type ServerMessage =
  | { type: "room"; room: RoomInfo }
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace>; clock: Clock | null }
  | { type: "opponent"; connected: boolean; remainingMs: number | null }
  | { type: "error"; code: ErrorCode; message: string };
