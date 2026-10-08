/**
 * Performance measurements of the engine and the AI.
 * Targets: ≥ 5,000 decisions/s in random simulation; medium AI < 50 ms per decision on average;
 * high AI (ISMCTS with 100 iterations, fixed budget for a reproducible measurement) < 150 ms on average.
 *
 * Usage: npm run bench
 */
import { aiAgent, heuristicAgent, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS } from "@mtgx/cards";

/** Precons other than Commander (Commander decks are played with their own rules, PLAN-E). */
const PRECONS = DECKS.filter((d) => d.format !== "commander");

import { type Agent, createGame, fallbackDecision, RulesError, submit } from "@mtgx/engine";

function run(label: string, players: number, games: number, agentFor: (seed: number, i: number) => Agent) {
  let decisions = 0;
  let total = 0;
  let worst = 0;
  const times: number[] = [];
  for (let g = 0; g < games; g++) {
    const seed = 1000 + g;
    const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
    let { state } = createGame({
      seed,
      players: ids.map((id, i) => ({ id, name: id, deck: buildDeck(PRECONS[(g + i) % PRECONS.length]!) })),
    });
    const agents = ids.map((_, i) => agentFor(seed, i));
    for (let k = 0; k < 20000 && state.pending && !state.over; k++) {
      const p = state.pending;
      const t0 = performance.now();
      const agent = agents[ids.indexOf(p.player)] as Agent;
      let d = agent(state, p.player);
      try {
        state = submit(state, p.player, d).state;
      } catch (e) {
        if (!(e instanceof RulesError)) throw e;
        d = fallbackDecision(state, p);
        state = submit(state, p.player, d).state;
      }
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
      times.push(dt);
      decisions++;
    }
  }
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
  console.log(
    `${label.padEnd(28)} ${String(decisions).padStart(7)} decisions · ${Math.round((decisions / total) * 1000)
      .toString()
      .padStart(6)} dec/s · mean ${(total / decisions).toFixed(2)} ms · p99 ${p99.toFixed(1)} ms · max ${worst.toFixed(0)} ms`,
  );
  return { perSecond: (decisions / total) * 1000, mean: total / decisions };
}

const random = run("random, 2 players", 2, 60, (s, i) => randomAgent(s * 7 + i));
run("random, 4 players", 4, 20, (s, i) => randomAgent(s * 7 + i));
const ai2 = run("heuristic AI, 2 players", 2, 10, () => heuristicAgent());
const ai4 = run("heuristic AI, 4 players", 4, 4, () => heuristicAgent());
const expert = run("high AI, 2 players", 2, 2, (s, i) =>
  aiAgent("expert", { seed: s + i, budget: { iterations: 100 }, players: 2 }),
);

const ok = random.perSecond >= 5000 && ai2.mean < 50 && ai4.mean < 50 && expert.mean < 150;
console.log(ok ? "Targets met." : "Targets NOT met.");
if (!ok) process.exitCode = 1;
