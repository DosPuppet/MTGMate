/**
 * Mesures de performance du moteur et de l'IA.
 * Cibles : ≥ 5 000 décisions/s en simulation aléatoire ; IA < 50 ms par décision en moyenne.
 *
 * Usage : npm run bench
 */
import { heuristicAgent, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS } from "@mtgx/cards";
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
      players: ids.map((id, i) => ({ id, name: id, deck: buildDeck(DECKS[(g + i) % DECKS.length]!) })),
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
    `${label.padEnd(28)} ${String(decisions).padStart(7)} décisions · ${Math.round((decisions / total) * 1000)
      .toString()
      .padStart(6)} déc/s · moy ${(total / decisions).toFixed(2)} ms · p99 ${p99.toFixed(1)} ms · max ${worst.toFixed(0)} ms`,
  );
  return { perSecond: (decisions / total) * 1000, mean: total / decisions };
}

const random = run("aléatoire, 2 joueurs", 2, 60, (s, i) => randomAgent(s * 7 + i));
run("aléatoire, 4 joueurs", 4, 20, (s, i) => randomAgent(s * 7 + i));
const ai2 = run("IA heuristique, 2 joueurs", 2, 10, () => heuristicAgent());
const ai4 = run("IA heuristique, 4 joueurs", 4, 4, () => heuristicAgent());

const ok = random.perSecond >= 5000 && ai2.mean < 50 && ai4.mean < 50;
console.log(ok ? "Cibles atteintes." : "Cibles NON atteintes.");
if (!ok) process.exitCode = 1;
