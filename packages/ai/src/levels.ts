/**
 * Niveaux de l'IA : débutant, moyen, élevé (voir docs/ia.md).
 */
import type { Agent } from "@mtgx/engine";
import { decide } from "./heuristic";
import { ismctsPriority } from "./ismcts";
import { MEDIUM_PROFILE, type Profile } from "./profile";
import { mulberry32 } from "./random";

export type AiLevel = "beginner" | "medium" | "expert";

export const AI_LEVELS: readonly AiLevel[] = ["beginner", "medium", "expert"];

/** Budget de réflexion : en temps (interface), ou en itérations (tests, tournoi : reproductible). */
export type AiBudget = { ms: number } | { iterations: number };

export interface AiOptions {
  /** Graine du hasard de l'IA (bruit du débutant, déterminisations de l'ISMCTS). */
  seed?: number;
  budget?: AiBudget;
  /** Nombre de joueurs de la partie : l'ISMCTS n'est utilisé qu'en duel. */
  players?: number;
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
  // ISMCTS : niveau élevé, en duel seulement (en multijoueur, trop coûteux pour rester fluide).
  const ismcts = level === "expert" && (opts.players ?? 2) === 2;
  const iterations = budget && "iterations" in budget ? budget.iterations : undefined;
  return (s, me) => {
    // Budget en temps : la recherche s'arrête à l'échéance (machine lente) en gardant le meilleur trouvé.
    deadline = ms === null ? Number.POSITIVE_INFINITY : Date.now() + ms;
    // Les attaques restent à la recherche par simulation (combat.ts) : départagées par l'ISMCTS, dont les simulations
    // font bloquer l'adversaire naïvement, elles devenaient trop agressives (mesuré au tournoi, voir docs/ia.md).
    const p = s.pending;
    if (ismcts && p?.kind === "priority" && p.player === me && (iterations ?? 1) > 0) {
      const d = ismctsPriority(s, me, profile, { rand, iterations, ms: ms ?? undefined });
      if (d) return d;
    }
    return decide(s, me, profile);
  };
}
