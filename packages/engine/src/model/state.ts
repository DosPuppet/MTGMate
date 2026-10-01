/** Types du moteur — État de partie : objets, joueurs, pile, combat, déclencheurs en attente. Réexportés par `types.ts`. */
import type {
  AbilityDef,
  CardDef,
  CardType,
  ChoiceValue,
  Color,
  Condition,
  Effect,
  Keyword,
  LayerMods,
  ManaCost,
  ManaRestriction,
  ManaType,
  PendingDecision,
  PlayerStaticAbilityDef,
  TargetSpec,
} from "../types";

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
  /** Cartes liées par leur identité physique (The Darkness Crystal : « exilée avec »). */
  linkedUids?: string[];
  /** Hôte auquel il était attaché avant d'être détaché par une action basée sur l'état (Zack Fair). */
  lastAttachedTo?: ObjectId;
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
  /**
   * Couche 2 : contrôleur en l'absence d'effet de contrôle (qui a mis le permanent sur le champ de bataille, 110.2).
   * Fixé à l'arrivée ; `controller` est la valeur calculée par `syncControl` (control.ts).
   */
  baseController?: PlayerId;
  timestamp: number;
  isToken: boolean;
  /** Capacités « une seule fois » déjà activées (indices). */
  used?: number[];
  /** Permanent arrivé depuis un sort kické / depuis un sort lancé. */
  kicked?: boolean;
  cast?: boolean;
  /** Aura ou Équipement : le permanent auquel il est attaché (301.5, 303.4). */
  attachedTo?: ObjectId;
  /** Tour de la dernière activation d'une capacité de loyauté (606.3 : une par tour). */
  loyaltyTurn?: number;
  /** Choix faits en arrivant (type de créature, couleur, nom de carte). */
  chosen?: { creatureType?: string; color?: Color; cardName?: string; landType?: string; parity?: "odd" | "even"; mode?: string };
  /** Arrivé depuis un sort lancé depuis la main (Myojin). */
  castFromHand?: boolean;
  /** Lancé depuis le cimetière (Undead Sprinter : « si vous le faites, elle arrive avec un marqueur +1/+1 »). */
  castFromGraveyard?: boolean;
  /** Lancé depuis l'exil (Extraordinary Journey). */
  castFromExile?: boolean;
  /** Préparé (Reality Fracture) : identifiant de la copie de son sort, en exil. */
  preparedCopy?: ObjectId;
  /** Copie d'un sort préparé (en exil puis sur la pile) : le permanent qui l'a préparée. Cesse d'exister hors de ces zones. */
  preparedFor?: ObjectId;
  /** Face active d'une carte à plusieurs faces (aventure lancée, verso…) : ses caractéristiques remplacent celles de la carte. */
  faceDefId?: string;
  /**
   * Face cachée (708) : l'objet a la définition générique « face cachée » (créature 2/2 sans nom) ; la vraie carte,
   * la garde {2} (déguisement, cape) et les coûts pour la retourner face visible sont gardés ici.
   */
  faceDown?: { card: string; ward: boolean; upCosts: ManaCost[] };
  /** Distorsion : le permanent a été lancé pour son coût de distorsion ; carte exilée par la distorsion (tour de l'exil). */
  warped?: boolean;
  /** Imminence (702.176) : lancé pour son coût d'imminence ; ce n'est pas une créature tant qu'il a un marqueur de temps. */
  impending?: boolean;
  /** Tour où la carte a été défaussée (Chaos / Mayhem : « si vous l'avez défaussée ce tour-ci »). */
  discardedTurn?: number;
  /** Exploité (Harness, Marvel Super Heroes) : ses capacités ∞ sont actives. */
  harnessed?: boolean;
  /** Évocation (702.74) : lancé pour son coût d'évocation (sacrifié en arrivant). */
  evoked?: boolean;
  /** Mana dépensé pour le lancer, par type (« si {U}{U} a été dépensé pour le lancer », Deceit). */
  spentColors?: Partial<Record<ManaType, number>>;
  warpExiledTurn?: number;
  /** Mana dépensé pour lancer ce sort ou ce permanent (Astelli Reclaimer, Unravel). */
  manaSpent?: number;
  /** Mana produit par des Cavernes dépensé pour le lancer (Bat Colony). */
  caveMana?: number;
  /** Monture (702.171) : tour pendant lequel elle a été montée (« sellée »). */
  saddledTurn?: number;
  /** Épuisé : ne se dégage pas lors de la prochaine étape de dégagement de son contrôleur. */
  exerted?: boolean;
  /** Classe (716) : niveau actuel (1 par défaut). */
  classLevel?: number;
  /** Affaire (719) : résolue. */
  solved?: boolean;
  /** Salle (709.5) : portes déverrouillées (indices des faces). */
  unlocked?: number[];
  /** Permanent assemblé (701.42) : les deux cartes qui le forment ; il redevient ces cartes en quittant le champ de bataille. */
  melded?: { defId: string; uid: string }[];
  /** Carte « en aventure » (715.4) : exilée après la résolution de son aventure ; son propriétaire peut lancer la créature. */
  onAdventure?: boolean;
  /** Copie d'une carte (Uldaros) : quitte l'exil seulement pour la pile ; devient un jeton sur le champ de bataille. */
  cardCopy?: boolean;
  /** Emblème temporaire : disparaît au début du prochain tour de ce joueur. */
  expiresAtTurnOf?: PlayerId;
  /** Emblème qui disparaît à la fin du tour. */
  expiresEndOfTurn?: boolean;
  /** A déjà infligé des blessures de combat (Ruric Thar). */
  dealtCombatDamage?: boolean;
  /** Carte exilée suspendue (702.62) : un marqueur de temps est retiré à chaque entretien de son propriétaire. */
  suspended?: boolean;
  /** Tour où des marqueurs ont été mis sur lui pour la dernière fois (« la première fois ce tour-ci »). */
  countersPutTurn?: number;
  /** A déjà infligé des blessures, de combat ou non (Karakyk Guardian). */
  dealtDamage?: boolean;
  /** Tour de sa dernière attaque (« créature qui a attaqué ce tour-ci »). */
  attackedTurn?: number;
  /** Cartes liées (exilées par cette carte, Hoarding Dragon). */
  linked?: ObjectId[];
  /** X du sort qui a mis ce permanent sur le champ de bataille (Dune Drifter). */
  castX?: number;
  /** Plot : tour où la carte est devenue « complotée » (exilée face visible, lançable gratuitement plus tard). */
  plottedTurn?: number;
  /** Créatures qui ont monté ou équipé ce permanent (coût payé ce tour-ci). */
  crewedBy?: { turn: number; ids: ObjectId[] };
  /** Sources qui lui ont infligé des blessures ce tour-ci (Predator Ooze). */
  damagedBy?: ObjectId[];
  /** Joueurs à qui il a infligé des blessures de combat ce tour-ci (Steel Hellkite). */
  combatDamagedPlayers?: PlayerId[];
  /** Tour de la dernière activation « une fois par tour », par indice de capacité. */
  activatedTurn?: Record<number, number>;
  /** Modes déjà choisis (Demonic Pact). */
  usedModes?: number[];
  /** Tour auquel se rapportent `usedModes` pour les modes uniques « ce tour-ci ». */
  usedModesTurn?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  /** Blessures non de combat subies au tour précédent (Command the Stage). */
  noncombatDamageLastTurn?: number;
  library: ObjectId[];
  hand: ObjectId[];
  graveyard: ObjectId[];
  command: ObjectId[];
  manaPool: Record<ManaType, number>;
  /** Mana restreint de la réserve, une entrée par mana (Ashling, Rimebound : « seulement pour des sorts de VM 4 ou plus »). */
  restrictedMana?: { type: ManaType; restriction: ManaRestriction }[];
  drewFromEmptyLibrary: boolean;
  lost: boolean;
  mulligans: number;
  /** Numéro du dernier tour commencé par ce joueur (0 s'il n'a pas encore joué). */
  lastTurnStarted: number;
  /** Total de vie de départ (conditions « au-dessus de votre total de départ »). */
  startingLife: number;
  turnStats: TurnStats;
  /** Marqueurs poison (104.3d : 10 ou plus, le joueur perd). */
  poison?: number;
  /** Nombre de tours commencés par ce joueur (Jace Reawakened). */
  turnsTaken?: number;
  /** Vitesse (702.179) : absente tant qu'aucun « Start your engines! » ne l'a démarrée ; 4 = vitesse maximale. */
  speed?: number;
  /** Mana qui ne se vide pas avant la fin du tour (Savage Ventmaw). */
  manaKeep?: Partial<Record<ManaType, number>>;
}

