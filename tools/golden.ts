/**
 * Golden games (docs/plans/PLAN-R.md, lot F1; made into detectors by docs/plans/PLAN-C.md, lot C2): a few fixed-seed
 * games, recorded with their checkpoints (`packages/ai/test/golden/*.json`). The test `ai/test/golden.test.ts`
 * replays them all:
 * - a game that replays identically passes, whatever the rules version that recorded it;
 * - a divergence at the same version is an error: the engine's behavior changed without bumping `RULES_VERSION`;
 * - a divergence after a change of `RULES_VERSION` requires regenerating **that** game (`--update`).
 *
 * Usage: npm run golden              checks (like the test)
 *        npm run golden -- --update   regenerates only the games that diverge (and the missing games)
 *        npm run golden -- --all      regenerates all the games
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { heuristicAgent, randomAgent } from "@mtgx/ai";
import { buildDeck, buildGameDeck, card, deckById } from "@mtgx/cards";
import {
  type CardDef,
  createRecordedGame,
  fallbackDecision,
  type GameRecord,
  outcomeHash,
  RULES_VERSION,
  RulesError,
  recordDecision,
  replayChecked,
  submit,
} from "@mtgx/engine";
import { randomCommanderDeck, randomDeck } from "./random-deck";

interface GoldenSpec {
  name: string;
  seed: number;
  /** Precons (`deckById`), one per player; or `pools`: a random deck drawn mostly from one set. */
  decks?: string[];
  pools?: string[];
  /** Random AI (varied games, cut at `maxDecisions`) or heuristic AI (games that go to the end). */
  agent: "random" | "heuristic";
  maxDecisions: number;
  /** Commander game (PLAN-E): random Commander decks (`pools`: preferred set, "all": the whole pool). */
  commander?: boolean;
}

