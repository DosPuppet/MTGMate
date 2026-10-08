/**
 * Fast policy of the ISMCTS simulations: simple rules, without inner simulation, for both players.
 * It must be very fast (thousands of decisions per search) rather than strong.
 */
import {
  type ActionOption,
  type Agent,
  autoTarget,
  type CardDef,
  chars,
  type Decision,
  fallbackDecision,
  forcedAttackers,
  type GameState,
  legalActions,
  manaValue,
  opponentsOf,
  type PlayerId,
  type TargetOption,
} from "@mtgx/engine";
import { profileValue, staysTapped } from "./evaluate";
import { chooseAttackers, chooseDefenders, naiveBlocks, withRequiredBlocks } from "./heuristic";

/** Effects that harm their target: we then aim at the opponent (otherwise at one's own creatures). */
const HARMFUL = [
  '"op":"damage"',
  '"op":"destroy"',
  '"op":"exile',
  '"op":"bounce"',
  '"op":"tap"',
  '"op":"counter"',
  '"op":"fight"',
  '"op":"gainControl"',
  '"op":"sacrifice"',
  '"op":"loseLife"',
  '"cantAttack"',
  '"cantBlock"',
  '"power":-',
];
const harmfulCache = new Map<string, boolean>();

function harmful(d: CardDef | undefined): boolean {
  if (!d) return true;
  let h = harmfulCache.get(d.id);
  if (h === undefined) {
    const text = JSON.stringify([d.spell ?? null, d.abilities]);
    h = HARMFUL.some((k) => text.includes(k));
    harmfulCache.set(d.id, h);
  }
  return h;
}

/** Simple target: the best opposing creature (or the opponent) for a harmful effect, one's best creature otherwise. */
function pickTarget(s: GameState, me: PlayerId, spec: TargetOption, bad: boolean): string | undefined {
  const auto = autoTarget(spec);
  if (auto) return auto;
  const opps = opponentsOf(s, me);
  const mineSide = (id: string) => id === me || s.objects[id]?.controller === me;
  const side = spec.legal.filter((id) => (bad ? !mineSide(id) : mineSide(id)));
  const pool = side.length ? side : spec.optional ? [] : spec.legal;
  const value = (id: string) =>
    s.objects[id]?.zone === "battlefield" ? profileValue(chars(s, id), staysTapped(s, id)) : opps.includes(id) ? 2.5 : 0;
  return [...pool].sort((a, b) => value(b) - value(a))[0];
}

function castDecision(s: GameState, me: PlayerId, a: ActionOption): Decision | null {
  if (a.type !== "cast" && a.type !== "activate") return null;
  const d = s.defs[s.objects[a.type === "cast" ? a.card : a.source]?.defId ?? ""];
  const bad = harmful(d);
  const specs = a.type === "cast" ? (a.modes[0]?.targets ?? []) : a.targets;
  const targets: Record<string, string[]> = {};
  for (const spec0 of specs) {
    // "Target player … the cards in their graveyard": those of the player already chosen.
    const of = spec0.ofTarget;
    const spec = of
      ? { ...spec0, legal: spec0.legal.filter((id) => (targets[of.id] ?? []).includes(of.holders[id] ?? "")) }
      : spec0;
    const t = pickTarget(s, me, spec, bad);
    if (!t && !spec.optional) return null;
    targets[spec.id] = t ? [t] : [];
  }
  if (a.type === "cast") {
    // Additional costs (discard, sacrifice): ignored by the fast policy.
    if (a.additional?.discard || a.additional?.sacrifice) return null;
    return { type: "cast", card: a.card, face: a.face, mode: a.modes[0]?.index ?? 0, targets, x: a.xMax ?? undefined };
  }
  // Crew: the engine's default choice (without `tap`) is fine.
  if (
    (a.additional?.tap && a.additional.tap.minPower === undefined) ||
    a.additional?.sacrifice ||
    ("discard" in (a.additional ?? {}) && a.additional?.discard)
  )
    return null;
  return { type: "activate", source: a.source, ability: a.ability, targets, x: a.xMax ?? undefined };
}

/**
 * During one's main phase, empty stack: a land, then the most expensive spell. "Cast it" during a
 * resolution: the most expensive spell offered. Otherwise, pass.
 */
function priority(s: GameState, me: PlayerId): Decision {
  const pass: Decision = { type: "pass" };
  const castNow = s.pending?.kind === "priority" && !!s.pending.castNow;
  const main = s.turn.active === me && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0;
  if (!main && !castNow) return pass;
  const actions = legalActions(s, me);
  const land = actions.find((a) => a.type === "playLand");
  if (land?.type === "playLand") return { type: "playLand", card: land.card };
  const casts = actions
    .filter((a) => a.type === "cast" && !a.faceDown && a.xMax === null)
    .sort((a, b) => {
      const cost = (x: ActionOption) => (x.type === "cast" ? manaValue(s.defs[s.objects[x.card]?.defId ?? ""]?.manaCost) : 0);
      return cost(b) - cost(a);
    });
  for (const a of casts) {
    const d = castDecision(s, me, a);
    if (d) return d;
  }
  return pass;
}

export function fastPolicy(): Agent {
  return (s, me) => {
    const p = s.pending;
    if (!p) return { type: "pass" };
    switch (p.kind) {
      case "priority":
        return priority(s, me);
      case "declareAttackers":
        return {
          type: "declareAttackers",
          attackers: chooseDefenders(s, me, [...new Set([...chooseAttackers(s, me), ...forcedAttackers(s, me)])]),
        };
      case "declareBlockers":
        return { type: "declareBlockers", blocks: withRequiredBlocks(s, me, naiveBlocks(s, me)) };
      default:
        return fallbackDecision(s, p);
    }
  };
}
