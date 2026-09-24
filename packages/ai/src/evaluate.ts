/**
 * Évaluation d'une position du point de vue d'un joueur, et simulation par clonage de l'état.
 */
import { type CardDef, type Decision, type GameState, opponentOf, type PlayerId, submit } from "@mtgx/engine";

/** Valeur d'une créature d'après ses caractéristiques durables (on ignore les effets « jusqu'à la fin du tour »). */
export function creatureValue(d: CardDef, counters = 0): number {
  const p = (d.power ?? 0) + counters;
  const t = (d.toughness ?? 0) + counters;
  if (t <= 0) return 0;
  const k = new Set(d.keywords);
  let v = 0.5 + Math.max(0, p) * 0.6 + t * 0.4;
  if (k.has("flying")) v += 0.4 + p * 0.3;
  if (k.has("deathtouch")) v += 1;
  if (k.has("doubleStrike")) v += p * 0.6;
  if (k.has("firstStrike")) v += 0.3 + p * 0.1;
  if (k.has("trample")) v += p * 0.1;
  if (k.has("lifelink")) v += p * 0.25;
  if (k.has("vigilance")) v += 0.3;
  if (k.has("reach")) v += 0.2;
  if (k.has("menace")) v += p * 0.15;
  if (k.has("hexproof")) v += 0.6;
  if (k.has("indestructible")) v += 1.5;
  if (k.has("defender")) v -= p * 0.5;
  for (const a of d.abilities) v += a.kind === "mana" ? 0.6 : 0.4;
  return v;
}

/** Valeur de la vie : chaque point compte davantage quand on est bas. */
export function lifeValue(life: number): number {
  return life <= 0 ? -1000 : 8 * Math.log(1 + life);
}

function handCardValue(d: CardDef): number {
  if (d.types.includes("Land")) return 0.3;
  if (d.types.includes("Instant") || d.types.includes("Sorcery")) return 1.5;
  return 1;
}

export function evaluate(s: GameState, me: PlayerId): number {
  const opp = opponentOf(s, me);
  const mine = s.players[me];
  const theirs = s.players[opp];
  if (!mine || !theirs) return 0;
  if (s.over) return s.winner === me ? 1e6 : -1e6 + mine.life * 100;
  let score = lifeValue(mine.life) - lifeValue(theirs.life);

  for (const id of s.battlefield) {
    const o = s.objects[id];
    const d = o && s.defs[o.defId];
    if (!o || !d) continue;
    const sign = o.controller === me ? 1 : -1;
    let v = 0;
    if (d.types.includes("Creature")) v = creatureValue(d, o.counters.p1p1 - o.counters.m1m1);
    else if (d.types.includes("Land")) v = 1;
    else v = 1;
    score += sign * v;
  }
  for (const id of mine.hand) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (d) score += handCardValue(d);
  }
  score -= theirs.hand.length * 1.1;
  if (mine.library.length === 0) score -= 5;
  return score;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function trySubmit(s: GameState, player: PlayerId, d: Decision): GameState | null {
  try {
    return submit(s, player, d).state;
  } catch {
    return null;
  }
}

/** Tout le monde passe jusqu'à ce que `until` soit vrai, ou qu'une décision autre que la priorité apparaisse. */
export function rollout(s: GameState, until: (s: GameState) => boolean, max = 60): GameState {
  let cur = s;
  for (let i = 0; i < max && !cur.over && cur.pending?.kind === "priority" && !until(cur); i++) {
    cur = submit(cur, cur.pending.player, { type: "pass" }).state;
  }
  return cur;
}

export const stackEmpty = (s: GameState) => s.stack.length === 0;

export function afterCombat(turn: number) {
  return (s: GameState) =>
    s.stack.length === 0 && (s.turn.number !== turn || ["endCombat", "main2", "end", "cleanup"].includes(s.turn.step));
}
