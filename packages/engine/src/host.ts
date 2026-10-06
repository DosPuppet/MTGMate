/**
 * GameHost : fait tourner une partie en consultant, pour chaque décision en attente,
 * l'IA du joueur, puis l'autopilot, puis l'humain. Le même hôte tourne dans un Web Worker
 * (partie contre l'IA) ou dans un serveur Node (partie en ligne).
 */

import { type AutopilotSettings, autopilotDecision, DEFAULT_AUTOPILOT } from "./autopilot";
import { drawByLoop, submit } from "./game";
import { MAX_AUTOMATIC_DECISIONS } from "./limits";
import { type GameRecord, recordDecision } from "./record";
import { RulesError } from "./stack";
import { decider } from "./state";
import { forcedAttacks, requiredBlocks } from "./turn";
import type { Decision, GameEvent, GameState, PendingDecision, PlayerId } from "./types";
import { filterEvents, type GameView, projectView } from "./view";

/** Une IA : reçoit l'état complet et renvoie une décision (elle ne doit lire que l'information publique). */
export type Agent = (state: GameState, player: PlayerId) => Decision;
/**
 * Une IA qui réfléchit ailleurs (serveur : dans un worker, PLAN-E E14) : sa décision arrive plus tard ; l'hôte l'attend
 * avant de continuer.
 */
export type AsyncAgent = (state: GameState, player: PlayerId) => Decision | Promise<Decision>;

export interface HostOptions {
  agents?: Partial<Record<PlayerId, Agent | AsyncAgent>>;
  /** Appelé pour chaque joueur humain quand sa vue change. */
  onUpdate?: (player: PlayerId, view: GameView, events: GameEvent[]) => void;
  /** Pause entre deux actions visibles de l'IA (ms), pour que l'humain puisse suivre. */
  aiDelay?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Consulté avant chaque décision d'une IA : une promesse la fait attendre (le tutoriel met l'adversaire
   * en pause pendant une explication), null la laisse jouer.
   */
  gate?: () => Promise<void> | null;
  /** Enregistrement de la partie (`createRecordedGame`) : chaque décision appliquée y est ajoutée. */
  record?: GameRecord;
  /** Écart entre deux points de contrôle de l'enregistrement (`CHECKPOINT_EVERY` par défaut). */
  checkpointEvery?: number;
  /** Appelé après chaque décision enregistrée (serveur : écriture sur disque). */
  onRecord?: (player: PlayerId, d: Decision, after: GameState) => void;
  /**
   * Une mise à jour par étape de la pile (élément ajouté, puis résolu, contrecarré ou sans cible légale), au lieu d'une
   * seule à la fin d'une suite de décisions automatiques : l'interface montre chaque effet l'un après l'autre.
   */
  frames?: boolean;
}

/**
 * Événements qui terminent une étape visible de la partie : un élément arrive sur la pile (l'interface le montre avant
 * qu'il se résolve) ou la quitte (résolu, contrecarré, sans cible légale).
 */
const FRAME_EVENTS = new Set<GameEvent["type"]>(["cast", "activate", "trigger", "copy", "resolve", "fizzle", "countered"]);

/** Décision de repli si une IA renvoie une décision illégale. */
export function fallbackDecision(s: GameState, p: PendingDecision): Decision {
  const hand = s.players[p.player]?.hand ?? [];
  switch (p.kind) {
    case "mulligan":
      return { type: "keep" };
    case "bottomCards":
      return { type: "bottom", cards: hand.slice(0, p.count) };
    case "discard":
      return { type: "discard", cards: hand.slice(0, p.count) };
    case "declareAttackers":
      // Les créatures qui doivent attaquer si possible attaquent (un défenseur sans taxe d'attaque).
      return { type: "declareAttackers", attackers: forcedAttacks(s, p.player) };
    case "declareBlockers":
      return { type: "declareBlockers", blocks: requiredBlocks(s, p.player) };
    case "priority":
      return { type: "pass" };
    case "choice":
      return { type: "choose", values: p.request.suggested };
  }
}

export class GameHost {
  state: GameState;
  readonly settings: Record<PlayerId, AutopilotSettings> = {};
  private readonly opts: HostOptions;
  private pendingEvents: GameEvent[] = [];
  private running = false;
  /** Moment où la dernière action visible de l'IA a été montrée (Date.now()). */
  private shownAt = 0;

  constructor(state: GameState, opts: HostOptions = {}, initialEvents: GameEvent[] = []) {
    this.state = state;
    this.opts = opts;
    this.pendingEvents = [...initialEvents];
    for (const p of state.playerOrder) this.settings[p] = structuredClone(DEFAULT_AUTOPILOT);
  }

  isHuman(p: PlayerId): boolean {
    return !this.opts.agents?.[p];
  }

  view(p: PlayerId): GameView {
    return projectView(this.state, p);
  }

  setSettings(p: PlayerId, settings: Partial<AutopilotSettings>): void {
    this.settings[p] = { ...(this.settings[p] ?? DEFAULT_AUTOPILOT), ...settings };
  }

  private apply(player: PlayerId, d: Decision): void {
    const { state, events } = submit(this.state, player, d);
    this.state = state;
    this.pendingEvents.push(...events);
    // Mode « étapes » : une résolution est envoyée tout de suite, avant les décisions automatiques suivantes.
    if (this.opts.frames && events.some((e) => FRAME_EVENTS.has(e.type))) this.flush(true);
    // Seules les décisions acceptées sont enregistrées : le rejeu redonne exactement cet état.
    if (this.opts.record) recordDecision(this.opts.record, player, d, state, this.opts.checkpointEvery);
    this.opts.onRecord?.(player, d, state);
  }

  /** Enregistrement de la partie (null si elle n'est pas enregistrée : tutoriel, bac à sable). */
  get record(): GameRecord | null {
    return this.opts.record ?? null;
  }

