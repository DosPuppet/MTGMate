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
  BlockRule,
  CardDef,
  CardType,
  CastPermissionAbilityDef,
  CastVia,
  Color,
  Condition,
  CostReductionAbilityDef,
  Effect,
  EventReplacement,
  EventReplacementAbilityDef,
  GraveyardReplacementAbilityDef,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ModeDef,
  MoveSpec,
  ObjectFilter,
  PlayerStaticAbilityDef,
  PowerRule,
  PreventionAbilityDef,
  ProtectionRule,
  Ref,
  ReplacementAbilityDef,
  SpellDef,
  StaticAbilityDef,
  Step,
  TargetSpec,
  TokenSpec,
  TriggeredAbilityDef,
  TriggerSpec,
  TurnLogQuery,
  Zone,
} from "./types";

/** Comportement d'une carte, fusionné avec ses caractéristiques (issues de Scryfall). */
export interface CardScript {
  abilities?: AbilityDef[];
  spell?: SpellDef;
  /** Coût de kicker, ex. "{4}". */
  kicker?: string;
  /** Kicker sans mana (avec `kicker: "{0}"`) : permanent sacrifié ou renvoyé, choisi automatiquement. */
  kickerCost?: {
    sacrifice?: ObjectFilter;
    bounce?: ObjectFilter;
    blight?: number;
    tapPower?: number;
    collectEvidence?: number;
    /** « Exilez N cartes de votre cimetière ou payez [mana] » (Soaring Stoneglider), avec `kickerOrPay`. */
    exileGraveyard?: number;
  };
  /** Coût de flashback, ex. "{4}{R}{R}". */
  flashback?: string;
  /** « Flashback—[coût], défaussez une carte » ou « Flashback—engagez trois créatures » : coûts en plus du flashback. */
  flashbackCost?: AdditionalCost;
  /** « Ce sort ne peut pas être contrecarré. » */
  cantBeCountered?: boolean;
  /** « Ce sort ne peut pas être copié. » */
  cantBeCopied?: boolean;
  /** « Ce sort coûte [mana] de plus pour chaque cible au-delà de la première », ex. "{W}{U}". */
  costPerExtraTarget?: string;
  /** « Ce coût [de déguisement] est réduit de {1} pour chaque… » (Fugitive Codebreaker). */
  disguiseReduction?: Amount;
  /** Aura : « Enchanter [filtre] ». */
  /** `player` : « Enchanter un joueur » (Grievous Wound). */
  enchant?: { filter: ObjectFilter; label: string; player?: boolean };
  /** Peut commencer la partie sur le champ de bataille (Leyline). */
  leyline?: boolean;
  /** Coût alternatif : « vous pouvez payer {B} plutôt que… si [condition] ». */
  altCost?: { mana: string; condition: Condition; label: string };
  /** F/E définies par une capacité (F/E étoilées sur la carte). */
  cdaPT?: Amount;
  chooseOnEnter?: "creatureType" | "color" | "cardName" | "landName" | "landType" | "parity" | "mode" | "number";
  /** Sièges : les modes proposés en arrivant (avec `chooseOnEnter: "mode"`). */
  enterModes?: string[];
  shuffleIntoLibrary?: boolean;
  graveyardCastRemoveCounters?: number;
  /** Skyseer's Chariot : les capacités activées des sources du nom choisi coûtent {N} de plus. */
  chosenNameTax?: number;
  /** Dévorer écrit dans le script (Mimeoplasm : « exilez jusqu'à X cartes de créature de votre cimetière »). */
  devour?: { filter: ObjectFilter; n: number; graveyardUpToX?: boolean };
  equipDiscountWhenTargeted?: number;
  /** « Vous pouvez faire arriver cette créature comme copie d'un [permanent] que vous contrôlez ». */
  entersAsCopyOf?: ObjectFilter;
  /** « [Cette carte] a le flash tant que … » */
  flashIf?: Condition;
  exileOnResolve?: boolean;
  entersAsCopyAddSubtypes?: string[];
  /** Copie à l'arrivée « sauf que son nom est [le sien] » (Chameleon, Master of Disguise). */
  entersAsCopyKeepName?: boolean;
  /**
   * Superior Spider-Man (Échange d'esprit) : peut arriver comme copie d'une carte de créature d'un cimetière, sauf son nom
   * et ses F/E (`entersAsCopyAddSubtypes` pour les types en plus) ; la carte copiée est exilée.
   */
  entersAsCopyOfGraveyard?: { filter: ObjectFilter; name?: string; power?: number; toughness?: number };
  /** « Vous pouvez lancer cette carte depuis votre cimetière [si…] » */
  castFromGraveyard?: CardDef["castFromGraveyard"];
  /** Seule la force est variable (Enigma Drake). */
  cdaPower?: Amount;
  /** Seule l'endurance est variable (Tarmogoyf, avec `cdaPower`). */
  cdaToughness?: Amount;
  /** « … comme s'il avait le flash si vous payez {2} de plus » */
  flashExtraCost?: string;
  opponentDiscardToBattlefield?: boolean;
  /** Aura : « Vous contrôlez le permanent enchanté ». */
  controlsEnchanted?: boolean;
  additionalCost?: AdditionalCost;
  costReduction?: { generic: Amount; colored?: ManaCost["colored"]; condition?: Condition };
  keywords?: Keyword[];
  /** « Vous ne pouvez pas lancer ce sort à moins que… » */
  castCondition?: Condition;
  /** Reality Fracture : effet du sort préparé (le coût et le type viennent de Scryfall). */
  prepareSpell?: SpellDef;
  /** Station (702.184) : capacités non-mots-clés de chaque palier « N+ » (les mots-clés sont lus dans le texte). */
  stationAbilities?: Record<number, AbilityDef[]>;
  /** Classe (716) : capacités ajoutées aux niveaux 2, 3… (les coûts de niveau sont lus dans le texte). */
  classLevels?: AbilityDef[][];
  /** Affaire (719) : « Pour résoudre — [condition] » et capacités « Résolue — … ». */
  caseToSolve?: Condition;
  caseSolved?: AbilityDef[];
  /** « En coût additionnel, fourragez ou payez [mana] » (Feed the Cycle). */
  forageOrPay?: string;
  /** Copie à l'arrivée : de n'importe quel contrôleur, avec des mots-clés en plus (Mockingbird). */
  entersAsCopyAnyController?: boolean;
  entersAsCopyAddKeywords?: Keyword[];
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
  /** « une ou deux cibles » : entre `min` et `max` cibles. */
  between: (min: number, max: number, t: TargetSpec): TargetSpec => ({ ...t, count: max, minCount: min }),
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
  costDiscarded: { kind: "costDiscarded" } as Ref,
  /** Les objets désignés qui correspondent au filtre (Ghost Vacuum : « chaque carte de créature exilée avec… »). */
  filtered: (r: Ref, filter: ObjectFilter): Ref => ({ kind: "filtered", ref: r, filter }),
  /** Réunion de références, sans doublon. */
  union: (...of: Ref[]): Ref => ({ kind: "union", of }),
  /** Les objets de `r` sauf ceux de `exclude` (« toutes les autres créatures »). */
  except: (r: Ref, exclude: Ref): Ref => ({ kind: "except", ref: r, exclude }),
  /** Cartes exilées par la source « jusqu'à ce qu'elle quitte le champ de bataille ». */
  exiledWith: { kind: "exiledWith" } as Ref,
  /** Les cartes exilées pour payer le coût (« copiez ces cartes exilées »). */
  costExiled: { kind: "costExiled" } as Ref,
  /** Les cartes de votre cimetière du même nom que la carte désignée, elle comprise (Rat King, Verminister). */
  sameNameInGraveyard: (r: Ref): Ref => ({ kind: "sameNameInGraveyard", ref: r }),
  /** La créature renvoyée en main pour le Web-slinging (Scarlet Spider, Ben Reilly). */
  costBounced: { kind: "costBounced" } as Ref,
  /** Les cibles du sort ou de la capacité de l'événement (« ces créatures »). */
  targetsOfEventObject: { kind: "targetsOfEventObject" } as Ref,
  /** Les capacités sur la pile dont la source est l'objet de l'événement, la plus récente d'abord. */
  abilitiesFromEventObject: { kind: "abilitiesFromEventObject" } as Ref,
  playersWithoutMaxSpeed: { kind: "playersWithoutMaxSpeed" } as Ref,
  libraryTop: (who: Ref): Ref => ({ kind: "libraryTop", who }),
  stackItemsOf: (who: Ref): Ref => ({ kind: "stackItemsOf", who }),
  exiledCardsOf: (who: Ref): Ref => ({ kind: "exiledCardsOf", who }),
  allGraveyards: { kind: "allGraveyards" } as Ref,
  graveyardOf: (who: Ref): Ref => ({ kind: "graveyardOf", who }),
  crewedBy: { kind: "crewedBy" } as Ref,
  stored: (name: string): Ref => ({ kind: "stored", name }),
  /** « chaque [créature] que [le joueur désigné] contrôle » */
  permanentsOf: (player: Ref, filter: ObjectFilter): Ref => ({ kind: "permanentsOf", player, filter }),
  playersWithMost: (filter: ObjectFilter): Ref => ({ kind: "playersWithMost", filter }),
  /** Le joueur défenseur de la créature attaquante source (ou le contrôleur du planeswalker attaqué). */
  defendingPlayer: { kind: "defendingPlayer" } as Ref,
  handOf: (player: Ref, filter: ObjectFilter = {}, maxManaValue?: Amount): Ref => ({
    kind: "handOf",
    player,
    filter,
    maxManaValue,
  }),
};

/** Journal du tour (`turnlog.ts`) : nombre d'événements correspondants (ou somme des blessures). */
function turnEvents(query: TurnLogQuery): Amount {
  return { kind: "turnEvents", query };
}

/** Descente (LCI) : une carte de permanent (pas un jeton) mise dans votre cimetière ce tour-ci. */
const DESCENT: TurnLogQuery = {
  event: "zone",
  to: "graveyard",
  byOwner: true,
  who: "you",
  token: false,
  types: ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"],
};

/** Au moins N événements correspondants ce tour-ci. */
function turnAtLeast(query: TurnLogQuery, n = 1): Condition {
  return { kind: "amountAtLeast", amount: turnEvents(query), n };
}

