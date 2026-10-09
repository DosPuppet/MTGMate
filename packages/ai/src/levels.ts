/**
 * AI levels: beginner, medium, expert (see docs/ai.md).
 */
import type { Agent } from "@mtgx/engine";
import { decide } from "./heuristic";
import { forAgent, ismctsPriority } from "./ismcts";
import { MEDIUM_PROFILE, type Profile } from "./profile";
import { mulberry32 } from "./random";

export type AiLevel = "beginner" | "medium" | "expert";

export const AI_LEVELS: readonly AiLevel[] = ["beginner", "medium", "expert"];

/** Thinking budget: in time (interface), or in iterations (tests, tournament: reproducible). */
export type AiBudget = { ms: number } | { iterations: number };

export interface AiOptions {
  /** Seed of the AI's randomness (beginner noise, ISMCTS determinizations). */
  seed?: number;
  budget?: AiBudget;
  /** Number of players of the game: ISMCTS is used only in a duel. */
  players?: number;
  /**
   * The decisions are taken on the state as the seat may know it (`forAgent`): hidden hands, libraries and face-down
   * cards are redrawn. The interface and the server set it; the tests and the tournament compare both.
   */
  fair?: boolean;
}

export function aiAgent(level: AiLevel, opts: AiOptions = {}): Agent {
  const rand = mulberry32(opts.seed ?? 1);
  const budget = opts.budget;
  const ms = budget && "ms" in budget ? budget.ms : null;
  let deadline = Number.POSITIVE_INFINITY;
  const profile: Profile =
    level === "beginner"
      ? {
          ...MEDIUM_PROFILE,
          rand,
          sloppiness: 0.45,
          forgetfulness: 0.2,
          responds: false,
          holdsCounters: false,
          attack: "naive",
          block: "naive",
          mulligan: "loose",
        }
      : level === "expert"
        ? {
            ...MEDIUM_PROFILE,
            rand,
            attack: "search",
            block: "search",
            exposure: true,
            outOfTime: () => Date.now() > deadline,
          }
        : { ...MEDIUM_PROFILE, rand };
  // ISMCTS: expert level, in a duel only (in multiplayer, too costly to stay smooth).
  const ismcts = level === "expert" && (opts.players ?? 2) === 2;
  const iterations = budget && "iterations" in budget ? budget.iterations : undefined;
  // Its own stream, so that `fair` does not change the other random draws of the level.
  const fairRand = mulberry32(((opts.seed ?? 1) * 7919 + 17) | 0);
  return (s, me) => {
    // Time budget: the search stops at the deadline (slow machine), keeping the best found.
    deadline = ms === null ? Number.POSITIVE_INFINITY : Date.now() + ms;
    // Attacks stay with the search by simulation (combat.ts): when decided by ISMCTS, whose simulations
    // make the opponent block naively, they became too aggressive (measured in the tournament, see docs/ai.md).
    const p = s.pending;
    if (ismcts && p?.kind === "priority" && p.player === me && (iterations ?? 1) > 0) {
      const d = ismctsPriority(s, me, profile, { rand, iterations, ms: ms ?? undefined });
      if (d) return d;
    }
    return decide(opts.fair ? forAgent(s, me, fairRand) : s, me, profile);
  };
}
