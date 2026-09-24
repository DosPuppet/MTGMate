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

export type AbilityDef = ManaAbilityDef | ActivatedAbilityDef;

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
  controller?: "you" | "opponent";
  keyword?: Keyword;
  notKeyword?: Keyword;
}

/** Référence à un joueur ou à un objet, résolue au moment de l'effet. */
export type Ref = { kind: "target"; id: string } | { kind: "self" } | { kind: "you" } | { kind: "eachOpponent" };

export type Amount = number | { kind: "x" } | { kind: "kicked"; yes: number; no: number } | { kind: "powerOf"; ref: Ref };

export interface TokenSpec {
  name: string;
  colors: Color[];
  types: CardType[];
  subtypes: string[];
  power: number;
  toughness: number;
  keywords?: Keyword[];
}

export type Effect =
  | { op: "damage"; amount: Amount; to: Ref; source?: Ref }
  | { op: "fight"; a: Ref; b: Ref }
  | { op: "pump"; what: Ref; power: Amount; toughness: Amount; keywords?: Keyword[] }
  | { op: "pumpAll"; filter: ObjectFilter; power: Amount; toughness: Amount; keywords?: Keyword[] }
  | { op: "destroy"; what: Ref }
  | { op: "draw"; who: Ref; amount: Amount }
  | { op: "gainLife"; who: Ref; amount: Amount }
  | { op: "createTokens"; token: TokenSpec; count: Amount }
  | { op: "addCounters"; what: Ref; amount: Amount };

// ---------------------------------------------------------------------------
// État de partie
// ---------------------------------------------------------------------------

export type PlayerId = string;
export type ObjectId = string;

export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "stack" | "exile";

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
  manaPool: Record<ManaType, number>;
  drewFromEmptyLibrary: boolean;
  lost: boolean;
  mulligans: number;
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
}

export interface CombatState {
  attackers: { id: ObjectId; defender: PlayerId; blockers: ObjectId[]; blocked: boolean }[];
  blockers: { id: ObjectId; attacker: ObjectId }[];
  /** Créatures ayant infligé des blessures lors de l'étape de blessures d'initiative. */
  firstStrikers: ObjectId[];
}

export interface ContinuousEffect {
  id: string;
  timestamp: number;
  /** Ensemble d'objets verrouillé à la résolution (règle 611.2c). */
  affected: ObjectId[];
  power: number;
  toughness: number;
  addKeywords: Keyword[];
  duration: "endOfTurn";
}

export type Flow = "mulligan" | "stepStart" | "tba" | "priority" | "stepEnd" | "over";

export interface GameState {
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
    startingPlayer: PlayerId;
  };
  flow: Flow;
  priority: { holder: PlayerId; passes: number };
  combat: CombatState | null;
  effects: ContinuousEffect[];
  pending: PendingDecision | null;
  mulliganQueue: PlayerId[];
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
  | { kind: "discard"; player: PlayerId; count: number };

export interface CastChoices {
  mode?: number;
  targets?: Record<string, string[]>;
  x?: number;
  kicked?: boolean;
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
  | { type: "cast"; card: ObjectId; modes: ModeOption[]; xMax: number | null; kickerAffordable: boolean }
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
  | { type: "lose"; player: PlayerId; reason: "life" | "draw" | "concede" }
  | { type: "gameOver"; winner: PlayerId | null };
