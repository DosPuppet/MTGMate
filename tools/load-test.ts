/**
 * Test de charge local du serveur (PLAN-C, lot C16) : mémoire occupée par salon de partie en cours.
 *
 * Usage : node --expose-gc --import tsx tools/load-test.ts [--rooms 50] [--decisions 200] [--ai 3 --workers 2]
 *
 * `--ai N` (PLAN-E, E14) : salons d'un humain et de N sièges IA (niveau moyen, vrai pool de workers d'IA) ; mesure en plus
 * le délai de la boucle d'événements du fil principal (p99), la latence des réflexions de l'IA et le RSS (workers compris).
 *
 * Les salons sont créés directement dans un `RoomManager` (sans réseau), avec deux decks du méta ; chaque joueur répond
 * par la décision de repli de l'hôte, jusqu'à `--decisions` décisions par salon. La mémoire est mesurée après un
 * ramasse-miettes forcé, avant et après.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { type Decision, fallbackDecision, type GameState } from "@mtgx/engine";
import { AiPool } from "../packages/server/src/aiPool";
import { DEFAULT_CONFIG, type Peer, RoomManager } from "../packages/server/src/rooms";
import { metaDecks } from "./meta-decks";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const ROOMS = arg("--rooms", 50);
const DECISIONS = arg("--decisions", 200);
const AI = arg("--ai", 0);
const WORKERS = arg("--workers", 2);
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("lancer avec node --expose-gc");

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
function measure(): { rss: number; heap: number; total: number } {
  gc?.();
  gc?.();
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, total: m.heapTotal };
}

const decks = metaDecks().filter((d) => d.playable);
const silent: Peer = { send() {} };
// Pas de sauvegarde sur disque, pas de minuteurs gênants : délais longs.
const pool = AI ? new AiPool(WORKERS, 60_000) : undefined;
const rooms = new RoomManager({
  ...DEFAULT_CONFIG,
  maxRooms: ROOMS + 1,
  maxRoomsPerIp: ROOMS + 1,
  decisionMs: 3_600_000,
  ...(pool ? { aiPool: pool, maxAiRooms: ROOMS + 1, maxRssMb: 1e6 } : {}),
});
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const before = measure();
const started = Date.now();
const created: { room: ReturnType<RoomManager["create"]>["room"] }[] = [];
for (let i = 0; i < ROOMS; i++) {
  const a = decks[i % decks.length];
  const b = decks[(i + 7) % decks.length];
  if (!a || !b) throw new Error("decks du méta introuvables");
  if (AI) {
    const { room } = rooms.create(`J${i}`, a.main, silent, { players: AI + 1, ai: { count: AI, level: "medium" } });
    created.push({ room });
    continue;
  }
  const { room } = rooms.create(`J${i}a`, a.main, silent, { sideboard: a.sideboard });
  rooms.join(room.code, `J${i}b`, b.main, silent, b.sideboard);
  created.push({ room });
}
// Laisse les parties démarrer (file d'actions asynchrone).
await new Promise((r) => setTimeout(r, 50));

let played = 0;
for (let k = 0; k < DECISIONS; k++) {
  for (const { room } of created) {
    const host = (room as unknown as { host: { state: GameState } | null }).host;
    const s = host?.state;
    if (!s || s.over || !s.pending) continue;
    const seat = room.seats.find((x) => x.seat === s.pending?.player);
    if (!seat || seat.ai) continue;
    const d: Decision = fallbackDecision(s, s.pending);
    await room.decide(seat, d).catch(() => {});
    played++;
  }
}
const after = measure();
const live = created.filter(({ room }) => room.status === "playing").length;
console.log(`${ROOMS} salons, ${played} décisions en ${((Date.now() - started) / 1000).toFixed(1)} s (${live} parties en cours)`);
console.log(`  RSS : ${mb(before.rss)} → ${mb(after.rss)} (${mb((after.rss - before.rss) / ROOMS)} par salon)`);
console.log(`  tas : ${mb(before.heap)} → ${mb(after.heap)} (${mb((after.heap - before.heap) / ROOMS)} par salon)`);
console.log(`  tas réservé : ${mb(before.total)} → ${mb(after.total)}`);
loop.disable();
console.log(`  boucle d'événements : p99 ${(loop.percentile(99) / 1e6).toFixed(1)} ms, max ${(loop.max / 1e6).toFixed(1)} ms`);
if (pool) {
  const st = pool.stats();
  console.log(`  IA : ${st.workers} workers, réflexion p50 ${st.p50} ms, p95 ${st.p95} ms`);
  await pool.close();
}
rooms.closeAll();
process.exit(0);