/**
 * Effet sur un joueur, créé par une résolution (« ce tour-ci, vous pouvez jouer un terrain de plus », « vous ne pouvez
 * plus gagner de points de vie ») : une statique de joueur ordinaire, lue par `playerStatic` (statics.ts) comme si le
 * joueur la contrôlait. `until` : dernier tour où elle s'applique (null : toute la partie) ; `once` : retirée à son
 * premier usage (`consumePlayerEffect`).
 */
export interface PlayerEffect {
  id: string;
  player: PlayerId;
  ability: PlayerStaticAbilityDef;
  until: number | null;
  once?: boolean;
}

export interface StackItem {
  /** Pour un sort : id de l'objet carte sur la pile. Pour une capacité : id propre. */
  id: string;
  /** Esper Origins : après la résolution, exilé puis mis sur le champ de bataille transformé avec un marqueur de finalité. */
  toBattlefieldTransformed?: boolean;
  /** Modifications à l'arrivée du permanent (Torgal, Summon: Fenrir, Summon: Brynhildr, Noctis). */
  arrival?: { counters?: { kind: string; n: number }[]; haste?: boolean; subtypes?: string[] };
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
  /** Aventure lancée : exilée « en aventure » après sa résolution. */
  adventure?: boolean;
  /** Lancé pour son coût de distorsion : le permanent sera exilé à la prochaine étape de fin. */
  warped?: boolean;
  /** Cartes défaussées pour payer un coût additionnel (Grab the Prize). */
  discarded?: ObjectId[];
  /** Cartes exilées pour payer un coût additionnel (Fear of Abduction : liées au permanent). */
  costExiled?: ObjectId[];
  /** Lancé pour son coût d'imminence : le permanent arrive avec N marqueurs de temps. */
  impending?: boolean;
  /** Mana dépensé pour le lancer. */
  manaSpent?: number;
  /** Lancé pour son coût d'évocation. */
  evoked?: boolean;
  /** Lancé pour son coût de faufilement (Sneak). */
  sneaked?: boolean;
  /** Mana dépensé pour le lancer, par type. */
  spentColors?: Partial<Record<ManaType, number>>;
  /** Dont le mana produit par des Cavernes (Bat Colony). */
  caveMana?: number;
  /** Sources dont le mana a servi à le lancer (« en utilisant du mana produit par [cette source] »). */
  manaSources?: ObjectId[];
  /** Lancé depuis l'exil (Quintorius Kand). */
  fromExile?: boolean;
  /** Rebond (702.88, accordé par Ojer Pakpatiq). */
  rebound?: boolean;
  /** Exilé en se résolvant au lieu d'aller au cimetière, avec ce marqueur s'il est nommé (Goliath Daydreamer : « rêve »). */
  exileWithCounter?: string;
  /** Lilah : exilé et comploté au lieu d'aller au cimetière. */
  plotOnResolve?: boolean;
  /** Capacité retardée ou réflexive : ses effets et cibles propres. */
  inline?: InlineAbility;
  /**
   * Copie d'un sort ou d'une capacité (707.10). Une copie de sort est un objet sur la pile (`cardCopy`), sans carte :
   * elle cesse d'exister en quittant la pile, sauf une copie de sort de permanent, qui devient un jeton.
   */
  copy?: boolean;
  /**
   * Choix qui restent à annoncer avant la prochaine priorité (`announceNext`, stack.ts) : nouvelles cibles d'une copie
   * (707.10c), une étape par mot « cible » puis `announce` (« devient la cible ») ; répartition (601.2d, 603.3d).
   */
  pendingChoices?: PendingStackChoice[];
  /** Répartition annoncée (601.2d) : par mot « cible », la part de chaque cible, dans l'ordre des cibles. */
  division?: Record<string, number[]>;
  /** « Ce sort ne peut pas être contrecarré » (accordé au lancement). */
  uncounterable?: boolean;
  /** Permanents sacrifiés pour le coût (dernières informations connues disponibles). */
  sacrificed?: ObjectId[];
  /** Permanents engagés pour payer le coût (station). */
  tappedForCost?: ObjectId[];
  /** Effets de mana dépensé (Carnelian Orb, Pyromancer's Goggles). */
  riders?: ("haste" | "copy" | "uncounterable")[];
  /** Sort lancé depuis la main. */
  fromHand?: boolean;
  /** Lancé depuis le cimetière (Undead Sprinter). */
  fromGraveyard?: boolean;
}

