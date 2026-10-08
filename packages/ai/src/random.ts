/**
 * Random AI: chooses a legal option at random. Used for fuzzing the engine.
 */
import {
  type Agent,
  allowedDefenders,
  attackCandidates,
  attackTaxFor,
  blockCandidates,
  type Decision,
  forcedAttackers,
  type GameState,
  legalActions,
  type PlayerId,
  repairAttacks,
  solvePayment,
} from "@mtgx/engine";
import { mulberryChoice } from "./choices";
import { buildCastDecision } from "./options";

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: T[]): T | undefined {
  return items[Math.floor(rand() * items.length)];
}

function sample<T>(rand: () => number, items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0] as T);
  return out;
}

export function randomAgent(seed: number, passChance = 0.4): Agent {
  const rand = mulberry32(seed);
  return (s: GameState, me: PlayerId): Decision => {
    const p = s.pending;
    const hand = s.players[me]?.hand ?? [];
    switch (p?.kind) {
      case "mulligan":
        return rand() < 0.15 && p.mulligans < 2 ? { type: "mulligan" } : { type: "keep" };
      case "bottomCards":
        return { type: "bottom", cards: sample(rand, hand, p.count) };
      case "discard":
        return { type: "discard", cards: sample(rand, hand, p.count) };
      case "declareAttackers": {
        // Each creature attacks at random what it can attack; the attack requirements (508.1d) are repaired.
        const attackers = attackCandidates(s, me)
          .filter((id) => rand() < 0.6 || forcedAttackers(s, me).includes(id))
          .flatMap((id) => {
            const defender = pick(rand, allowedDefenders(s, id));
            return defender ? [{ id, defender }] : [];
          });
        // Attack taxes (Propaganda, Ghostly Prison): taxed attacks are removed as long as the total cannot be paid.
        const taxOf = (list: typeof attackers) => list.reduce((n, a) => n + attackTaxFor(s, a.defender), 0);
        const payable = (list: typeof attackers) =>
          taxOf(list) === 0 || solvePayment(s, me, { generic: taxOf(list), colored: {}, x: 0 }) !== null;
        while (!payable(attackers)) {
          const i = attackers.findLastIndex((a) => attackTaxFor(s, a.defender) > 0);
          if (i < 0) break;
          attackers.splice(i, 1);
        }
        return { type: "declareAttackers", attackers: repairAttacks(s, me, attackers) };
      }
      case "declareBlockers": {
        const blocks: { blocker: string; attacker: string }[] = [];
        for (const c of blockCandidates(s, me)) {
          if (rand() < 0.5) blocks.push({ blocker: c.blocker, attacker: pick(rand, c.attackers) as string });
        }
        // Removes the lone blocks on a creature with menace.
        const count = (a: string) => blocks.filter((b) => b.attacker === a).length;
        const menace = (a: string) => s.defs[s.objects[a]?.defId ?? ""]?.keywords.includes("menace");
        return { type: "declareBlockers", blocks: blocks.filter((b) => !(menace(b.attacker) && count(b.attacker) < 2)) };
      }
      case "choice":
        return { type: "choose", values: mulberryChoice(rand, p.request) };
      case "priority": {
        // Not a second activation of a source with an ability already waiting on the stack: a free ability
        // (Wandering Fumarole, {0}) would grow the stack faster than the passes empty it.
        const busy = new Set(s.stack.filter((i) => i.kind === "ability" && i.controller === me).map((i) => i.sourceId));
        const actions = legalActions(s, me).filter((a) => a.type !== "pass" && !(a.type === "activate" && busy.has(a.source)));
        if (actions.length === 0 || rand() < passChance) return { type: "pass" };
        const a = pick(rand, actions);
        if (!a) return { type: "pass" };
        return buildCastDecision(a, (list) => pick(rand, list), rand) ?? { type: "pass" };
      }
      default:
        return { type: "pass" };
    }
  };
}
