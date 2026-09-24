/**
 * Interpréteur d'effets. Les effets sont des données (voir types.ts) : l'état reste sérialisable,
 * et une résolution pourra être suspendue sur un choix du joueur puis reprise.
 */
import { createTokens, type DamageSource, dealDamage, destroy, drawCard, gainLife, sourceFromObject } from "./actions";
import { chars, isCreature, isPlayer, newId, nextTimestamp, onBattlefield, opponentOf } from "./state";
import { matchesObjectFilter } from "./targets";
import type { Amount, Effect, GameState, Keyword, ObjectId, PlayerId, Ref } from "./types";

export interface EffectContext {
  controller: PlayerId;
  /** Sort : l'objet sur la pile. Capacité : le permanent source. */
  sourceId: ObjectId;
  sourceDefId: string;
  /** Informations de dernière connaissance de la source. */
  sourceSnapshot: { keywords: Keyword[]; power: number };
  /** Cibles encore légales à la résolution. */
  targets: Record<string, string[]>;
  x: number;
  kicked: boolean;
}

export function resolveRef(s: GameState, ctx: EffectContext, ref: Ref): string[] {
  switch (ref.kind) {
    case "target":
      return ctx.targets[ref.id] ?? [];
    case "self":
      return [ctx.sourceId];
    case "you":
      return [ctx.controller];
    case "eachOpponent":
      return [opponentOf(s, ctx.controller)];
  }
}

export function evalAmount(s: GameState, ctx: EffectContext, a: Amount): number {
  if (typeof a === "number") return a;
  switch (a.kind) {
    case "x":
      return ctx.x;
    case "kicked":
      return ctx.kicked ? a.yes : a.no;
    case "powerOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      if (!id) return 0;
      if (onBattlefield(s, id)) return Math.max(0, chars(s, id).power);
      return id === ctx.sourceId ? Math.max(0, ctx.sourceSnapshot.power) : 0;
    }
  }
}

function damageSource(s: GameState, ctx: EffectContext, ref?: Ref): DamageSource | null {
  if (!ref || (ref.kind === "self" && !onBattlefield(s, ctx.sourceId))) {
    return { defId: ctx.sourceDefId, controller: ctx.controller, keywords: ctx.sourceSnapshot.keywords };
  }
  const id = resolveRef(s, ctx, ref)[0];
  if (!id || !onBattlefield(s, id)) return null;
  return sourceFromObject(s, id);
}

function addPump(s: GameState, affected: ObjectId[], power: number, toughness: number, keywords: Keyword[] = []): void {
  if (affected.length === 0) return;
  s.effects.push({
    id: newId(s, "e"),
    timestamp: nextTimestamp(s),
    affected,
    power,
    toughness,
    addKeywords: keywords,
    duration: "endOfTurn",
  });
}

export function runEffect(s: GameState, ctx: EffectContext, e: Effect): void {
  switch (e.op) {
    case "damage": {
      const src = damageSource(s, ctx, e.source);
      if (!src) return;
      const amount = evalAmount(s, ctx, e.amount);
      for (const t of resolveRef(s, ctx, e.to)) dealDamage(s, src, t, amount, false);
      return;
    }
    case "fight": {
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
    }
    case "pump": {
      const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
      addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
      return;
    }
    case "pumpAll": {
      const ids = s.battlefield.filter((id) => isCreature(s, id) && matchesObjectFilter(s, ctx.controller, id, e.filter));
      addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
      return;
    }
    case "destroy": {
      for (const id of resolveRef(s, ctx, e.what)) destroy(s, id);
      return;
    }
    case "draw": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) for (let i = 0; i < n; i++) drawCard(s, p);
      return;
    }
    case "gainLife": {
      const n = evalAmount(s, ctx, e.amount);
      for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) gainLife(s, p, n);
      return;
    }
    case "createTokens": {
      createTokens(s, ctx.controller, e.token, evalAmount(s, ctx, e.count));
      return;
    }
    case "addCounters": {
      const n = evalAmount(s, ctx, e.amount);
      for (const id of resolveRef(s, ctx, e.what)) {
        const o = s.objects[id];
        if (o && o.zone === "battlefield") o.counters.p1p1 += n;
      }
      return;
    }
  }
}

export function runEffects(s: GameState, ctx: EffectContext, effects: Effect[]): void {
  for (const e of effects) {
    if (s.over) return;
    runEffect(s, ctx, e);
  }
}
