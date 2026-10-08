/**
 * AI tournament: two AIs play each other in duels, seats and decks alternating, to measure their relative strength.
 *
 * Usage: npm run arena -- --a expert --b medium [--games 200] [--pool decks|all|mix|meta] [--seed 1] [--jobs 8]
 *                         [--budget 150]
 *
 * --jobs: parallel processes (by default, the number of cores minus two; --jobs 1: everything in this process). The
 * processes take the games one by one (a long Commander game leaves no core idle); each game depends only on its
 * number: the result is the same whatever --jobs is. Progress on standard error every 10 s; the report cites the five
 * slowest decisions and the command that replays their game.
 *
 * AIs: random, beginner, medium, expert; "expert:200" gives this AI a budget of its own ("expert:0": no ISMCTS).
 * --players 4: four-player games, seats A, B, A, B rotating from one game to the next; counts the wins of A and of B.
 * --first N: starts at game N (with --games 1: replays the game a tournament reports as failing).
 * The games go in pairs: same seed and same decks, seats and decks swapped (the advantage of the first player and of
 * the decks cancels out). --budget: ISMCTS iterations (an iteration budget makes the tournament reproducible).
 * --pool decks: precons; all: random two-color decks; mix: half and half; meta: the playable Standard meta decks
 * (docs/meta/).
 * --format commander (PLAN-E): Commander games; random Commander decks, or `--pool commander`: the playable Commander
 * precons.
 * --by-deck: measures the decks, not the AIs (same AI advised: --a medium --b medium); the decks change seats from one
 * game to the next and "A" is the first deck of the pair (with 4 players: seats deck 1, deck 2, deck 1, deck 2);
 * `--deck cmd-<id>`: this Commander precon is "A", against each of the others in turn.
 * MTGX_SLOW_MS=N: each decision over N ms is reported (pending decision, board size, stack, decision made).
 */