export const amount = {
  x: { kind: "x" } as Amount,
  kicked: (yes: number, no: number): Amount => ({ kind: "kicked", yes, no }),
  powerOf: (r: Ref): Amount => ({ kind: "powerOf", ref: r }),
  eventAmount: { kind: "eventAmount" } as Amount,
  count: (filter: ObjectFilter): Amount => ({ kind: "count", filter }),
  totalPower: (filter: ObjectFilter): Amount => ({ kind: "totalPower", filter }),
  totalToughness: (filter: ObjectFilter): Amount => ({ kind: "totalToughness", filter }),
  /** Sortes de marqueurs différentes parmi les permanents correspondants. */
  counterKindsAmong: (filter: ObjectFilter): Amount => ({ kind: "counterKindsAmong", filter }),
  /** Nombre de cartes correspondant au filtre dans une zone (« cartes de créature dans votre cimetière »). */
  countIn: (zone: "graveyard" | "hand", filter: ObjectFilter = {}, whose: "you" | "opponents" | "all" = "you"): Amount => ({
    kind: "count",
    filter,
    zone,
    whose,
  }),
  lifeGainedThisTurn: { kind: "lifeGainedThisTurn" } as Amount,
  /** Marqueurs d'un type sur l'objet ; `"any"` : tous les marqueurs. */
  countersOn: (r: Ref, counter = "+1/+1"): Amount => ({ kind: "countersOn", ref: r, counter }),
  differentManaValues: { kind: "differentManaValues" } as Amount,
  /** Vivid (ECL) : nombre de couleurs parmi les permanents que vous contrôlez (ou correspondant au filtre). */
  colorsAmong: (filter: ObjectFilter = { permanent: true, controller: "you" }): Amount => ({ kind: "colorsAmong", filter }),
  lifeTotal: { kind: "lifeTotal" } as Amount,
  /** Marqueurs sur la source d'après ses dernières informations connues (capacité « quand elle meurt »). */
  lkiCounters: (counter: string): Amount => ({ kind: "lkiCounters", counter }),
  lkiDamage: { kind: "lkiDamage" } as Amount,
  /** Convergence : couleurs de mana dépensées pour lancer ce sort. */
  colorsSpent: { kind: "colorsSpent" } as Amount,
  plus: (...of: Amount[]): Amount => ({ kind: "sum", of }),
  neg: (of: Amount): Amount => ({ kind: "neg", of }),
  /** Division entière : « pour chaque tranche de N ». */
  per: (of: Amount, by: number): Amount => ({ kind: "div", of, by }),
  pow: (base: number, of: Amount): Amount => ({ kind: "pow", base, of }),
  eventX: { kind: "eventX" } as Amount,
  manaSpentOf: (r: Ref): Amount => ({ kind: "manaSpentOf", ref: r }),
  eventColorsSpent: { kind: "eventColorsSpent" } as Amount,
  manaValueOf: (r: Ref): Amount => ({ kind: "manaValueOf", ref: r }),
  /** « pour chaque cimetière qui contient N cartes ou plus » */
  graveyardsWithAtLeast: (n: number): Amount => ({ kind: "graveyardsWithAtLeast", n }),
  toughnessOf: (r: Ref): Amount => ({ kind: "toughnessOf", ref: r }),
  colorsOf: (r: Ref): Amount => ({ kind: "colorsOf", ref: r }),
  maxPower: (filter: ObjectFilter, zone?: "graveyard"): Amount => ({ kind: "maxPower", filter, ...(zone ? { zone } : {}) }),
  distinctNames: (filter: ObjectFilter): Amount => ({ kind: "distinctNames", filter }),
  cardsIn: (zone: "hand" | "graveyard" | "library"): Amount => ({ kind: "cardsIn", zone }),
  lifeLostThisTurn: { kind: "lifeLostThisTurn" } as Amount,
  /** Domaine : nombre de types de terrains de base parmi vos terrains. */
  basicLandTypes: { kind: "basicLandTypes" } as Amount,
  distinctSubtypes: (filter: ObjectFilter): Amount => ({ kind: "distinctSubtypes", filter }),
  v: (name: string): Amount => ({ kind: "var", name }),
  cardTypesInGraveyards: { kind: "cardTypesInGraveyards" } as Amount,
  unlockedDoorNames: { kind: "unlockedDoorNames" } as Amount,
  sourceX: { kind: "sourceX" } as Amount,
  max: (...of: Amount[]): Amount => ({ kind: "max", of }),
  maxPowerInHand: { kind: "maxPowerInHand" } as Amount,
  opponentsLostLife: { kind: "opponentsLostLife" } as Amount,
  sacrificedThisTurn: turnEvents({ event: "sacrifice", who: "you" }),
  /** Portes déverrouillées parmi les Salles que vous contrôlez. */
  unlockedDoors: { kind: "unlockedDoors" } as Amount,
  /** Types de cartes parmi les cartes de votre cimetière (délire). */
  cardTypesInGraveyard: { kind: "cardTypesInGraveyard" } as Amount,
  milledThisTurn: (who: Ref): Amount => ({
    kind: "turnEvents",
    query: { event: "zone", from: "library", to: "graveyard", byOwner: true },
    of: who,
  }),
  cardsDiscardedThisTurn: { kind: "cardsDiscardedThisTurn" } as Amount,
  maxToughness: (filter: ObjectFilter): Amount => ({ kind: "maxToughness", filter }),
  maxManaValueInGraveyard: { kind: "maxManaValueInGraveyard" } as Amount,
  distinctColors: (filter: ObjectFilter): Amount => ({ kind: "distinctColors", filter }),
  countersAmong: (filter: ObjectFilter, counter: string): Amount => ({ kind: "countersAmong", filter, counter }),
  /** Symboles de mana de cette couleur dans le coût de l'objet désigné (Namor : le sort de l'événement). */
  manaSymbolsOf: (r: Ref, color: ManaType): Amount => ({ kind: "manaSymbolsOf", ref: r, color }),
  /** Plus grand nombre de permanents du filtre qui ont un type de créature en commun (White Lotus Tile). */
  maxSharingCreatureType: (filter: ObjectFilter): Amount => ({ kind: "maxSharingCreatureType", filter }),
  halfLife: (who: Ref): Amount => ({ kind: "halfLife", who }),
  landsEnteredThisTurn: turnEvents({ event: "zone", to: "battlefield", types: ["Land"], who: "you" }),
  manaSpent: { kind: "manaSpent" } as Amount,
  /** Votre vitesse. */
  speed: { kind: "speed" } as Amount,
  spellsCastThisTurn: { kind: "spellsCastThisTurn" } as Amount,
  cardsDrawnThisTurn: { kind: "cardsDrawnThisTurn" } as Amount,
  creaturesDiedThisTurn: { kind: "creaturesDiedThisTurn" } as Amount,
  totalManaValue: (filter: ObjectFilter, zone?: "exile"): Amount => ({ kind: "totalManaValue", filter, zone }),
  eventManaSpent: { kind: "eventManaSpent" } as Amount,
  cardTypesOf: (r: Ref): Amount => ({ kind: "cardTypesOf", ref: r }),
  devotion: (color: Color): Amount => ({ kind: "devotion", color }),
  noncreatureCastBy: (who: Ref): Amount => ({ kind: "turnEvents", query: { event: "cast", notTypes: ["Creature"] }, of: who }),
  refCount: (r: Ref): Amount => ({ kind: "refCount", ref: r }),
  distinctPowers: (filter: ObjectFilter): Amount => ({ kind: "distinctPowers", filter }),
  cardTypesAmong: (filter: ObjectFilter): Amount => ({ kind: "cardTypesAmong", filter }),
  maxManaValue: (filter: ObjectFilter): Amount => ({ kind: "maxManaValue", filter }),
  /** Cartes que vous possédez en exil correspondant au filtre. */
  countExiled: (filter: ObjectFilter = {}): Amount => ({ kind: "count", filter, zone: "exile", whose: "you" }),
  inExile: (r: Ref): Amount => ({ kind: "inExile", ref: r }),
  yourCreaturesDiedThisTurn: turnEvents({ event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"], who: "you" }),
  /** Vren : créatures exilées depuis le champ de bataille sous le contrôle de vos adversaires ce tour-ci. */
  opponentCreaturesExiledThisTurn: turnEvents({
    event: "zone",
    from: "battlefield",
    to: "exile",
    types: ["Creature"],
    who: "opponent",
  }),
  opponentsWithHandAtMost: (n: number): Amount => ({ kind: "opponentsWithHandAtMost", n }),
  opponentsWithMoreInHand: { kind: "opponentsWithMoreInHand" } as Amount,
  greatestManaValueOf: (r: Ref): Amount => ({ kind: "greatestManaValueOf", ref: r }),
  totalPowerOf: (r: Ref): Amount => ({ kind: "totalPowerOf", ref: r }),
  colorPairsAmong: (filter: ObjectFilter): Amount => ({ kind: "colorPairsAmong", filter }),
  lkiPower: { kind: "lkiPower" } as Amount,
  instantSorceryCast: turnEvents({ event: "cast", who: "you", types: ["Instant", "Sorcery"] }),
  cardsLeftGraveyardThisTurn: turnEvents({ event: "zone", from: "graveyard", who: "you" }),
  /** Journal du tour (`turnlog.ts`) : événements correspondants, vus du contrôleur de la capacité. */
  turnEvents,
  /** Nombre de fois où vous êtes descendu ce tour-ci (cartes de permanent mises dans votre cimetière). */
  descendedThisTurn: turnEvents(DESCENT),
  /** « pour chaque mana d'une Caverne dépensé pour la lancer » */
  caveManaSpent: { kind: "caveManaSpent" } as Amount,
  /** Force totale des cartes exilées pour fabriquer la source. */
  linkedTotalPower: { kind: "linkedTotalPower" } as Amount,
  /** Couleurs parmi les cartes exilées pour fabriquer la source. */
  linkedColors: { kind: "linkedColors" } as Amount,
};

export const fx = {
  damage: (n: Amount, to: Ref, source?: Ref): Effect => ({ op: "damage", amount: n, to, source }),
  fight: (a: Ref, b: Ref, storeExcess?: string): Effect => ({ op: "fight", a, b, ...(storeExcess ? { storeExcess } : {}) }),
  pump: (what: Ref, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what,
    power,
    toughness,
    keywords,
  }),
  /** « Doublez la force et l'endurance de [ces créatures] jusqu'à la fin du tour » (chacune selon les siennes). */
  doublePT: (what: Ref, keywords?: Keyword[]): Effect => ({ op: "pump", what, power: 0, toughness: 0, keywords, double: true }),
  pumpAll: (filter: ObjectFilter, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pumpAll",
    filter,
    power,
    toughness,
    keywords,
  }),
  destroy: (what: Ref, store?: string): Effect => ({ op: "destroy", what, store }),
  tapChosen: (filter: ObjectFilter, store: string, opts: { exactly?: number; sharesColorWith?: Ref } = {}): Effect => ({
    op: "tapChosen",
    filter,
    store,
    ...opts,
  }),
  lkiCountersTo: (to: Ref): Effect => ({ op: "lkiCountersTo", to }),
  cantGainLife: (who: Ref): Effect => ({ op: "cantGainLife", who }),
  millWhileShared: { op: "millWhileShared" } as Effect,
  /** `basePT` : F/E de base fixées à ce montant, évalué à la résolution (Fractalize : « X+1/X+1 »). */
  modify: (
    what: Ref,
    mods: LayerMods,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" = "endOfTurn",
    basePT?: Amount,
  ): Effect => ({
    op: "modify",
    what,
    mods,
    duration,
    ...(basePT !== undefined ? { basePT } : {}),
  }),
  /** Modification qui dure « tant que cette créature reste engagée » (Hedge Whisperer). */
  modifyWhileTapped: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    whileSourceTapped: true,
  }),
  draw: (n: Amount, who: Ref = ref.you): Effect => ({ op: "draw", who, amount: n }),
  gainLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "gainLife", who, amount: n }),
  /** Crée des jetons (pour vous, ou pour un autre joueur : « son contrôleur crée… »). */
  createTokens: (token: TokenSpec, count: Amount = 1, forWho?: Ref, store?: string, attachTo?: Ref): Effect => ({
    op: "createTokens",
    attachTo,
    token,
    count,
    for: forWho,
    store,
  }),
  /** Jetons engagés (et attaquants si `attacking`). */
  /** Jeton X/X : force et endurance égales au montant. */
  createXXToken: (token: TokenSpec, pt: Amount, count: Amount = 1): Effect => ({ op: "createTokens", token, count, pt }),
  createTappedTokens: (token: TokenSpec, count: Amount = 1, opts: { attacking?: boolean; store?: string } = {}): Effect => ({
    op: "createTokens",
    token,
    count,
    tapped: true,
    ...opts,
  }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  /** « Exilez [ce sort] avec N marqueurs de temps ; il gagne la suspension » (702.62). */
  suspend: (what: Ref, time: number): Effect => ({ op: "suspend", what, time }),
  /** « [Ce permanent] endure N » (701.64) : N marqueurs +1/+1 sur lui, ou un jeton Esprit blanc N/N. */
  endure: (what: Ref, n: Amount): Effect => ({ op: "endure", what, amount: n }),
  /** Flétrir N (ECL) : `who` met N marqueurs −1/−1 sur une créature qu'il contrôle ; `store` : 1 si c'est fait. */
  blight: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "blight", who, amount: n, store }),
  /** « Exploitez [cette Gemme d'infinité] » (Harness). */
  harness: { op: "harness" } as Effect,
  /** « [Ce joueur] amasse des [Gobelins] X » (701.47). */
  amass: (who: Ref, subtype: string, n: Amount): Effect => ({
    op: "counterOnOrCreate",
    who,
    find: { subtype: "Army", controller: "you" },
    token: {
      name: `${subtype} Army`,
      colors: ["B"],
      types: ["Creature"],
      subtypes: [subtype, "Army"],
      power: 0,
      toughness: 0,
    },
    kind: "+1/+1",
    amount: n,
    addSubtypes: [subtype],
  }),
  /**
   * Maîtrise de la terre N (701.65, Avatar) : le terrain devient une créature 0/0 avec la célérité qui est toujours un
   * terrain, avec N marqueurs +1/+1, et « quand il meurt ou est exilé, renvoyez-le sur le champ de bataille engagé ».
   */
  earthbend: (what: Ref, n: Amount): Effect[] => [
    {
      op: "modify",
      what,
      mods: {
        addTypes: ["Creature"],
        setPower: 0,
        setToughness: 0,
        addKeywords: ["haste"],
        addAbilities: [
          triggered(when.diesOrExiled("self"), [fx.toBattlefield(ref.selfCard, { tapped: true })], {
            label: "Revient sur le champ de bataille engagé",
          }),
        ],
      },
      duration: "permanent",
    },
    { op: "addCounters", what, amount: n },
    { op: "bent", kind: "earth" },
  ],
  loseLife: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "loseLife", who, amount: n, store }),
  /** « Chaque joueur perd la moitié de ses points de vie, arrondie à l'inférieur. » */
  loseHalfLife: (who: Ref): Effect => ({ op: "loseLife", who, amount: 0, half: true }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  /** Maîtrise de l'air : exile ; son propriétaire peut le lancer pour {2} tant qu'il est exilé. */
  airbend: (what: Ref): Effect => ({ op: "airbend", what }),
  /** « Chaque joueur choisit des [permanents] de force totale N ou moins, puis sacrifie les autres. » */
  keepWithinTotalPower: (who: Ref, filter: ObjectFilter, maxTotalPower: Amount): Effect => ({
    op: "keepWithinTotalPower",
    who,
    filter,
    maxTotalPower,
  }),
  /** Effet de joueur jusqu'à la fin du tour, pour son contrôleur (`damageUnpreventable` : « les blessures ne peuvent pas être prévenues ce tour-ci »). */
  thisTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({ op: "playerEffect", ability, who }),
  /** Effet de joueur jusqu'au début de votre prochain tour (Avatar's Wrath). */
  untilYourNextTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    untilYourNextTurn: true,
  }),
  /** N effets à usage unique sur ces joueurs (Ral Zarek : « passe ses X prochains tours »). */
  playerEffectTimes: (ability: Omit<PlayerStaticAbilityDef, "kind">, times: Amount, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    times,
  }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  mill: (n: Amount, who: Ref = ref.you, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "mill",
    who,
    amount: n,
    store,
  }),
  /** Chaque joueur désigné meule la moitié de sa bibliothèque, arrondie à l'inférieur. */
  /** « La moitié de sa bibliothèque », arrondie à l'inférieur (ou au supérieur : `roundUp`). */
  millHalf: (who: Ref, roundUp = false): Effect => ({ op: "mill", who, amount: 0, halfLibrary: roundUp ? "up" : true }),
  /** Chaque joueur désigné meule autant de cartes qu'il y en a dans son cimetière. */
  millGraveyardSize: (who: Ref): Effect => ({ op: "mill", who, amount: 0, graveyardSize: true }),
  sacrificeElseDiscard: (who: Ref, filter: ObjectFilter): Effect => ({ op: "sacrificeElseDiscard", who, filter }),
  removeCounterFromEach: (filter: ObjectFilter, n: number, store?: string, kind = "+1/+1"): Effect => ({
    op: "removeCounterFromEach",
    filter,
    n,
    kind,
    store,
  }),
  scry: (n: Amount, who?: Ref): Effect => ({ op: "scry", amount: n, ...(who ? { who } : {}) }),
  surveil: (n: Amount, toHand?: { filter?: ObjectFilter; maxManaValue?: Amount }, store?: string): Effect => ({
    op: "surveil",
    amount: n,
    toHand,
    store,
  }),
  discard: (
    n: Amount,
    who: Ref = ref.you,
    opts: {
      filter?: ObjectFilter;
      chooser?: "controller";
      optional?: boolean;
      store?: string;
      random?: boolean;
      storeFilter?: ObjectFilter;
      unlessFilter?: ObjectFilter;
      exile?: boolean;
      half?: boolean;
      /** Le joueur révèle d'abord autant de cartes de son choix ; le choix se fait parmi elles (Klaw). */
      reveal?: Amount;
    } = {},
  ): Effect => ({ op: "discard", who, amount: n, ...opts }),
  sacrifice: (
    who: Ref,
    filter: ObjectFilter,
    n: Amount = 1,
    opts: {
      optional?: boolean;
      store?: string;
      greatestManaValue?: boolean;
      greatestPower?: boolean;
      exile?: boolean;
      half?: boolean;
    } = {},
  ): Effect => ({
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
  /** « [Ce joueur] peut … » : la question est posée à un autre joueur (un adversaire ciblé…). */
  mayFor: (who: Ref, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length, who }, ...flat];
  },
  /** Comme `mayFor`, en mémorisant la réponse (1 = oui) pour un « Si [il] ne le fait pas, … ». */
  mayForStore: (who: Ref, prompt: string, storeAs: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length, who, store: storeAs }, ...flat];
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
  /** « Vous pouvez maîtriser l'eau {N}. Si vous le faites, … » : les artefacts et créatures dégagés paient {1} chacun. */
  mayWaterbend: (cost: string, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: parseManaCost(cost), prompt, skip: flat.length, waterbend: true }, ...flat];
  },
  /** Contrecarre le sort ou la capacité désigné. */
  counter: (what: Ref, store?: string): Effect => ({ op: "counter", what, store }),
  /** « Contrecarrez-le ; exilez-le au lieu de le mettre au cimetière » (Syncopate). */
  counterExile: (what: Ref): Effect => ({ op: "counter", what, exile: true }),
  /** « Contrecarrez-le à moins que son contrôleur ne paie X » : le paiement annule les effets qui suivent. */
  unlessPays: (
    who: Ref,
    cost: { mana?: string; life?: number; paidStore?: string; genericAmount?: Amount; waterbend?: boolean },
    ...effects: Effects
  ): Effect[] => {
    const flat = effects.flat();
    return [
      {
        op: "unlessPay",
        who,
        mana: cost.mana ? parseManaCost(cost.mana) : undefined,
        genericAmount: cost.genericAmount,
        life: cost.life,
        paidStore: cost.paidStore,
        waterbend: cost.waterbend,
        skip: flat.length,
      },
      ...flat,
    ];
  },
  allowCastFromGraveyard: (what: Ref): Effect => ({ op: "allowCastFromGraveyard", what }),
  addMana: (...mana: ManaType[]): Effect => ({ op: "addMana", mana }),
  /** « Ajoutez N mana d'une couleur au choix » ; `colors` : « {R}, {W} ou {B} ». */
  addManaChoice: (n: Amount = 1, colors?: ManaType[], restriction?: ManaRestriction, keep?: boolean): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    ...(keep ? { keep } : {}),
  }),
  /** « Ajoutez N mana en n'importe quelle combinaison de couleurs » ; `colors` : « {R} ou {G} pour chaque … ». */
  addManaCombination: (n: Amount, colors?: ManaType[], restriction?: ManaRestriction): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    combination: true,
  }),
  revealUntilN: (filter: ObjectFilter, n: Amount, to?: MoveSpec, store?: string): Effect => ({
    op: "revealUntilN",
    filter,
    n,
    to,
    store,
  }),
  becomeCopyKeepAbilities: (what: Ref): Effect => ({ op: "becomeCopyKeepAbilities", what }),
  /** « Exilez les N cartes du dessus. Choisissez-en une. Vous pouvez la jouer ce tour-ci (ou jusqu'à la fin de votre prochain tour). » */
  impulse: (n: number, until: "thisTurn" | "yourNextTurn" = "thisTurn"): Effect => ({ op: "impulse", n, until }),
  piles: (n: number, opts: { revealed?: boolean; storeGraveyard?: string } = {}): Effect => ({ op: "piles", n, ...opts }),
  grantFlashback: (what: Ref): Effect => ({ op: "grantFlashback", what }),
  /** « [Cette carte] gagne l'harmonie jusqu'à la fin du tour ; son coût d'harmonie est son coût de mana » (702.180). */
  grantHarmonize: (what: Ref): Effect => ({ op: "grantFlashback", what, harmonize: true }),
  endTurn: { op: "endTurn" } as Effect,
  gainControl: (what: Ref, opts: { untilEndOfYourNextTurn?: boolean } = {}): Effect => ({ op: "gainControl", what, ...opts }),
  /** `haste`, `sacrificeAtEnd` : la copie d'un sort de créature (un jeton) a la célérité, est sacrifiée en fin de tour. */
  copySpell: (
    what: Ref,
    count: Amount,
    opts: { haste?: boolean; sacrificeAtEnd?: boolean; nonlegendary?: boolean } = {},
  ): Effect => ({
    op: "copySpell",
    what,
    count,
    ...opts,
  }),
  millUntil: (who: Ref, filter: ObjectFilter): Effect => ({ op: "millUntil", who, filter }),
  /** « Exilez les N cartes du dessus » ; `faceDown` : face cachée, et qui peut les regarder (406.3). */
  exileTop: (who: Ref, n: Amount, store: string, faceDown?: MoveSpec["faceDown"]): Effect => ({
    op: "exileTop",
    who,
    n,
    store,
    ...(faceDown ? { faceDown } : {}),
  }),
  grantPlay: (
    what: Ref,
    opts: {
      free?: boolean;
      anyTime?: boolean;
      anyMana?: boolean;
      forever?: boolean;
      untilYourNextTurn?: boolean;
      untilOwnersNextTurn?: boolean;
      condition?: Condition;
      forOwner?: boolean;
      extraCost?: number;
      landsTapped?: boolean;
      exileAfter?: boolean;
      oneOf?: boolean;
      replacePrevious?: boolean;
      payLifeManaValue?: boolean;
      adventureOnly?: boolean;
    } = {},
  ): Effect => ({
    op: "grantPlay",
    what,
    ...opts,
  }),
  /**
   * « Vous pouvez lancer [ces cartes] » pendant la résolution (608.2g) : `free` sans payer leur coût de mana, `many`
   * autant qu'on veut, `exileAfter` exilé au lieu d'aller au cimetière ; `storeCast` / `storeRest` pour la suite.
   */
  castNow: (
    what: Ref,
    opts: {
      free?: boolean;
      many?: boolean;
      exileAfter?: boolean;
      anyMana?: boolean;
      storeCast?: string;
      storeRest?: string;
      maxManaValue?: Amount;
      /** Coût remplaçant le coût de mana, ex. "{2}" (miracle). */
      cost?: string;
      /** « S'il devait aller au cimetière, mettez-le au-dessous de la bibliothèque » (Kylox's Voltstrider). */
      bottomAfter?: boolean;
    } = {},
  ): Effect => {
    const { cost, ...rest } = opts;
    return { op: "castNow", what, ...rest, ...(cost ? { cost: parseManaCost(cost) } : {}) };
  },
  castCopiesFree: (
    what: Ref[],
    maxTotalManaValue: number,
    opts: { paid?: boolean; storeCast?: string; maxCount?: number } = {},
  ): Effect => ({
    op: "castCopiesFree",
    what,
    maxTotalManaValue,
    ...opts,
  }),
  noLegendRuleThisTurn: { op: "noLegendRuleThisTurn" } as Effect,
  exchangeLife: (a: Ref, b: Ref, store?: string): Effect => ({ op: "exchangeLife", a, b, store }),
  /** « Faites ceci une seule fois par tour » (avec `oncePerTurn: "ifDone"`). */
  doneOncePerTurn: { op: "doneOncePerTurn" } as Effect,
  exileUntil: (filter: ObjectFilter, store: string): Effect => ({ op: "exileUntil", filter, store }),
  /** Chaque joueur désigné exile le dessus de sa bibliothèque jusqu'à une valeur de mana totale de N ou plus. */
  exileUntilTotalManaValue: (who: Ref, n: number, store: string): Effect => ({
    op: "exileUntil",
    filter: {},
    store,
    who,
    untilTotalManaValue: n,
  }),
  setLife: (amount: Amount, who: Ref = ref.you): Effect => ({ op: "setLife", who, amount }),
  /** « Vous contrôlez [le joueur] pendant son prochain tour » (722). */
  controlNextTurn: (who: Ref, combatOnly?: boolean): Effect => ({
    op: "controlNextTurn",
    who,
    ...(combatOnly ? { combatOnly } : {}),
  }),
  /** La carte ou le sort est exilé et devient comploté. */
  plot: (what: Ref): Effect => ({ op: "plot", what }),
  addManaColorsAmong: (filter: ObjectFilter): Effect => ({ op: "addManaColorsAmong", filter }),
  mayShuffleHandGraveyardDraw: (n = 7): Effect => ({ op: "mayShuffleHandGraveyardDraw", n }),
  coinFlip: (store: string): Effect => ({ op: "coinFlip", store }),
  extraUpkeeps: (amount: Amount): Effect => ({ op: "extraUpkeeps", amount }),
  plotOnResolve: (what: Ref): Effect => ({ op: "plotOnResolve", what }),
  noncombatBonusThisTurn: (amount: Amount): Effect => ({ op: "noncombatBonusThisTurn", amount }),
  flickerChosen: (filter: ObjectFilter, times: Amount): Effect => ({ op: "flickerChosen", filter, times }),
  exchangeControl: (a: Ref, b: Ref): Effect => ({ op: "exchangeControl", a, b }),
  gainControlWhileSource: (what: Ref, restrict = false): Effect => ({ op: "gainControlWhileSource", what, restrict }),
  /** « La F/E de base de … devient N » ; `powerOnly` : seulement la force de base (PuPu UFO). */
  setBasePTAll: (filter: ObjectFilter, amount: Amount, powerOnly?: boolean): Effect => ({
    op: "setBasePTAll",
    filter,
    amount,
    powerOnly,
  }),
  copyNextExhaust: { op: "copyNextExhaust" } as Effect,
  chooseCardName: { op: "chooseCardName" } as Effect,
  exileNamed: (who: Ref, max: number): Effect => ({ op: "exileNamed", who, max }),
  /** Deadly Cover-Up : une carte d'un cimetière adverse, et toutes ses homonymes (cimetière, main, bibliothèque). */
  exileNamesakes: { op: "exileNamesakes" } as Effect,
  /** The End : exile le permanent désigné et ses homonymes (cimetière, main, bibliothèque de son contrôleur). */
  exileWithNamesakes: (of: Ref): Effect => ({ op: "exileNamesakes", of }),
  /** « Quand ce permanent arrive, choisissez [un nom de carte de terrain…] » (capacité déclenchée). */
  chooseForSelf: (
    kind: "creatureType" | "color" | "cardName" | "landName",
    opts: { options?: string[]; optionsFrom?: Ref; secret?: boolean } = {},
  ): Effect => ({ op: "chooseOnEnter", kind, ...opts }),
  payCostOf: (what: Ref, store: string, prompt: string): Effect => ({ op: "payCostOf", what, store, prompt }),
  reduceSpeed: (who: Ref): Effect => ({ op: "reduceSpeed", who }),
  /** « [Cette Monture] devient montée jusqu'à la fin du tour ». */
  saddle: (what: Ref = ref.self): Effect => ({ op: "saddle", what }),
  /** « [Ce Véhicule] devient une créature-artefact jusqu'à la fin du tour ». */
  animateVehicle: (what: Ref = ref.self): Effect => ({
    op: "modify",
    what,
    mods: { addTypes: ["Artifact", "Creature"] },
    duration: "endOfTurn",
  }),
  exileFromOwnHand: (who: Ref, store: string): Effect => ({ op: "exileFromOwnHand", who, store }),
  tapOrSacrifice: { op: "tapOrSacrifice" } as Effect,
  /** Manifester (sans garde) ou envelopper d'une cape (`ward`) les cartes désignées. */
  putFaceDown: (what: Ref, ward = false, opts: { store?: string; ownerControl?: boolean } = {}): Effect => ({
    op: "putFaceDown",
    what,
    ward,
    ...opts,
  }),
  /** Cape (701.58) : face cachée, 2/2 avec la garde {2} ; `store` : les créatures ainsi créées. */
  cloak: (what: Ref, store?: string): Effect => ({ op: "putFaceDown", what, ward: true, ...(store ? { store } : {}) }),
  manifestDread: { op: "manifestDread" } as Effect,
  revealFaceDown: (what: Ref): Effect => ({ op: "revealFaceDown", what }),
  eachOfDealsDamage: (from: Ref, to: Ref): Effect => ({ op: "eachDealsDamage", filter: {}, to, from }),
  /** Salle : « déverrouillez une porte verrouillée » / « verrouillez ou déverrouillez une porte » d'une des Salles désignées. */
  door: (what: Ref, mode: "unlock" | "toggle" = "unlock"): Effect => ({ op: "door", what, mode }),
  /** « [Ce joueur] manifeste l'effroi [N fois] » ; `store` : les créatures face cachée (« puis attachez-y cet Équipement »). */
  manifestDreadBy: (opts: { who?: Ref; times?: Amount; store?: string }): Effect => ({ op: "manifestDread", ...opts }),
  /** « [créature] explore » (701.44), `times` fois. */
  explore: (what: Ref = ref.self, times?: Amount): Effect => ({ op: "explore", what, times }),
  /** « … tant que [cette source] reste sur le champ de bataille » (Kitesail Larcenist). */
  modifyWhileSource: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    whileSource: true,
  }),
  /** Tishana's Tidebinder : contrecarre la capacité ; son permanent perd ses capacités tant que la source reste. */
  counterAbilitySilence: (what: Ref): Effect => ({ op: "counterAbilitySilence", what }),
  /** « [Ce sort] gagne le rebond » (Ojer Pakpatiq). */
  grantRebound: (what: Ref): Effect => ({ op: "grantRebound", what }),
  exileOnResolveWith: (what: Ref, counter: string): Effect => ({ op: "exileOnResolve", what, counter }),
  /** Sovereign Okinec Ahau : des marqueurs +1/+1 égaux à l'écart entre force et force de base. */
  countersAboveBase: (filter: ObjectFilter): Effect => ({ op: "countersAboveBase", filter }),
  /** Découverte N (701.57) ; `who` : « ce joueur découvre N » ; `store` : la carte découverte. */
  discover: (n: Amount, opts: { who?: Ref; store?: string } = {}): Effect => ({ op: "discover", n, ...opts }),
  /** « Suspectez [la créature] » (701.60) ; `value: false` : « elle n'est plus suspecte ». */
  suspect: (what: Ref, value = true): Effect => ({ op: "suspect", what, value }),
  /** Cascade (702.85) : `n` est la valeur de mana du sort qui a la cascade. */
  cascade: (n: Amount): Effect => ({ op: "discover", n, cascade: true }),
  /** « [créature] a la connivence » (701.50). */
  connive: (what: Ref = ref.self): Effect => ({ op: "connive", what }),
  /** `orExileStore` : sinon (éphémère ou rituel), la carte est exilée et mémorisée (Etrata). */
  turnFaceUp: (what: Ref, orExileStore?: string): Effect => ({
    op: "turnFaceUp",
    what,
    ...(orExileStore ? { orExileCast: true, store: orExileStore } : {}),
  }),
  /** « Transformez [ce permanent] » (recto ↔ verso). */
  transform: (what: Ref = ref.self): Effect => ({ op: "transform", what }),
  /** « Exilez-les, puis assemblez-les » : la source et un permanent nommé `with`, en sa carte assemblée. */
  meld: (withName: string): Effect => ({ op: "meld", with: withName }),
  becomeCopy: (
    what: Ref,
    of: Ref,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" = "endOfTurn",
    /** `except` : exceptions de copie (707.9b : nom, types, F/E…), Absorbing Man, Taskmaster. */
    opts: { addKeywords?: Keyword[]; keepAbilities?: number[]; ifManaValue?: Amount; except?: LayerMods } = {},
  ): Effect => ({
    op: "becomeCopy",
    what,
    of,
    duration,
    ...opts,
  }),
  /** Effet continu qui cesse quand la carte désignée quitte l'exil (« jusqu'à ce que cette carte soit lancée depuis l'exil »). */
  modifyWhileExiled: (what: Ref, mods: LayerMods, card: Ref): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    untilLeavesExile: card,
  }),
  giveControl: (what: Ref, to: Ref): Effect => ({ op: "giveControl", what, to }),
  untapUpTo: (filter: ObjectFilter, n: number): Effect => ({ op: "untapUpTo", filter, n }),
  exileOnResolve: { op: "exileOnResolve" } as Effect,
  poison: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n }),
  destroySameName: (what: Ref): Effect => ({ op: "destroySameName", what }),
  countersDivided: (total: Amount, to: Ref, opts: { counter?: string; anyNumber?: boolean } = {}): Effect => ({
    op: "countersDivided",
    total,
    to,
    ...opts,
  }),
  payX: (prompt: string, store: string): Effect => ({ op: "payX", prompt, store }),
  changeTarget: (what: Ref): Effect => ({ op: "changeTarget", what }),
  extraCombat: { op: "extraCombat" } as Effect,
  /** « Une phase de combat supplémentaire après cette phase principale, suivie d'une phase principale supplémentaire. » */
  extraCombatAfterMain: { op: "extraCombat", afterMain: true } as Effect,
  extraTurn: { op: "extraTurn" } as Effect,
  tripleTriad: { op: "tripleTriad" } as Effect,
  unattach: (what: Ref, ifAttachedTo?: Ref): Effect => ({ op: "unattach", what, ifAttachedTo }),
  resolveToBattlefieldTransformed: { op: "resolveToBattlefieldTransformed" } as Effect,
  nextCreatureSpell: (opts: { counters?: number; haste?: boolean }): Effect => ({
    op: "playerEffect",
    ability: { nextSpell: { filter: { types: ["Creature"] }, ...opts } },
    once: true,
  }),
  spellArrivalCounters: (what: Ref, amount: Amount): Effect => ({ op: "spellArrivalCounters", what, amount }),
  /** « Jusqu'à votre prochain tour, les blessures infligées à ce joueur ou à ses permanents sont doublées » (Lightning). */
  doubleDamageTo: (who: Ref): Effect => ({
    op: "playerEffect",
    ability: { replacement: { event: "damage", to: "yourSide", modify: { times: 2 } } },
    who,
    untilYourNextTurn: true,
  }),
  /** « Prévenez toutes les blessures qui seraient infligées aux créatures que vous contrôlez ce tour-ci » (Summon: Alexander). */
  preventDamageToYourCreatures: {
    op: "playerEffect",
    ability: { replacement: { event: "damage", to: "yourSide", toFilter: { types: ["Creature"] }, modify: { prevent: true } } },
  } as Effect,
  /** Bouclier (615.7) : « la prochaine fois que [une source de votre choix] devrait… ce tour-ci, … » (New Way Forward). */
  shield: (replacement: EventReplacement, chooseSource = false): Effect => ({ op: "shield", replacement, chooseSource }),
  extraEndStep: { op: "extraEndStep" } as Effect,
  /** `amount` : chacune inflige ce nombre de blessures (sinon sa force). */
  eachDealsDamage: (filter: ObjectFilter, to: Ref, amount?: Amount): Effect => ({
    op: "eachDealsDamage",
    filter,
    to,
    ...(amount !== undefined ? { amount } : {}),
  }),
  addManaUntilEndOfTurn: (...mana: ManaType[]): Effect => ({ op: "addManaUntilEndOfTurn", mana }),
  /** Mana qui reste jusqu'à la fin du combat, `times` fois (maîtrise du feu). */
  addManaUntilEndOfCombat: (mana: ManaType[], times?: Amount): Effect => ({
    op: "addManaUntilEndOfTurn",
    mana,
    untilEndOfCombat: true,
    ...(times !== undefined ? { times } : {}),
  }),
  copyNextSpell: {
    op: "playerEffect",
    ability: { nextSpell: { filter: { types: ["Instant", "Sorcery"] }, copy: true } },
    once: true,
  } as Effect,
  winGame: { op: "winGame" } as Effect,
  loseGame: { op: "loseGame" } as Effect,
  /** « Ce joueur perd la partie » (Summon: Primal Odin). */
  playerLoses: (who: Ref): Effect => ({ op: "loseGame", who }),
  countResolution: (store: string): Effect => ({ op: "countResolution", store }),
  hellkite: { op: "hellkite" } as Effect,
  link: (what: Ref, to?: Ref): Effect => ({ op: "link", what, to }),
  /** « Ce joueur choisit l'un d'eux » : `ref.stored(store)` le choisi, `ref.stored(store + "Rest")` les autres. */
  chooseAmong: (
    what: Ref,
    chooser: Ref,
    store: string,
    opts: { anyNumber?: boolean; anyZone?: boolean; prompt?: string } = {},
  ): Effect => ({
    op: "chooseAmong",
    what,
    chooser,
    store,
    ...opts,
  }),
  /** « Vous pouvez payer N points de vie. Si vous le faites, … » */
  mayPayLife: (life: number, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: { generic: 0, colored: {}, x: 0 }, life, prompt, skip: flat.length }, ...flat];
  },
  /** Blessures réparties entre les cibles désignées. */
  damageDivided: (total: Amount, to: Ref): Effect => ({ op: "damageDivided", total, to }),
  keepOnePerType: (who: Ref): Effect => ({ op: "keepOnePerType", who }),
  keepSharingCreatureType: (who: Ref = ref.eachPlayer): Effect => ({ op: "keepSharingCreatureType", who }),
  /** « Vous obtenez un emblème avec … » */
  emblem: (
    name: string,
    text: string,
    abilities: AbilityDef[],
    untilYourNextTurn?: boolean,
    thisTurn?: boolean,
    store?: string,
  ): Effect => ({
    op: "emblem",
    name,
    text,
    abilities,
    untilYourNextTurn,
    thisTurn,
    store,
  }),
  addManaTimes: (times: Amount, ...mana: ManaType[]): Effect => ({ op: "addMana", mana, times }),
  mayWheel: { op: "mayWheel" } as Effect,
  destroyAllButChosenType: { op: "destroyAllButChosenType" } as Effect,
  exileFromHandLinked: (who: Ref, filter: ObjectFilter, untilLeaves?: boolean, reveal?: Amount, optional?: boolean): Effect => ({
    op: "exileFromHandLinked",
    who,
    filter,
    untilLeaves,
    reveal,
    ...(optional ? { optional } : {}),
  }),
  exileLibraryButBottom: (who: Ref, keep?: number): Effect => ({ op: "exileLibraryButBottom", who, keep }),
  /** Attache une Aura ou un Équipement (par défaut la source) au permanent désigné. */
  attach: (to: Ref, what: Ref = ref.self, store?: string): Effect => ({ op: "attach", what, to, store }),
  /** « … devient préparé » / « … devient dé-préparé » (Reality Fracture). */
  prepare: (what: Ref, value = true): Effect => ({ op: "prepare", what, value }),
  prepareAll: (filter: ObjectFilter, value = true): Effect => ({ op: "prepare", filter, value }),
  instantJaceLoyalty: { op: "playerEffect", ability: { jaceLoyaltyInstant: true } } as Effect,
  proliferate: (times: Amount = 1, what?: Ref): Effect => ({ op: "proliferate", times, ...(what ? { what } : {}) }),
  removeCounters: (what: Ref, n: Amount, kind?: string, store?: string): Effect => ({
    op: "removeCounters",
    what,
    n,
    kind,
    store,
  }),
  extraLandThisTurn: { op: "extraLandThisTurn" } as Effect,
  nextSpellUncounterable: { op: "playerEffect", ability: { nextSpell: { uncounterable: true } }, once: true } as Effect,
  tap: (what: Ref): Effect => ({ op: "tap", what }),
  untap: (what: Ref): Effect => ({ op: "tap", what, untap: true }),
  counters: (what: Ref, kind: string, n: Amount = 1): Effect => ({ op: "addCounters", what, amount: n, kind }),
  damageAll: (n: Amount, filter?: ObjectFilter, players?: Ref, source?: Ref): Effect => ({
    op: "damageAll",
    amount: n,
    filter,
    players,
    source,
  }),
  destroyAll: (filter: ObjectFilter, store?: string): Effect => ({ op: "destroyAll", filter, store }),
  addCountersAll: (filter: ObjectFilter, n: Amount = 1, kind?: string): Effect => ({
    op: "addCountersAll",
    filter,
    amount: n,
    kind,
  }),
  modifyAll: (filter: ObjectFilter, mods: LayerMods, duration?: "endOfTurn" | "untilYourNextTurn"): Effect => ({
    op: "modifyAll",
    filter,
    mods,
    duration,
  }),
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
  moveAll: (
    from: "battlefield" | "graveyard" | "hand",
    whose: Ref,
    filter: ObjectFilter,
    spec: MoveSpec,
    store?: string,
  ): Effect => ({
    store,
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
      rest?: "bottom" | "graveyard" | "top" | "hand";
      maxManaValue?: Amount;
      maxTotalManaValue?: number;
      store?: string;
      /** Exactement `count` cartes (« mettez-en une dans votre main »), pas « jusqu'à ». */
      exact?: boolean;
      /** La bibliothèque d'un autre joueur (Black Cat : un adversaire ciblé). */
      who?: Ref;
      /** Les cartes prises sont tirées au hasard (Getaway Barrel). */
      random?: boolean;
    } = {},
  ): Effect => ({
    op: "lookAtTop",
    n,
    ...(opts.who ? { who: opts.who } : {}),
    ...(opts.random ? { random: true } : {}),
    filter: opts.filter,
    count: opts.count ?? 1,
    to: opts.to ?? { to: "hand" },
    rest: opts.rest ?? "bottom",
    maxTotalManaValue: opts.maxTotalManaValue,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    exact: opts.exact,
  }),
  /** `toHand` : les cartes reviennent dans la main de leur propriétaire, et des cartes de cimetière peuvent être exilées. */
  exileUntilLeaves: (what: Ref, toHand?: boolean): Effect => ({ op: "exileUntilLeaves", what, ...(toHand ? { toHand } : {}) }),
  /** Choisir (sans cibler) des cartes de votre cimetière ou de votre main. */
  pickFromZone: (
    zone: "graveyard" | "hand",
    filter: ObjectFilter,
    to: MoveSpec,
    opts: {
      count?: Amount;
      min?: number;
      prompt?: string;
      excludeStored?: string;
      maxManaValue?: Amount;
      store?: string;
      pool?: Ref;
      random?: boolean;
      onePerColorOf?: ObjectFilter;
      who?: Ref;
    } = {},
  ): Effect => ({
    op: "pickFromZone",
    ...(opts.who ? { who: opts.who } : {}),
    zone,
    filter,
    to,
    count: opts.count ?? 1,
    min: opts.min,
    prompt: opts.prompt,
    excludeStored: opts.excludeStored,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    pool: opts.pool,
    random: opts.random,
    onePerColorOf: opts.onePerColorOf,
  }),
  topOrBottom: (what: Ref, topDamage?: number, fromTop?: number): Effect => ({
    op: "libraryTopOrBottom",
    what,
    topDamage,
    ...(fromTop ? { fromTop } : {}),
  }),
  /** « … perd N points de vie à moins de défausser une carte / sacrifier un permanent » */
  punisher: (
    who: Ref,
    loseLife: number,
    opts: { discard?: boolean; sacrifice?: ObjectFilter; damage?: Amount; times?: Amount } = {},
  ): Effect => ({
    op: "punisher",
    who,
    loseLife,
    ...opts,
  }),
  revealUntil: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }): Effect => ({ op: "revealUntil", filter, to }),
  doubleAllCounters: (what: Ref): Effect => ({ op: "doubleAllCounters", what }),
  search: (
    filter: ObjectFilter,
    to: MoveSpec = { to: "hand" },
    count: Amount = 1,
    who?: Ref,
    store?: string,
    manaValue?: Amount,
  ): Effect => ({
    op: "search",
    filter,
    count,
    to,
    who,
    store,
    manaValue,
  }),
  copyToken: (
    of: Ref,
    opts: {
      count?: Amount;
      addKeywords?: Keyword[];
      addSubtypes?: string[];
      sacrificeAtEndStep?: boolean;
      exileAtEndStep?: boolean;
      addAbilities?: AbilityDef[];
      legendary?: boolean;
      nonlegendary?: boolean;
      store?: string;
      tapped?: boolean;
      attacking?: boolean;
      addTypes?: CardType[];
      pt?: number;
      setColors?: Color[];
      addColors?: Color[];
      setSubtypes?: string[];
      equipDiscount?: number;
      sacrificeAtNextUpkeep?: boolean;
    } = {},
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
  /** Capacité retardée à un autre moment : étape de fin de votre prochain tour, fin du combat. */
  delayedAt: (
    at: "yourNextEndStep" | "yourEndStep" | "endOfCombat" | "nextUpkeep" | "yourNextUpkeep" | "yourNextMain",
    effects: Effects,
    bind?: Record<string, Ref>,
    vars?: Record<string, Amount>,
  ): Effect => ({
    op: "delayed",
    at,
    effects: effects.flat(),
    bind,
    ...(vars ? { vars } : {}),
  }),
  reflexive: (targets: TargetSpec[], effects: Effects, bind?: Record<string, Ref>, keepVars?: string[]): Effect => ({
    op: "reflexive",
    targets,
    effects: effects.flat(),
    bind,
    ...(keepVars ? { keepVars } : {}),
  }),
  /** « Piochez N cartes, puis défaussez N cartes. » */
  loot: (n = 1): Effect[] => [
    { op: "draw", who: ref.you, amount: n },
    { op: "discard", who: ref.you, amount: n },
  ],
  /** « Vous pouvez fourrager. Si vous le faites, … » (701.61 : exiler trois cartes de votre cimetière ou sacrifier une Nourriture). */
  mayForage: (_prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "forage", skip: flat.length }, ...flat];
  },
  /** « Vous pouvez réunir des preuves N. Si vous le faites (quand vous le faites), … » (701.59). */
  mayCollectEvidence: (n: Amount, opts: { exclude?: Ref }, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "collectEvidence", n, skip: flat.length, ...opts }, ...flat];
  },
  /** « Vous pouvez réunir des preuves X. Quand vous le faites, … X … » : X est mémorisé dans `store`. */
  mayCollectEvidenceX: (store: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "collectEvidence", skip: flat.length, store }, ...flat];
  },
  /** « Vous pouvez payer [mana] et N points de vie. Si vous le faites, … » */
  mayPayWithLife: (mana: string, life: number, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: parseManaCost(mana), life, prompt, skip: flat.length }, ...flat];
  },
  untapAll: (filter: ObjectFilter): Effect => ({ op: "untapAll", filter }),
  damageEachPlayerPer: (filter: ObjectFilter): Effect => ({ op: "damageEachPlayerPer", filter }),
  portent: { op: "portent" } as Effect,
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

