/**
 * IA aléatoire : choisit une option légale au hasard. Sert au fuzzing du moteur.
 */
import {
  type Agent,
  attackCandidates,
  blockCandidates,
  type Decision,
  type GameState,
  legalActions,
  opponentOf,
  type PlayerId,
} from "@mtgx/engine";
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
      case "declareAttackers":
        return {
          type: "declareAttackers",
          attackers: attackCandidates(s, me)
            .filter(() => rand() < 0.6)
            .map((id) => ({ id, defender: opponentOf(s, me) })),
        };
      case "declareBlockers": {
        const blocks: { blocker: string; attacker: string }[] = [];
        for (const c of blockCandidates(s, me)) {
          if (rand() < 0.5) blocks.push({ blocker: c.blocker, attacker: pick(rand, c.attackers) as string });
        }
        // Retire les blocages seuls sur une créature avec la menace.
        const count = (a: string) => blocks.filter((b) => b.attacker === a).length;
        const menace = (a: string) => s.defs[s.objects[a]?.defId ?? ""]?.keywords.includes("menace");
        return { type: "declareBlockers", blocks: blocks.filter((b) => !(menace(b.attacker) && count(b.attacker) < 2)) };
      }
      case "priority": {
        const actions = legalActions(s, me).filter((a) => a.type !== "pass");
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
