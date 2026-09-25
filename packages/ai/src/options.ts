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
      return { type: "playLand", card: a.card };
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
      return {
        type: "cast",
        card: a.card,
        mode: mode.index,
        targets: targetsFrom(mode.targets),
        x: a.xMax === null ? undefined : Math.floor(rand() * (a.xMax + 1)),
        kicked: a.kickerAffordable && rand() < 0.5,
        discard: pickN(a.additional?.discard),
        sacrifice: a.additional?.sacrifice?.orPay && rand() < 0.5 ? [] : pickN(a.additional?.sacrifice),
        free: a.freeAvailable && (!a.normalAvailable || rand() < 0.7) ? true : undefined,
        alternative: !a.freeAvailable && a.altAvailable && (!a.normalAvailable || rand() < 0.5) ? true : undefined,
      };
    }
    case "activate":
      return {
        type: "activate",
        source: a.source,
        ability: a.ability,
        targets: targetsFrom(a.targets),
        x: a.xMax === null ? undefined : Math.floor(rand() * (a.xMax + 1)),
      };
  }
}

/**
 * Toutes les variantes (mode × cibles × kicker) d'une option, bornées à `limit`.
 * `rank` ordonne les options de coûts additionnels (les premières sont défaussées ou sacrifiées).
 */
export function enumerateDecisions(a: ActionOption, limit = 40, rank?: (ids: string[]) => string[]): Decision[] {
  const combos = (opts: TargetOption[]): Record<string, string[]>[] => {
    let acc: Record<string, string[]>[] = [{}];
    for (const o of opts) {
      // Plusieurs cibles : on essaie chaque cible « en tête », complétée par les suivantes.
      const values: string[][] = o.count
        ? o.legal.map((_, i) => multiTargets(o, [...o.legal.slice(i), ...o.legal.slice(0, i)]))
        : o.legal.map((v) => [v]);
      if (o.optional) values.push([]);
      const next: Record<string, string[]>[] = [];
      for (const partial of acc) for (const v of values) next.push({ ...partial, [o.id]: v });
      acc = next.slice(0, limit);
    }
    return acc;
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
            mode: m.index,
            targets,
            x: a.xMax ?? undefined,
            discard: pick(a.additional?.discard),
            sacrifice: pick(a.additional?.sacrifice),
          };
          // Façons de payer : sans payer (Omniscience), coût alternatif, « sacrifiez ou payez ».
          const variants = [
            ...(a.normalAvailable || a.free ? [base] : []),
            ...(a.freeAvailable ? [{ ...base, free: true, x: 0 }] : []),
            ...(a.altAvailable ? [{ ...base, alternative: true }] : []),
            ...(a.additional?.sacrifice?.orPay ? [{ ...base, sacrifice: [] }] : []),
          ];
          for (const v of variants) {
            out.push(v);
            if (a.kickerAffordable) out.push({ ...v, kicked: true });
          }
        }
      }
      return out.slice(0, limit);
    }
    case "activate":
      return combos(a.targets)
        .map((targets) => ({ type: "activate" as const, source: a.source, ability: a.ability, targets, x: a.xMax ?? undefined }))
        .slice(0, limit);
    case "playLand":
      return [{ type: "playLand", card: a.card }];
    default:
      return [];
  }
}
