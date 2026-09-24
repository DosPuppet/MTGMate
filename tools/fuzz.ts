/**
 * Fuzzing du moteur : parties IA contre IA avec vérification d'invariants à chaque décision.
 *
 * Usage : npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed]
 */
import { heuristicAgent, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS } from "@mtgx/cards";
import type { Agent } from "@mtgx/engine";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const games = Number(arg("games", "200"));
const seed0 = Number(arg("seed", "1"));
const mode = arg("ai", "random");

const agentFor = (seed: number, which: number): Agent => {
  if (mode === "heuristic") return heuristicAgent();
  if (mode === "mixed") return which === 0 ? heuristicAgent() : randomAgent(seed * 7 + which);
  return randomAgent(seed * 7 + which);
};

const wins: Record<string, number> = { p1: 0, p2: 0, nul: 0, inachevée: 0 };
let turns = 0;
let illegal = 0;
let decisions = 0;
const t0 = performance.now();
for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  const decks = g % 2 === 0 ? [DECKS[0], DECKS[1]] : [DECKS[1], DECKS[0]];
  const r = playGame({
    seed,
    decks: [buildDeck(decks[0]!), buildDeck(decks[1]!)],
    agents: [agentFor(seed, 0), agentFor(seed, 1)],
    check: true,
  });
  const key = !r.state.over ? "inachevée" : (r.state.winner ?? "nul");
  wins[key] = (wins[key] ?? 0) + 1;
  turns += r.turns;
  illegal += r.illegal;
  decisions += r.decisions.length;
}
const ms = performance.now() - t0;
console.log(`${games} parties (${mode}) en ${(ms / 1000).toFixed(1)} s — ${(ms / decisions).toFixed(2)} ms/décision`);
console.log("résultats :", wins);
console.log(`tours moyens : ${(turns / games).toFixed(1)}, décisions illégales de l'IA : ${illegal}`);
if (wins.inachevée) process.exitCode = 1;
