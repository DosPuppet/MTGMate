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
  CastPermissionAbilityDef,
  Condition,
  CostReductionAbilityDef,
  Effect,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaType,
  ModeDef,
  MoveSpec,
  ObjectFilter,
  Ref,
  ReplacementAbilityDef,
  SpellDef,
  StaticAbilityDef,
  Step,
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
  /** « jusqu'à N [cibles] » */
  upTo: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n, optional: true }),
  /** « N [cibles] » (exactement N, toutes différentes). */
  exactly: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n }),
  /** « carte de [filtre] ciblée de votre cimetière / d'un cimetière » */
  cardInGraveyard: (
    id = "t",
    filter: ObjectFilter = {},
    whose: "you" | "opponent" | "any" = "you",
    label = whose === "you" ? "carte de votre cimetière" : "carte d'un cimetière",
  ): TargetSpec => ({ id, label, filter: { cards: { filter, whose } } }),
  /** « permanent non-terrain ciblé » (et autres combinaisons de types) */
  nonland: (id = "t", extra: ObjectFilter = {}, label = "permanent non-terrain"): TargetSpec => ({
    id,
    label,
    filter: { objects: { nonland: true, ...extra } },
  }),
  creatureOrPlaneswalker: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label: "créature ou planeswalker",
    filter: { objects: { types: ["Creature", "Planeswalker"], ...extra } },
  }),
};

export const ref = {
  target: (id = "t"): Ref => ({ kind: "target", id }),
  /** L'objet de l'événement déclencheur (« cette créature », « ce sort »…). */
  eventObject: { kind: "eventObject" } as Ref,
  eventPlayer: { kind: "eventPlayer" } as Ref,
  self: { kind: "self" } as Ref,
  you: { kind: "you" } as Ref,
  eachOpponent: { kind: "eachOpponent" } as Ref,
  eachPlayer: { kind: "eachPlayer" } as Ref,
  controllerOf: (r: Ref): Ref => ({ kind: "controllerOf", ref: r }),
  stored: (name: string): Ref => ({ kind: "stored", name }),
};

