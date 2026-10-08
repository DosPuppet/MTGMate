/** Saving the local game: the record is rebuilt from the worker's messages. */
import type { GameRecord } from "@mtgx/engine";
import { describe, expect, it, vi } from "vitest";
import { type SavedLocalGame, SaveWriter } from "../src/savedGame";

const header: GameRecord = {
  format: "mtgx-game",
  version: 1,
  seed: 42,
  players: [
    { id: "p1", name: "You", deck: ["Forest"] },
    { id: "p2", name: "IA", deck: ["Island"] },
  ],
  decisions: [],
  rules: 60,
  checkpoints: [],
};

describe("saving the local game", () => {
  it("the header, then the new decisions, written together after a short delay", () => {
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

  it("flush writes right away (page closing); after stop, nothing more is written", () => {
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

  it("a resume starts from the replayed record, and completes it", () => {
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
