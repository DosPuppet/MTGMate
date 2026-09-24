/**
 * Mana : lecture des coûts, sources disponibles et solveur de paiement automatique.
 */
import { defOf, isSummoningSick, obj } from "./state";
import type { GameState, ManaAbilityDef, ManaCost, ManaType, ObjectId, PlayerId } from "./types";
import { MANA_TYPES } from "./types";

const SYMBOLS = new Set<string>(["W", "U", "B", "R", "G", "C"]);

/** "{2}{G}{G}" → { generic: 2, colored: { G: 2 }, x: 0 }. Lève une erreur sur les symboles non gérés. */
export function parseManaCost(text: string): ManaCost {
  const cost: ManaCost = { generic: 0, colored: {}, x: 0 };
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1] as string;
    if (/^\d+$/.test(sym)) cost.generic += Number(sym);
    else if (sym === "X") cost.x += 1;
    else if (SYMBOLS.has(sym)) {
      const t = sym as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else throw new Error(`Symbole de mana non géré : {${sym}}`);
  }
  return cost;
}

export function manaValue(cost: ManaCost | null): number {
  if (!cost) return 0;
  return cost.generic + Object.values(cost.colored).reduce((a, b) => a + (b ?? 0), 0);
}

export function costToText(cost: ManaCost | null): string {
  if (!cost) return "";
  let t = "{X}".repeat(cost.x);
  if (cost.generic > 0 || (manaValue(cost) === 0 && cost.x === 0)) t += `{${cost.generic}}`;
  for (const m of MANA_TYPES) t += `{${m}}`.repeat(cost.colored[m] ?? 0);
  return t;
}

/** Coût total à payer : X remplacé par sa valeur, coûts additionnels ajoutés. */
export function totalCost(base: ManaCost | null | undefined, x: number, extra?: ManaCost): ManaCost {
  const cost: ManaCost = { generic: (base?.generic ?? 0) + x * (base?.x ?? 0), colored: { ...(base?.colored ?? {}) }, x: 0 };
  if (extra) {
    cost.generic += extra.generic;
    for (const m of MANA_TYPES) {
      const n = extra.colored[m] ?? 0;
      if (n) cost.colored[m] = (cost.colored[m] ?? 0) + n;
    }
  }
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
}

/** Capacités de mana d'un objet, y compris celles intrinsèques aux types de terrain de base (305.6). */
export function manaAbilitiesOf(s: GameState, id: ObjectId): ManaAbilityDef[] {
  const d = defOf(s, id);
  const list: ManaAbilityDef[] = [];
  const basic: Record<string, ManaType> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
  for (const sub of d.subtypes) {
    const c = basic[sub];
    if (c) list.push({ kind: "mana", cost: { tap: true }, produce: [c], amount: 1 });
  }
  for (const a of d.abilities) if (a.kind === "mana") list.push(a);
  return list;
}

/** Une capacité de mana dont le seul coût est {T} peut-elle être activée maintenant ? */
function canTapForMana(s: GameState, id: ObjectId, ab: ManaAbilityDef): boolean {
  const o = obj(s, id);
  if (ab.cost.mana || ab.cost.sacrificeSelf) return false;
  if (ab.cost.tap && (o.tapped || isSummoningSick(s, id))) return false;
  return true;
}

export function manaSources(s: GameState, player: PlayerId, exclude: ReadonlySet<ObjectId> = new Set()): ManaSource[] {
  const out: ManaSource[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player || exclude.has(id)) continue;
    const abilities = manaAbilitiesOf(s, id);
    abilities.forEach((ab, i) => {
      if (!canTapForMana(s, id, ab)) return;
      out.push({ id, ability: i, colors: ab.produce, amount: ab.amount, isCreature: defOf(s, id).types.includes("Creature") });
    });
  }
  // Préférence : terrains avant créatures, sources les moins flexibles d'abord.
  return out.sort((a, b) => Number(a.isCreature) - Number(b.isCreature) || a.colors.length - b.colors.length);
}