/**
 * Spree (702.172) : « choisissez un ou plusieurs modes, + [coût] chacun ». Toutes les combinaisons sont générées
 * (les identifiants de cibles doivent être distincts d'un mode à l'autre).
 */
export function spree(...modes: { cost: string; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  const out: ModeDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const chosen = modes.filter((_, i) => mask & (1 << i));
    const costs = chosen.map((m) => parseManaCost(m.cost));
    const extra: ManaCost = { generic: 0, colored: {}, x: 0 };
    for (const c of costs) {
      extra.generic += c.generic;
      for (const [k, n] of Object.entries(c.colored))
        extra.colored[k as ManaType] = (extra.colored[k as ManaType] ?? 0) + (n ?? 0);
    }
    out.push({
      label: chosen.map((m) => m.label).join(" + "),
      targets: chosen.flatMap((m) => m.targets ?? []),
      effects: chosen.flatMap((m) => m.effects.flat()),
      extraCost: extra,
    });
  }
  return { modes: out };
}

/** Tiered (Final Fantasy) : « choisissez un coût supplémentaire » — un seul mode, chacun avec son coût. */
export function tiered(...modes: { cost: string; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  return {
    modes: modes.map((m) => ({
      label: m.label,
      targets: m.targets ?? [],
      effects: m.effects.flat(),
      extraCost: parseManaCost(m.cost),
    })),
  };
}

/** Remplace les identifiants de cibles (`ref.target`, `cond.targetMatches`, `otherThan`…) dans une structure de données. */
function renameTargets<T>(value: T, map: Record<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === "string" && map[x] && ((k === "id" && ("filter" in o || o.kind === "target")) || k === "spec")) {
        out[k] = map[x];
      } else if (k === "otherThan" && Array.isArray(x)) {
        out[k] = x.map((id) => (typeof id === "string" && map[id]) || id);
      } else out[k] = walk(x);
    }
    return out;
  };
  return walk(value) as T;
}

