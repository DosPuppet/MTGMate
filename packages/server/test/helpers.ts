/** Clients de test : vrais WebSockets vers un serveur lancé sur un port libre, bot qui ne voit que sa vue. */
import { DECKS, type DeckEntries } from "@mtgx/cards";
import type { ActionOption, Decision, GameView } from "@mtgx/engine";
import { WebSocket } from "ws";
import type { ClientMessage, RoomConfig, ServerMessage } from "../src/index";
import { type RunningServer, startServer } from "../src/index";

export const GREEN: DeckEntries = (DECKS.find((d) => d.colors.join("") === "G") ?? DECKS[0])?.main ?? [];
export const RED: DeckEntries = (DECKS.find((d) => d.colors.join("") === "R") ?? DECKS[1])?.main ?? [];

export function server(
  config: Partial<RoomConfig> = {},
  opts: { maxPerIp?: number; pingMs?: number } = {},
): Promise<RunningServer> {
  return startServer({ port: 0, host: "127.0.0.1", config, ...opts });
}

export class Client {
  readonly received: ServerMessage[] = [];
  private cursor = 0;
  private waiters: (() => void)[] = [];
  /** Répond automatiquement à ses décisions (bot). */
  bot = false;
  private failed = new Set<string>();
  lastView: GameView | null = null;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      this.received.push(msg);
      if (msg.type === "update") this.lastView = msg.view;
      if (msg.type === "error" && msg.code === "rules" && this.lastPending) this.failed.add(this.lastPending);
      for (const w of this.waiters.splice(0)) w();
      if (this.bot && msg.type === "update") setImmediate(() => this.play(msg.view));
      // Décision refusée : aucune nouvelle vue n'arrivera, on rejoue prudemment (passer, ne pas attaquer).
      const view = this.lastView;
      if (this.bot && msg.type === "error" && msg.code === "rules" && view) setImmediate(() => this.play(view));
    });
  }

  static connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    return new Promise((ok, ko) => {
      ws.once("open", () => ok(new Client(ws)));
      ws.once("error", ko);
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  close(): Promise<void> {
    return new Promise((ok) => {
      if (this.ws.readyState === WebSocket.CLOSED) return ok();
      this.ws.once("close", () => ok());
      this.ws.close();
    });
  }

  /** Prochain message (non encore consommé) qui vérifie `pred`. */
  async next<T extends ServerMessage["type"]>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 10_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const m = this.received[this.cursor++] as ServerMessage;
        if (m.type === type && pred(m as Extract<ServerMessage, { type: T }>)) return m as Extract<ServerMessage, { type: T }>;
      }
      const left = end - Date.now();
      if (left <= 0) throw new Error(`Message « ${type} » attendu, non reçu`);
      await new Promise<void>((ok) => {
        const t = setTimeout(ok, left);
        this.waiters.push(() => {
          clearTimeout(t);
          ok();
        });
      });
    }
  }

  private lastPending: string | null = null;

  /** Bot : terrains, sorts sans coût additionnel, attaque avec tout, réponses suggérées. */
  play(view: GameView): void {
    const p = view.pending;
    if (!p || p.player !== view.viewer || view.over || view !== this.lastView) return;
    const key = `${view.turn.number}|${view.turn.step}|${p.kind}|${view.hand.length}|${view.stack.length}`;
    this.lastPending = key;
    const d = this.decide(view, this.failed.has(key));
    if (d) this.send({ type: "decision", decision: d });
  }

  private decide(view: GameView, safe: boolean): Decision | null {
    const p = view.pending;
    if (!p) return null;
    switch (p.kind) {
      case "mulligan":
        return { type: "keep" };
      case "bottomCards":
        return { type: "bottom", cards: view.hand.slice(0, p.count).map((c) => c.id) };
      case "discard":
        return { type: "discard", cards: view.hand.slice(0, p.count).map((c) => c.id) };
      case "declareAttackers":
        return {
          type: "declareAttackers",
          attackers: safe ? [] : (p.candidates ?? []).map((id) => ({ id, defender: p.defenders?.[0] ?? "" })),
        };
      case "declareBlockers":
        return { type: "declareBlockers", blocks: [] };
      case "choice":
        return { type: "choose", values: p.request?.suggested ?? [] };
      case "priority": {
        if (safe) return { type: "pass" };
        const acts = p.actions ?? [];
        const land = acts.find((a) => a.type === "playLand");
        if (land) return land as Decision;
        const cast = acts.find(
          (a): a is Extract<ActionOption, { type: "cast" }> =>
            a.type === "cast" && !a.additional && a.normalAvailable !== false && castTargets(a) !== null,
        );
        if (cast)
          return {
            type: "cast",
            card: cast.card,
            mode: cast.modes[0]?.index ?? 0,
            targets: castTargets(cast) ?? {},
            x: cast.xMax ?? 0,
          };
        return { type: "pass" };
      }
    }
  }
}

function castTargets(a: Extract<ActionOption, { type: "cast" }>): Record<string, string[]> | null {
  const out: Record<string, string[]> = {};
  for (const t of a.modes[0]?.targets ?? []) {
    if (t.legal.length === 0) {
      if (!t.optional) return null;
      out[t.id] = [];
    } else out[t.id] = [t.legal[0] as string];
  }
  return out;
}

/** Deux joueurs dans un salon, partie lancée. */
export async function duel(port: number, opts: { bots?: boolean } = {}) {
  const a = await Client.connect(port);
  const b = await Client.connect(port);
  a.bot = b.bot = opts.bots ?? true;
  a.send({ type: "create", name: "Alice", deck: GREEN });
  const created = await a.next("room");
  b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
  await a.next("update");
  await b.next("update");
  return { a, b, code: created.room.code };
}
