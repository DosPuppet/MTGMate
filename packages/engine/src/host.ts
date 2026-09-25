/**
 * GameHost : fait tourner une partie en consultant, pour chaque décision en attente,
 * l'IA du joueur, puis l'autopilot, puis l'humain. Le même hôte tourne dans un Web Worker
 * (partie contre l'IA) ou dans un serveur Node (partie en ligne).
 */

import { type AutopilotSettings, autopilotDecision, DEFAULT_AUTOPILOT } from "./autopilot";
import { submit } from "./game";
import { RulesError } from "./stack";
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

export class GameHost {
  state: GameState;
  readonly settings: Record<PlayerId, AutopilotSettings> = {};
  private readonly opts: HostOptions;
  private pendingEvents: GameEvent[] = [];
  private running = false;

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
    try {
      this.apply(player, d);
    } catch (e) {
      if (e instanceof RulesError) return e.message;
      throw e;
    }
    await this.run();
    return null;
  }

  /** Enchaîne les décisions automatiques (IA, autopilot) jusqu'à ce qu'un humain doive choisir. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let guard = 0; guard < 10_000; guard++) {
        const p = this.state.pending;
        if (!p || this.state.over) break;
        const agent = this.opts.agents?.[p.player];
        if (agent) {
          let d: Decision;
          try {
            d = agent(this.state, p.player);
            this.apply(p.player, d);
          } catch (e) {
            console.warn("Décision IA illégale, repli :", e);
            d = fallbackDecision(this.state, p);
            this.apply(p.player, d);
          }
          // On laisse à l'humain le temps de voir les actions visibles de l'IA.
          if (d.type !== "pass" && d.type !== "keep" && d.type !== "tapForMana" && this.opts.aiDelay && this.opts.sleep) {
            this.flush();
            await this.opts.sleep(this.opts.aiDelay);
          }
          continue;
        }
        const auto = autopilotDecision(this.state, p.player, this.settings[p.player] ?? DEFAULT_AUTOPILOT);
        if (!auto) break;
        this.apply(p.player, auto);
      }
    } finally {
      this.running = false;
    }
    this.flush();
  }
}
