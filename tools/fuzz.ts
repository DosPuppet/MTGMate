/**
 * Engine fuzzing: AI-versus-AI games with an invariant check at every decision.
 *
 * Usage: npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed|beginner|medium|expert|levels|chaos] [--players 2] [--offers 4]
 *                        [--pool decks|all|meta|<SET>] [--format commander]
 *                        [--jobs N]
 *        npx tsx tools/fuzz.ts --batch <file.json> --jobs N    (several series, used by verify)
 *
 * --pool all: random two-color decks drawn from all the cards the engine handles.
 * --pool FIN: decks drawn first from the cards of this set (completed with the other handled cards).
 * --pool meta: the Standard meta decks already playable (`docs/meta/`, plan P4), against each other.
 * --format commander: Commander games (PLAN-E); random Commander decks drawn from the pool (`all` or a set: a legendary
 * commander and 99 singleton cards within its identity), or `--pool commander`: the playable Commander precons.
 * --jobs N: the games are spread over N processes, in small batches of contiguous seeds; each game depends only on its
 * seed, so the results are identical whatever N is.
 * --ai: heuristic = medium; mixed: one medium AI against random AIs; levels: the three levels mixed (the ISMCTS of the
 * high level with a small iteration budget, to stay fast); chaos: random AIs and, before each decision, corrupted
 * variants that must be refused by a RulesError without changing the state.
 * --batch: a JSON array of series `{ name, args }` (args: the options above, except --jobs). All the series share the
 * same process group (no start-up or waiting for the slowest between two series); one JSON line per finished series:
 * `{ name, ok, seconds, out }`.
 */
import { type ChildProcess, fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { type AiLevel, aiAgent, heuristicAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, buildGameDeck, CARDS, DECKS, validateDeck } from "@mtgx/cards";

/** Precons other than Commander (Commander decks are played with their own rules, PLAN-E). */
const PRECONS = DECKS.filter((d) => d.format !== "commander");

import type { Agent, CardDef } from "@mtgx/engine";
import { metaDecks } from "./meta-decks";
import { randomCommanderDeck, randomDeck } from "./random-deck";

/** A series of games. */
interface Spec {
  games: number;
  seed0: number;
  mode: string;
  players: number;
  pool: string;
  /** Every N priorities, each offered option must be accepted with its default choices (0: never). */
  offers: number;
  /** `commander`: Commander games (PLAN-E). */
  format?: string;
}

const argOf = (argv: string[], name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? def) : def;
};
const specOf = (argv: string[]): Spec => ({
  games: Number(argOf(argv, "games", "200")),
  seed0: Number(argOf(argv, "seed", "1")),
  mode: argOf(argv, "ai", "random"),
  players: Math.max(2, Number(argOf(argv, "players", "2"))),
  pool: argOf(argv, "pool", "decks"),
  offers: Number(argOf(argv, "offers", "0")),
  ...(argOf(argv, "format", "") ? { format: argOf(argv, "format", "") } : {}),
});

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

const agentFor = (spec: Spec, seed: number, which: number): Agent => {
  const { mode, players } = spec;
  if (mode === "heuristic") return heuristicAgent();
  if (mode === "levels" || (LEVELS as string[]).includes(mode)) {
    const level = mode === "levels" ? (LEVELS[(seed + which) % 3] as AiLevel) : (mode as AiLevel);
    return aiAgent(level, { seed: seed * 7 + which, budget: { iterations: 12 }, players });
  }
  if (mode === "mixed") return which === 0 ? heuristicAgent() : randomAgent(seed * 7 + which);
  return randomAgent(seed * 7 + which);
};

let metaCache: ReturnType<typeof metaDecks> | null = null;
const meta = () => {
  metaCache ??= metaDecks().filter((d) => d.playable);
  if (metaCache.length === 0) throw new Error("No meta deck is playable yet");
  return metaCache;
};

const deckFor = (spec: Spec, seed: number, g: number, i: number): CardDef[] =>
  spec.pool === "decks"
    ? buildDeck(PRECONS[(g + i) % PRECONS.length]!)
    : spec.pool === "meta"
      ? buildDeck(meta()[(g + i) % meta().length]!)
      : randomDeck(seed * 31 + i, spec.pool === "all" ? undefined : spec.pool.toUpperCase());

