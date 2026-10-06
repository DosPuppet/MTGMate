/**
 * Salons de deux à quatre joueurs (duel, multijoueur, Commander) : une partie (GameHost), minuteur par décision,
 * déconnexions avec délai de retour (un joueur qui ne revient pas abandonne : à plusieurs, la partie continue sans lui),
 * revanche, BO3 en duel. Le serveur fait autorité sur tout.
 */
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  buildGameDeck,
  CARDS,
  card,
  type DeckEntries,
  FORMAT_LABELS,
  isFormat,
  sideboardSwapError,
  validateDeck,
} from "@mtgx/cards";
import { hasPrinting } from "@mtgx/cards/printings";
import {
  createRecordedGame,
  type Decision,
  decider,
  type Format,
  fallbackDecision,
  type GameEvent,
  GameHost,
  type GameRecord,
  type GameState,
  type GameView,
  isGameRecord,
  outcomeHash,
  type PlayerId,
  RULES_VERSION,
  replayChecked,
  visibleFaces,
} from "@mtgx/engine";
import type { Clock, ErrorCode, MatchInfo, RoomInfo, Seat, ServerMessage } from "./protocol";

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
  /** Fermeture d'un salon resté sans adversaire (ms). */
  waitingMs: number;
  /** Nombre maximal de salons ouverts sur le serveur. */
  maxRooms: number;
  /** Salons ouverts au plus par adresse IP de créateur (un salon abandonné reste ouvert quelques minutes). */
  maxRoomsPerIp: number;
  /**
   * Dossier de sauvegarde des parties (un fichier par salon : en-tête, puis une décision par ligne). Au démarrage, les
   * parties en cours y sont reprises : un redémarrage du serveur ne les coupe plus. Absent : parties en mémoire seulement.
   */
  dataDir?: string;
  /**
   * Tas JavaScript (Mo) au-delà duquel aucun salon n'est plus créé : le serveur refuse avant que pm2 ne le redémarre
   * (`max_memory_restart`). Un salon de partie en cours occupe de 0,2 à 0,3 Mo de tas (`tools/load-test.ts`).
   */
  maxHeapMb?: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  decisionMs: 60_000,
  ropeMs: 20_000,
  maxTimeouts: 3,
  graceMs: 60_000,
  cleanupMs: 5 * 60_000,
  waitingMs: 30 * 60_000,
  maxRooms: 200,
  maxRoomsPerIp: 4,
  maxHeapMb: 384,
};

/** Empreinte d'un secret (jeton de reconnexion, adresse) : seule elle est écrite sur le disque. */
export const digest = (x: string): string => createHash("sha256").update(x).digest("hex");

/**
 * Clé d'une adresse pour les plafonds : l'adresse IPv4, ou le préfixe /64 d'une adresse IPv6 (un abonné en reçoit
 * souvent un /64 entier, et changer d'adresse ne doit pas contourner les plafonds).
 */
export function ipKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1] as string;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("%")[0]?.split("::") ?? [];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Fichiers mis de côté (`.bad`, `.rules<N>`) et jetons interrompus gardés au plus ce temps. */
const KEEP_ASIDE_MS = 7 * 24 * 3_600_000;
/** Fichier des jetons interrompus par une mise à jour des règles (empreintes, date). */
const INTERRUPTED_FILE = "interrupted.json";

/** Erreur destinée au client (message en français). */
export class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Première ligne du fichier d'un salon : les sièges (jetons de reconnexion compris) et l'enregistrement de la partie. */
/** Partie sauvegardée par une autre version des règles du moteur, qui ne se rejoue plus à l'identique. */
export class RulesChangedError extends Error {
  constructor(readonly rules: number) {
    super(`partie enregistrée avec la version ${rules} des règles (moteur : ${RULES_VERSION})`);
  }
}

