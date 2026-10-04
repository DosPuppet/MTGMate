/**
 * Autopilot « façon Arena » : répond à la place du joueur aux décisions triviales.
 * Le moteur reste strict ; c'est cette couche qui rend le jeu fluide.
 */
import { meaningfulActions } from "./legal";
import { forcedAttacks } from "./turn";
import type { Decision, GameState, PlayerId, Step, TargetOption } from "./types";

export interface AutopilotSettings {
  /** Désactive toute automatisation : le joueur reçoit chaque priorité et chaque choix (dont l'ordre de ses déclencheurs). */
  fullControl: boolean;
  /** Étapes où l'on s'arrête (si l'on a quelque chose à faire), pendant son tour et celui de l'adversaire. */
  stops: { own: Step[]; opponent: Step[] };
  /** « Fin du tour » : passer toutes les priorités jusqu'à la fin du tour indiqué. */
  passUntilTurn: number | null;
  /**
   * Sort ou capacité adverse sur la pile : rendre la main au joueur même s'il n'a aucune réponse,
   * pour que l'interface le lui montre (elle passe seule après quelques secondes).
   */
  revealOpponentStack?: boolean;
  /**
   * Garder la priorité sur ses propres sorts et capacités (pour y répondre soi-même, façon Arena) ; l'ordre de ses
   * déclencheurs est alors demandé au joueur quand il compte.
   */
  holdPriority?: boolean;
  /**
   * « Fin du tour » : passe douce (par défaut), qui rend la main dès qu'un adversaire met quelque chose sur la pile ; passe
   * dure, qui laisse tout passer jusqu'à la fin du tour.
   */
  passMode?: "soft" | "hard";
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  fullControl: false,
  stops: {
    own: ["main1", "main2", "declareBlockers"],
    opponent: ["declareAttackers", "declareBlockers"],
  },
  passUntilTurn: null,
  revealOpponentStack: true,
};

export function autopilotDecision(s: GameState, player: PlayerId, settings: AutopilotSettings): Decision | null {
  const p = s.pending;
  if (!p || p.player !== player || s.over) return null;
  const passingTurn = settings.passUntilTurn === s.turn.number;

  if (p.kind === "declareAttackers") {
    if (!passingTurn) return null;
    // Même en passant le tour, les créatures obligées d'attaquer attaquent.
    return { type: "declareAttackers", attackers: forcedAttacks(s, player) };
  }
  if (p.kind === "choice") {
    if (!p.request.autoOk || settings.fullControl) return null;
    // Ordre de ses déclencheurs : choisi par l'automatisme, sauf si l'on garde la priorité et que l'ordre compte
    // (des capacités différentes ; la même capacité plusieurs fois, l'ordre est indifférent).
    if (p.request.intent === "triggerOrder" && settings.holdPriority && triggerOrderMatters(s, p.request.suggested)) return null;
    return { type: "choose", values: p.request.suggested };
  }
  if (p.kind !== "priority") return null;
  // « Lancez-la » pendant une résolution : une vraie décision, jamais passée à la place du joueur.
  if (p.castNow) return null;
  const top = s.stack[s.stack.length - 1];
  // « Fin du tour » est une demande explicite : elle vaut aussi en contrôle total. En passe douce, un sort ou une
  // capacité adverse rend la main au joueur (le client annule alors la passe).
  if (passingTurn) return settings.passMode !== "hard" && top && top.controller !== player ? null : { type: "pass" };
  if (settings.fullControl) return null;
  // Sort ou capacité adverse : le joueur doit le voir, même sans réponse possible (l'interface passe seule).
  if (top && top.controller !== player && settings.revealOpponentStack) return null;
  // Rien à faire : on passe.
  if (meaningfulActions(s, player).length === 0) return { type: "pass" };
  if (top) {
    // Son propre sort : on le laisse se résoudre, sauf si l'on garde la priorité. Sort adverse : fenêtre de réponse.
    return top.controller === player && !settings.holdPriority ? { type: "pass" } : null;
  }
  const stops = s.turn.active === player ? settings.stops.own : settings.stops.opponent;
  return stops.includes(s.turn.step) ? null : { type: "pass" };
}

function triggerOrderMatters(s: GameState, ids: readonly unknown[]): boolean {
  const mine = s.triggers.filter((t) => ids.includes(t.id));
  return mine.some((t) => t.sourceDefId !== mine[0]?.sourceDefId || t.abilityIndex !== mine[0]?.abilityIndex);
}

/** Choix automatique des cibles quand il n'y a qu'une seule possibilité (et que la cible n'est pas optionnelle). */
export function autoTarget(t: TargetOption): string | null {
  return !t.optional && !t.count && t.legal.length === 1 ? (t.legal[0] as string) : null;
}
