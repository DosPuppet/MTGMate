/** Enregistrement et rejeu d'une partie (`engine/src/record.ts`) : même graine + mêmes décisions = même partie. */
import { buildDeck, card, deckById } from "@mtgx/cards";
import { createRecordedGame, GameHost, isGameRecord, replayGame, replayStates } from "@mtgx/engine";
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

  it("refuse un fichier qui n'est pas un enregistrement", () => {
    expect(isGameRecord({ format: "autre" })).toBe(false);
    expect(isGameRecord(null)).toBe(false);
  });
});
