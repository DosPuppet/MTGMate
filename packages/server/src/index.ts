/**
 * Serveur de jeu en ligne : WebSocket sur /ws (protocole dans protocol.ts) et, si un dossier est fourni,
 * fichiers statiques du client (build Vite) pour jouer en réseau local sur http://<ip>:<port>.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "./protocol";
import { ClientError, DEFAULT_CONFIG, type Peer, type Room, type RoomConfig, RoomManager } from "./rooms";

export type { ClientMessage, Clock, RoomInfo, Seat, ServerMessage } from "./protocol";
export { DEFAULT_CONFIG, type RoomConfig } from "./rooms";

export interface ServerOptions {
  port?: number;
  /** Adresse d'écoute : 0.0.0.0 (réseau local) ou 127.0.0.1 (derrière nginx). */
  host?: string;
  /** Connexions WebSocket simultanées par adresse IP. */
  maxPerIp?: number;
  /** Intervalle des pings WebSocket (ms) : détecte les connexions mortes, évite les coupures d'inactivité. */
  pingMs?: number;
  /** Dossier du client construit (packages/client/dist), servi en statique. */
  staticDir?: string;
  config?: Partial<RoomConfig>;
}

export interface RunningServer {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MAX_MESSAGE = 64 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Adresse du client : celle transmise par nginx (X-Forwarded-For) si la connexion vient de la machine elle-même. */
function clientIp(req: IncomingMessage): string {
  const direct = req.socket.remoteAddress ?? "";
  const forwarded = req.headers["x-forwarded-for"];
  if (LOOPBACK.has(direct) && typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || direct;
  return direct;
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function serveStatic(root: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (!root || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(root ? 405 : 404).end();
    return;
  }
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = normalize(join(root, path));
  // Jamais en dehors du dossier servi.
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // application monopage
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

function parse(data: WebSocket.RawData): ClientMessage | null {
  try {
    const msg = JSON.parse(String(data)) as ClientMessage;
    return msg && typeof msg === "object" && typeof msg.type === "string" ? msg : null;
  } catch {
    return null;
  }
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const rooms = new RoomManager({ ...DEFAULT_CONFIG, ...opts.config });
  const root = opts.staticDir && existsSync(opts.staticDir) ? resolve(opts.staticDir) : undefined;
  const http = createHttpServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(`ok ${rooms.size} salon(s)\n`);
      return;
    }
    serveStatic(root, req, res);
  });
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: MAX_MESSAGE });
  const perIp = new Map<string, number>();
  const maxPerIp = opts.maxPerIp ?? 8;
  const alive = new WeakSet<WebSocket>();
  const pinger = setInterval(() => {
    for (const c of wss.clients) {
      if (!alive.has(c)) {
        c.terminate(); // pas de réponse au ping précédent : connexion morte
        continue;
      }
      alive.delete(c);
      c.ping();
    }
  }, opts.pingMs ?? 25_000);
  pinger.unref();

  wss.on("connection", (ws, req) => {
    const ip = clientIp(req);
    const count = (perIp.get(ip) ?? 0) + 1;
    if (count > maxPerIp) {
      ws.close(1013, "Trop de connexions depuis cette adresse");
      return;
    }
    perIp.set(ip, count);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    const peer: Peer = {
      send(msg: ServerMessage) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    let current: { room: Room; seat: ReturnType<RoomManager["create"]>["seat"] } | null = null;
    const fail = (e: unknown) => {
      if (e instanceof ClientError) peer.send({ type: "error", code: e.code, message: e.message });
      else {
        console.error("Erreur serveur :", e);
        peer.send({ type: "error", code: "state", message: "Erreur interne du serveur." });
      }
    };

    ws.on("message", (data) => {
      const msg = parse(data);
      if (!msg) return;
      try {
        switch (msg.type) {
          case "create":
          case "join":
          case "rejoin": {
            if (current) throw new ClientError("state", "Vous êtes déjà dans un salon.");
            if (msg.type === "create") current = rooms.create(msg.name, msg.deck, peer);
            else if (msg.type === "join") current = rooms.join(msg.code, msg.name, msg.deck, peer);
            else {
              const found = rooms.byToken(msg.token);
              if (!found) throw new ClientError("token", "Cette partie n'existe plus.");
              if (found.seat.peer) throw new ClientError("state", "Cette partie est déjà ouverte ailleurs.");
              current = found;
              found.room.reconnect(found.seat, peer);
            }
            return;
          }
          case "leave": {
            if (!current) return;
            const { room, seat } = current;
            current = null;
            room.leave(seat).catch(fail);
            return;
          }
          case "decision":
            if (!current) throw new ClientError("state", "Aucune partie en cours.");
            current.room.decide(current.seat, msg.decision).catch(fail);
            return;
          case "settings":
            if (!current) return;
            current.room.settings(current.seat, msg.settings ?? {}).catch(fail);
            return;
          case "rematch":
            if (!current) throw new ClientError("state", "Aucune partie en cours.");
            current.room.rematch(current.seat).catch(fail);
            return;
        }
      } catch (e) {
        fail(e);
      }
    });

    ws.on("close", () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
      if (current && current.seat.peer === peer) current.room.disconnect(current.seat);
      current = null;
    });
  });

  return new Promise((ok) => {
    http.listen(opts.port ?? 8787, opts.host ?? "0.0.0.0", () => {
      ok({
        port: (http.address() as AddressInfo).port,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(pinger);
            rooms.closeAll();
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
