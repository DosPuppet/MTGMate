/** Engine effects: damage, fights and prevention. Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import { dealDamage, sourceFromObject } from "../actions";
import type { OpHandlers } from "../effects";
import { damageSource, evalAmount, nameOf, resolveRef, store } from "../effects";
import { addReplacement } from "../replacement";
import { chars, isCreature, isPlayer, newId, onBattlefield } from "../state";
import { addPlayerEffect } from "../statics";
import { matchesObjectFilter } from "../targets";
import { msg } from "../text";
import type { EventReplacement } from "../types";

export const HANDLERS: OpHandlers = {
  damage(s, r, e, ctx) {
    const src = damageSource(s, ctx, e.source);
    if (!src) return;
    const amount = evalAmount(s, ctx, e.amount);
    let dealt = 0;
    for (const t of resolveRef(s, ctx, e.to)) {
      const logged = s.turnLog.length;
      if (e.storeExcess && onBattlefield(s, t) && isCreature(s, t)) {
        // 120.4a: damage beyond lethal damage.
        const lethal = src.keywords.includes("deathtouch")
          ? Math.min(1, chars(s, t).toughness - (s.objects[t]?.damage ?? 0))
          : chars(s, t).toughness - (s.objects[t]?.damage ?? 0);
        store(r, e.storeExcess, Math.max(0, amount - Math.max(0, lethal)));
      }
      dealDamage(s, src, t, amount, false);
      // What the turn log recorded for this target: the damage really dealt (prevention, redirection).
      if (e.storeDealt)
        for (const x of s.turnLog.slice(logged))
          if (x.e === "damage" && (x.toPlayer ? x.player === t : x.id === t)) dealt += x.amount;
    }
    if (e.storeDealt) store(r, e.storeDealt, dealt);
    return;
  },
  fight(s, r, e, ctx) {
    const a = resolveRef(s, ctx, e.a)[0];
    const b = resolveRef(s, ctx, e.b)[0];
    // 701.12b: if either creature is no longer there, no damage is dealt.
    if (!a || !b || !onBattlefield(s, a) || !onBattlefield(s, b) || !isCreature(s, a) || !isCreature(s, b)) return;
    const pa = chars(s, a).power;
    const pb = chars(s, b).power;
    const sa = sourceFromObject(s, a);
    const sb = sourceFromObject(s, b);
    if (e.storeExcess) {
      // 120.4a: damage beyond lethal damage dealt to the second creature.
      const lethal = sa.keywords.includes("deathtouch")
        ? Math.min(1, chars(s, b).toughness - (s.objects[b]?.damage ?? 0))
        : chars(s, b).toughness - (s.objects[b]?.damage ?? 0);
      store(r, e.storeExcess, Math.max(0, pa - Math.max(0, lethal)));
    }
    dealDamage(s, sa, b, pa, false);
    dealDamage(s, sb, a, pb, false);
    return;
  },
  objectReplacement(s, _r, e, ctx) {
    addReplacement(
      s,
      e.kind,
      resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id)),
      newId(s, "r"),
    );
    return;
  },
  damageDivided(s, r, e, ctx, key) {
    const src = damageSource(s, ctx);
    if (!src) return;
    // Division announced as the spell is put on the stack (601.2d): the share of a target that became illegal is lost (608.2b).
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
              prompt: msg("Divide {n} damage among the targets", { n: total }),
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
    // Nibelheim Aflame: "[target creature] deals N damage to each other creature".
    const from = e.source ? resolveRef(s, ctx, e.source)[0] : undefined;
    const src = from ? (onBattlefield(s, from) ? sourceFromObject(s, from) : undefined) : damageSource(s, ctx);
    if (!src) return;
    const amount = evalAmount(s, ctx, e.amount);
    if (e.filter) {
      const f = e.filter;
      for (const id of s.battlefield.filter(
        // Creatures, and planeswalkers and battles when the filter names them ("each creature and planeswalker").
        (x) =>
          x !== from &&
          (isCreature(s, x) || !!f.types?.some((t) => t === "Planeswalker" || t === "Battle")) &&
          matchesObjectFilter(s, ctx.controller, x, f, ctx.sourceId),
      )) {
        dealDamage(s, src, id, amount, false);
      }
    }
    if (e.players) for (const p of resolveRef(s, ctx, e.players)) dealDamage(s, src, p, amount, false);
    return;
  },
  shield(s, r, e, ctx, key) {
    let sourceIs: string | undefined;
    if (e.chooseSource) {
      // "A source of your choice": a permanent or a spell on the stack (opponents' sources first).
      const options = [
        ...s.battlefield,
        ...s.stack.filter((x) => x.kind === "spell" && x.id !== ctx.sourceId && !!s.objects[x.id]).map((x) => x.id),
      ];
      if (options.length === 0) return;
      const answer = r.vars[key("source")];
      if (!answer) {
        const foe = options.find((id) => s.objects[id]?.controller !== ctx.controller) ?? (options[0] as string);
        return {
          ask: {
            player: ctx.controller,
            key: key("source"),
            request: {
              type: "pick",
              intent: "other",
              prompt: msg("{card}: choose the source whose next damage will be prevented", { card: nameOf(s, ctx.sourceId) }),
              options,
              min: 1,
              max: 1,
              suggested: [foe],
            },
          },
        };
      }
      sourceIs = String(answer[0]);
    }
    const replacement: EventReplacement = {
      ...e.replacement,
      sourceIs,
      sourceDefIs: sourceIs ? s.objects[sourceIs]?.defId : undefined,
      origin: { id: ctx.sourceId, defId: ctx.sourceDefId },
    };
    addPlayerEffect(s, ctx.controller, { replacement }, s.turn.number, true);
    return;
  },
  eachDealsDamage(s, _r, e, ctx) {
    const to = resolveRef(s, ctx, e.to);
    const from = e.from
      ? resolveRef(s, ctx, e.from).filter((x) => onBattlefield(s, x))
      : s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
    for (const id of from) {
      const src = sourceFromObject(s, id);
      const n = e.amount !== undefined ? evalAmount(s, ctx, e.amount) : chars(s, id).power;
      for (const t of to) dealDamage(s, src, t, Math.max(0, n), false);
    }
    return;
  },
};
