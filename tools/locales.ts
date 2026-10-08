/**
 * Rewrites the French catalogs (PLAN-I) in their canonical form: keys sorted, one space of indentation. The catalog
 * test (`cards/test/locales.test.ts`) requires it.
 *
 * Usage: npx tsx tools/locales.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const PACKAGES = new URL("../packages/", import.meta.url);
const files = [
  "engine/locales/fr.json",
  "client/locales/fr.json",
  "server/locales/fr.json",
  ...readdirSync(new URL("cards/locales/fr/", PACKAGES)).map((f) => `cards/locales/fr/${f}`),
].filter((f) => existsSync(new URL(f, PACKAGES)));

let changed = 0;
for (const f of files) {
  const url = new URL(f, PACKAGES);
  const before = readFileSync(url, "utf8");
  const entries = JSON.parse(before) as Record<string, string>;
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((k) => [k, entries[k]]),
  );
  const after = `${JSON.stringify(sorted, null, 1)}\n`;
  if (after !== before) {
    writeFileSync(url, after);
    changed++;
  }
}
console.log(`${files.length} catalogs, ${changed} rewritten`);
