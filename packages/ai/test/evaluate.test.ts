/**
 * Evaluation v2: Auras, Equipment and pump spells count for their lasting effect on creatures.
 */
import { type Agent, fallbackDecision, type GameState, type PlayerId, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { idOf, passUntil, scenario } from "../../engine/test/helpers";
import { aiAgent, heuristicAgent } from "../src";

const LEVELS: [string, Agent][] = [
  ["medium", heuristicAgent()],
  ["high", aiAgent("expert", { seed: 1, budget: { iterations: 60 } })],
];

/**
 * The AI plays its whole turn (main phases and combat; the opponent passes and does not block);
 * returns the state at the end of its turn.
 */
function playTurn(s: GameState, ai: Agent, me: PlayerId): GameState {
  let cur = s;
  const turn = s.turn.number;
  for (let i = 0; i < 80 && cur.pending && !cur.over && cur.turn.number === turn; i++) {
    const p = cur.pending;
    cur = submit(cur, p.player, p.player === me ? ai(cur, me) : fallbackDecision(cur, p)).state;
  }
  return cur;
}

describe("evaluation v2", () => {
  for (const [name, ai] of LEVELS) {
    it(`${name} : Pacifism on the biggest threat`, () => {
      const s = scenario({
        p1: { battlefield: ["Plains", "Plains"], hand: ["Pacifism"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const d = ai(s, "p1");
      expect(d.type).toBe("cast");
      const target = d.type === "cast" ? Object.values(d.targets ?? {}).flat()[0] : undefined;
      expect(target).toBe(idOf(s, "p2", "battlefield", "Fire Elemental"));
    });

    it(`${name} : casts an Equipment and equips a creature during its turn`, () => {
      const s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains", "Plains", "Bear Cub"], hand: ["Goldvein Pick"] } });
      const after = playTurn(s, ai, "p1");
      const pick = after.battlefield.find((id) => after.defs[after.objects[id]?.defId ?? ""]?.name === "Goldvein Pick");
      expect(pick).toBeDefined();
      expect(after.objects[pick ?? ""]?.attachedTo).toBe(idOf(after, "p1", "battlefield", "Bear Cub"));
    });
  }

  it("does not cast a temporary pump spell in the main phase for no reason", () => {
    const s = scenario({ p1: { battlefield: ["Mountain", "Mountain", "Bear Cub"], hand: ["Bulk Up"] } });
    expect(heuristicAgent()(s, "p1").type).toBe("pass");
  });

  it("uses a temporary pump spell to win a combat", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Mountain", "Mountain", "Bear Cub"], hand: ["Sure Strike"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const fe = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = submit(s, "p2", { type: "declareAttackers", attackers: [{ id: fe, defender: "p1" }] }).state;
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = submit(s, "p1", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p1", "battlefield", "Bear Cub"), attacker: fe }],
    }).state;
    s = submit(s, "p2", { type: "pass" }).state;
    expect(heuristicAgent()(s, "p1").type).toBe("cast");
  });
});
