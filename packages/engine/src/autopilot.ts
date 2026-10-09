/**
 * "Arena-style" autopilot: answers trivial decisions on behalf of the player.
 * The engine stays strict; this layer is what makes the game flow.
 */
import { meaningfulActions } from "./legal";
import { forcedAttacks } from "./turn";
import type { Decision, GameState, PlayerId, Step, TargetOption } from "./types";

export interface AutopilotSettings {
  /** Disables all automation: the player receives every priority and every choice (including the order of their triggers). */
  fullControl: boolean;
  /** Steps where we stop (if there is something to do), during one's own turn and the opponent's. */
  stops: { own: Step[]; opponent: Step[] };
  /** "End turn": pass every priority until the end of the given turn. */
  passUntilTurn: number | null;
  /**
   * Opponent's spell or ability on the stack: give control back to the player even if they have no response,
   * so that the interface shows it to them (it passes on its own after a few seconds).
   */
  revealOpponentStack?: boolean;
  /**
   * Hold priority on one's own spells and abilities (to respond to them oneself, Arena-style); the order of one's
   * triggers is then asked of the player when it matters.
   */
  holdPriority?: boolean;
  /**
   * "End turn": soft pass (by default), which gives control back as soon as an opponent puts something on the stack;
   * hard pass, which lets everything go until the end of the turn.
   */
  passMode?: "soft" | "hard";
  /**
   * "Always answer this way" (PLAN-L L8): the kept answers to the "may" questions of triggered abilities, by
   * `ChoiceRequest.remember` (1: yes, 0: no). They also apply in full control.
   */
  autoAnswers?: Record<string, 0 | 1>;
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
    // Even when passing the turn, the creatures that must attack do attack.
    return { type: "declareAttackers", attackers: forcedAttacks(s, player) };
  }
  if (p.kind === "choice") {
    const kept = p.request.remember !== undefined ? settings.autoAnswers?.[p.request.remember] : undefined;
    if (kept !== undefined) return { type: "choose", values: [kept] };
    if (!p.request.autoOk || settings.fullControl) return null;
    // Order of one's triggers: chosen by the autopilot, unless priority is held and the order matters
    // (different abilities; the same ability several times, the order does not matter).
    if (p.request.intent === "triggerOrder" && settings.holdPriority && triggerOrderMatters(s, p.request.suggested)) return null;
    return { type: "choose", values: p.request.suggested };
  }
  if (p.kind !== "priority") return null;
  // "Cast it" during a resolution: a real decision, never passed on behalf of the player.
  if (p.castNow) return null;
  const top = s.stack[s.stack.length - 1];
  // "End turn" is an explicit request: it also holds in full control. In a soft pass, an opponent's spell or ability
  // gives control back to the player (the client then cancels the pass).
  if (passingTurn) return settings.passMode !== "hard" && top && top.controller !== player ? null : { type: "pass" };
  if (settings.fullControl) return null;
  // Opponent's spell or ability: the player must see it, even with no possible response (the interface passes on its own).
  if (top && top.controller !== player && settings.revealOpponentStack) return null;
  // Own turn, empty stack, second main phase: we always stop, even with nothing to do. The player ends their turn
  // themselves ("End turn"); otherwise the turn goes to the next player without them seeing anything, as if skipped.
  if (!top && s.turn.active === player && s.turn.step === "main2") return null;
  // Nothing to do: pass.
  if (meaningfulActions(s, player).length === 0) return { type: "pass" };
  if (top) {
    // One's own spell: let it resolve, unless priority is held. Opponent's spell: response window.
    return top.controller === player && !settings.holdPriority ? { type: "pass" } : null;
  }
  const stops = s.turn.active === player ? settings.stops.own : settings.stops.opponent;
  return stops.includes(s.turn.step) ? null : { type: "pass" };
}

function triggerOrderMatters(s: GameState, ids: readonly unknown[]): boolean {
  const mine = s.triggers.filter((t) => ids.includes(t.id));
  return mine.some((t) => t.sourceDefId !== mine[0]?.sourceDefId || t.abilityIndex !== mine[0]?.abilityIndex);
}

/** Automatic choice of targets when there is only one possibility (and the target is not optional). */
export function autoTarget(t: TargetOption): string | null {
  return !t.optional && !t.count && t.legal.length === 1 ? (t.legal[0] as string) : null;
}