/** Choix d'un élément de pile qui reste à faire (voir `StackItem.pendingChoices`). */
export type PendingStackChoice = { step: "target"; spec: string } | { step: "announce" } | { step: "divide" };

/** Capacité créée pendant la partie (retardée, réflexive) : pas d'index dans la définition de sa source. */
export interface InlineAbility {
  targets: TargetSpec[];
  effects: Effect[];
  /** Références figées à la création (ex. « cette créature » exilée). */
  bound?: Record<string, string[]>;
  /** Valeurs figées à la création (ex. nombre de marqueurs de la créature morte). */
  vars?: Record<string, ChoiceValue[]>;

  label?: string;
}

/** Moment d'une capacité retardée : prochaine étape de fin, étape de fin de votre prochain tour, fin du combat. */
export type DelayedTiming = "nextEndStep" | "yourNextEndStep" | "yourEndStep" | "endOfCombat" | "nextUpkeep" | "yourNextUpkeep";

export interface DelayedTrigger {
  id: string;
  controller: PlayerId;
  sourceId: ObjectId;
  sourceDefId: string;
  at: DelayedTiming;
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
  /** Regards (scry) et surveillances effectués ce tour-ci. */
  scried: number;
  /** Blessures non de combat subies ce tour-ci. */
  noncombatDamageTaken: number;
  /** Capacités de loyauté activées ce tour-ci. */
  loyaltyActivations: number;
  /** Cartes défaussées ce tour-ci (Jiang Yanggu, Alone). */
  cardsDiscarded: number;
  /** Lancers de pièce de ce joueur ce tour-ci (Edgar). */
  coinFlips?: number;
  /** Capacités d'exhaust activées ce tour-ci (Elvish Refueler). */
  exhaustActivated?: number;
  /** Crimes commis ce tour-ci (700.13). */
  crimes?: number;
  /** Créatures avec lesquelles ce joueur a attaqué ce tour-ci (Temple of Civilization). */
  attackers?: number;
  /** Permanents dégagés pendant l'étape de dégagement de ce joueur (The Millennium Calendar). */
  untappedInUntapStep?: number;
  /** Warped Space : un sort lancé depuis l'exil sans payer son coût de mana ce tour-ci. */
  freeFromExile?: number;
  /** Un permanent est arrivé face cachée sous son contrôle, ou il en a retourné un face visible (Oblivious Bookworm). */
  faceDownOrUp?: number;
  /** Mana total dépensé pour lancer des sorts ce tour-ci (Dépense, Bloomburrow). */
  manaSpentOnSpells?: number;
}

