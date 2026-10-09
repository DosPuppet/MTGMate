/**
 * Turning a legal option (ActionOption) into concrete decisions.
 */
import type { ActionOption, Decision, TargetOption } from "@mtgx/engine";

/** Multiple targets ("up to N"): N targets compatible with the group constraint, in the given order. */
/** "With mana value X" (`TargetOption.xEquals`): X is the mana value of the chosen target, if any. */
function exactX(targets: Record<string, string[]>, opts: TargetOption[]): number | undefined {
  for (const o of opts) {
    const id = targets[o.id]?.[0];
    if (o.xEquals && id !== undefined && o.xEquals[id] !== undefined) return o.xEquals[id];
  }
  return undefined;
}

export function multiTargets(o: TargetOption, order0: string[] = o.legal): string[] {
  // A required target among `requiredAmong` (cost reduction): first.
  const must = o.requiredAmong;
  const order = must?.length
    ? [...order0.filter((id) => must.includes(id)), ...order0.filter((id) => !must.includes(id))]
    : order0;
  // "That share a creature type": first a full group that shares a type, starting from each target.
  const share = o.shareCreatureType;
  if (share) {
    const fits = (picked: string[], id: string) => {
      const sets = [...picked, id].map((x) => share[x] ?? []).filter((t) => !t.includes("*"));
      const [first, ...rest] = sets;
      return !first || first.some((t) => rest.every((r) => r.includes(t)));
    };
    const want = Math.min(o.min ?? o.count ?? 1, order.length);
    let best: string[] = [];
    for (let i = 0; i < order.length && best.length < want; i++) {
      const picked: string[] = [];
      for (const id of [...order.slice(i), ...order.slice(0, i)])
        if (picked.length < (o.count ?? 1) && fits(picked, id)) picked.push(id);
      if (picked.length > best.length) best = picked;
    }
    return best;
  }
  const max = o.count ?? 1;
  const out: string[] = [];
  const g = o.group;
  // "Controlled by the same player": start with a player who has enough targets (Trial of Agony).
  if (g?.kind === "same") {
    const want = o.min ?? max;
    const per = new Map<string, number>();
    for (const id of order) per.set(g.holders[id] ?? id, (per.get(g.holders[id] ?? id) ?? 0) + 1);
    const start = order.find((id) => (per.get(g.holders[id] ?? id) ?? 0) >= want);
    if (start) out.push(start);
  }
  const mv = o.maxTotalManaValue;
  let total = 0;
  for (const id of order) {
    if (out.length >= max) break;
    if (out.includes(id)) continue;
    if (mv && total + (mv.values[id] ?? 0) > mv.max) continue;
    if (g?.kind === "different" && out.some((x) => g.holders[x] === g.holders[id])) continue;
    if (g?.kind === "same" && out.length > 0 && g.holders[out[0] as string] !== g.holders[id]) continue;
    out.push(id);
    total += mv?.values[id] ?? 0;
  }
  return out;
}

