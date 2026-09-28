/**
 * Vérification d'un lot, parallélisée et chronométrée.
 *
 * Usage :
 *   npm run verify -- --set FIN     vérification d'un lot (fuzz ciblé sur l'extension, environ 2 min)
 *   npm run verify -- --full        vérification complète (fin d'extension, avant une fusion)
 *   options : --ui (force les tests d'interface), --no-ui (les saute)
 *
 * Chaque étape affiche sa durée ; le détail d'une étape n'est affiché qu'en cas d'échec
 * (journaux complets dans test-results/verify/). Les tests d'interface demandent Vite (npm run dev) :
 * par défaut, ils ne tournent que si le client, la vue ou le protocole ont changé depuis le dernier commit.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const full = flag("full");
const set = opt("set")?.toUpperCase();
if (!full && !set) {
  console.error("Préciser --set <extension> (vérification d'un lot) ou --full.");
  process.exit(2);
}
const jobs = Math.max(1, availableParallelism() - 2);
const LOGS = "test-results/verify";
mkdirSync(LOGS, { recursive: true });

interface Step {
  name: string;
  cmd: string;
  /** Ligne(s) de résultat à afficher même en cas de succès. */
  show?: RegExp;
}

interface Result {
  step: Step;
  ok: boolean;
  seconds: number;
  out: string;
}

function run(step: Step): Promise<Result> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", step.cmd], { env: { ...process.env, FORCE_COLOR: "0" } });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      const seconds = (performance.now() - t0) / 1000;
      writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, out);
      resolve({ step, ok: code === 0, seconds, out });
    });
  });
}

function report(r: Result): void {
  const shown = r.step.show ? (r.out.match(new RegExp(r.step.show, "gm")) ?? []).map((l) => l.trim()).join(" | ") : "";
  console.log(`${r.ok ? "✅" : "❌"} ${r.step.name.padEnd(28)} ${r.seconds.toFixed(1).padStart(6)} s  ${shown}`);
  if (!r.ok) console.log(`${r.out.split("\n").slice(-40).join("\n")}\n`);
}

/** Étapes lancées ensemble ; on attend la fin du groupe avant le suivant. */
async function group(steps: Step[]): Promise<boolean> {
  const results = await Promise.all(steps.map(run));
  for (const r of results) report(r);
  return results.every((r) => r.ok);
}

const fuzz = (name: string, args: string): Step => ({
  name,
  cmd: `npx tsx tools/fuzz.ts ${args} --jobs ${jobs}`,
  show: /^résultats : .*$/,
});

/** Fichiers modifiés depuis le dernier commit (suivis ou non). */
async function changedFiles(): Promise<string[]> {
  const r = await run({ name: "git-status", cmd: "git status --porcelain" });
  return r.out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

async function viteUp(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:5173/", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const t0 = performance.now();
let ok = true;

// 1. Contrôles statiques (légers, ensemble), puis vitest (il occupe déjà tous les cœurs).
ok &&= await group([
  { name: "tsc", cmd: "npx tsc -p tsconfig.json" },
  { name: "biome", cmd: "npx biome check .", show: /^Found .*$/ },
  {
    name: "couverture",
    cmd: `npx tsx tools/card-coverage.ts --set ${set ?? "standard"}`,
    show: /^.* cartes gérées .*$/,
  },
]);
ok &&= await group([{ name: "vitest", cmd: "npx vitest run", show: /^\s*Tests .*$/ }]);

// 2. Fuzz, l'un après l'autre (chacun sur tous les cœurs).
const fuzzes: Step[] = full
  ? [
      fuzz("fuzz 2 j. graine 1", "--games 300 --pool all --seed 1"),
      fuzz("fuzz 2 j. graine 1000", "--games 300 --pool all --seed 1000"),
      fuzz("fuzz 2 j. graine 5000", "--games 300 --pool all --seed 5000"),
      fuzz("fuzz 3 joueurs", "--games 200 --pool all --players 3"),
      fuzz("fuzz 4 joueurs", "--games 100 --pool all --players 4"),
      fuzz("fuzz IA mixte", "--games 100 --pool all --ai mixed"),
    ]
  : [
      fuzz(`fuzz ${set} 2 joueurs`, `--games 300 --pool ${set} --seed 1`),
      fuzz(`fuzz ${set} 3 joueurs`, `--games 100 --pool ${set} --players 3`),
      fuzz(`fuzz ${set} 4 joueurs`, `--games 60 --pool ${set} --players 4`),
      fuzz(`fuzz ${set} IA mixte`, `--games 60 --pool ${set} --ai mixed`),
      fuzz("fuzz tout le pool", "--games 200 --pool all --seed 2000"),
    ];
for (const f of fuzzes) ok = (await group([f])) && ok;

// 3. Bench (vérification complète seulement : il juge mal une régression d'un lot, surtout sur batterie).
if (full) ok = (await group([{ name: "bench", cmd: "npx tsx tools/bench.ts", show: /^(Cibles.*|.*non atteinte.*)$/ }])) && ok;

// 4. Tests d'interface, si le client, la vue ou le protocole ont changé (ou --ui, ou --full).
const changed = await changedFiles();
const uiTouched = changed.some((f) => /packages\/client\/|engine\/src\/view\.ts|server\/src\/protocol\.ts/.test(f));
if (!flag("no-ui") && (full || flag("ui") || uiTouched)) {
  if (await viteUp()) {
    // L'un après l'autre : en parallèle, les parties jouées dans le navigateur manquent de temps sous la charge.
    for (const step of [
      { name: "deck-smoke", cmd: "npx tsx tools/deck-smoke.ts", show: /^ok : partie lancée.*$/ },
      { name: "ui-smoke", cmd: "npx tsx tools/ui-smoke.ts", show: /^Aucune erreur de page\.$/ },
      { name: "battlefield-smoke", cmd: "npx tsx tools/battlefield-smoke.ts", show: /^ok : aucune erreur de page$/ },
      { name: "mobile-smoke", cmd: "npx tsx tools/mobile-smoke.ts", show: /^ok : aucune erreur de page$/ },
      { name: "proxy-smoke", cmd: "npx tsx tools/proxy-smoke.ts", show: /^ok : aucune erreur de page$/ },
    ])
      ok = (await group([step])) && ok;
  } else {
    console.log("⚠️  tests d'interface sautés : Vite ne répond pas sur http://localhost:5173 (lancer npm run dev)");
    ok = false;
  }
} else console.log("·  tests d'interface sautés (ni client, ni vue, ni protocole modifiés)");

console.log(
  `\n${ok ? "✅ Vérification réussie" : "❌ Vérification en échec"} en ${((performance.now() - t0) / 1000).toFixed(0)} s.`,
);
process.exitCode = ok ? 0 : 1;
