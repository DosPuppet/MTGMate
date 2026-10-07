/**
 * Tournoi d'IA : deux IA s'affrontent en duel, places et decks alternés, pour mesurer leur force relative.
 *
 * Usage : npm run arena -- --a expert --b medium [--games 200] [--pool decks|all|mix|meta] [--seed 1] [--jobs 8]
 *                          [--budget 150]
 *
 * --jobs : processus parallèles (par défaut, le nombre de cœurs moins deux ; --jobs 1 : tout dans ce processus). Les
 * processus prennent les parties une à une (une longue partie de Commander ne laisse pas de cœur inoccupé) ; chaque
 * partie ne dépend que de son numéro : le résultat est le même quel que soit --jobs. Avancement sur la sortie d'erreur
 * toutes les 10 s ; le compte rendu cite les cinq décisions les plus lentes et la commande qui rejoue leur partie.
 *
 * IA : random, beginner, medium, expert ; « expert:200 » donne un budget propre
 * à cette IA (« expert:0 » : sans ISMCTS).
 * --players 4 : parties à quatre, sièges A, B, A, B tournant d'une partie à l'autre ; compte les victoires de A et de B.
 * --first N : commence à la partie N (avec --games 1 : rejouer la partie qu'un tournoi signale en erreur).
 * Les parties vont par paires : même graine et mêmes decks, places et decks échangés (l'avantage du premier joueur
 * et des decks s'annule). --budget : itérations de l'ISMCTS (un budget en itérations rend le tournoi reproductible).
 * --pool decks : decks préconstruits ; all : decks aléatoires bicolores ; mix : moitié-moitié ; meta : les decks du
 * méta Standard jouables (docs/meta/).
 * --format commander (PLAN-E) : parties de Commander ; decks Commander aléatoires, ou `--pool commander` : les
 * préconstruits Commander jouables.
 * --by-deck : mesure les decks et non les IA (même IA conseillée : --a medium --b medium) ; les decks changent de place
 * d'une partie à l'autre et « A » est le premier deck de la paire (à 4 joueurs : sièges deck 1, deck 2, deck 1, deck 2) ;
 * `--deck cmd-<id>` : ce préconstruit Commander est « A », contre chacun des autres à tour de rôle.
 * MTGX_SLOW_MS=N : chaque décision de plus de N ms est signalée (attente, taille du plateau, pile, décision prise).
 */
import { type ChildProcess, fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { type AiLevel, aiAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, buildGameDeck, CARDS, DECKS, validateDeck } from "@mtgx/cards";

/** Préconstruits hors Commander (les decks Commander se jouent avec leurs règles, PLAN-E). */
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
/** Préconstruits Commander jouables (`--pool commander`). */
/** --deck <id> (avec --by-deck) : ce préconstruit est « A », contre chacun des autres (par défaut, le premier). */
const focus = arg("deck", "");
const COMMANDER_PRECONS = (
  commander && pool === "commander"
    ? DECKS.filter((d) => d.format === "commander" && validateDeck(d, CARDS, "commander").playable)
    : []
).sort((x, y) => Number(y.id === focus) - Number(x.id === focus));
if (focus && COMMANDER_PRECONS[0]?.id !== focus) throw new Error(`Préconstruit Commander inconnu ou injouable : ${focus}`);
if (commander && pool === "commander" && COMMANDER_PRECONS.length < 2)
  throw new Error("Il faut deux préconstruits Commander jouables");

/** Un deck de partie, avec ses commandants en Commander. */
interface GameDeck {
  deck: CardDef[];
  commanders?: number[];
  name?: string;
}

/** « expert:200 » : niveau et budget propre (itérations de l'ISMCTS ; 0 = sans ISMCTS). */
function agent(spec: string, seed: number): Agent {
  const [name, own] = spec.split(":");
  if (name === "random") return randomAgent(seed);
  if (name === "beginner" || name === "medium" || name === "expert")
    return aiAgent(name as AiLevel, {
      seed,
      budget: { iterations: own === undefined ? budget : Number(own) },
      players,
    });
  throw new Error(`IA inconnue : ${spec}`);
}

/** Decks de la paire de parties `pair` : deux decks différents. */
const META = pool === "meta" ? metaDecks().filter((d) => d.playable) : [];

/** Decks Commander de la paire `pair` (préconstruits, ou aléatoires). */
function commanderDecksFor(pair: number): [GameDeck, GameDeck] {
  if (COMMANDER_PRECONS.length) {
    const n = COMMANDER_PRECONS.length;
    // --by-deck : le premier préconstruit est toujours « A », contre chacun des autres à tour de rôle.
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

/** Une décision lente : de quoi rejouer sa partie et la profiler. */
interface Slow {
  ms: number;
  game: number;
  seed: number;
  /** Rang de la décision dans la partie, tous joueurs confondus (à partir de 0). */
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
  /** Les décisions les plus lentes, de la plus lente à la moins lente (au plus `TOP_SLOW`). */
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
 * Commander : au-delà de 150 tours (en moyenne 19 en duel, 42 à quatre), la partie est comptée inachevée. Sans ce
 * plafond, une partie où personne ne peut perdre (Darksteel Angel chez chaque joueur) durait des heures.
 */
const COMMANDER_MAX_TURNS = 150;

/** Partie en cours de mesure : numéro, graine, décisions déjà prises (tous joueurs confondus). */
interface GameClock {
  game: number;
  seed: number;
  decisions: number;
  tally: Tally;
}

/** Enveloppe un agent pour mesurer son temps de réflexion. */
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
        ? `choix ${s.pending.request.type} (${s.pending.request.intent ?? ""})`
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
        `lent : ${ms.toFixed(0)} ms, tour ${s.turn.number}, ${p}, ${what()}, ${s.battlefield.length} permanents, pile ${s.stack.length} → ${JSON.stringify(d).slice(0, 160)}`,
      );
    }
    return d;
  };
}

