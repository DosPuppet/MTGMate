/**
 * Budget de taille du bundle de l'interface (docs/plans/PLAN-C.md, lot C3) : construit le client (`vite build`) et vérifie
 * la taille de chaque chunk. Le worker de la partie ne doit pas embarquer les cartes (il reçoit ses définitions).
 *
 * Usage : npx tsx tools/bundle-size.ts   (lancé par `npm run verify`)
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";

const KB = 1024;
/** Taille maximale de chaque chunk (préfixe du nom → octets). */
const BUDGET: Record<string, number> = {
  "game.worker": 600 * KB,
  index: 2300 * KB,
  cartes: 6500 * KB,
  bibliotheques: 450 * KB,
};

execSync("npm run build -w @mtgx/client", { stdio: "pipe" });
const dir = new URL("../packages/client/dist/assets/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const errors: string[] = [];
const sizes: string[] = [];
for (const [prefix, max] of Object.entries(BUDGET)) {
  const file = files.find((f) => f.startsWith(`${prefix}-`));
  if (!file) {
    errors.push(`chunk ${prefix} introuvable`);
    continue;
  }
  const size = statSync(new URL(file, dir)).size;
  sizes.push(`${prefix} ${Math.round(size / KB)} Ko`);
  if (size > max) errors.push(`${prefix} : ${Math.round(size / KB)} Ko, budget ${Math.round(max / KB)} Ko`);
}
// Une carte scriptée dans le worker veut dire qu'il importe @mtgx/cards (règle de CLAUDE.md, « Bundle »).
const worker = files.find((f) => f.startsWith("game.worker-"));
if (worker && readFileSync(new URL(worker, dir), "utf8").includes("Luminous Rebuke"))
  errors.push("le worker embarque les cartes (@mtgx/cards importé)");
console.log(`bundle : ${sizes.join(", ")}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
