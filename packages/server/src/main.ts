/**
 * Lancement du serveur : `npm run server`.
 * Variables : PORT (8787), HOST (0.0.0.0 ; 127.0.0.1 derrière nginx), MTGX_DECISION_MS, MTGX_GRACE_MS
 * (durées du minuteur et du délai de retour), MTGX_MAX_ROOMS (salons ouverts au plus, 200).
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
  config: {
    ...(num(process.env.MTGX_DECISION_MS) ? { decisionMs: num(process.env.MTGX_DECISION_MS) } : {}),
    ...(num(process.env.MTGX_GRACE_MS) ? { graceMs: num(process.env.MTGX_GRACE_MS) } : {}),
    ...(num(process.env.MTGX_MAX_ROOMS) ? { maxRooms: num(process.env.MTGX_MAX_ROOMS) } : {}),
  },
});

// Adresses du réseau local, seulement si le serveur écoute sur toutes les interfaces.
const lan = (host === "0.0.0.0" ? Object.values(networkInterfaces()) : [])
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a?.address}:${server.port}`);
console.log(`MTG Mate — serveur en ligne sur le port ${server.port}`);
console.log(
  `  local : http://${host === "0.0.0.0" ? "localhost" : host}:${server.port}${lan.length ? `\n  réseau : ${lan.join(", ")}` : ""}`,
);
console.log(`  (client servi depuis packages/client/dist : lancez « npm run build » après une modification)`);

const stop = () => server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
