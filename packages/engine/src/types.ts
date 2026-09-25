/**
 * Types centraux du moteur. Tout ce qui est dans GameState est sérialisable en JSON :
 * pas de classes, pas de fonctions, pas de Map/Set.
 */

// ---------------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------------

export type Color = "W" | "U" | "B" | "R" | "G";
export type ManaType = Color | "C";
export const COLORS: readonly Color[] = ["W", "U", "B", "R", "G"];
export const MANA_TYPES: readonly ManaType[] = ["W", "U", "B", "R", "G", "C"];

export interface ManaCost {
  generic: number;
  /** Symboles colorés (ou {C}) : nombre de chaque type requis. */
  colored: Partial<Record<ManaType, number>>;
  /** Nombre de {X} dans le coût. */
  x: number;
  /** Symboles hybrides : chacun se paie avec l'un des deux types. */
  hybrid?: [ManaType, ManaType][];
}

export type CardType = "Land" | "Creature" | "Artifact" | "Enchantment" | "Instant" | "Sorcery" | "Planeswalker" | "Battle";

export type Keyword =
  | "flying"
  | "reach"
  | "firstStrike"
  | "doubleStrike"
  | "deathtouch"
  | "lifelink"
  | "trample"
  | "vigilance"
  | "haste"
  | "menace"
  | "defender"
  | "flash"
  | "hexproof"
  | "indestructible"
  | "prowess"
  /** Restrictions (pas des mots-clés imprimés, mais gérées comme des capacités de couche 6). */
  | "cantBlock"
  | "cantAttack"
  | "unblockable"
  | "mustAttack"
  | "doesntUntap"
  | "cantBeBlockedByWalls";

/** Restrictions : affichées différemment des mots-clés. */
export const RESTRICTIONS: readonly Keyword[] = [
  "cantBlock",
  "cantAttack",
  "unblockable",
  "mustAttack",
  "doesntUntap",
  "cantBeBlockedByWalls",
];

export const KEYWORDS: readonly Keyword[] = [
  "flying",
  "reach",
  "firstStrike",
  "doubleStrike",
  "deathtouch",
  "lifelink",
  "trample",
  "vigilance",
  "haste",
  "menace",
  "defender",
  "flash",
  "hexproof",
  "indestructible",
];

export interface CardDef {
  /** Identifiant stable (slug du nom, ou "token:..." pour les jetons). */
  id: string;
  name: string;
  typeLine: string;
  manaCost: ManaCost | null;
  manaCostText: string;
  colors: Color[];
  supertypes: string[];
  types: CardType[];
  subtypes: string[];
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  /** Capacités des permanents (mana, activées). */
  abilities: AbilityDef[];
  /** Effet à la résolution d'un éphémère ou d'un rituel. */
  spell?: SpellDef;
  kicker?: ManaCost;
  /** Coût de flashback : peut être lancée depuis le cimetière, puis exilée (702.34). */
  flashback?: ManaCost;
  /** « En coût additionnel pour lancer ce sort, … » (601.2b, 601.2h). */
  additionalCost?: AdditionalCost;
  /** « Ce sort coûte {N} de moins à lancer [si…] » (601.2f). */
  costReduction?: { generic: Amount; condition?: Condition };
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  image?: string;
  artCrop?: string;
  /** false si la carte a des capacités que le moteur ne sait pas encore gérer. */
  implemented: boolean;
  /** Impression de référence (code de set, numéro de collection, rareté) : export des decklists, filtres. */
  set?: string;
  number?: string;
  rarity?: string;
  isToken?: boolean;
}

export interface SpellDef {
  /** Un seul mode = sort normal ; plusieurs = « Choisissez un — ». */
  modes: ModeDef[];
}

export interface ModeDef {
  label?: string;
  targets: TargetSpec[];
  effects: Effect[];
}

export type AbilityDef =
  | ManaAbilityDef
  | ActivatedAbilityDef
  | TriggeredAbilityDef
  | StaticAbilityDef
  | ReplacementAbilityDef
  | CostReductionAbilityDef
  | CastPermissionAbilityDef;

export interface AdditionalCost {
  discard?: number;
  sacrifice?: { filter: ObjectFilter; count: number };
}

/** « Les sorts de [filtre] que vous lancez coûtent {N} de moins. » */
export interface CostReductionAbilityDef {
  kind: "costReduction";
  filter: ObjectFilter;
  generic: number;
  label?: string;
}

export interface ManaAbilityDef {
  kind: "mana";
  cost: CostDef;
  /** Le joueur choisit l'un de ces types. */
  produce: ManaType[];
  amount: number;
  /** « {G} pour chaque Elfe que vous contrôlez » : le montant est le nombre de permanents correspondant. */
  amountPer?: ObjectFilter;
}

export interface ActivatedAbilityDef {
  kind: "activated";
  cost: CostDef;
  targets: TargetSpec[];
  effects: Effect[];
  sorcerySpeed?: boolean;
  label?: string;
  /** « N'activez cette capacité qu'une seule fois. » */
  once?: boolean;
  /** Capacité activée depuis le cimetière (« Renvoyez cette carte de votre cimetière… »). */
  fromGraveyard?: boolean;
}

