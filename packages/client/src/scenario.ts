/**
 * Partie mise en scène (tutoriel) : de la description par noms de cartes (`ScenarioSpec`) à la partie du moteur.
 * Pur : sert au worker (définitions reçues dans « start ») et aux tests (base de cartes complète).
 */
import { heuristicAgent, scriptedAgent } from "@mtgx/ai";
import { type Agent, type CardDef, createScenario, type ScenarioPlayer, type StepResult } from "@mtgx/engine";
import type { ScenarioSide, ScenarioSpec } from "./protocol";

export const YOU = "p1";
export const OPPONENT = "p2";

/** Tous les noms de cartes d'un scénario (pour lui envoyer leurs définitions). */
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
  playerName = "Vous",
): StepResult & { opponent: Agent } {
  const game = createScenario({
    seed,
    active: spec.active === "you" ? YOU : OPPONENT,
    turn: spec.turn,
    mulligan: spec.mulligan,
    players: [player(YOU, playerName, spec.you, def), player(OPPONENT, "Adversaire", spec.opponent, def)],
  });
  const opponent = spec.opponentPlays === "heuristic" ? heuristicAgent() : scriptedAgent(spec.opponentPlays);
  return { ...game, opponent };
}
