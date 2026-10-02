/** Sauvegarde de la partie locale : l'enregistrement est reconstruit à partir des messages du worker. */
import type { GameRecord } from "@mtgx/engine";
import { describe, expect, it, vi } from "vitest";
import { type SavedLocalGame, SaveWriter } from "../src/savedGame";

const header: GameRecord = {
  format: "mtgx-game",
  version: 1,
  seed: 42,
  players: [
    { id: "p1", name: "Vous", deck: ["Forest"] },
    { id: "p2", name: "IA", deck: ["Island"] },
  ],
  decisions: [],
  rules: 60,
  checkpoints: [],
};

describe("sauvegarde de la partie locale", () => {
  it("l'en-tête puis les décisions nouvelles, écrits ensemble après un court délai", () => {
    vi.useFakeTimers();
    const writes: SavedLocalGame[] = [];
    const w = new SaveWriter(
      () => ({ aiLevel: "expert", match: null, log: [] }),
      (g) => writes.push(structuredClone(g)),
    );
    w.apply({ header, decisions: [], checkpoints: [] });
    w.apply({ decisions: [["p1", { type: "keep" }]], checkpoints: [] });
    w.apply({ decisions: [["p2", { type: "keep" }]], checkpoints: [[2, "abc"]] });
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(500);
    expect(writes).toHaveLength(1);
    const saved = writes[0] as SavedLocalGame;
    expect(saved.record.seed).toBe(42);
    expect(saved.record.decisions).toEqual([
      ["p1", { type: "keep" }],
      ["p2", { type: "keep" }],
    ]);
    expect(saved.record.checkpoints).toEqual([[2, "abc"]]);
    expect(saved.aiLevel).toBe("expert");
    vi.useRealTimers();
  });

  it("flush écrit tout de suite (fermeture de la page) ; après stop, plus rien n'est écrit", () => {
    vi.useFakeTimers();
    const writes: SavedLocalGame[] = [];
    const w = new SaveWriter(
      () => ({ match: null }),
      (g) => writes.push(structuredClone(g)),
    );
    w.apply({ header, decisions: [["p1", { type: "keep" }]], checkpoints: [] });
    w.flush();
    expect(writes).toHaveLength(1);
    w.stop();
    w.apply({ decisions: [["p2", { type: "keep" }]], checkpoints: [] });
    w.flush();
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(1);
    vi.useRealTimers();
  });

  it("une reprise repart de l'enregistrement rejoué, et le complète", () => {
    const writes: SavedLocalGame[] = [];
    const w = new SaveWriter(
      () => ({ match: null }),
      (g) => writes.push(structuredClone(g)),
    );
    w.start({ ...header, decisions: [["p1", { type: "keep" }]] });
    w.apply({ decisions: [["p2", { type: "mulligan" }]], checkpoints: [] });
    w.flush();
    expect(writes[0]?.record.decisions).toEqual([
      ["p1", { type: "keep" }],
      ["p2", { type: "mulligan" }],
    ]);
  });
});
