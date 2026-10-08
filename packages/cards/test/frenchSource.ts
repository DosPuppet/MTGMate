/**
 * Detects French in the repository's code and documents (PLAN-I: code and documentation in English). Used by
 * `english-source.test.ts` and `tools/french-source.ts`.
 *
 * A line is French when it has two French function words, or one with an accented French word or a verb in "-ez"; a
 * lone accented word counts too, unless it belongs to an English card name (Séance Board, Éowyn…). Data that is French
 * on purpose (catalogs, Scryfall data, `french-overrides.json`) is out of scope.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CARDS } from "../src/index";

export const ROOT = new URL("../../../", import.meta.url);

const STOPWORDS = new Set(
  (
    "le la les des du un une est sont vous votre vos nous pour avec dans qui que pas sur aux au ce cette ces ses leur " +
    "leurs il elle ne et à où été être peut plus sans mais ou chaque carte cartes créature créatures joueur adversaire"
  ).split(" "),
);
const ACCENTED = /[éèêàùçœÉÈÊÀ]/;

/** Files in scope: tracked sources, styles, scripts, documents, and the data files written by hand. */
const SCOPE = /\.(ts|tsx|js|mjs|cjs|css|html|md|ya?ml|sh|txt)$/;
const HAND_DATA = [
  /^packages\/cards\/decks\/[^/]+\.json$/,
  /^packages\/cards\/data\/(debt-baseline|audit-baseline|legality-overrides|commander)\.json$/,
];
const EXCLUDED = [/^packages\/[^/]+\/locales\//, /^packages\/client\/public\/sounds\//];

let englishNameWords: Set<string> | undefined;

/** Accented words of English card names: not French. */
function nameWords(): Set<string> {
  if (!englishNameWords) {
    englishNameWords = new Set();
    for (const c of Object.values(CARDS))
      for (const d of [c, ...(c.faceDefs ?? [])])
        for (const w of d.name.split(/[^\p{L}'’-]+/u)) if (ACCENTED.test(w)) englishNameWords.add(w.toLowerCase());
  }
  return englishNameWords;
}

/** Whether one line of text is French. */
export function isFrenchLine(line: string): boolean {
  const words = line.toLowerCase().split(/[^\p{L}'’-]+/u);
  const stop = new Set<string>();
  let accented = false;
  let ez = false;
  for (const raw of words) {
    const w = raw.replace(/^[ldjnstcqu]['’]/, "");
    if (STOPWORDS.has(w)) stop.add(w);
    if (ACCENTED.test(w) && !nameWords().has(raw)) accented = true;
    if (/^\p{L}{3,}ez$/u.test(w)) ez = true;
  }
  if (stop.size >= 2) return true;
  if (stop.size === 1 && (accented || ez)) return true;
  return accented;
}

export function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && (SCOPE.test(f) || HAND_DATA.some((r) => r.test(f))) && !EXCLUDED.some((r) => r.test(f)));
}

/** French lines of a file (1-based line numbers). */
export function frenchLines(file: string): { line: number; text: string }[] {
  let text: string;
  try {
    text = readFileSync(new URL(file, ROOT), "utf8");
  } catch {
    return []; // deleted in the working tree
  }
  return text
    .split("\n")
    .map((t, i) => ({ line: i + 1, text: t }))
    .filter((l) => isFrenchLine(l.text));
}

/** Files that still contain French, with their number of French lines. */
export function frenchFiles(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of trackedFiles()) {
    const n = frenchLines(f).length;
    if (n) out[f] = n;
  }
  return out;
}