export interface CostDef {
  mana?: ManaCost;
  tap?: boolean;
  sacrificeSelf?: boolean;
  /** Sacrifier d'autres permanents (choisis par le joueur). */
  sacrifice?: { filter: ObjectFilter; count: number };
  /** Retirer des marqueurs de la source. */
  removeCounters?: { kind: string; n: number };
  /** Engager d'autres permanents dégagés que vous contrôlez (choisis automatiquement). */
  tapOthers?: { filter: ObjectFilter; count: number };
  payLife?: number;
}

export interface TargetSpec {
  id: string;
  filter: TargetFilter;
  /** « jusqu'à une cible » */
  optional?: boolean;
  label?: string;
  /** Nombre de cibles pour ce mot « cible » (« jusqu'à deux créatures ciblées ») ; 1 par défaut. */
  count?: number;
  /** Toutes les cibles de ce mot « cible » appartiennent au même joueur (« d'un même cimetière »). */
  samePlayer?: boolean;
  /** Nombre de cibles si le sort est kické (« si ce sort a été kické, à la place n'importe quel nombre de cibles »). */
  kickedCount?: number;
  /** Ces cibles doivent être différentes de celles d'autres mots « cible » (« deux autres cibles »). */
  otherThan?: string[];
  /** Cibles contrôlées par des joueurs différents (« contrôlées par des joueurs différents »). */
  differentPlayers?: boolean;
}

export interface TargetFilter {
  players?: "any" | "you" | "opponent";
  objects?: ObjectFilter;
  /** Cartes dans un cimetière (« carte de créature ciblée de votre cimetière »). */
  cards?: { filter: ObjectFilter; whose?: "you" | "opponent" | "any" };
}

export interface ObjectFilter {
  /** L'objet doit avoir au moins un de ces types. */
  types?: CardType[];
  /** L'objet ne doit avoir aucun de ces types (« non-créature »…). */
  notTypes?: CardType[];
  subtype?: string;
  controller?: "you" | "opponent";
  keyword?: Keyword;
  notKeyword?: Keyword;
  /** « un autre » : exclut la source de la capacité. */
  other?: boolean;
  /** La source elle-même (« quand cette créature meurt, si ce n'était pas un Démon »). */
  self?: boolean;
  nontoken?: boolean;
  /** Force minimale (« créature de force 4 ou plus »). */
  minPower?: number;
  maxManaValue?: number;
  manaValue?: number;
  name?: string;
  tapped?: boolean;
  colors?: Color[];
  /** Porte au moins un marqueur de ce type. */
  withCounter?: string;
  /** Créature attaquante. */
  attacking?: boolean;
  /** Créature attaquante ou bloqueuse. */
  inCombat?: boolean;
  /** Au moins un de ces sous-types (« Chat ou Chien »…). */
  anySubtype?: string[];
  notSubtype?: string;
  minManaValue?: number;
  maxPower?: number;
  /** « de base » (terrain de base). */
  basic?: boolean;
  /** Carte permanente (hors pile) : artefact, créature, enchantement, terrain, planeswalker, bataille. */
  permanent?: boolean;
  nonland?: boolean;
  /** Au moins un de ces filtres (« artefact, enchantement ou créature avec le vol »). */
  anyOf?: ObjectFilter[];
  /** Valeur de mana inférieure ou égale à la force de la source (« … inférieure ou égale à la force d'Alesha »). */
  maxManaValueSourcePower?: boolean;
}

/**
 * Événement déclencheur (603). « self » : la source elle-même ; sinon un objet correspondant au filtre,
 * vu du contrôleur de la source.
 */
export type TriggerSpec =
  | { on: "enters"; who: "self" | ObjectFilter }
  | { on: "dies"; who: "self" | ObjectFilter }
  | { on: "leaves"; who: "self" }
  | { on: "attacks"; who: "self" | ObjectFilter }
  | { on: "dealsCombatDamage"; who: "self" | ObjectFilter; toPlayer?: boolean }
  | { on: "castSpell"; by: "you" | "opponent" | "any"; filter?: ObjectFilter }
  | { on: "step"; step: Step; whose: "you" | "opponent" | "any" }
  | { on: "landfall" }
  /** « Chaque fois que vous gagnez des points de vie [pour la première fois ce tour] » */
  | { on: "gainLife"; first?: boolean }
  /** « Chaque fois que vous piochez [votre deuxième carte ce tour] » ; `whose` relatif au contrôleur. */
  | { on: "draw"; whose: "you" | "opponent" | "any"; nth?: number }
  | { on: "loseLife"; whose: "you" | "opponent" | "any" }
  /** « Chaque fois que vous attaquez [avec au moins N créatures] » */
  | { on: "attackWith"; min?: number }
  /** « Chaque fois que des marqueurs sont placés sur … » */
  | { on: "countersPut"; who: "self" | ObjectFilter; kind?: string }
  /** Blessures infligées par une source (non de combat seulement si demandé), éventuellement à un adversaire. */
  | { on: "dealsDamage"; who: "self" | ObjectFilter; noncombatOnly?: boolean; toOpponent?: boolean };

