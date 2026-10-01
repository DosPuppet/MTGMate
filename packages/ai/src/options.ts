/**
 * Transformer une option légale (ActionOption) en décisions concrètes.
 */
import type { ActionOption, Decision, TargetOption } from "@mtgx/engine";

/** Cibles multiples (« jusqu'à N ») : N cibles compatibles avec la contrainte de groupe, en suivant l'ordre donné. */
export function multiTargets(o: TargetOption, order: string[] = o.legal): string[] {
  const max = o.count ?? 1;
  const out: string[] = [];
  const g = o.group;
  for (const id of order) {
    if (out.length >= max) break;
    if (g?.kind === "different" && out.some((x) => g.holders[x] === g.holders[id])) continue;
    if (g?.kind === "same" && out.length > 0 && g.holders[out[0] as string] !== g.holders[id]) continue;
    out.push(id);
  }
  return out;
}

/** Construit une décision en laissant `choose` sélectionner cibles et mode. */
export function buildCastDecision(
  a: ActionOption,
  choose: <T>(list: T[]) => T | undefined,
  rand: () => number = Math.random,
): Decision | null {
  /** « X cibles » : X ne dépasse pas le nombre de cibles possibles, et les cibles sont ajustées à X. */
  const withCountX = <D extends { targets?: Record<string, string[]>; x?: number }>(d: D, opts: TargetOption[]): D => {
    const exact = opts.find((o) => o.countX);
    if (!exact || d.x === undefined) return d;
    const pool = [...exact.legal].sort(() => rand() - 0.5);
    const x = exact.countX === true ? Math.min(d.x, pool.length) : d.x;
    return { ...d, x, targets: { ...d.targets, [exact.id]: pool.slice(0, Math.min(x, pool.length)) } };
  };
  const targetsFrom = (opts: TargetOption[]) => {
    const t: Record<string, string[]> = {};
    for (const o of opts) {
      if (o.count) {
        const order = [...o.legal].sort(() => rand() - 0.5);
        t[o.id] = o.optional && rand() < 0.2 ? [] : multiTargets(o, order);
        continue;
      }
      const list = o.optional ? [null, ...o.legal] : o.legal;
      const v = choose(list as (string | null)[]);
      t[o.id] = v ? [v] : [];
    }
    return t;
  };
  switch (a.type) {
    case "pass":
      return { type: "pass" };
    case "playLand":
      return { type: "playLand", card: a.card, payLife: a.payLife, landType: a.landType };
    case "tapForMana":
      return { type: "tapForMana", source: a.source, ability: a.ability, color: a.colors[0] };
    case "cast": {
      const mode = choose(a.modes);
      if (!mode) return null;
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
          targets: targetsFrom(mode.targets),
          x: a.xMax === null ? undefined : Math.floor(rand() * (a.xMax + 1)),
          kicked:
            !!mode.requiresKicker ||
            (a.kickerAffordable && ((!a.normalAvailable && !a.freeAvailable && !a.altAvailable) || rand() < 0.5)),
          discard: a.additional?.discard?.orLife !== undefined && rand() < 0.5 ? [] : pickN(a.additional?.discard),
          sacrifice: a.additional?.sacrifice?.orPay && rand() < 0.5 ? [] : pickN(a.additional?.sacrifice),
          free: a.freeAvailable && (!a.normalAvailable || rand() < 0.7) ? true : undefined,
          alternative: !a.freeAvailable && a.altAvailable && (!a.normalAvailable || rand() < 0.5) ? true : undefined,
        },
        mode.targets,
      );
    }
    case "activate": {
      // Station : une créature engagée au hasard parmi celles possibles. Équipage (force minimale) : des créatures au
      // hasard jusqu'à la force requise.
      const tap = a.additional?.tap;
      const pool = tap ? [...tap.options] : [];
      const picked: string[] = [];
      const power = () => picked.reduce((n, id) => n + (tap?.powers?.[id] ?? 0), 0);
      const enough = () => (tap?.minPower !== undefined ? power() >= tap.minPower : picked.length >= (tap?.count ?? 0));
      while (tap && !enough() && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as string);
      return withCountX(
        {
          type: "activate" as const,
          source: a.source,
          ability: a.ability,
          targets: targetsFrom(a.targets),
          x: a.xMax === null ? undefined : Math.floor(rand() * (a.xMax + 1)),
          tap: tap ? picked : undefined,
        },
        a.targets,
      );
    }
  }
}

