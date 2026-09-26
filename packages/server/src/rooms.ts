/**
 * Salons de duel : deux sièges, une partie (GameHost sans IA), minuteur par décision,
 * déconnexions avec délai de retour, revanche. Le serveur fait autorité sur tout.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { buildDeck, CARDS, type DeckEntries, validateDeck } from "@mtgx/cards";
import { createGame, type Decision, fallbackDecision, type GameEvent, GameHost, type GameView, visibleFaces } from "@mtgx/engine";
import type { Clock, ErrorCode, RoomInfo, Seat, ServerMessage } from "./protocol";

/** Connexion d'un joueur (WebSocket en production, faux client dans les tests). */
export interface Peer {
  send(msg: ServerMessage): void;
}

export interface RoomConfig {
  /** Temps par décision (ms). */
  decisionMs: number;
  /** Corde affichée pendant la fin du temps (ms). */
  ropeMs: number;
  /** Expirations avant défaite. */
  maxTimeouts: number;
  /** Délai pour revenir après une déconnexion (ms). */
  graceMs: number;
  /** Suppression d'un salon vide ou terminé et abandonné (ms). */
  cleanupMs: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  decisionMs: 60_000,
  ropeMs: 20_000,
  maxTimeouts: 3,
  graceMs: 60_000,
  cleanupMs: 5 * 60_000,
};

/** Erreur destinée au client (message en français). */
export class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface SeatState {
  seat: Seat;
  name: string;
  deck: DeckEntries;
  token: string;
  peer: Peer | null;
  timeouts: number;
  rematch: boolean;
  /** Échéance de retour après une déconnexion (Date.now()), ou null si connecté. */
  graceDeadline: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

/** Codes sans caractères ambigus (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_DECK_LINES = 120;

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: suppression voulue des caractères de contrôle
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  if (!name) throw new ClientError("name", "Choisissez un pseudo.");
  return name;
}

/** Vérifie la forme et la légalité d'un deck reçu : légal en Standard et entièrement jouable. */
export function checkDeck(raw: unknown): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DECK_LINES) {
    throw new ClientError("deck", "Deck invalide.");
  }
  const deck: DeckEntries = [];
  for (const line of raw) {
    if (!Array.isArray(line) || line.length !== 2) throw new ClientError("deck", "Deck invalide.");
    const [n, name] = line as [unknown, unknown];
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 60 || typeof name !== "string") {
      throw new ClientError("deck", "Deck invalide.");
    }
    deck.push([n as number, name]);
  }
  const v = validateDeck({ main: deck }, CARDS);
  if (!v.legal) throw new ClientError("deck", `Deck refusé : ${v.errors[0] ?? "illégal en Standard"}.`);
  if (!v.playable) throw new ClientError("deck", "Deck refusé : il contient des cartes pas encore jouables.");
  return deck;
}

