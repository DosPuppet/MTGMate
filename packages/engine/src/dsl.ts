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
  DoublerAbilityDef,
  Effect,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaType,
  ModeDef,
  MoveSpec,
  ObjectFilter,
  PlayerStaticAbilityDef,
  PreventionAbilityDef,
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
  /** « Ce sort ne peut pas être contrecarré. » */
  cantBeCountered?: boolean;
  /** Aura : « Enchanter [filtre] ». */
  enchant?: { filter: ObjectFilter; label: string };
  /** Peut commencer la partie sur le champ de bataille (Leyline). */
  leyline?: boolean;
  /** Coût alternatif : « vous pouvez payer {B} plutôt que… si [condition] ». */
  altCost?: { mana: string; condition: Condition; label: string };
  /** F/E définies par une capacité (F/E étoilées sur la carte). */
  cdaPT?: Amount;
  chooseOnEnter?: "creatureType" | "color" | "cardName";
  shuffleIntoLibrary?: boolean;
  graveyardCastRemoveCounters?: number;
  /** Seule la force est variable (Enigma Drake). */
  cdaPower?: Amount;
  /** « … comme s'il avait le flash si vous payez {2} de plus » */
  flashExtraCost?: string;
  opponentDiscardToBattlefield?: boolean;
  /** Aura : « Vous contrôlez le permanent enchanté ». */
  controlsEnchanted?: boolean;
  additionalCost?: AdditionalCost;
  costReduction?: { generic: Amount; condition?: Condition };
  keywords?: Keyword[];
  /** « Vous ne pouvez pas lancer ce sort à moins que… » */
  castCondition?: Condition;
  /** Reality Fracture : effet du sort préparé (le coût et le type viennent de Scryfall). */
  prepareSpell?: SpellDef;
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
  /** « sort ou capacité ciblé avec une seule cible » (Bolt Bend) */
  stackItemSingleTarget: (id = "t"): TargetSpec => ({
    id,
    label: "sort ou capacité à cible unique",
    filter: { stackItems: { singleTarget: true } },
  }),
  /** « sort ciblé » (sur la pile) */
  spell: (id = "t", filter: ObjectFilter = {}, label = "sort"): TargetSpec => ({ id, label, filter: { spells: filter } }),
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
  /** Le permanent auquel la source est attachée (« la créature équipée / enchantée »). */
  attached: { kind: "attached" } as Ref,
  controllerOf: (r: Ref): Ref => ({ kind: "controllerOf", ref: r }),
  /** « cette carte », où qu'elle soit (Angelic Destiny). */
  selfCard: { kind: "selfCard" } as Ref,
  linked: { kind: "linked" } as Ref,
  costSacrificed: { kind: "costSacrificed" } as Ref,
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
  /** Marqueurs sur la source d'après ses dernières informations connues (capacité « quand elle meurt »). */
  lkiCounters: (counter: string): Amount => ({ kind: "lkiCounters", counter }),
  plus: (...of: Amount[]): Amount => ({ kind: "sum", of }),
  neg: (of: Amount): Amount => ({ kind: "neg", of }),
  /** Division entière : « pour chaque tranche de N ». */
  per: (of: Amount, by: number): Amount => ({ kind: "div", of, by }),
  manaValueOf: (r: Ref): Amount => ({ kind: "manaValueOf", ref: r }),
  toughnessOf: (r: Ref): Amount => ({ kind: "toughnessOf", ref: r }),
  colorsOf: (r: Ref): Amount => ({ kind: "colorsOf", ref: r }),
  maxPower: (filter: ObjectFilter): Amount => ({ kind: "maxPower", filter }),
  distinctNames: (filter: ObjectFilter): Amount => ({ kind: "distinctNames", filter }),
  cardsIn: (zone: "hand" | "graveyard" | "library"): Amount => ({ kind: "cardsIn", zone }),
  /** Domaine : nombre de types de terrains de base parmi vos terrains. */
  basicLandTypes: { kind: "basicLandTypes" } as Amount,
  distinctSubtypes: (filter: ObjectFilter): Amount => ({ kind: "distinctSubtypes", filter }),
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
  createTokens: (token: TokenSpec, count: Amount = 1, forWho?: Ref, store?: string): Effect => ({
    op: "createTokens",
    token,
    count,
    for: forWho,
    store,
  }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  loseLife: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "loseLife", who, amount: n, store }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  mill: (n: Amount, who: Ref = ref.you, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "mill",
    who,
    amount: n,
    store,
  }),
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
  /** Contrecarre le sort ou la capacité désigné. */
  counter: (what: Ref): Effect => ({ op: "counter", what }),
  /** « Contrecarrez-le à moins que son contrôleur ne paie X » : le paiement annule les effets qui suivent. */
  unlessPays: (who: Ref, cost: { mana?: string; life?: number }, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [
      { op: "unlessPay", who, mana: cost.mana ? parseManaCost(cost.mana) : undefined, life: cost.life, skip: flat.length },
      ...flat,
    ];
  },
  allowCastFromGraveyard: (what: Ref): Effect => ({ op: "allowCastFromGraveyard", what }),
  addMana: (...mana: ManaType[]): Effect => ({ op: "addMana", mana }),
  addManaChoice: (n = 1): Effect => ({ op: "addManaChoice", n }),
  /** « Exilez les N cartes du dessus. Choisissez-en une. Vous pouvez la jouer ce tour-ci (ou jusqu'à la fin de votre prochain tour). » */
  impulse: (n: number, until: "thisTurn" | "yourNextTurn" = "thisTurn"): Effect => ({ op: "impulse", n, until }),
  piles: (n: number): Effect => ({ op: "piles", n }),
  grantFlashback: (what: Ref): Effect => ({ op: "grantFlashback", what }),
  endTurn: { op: "endTurn" } as Effect,
  gainControl: (what: Ref): Effect => ({ op: "gainControl", what }),
  copySpell: (what: Ref, count: Amount): Effect => ({ op: "copySpell", what, count }),
  millUntil: (who: Ref, filter: ObjectFilter): Effect => ({ op: "millUntil", who, filter }),
  exileTop: (who: Ref, n: number, store: string): Effect => ({ op: "exileTop", who, n, store }),
  grantPlay: (what: Ref, opts: { free?: boolean; anyTime?: boolean } = {}): Effect => ({ op: "grantPlay", what, ...opts }),
  giveControl: (what: Ref, to: Ref): Effect => ({ op: "giveControl", what, to }),
  untapUpTo: (filter: ObjectFilter, n: number): Effect => ({ op: "untapUpTo", filter, n }),
  exileOnResolve: { op: "exileOnResolve" } as Effect,
  poison: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n }),
  destroySameName: (what: Ref): Effect => ({ op: "destroySameName", what }),
  countersDivided: (total: number, to: Ref): Effect => ({ op: "countersDivided", total, to }),
  payX: (prompt: string, store: string): Effect => ({ op: "payX", prompt, store }),
  changeTarget: (what: Ref): Effect => ({ op: "changeTarget", what }),
  extraCombat: { op: "extraCombat" } as Effect,
  addManaUntilEndOfTurn: (...mana: ManaType[]): Effect => ({ op: "addManaUntilEndOfTurn", mana }),
  copyNextSpell: { op: "copyNextSpell" } as Effect,
  winGame: { op: "winGame" } as Effect,
  loseGame: { op: "loseGame" } as Effect,
  countResolution: (store: string): Effect => ({ op: "countResolution", store }),
  hellkite: { op: "hellkite" } as Effect,
  link: (what: Ref): Effect => ({ op: "link", what }),
  /** « Vous pouvez payer N points de vie. Si vous le faites, … » */
  mayPayLife: (life: number, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: { generic: 0, colored: {}, x: 0 }, life, prompt, skip: flat.length }, ...flat];
  },
  /** Blessures réparties entre les cibles désignées. */
  damageDivided: (total: Amount, to: Ref): Effect => ({ op: "damageDivided", total, to }),
  keepOnePerType: (who: Ref): Effect => ({ op: "keepOnePerType", who }),
  /** « Vous obtenez un emblème avec … » */
  emblem: (name: string, text: string, abilities: AbilityDef[]): Effect => ({ op: "emblem", name, text, abilities }),
  /** Attache une Aura ou un Équipement (par défaut la source) au permanent désigné. */
  attach: (to: Ref, what: Ref = ref.self): Effect => ({ op: "attach", what, to }),
  /** « … devient préparé » / « … devient dé-préparé » (Reality Fracture). */
  prepare: (what: Ref, value = true): Effect => ({ op: "prepare", what, value }),
  prepareAll: (filter: ObjectFilter, value = true): Effect => ({ op: "prepare", filter, value }),
  instantJaceLoyalty: { op: "instantJaceLoyalty" } as Effect,
  proliferate: (times: Amount = 1): Effect => ({ op: "proliferate", times }),
  removeCounters: (what: Ref, n: number): Effect => ({ op: "removeCounters", what, n }),
  extraLandThisTurn: { op: "extraLandThisTurn" } as Effect,
  nextSpellUncounterable: { op: "nextSpellUncounterable" } as Effect,
  tap: (what: Ref): Effect => ({ op: "tap", what }),
  untap: (what: Ref): Effect => ({ op: "tap", what, untap: true }),
  counters: (what: Ref, kind: string, n: Amount = 1): Effect => ({ op: "addCounters", what, amount: n, kind }),
  damageAll: (n: Amount, filter?: ObjectFilter, players?: Ref): Effect => ({ op: "damageAll", amount: n, filter, players }),
  destroyAll: (filter: ObjectFilter, store?: string): Effect => ({ op: "destroyAll", filter, store }),
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
    opts: { count?: Amount; min?: number; prompt?: string; excludeStored?: string } = {},
  ): Effect => ({
    op: "pickFromZone",
    zone,
    filter,
    to,
    count: opts.count ?? 1,
    min: opts.min,
    prompt: opts.prompt,
    excludeStored: opts.excludeStored,
  }),
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
  search: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }, count: Amount = 1, who?: Ref, store?: string): Effect => ({
    op: "search",
    filter,
    count,
    to,
    who,
    store,
  }),
  copyToken: (
    of: Ref,
    opts: { count?: Amount; addKeywords?: Keyword[]; addSubtypes?: string[]; sacrificeAtEndStep?: boolean } = {},
  ): Effect => ({
    op: "copyToken",
    of,
    ...opts,
  }),
  /** Capacité retardée « au début de la prochaine étape de fin ». `bind` fige des références maintenant. */
  delayed: (effects: Effects, bind?: Record<string, Ref>, vars?: Record<string, Amount>): Effect => ({
    op: "delayed",
    at: "nextEndStep",
    effects: effects.flat(),
    bind,
    vars,
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
  opts: {
    sacrifice?: boolean;
    per?: ObjectFilter;
    restriction?: ManaAbilityDef["restriction"];
    produceChosen?: boolean;
    rider?: ManaAbilityDef["rider"];
  } = {},
): ManaAbilityDef {
  return {
    kind: "mana",
    cost: { tap: true, sacrificeSelf: opts.sacrifice },
    produce: Array.isArray(produce) ? produce : [produce],
    amount: amountProduced,
    amountPer: opts.per,
    restriction: opts.restriction,
    produceChosen: opts.produceChosen,
    rider: opts.rider,
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
  /** Engager la créature équipée (« {T} » de la créature, pour une capacité portée par l'Équipement). */
  tapAttached?: boolean;
  payLife?: number;
  targets?: TargetSpec[];
  effects: Effects;
  sorcerySpeed?: boolean;
  once?: boolean;
  oncePerTurn?: boolean;
  activationCondition?: Condition;
  fromGraveyard?: boolean;
  /** Activée depuis la main (cycle, « défaussez cette carte : … »). */
  fromHand?: boolean;
  exileSelf?: boolean;
  discardSelf?: boolean;
  bounceSelf?: boolean;
  addCounters?: { kind: string; n: number };
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
      tapAttached: opts.tapAttached,
      payLife: opts.payLife,
      exileSelf: opts.exileSelf,
      discardSelf: opts.discardSelf,
      bounceSelf: opts.bounceSelf,
      addCounters: opts.addCounters,
    },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: opts.sorcerySpeed,
    once: opts.once,
    oncePerTurn: opts.oncePerTurn,
    activationCondition: opts.activationCondition,
    fromGraveyard: opts.fromGraveyard,
    fromHand: opts.fromHand,
    label: opts.label,
  };
}

