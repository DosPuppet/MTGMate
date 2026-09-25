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
  | "indestructible";

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
  | CostReductionAbilityDef;

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
}

export interface ActivatedAbilityDef {
  kind: "activated";
  cost: CostDef;
  targets: TargetSpec[];
  effects: Effect[];
  sorcerySpeed?: boolean;
  label?: string;
}

export interface CostDef {
  mana?: ManaCost;
  tap?: boolean;
  sacrificeSelf?: boolean;
}

export interface TargetSpec {
  id: string;
  filter: TargetFilter;
  /** « jusqu'à une cible » */
  optional?: boolean;
  label?: string;
}

export interface TargetFilter {
  players?: "any" | "you" | "opponent";
  objects?: ObjectFilter;
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
  nontoken?: boolean;
  /** Force minimale (« créature de force 4 ou plus »). */
  minPower?: number;
  /** Créature attaquante. */
  attacking?: boolean;
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
  | { on: "gainLife" };

/** Conditions (« if intermédiaire » 603.4, « tant que »…). */
export type Condition =
  | { kind: "attackedThisTurn" }
  | { kind: "creatureDiedThisTurn" }
  | { kind: "controls"; filter: ObjectFilter; atLeast?: number }
  /** Le sort qui met l'objet en jeu a été kické. */
  | { kind: "kicked" }
  | { kind: "lifeAtLeast"; amount: number };

/** Modifications apportées par un effet continu, rangées par couche (613). */
export interface LayerMods {
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
  label?: string;
}

/** Référence à un joueur ou à un objet, résolue au moment de l'effet. */
export type Ref =
  | { kind: "target"; id: string }
  | { kind: "self" }
  | { kind: "you" }
  | { kind: "eachOpponent" }
  /** L'objet de l'événement déclencheur (la créature qui arrive, meurt, attaque, le sort lancé…). */
  | { kind: "eventObject" }
  /** Le joueur de l'événement (joueur blessé, lanceur du sort…). */
  | { kind: "eventPlayer" };

export type Amount =
  | number
  | { kind: "x" }
  | { kind: "kicked"; yes: number; no: number }
  | { kind: "powerOf"; ref: Ref }
  /** Quantité de l'événement (blessures infligées, vie gagnée…). */
  | { kind: "eventAmount" }
  /** Nombre de permanents correspondant au filtre, vus du contrôleur. */
  | { kind: "count"; filter: ObjectFilter }
  /** Force totale des permanents correspondant au filtre, vus du contrôleur. */
  | { kind: "totalPower"; filter: ObjectFilter };

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
}

export type Effect =
  | { op: "damage"; amount: Amount; to: Ref; source?: Ref }
  | { op: "fight"; a: Ref; b: Ref }
  | { op: "pump"; what: Ref; power: Amount; toughness: Amount; keywords?: Keyword[] }
  | { op: "pumpAll"; filter: ObjectFilter; power: Amount; toughness: Amount; keywords?: Keyword[] }
  /** Effet continu quelconque sur des objets (couches 4 à 7) : « devient 0/1 et perd toutes ses capacités »… */
  | { op: "modify"; what: Ref; mods: LayerMods; duration: "endOfTurn" | "permanent" }
  | { op: "destroy"; what: Ref }
  | { op: "draw"; who: Ref; amount: Amount }
  | { op: "gainLife"; who: Ref; amount: Amount }
  | { op: "createTokens"; token: TokenSpec; count: Amount }
  | { op: "addCounters"; what: Ref; amount: Amount }
  | { op: "loseLife"; who: Ref; amount: Amount }
  | { op: "bounce"; what: Ref }
  | { op: "exile"; what: Ref }
  | { op: "mill"; who: Ref; amount: Amount }
  /** Effets avec choix pendant la résolution. */
  | { op: "scry"; amount: Amount }
  | { op: "surveil"; amount: Amount }
  | { op: "discard"; who: Ref; amount: Amount }
  | { op: "sacrifice"; who: Ref; filter: ObjectFilter; amount: Amount }
  /** « Vous pouvez » : si le contrôleur refuse, les `skip` effets suivants sont ignorés. */
  | { op: "may"; prompt: string; skip: number }
  /** « Si cette créature devait mourir ce tour-ci, exilez-la à la place. » */
  | { op: "exileIfDies"; what: Ref }
  /** « Prévenez toutes les blessures de combat qui devraient être infligées à … ce tour-ci. » */
  | { op: "preventCombatDamage"; what: Ref }
  /** Double le nombre de marqueurs +1/+1. */
  | { op: "doubleCounters"; what: Ref };

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
  counters: { p1p1: number; m1m1: number };
  /** Numéro du tour pendant lequel le contrôleur actuel en a pris le contrôle. */
  controlledSince: number;
  timestamp: number;
  isToken: boolean;
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
    | { type: "pick"; options: string[]; min: number; max: number }
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
  | { kind: "triggerTarget"; trigger: string; spec: string };

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
  | { type: "activate"; source: ObjectId; ability: number; label?: string; targets: TargetOption[]; xMax: number | null }
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
