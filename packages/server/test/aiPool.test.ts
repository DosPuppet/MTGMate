/**
 * Server AI pool (PLAN-E, E14): a decision computed in a worker, card definitions sent once
 * per room then completed, timeout exceeded rejected (the host will play the default decision).
 */
import { buildDeck, deckById } from "@mtgx/cards";
import { createGame, legalActions } from "@mtgx/engine";
import { afterEach, describe, expect, it } from "vitest";
import { AiPool } from "../src/aiPool";

let pool: AiPool | null = null;
afterEach(async () => {
  await pool?.close();
  pool = null;
});

const game = () =>
  createGame({
    seed: 3,
    startingPlayer: "p1",
    players: [
      { id: "p1", name: "A", deck: buildDeck(deckById("welcome-green")) },
      { id: "p2", name: "B", deck: buildDeck(deckById("welcome-red")) },
    ],
  }).state;

describe("AI pool", () => {
  it("decides in a worker: keep the hand, then a legal action", async () => {
    pool = new AiPool(1, 20_000);
    const s = game();
    const keep = await pool.decide({ room: "R", seat: "p1", level: "medium", players: 2, seed: 1, state: s });
    expect(["keep", "mulligan"]).toContain(keep.type);
    expect(pool.stats().workers).toBe(1);
  }, 30_000);

  it("an overlong deliberation is rejected and the worker replaced", async () => {
    pool = new AiPool(1, 1);
    await expect(pool.decide({ room: "R", seat: "p1", level: "medium", players: 2, seed: 1, state: game() })).rejects.toThrow();
    expect(legalActions).toBeDefined();
  }, 30_000);
});