export function activateManaAbility(s: GameState, player: PlayerId, id: ObjectId, ability: number, color?: ManaType): void {
  const o = obj(s, id);
  if (o.controller !== player) throw new Error("Vous ne contrôlez pas cette source");
  const ab = manaAbilitiesOf(s, id)[ability];
  if (!ab || !canTapForMana(s, id, ab)) throw new Error("Capacité de mana indisponible");
  const c = color ?? ab.produce[0];
  if (!c || !ab.produce.includes(c)) throw new Error("Couleur de mana invalide");
  if (ab.cost.tap) o.tapped = true;
  const pool = s.players[player]?.manaPool;
  if (pool) pool[c] += ab.amount;
}

// ---------------------------------------------------------------------------
// Solveur
// ---------------------------------------------------------------------------

export interface PaymentPlan {
  taps: { id: ObjectId; ability: number; color: ManaType }[];
}

/**
 * Cherche comment payer `cost` avec la réserve puis les sources non engagées.
 * Renvoie la liste des sources à engager, ou null si c'est impossible.
 */
export function solvePayment(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId> = new Set(),
): PaymentPlan | null {
  const pool = { ...(s.players[player]?.manaPool ?? {}) } as Record<ManaType, number>;
  const need: Record<ManaType, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const m of MANA_TYPES) {
    const req = cost.colored[m] ?? 0;
    const fromPool = Math.min(pool[m], req);
    pool[m] -= fromPool;
    need[m] = req - fromPool;
  }
  const sources = manaSources(s, player, exclude);
  const pips: ManaType[] = [];
  for (const m of MANA_TYPES) for (let i = 0; i < need[m]; i++) pips.push(m);
  // Les symboles les plus contraints d'abord.
  const candidates = (m: ManaType) => sources.filter((src) => src.colors.includes(m)).length;
  pips.sort((a, b) => candidates(a) - candidates(b));

  const used = new Set<number>();
  const taps: PaymentPlan["taps"] = [];
  const extra: Record<ManaType, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  const assign = (i: number): boolean => {
    if (i === pips.length) return true;
    const m = pips[i] as ManaType;
    if (extra[m] > 0) {
      extra[m] -= 1;
      if (assign(i + 1)) return true;
      extra[m] += 1;
      return false;
    }
    for (let k = 0; k < sources.length; k++) {
      const src = sources[k] as ManaSource;
      if (used.has(k) || !src.colors.includes(m)) continue;
      used.add(k);
      taps.push({ id: src.id, ability: src.ability, color: m });
      extra[m] += src.amount - 1;
      if (assign(i + 1)) return true;
      extra[m] -= src.amount - 1;
      taps.pop();
      used.delete(k);
    }
    return false;
  };
  if (!assign(0)) return null;

  let generic = cost.generic;
  const leftover = MANA_TYPES.reduce((n, m) => n + pool[m] + extra[m], 0);
  generic -= Math.min(generic, leftover);
  for (let k = 0; k < sources.length && generic > 0; k++) {
    if (used.has(k)) continue;
    const src = sources[k] as ManaSource;
    used.add(k);
    taps.push({ id: src.id, ability: src.ability, color: src.colors[0] as ManaType });
    generic -= Math.min(generic, src.amount);
  }
  return generic > 0 ? null : { taps };
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

/** Engage les sources nécessaires puis retire le coût de la réserve. Lève une erreur si impossible. */
export function payMana(s: GameState, player: PlayerId, cost: ManaCost, exclude?: ReadonlySet<ObjectId>): void {
  const plan = solvePayment(s, player, cost, exclude);
  if (!plan) throw new Error("Mana insuffisant");
  for (const t of plan.taps) activateManaAbility(s, player, t.id, t.ability, t.color);
  const pool = s.players[player]?.manaPool;
  if (!pool) throw new Error("Joueur inconnu");
  for (const m of MANA_TYPES) {
    const n = cost.colored[m] ?? 0;
    if (pool[m] < n) throw new Error("Mana insuffisant");
    pool[m] -= n;
  }
  let generic = cost.generic;
  // Payer le générique avec l'incolore d'abord, puis la couleur la plus abondante.
  while (generic > 0) {
    const m = pool.C > 0 ? "C" : [...MANA_TYPES].sort((a, b) => pool[b] - pool[a])[0];
    if (!m || pool[m] <= 0) throw new Error("Mana insuffisant");
    pool[m] -= 1;
    generic -= 1;
  }
}
