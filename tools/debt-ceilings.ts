/**
 * Plafonds des surfaces du modèle (garde-fou de la dette, `packages/cards/test/debt.test.ts`, section `ceilings`) :
 * affiche les écarts entre la mesure et la référence ; `--write "raison"` met la référence à jour et note la raison dans
 * `ceilingNotes` (un relèvement se justifie dans le lot ; une baisse se note aussi).
 *
 * Usage : npx tsx tools/debt-ceilings.ts [--write "PLAN-C C6 : exil face cachée (406.3)"]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { interfaceFields, unionVariants } from "../packages/cards/test/debtSurface";

const file = new URL("../packages/cards/data/debt-baseline.json", import.meta.url);
const base = JSON.parse(readFileSync(file, "utf8"));
const measured: Record<string, number> = {};
for (const n of [
  "CardDef",
  "GameObject",
  "StackItem",
  "PlayerState",
  "GameState",
  "ObjectFilter",
  "CostDef",
  "ActivatedAbilityDef",
  "CastPermissionAbilityDef",
  "PlayFromZone",
  "LayerMods",
])
  measured[n] = interfaceFields(n).length;
for (const [n, d] of [
  ["Effect", "op"],
  ["TriggerSpec", "on"],
  ["Condition", "kind"],
  ["Amount", "kind"],
  ["Ref", "kind"],
] as const) {
  const v = unionVariants(n, d);
  measured[n] = v.size;
  measured[`${n} (champs)`] = [...v.values()].reduce((a, f) => a + f.length, 0);
}
const changes = Object.entries(measured).filter(([k, v]) => base.ceilings[k] !== v);
for (const [k, v] of changes) console.log(`${k} : ${base.ceilings[k]} → ${v}`);
if (changes.length === 0) console.log("Plafonds à jour.");
const i = process.argv.indexOf("--write");
if (i >= 0 && changes.length) {
  const reason = process.argv[i + 1];
  if (!reason) throw new Error("--write demande une raison");
  const note = `${reason} : ${changes.map(([k, v]) => `${k} ${base.ceilings[k]} → ${v}`).join(", ")}`;
  base.ceilings = measured;
  base.ceilingNotes = [...(base.ceilingNotes ?? []), note];
  writeFileSync(file, `${JSON.stringify(base, null, 2)}\n`);
}
