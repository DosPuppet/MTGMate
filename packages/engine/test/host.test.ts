import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { type Agent, fallbackDecision, GameHost } from "../src";
import { createScenario } from "../src/scenario";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** IA minimale : joue un terrain quand elle peut (action visible), sinon la décision par défaut. */
const landPlayer: Agent = (s, me) => {
  const p = s.pending;
  if (p?.kind === "priority" && s.turn.active === me && s.turn.step === "main1" && s.turn.landsPlayed === 0) {
    const land = s.players[me]?.hand[0];
    if (land) return { type: "playLand", card: land };
  }
  return fallbackDecision(s, p as NonNullable<typeof p>);
};

describe("GameHost", () => {
  it("une décision humaine arrivée pendant la pause de l'IA relance la partie", async () => {
    const forest = card("Forest");
    const { state, events } = createScenario({
      seed: 1,
      active: "p2",
      players: [
        { id: "p1", name: "Vous", library: Array(10).fill(forest), hand: [forest] },
        { id: "p2", name: "IA", library: Array(10).fill(forest), hand: [forest, forest] },
      ],
    });
    const host = new GameHost(state, { agents: { p2: landPlayer }, aiDelay: 60, sleep }, events);
    // L'IA joue son terrain (action visible), puis la partie arrive à une décision de l'humain pendant la pause.
    const first = host.run();
    await sleep(20);
    expect(host.state.pending?.player).toBe("p1");
    // L'humain passe pendant la pause : la boucle en cours doit reprendre et faire jouer l'IA ensuite.
    const p = host.state.pending;
    if (p?.kind === "priority") await host.submitHuman("p1", { type: "pass" });
    await first;
    await sleep(200);
    // Plus aucune décision d'IA en souffrance : c'est de nouveau à l'humain (ou la partie a avancé d'autant).
    expect(host.state.pending?.player).toBe("p1");
  });
});
