/**
 * Politique rapide des simulations de l'ISMCTS : des règles simples, sans simulation interne, pour les deux joueurs.
 * Elle doit être très rapide (des milliers de décisions par recherche) plutôt que forte.
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
import { profileValue } from "./evaluate";
import { chooseAttackers, chooseDefenders, naiveBlocks, withRequiredBlocks } from "./heuristic";

/** Effets qui nuisent à leur cible : on vise alors l'adversaire (sinon ses propres créatures). */
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

/** Cible simple : la meilleure créature adverse (ou l'adversaire) pour un effet nuisible, sa meilleure créature sinon. */
function pickTarget(s: GameState, me: PlayerId, spec: TargetOption, bad: boolean): string | undefined {
  const auto = autoTarget(spec);
  if (auto) return auto;
  const opps = opponentsOf(s, me);
  const mineSide = (id: string) => id === me || s.objects[id]?.controller === me;
  const side = spec.legal.filter((id) => (bad ? !mineSide(id) : mineSide(id)));
  const pool = side.length ? side : spec.optional ? [] : spec.legal;
  const value = (id: string) =>
    s.objects[id]?.zone === "battlefield" ? profileValue(chars(s, id)) : opps.includes(id) ? 2.5 : 0;
  return [...pool].sort((a, b) => value(b) - value(a))[0];
}

function castDecision(s: GameState, me: PlayerId, a: ActionOption): Decision | null {
  if (a.type !== "cast" && a.type !== "activate") return null;
  const d = s.defs[s.objects[a.type === "cast" ? a.card : a.source]?.defId ?? ""];
  const bad = harmful(d);
  const specs = a.type === "cast" ? (a.modes[0]?.targets ?? []) : a.targets;
  const targets: Record<string, string[]> = {};
  for (const spec of specs) {
    const t = pickTarget(s, me, spec, bad);
    if (!t && !spec.optional) return null;
    targets[spec.id] = t ? [t] : [];
  }
  if (a.type === "cast") {
    // Coûts additionnels (défausse, sacrifice) : ignorés par la politique rapide.
    if (a.additional?.discard || a.additional?.sacrifice) return null;
    return { type: "cast", card: a.card, face: a.face, mode: a.modes[0]?.index ?? 0, targets, x: a.xMax ?? undefined };
  }
  if (a.additional?.tap || a.additional?.sacrifice || ("discard" in (a.additional ?? {}) && a.additional?.discard)) return null;
  return { type: "activate", source: a.source, ability: a.ability, targets, x: a.xMax ?? undefined };
}

/**
 * Pendant sa phase principale, pile vide : un terrain, puis le sort le plus cher. « Lancez-la » pendant une
 * résolution : le sort le plus cher proposé. Sinon, passer.
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