/**
 * Modes « patte » (Saisons de Bloomburrow, 700.2h) : « choisissez jusqu'à cinq {P} de modes ; vous pouvez choisir le même
 * mode plusieurs fois ». Toutes les combinaisons sont générées ; les cibles de chaque exemplaire d'un mode sont renommées.
 */
export function pawprint(...modes: { pips: number; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  const out: ModeDef[] = [];
  const counts: number[] = modes.map(() => 0);
  const visit = (i: number, left: number) => {
    if (i === modes.length) {
      if (counts.every((n) => n === 0)) return;
      const labels: string[] = [];
      const targets: TargetSpec[] = [];
      const effects: Effect[] = [];
      modes.forEach((m, k) => {
        for (let n = 0; n < (counts[k] ?? 0); n++) {
          const map = Object.fromEntries((m.targets ?? []).map((t) => [t.id, `${t.id}${k}_${n}`]));
          labels.push(m.label);
          targets.push(...renameTargets(m.targets ?? [], map));
          effects.push(...renameTargets(m.effects.flat(), map));
        }
      });
      out.push({ label: labels.join(" + "), targets, effects });
      return;
    }
    const pips = modes[i]?.pips ?? 1;
    for (let n = 0; n * pips <= left; n++) {
      counts[i] = n;
      visit(i + 1, left - n * pips);
    }
    counts[i] = 0;
  };
  visit(0, 5);
  return { modes: out };
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
    distinctPowers?: boolean;
    /** « Engagez un permanent (une créature : `"creature"`) dégagé que vous contrôlez » en plus de {T}. */
    tapAnother?: boolean | "creature";
    condition?: Condition;
    /** Autant de mana que la force de la source. */
    selfPower?: boolean;
    /** Sans {T} (Vivi Ornitier : « {0} : … »). */
    noTap?: boolean;
    oncePerTurn?: boolean;
    /** « Payez N points de vie » en plus de {T} (Haunted Screen). */
    payLife?: number;
    /** Réunir des preuves N en coût (Cryptex). */
    collectEvidence?: number;
    /** Marqueur mis sur la source à chaque activation (Twitching Doll). */
    addCounter?: string;
    /** Marqueur retiré de la source à chaque activation (Temple of Cyclical Time). */
    removeCounter?: string;
    /** Couleurs des cartes liées à la source (Pit of Offerings). */
    linkedColors?: boolean;
    /** Autant de mana que de cartes de votre cimetière correspondant au filtre (The Core). */
    perGraveyard?: ObjectFilter;
    /** « … en n'importe quelle combinaison de couleurs » : chaque mana a son propre type. */
    combination?: boolean;
  } = {},
): ManaAbilityDef {
  return {
    kind: "mana",
    cost: { tap: !opts.noTap, sacrificeSelf: opts.sacrifice, payLife: opts.payLife, collectEvidence: opts.collectEvidence },
    addCounter: opts.addCounter,
    removeCounter: opts.removeCounter,
    produceLinkedColors: opts.linkedColors,
    amountGraveyard: opts.perGraveyard,
    oncePerTurn: opts.oncePerTurn,
    produce: Array.isArray(produce) ? produce : [produce],
    ...(opts.combination ? { combination: true } : {}),
    amount: amountProduced,
    amountPer: opts.per,
    restriction: opts.restriction,
    produceChosen: opts.produceChosen,
    rider: opts.rider,
    amountDistinctPowers: opts.distinctPowers,
    tapAnother: opts.tapAnother,
    condition: opts.condition,
    amountSelfPower: opts.selfPower,
  };
}

