/**
 * Serveur de jeu en ligne : WebSocket sur /ws (protocole dans protocol.ts) et, si un dossier est fourni,
 * fichiers statiques du client (build Vite) pour jouer en réseau local sur http://<ip>:<port>.
 * Relaie aussi les images de Scryfall sur /scry/ pour les joueurs dont le réseau bloque cards.scryfall.io.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";
import { RULES_VERSION } from "@mtgx/engine";
import { WebSocket, WebSocketServer } from "ws";
import { type ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "./protocol";
import { ClientError, DEFAULT_CONFIG, ipKey, type Peer, type Room, type RoomConfig, RoomManager } from "./rooms";
import { cleanSettings, isDecision } from "./validate";

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
  /** Débit de messages par connexion : `perSecond` en régime continu, `burst` en rafale. */
  rate?: { perSecond: number; burst: number };
  /** Origines admises pour le WebSocket en plus du même hôte (MTGX_ORIGINS, séparées par des virgules). */
  allowedOrigins?: string[];
  /** Dossier du client construit (packages/client/dist), servi en statique. */
  staticDir?: string;
  /** Récupération d'une image de Scryfall pour le relais /scry/ (remplaçable dans les tests). */
  fetchImage?: (url: string) => Promise<Response>;
  config?: Partial<RoomConfig>;
}

export interface RunningServer {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MAX_MESSAGE = 64 * 1024;
/** Messages refusés d'affilée (débit dépassé) avant de fermer la connexion. */
const MAX_DROPPED = 200;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Adresse du client. Derrière nginx (connexion venue de la machine elle-même), celle que nginx a vue : `X-Real-IP`,
 * sinon la dernière adresse de `X-Forwarded-For` (nginx l'ajoute à la fin ; les premières sont fournies par le client
 * et ne prouvent rien).
 */
export function clientIp(req: IncomingMessage): string {
  const direct = req.socket.remoteAddress ?? "";
  if (!LOOPBACK.has(direct)) return direct;
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",").at(-1)?.trim() || direct;
  return direct;
}

/**
 * Origine d'une connexion WebSocket : un navigateur l'envoie toujours ; une page d'un autre site ne doit pas pouvoir
 * jouer à la place du joueur. Acceptées : pas d'en-tête Origin (client hors navigateur), même hôte que la requête (site
 * servi par ce serveur, nginx, relais de Vite en dev), ou une origine de la liste `allowedOrigins` (MTGX_ORIGINS).
 */
export function originAllowed(req: IncomingMessage, allowed: readonly string[] = []): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Politique de contenu de l'application : scripts, worker et données du site seulement ; styles en ligne (React) et
 * polices de Google Fonts ; images du site, en `data:` (textures) et de Scryfall ; aucune page ne peut l'encadrer.
 * HSTS est posé par nginx (le serveur lui-même ne parle que HTTP, en local).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://cards.scryfall.io",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** En-têtes de sécurité des fichiers servis (l'application et ses ressources). */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
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
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end(); // chemin mal encodé (« /% ») : ce n'est pas un fichier
    return;
  }
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
  const type = MIME[extname(file)] ?? "application/octet-stream";
  // Fichiers du build nommés par leur empreinte (/assets/…) : immuables, en cache un an. index.html : jamais en cache
  // (il désigne les fichiers de la version en cours).
  const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  const encoding = COMPRESSIBLE.test(type) ? acceptedEncoding(req) : null;
  if (!encoding) {
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": cache });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
    return;
  }
  // Texte (JS, CSS, JSON…) : compressé une fois par fichier et par version, puis servi depuis la mémoire
  // (le bundle principal passe de 7 Mo à 1,5 Mo en gzip, moins en brotli).
  const body = compressed(file, encoding);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Encoding": encoding,
    Vary: "Accept-Encoding",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg)/;

function acceptedEncoding(req: IncomingMessage): "br" | "gzip" | null {
  const accept = String(req.headers["accept-encoding"] ?? "");
  return /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
}

