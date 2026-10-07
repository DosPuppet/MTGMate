/**
 * Drapeaux des capacités (structure des scripts) : le moteur ne reconnaît une capacité d'équipement qu'à `equip: true`
 * (Kíli, Freya, journal du tour « activer une capacité d'équipement ») et une capacité d'exhaust qu'à `exhaust: true`
 * (une seule activation, déclencheurs « chaque fois que vous activez une capacité d'exhaust ») ; une capacité écrite à la
 * main sans le drapeau en a l'air, mais n'en est pas une. Chaque sorte de marqueur posée par un script a un nom français.
 */
import { COUNTER_LABELS } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { implementedCards, TOKEN_SPECS } from "../src/index";

type J = unknown;
const isObj = (x: J): x is Record<string, J> => !!x && typeof x === "object" && !Array.isArray(x);

/** Un porteur de capacités et de texte : carte, face, jeton (`TokenSpec`, imbriqué dans un effet ou dans le registre). */
interface Holder {
  name: string;
  text?: string;
  abilities: Record<string, J>[];
}

/** Carte, faces et jetons créés par ses effets, chacun avec ses capacités du premier niveau et son texte. */
function holders(def: Record<string, J>): Holder[] {
  const out: Holder[] = [];
  const abilitiesOf = (x: Record<string, J>) => (Array.isArray(x.abilities) ? x.abilities.filter(isObj) : []);
  const faces = Array.isArray(def.faceDefs) ? def.faceDefs.filter(isObj) : [];
  // Carte à plusieurs faces : chaque face a son texte et ses capacités (la carte reprend celles du recto).
  if (faces.length)
    for (const f of faces) out.push({ name: `${def.name} / ${f.name}`, text: f.text as string, abilities: abilitiesOf(f) });
  else out.push({ name: String(def.name), text: def.text as string, abilities: abilitiesOf(def) });
  // Jetons créés par la carte ou par l'une de ses faces : spécification avec un nom, des types, sans identifiant de carte.
  const walk = (n: J): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (!isObj(n)) return;
    if (n.id === undefined && typeof n.name === "string" && Array.isArray(n.types) && Array.isArray(n.abilities))
      out.push({ name: `${def.name} → jeton ${n.name}`, text: n.text as string | undefined, abilities: abilitiesOf(n) });
    for (const v of Object.values(n)) walk(v);
  };
  walk(def);
  return out;
}

const ALL: Holder[] = [
  ...implementedCards().flatMap((d) => holders(d as unknown as Record<string, J>)),
  ...Object.entries(TOKEN_SPECS).map(([k, t]) => ({
    name: `jeton ${k}`,
    text: t.text,
    abilities: (t.abilities ?? []) as unknown as Record<string, J>[],
  })),
];

const label = (ab: Record<string, J>) => (typeof ab.label === "string" ? ab.label : "");
const activatedAbilities = (h: Holder) => h.abilities.filter((ab) => ab.kind === "activated");
/** Lignes du texte Oracle qui commencent par le mot-clé (le rappel entre parenthèses n'en commence aucune). */
const clauses = (text: string | undefined, re: RegExp) => (text ?? "").split("\n").filter((l) => re.test(l)).length;

/** Une famille de capacités reconnue par un drapeau : libellé, drapeau, clause de l'Oracle. */
interface Family {
  name: string;
  label: RegExp;
  flag: "equip" | "exhaust";
  clause: RegExp;
  /** Écarts voulus au compte des clauses : porteur → nombre de capacités attendu, avec la raison. */
  exceptions: Record<string, { n: number; reason: string }>;
}