/** « Les sorts de [filtre] que vous lancez coûtent {N} de moins. » */
export function costReducer(
  filter: ObjectFilter,
  generic: number,
  label?: string,
  opts: { condition?: Condition; genericAmount?: Amount; opponents?: boolean } = {},
): CostReductionAbilityDef {
  return { kind: "costReduction", filter, generic, label, ...opts };
}

export function activated(opts: {
  mana?: string;
  tap?: boolean;
  /** Sacrifier la source. */
  sacrifice?: boolean;
  /** Sacrifier d'autres permanents (« Sacrifiez une autre créature »). */
  sacrificeOther?: { filter: ObjectFilter; count?: number; includeSelf?: boolean };
  removeCounters?: { kind: string; n: number };
  tapOthers?: { filter: ObjectFilter; count: number; includeSelf?: boolean };
  /** Engager la créature équipée (« {T} » de la créature, pour une capacité portée par l'Équipement). */
  tapAttached?: boolean;
  /** Épuiser la source (« Exert »). */
  exert?: boolean;
  payLife?: number;
  /** « Payez X points de vie » (X de la capacité). */
  payLifeX?: boolean;
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
  exileFromGraveyard?: { filter: ObjectFilter; count?: number };
  /** « Cette capacité coûte {N} de moins [si …] ». */
  reduction?: { generic: Amount; condition?: Condition };
  /** « Retirez un marqueur [+1/+1] d'une créature que vous contrôlez ». */
  removeCounterFrom?: { filter: ObjectFilter; kind: string; n?: number };
  /** Flétrir N comme coût (ECL). */
  blight?: number;
  /** Réunir des preuves N comme coût (MKM) ; `linkEvidence` : les cartes sont liées à la source. */
  collectEvidence?: number;
  linkEvidence?: boolean;
  /** Maîtrise de l'eau (Avatar) : le coût de mana est un coût « waterbend » (artefacts et créatures dégagés : {1} chacun). */
  waterbend?: boolean;
  /** « X ne peut pas être 0 » : plus petite valeur de X permise. */
  /** « Retirez un nombre quelconque de marqueurs [sorte] de cette créature » (X = le nombre retiré). */
  removeCountersX?: string;
  /** Exiler des cartes de cette couleur du cimetière totalisant N symboles (vantardise de Baron Helmut Zemo). */
  exileGraveyardSymbols?: { color: ManaType; n: number };
  minX?: number;
  /** « Engagez X [artefacts] dégagés que vous contrôlez ». */
  tapX?: ObjectFilter;
  /** « Exilez X cartes [d'artefact] de votre cimetière ». */
  exileFromGraveyardX?: ObjectFilter;
  /** « Sacrifiez un ou plusieurs [artefacts] » (X ≥ 1). */
  sacrificeX?: ObjectFilter;
  /** « Défaussez N cartes » (`discardFilter` : seulement des cartes correspondantes). */
  discard?: number;
  /** « Défaussez votre main ». */
  discardHand?: boolean;
  discardFilter?: ObjectFilter;
  /** Ninjutsu : « renvoyez en main un attaquant non bloqué que vous contrôlez ». */
  returnUnblockedAttacker?: boolean;
  /** « Renvoyez [un permanent] que vous contrôlez dans la main de son propriétaire » (Urban Retreat). */
  bounceOther?: ObjectFilter;
  /** « Exilez [un permanent] que vous contrôlez » (The Soul Stone). */
  exileOther?: ObjectFilter;
  /** « Fourragez » (701.61). */
  forage?: boolean;
  /** Fabrication (702.167) : voir `craft()`. */
  craft?: NonNullable<ActivatedAbilityDef["cost"]["craft"]>;
  /** Montée en puissance (Power-up) : une seule fois, coût réduit du coût de mana de la source arrivée ce tour-ci. */
  powerUp?: boolean;
  label?: string;
}): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: {
      mana: opts.mana ? parseManaCost(opts.mana) : undefined,
      tap: opts.tap,
      sacrificeSelf: opts.sacrifice,
      sacrifice: opts.sacrificeOther
        ? {
            filter: opts.sacrificeOther.filter,
            count: opts.sacrificeOther.count ?? 1,
            ...(opts.sacrificeOther.includeSelf ? { includeSelf: true } : {}),
          }
        : undefined,
      removeCounters: opts.removeCounters,
      tapOthers: opts.tapOthers,
      tapAttached: opts.tapAttached,
      exertSelf: opts.exert,
      payLife: opts.payLife,
      payLifeX: opts.payLifeX,
      exileSelf: opts.exileSelf,
      discardSelf: opts.discardSelf,
      bounceSelf: opts.bounceSelf,
      addCounters: opts.addCounters,
      exileFromGraveyard: opts.exileFromGraveyard
        ? { filter: opts.exileFromGraveyard.filter, count: opts.exileFromGraveyard.count ?? 1 }
        : undefined,
      removeCounterFrom: opts.removeCounterFrom,
      blight: opts.blight,
      collectEvidence: opts.collectEvidence,
      linkEvidence: opts.linkEvidence,
      waterbend: opts.waterbend,
      minX: opts.minX,
      exileGraveyardSymbols: opts.exileGraveyardSymbols,
      tapX: opts.tapX,
      exileFromGraveyardX: opts.exileFromGraveyardX,
      sacrificeX: opts.sacrificeX,
      removeCountersX: opts.removeCountersX,
      discard: opts.discard,
      ...(opts.discardHand ? { discardHand: true } : {}),
      discardFilter: opts.discardFilter,
      returnUnblockedAttacker: opts.returnUnblockedAttacker,
      bounceOther: opts.bounceOther,
      exileOther: opts.exileOther,
      forage: opts.forage,
      craft: opts.craft,
    },
    reduction: opts.reduction,
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: opts.sorcerySpeed,
    once: opts.once || opts.powerUp,
    powerUp: opts.powerUp,
    oncePerTurn: opts.oncePerTurn,
    activationCondition: opts.activationCondition,
    fromGraveyard: opts.fromGraveyard,
    fromHand: opts.fromHand,
    label: opts.label,
  };
}

