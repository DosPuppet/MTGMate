/**
 * Plafonds de sécurité (`limits.ts` ; docs/plans/PLAN-C.md, lot C1) : une coupure émet `capReached`, rien sinon.
 */
import { describe, expect, it } from "vitest";
import { collectEvents } from "../src/events";
import { MAX_AMOUNT, MAX_PERMUTED } from "../src/limits";
import { chooseReplacementOrder } from "../src/modifiers";

describe("plafonds de sécurité", () => {
  it("un montant remplacé au-delà du plafond est coupé et signalé", () => {
    const [n, events] = collectEvents(() => chooseReplacementOrder(1000, [{ times: 2000 }], "max"));
    expect(n).toBe(MAX_AMOUNT);
    expect(events).toEqual([{ type: "capReached", cap: "amount" }]);
  });

  it("un montant ordinaire n'émet rien", () => {
    const [n, events] = collectEvents(() => chooseReplacementOrder(3, [{ add: 1 }, { times: 2 }], "min"));
    expect(n).toBe(7);
    expect(events).toEqual([]);
  });

  it("trop de remplacements à ordonner : l'ordre du code, signalé", () => {
    const mods = [{ times: 2 }, ...Array.from({ length: MAX_PERMUTED }, () => ({ add: 1 }))];
    const [n, events] = collectEvents(() => chooseReplacementOrder(1, mods, "max"));
    expect(n).toBe(2 + MAX_PERMUTED);
    expect(events).toEqual([{ type: "capReached", cap: "permutations" }]);
  });
});