/** Conditions (« if intermédiaire » 603.4, « tant que »…). */
export type Condition =
  | { kind: "attackedThisTurn" }
  | { kind: "creatureDiedThisTurn" }
  | { kind: "controls"; filter: ObjectFilter; atLeast?: number }
  /** Le sort qui met l'objet en jeu a été kické. */
  | { kind: "kicked" }
  | { kind: "lifeAtLeast"; amount: number }
  | { kind: "yourTurn" }
  | { kind: "opponentsTurn" }
  /** Seuil : au moins 7 cartes dans votre cimetière. */
  | { kind: "threshold" }
  /** La source a au moins N marqueurs de ce type. */
  | { kind: "counterAtLeast"; counter: string; n: number }
  /** Votre total de vie dépasse votre total de départ d'au moins `by`. */
  | { kind: "lifeAboveStart"; by: number }
  | { kind: "opponentLostLifeThisTurn" }
  | { kind: "not"; cond: Condition }
  /** Valeur mémorisée pendant la résolution (« si vous le faites », « si une carte de créature a été exilée »). */
  | { kind: "var"; name: string; atLeast?: number }
  | { kind: "all"; of: Condition[] }
  /** Le joueur désigné a exactement N points de vie (évalué pendant la résolution). */
  | { kind: "refLife"; ref: Ref; equals: number }
  /** Le permanent source est arrivé depuis un sort kické / lancé. */
  | { kind: "wasCast" };

/** Modifications apportées par un effet continu, rangées par couche (613). */
export interface LayerMods {
  /** Couche 6 : capacités (non mots-clés) accordées. */
  addAbilities?: AbilityDef[];
  /** Couche 4 : types et sous-types ajoutés. */
  addTypes?: CardType[];
  addSubtypes?: string[];
  /** Couche 5 : couleurs. */
  setColors?: Color[];
  /** Couche 6 : capacités (mots-clés) ajoutées ou retirées. */
  addKeywords?: Keyword[];
  removeKeywords?: Keyword[];
  loseAllAbilities?: boolean;
  /** Couche 7b : F/E fixées. */
  setPower?: number;
  setToughness?: number;
  /** Couche 7c : modifications de F/E. */
  power?: number;
  toughness?: number;
  /** Couche 7d : échange de F et E. */
  switchPT?: boolean;
}

/** Effet de remplacement porté par la carte elle-même (614.1c–d : « arrive engagé », « arrive avec… »). */
export interface ReplacementAbilityDef {
  kind: "replacement";
  entersTapped?: boolean;
  /** Nombre de marqueurs +1/+1 à l'arrivée (X du sort compris). */
  entersWithCounters?: Amount;
  /** Condition (raid, kicker…) évaluée au moment de l'arrivée. */
  condition?: Condition;
  /** S'applique aux autres permanents correspondant au filtre (vus du contrôleur de la source), pas à la source. */
  affects?: ObjectFilter;
  label?: string;
}

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export interface CastPermissionAbilityDef {
  kind: "castPermission";
  flash: true;
  label?: string;
}

/** Capacité statique : génère un effet continu tant que la source est sur le champ de bataille (604, 611.3). */
export interface StaticAbilityDef {
  kind: "static";
  /** « self » : la source elle-même ; sinon les permanents correspondant au filtre (vus du contrôleur). */
  affects: "self" | ObjectFilter;
  /** « tant que… » */
  condition?: Condition;
  mods: LayerMods;
  label?: string;
}

export interface TriggeredAbilityDef {
  kind: "triggered";
  trigger: TriggerSpec;
  /** Condition vérifiée au déclenchement et à la résolution. */
  condition?: Condition;
  targets: TargetSpec[];
  effects: Effect[];
  /** Capacité modale (« choisissez un — ») : le mode est choisi à la mise sur la pile. */
  modes?: ModeDef[];
  /** « Cette capacité ne se déclenche qu'une fois par tour. » */
  oncePerTurn?: boolean;
  label?: string;
}

/** Référence à un joueur ou à un objet, résolue au moment de l'effet. */
export type Ref =
  | { kind: "target"; id: string }
  | { kind: "self" }
  | { kind: "you" }
  | { kind: "eachOpponent" }
  | { kind: "eachPlayer" }
  /** L'objet de l'événement déclencheur (la créature qui arrive, meurt, attaque, le sort lancé…). */
  | { kind: "eventObject" }
  /** Le joueur de l'événement (joueur blessé, lanceur du sort…). */
  | { kind: "eventPlayer" }
  /** Le contrôleur (ou, hors du champ de bataille, le dernier contrôleur connu) de l'objet désigné. */
  | { kind: "controllerOf"; ref: Ref }
  /** Objets déplacés plus tôt pendant la résolution (`store` d'un déplacement), sous leur nouvel identifiant. */
  | { kind: "stored"; name: string };

