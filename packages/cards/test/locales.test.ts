/**
 * French catalogs (PLAN-I): every player-facing English text has its French entry, and no entry is stale.
 *
 * Message ids come from:
 * - the source of the engine, the cards, the client and the server: the string literal given to `msg(…)`, `t(…)` or
 *   `tr(lang, …)` (comments are skipped); a call whose text is not a literal is refused, so that the scan sees every id;
 * - the cards, walked at run time (final definitions and tokens): `label`, `prompt` and the values of `labels`, with
 *   the values of their `msg` arguments; a set is checked once its scripts are in English (`translated`).
 *
 * Catalogs are JSON objects with sorted keys (`npx tsx tools/locales.ts` rewrites them); one key has one translation
 * across all catalogs, since the client merges them.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseText } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import frenchBaseline from "../data/french-baseline.json";
import { CARDS, TOKEN_SPECS } from "../src/index";
import { FRENCH_CATALOGS } from "../src/locales";
import { SETS } from "../src/sets";

const PACKAGES = new URL("../../", import.meta.url);
const SOURCE_DIRS = ["engine/src", "cards/src", "client/src", "server/src"];
/** Files that define the text functions themselves (their calls pass a variable on purpose). */
const IMPLEMENTATION = new Set(["engine/src/text.ts", "client/src/translate.ts", "client/src/localize.ts"]);

function catalogFiles(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const read = (path: string) => {
    if (existsSync(new URL(path, PACKAGES))) out[path] = JSON.parse(readFileSync(new URL(path, PACKAGES), "utf8"));
  };
  read("engine/locales/fr.json");
  read("client/locales/fr.json");
  read("server/locales/fr.json");
  for (const f of readdirSync(new URL("cards/locales/fr/", PACKAGES)).sort()) read(`cards/locales/fr/${f}`);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, PACKAGES), { withFileTypes: true })) {
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(e.name)) out.push(path);
    }
  };
  if (existsSync(new URL(dir, PACKAGES))) walk(dir);
  return out;
}

/** Source without its comments (block comments, and line comments that start a line or follow a space). */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** The string literal at `i` (`"…"`, `'…'` or a template literal without `${…}`), or `undefined`. */
function literalAt(code: string, i: number): string | undefined {
  const q = code[i];
  if (q !== '"' && q !== "'" && q !== "`") return undefined;
  let j = i + 1;
  while (j < code.length && code[j] !== q) j += code[j] === "\\" ? 2 : 1;
  const body = code.slice(i + 1, j);
  if (q === "`") return body.includes("${") ? undefined : body;
  return q === '"' ? JSON.parse(`"${body}"`) : JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
}

interface Scan {
  ids: Set<string>;
  nonLiteral: string[];
}

function scanSources(): Scan {
  const ids = new Set<string>();
  const nonLiteral: string[] = [];
  for (const dir of SOURCE_DIRS)
    for (const file of sourceFiles(dir)) {
      const code = stripComments(readFileSync(new URL(file, PACKAGES), "utf8"));
      for (const m of code.matchAll(/(?<![\w.$])(?:(msg|t)\(\s*|tr\(\s*[^,()]+,\s*)/g)) {
        const at = (m.index ?? 0) + m[0].length;
        const text = literalAt(code, at);
        if (text !== undefined) ids.add(text);
        else if (!IMPLEMENTATION.has(file) && code[at] !== ")") {
          const line = code.slice(0, at).split("\n").length;
          nonLiteral.push(`${file}:${line}`);
        }
      }
    }
  return { ids, nonLiteral };
}

/** Whether an argument value of a `msg` text is itself text to translate (not a number, symbol or card reference). */
const isWords = (v: string) => /\p{Ll}{2}/u.test(v) && !/^⟦[^⟧]*⟧$/.test(v);

/** Message ids of a card text, with those of its arguments. */
function textIds(text: string, into: Set<string>): void {
  const { id, args } = parseText(text);
  into.add(id);
  for (const v of Object.values(args)) if (isWords(v)) textIds(v, into);
}

/**
 * Message ids of the cards, by owner: the set whose script defines the card (`src/<set>/`, lower case), "core" for the
 * tokens and the labels that `scryfall.ts` deduces. Final definitions are walked, so deduced labels are included.
 */
function cardIds(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>([["core", new Set()]]);
  const owner = new Map<string, string>();
  for (const set of SETS) {
    out.set(set.code.toLowerCase(), new Set());
    for (const raw of set.data) if (!owner.has(raw.name)) owner.set(raw.name, set.code.toLowerCase());
  }
  const walk = (v: unknown, ids: Set<string>): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, ids);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if ((k === "label" || k === "prompt") && typeof x === "string") textIds(x, ids);
        else if (k === "labels" && x && typeof x === "object" && !Array.isArray(x)) {
          for (const l of Object.values(x)) if (typeof l === "string") textIds(l, ids);
        } else if (k !== "fr") walk(x, ids);
      }
    }
  };
  for (const c of Object.values(CARDS)) {
    const set = owner.get(c.name) ?? "core";
    // Text deduced from Scryfall (`scryfall.ts`) is "core"; the rest belongs to the script of the set.
    walk(c, out.get(set) as Set<string>);
  }
  walk(Object.values(TOKEN_SPECS), out.get("core") as Set<string>);
  return out;
}

