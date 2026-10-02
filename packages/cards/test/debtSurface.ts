/**
 * Mesures des surfaces du moteur pour le garde-fou de la dette (debt.test.ts ; docs/plans/PLAN-C.md, lot C1).
 *
 * Le paquet `typescript` 7 n'expose pas l'API du compilateur : un petit analyseur suffit, les fichiers de types du moteur
 * étant réguliers (interfaces et unions d'objets à discriminant).
 */
import { readdirSync, readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

export const source = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

/** Le texte sans ses commentaires (les chaînes sont gardées telles quelles). */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    const next = text[i + 1];
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const OPEN = new Set(["{", "[", "("]);
const CLOSE = new Set(["}", "]", ")"]);

/** Indice de l'accolade fermante qui répond à celle de `start`. */
function matching(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (OPEN.has(c)) depth += 1;
    else if (CLOSE.has(c)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("accolade non fermée");
}

/** Noms des membres d'un corps d'objet de type (au premier niveau seulement). */
function members(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let atStart = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < body.length && body[j] !== c) j += body[j] === "\\" ? 2 : 1;
      i = j;
      atStart = false;
      continue;
    }
    if (OPEN.has(c)) {
      depth += 1;
      atStart = false;
      continue;
    }
    if (CLOSE.has(c)) {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (c === ";" || c === "\n" || c === ",") {
      atStart = true;
      continue;
    }
    if (atStart && /\S/.test(c)) {
      atStart = false;
      const m = /^(?:readonly\s+)?(\w+)\??\s*:/.exec(body.slice(i));
      if (m) out.push(m[1] as string);
    }
  }
  return out;
}

const MODEL_FILES = [
  "engine/src/types.ts",
  "engine/src/model/cards.ts",
  "engine/src/model/rules.ts",
  "engine/src/model/effects.ts",
  "engine/src/model/state.ts",
  "engine/src/model/decisions.ts",
];

let modelText: string | null = null;
function model(): string {
  modelText ??= MODEL_FILES.map((f) => stripComments(source(f))).join("\n");
  return modelText;
}

/** Champs d'une interface du modèle (sans ceux hérités par `extends`). */
export function interfaceFields(name: string): string[] {
  const text = model();
  const m = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(text);
  if (!m) throw new Error(`interface ${name} introuvable`);
  const open = m.index + m[0].length - 1;
  return members(text.slice(open + 1, matching(text, open)));
}

/** Variantes d'une union d'objets à discriminant : valeur du discriminant → champs de la variante. */
export function unionVariants(name: string, discriminant: string): Map<string, string[]> {
  const text = model();
  const m = new RegExp(`export type ${name}\\s*=`).exec(text);
  if (!m) throw new Error(`type ${name} introuvable`);
  const out = new Map<string, string[]>();
  let i = m.index + m[0].length;
  // L'union s'arrête au premier « ; » de premier niveau.
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === ";") break;
    if (c === '"') {
      // Membre littéral (« | "self" ») : compté comme une variante sans champ.
      const end = text.indexOf('"', i + 1);
      out.set(text.slice(i + 1, end), []);
      i = end;
      continue;
    }
    if (c === "{") {
      const end = matching(text, i);
      const body = text.slice(i + 1, end);
      const fields = members(body);
      const value = new RegExp(`(?:^|[;\\s{])${discriminant}\\??\\s*:\\s*"([^"]+)"`).exec(body)?.[1];
      if (value) out.set(value, fields);
      i = end;
    } else if (c === "(" || c === "[") i = matching(text, i);
  }
  if (out.size === 0) throw new Error(`union ${name} vide`);
  return out;
}

/** Noms de champs déclarés dans tout le modèle (interfaces et variantes). */
export function declaredFieldNames(): Set<string> {
  return new Set([...model().matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((m) => m[1] as string));
}

/** Imports d'exécution (hors `import type`) entre les fichiers de `engine/src`, puis plus grand cycle (Tarjan). */
export function largestImportCycle(): string[] {
  const dir = new URL("engine/src/", ROOT);
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}${e.name}/`);
      else if (e.name.endsWith(".ts")) files.push(`${rel}${e.name}`);
    }
  };
  walk("");
  const norm = (from: string, spec: string): string | null => {
    if (!spec.startsWith(".")) return null;
    const parts = from.split("/").slice(0, -1);
    for (const p of spec.split("/")) {
      if (p === "..") parts.pop();
      else if (p !== ".") parts.push(p);
    }
    const base = parts.join("/");
    return files.includes(`${base}.ts`) ? `${base}.ts` : files.includes(`${base}/index.ts`) ? `${base}/index.ts` : null;
  };
  const edges = new Map<string, string[]>();
  for (const f of files) {
    const text = stripComments(readFileSync(new URL(f, dir), "utf8"));
    const deps: string[] = [];
    for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)"/gm)) {
      if (m[2]) continue;
      // `import { type A, type B }` : seulement des types.
      const names = /\{([\s\S]*)\}/.exec(m[3] ?? "")?.[1];
      if (names?.split(",").every((n) => !n.trim() || n.trim().startsWith("type "))) continue;
      const to = norm(f, m[4] as string);
      if (to) deps.push(to);
    }
    edges.set(f, deps);
  }
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  let best: string[] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v) as number, idx.get(w) as number));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > best.length) best = comp;
    }
  };
  for (const f of files) if (!idx.has(f)) strong(f);
  return best.sort();
}

/** Chaînes littérales du code de `engine/src` (commentaires exclus). */
export function engineLiterals(): string[] {
  const dir = new URL("engine/src/", ROOT);
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}${e.name}/`);
      else if (e.name.endsWith(".ts")) {
        const text = stripComments(readFileSync(new URL(`${rel}${e.name}`, dir), "utf8"));
        for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push((m[1] ?? m[2]) as string);
      }
    }
  };
  walk("");
  return out;
}