export type Amount =
  | number
  | { kind: "x" }
  | { kind: "kicked"; yes: number; no: number }
  | { kind: "powerOf"; ref: Ref }
  /** Quantité de l'événement (blessures infligées, vie gagnée…). */
  | { kind: "eventAmount" }
  /** Nombre d'objets correspondant au filtre, vus du contrôleur (sur le champ de bataille par défaut). */
  | { kind: "count"; filter: ObjectFilter; zone?: "battlefield" | "graveyard" | "hand"; whose?: "you" | "opponents" | "all" }
  /** Vie gagnée par le contrôleur ce tour-ci. */
  | { kind: "lifeGainedThisTurn" }
  /** Marqueurs d'un type sur un objet. */
  | { kind: "countersOn"; ref: Ref; counter: string }
  /** Nombre de valeurs de mana différentes parmi les permanents non-terrains du contrôleur. */
  | { kind: "differentManaValues" }
  | { kind: "sum"; of: Amount[] }
  /** Force totale des permanents correspondant au filtre, vus du contrôleur. */
  | { kind: "totalPower"; filter: ObjectFilter }
  /** Valeur mémorisée pendant la résolution (vie perdue de cette façon, blessures en excès…). */
  | { kind: "var"; name: string }
  | { kind: "lifeTotal" }
  /** Nombre de cartes dans une zone du contrôleur. */
  | { kind: "cardsIn"; zone: "hand" | "graveyard" | "library" };

export interface TokenSpec {
  name: string;
  colors: Color[];
  types: CardType[];
  subtypes: string[];
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  abilities?: AbilityDef[];
  text?: string;
  legendary?: boolean;
  tapped?: boolean;
}

/** Destination d'un déplacement d'objet. */
export interface MoveSpec {
  to: "hand" | "battlefield" | "graveyard" | "exile" | "libraryTop" | "libraryBottom";
  tapped?: boolean;
  /** Sur le champ de bataille : sous le contrôle du contrôleur de l'effet (sinon du propriétaire). */
  underYourControl?: boolean;
  counters?: { kind: string; n: number };
  /** Types et sous-types ajoutés à l'objet (« c'est un Démon en plus de ses autres types »). */
  addTypes?: CardType[];
  addSubtypes?: string[];
  addKeywords?: Keyword[];
}