/** Playable Commander precons (`--pool commander`). */
let commanderPrecons: typeof DECKS | null = null;
const commanderPool = () => {
  commanderPrecons ??= DECKS.filter((d) => d.format === "commander" && validateDeck(d, CARDS, "commander").playable);
  if (commanderPrecons.length === 0) throw new Error("No Commander precon is playable yet");
  return commanderPrecons;
};

/** A player's Commander deck: a precon (`--pool commander`) or a random deck. */
const commanderDeckFor = (spec: Spec, seed: number, g: number, i: number): { deck: CardDef[]; commanders: number[] } => {
  if (spec.pool === "commander") {
    const pool = commanderPool();
    const built = buildGameDeck(pool[(g + i) % pool.length]!);
    return { deck: built.deck, commanders: built.commanders ?? [] };
  }
  return randomCommanderDeck(seed * 31 + i, spec.pool === "all" || spec.pool === "decks" ? undefined : spec.pool.toUpperCase());
};

interface Tally {
  wins: Record<string, number>;
  turns: number;
  illegal: number;
  decisions: number;
  caps: number;
  /**
   * Fingerprint of the games (sum modulo 2³² of one fingerprint per game: decisions, winner, life totals): independent
   * of `--jobs`; equal before and after a refactoring that must not change the game (PLAN-S).
   */
  print: number;
}

const emptyTally = (): Tally => ({ wins: { draw: 0, unfinished: 0 }, turns: 0, illegal: 0, decisions: 0, caps: 0, print: 0 });

/** FNV-1a 32 bits. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function addTally(total: Tally, r: Tally): void {
  for (const [k, n] of Object.entries(r.wins)) total.wins[k] = (total.wins[k] ?? 0) + n;
  total.turns += r.turns;
  total.illegal += r.illegal;
  total.decisions += r.decisions;
  total.caps += r.caps;
  total.print = (total.print + r.print) >>> 0;
}

/** Plays `count` games of the series from seed `first` (in this process). */
function run(spec: Spec, first: number, count: number): Tally {
  const tally = emptyTally();
  for (let g = first - spec.seed0; g < first - spec.seed0 + count; g++) {
    const seed = spec.seed0 + g;
    const ids = Array.from({ length: spec.players }, (_, i) => i);
    const commander = spec.format === "commander";
    const cmd = commander ? ids.map((i) => commanderDeckFor(spec, seed, g, i)) : null;
    const r = playGame({
      seed,
      decks: ids.map((i) => cmd?.[i]?.deck ?? deckFor(spec, seed, g, i)),
      ...(cmd ? { variant: "commander" as const, commanders: cmd.map((c) => c.commanders) } : {}),
      agents: ids.map((i) => agentFor(spec, seed, i)),
      // Commander: 40 life and 100 cards, much longer games.
      maxDecisions: (commander ? 15000 : 5000) * spec.players,
      check: true,
      chaos: spec.mode === "chaos" ? { seed: seed * 13 + 5, perDecision: 3 } : undefined,
      offers: spec.offers || undefined,
    });
    const key = !r.state.over ? "unfinished" : (r.state.winner ?? "draw");
    tally.wins[key] = (tally.wins[key] ?? 0) + 1;
    tally.turns += r.turns;
    tally.illegal += r.illegal;
    tally.decisions += r.decisions.length;
    tally.caps += r.caps;
    const life = Object.values(r.state.players).map((p) => p.life);
    tally.print = (tally.print + fnv(JSON.stringify([seed, key, r.turns, life, r.decisions]))) >>> 0;
  }
  return tally;
}

/** Summary of a series, in the format verify expects (`results: …`). */
function summary(spec: Spec, total: Tally, ms: number): string {
  const { wins, turns, illegal, decisions, caps, print } = total;
  return [
    `${spec.games} games with ${spec.players} players (${spec.mode}, pool ${spec.pool}${spec.format ? `, ${spec.format}` : ""}) in ${(ms / 1000).toFixed(1)} s — ${(ms / Math.max(1, decisions)).toFixed(2)} ms/decision`,
    `results: ${inspect(wins)}`,
    `average turns: ${(turns / spec.games).toFixed(1)}, illegal AI decisions: ${illegal}, caps reached: ${caps}`,
    `fingerprint: ${print.toString(16).padStart(8, "0")} (${decisions} decisions)`,
  ].join("\n");
}

