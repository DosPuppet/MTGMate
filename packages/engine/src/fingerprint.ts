/**
 * Canonical fingerprint of a game state: checkpoints of the records (record.ts) and detection of loops of mandatory
 * actions (104.4b, game.ts).
 */
import type { GameState } from "./types";

/**
 * Fingerprint of what a game "is": turn, step, pending decision, players (life, poison, zones), battlefield and stack.
 * It cites no object id nor internal counter (timestamps, cache version, randomness): two versions of the engine that
 * play the same game give the same fingerprint.
 */
export function outcomeHash(s: GameState, collapse = false): string {
  const def = (id: string | undefined) => (id ? (s.objects[id]?.defId ?? "?") : null);
  const zone = (ids: string[]) => ids.map(def);
  const projection = {
    turn: [s.turn.number, s.turn.active, s.turn.step],
    pending: s.pending ? [s.pending.kind, s.pending.player] : null,
    over: [s.over, s.winner],
    players: s.playerOrder.map((p) => {
      const pl = s.players[p];
      // Rad counters: only if there are any (the fingerprints of games without Fallout do not change).
      return pl
        ? [
            p,
            pl.life,
            pl.counters?.poison ?? 0,
            pl.lost,
            zone(pl.library),
            zone(pl.hand),
            zone(pl.graveyard),
            ...(pl.counters?.rad ? [pl.counters.rad] : []),
          ]
        : [p, null];
    }),
    exile: zone(s.exile),
    battlefield: once(
      s.battlefield.map((id) => {
        const o = s.objects[id];
        if (!o) return null;
        const counters = Object.entries(o.counters)
          .filter(([, n]) => n)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return [o.defId, o.owner, o.controller, o.tapped, o.damage, counters, def(o.attachedTo)];
      }),
      (_, i) => collapse && !!s.objects[s.battlefield[i] ?? ""]?.isToken,
    ),
    stack: once(
      s.stack.map((i) => [i.kind, i.sourceDefId, i.controller]),
      () => collapse,
    ),
    // Monarch (724): absent as long as nobody is.
    ...(s.monarch ? { monarch: s.monarch } : {}),
    // Commander (PLAN-E): command zone, taxes and commander damage; absent outside Commander.
    ...(s.commander
      ? {
          command: s.playerOrder.map((p) => zone(s.players[p]?.command ?? [])),
          commanders: Object.values(s.commander.cards)
            .map((c) => [c.owner, c.defId, c.casts, Object.entries(c.damage).sort(([a], [b]) => (a < b ? -1 : 1))])
            .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
        }
      : {}),
  };
  return cyrb53(JSON.stringify(projection));
}

/**
 * `collapse` (detection of a loop that accumulates, 104.4b): the elements for which `dup` is true (tokens, stack
 * objects) count only once, sorted; otherwise the list as is.
 */
function once<T>(list: T[], dup: (x: T, i: number) => boolean): (T | string)[] {
  if (!list.some(dup)) return list;
  const keep = list.filter((x, i) => !dup(x, i));
  const seen = [...new Set(list.filter(dup).map((x) => JSON.stringify(x)))].sort();
  return [...keep, ...seen];
}

/** 53-bit hash (cyrb53), in hexadecimal: pure and deterministic. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