interface SavedRoom {
  code: string;
  seats: {
    seat: Seat;
    name: string;
    deck: DeckEntries;
    side?: DeckEntries;
    /** Commander : le commandant du joueur. */
    commander?: DeckEntries;
    original?: { main: DeckEntries; sideboard: DeckEntries };
    /** Empreinte du jeton de reconnexion (`digest`) ; anciennes sauvegardes : le jeton lui-même. */
    tokenHash?: string;
    token?: string;
  }[];
  /** Empreinte de la clé d'adresse du créateur (plafond par adresse, compté aussi après une reprise). */
  creator?: string;
  record: GameRecord;
  /** Match au début de cette manche (victoires des manches précédentes). */
  match?: MatchInfo;
}

interface SeatState {
  seat: Seat;
  name: string;
  /** Deck et réserve de la manche en cours (modifiables entre les manches d'un BO3). */
  deck: DeckEntries;
  side: DeckEntries;
  /** Commander : le commandant (vide hors Commander). */
  commander: DeckEntries;
  /** Deck et réserve du début du match : un échange de réserve doit garder les mêmes cartes. */
  original: { main: DeckEntries; sideboard: DeckEntries };
  /** Entre deux manches : réserve validée, prêt pour la suivante. */
  ready: boolean;
  /** Jeton de reconnexion : connu en mémoire, vide après une reprise tant que le joueur n'est pas revenu. */
  token: string;
  tokenHash: string;
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

/** Réserve reçue (facultative) : même forme qu'un deck ; le deck complet (deck et réserve) doit être légal dans le format. */
export function checkSide(main: DeckEntries, raw: unknown, format: Format = "standard"): DeckEntries {
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return [];
  const side = checkEntries(raw);
  const v = validateDeck({ main, sideboard: side }, CARDS, format);
  if (!v.legal) throw new ClientError("deck", `Réserve refusée : ${v.errors[0] ?? `illégale en ${FORMAT_LABELS[format]}`}.`);
  return side;
}

/** Lignes de deck reçues : [nombre, nom, impression ?], forme vérifiée. */
function checkEntries(raw: unknown): DeckEntries {
  if (!Array.isArray(raw) || raw.length > MAX_DECK_LINES) throw new ClientError("deck", "Deck invalide.");
  const out: DeckEntries = [];
  for (const line of raw) {
    if (!Array.isArray(line) || (line.length !== 2 && line.length !== 3)) throw new ClientError("deck", "Deck invalide.");
    const [n, name, key] = line as [unknown, unknown, unknown];
    // Au plus 100 exemplaires sur une ligne (Commander : 99 terrains de base possibles).
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 100 || typeof name !== "string") {
      throw new ClientError("deck", "Deck invalide.");
    }
    if (key !== undefined && key !== null && (typeof key !== "string" || key.length > 64)) {
      throw new ClientError("deck", "Deck invalide.");
    }
    // Une impression que la carte n'a pas (table des impressions plus ancienne ou plus récente que le client) : la
    // carte garde son illustration. Le moteur ne vérifie pas les clés de la table : c'est fait ici.
    const c = CARDS[name];
    const printed = typeof key === "string" && c && hasPrinting(c, key);
    out.push(printed ? [n as number, name, key] : [n as number, name]);
  }
  return out;
}

/** Commander reçu : une ou deux lignes de deck (sa légalité est vérifiée avec le deck). */
function checkCommander(raw: unknown): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2) throw new ClientError("deck", "Choisissez un commandant.");
  return checkEntries(raw);
}

/**
 * Vérifie la forme et la légalité d'un deck reçu : légal dans le format du salon et entièrement jouable. Commander :
 * avec son commandant (`commander`).
 */
export function checkDeck(raw: unknown, format: Format = "standard", commander?: DeckEntries): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0) throw new ClientError("deck", "Deck invalide.");
  const deck = checkEntries(raw);
  const v = validateDeck({ main: deck, ...(commander ? { commander } : {}) }, CARDS, format);
  if (!v.legal) throw new ClientError("deck", `Deck refusé : ${v.errors[0] ?? `illégal en ${FORMAT_LABELS[format]}`}.`);
  if (!v.playable) throw new ClientError("deck", "Deck refusé : il contient des cartes pas encore jouables.");
  return deck;
}

