/**
 * Staged game (tutorial): from the description by card names (`ScenarioSpec`) to the engine's game.
 * Pure: used by the worker (definitions received in "start") and by the tests (full card database).
 */
import { aiAgent, scriptedAgent } from "@mtgx/ai";
import { type Agent, type CardDef, createScenario, type ScenarioPlayer, type StepResult } from "@mtgx/engine";
import type { ScenarioSide, ScenarioSpec } from "./protocol";

export const YOU = "p1";
/** Thinking budget of the AIs in the browser: in time, for the same latency whatever the machine. */
export const AI_BUDGET = { ms: 700 } as const;
export const OPPONENT = "p2";

/** Every card name of a scenario (to send it their definitions). */
export function scenarioCards(spec: ScenarioSpec): string[] {
  return [spec.you, spec.opponent].flatMap((side) => [
    ...side.library,
    ...side.hand,
    ...(side.graveyard ?? []),
    ...(side.battlefield ?? []).map((b) => (typeof b === "string" ? b : b.card)),
  ]);
}

function player(id: string, fallbackName: string, side: ScenarioSide, def: (name: string) => CardDef): ScenarioPlayer {
  return {
    id,
    name: side.name ?? fallbackName,
    life: side.life,
    library: side.library.map(def),
    hand: side.hand.map(def),
    graveyard: (side.graveyard ?? []).map(def),
    battlefield: (side.battlefield ?? []).map((b) =>
      typeof b === "string" ? { def: def(b) } : { def: def(b.card), tapped: b.tapped, sick: b.sick },
    ),
  };
}

export function buildScenario(
  spec: ScenarioSpec,
  def: (name: string) => CardDef,
  seed: number,
  /** Default names of the two sides (a side can name itself); the interface passes them in its language. */
  playerName = "You",
  opponentName = "Opponent",
): StepResult & { opponent: Agent } {
  const game = createScenario({
    seed,
    active: spec.active === "you" ? YOU : OPPONENT,
    turn: spec.turn,
    mulligan: spec.mulligan,
    players: [player(YOU, playerName, spec.you, def), player(OPPONENT, opponentName, spec.opponent, def)],
  });
  const opponent =
    typeof spec.opponentPlays === "string"
      ? aiAgent(spec.opponentPlays, { seed, budget: AI_BUDGET, players: 2 })
      : scriptedAgent(spec.opponentPlays);
  return { ...game, opponent };
}
