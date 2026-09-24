/**
 * Petit DSL pour écrire le comportement des cartes. Il ne produit que des données.
 *
 *   spell([target.any()], [fx.damage(3, ref.target())])
 */
import { parseManaCost } from "./mana";
import type {
  AbilityDef,
  ActivatedAbilityDef,
  Amount,
  CardType,
  Effect,
  Keyword,
  ManaAbilityDef,
  ManaType,
  ModeDef,
  ObjectFilter,
  Ref,
  SpellDef,
  TargetSpec,
  TokenSpec,
} from "./types";

/** Comportement d'une carte, fusionné avec ses caractéristiques (issues de Scryfall). */
export interface CardScript {
  abilities?: AbilityDef[];
  spell?: SpellDef;
  /** Coût de kicker, ex. "{4}". */
  kicker?: string;
  keywords?: Keyword[];
}

export const target = {
  any: (id = "t"): TargetSpec => ({
    id,
    label: "n'importe quelle cible",
    filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"] } },
  }),
  creature: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label:
      extra.controller === "you"
        ? "créature que vous contrôlez"
        : extra.controller === "opponent"
          ? "créature adverse"
          : "créature",
    filter: { objects: { types: ["Creature"], ...extra } },
  }),
  permanent: (id: string, types: CardType[], extra: ObjectFilter = {}, label?: string): TargetSpec => ({
    id,
    label,
    filter: { objects: { types, ...extra } },
  }),
  player: (id = "t", which: "any" | "opponent" = "any"): TargetSpec => ({
    id,
    label: which === "opponent" ? "adversaire" : "joueur",
    filter: { players: which },
  }),
  optional: (t: TargetSpec): TargetSpec => ({ ...t, optional: true }),
};

export const ref = {
  target: (id = "t"): Ref => ({ kind: "target", id }),
  self: { kind: "self" } as Ref,
  you: { kind: "you" } as Ref,
  eachOpponent: { kind: "eachOpponent" } as Ref,
};

export const amount = {
  x: { kind: "x" } as Amount,
  kicked: (yes: number, no: number): Amount => ({ kind: "kicked", yes, no }),
  powerOf: (r: Ref): Amount => ({ kind: "powerOf", ref: r }),
};

export const fx = {
  damage: (n: Amount, to: Ref, source?: Ref): Effect => ({ op: "damage", amount: n, to, source }),
  fight: (a: Ref, b: Ref): Effect => ({ op: "fight", a, b }),
  pump: (what: Ref, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what,
    power,
    toughness,
    keywords,
  }),
  pumpAll: (filter: ObjectFilter, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pumpAll",
    filter,
    power,
    toughness,
    keywords,
  }),
  destroy: (what: Ref): Effect => ({ op: "destroy", what }),
  draw: (n: Amount, who: Ref = ref.you): Effect => ({ op: "draw", who, amount: n }),
  gainLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "gainLife", who, amount: n }),
  createTokens: (token: TokenSpec, count: Amount = 1): Effect => ({ op: "createTokens", token, count }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
};

export function spell(targets: TargetSpec[], effects: Effect[]): SpellDef {
  return { modes: [{ targets, effects }] };
}

export function modal(...modes: ModeDef[]): SpellDef {
  return { modes };
}

export function mode(label: string, targets: TargetSpec[], effects: Effect[]): ModeDef {
  return { label, targets, effects };
}

export function manaAbility(produce: ManaType | ManaType[], amountProduced = 1): ManaAbilityDef {
  return { kind: "mana", cost: { tap: true }, produce: Array.isArray(produce) ? produce : [produce], amount: amountProduced };
}

export function activated(opts: {
  mana?: string;
  tap?: boolean;
  sacrifice?: boolean;
  targets?: TargetSpec[];
  effects: Effect[];
  sorcerySpeed?: boolean;
  label?: string;
}): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { mana: opts.mana ? parseManaCost(opts.mana) : undefined, tap: opts.tap, sacrificeSelf: opts.sacrifice },
    targets: opts.targets ?? [],
    effects: opts.effects,
    sorcerySpeed: opts.sorcerySpeed,
    label: opts.label,
  };
}