export class Room {
  readonly seats: SeatState[] = [];
  status: RoomInfo["status"] = "waiting";
  /** Match : BO1 ou BO3, victoires, manche en cours. */
  match: MatchInfo = { bestOf: 1, wins: { p1: 0, p2: 0 }, game: 0, winner: null };
  /** Nombre de joueurs du salon (2 à 4). */
  get size(): number {
    return this.match.seats ?? 2;
  }
  /** Joueur qui commence la prochaine manche (le perdant de la précédente) ; null : tirage au sort. */
  private nextStarter: Seat | null = null;
  private host: GameHost | null = null;
  /** Mises à jour produites par la dernière action, envoyées avec le minuteur à jour. */
  /** Mises à jour en attente d'envoi, par joueur et dans l'ordre (une par résolution). */
  private outbox = new Map<Seat, { view: GameView; events: GameEvent[] }[]>();
  private clock: { player: Seat; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  /** File des actions : une seule à la fois modifie la partie. */
  private queue: Promise<void> = Promise.resolve();

  private waitingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    private readonly onClose: (room: Room) => void,
  ) {
    // Personne ne rejoint : le salon est fermé et son créateur prévenu.
    this.waitingTimer = setTimeout(() => {
      if (this.status !== "waiting") return;
      for (const s of this.seats)
        s.peer?.send({ type: "error", code: "closed", message: "Salon fermé : aucun adversaire ne l'a rejoint à temps." });
      this.close();
    }, config.waitingMs);
    this.waitingTimer.unref?.();
  }

  /** Empreinte de la clé d'adresse du créateur (plafond par adresse). */
  creator: string | undefined;

  seatOf(token: string): SeatState | undefined {
    const h = digest(token);
    const seat = this.seats.find((s) => s.tokenHash === h);
    // Après une reprise, le jeton n'est connu que par son empreinte : celui présenté est le bon.
    if (seat) seat.token = token;
    return seat;
  }

  addPlayer(name: string, deck: DeckEntries, peer: Peer, side: DeckEntries = [], commander: DeckEntries = []): SeatState {
    if (this.seats.length >= this.size) throw new ClientError("full", "Ce salon est complet.");
    // Premier siège libre (un joueur parti avant le début libère le sien).
    const taken = new Set(this.seats.map((s) => s.seat));
    const free = (["p1", "p2", "p3", "p4"] as Seat[]).find((x) => !taken.has(x)) as Seat;
    const seat: SeatState = {
      seat: free,
      name,
      deck,
      side,
      commander,
      original: { main: deck, sideboard: side },
      ready: false,
      token: "",
      tokenHash: "",
      peer,
      timeouts: 0,
      rematch: false,
      graceDeadline: null,
      graceTimer: null,
    };
    seat.token = randomUUID();
    seat.tokenHash = digest(seat.token);
    this.seats.push(seat);
    this.seats.sort((a, b) => (a.seat < b.seat ? -1 : 1));
    this.cancelCleanup();
    this.broadcastRoom();
    if (this.seats.length === this.size) this.enqueue(() => this.start());
    return seat;
  }

  // -------------------------------------------------------------------------
  // Partie
  // -------------------------------------------------------------------------

  private async start(): Promise<void> {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
    for (const s of this.seats) {
      s.timeouts = 0;
      s.rematch = false;
      s.ready = false;
    }
    this.match = { ...this.match, game: this.match.game + 1 };
    // Première manche : tirage au sort ; ensuite, le perdant de la manche précédente commence.
    const starter = this.nextStarter ?? this.seats[randomInt(0, this.seats.length)]?.seat;
    const commander = this.match.format === "commander";
    const { state, events, record } = createRecordedGame({
      seed: randomInt(0, 2 ** 31),
      startingPlayer: starter,
      ...(commander ? { variant: "commander" as const } : {}),
      players: this.seats.map((s) => {
        // Commander : le commandant en tête du deck, désigné par son indice.
        const built = buildGameDeck({ main: s.deck, ...(commander ? { commander: s.commander } : {}) });
        return {
          id: s.seat,
          name: s.name,
          deck: built.deck,
          ...(built.printings ? { printings: built.printings } : {}),
          ...(built.commanders ? { commanders: built.commanders } : {}),
        };
      }),
    });
    this.status = "playing";
    this.saveHeader(record);
    const host = this.newHost(state, record, events);
    this.host = host;
    this.broadcastRoom();
    await this.advancing(host, () => host.run());
  }

