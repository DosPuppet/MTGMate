/**
 * Targets and references (script structure): in each ability, every `ref.target(id)` (and `cond.targetMatches`)
 * must name a target declared under that name, a binding of a delayed ability (`bind`) or a name bound by the engine;
 * every declared target must be used. Otherwise the target is asked from the player, then the effect finds nothing and does nothing
 * (Mirelurk Queen: `target.player("p")` read by `ref.target()`, that is "t").
 */
import { describe, expect, it } from "vitest";
import { implementedCards } from "../src/index";

/** Declared but unread targets, on purpose: documented approximation in docs/approximations.md. */
const UNUSED_OK: Record<string, string> = {};

type J = unknown;
const isObj = (x: J): x is Record<string, J> => !!x && typeof x === "object" && !Array.isArray(x);

function collect(node: J, declared: Set<string>, refs: Set<string>): void {
  if (Array.isArray(node)) {
    for (const x of node) collect(x, declared, refs);
    return;
  }
  if (!isObj(node)) return;
  if (Array.isArray(node.targets)) for (const t of node.targets) if (isObj(t) && typeof t.id === "string") declared.add(t.id);
  // Delayed ability: its names are bound at creation (`fx.delayed(…, { k: ref.stored("k") })`).
  if (isObj(node.bind)) for (const k of Object.keys(node.bind)) declared.add(k);
  // "Your next spell": the engine binds this spell to "s" (stack.ts, `nextSpell.trigger`).
  if (isObj(node.nextSpell) && Array.isArray(node.nextSpell.trigger)) declared.add("s");
  if (node.kind === "target" && typeof node.id === "string") refs.add(node.id);
  if (node.kind === "targetMatches" && typeof node.spec === "string") refs.add(node.spec);
  for (const v of Object.values(node)) collect(v, declared, refs);
}

/** Independent units of a card: each ability, the spell, and likewise for each face. */
function units(def: Record<string, J>): [string, J][] {
  const out: [string, J][] = [];
  const add = (label: string, x: J) => {
    if (Array.isArray(x)) for (const [i, a] of x.entries()) out.push([`${label}[${i}]`, a]);
    else if (x) out.push([label, x]);
  };
  add("abilities", def.abilities);
  add("spell", def.spell);
  if (Array.isArray(def.faces))
    def.faces.forEach((f, i) => {
      if (!isObj(f)) return;
      add(`faces[${i}].abilities`, f.abilities);
      add(`faces[${i}].spell`, f.spell);
    });
  return out;
}

describe("script targets and references", () => {
  const missing: string[] = [];
  const unused: string[] = [];
  for (const def of implementedCards()) {
    for (const [label, unit] of units(def as unknown as Record<string, J>)) {
      const declared = new Set<string>();
      const refs = new Set<string>();
      collect(unit, declared, refs);
      for (const r of refs) if (!declared.has(r)) missing.push(`${def.name} (${label}): ref.target("${r}") without a target`);
      if (UNUSED_OK[def.name] === undefined)
        for (const d of declared) if (!refs.has(d)) unused.push(`${def.name} (${label}): target "${d}" never read`);
    }
  }

  it("every reference to a target names a declared target", () => {
    expect(missing).toEqual([]);
  });

  it("every declared target is read by an effect or a condition", () => {
    expect(unused).toEqual([]);
  });

  it("the exceptions are still needed", () => {
    const stale = Object.keys(UNUSED_OK).filter((name) => {
      const def = implementedCards().find((c) => c.name === name);
      if (!def) return true;
      return units(def as unknown as Record<string, J>).every(([, unit]) => {
        const declared = new Set<string>();
        const refs = new Set<string>();
        collect(unit, declared, refs);
        return [...declared].every((d) => refs.has(d));
      });
    });
    expect(stale).toEqual([]);
  });
});
