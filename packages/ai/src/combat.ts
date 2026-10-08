/**
 * Combat by simulation (expert level).
 *
 * Attacks: each candidate set of attackers is played on a copy of the state; the opponent blocks like the medium
 * AI; the position after the combat is evaluated taking the counterattack into account (the creatures that
 * attacked stay tapped during the opponent's turn).
 *
 * Blocks: starting from the greedy blocks of the medium AI, we then try double blocks and a few local
 * improvements (remove, swap a blocker).
 */
import {
  attackCandidates,
  blockCandidates,
  chars,
  type Decision,
  forcedAttackers,
  type GameState,
  type ObjectId,
  type PlayerId,
} from "@mtgx/engine";
import { afterCombat, evaluate, simulate, trySubmit } from "./evaluate";
import { chooseAttackers, chooseBlocks, chooseDefenders, withRequiredBlocks } from "./heuristic";
import type { Profile } from "./profile";

type Block = { blocker: ObjectId; attacker: ObjectId };

const keyOf = (ids: ObjectId[]) => [...ids].sort().join(",");

/** Sets of attackers to try: the rules' choice first, then all the subsets (or prefixes). */
function attackSets(s: GameState, me: PlayerId): ObjectId[][] {
  const forced = forcedAttackers(s, me);
  const cands = attackCandidates(s, me).filter((id) => chars(s, id).power > 0 || forced.includes(id));
  const optional = cands.filter((id) => !forced.includes(id));
  const sets: ObjectId[][] = [[...new Set([...chooseAttackers(s, me), ...forced])], forced];
  if (optional.length <= 4) {
    for (let mask = 1; mask < 1 << optional.length; mask++) sets.push([...forced, ...optional.filter((_, i) => (mask >> i) & 1)]);
  } else {
    // Too many combinations: the most evasive and the strongest first, by growing prefixes.
    const evasive = (id: ObjectId) =>
      chars(s, id).keywords.some((k) => k === "flying" || k === "unblockable" || k === "menace" || k === "trample");
    const order = [...optional].sort((a, b) => Number(evasive(b)) - Number(evasive(a)) || chars(s, b).power - chars(s, a).power);
    for (let n = 1; n <= order.length; n++) sets.push([...forced, ...order.slice(0, n)]);
  }
  const seen = new Set<string>();
  return sets.filter((set) => {
    const k = keyOf(set);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Plays the combat on a copy: attack, opposing blocks (like the medium AI), damage. */
function playCombat(s: GameState, me: PlayerId, attackers: ObjectId[]): GameState | null {
  const until = afterCombat(s.turn.number);
  let cur = trySubmit(s, me, { type: "declareAttackers", attackers: chooseDefenders(s, me, attackers) });
  if (!cur) return null;
  // Each defender blocks in turn (multiplayer: one defender per attacked player).
  for (let guard = 0; guard < 6; guard++) {
    cur = simulate(cur, (x) => x.pending?.kind === "declareBlockers" || until(x));
    const p = cur.pending;
    if (p?.kind !== "declareBlockers" || cur.over) break;
    const blocks: Decision = { type: "declareBlockers", blocks: withRequiredBlocks(cur, p.player, chooseBlocks(cur, p.player)) };
    cur = trySubmit(cur, p.player, blocks) ?? simulate(cur, (x) => x.pending?.kind !== "declareBlockers");
  }
  return simulate(cur, until);
}

/** Sets of attackers evaluated by simulation, from best to worst. */
export function rankedAttacks(s: GameState, me: PlayerId, pr: Profile): { attackers: ObjectId[]; score: number }[] {
  const out: { attackers: ObjectId[]; score: number }[] = [];
  for (const [i, set] of attackSets(s, me).entries()) {
    // Slow machine: we keep the attacks already evaluated (the rules' choice is always tried).
    if (i > 0 && pr.outOfTime()) break;
    const after = playCombat(s, me, set);
    if (after) out.push({ attackers: set, score: evaluate(after, me, { exposure: true }) });
  }
  // Stable sort: on a tie, the order of the candidates (the rules' choice first).
  return out.sort((a, b) => b.score - a.score);
}

export function searchAttackers(s: GameState, me: PlayerId, pr: Profile): ObjectId[] {
  return rankedAttacks(s, me, pr)[0]?.attackers ?? [];
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export function searchBlocks(s: GameState, me: PlayerId, pr: Profile): Block[] {
  const until = afterCombat(s.turn.number);
  const score = (blocks: Block[]) => {
    const next = trySubmit(s, me, { type: "declareBlockers", blocks: withRequiredBlocks(s, me, blocks) });
    return next ? evaluate(simulate(next, until), me) : Number.NEGATIVE_INFINITY;
  };
  let best = chooseBlocks(s, me);
  let bestScore = score(best);
  const cands = blockCandidates(s, me);
  const attackers = s.combat?.attackers.map((a) => a.id) ?? [];
  const improve = (blocks: Block[]) => {
    if (pr.outOfTime()) return false;
    const v = score(blocks);
    if (v > bestScore + 0.05) {
      best = blocks;
      bestScore = v;
      return true;
    }
    return false;
  };
  // Double blocks: two free blockers on the same attacker.
  for (const a of attackers) {
    const free = cands.filter((c) => c.attackers.includes(a) && !best.some((b) => b.blocker === c.blocker)).map((c) => c.blocker);
    let done = false;
    for (let i = 0; i < free.length && !done; i++)
      for (let j = i + 1; j < free.length && !done; j++) {
        const extra = best.some((b) => b.attacker === a) ? [free[i] as ObjectId] : [free[i] as ObjectId, free[j] as ObjectId];
        done = improve([...best, ...extra.map((blocker) => ({ blocker, attacker: a }))]);
      }
  }
  // Local improvements: remove a blocker, or replace it with a free blocker.
  for (const b of [...best]) {
    if (improve(best.filter((x) => x !== b))) continue;
    const free = cands.filter((c) => c.attackers.includes(b.attacker) && !best.some((x) => x.blocker === c.blocker));
    for (const c of free) if (improve(best.map((x) => (x === b ? { blocker: c.blocker, attacker: b.attacker } : x)))) break;
  }
  return best;
}
