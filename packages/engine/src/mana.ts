/**
 * Mana : lecture des coûts, sources disponibles et solveur de paiement automatique.
 */
import { putIntoGraveyard } from "./actions";
import { chars, defOf, isSummoningSick, obj } from "./state";
import { matchesObjectFilter } from "./targets";
import type { GameState, ManaAbilityDef, ManaCost, ManaType, ObjectId, PlayerId } from "./types";
import { MANA_TYPES } from "./types";

const SYMBOLS = new Set<string>(["W", "U", "B", "R", "G", "C"]);

/** "{2}{G}{G/W}" → { generic: 2, colored: { G: 1 }, hybrid: [["G","W"]], x: 0 }. Lève une erreur sur les symboles non gérés. */
export function parseManaCost(text: string): ManaCost {
  const cost: ManaCost = { generic: 0, colored: {}, x: 0 };
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1] as string;
    if (/^\d+$/.test(sym)) cost.generic += Number(sym);
    else if (sym === "X") cost.x += 1;
    else if (SYMBOLS.has(sym)) {
      const t = sym as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else if (/^[WUBRG]\/[WUBRG]$/.test(sym)) {
      cost.hybrid = [...(cost.hybrid ?? []), sym.split("/") as [ManaType, ManaType]];
    } else throw new Error(`Symbole de mana non géré : {${sym}}`);
  }
  return cost;
}

export function manaValue(cost: ManaCost | null | undefined): number {
  if (!cost) return 0;
  return cost.generic + Object.values(cost.colored).reduce((a, b) => a + (b ?? 0), 0) + (cost.hybrid?.length ?? 0);
}

export function costToText(cost: ManaCost | null): string {
  if (!cost) return "";
  let t = "{X}".repeat(cost.x);
  if (cost.generic > 0 || (manaValue(cost) === 0 && cost.x === 0)) t += `{${cost.generic}}`;
  for (const [a, b] of cost.hybrid ?? []) t += `{${a}/${b}}`;
  for (const m of MANA_TYPES) t += `{${m}}`.repeat(cost.colored[m] ?? 0);
  return t;
}

/** Coût total à payer : X remplacé par sa valeur, coûts additionnels ajoutés, réduction de générique. */
export function totalCost(base: ManaCost | null | undefined, x: number, extra?: ManaCost, reduction = 0): ManaCost {
  const cost: ManaCost = {
    generic: (base?.generic ?? 0) + x * (base?.x ?? 0),
    colored: { ...(base?.colored ?? {}) },
    hybrid: [...(base?.hybrid ?? [])],
    x: 0,
  };
  if (extra) {
    cost.generic += extra.generic;
    for (const m of MANA_TYPES) {
      const n = extra.colored[m] ?? 0;
      if (n) cost.colored[m] = (cost.colored[m] ?? 0) + n;
    }
    cost.hybrid = [...(cost.hybrid ?? []), ...(extra.hybrid ?? [])];
  }
  // 601.2f : les réductions ne diminuent que le générique.
  cost.generic = Math.max(0, cost.generic - reduction);
  return cost;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface ManaSource {
  id: ObjectId;
  ability: number;
  colors: ManaType[];
  amount: number;
  isCreature: boolean;
  /** La source se sacrifie (Trésor) : utilisée en dernier recours. */
  sacrifice: boolean;
}

/** Capacités de mana d'un objet, y compris celles intrinsèques aux types de terrain de base (305.6). */
export function manaAbilitiesOf(s: GameState, id: ObjectId): ManaAbilityDef[] {
  // Sur le champ de bataille, types et capacités viennent des couches (Imprisoned in the Moon…).
  const o = obj(s, id);
  const c = o.zone === "battlefield" ? chars(s, id) : { subtypes: defOf(s, id).subtypes, abilities: defOf(s, id).abilities };
  const list: ManaAbilityDef[] = [];
  const basic: Record<string, ManaType> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
  for (const sub of c.subtypes) {
    const m = basic[sub];
    if (m) list.push({ kind: "mana", cost: { tap: true }, produce: [m], amount: 1 });
  }
  for (const a of c.abilities) if (a.kind === "mana") list.push(a);
  return list;
}

/** Une capacité de mana sans coût de mana peut-elle être activée maintenant ? */
function canActivateMana(s: GameState, id: ObjectId, ab: ManaAbilityDef): boolean {
  const o = obj(s, id);
  if (ab.cost.mana) return false;
  if (ab.cost.tap && (o.tapped || isSummoningSick(s, id))) return false;
  return true;
}

/** Quantité produite (« {G} pour chaque Elfe que vous contrôlez »). */
function manaAmount(s: GameState, id: ObjectId, ab: ManaAbilityDef): number {
  if (!ab.amountPer) return ab.amount;
  const f = ab.amountPer;
  const controller = obj(s, id).controller;
  return s.battlefield.filter((x) => matchesObjectFilter(s, controller, x, f, id)).length;
}

export function manaSources(s: GameState, player: PlayerId, exclude: ReadonlySet<ObjectId> = new Set()): ManaSource[] {
  const out: ManaSource[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player || exclude.has(id)) continue;
    manaAbilitiesOf(s, id).forEach((ab, i) => {
      if (!canActivateMana(s, id, ab)) return;
      out.push({
        id,
        ability: i,
        colors: ab.produce,
        amount: manaAmount(s, id, ab),
        isCreature: defOf(s, id).types.includes("Creature"),
        sacrifice: !!ab.cost.sacrificeSelf,
      });
    });
  }
  // Préférence : terrains, puis créatures, puis sources sacrifiées ; les moins flexibles d'abord.
  const rank = (x: ManaSource) => (x.sacrifice ? 2 : x.isCreature ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || a.colors.length - b.colors.length);
}

