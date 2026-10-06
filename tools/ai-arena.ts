/**
 * Tournoi d'IA : deux IA s'affrontent en duel, places et decks alternés, pour mesurer leur force relative.
 *
 * Usage : npm run arena -- --a expert --b medium [--games 200] [--pool decks|all|mix|meta] [--seed 1] [--jobs 8]
 *                          [--budget 150]
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
import { fork } from "node:child_process";
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
const jobs = Math.max(1, Number(arg("jobs", "1")));
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

interface Tally {
  a: number;
  b: number;
  draws: number;
  unfinished: number;
  turns: number;
  time: Record<"a" | "b", number[]>;
}

/** Enveloppe un agent pour mesurer son temps de réflexion. */
const SLOW_MS = Number(process.env.MTGX_SLOW_MS ?? 0);
function timed(inner: Agent, into: number[]): Agent {
  return (s, p) => {
    const t0 = performance.now();
    const d = inner(s, p);
    const ms = performance.now() - t0;
    into.push(ms);
    if (SLOW_MS && ms > SLOW_MS) {
      const what =
        s.pending?.kind === "choice" ? `choix ${s.pending.request.type} (${s.pending.request.intent ?? ""})` : s.pending?.kind;
      console.error(
        `lent : ${ms.toFixed(0)} ms, tour ${s.turn.number}, ${p}, ${what}, ${s.battlefield.length} permanents, pile ${s.stack.length} → ${JSON.stringify(d).slice(0, 160)}`,
      );
    }
    return d;
  };
}

/** Partie à plusieurs : sièges A, B, A, B… décalés d'un cran à chaque partie, decks aléatoires. */
function runMulti(first: number, count: number): Tally {
  const t: Tally = { a: 0, b: 0, draws: 0, unfinished: 0, turns: 0, time: { a: [], b: [] } };
  for (let g = first; g < first + count; g++) {
    const seed = seed0 + g;
    const shift = g % 2;
    const isA = (seat: number) => (seat + shift) % 2 === 0;
    // Commander : les deux decks de la paire en alternance (A, B, A, B), sinon des decks aléatoires.
    const pairDecks = commander ? commanderDecksFor(Math.floor(g / 2)) : null;
    const decks: GameDeck[] = Array.from({ length: players }, (_, i) =>
      pairDecks ? pairDecks[isA(i) ? 0 : 1] : { deck: randomDeck(seed0 * 7919 + g * players + i) },
    );
    const agents = decks.map((_, seat) =>
      isA(seat) ? timed(agent(A, seed * 8 + seat), t.time.a) : timed(agent(B, seed * 8 + seat), t.time.b),
    );
    const r = playGame({
      seed,
      decks: decks.map((d) => d.deck),
      ...(commander ? { variant: "commander" as const, commanders: decks.map((d) => d.commanders) } : {}),
      agents,
      maxDecisions: (commander ? 15000 : 4000) * players,
    });
    t.turns += r.turns;
    if (!r.state.over) t.unfinished++;
    else if (!r.state.winner) t.draws++;
    else if (isA(Number(String(r.state.winner).slice(1)) - 1)) t.a++;
    else t.b++;
  }
  return t;
}

function run(first: number, count: number): Tally {
  if (players > 2) return runMulti(first, count);
  const t: Tally = { a: 0, b: 0, draws: 0, unfinished: 0, turns: 0, time: { a: [], b: [] } };
  for (let g = first; g < first + count; g++) {
    const pair = Math.floor(g / 2);
    const swap = g % 2 === 1;
    const seed = seed0 + pair;
    const [d1, d2] = gameDecksFor(pair);
    // Partie paire : A joue le premier deck en p1 ; partie impaire : B joue ce deck en p1, A l'autre en p2.
    // --by-deck : les IA restent en place, les decks changent de place ; « A » est le premier deck.
    const agentA = timed(agent(A, seed * 2 + 1), t.time.a);
    const agentB = timed(agent(B, seed * 2 + 2), t.time.b);
    const decks = byDeck && swap ? [d2, d1] : [d1, d2];
    let r: ReturnType<typeof playGame>;
    try {
      r = playGame({
        seed,
        decks: decks.map((d) => d.deck),
        ...(commander ? { variant: "commander" as const, commanders: decks.map((d) => d.commanders) } : {}),
        agents: !byDeck && swap ? [agentB, agentA] : [agentA, agentB],
        maxDecisions: commander ? 30000 : 8000,
      });
    } catch (e) {
      // Partie à rejouer pour reproduire l'erreur : son numéro (--first N --games 1) et sa graine.
      console.error(`Partie ${g} (paire ${pair}, graine ${seed}) en erreur`);
      throw e;
    }
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
    `${A} contre ${B} : ${games} parties${players > 2 ? ` à ${players} joueurs` : ""} (pool ${pool}${commander ? ", Commander" : ""}${byDeck ? ", par deck" : ""}${[A, B].some((x) => x.startsWith("expert")) ? `, budget ${budget}` : ""}) en ${(ms / 1000).toFixed(0)} s`,
  );
  if (byDeck && COMMANDER_PRECONS.length) console.log(`  A = ${COMMANDER_PRECONS[0]?.name}`);
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
} else report(run(Number(arg("first", "0")), games), performance.now() - t0);