/** Fichiers compressés en mémoire, par chemin, encodage et date de modification (un nouveau build les remplace). */
const compressedCache = new Map<string, { mtime: number; body: Buffer }>();

function compressed(file: string, encoding: "br" | "gzip"): Buffer {
  const key = `${encoding}:${file}`;
  const mtime = statSync(file).mtimeMs;
  const hit = compressedCache.get(key);
  if (hit && hit.mtime === mtime) return hit.body;
  const raw = readFileSync(file);
  const body =
    encoding === "br"
      ? brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } })
      : gzipSync(raw, { level: 9 });
  compressedCache.set(key, { mtime, body });
  return body;
}

/**
 * Relais des images de Scryfall : /scry/<chemin> → https://cards.scryfall.io/<chemin>. Liste blanche stricte
 * (seules les images de cartes, jamais un autre hôte) : ce n'est pas un proxy ouvert.
 */
export const SCRY_PREFIX = "/scry/";
const SCRY_HOST = "https://cards.scryfall.io";
const SCRY_PATH = /^\/(normal|large|small|art_crop|png|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;
/** L'URL d'une image change quand Scryfall la remplace (?horodatage) : cache long. */
const SCRY_CACHE = "public, max-age=2592000, immutable";
const SCRY_TIMEOUT_MS = 10_000;

const fetchScryfall = (url: string): Promise<Response> =>
  fetch(url, { headers: { "User-Agent": "MTGMate/1.0", Accept: "image/*" }, signal: AbortSignal.timeout(SCRY_TIMEOUT_MS) });

async function relayImage(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImage: (url: string) => Promise<Response>,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname.slice(SCRY_PREFIX.length - 1);
  if (!SCRY_PATH.test(path)) {
    res.writeHead(404).end();
    return;
  }
  let upstream: Response;
  try {
    // Sans la chaîne de requête : une variante (?x=1, ?x=2…) ne doit pas refaire une requête à Scryfall à chaque fois.
    upstream = await fetchImage(`${SCRY_HOST}${path}`);
  } catch {
    res.writeHead(502).end();
    return;
  }
  if (!upstream.ok || !upstream.body) {
    res.writeHead(upstream.status === 404 ? 404 : 502).end();
    return;
  }
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
    "Cache-Control": SCRY_CACHE,
  };
  for (const h of ["content-length", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    await upstream.body.cancel();
    return;
  }
  Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream)
    .on("error", () => res.destroy())
    .pipe(res);
}

/** Version du serveur : le commit, fixé à la compilation (`tools/build-server.ts`) ; « dev » sous tsx. */
const BUILD = process.env.MTGX_BUILD ?? "dev";

/**
 * Santé du serveur. Une requête locale directe (sans en-tête de relais : pm2, `deploy/update.sh`, supervision) reçoit le
 * détail en JSON (versions, mémoire, salons) ; une requête venue d'ailleurs (par nginx) ne reçoit que « ok ».
 */
