/**
 * Salons de 3 et 4 joueurs et Commander en ligne (PLAN-E, E13) : la partie commence quand le salon est plein, chacun
 * voit ses adversaires ; un joueur qui part abandonne et la partie continue sans lui ; un salon Commander valide le
 * commandant et donne 40 points de vie ; pas de BO3 à plusieurs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeckEntries } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, GREEN, RED, server } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});
async function start(config = {}) {
  srv = await server(config);
  return srv.port;
}
async function connect(port: number, n: number): Promise<Client[]> {
  const out = await Promise.all(Array.from({ length: n }, () => Client.connect(port)));
  clients.push(...out);
  return out;
}

/** Deck Commander minimal et légal : Arahbo et 99 Plaines (terrains de base : plusieurs exemplaires permis). */
const ARAHBO: DeckEntries = [[1, "Arahbo, the First Fang"]];
const PLAINS_99: DeckEntries = [[99, "Plains"]];

describe("salons à plusieurs", () => {
  it("à trois : la partie commence quand le troisième arrive ; sièges p1 à p3, deux adversaires chacun", async () => {
    const port = await start();
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: GREEN, players: 3, bestOf: 3 });
    const created = await a.next("room");
    expect(created.room.match.seats).toBe(3);
    // Pas de BO3 à plusieurs.
    expect(created.room.match.bestOf).toBe(1);
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    const waiting = await b.next("room");
    expect(waiting.room.status).toBe("waiting");
    c.send({ type: "join", code: created.room.code, name: "Chloé", deck: GREEN });
    const seen = await Promise.all([a, b, c].map((x) => x.next("update")));
    expect(seen.map((u) => u.view.viewer).sort()).toEqual(["p1", "p2", "p3"]);
    for (const u of seen) expect(u.view.opponents).toHaveLength(2);
    // Un quatrième est refusé.
    const [d] = (await connect(port, 1)) as [Client];
    d.send({ type: "join", code: created.room.code, name: "David", deck: RED });
    expect((await d.next("error")).code).toBe("full");
  });

  it("un joueur qui ne revient pas abandonne ; à trois, la partie continue entre les deux autres", async () => {
    const port = await start({ graceMs: 150 });
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: GREEN, players: 3 });
    const created = await a.next("room");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    c.send({ type: "join", code: created.room.code, name: "Chloé", deck: GREEN });
    const [, , up] = await Promise.all([a, b, c].map((x) => x.next("update")));
    // Bob et Chloé arrivent en même temps : le siège de Chloé est celui que lui donne le serveur.
    const seat = up.view.viewer;
    await c.close();
    const after = await a.next("update", (m) => !!m.view.players[seat]?.lost, 10_000);
    expect(after.view.over).toBe(false);
    expect(after.view.players[seat]?.lost).toBe(true);
  }, 20_000);
});

describe("Commander en ligne", () => {
  it("commandant validé, 40 points de vie, commandant dans la zone de commandement de chacun", async () => {
    const port = await start();
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: PLAINS_99, commander: ARAHBO, format: "commander", players: 3 });
    const created = await a.next("room");
    expect(created.room.match.format).toBe("commander");
    expect(created.room.deck.commander).toEqual(ARAHBO);
    // Sans commandant : refusé.
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99 });
    expect((await b.next("error")).code).toBe("deck");
    // Deck Standard dans un salon Commander : refusé (100 cartes, identité…).
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: GREEN, commander: ARAHBO });
    expect((await b.next("error")).code).toBe("deck");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99, commander: ARAHBO });
    c.send({ type: "join", code: created.room.code, name: "Chloé", deck: PLAINS_99, commander: ARAHBO });
    const u = await a.next("update");
    for (const p of ["p1", "p2", "p3"]) {
      expect(u.view.players[p]?.life).toBe(40);
      expect(u.view.players[p]?.commanders?.[0]?.zone).toBe("command");
    }
  });
});

describe("reprise d'un salon Commander à trois", () => {
  it("après un redémarrage du serveur, chacun reprend avec son jeton : commandants et 40 PV conservés", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mtgx-rooms-"));
    try {
      const first = await server({ dataDir, graceMs: 10_000 });
      const cs = await Promise.all([0, 1, 2].map(() => Client.connect(first.port)));
      const [a, b, c] = cs as [Client, Client, Client];
      a.send({ type: "create", name: "Alice", deck: PLAINS_99, commander: ARAHBO, format: "commander", players: 3 });
      const created = await a.next("room");
      b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99, commander: ARAHBO });
      c.send({ type: "join", code: created.room.code, name: "Chloé", deck: PLAINS_99, commander: ARAHBO });
      await Promise.all(cs.map((x) => x.next("update")));
      const tokens = cs.map((x) => {
        const r = [...x.received].reverse().find((m) => m.type === "room");
        return r?.type === "room" ? r.room.token : "";
      });
      await Promise.all(cs.map((x) => x.close()));
      await first.close();
      srv = await server({ dataDir, graceMs: 10_000 });
      expect(srv.rooms.size).toBe(1);
      const back = await Promise.all([0, 1, 2].map(() => Client.connect(srv?.port ?? 0)));
      clients.push(...back);
      for (const [i, x] of back.entries()) x.send({ type: "rejoin", token: tokens[i] as string });
      const ups = await Promise.all(back.map((x) => x.next("update")));
      for (const u of ups) {
        expect(u.view.opponents).toHaveLength(2);
        expect(u.view.players.p2?.life).toBe(40);
        expect(u.view.players.p3?.commanders?.[0]?.zone).toBe("command");
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20_000);
});
