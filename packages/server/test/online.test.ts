import { CARDS } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { RunningServer } from "../src/index";
import { Client, duel, GREEN, server } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});
async function start(config = {}, opts: { maxPerIp?: number; pingMs?: number } = {}) {
  srv = await server(config, opts);
  return srv.port;
}
async function pair(port: number, bots = true) {
  const d = await duel(port, { bots });
  clients.push(d.a, d.b);
  return d;
}

/** Identifiants de définitions cités dans un message. */
function defIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) defIds(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/defId$/i.test(k) && typeof v === "string") out.add(v);
      else defIds(v, out);
    }
  }
  return out;
}

describe("salons", () => {
  it("création, code, arrivée du second joueur et début de partie", async () => {
    const port = await start();
    const { a, b, code } = await pair(port, false);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const ua = a.received.find((m) => m.type === "update");
    const ub = b.received.find((m) => m.type === "update");
    expect(ua && ua.type === "update" && ua.view.viewer).toBe("p1");
    expect(ub && ub.type === "update" && ub.view.viewer).toBe("p2");
    const room = [...b.received].reverse().find((m) => m.type === "room");
    expect(room && room.type === "room" && room.room.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(room && room.type === "room" && room.room.status).toBe("playing");
  });

  it("refuse un deck illégal, un code inconnu et un troisième joueur", async () => {
    const port = await start();
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "create", name: "Eve", deck: [[40, "Forest"]] });
    expect((await c.next("error")).code).toBe("deck");
    c.send({ type: "create", name: "Eve", deck: [[60, "Plateau inconnu"]] });
    expect((await c.next("error")).code).toBe("deck");
    c.send({ type: "join", code: "ZZZZZZ", name: "Eve", deck: GREEN });
    expect((await c.next("error")).code).toBe("room");
    c.send({ type: "create", name: "   ", deck: GREEN });
    expect((await c.next("error")).code).toBe("name");
    const { code } = await pair(port, false);
    c.send({ type: "join", code, name: "Eve", deck: GREEN });
    expect((await c.next("error")).code).toBe("full");
  });

  it("une décision hors tour ou illégale est refusée sans casser la partie", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    const va = a.lastView;
    const waiting = va?.pending?.player === "p1" ? b : a;
    waiting.send({ type: "decision", decision: { type: "keep" } });
    expect((await waiting.next("error")).code).toBe("rules");
    const turn = va?.pending?.player === "p1" ? a : b;
    turn.send({ type: "decision", decision: { type: "playLand", card: "inexistant" } });
    expect((await turn.next("error")).code).toBe("rules");
    turn.send({ type: "decision", decision: { type: "keep" } });
    await turn.next("update");
  });
});

describe("partie complète", () => {
  it("deux bots qui ne voient que leur vue jouent jusqu'à la fin", async () => {
    const port = await start();
    const { a, b } = await pair(port);
    const end = await a.next("update", (m) => m.view.over, 90_000);
    expect(end.view.winner).toMatch(/^p[12]$/);
    await b.next("update", (m) => m.view.over);
    // Informations cachées : la main de départ de l'un n'apparaît jamais chez l'autre (decks disjoints).
    const firstA = a.received.find((m) => m.type === "update");
    const handA = new Set(firstA && firstA.type === "update" ? firstA.view.hand.map((c) => c.defId) : []);
    const firstB = b.received.find((m) => m.type === "update");
    const seenByB = defIds(firstB);
    for (const d of handA) expect(seenByB.has(d)).toBe(false);
    // Faces : aucune carte de la decklist adverse avant qu'elle ne soit vue.
    const facesB = firstB?.type === "update" ? Object.keys(firstB.faces) : [];
    const green = new Set(GREEN.map(([, name]) => CARDS[name]?.id));
    expect(facesB.filter((d) => green.has(d))).toEqual([]);
  }, 120_000);

  it("quitter une partie en cours vaut abandon", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    a.send({ type: "leave" });
    const end = await b.next("update", (m) => m.view.over);
    expect(end.view.winner).toBe("p2");
  });

  it("revanche : une nouvelle partie dans le même salon quand les deux joueurs la demandent", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    a.send({ type: "decision", decision: { type: "concede" } });
    await a.next("update", (m) => m.view.over);
    await b.next("update", (m) => m.view.over);
    a.send({ type: "rematch" });
    expect((await b.next("room", (m) => m.room.players.some((p) => p.rematch))).room.status).toBe("over");
    b.send({ type: "rematch" });
    const fresh = await a.next("update", (m) => !m.view.over);
    expect(fresh.view.players.p1?.life).toBe(20);
    const room = await b.next("room", (m) => m.room.status === "playing");
    expect(room.room.players.every((p) => !p.rematch)).toBe(true);
  });
});

