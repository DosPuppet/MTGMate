/**
 * F/E définies par une capacité et bonus « pour chaque » (`perAmount`) : calculés pendant le calcul des couches par
 * `cdaValue`, qui ne connaît que certaines sortes de montants (`CDA_AMOUNT_KINDS`) ; une autre sorte vaudrait 0 sans rien
 * dire. Aucune carte gérée ne doit en utiliser (docs/plans/PLAN-C.md, lot C10).
 */
import { type Amount, CDA_AMOUNT_KINDS, cdaKey } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { implementedCards } from "../src/index";

function kinds(a: Amount | undefined, out: string[] = []): string[] {
  if (a === undefined || typeof a === "number") return out;
  out.push(cdaKey(a));
  if (a.kind === "sum") for (const x of a.of) kinds(x, out);
  return out;
}

describe("montants des F/E définies par une capacité", () => {
  it("toutes les sortes utilisées sont calculées par cdaValue", () => {
    const bad: string[] = [];
    for (const c of implementedCards()) {
      const amounts: (Amount | undefined)[] = [c.cdaPT, c.cdaPower, c.cdaToughness];
      for (const ab of c.abilities) if (ab.kind === "static" && ab.perAmount !== undefined) amounts.push(ab.perAmount);
      for (const a of amounts) for (const k of kinds(a)) if (!CDA_AMOUNT_KINDS.has(k)) bad.push(`${c.name} : ${k}`);
    }
    expect(bad).toEqual([]);
  });
});