export type Effect =
  | { op: "damage"; amount: Amount; to: Ref; source?: Ref; storeExcess?: string }
  | { op: "fight"; a: Ref; b: Ref }
  | { op: "pump"; what: Ref; power: Amount; toughness: Amount; keywords?: Keyword[] }
  | { op: "pumpAll"; filter: ObjectFilter; power: Amount; toughness: Amount; keywords?: Keyword[] }
  /** Effet continu quelconque sur des objets (couches 4 à 7) : « devient 0/1 et perd toutes ses capacités »… */
  | { op: "modify"; what: Ref; mods: LayerMods; duration: "endOfTurn" | "permanent" }
  | { op: "destroy"; what: Ref }
  | { op: "draw"; who: Ref; amount: Amount }
  | { op: "gainLife"; who: Ref; amount: Amount }
  | { op: "createTokens"; token: TokenSpec; count: Amount; for?: Ref }
  /** Marqueurs (par défaut +1/+1) ; un montant négatif en retire. */
  | { op: "addCounters"; what: Ref; amount: Amount; kind?: string }
  | { op: "loseLife"; who: Ref; amount: Amount; store?: string }
  | { op: "bounce"; what: Ref }
  | { op: "exile"; what: Ref }
  | { op: "mill"; who: Ref; amount: Amount }
  /** Effets avec choix pendant la résolution. */
  | { op: "scry"; amount: Amount }
  | { op: "surveil"; amount: Amount }
  /** `chooser: "controller"` : le contrôleur de l'effet choisit dans la main révélée (« Pilfer »). */
  | { op: "discard"; who: Ref; amount: Amount; filter?: ObjectFilter; chooser?: "controller"; optional?: boolean; store?: string }
  | { op: "sacrifice"; who: Ref; filter: ObjectFilter; amount: Amount; optional?: boolean; store?: string }
  /** « Vous pouvez payer {X}. Si vous le faites, … » : les `skip` effets suivants sont ignorés sinon. */
  | { op: "mayPay"; cost: ManaCost; prompt: string; skip: number }
  /** « Vous pouvez » : si le contrôleur refuse, les `skip` effets suivants sont ignorés. */
  | { op: "may"; prompt: string; skip: number }
  /** « Si cette créature devait mourir ce tour-ci, exilez-la à la place. » */
  | { op: "exileIfDies"; what: Ref }
  /** « Prévenez toutes les blessures de combat qui devraient être infligées à … ce tour-ci. » */
  | { op: "preventCombatDamage"; what: Ref }
  /** Double le nombre de marqueurs +1/+1. */
  | { op: "doubleCounters"; what: Ref }
  | { op: "tap"; what: Ref; untap?: boolean }
  /** Blessures à chaque créature correspondant au filtre (et éventuellement à des joueurs). */
  | { op: "damageAll"; amount: Amount; filter?: ObjectFilter; players?: Ref }
  | { op: "destroyAll"; filter: ObjectFilter }
  | { op: "addCountersAll"; filter: ObjectFilter; amount: Amount; kind?: string }
  /** Effet continu « jusqu'à la fin du tour » sur tous les permanents correspondant au filtre. */
  | { op: "modifyAll"; filter: ObjectFilter; mods: LayerMods }
  /** Sacrifier un objet précis (jeton temporaire, « sacrifiez-la »). */
  | { op: "sacrificeIt"; what: Ref }
  /** Déplace un objet (retour en main, exil, retour du cimetière sur le champ de bataille…). */
  | { op: "moveTo"; what: Ref; spec: MoveSpec; store?: { name: string; filter?: ObjectFilter } }
  /** Double les marqueurs de chaque type (ou d'un type donné). */
  | { op: "doubleAllCounters"; what: Ref }
  /** Déplace tous les objets d'une zone correspondant au filtre. */
  | { op: "moveAll"; from: "battlefield" | "graveyard"; whose: Ref; filter: ObjectFilter; spec: MoveSpec }
  /** Si la condition est fausse, les `skip` effets suivants sont ignorés. */
  | { op: "if"; cond: Condition; skip: number }
  /**
   * Regarder les N cartes du dessus : en prendre jusqu'à `count` correspondant au filtre (vers `to`),
   * le reste va au-dessous (ordre aléatoire) ou au cimetière.
   */
  | {
      op: "lookAtTop";
      n: Amount;
      filter?: ObjectFilter;
      count: Amount;
      to: MoveSpec;
      rest: "bottom" | "graveyard" | "top";
      /** Valeur de mana maximale des cartes prises (évaluée à la résolution). */
      maxManaValue?: Amount;
    }
  /** Chercher dans sa bibliothèque jusqu'à `count` cartes correspondant au filtre, puis mélanger. */
  | { op: "search"; filter: ObjectFilter; count: Amount; to: MoveSpec }
  | { op: "shuffle"; who: Ref }
  /** Jeton copie d'un objet (valeurs copiables), avec d'éventuelles modifications. */
  | { op: "copyToken"; of: Ref; count?: Amount; addKeywords?: Keyword[]; sacrificeAtEndStep?: boolean }
  /** Capacité déclenchée retardée : « au début de la prochaine étape de fin, … ». Les références sont figées maintenant. */
  | { op: "delayed"; at: "nextEndStep"; effects: Effect[]; bind?: Record<string, Ref> }
  /** Capacité déclenchée réflexive (« quand vous le faites, … ») : ses cibles sont choisies à sa mise sur la pile. */
  | { op: "reflexive"; targets: TargetSpec[]; effects: Effect[] }
  /** Exile jusqu'à ce que la source quitte le champ de bataille (610.3). */
  | { op: "exileUntilLeaves"; what: Ref }
  /** Choisir des cartes (non ciblées) dans une zone du contrôleur et les déplacer. */
  | {
      op: "pickFromZone";
      zone: "graveyard" | "hand";
      filter: ObjectFilter;
      count: Amount;
      min?: number;
      to: MoveSpec;
      prompt?: string;
    }
  /** Le propriétaire met l'objet au-dessus ou au-dessous de sa bibliothèque. */
  | { op: "libraryTopOrBottom"; what: Ref }
  /** Chaque joueur désigné perd N points de vie à moins de défausser une carte ou de sacrifier un permanent. */
  | { op: "punisher"; who: Ref; loseLife: number; discard?: boolean; sacrifice?: ObjectFilter }
  /** Révéler jusqu'à une carte correspondant au filtre : elle va en main, le reste au-dessous dans un ordre aléatoire. */
  | { op: "revealUntil"; filter: ObjectFilter; to: MoveSpec };

// ---------------------------------------------------------------------------
// État de partie
// ---------------------------------------------------------------------------

export type PlayerId = string;
export type ObjectId = string;

/** "command" : zone de commandement (Commander, emblèmes). */
export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "stack" | "exile" | "command";

export type Step =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "beginCombat"
  | "declareAttackers"
  | "declareBlockers"
  | "firstStrikeDamage"
  | "combatDamage"
  | "endCombat"
  | "main2"
  | "end"
  | "cleanup";

export const STEPS: readonly Step[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
  "main2",
  "end",
  "cleanup",
];