export const amount = {
  x: { kind: "x" } as Amount,
  kicked: (yes: number, no: number): Amount => ({ kind: "kicked", yes, no }),
  powerOf: (r: Ref): Amount => ({ kind: "powerOf", ref: r }),
  eventAmount: { kind: "eventAmount" } as Amount,
  count: (filter: ObjectFilter): Amount => ({ kind: "count", filter }),
  totalPower: (filter: ObjectFilter): Amount => ({ kind: "totalPower", filter }),
  /** Nombre de cartes correspondant au filtre dans une zone (« cartes de créature dans votre cimetière »). */
  countIn: (zone: "graveyard" | "hand", filter: ObjectFilter = {}, whose: "you" | "opponents" | "all" = "you"): Amount => ({
    kind: "count",
    filter,
    zone,
    whose,
  }),
  lifeGainedThisTurn: { kind: "lifeGainedThisTurn" } as Amount,
  countersOn: (r: Ref, counter = "+1/+1"): Amount => ({ kind: "countersOn", ref: r, counter }),
  differentManaValues: { kind: "differentManaValues" } as Amount,
  lifeTotal: { kind: "lifeTotal" } as Amount,
  cardsIn: (zone: "hand" | "graveyard" | "library"): Amount => ({ kind: "cardsIn", zone }),
  v: (name: string): Amount => ({ kind: "var", name }),
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
  /** Crée des jetons (pour vous, ou pour un autre joueur : « son contrôleur crée… »). */
  createTokens: (token: TokenSpec, count: Amount = 1, forWho?: Ref): Effect => ({
    op: "createTokens",
    token,
    count,
    for: forWho,
  }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  loseLife: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "loseLife", who, amount: n, store }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  mill: (n: Amount, who: Ref = ref.you): Effect => ({ op: "mill", who, amount: n }),
  scry: (n: Amount): Effect => ({ op: "scry", amount: n }),
  surveil: (n: Amount): Effect => ({ op: "surveil", amount: n }),
  discard: (
    n: Amount,
    who: Ref = ref.you,
    opts: { filter?: ObjectFilter; chooser?: "controller"; optional?: boolean; store?: string } = {},
  ): Effect => ({ op: "discard", who, amount: n, ...opts }),
  sacrifice: (who: Ref, filter: ObjectFilter, n: Amount = 1, opts: { optional?: boolean; store?: string } = {}): Effect => ({
    op: "sacrifice",
    who,
    filter,
    amount: n,
    ...opts,
  }),
  damageStoringExcess: (n: Amount, to: Ref, store: string): Effect => ({ op: "damage", amount: n, to, storeExcess: store }),
  exileIfDies: (what: Ref): Effect => ({ op: "exileIfDies", what }),
  preventCombatDamage: (what: Ref): Effect => ({ op: "preventCombatDamage", what }),
  doubleCounters: (what: Ref): Effect => ({ op: "doubleCounters", what }),
  /** « Vous pouvez … » : renvoie une liste à étaler dans les effets. */
  may: (prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length }, ...flat];
  },
  /** « Si [condition], … » : les effets ne s'appliquent que si la condition est vraie à la résolution. */
  when: (c: Condition, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "if", cond: c, skip: flat.length }, ...flat];
  },
  /** « Vous pouvez payer {X}. Si vous le faites, … » */
  mayPay: (cost: string, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: parseManaCost(cost), prompt, skip: flat.length }, ...flat];
  },
  tap: (what: Ref): Effect => ({ op: "tap", what }),
  untap: (what: Ref): Effect => ({ op: "tap", what, untap: true }),
  counters: (what: Ref, kind: string, n: Amount = 1): Effect => ({ op: "addCounters", what, amount: n, kind }),
  damageAll: (n: Amount, filter?: ObjectFilter, players?: Ref): Effect => ({ op: "damageAll", amount: n, filter, players }),
  destroyAll: (filter: ObjectFilter): Effect => ({ op: "destroyAll", filter }),
  addCountersAll: (filter: ObjectFilter, n: Amount = 1, kind?: string): Effect => ({
    op: "addCountersAll",
    filter,
    amount: n,
    kind,
  }),
  modifyAll: (filter: ObjectFilter, mods: LayerMods): Effect => ({ op: "modifyAll", filter, mods }),
  sacrificeIt: (what: Ref): Effect => ({ op: "sacrificeIt", what }),
  moveTo: (what: Ref, spec: MoveSpec, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "moveTo",
    what,
    spec,
    store,
  }),
  /** Renvoie en main (depuis n'importe quelle zone). */
  toHand: (what: Ref): Effect => ({ op: "moveTo", what, spec: { to: "hand" } }),
  /** Met sur le champ de bataille (depuis le cimetière, l'exil…). */
  toBattlefield: (what: Ref, spec: Omit<MoveSpec, "to"> = {}): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "battlefield", ...spec },
  }),
  exileCard: (what: Ref, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "exile" },
    store,
  }),
  moveAll: (from: "battlefield" | "graveyard", whose: Ref, filter: ObjectFilter, spec: MoveSpec): Effect => ({
    op: "moveAll",
    from,
    whose,
    filter,
    spec,
  }),
  shuffle: (who: Ref = ref.you): Effect => ({ op: "shuffle", who }),
  lookAtTop: (
    n: Amount,
    opts: {
      filter?: ObjectFilter;
      count?: Amount;
      to?: MoveSpec;
      rest?: "bottom" | "graveyard" | "top";
      maxManaValue?: Amount;
    } = {},
  ): Effect => ({
    op: "lookAtTop",
    n,
    filter: opts.filter,
    count: opts.count ?? 1,
    to: opts.to ?? { to: "hand" },
    rest: opts.rest ?? "bottom",
    maxManaValue: opts.maxManaValue,
  }),
  exileUntilLeaves: (what: Ref): Effect => ({ op: "exileUntilLeaves", what }),
  /** Choisir (sans cibler) des cartes de votre cimetière ou de votre main. */
  pickFromZone: (
    zone: "graveyard" | "hand",
    filter: ObjectFilter,
    to: MoveSpec,
    opts: { count?: Amount; min?: number; prompt?: string } = {},
  ): Effect => ({ op: "pickFromZone", zone, filter, to, count: opts.count ?? 1, min: opts.min, prompt: opts.prompt }),
  topOrBottom: (what: Ref): Effect => ({ op: "libraryTopOrBottom", what }),
  /** « … perd N points de vie à moins de défausser une carte / sacrifier un permanent » */
  punisher: (who: Ref, loseLife: number, opts: { discard?: boolean; sacrifice?: ObjectFilter } = {}): Effect => ({
    op: "punisher",
    who,
    loseLife,
    ...opts,
  }),
  revealUntil: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }): Effect => ({ op: "revealUntil", filter, to }),
  doubleAllCounters: (what: Ref): Effect => ({ op: "doubleAllCounters", what }),
  search: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }, count: Amount = 1): Effect => ({
    op: "search",
    filter,
    count,
    to,
  }),
  copyToken: (of: Ref, opts: { count?: Amount; addKeywords?: Keyword[]; sacrificeAtEndStep?: boolean } = {}): Effect => ({
    op: "copyToken",
    of,
    ...opts,
  }),
  /** Capacité retardée « au début de la prochaine étape de fin ». `bind` fige des références maintenant. */
  delayed: (effects: Effects, bind?: Record<string, Ref>): Effect => ({
    op: "delayed",
    at: "nextEndStep",
    effects: effects.flat(),
    bind,
  }),
  reflexive: (targets: TargetSpec[], effects: Effects): Effect => ({ op: "reflexive", targets, effects: effects.flat() }),
  /** « Piochez N cartes, puis défaussez N cartes. » */
  loot: (n = 1): Effect[] => [
    { op: "draw", who: ref.you, amount: n },
    { op: "discard", who: ref.you, amount: n },
  ],
  drain: (n: Amount, who: Ref = ref.eachOpponent): Effect[] => [
    { op: "loseLife", who, amount: n },
    { op: "gainLife", who: ref.you, amount: n },
  ],
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
  opts: { sacrifice?: boolean; per?: ObjectFilter } = {},
): ManaAbilityDef {
  return {
    kind: "mana",
    cost: { tap: true, sacrificeSelf: opts.sacrifice },
    produce: Array.isArray(produce) ? produce : [produce],
    amount: amountProduced,
    amountPer: opts.per,
  };
}