describe("minuteur et déconnexions", () => {
  it("temps écoulé : décision par défaut, puis défaite après 3 expirations", async () => {
    const port = await start({ decisionMs: 120, maxTimeouts: 3 });
    const { a, b } = await pair(port, false);
    b.bot = true; // seul Bob joue ; Alice ne répond jamais
    b.play(b.lastView as NonNullable<typeof b.lastView>);
    const end = await a.next("update", (m) => m.view.over, 30_000);
    expect(end.view.winner).toBe("p2");
    expect(end.view.players.p1?.lost).toBe(true);
    const clocked = a.received.filter((m) => m.type === "update" && m.clock?.player === "p1");
    expect(clocked.length).toBeGreaterThan(0);
  });

  it("reconnexion avec le jeton : vue restaurée, la partie continue", async () => {
    const port = await start({ graceMs: 5_000 });
    const { a, b } = await pair(port, false);
    const bRoom = b.received.find((m) => m.type === "room");
    const token = bRoom?.type === "room" ? bRoom.room.token : "";
    await b.close();
    const off = await a.next("opponent", (m) => !m.connected);
    expect(off.remainingMs).toBeGreaterThan(0);
    const b2 = await Client.connect(port);
    clients.push(b2);
    b2.send({ type: "rejoin", token });
    const room = await b2.next("room");
    expect(room.room.seat).toBe("p2");
    const up = await b2.next("update");
    expect(up.view.hand.length).toBeGreaterThan(0);
    expect((await a.next("opponent", (m) => m.connected)).connected).toBe(true);
    // Un jeton inconnu est refusé.
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "rejoin", token: "faux" });
    expect((await c.next("error")).code).toBe("token");
  });

  it("sans retour dans le délai, le joueur déconnecté perd", async () => {
    const port = await start({ graceMs: 150 });
    const { a, b } = await pair(port, false);
    await b.close();
    const end = await a.next("update", (m) => m.view.over, 5_000);
    expect(end.view.winner).toBe("p1");
  });
});

describe("exposition à Internet", () => {
  it("/healthz répond avec le nombre de salons", async () => {
    const port = await start();
    await pair(port, false);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^ok 1 salon/);
  });

  it("refuse de nouveaux salons au-delà de la limite", async () => {
    const port = await start({ maxRooms: 1 });
    const a = await Client.connect(port);
    const b = await Client.connect(port);
    clients.push(a, b);
    a.send({ type: "create", name: "A", deck: GREEN });
    await a.next("room");
    b.send({ type: "create", name: "B", deck: GREEN });
    expect((await b.next("error")).code).toBe("busy");
  });

  it("limite les connexions simultanées par adresse (nginx : X-Forwarded-For)", async () => {
    const port = await start({}, { maxPerIp: 2 });
    const open = (ip: string) =>
      new Promise<{ ws: WebSocket; code: number | null }>((ok) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { "X-Forwarded-For": ip } });
        let settled = false;
        ws.once("close", (code) => {
          if (!settled) ok({ ws, code });
          settled = true;
        });
        ws.once("open", () =>
          setTimeout(() => {
            if (!settled) ok({ ws, code: null });
            settled = true;
          }, 150),
        );
      });
    const conns = [await open("10.0.0.1"), await open("10.0.0.1"), await open("10.0.0.1"), await open("10.0.0.2")];
    expect(conns.map((c) => c.code)).toEqual([null, null, 1013, null]);
    for (const c of conns) c.ws.terminate();
  });

  it("une connexion qui ne répond plus aux pings est fermée (délai de retour normal)", async () => {
    const port = await start({ graceMs: 10_000 }, { pingMs: 100 });
    const a = await Client.connect(port);
    clients.push(a);
    a.send({ type: "create", name: "Alice", deck: GREEN });
    const { room } = await a.next("room");
    // Client « mort » : il ne répond pas aux pings.
    const dead = new WebSocket(`ws://127.0.0.1:${port}/ws`, { autoPong: false });
    await new Promise((ok) => dead.once("open", ok));
    dead.send(JSON.stringify({ type: "join", code: room.code, name: "Bob", deck: GREEN }));
    const off = await a.next("opponent", (m) => !m.connected, 3_000);
    expect(off.remainingMs).toBeGreaterThan(0);
    dead.terminate();
  });

  it("un salon resté sans adversaire est fermé", async () => {
    const port = await start({ waitingMs: 150 });
    const a = await Client.connect(port);
    clients.push(a);
    a.send({ type: "create", name: "Alice", deck: GREEN });
    await a.next("room");
    expect((await a.next("error", () => true, 3_000)).code).toBe("closed");
    expect(srv?.rooms.size).toBe(0);
  });
});
