/** Effets du moteur : marqueurs, niveaux, stations, portes. Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */
import { createTokens } from "../actions";
import type { OpHandlers } from "../effects";
import { evalAmount, resolveRef, store } from "../effects";
import { bump, changeCounters, chars, counterCount, onBattlefield, opponentsOf, P1P1, rulesEvent, unlockDoor } from "../state";
import { playerStatic } from "../statics";
import { matchesObjectFilter } from "../targets";

export const HANDLERS: OpHandlers = {
  doubleAllCounters(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      for (const [kind, n] of Object.entries({ ...o.counters })) if (n > 0) changeCounters(s, o, kind, n);
    }
    return;
  },
  doubleCounters(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") changeCounters(s, o, P1P1, counterCount(o, P1P1));
    }
    return;
  },
  empowerJace(s, _r, e, ctx) {
    // « Mettez N marqueurs de loyauté sur un jeton Jace que vous contrôlez ; si vous n'en contrôlez pas, créez-en un d'abord. »
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    const isJaceToken = (id: string) => {
      const o = s.objects[id];
      const c = chars(s, id);
      return !!o?.isToken && o.controller === ctx.controller && c.types.includes("Planeswalker") && c.subtypes.includes("Jace");
    };
    let jace = s.battlefield.find(isJaceToken);
    if (!jace) jace = createTokens(s, ctx.controller, e.token, 1)[0];
    const o = jace ? s.objects[jace] : undefined;
    if (o && n > 0) changeCounters(s, o, "loyalty", n);
    return;
  },
  proliferate(s, _r, e, ctx) {
    const times = evalAmount(s, ctx, e.times);
    const bad = new Set(["-1/-1", "stun"]);
    for (let t = 0; t < times; t++) {
      for (const id of [...s.battlefield]) {
        const o = s.objects[id];
        if (!o) continue;
        const mine = o.controller === ctx.controller;
        for (const [kind, n] of Object.entries(o.counters)) {
          if (n > 0 && (mine ? !bad.has(kind) : bad.has(kind))) changeCounters(s, o, kind, 1);
        }
      }
      for (const p of opponentsOf(s, ctx.controller)) {
        const pl = s.players[p];
        if (pl && (pl.poison ?? 0) > 0) pl.poison = (pl.poison ?? 0) + 1;
      }
    }
    return;
  },
  removeCounters(s, r, e, ctx) {
    let removed = 0;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      let left = e.n;
      const order = e.kind
        ? [e.kind]
        : ["loyalty", "+1/+1", ...Object.keys(o.counters).filter((k) => k !== "loyalty" && k !== "+1/+1")];
      for (const kind of order) {
        const take = Math.min(left, o.counters[kind] ?? 0);
        if (take > 0) changeCounters(s, o, kind, -take);
        left -= take;
        removed += take;
      }
    }
    // Garnet : « un marqueur +1/+1 pour chaque marqueur de savoir retiré ainsi ».
    store(r, e.store, removed);
    return;
  },
  instantJaceLoyalty(s, _r, _e, ctx) {
    const p = s.players[ctx.controller];
    if (p) p.jaceInstantTurn = s.turn.number;
    return;
  },
  addCounters(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") changeCounters(s, o, e.kind ?? P1P1, n);
    }
    return;
  },
  removeCounterFromEach(s, r, e, ctx) {
    // Dyadrine : les N permanents qui ont le plus de marqueurs de ce type.
    const withCounter = s.battlefield
      .filter((x) => (s.objects[x]?.counters[e.kind] ?? 0) > 0)
      .filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId))
      .sort((a, b) => (s.objects[b]?.counters[e.kind] ?? 0) - (s.objects[a]?.counters[e.kind] ?? 0));
    const done = withCounter.length >= e.n;
    if (done)
      for (const id of withCounter.slice(0, e.n)) {
        const o = s.objects[id];
        if (o) changeCounters(s, o, e.kind, -1);
      }
    store(r, e.store, done ? 1 : 0);
    return;
  },
  addCountersAll(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId))) {
      const o = s.objects[id];
      if (o) changeCounters(s, o, e.kind ?? P1P1, n);
    }
    return;
  },
  countersDivided(s, r, e, ctx, key) {
    const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id));
    if (among.length === 0) return;
    let split: number[];
    if (among.length === 1) split = [e.total];
    else {
      const answer = r.vars[key("cdivide")];
      if (!answer) {
        const each = Math.floor(e.total / among.length);
        return {
          ask: {
            player: ctx.controller,
            key: key("cdivide"),
            request: {
              type: "divide",
              intent: "divideCounters",
              prompt: `Répartissez ${e.total} marqueurs +1/+1 entre les cibles`,
              among,
              total: e.total,
              minEach: 1,
              suggested: among.map((_, i) => each + (i < e.total - each * among.length ? 1 : 0)),
            },
          },
        };
      }
      split = answer.map(Number);
    }
    among.forEach((id, i) => {
      const o = s.objects[id];
      if (o) changeCounters(s, o, P1P1, split[i] ?? 0);
    });
    return;
  },
  station(s, _r, _e, ctx) {
    // 702.184a : des marqueurs de charge égaux à la force de la créature engagée (Tapestry Warden : son endurance si
    // elle est plus grande).
    const o = s.objects[ctx.sourceId];
    const tapped = ctx.tappedForCost?.[0];
    if (o?.zone !== "battlefield" || !tapped) return;
    const c = s.objects[tapped] ? chars(s, tapped) : s.lki[tapped];
    if (!c) return;
    const byToughness = playerStatic(s, ctx.controller, "stationByToughness") && c.toughness > c.power;
    const n = Math.max(0, byToughness ? c.toughness : c.power);
    if (n > 0) changeCounters(s, o, "charge", n);
    return;
  },
  setClassLevel(s, _r, e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || (o.classLevel ?? 1) >= e.level) return;
    o.classLevel = e.level;
    bump(s);
    rulesEvent(s, { e: "classLevel", objectId: o.id, level: e.level });
    return;
  },
  solveCase(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.solved) return;
    o.solved = true;
    bump(s);
    return;
  },
  unlockDoor(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) unlockDoor(s, id, e.door);
    return;
  },
};
