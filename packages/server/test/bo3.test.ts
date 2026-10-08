/** Best-of-three match (BO3): score, sideboard between games, the loser starts. */
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

async function bo3() {
  srv = await server();
  const a = await Client.connect(srv.port);
  const b = await Client.connect(srv.port);
  clients.push(a, b);
  a.bot = b.bot = true;
  a.send({ type: "create", name: "Alice", deck: GREEN, bestOf: 3 });
  const created = await a.next("room");
  expect(created.room.match.bestOf).toBe(3);
  b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
  return { a, b };
}

describe("BO3", () => {
  it("games follow one another with the sideboard, the loser starts, until two wins", async () => {
    const { a, b } = await bo3();
    // Alice concedes every game: short games, Bob wins 2-0 and Alice starts game 2.
    a.bot = false;
    for (let game = 1; game <= 2; game++) {
      if (game === 1) await a.next("room", (x) => x.room.status === "playing", 10_000);
      a.send({ type: "decision", decision: { type: "concede" } });
      const end = await a.next("room", (m) => m.room.status === "sideboard" || m.room.status === "over", 10_000);
      expect(end.room.match.game).toBe(game);
      expect(end.room.match.wins).toEqual({ p1: 0, p2: game });
      if (game === 2) {
        expect(end.room.status).toBe("over");
        expect(end.room.match.winner).toBe("p2");
        break;
      }
      expect(end.room.status).toBe("sideboard");
      // Between games: each keeps their deck (empty swap) and declares ready.
      for (const c of [a, b]) {
        const r = [...c.received].reverse().find((x) => x.type === "room");
        const deck = r?.type === "room" ? r.room.deck : { main: [], sideboard: [] };
        c.send({ type: "sideboard", main: deck.main, sideboard: deck.sideboard });
      }
      const next = await a.next("room", (x) => x.room.status === "playing", 10_000);
      expect(next.room.match.game).toBe(2);
      // The loser of game 1 (Alice, p1) starts game 2.
      // From the mulligans on, the active player is the one who will start.
      const first = await a.next("update", (u) => !u.view.over, 10_000);
      expect(first.view.turn.active).toBe("p1");
    }
  }, 60_000);

  it("a sideboard swap that changes the cards is refused", async () => {
    const { a, b } = await bo3();
    a.bot = false;
    // The game must have started (Bob's arrival handled) before Alice quits.
    await a.next("room", (x) => x.room.status === "playing", 10_000);
    a.send({ type: "decision", decision: { type: "concede" } });
    await a.next("room", (m) => m.room.status === "sideboard", 10_000);
    // Green deck against red deck: these are not Alice's cards.
    a.bot = b.bot = false;
    a.send({ type: "sideboard", main: RED, sideboard: [] });
    expect((await a.next("error", (m) => m.code === "deck")).message).toMatch(/same cards/);
  }, 60_000);
});
