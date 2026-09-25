/**
 * Petit DSL pour écrire le comportement des cartes. Il ne produit que des données.
 *
 *   spell([target.any()], [fx.damage(3, ref.target())])
 */
import { parseManaCost } from "./mana";
import type {
  AbilityDef,
  ActivatedAbilityDef,
  AdditionalCost,
  Amount,
  CardType,
  Condition,
  CostReductionAbilityDef,
  Effect,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaType,
  ModeDef,
  ObjectFilter,
  Ref,
  ReplacementAbilityDef,
  SpellDef,
  StaticAbilityDef,
  TargetSpec,
  TokenSpec,
  TriggeredAbilityDef,
  TriggerSpec,
} from "./types";

/** Comportement d'une carte, fusionné avec ses caractéristiques (issues de Scryfall). */
export interface CardScript {
  abilities?: AbilityDef[];
  spell?: SpellDef;
  /** Coût de kicker, ex. "{4}". */
  kicker?: string;
  /** Coût de flashback, ex. "{4}{R}{R}". */
  flashback?: string;
  additionalCost?: AdditionalCost;
  costReduction?: { generic: Amount; condition?: Condition };
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
  /** L'objet de l'événement déclencheur (« cette créature », « ce sort »…). */
  eventObject: { kind: "eventObject" } as Ref,
  eventPlayer: { kind: "eventPlayer" } as Ref,
  self: { kind: "self" } as Ref,
  you: { kind: "you" } as Ref,
  eachOpponent: { kind: "eachOpponent" } as Ref,
};

export const amount = {
  x: { kind: "x" } as Amount,
  kicked: (yes: number, no: number): Amount => ({ kind: "kicked", yes, no }),
  powerOf: (r: Ref): Amount => ({ kind: "powerOf", ref: r }),
  eventAmount: { kind: "eventAmount" } as Amount,
  count: (filter: ObjectFilter): Amount => ({ kind: "count", filter }),
  totalPower: (filter: ObjectFilter): Amount => ({ kind: "totalPower", filter }),
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
  modify: (what: Ref, mods: LayerMods, duration: "endOfTurn" | "permanent" = "endOfTurn"): Effect => ({
    op: "modify",
    what,
    mods,
    duration,
  }),
  draw: (n: Amount, who: Ref = ref.you): Effect => ({ op: "draw", who, amount: n }),
  gainLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "gainLife", who, amount: n }),
  createTokens: (token: TokenSpec, count: Amount = 1): Effect => ({ op: "createTokens", token, count }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  loseLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "loseLife", who, amount: n }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  mill: (n: Amount, who: Ref = ref.you): Effect => ({ op: "mill", who, amount: n }),
  scry: (n: Amount): Effect => ({ op: "scry", amount: n }),
  surveil: (n: Amount): Effect => ({ op: "surveil", amount: n }),
  discard: (n: Amount, who: Ref = ref.you): Effect => ({ op: "discard", who, amount: n }),
  sacrifice: (who: Ref, filter: ObjectFilter, n: Amount = 1): Effect => ({ op: "sacrifice", who, filter, amount: n }),
  exileIfDies: (what: Ref): Effect => ({ op: "exileIfDies", what }),
  preventCombatDamage: (what: Ref): Effect => ({ op: "preventCombatDamage", what }),
  doubleCounters: (what: Ref): Effect => ({ op: "doubleCounters", what }),
  /** « Vous pouvez … » : renvoie une liste à étaler dans les effets. */
  may: (prompt: string, ...effects: Effect[]): Effect[] => [{ op: "may", prompt, skip: effects.length }, ...effects],
};

/** Liste d'effets, où `fx.may(...)` peut apparaître tel quel (il est aplati). */
export type Effects = (Effect | Effect[])[];

export function spell(targets: TargetSpec[], effects: Effects): SpellDef {
  return { modes: [{ targets, effects: effects.flat() }] };
}

export function modal(...modes: ModeDef[]): SpellDef {
  return { modes };
}

export function mode(label: string, targets: TargetSpec[], effects: Effects): ModeDef {
  return { label, targets, effects: effects.flat() };
}

