/**
 * Fuzzing du moteur : parties IA contre IA avec vérification d'invariants à chaque décision.
 *
 * Usage : npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed] [--players 2] [--pool decks|all]
 *
 * --pool all : decks aléatoires bicolores tirés de toutes les cartes gérées par le moteur.
 */
import { heuristicAgent, mulberry32, playGame, randomAgent } from "@mtgx/ai";
import { buildDeck, DECKS, implementedCards } from "@mtgx/cards";
import type { Agent, CardDef, Color } from "@mtgx/engine";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const games = Number(arg("games", "200"));
const seed0 = Number(arg("seed", "1"));
const mode = arg("ai", "random");
const players = Math.max(2, Number(arg("players", "2")));
const pool = arg("pool", "decks");

const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const ALL = implementedCards();

/** Deck aléatoire de 60 cartes sur deux couleurs : 24 terrains de base, 36 cartes gérées. */
function randomDeck(seed: number): CardDef[] {
  const rand = mulberry32(seed);
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, 2);
  const spells = ALL.filter((c) => !c.types.includes("Land") && c.colors.length > 0 && c.colors.every((x) => colors.includes(x)));
  const deck: CardDef[] = [];
  for (let i = 0; i < 36 && spells.length; i++) deck.push(spells[Math.floor(rand() * spells.length)] as CardDef);
  for (let i = 0; i < 24; i++) {
    const land = ALL.find((c) => c.name === BASICS[colors[i % 2] as Color]);
    if (land) deck.push(land);
  }
  return deck;
}

const agentFor = (seed: number, which: number): Agent => {
  if (mode === "heuristic") return heuristicAgent();
  if (mode === "mixed") return which === 0 ? heuristicAgent() : randomAgent(seed * 7 + which);
  return randomAgent(seed * 7 + which);
};

const wins: Record<string, number> = { nul: 0, inachevée: 0 };
let turns = 0;
let illegal = 0;
let decisions = 0;
const t0 = performance.now();
for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  const ids = Array.from({ length: players }, (_, i) => i);
  const r = playGame({
    seed,
    decks: ids.map((i) => (pool === "all" ? randomDeck(seed * 31 + i) : buildDeck(DECKS[(g + i) % DECKS.length]!))),
    agents: ids.map((i) => agentFor(seed, i)),
    maxDecisions: 5000 * players,
    check: true,
  });
  const key = !r.state.over ? "inachevée" : (r.state.winner ?? "nul");
  wins[key] = (wins[key] ?? 0) + 1;
  turns += r.turns;
  illegal += r.illegal;
  decisions += r.decisions.length;
}
const ms = performance.now() - t0;
console.log(
  `${games} parties à ${players} joueurs (${mode}, pool ${pool}) en ${(ms / 1000).toFixed(1)} s — ${(ms / decisions).toFixed(2)} ms/décision`,
);
console.log("résultats :", wins);
console.log(`tours moyens : ${(turns / games).toFixed(1)}, décisions illégales de l'IA : ${illegal}`);
if (wins.inachevée) process.exitCode = 1;
