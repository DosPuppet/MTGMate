/** Recording and replay of a game (`engine/src/record.ts`): same seed + same decisions = same game. */
import { buildDeck, card, deckById } from "@mtgx/cards";
import {
  CHECKPOINT_EVERY,
  createRecordedGame,
  GameHost,
  type GameRecord,
  isGameRecord,
  outcomeHash,
  RULES_VERSION,
  replayChecked,
  replayGame,
  replayStates,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { heuristicAgent, randomAgent } from "../src";

describe("recording and replay", () => {
  it("a game played by GameHost replays identically, up to the final state", async () => {
    const { state, events, record } = createRecordedGame({
      seed: 1234,
      players: [
        { id: "p1", name: "Alice", deck: buildDeck(deckById("welcome-green")) },
        { id: "p2", name: "Bob", deck: buildDeck(deckById("welcome-red")) },
      ],
    });
    const host = new GameHost(state, { agents: { p1: heuristicAgent(), p2: randomAgent(7) }, record }, events);
    await host.run();
    expect(host.state.over).toBe(true);
    expect(record.decisions.length).toBeGreaterThan(50);
    // The recording goes through JSON (file, server disk) without loss.
    const copy = JSON.parse(JSON.stringify(record));
    expect(isGameRecord(copy)).toBe(true);
    const replayed = replayGame(copy, card);
    expect(replayed.state).toEqual(host.state);
    // Intermediate states: one per decision, the last one identical.
    const states = replayStates(copy, card);
    expect(states).toHaveLength(record.decisions.length + 1);
    expect(states.at(-1)).toEqual(host.state);
    expect(replayGame(copy, card, 10).state).toEqual(states[10]);
  }, 60_000);

  it('PLAN-H H9: "as it enters" choices (copies, types, lands, Mox Diamond) replay identically', async () => {
    // Cards with "as it enters" choices on both sides: the replayed game (decisions only) reaches the final state.
    const main: [number, string][] = [
      [6, "Island"],
      [6, "Mountain"],
      [4, "Echoing Deeps"],
      [4, "Cavern of Souls"],
      [4, "Phantasmal Image"],
      [4, "Adaptive Automaton"],
      [4, "Cursed Mirror"],
      [4, "Visage Bandit"],
      [4, "Mox Diamond"],
      [4, "Bear Cub"],
      [4, "Serra Angel"],
      [4, "Burglar Rat"],
      [4, "Waxen Shapethief"],
    ];
    for (const seed of [5, 6]) {
      const { state, events, record } = createRecordedGame({
        seed,
        players: [
          { id: "p1", name: "Alice", deck: buildDeck({ main }) },
          { id: "p2", name: "Bob", deck: buildDeck({ main }) },
        ],
      });
      const host = new GameHost(state, { agents: { p1: randomAgent(seed), p2: heuristicAgent() }, record }, events);
      await host.run();
      const copy = JSON.parse(JSON.stringify(record));
      expect(replayGame(copy, card).state).toEqual(host.state);
      expect(replayChecked(copy, card).divergence).toBeNull();
    }
  }, 120_000);

  async function recorded(): Promise<{ record: GameRecord; final: ReturnType<typeof replayGame>["state"] }> {
    const { state, events, record } = createRecordedGame({
      seed: 99,
      players: [
        { id: "p1", name: "Alice", deck: buildDeck(deckById("welcome-blue")) },
        { id: "p2", name: "Bob", deck: buildDeck(deckById("welcome-black")) },
      ],
    });
    const host = new GameHost(state, { agents: { p1: randomAgent(3), p2: heuristicAgent() }, record }, events);
    await host.run();
    return { record: JSON.parse(JSON.stringify(record)), final: host.state };
  }

  it("rules version and checkpoints: the verified replay finds every fingerprint", async () => {
    const { record, final } = await recorded();
    expect(record.rules).toBe(RULES_VERSION);
    const n = record.decisions.length;
    const expected = Array.from({ length: Math.floor(n / CHECKPOINT_EVERY) }, (_, i) => (i + 1) * CHECKPOINT_EVERY);
    if (n % CHECKPOINT_EVERY) expected.push(n);
    expect(record.checkpoints?.map(([i]) => i)).toEqual(expected);
    let steps = 0;
    const checked = replayChecked(record, card, () => steps++);
    expect(checked.divergence).toBeNull();
    expect(checked.applied).toBe(n);
    expect(steps).toBe(n + 1);
    expect(outcomeHash(checked.state)).toBe(outcomeHash(final));
  }, 60_000);

  it("verified replay: a wrong fingerprint stops at the previous checkpoint; a rejected decision, just before it", async () => {
    const { record } = await recorded();
    const cps = record.checkpoints ?? [];
    expect(cps.length).toBeGreaterThan(2);
    const [at] = cps[1] as [number, string];
    const bad = { ...record, checkpoints: cps.map(([i, h]): [number, string] => [i, i === at ? "0" : h]) };
    const r1 = replayChecked(bad, card);
    expect(r1.divergence).toMatchObject({ reason: "checkpoint", index: cps[0]?.[0] });
    expect(r1.applied).toBe(cps[0]?.[0]);
    const broken = {
      ...record,
      decisions: record.decisions.map((d, i) => (i === 30 ? d.map((x) => (x === d[0] ? "p9" : x)) : d)),
    };
    const r2 = replayChecked(broken as GameRecord, card);
    expect(r2.divergence).toMatchObject({ reason: "error", index: 30 });
    expect(r2.applied).toBe(30);
  }, 60_000);

  it("local save (checkpointEvery: 1): one fingerprint per decision, the divergence is found to the exact decision", async () => {
    const { state, events, record } = createRecordedGame({
      seed: 99,
      players: [
        { id: "p1", name: "Alice", deck: buildDeck(deckById("welcome-blue")) },
        { id: "p2", name: "Bob", deck: buildDeck(deckById("welcome-black")) },
      ],
    });
    const host = new GameHost(
      state,
      { agents: { p1: randomAgent(3), p2: heuristicAgent() }, record, checkpointEvery: 1 },
      events,
    );
    await host.run();
    const saved = JSON.parse(JSON.stringify(record)) as GameRecord;
    const n = saved.decisions.length;
    expect(saved.checkpoints?.map(([i]) => i)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(replayChecked(saved, card).divergence).toBeNull();
    const bad = { ...saved, checkpoints: saved.checkpoints?.map(([i, h]): [number, string] => [i, i === 40 ? "0" : h]) };
    const r = replayChecked(bad, card);
    expect(r.divergence).toMatchObject({ reason: "checkpoint", index: 39 });
    expect(r.applied).toBe(39);
  }, 60_000);

  it("the fingerprint depends on neither ids, nor the cache version, nor chance", async () => {
    const { final } = await recorded();
    const other = structuredClone(final);
    other.version += 7;
    other.rng += 1;
    other.timestamp += 3;
    other.idCounters = { e: 999 };
    expect(outcomeHash(other)).toBe(outcomeHash(final));
    const p1 = other.players.p1;
    if (p1) p1.life -= 1;
    expect(outcomeHash(other)).not.toBe(outcomeHash(final));
  }, 60_000);

  it("rejects a file that is not a recording", () => {
    expect(isGameRecord({ format: "autre" })).toBe(false);
    expect(isGameRecord(null)).toBe(false);
  });
});
