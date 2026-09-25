/**
 * Autopilot « façon Arena » : répond à la place du joueur aux décisions triviales.
 * Le moteur reste strict ; c'est cette couche qui rend le jeu fluide.
 */
import { meaningfulActions } from "./legal";
import { opponentsOf } from "./state";
import { forcedAttackers } from "./turn";
import type { Decision, GameState, PlayerId, Step, TargetOption } from "./types";

export interface AutopilotSettings {
  /** Désactive toute automatisation : le joueur reçoit chaque priorité. */
  fullControl: boolean;
  /** Étapes où l'on s'arrête (si l'on a quelque chose à faire), pendant son tour et celui de l'adversaire. */
  stops: { own: Step[]; opponent: Step[] };
  /** « Fin du tour » : passer toutes les priorités jusqu'à la fin du tour indiqué. */
  passUntilTurn: number | null;
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  fullControl: false,
  stops: {
    own: ["main1", "main2", "declareBlockers"],
    opponent: ["declareAttackers", "declareBlockers"],
  },
  passUntilTurn: null,
};

export function autopilotDecision(s: GameState, player: PlayerId, settings: AutopilotSettings): Decision | null {
  const p = s.pending;
  if (!p || p.player !== player || s.over) return null;
  const passingTurn = settings.passUntilTurn === s.turn.number;

  if (p.kind === "declareAttackers") {
    if (!passingTurn) return null;
    // Même en passant le tour, les créatures obligées d'attaquer attaquent.
    const defender = opponentsOf(s, player)[0];
    return { type: "declareAttackers", attackers: defender ? forcedAttackers(s, player).map((id) => ({ id, defender })) : [] };
  }
  if (p.kind === "choice")
    return p.request.autoOk && !settings.fullControl ? { type: "choose", values: p.request.suggested } : null;
  if (p.kind !== "priority") return null;
  // « Fin du tour » est une demande explicite : elle vaut aussi en contrôle total.
  if (passingTurn) return { type: "pass" };
  if (settings.fullControl) return null;
  // Rien à faire : on passe.
  if (meaningfulActions(s, player).length === 0) return { type: "pass" };
  const top = s.stack[s.stack.length - 1];
  if (top) {
    // Son propre sort : on le laisse se résoudre. Sort adverse : fenêtre de réponse.
    return top.controller === player ? { type: "pass" } : null;
  }
  const stops = s.turn.active === player ? settings.stops.own : settings.stops.opponent;
  return stops.includes(s.turn.step) ? null : { type: "pass" };
}

/** Choix automatique des cibles quand il n'y a qu'une seule possibilité (et que la cible n'est pas optionnelle). */
export function autoTarget(t: TargetOption): string | null {
  return !t.optional && !t.count && t.legal.length === 1 ? (t.legal[0] as string) : null;
}
