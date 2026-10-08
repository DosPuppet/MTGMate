import type { GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { combatPreview } from "../src/board/combatPreview";

const creature = (id: string, controller: string, power: number, toughness: number, keywords: string[] = []) =>
  ({ id, controller, power, toughness, damage: 0, keywords }) as unknown as ObjectView;

const view = (...objs: ObjectView[]) => ({ battlefield: objs, players: { p1: {}, p2: {} } }) as unknown as GameView;

describe("combat damage preview", () => {
  it("unblocked attacker: the defender loses life equal to its power; lifelink: the attacker gains as much", () => {
    const v = view(creature("a", "p1", 3, 3, ["lifelink"]));
    expect(combatPreview(v, [{ id: "a", defender: "p2" }], {})).toEqual({ lifeLoss: { p2: 3, p1: -3 }, dies: [] });
  });

  it("block: each deals damage to the other; trample carries the excess over to the player", () => {
    const v = view(creature("a", "p1", 5, 5, ["trample"]), creature("b", "p2", 2, 2));
    const p = combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" });
    expect(p?.lifeLoss).toEqual({ p2: 3 });
    expect(p?.dies).toEqual(["b"]);
  });

  it("first strike: a blocker killed first deals no damage", () => {
    const v = view(creature("a", "p1", 2, 2, ["firstStrike"]), creature("b", "p2", 2, 2));
    expect(combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" })?.dies).toEqual(["b"]);
  });

  it("deathtouch: 1 damage is enough, and trample carries the rest over", () => {
    const v = view(creature("a", "p1", 4, 4, ["deathtouch", "trample"]), creature("b", "p2", 1, 6));
    const p = combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" });
    expect(p?.lifeLoss).toEqual({ p2: 3 });
    expect(p?.dies).toEqual(["b"]);
  });

  it("no attacker: no preview", () => {
    expect(combatPreview(view(), [], {})).toBeNull();
  });
});
