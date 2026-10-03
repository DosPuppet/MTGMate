/**
 * Recensement du DSL (PLAN-S) : pour chaque variante des unions du modèle (Effect, TriggerSpec, Condition, Amount, Ref),
 * le nombre de cartes chargées qui l'emploient, et les champs déclarés qu'aucune carte n'emploie. Les cartes sont lues
 * telles que chargées (`CARDS`, après la déduction du texte Scryfall) : les variantes construites par le moteur lui-même
 * (dévorer, copie à l'arrivée…) y figurent à 0.
 *
 * Usage : npx tsx tools/dsl-census.ts [--max 2]          variantes employées par au plus N cartes, union par union
 *         npx tsx tools/dsl-census.ts --variant <nom>    cartes qui emploient une variante (op, on ou kind)
 */
import { CARDS } from "@mtgx/cards";
import { unionVariants } from "../packages/cards/test/debtSurface";

const UNIONS = [
  ["Effect", "op"],
  ["TriggerSpec", "on"],
  ["Condition", "kind"],
  ["Amount", "kind"],
  ["Ref", "kind"],
] as const;

/** Cartes qui emploient chaque `discriminant:valeur` et chaque `discriminant:valeur.champ`. */
const users = new Map<string, Set<string>>();
for (const [name, def] of Object.entries(CARDS)) {
  const seen = new Set<string>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      for (const v of x) walk(v);
      return;
    }
    const o = x as Record<string, unknown>;
    for (const d of ["op", "on", "kind"]) {
      const v = o[d];
      if (typeof v !== "string") continue;
      seen.add(`${d}:${v}`);
      for (const f of Object.keys(o)) if (f !== d) seen.add(`${d}:${v}.${f}`);
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(def);
  for (const k of seen) {
    const set = users.get(k) ?? new Set<string>();
    set.add(name);
    users.set(k, set);
  }
}

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const variant = opt("variant");
if (variant) {
  for (const [union, d] of UNIONS) {
    if (!unionVariants(union, d).has(variant)) continue;
    const cards = [...(users.get(`${d}:${variant}`) ?? [])].sort();
    console.log(`${union} ${d}: "${variant}" — ${cards.length} carte(s)`);
    for (const c of cards) console.log(`  ${c}`);
  }
} else {
  const max = Number(opt("max") ?? 2);
  for (const [union, d] of UNIONS) {
    const variants = unionVariants(union, d);
    const fields = [...variants.values()].reduce((a, f) => a + f.length, 0);
    const rows = [...variants.entries()]
      .map(([k, f]) => ({
        k,
        n: users.get(`${d}:${k}`)?.size ?? 0,
        unused: f.filter((x) => x !== d && !users.has(`${d}:${k}.${x}`)),
      }))
      .sort((a, b) => a.n - b.n || a.k.localeCompare(b.k));
    console.log(`\n== ${union} : ${variants.size} variantes, ${fields} champs`);
    const few = rows.filter((r) => r.n <= max);
    console.log(`employées par au plus ${max} carte(s) (${few.length}) : ${few.map((r) => `${r.k} (${r.n})`).join(", ")}`);
    const unused = rows.filter((r) => r.unused.length);
    if (unused.length)
      console.log(`champs qu'aucune carte n'emploie : ${unused.map((r) => `${r.k}.{${r.unused.join(", ")}}`).join(" ")}`);
  }
}