export class Room {
  readonly seats: SeatState[] = [];
  status: RoomInfo["status"] = "waiting";
  private host: GameHost | null = null;
  /** Mises à jour produites par la dernière action, envoyées avec le minuteur à jour. */
  private outbox = new Map<Seat, { view: GameView; events: GameEvent[] }>();
  private clock: { player: Seat; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  /** File des actions : une seule à la fois modifie la partie. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    private readonly onClose: (room: Room) => void,
  ) {}

  seatOf(token: string): SeatState | undefined {
    return this.seats.find((s) => s.token === token);
  }

  addPlayer(name: string, deck: DeckEntries, peer: Peer): SeatState {
    if (this.seats.length >= 2) throw new ClientError("full", "Ce salon est complet.");
    const seat: SeatState = {
      seat: this.seats.length === 0 ? "p1" : "p2",
      name,
      deck,
      token: randomUUID(),
      peer,
      timeouts: 0,
      rematch: false,
      graceDeadline: null,
      graceTimer: null,
    };
    this.seats.push(seat);
    this.cancelCleanup();
    this.broadcastRoom();
    if (this.seats.length === 2) this.enqueue(() => this.start());
    return seat;
  }

  // -------------------------------------------------------------------------
  // Partie
  // -------------------------------------------------------------------------

  private async start(): Promise<void> {
    for (const s of this.seats) {
      s.timeouts = 0;
      s.rematch = false;
    }
    const { state, events } = createGame({
      seed: randomInt(0, 2 ** 31),
      startingPlayer: this.seats[randomInt(0, 2)]?.seat,
      players: this.seats.map((s) => ({ id: s.seat, name: s.name, deck: buildDeck({ main: s.deck }) })),
    });
    this.status = "playing";
    this.host = new GameHost(state, { onUpdate: (p, view, evts) => this.buffer(p as Seat, view, evts) }, events);
    this.broadcastRoom();
    await this.host.run();
    this.afterStep();
  }

  private buffer(p: Seat, view: GameView, events: GameEvent[]): void {
    const prev = this.outbox.get(p);
    this.outbox.set(p, { view, events: [...(prev?.events ?? []), ...events] });
  }

  /** Après chaque action : minuteur, envoi des vues, fin de partie. */
  private afterStep(): void {
    const host = this.host;
    if (!host) return;
    const s = host.state;
    if (s.over) {
      this.stopClock();
      if (this.status !== "over") {
        this.status = "over";
        this.broadcastRoom();
      }
      this.scheduleCleanupIfIdle();
    } else if (s.pending) {
      // Chaque nouvelle décision a son temps plein (comme sur MTGA) ; une décision refusée ne relance rien.
      this.armClock(s.pending.player as Seat);
    }
    for (const [p, u] of this.outbox)
      this.sendTo(p, { type: "update", ...u, faces: visibleFaces(s, u.view, u.events), clock: this.clockInfo() });
    this.outbox.clear();
  }

  private clockInfo(): Clock | null {
    if (!this.clock) return null;
    return {
      player: this.clock.player,
      remainingMs: Math.max(0, this.clock.deadline - Date.now()),
      totalMs: this.config.decisionMs,
      ropeMs: this.config.ropeMs,
      timeouts: Object.fromEntries(this.seats.map((s) => [s.seat, s.timeouts])) as Record<Seat, number>,
      maxTimeouts: this.config.maxTimeouts,
    };
  }

  private armClock(player: Seat): void {
    this.stopClock();
    const timer = setTimeout(() => this.enqueue(() => this.expire(player)), this.config.decisionMs);
    timer.unref?.();
    this.clock = { player, deadline: Date.now() + this.config.decisionMs, timer };
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock.timer);
    this.clock = null;
  }

  /** Temps écoulé : décision par défaut ; défaite au-delà du nombre d'expirations permis. */
  private async expire(player: Seat): Promise<void> {
    const host = this.host;
    const seat = this.seats.find((s) => s.seat === player);
    const p = host?.state.pending;
    if (!host || !seat || host.state.over || p?.player !== player) return;
    seat.timeouts += 1;
    if (seat.timeouts >= this.config.maxTimeouts) {
      await host.submitHuman(player, { type: "concede" });
    } else {
      await host.submitHuman(player, fallbackDecision(host.state, p));
    }
    this.afterStep();
  }