/** Capacité de loyauté (606) : « +1 : … », « −3 : … » ; en rituel, une par tour et par planeswalker. */
export function loyalty(n: number, opts: { targets?: TargetSpec[]; effects: Effects; label: string }): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { loyalty: n },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: true,
    label: `${n > 0 ? `+${n}` : n === 0 ? "0" : `−${-n}`} : ${opts.label}`,
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
  dealsDamage: (
    who: "self" | ObjectFilter,
    opts: { noncombatOnly?: boolean; toOpponent?: boolean; anySourceYouControl?: boolean } = {},
  ): TriggerSpec => ({
    on: "dealsDamage",
    who,
    ...opts,
  }),
  combatDamage: (who: "self" | ObjectFilter, toPlayer = false): TriggerSpec => ({ on: "dealsCombatDamage", who, toPlayer }),
  step: (step: Step, whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "step", step, whose }),
  /** « Chaque fois que la créature équipée inflige des blessures de combat à un joueur » */
  attachedDealsCombatDamageToPlayer: { on: "dealsCombatDamage", who: { attachedToSource: true }, toPlayer: true } as TriggerSpec,
  /** « Chaque fois que la créature équipée se dégage » */
  attachedUntaps: { on: "untaps", who: { attachedToSource: true } } as TriggerSpec,
  discard: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "discard", whose }),
  tapsSelf: { on: "taps", who: "self" } as TriggerSpec,
  /** « Chaque fois que vous lancez un sort qui cible cette créature » */
  targetedBySpellYouCast: { on: "becomesTarget", who: "self", bySpellYouControl: true } as TriggerSpec,
  /** « Chaque fois que vous regardez ou surveillez » */
  scryOrSurveil: { on: "scryOrSurveil" } as TriggerSpec,
  /** « Quand vous défaussez cette carte » (avec `fromGraveyard`). */
  discardSelf: { on: "discardSelf" } as TriggerSpec,
  /** « Chaque fois que vous activez une capacité de loyauté [en retirant au moins N marqueurs] » */
  loyaltyActivated: (minRemoved?: number, byOpponent?: boolean): TriggerSpec => ({
    on: "loyaltyActivated",
    minRemoved,
    byOpponent,
  }),
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
  battlefieldCount: (filter: ObjectFilter, atLeast: number): Condition => ({ kind: "battlefieldCount", filter, atLeast }),
  sourceMatches: (filter: ObjectFilter): Condition => ({ kind: "sourceMatches", filter }),
  targetMatches: (spec: string, filter: ObjectFilter): Condition => ({ kind: "targetMatches", spec, filter }),
  refMatches: (r: Ref, filter: ObjectFilter): Condition => ({ kind: "refMatches", ref: r, filter }),
  eventObjectMatches: (filter: ObjectFilter): Condition => ({ kind: "eventObjectMatches", filter }),
  lifeGainedAtLeast: (n: number): Condition => ({ kind: "lifeGainedAtLeast", n }),
  amountAtLeast: (a: Amount, n: number): Condition => ({ kind: "amountAtLeast", amount: a, n }),
  xAtLeast: (n: number): Condition => ({ kind: "xAtLeast", n }),
  castFromHand: { kind: "castFromHand" } as Condition,
  wasCast: { kind: "wasCast" } as Condition,
  /** « si vous avez regardé ou surveillé ce tour-ci » */
  scried: { kind: "scriedThisTurn" } as Condition,
  creaturesDied: (n: number): Condition => ({ kind: "creaturesDiedAtLeast", n }),
  opponentDealtNoncombatDamage: { kind: "opponentDealtNoncombatDamage" } as Condition,
  drewAtLeast: (n: number): Condition => ({ kind: "drewAtLeast", n }),
  castThisTurn: (n: number, noncreature = false, exactly = false): Condition => ({
    kind: "castThisTurn",
    n,
    noncreature,
    exactly,
  }),
  /** « si vous contemplez un Jace » : vous contrôlez un Jace ou vous avez une carte de Jace en main. */
  beholdJace: { kind: "beholdJace" } as Condition,
  activatedLoyalty: { kind: "activatedLoyaltyThisTurn" } as Condition,
  /** La source est préparée. */
  prepared: { kind: "prepared" } as Condition,
};

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export function flashForAll(label?: string): CastPermissionAbilityDef {
  return { kind: "castPermission", flash: true, label };
}

