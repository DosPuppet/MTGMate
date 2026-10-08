/** Identifiers (PLAN-R in docs/history.md, lot F1): one counter per prefix, so recorded decisions always target the same objects. */
import { describe, expect, it } from "vitest";
import { newId } from "../src/state";
import { scenario } from "./helpers";

describe("identifiants", () => {
  it("creating an effect or a trigger does not shift object identifiers", () => {
    const a = scenario({});
    const b = structuredClone(a);
    newId(b, "e");
    newId(b, "t");
    newId(b, "a");
    expect(newId(b)).toBe(newId(a));
    expect(newId(b, "e")).toBe("e2");
    expect(b.idCounters).toMatchObject({ e: 3, t: 2, a: 2 });
  });
});
