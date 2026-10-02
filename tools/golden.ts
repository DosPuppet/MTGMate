/**
 * Parties dorées (docs/plans/PLAN-R.md, lot F1 ; rendues détectrices par docs/plans/PLAN-C.md, lot C2) : quelques parties
 * à graine fixe, enregistrées avec leurs points de contrôle (`packages/ai/test/golden/*.json`). Le test
 * `ai/test/golden.test.ts` les rejoue toutes :
 * - une partie qui se rejoue à l'identique passe, quelle que soit la version des règles qui l'a enregistrée ;
 * - une divergence à version égale est une erreur : le comportement du moteur a changé sans faire avancer `RULES_VERSION` ;
 * - une divergence après un changement de `RULES_VERSION` demande de régénérer **cette** partie (`--update`).
 *
 * Usage : npm run golden              vérifie (comme le test)
 *         npm run golden -- --update   régénère seulement les parties qui divergent (et les parties absentes)
 *         npm run golden -- --all      régénère toutes les parties
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { heuristicAgent, randomAgent } from "@mtgx/ai";
import { buildDeck, card, deckById } from "@mtgx/cards";
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
import { randomDeck } from "./random-deck";

interface GoldenSpec {
  name: string;
  seed: number;
  /** Decks préconstruits (`deckById`), un par joueur ; ou `pools` : deck aléatoire tiré surtout d'une extension. */
  decks?: string[];
  pools?: string[];
  /** IA aléatoire (parties variées, coupées à `maxDecisions`) ou heuristique (parties qui vont au bout). */
  agent: "random" | "heuristic";
  maxDecisions: number;
}

const GOLDEN_GAMES: GoldenSpec[] = [
  {
    name: "izzet-contre-landfall",
    seed: 11,
    decks: ["meta-izzet-spellementals", "meta-mono-green-landfall"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "dimir-contre-jund",
    seed: 12,
    decks: ["meta-dimir-midrange", "meta-jund-sacrifice"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "4c-contre-izzet",
    seed: 13,
    decks: ["meta-4c-control", "meta-izzet-spellementals"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "landfall-contre-dimir",
    seed: 14,
    decks: ["meta-mono-green-landfall", "meta-dimir-midrange"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "quatre-joueurs-a",
    seed: 15,
    decks: ["meta-jund-sacrifice", "meta-4c-control", "meta-izzet-spellementals", "meta-mono-green-landfall"],
    agent: "random",
    maxDecisions: 1200,
  },
  {
    name: "quatre-joueurs-b",
    seed: 16,
    decks: ["meta-dimir-midrange", "meta-mono-green-landfall", "meta-jund-sacrifice", "meta-4c-control"],
    agent: "random",
    maxDecisions: 1200,
  },
  // Extensions récentes, jouées par l'IA heuristique jusqu'au bout de la partie.
  { name: "recentes-ecl-contre-tla", seed: 21, pools: ["ECL", "TLA"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recentes-msh-contre-spm", seed: 22, pools: ["MSH", "SPM"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recentes-hob-contre-tmt", seed: 23, pools: ["HOB", "TMT"], agent: "heuristic", maxDecisions: 6000 },
  { name: "recentes-woe-sos-mkm", seed: 24, pools: ["WOE", "SOS", "MKM"], agent: "heuristic", maxDecisions: 9000 },
];

function decksOf(spec: GoldenSpec): CardDef[][] {
  if (spec.decks) return spec.decks.map((id) => buildDeck(deckById(id)));
  return (spec.pools ?? []).map((set, i) => randomDeck(spec.seed * 100 + i, set));
}

/** Joue une partie dorée et renvoie son enregistrement. */
function playGolden(spec: GoldenSpec): GameRecord {
  const decks = decksOf(spec);
  let { state, record } = createRecordedGame({
    seed: spec.seed,
    players: decks.map((deck, i) => ({ id: `p${i + 1}`, name: `IA ${i + 1}`, deck })),
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
  // Toujours un point de contrôle sur le dernier état, même si la partie n'est pas finie.
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
  const verdict = !old ? "absente" : divergence ? `divergence (${divergence.message})` : "identique";
  if (all || (update && !old) || (update && divergence)) {
    if (old && divergence && old.rules === RULES_VERSION) {
      console.error(`${spec.name} : ${verdict} à version égale (${RULES_VERSION}) : faire avancer RULES_VERSION d'abord`);
      failed++;
      continue;
    }
    const record = playGolden(spec);
    writeFileSync(file, `${JSON.stringify(record)}\n`);
    console.log(
      `${spec.name} : ${verdict} → régénérée (${record.decisions.length} décisions, ${record.checkpoints?.length ?? 0} points de contrôle, règles ${record.rules})`,
    );
    continue;
  }
  if (!old || divergence) failed++;
  console.log(`${spec.name} : ${verdict}${old ? ` (règles ${old.rules})` : ""}`);
}
if (failed) {
  console.error(`${failed} partie(s) dorée(s) à revoir ; après un lot [règles] : npm run golden -- --update`);
  process.exit(1);
}
