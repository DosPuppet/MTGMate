/** Effets du moteur : blessures, combats et préventions. Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { dealDamage, destroy, sourceFromObject } from "../actions";
import type { OpHandlers } from "../effects";
import { damageSource, evalAmount, nextTurnOf, resolveRef, store, viewOf } from "../effects";
import { addReplacement } from "../replacement";
import { chars, isCreature, isPlayer, newId, onBattlefield } from "../state";
import { addPlayerEffect } from "../statics";
import { matchesObjectFilter } from "../targets";

export const HANDLERS: OpHandlers = {
  damage(s, r, e, ctx) {
    const src = damageSource(s, ctx, e.source);
    if (!src) return;
    const amount = evalAmount(s, ctx, e.amount);
    for (const t of resolveRef(s, ctx, e.to)) {
      if (e.storeExcess && onBattlefield(s, t) && isCreature(s, t)) {
        // 120.4a : blessures au-delà des blessures mortelles.
        const lethal = src.keywords.includes("deathtouch")
          ? Math.min(1, chars(s, t).toughness - (s.objects[t]?.damage ?? 0))
          : chars(s, t).toughness - (s.objects[t]?.damage ?? 0);
        store(r, e.storeExcess, Math.max(0, amount - Math.max(0, lethal)));
      }
      dealDamage(s, src, t, amount, false);
    }
    return;
  },
  fight(s, _r, e, ctx) {
    const a = resolveRef(s, ctx, e.a)[0];
    const b = resolveRef(s, ctx, e.b)[0];
    // 701.12b : si l'une des créatures n'est plus là, aucune blessure n'est infligée.
    if (!a || !b || !onBattlefield(s, a) || !onBattlefield(s, b) || !isCreature(s, a) || !isCreature(s, b)) return;
    const pa = chars(s, a).power;
    const pb = chars(s, b).power;
    const sa = sourceFromObject(s, a);
    const sb = sourceFromObject(s, b);
    dealDamage(s, sa, b, pa, false);
    dealDamage(s, sb, a, pb, false);
    return;
  },
  exileIfDies(s, _r, e, ctx) {
    addReplacement(
      s,
      e.op,
      resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id)),
      newId(s, "r"),
    );
    return;
  },
  preventCombatDamage(s, _r, e, ctx) {
    addReplacement(
      s,
      e.op,
      resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id)),
      newId(s, "r"),
    );
    return;
  },
  damageDivided(s, r, e, ctx, key) {
    const src = damageSource(s, ctx);
    if (!src) return;
    // Répartition annoncée à la mise sur la pile (601.2d) : la part d'une cible devenue illégale est perdue (608.2b).
    const division = e.to.kind === "target" ? r.item.division?.[e.to.id] : undefined;
    if (division && e.to.kind === "target") {
      const legal = new Set(resolveRef(s, ctx, e.to));
      (r.item.targets[e.to.id] ?? []).forEach((id, i) => {
        if (legal.has(id) && (onBattlefield(s, id) || isPlayer(s, id))) dealDamage(s, src, id, division[i] ?? 0, false);
      });
      return;
    }
    const total = evalAmount(s, ctx, e.total);
    const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id) || isPlayer(s, id));
    if (among.length === 0 || total <= 0) return;
    let split: number[];
    if (among.length === 1) split = [total];
    else {
      const answer = r.vars[key("divide")];
      if (!answer) {
        const each = Math.floor(total / among.length);
        const suggested = among.map((_, i) => each + (i < total - each * among.length ? 1 : 0));
        return {
          ask: {
            player: ctx.controller,
            key: key("divide"),
            request: {
              type: "divide",
              intent: "divideDamage",
              prompt: `Répartissez ${total} blessures entre les cibles`,
              among,
              total,
              minEach: total >= among.length ? 1 : 0,
              suggested,
            },
          },
        };
      }
      split = answer.map(Number);
    }
    among.forEach((id, i) => {
      dealDamage(s, src, id, split[i] ?? 0, false);
    });
    return;
  },
  damageAll(s, _r, e, ctx) {
    // Nibelheim Aflame : « [la créature ciblée] inflige N blessures à chaque autre créature ».
    const from = e.source ? resolveRef(s, ctx, e.source)[0] : undefined;
    const src = from ? (onBattlefield(s, from) ? sourceFromObject(s, from) : undefined) : damageSource(s, ctx);
    if (!src) return;
    const amount = evalAmount(s, ctx, e.amount);
    if (e.filter) {
      const f = e.filter;
      for (const id of s.battlefield.filter(
        (x) => x !== from && isCreature(s, x) && matchesObjectFilter(s, ctx.controller, x, f, ctx.sourceId),
      )) {
        dealDamage(s, src, id, amount, false);
      }
    }
    if (e.players) for (const p of resolveRef(s, ctx, e.players)) dealDamage(s, src, p, amount, false);
    return;
  },
  doubleDamageTo(s, _r, e, ctx) {
    const until = nextTurnOf(s, ctx.controller);
    // Jusqu'au prochain tour de son contrôleur (exclu).
    for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)))
      addPlayerEffect(s, p, { damageTakenDoubled: true }, until - 1);
    return;
  },
  preventDamageToYourCreatures(s, _r, _e, ctx) {
    addPlayerEffect(s, ctx.controller, { creaturesDamageImmune: true }, s.turn.number);
    return;
  },
  eachDealsDamage(s, _r, e, ctx) {
    const to = resolveRef(s, ctx, e.to);
    const from = e.from
      ? resolveRef(s, ctx, e.from).filter((x) => onBattlefield(s, x))
      : s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
    for (const id of from) {
      const src = sourceFromObject(s, id);
      for (const t of to) dealDamage(s, src, t, Math.max(0, chars(s, id).power), false);
    }
    return;
  },
  hellkite(s, _r, _e, ctx) {
    const victims = s.objects[ctx.sourceId]?.combatDamagedPlayers ?? [];
    for (const id of s.battlefield.filter((x) => {
      const o = s.objects[x];
      return (
        !!o && victims.includes(o.controller) && !chars(s, x).types.includes("Land") && (viewOf(s, x)?.manaValue ?? 0) === ctx.x
      );
    })) {
      destroy(s, id);
    }
    return;
  },
};