  /**
   * Envoie la vue et les événements accumulés à chaque humain. `interim` : étape intermédiaire (une résolution au milieu
   * de décisions automatiques) ; sa décision en attente est retirée, l'automatisme l'ayant peut-être déjà prise.
   */
  private flush(interim = false): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const p of this.state.playerOrder) {
      if (!this.isHuman(p)) continue;
      const view = this.view(p);
      this.opts.onUpdate?.(p, interim ? { ...view, pending: null } : view, filterEvents(events, p));
    }
  }

  /** La décision en attente est celle d'un humain que l'automatisme va prendre lui-même. */
  private autopilotNext(): boolean {
    const p = this.state.pending;
    if (!p || this.state.over) return false;
    const who = decider(this.state) ?? p.player;
    if (this.opts.agents?.[who]) return false;
    return !!autopilotDecision(this.state, p.player, this.settings[who] ?? DEFAULT_AUTOPILOT);
  }

  /** Décision d'un humain. Renvoie un message d'erreur si elle est illégale. */
  async submitHuman(player: PlayerId, d: Decision): Promise<string | null> {
    // 722 : pendant un tour contrôlé, seul le contrôleur décide pour le joueur contrôlé.
    if (d.type !== "concede" && this.state.pending && decider(this.state) !== player) return "Ce n'est pas à vous de décider";
    try {
      this.apply(player, d);
    } catch (e) {
      if (e instanceof RulesError) return e.message;
      throw e;
    }
    await this.run();
    return null;
  }

  /**
   * Laisse à l'humain le temps de voir la dernière action visible de l'IA : on attend le reste de la pause `aiDelay`.
   * La réflexion de l'IA sur l'action suivante se fait pendant cette pause (elle n'allonge pas l'attente).
   */
  private settle(): Promise<void> | null {
    const { aiDelay, sleep } = this.opts;
    if (!aiDelay || !sleep) return null;
    const rest = this.shownAt + aiDelay - Date.now();
    // Rien à attendre : pas d'`await` (il rendrait la main à la boucle d'événements sans raison).
    return rest > 0 ? sleep(rest) : null;
  }

  /** Enchaîne les décisions automatiques (IA, autopilot) jusqu'à ce qu'un humain doive choisir. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Compté par tour : une partie entre IA (humain éliminé) peut légitimement durer, une boucle reste dans le tour.
      let turn = this.state.turn.number;
      for (let guard = 1; ; guard++) {
        const p = this.state.pending;
        if (this.state.turn.number !== turn) {
          turn = this.state.turn.number;
          guard = 1;
        }
        if (guard > MAX_AUTOMATIC_DECISIONS && !this.state.over) {
          // Boucle de décisions automatiques dans un même tour : partie nulle (104.4b), signalée dans la console.
          const t = this.state.turn;
          console.warn(
            `GameHost : plus de ${MAX_AUTOMATIC_DECISIONS} décisions automatiques d'affilée (tour ${t.number}, étape ${t.step}, ` +
              `décision ${p?.kind ?? "aucune"} de ${p?.player ?? "?"}) : partie nulle`,
          );
          const { state, events } = drawByLoop(this.state);
          this.state = state;
          this.pendingEvents.push(...events);
          continue;
        }
        const agent = p && !this.state.over ? this.opts.agents?.[decider(this.state) ?? p.player] : undefined;
        const auto =
          p && !this.state.over && !agent
            ? autopilotDecision(this.state, p.player, this.settings[decider(this.state) ?? p.player] ?? DEFAULT_AUTOPILOT)
            : null;
        if (!p || this.state.over || (!agent && !auto)) {
          // Au tour de l'humain (ou fin de partie) : la dernière action visible de l'IA reste affichée le temps de sa
          // pause. Une décision de l'humain a pu arriver pendant l'attente : on repart alors de l'état courant.
          const pause = this.settle();
          if (!pause) break;
          await pause;
          continue;
        }
        // 722 : le joueur qui décide (le contrôleur du tour, le cas échéant).
        const actor = decider(this.state) ?? p.player;
        if (agent) {
          const wait = this.opts.gate?.();
          if (wait) {
            // L'humain voit la partie telle qu'elle est pendant l'attente.
            await this.settle();
            this.flush();
            await wait;
            // La partie a pu changer pendant l'attente (décision de l'humain) : on repart de l'état courant.
            if (this.state.pending !== p) continue;
          }
          let d: Decision;
          try {
            // Une IA qui contrôle le tour d'un autre joueur se contente des décisions par défaut (passer, ne pas attaquer).
            const out = actor === p.player ? agent(this.state, p.player) : fallbackDecision(this.state, p);
            if (out instanceof Promise) {
              d = await out;
              // La partie a pu changer pendant la réflexion (abandon d'un joueur) : on repart de l'état courant.
              if (this.state.pending !== p) continue;
            } else d = out;
            this.apply(actor, d);
          } catch (e) {
            console.warn("Décision IA illégale, repli :", e);
            d = fallbackDecision(this.state, p);
            this.apply(actor, d);
          }
          // Action visible : montrée une fois la pause de la précédente écoulée ; la suivante se prépare pendant la sienne.
          if (d.type !== "pass" && d.type !== "keep" && d.type !== "tapForMana" && this.opts.aiDelay && this.opts.sleep) {
            const pause = this.settle();
            if (pause) await pause;
            // Si l'automatisme va décider ensuite pour un humain, cette décision n'est pas montrée (elle serait périmée).
            this.flush(this.autopilotNext());
            this.shownAt = Date.now();
          }
          continue;
        }
        if (auto) this.apply(actor, auto);
      }
    } finally {
      this.running = false;
    }
    this.flush();
  }
}
