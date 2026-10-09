/** "Always answer this way" (PLAN-L L8): the kept answer to a trigger's "may" question, applied by the autopilot. */
import { describe, expect, it } from "vitest";
import { autopilotDecision, DEFAULT_AUTOPILOT } from "../src/autopilot";
import { act, idOf, lands, passUntil, scenario } from "./helpers";

describe("kept answers (PLAN-L L8)", () => {
  it('Solemn Simulacrum: the "may" of its trigger can be kept; the autopilot answers it, even in full control', () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Solemn Simulacrum"], library: ["Forest", "Island"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Solemn Simulacrum") });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    const key = p?.kind === "choice" ? p.request.remember : undefined;
    expect(p?.kind === "choice" && p.request.intent).toBe("may");
    // Card, ability, question: the same from one game to the next.
    expect(key).toBe("solemn-simulacrum:0:0:may");
    // Without a kept answer, the player is asked.
    expect(autopilotDecision(s, "p1", DEFAULT_AUTOPILOT)).toBeNull();
    const kept = { ...DEFAULT_AUTOPILOT, autoAnswers: { [key as string]: 0 as const } };
    expect(autopilotDecision(s, "p1", kept)).toEqual({ type: "choose", values: [0] });
    expect(autopilotDecision(s, "p1", { ...kept, fullControl: true })).toEqual({ type: "choose", values: [0] });
    // Another ability's key: no effect.
    expect(autopilotDecision(s, "p1", { ...DEFAULT_AUTOPILOT, autoAnswers: { other: 1 } })).toBeNull();
  });
});