/** Permissions de lancement : sans payer (Omniscience), butin (Tinybones), cimetière (Muldrotha)… */
export function castPermission(opts: Omit<CastPermissionAbilityDef, "kind">): CastPermissionAbilityDef {
  return { kind: "castPermission", ...opts };
}

/** Capacité statique qui s'applique à son contrôleur (défense talismanique, « ne peut pas perdre »…). */
export function playerStatic(opts: Omit<PlayerStaticAbilityDef, "kind">): PlayerStaticAbilityDef {
  return { kind: "playerStatic", ...opts };
}

export function prevention(
  filter: ObjectFilter,
  opts: { noncombatOnly?: boolean; combatOnly?: boolean; bySource?: boolean; label?: string } = {},
): PreventionAbilityDef {
  return { kind: "prevention", filter, ...opts };
}

export function doubler(opts: Omit<DoublerAbilityDef, "kind">): DoublerAbilityDef {
  return { kind: "doubler", ...opts };
}

/** Coût de mana écrit comme sur la carte (« {3}{B} »). */
export function cost(text: string): ManaCost {
  return parseManaCost(text);
}

/** Capacité statique : « Les autres Elfes que vous contrôlez gagnent +1/+1 », « a le vol tant que… ». */
export function staticAbility(
  affects: "self" | "attached" | ObjectFilter,
  mods: LayerMods,
  opts: {
    condition?: Condition;
    label?: string;
    per?: ObjectFilter;
    perCounter?: string;
    perGraveyard?: ObjectFilter;
    perDivisor?: number;
  } = {},
): StaticAbilityDef {
  return {
    kind: "static",
    affects,
    mods,
    condition: opts.condition,
    label: opts.label,
    per: opts.per,
    perCounter: opts.perCounter,
    perGraveyard: opts.perGraveyard,
    perDivisor: opts.perDivisor,
  };
}

