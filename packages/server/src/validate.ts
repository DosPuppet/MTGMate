/**
 * Run-time validation of the received messages: the TypeScript typing of the protocol protects nothing at the network
 * boundary. Decisions are checked in depth by the engine (RulesError); here, only their shape.
 */
import { type AutopilotSettings, type Decision, STEPS, type Step } from "@mtgx/engine";

const DECISION_TYPES = new Set<Decision["type"]>([
  "keep",
  "mulligan",
  "bottom",
  "pass",
  "playLand",
  "cast",
  "activate",
  "tapForMana",
  "undoMana",
  "declareAttackers",
  "declareBlockers",
  "discard",
  "choose",
  "concede",
]);

/** Minimal shape of a decision: an object whose type is known. */
export function isDecision(raw: unknown): raw is Decision {
  return (
    !!raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    DECISION_TYPES.has((raw as { type?: unknown }).type as Decision["type"])
  );
}

function steps(raw: unknown): Step[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((x): x is Step => typeof x === "string" && (STEPS as readonly string[]).includes(x));
}

/**
 * Autopilot settings received from a client: only the known, well-typed fields are kept.
 * A malformed setting (`stops: null`…) would make the autopilot fail and freeze the game.
 */
export function cleanSettings(raw: unknown): Partial<AutopilotSettings> {
  const out: Partial<AutopilotSettings> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.fullControl === "boolean") out.fullControl = r.fullControl;
  if (typeof r.revealOpponentStack === "boolean") out.revealOpponentStack = r.revealOpponentStack;
  if (typeof r.holdPriority === "boolean") out.holdPriority = r.holdPriority;
  if (r.passMode === "soft" || r.passMode === "hard") out.passMode = r.passMode;
  if (r.passUntilTurn === null || (Number.isInteger(r.passUntilTurn) && (r.passUntilTurn as number) >= 0)) {
    out.passUntilTurn = r.passUntilTurn as number | null;
  }
  if (r.stops && typeof r.stops === "object") {
    const s = r.stops as Record<string, unknown>;
    const own = steps(s.own);
    const opponent = steps(s.opponent);
    if (own && opponent) out.stops = { own, opponent };
  }
  return out;
}