export interface GameObject {
  /** Change à chaque changement de zone (règle 400.7). */
  id: ObjectId;
  /** Identité physique de la carte, stable entre les zones. Sert uniquement à l'affichage. */
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  tapped: boolean;
  damage: number;
  /** A reçu des blessures d'une source avec le contact mortel depuis la dernière vérification. */
  deathtouched: boolean;
  /** Marqueurs par nom : "+1/+1", "-1/-1", "stun", "loyalty"… */
  counters: Record<string, number>;
  /** Numéro du tour pendant lequel le contrôleur actuel en a pris le contrôle. */
  controlledSince: number;
  timestamp: number;
  isToken: boolean;
  /** Capacités « une seule fois » déjà activées (indices). */
  used?: number[];
  /** Permanent arrivé depuis un sort kické / depuis un sort lancé. */
  kicked?: boolean;
  cast?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  library: ObjectId[];
  hand: ObjectId[];
  graveyard: ObjectId[];
  command: ObjectId[];
  manaPool: Record<ManaType, number>;
  drewFromEmptyLibrary: boolean;
  lost: boolean;
  mulligans: number;
  /** Numéro du dernier tour commencé par ce joueur (0 s'il n'a pas encore joué). */
  lastTurnStarted: number;
  /** Total de vie de départ (conditions « au-dessus de votre total de départ »). */
  startingLife: number;
  turnStats: TurnStats;
}

export interface StackItem {
  /** Pour un sort : id de l'objet carte sur la pile. Pour une capacité : id propre. */
  id: string;
  kind: "spell" | "ability";
  controller: PlayerId;
  /** Sort : l'objet sur la pile. Capacité : le permanent source (peut avoir disparu). */
  sourceId: ObjectId;
  sourceDefId: string;
  abilityIndex: number;
  mode: number;
  targets: Record<string, string[]>;
  x: number;
  kicked: boolean;
  /** Informations de dernière connaissance de la source (capacités). */
  sourceSnapshot: { keywords: Keyword[]; power: number; controller: PlayerId };
  /** Capacité déclenchée : ce qui l'a déclenchée. */
  event?: TriggerEventData;
  /** Lancé avec le flashback : exilé au lieu d'aller au cimetière. */
  flashback?: boolean;
  /** Capacité retardée ou réflexive : ses effets et cibles propres. */
  inline?: InlineAbility;
}

/** Capacité créée pendant la partie (retardée, réflexive) : pas d'index dans la définition de sa source. */
export interface InlineAbility {
  targets: TargetSpec[];
  effects: Effect[];
  /** Références figées à la création (ex. « cette créature » exilée). */
  bound?: Record<string, string[]>;
  label?: string;
}

export interface DelayedTrigger {
  id: string;
  controller: PlayerId;
  sourceId: ObjectId;
  sourceDefId: string;
  at: "nextEndStep";
  /** Créé pendant une étape de fin ou le nettoyage : ne se déclenche qu'à l'étape de fin du tour suivant. */
  notBeforeTurn: number;
  ability: InlineAbility;
}

/** Statistiques du tour en cours, par joueur (conditions et déclencheurs « pour la première fois »). */
export interface TurnStats {
  lifeGained: number;
  lifeGainEvents: number;
  lifeLost: number;
  cardsDrawn: number;
  spellsCast: number;
}

export interface CombatState {
  attackers: { id: ObjectId; defender: PlayerId; blockers: ObjectId[]; blocked: boolean }[];
  blockers: { id: ObjectId; attacker: ObjectId }[];
  /** Créatures ayant infligé des blessures lors de l'étape de blessures d'initiative. */
  firstStrikers: ObjectId[];
  /** Joueurs défenseurs qui doivent encore déclarer leurs bloqueurs (ordre APNAP). */
  blockQueue: PlayerId[];
  /** Étape de blessures en cours de préparation (répartition des blessures par les attaquants). */
  damageStep: "first" | "regular" | null;
  /** Attaquants dont le contrôleur doit encore répartir les blessures. */
  assignQueue: ObjectId[];
  /** Répartitions choisies : attaquant → (cible → blessures). */
  assignments: Record<ObjectId, Record<string, number>>;
}

export type CreatedReplacement =
  | { id: string; kind: "exileIfDies"; objects: ObjectId[] }
  | { id: string; kind: "preventCombatDamage"; objects: ObjectId[] };

/** Données de l'événement qui a déclenché une capacité. */
export interface TriggerEventData {
  /** Objet concerné (ancien identifiant s'il a changé de zone). */
  objectId?: ObjectId;
  /** Nouvel identifiant de cet objet après son changement de zone. */
  newObjectId?: ObjectId;
  player?: PlayerId;
  amount?: number;
}

/** Capacité déclenchée en attente d'être mise sur la pile (603.3). */
export interface PendingTrigger {
  id: string;
  sourceId: ObjectId;
  sourceDefId: string;
  abilityIndex: number;
  controller: PlayerId;
  sourceSnapshot: { keywords: Keyword[]; power: number; controller: PlayerId };
  event: TriggerEventData;
  /** Cibles choisies au fil des questions (603.3d). */
  targets: Record<string, string[]>;
  /** Ordre de résolution déjà choisi par son contrôleur. */
  ordered?: boolean;
  /** Capacité modale : mode choisi. */
  mode?: number;
  /** Capacité retardée ou réflexive. */
  inline?: InlineAbility;
}