/** Arguments de la commande, sans ceux qui choisissent les parties et les processus. */
function baseArgs(): string[] {
  const drop = ["--games", "--jobs", "--first"];
  return process.argv.slice(2).filter((a, k, all) => a !== "--worker" && !drop.includes(a) && !drop.includes(all[k - 1] ?? ""));
}

/** Commande qui rejoue la partie `g` seule. */
function replayCommand(g: number): string {
  const quote = (a: string) => (/^[\w:.,=/@+-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`);
  const args = [...baseArgs(), "--first", String(g), "--games", "1", "--jobs", "1"];
  return `npm run arena -- ${args.map(quote).join(" ")}`;
}

/** Joue une partie ; en cas d'erreur, la signale avec la commande qui la rejoue. */
function guarded<T>(g: number, seed: number, play: () => T): T {
  try {
    return play();
  } catch (e) {
    // Partie à rejouer pour reproduire l'erreur : son numéro (--first N --games 1) et sa graine.
    console.error(`Partie ${g} (graine ${seed}) en erreur ; pour la rejouer : ${replayCommand(g)}`);
    throw e;
  }
}

/** Partie à plusieurs : sièges A, B, A, B… décalés d'un cran à chaque partie, decks aléatoires. */
function playMulti(g: number, t: Tally): void {
  const seed = seed0 + g;
  const shift = g % 2;
  const isA = (seat: number) => (seat + shift) % 2 === 0;
  const clock: GameClock = { game: g, seed, decisions: 0, tally: t };
  // Commander : les deux decks de la paire en alternance (A, B, A, B), sinon des decks aléatoires.
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

/** Duel : les parties vont par paires (même graine, places ou decks échangés). */
function playDuel(g: number, t: Tally): void {
  const pair = Math.floor(g / 2);
  const swap = g % 2 === 1;
  const seed = seed0 + pair;
  const clock: GameClock = { game: g, seed, decisions: 0, tally: t };
  const [d1, d2] = gameDecksFor(pair);
  // Partie paire : A joue le premier deck en p1 ; partie impaire : B joue ce deck en p1, A l'autre en p2.
  // --by-deck : les IA restent en place, les decks changent de place ; « A » est le premier deck.
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

/** Joue la partie `g` (elle ne dépend que de son numéro et des options) et l'ajoute à `t`. */
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

/** Avancement sur la sortie d'erreur : au plus une ligne toutes les 10 s (réécrite sur place dans un terminal). */
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
  const line = `  ${done} / ${games} parties · ${duration(elapsed)} · reste environ ${eta}${score}`;
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
    return `${mean.toFixed(2)} ms/déc (p95 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)}, max ${(sorted.at(-1) ?? 0).toFixed(0)})`;
  };
  console.log(
    `${A} contre ${B} : ${games} parties${players > 2 ? ` à ${players} joueurs` : ""} (pool ${pool}${commander ? ", Commander" : ""}${byDeck ? ", par deck" : ""}${[A, B].some((x) => x.startsWith("expert")) ? `, budget ${budget}` : ""}) en ${(ms / 1000).toFixed(0)} s (${jobs} processus)`,
  );
  if (byDeck && COMMANDER_PRECONS.length) console.log(`  A = ${COMMANDER_PRECONS[0]?.name}`);
  console.log(
    `  ${A} gagne ${pct(p)} % ± ${pct(ci)} (${t.a} / ${decided}) · nuls ${t.draws} · inachevées ${t.unfinished} · ${(t.turns / games).toFixed(1)} tours en moyenne`,
  );
  console.log(`  ${A} : ${stat(t.time.a)}`);
  console.log(`  ${B} : ${stat(t.time.b)}`);
  if (!t.slow.length) return;
  console.log("  Décisions les plus lentes :");
  for (const x of t.slow)
    console.log(
      `    ${x.ms.toFixed(0)} ms · partie ${x.game} (graine ${x.seed}), décision ${x.decision}, tour ${x.turn}, ${x.player} (${x.level}), ${x.what}, ${x.permanents} permanents`,
    );
  console.log("  Pour rejouer une de ces parties (MTGX_SLOW_MS=N devant la commande : chaque décision lente signalée) :");
  for (const g of new Set(t.slow.map((x) => x.game))) console.log(`    ${replayCommand(g)}`);
}

/** Messages entre le processus principal et un processus de calcul. */
type ToWorker = { game: number } | { stop: true };
type FromWorker = { ready: true } | { game: number; tally: Tally };

/**
 * Répartit les parties entre `jobs` processus : chacun reçoit la partie suivante dès qu'il a fini la sienne (pas de
 * tranches fixes : une longue partie ne laisse pas les autres cœurs inoccupés).
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
      // Partie en cours chez ce processus : signalée s'il meurt sans exception (manque de mémoire, signal).
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
          if (current !== null) console.error(`Partie ${current} interrompue ; pour la rejouer : ${replayCommand(current)}`);
          reject(new Error(`tournoi : processus en échec (${code})`));
        } else if (alive === 0) {
          if (done === games) resolve(total);
          else reject(new Error(`tournoi : ${done} parties jouées sur ${games}`));
        }
      });
    }
  });
}

const t0 = performance.now();
if (worker) {
  // Processus de calcul : une partie par message, jusqu'à l'ordre d'arrêt.
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