const FAMILIES: Family[] = [
  {
    name: "équipement",
    label: /^(Équiper|Equip)\b/,
    flag: "equip",
    // « Equip {2} », « Equip Pirate {1} », « Gae Bolg — Equip {4} » ; pas « Equip abilities you activate… ».
    clause: /^(?:[^—(]+ — )?Equip\b(?! abilit)/,
    exceptions: {
      "Bloodthorn Flail": { n: 2, reason: "« Equip—Pay {3} or discard a card » : une capacité par coût possible" },
    },
  },
  {
    name: "exhaust",
    label: /^(Épuisement|Exhaust)\b/,
    flag: "exhaust",
    clause: /^(?:[^—(]+ — )?Exhaust —/,
    exceptions: {},
  },
];

/** Écarts d'une famille : capacité au libellé de la famille sans le drapeau, nombre différent de celui des clauses. */
function mismatches(f: Family): string[] {
  const bad: string[] = [];
  for (const h of ALL) {
    const acts = activatedAbilities(h);
    for (const ab of acts)
      if (f.label.test(label(ab)) && ab[f.flag] !== true) bad.push(`${h.name} : « ${label(ab)} » sans ${f.flag}: true`);
    if (h.text === undefined) continue;
    const n = acts.filter((ab) => ab[f.flag] === true).length;
    const want = f.exceptions[h.name]?.n ?? clauses(h.text, f.clause);
    if (n !== want) bad.push(`${h.name} : ${n} capacité(s) « ${f.flag} » pour ${want} attendue(s)`);
  }
  return bad;
}

describe("drapeaux des capacités", () => {
  for (const f of FAMILIES) {
    it(`capacités d'${f.name} : drapeau \`${f.flag}\`, une par clause de l'Oracle`, () => {
      expect(mismatches(f)).toEqual([]);
    });

    it(`capacités d'${f.name} : les exceptions sont encore nécessaires`, () => {
      const stale = Object.keys(f.exceptions).filter((name) => {
        const h = ALL.find((x) => x.name === name);
        return !h || clauses(h.text, f.clause) === f.exceptions[name]?.n;
      });
      expect(stale).toEqual([]);
    });
  }
});

/**
 * Sortes de marqueurs nommées par les scripts : champs qui portent une sorte (`counter`, `withCounter`…), et `kind` des
 * effets et coûts de marqueurs (`addCounters`, `removeCounters`, `counters` d'un déplacement…).
 */
const COUNTER_KEYS = new Set([
  "counter",
  "perCounter",
  "whileHasCounter",
  "withCounter",
  "removeCountersX",
  "addCounter",
  "removeCounter",
  "counterKind",
  "addSourceCounters",
  "manaValueSourceCounters",
]);
const COUNTER_HOLDERS = new Set(["addCounters", "removeCounters", "removeCounterFrom", "counters", "moveCounter"]);
const COUNTER_OPS = new Set(["addCounters", "removeCounters", "counterOnOrCreate", "countersDivided", "moveCounter"]);
/** Sortes sans nom à traduire (« +1/+1 ») ou jokers (« n'importe quelle sorte »). */
const UNNAMED = new Set(["+1/+1", "-1/-1", "any", "*"]);

function counterKinds(n: J, parentKey: string, out: Map<string, string>, where: string): void {
  if (Array.isArray(n)) {
    for (const x of n) counterKinds(x, parentKey, out, where);
    return;
  }
  if (!isObj(n)) return;
  const holder = COUNTER_HOLDERS.has(parentKey) || (typeof n.op === "string" && COUNTER_OPS.has(n.op));
  for (const [k, v] of Object.entries(n)) {
    if (typeof v === "string" && (COUNTER_KEYS.has(k) || (holder && k === "kind"))) out.set(v, out.get(v) ?? where);
    if (isObj(v) && k === "manaValueSourceCounters" && typeof v.counter === "string") out.set(v.counter, where);
    counterKinds(v, k, out, where);
  }
}

describe("noms des marqueurs", () => {
  it("chaque sorte de marqueur posée ou lue par un script a un nom français", () => {
    const kinds = new Map<string, string>();
    for (const d of implementedCards()) counterKinds(d, "", kinds, d.name);
    for (const [k, t] of Object.entries(TOKEN_SPECS)) counterKinds(t, "", kinds, `jeton ${k}`);
    const missing = [...kinds].filter(([k]) => !UNNAMED.has(k) && !COUNTER_LABELS[k]).map(([k, w]) => `${k} (${w})`);
    expect(missing).toEqual([]);
  });
});
