/**
 * Validation à l'exécution des messages reçus : le typage TypeScript du protocole ne protège rien à la frontière
 * réseau. Les décisions sont vérifiées en profondeur par le moteur (RulesError) ; ici, seulement leur forme.
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
  "declareAttackers",
  "declareBlockers",
  "discard",
  "choose",
  "concede",
]);

/** Forme minimale d'une décision : un objet dont le type est connu. */
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
 * Réglages de l'automatisme reçus d'un client : seuls les champs connus et bien typés sont gardés.
 * Un réglage malformé (`stops: null`…) ferait échouer l'automatisme et figerait la partie.
 */
export function cleanSettings(raw: unknown): Partial<AutopilotSettings> {
  const out: Partial<AutopilotSettings> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.fullControl === "boolean") out.fullControl = r.fullControl;
  if (typeof r.revealOpponentStack === "boolean") out.revealOpponentStack = r.revealOpponentStack;
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
