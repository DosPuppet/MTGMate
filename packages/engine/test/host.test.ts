import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { type Agent, fallbackDecision, GameHost } from "../src";
import { createScenario } from "../src/scenario";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Minimal AI: plays a land when it can (visible action), otherwise the default decision. */
const landPlayer: Agent = (s, me) => {
  const p = s.pending;
  if (p?.kind === "priority" && s.turn.active === me && s.turn.step === "main1" && s.turn.landsPlayed === 0) {
    const land = s.players[me]?.hand[0];
    if (land) return { type: "playLand", card: land };
  }
  return fallbackDecision(s, p as NonNullable<typeof p>);
};

describe("GameHost", () => {
  it("a human decision arriving during the AI's pause restarts the game", async () => {
    const forest = card("Forest");
    const { state, events } = createScenario({
      seed: 1,
      active: "p2",
      players: [
        { id: "p1", name: "You", library: Array(10).fill(forest), hand: [forest] },
        { id: "p2", name: "IA", library: Array(10).fill(forest), hand: [forest, forest] },
      ],
    });
    const host = new GameHost(state, { agents: { p2: landPlayer }, aiDelay: 60, sleep }, events);
    // The AI plays its land (visible action), then the game reaches a human decision during the pause.
    const first = host.run();
    await sleep(20);
    expect(host.state.pending?.player).toBe("p1");
    // The human passes during the pause: the running loop must resume and let the AI play afterwards.
    const p = host.state.pending;
    if (p?.kind === "priority") await host.submitHuman("p1", { type: "pass" });
    await first;
    await sleep(200);
    // No AI decision left pending: it is the human's turn again (or the game advanced by as much).
    expect(host.state.pending?.player).toBe("p1");
  });

  it('"steps" mode: one update per resolution, no pending decision (intermediate)', async () => {
    const forest = card("Forest");
    const { state, events } = createScenario({
      seed: 1,
      active: "p1",
      players: [
        {
          id: "p1",
          name: "You",
          library: Array(10).fill(forest),
          hand: [card("Burst Lightning"), card("Burst Lightning")],
          battlefield: [{ def: card("Mountain") }, { def: card("Mountain") }],
        },
        { id: "p2", name: "IA", library: Array(10).fill(forest), hand: [] },
      ],
    });
    const updates: { pending: string | null; resolved: number }[] = [];
    const host = new GameHost(
      state,
      {
        agents: { p2: landPlayer },
        frames: true,
        onUpdate: (_p, view, evts) =>
          updates.push({ pending: view.pending?.kind ?? null, resolved: evts.filter((e) => e.type === "resolve").length }),
      },
      events,
    );
    await host.run();
    updates.length = 0;
    // Two spells cast one after the other (autopilot passes priority: each resolves right away).
    for (let i = 0; i < 2; i++) {
      const card0 = host.state.players.p1?.hand[0] as string;
      await host.submitHuman("p1", { type: "cast", card: card0, targets: { t: ["p2"] } });
    }
    const frames = updates.filter((u) => u.resolved > 0);
    expect(frames).toHaveLength(2);
    expect(frames.every((u) => u.pending === null)).toBe(true);
    // After each resolution, a final update gives control back to the human.
    expect(updates[updates.length - 1]?.pending).toBe("priority");
    expect(host.state.players.p2?.life).toBe(16);
  });
});