/** Builds a decision, letting `choose` select targets and mode. */
export function buildCastDecision(
  a: ActionOption,
  choose: <T>(list: T[]) => T | undefined,
  rand: () => number = Math.random,
): Decision | null {
  /** "X targets": X does not exceed the number of possible targets, and the targets are fitted to X. */
  const withCountX = <D extends { targets?: Record<string, string[]>; x?: number }>(d: D, opts: TargetOption[]): D => {
    const exact = opts.find((o) => o.countX);
    if (!exact) return d;
    // Unknown X (no computed maximum): "X targets" then means no target.
    if (d.x === undefined) return exact.countX === true ? { ...d, targets: { ...d.targets, [exact.id]: [] } } : d;
    const pool = [...exact.legal].sort(() => rand() - 0.5);
    const x = exact.countX === true ? Math.min(d.x, pool.length) : d.x;
    return { ...d, x, targets: { ...d.targets, [exact.id]: pool.slice(0, Math.min(x, pool.length)) } };
  };
  const targetsFrom = (opts: TargetOption[]) => {
    const t: Record<string, string[]> = {};
    for (const o0 of opts) {
      // "Target player … the cards in their graveyard": only those of the player already chosen (Rite of Renewal).
      const of = o0.ofTarget;
      const o = of ? { ...o0, legal: o0.legal.filter((id) => (t[of.id] ?? []).includes(of.holders[id] ?? "")) } : o0;
      if (o.count) {
        const taken = (o.otherThan ?? []).flatMap((k) => t[k] ?? []);
        const order = [...o.legal].filter((id) => !taken.includes(id)).sort(() => rand() - 0.5);
        t[o.id] = o.optional && rand() < 0.2 ? [] : multiTargets(o, order);
        continue;
      }
      // "Another target": not a target already taken by another "target" word.
      const taken = (o.otherThan ?? []).flatMap((k) => t[k] ?? []);
      const free = taken.length ? o.legal.filter((id) => !taken.includes(id)) : o.legal;
      const list = o.optional ? [null, ...free] : free;
      const v = choose(list as (string | null)[]);
      t[o.id] = v ? [v] : [];
    }
    return t;
  };
  /** "Mana value X or less": X is at least the mana value of the chosen targets (`TargetOption.xAtLeast`). */
  const withXFloor = (targets: Record<string, string[]>, opts: TargetOption[], x: number | undefined) => {
    let floor = 0;
    for (const o of opts) for (const id of targets[o.id] ?? []) floor = Math.max(floor, o.xAtLeast?.[id] ?? 0);
    return { targets, x: x === undefined ? undefined : Math.max(x, floor) };
  };
  switch (a.type) {
    case "pass":
      return { type: "pass" };
    case "playLand":
      return { type: "playLand", card: a.card, payLife: a.payLife, landType: a.landType, ...(a.back ? { back: true } : {}) };
    case "tapForMana":
      return { type: "tapForMana", source: a.source, ability: a.ability, color: a.colors[0] };
    case "cast": {
      const mode = choose(a.modes);
      if (!mode) return null;
      // Gift or kicker that changes the targets (Long River's Pull): with no legal target otherwise, it must be promised.
      const needsKicker = mode.targets.some(
        (t) => !t.optional && !t.countX && t.legal.length === 0 && (t.kickedLegal?.length ?? 0) > 0,
      );
      const kicked =
        !mode.forbidsKicker &&
        (!!mode.requiresKicker ||
          needsKicker ||
          (a.kickerAffordable && ((!a.normalAvailable && !a.freeAvailable && !a.altAvailable) || rand() < 0.5)));
      const targetOpts = kicked ? mode.targets.map((t) => (t.kickedLegal ? { ...t, legal: t.kickedLegal } : t)) : mode.targets;
      const pickN = (spec?: { count: number; options: string[] }) => {
        if (!spec) return undefined;
        const pool = [...spec.options];
        const out: string[] = [];
        while (out.length < spec.count && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as string);
        return out;
      };
      return withCountX(
        {
          type: "cast" as const,
          card: a.card,
          face: a.face,
          faceDown: a.faceDown,
          warp: a.warp,
          mode: mode.index,
          ...withXFloor(targetsFrom(targetOpts), targetOpts, a.xMax === null ? undefined : Math.floor(rand() * (a.xMax + 1))),
          kicked,
          discard:
            (a.additional?.discard?.orLife !== undefined || a.additional?.discard?.orPayAffordable) && rand() < 0.5
              ? []
              : pickN(a.additional?.discard),
          sacrifice:
            a.additional?.sacrifice?.orPay &&
            (a.additional.sacrifice.orPayAffordable || a.additional.sacrifice.options.length < a.additional.sacrifice.count) &&
            rand() < 0.5
              ? []
              : pickN(a.additional?.sacrifice),
          free: a.freeAvailable && (!a.normalAvailable || rand() < 0.7) ? true : undefined,
          alternative: !a.freeAvailable && a.altAvailable && (!a.normalAvailable || rand() < 0.5) ? true : undefined,
        },
        targetOpts,
      );
    }
    case "activate": {
      // Station: a creature tapped at random among the possible ones. Crew (minimum power): creatures at
      // random up to the required power.
      const tap = a.additional?.tap;
      const pool = tap ? [...tap.options] : [];
      const picked: string[] = [];
      const power = () => picked.reduce((n, id) => n + (tap?.powers?.[id] ?? 0), 0);
      const enough = () => (tap?.minPower !== undefined ? power() >= tap.minPower : picked.length >= (tap?.count ?? 0));
      while (tap && !enough() && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as string);
      const targets = targetsFrom(a.targets);
      return withCountX(
        {
          type: "activate" as const,
          source: a.source,
          ability: a.ability,
          targets,
          // "X can't be 0": X drawn between its minimum and its maximum; "with mana value X": the target's.
          x:
            exactX(targets, a.targets) ??
            (a.xMax === null ? undefined : (a.xMin ?? 0) + Math.floor(rand() * (a.xMax - (a.xMin ?? 0) + 1))),
          tap: tap ? picked : undefined,
        },
        a.targets,
      );
    }
  }
}

/**
 * All the variants (mode × targets × kicker) of an option, capped at `limit`.
 * `rank` orders the options of additional costs (the first ones are discarded or sacrificed).
 */
