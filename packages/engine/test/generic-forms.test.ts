/**
 * PLAN-J: single-card forms of the model replaced by generic ones (debt pass of 2026-10-09). One test per removed
 * variant or field, on the card that used it, for the cases the merge could have changed.
 */
import { describe, expect, it } from "vitest";
import { bump, chars, moveObject } from "../src/state";
import { advanceUntil, idOf, lands, scenario } from "./helpers";

describe("PLAN-J J1: exact merges into existing forms", () => {
  it("Ketramose (exileAtLeast → count of exile): face-down cards and every owner's cards count", () => {
    const s = scenario({
      p1: { battlefield: ["Ketramose, the New Dawn"], graveyard: lands("Plains", 4) },
      p2: { graveyard: lands("Swamp", 3) },
    });
    const ketramose = idOf(s, "p1", "battlefield", "Ketramose, the New Dawn");
    const exile = (p: "p1" | "p2", faceDown: boolean) => {
      const id = s.players[p]?.graveyard[0] ?? "";
      const n = moveObject(s, id, "exile") ?? "";
      if (faceDown) (s.objects[n] as { exiledFaceDown?: string[] }).exiledFaceDown = [p];
      bump(s);
    };
    for (let i = 0; i < 4; i++) exile("p1", i % 2 === 0);
    for (let i = 0; i < 2; i++) exile("p2", false);
    // Six cards in exile: can't attack or block.
    expect(chars(s, ketramose).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    exile("p2", true);
    // Seven, two of them face down and three of them the opponent's.
    expect(chars(s, ketramose).keywords).not.toContain("cantAttack");
  });

  it("Sab-Sunen (evenCounters → odd amount): an odd number of counters of any kind", () => {
    const s = scenario({ p1: { battlefield: [{ name: "Sab-Sunen, Luxa Embodied", counters: { "+1/+1": 2 } }] } });
    const sab = idOf(s, "p1", "battlefield", "Sab-Sunen, Luxa Embodied");
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    const o = s.objects[sab];
    if (o) o.counters = { "+1/+1": 2, stun: 1 };
    bump(s);
    expect(chars(s, sab).keywords).toContain("cantAttack");
    if (o) o.counters = {};
    bump(s);
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
  });

  it("Wojek Investigator (opponentsWithMoreInHand → players where): only opponents with strictly more cards", () => {
    let s = scenario({
      players: 3,
      turn: 2,
      active: "p3",
      p1: { battlefield: ["Wojek Investigator"], hand: ["Opt"] },
      p2: { hand: ["Opt", "Opt"] },
      p3: { hand: ["Opt"] },
    });
    const clues = (x: typeof s) =>
      x.battlefield.filter((id) => x.objects[id]?.controller === "p1" && chars(x, id).name === "Clue").length;
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
    // p2 has more cards than p1 (2 > 1), p3 the same number: a single Clue.
    expect(clues(s)).toBe(1);
  });
});