const GOLDEN_GAMES: GoldenSpec[] = [
  {
    name: "izzet-vs-landfall",
    seed: 11,
    decks: ["meta-izzet-spellementals", "meta-mono-green-landfall"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "dimir-vs-jund",
    seed: 12,
    decks: ["meta-dimir-midrange", "meta-jund-sacrifice"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "4c-vs-izzet",
    seed: 13,
    decks: ["meta-4c-control", "meta-izzet-spellementals"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "landfall-vs-dimir",
    seed: 14,
    decks: ["meta-mono-green-landfall", "meta-dimir-midrange"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "four-players-a",
    seed: 15,
    decks: ["meta-jund-sacrifice", "meta-4c-control", "meta-izzet-spellementals", "meta-mono-green-landfall"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "four-players-b",
    seed: 16,
    decks: ["meta-dimir-midrange", "meta-mono-green-landfall", "meta-jund-sacrifice", "meta-4c-control"],
    agent: "random",
    maxDecisions: 1200,
  },
  // Recent sets, played by the heuristic AI to the end of the game.
  { name: "recent-ecl-vs-tla", seed: 21, pools: ["ECL", "TLA"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recent-msh-vs-spm", seed: 22, pools: ["MSH", "SPM"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recent-hob-vs-tmt", seed: 23, pools: ["HOB", "TMT"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recent-woe-sos-mkm", seed: 24, pools: ["WOE", "SOS", "MKM"], agent: "heuristic", maxDecisions: 9000 },
  // Commander (PLAN-E): four random Commander decks, random AI (command zone, tax, returns, damage).
  {
    name: "commander-random-4p",
    seed: 31,
    pools: ["all", "all", "all", "all"],
    agent: "random",
    maxDecisions: 2000,
    commander: true,
  },
  // The two Commander precons (Edgar Markov, Y'shtola): in a duel with the heuristic AI to the end, and with four players.
  {
    name: "commander-duel-precons",
    seed: 32,
    decks: ["cmd-edgar-markov", "cmd-yshtola"],
    agent: "heuristic",
    maxDecisions: 9000,
    commander: true,
  },
  {
    name: "commander-four-precons",
    seed: 33,
    decks: ["cmd-yshtola", "cmd-edgar-markov", "cmd-yshtola", "cmd-edgar-markov"],
    agent: "random",
    maxDecisions: 2500,
    commander: true,
  },
];

function decksOf(spec: GoldenSpec): CardDef[][] {
  if (spec.commander) return commanderDecksOf(spec).map((d) => d.deck);
  if (spec.decks) return spec.decks.map((id) => buildDeck(deckById(id)));
  return (spec.pools ?? []).map((set, i) => randomDeck(spec.seed * 100 + i, set));
}

/** Decks of a Commander golden game: precons (`decks`), or random Commander decks (`pools`). */
function commanderDecksOf(spec: GoldenSpec): { deck: CardDef[]; commanders: number[] }[] {
  if (spec.decks)
    return spec.decks.map((id) => {
      const g = buildGameDeck(deckById(id));
      return { deck: g.deck, commanders: g.commanders ?? [] };
    });
  return (spec.pools ?? []).map((set, i) => randomCommanderDeck(spec.seed * 100 + i, set === "all" ? undefined : set));
}

/** Plays a golden game and returns its record. */
function playGolden(spec: GoldenSpec): GameRecord {
  const decks = decksOf(spec);
  const commanders = spec.commander ? commanderDecksOf(spec).map((d) => d.commanders) : undefined;
  let { state, record } = createRecordedGame({
    seed: spec.seed,
    ...(commanders ? { variant: "commander" as const } : {}),
    players: decks.map((deck, i) => ({ id: `p${i + 1}`, name: `IA ${i + 1}`, deck, commanders: commanders?.[i] })),
  });
  const agents = Object.fromEntries(
    decks.map((_, i) => [`p${i + 1}`, spec.agent === "heuristic" ? heuristicAgent() : randomAgent(spec.seed * 10 + i)]),
  );
  for (let i = 0; i < spec.maxDecisions && state.pending && !state.over; i++) {
    const p = state.pending;
    let d = agents[p.player]?.(state, p.player) ?? fallbackDecision(state, p);
    try {
      state = submit(state, p.player, d).state;
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      d = fallbackDecision(state, p);
      state = submit(state, p.player, d).state;
    }
    recordDecision(record, p.player, d, state);
  }
  // Always a checkpoint on the last state, even if the game is not over.
  const n = record.decisions.length;
  if (record.checkpoints?.at(-1)?.[0] !== n) record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(state)]];
  delete record.createdAt;
  return record;
}

const dir = new URL("../packages/ai/test/golden/", import.meta.url);
const update = process.argv.includes("--update");
const all = process.argv.includes("--all");
let failed = 0;
mkdirSync(dir, { recursive: true });
for (const spec of GOLDEN_GAMES) {
  const file = new URL(`${spec.name}.json`, dir);
  const old = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as GameRecord) : null;
  const divergence = old ? replayChecked(old, card).divergence : null;
  const verdict = !old ? "missing" : divergence ? `divergence (${divergence.message})` : "identical";
  if (all || (update && !old) || (update && divergence)) {
    if (old && divergence && old.rules === RULES_VERSION) {
      console.error(`${spec.name}: ${verdict} at the same version (${RULES_VERSION}): bump RULES_VERSION first`);
      failed++;
      continue;
    }
    const record = playGolden(spec);
    writeFileSync(file, `${JSON.stringify(record)}\n`);
    console.log(
      `${spec.name}: ${verdict} → regenerated (${record.decisions.length} decisions, ${record.checkpoints?.length ?? 0} checkpoints, rules ${record.rules})`,
    );
    continue;
  }
  if (!old || divergence) failed++;
  console.log(`${spec.name}: ${verdict}${old ? ` (rules ${old.rules})` : ""}`);
}
if (failed) {
  console.error(`${failed} golden game(s) to review; after a [rules] lot: npm run golden -- --update`);
  process.exit(1);
}