/** Caractéristiques d'un objet au moment où il a quitté le champ de bataille (dernières informations connues). */
export interface LkiSnapshot {
  id: ObjectId;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  toughness: number;
  keywords: Keyword[];
  isToken: boolean;
  attacking?: boolean;
  blocking?: boolean;
  name?: string;
  manaValue?: number;
  tapped?: boolean;
  /** Capacités effectives (imprimées ou accordées) au moment de l'instantané. */
  abilities?: AbilityDef[];
  counters?: Record<string, number>;
}

/** Résolution en cours d'un sort ou d'une capacité, éventuellement suspendue sur un choix. */
export interface Resolution {
  item: StackItem;
  effects: Effect[];
  /** Indice de l'effet en cours. */
  pc: number;
  controller: PlayerId;
  targets: Record<string, string[]>;
  /** Réponses aux choix déjà faits, par clé. */
  vars: Record<string, ChoiceValue[]>;
  /** Clé du choix attendu. */
  awaiting: string | null;
}

/** Effet continu issu de la résolution d'un sort ou d'une capacité. */
export interface ContinuousEffect extends LayerMods {
  id: string;
  timestamp: number;
  /** Ensemble d'objets verrouillé à la résolution (règle 611.2c). */
  affected: ObjectId[];
  /** « jusqu'à la fin du tour », ou tant que les objets restent sur le champ de bataille. */
  duration: "endOfTurn" | "permanent";
}

export type Flow = "mulligan" | "stepStart" | "tba" | "priority" | "resolving" | "stepEnd" | "over";

export interface GameState {
  /** Incrémenté à chaque changement pouvant affecter les caractéristiques (invalide le cache des couches). */
  version: number;
  rng: number;
  nextId: number;
  timestamp: number;
  defs: Record<string, CardDef>;
  objects: Record<ObjectId, GameObject>;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  battlefield: ObjectId[];
  exile: ObjectId[];
  stack: StackItem[];
  turn: {
    number: number;
    active: PlayerId;
    step: Step;
    landsPlayed: number;
    attacked: boolean;
    /** Une créature est morte ce tour-ci (morbide). */
    creatureDied: boolean;
    /** Capacités « une fois par tour » déjà déclenchées (source:index). */
    onceFired: string[];
    startingPlayer: PlayerId;
  };
  flow: Flow;
  priority: { holder: PlayerId; passes: number };
  combat: CombatState | null;
  effects: ContinuousEffect[];
  pending: PendingDecision | null;
  mulliganQueue: PlayerId[];
  resolving: Resolution | null;
  /** Effets de remplacement et de prévention créés par des résolutions (jusqu'à la fin du tour). */
  replacements: CreatedReplacement[];
  /** Capacités déclenchées en attente d'être mises sur la pile. */
  triggers: PendingTrigger[];
  /** Capacités déclenchées retardées en attente de leur moment. */
  delayed: DelayedTrigger[];
  /** Cartes exilées « jusqu'à ce que [la source] quitte le champ de bataille ». */
  linkedExile: { sourceId: ObjectId; cards: ObjectId[] }[];
  /** Dernières informations connues, par ancien identifiant (purgées à la fin de chaque étape). */
  lki: Record<ObjectId, LkiSnapshot>;
  winner: PlayerId | null;
  over: boolean;
}

// ---------------------------------------------------------------------------
// Décisions
// ---------------------------------------------------------------------------

