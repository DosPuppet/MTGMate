/**
 * GameHost : fait tourner une partie en consultant, pour chaque décision en attente,
 * l'IA du joueur, puis l'autopilot, puis l'humain. Le même hôte tourne dans un Web Worker
 * (partie contre l'IA) ou dans un serveur Node (partie en ligne).
 */

import { type AutopilotSettings, autopilotDecision, DEFAULT_AUTOPILOT } from "./autopilot";
import { submit } from "./game";
import type { GameRecord } from "./record";
import { RulesError } from "./stack";
import { decider } from "./state";
import { requiredBlocks } from "./turn";
import type { Decision, GameEvent, GameState, PendingDecision, PlayerId } from "./types";
import { filterEvents, type GameView, projectView } from "./view";

/** Une IA : reçoit l'état complet et renvoie une décision (elle ne doit lire que l'information publique). */
export type Agent = (state: GameState, player: PlayerId) => Decision;

export interface HostOptions {
  agents?: Partial<Record<PlayerId, Agent>>;
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
  /** Appelé après chaque décision enregistrée (serveur : écriture sur disque). */
  onRecord?: (player: PlayerId, d: Decision) => void;
}

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
      return { type: "declareAttackers", attackers: [] };
    case "declareBlockers":
      return { type: "declareBlockers", blocks: requiredBlocks(s, p.player) };
    case "priority":
      return { type: "pass" };
    case "choice":
      return { type: "choose", values: p.request.suggested };
  }
}

/** Décisions automatiques (IA, autopilot) enchaînées dans un même tour au-delà desquelles on suppose une boucle. */
const MAX_AUTOMATIC_DECISIONS = 10_000;

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
    // Seules les décisions acceptées sont enregistrées : le rejeu redonne exactement cet état.
    this.opts.record?.decisions.push([player, d]);
    this.opts.onRecord?.(player, d);
  }

  /** Enregistrement de la partie (null si elle n'est pas enregistrée : tutoriel, bac à sable). */
  get record(): GameRecord | null {
    return this.opts.record ?? null;
  }

  private flush(): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const p of this.state.playerOrder) {
      if (this.isHuman(p)) this.opts.onUpdate?.(p, this.view(p), filterEvents(events, p));
    }
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
        if (guard > MAX_AUTOMATIC_DECISIONS) {
          // Boucle de décisions automatiques : bug à reproduire, jamais un arrêt silencieux.
          const t = this.state.turn;
          throw new Error(
            `GameHost : plus de ${MAX_AUTOMATIC_DECISIONS} décisions automatiques d'affilée (tour ${t.number}, étape ${t.step}, ` +
              `décision ${p?.kind ?? "aucune"} de ${p?.player ?? "?"})`,
          );
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
            d = actor === p.player ? agent(this.state, p.player) : fallbackDecision(this.state, p);
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
            this.flush();
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