/**
 * Fabrication (702.167) : « Craft with [matériaux] [coût] » — « [coût], exilez ce permanent, exilez [matériaux] parmi les
 * autres permanents que vous contrôlez et/ou les cartes de votre cimetière : renvoyez cette carte transformée sous le
 * contrôle de son propriétaire. N'activez qu'en rituel. » Les matériaux sont liés au verso (`ref.linked`).
 */
export function craft(
  mana: string,
  materials: NonNullable<ActivatedAbilityDef["cost"]["craft"]>,
  label = "Fabrication",
): ActivatedAbilityDef {
  return {
    ...activated({ mana, exileSelf: true, craft: materials, sorcerySpeed: true, effects: [{ op: "craftReturn" }] }),
    label: `${label} ${mana}`,
  };
}

/** Capacité de loyauté (606) : « +1 : … », « −3 : … » ; en rituel, une par tour et par planeswalker. */
/** Exhaust (702.177) : « Exhaust — [coût] : [effet] » (une seule activation). */
export function exhaust(opts: Parameters<typeof activated>[0]): ActivatedAbilityDef {
  return { ...activated({ ...opts, once: true }), exhaust: true, label: `Exhaust — ${opts.label ?? ""}`.trim() };
}

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

/** Capacité de loyauté « −X » : X est choisi à l'activation (lu avec `amount.x`). */
export function loyaltyX(opts: { targets?: TargetSpec[]; effects: Effects; label: string }): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { loyalty: 0, loyaltyX: true },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: true,
    label: `−X : ${opts.label}`,
  };
}