  /**
   * Exécute une action sur la partie, puis minuteur et envois si l'état a changé, même si l'action a échoué
   * en cours de route (erreur interne) : une partie ne doit jamais rester sans minuteur. Une décision refusée
   * ne change pas l'état et ne relance donc pas le minuteur.
   */
  private async advancing(host: GameHost, fn: () => Promise<void>): Promise<void> {
    const before = host.state;
    try {
      await fn();
    } catch (e) {
      console.error(`Salon ${this.code} : erreur interne`, e);
      throw e;
    } finally {
      if (host.state !== before || this.outbox.size) this.afterStep();
    }
  }

  /** Hôte d'une partie enregistrée : chaque décision est ajoutée au fichier du salon. */
  private newHost(state: GameHost["state"], record: GameRecord, events: GameEvent[]): GameHost {
    return new GameHost(
      state,
      {
        // Une mise à jour par résolution : l'interface montre chaque effet l'un après l'autre.
        frames: true,
        onUpdate: (p, view, evts) => this.buffer(p as Seat, view, evts),
        record,
        onRecord: (p, d, after) => this.appendDecision(p, d, after),
      },
      events,
    );
  }

  // -------------------------------------------------------------------------
  // Sauvegarde sur disque
  // -------------------------------------------------------------------------

  private get file(): string | null {
    return this.config.dataDir ? join(this.config.dataDir, `${this.code}.jsonl`) : null;
  }