/** Événement du tour (`turnlog.ts`) : déplacement, sort lancé, sacrifice, blessures. */
export type TurnLogEntry =
  | {
      e: "zone";
      /** `null` : jeton créé (il n'arrive d'aucune zone). */
      from: Zone | null;
      to: Zone;
      owner: PlayerId;
      /** Contrôleur au moment du départ (dernières informations connues pour le champ de bataille). */
      controller: PlayerId;
      types: CardType[];
      subtypes: string[];
      supertypes?: string[];
      token?: boolean;
    }
  | {
      e: "cast";
      player: PlayerId;
      types: CardType[];
      subtypes: string[];
      supertypes: string[];
      fromZone: Zone;
      token?: boolean;
      /** Lancé pour son coût de distorsion (Vide, Edge of Eternities). */
      warped?: boolean;
    }
  /** Attaque d'une créature : `player` attaque `defender` (le joueur attaqué, ou le contrôleur du planeswalker). */
  | { e: "attack"; player: PlayerId; defender: PlayerId; types: CardType[]; subtypes: string[] }
  | { e: "sacrifice"; player: PlayerId; types: CardType[]; subtypes: string[]; supertypes?: string[]; token?: boolean }
  /** Marqueurs mis sur un permanent ; `player` : celui qui les met (contrôleur de ce qui se résout). */
  | { e: "counters"; player: PlayerId; kind: string; n: number; types: CardType[]; subtypes: string[] }
  /** Capacité activée (hors mana) ; `equip` : une capacité d'équipement (Kíli the Resourceful). */
  | { e: "activate"; player: PlayerId; equip?: boolean; types?: CardType[]; subtypes?: string[] }
  | {
      e: "damage";
      /** Joueur blessé, ou contrôleur du permanent blessé. */
      player: PlayerId;
      toPlayer: boolean;
      amount: number;
      combat: boolean;
      sourceController: PlayerId;
      sourceColors: Color[];
      sourceTypes: CardType[];
      sourceSupertypes: string[];
      types?: CardType[];
      subtypes?: string[];
      supertypes?: string[];
      token?: boolean;
    };

