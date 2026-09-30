/** Enregistrement et rejeu d'une partie (`engine/src/record.ts`) : même graine + mêmes décisions = même partie. */
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

describe("enregistrement et rejeu", () => {
  it("une partie jouée par GameHost se rejoue à l'identique, jusqu'à l'état final", async () => {
    const { state, events, record } = createRecordedGame({
      seed: 1234,
      players: [
        { id: "p1", name: "Alice", deck: buildDeck(deckById("bienvenue-vert")) },
        { id: "p2", name: "Bob", deck: buildDeck(deckById("bienvenue-rouge")) },
      ],
    });
    const host = new GameHost(state, { agents: { p1: heuristicAgent(), p2: randomAgent(7) }, record }, events);
    await host.run();
    expect(host.state.over).toBe(true);
    expect(record.decisions.length).toBeGreaterThan(50);
    // L'enregistrement passe par JSON (fichier, disque du serveur) sans perte.
    const copy = JSON.parse(JSON.stringify(record));
    expect(isGameRecord(copy)).toBe(true);
    const replayed = replayGame(copy, card);
    expect(replayed.state).toEqual(host.state);
    // États intermédiaires : un par décision, le dernier identique.
    const states = replayStates(copy, card);
    expect(states).toHaveLength(record.decisions.length + 1);
    expect(states.at(-1)).toEqual(host.state);
    expect(replayGame(copy, card, 10).state).toEqual(states[10]);
  }, 60_000);

  async function recorded(): Promise<{ record: GameRecord; final: ReturnType<typeof replayGame>["state"] }> {
    const { state, events, record } = createRecordedGame({
      seed: 99,
      players: [
        { id: "p1", name: "Alice", deck: buildDeck(deckById("bienvenue-bleu")) },
        { id: "p2", name: "Bob", deck: buildDeck(deckById("bienvenue-noir")) },
      ],
    });
    const host = new GameHost(state, { agents: { p1: randomAgent(3), p2: heuristicAgent() }, record }, events);
    await host.run();
    return { record: JSON.parse(JSON.stringify(record)), final: host.state };
  }

  it("version des règles et points de contrôle : le rejeu vérifié retrouve chaque empreinte", async () => {
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

  it("rejeu vérifié : une empreinte fausse arrête au point de contrôle précédent ; une décision refusée, juste avant elle", async () => {
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

  it("l'empreinte ne dépend ni des identifiants, ni de la version du cache, ni du hasard", async () => {
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

  it("refuse un fichier qui n'est pas un enregistrement", () => {
    expect(isGameRecord({ format: "autre" })).toBe(false);
    expect(isGameRecord(null)).toBe(false);
  });
});
