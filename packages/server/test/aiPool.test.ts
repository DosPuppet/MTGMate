/**
 * Pool d'IA du serveur (PLAN-E, E14) : une décision calculée dans un worker, définitions des cartes envoyées une fois
 * par salon puis complétées, délai dépassé rejeté (l'hôte jouera la décision par défaut).
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
      { id: "p1", name: "A", deck: buildDeck(deckById("bienvenue-vert")) },
      { id: "p2", name: "B", deck: buildDeck(deckById("bienvenue-rouge")) },
    ],
  }).state;

describe("pool d'IA", () => {
  it("décide dans un worker : garder sa main, puis une action légale", async () => {
    pool = new AiPool(1, 20_000);
    const s = game();
    const keep = await pool.decide({ room: "R", seat: "p1", level: "medium", players: 2, seed: 1, state: s });
    expect(["keep", "mulligan"]).toContain(keep.type);
    expect(pool.stats().workers).toBe(1);
  }, 30_000);

  it("une réflexion trop longue est rejetée et le worker remplacé", async () => {
    pool = new AiPool(1, 1);
    await expect(pool.decide({ room: "R", seat: "p1", level: "medium", players: 2, seed: 1, state: game() })).rejects.toThrow();
    expect(legalActions).toBeDefined();
  }, 30_000);
});
