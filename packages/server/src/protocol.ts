/**
 * Protocole du jeu en ligne (WebSocket, JSON). Types partagés : le client les importe en `import type`.
 * Le serveur fait autorité : il valide les decks et chaque décision (RulesError du moteur).
 */
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardFace, Decision, Format, GameEvent, GameRecord, GameView } from "@mtgx/engine";

/**
 * Version du protocole : avec `RULES_VERSION`, envoyée par le client à la création, à l'arrivée et à la reprise d'un
 * salon. Un client d'une autre version (onglet resté ouvert, service worker périmé) est refusé et invité à recharger
 * la page. À faire avancer à tout changement incompatible des messages.
 */
export const PROTOCOL_VERSION = 1;

/** Versions du client (protocole et règles du moteur). */
export interface ClientVersion {
  protocol: number;
  rules: number;
}

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

/** Match : une manche (BO1) ou au meilleur des trois (BO3). */
export interface MatchInfo {
  bestOf: 1 | 3;
  /** Format des decks du salon, choisi à sa création (absent : Standard). */
  format?: Format;
  /** Manches gagnées par siège. */
  wins: Record<Seat, number>;
  /** Numéro de la manche en cours (ou de la dernière jouée). */
  game: number;
  /** Vainqueur du match (null tant qu'il n'est pas décidé). */
  winner: Seat | null;
}

export interface RoomInfo {
  code: string;
  seat: Seat;
  /** Jeton de reconnexion du destinataire (à garder pour `rejoin`). */
  token: string;
  /** `sideboard` : entre deux manches d'un BO3, chacun ajuste son deck avec sa réserve. */
  status: "waiting" | "playing" | "sideboard" | "over";
  /** `ready` : réserve validée, prêt pour la manche suivante. */
  players: { seat: Seat; name: string; connected: boolean; rematch: boolean; ready: boolean }[];
  match: MatchInfo;
  /** Deck et réserve actuels du destinataire (entre les manches : point de départ de l'échange). */
  deck: { main: DeckEntries; sideboard: DeckEntries };
}

export type ClientMessage =
  | {
      type: "create";
      name: string;
      deck: DeckEntries;
      sideboard?: DeckEntries;
      bestOf?: 1 | 3;
      format?: Format;
      version?: ClientVersion;
    }
  | { type: "join"; code: string; name: string; deck: DeckEntries; sideboard?: DeckEntries; version?: ClientVersion }
  | { type: "rejoin"; token: string; version?: ClientVersion }
  | { type: "leave" }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  | { type: "rematch" }
  /** Entre deux manches (BO3) : deck et réserve pour la manche suivante (mêmes cartes au total), puis prêt. */
  | { type: "sideboard"; main: DeckEntries; sideboard: DeckEntries }
  /** Enregistrement de la partie terminée (replay, signalement d'un bug) ; refusé pendant la partie (decks, graine). */
  | { type: "export" };

/**
 * `busy` : serveur complet ; `closed` : salon fermé par le serveur (attente trop longue) ; `version` : client d'une autre
 * version que le serveur (recharger la page).
 */
export type ErrorCode = "deck" | "name" | "room" | "full" | "busy" | "closed" | "token" | "rules" | "state" | "version";

export type ServerMessage =
  | { type: "room"; room: RoomInfo }
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace>; clock: Clock | null }
  | { type: "opponent"; connected: boolean; remainingMs: number | null }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "record"; record: GameRecord };