export function manaAbility(
  produce: ManaType | ManaType[],
  amountProduced = 1,
  opts: { sacrifice?: boolean } = {},
): ManaAbilityDef {
  return {
    kind: "mana",
    cost: { tap: true, sacrificeSelf: opts.sacrifice },
    produce: Array.isArray(produce) ? produce : [produce],
    amount: amountProduced,
  };
}

/** « Les sorts de [filtre] que vous lancez coûtent {N} de moins. » */
export function costReducer(filter: ObjectFilter, generic: number, label?: string): CostReductionAbilityDef {
  return { kind: "costReduction", filter, generic, label };
}

export function activated(opts: {
  mana?: string;
  tap?: boolean;
  sacrifice?: boolean;
  targets?: TargetSpec[];
  effects: Effects;
  sorcerySpeed?: boolean;
  label?: string;
}): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { mana: opts.mana ? parseManaCost(opts.mana) : undefined, tap: opts.tap, sacrificeSelf: opts.sacrifice },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: opts.sorcerySpeed,
    label: opts.label,
  };
}

/** Déclencheurs courants. */
export const when = {
  /** « Quand cette créature arrive sur le champ de bataille » */
  entersSelf: { on: "enters", who: "self" } as TriggerSpec,
  /** « Chaque fois qu'un(e) [filtre] arrive sur le champ de bataille » */
  enters: (filter: ObjectFilter): TriggerSpec => ({ on: "enters", who: filter }),
  diesSelf: { on: "dies", who: "self" } as TriggerSpec,
  dies: (filter: ObjectFilter): TriggerSpec => ({ on: "dies", who: filter }),
  leavesSelf: { on: "leaves", who: "self" } as TriggerSpec,
  attacksSelf: { on: "attacks", who: "self" } as TriggerSpec,
  attacks: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter }),
  /** « Chaque fois que cette créature inflige des blessures de combat à un joueur » */
  combatDamageToPlayer: { on: "dealsCombatDamage", who: "self", toPlayer: true } as TriggerSpec,
  castSpell: (by: "you" | "opponent" | "any" = "you", filter?: ObjectFilter): TriggerSpec => ({ on: "castSpell", by, filter }),
  yourUpkeep: { on: "step", step: "upkeep", whose: "you" } as TriggerSpec,
  yourEndStep: { on: "step", step: "end", whose: "you" } as TriggerSpec,
  eachEndStep: { on: "step", step: "end", whose: "any" } as TriggerSpec,
  yourCombat: { on: "step", step: "beginCombat", whose: "you" } as TriggerSpec,
  landfall: { on: "landfall" } as TriggerSpec,
  gainLife: { on: "gainLife" } as TriggerSpec,
};

/** Conditions courantes (raid, morbide…). */
export const cond = {
  raid: { kind: "attackedThisTurn" } as Condition,
  morbid: { kind: "creatureDiedThisTurn" } as Condition,
  kicked: { kind: "kicked" } as Condition,
  controls: (filter: ObjectFilter, atLeast = 1): Condition => ({ kind: "controls", filter, atLeast }),
};

/** Capacité statique : « Les autres Elfes que vous contrôlez gagnent +1/+1 », « a le vol tant que… ». */
export function staticAbility(
  affects: "self" | ObjectFilter,
  mods: LayerMods,
  opts: { condition?: Condition; label?: string } = {},
): StaticAbilityDef {
  return { kind: "static", affects, mods, condition: opts.condition, label: opts.label };
}

/** « Arrive engagé » / « arrive avec N marqueurs +1/+1 » (éventuellement sous condition : raid, kicker). */
export function entersWith(opts: {
  tapped?: boolean;
  counters?: Amount;
  condition?: Condition;
  label?: string;
}): ReplacementAbilityDef {
  return {
    kind: "replacement",
    entersTapped: opts.tapped,
    entersWithCounters: opts.counters,
    condition: opts.condition,
    label: opts.label,
  };
}

export function triggered(
  trigger: TriggerSpec,
  effects: Effects,
  opts: { targets?: TargetSpec[]; condition?: Condition; label?: string } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: effects.flat(),
    targets: opts.targets ?? [],
    condition: opts.condition,
    label: opts.label,
  };
}