/** « Les sorts de [filtre] que vous lancez coûtent {N} de moins. » */
export function costReducer(filter: ObjectFilter, generic: number, label?: string): CostReductionAbilityDef {
  return { kind: "costReduction", filter, generic, label };
}

export function activated(opts: {
  mana?: string;
  tap?: boolean;
  /** Sacrifier la source. */
  sacrifice?: boolean;
  /** Sacrifier d'autres permanents (« Sacrifiez une autre créature »). */
  sacrificeOther?: { filter: ObjectFilter; count?: number };
  removeCounters?: { kind: string; n: number };
  tapOthers?: { filter: ObjectFilter; count: number };
  payLife?: number;
  targets?: TargetSpec[];
  effects: Effects;
  sorcerySpeed?: boolean;
  once?: boolean;
  fromGraveyard?: boolean;
  label?: string;
}): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: {
      mana: opts.mana ? parseManaCost(opts.mana) : undefined,
      tap: opts.tap,
      sacrificeSelf: opts.sacrifice,
      sacrifice: opts.sacrificeOther ? { filter: opts.sacrificeOther.filter, count: opts.sacrificeOther.count ?? 1 } : undefined,
      removeCounters: opts.removeCounters,
      tapOthers: opts.tapOthers,
      payLife: opts.payLife,
    },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: opts.sorcerySpeed,
    once: opts.once,
    fromGraveyard: opts.fromGraveyard,
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
  /** « Chaque fois que vous gagnez des points de vie pour la première fois ce tour-ci » */
  gainLifeFirst: { on: "gainLife", first: true } as TriggerSpec,
  /** « Chaque fois que vous piochez une carte » / « votre N-ième carte à chaque tour » */
  draw: (nth?: number, whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "draw", whose, nth }),
  loseLife: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "loseLife", whose }),
  /** « Chaque fois que vous attaquez [avec N créatures ou plus] » */
  attackWith: (min = 1): TriggerSpec => ({ on: "attackWith", min }),
  countersPut: (who: "self" | ObjectFilter, kind?: string): TriggerSpec => ({ on: "countersPut", who, kind }),
  dealsDamage: (who: "self" | ObjectFilter, opts: { noncombatOnly?: boolean; toOpponent?: boolean } = {}): TriggerSpec => ({
    on: "dealsDamage",
    who,
    ...opts,
  }),
  combatDamage: (who: "self" | ObjectFilter, toPlayer = false): TriggerSpec => ({ on: "dealsCombatDamage", who, toPlayer }),
  step: (step: Step, whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "step", step, whose }),
};