/** « Arrive engagé » / « arrive avec N marqueurs +1/+1 » (éventuellement sous condition : raid, kicker). */
export function entersWith(opts: {
  tapped?: boolean;
  counters?: Amount;
  /** Type des marqueurs (+1/+1 par défaut). */
  counterKind?: string;
  condition?: Condition;
  label?: string;
  /** Autres permanents concernés (« les créatures de vos adversaires arrivent engagées »). */
  affects?: ObjectFilter;
  /** « Cette créature arrive préparée. » */
  prepared?: boolean;
}): ReplacementAbilityDef {
  return {
    kind: "replacement",
    entersTapped: opts.tapped,
    entersPrepared: opts.prepared,
    entersWithCounters: opts.counters,
    counterKind: opts.counterKind,
    condition: opts.condition,
    affects: opts.affects,
    label: opts.label,
  };
}

export function triggered(
  trigger: TriggerSpec,
  effects: Effects,
  opts: {
    targets?: TargetSpec[];
    condition?: Condition;
    label?: string;
    oncePerTurn?: boolean;
    /** Se déclenche depuis le cimetière (Flamewake Phoenix). */
    fromGraveyard?: boolean;
  } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: effects.flat(),
    targets: opts.targets ?? [],
    condition: opts.condition,
    label: opts.label,
    oncePerTurn: opts.oncePerTurn,
    fromGraveyard: opts.fromGraveyard,
  };
}

/** Capacité déclenchée modale (« choisissez un — »). */
export function triggeredModal(
  trigger: TriggerSpec,
  modes: ModeDef[],
  opts: { condition?: Condition; label?: string; uniqueModes?: boolean; oncePerTurn?: boolean } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: [],
    targets: [],
    modes,
    condition: opts.condition,
    label: opts.label,
    uniqueModes: opts.uniqueModes,
    oncePerTurn: opts.oncePerTurn,
  };
}
