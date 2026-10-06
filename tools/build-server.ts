/**
 * Serveur compilé pour la production (PLAN-C, lot C16) : un seul fichier `packages/server/dist/main.mjs` (moteur, cartes,
 * ws compris), lancé par Node sans `tsx` (`deploy/ecosystem.config.cjs`). Le commit est inscrit dans le fichier
 * (`MTGX_BUILD`, affiché par `/healthz`).
 *
 * Usage : npm run build:server
 */
import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "packages", "server", "dist", "main.mjs");

let commit = "inconnu";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  if (execSync("git status --porcelain", { cwd: root }).toString().trim()) commit += "+modifié";
} catch {
  // Hors d'un dépôt git : version inconnue.
}

await build({
  entryPoints: [join(root, "packages", "server", "src", "main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // Dépendances natives facultatives de ws : absentes, ws s'en passe.
  external: ["bufferutil", "utf-8-validate"],
  define: { "process.env.MTGX_BUILD": JSON.stringify(commit) },
  // Modules CommonJS empaquetés (ws) : `require` en ESM.
  banner: { js: "import { createRequire as __mtgxRequire } from 'node:module'; const require = __mtgxRequire(import.meta.url);" },
  logLevel: "warning",
});
// Worker des sièges IA (PLAN-E, E14) : un second fichier à côté du serveur, chargé par `aiPool.ts`.
const workerFile = join(root, "packages", "server", "dist", "ai-worker.mjs");
await build({
  entryPoints: [join(root, "packages", "server", "src", "aiWorker.ts")],
  outfile: workerFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  banner: { js: "import { createRequire as __mtgxRequire } from 'node:module'; const require = __mtgxRequire(import.meta.url);" },
  logLevel: "warning",
});
console.log(`Worker d'IA compilé : ${workerFile} (${(statSync(workerFile).size / 1_048_576).toFixed(1)} Mo)`);
console.log(`Serveur compilé : ${outfile} (${(statSync(outfile).size / 1_048_576).toFixed(1)} Mo, ${commit})`);
