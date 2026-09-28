/**
 * Combat par simulation (niveau élevé).
 *
 * Attaques : chaque ensemble d'attaquants candidat est joué sur une copie de l'état ; l'adversaire bloque comme
 * l'IA moyenne ; on évalue la position après le combat en tenant compte de la contre-attaque (les créatures qui ont
 * attaqué restent engagées pendant le tour adverse).
 *
 * Blocages : on part des blocages gloutons de l'IA moyenne, puis on essaie les blocages à deux et quelques
 * améliorations locales (retirer, échanger un bloqueur).
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

/** Ensembles d'attaquants à essayer : le choix des règles d'abord, puis tous les sous-ensembles (ou des préfixes). */
function attackSets(s: GameState, me: PlayerId): ObjectId[][] {
  const forced = forcedAttackers(s, me);
  const cands = attackCandidates(s, me).filter((id) => chars(s, id).power > 0 || forced.includes(id));
  const optional = cands.filter((id) => !forced.includes(id));
  const sets: ObjectId[][] = [[...new Set([...chooseAttackers(s, me), ...forced])], forced];
  if (optional.length <= 4) {
    for (let mask = 1; mask < 1 << optional.length; mask++) sets.push([...forced, ...optional.filter((_, i) => (mask >> i) & 1)]);
  } else {
    // Trop de combinaisons : les plus évasives et les plus fortes d'abord, par préfixes croissants.
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

/** Joue le combat sur une copie : attaque, blocages adverses (comme l'IA moyenne), blessures. */
function playCombat(s: GameState, me: PlayerId, attackers: ObjectId[]): GameState | null {
  const until = afterCombat(s.turn.number);
  let cur = trySubmit(s, me, { type: "declareAttackers", attackers: chooseDefenders(s, me, attackers) });
  if (!cur) return null;
  // Chaque défenseur bloque à son tour (multijoueur : un défenseur par joueur attaqué).
  for (let guard = 0; guard < 6; guard++) {
    cur = simulate(cur, (x) => x.pending?.kind === "declareBlockers" || until(x));
    const p = cur.pending;
    if (p?.kind !== "declareBlockers" || cur.over) break;
    const blocks: Decision = { type: "declareBlockers", blocks: withRequiredBlocks(cur, p.player, chooseBlocks(cur, p.player)) };
    cur = trySubmit(cur, p.player, blocks) ?? simulate(cur, (x) => x.pending?.kind !== "declareBlockers");
  }
  return simulate(cur, until);
}

/** Ensembles d'attaquants évalués par simulation, du meilleur au moins bon. */
export function rankedAttacks(s: GameState, me: PlayerId, pr: Profile): { attackers: ObjectId[]; score: number }[] {
  const out: { attackers: ObjectId[]; score: number }[] = [];
  for (const [i, set] of attackSets(s, me).entries()) {
    // Machine lente : on garde les attaques déjà évaluées (le choix des règles est toujours essayé).
    if (i > 0 && pr.outOfTime()) break;
    const after = playCombat(s, me, set);
    if (after) out.push({ attackers: set, score: evaluate(after, me, { exposure: true }) });
  }
  // Tri stable : à égalité, l'ordre des candidats (le choix des règles d'abord).
  return out.sort((a, b) => b.score - a.score);
}

export function searchAttackers(s: GameState, me: PlayerId, pr: Profile): ObjectId[] {
  return rankedAttacks(s, me, pr)[0]?.attackers ?? [];
}

// ---------------------------------------------------------------------------
// Blocages
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
  // Blocages à deux : deux bloqueurs libres sur un même attaquant.
  for (const a of attackers) {
    const free = cands.filter((c) => c.attackers.includes(a) && !best.some((b) => b.blocker === c.blocker)).map((c) => c.blocker);
    let done = false;
    for (let i = 0; i < free.length && !done; i++)
      for (let j = i + 1; j < free.length && !done; j++) {
        const extra = best.some((b) => b.attacker === a) ? [free[i] as ObjectId] : [free[i] as ObjectId, free[j] as ObjectId];
        done = improve([...best, ...extra.map((blocker) => ({ blocker, attacker: a }))]);
      }
  }
  // Améliorations locales : retirer un bloqueur, ou le remplacer par un bloqueur libre.
  for (const b of [...best]) {
    if (improve(best.filter((x) => x !== b))) continue;
    const free = cands.filter((c) => c.attackers.includes(b.attacker) && !best.some((x) => x.blocker === c.blocker));
    for (const c of free) if (improve(best.map((x) => (x === b ? { blocker: c.blocker, attacker: b.attacker } : x)))) break;
  }
  return best;
}