/**
 * Requête sur le journal du tour (`amount.turnEvents`). `who` : le joueur concerné (propriétaire de la carte déplacée,
 * ou son contrôleur si elle quittait le champ de bataille ; lanceur ; joueur blessé ; sacrificateur), vu du contrôleur
 * de la capacité ; absent : tous. `sum` : somme des blessures plutôt que nombre d'entrées ; `perPlayer` : le plus grand
 * total d'un joueur.
 */
export interface TurnLogQuery {
  event: TurnLogEntry["e"];
  who?: "you" | "opponent";
  /** Déplacement : le joueur concerné est le propriétaire (« mise dans votre cimetière », Descente). */
  byOwner?: boolean;
  types?: CardType[];
  /** Aucun de ces types (« sort non-créature »). */
  notTypes?: CardType[];
  subtype?: string;
  notSubtype?: string;
  supertype?: string;
  token?: boolean;
  /** Attaque : contre le joueur qui interroge (« chaque adversaire qui vous a attaqué ce tour-ci »). */
  againstYou?: boolean;
  /** Sort lancé pour son coût de distorsion. */
  warped?: boolean;
  /** Capacité activée : seulement les capacités d'équipement. */
  equip?: boolean;
  from?: Zone;
  to?: Zone;
  fromZone?: Zone;
  combat?: boolean;
  toPlayer?: boolean;
  sourceYours?: boolean;
  sourceColors?: Color[];
  sourceTypes?: CardType[];
  sourceSupertype?: string;
  sum?: boolean;
  perPlayer?: boolean;
}

export interface CombatState {
  /** `defender` : joueur attaqué, ou planeswalker attaqué (identifiant d'objet, 506.2). */
  attackers: { id: ObjectId; defender: string; blockers: ObjectId[]; blocked: boolean }[];
  blockers: { id: ObjectId; attacker: ObjectId }[];
  /** Créatures ayant infligé des blessures lors de l'étape de blessures d'initiative. */
  firstStrikers: ObjectId[];
  /** Joueurs défenseurs qui doivent encore déclarer leurs bloqueurs (ordre APNAP). */
  blockQueue: PlayerId[];
  /** Blocages déjà déclarés, appliqués ensemble quand tous les défenseurs ont déclaré (509.1, cachés d'ici là). */
  pendingBlocks?: { player: PlayerId; blocks: { blocker: ObjectId; attacker: ObjectId }[] }[];
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
  /** Force de base (couche 7b). */
  basePower?: number;
  toughness: number;
  keywords: Keyword[];
  isToken: boolean;
  attacking?: boolean;
  blocking?: boolean;
  attachedTo?: ObjectId;
  /** Identité physique (suit la carte d'une zone à l'autre). */
  uid?: string;
  linked?: ObjectId[];
  damagedBy?: ObjectId[];
  name?: string;
  manaValue?: number;
  /** Sort qui a une Aventure (créature ou Aventure d'une carte à Aventure ; Beluna Grandsquall). */
  adventure?: boolean;
  tapped?: boolean;
  /** Capacités effectives (imprimées ou accordées) au moment de l'instantané. */
  abilities?: AbilityDef[];
  counters?: Record<string, number>;
  /** Choix fait en arrivant (`GameObject.chosen`). */
  chosen?: GameObject["chosen"];
  /** Blessures marquées (ce tour-ci). */
  damage?: number;
  /** Copie d'un sort préparé. */
  preparedSpell?: boolean;
  prepared?: boolean;
  attackedTurn?: number;
  /** Un Équipement lui est attaché. */
  equipped?: boolean;
  /** Contrôleurs des Auras qui lui sont attachées. */
  enchantedBy?: PlayerId[];
  lastAttachedTo?: ObjectId;
  /** Créatures qui l'ont monté ou équipé ce tour-ci. */
  crewedByThisTurn?: ObjectId[];
  /** Lancé pour son coût de distorsion. */
  warped?: boolean;
  /** Face cachée. */
  faceDown?: boolean;
  /** A subi des blessures ce tour-ci. */
  damaged?: boolean;
  /** Mana dépensé pour le lancer (sort sur la pile). */
  manaSpent?: number;
  /** Arrivé en étant lancé (filtre `cast`). */
  cast?: boolean;
}

