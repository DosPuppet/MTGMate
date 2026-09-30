/**
 * Tournoi d'IA : deux IA s'affrontent en duel, places et decks alternés, pour mesurer leur force relative.
 *
 * Usage : npm run arena -- --a expert --b medium [--games 200] [--pool decks|all|mix|meta] [--seed 1] [--jobs 8]
 *                          [--budget 150]
 *
 * IA : random, beginner, medium, expert ; « expert:200 » donne un budget propre
 * à cette IA (« expert:0 » : sans ISMCTS).
 * Les parties vont par paires : même graine et mêmes decks, places et decks échangés (l'avantage du premier joueur
 * et des decks s'annule). --budget : itérations de l'ISMCTS (un budget en itérations rend le tournoi reproductible).
 * --pool decks : decks préconstruits ; all : decks aléatoires bicolores ; mix : moitié-moitié ; meta : les decks du
 * méta Standard jouables (docs/meta/).
 */
import { fork } from "node:child_process";
import { type AiLevel, aiAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS } from "@mtgx/cards";
import type { Agent, CardDef } from "@mtgx/engine";
import { metaDecks } from "./meta-decks";
import { randomDeck } from "./random-deck";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const A = arg("a", "expert");
const B = arg("b", "medium");
const games = Number(arg("games", "200"));
const seed0 = Number(arg("seed", "1"));
const pool = arg("pool", "mix");
const jobs = Math.max(1, Number(arg("jobs", "1")));
const budget = Number(arg("budget", "150"));
const worker = process.argv.includes("--worker");

/** « expert:200 » : niveau et budget propre (itérations de l'ISMCTS ; 0 = sans ISMCTS). */
function agent(spec: string, seed: number): Agent {
  const [name, own] = spec.split(":");
  if (name === "random") return randomAgent(seed);
  if (name === "beginner" || name === "medium" || name === "expert")
    return aiAgent(name as AiLevel, { seed, budget: { iterations: own === undefined ? budget : Number(own) }, players: 2 });
  throw new Error(`IA inconnue : ${spec}`);
}

/** Decks de la paire de parties `pair` : deux decks différents. */
const META = pool === "meta" ? metaDecks().filter((d) => d.playable) : [];

function decksFor(pair: number): [CardDef[], CardDef[]] {
  if (pool === "meta") {
    const n = META.length;
    const i = pair % n;
    const j = (i + 1 + (Math.floor(pair / n) % (n - 1))) % n;
    return [buildDeck(META[i]!), buildDeck(META[j]!)];
  }
  const usePrecons = pool === "decks" || (pool === "mix" && pair % 2 === 0);
  if (usePrecons) {
    const n = DECKS.length;
    const i = pair % n;
    const j = (i + 1 + (Math.floor(pair / n) % (n - 1))) % n;
    return [buildDeck(DECKS[i]!), buildDeck(DECKS[j]!)];
  }
  return [randomDeck(seed0 * 7919 + pair * 2), randomDeck(seed0 * 7919 + pair * 2 + 1)];
}

interface Tally {
  a: number;
  b: number;
  draws: number;
  unfinished: number;
  turns: number;
  time: Record<"a" | "b", number[]>;
}

/** Enveloppe un agent pour mesurer son temps de réflexion. */
function timed(inner: Agent, into: number[]): Agent {
  return (s, p) => {
    const t0 = performance.now();
    const d = inner(s, p);
    into.push(performance.now() - t0);
    return d;
  };
}

function run(first: number, count: number): Tally {
  const t: Tally = { a: 0, b: 0, draws: 0, unfinished: 0, turns: 0, time: { a: [], b: [] } };
  for (let g = first; g < first + count; g++) {
    const pair = Math.floor(g / 2);
    const swap = g % 2 === 1;
    const seed = seed0 + pair;
    const [d1, d2] = decksFor(pair);
    // Partie paire : A joue le premier deck en p1 ; partie impaire : B joue ce deck en p1, A l'autre en p2.
    const agentA = timed(agent(A, seed * 2 + 1), t.time.a);
    const agentB = timed(agent(B, seed * 2 + 2), t.time.b);
    const r = playGame({
      seed,
      decks: [d1, d2],
      agents: swap ? [agentB, agentA] : [agentA, agentB],
      maxDecisions: 8000,
    });
    t.turns += r.turns;
    if (!r.state.over) t.unfinished++;
    else if (!r.state.winner) t.draws++;
    else if ((r.state.winner === "p1") !== swap) t.a++;
    else t.b++;
  }
  return t;
}

const pct = (x: number) => (100 * x).toFixed(1);
function report(t: Tally, ms: number): void {
  const decided = t.a + t.b;
  const p = decided ? t.a / decided : 0;
  const ci = decided ? 1.96 * Math.sqrt((p * (1 - p)) / decided) : 0;
  const stat = (xs: number[]) => {
    const sorted = [...xs].sort((x, y) => x - y);
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    return `${mean.toFixed(2)} ms/déc (p95 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)}, max ${(sorted.at(-1) ?? 0).toFixed(0)})`;
  };
  console.log(
    `${A} contre ${B} : ${games} parties (pool ${pool}${[A, B].some((x) => x.startsWith("expert")) ? `, budget ${budget}` : ""}) en ${(ms / 1000).toFixed(0)} s`,
  );
  console.log(
    `  ${A} gagne ${pct(p)} % ± ${pct(ci)} (${t.a} / ${decided}) · nuls ${t.draws} · inachevées ${t.unfinished} · ${(t.turns / games).toFixed(1)} tours en moyenne`,
  );
  console.log(`  ${A} : ${stat(t.time.a)}`);
  console.log(`  ${B} : ${stat(t.time.b)}`);
}

const t0 = performance.now();
if (worker) {
  process.send?.(run(Number(arg("first", "0")), games), () => process.exit(0));
} else if (jobs > 1) {
  // Tranches de paires entières, une par processus.
  const pairs = Math.ceil(games / 2);
  const per = Math.ceil(pairs / jobs);
  const slices = Array.from({ length: jobs }, (_, j) => ({
    first: j * per * 2,
    count: Math.min(per * 2, games - j * per * 2),
  })).filter((x) => x.count > 0);
  const results = await Promise.all(
    slices.map(
      (sl) =>
        new Promise<Tally>((resolve, reject) => {
          const args = process.argv
            .slice(2)
            .filter((a, k, all) => !["--games", "--jobs"].includes(a) && !["--games", "--jobs"].includes(all[k - 1] ?? ""));
          const child = fork(
            process.argv[1] as string,
            [...args, "--games", String(sl.count), "--first", String(sl.first), "--worker"],
            {
              execArgv: process.execArgv,
            },
          );
          let got: Tally | null = null;
          child.on("message", (m) => {
            got = m as Tally;
          });
          child.on("exit", (code) =>
            got && code === 0 ? resolve(got) : reject(new Error(`tournoi : processus en échec (${code})`)),
          );
        }),
    ),
  );
  const total: Tally = { a: 0, b: 0, draws: 0, unfinished: 0, turns: 0, time: { a: [], b: [] } };
  for (const r of results) {
    total.a += r.a;
    total.b += r.b;
    total.draws += r.draws;
    total.unfinished += r.unfinished;
    total.turns += r.turns;
    total.time.a.push(...r.time.a);
    total.time.b.push(...r.time.b);
  }
  report(total, performance.now() - t0);
} else report(run(0, games), performance.now() - t0);
