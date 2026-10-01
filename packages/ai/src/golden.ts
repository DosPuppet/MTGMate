/**
 * Parties dorées (docs/plans/PLAN-R.md, lot F1) : quelques parties à graine fixe entre decks du méta, enregistrées avec leurs points
 * de contrôle (`ai/test/golden/*.json`). Le test les rejoue : à version des règles égale, elles doivent se rejouer à
 * l'identique. Un lot qui change le comportement du moteur fait avancer `RULES_VERSION` et les régénère
 * (`npm run golden -- --update`).
 */
import { buildDeck, deckById } from "@mtgx/cards";
import {
  createRecordedGame,
  fallbackDecision,
  type GameRecord,
  outcomeHash,
  RulesError,
  recordDecision,
  submit,
} from "@mtgx/engine";
import { randomAgent } from "./random";

export interface GoldenSpec {
  name: string;
  seed: number;
  decks: string[];
}

export const GOLDEN_GAMES: GoldenSpec[] = [
  { name: "izzet-contre-landfall", seed: 11, decks: ["meta-izzet-spellementals", "meta-mono-green-landfall"] },
  { name: "dimir-contre-jund", seed: 12, decks: ["meta-dimir-midrange", "meta-jund-sacrifice"] },
  { name: "4c-contre-izzet", seed: 13, decks: ["meta-4c-control", "meta-izzet-spellementals"] },
  { name: "landfall-contre-dimir", seed: 14, decks: ["meta-mono-green-landfall", "meta-dimir-midrange"] },
  {
    name: "quatre-joueurs-a",
    seed: 15,
    decks: ["meta-jund-sacrifice", "meta-4c-control", "meta-izzet-spellementals", "meta-mono-green-landfall"],
  },
  {
    name: "quatre-joueurs-b",
    seed: 16,
    decks: ["meta-dimir-midrange", "meta-mono-green-landfall", "meta-jund-sacrifice", "meta-4c-control"],
  },
];

/** Joue une partie dorée avec des IA aléatoires (au plus `maxDecisions` décisions) et renvoie son enregistrement. */
export function playGolden(spec: GoldenSpec, maxDecisions = 1200): GameRecord {
  let { state, record } = createRecordedGame({
    seed: spec.seed,
    players: spec.decks.map((id, i) => ({ id: `p${i + 1}`, name: `IA ${i + 1}`, deck: buildDeck(deckById(id)) })),
  });
  const agents = Object.fromEntries(spec.decks.map((_, i) => [`p${i + 1}`, randomAgent(spec.seed * 10 + i)]));
  for (let i = 0; i < maxDecisions && state.pending && !state.over; i++) {
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