  decide(seat: SeatState, d: Decision): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host || this.status !== "playing") throw new ClientError("state", "Aucune partie en cours.");
      const error = await host.submitHuman(seat.seat, d);
      if (error) {
        // Décision refusée : l'état n'a pas changé, le minuteur continue.
        seat.peer?.send({ type: "error", code: "rules", message: error });
        return;
      }
      this.afterStep();
    });
  }

  settings(seat: SeatState, settings: Parameters<GameHost["setSettings"]>[1]): Promise<void> {
    return this.enqueue(async () => {
      if (!this.host) return;
      this.host.setSettings(seat.seat, settings);
      if (this.status !== "playing") return;
      await this.host.run();
      this.afterStep();
    });
  }

  rematch(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "over") throw new ClientError("state", "La partie n'est pas terminée.");
      seat.rematch = true;
      this.broadcastRoom();
      if (this.seats.length === 2 && this.seats.every((s) => s.rematch && s.peer)) await this.start();
    });
  }

  // -------------------------------------------------------------------------
  // Connexions
  // -------------------------------------------------------------------------

  /** Reconnexion : vue complète et minuteur à jour. */
  reconnect(seat: SeatState, peer: Peer): void {
    seat.peer = peer;
    seat.graceDeadline = null;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    this.cancelCleanup();
    this.sendRoom(seat);
    if (this.host) {
      const view = this.host.view(seat.seat);
      peer.send({ type: "update", view, events: [], faces: visibleFaces(this.host.state, view, []), clock: this.clockInfo() });
    }
    this.sendOpponentStatus();
  }

  /** Connexion perdue : l'adversaire est prévenu ; sans retour à temps, défaite (ou salon supprimé). */
  disconnect(seat: SeatState): void {
    seat.peer = null;
    if (this.status === "playing") {
      seat.graceDeadline = Date.now() + this.config.graceMs;
      seat.graceTimer = setTimeout(() => this.enqueue(() => this.abandon(seat)), this.config.graceMs);
      seat.graceTimer.unref?.();
    }
    this.broadcastRoom();
    this.sendOpponentStatus();
    this.scheduleCleanupIfIdle();
  }

  /** Départ volontaire : abandon si la partie est en cours. */
  leave(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status === "waiting") {
        this.seats.splice(this.seats.indexOf(seat), 1);
        if (this.seats.length === 0) this.close();
        else this.broadcastRoom();
        return;
      }
      seat.peer = null;
      await this.abandon(seat);
      this.broadcastRoom();
      this.scheduleCleanupIfIdle();
    });
  }

  private async abandon(seat: SeatState): Promise<void> {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    if (!this.host || this.status !== "playing" || this.host.state.over) return;
    await this.host.submitHuman(seat.seat, { type: "concede" });
    this.afterStep();
  }

  private sendOpponentStatus(): void {
    for (const s of this.seats) {
      const other = this.seats.find((o) => o !== s);
      if (!other) continue;
      s.peer?.send({
        type: "opponent",
        connected: !!other.peer,
        remainingMs: other.graceDeadline ? Math.max(0, other.graceDeadline - Date.now()) : null,
      });
    }
  }

  private scheduleCleanupIfIdle(): void {
    const idle = this.seats.every((s) => !s.peer) && this.status !== "playing";
    if (!idle || this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => this.close(), this.config.cleanupMs);
    this.cleanupTimer.unref?.();
  }

  private cancelCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  close(): void {
    this.stopClock();
    this.cancelCleanup();
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
    this.onClose(this);
  }

  // -------------------------------------------------------------------------
  // Envois
  // -------------------------------------------------------------------------

  private sendTo(p: Seat, msg: ServerMessage): void {
    this.seats.find((s) => s.seat === p)?.peer?.send(msg);
  }

  private sendRoom(seat: SeatState): void {
    seat.peer?.send({
      type: "room",
      room: {
        code: this.code,
        seat: seat.seat,
        token: seat.token,
        status: this.status,
        players: this.seats.map((s) => ({ seat: s.seat, name: s.name, connected: !!s.peer, rematch: s.rematch })),
      },
    });
  }

  private broadcastRoom(): void {
    for (const s of this.seats) this.sendRoom(s);
  }

  /**
   * Exécute les actions une par une : une décision, une expiration et une déconnexion ne se
   * croisent jamais sur la même partie. Les erreurs client remontent à l'appelant.
   */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly config: RoomConfig = DEFAULT_CONFIG) {}

  get size(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) return code;
    }
  }

  create(name: unknown, deck: unknown, peer: Peer): { room: Room; seat: SeatState } {
    const n = cleanName(name);
    const d = checkDeck(deck);
    const room = new Room(this.newCode(), this.config, (r) => this.rooms.delete(r.code));
    this.rooms.set(room.code, room);
    return { room, seat: room.addPlayer(n, d, peer) };
  }

  join(code: unknown, name: unknown, deck: unknown, peer: Peer): { room: Room; seat: SeatState } {
    const room = this.rooms.get(
      String(code ?? "")
        .toUpperCase()
        .trim(),
    );
    if (!room) throw new ClientError("room", "Salon introuvable : vérifiez le code.");
    if (room.status !== "waiting" || room.seats.length >= 2) throw new ClientError("full", "Ce salon est complet.");
    return { room, seat: room.addPlayer(cleanName(name), checkDeck(deck), peer) };
  }

  byToken(token: unknown): { room: Room; seat: SeatState } | null {
    if (typeof token !== "string") return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatOf(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }
}
