/**
 * Replacements that modify a number (616.1): damage, counters, life gained, cards drawn. When several apply to the
 * same event, each applies once (614.5) and the order is chosen by the affected player (or the controller of the
 * affected object). Nothing can suspend the engine in the middle of an event: the choice is made for that player, in
 * their best interest (`prefer`), and documented as an automatic choice.
 */
import { capReached, MAX_AMOUNT, MAX_PERMUTED } from "./limits";

/** A replacement: "that much plus N", "twice that", "at least N" (Ojer Axonil). */
export interface AmountMod {
  add?: number;
  times?: number;
  atLeast?: number;
}

function applyOne(v: number, m: AmountMod): number {
  // An event with no quantity (0 damage, 0 counters) has nothing to replace.
  if (v <= 0) return v;
  if (m.add !== undefined) return v + m.add;
  if (m.times !== undefined) return v * m.times;
  if (m.atLeast !== undefined) return Math.max(v, m.atLeast);
  return v;
}

function applyInOrder(base: number, mods: AmountMod[]): number {
  return mods.reduce(applyOne, base);
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i] as T, ...p];
  }
}

/** Every possible result depending on the order of application (only one if the order makes no difference). */
export function replacementOutcomes(base: number, mods: AmountMod[]): number[] {
  const kinds = new Set(mods.map((m) => (m.add !== undefined ? "add" : m.times !== undefined ? "times" : "atLeast")));
  // Replacements all of the same kind commute (sums, products): the order makes no difference.
  if (mods.length <= 1 || (kinds.size === 1 && !kinds.has("atLeast"))) return [applyInOrder(base, mods)];
  // Beyond that, the code order (that of the sources): too many permutations, and no card needs that many.
  if (mods.length > MAX_PERMUTED) {
    capReached("permutations");
    return [applyInOrder(base, mods)];
  }
  const out = new Set<number>();
  for (const order of permutations(mods)) out.add(applyInOrder(base, order));
  return [...out];
}

/**
 * The result kept for the affected player: the smallest ("min": damage they are dealt, harmful counters) or the
 * largest ("max": life they gain, counters on their permanents, cards they draw).
 */
export function chooseReplacementOrder(base: number, mods: AmountMod[], prefer: "min" | "max"): number {
  const outcomes = replacementOutcomes(base, mods);
  // Doublers that multiply quickly give an infinite number in JavaScript (unusable in the state, serialized as JSON):
  // the result is capped (see docs/approximations.md).
  const best = prefer === "min" ? Math.min(...outcomes) : Math.max(...outcomes);
  if (best > MAX_AMOUNT) capReached("amount");
  return Math.min(MAX_AMOUNT, best);
}