/** Résolution en cours d'un sort ou d'une capacité, éventuellement suspendue sur un choix. */
export interface Resolution {
  item: StackItem;
  /** Capacité de mana (605.3b) : résolue sans la pile ; la priorité revient ensuite à ce joueur, telle quelle. */
  returnPriority?: { holder: PlayerId; passes: number };
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
  /** « jusqu'à la fin du tour », tant que les objets restent sur le champ de bataille, ou « jusqu'à votre prochain tour ». */
  duration: "endOfTurn" | "permanent" | "untilYourNextTurn";
  /** Pour « jusqu'à votre prochain tour » : le joueur dont le prochain tour met fin à l'effet. */
  until?: PlayerId;
  /** L'effet cesse quand la carte de cette identité physique quitte l'exil. */
  untilExiledUid?: string;
  /** L'effet cesse quand cette source quitte le champ de bataille (Possession Engine). */
  whileSource?: ObjectId;
  /**
   * 707.9b : exceptions d'un effet de copie (« sauf que c'est un Zombie ») ; elles font partie des valeurs copiables,
   * qu'une copie de cet objet reprend (`copiableExceptions`).
   */
  copiable?: boolean;
  /** Couche 2 : le joueur qui contrôle les objets touchés (appliqué par `syncControl`, dans l'ordre des horodatages). */
  controller?: PlayerId;
  /** « Tant que vous contrôlez [la source] » : l'effet cesse dès que ce joueur ne contrôle plus `whileSource` (611.2b). */
  whileControlledBy?: PlayerId;
}

export type Flow = "mulligan" | "stepStart" | "tba" | "priority" | "resolving" | "stepEnd" | "over";