function healthz(req: IncomingMessage, res: ServerResponse, rooms: RoomManager): void {
  const local = LOOPBACK.has(req.socket.remoteAddress ?? "") && !req.headers["x-real-ip"] && !req.headers["x-forwarded-for"];
  if (!local) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("ok\n");
    return;
  }
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1_048_576);
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(
    `${JSON.stringify({
      ok: true,
      build: BUILD,
      protocol: PROTOCOL_VERSION,
      rules: RULES_VERSION,
      rooms: rooms.size,
      memory: { rssMb: mb(m.rss), heapUsedMb: mb(m.heapUsed), heapTotalMb: mb(m.heapTotal) },
      uptimeS: Math.round(process.uptime()),
    })}\n`,
  );
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
    try {
      handle(req, res);
    } catch (e) {
      // Une requête ne doit jamais arrêter le serveur (et toutes les parties en cours).
      console.error("Requête HTTP en erreur :", e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/healthz") {
      healthz(req, res, rooms);
      return;
    }
    if (req.url?.startsWith(SCRY_PREFIX)) {
      void relayImage(req, res, opts.fetchImage ?? fetchScryfall);
      return;
    }
    serveStatic(root, req, res);
  };
  const wss = new WebSocketServer({
    server: http,
    path: "/ws",
    maxPayload: MAX_MESSAGE,
    verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req, opts.allowedOrigins),
  });
  const perIp = new Map<string, number>();
  const maxPerIp = opts.maxPerIp ?? 8;
  const rate = opts.rate ?? { perSecond: 20, burst: 40 };
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
    // Connexions comptées par adresse IPv4, ou par préfixe /64 en IPv6.
    const key = ipKey(ip);
    const count = (perIp.get(key) ?? 0) + 1;
    if (count > maxPerIp) {
      ws.close(1013, "Trop de connexions depuis cette adresse");
      return;
    }
    perIp.set(key, count);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    // Seau à jetons : chaque décision coûte une copie de l'état ; un client ne doit pas monopoliser le serveur.
    let tokens = rate.burst;
    let refilled = Date.now();
    let dropped = 0;
    const allow = () => {
      const now = Date.now();
      tokens = Math.min(rate.burst, tokens + ((now - refilled) / 1000) * rate.perSecond);
      refilled = now;
      if (tokens >= 1) {
        tokens -= 1;
        dropped = 0;
        return true;
      }
      dropped++;
      return false;
    };
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
      if (!allow()) {
        if (dropped === 1) peer.send({ type: "error", code: "busy", message: "Trop de messages : ralentissez." });
        if (dropped >= MAX_DROPPED) ws.close(1008, "Trop de messages");
        return;
      }
      const msg = parse(data);
      if (!msg) return;
      try {
        switch (msg.type) {
          case "create":
          case "join":
          case "rejoin": {
            if (current) throw new ClientError("state", "Vous êtes déjà dans un salon.");
            if (msg.version?.protocol !== PROTOCOL_VERSION || msg.version?.rules !== RULES_VERSION)
              throw new ClientError("version", "Une nouvelle version de MTG Mate est disponible : rechargez la page.");
            if (msg.type === "create")
              current = rooms.create(msg.name, msg.deck, peer, { sideboard: msg.sideboard, bestOf: msg.bestOf, ip });
            else if (msg.type === "join") current = rooms.join(msg.code, msg.name, msg.deck, peer, msg.sideboard);
            else {
              const found = rooms.byToken(msg.token);
              if (!found)
                throw new ClientError(
                  "token",
                  rooms.wasInterrupted(msg.token)
                    ? "Partie interrompue par une mise à jour du moteur."
                    : "Cette partie n'existe plus.",
                );
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
            if (!isDecision(msg.decision)) throw new ClientError("rules", "Décision invalide.");
            current.room.decide(current.seat, msg.decision).catch(fail);
            return;
          case "settings":
            if (!current) return;
            current.room.settings(current.seat, cleanSettings(msg.settings)).catch(fail);
            return;
          case "rematch":
            if (!current) throw new ClientError("state", "Aucune partie en cours.");
            current.room.rematch(current.seat).catch(fail);
            return;
          case "sideboard":
            if (!current) throw new ClientError("state", "Aucune partie en cours.");
            current.room.sideboard(current.seat, msg.main, msg.sideboard).catch(fail);
            return;
          case "export": {
            if (!current) throw new ClientError("state", "Aucune partie en cours.");
            // L'enregistrement révèle les decks et la graine : seulement une fois la partie terminée.
            const record = current.room.exportRecord();
            if (!record) throw new ClientError("state", "La partie n'est pas terminée : l'export sera possible à la fin.");
            peer.send({ type: "record", record });
            return;
          }
        }
      } catch (e) {
        fail(e);
      }
    });

    ws.on("close", () => {
      const left = (perIp.get(key) ?? 1) - 1;
      if (left > 0) perIp.set(key, left);
      else perIp.delete(key);
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