/** Conditions courantes (raid, morbide…). */
export const cond = {
  raid: { kind: "attackedThisTurn" } as Condition,
  morbid: { kind: "creatureDiedThisTurn" } as Condition,
  kicked: { kind: "kicked" } as Condition,
  controls: (filter: ObjectFilter, atLeast = 1): Condition => ({ kind: "controls", filter, atLeast }),
  /** Férocité : vous contrôlez une créature de force 4 ou plus. */
  ferocious: { kind: "controls", filter: { types: ["Creature"], minPower: 4 } } as Condition,
  threshold: { kind: "threshold" } as Condition,
  yourTurn: { kind: "yourTurn" } as Condition,
  opponentsTurn: { kind: "opponentsTurn" } as Condition,
  opponentLostLife: { kind: "opponentLostLifeThisTurn" } as Condition,
  lifeAboveStart: (by: number): Condition => ({ kind: "lifeAboveStart", by }),
  counterAtLeast: (counter: string, n: number): Condition => ({ kind: "counterAtLeast", counter, n }),
  lifeAtLeast: (amount: number): Condition => ({ kind: "lifeAtLeast", amount }),
  v: (name: string, atLeast = 1): Condition => ({ kind: "var", name, atLeast }),
  not: (c: Condition): Condition => ({ kind: "not", cond: c }),
  all: (...of: Condition[]): Condition => ({ kind: "all", of }),
  refLife: (r: Ref, equals: number): Condition => ({ kind: "refLife", ref: r, equals }),
  wasCast: { kind: "wasCast" } as Condition,
};

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export function flashForAll(label?: string): CastPermissionAbilityDef {
  return { kind: "castPermission", flash: true, label };
}

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
  /** Autres permanents concernés (« les créatures de vos adversaires arrivent engagées »). */
  affects?: ObjectFilter;
}): ReplacementAbilityDef {
  return {
    kind: "replacement",
    entersTapped: opts.tapped,
    entersWithCounters: opts.counters,
    condition: opts.condition,
    affects: opts.affects,
    label: opts.label,
  };
}

export function triggered(
  trigger: TriggerSpec,
  effects: Effects,
  opts: { targets?: TargetSpec[]; condition?: Condition; label?: string; oncePerTurn?: boolean } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: effects.flat(),
    targets: opts.targets ?? [],
    condition: opts.condition,
    label: opts.label,
    oncePerTurn: opts.oncePerTurn,
  };
}

/** Capacité déclenchée modale (« choisissez un — »). */
export function triggeredModal(
  trigger: TriggerSpec,
  modes: ModeDef[],
  opts: { condition?: Condition; label?: string } = {},
): TriggeredAbilityDef {
  return { kind: "triggered", trigger, effects: [], targets: [], modes, condition: opts.condition, label: opts.label };
}
