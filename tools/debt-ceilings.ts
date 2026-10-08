/**
 * Ceilings of the model's surfaces (debt guard, `packages/cards/test/debt.test.ts`, `ceilings` section): prints the
 * gaps between the measurement and the baseline; `--write "reason"` updates the baseline and notes the reason in
 * `ceilingNotes` (a raise is justified in the lot; a drop is noted too).
 *
 * Usage: npx tsx tools/debt-ceilings.ts [--write "PLAN-C C6: face-down exile (406.3)"]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { measureSurfaces } from "../packages/cards/test/debtSurface";

const file = new URL("../packages/cards/data/debt-baseline.json", import.meta.url);
const base = JSON.parse(readFileSync(file, "utf8"));
const measured = measureSurfaces();
const changes = Object.entries(measured).filter(([k, v]) => base.ceilings[k] !== v);
for (const [k, v] of changes) console.log(`${k}: ${base.ceilings[k]} → ${v}`);
if (changes.length === 0) console.log("Ceilings up to date.");
const i = process.argv.indexOf("--write");
if (i >= 0 && changes.length) {
  const reason = process.argv[i + 1];
  if (!reason) throw new Error("--write requires a reason");
  // The detail of the changes is added here: the reason need not repeat it.
  const diff = changes.map(([k, v]) => `${k} ${base.ceilings[k] ?? "—"} → ${v}`).join(", ");
  const note = reason.includes(diff) ? reason : `${reason}: ${diff}`;
  base.ceilings = measured;
  base.ceilingNotes = [...(base.ceilingNotes ?? []), note];
  writeFileSync(file, `${JSON.stringify(base, null, 2)}\n`);
}
