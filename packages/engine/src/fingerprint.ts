/**
 * Empreinte canonique d'un état de partie : points de contrôle des enregistrements (record.ts) et détection des boucles
 * d'actions obligatoires (104.4b, game.ts).
 */
import type { GameState } from "./types";

/**
 * Empreinte de ce qu'une partie « est » : tour, étape, décision attendue, joueurs (PV, poison, zones), champ de bataille
 * et pile. Elle ne cite aucun identifiant d'objet ni compteur interne (horodatages, version du cache, hasard) : deux
 * versions du moteur qui jouent la même partie donnent la même empreinte.
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
      return pl ? [p, pl.life, pl.poison ?? 0, pl.lost, zone(pl.library), zone(pl.hand), zone(pl.graveyard)] : [p, null];
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
    // Commander (PLAN-E) : zone de commandement, taxes et blessures de commandant ; absent hors Commander.
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
 * `collapse` (détection d'une boucle qui accumule, 104.4b) : les éléments pour lesquels `dup` est vrai (jetons, objets
 * de la pile) ne comptent qu'une fois, triés ; sinon la liste telle quelle.
 */
function once<T>(list: T[], dup: (x: T, i: number) => boolean): (T | string)[] {
  if (!list.some(dup)) return list;
  const keep = list.filter((x, i) => !dup(x, i));
  const seen = [...new Set(list.filter(dup).map((x) => JSON.stringify(x)))].sort();
  return [...keep, ...seen];
}

/** Hachage 53 bits (cyrb53), en hexadécimal : pur et déterministe. */
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