export type PendingDecision =
  | { kind: "mulligan"; player: PlayerId; mulligans: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  | { kind: "priority"; player: PlayerId }
  | { kind: "declareAttackers"; player: PlayerId }
  | { kind: "declareBlockers"; player: PlayerId }
  | { kind: "discard"; player: PlayerId; count: number }
  | { kind: "choice"; player: PlayerId; request: ChoiceRequest; purpose: ChoicePurpose };

// ---------------------------------------------------------------------------
// Choix génériques : toute question posée à un joueur passe par ce modèle,
// que l'interface sait afficher une fois pour toutes.
// ---------------------------------------------------------------------------

export type ChoiceValue = string | number;

export type ChoiceIntent =
  | "scryBottom"
  | "scryOrder"
  | "surveilGraveyard"
  | "discard"
  | "sacrifice"
  | "may"
  | "combatDamage"
  | "legend"
  | "triggerOrder"
  | "triggerTarget"
  | "triggerMode"
  | "lookAtTop"
  | "search"
  | "pickCards"
  | "topOrBottom"
  | "punisher"
  | "other";

interface ChoiceBase {
  prompt: string;
  /** À quoi sert ce choix (utile à l'IA et à l'interface). */
  intent: ChoiceIntent;
  /** Réponse proposée par le moteur, toujours valide : autopilot, repli de l'IA, pré-remplissage. */
  suggested: ChoiceValue[];
  /** L'autopilot peut répondre avec `suggested` (hors contrôle total). */
  autoOk?: boolean;
  /** Libellés des options qui ne sont ni des objets ni des joueurs (ex. capacités déclenchées). */
  labels?: Record<string, string>;
}

export type ChoiceRequest = ChoiceBase &
  (
    | {
        type: "pick";
        options: string[];
        min: number;
        max: number;
        /** Contrainte entre les options choisies : même joueur ou joueurs différents (joueur de chaque option). */
        group?: { kind: "same" | "different"; holders: Record<string, string> };
      }
    | { type: "number"; min: number; max: number }
    | { type: "order"; items: string[] }
    | { type: "yesNo" }
    | {
        type: "divide";
        among: string[];
        total: number;
        /** Contrainte de piétinement : le joueur ne reçoit des blessures que si chaque bloqueur a reçu ses blessures mortelles. */
        lethal?: { player: string; needs: Record<string, number> };
      }
  );

export type ChoicePurpose =
  | { kind: "effect" }
  | { kind: "combatDamage"; attacker: ObjectId }
  | { kind: "legend" }
  | { kind: "triggerOrder"; player: PlayerId }
  | { kind: "triggerTarget"; trigger: string; spec: string }
  | { kind: "triggerMode"; trigger: string };

export interface CastChoices {
  mode?: number;
  targets?: Record<string, string[]>;
  x?: number;
  kicked?: boolean;
  /** Coûts additionnels : cartes défaussées, permanents sacrifiés. */
  discard?: ObjectId[];
  sacrifice?: ObjectId[];
}

export type Decision =
  | { type: "keep" }
  | { type: "mulligan" }
  | { type: "bottom"; cards: ObjectId[] }
  | { type: "pass" }
  | { type: "playLand"; card: ObjectId }
  | ({ type: "cast"; card: ObjectId } & CastChoices)
  | ({ type: "activate"; source: ObjectId; ability: number } & CastChoices)
  | { type: "tapForMana"; source: ObjectId; ability: number; color?: ManaType }
  | { type: "declareAttackers"; attackers: { id: ObjectId; defender: PlayerId }[] }
  | { type: "declareBlockers"; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: "discard"; cards: ObjectId[] }
  | { type: "choose"; values: ChoiceValue[] }
  | { type: "concede" };

export interface TargetOption {
  id: string;
  label?: string;
  optional: boolean;
  legal: string[];
  /** Nombre maximal de cibles pour ce mot « cible » (1 par défaut). */
  count?: number;
  /** Contrainte entre les cibles : même joueur, ou joueurs différents (avec le joueur de chaque cible). */
  group?: { kind: "same" | "different"; holders: Record<string, string> };
  kickedCount?: number;
  otherThan?: string[];
}

export interface ModeOption {
  index: number;
  label?: string;
  targets: TargetOption[];
}

export type ActionOption =
  | { type: "pass" }
  | { type: "playLand"; card: ObjectId }
  | {
      type: "cast";
      card: ObjectId;
      modes: ModeOption[];
      xMax: number | null;
      kickerAffordable: boolean;
      /** Lancée depuis le cimetière grâce au flashback. */
      fromGraveyard?: boolean;
      additional?: { discard?: { count: number; options: ObjectId[] }; sacrifice?: { count: number; options: ObjectId[] } };
    }
  | {
      type: "activate";
      source: ObjectId;
      ability: number;
      label?: string;
      targets: TargetOption[];
      xMax: number | null;
      additional?: { sacrifice?: { count: number; options: ObjectId[] } };
    }
  | { type: "tapForMana"; source: ObjectId; ability: number; colors: ManaType[] };

// ---------------------------------------------------------------------------
// Événements (journal, animations)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "gameStart"; startingPlayer: PlayerId }
  | { type: "mulligan"; player: PlayerId; count: number }
  | { type: "keep"; player: PlayerId; handSize: number }
  | { type: "turnStart"; turn: number; player: PlayerId }
  | { type: "step"; step: Step }
  | { type: "draw"; player: PlayerId; objectId?: ObjectId; defId?: string }
  | { type: "playLand"; player: PlayerId; objectId: ObjectId; defId: string }
  | { type: "cast"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "activate"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "resolve"; stackId: string; defId: string }
  | { type: "fizzle"; stackId: string; defId: string }
  | { type: "damage"; sourceDefId: string; target: string; targetDefId?: string; amount: number; combat: boolean }
  | { type: "life"; player: PlayerId; delta: number; life: number }
  | { type: "dies"; objectId: ObjectId; defId: string; to: Zone }
  | { type: "destroy"; objectId: ObjectId; defId: string }
  | { type: "token"; objectId: ObjectId; defId: string; controller: PlayerId }
  | { type: "attack"; player: PlayerId; attackers: { id: ObjectId; defId: string }[] }
  | {
      type: "block";
      player: PlayerId;
      blocks: { blocker: ObjectId; attacker: ObjectId; blockerDefId: string; attackerDefId: string }[];
    }
  | { type: "discard"; player: PlayerId; defIds: string[] }
  | { type: "moved"; objectId: ObjectId; defId: string; from: Zone; to: Zone }
  | { type: "scry"; player: PlayerId; top: number; bottom: number }
  | { type: "choice"; player: PlayerId; intent: ChoiceIntent }
  | { type: "trigger"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "lose"; player: PlayerId; reason: "life" | "draw" | "concede" }
  | { type: "gameOver"; winner: PlayerId | null };
