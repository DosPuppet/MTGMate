/**
 * Lancement du serveur : `npm run server`.
 * Variables : PORT (8787), HOST (0.0.0.0 ; 127.0.0.1 derrière nginx), MTGX_DECISION_MS, MTGX_GRACE_MS
 * (durées du minuteur et du délai de retour), MTGX_MAX_ROOMS (salons ouverts au plus, 200), MTGX_DATA_DIR (sauvegarde
 * des parties en cours, `data/rooms` par défaut ; « off » pour garder les parties en mémoire seulement), MTGX_ORIGINS
 * (origines admises pour le WebSocket en plus du même hôte, séparées par des virgules), MTGX_MAX_ROOMS_PER_IP (4),
 * MTGX_MAX_HEAP_MB (tas au-delà duquel aucun salon n'est créé, 384), MTGX_AI_WORKERS (workers des sièges IA, 2 au plus
 * par défaut ; 0 : pas d'IA en ligne), MTGX_MAX_AI_ROOMS (salons avec IA ouverts au plus, 20), MTGX_MAX_RSS_MB (mémoire
 * du processus au-delà de laquelle aucun salon avec IA n'est créé, 640).
 */
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index";

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "dist");

const host = process.env.HOST || "0.0.0.0";
const server = await startServer({
  port: num(process.env.PORT) ?? 8787,
  host,
  staticDir,
  ...(num(process.env.MTGX_AI_WORKERS) !== undefined ? { aiWorkers: num(process.env.MTGX_AI_WORKERS) } : {}),
  allowedOrigins: (process.env.MTGX_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  config: {
    ...(num(process.env.MTGX_MAX_ROOMS_PER_IP) ? { maxRoomsPerIp: num(process.env.MTGX_MAX_ROOMS_PER_IP) } : {}),
    ...(num(process.env.MTGX_DECISION_MS) ? { decisionMs: num(process.env.MTGX_DECISION_MS) } : {}),
    ...(num(process.env.MTGX_GRACE_MS) ? { graceMs: num(process.env.MTGX_GRACE_MS) } : {}),
    ...(num(process.env.MTGX_MAX_ROOMS) ? { maxRooms: num(process.env.MTGX_MAX_ROOMS) } : {}),
    ...(num(process.env.MTGX_MAX_HEAP_MB) ? { maxHeapMb: num(process.env.MTGX_MAX_HEAP_MB) } : {}),
    ...(num(process.env.MTGX_MAX_AI_ROOMS) ? { maxAiRooms: num(process.env.MTGX_MAX_AI_ROOMS) } : {}),
    ...(num(process.env.MTGX_MAX_RSS_MB) ? { maxRssMb: num(process.env.MTGX_MAX_RSS_MB) } : {}),
    // Parties sauvegardées : reprises après un redémarrage (pm2 restart, mise à jour).
    ...(process.env.MTGX_DATA_DIR === "off"
      ? {}
      : { dataDir: process.env.MTGX_DATA_DIR || join(process.cwd(), "data", "rooms") }),
  },
});

// Adresses du réseau local, seulement si le serveur écoute sur toutes les interfaces.
const lan = (host === "0.0.0.0" ? Object.values(networkInterfaces()) : [])
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a?.address}:${server.port}`);
console.log(`Planecircle — serveur en ligne sur le port ${server.port}`);
console.log(
  `  local : http://${host === "0.0.0.0" ? "localhost" : host}:${server.port}${lan.length ? `\n  réseau : ${lan.join(", ")}` : ""}`,
);
console.log(`  (client servi depuis packages/client/dist : lancez « npm run build » après une modification)`);

const stop = () => server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