/**
 * Toutes les variantes (mode × cibles × kicker) d'une option, bornées à `limit`.
 * `rank` ordonne les options de coûts additionnels (les premières sont défaussées ou sacrifiées).
 */
export function enumerateDecisions(a: ActionOption, limit = 40, rank?: (ids: string[]) => string[]): Decision[] {
  const combos = (opts0: TargetOption[], kicked = false): Record<string, string[]>[] => {
    // Cadeau promis : les cibles légales peuvent changer (« à la place, un permanent non-terrain ciblé »).
    const opts = opts0.map((o) => (kicked && o.kickedLegal ? { ...o, legal: o.kickedLegal } : o));
    let acc: Record<string, string[]>[] = [{}];
    for (const o of opts) {
      // Plusieurs cibles : on essaie chaque cible « en tête », complétée par les suivantes.
      const values: string[][] = o.count
        ? o.legal.map((_, i) => multiTargets(o, [...o.legal.slice(i), ...o.legal.slice(0, i)]))
        : o.legal.map((v) => [v]);
      if (o.optional) values.push([]);
      const next: Record<string, string[]>[] = [];
      for (const partial of acc)
        for (const v of values) {
          // « une autre cible » : pas de combinaison qui reprend une cible d'un autre mot « cible ».
          if (o.otherThan?.some((k) => v.some((id) => partial[k]?.includes(id)))) continue;
          next.push({ ...partial, [o.id]: v });
        }
      acc = next.slice(0, limit);
    }
    return acc;
  };
  /** « X cibles » : X vaut le nombre de cibles retenues (au plus X maximal). */
  const fitX = (targets: Record<string, string[]>, opts: TargetOption[], xMax: number | null) => {
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
          // Façons de payer : sans payer (Omniscience), coût alternatif, « sacrifiez ou payez ».
          const variants = [
            ...(a.normalAvailable || a.free || a.kickerAffordable ? [base] : []),
            ...(a.freeAvailable ? [{ ...base, free: true, x: 0 }] : []),
            ...(a.altAvailable ? [{ ...base, alternative: true }] : []),
            ...(a.additional?.sacrifice?.orPay ? [{ ...base, sacrifice: [] }] : []),
            ...(a.additional?.discard?.orLife !== undefined ? [{ ...base, discard: [] }] : []),
          ];
          for (const v of variants) {
            // Mode « les deux » : seulement avec le coût additionnel payé.
            // Payable seulement avec le kicker (Hamlet Glutton marchandé) : pas de lancement sans lui.
            if (!m.requiresKicker && (v !== base || a.normalAvailable || a.free)) out.push(v);
            if (a.kickerAffordable && !m.targets.some((t) => t.kickedLegal)) out.push({ ...v, kicked: true });
          }
        }
        // Cibles propres au cadeau promis : combinaisons calculées à part.
        if (a.kickerAffordable && m.targets.some((t) => t.kickedLegal)) {
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
      // Station : la plus forte créature (choix par défaut du moteur), ou celle qui a le moins de valeur.
      const tap = a.additional?.tap;
      const cheap = tap?.minPower !== undefined ? tap.suggested : tap && rank ? rank(tap.options).slice(0, tap.count) : undefined;
      return [...base, ...(cheap ? base.map((d) => ({ ...d, tap: cheap })) : [])].slice(0, limit);
    }
    case "playLand":
      return [{ type: "playLand", card: a.card, payLife: a.payLife, landType: a.landType }];
    default:
      return [];
  }
}