/** Déclencheurs courants. */
export const when = {
  /** « Quand cette créature arrive sur le champ de bataille » */
  entersSelf: { on: "enters", who: "self" } as TriggerSpec,
  /** « Quand il se transforme en [cette face] » (à mettre sur la face visée). */
  transformsSelf: { on: "transformsSelf" } as TriggerSpec,
  /** « Chaque fois qu'un(e) [filtre] arrive sur le champ de bataille » */
  enters: (filter: ObjectFilter): TriggerSpec => ({ on: "enters", who: filter }),
  diesSelf: { on: "dies", who: "self" } as TriggerSpec,
  dies: (filter: ObjectFilter): TriggerSpec => ({ on: "dies", who: filter }),
  leavesSelf: { on: "leaves", who: "self" } as TriggerSpec,
  /** « Quand l'objet lié (choisi) quitte le champ de bataille » */
  linkedLeaves: { on: "leaves", who: "linked" } as TriggerSpec,
  /** « Chaque fois qu'une [créature que vous contrôlez …] quitte le champ de bataille » (filtre vu du contrôleur de la source). */
  leaves: (who: ObjectFilter): TriggerSpec => ({ on: "leaves", who }),
  /** « Chaque fois qu'un adversaire cherche dans sa bibliothèque » */
  search: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "search", whose }),
  opponentLoses: { on: "playerLoses", whose: "opponent" } as TriggerSpec,
  attacksSelf: { on: "attacks", who: "self" } as TriggerSpec,
  attacks: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter }),
  /** « Chaque fois qu'un adversaire acquiert le contrôle d'un permanent qui était à vous » */
  opponentGainsControl: { on: "controlChange" } as TriggerSpec,
  /** « Chaque fois qu'une créature [filtre] attaque seule » */
  attacksAlone: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter, alone: true }),
  /** « Chaque fois qu'une [créature] vous attaque ou attaque un planeswalker que vous contrôlez » */
  attacksYou: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter, defending: "you" }),
  /** « Chaque fois que cette créature inflige des blessures de combat à un joueur » */
  combatDamageToPlayer: { on: "dealsCombatDamage", who: "self", toPlayer: true } as TriggerSpec,
  castSpell: (
    by: "you" | "opponent" | "any" = "you",
    filter?: ObjectFilter,
    targeting?: { objects?: ObjectFilter; opponent?: boolean; orFilter?: boolean },
  ): TriggerSpec => ({ on: "castSpell", by, filter, targeting }),
  /** « Chaque fois que vous lancez votre N-ième sort de chaque tour » */
  castNthSpell: (nth: number): TriggerSpec => ({ on: "castSpell", by: "you", nth }),
  /** « Chaque fois qu'un joueur lance un sort, si ce n'est pas son tour » */
  castSpellOffTurn: (by: "you" | "opponent" | "any" = "any"): TriggerSpec => ({ on: "castSpell", by, notTheirTurn: true }),
  /** « Chaque fois qu'un joueur lance un sort qu'il ne possède pas » */
  castSpellNotOwned: { on: "castSpell", by: "any", notOwned: true } as TriggerSpec,
  /** « Chaque fois que vous lancez un sort non-créature, si au moins N mana a été dépensé pour le lancer » */
  castNoncreatureWithMana: (n: number): TriggerSpec => ({
    on: "castSpell",
    by: "you",
    filter: { notTypes: ["Creature"] },
    minManaSpent: n,
  }),
  /** « Chaque fois que vous commettez un crime » */
  crime: { on: "crime" } as TriggerSpec,
  /** « Quand cette carte devient complotée » */
  plottedSelf: { on: "plottedSelf" } as TriggerSpec,
  /** « Chaque fois que vous activez une capacité qui cible une créature ou un joueur » */
  activateTargeting: { on: "activateTargeting" } as TriggerSpec,
  /** Une carte change de zone (voir TriggerSpec `zoneChange`). */
  zoneChange: (from: Zone[], opts: { to?: Zone[]; filter?: ObjectFilter; whose?: "you" | "any" } = {}): TriggerSpec => ({
    on: "zoneChange",
    from,
    ...opts,
  }),
  /** « Chaque fois que cette créature subit des blessures » */
  isDealtDamage: { on: "isDealtDamage", who: "self" } as TriggerSpec,
  /** « Chaque fois qu'une [créature que vous contrôlez] subit des blessures » */
  dealtDamage: (who: ObjectFilter): TriggerSpec => ({ on: "isDealtDamage", who }),
  /** « Chaque fois qu'une ou plusieurs [créatures] subissent des blessures en excès » (120.4a). */
  excessDamage: (who: ObjectFilter, noncombatOnly = false): TriggerSpec => ({ on: "excessDamage", who, noncombatOnly }),
  /** « Chaque fois que la créature enchantée (ou équipée) subit des blessures » */
  attachedIsDealtDamage: { on: "isDealtDamage", who: "attached" } as TriggerSpec,
  /** « Chaque fois qu'une ou plusieurs [créatures] infligent des blessures de combat à un joueur » */
  combatDamageBatch: (who: ObjectFilter): TriggerSpec => ({ on: "combatDamageBatch", who }),
  /** « Quand ce permanent est mis dans un cimetière depuis le champ de bataille » */
  putIntoGraveyardSelf: { on: "leaves", who: "self", to: "graveyard" } as TriggerSpec,
  blocks: (who: "self" | ObjectFilter, attacker?: ObjectFilter): TriggerSpec => ({ on: "blocks", who, attacker }),
  /** « Chaque fois que [créature] meurt ou est exilée » */
  diesOrExiled: (who: "self" | ObjectFilter, minPower?: number): TriggerSpec => ({ on: "diesOrExiled", who, minPower }),
  /** « Chaque fois que vous jouez un terrain » */
  playLand: { on: "playLand" } as TriggerSpec,
  /** « Chaque fois que vous défaussez une ou plusieurs cartes » (`amount.eventAmount` : leur nombre). */
  discardBatch: (whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "discardBatch", whose }),
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
  /** `filter` : « … avec un ou plusieurs [Rats] ». */
  attackWith: (min = 1, filter?: ObjectFilter, anyPlayer?: boolean): TriggerSpec => ({
    on: "attackWith",
    min,
    filter,
    ...(anyPlayer ? { anyPlayer } : {}),
  }),
  /** « Chaque fois qu'un adversaire attaque avec des créatures, si N ou plus vous attaquent, vous ou vos planeswalkers ». */
  opponentAttacksYouWith: (min = 1): TriggerSpec => ({ on: "attackWith", min, defending: "you" }),
  countersPut: (who: "self" | ObjectFilter, kind?: string, firstThisTurn?: boolean): TriggerSpec => ({
    on: "countersPut",
    who,
    kind,
    firstThisTurn,
  }),
  /** « Chaque fois que vous mettez un ou plusieurs marqueurs (de cette sorte) sur … ». */
  youPutCounters: (who: ObjectFilter, kind?: string): TriggerSpec => ({ on: "countersPut", who, kind, by: "you" }),
  dealsDamage: (
    who: "self" | ObjectFilter,
    opts: { noncombatOnly?: boolean; toOpponent?: boolean; anySourceYouControl?: boolean } = {},
  ): TriggerSpec => ({
    on: "dealsDamage",
    who,
    ...opts,
  }),
  combatDamage: (who: "self" | ObjectFilter, toPlayer = false): TriggerSpec => ({ on: "dealsCombatDamage", who, toPlayer }),
  /** « Chaque fois qu'une [créature] inflige des blessures de combat à l'un de vos adversaires » */
  combatDamageToOpponent: (who: "self" | ObjectFilter): TriggerSpec => ({
    on: "dealsCombatDamage",
    who,
    toPlayer: true,
    toOpponent: true,
  }),
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
  /** « Quand vous cyclez cette carte » (avec `fromGraveyard` ; `amount.eventAmount` : le X du coût). */
  cycleSelf: { on: "cycleSelf" } as TriggerSpec,
  /** « Chaque fois que vous activez une capacité d'exhaust » */
  exhaustActivated: { on: "exhaustActivated" } as TriggerSpec,
  /** « Quand vous lancez ce sort » */
  castSelf: { on: "castSelf" } as TriggerSpec,
  /** « Quand cette créature est retournée face visible » */
  turnedFaceUp: { on: "turnedFaceUp" } as TriggerSpec,
  /** « Chaque fois qu'un permanent [filtre] est retourné face visible » */
  permanentTurnedFaceUp: (who: ObjectFilter): TriggerSpec => ({ on: "turnedFaceUp", who }),
  /** « Chaque fois qu'une [créature] devient bloquée » */
  becomesBlocked: (who: ObjectFilter): TriggerSpec => ({ on: "becomesBlocked", who }),
  /** « Chaque fois que le joueur enchanté subit des blessures » */
  attachedPlayerDamaged: { on: "attachedPlayerDamaged" } as TriggerSpec,
  /** « Chaque fois que vous manifestez l'effroi » (l'objet de l'événement : la carte mise au cimetière). */
  manifestDread: { on: "manifestDread" } as TriggerSpec,
  /** « Chaque fois que vous découvrez » (`amount.eventAmount` : la valeur N). */
  discover: { on: "discover" } as TriggerSpec,
  /** « Chaque fois qu'une [créature] explore [une carte de terrain / non-terrain] » */
  explores: (who: "self" | ObjectFilter, land?: boolean): TriggerSpec => ({ on: "explores", who, land }),
  /** « Chaque fois que vous sacrifiez [un permanent] » */
  /** `anyPlayer` : sacrifié par n'importe quel joueur ; `byOpponent` : par un adversaire (Vengeful Tracker). */
  sacrifice: (who: ObjectFilter, anyPlayer?: boolean, byOpponent?: boolean): TriggerSpec => ({
    on: "sacrifice",
    who,
    anyPlayer: anyPlayer || byOpponent,
    byOpponent,
  }),
  /** « Chaque fois que cette Monture devient montée » */
  saddled: { on: "saddled" } as TriggerSpec,
  /** « Chaque fois que cette créature monte une Monture ou équipe un Véhicule [pendant votre phase principale] » */
  crews: (mainPhase = false): TriggerSpec => ({ on: "crews", mainPhase }),
  /** « Quand cette Classe atteint le niveau N » */
  classLevel: (level: number): TriggerSpec => ({ on: "classLevel", level }),
  /** « Quand vous déverrouillez cette porte » (Salle ; la porte est fixée à l'import). */
  unlockThisDoor: { on: "unlockDoor" } as TriggerSpec,
  /** Sinistre : « chaque fois qu'un enchantement que vous contrôlez arrive et chaque fois que vous déverrouillez entièrement une Salle ». */
  eerie: { on: "eerie" } as TriggerSpec,
  /** « Au début de votre seconde phase principale » (Survie, avec la condition « si cette créature est engagée »). */
  secondMain: { on: "step", step: "main2", whose: "you" } as TriggerSpec,
  /** « Chaque fois que vous activez une capacité de loyauté [en retirant au moins N marqueurs] » */
  /** Vaillance : « chaque fois que cette créature devient la cible d'un sort ou d'une capacité que vous contrôlez ». */
  valiant: { on: "becomesTarget", who: "self", byYou: true } as TriggerSpec,
  /** « Chaque fois qu'une [créature que vous contrôlez] devient la cible d'un sort ou d'une capacité qu'un adversaire contrôle » */
  /** `spells` : « … ou un sort de [créature] que vous contrôlez » (Surrak, Elusive Hunter). */
  targetedByOpponent: (who: ObjectFilter, spells?: boolean): TriggerSpec => ({
    on: "becomesTarget",
    who,
    byOpponent: true,
    spells,
  }),
  /** Dépense N : « chaque fois que vous dépensez votre N-ième mana total pour lancer des sorts pendant un tour ». */
  expend: (n: number): TriggerSpec => ({ on: "expend", n }),
  forage: { on: "forage" } as TriggerSpec,
  collectEvidence: { on: "collectEvidence" } as TriggerSpec,
  /** « Chaque fois que vous maîtrisez l'eau, la terre, le feu ou l'air » (Avatar). */
  bend: (kinds?: ("water" | "earth" | "fire" | "air")[]): TriggerSpec => ({ on: "bend", ...(kinds ? { kinds } : {}) }),
  /** « Chaque fois qu'une créature que vous contrôlez fait, en attaquant, se déclencher une de ses capacités. » */
  attackAbilityTriggered: { on: "attackAbilityTriggered" } as TriggerSpec,
  caseSolved: { on: "caseSolved" } as TriggerSpec,
  /** « Chaque fois que vous offrez un cadeau » */
  giveGift: { on: "gift" } as TriggerSpec,
  /** « Chaque fois que vous gagnez ou perdez des points de vie » */
  lifeChange: { on: "lifeChange" } as TriggerSpec,
  /** « Chaque fois qu'une [créature] quitte le champ de bataille sans mourir » */
  leavesWithoutDying: (who: ObjectFilter): TriggerSpec => ({ on: "leavesWithoutDying", who }),
  loyaltyActivated: (minRemoved?: number, byOpponent?: boolean): TriggerSpec => ({
    on: "loyaltyActivated",
    minRemoved,
    byOpponent,
  }),
};

