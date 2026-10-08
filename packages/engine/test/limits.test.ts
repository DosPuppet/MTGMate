/**
 * Safety caps (`limits.ts`; PLAN-C in docs/history.md, lot C1): a cut emits `capReached`, nothing otherwise.
 */
import { describe, expect, it } from "vitest";
import { collectEvents } from "../src/events";
import { MAX_AMOUNT, MAX_PERMUTED } from "../src/limits";
import { chooseReplacementOrder } from "../src/modifiers";

describe("safety caps", () => {
  it("a replaced amount above the cap is cut and reported", () => {
    const [n, events] = collectEvents(() => chooseReplacementOrder(1000, [{ times: 2000 }], "max"));
    expect(n).toBe(MAX_AMOUNT);
    expect(events).toEqual([{ type: "capReached", cap: "amount" }]);
  });

  it("an ordinary amount emits nothing", () => {
    const [n, events] = collectEvents(() => chooseReplacementOrder(3, [{ add: 1 }, { times: 2 }], "min"));
    expect(n).toBe(7);
    expect(events).toEqual([]);
  });

  it("too many replacements to order: code order, reported", () => {
    const mods = [{ times: 2 }, ...Array.from({ length: MAX_PERMUTED }, () => ({ add: 1 }))];
    const [n, events] = collectEvents(() => chooseReplacementOrder(1, mods, "max"));
    expect(n).toBe(2 + MAX_PERMUTED);
    expect(events).toEqual([{ type: "capReached", cap: "permutations" }]);
  });
});
