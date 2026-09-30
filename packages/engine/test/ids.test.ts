/** Identifiants (PLAN-R.md, lot F1) : un compteur par préfixe, pour que les décisions enregistrées visent toujours les mêmes objets. */
import { describe, expect, it } from "vitest";
import { newId } from "../src/state";
import { scenario } from "./helpers";

describe("identifiants", () => {
  it("créer un effet ou un déclencheur ne décale pas les identifiants des objets", () => {
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
