/**
 * Test de charge local du serveur (PLAN-C, lot C16) : mémoire occupée par salon de partie en cours.
 *
 * Usage : node --expose-gc --import tsx tools/load-test.ts [--rooms 50] [--decisions 200]
 *
 * Les salons sont créés directement dans un `RoomManager` (sans réseau), avec deux decks du méta ; chaque joueur répond
 * par la décision de repli de l'hôte, jusqu'à `--decisions` décisions par salon. La mémoire est mesurée après un
 * ramasse-miettes forcé, avant et après.
 */
import { type Decision, fallbackDecision, type GameState } from "@mtgx/engine";
import { DEFAULT_CONFIG, type Peer, RoomManager } from "../packages/server/src/rooms";
import { metaDecks } from "./meta-decks";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const ROOMS = arg("--rooms", 50);
const DECISIONS = arg("--decisions", 200);
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
const rooms = new RoomManager({ ...DEFAULT_CONFIG, maxRooms: ROOMS + 1, maxRoomsPerIp: ROOMS + 1, decisionMs: 3_600_000 });

const before = measure();
const started = Date.now();
const created: { room: ReturnType<RoomManager["create"]>["room"] }[] = [];
for (let i = 0; i < ROOMS; i++) {
  const a = decks[i % decks.length];
  const b = decks[(i + 7) % decks.length];
  if (!a || !b) throw new Error("decks du méta introuvables");
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
    if (!seat) continue;
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
rooms.closeAll();
process.exit(0);
