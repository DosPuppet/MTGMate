/**
 * Fuzzing du moteur : parties IA contre IA avec vérification d'invariants à chaque décision.
 *
 * Usage : npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed|beginner|medium|expert|levels|chaos] [--players 2] [--offers 4]
 *                        [--pool decks|all|meta|<SET>] [--format commander]
 *                        [--jobs N]
 *         npx tsx tools/fuzz.ts --batch <fichier.json> --jobs N    (plusieurs séries, utilisé par verify)
 *
 * --pool all : decks aléatoires bicolores tirés de toutes les cartes gérées par le moteur.
 * --pool FIN : decks tirés d'abord des cartes de cette extension (complétés par les autres cartes gérées).
 * --pool meta : les decks du méta Standard déjà jouables (`docs/meta/`, plan P4), les uns contre les autres.
 * --format commander : parties de Commander (PLAN-E) ; decks Commander aléatoires tirés du pool (`all` ou une extension :
 * commandant légendaire et 99 cartes singleton dans son identité), ou `--pool commander` : les préconstruits Commander
 * jouables.
 * --jobs N : les parties sont réparties sur N processus, par petits paquets de graines contiguës ; chaque partie ne dépend
 * que de sa graine, donc les résultats sont identiques quel que soit N.
 * --ai : heuristic = medium ; mixed : une IA moyenne contre des IA aléatoires ; levels : les trois niveaux mélangés
 * (l'ISMCTS du niveau élevé avec un petit budget en itérations, pour rester rapide) ; chaos : IA aléatoires, et avant chaque
 * décision, des variantes corrompues qui doivent être refusées par une RulesError sans modifier l'état.
 * --batch : un tableau JSON de séries `{ name, args }` (args : les options ci-dessus, sauf --jobs). Toutes les séries
 * partagent le même groupe de processus (pas de démarrage ni d'attente du plus lent entre deux séries) ; une ligne JSON
 * par série terminée : `{ name, ok, seconds, out }`.
 */
import { type ChildProcess, fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { type AiLevel, aiAgent, heuristicAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, buildGameDeck, CARDS, DECKS, validateDeck } from "@mtgx/cards";

/** Préconstruits hors Commander (les decks Commander se jouent avec leurs règles, PLAN-E). */
const PRECONS = DECKS.filter((d) => d.format !== "commander");

import type { Agent, CardDef } from "@mtgx/engine";
import { metaDecks } from "./meta-decks";
import { randomCommanderDeck, randomDeck } from "./random-deck";

/** Une série de parties. */
interface Spec {
  games: number;
  seed0: number;
  mode: string;
  players: number;
  pool: string;
  /** Toutes les N priorités, chaque option proposée doit être acceptée avec ses choix par défaut (0 : jamais). */
  offers: number;
  /** `commander` : parties de Commander (PLAN-E). */
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
  if (metaCache.length === 0) throw new Error("Aucun deck du méta n'est encore jouable");
  return metaCache;
};

const deckFor = (spec: Spec, seed: number, g: number, i: number): CardDef[] =>
  spec.pool === "decks"
    ? buildDeck(PRECONS[(g + i) % PRECONS.length]!)
    : spec.pool === "meta"
      ? buildDeck(meta()[(g + i) % meta().length]!)
      : randomDeck(seed * 31 + i, spec.pool === "all" ? undefined : spec.pool.toUpperCase());

/** Préconstruits Commander jouables (`--pool commander`). */
let commanderPrecons: typeof DECKS | null = null;
const commanderPool = () => {
  commanderPrecons ??= DECKS.filter((d) => d.format === "commander" && validateDeck(d, CARDS, "commander").playable);
  if (commanderPrecons.length === 0) throw new Error("Aucun préconstruit Commander n'est encore jouable");
  return commanderPrecons;
};

/** Deck Commander d'un joueur : un préconstruit (`--pool commander`) ou un deck aléatoire. */
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
   * Empreinte des parties (somme modulo 2³² d'une empreinte par partie : décisions, gagnant, points de vie) : indépendante
   * de `--jobs` ; égale avant et après un remaniement qui ne doit pas changer le jeu (PLAN-S).
   */
  print: number;
}

const emptyTally = (): Tally => ({ wins: { nul: 0, inachevée: 0 }, turns: 0, illegal: 0, decisions: 0, caps: 0, print: 0 });

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

/** Joue `count` parties de la série à partir de la graine `first` (dans ce processus). */
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
      // Commander : 40 PV et 100 cartes, des parties bien plus longues.
      maxDecisions: (commander ? 15000 : 5000) * spec.players,
      check: true,
      chaos: spec.mode === "chaos" ? { seed: seed * 13 + 5, perDecision: 3 } : undefined,
      offers: spec.offers || undefined,
    });
    const key = !r.state.over ? "inachevée" : (r.state.winner ?? "nul");
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

/** Bilan d'une série, au format attendu par verify (`résultats : …`). */
function summary(spec: Spec, total: Tally, ms: number): string {
  const { wins, turns, illegal, decisions, caps, print } = total;
  return [
    `${spec.games} parties à ${spec.players} joueurs (${spec.mode}, pool ${spec.pool}${spec.format ? `, ${spec.format}` : ""}) en ${(ms / 1000).toFixed(1)} s — ${(ms / Math.max(1, decisions)).toFixed(2)} ms/décision`,
    `résultats : ${inspect(wins)}`,
    `tours moyens : ${(turns / spec.games).toFixed(1)}, décisions illégales de l'IA : ${illegal}, plafonds atteints : ${caps}`,
    `empreinte : ${print.toString(16).padStart(8, "0")} (${decisions} décisions)`,
  ].join("\n");
}

interface Task {
  spec: number;
  first: number;
  count: number;
}
type FromWorker = { ok: true; tally: Tally } | { ok: false; error: string };

/**
 * Joue toutes les séries sur `jobs` processus persistants qui prennent les paquets dans l'ordre. `done` est appelé
 * quand tous les paquets d'une série sont terminés.
 */
async function runPool(
  specs: Spec[],
  jobs: number,
  done: (i: number, total: Tally, error: string | null, ms: number) => void,
): Promise<void> {
  const tasks: Task[] = [];
  const remaining = specs.map(() => 0);
  for (const [i, spec] of specs.entries()) {
    // Des paquets assez petits pour que la fin d'une série ne laisse pas de cœurs inoccupés.
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
        current === null
          ? resolve()
          : reject(new Error(`processus de fuzz arrêté (code ${code}) pendant ${JSON.stringify(current)}`)),
      );
      feed();
    });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, worker));
}

const argv = process.argv.slice(2);
const jobs = Math.max(1, Number(argOf(argv, "jobs", "1")));

if (argv.includes("--worker")) {
  // Processus fils : joue les paquets reçus, renvoie un décompte (ou l'erreur) pour chacun.
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
  // Plusieurs séries (verify) : une ligne JSON par série terminée.
  const batch = JSON.parse(readFileSync(argOf(argv, "batch", ""), "utf8")) as { name: string; args: string }[];
  const specs = batch.map((b) => specOf(b.args.split(/\s+/).filter(Boolean)));
  let failed = false;
  await runPool(specs, jobs, (i, total, error, ms) => {
    const spec = specs[i] as Spec;
    const ok = !error && !total.wins.inachevée;
    failed ||= !ok;
    const out = error ? `Erreur :\n${error}` : summary(spec, total, ms);
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
  if (total.wins.inachevée) process.exitCode = 1;
}