/** Conditions courantes (raid, morbide…). */
export const cond = {
  raid: { kind: "attackedThisTurn" } as Condition,
  attackedWith: (subtype: string): Condition => ({ kind: "attackedThisTurn", subtype }),
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
  beholdSharingType: (r: Ref, count: number): Condition => ({ kind: "beholdSharingType", ref: r, count }),
  eventObjectMatches: (filter: ObjectFilter): Condition => ({ kind: "eventObjectMatches", filter }),
  lifeGainedAtLeast: (n: number): Condition => ({ kind: "lifeGainedAtLeast", n }),
  amountAtLeast: (a: Amount, n: number): Condition => ({ kind: "amountAtLeast", amount: a, n }),
  /** « a > b », évalués à la résolution (Evil's Thrall : un Méchant de valeur de mana supérieure). */
  amountGreater: (a: Amount, b: Amount): Condition => ({ kind: "amountGreater", a, b }),
  xAtLeast: (n: number): Condition => ({ kind: "xAtLeast", n }),
  /** « tant que vous avez N mana non dépensé ou plus » (la réserve change : `bump` à chaque changement). */
  manaPoolAtLeast: (n: number): Condition => ({ kind: "manaPoolAtLeast", n }),
  castFromHand: { kind: "castFromHand" } as Condition,
  wasCast: { kind: "wasCast" } as Condition,
  /** « si vous avez regardé ou surveillé ce tour-ci » */
  scried: { kind: "scriedThisTurn" } as Condition,
  firstEndStep: { kind: "firstEndStep" } as Condition,
  firstCombat: { kind: "firstCombat" } as Condition,
  /** Un adversaire a subi ce tour-ci des blessures de combat d'une créature légendaire. */
  opponentDamagedByLegendary: turnAtLeast({
    event: "damage",
    who: "opponent",
    toPlayer: true,
    combat: true,
    sourceTypes: ["Creature"],
    sourceSupertype: "Legendary",
  }),
  /** Un joueur a subi N blessures de combat ou plus ce tour-ci. */
  playerCombatDamageAtLeast: (n: number): Condition =>
    turnAtLeast({ event: "damage", toPlayer: true, combat: true, sum: true, perPlayer: true }, n),
  noLegendaryCreatureCastThisTurn: {
    kind: "not",
    cond: turnAtLeast({ event: "cast", who: "you", types: ["Creature"], supertype: "Legendary" }),
  } as Condition,
  controlsGreatestPower: { kind: "controlsGreatestPower" } as Condition,
  creaturesDied: (n: number, underOpponent?: boolean): Condition => ({ kind: "creaturesDiedAtLeast", n, underOpponent }),
  opponentDealtNoncombatDamage: { kind: "opponentDealtNoncombatDamage" } as Condition,
  drewAtLeast: (n: number): Condition => ({ kind: "drewAtLeast", n }),
  castThisTurn: (n: number, noncreature = false, exactly = false): Condition => ({
    kind: "castThisTurn",
    n,
    noncreature,
    exactly,
  }),
  /** « si vous contemplez un Jace » : vous contrôlez un Jace ou vous avez une carte de Jace en main. */
  /** Contempler (701.63) : « vous pouvez contempler un Elfe » (choisir un Elfe que vous contrôlez ou révéler une carte d'Elfe de votre main). */
  behold: (filter: ObjectFilter): Condition => ({ kind: "behold", filter }),
  beholdJace: { kind: "behold", filter: { subtype: "Jace" } } as Condition,
  /** « Si {U}{U} a été dépensé pour le lancer » : `cond.spent("U", 2)`. */
  spent: (color: ManaType, n: number): Condition => ({ kind: "spentColor", color, n }),
  evoked: { kind: "evoked" } as Condition,
  /** « … avec la plus grande force parmi les créatures que ce joueur contrôle » (l'objet de l'événement, parti). */
  eventObjectGreatestPower: { kind: "eventObjectGreatestPower" } as Condition,
  /** « S'il a été lancé par Web-slinging », « si le coût de chaos a été payé ». */
  castVia: (via: CastVia): Condition => ({ kind: "castVia", via }),
  /** Capacité ∞ : la source a été exploitée. */
  harnessed: { kind: "harnessed" } as Condition,
  /** Storied : « tant que vous avez un récit durable ». */
  enduringStory: { kind: "enduringStory" } as Condition,
  /** « Si le coût de faufilement de ce sort a été payé ». */
  sneaked: { kind: "sneaked" } as Condition,
  sneakWindow: { kind: "sneakWindow" } as Condition,
  activatedLoyalty: { kind: "activatedLoyaltyThisTurn" } as Condition,
  /** La source est préparée. */
  prepared: { kind: "prepared" } as Condition,
  /** Vide (Edge of Eternities) : un permanent non-terrain a quitté le champ de bataille ou un sort a été lancé avec la distorsion ce tour-ci. */
  void: { kind: "void" } as Condition,
  /** Classe : exactement à ce niveau ; Affaire : résolue. */
  classLevel: (level: number): Condition => ({ kind: "classLevel", level }),
  solved: { kind: "solved" } as Condition,
  /** Monture : montée ce tour-ci. */
  saddled: { kind: "saddled" } as Condition,
  /** Salle : toutes ses portes sont déverrouillées. */
  fullyUnlocked: { kind: "fullyUnlocked" } as Condition,
  /** Une seule créature attaque, et elle attaque un joueur. */
  attackingAlone: { kind: "attackingAlone" } as Condition,
  playerWithoutCreatures: { kind: "playerWithoutCreatures" } as Condition,
  opponentLifeAtMost: (n: number): Condition => ({ kind: "opponentLifeAtMost", n }),
  /** « Max speed » : vous avez la vitesse maximale (4). */
  maxSpeed: { kind: "maxSpeed" } as Condition,
  exileAtLeast: (n: number): Condition => ({ kind: "exileAtLeast", n }),
  evenCounters: { kind: "evenCounters" } as Condition,
  /** « si vous avez commis un crime ce tour-ci » */
  crime: { kind: "crimeThisTurn" } as Condition,
  /** « si vous avez lancé un sort depuis votre main ce tour-ci » */
  handSpellThisTurn: turnAtLeast({ event: "cast", who: "you", fromZone: "hand" }),
  turnsTakenAtLeast: (n: number): Condition => ({ kind: "turnsTakenAtLeast", n }),
  opponentDealtNoncombatDamageLastTurn: { kind: "opponentDealtNoncombatDamageLastTurn" } as Condition,
  spellCastFromHand: { kind: "spellCastFromHand" } as Condition,
  spellCastFromGraveyard: { kind: "spellCastFromGraveyard" } as Condition,
  sourceDealtCombatDamage: { kind: "sourceDealtCombatDamage" } as Condition,
  /** La source a déjà infligé des blessures, de combat ou non. */
  sourceDealtDamage: { kind: "sourceDealtDamage" } as Condition,
  prime: (a: Amount): Condition => ({ kind: "prime", amount: a }),
  step: (step: Step): Condition => ({ kind: "step", step }),
  creatureDiedMatching: (filter: ObjectFilter): Condition => ({ kind: "creatureDiedMatching", filter }),
  castFromGraveyard: { kind: "castFromGraveyard" } as Condition,
  faceDownOrUp: { kind: "faceDownOrUpThisTurn" } as Condition,
  sacrificedThisTurn: turnAtLeast({ event: "sacrifice", who: "you" }),
  /** « Si le cadeau a été promis » (702.174 : comme un kicker). */
  gift: { kind: "kicked" } as Condition,
  any: (...of: Condition[]): Condition => ({ kind: "any", of }),
  opponentHasMore: (what: "lands" | "life" | "creatures" | "hand"): Condition => ({ kind: "opponentHasMore", what }),
  /** « si vous avez perdu des points de vie ce tour-ci » */
  lostLife: { kind: "lostLifeThisTurn" } as Condition,
  refLostLife: (r: Ref): Condition => ({ kind: "refLostLife", ref: r }),
  handAtMost: (r: Ref, n: number): Condition => ({ kind: "handAtMost", ref: r, n }),
  targetChosen: (spec: string): Condition => ({ kind: "targetChosen", spec }),
  sacrificedFood: turnAtLeast({ event: "sacrifice", who: "you", subtype: "Food" }),
  canForage: { kind: "canForage" } as Condition,
  /** Délire : au moins quatre types de cartes parmi les cartes de votre cimetière. */
  delirium: { kind: "amountAtLeast", amount: { kind: "cardTypesInGraveyard" }, n: 4 } as Condition,
  /** Sièges : la source a choisi ce mode en arrivant (« • Abzan — … »). */
  chosenMode: (mode: string): Condition => ({ kind: "chosenMode", mode }),
  /** « si vous êtes descendu ce tour-ci » (une carte de permanent a été mise dans votre cimetière). */
  descended: turnAtLeast(DESCENT),
};

/** Équipage N (702.122) : « engagez des créatures de force totale N ou plus : ce Véhicule devient une créature-artefact ». */
export function crewAbility(n: number, oncePerTurn = false): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { crew: n },
    targets: [],
    effects: [{ op: "modify", what: { kind: "self" }, mods: { addTypes: ["Artifact", "Creature"] }, duration: "endOfTurn" }],
    oncePerTurn: oncePerTurn || undefined,
    label: `Équipage ${n}`,
  };
}

/** Monture N (702.171) : « engagez des créatures de force totale N ou plus : cette Monture devient montée. Rituel. » */
export function saddleAbility(n: number): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { crew: n },
    targets: [],
    effects: [{ op: "saddle" }],
    sorcerySpeed: true,
    label: `Monture ${n}`,
  };
}

/**
 * Garde (702.21) : « Chaque fois que ce permanent devient la cible d'un sort ou d'une capacité qu'un adversaire
 * contrôle, contrecarrez-le à moins que ce joueur ne paie [coût]. » (accordée : Hardlight Containment).
 */
export function wardAbility(ward: NonNullable<CardDef["ward"]>): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger: { on: "becomesTarget", who: "self", byOpponent: true },
    targets: [],
    effects: [
      {
        op: "unlessPay",
        who: { kind: "eventPlayer" },
        mana: ward.mana,
        life: ward.life,
        lifeAmount: ward.lifePower ? { kind: "powerOf", ref: { kind: "self" } } : undefined,
        discard: ward.discard,
        discardRandom: ward.discardRandom,
        sacrifice: ward.sacrifice,
        sacrificeFilter: ward.sacrificeFilter,
        collectEvidence: ward.collectEvidence,
        waterbend: ward.waterbend,
        poison: ward.poison,
        orMana: ward.orMana,
        skip: 1,
      },
      { op: "counter", what: { kind: "eventObject" } },
    ],
    ward: true,
    label: "Garde",
  };
}

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export function flashForAll(label?: string): CastPermissionAbilityDef {
  return { kind: "castPermission", flash: true, label };
}

/** Permissions de lancement : sans payer (Omniscience), butin (Tinybones), cimetière (Muldrotha)… */
export function castPermission(opts: Omit<CastPermissionAbilityDef, "kind">): CastPermissionAbilityDef {
  return { kind: "castPermission", ...opts };
}

/** « Si [un objet] devait être mis dans un cimetière, exilez-le à la place » (614.1a ; ordre : `replaceGraveyard`). */
export function graveyardReplacement(opts: Omit<GraveyardReplacementAbilityDef, "kind"> = {}): GraveyardReplacementAbilityDef {
  return { kind: "graveyardReplacement", ...opts };
}

/**
 * Remplacement d'un événement chiffré imprimé (R1, 614, 615) : « si une source que vous contrôlez devait infliger des
 * blessures, elle en inflige autant plus 1 / le double », « prévenez … », perte de PV.
 */
export function eventReplacement(opts: Omit<EventReplacementAbilityDef, "kind">): EventReplacementAbilityDef {
  return { kind: "eventReplacement", ...opts };
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

/** Coût de mana écrit comme sur la carte (« {3}{B} »). */
export function cost(text: string): ManaCost {
  return parseManaCost(text);
}

/**
 * Règles de blocage (famille R4.1) : « ne peut pas être bloquée par [filtre] », « ne peut bloquer que [filtre] »,
 * nombre de bloqueurs. Imprimées : `blockAbility(block.…)` ; accordées : `addBlockRules` d'un effet ou d'une statique.
 */
export const block = {
  notBy: (filter: ObjectFilter, label: string): BlockRule => ({ cantBeBlockedBy: filter, label }),
  onlyBlocks: (filter: ObjectFilter, label: string): BlockRule => ({ canBlockOnly: filter, label }),
  atLeast: (n: number): BlockRule => ({ minBlockers: n, label: `Bloquée par ${n} créatures ou plus` }),
  atMost: (n: number): BlockRule => ({
    maxBlockers: n,
    label: n === 1 ? "Bloquée par une seule créature au plus" : `Bloquée par ${n} créatures au plus`,
  }),
  notAlone: { notAlone: true, label: "Ne peut ni attaquer ni bloquer seule" } as BlockRule,
  /** Les plus fréquentes. */
  notByPowerLE2: { cantBeBlockedBy: { maxPower: 2 }, label: "Imblocable par les créatures de force 2 ou moins" } as BlockRule,
};

/** « Utilise son endurance (ou une force modifiée) pour … » (famille R4.3). */
export const powerFor = {
  /** Pilote : monte et équipe comme si sa force était supérieure de 2. */
  pilot: { uses: ["crew"], bonus: 2, label: "Monte et équipe avec 2 de force en plus" } as PowerRule,
  crewWithToughness: { uses: ["crew"], toughness: "always", label: "Monte et équipe avec son endurance" } as PowerRule,
  combatToughness: {
    uses: ["combatDamage"],
    toughness: "ifGreater",
    label: "Blesse selon son endurance si elle est plus grande",
  } as PowerRule,
  combatAbsolute: { uses: ["combatDamage"], absolute: true, label: "Blesse selon la valeur absolue de sa force" } as PowerRule,
};

/** Règle « utilise son endurance pour » imprimée sur la carte : une statique sur elle-même. */
export function powerRuleAbility(rule: PowerRule): AbilityDef {
  return staticAbility("self", { addPowerRules: [rule] }, { label: rule.label });
}

/** Protections et défenses talismaniques « contre [filtre] » (famille R4.2). */
export const protection = {
  from: (filter: ObjectFilter, label: string): ProtectionRule => ({ from: filter, label }),
  hexproofFrom: (filter: ObjectFilter, label: string): ProtectionRule => ({ from: filter, hexproofOnly: true, label }),
  everything: { from: {}, label: "Protection contre tout" } as ProtectionRule,
};

/** Protection ou défense talismanique imprimée sur la carte : une statique sur elle-même. */
export function protectionAbility(rule: ProtectionRule): AbilityDef {
  return staticAbility("self", { addProtections: [rule] }, { label: rule.label });
}

/** Règle de blocage imprimée sur la carte : une statique sur elle-même. */
export function blockAbility(rule: BlockRule): AbilityDef {
  return staticAbility("self", { addBlockRules: [rule] }, { label: rule.label });
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
    perSpeed?: boolean;
    perLife?: boolean;
    perHand?: boolean;
    perTurnEvents?: TurnLogQuery;
    perAmount?: Amount;
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
    perSpeed: opts.perSpeed,
    perLife: opts.perLife,
    perHand: opts.perHand,
    perTurnEvents: opts.perTurnEvents,
    perAmount: opts.perAmount,
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
    oncePerTurn?: boolean | "ifDone";
    /** Se déclenche depuis le cimetière (Flamewake Phoenix). */
    fromGraveyard?: boolean;
    /** « une ou plusieurs … » : un seul déclenchement par lot d'événements. */
    batched?: boolean;
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
    batched: opts.batched,
  };
}

/**
 * Maîtrise du feu N (Avatar) : « chaque fois que cette créature attaque, ajoutez N {R} ; ce mana reste jusqu'à la fin du
 * combat ». N peut être un montant (« maîtrise du feu X, X étant la force de Zuko »).
 */
export function firebending(n: Amount): TriggeredAbilityDef {
  return triggered(when.attacksSelf, [fx.addManaUntilEndOfCombat(["R"], n), { op: "bent", kind: "fire" }], {
    label: typeof n === "number" ? `Maîtrise du feu ${n}` : "Maîtrise du feu X",
  });
}

/** Chapitre(s) de Saga (714.2) : « I, II — [effets] ». */
export function chapter(
  chapters: number[],
  effects: Effects,
  opts: { targets?: TargetSpec[]; label?: string } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger: { on: "chapter", chapters },
    effects: effects.flat(),
    targets: opts.targets ?? [],
    label: opts.label ?? `Chapitre ${chapters.map(roman).join(", ")}`,
  };
}

const roman = (n: number): string => ["", "I", "II", "III", "IV", "V", "VI"][n] ?? String(n);

/** Capacité déclenchée modale (« choisissez un — »). */
export function triggeredModal(
  trigger: TriggerSpec,
  modes: ModeDef[],
  opts: { condition?: Condition; label?: string; uniqueModes?: boolean | "turn"; oncePerTurn?: boolean } = {},
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
