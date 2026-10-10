/**
 * Ability flags (script structure): the engine recognizes an equip ability only by `equip: true`
 * (Kíli, Freya, turn log "activate an equip ability") and an exhaust ability only by `exhaust: true`
 * (a single activation, triggers "whenever you activate an exhaust ability"); an ability written by
 * hand without the flag looks like one but is not. Every kind of counter placed by a script has a French name.
 */
import { COUNTER_LABELS } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { implementedCards, TOKEN_SPECS } from "../src/index";

type J = unknown;
const isObj = (x: J): x is Record<string, J> => !!x && typeof x === "object" && !Array.isArray(x);

/** A holder of abilities and text: card, face, token (`TokenSpec`, nested in an effect or in the registry). */
interface Holder {
  name: string;
  text?: string;
  abilities: Record<string, J>[];
}

/** Card, faces and tokens created by its effects, each with its top-level abilities and its text. */
function holders(def: Record<string, J>): Holder[] {
  const out: Holder[] = [];
  const abilitiesOf = (x: Record<string, J>) => (Array.isArray(x.abilities) ? x.abilities.filter(isObj) : []);
  const faces = Array.isArray(def.faceDefs) ? def.faceDefs.filter(isObj) : [];
  // Multi-faced card: each face has its own text and abilities (the card takes those of the front face).
  if (faces.length)
    for (const f of faces) out.push({ name: `${def.name} / ${f.name}`, text: f.text as string, abilities: abilitiesOf(f) });
  else out.push({ name: String(def.name), text: def.text as string, abilities: abilitiesOf(def) });
  // Tokens created by the card or by one of its faces: a specification with a name, types, no card id.
  const walk = (n: J): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (!isObj(n)) return;
    if (n.id === undefined && typeof n.name === "string" && Array.isArray(n.types) && Array.isArray(n.abilities))
      out.push({ name: `${def.name} → token ${n.name}`, text: n.text as string | undefined, abilities: abilitiesOf(n) });
    for (const v of Object.values(n)) walk(v);
  };
  walk(def);
  return out;
}

const ALL: Holder[] = [
  ...implementedCards().flatMap((d) => holders(d as unknown as Record<string, J>)),
  ...Object.entries(TOKEN_SPECS).map(([k, t]) => ({
    name: `token ${k}`,
    text: t.text,
    abilities: (t.abilities ?? []) as unknown as Record<string, J>[],
  })),
];

const label = (ab: Record<string, J>) => (typeof ab.label === "string" ? ab.label : "");
const activatedAbilities = (h: Holder) => h.abilities.filter((ab) => ab.kind === "activated");
/** Oracle text lines that start with the keyword (reminder text in parentheses starts none). */
const clauses = (text: string | undefined, re: RegExp) => (text ?? "").split("\n").filter((l) => re.test(l)).length;

/** A family of abilities recognized by a flag: label, flag, Oracle clause. */
interface Family {
  name: string;
  label: RegExp;
  flag: "equip" | "exhaust";
  clause: RegExp;
  /** Intended deviations from the clause count: holder → expected number of abilities, with the reason. */
  exceptions: Record<string, { n: number; reason: string }>;
}

const FAMILIES: Family[] = [
  {
    name: "equip",
    label: /^(Équiper|Equip)\b/, // i18n-ignore: matches French Oracle text
    flag: "equip",
    // "Equip {2}", "Equip Pirate {1}", "Gae Bolg — Equip {4}"; not "Equip abilities you activate…".
    clause: /^(?:[^—(]+ — )?Equip\b(?! abilit)/,
    exceptions: {
      "Bloodthorn Flail": { n: 2, reason: '"Equip—Pay {3} or discard a card": one ability per possible cost' },
    },
  },
  {
    name: "exhaust",
    label: /^(Épuisement|Exhaust)\b/, // i18n-ignore: matches French Oracle text
    flag: "exhaust",
    clause: /^(?:[^—(]+ — )?Exhaust —/,
    exceptions: {},
  },
];

/** Deviations of a family: ability with the family label but without the flag, count different from the clauses'. */
function mismatches(f: Family): string[] {
  const bad: string[] = [];
  for (const h of ALL) {
    const acts = activatedAbilities(h);
    for (const ab of acts)
      if (f.label.test(label(ab)) && ab[f.flag] !== true) bad.push(`${h.name}: "${label(ab)}" without ${f.flag}: true`);
    if (h.text === undefined) continue;
    const n = acts.filter((ab) => ab[f.flag] === true).length;
    const want = f.exceptions[h.name]?.n ?? clauses(h.text, f.clause);
    if (n !== want) bad.push(`${h.name}: ${n} "${f.flag}" ability(ies) for ${want} expected`);
  }
  return bad;
}

describe("ability flags", () => {
  for (const f of FAMILIES) {
    it(`${f.name} abilities: flag \`${f.flag}\`, one per Oracle clause`, () => {
      expect(mismatches(f)).toEqual([]);
    });

    it(`${f.name} abilities: the exceptions are still needed`, () => {
      const stale = Object.keys(f.exceptions).filter((name) => {
        const h = ALL.find((x) => x.name === name);
        return !h || clauses(h.text, f.clause) === f.exceptions[name]?.n;
      });
      expect(stale).toEqual([]);
    });
  }
});

/**
 * Counter kinds named by scripts: fields that carry a kind (`counter`, `withCounter`…), and the `kind` of
 * counter effects and costs (`addCounters`, `removeCounters`, `counters` of a move…).
 */
const COUNTER_KEYS = new Set([
  "counter",
  "perCounter",
  "withCounter",
  "removeCountersX",
  "addCounter",
  "removeCounter",
  "counterKind",
]);
const COUNTER_HOLDERS = new Set(["addCounters", "removeCounters", "removeCounterFrom", "counters", "moveCounter"]);
const COUNTER_OPS = new Set(["addCounters", "removeCounters", "counterOnOrCreate", "countersDivided", "moveCounter"]);
/** Kinds with no name to translate ("+1/+1") or wildcards ("any kind"); the P/T counters ("+2/+2", 122.1a) too. */
const UNNAMED = new Set(["+1/+1", "-1/-1", "any", "*"]);
const PT_COUNTER = /^[+-]\d+\/[+-]\d+$/;

function counterKinds(n: J, parentKey: string, out: Map<string, string>, where: string): void {
  if (Array.isArray(n)) {
    for (const x of n) counterKinds(x, parentKey, out, where);
    return;
  }
  if (!isObj(n)) return;
  const holder = COUNTER_HOLDERS.has(parentKey) || (typeof n.op === "string" && COUNTER_OPS.has(n.op));
  for (const [k, v] of Object.entries(n)) {
    if (typeof v === "string" && (COUNTER_KEYS.has(k) || (holder && k === "kind"))) out.set(v, out.get(v) ?? where);
    counterKinds(v, k, out, where);
  }
}

describe("counter names", () => {
  it("every kind of counter placed or read by a script has a French name", () => {
    const kinds = new Map<string, string>();
    for (const d of implementedCards()) counterKinds(d, "", kinds, d.name);
    for (const [k, t] of Object.entries(TOKEN_SPECS)) counterKinds(t, "", kinds, `token ${k}`);
    const missing = [...kinds]
      .filter(([k]) => !UNNAMED.has(k) && !PT_COUNTER.test(k) && !COUNTER_LABELS[k])
      .map(([k, w]) => `${k} (${w})`);
    expect(missing).toEqual([]);
  });
});