export function activateManaAbility(s: GameState, player: PlayerId, id: ObjectId, ability: number, color?: ManaType): void {
  const o = obj(s, id);
  if (o.controller !== player) throw new Error("Vous ne contrôlez pas cette source");
  const ab = manaAbilitiesOf(s, id)[ability];
  if (!ab || !canActivateMana(s, id, ab)) throw new Error("Capacité de mana indisponible");
  const c = color ?? ab.produce[0];
  if (!c || !ab.produce.includes(c)) throw new Error("Couleur de mana invalide");
  if (ab.cost.tap) o.tapped = true;
  if (ab.cost.sacrificeSelf) putIntoGraveyard(s, id);
  const pool = s.players[player]?.manaPool;
  if (pool) pool[c] += manaAmount(s, id, ab);
}

// ---------------------------------------------------------------------------
// Solveur
// ---------------------------------------------------------------------------

export interface PaymentPlan {
  /** Capacités de mana à activer. */
  taps: { id: ObjectId; ability: number; color: ManaType }[];
  /** Mana dépensé de la réserve, par type, une fois les capacités activées. */
  spend: Record<ManaType, number>;
}

const zero = (): Record<ManaType, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

/**
 * Cherche comment payer `cost` avec la réserve puis les sources disponibles.
 * Renvoie le plan de paiement, ou null si c'est impossible.
 */
export function solvePayment(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId> = new Set(),
): PaymentPlan | null {
  const pool = { ...(s.players[player]?.manaPool ?? zero()) } as Record<ManaType, number>;
  const sources = manaSources(s, player, exclude);
  // Symboles à payer : chacun accepte un ensemble de types (un seul pour un symbole coloré, deux pour un hybride).
  const pips: ManaType[][] = [];
  for (const m of MANA_TYPES) for (let i = 0; i < (cost.colored[m] ?? 0); i++) pips.push([m]);
  for (const pair of cost.hybrid ?? []) pips.push([...pair]);
  const supply = (colors: ManaType[]) =>
    colors.reduce((n, m) => n + pool[m], 0) + sources.filter((x) => x.colors.some((c) => colors.includes(c))).length;
  pips.sort((a, b) => supply(a) - supply(b));

  const used = new Set<number>();
  const taps: PaymentPlan["taps"] = [];
  const extra = zero();
  const spend = zero();

  const assign = (i: number): boolean => {
    if (i === pips.length) return true;
    const allowed = pips[i] as ManaType[];
    // 1. La réserve (gratuite), puis le surplus des sources qui produisent plusieurs mana.
    for (const bucket of [pool, extra]) {
      for (const m of allowed) {
        if (bucket[m] <= 0) continue;
        bucket[m] -= 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        bucket[m] += 1;
        spend[m] -= 1;
      }
    }
    // 2. Une source non utilisée.
    for (let k = 0; k < sources.length; k++) {
      const src = sources[k] as ManaSource;
      if (used.has(k)) continue;
      for (const m of allowed) {
        if (!src.colors.includes(m)) continue;
        used.add(k);
        taps.push({ id: src.id, ability: src.ability, color: m });
        extra[m] += src.amount - 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        spend[m] -= 1;
        extra[m] -= src.amount - 1;
        taps.pop();
        used.delete(k);
      }
    }
    return false;
  };
  if (!assign(0)) return null;

  // Générique : réserve (incolore d'abord), surplus, puis sources restantes dans l'ordre de préférence.
  let generic = cost.generic;
  for (const bucket of [pool, extra]) {
    for (const m of ["C", ...MANA_TYPES.filter((x) => x !== "C")] as ManaType[]) {
      const n = Math.min(generic, bucket[m]);
      bucket[m] -= n;
      spend[m] += n;
      generic -= n;
    }
  }
  for (let k = 0; k < sources.length && generic > 0; k++) {
    if (used.has(k)) continue;
    const src = sources[k] as ManaSource;
    const m = src.colors[0] as ManaType;
    used.add(k);
    taps.push({ id: src.id, ability: src.ability, color: m });
    const n = Math.min(generic, src.amount);
    spend[m] += n;
    generic -= n;
  }
  return generic > 0 ? null : { taps, spend };
}

/** Quantité maximale de mana disponible (réserve + sources). */
export function availableMana(s: GameState, player: PlayerId, exclude: ReadonlySet<ObjectId> = new Set()): number {
  const pool = s.players[player]?.manaPool;
  const inPool = pool ? MANA_TYPES.reduce((n, m) => n + pool[m], 0) : 0;
  return inPool + manaSources(s, player, exclude).reduce((n, src) => n + src.amount, 0);
}

export function canPay(s: GameState, player: PlayerId, cost: ManaCost, exclude?: ReadonlySet<ObjectId>): boolean {
  return solvePayment(s, player, cost, exclude) !== null;
}

/** Active les sources nécessaires puis retire le coût de la réserve. Lève une erreur si impossible. */
export function payMana(s: GameState, player: PlayerId, cost: ManaCost, exclude?: ReadonlySet<ObjectId>): void {
  const plan = solvePayment(s, player, cost, exclude);
  if (!plan) throw new Error("Mana insuffisant");
  for (const t of plan.taps) activateManaAbility(s, player, t.id, t.ability, t.color);
  const pool = s.players[player]?.manaPool;
  if (!pool) throw new Error("Joueur inconnu");
  for (const m of MANA_TYPES) {
    if (pool[m] < plan.spend[m]) throw new Error("Mana insuffisant");
    pool[m] -= plan.spend[m];
  }
}