/**
 * Whether the texts of an owner are checked: once its source is in English (no file of `src/<set>/`, or of the root of
 * `src/` for "core", left in the French baseline).
 */
function translated(owner: string): boolean {
  const prefix = owner === "core" ? "packages/cards/src/" : `packages/cards/src/${owner}/`;
  return !frenchBaseline.files.some((f) => f.startsWith(prefix) && (owner !== "core" || !f.slice(prefix.length).includes("/")));
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("French catalogs (PLAN-I)", () => {
  const catalogs = catalogFiles();
  const french = new Map<string, { file: string; text: string }>();
  const conflicts: string[] = [];
  for (const [file, entries] of Object.entries(catalogs))
    for (const [id, text] of Object.entries(entries)) {
      const seen = french.get(id);
      if (seen && seen.text !== text) conflicts.push(`${id}: ${seen.file} « ${seen.text} », ${file} « ${text} »`);
      else french.set(id, { file, text });
    }
  const scan = scanSources();
  const cards = cardIds();
  const checkedCards = [...cards].filter(([set]) => translated(set));

  it("every file of cards/locales/fr is listed in FRENCH_CATALOGS, and each set catalog names a set", () => {
    const files = readdirSync(new URL("cards/locales/fr/", PACKAGES)).map((f) => f.replace(/\.json$/, ""));
    expect(files.sort()).toEqual(Object.keys(FRENCH_CATALOGS).sort());
    for (const name of files) expect(cards.has(name), name).toBe(true);
  });

  it("catalogs have sorted keys, non-empty translations with the same placeholders", () => {
    const bad: string[] = [];
    for (const [file, entries] of Object.entries(catalogs)) {
      const keys = Object.keys(entries);
      if (keys.join("\n") !== [...keys].sort().join("\n")) bad.push(`${file}: keys not sorted (npx tsx tools/locales.ts)`);
      for (const [id, text] of Object.entries(entries)) {
        if (!text.trim()) bad.push(`${file}: empty translation for « ${id} »`);
        else if (placeholders(id).join() !== placeholders(text).join()) bad.push(`${file}: placeholders differ in « ${id} »`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("one message id has one translation across catalogs", () => {
    expect(conflicts).toEqual([]);
  });

  it("every text function is given a string literal", () => {
    expect(scan.nonLiteral, "msg/t/tr with a non-literal text: the catalog test cannot see it").toEqual([]);
  });

  it("every message id of the source has a French entry", () => {
    expect([...scan.ids].filter((id) => !french.has(id)).sort()).toEqual([]);
  });

  it("every message id of a translated set has a French entry", () => {
    const missing = checkedCards.flatMap(([set, ids]) => [...ids].filter((id) => !french.has(id)).map((id) => `${set}: ${id}`));
    expect(missing.sort()).toEqual([]);
  });

  it("no catalog entry is stale", () => {
    const used = new Set(scan.ids);
    for (const ids of cards.values()) for (const id of ids) used.add(id);
    expect([...french.keys()].filter((id) => !used.has(id)).sort()).toEqual([]);
  });
});
