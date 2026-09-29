/**
 * Fuzzing du moteur : parties IA contre IA avec vérification d'invariants à chaque décision.
 *
 * Usage : npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed|beginner|medium|expert|levels|chaos] [--players 2]
 *                        [--pool decks|all|meta|<SET>]
 *                        [--jobs N]
 *
 * --pool all : decks aléatoires bicolores tirés de toutes les cartes gérées par le moteur.
 * --pool FIN : decks tirés d'abord des cartes de cette extension (complétés par les autres cartes gérées).
 * --pool meta : les decks du méta Standard déjà jouables (`docs/meta/`, plan P4), les uns contre les autres.
 * --jobs N : les parties sont réparties sur N processus (graines contiguës), les résultats sont additionnés.
 * --ai : heuristic = medium ; mixed : une IA moyenne contre des IA aléatoires ; levels : les trois niveaux mélangés
 * (l'ISMCTS du niveau élevé avec un petit budget en itérations, pour rester rapide) ; chaos : IA aléatoires, et avant chaque
 * décision, des variantes corrompues qui doivent être refusées par une RulesError sans modifier l'état.
 */
import { fork } from "node:child_process";
import { type AiLevel, aiAgent, heuristicAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS } from "@mtgx/cards";
import type { Agent, CardDef } from "@mtgx/engine";
import { metaDecks } from "./meta-decks";
import { randomDeck } from "./random-deck";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const games = Number(arg("games", "200"));
const seed0 = Number(arg("seed", "1"));
const mode = arg("ai", "random");
const players = Math.max(2, Number(arg("players", "2")));
const pool = arg("pool", "decks");
const jobs = Math.max(1, Number(arg("jobs", "1")));
const worker = process.argv.includes("--worker");

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

const agentFor = (seed: number, which: number): Agent => {
  if (mode === "heuristic") return heuristicAgent();
  if (mode === "levels" || (LEVELS as string[]).includes(mode)) {
    const level = mode === "levels" ? (LEVELS[(seed + which) % 3] as AiLevel) : (mode as AiLevel);
    return aiAgent(level, { seed: seed * 7 + which, budget: { iterations: 12 }, players });
  }
  if (mode === "mixed") return which === 0 ? heuristicAgent() : randomAgent(seed * 7 + which);
  return randomAgent(seed * 7 + which);
};

const meta = pool === "meta" ? metaDecks().filter((d) => d.playable) : [];
if (pool === "meta" && meta.length === 0) throw new Error("Aucun deck du méta n'est encore jouable");

const deckFor = (seed: number, g: number, i: number): CardDef[] =>
  pool === "decks"
    ? buildDeck(DECKS[(g + i) % DECKS.length]!)
    : pool === "meta"
      ? buildDeck(meta[(g + i) % meta.length]!)
      : randomDeck(seed * 31 + i, pool === "all" ? undefined : pool.toUpperCase());

interface Tally {
  wins: Record<string, number>;
  turns: number;
  illegal: number;
  decisions: number;
}

/** Joue `count` parties à partir de la graine `first` (dans ce processus). */
function run(first: number, count: number): Tally {
  const tally: Tally = { wins: { nul: 0, inachevée: 0 }, turns: 0, illegal: 0, decisions: 0 };
  for (let g = first - seed0; g < first - seed0 + count; g++) {
    const seed = seed0 + g;
    const ids = Array.from({ length: players }, (_, i) => i);
    const r = playGame({
      seed,
      decks: ids.map((i) => deckFor(seed, g, i)),
      agents: ids.map((i) => agentFor(seed, i)),
      maxDecisions: 5000 * players,
      check: true,
      chaos: mode === "chaos" ? { seed: seed * 13 + 5, perDecision: 3 } : undefined,
    });
    const key = !r.state.over ? "inachevée" : (r.state.winner ?? "nul");
    tally.wins[key] = (tally.wins[key] ?? 0) + 1;
    tally.turns += r.turns;
    tally.illegal += r.illegal;
    tally.decisions += r.decisions.length;
  }
  return tally;
}

const t0 = performance.now();
let total: Tally;
if (worker) {
  // Processus fils : joue sa tranche et renvoie le décompte au parent.
  total = run(seed0, games);
  process.send?.(total, () => process.exit(0));
} else if (jobs > 1) {
  const per = Math.ceil(games / jobs);
  const slices = Array.from({ length: jobs }, (_, j) => ({
    seed: seed0 + j * per,
    count: Math.min(per, games - j * per),
  })).filter((x) => x.count > 0);
  const results = await Promise.all(
    slices.map(
      (sl) =>
        new Promise<Tally>((resolve, reject) => {
          const args = process.argv
            .slice(2)
            .filter(
              (a, k, all) =>
                !["--games", "--seed", "--jobs"].includes(a) && !["--games", "--seed", "--jobs"].includes(all[k - 1] ?? ""),
            );
          const child = fork(
            process.argv[1] as string,
            [...args, "--games", String(sl.count), "--seed", String(sl.seed), "--worker"],
            {
              execArgv: process.execArgv,
            },
          );
          let got: Tally | null = null;
          child.on("message", (m) => {
            got = m as Tally;
          });
          child.on("exit", (code) =>
            got && code === 0 ? resolve(got) : reject(new Error(`processus de fuzz (graine ${sl.seed}) : code ${code}`)),
          );
        }),
    ),
  );
  total = { wins: { nul: 0, inachevée: 0 }, turns: 0, illegal: 0, decisions: 0 };
  for (const r of results) {
    for (const [k, n] of Object.entries(r.wins)) total.wins[k] = (total.wins[k] ?? 0) + n;
    total.turns += r.turns;
    total.illegal += r.illegal;
    total.decisions += r.decisions;
  }
} else total = run(seed0, games);
// Le parent (ou un processus seul) affiche le bilan.
if (!worker) {
  const { wins, turns, illegal, decisions } = total;
  const ms = performance.now() - t0;
  console.log(
    `${games} parties à ${players} joueurs (${mode}, pool ${pool}) en ${(ms / 1000).toFixed(1)} s — ${(ms / decisions).toFixed(2)} ms/décision`,
  );
  console.log("résultats :", wins);
  console.log(`tours moyens : ${(turns / games).toFixed(1)}, décisions illégales de l'IA : ${illegal}`);
  if (wins.inachevée) process.exitCode = 1;
}