interface Task {
  spec: number;
  first: number;
  count: number;
}
type FromWorker = { ok: true; tally: Tally } | { ok: false; error: string };

/**
 * Plays all the series on `jobs` persistent processes that take the batches in order. `done` is called when all the
 * batches of a series are finished.
 */
async function runPool(
  specs: Spec[],
  jobs: number,
  done: (i: number, total: Tally, error: string | null, ms: number) => void,
): Promise<void> {
  const tasks: Task[] = [];
  const remaining = specs.map(() => 0);
  for (const [i, spec] of specs.entries()) {
    // Batches small enough that the end of a series leaves no core idle.
    const size = Math.max(1, Math.ceil(spec.games / (jobs * 4)));
    for (let k = 0; k < spec.games; k += size) {
      tasks.push({ spec: i, first: spec.seed0 + k, count: Math.min(size, spec.games - k) });
      remaining[i]! += 1;
    }
  }
  const totals = specs.map(emptyTally);
  const errors: (string | null)[] = specs.map(() => null);
  const started: (number | null)[] = specs.map(() => null);
  let next = 0;
  const worker = () =>
    new Promise<void>((resolve, reject) => {
      const child: ChildProcess = fork(process.argv[1] as string, ["--worker"], { execArgv: process.execArgv });
      let current: Task | null = null;
      const feed = () => {
        current = tasks[next++] ?? null;
        if (!current) {
          child.send({ quit: true });
          return;
        }
        started[current.spec] ??= performance.now();
        child.send({ spec: specs[current.spec], first: current.first, count: current.count });
      };
      child.on("message", (m: FromWorker) => {
        const t = current as Task;
        if (m.ok) addTally(totals[t.spec]!, m.tally);
        else errors[t.spec] ??= m.error;
        remaining[t.spec]! -= 1;
        if (remaining[t.spec] === 0) done(t.spec, totals[t.spec]!, errors[t.spec] ?? null, performance.now() - started[t.spec]!);
        feed();
      });
      child.on("exit", (code) =>
        current === null ? resolve() : reject(new Error(`fuzz process stopped (code ${code}) during ${JSON.stringify(current)}`)),
      );
      feed();
    });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, worker));
}

const argv = process.argv.slice(2);
const jobs = Math.max(1, Number(argOf(argv, "jobs", "1")));

if (argv.includes("--worker")) {
  // Child process: plays the batches it receives, sends back a tally (or the error) for each.
  process.on("message", (m: { quit?: boolean; spec: Spec; first: number; count: number }) => {
    if (m.quit) {
      process.disconnect?.();
      return;
    }
    let reply: FromWorker;
    try {
      reply = { ok: true, tally: run(m.spec, m.first, m.count) };
    } catch (e) {
      reply = { ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e) };
    }
    process.send?.(reply);
  });
} else if (argv.includes("--batch")) {
  // Several series (verify): one JSON line per finished series.
  const batch = JSON.parse(readFileSync(argOf(argv, "batch", ""), "utf8")) as { name: string; args: string }[];
  const specs = batch.map((b) => specOf(b.args.split(/\s+/).filter(Boolean)));
  let failed = false;
  await runPool(specs, jobs, (i, total, error, ms) => {
    const spec = specs[i] as Spec;
    const ok = !error && !total.wins.unfinished;
    failed ||= !ok;
    const out = error ? `Error:\n${error}` : summary(spec, total, ms);
    console.log(JSON.stringify({ name: batch[i]?.name, ok, seconds: ms / 1000, out }));
  });
  if (failed) process.exitCode = 1;
} else {
  const spec = specOf(argv);
  const t0 = performance.now();
  let total = emptyTally();
  let error: string | null = null;
  if (jobs > 1)
    await runPool([spec], jobs, (_, t, e) => {
      total = t;
      error = e;
    });
  else total = run(spec, spec.seed0, spec.games);
  if (error) throw new Error(error);
  console.log(summary(spec, total, performance.now() - t0));
  if (total.wins.unfinished) process.exitCode = 1;
}