import { type ChildProcess, fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { type AiLevel, aiAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, buildGameDeck, CARDS, DECKS, validateDeck } from "@mtgx/cards";

/** Precons other than Commander (Commander decks are played with their own rules, PLAN-E). */
const PRECONS = DECKS.filter((d) => d.format !== "commander");

import type { Agent, CardDef } from "@mtgx/engine";
import { metaDecks } from "./meta-decks";
import { randomCommanderDeck, randomDeck } from "./random-deck";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const A = arg("a", "expert");
const B = arg("b", "medium");
const games = Number(arg("games", "200"));
const seed0 = Number(arg("seed", "1"));
const pool = arg("pool", "mix");
const first0 = Number(arg("first", "0"));
const jobs = Math.max(1, Math.min(Number(arg("jobs", String(availableParallelism() - 2))), games));
const budget = Number(arg("budget", "150"));
const worker = process.argv.includes("--worker");
const players = Math.max(2, Number(arg("players", "2")));
const commander = arg("format", "") === "commander";
const byDeck = process.argv.includes("--by-deck");
/** Playable Commander precons (`--pool commander`). */
/** --deck <id> (with --by-deck): this precon is "A", against each of the others (by default, the first one). */
const focus = arg("deck", "");
const COMMANDER_PRECONS = (
  commander && pool === "commander"
    ? DECKS.filter((d) => d.format === "commander" && validateDeck(d, CARDS, "commander").playable)
    : []
).sort((x, y) => Number(y.id === focus) - Number(x.id === focus));
if (focus && COMMANDER_PRECONS[0]?.id !== focus) throw new Error(`Unknown or unplayable Commander precon: ${focus}`);
if (commander && pool === "commander" && COMMANDER_PRECONS.length < 2)
  throw new Error("Two playable Commander precons are needed");

/** A game deck, with its commanders in Commander. */
interface GameDeck {
  deck: CardDef[];
  commanders?: number[];
  name?: string;
}

/** "expert:200": level and own budget (ISMCTS iterations; 0 = no ISMCTS). */
function agent(spec: string, seed: number): Agent {
  const [name, own] = spec.split(":");
  if (name === "random") return randomAgent(seed);
  if (name === "beginner" || name === "medium" || name === "expert")
    return aiAgent(name as AiLevel, {
      seed,
      budget: { iterations: own === undefined ? budget : Number(own) },
      players,
    });
  throw new Error(`Unknown AI: ${spec}`);
}

/** Decks of the pair of games `pair`: two different decks. */
const META = pool === "meta" ? metaDecks().filter((d) => d.playable) : [];

/** Commander decks of the pair `pair` (precons, or random). */
function commanderDecksFor(pair: number): [GameDeck, GameDeck] {
  if (COMMANDER_PRECONS.length) {
    const n = COMMANDER_PRECONS.length;
    // --by-deck: the first precon is always "A", against each of the others in turn.
    const i = byDeck ? 0 : pair % n;
    const j = byDeck ? 1 + (pair % (n - 1)) : (i + 1 + (Math.floor(pair / n) % (n - 1))) % n;
    const g = (k: number) => {
      const d = COMMANDER_PRECONS[k]!;
      const b = buildGameDeck(d);
      return { deck: b.deck, commanders: b.commanders, name: d.name };
    };
    return [g(i), g(j)];
  }
  return [randomCommanderDeck(seed0 * 7919 + pair * 2), randomCommanderDeck(seed0 * 7919 + pair * 2 + 1)];
}

function gameDecksFor(pair: number): [GameDeck, GameDeck] {
  if (commander) return commanderDecksFor(pair);
  const [a, b] = decksFor(pair);
  return [{ deck: a }, { deck: b }];
}

function decksFor(pair: number): [CardDef[], CardDef[]] {
  if (pool === "meta") {
    const n = META.length;
    const i = pair % n;
    const j = (i + 1 + (Math.floor(pair / n) % (n - 1))) % n;
    return [buildDeck(META[i]!), buildDeck(META[j]!)];
  }
  const usePrecons = pool === "decks" || (pool === "mix" && pair % 2 === 0);
  if (usePrecons) {
    const n = PRECONS.length;
    const i = pair % n;
    const j = (i + 1 + (Math.floor(pair / n) % (n - 1))) % n;
    return [buildDeck(PRECONS[i]!), buildDeck(PRECONS[j]!)];
  }
  return [randomDeck(seed0 * 7919 + pair * 2), randomDeck(seed0 * 7919 + pair * 2 + 1)];
}

/** A slow decision: what is needed to replay its game and profile it. */
interface Slow {
  ms: number;
  game: number;
  seed: number;
  /** Rank of the decision in the game, all players together (from 0). */
  decision: number;
  turn: number;
  player: string;
  level: string;
  what: string;
  permanents: number;
}

interface Tally {
  a: number;
  b: number;
  draws: number;
  unfinished: number;
  turns: number;
  time: Record<"a" | "b", number[]>;
  /** The slowest decisions, from the slowest down (at most `TOP_SLOW`). */
  slow: Slow[];
}

const emptyTally = (): Tally => ({ a: 0, b: 0, draws: 0, unfinished: 0, turns: 0, time: { a: [], b: [] }, slow: [] });

const TOP_SLOW = 5;
const isSlow = (list: Slow[], ms: number) => list.length < TOP_SLOW || ms > (list.at(-1)?.ms ?? 0);
function noteSlow(list: Slow[], x: Slow): void {
  if (!isSlow(list, x.ms)) return;
  list.push(x);
  list.sort((p, q) => q.ms - p.ms);
  list.length = Math.min(list.length, TOP_SLOW);
}

/**
 * Commander: beyond 150 turns (19 on average in a duel, 42 with four players), the game counts as unfinished. Without
 * this cap, a game where nobody can lose (Darksteel Angel for every player) lasted hours.
 */
const COMMANDER_MAX_TURNS = 150;

/** Game being measured: number, seed, decisions already made (all players together). */
interface GameClock {
  game: number;
  seed: number;
  decisions: number;
  tally: Tally;
}

/** Wraps an agent to measure its thinking time. */
const SLOW_MS = Number(process.env.MTGX_SLOW_MS ?? 0);
function timed(inner: Agent, level: string, side: "a" | "b", clock: GameClock): Agent {
  return (s, p) => {
    const t0 = performance.now();
    const d = inner(s, p);
    const ms = performance.now() - t0;
    clock.tally.time[side].push(ms);
    const decision = clock.decisions++;
    const what = () =>
      s.pending?.kind === "choice"
        ? `choice ${s.pending.request.type} (${s.pending.request.intent ?? ""})`
        : (s.pending?.kind ?? "?");
    if (isSlow(clock.tally.slow, ms))
      noteSlow(clock.tally.slow, {
        ms,
        game: clock.game,
        seed: clock.seed,
        decision,
        turn: s.turn.number,
        player: p,
        level,
        what: what(),
        permanents: s.battlefield.length,
      });
    if (SLOW_MS && ms > SLOW_MS) {
      console.error(
        `slow: ${ms.toFixed(0)} ms, turn ${s.turn.number}, ${p}, ${what()}, ${s.battlefield.length} permanents, stack ${s.stack.length} → ${JSON.stringify(d).slice(0, 160)}`,
      );
    }
    return d;
  };
}

/** Arguments of the command, without those that choose the games and the processes. */
function baseArgs(): string[] {
  const drop = ["--games", "--jobs", "--first"];
  return process.argv.slice(2).filter((a, k, all) => a !== "--worker" && !drop.includes(a) && !drop.includes(all[k - 1] ?? ""));
}

/** Command that replays game `g` alone. */
function replayCommand(g: number): string {
  const quote = (a: string) => (/^[\w:.,=/@+-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`);
  const args = [...baseArgs(), "--first", String(g), "--games", "1", "--jobs", "1"];
  return `npm run arena -- ${args.map(quote).join(" ")}`;
}

/** Plays a game; on an error, reports it with the command that replays it. */
function guarded<T>(g: number, seed: number, play: () => T): T {
  try {
    return play();
  } catch (e) {
    // Game to replay to reproduce the error: its number (--first N --games 1) and its seed.
    console.error(`Game ${g} (seed ${seed}) failed; to replay it: ${replayCommand(g)}`);
    throw e;
  }
}

/** Multiplayer game: seats A, B, A, B… shifted by one at each game, random decks. */
function playMulti(g: number, t: Tally): void {
  const seed = seed0 + g;
  const shift = g % 2;
  const isA = (seat: number) => (seat + shift) % 2 === 0;
  const clock: GameClock = { game: g, seed, decisions: 0, tally: t };
  // Commander: the two decks of the pair alternating (A, B, A, B), otherwise random decks.
  const pairDecks = commander ? commanderDecksFor(Math.floor(g / 2)) : null;
  const decks: GameDeck[] = Array.from({ length: players }, (_, i) =>
    pairDecks ? pairDecks[isA(i) ? 0 : 1] : { deck: randomDeck(seed0 * 7919 + g * players + i) },
  );
  const agents = decks.map((_, seat) =>
    isA(seat) ? timed(agent(A, seed * 8 + seat), A, "a", clock) : timed(agent(B, seed * 8 + seat), B, "b", clock),
  );
  const r = guarded(g, seed, () =>
    playGame({
      seed,
      decks: decks.map((d) => d.deck),
      ...(commander ? { variant: "commander" as const, commanders: decks.map((d) => d.commanders) } : {}),
      agents,
      maxDecisions: (commander ? 15000 : 4000) * players,
      maxTurns: commander ? COMMANDER_MAX_TURNS : undefined,
    }),
  );
  t.turns += r.turns;
  if (!r.state.over) t.unfinished++;
  else if (!r.state.winner) t.draws++;
  else if (isA(Number(String(r.state.winner).slice(1)) - 1)) t.a++;
  else t.b++;
}

/** Duel: the games go in pairs (same seed, seats or decks swapped). */
function playDuel(g: number, t: Tally): void {
  const pair = Math.floor(g / 2);
  const swap = g % 2 === 1;
  const seed = seed0 + pair;
  const clock: GameClock = { game: g, seed, decisions: 0, tally: t };
  const [d1, d2] = gameDecksFor(pair);
  // Even game: A plays the first deck as p1; odd game: B plays this deck as p1, A the other one as p2.
  // --by-deck: the AIs stay in place, the decks change seats; "A" is the first deck.
  const agentA = timed(agent(A, seed * 2 + 1), A, "a", clock);
  const agentB = timed(agent(B, seed * 2 + 2), B, "b", clock);
  const decks = byDeck && swap ? [d2, d1] : [d1, d2];
  const r = guarded(g, seed, () =>
    playGame({
      seed,
      decks: decks.map((d) => d.deck),
      ...(commander ? { variant: "commander" as const, commanders: decks.map((d) => d.commanders) } : {}),
      agents: !byDeck && swap ? [agentB, agentA] : [agentA, agentB],
      maxDecisions: commander ? 30000 : 8000,
      maxTurns: commander ? COMMANDER_MAX_TURNS : undefined,
    }),
  );
  t.turns += r.turns;
  if (!r.state.over) t.unfinished++;
  else if (!r.state.winner) t.draws++;
  else if ((r.state.winner === "p1") !== swap) t.a++;
  else t.b++;
}

/** Plays game `g` (it depends only on its number and the options) and adds it to `t`. */
const playOne = (g: number, t: Tally) => (players > 2 ? playMulti(g, t) : playDuel(g, t));

function merge(into: Tally, r: Tally): void {
  into.a += r.a;
  into.b += r.b;
  into.draws += r.draws;
  into.unfinished += r.unfinished;
  into.turns += r.turns;
  for (const x of r.time.a) into.time.a.push(x);
  for (const x of r.time.b) into.time.b.push(x);
  for (const x of r.slow) noteSlow(into.slow, x);
}

const pct = (x: number) => (100 * x).toFixed(1);
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
};

/** Progress on standard error: at most one line every 10 s (rewritten in place in a terminal). */
const PROGRESS_MS = 10_000;
const tty = process.stderr.isTTY === true;
let lastProgress = performance.now();
let progressShown = false;
function progress(done: number, t: Tally, t0: number): void {
  const now = performance.now();
  if (now - lastProgress < PROGRESS_MS || done >= games) return;
  lastProgress = now;
  const elapsed = now - t0;
  const decided = t.a + t.b;
  const eta = duration((elapsed / done) * (games - done));
  const score = decided ? ` · ${A} ${pct(t.a / decided)} %` : "";
  const line = `  ${done} / ${games} games · ${duration(elapsed)} · about ${eta} left${score}`;
  process.stderr.write(tty ? `\r\x1b[K${line}` : `${line}\n`);
  progressShown = true;
}
function endProgress(): void {
  if (tty && progressShown) process.stderr.write("\r\x1b[K");
}

function report(t: Tally, ms: number): void {
  const decided = t.a + t.b;
  const p = decided ? t.a / decided : 0;
  const ci = decided ? 1.96 * Math.sqrt((p * (1 - p)) / decided) : 0;
  const stat = (xs: number[]) => {
    const sorted = Float64Array.from(xs).sort();
    let sum = 0;
    for (const x of xs) sum += x;
    const mean = sum / Math.max(1, xs.length);
    return `${mean.toFixed(2)} ms/dec (p95 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)}, max ${(sorted.at(-1) ?? 0).toFixed(0)})`;
  };
  console.log(
    `${A} vs ${B}: ${games} games${players > 2 ? ` with ${players} players` : ""} (pool ${pool}${commander ? ", Commander" : ""}${byDeck ? ", by deck" : ""}${[A, B].some((x) => x.startsWith("expert")) ? `, budget ${budget}` : ""}) in ${(ms / 1000).toFixed(0)} s (${jobs} processes)`,
  );
  if (byDeck && COMMANDER_PRECONS.length) console.log(`  A = ${COMMANDER_PRECONS[0]?.name}`);
  console.log(
    `  ${A} wins ${pct(p)} % ± ${pct(ci)} (${t.a} / ${decided}) · draws ${t.draws} · unfinished ${t.unfinished} · ${(t.turns / games).toFixed(1)} turns on average`,
  );
  console.log(`  ${A}: ${stat(t.time.a)}`);
  console.log(`  ${B}: ${stat(t.time.b)}`);
  if (!t.slow.length) return;
  console.log("  Slowest decisions:");
  for (const x of t.slow)
    console.log(
      `    ${x.ms.toFixed(0)} ms · game ${x.game} (seed ${x.seed}), decision ${x.decision}, turn ${x.turn}, ${x.player} (${x.level}), ${x.what}, ${x.permanents} permanents`,
    );
  console.log("  To replay one of these games (MTGX_SLOW_MS=N before the command: each slow decision reported):");
  for (const g of new Set(t.slow.map((x) => x.game))) console.log(`    ${replayCommand(g)}`);
}

/** Messages between the main process and a compute process. */
type ToWorker = { game: number } | { stop: true };
type FromWorker = { ready: true } | { game: number; tally: Tally };

/**
 * Spreads the games over `jobs` processes: each gets the next game as soon as it has finished its own (no fixed
 * slices: a long game does not leave the other cores idle).
 */
function runParallel(t0: number): Promise<Tally> {
  const total = emptyTally();
  const end = first0 + games;
  let next = first0;
  let done = 0;
  const children: ChildProcess[] = [];
  return new Promise<Tally>((resolve, reject) => {
    let alive = jobs;
    let failed = false;
    for (let k = 0; k < jobs; k++) {
      const child = fork(process.argv[1] as string, [...baseArgs(), "--worker"], { execArgv: process.execArgv });
      children.push(child);
      // Game in progress in this process: reported if it dies without an exception (out of memory, signal).
      let current: number | null = null;
      const feed = () => {
        current = next < end ? next++ : null;
        child.send((current === null ? { stop: true } : { game: current }) satisfies ToWorker);
      };
      child.on("message", (m: FromWorker) => {
        if ("tally" in m) {
          merge(total, m.tally);
          progress(++done, total, t0);
        }
        feed();
      });
      child.on("exit", (code) => {
        alive--;
        if (failed) return;
        if (code !== 0) {
          failed = true;
          for (const c of children) if (c !== child) c.kill();
          endProgress();
          if (current !== null) console.error(`Game ${current} interrupted; to replay it: ${replayCommand(current)}`);
          reject(new Error(`tournament: process failed (${code})`));
        } else if (alive === 0) {
          if (done === games) resolve(total);
          else reject(new Error(`tournament: ${done} games played out of ${games}`));
        }
      });
    }
  });
}

const t0 = performance.now();
if (worker) {
  // Compute process: one game per message, until the stop order.
  process.on("message", (m: ToWorker) => {
    if ("stop" in m) process.exit(0);
    const t = emptyTally();
    playOne(m.game, t);
    process.send?.({ game: m.game, tally: t } satisfies FromWorker);
  });
  process.send?.({ ready: true } satisfies FromWorker);
} else {
  let total: Tally;
  if (jobs > 1) {
    try {
      total = await runParallel(t0);
    } finally {
      endProgress();
    }
  } else {
    total = emptyTally();
    try {
      for (let g = first0; g < first0 + games; g++) {
        playOne(g, total);
        progress(g - first0 + 1, total, t0);
      }
    } finally {
      endProgress();
    }
  }
  report(total, performance.now() - t0);
}