export function enumerateDecisions(a: ActionOption, limit = 40, rank?: (ids: string[]) => string[]): Decision[] {
  const combos = (opts0: TargetOption[], kicked = false): Record<string, string[]>[] => {
    // Gift promised: the legal targets can change ("instead, target nonland permanent").
    const opts = opts0.map((o) => (kicked && o.kickedLegal ? { ...o, legal: o.kickedLegal } : o));
    let acc: Record<string, string[]>[] = [{}];
    for (const o of opts) {
      // Several targets: each target is tried "first", completed by the following ones.
      const values: string[][] = o.count
        ? o.legal.map((_, i) => multiTargets(o, [...o.legal.slice(i), ...o.legal.slice(0, i)]))
        : o.legal.map((v) => [v]);
      if (o.optional) values.push([]);
      const next: Record<string, string[]>[] = [];
      for (const partial of acc)
        for (const v of values) {
          // "another target": no combination that reuses a target of another "target" word.
          if (o.otherThan?.some((k) => v.some((id) => partial[k]?.includes(id)))) continue;
          next.push({ ...partial, [o.id]: v });
        }
      acc = next.slice(0, limit);
    }
    return acc;
  };
  /** "X targets": X is the number of targets kept (at most the maximum X); "with mana value X": the target's. */
  const fitX = (targets: Record<string, string[]>, opts: TargetOption[], xMax: number | null) => {
    const exact = exactX(targets, opts);
    if (exact !== undefined) return { targets, x: exact };
    const o = opts.find((t) => t.countX === true);
    if (!o || xMax === null) return { targets, x: xMax ?? undefined };
    const ids = (targets[o.id] ?? []).slice(0, xMax);
    return { targets: { ...targets, [o.id]: ids }, x: ids.length };
  };
  switch (a.type) {
    case "cast": {
      const out: Decision[] = [];
      for (const m of a.modes) {
        for (const targets of combos(m.targets)) {
          const pick = (spec?: { count: number; options: string[] }) =>
            spec ? (rank ? rank(spec.options) : spec.options).slice(0, spec.count) : undefined;
          const base = {
            type: "cast" as const,
            card: a.card,
            face: a.face,
            faceDown: a.faceDown,
            warp: a.warp,
            mode: m.index,
            ...fitX(targets, m.targets, a.xMax),
            discard: pick(a.additional?.discard),
            sacrifice: pick(a.additional?.sacrifice),
          };
          // Ways to pay: without paying (Omniscience), alternative cost, "sacrifice or pay".
          const variants = [
            ...(a.normalAvailable || a.free || a.kickerAffordable ? [base] : []),
            ...(a.freeAvailable ? [{ ...base, free: true, x: 0 }] : []),
            ...(a.altAvailable ? [{ ...base, alternative: true }] : []),
            ...(a.additional?.sacrifice?.orPay ? [{ ...base, sacrifice: [] }] : []),
            ...(a.additional?.discard?.orLife !== undefined || a.additional?.discard?.orPayAffordable
              ? [{ ...base, discard: [] }]
              : []),
          ];
          for (const v of variants) {
            // "Both" mode: only with the additional cost paid.
            // Payable only with the kicker (Hamlet Glutton bargained): no casting without it.
            if (!m.requiresKicker && (v !== base || a.normalAvailable || a.free)) out.push(v);
            if (a.kickerAffordable && !m.forbidsKicker && !m.targets.some((t) => t.kickedLegal)) out.push({ ...v, kicked: true });
          }
          // Hybrid mana whose result depends on it (Deceit): one variant per color, the simulation decides.
          const hybrid = a.hybridMatters ? (a.hybridColors ?? []) : [];
          if (a.normalAvailable) for (const c of hybrid) out.push({ ...base, hybridAs: c });
          if (a.altAvailable) for (const c of hybrid) out.push({ ...base, alternative: true, hybridAs: c });
          // Phyrexian mana: also paid with as much life as possible (the default pays with mana first).
          const life = a.phyrexianLife?.at(-1);
          if (a.normalAvailable && life) out.push({ ...base, phyrexianLife: life });
        }
        // Targets specific to the promised gift: combinations computed apart.
        if (a.kickerAffordable && !m.forbidsKicker && m.targets.some((t) => t.kickedLegal)) {
          for (const targets of combos(m.targets, true)) {
            out.push({ type: "cast", card: a.card, face: a.face, mode: m.index, targets, x: a.xMax ?? undefined, kicked: true });
          }
        }
      }
      return out.slice(0, limit);
    }
    case "activate": {
      const base = combos(a.targets).map((targets) => ({
        type: "activate" as const,
        source: a.source,
        ability: a.ability,
        ...fitX(targets, a.targets, a.xMax),
      }));
      // Station: the strongest creature (the engine's default choice), or the one with the least value.
      const tap = a.additional?.tap;
      const cheap = tap?.minPower !== undefined ? tap.suggested : tap && rank ? rank(tap.options).slice(0, tap.count) : undefined;
      return [...base, ...(cheap ? base.map((d) => ({ ...d, tap: cheap })) : [])].slice(0, limit);
    }
    case "playLand":
      return [{ type: "playLand", card: a.card, payLife: a.payLife, landType: a.landType, ...(a.back ? { back: true } : {}) }];
    default:
      return [];
  }
}
