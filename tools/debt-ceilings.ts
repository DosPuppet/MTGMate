/**
 * Plafonds des surfaces du modèle (garde-fou de la dette, `packages/cards/test/debt.test.ts`, section `ceilings`) :
 * affiche les écarts entre la mesure et la référence ; `--write "raison"` met la référence à jour et note la raison dans
 * `ceilingNotes` (un relèvement se justifie dans le lot ; une baisse se note aussi).
 *
 * Usage : npx tsx tools/debt-ceilings.ts [--write "PLAN-C C6 : exil face cachée (406.3)"]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { measureSurfaces } from "../packages/cards/test/debtSurface";

const file = new URL("../packages/cards/data/debt-baseline.json", import.meta.url);
const base = JSON.parse(readFileSync(file, "utf8"));
const measured = measureSurfaces();
const changes = Object.entries(measured).filter(([k, v]) => base.ceilings[k] !== v);
for (const [k, v] of changes) console.log(`${k} : ${base.ceilings[k]} → ${v}`);
if (changes.length === 0) console.log("Plafonds à jour.");
const i = process.argv.indexOf("--write");
if (i >= 0 && changes.length) {
  const reason = process.argv[i + 1];
  if (!reason) throw new Error("--write demande une raison");
  // Le détail des changements est ajouté ici : la raison n'a pas à le répéter.
  const diff = changes.map(([k, v]) => `${k} ${base.ceilings[k] ?? "—"} → ${v}`).join(", ");
  const note = reason.includes(diff) ? reason : `${reason} : ${diff}`;
  base.ceilings = measured;
  base.ceilingNotes = [...(base.ceilingNotes ?? []), note];
  writeFileSync(file, `${JSON.stringify(base, null, 2)}\n`);
}