  private saveHeader(record: GameRecord): void {
    const file = this.file;
    if (!file || !this.config.dataDir) return;
    try {
      mkdirSync(this.config.dataDir, { recursive: true, mode: 0o700 });
      const saved: SavedRoom = {
        code: this.code,
        seats: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          deck: s.deck,
          side: s.side,
          ...(s.commander.length ? { commander: s.commander } : {}),
          original: s.original,
          tokenHash: s.tokenHash,
        })),
        ...(this.creator ? { creator: this.creator } : {}),
        record: { ...record, decisions: [], checkpoints: [] },
        match: this.match,
      };
      // Lisible par le seul compte du serveur : la sauvegarde révèle les decks.
      writeFileSync(file, `${JSON.stringify(saved)}\n`, { mode: 0o600 });
    } catch (e) {
      console.error(`Salon ${this.code} : sauvegarde impossible`, e);
    }
  }

  /** Une ligne par décision : [joueur, décision, empreinte de l'état obtenu] (vérifiée à la reprise). */
  private appendDecision(player: PlayerId, d: Decision, after: GameState): void {
    const file = this.file;
    if (!file) return;
    try {
      appendFileSync(file, `${JSON.stringify([player, d, outcomeHash(after)])}\n`);
    } catch (e) {
      console.error(`Salon ${this.code} : sauvegarde impossible`, e);
    }
  }

  /**
   * Reprise d'un salon sauvegardé (redémarrage du serveur) : la partie est rejouée depuis son enregistrement, les deux
   * joueurs sont considérés comme déconnectés (délai de retour ordinaire) et reviennent avec leur jeton.
   */
  static restore(
    saved: SavedRoom,
    decisions: [PlayerId, Decision][],
    checkpoints: [number, string][],
    config: RoomConfig,
    onClose: (room: Room) => void,
  ): Room {
    const record: GameRecord = { ...saved.record, decisions, checkpoints };
    const { state, divergence } = replayChecked(record, card);
    const rules = saved.record.rules ?? 0;
    if (rules !== RULES_VERSION) {
      // Autre version des règles : la partie ne reprend que si chaque décision a son empreinte, et qu'elles concordent.
      if (divergence || checkpoints.length < decisions.length) throw new RulesChangedError(rules);
    } else if (divergence) {
      throw new Error(`rejeu différent de la partie jouée (${divergence.message}) : moteur non déterministe ?`);
    }
    const room = new Room(saved.code, config, onClose);
    room.creator = saved.creator;
    for (const { token, tokenHash, ...s } of saved.seats) {
      room.seats.push({
        ...s,
        token: "",
        tokenHash: tokenHash ?? digest(token ?? ""),
        side: s.side ?? [],
        commander: s.commander ?? [],
        original: s.original ?? { main: s.deck, sideboard: s.side ?? [] },
        ready: false,
        peer: null,
        timeouts: 0,
        rematch: false,
        graceDeadline: null,
        graceTimer: null,
      });
    }
    if (saved.match) room.match = saved.match;
    room.host = room.newHost(state, record, []);
    // Manche terminée avant l'arrêt : sa victoire est comptée par `afterStep` (passage « en cours » → « terminée »).
    room.status = "playing";
    if (room.waitingTimer) clearTimeout(room.waitingTimer);
    room.waitingTimer = null;
    for (const seat of room.seats) room.disconnect(seat);
    room.afterStep();
    return room;
  }

  private buffer(p: Seat, view: GameView, events: GameEvent[]): void {
    this.outbox.set(p, [...(this.outbox.get(p) ?? []), { view, events }]);
  }

  /** Après chaque action : minuteur, envoi des vues, fin de partie. */
  private afterStep(): void {
    const host = this.host;
    if (!host) return;
    const s = host.state;
    if (s.over) {
      this.stopClock();
      if (this.status === "playing") {
        this.finishGame(s.winner as Seat | null);
        this.broadcastRoom();
      }
      this.scheduleCleanupIfIdle();
    } else if (s.pending) {
      // Chaque nouvelle décision a son temps plein (comme sur MTGA) ; une décision refusée ne relance rien.
      // 722 : pendant un tour contrôlé, c'est le contrôleur qui décide.
      this.armClock((decider(s) ?? s.pending.player) as Seat);
    }
    for (const [p, frames] of this.outbox)
      for (const u of frames)
        this.sendTo(p, { type: "update", ...u, faces: visibleFaces(s, u.view, u.events), clock: this.clockInfo() });
    this.outbox.clear();
  }

  /**
   * Fin d'une manche : victoire comptée ; en BO3, tant que personne n'a deux victoires, les joueurs ajustent leur deck
   * avec leur réserve (statut `sideboard`), et le perdant commencera la manche suivante.
   */
  private finishGame(winner: Seat | null): void {
    const wins = { ...this.match.wins };
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    // À plusieurs : une seule manche, le vainqueur de la partie gagne le match.
    if (this.size > 2) {
      this.match = { ...this.match, wins, winner };
      this.nextStarter = null;
      this.status = "over";
      return;
    }
    const need = Math.ceil(this.match.bestOf / 2);
    const w1 = wins.p1 ?? 0;
    const w2 = wins.p2 ?? 0;
    // Au plus trois manches (une partie nulle compte comme une manche jouée).
    const decided = w1 >= need || w2 >= need || this.match.game >= this.match.bestOf;
    const matchWinner = decided ? (w1 > w2 ? "p1" : w2 > w1 ? "p2" : null) : null;
    this.match = { ...this.match, wins, winner: matchWinner };
    this.nextStarter = winner ? (winner === "p1" ? "p2" : "p1") : null;
    this.status = decided ? "over" : "sideboard";
  }

  /** Entre deux manches : deck et réserve pour la suivante (mêmes cartes au total, deck légal), puis prêt. */
  sideboard(seat: SeatState, main: unknown, side: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "sideboard") throw new ClientError("state", "Pas de réserve à ajuster maintenant.");
      const next = { main: checkEntries(main), sideboard: checkEntries(side) };
      const error = sideboardSwapError(seat.original, next, CARDS, this.match.format);
      if (error) throw new ClientError("deck", error);
      seat.deck = next.main;
      seat.side = next.sideboard;
      seat.ready = true;
      this.broadcastRoom();
      if (this.seats.length === 2 && this.seats.every((s) => s.ready)) await this.start();
    });
  }

  private clockInfo(): Clock | null {
    if (!this.clock) return null;
    return {
      player: this.clock.player,
      remainingMs: Math.max(0, this.clock.deadline - Date.now()),
      totalMs: this.config.decisionMs,
      ropeMs: this.config.ropeMs,
      timeouts: Object.fromEntries(this.seats.map((s) => [s.seat, s.timeouts])) as Partial<Record<Seat, number>>,
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
    if (!host || !seat || host.state.over || !p || decider(host.state) !== player) return;
    seat.timeouts += 1;
    await this.advancing(host, async () => {
      // Une décision par défaut qui échouerait (erreur du moteur) ne doit pas laisser la partie sans issue.
      let played = false;
      if (seat.timeouts < this.config.maxTimeouts) {
        try {
          played = (await host.submitHuman(player, fallbackDecision(host.state, p))) === null;
        } catch (e) {
          console.error(`Salon ${this.code} : décision par défaut impossible`, e);
        }
      }
      if (!played && !host.state.over && host.state.pending === p) await host.submitHuman(player, { type: "concede" });
    });
  }

  /** Enregistrement de la partie, seulement si elle est terminée (il révèle les decks et la graine). */
  exportRecord(): GameRecord | null {
    const host = this.host;
    return host?.state.over && host.record ? structuredClone(host.record) : null;
  }

  decide(seat: SeatState, d: Decision): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host || this.status !== "playing") throw new ClientError("state", "Aucune partie en cours.");
      await this.advancing(host, async () => {
        const error = await host.submitHuman(seat.seat, d);
        // Décision refusée : l'état n'a pas changé, le minuteur continue.
        if (error) seat.peer?.send({ type: "error", code: "rules", message: error });
      });
    });
  }

  settings(seat: SeatState, settings: Parameters<GameHost["setSettings"]>[1]): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host) return;
      host.setSettings(seat.seat, settings);
      if (this.status !== "playing") return;
      await this.advancing(host, () => host.run());
    });
  }

  rematch(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "over") throw new ClientError("state", "La partie n'est pas terminée.");
      seat.rematch = true;
      this.broadcastRoom();
      if (this.seats.length === this.size && this.seats.every((s) => s.rematch && s.peer)) {
        // Nouveau match : score à zéro, decks d'origine.
        this.match = { ...this.match, wins: {}, game: 0, winner: null };
        this.nextStarter = null;
        for (const s of this.seats) {
          s.deck = s.original.main;
          s.side = s.original.sideboard;
        }
        await this.start();
      }
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

  /** Connexion perdue : les autres sont prévenus ; sans retour à temps, défaite (ou salon supprimé). */
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
      // Entre deux manches d'un BO3 : partir, c'est concéder le match.
      if (this.status === "sideboard") {
        const other = this.seats.find((s) => s !== seat)?.seat ?? null;
        this.match = { ...this.match, winner: other };
        this.status = "over";
      }
      await this.abandon(seat);
      this.broadcastRoom();
      this.scheduleCleanupIfIdle();
    });
  }

  private async abandon(seat: SeatState): Promise<void> {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    const host = this.host;
    if (!host || this.status !== "playing" || host.state.over) return;
    await this.advancing(host, async () => {
      await host.submitHuman(seat.seat, { type: "concede" });
    });
  }

  /** Duel : l'état de connexion de l'adversaire (à plusieurs, `RoomInfo.players` le donne pour chacun). */
  private sendOpponentStatus(): void {
    if (this.size > 2) return;
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

  /** Fermeture définitive du salon : son fichier de sauvegarde disparaît. */
  close(): void {
    this.shutdown();
    const file = this.file;
    if (file) rmSync(file, { force: true });
    this.onClose(this);
  }

  /** Arrêt du serveur : les minuteurs s'arrêtent, la sauvegarde reste (la partie sera reprise au redémarrage). */
  shutdown(): void {
    this.stopClock();
    this.cancelCleanup();
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
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
        players: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          connected: !!s.peer,
          rematch: s.rematch,
          ready: s.ready,
        })),
        match: this.match,
        deck: { main: seat.deck, sideboard: seat.side, ...(seat.commander.length ? { commander: seat.commander } : {}) },
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
  /**
   * Empreintes des jetons des joueurs dont la partie a été interrompue par une mise à jour des règles, avec leur date :
   * gardées dans `interrupted.json` pour qu'un joueur l'apprenne même après un second redémarrage.
   */
  private readonly interrupted = new Map<string, number>();

  constructor(private readonly config: RoomConfig = DEFAULT_CONFIG) {
    if (config.dataDir) this.restore(config.dataDir);
  }

  /** Salons ouverts par cette adresse (empreinte de sa clé), reprises comprises. */
  private openedBy(creator: string): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.creator === creator) n++;
    return n;
  }

  private saveInterrupted(dir: string): void {
    try {
      writeFileSync(join(dir, INTERRUPTED_FILE), JSON.stringify(Object.fromEntries(this.interrupted)), { mode: 0o600 });
    } catch (e) {
      console.error("Jetons interrompus : sauvegarde impossible", e);
    }
  }

  /**
   * Reprend les parties sauvegardées ; un fichier illisible est mis de côté (`.bad`) sans bloquer le démarrage. Les
   * fichiers mis de côté et les jetons interrompus de plus de sept jours disparaissent. Au plus `maxRooms` salons, les plus
   * récents : un serveur redémarré pour manque de mémoire ne doit pas reprendre plus qu'il ne peut tenir.
   */
  private restore(dir: string): void {
    if (!existsSync(dir)) return;
    const now = Date.now();
    try {
      const raw = JSON.parse(readFileSync(join(dir, INTERRUPTED_FILE), "utf8")) as Record<string, number>;
      for (const [h, at] of Object.entries(raw))
        if (typeof at === "number" && now - at < KEEP_ASIDE_MS) this.interrupted.set(h, at);
    } catch {
      // Pas encore de fichier (ou illisible) : aucun jeton interrompu connu.
    }
    for (const name of readdirSync(dir).filter((f) => /\.jsonl\.(?:bad|rules\d+)$/.test(f))) {
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > KEEP_ASIDE_MS) rmSync(file, { force: true });
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of files.slice(this.config.maxRooms)) {
      console.warn(`Sauvegarde ${name} non reprise (plafond de ${this.config.maxRooms} salons), mise de côté`);
      renameSync(join(dir, name), join(dir, `${name}.bad`));
    }
    for (const { name } of files.slice(0, this.config.maxRooms)) {
      const file = join(dir, name);
      let saved: SavedRoom | null = null;
      try {
        const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
        saved = JSON.parse(head ?? "null") as SavedRoom;
        const rows = lines.map((l) => JSON.parse(l) as [PlayerId, Decision, string?]);
        const decisions = rows.map(([p, d]): [PlayerId, Decision] => [p, d]);
        const checkpoints = rows.flatMap(([, , h], i): [number, string][] => (typeof h === "string" ? [[i + 1, h]] : []));
        if (!saved?.code || !Array.isArray(saved.seats) || !isGameRecord({ ...saved.record, decisions }))
          throw new Error("format inconnu");
        const room = Room.restore(saved, decisions, checkpoints, this.config, (r) => this.rooms.delete(r.code));
        this.rooms.set(room.code, room);
        console.log(`Salon ${room.code} repris (${decisions.length} décisions)`);
      } catch (e) {
        if (e instanceof RulesChangedError && saved) {
          // Mise à jour du moteur : la partie est interrompue ; ses joueurs l'apprennent en revenant.
          for (const s of saved.seats) this.interrupted.set(s.tokenHash ?? digest(s.token ?? ""), now);
          console.warn(`Salon ${saved.code} interrompu par la mise à jour des règles : ${e.message}`);
          renameSync(file, `${file}.rules${e.rules}`);
        } else {
          console.error(`Sauvegarde ${name} illisible, mise de côté :`, e);
          renameSync(file, `${file}.bad`);
        }
      }
    }
    this.saveInterrupted(dir);
  }

  /** La partie de ce jeton a-t-elle été interrompue par une mise à jour des règles du moteur ? */
  wasInterrupted(token: unknown): boolean {
    return typeof token === "string" && this.interrupted.has(digest(token));
  }

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

  create(
    name: unknown,
    deck: unknown,
    peer: Peer,
    opts: {
      sideboard?: unknown;
      bestOf?: unknown;
      format?: unknown;
      players?: unknown;
      commander?: unknown;
      ip?: string;
    } = {},
  ): { room: Room; seat: SeatState } {
    const n = cleanName(name);
    const format: Format = isFormat(opts.format) || opts.format === "commander" ? (opts.format as Format) : "standard";
    const players = opts.players === 3 || opts.players === 4 ? opts.players : 2;
    const commander = format === "commander" ? checkCommander(opts.commander) : [];
    const d = checkDeck(deck, format, format === "commander" ? commander : undefined);
    // Pas de réserve en Commander.
    const side = format === "commander" ? [] : checkSide(d, opts.sideboard, format);
    if (this.rooms.size >= this.config.maxRooms) throw new ClientError("busy", "Serveur complet, réessayez plus tard.");
    // Mémoire : refuser un salon plutôt que de laisser pm2 redémarrer le serveur (et couper toutes les parties).
    const heapMb = process.memoryUsage().heapUsed / 1_048_576;
    if (this.config.maxHeapMb && heapMb > this.config.maxHeapMb)
      throw new ClientError("busy", "Serveur complet, réessayez plus tard.");
    // Créer puis abandonner des salons en boucle ne doit pas occuper toutes les places du serveur.
    const creator = opts.ip ? digest(ipKey(opts.ip)) : undefined;
    if (creator && this.openedBy(creator) >= this.config.maxRoomsPerIp)
      throw new ClientError("busy", "Trop de salons ouverts depuis cette adresse : fermez-en un avant d'en créer un autre.");
    const room = new Room(this.newCode(), this.config, (r) => this.rooms.delete(r.code));
    room.creator = creator;
    // Le BO3 n'existe qu'en duel, hors Commander.
    const bestOf = opts.bestOf === 3 && players === 2 && format !== "commander" ? 3 : 1;
    room.match = {
      ...room.match,
      bestOf,
      ...(format !== "standard" ? { format } : {}),
      ...(players > 2 ? { seats: players, wins: {} } : {}),
    };
    this.rooms.set(room.code, room);
    return { room, seat: room.addPlayer(n, d, peer, side, commander) };
  }

  join(
    code: unknown,
    name: unknown,
    deck: unknown,
    peer: Peer,
    sideboard?: unknown,
    commanderRaw?: unknown,
  ): { room: Room; seat: SeatState } {
    const room = this.rooms.get(
      String(code ?? "")
        .toUpperCase()
        .trim(),
    );
    if (!room) throw new ClientError("room", "Salon introuvable : vérifiez le code.");
    if (room.status !== "waiting" || room.seats.length >= room.size) throw new ClientError("full", "Ce salon est complet.");
    // Le deck doit être légal dans le format choisi par le créateur du salon.
    const format = room.match.format ?? "standard";
    const commander = format === "commander" ? checkCommander(commanderRaw) : [];
    const d = checkDeck(deck, format, format === "commander" ? commander : undefined);
    const side = format === "commander" ? [] : checkSide(d, sideboard, format);
    return { room, seat: room.addPlayer(cleanName(name), d, peer, side, commander) };
  }

  byToken(token: unknown): { room: Room; seat: SeatState } | null {
    if (typeof token !== "string") return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatOf(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** Arrêt du serveur : les salons s'arrêtent sans effacer leur sauvegarde. */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.shutdown();
    this.rooms.clear();
  }
}