export interface GameState {
  /** Incrémenté à chaque changement pouvant affecter les caractéristiques (invalide le cache des couches). */
  version: number;
  rng: number;
  /** Prochain numéro d'objet (`o…`). */
  nextId: number;
  /**
   * Prochain numéro par préfixe pour tout le reste (effets `e…`, déclencheurs `t…`, capacités `a…`…) : un effet de plus
   * ne décale pas les identifiants des objets, que citent les décisions enregistrées.
   */
  idCounters: Record<string, number>;
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
    /** Pendant l'exil des matériaux d'une fabrication (Market Gnome). */
    crafting?: boolean;
    landsPlayed: number;
    /** La vitesse du joueur actif a déjà augmenté ce tour-ci. */
    speedRaised?: boolean;
    /** Capacités « une fois par tour » déjà déclenchées (source:index). */
    onceFired: string[];
    /** 514.3a : une priorité a été donnée pendant le nettoyage ; il y aura une nouvelle étape de nettoyage. */
    cleanupAgain?: boolean;
    /** Muldrotha : types de permanents déjà joués depuis le cimetière ce tour-ci. */
    graveyardTypesUsed?: string[];
    /** Combats supplémentaires à venir ce tour-ci (Aurelia). */
    extraCombats?: number;
    /** All-Out Assault : « une phase de combat supplémentaire après cette phase principale, suivie d'une phase principale supplémentaire ». */
    extraCombatsAfterMain?: number;
    /** Phase principale supplémentaire à jouer après le combat supplémentaire en cours (la même étape, rejouée). */
    extraMainAfter?: Step;
    /** Phases de combat commencées ce tour-ci (Genji Glove : « si c'est la première phase de combat du tour »). */
    combats?: number;
    /** Étapes de fin supplémentaires à venir (Y'shtola Rhul) et étapes de fin déjà commencées ce tour-ci. */
    extraEndSteps?: number;
    endSteps?: number;
    /** Nombre de résolutions par capacité ce tour-ci (Venom Connoisseur). */
    resolutionCounts?: Record<string, number>;
    startingPlayer: PlayerId;
  };
  flow: Flow;
  priority: { holder: PlayerId; passes: number };
  combat: CombatState | null;
  effects: ContinuousEffect[];
  pending: PendingDecision | null;
  mulliganQueue: PlayerId[];
  /** 103.5 : joueurs qui ont décidé de prendre un mulligan à ce tour de table ; ils le prennent ensemble à la fin. */
  mulliganTaken?: PlayerId[];
  /**
   * Engagements de mana qu'on peut encore annuler (façon Arena) : source engagée seulement pour {T}, sans déclenchement,
   * mana encore dans la réserve. Vidé par toute décision autre que produire ou annuler du mana (`undoMana`, mana.ts).
   */
  manaUndo?: { player: PlayerId; source: ObjectId; color: ManaType; amount: number }[];
  /**
   * 104.4b : passes enchaînées pile non vide, sans autre décision, et empreintes relevées au-delà de 20 (game.ts) ; une
   * même empreinte trois fois, ou plus de 2 000 passes, et la partie est nulle.
   */
  loop?: { passes: number; seen: string[] };
  resolving: Resolution | null;
  /** Effets de remplacement et de prévention créés par des résolutions (jusqu'à la fin du tour). */
  replacements: CreatedReplacement[];
  /** Capacités déclenchées en attente d'être mises sur la pile. */
  triggers: PendingTrigger[];
  /** Capacités déclenchées retardées en attente de leur moment. */
  delayed: DelayedTrigger[];
  /** Cartes qu'un joueur peut jouer depuis l'exil jusqu'à la fin du tour `until` (impulsion, Etali…). */
  /**
   * Cartes exilées jouables. `condition` : seulement tant qu'elle est remplie (Possibility Technician) ; `extraCost` :
   * {N} de plus ; `landsTapped` : un terrain joué ainsi arrive engagé (Lightstall Inquisitor).
   */
  playPermissions?: {
    card: ObjectId;
    player: PlayerId;
    until: number;
    free?: boolean;
    anyTime?: boolean;
    condition?: Condition;
    source?: ObjectId;
    extraCost?: number;
    landsTapped?: boolean;
    anyMana?: boolean;
    /** « S'il devait être mis dans un cimetière, exilez-le à la place » (Quistis Trepe). */
    exileAfter?: boolean;
    /** Une seule carte du groupe peut être lancée (Buster Sword : « un sort de votre main »). */
    group?: string;
    /** Découverte : si la carte n'a pas été lancée quand la permission expire, elle va dans la main. */
    orHand?: boolean;
    /** Permission d'un « lancez-la » pendant une résolution (608.2g) : retirée dès la réponse du joueur. */
    now?: boolean;
    /** Flashback accordé (702.34) : lancé depuis le cimetière, exilé ensuite (Sphinx of Forgotten Lore, Archmage's Newt). */
    flashback?: boolean;
    /** Harmonie accordée (702.180, Songcrafter Mage) : avec `flashback`, une créature engagée réduit le coût. */
    harmonize?: boolean;
    /** Maîtrise de l'air : lançable pour ce coût plutôt que pour son coût de mana. */
    cost?: ManaCost;
  }[];
  /**
   * 722 : « vous contrôlez [ce joueur] pendant son prochain tour » (The Dominion Bracelet). `turn` est fixé au début
   * de ce tour ; pendant ce tour, les décisions de `player` sont prises par `by`.
   */
  turnControl?: { player: PlayerId; by: PlayerId; turn?: number };
  /** Tours supplémentaires à venir (500.7 : le plus récent d'abord). */
  extraTurns?: PlayerId[];
  /** « Terminez le tour » (Time Stop) : le tour passe directement à l'étape de nettoyage. */
  endTurnRequested?: boolean;
  /** Joueurs à qui l'on a proposé leurs cartes « leyline » en début de partie. */
  leylineAsked?: PlayerId[];
  /** Cartes exilées « jusqu'à ce que [la source] quitte le champ de bataille ». */
  /** `toHand` : les cartes reviennent dans la main de leur propriétaire (Deep-Cavern Bat). */
  linkedExile: { sourceId: ObjectId; cards: ObjectId[]; toHand?: boolean }[];
  /** Dernières informations connues, par ancien identifiant (purgées à la fin de chaque étape). */
  lki: Record<ObjectId, LkiSnapshot>;
  /** Journal des événements du tour en cours (`turnlog.ts`), vidé au début de chaque tour. */
  turnLog: TurnLogEntry[];
  /** Effets sur les joueurs créés par des résolutions (`PlayerEffect`). */
  playerEffects: PlayerEffect[];
  winner: PlayerId | null;
  over: boolean;
}

// ---------------------------------------------------------------------------
// Décisions
// ---------------------------------------------------------------------------
