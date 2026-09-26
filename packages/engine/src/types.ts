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
  /** Garde (702.21) : la capacité déclenchée est générée à partir du coût lu dans le texte. */
  | "ward"
  /** Protection contre tout (702.16j) : ni ciblée, ni bloquée, ni blessée, ni enchantée/équipée. */
  | "protectionFromEverything"
  /** Défense talismanique contre les éphémères (702.11d). */
  | "hexproofFromInstants"
  | "hexproofFromBlack"
  | "hexproofFromWhite"
  /** Changelin (702.73) : a tous les types de créature, dans toutes les zones. */
  | "changeling"
  | "cantBeBlockedByHumans"
  /** « Ne peut pas être bloquée par des créatures de force 2 ou moins. » */
  | "cantBeBlockedByPowerLE2"
  /** « Doit être bloquée si possible » (509.1c). */
  | "mustBeBlocked"
  /** Restrictions (pas des mots-clés imprimés, mais gérées comme des capacités de couche 6). */
  | "cantBlock"
  | "cantAttack"
  | "unblockable"
  | "mustAttack"
  | "doesntUntap"
  | "cantBeBlockedByWalls"
  /** Convocation (702.51) : les créatures peuvent aider à payer le sort. */
  | "convoke";

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
  /** « Ce sort ne peut pas être contrecarré. » */
  cantBeCountered?: boolean;
  /** Planeswalker : loyauté de départ (306.5b). */
  loyalty?: number;
  /** Aura : ce qu'elle peut enchanter (cible du sort d'Aura, puis légalité de l'attachement). */
  enchant?: { filter: ObjectFilter; label: string };
  /** « Si cette carte est dans votre main de départ, vous pouvez commencer la partie avec elle sur le champ de bataille. » */
  leyline?: boolean;
  /** Garde : coût à payer (mana ou points de vie). */
  ward?: { mana?: ManaCost; life?: number };
  /** « En coût additionnel pour lancer ce sort, … » (601.2b, 601.2h). */
  additionalCost?: AdditionalCost;
  /** « Ce sort coûte {N} de moins à lancer [si…] » (601.2f). */
  costReduction?: { generic: Amount; condition?: Condition };
  /** Coût alternatif (« vous pouvez payer {B} plutôt que le coût de mana de ce sort si… »). */
  altCost?: { mana: ManaCost; condition: Condition; label: string };
  /** F/E définies par une capacité (604.3, couche 7a), ex. cartes dans les cimetières adverses. */
  cdaPT?: Amount;
  /** « En arrivant, choisissez un type de créature / une couleur » (614.12). */
  chooseOnEnter?: "creatureType" | "color" | "cardName";
  /** « Si cette carte devait être mise dans un cimetière de n'importe où, mélangez-la dans la bibliothèque à la place. » */
  shuffleIntoLibrary?: boolean;
  /** Peut être lancée depuis le cimetière en retirant N marqueurs parmi vos créatures (Quilled Greatwurm). */
  graveyardCastRemoveCounters?: number;
  /** « Vous ne pouvez pas lancer ce sort à moins que… » (Proft, Sinister Mastermind : seuil). */
  castCondition?: Condition;
  /** Seule la force est définie par une capacité (Enigma Drake). */
  cdaPower?: Amount;
  /** « Vous pouvez lancer ce sort comme s'il avait le flash si vous payez {2} de plus. » */
  flashExtraCost?: ManaCost;
  /** Aura : « Vous contrôlez le permanent enchanté » (Confiscate). */
  controlsEnchanted?: boolean;
  /** Wilt-Leaf Liege : défaussée par un sort ou une capacité adverse, va sur le champ de bataille. */
  opponentDiscardToBattlefield?: boolean;
  /** Équipage N (Véhicule). */
  crew?: number;
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  image?: string;
  artCrop?: string;
  /** Carte « à préparer » (Reality Fracture) : le sort attaché à la créature (seconde face). */
  prepareFace?: PrepareFace;
  /** Définition du sort préparé (copiée en exil quand la créature devient préparée). */
  prepareSpell?: CardDef;
  /** false si la carte a des capacités que le moteur ne sait pas encore gérer. */
  implemented: boolean;
  /** Impression de référence (code de set, numéro de collection, rareté) : export des decklists, filtres. */
  set?: string;
  number?: string;
  rarity?: string;
  /** Légalité par format, d'après Scryfall au moment de l'import (« legal », « not_legal », « banned »…). */
  legalities?: Partial<Record<Format, Legality>>;
  isToken?: boolean;
}

export interface PrepareFace {
  name: string;
  manaCost: string;
  typeLine: string;
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string };
}

/** Formats de construction reconnus (seul le Standard est dans le périmètre). */
export type Format = "standard";
export type Legality = "legal" | "not_legal" | "banned" | "restricted";

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
  | CastPermissionAbilityDef
  | PlayerStaticAbilityDef
  | PreventionAbilityDef
  | DoublerAbilityDef;

export interface AdditionalCost {
  discard?: number;
  /** `orPay` : « sacrifiez une créature ou payez {3}{B} » (sans sacrifice, ce mana s'ajoute au coût). */
  sacrifice?: { filter: ObjectFilter; count: number; orPay?: ManaCost };
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
  /** Produit la couleur choisie en arrivant (Heraldic Banner). */
  produceChosen?: boolean;
  /** Mana dépensable seulement pour un sort (ou une capacité d'une créature source) correspondant au filtre. */
  /** `notSpellFromHand` : « ce mana ne peut pas servir à lancer des sorts depuis votre main » (Heartwood Crafter). */
  restriction?: { spell?: ObjectFilter; abilityOfCreature?: ObjectFilter; notSpellFromHand?: boolean };
  /** Effet si ce mana sert à lancer un sort correspondant (Carnelian Orb : célérité ; Pyromancer's Goggles : copie). */
  rider?: { spell: ObjectFilter; effect: "haste" | "copy" };
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
  /** Capacité activée depuis la main (cycle, « défaussez cette carte : … »). */
  fromHand?: boolean;
  /** « N'activez qu'une fois par tour. » */
  oncePerTurn?: boolean;
  /** « N'activez que si… » / « … que pendant votre tour ». */
  activationCondition?: Condition;
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
  /** Engager la créature à laquelle la source est attachée (elle doit pouvoir utiliser {T}). */
  tapAttached?: boolean;
  /** Capacité de loyauté (606) : marqueurs de loyauté ajoutés (+N) ou retirés (−N). */
  loyalty?: number;
  /** Exiler la source (depuis le champ de bataille ou le cimetière). */
  exileSelf?: boolean;
  /** « Défaussez cette carte » (capacité activée depuis la main). */
  discardSelf?: boolean;
  /** Renvoyer la source dans la main de son propriétaire (Maze's End). */
  bounceSelf?: boolean;
  /** Mettre des marqueurs sur la source (Mazemind Tome : marqueur de page). */
  addCounters?: { kind: string; n: number };
  /** Équipage N (702.122) : engager des créatures dégagées de force totale N ou plus (choisies automatiquement). */
  crew?: number;
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
  /** Chaque cible doit être attachée à une cible d'un autre mot « cible » (« Équipement attaché à cette créature »). */
  attachedToTarget?: string;
  /** Cibles contrôlées par des joueurs différents (« contrôlées par des joueurs différents »). */
  differentPlayers?: boolean;
}

export interface TargetFilter {
  players?: "any" | "you" | "opponent";
  objects?: ObjectFilter;
  /** Cartes dans un cimetière (« carte de créature ciblée de votre cimetière »). */
  cards?: { filter: ObjectFilter; whose?: "you" | "opponent" | "any" };
  /** Sorts sur la pile (« contrecarrez le sort de créature ciblé »). */
  spells?: ObjectFilter;
  /** Sorts ou capacités sur la pile à cible unique (Bolt Bend). */
  stackItems?: { singleTarget?: boolean };
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
  /** Le permanent auquel la source est attachée (« la créature équipée »). */
  attachedToSource?: boolean;
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
  /** Jeton seulement. */
  token?: boolean;
  minToughness?: number;
  /** Non de base (« terrain non de base »). */
  nonbasic?: boolean;
  /** A reçu des blessures de la source ce tour-ci (Predator Ooze). */
  damagedBySource?: boolean;
  /** Du type de créature / de la couleur choisis par la source en arrivant. */
  subtypeChosen?: boolean;
  colorChosen?: boolean;
  /** Mise dans sa zone actuelle ce tour-ci (« carte mise dans un cimetière ce tour-ci »). */
  enteredThisTurn?: boolean;
  /** Valeur de mana inférieure ou égale à la force de la source (« … inférieure ou égale à la force d'Alesha »). */
  maxManaValueSourcePower?: boolean;
  /** Légendaire (true) ou non légendaire (false). */
  legendary?: boolean;
  /** Sort préparé (copie lancée depuis l'exil, Codie). */
  preparedSpell?: boolean;
  /** Permanent préparé. */
  prepared?: boolean;
  /** A attaqué ce tour-ci. */
  attackedThisTurn?: boolean;
  maxToughness?: number;
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
  /** `anySourceYouControl` : toute source (sort compris) contrôlée par le contrôleur de la capacité (Niv-Mizzet). */
  | {
      on: "dealsDamage";
      who: "self" | ObjectFilter;
      noncombatOnly?: boolean;
      toOpponent?: boolean;
      anySourceYouControl?: boolean;
    }
  /** « Chaque fois qu'un adversaire défausse une carte » */
  | { on: "discard"; whose: "you" | "opponent" | "any" }
  /** « Chaque fois que [cette créature] devient la cible d'un sort ou d'une capacité [qu'un adversaire contrôle] » */
  | { on: "becomesTarget"; who: "self"; byOpponent?: boolean; bySpellYouControl?: boolean }
  /** « Chaque fois que [la créature équipée] se dégage » */
  | { on: "untaps"; who: "self" | ObjectFilter }
  /** « Chaque fois que [cette créature] devient engagée » */
  | { on: "taps"; who: "self" | ObjectFilter }
  /** « Chaque fois que vous regardez (scry) ou surveillez » (Reality Fracture). */
  | { on: "scryOrSurveil" }
  /** « Quand vous défaussez cette carte » (se déclenche depuis le cimetière). */
  | { on: "discardSelf" }
  /** « Chaque fois que vous activez une capacité de loyauté [en retirant au moins N marqueurs] » ; `byOpponent` : un adversaire l'active. */
  | { on: "loyaltyActivated"; minRemoved?: number; byOpponent?: boolean };

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
  | { kind: "wasCast" }
  /** … depuis un sort lancé depuis la main (Myojin). */
  | { kind: "castFromHand" }
  /** Au moins N permanents correspondant au filtre sur tout le champ de bataille (Blasphemous Edict). */
  | { kind: "battlefieldCount"; filter: ObjectFilter; atLeast: number }
  /** La source correspond au filtre (« si Kellan est un Éclaireur »). */
  | { kind: "sourceMatches"; filter: ObjectFilter }
  /** Réduction de coût : une cible de ce mot « cible » correspond au filtre (Luminous Rebuke). */
  | { kind: "targetMatches"; spec: string; filter: ObjectFilter }
  /** Pendant la résolution : l'objet désigné correspond au filtre (« si c'est un Chat »). */
  | { kind: "refMatches"; ref: Ref; filter: ObjectFilter }
  /** L'objet de l'événement (dernières informations connues) correspond au filtre (« s'il attaquait »). */
  | { kind: "eventObjectMatches"; filter: ObjectFilter }
  | { kind: "lifeGainedAtLeast"; n: number }
  /** Un montant évalué du point de vue du contrôleur atteint N (« force totale 8 ou plus »). */
  | { kind: "amountAtLeast"; amount: Amount; n: number }
  /** X du sort qui se résout. */
  | { kind: "xAtLeast"; n: number }
  /** Le contrôleur a regardé (scry) ou surveillé ce tour-ci. */
  | { kind: "scriedThisTurn" }
  /** Au moins N créatures sont mortes ce tour-ci. */
  | { kind: "creaturesDiedAtLeast"; n: number }
  /** Un adversaire a subi des blessures non de combat ce tour-ci. */
  | { kind: "opponentDealtNoncombatDamage" }
  /** Le contrôleur a pioché au moins N cartes ce tour-ci. */
  | { kind: "drewAtLeast"; n: number }
  /** Le contrôleur a lancé au moins N sorts [non-créature] ce tour-ci. */
  | { kind: "castThisTurn"; n: number; noncreature?: boolean; exactly?: boolean }
  /** La source est préparée. */
  | { kind: "prepared" }
  /** « Contempler un Jace » : vous contrôlez un Jace ou vous avez une carte de Jace en main. */
  | { kind: "beholdJace" };

/** Modifications apportées par un effet continu, rangées par couche (613). */
export interface LayerMods {
  /** Couche 6 : capacités (non mots-clés) accordées. */
  addAbilities?: AbilityDef[];
  /** Couche 4 : types et sous-types ajoutés. */
  addTypes?: CardType[];
  addSubtypes?: string[];
  /** Couche 4 : types remplacés (« est un terrain et perd tous ses autres types »), sous-types remplacés. */
  setTypes?: CardType[];
  setSubtypes?: string[];
  /** Nom remplacé (Witness Protection). */
  setName?: string;
  /** Couche 5 : couleurs. */
  setColors?: Color[];
  /** Couche 4 : a tous les types de créature (Soulstone Sanctuary, changelin). */
  allCreatureTypes?: boolean;
  /** Couche 4 : a en plus le type de créature choisi par la source (Adaptive Automaton). */
  addChosenSubtype?: boolean;
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
  /** « Cette créature arrive préparée. » */
  entersPrepared?: boolean;
  /** Nombre de marqueurs +1/+1 à l'arrivée (X du sort compris). */
  entersWithCounters?: Amount;
  /** Condition (raid, kicker…) évaluée au moment de l'arrivée. */
  condition?: Condition;
  /** Type des marqueurs (+1/+1 par défaut) : « revival », « fellowship »… */
  counterKind?: string;
  /** S'applique aux autres permanents correspondant au filtre (vus du contrôleur de la source), pas à la source. */
  affects?: ObjectFilter;
  label?: string;
}

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export interface CastPermissionAbilityDef {
  kind: "castPermission";
  /** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
  flash?: true;
  /** Omniscience : sorts de votre main sans payer leur coût de mana. */
  freeFromHand?: true;
  /** Tinybones : pendant votre tour, jouer les cartes exilées avec un marqueur de butin que vous ne possédez pas (mana de n'importe quel type). */
  stash?: true;
  /** Muldrotha : pendant votre tour, un terrain et un sort de permanent de chaque type depuis votre cimetière. */
  graveyardPermanentTypes?: true;
  label?: string;
}

/** Capacité statique qui s'applique à des joueurs (défense talismanique, « ne peut pas perdre »…). */
export interface PlayerStaticAbilityDef {
  kind: "playerStatic";
  /** « Vous avez la défense talismanique. » */
  hexproof?: boolean;
  /** « Vous ne pouvez pas perdre la partie et vos adversaires ne peuvent pas la gagner. » */
  cantLose?: boolean;
  /** « Vous n'avez pas de taille de main maximale. » */
  noMaxHandSize?: boolean;
  /** « Vous pouvez jouer un terrain supplémentaire lors de chacun de vos tours. » */
  extraLands?: number;
  /** « Si vous deviez gagner des points de vie, vous en gagnez autant plus N à la place. » */
  lifeGainBonus?: number;
  /** « Les joueurs ne peuvent pas gagner de points de vie » (s'applique à tous les joueurs). */
  noLifeGainForAll?: boolean;
  /** « Les éphémères et rituels que vous contrôlez ne peuvent pas être contrecarrés. » */
  protectSpells?: boolean;
  /** Dryad Militant : les éphémères et rituels qui iraient au cimetière (de n'importe qui) sont exilés. */
  exileInstantsSorceries?: boolean;
  /** Vizier of the Menagerie : lancer des créatures du dessus de sa bibliothèque (mana de n'importe quel type). */
  castCreaturesFromTop?: boolean;
  /** Samut, Tyrant of Naktamun : « les éphémères et rituels que vous contrôlez ont le second partagé ». */
  splitSecondInstantsSorceries?: boolean;
  /** Sanctum Lurker : vos planeswalkers ne vont pas au cimetière faute de loyauté. */
  walkersSurviveZeroLoyalty?: boolean;
  label?: string;
}

/** Prévention statique : « prévenez toutes les blessures [non de combat] qui devraient être infligées à [filtre]. » */
export interface PreventionAbilityDef {
  kind: "prevention";
  filter: ObjectFilter;
  noncombatOnly?: boolean;
  combatOnly?: boolean;
  /** Prévient aussi les blessures infligées PAR la source (Fog Bank). */
  bySource?: boolean;
  label?: string;
}

/** Remplacements qui doublent (614.1a) : jetons, marqueurs, blessures infligées aux adversaires. */
export interface DoublerAbilityDef {
  kind: "doubler";
  tokens?: boolean;
  counters?: boolean;
  /** Blessures d'une source que vous contrôlez à un adversaire ou à un permanent adverse. */
  damageToOpponents?: boolean;
  /** Blessures infligées par une créature que vous contrôlez, à n'importe quoi (Gratuitous Violence). */
  creatureDamage?: boolean;
  label?: string;
}

/** Capacité statique : génère un effet continu tant que la source est sur le champ de bataille (604, 611.3). */
export interface StaticAbilityDef {
  kind: "static";
  /**
   * « self » : la source elle-même ; « attached » : le permanent auquel la source est attachée
   * (« la créature équipée / enchantée ») ; sinon les permanents correspondant au filtre (vus du contrôleur).
   */
  affects: "self" | "attached" | ObjectFilter;
  /** « tant que… » */
  condition?: Condition;
  mods: LayerMods;
  /** F/E multipliées par le nombre de permanents correspondant (« +1/+1 pour chaque Forêt que vous contrôlez »). */
  per?: ObjectFilter;
  /** F/E multipliées par le nombre de marqueurs de ce type sur la source (Banner of Kinship). */
  perCounter?: string;
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
  /** Se déclenche depuis le cimetière de son propriétaire (Flamewake Phoenix). */
  fromGraveyard?: boolean;
  /** « Choisissez un mode qui n'a pas déjà été choisi » (Demonic Pact). */
  uniqueModes?: boolean;
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
  /** Le permanent auquel la source est attachée (« la créature équipée / enchantée »). */
  | { kind: "attached" }
  /** « Cette carte », où qu'elle soit maintenant (suit l'identité physique : Angelic Destiny). */
  | { kind: "selfCard" }
  /** Cartes liées à la source (Hoarding Dragon). */
  | { kind: "linked" }
  /** Permanents sacrifiés pour payer le coût de la capacité (Ayli). */
  | { kind: "costSacrificed" }
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
  /** Opposé (« -X/-0 ») et division entière (« pour chaque tranche de sept cartes »). */
  | { kind: "neg"; of: Amount }
  | { kind: "div"; of: Amount; by: number }
  /** Force totale des permanents correspondant au filtre, vus du contrôleur. */
  | { kind: "totalPower"; filter: ObjectFilter }
  /** Valeur mémorisée pendant la résolution (vie perdue de cette façon, blessures en excès…). */
  | { kind: "var"; name: string }
  | { kind: "lifeTotal" }
  /** Marqueurs d'un type sur la source, d'après ses dernières informations connues (« si elle avait un marqueur… »). */
  | { kind: "lkiCounters"; counter: string }
  | { kind: "manaValueOf"; ref: Ref }
  | { kind: "toughnessOf"; ref: Ref }
  /** Nombre de couleurs de l'objet (Ramos). */
  | { kind: "colorsOf"; ref: Ref }
  /** Plus grande force parmi les permanents correspondants. */
  | { kind: "maxPower"; filter: ObjectFilter }
  /** Nombre de noms différents parmi les permanents correspondants (Maze's End). */
  | { kind: "distinctNames"; filter: ObjectFilter }
  /** Nombre de cartes dans une zone du contrôleur. */
  | { kind: "cardsIn"; zone: "hand" | "graveyard" | "library" }
  /** Domaine : types de terrains de base parmi les terrains du contrôleur. */
  | { kind: "basicLandTypes" };

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
  /** « Renforcez Jace N » : N marqueurs de loyauté sur un jeton Jace (créé s'il n'y en a pas). */
  | { op: "empowerJace"; amount: Amount; token: TokenSpec }
  /** Jace's Machinations : loyauté des Jace à vitesse d'éphémère ce tour-ci. */
  | { op: "instantJaceLoyalty" }
  /** « Vous pouvez jouer un terrain supplémentaire ce tour-ci. » */
  | { op: "extraLandThisTurn" }
  /** « Le prochain sort que vous lancez ce tour-ci ne peut pas être contrecarré. » */
  | { op: "nextSpellUncounterable" }
  /** Devient préparé / dé-préparé (Reality Fracture). */
  | { op: "prepare"; what?: Ref; filter?: ObjectFilter; value: boolean }
  | { op: "damage"; amount: Amount; to: Ref; source?: Ref; storeExcess?: string }
  | { op: "fight"; a: Ref; b: Ref }
  | { op: "pump"; what: Ref; power: Amount; toughness: Amount; keywords?: Keyword[] }
  | { op: "pumpAll"; filter: ObjectFilter; power: Amount; toughness: Amount; keywords?: Keyword[] }
  /** Effet continu quelconque sur des objets (couches 4 à 7) : « devient 0/1 et perd toutes ses capacités »… */
  | { op: "modify"; what: Ref; mods: LayerMods; duration: "endOfTurn" | "permanent" }
  | { op: "destroy"; what: Ref }
  | { op: "draw"; who: Ref; amount: Amount }
  | { op: "gainLife"; who: Ref; amount: Amount }
  | { op: "createTokens"; token: TokenSpec; count: Amount; for?: Ref; store?: string }
  /** Marqueurs (par défaut +1/+1) ; un montant négatif en retire. */
  | { op: "addCounters"; what: Ref; amount: Amount; kind?: string }
  | { op: "loseLife"; who: Ref; amount: Amount; store?: string }
  | { op: "bounce"; what: Ref }
  | { op: "exile"; what: Ref }
  | { op: "mill"; who: Ref; amount: Amount; store?: { name: string; filter?: ObjectFilter } }
  /** Effets avec choix pendant la résolution. */
  | { op: "scry"; amount: Amount }
  | { op: "surveil"; amount: Amount }
  /** `chooser: "controller"` : le contrôleur de l'effet choisit dans la main révélée (« Pilfer »). */
  | { op: "discard"; who: Ref; amount: Amount; filter?: ObjectFilter; chooser?: "controller"; optional?: boolean; store?: string }
  | { op: "sacrifice"; who: Ref; filter: ObjectFilter; amount: Amount; optional?: boolean; store?: string }
  /** « Vous pouvez payer {X}. Si vous le faites, … » : les `skip` effets suivants sont ignorés sinon. */
  | { op: "mayPay"; cost: ManaCost; prompt: string; skip: number; life?: number }
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
  | { op: "destroyAll"; filter: ObjectFilter; store?: string }
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
  | {
      op: "search";
      filter: ObjectFilter;
      count: Amount;
      to: MoveSpec;
      who?: Ref;
      optional?: boolean;
      store?: string;
      /** « … cartes de terrain de base avec des noms différents » */
      distinctNames?: boolean;
    }
  | { op: "shuffle"; who: Ref }
  /** Jeton copie d'un objet (valeurs copiables), avec d'éventuelles modifications. */
  | {
      op: "copyToken";
      of: Ref;
      count?: Amount;
      addKeywords?: Keyword[];
      /** « … excepté que c'est un Cauchemar en plus de ses autres types » */
      addSubtypes?: string[];
      sacrificeAtEndStep?: boolean;
    }
  /** Capacité déclenchée retardée : « au début de la prochaine étape de fin, … ». Les références sont figées maintenant. */
  | { op: "delayed"; at: "nextEndStep"; effects: Effect[]; bind?: Record<string, Ref>; vars?: Record<string, Amount> }
  /** Capacité déclenchée réflexive (« quand vous le faites, … ») : ses cibles sont choisies à sa mise sur la pile. */
  | { op: "reflexive"; targets: TargetSpec[]; effects: Effect[] }
  /** Contrecarre un sort ou une capacité sur la pile (701.5). */
  | { op: "counter"; what: Ref }
  /** « … à moins que [joueur] ne paie X » : s'il paie, les `skip` effets suivants sont ignorés. */
  | { op: "unlessPay"; who: Ref; mana?: ManaCost; life?: number; skip: number }
  /** « Vous pouvez lancer [cette carte] depuis votre cimetière ce tour-ci. » */
  | { op: "allowCastFromGraveyard"; what: Ref }
  /** « En arrivant, choisissez un type de créature / une couleur » (sort de permanent qui se résout). */
  | { op: "chooseOnEnter"; kind: "creatureType" | "color" | "cardName" }
  /** Le contrôleur sépare les N cartes du dessus en deux piles, un adversaire en choisit une (en main), l'autre au cimetière. */
  | { op: "piles"; n: number }
  /** Carte de cimetière qui gagne le flashback jusqu'à la fin du tour (coût : son coût de mana). */
  | { op: "grantFlashback"; what: Ref }
  /** « Terminez le tour » (723). */
  | { op: "endTurn" }
  /** Le contrôleur de l'effet prend le contrôle de l'objet jusqu'à la fin du tour. */
  | { op: "gainControl"; what: Ref }
  /** Copies d'un sort sur la pile (mêmes cibles). */
  | { op: "copySpell"; what: Ref; count: Amount }
  /** Chaque joueur désigné révèle des cartes jusqu'à une carte correspondant au filtre, puis les met toutes au cimetière. */
  | { op: "millUntil"; who: Ref; filter: ObjectFilter }
  /** Exile les N cartes du dessus de la bibliothèque de chaque joueur désigné (mémorisées sous `store`). */
  | { op: "exileTop"; who: Ref; n: number; store: string }
  /** Permet au contrôleur de jouer ces cartes exilées ce tour-ci. `spellsOnly` : lancer seulement, sans timing, gratuitement. */
  | { op: "grantPlay"; what: Ref; free?: boolean; anyTime?: boolean }
  /** Donne le contrôle de l'objet à un joueur, sans limite de durée (Harmless Offering). */
  | { op: "giveControl"; what: Ref; to: Ref }
  /** Dégage jusqu'à N permanents engagés du contrôleur correspondant au filtre (choisis automatiquement). */
  | { op: "untapUpTo"; filter: ObjectFilter; n: number }
  /** Le sort qui se résout est exilé au lieu d'aller au cimetière (« Exilez Finale of Revelation »). */
  | { op: "exileOnResolve" }
  /** Marqueurs poison (122.1f) ; 10 ou plus : le joueur perd. */
  | { op: "poison"; who: Ref; n: Amount }
  /** Détruit l'objet et tous les autres permanents du même nom (Maelstrom Pulse). */
  | { op: "destroySameName"; what: Ref }
  /** Marqueurs +1/+1 répartis entre les cibles (au moins 1 chacune). */
  | { op: "countersDivided"; total: number; to: Ref }
  /** Choisir X, puis payer {X} ; mémorisé sous `store` (Wildborn Preserver). */
  | { op: "payX"; prompt: string; store: string }
  /** Change la cible d'un sort ou d'une capacité à cible unique (Bolt Bend). */
  | { op: "changeTarget"; what: Ref }
  /** Combat supplémentaire après celui-ci (Aurelia). */
  | { op: "extraCombat" }
  /** Le mana ajouté ne se vide pas avant la fin du tour (Savage Ventmaw). */
  | { op: "addManaUntilEndOfTurn"; mana: ManaType[] }
  /** Au prochain éphémère ou rituel lancé ce tour-ci par le contrôleur : copie (Teach by Example). */
  | { op: "copyNextSpell" }
  /** Le contrôleur gagne la partie (Maze's End). */
  | { op: "winGame" }
  | { op: "loseGame" }
  /** Compte les résolutions de cette capacité ce tour-ci, mémorisé sous `store` (Venom Connoisseur). */
  | { op: "countResolution"; store: string }
  /** Détruit les permanents non-terrains de valeur X des joueurs blessés au combat par la source ce tour-ci. */
  | { op: "hellkite" }
  /** Lie des cartes à la source (Hoarding Dragon). */
  | { op: "link"; what: Ref }
  /** Attache une Aura ou un Équipement à un permanent (701.3). */
  | { op: "attach"; what: Ref; to: Ref }
  /** Ajoute du mana à la réserve du contrôleur. */
  | { op: "addMana"; mana: ManaType[] }
  /** Ajoute N mana d'une couleur choisie par le contrôleur. */
  | { op: "addManaChoice"; n: number }
  /** Exile les N cartes du dessus ; le contrôleur en choisit une qu'il peut jouer ce tour-ci. */
  | { op: "impulse"; n: number; until?: "thisTurn" | "yourNextTurn" }
  /** Blessures réparties comme le contrôleur le désire entre les cibles (au moins 1 chacune). */
  | { op: "damageDivided"; total: Amount; to: Ref }
  /** Chaque joueur désigné garde un permanent de chaque type et sacrifie le reste. */
  | { op: "keepOnePerType"; who: Ref }
  /** Le contrôleur reçoit un emblème (114) portant ces capacités. */
  | { op: "emblem"; name: string; abilities: AbilityDef[]; text: string }
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
      /** Exclut les objets mémorisés sous ce nom (« une autre carte de permanent »). */
      excludeStored?: string;
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
  /** Aura ou Équipement : le permanent auquel il est attaché (301.5, 303.4). */
  attachedTo?: ObjectId;
  /** Tour de la dernière activation d'une capacité de loyauté (606.3 : une par tour). */
  loyaltyTurn?: number;
  /** Choix faits en arrivant (type de créature, couleur, nom de carte). */
  chosen?: { creatureType?: string; color?: Color; cardName?: string };
  /** Arrivé depuis un sort lancé depuis la main (Myojin). */
  castFromHand?: boolean;
  /** Préparé (Reality Fracture) : identifiant de la copie de son sort, en exil. */
  preparedCopy?: ObjectId;
  /** Copie d'un sort préparé (en exil puis sur la pile) : le permanent qui l'a préparée. Cesse d'exister hors de ces zones. */
  preparedFor?: ObjectId;
  /** Tour de sa dernière attaque (« créature qui a attaqué ce tour-ci »). */
  attackedTurn?: number;
  /** Cartes liées (exilées par cette carte, Hoarding Dragon). */
  linked?: ObjectId[];
  /** Sources qui lui ont infligé des blessures ce tour-ci (Predator Ooze). */
  damagedBy?: ObjectId[];
  /** Joueurs à qui il a infligé des blessures de combat ce tour-ci (Steel Hellkite). */
  combatDamagedPlayers?: PlayerId[];
  /** Tour de la dernière activation « une fois par tour », par indice de capacité. */
  activatedTurn?: Record<number, number>;
  /** Modes déjà choisis (Demonic Pact). */
  usedModes?: number[];
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  /** Jace's Machinations : capacités de loyauté des Jace à vitesse d'éphémère pendant ce tour. */
  jaceInstantTurn?: number;
  /** Terrains supplémentaires ce tour-ci (Way of the Paradox). */
  extraLandsTurn?: { turn: number; n: number };
  /** Theorist's Proxy : le prochain sort lancé ce tour-ci ne peut pas être contrecarré. */
  nextSpellUncounterableTurn?: number;
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
  /** Marqueurs poison (104.3d : 10 ou plus, le joueur perd). */
  poison?: number;
  /** Mana qui ne se vide pas avant la fin du tour (Savage Ventmaw). */
  manaKeep?: Partial<Record<ManaType, number>>;
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
  /** Copie d'un sort (707.10) : pas de carte associée. */
  copy?: boolean;
  /** « Ce sort ne peut pas être contrecarré » (accordé au lancement). */
  uncounterable?: boolean;
  /** Permanents sacrifiés pour le coût (dernières informations connues disponibles). */
  sacrificed?: ObjectId[];
  /** Effets de mana dépensé (Carnelian Orb, Pyromancer's Goggles). */
  riders?: ("haste" | "copy")[];
  /** Sort lancé depuis la main. */
  fromHand?: boolean;
}

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
  /** Éphémères et rituels lancés ce tour-ci (Thousand-Year Storm). */
  instantSorceryCast: number;
  noncreatureCast: number;
  /** Regards (scry) et surveillances effectués ce tour-ci. */
  scried: number;
  /** Blessures non de combat subies ce tour-ci. */
  noncombatDamageTaken: number;
}

export interface CombatState {
  /** `defender` : joueur attaqué, ou planeswalker attaqué (identifiant d'objet, 506.2). */
  attackers: { id: ObjectId; defender: string; blockers: ObjectId[]; blocked: boolean }[];
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
  attachedTo?: ObjectId;
  /** Identité physique (suit la carte d'une zone à l'autre). */
  uid?: string;
  linked?: ObjectId[];
  damagedBy?: ObjectId[];
  name?: string;
  manaValue?: number;
  tapped?: boolean;
  /** Capacités effectives (imprimées ou accordées) au moment de l'instantané. */
  abilities?: AbilityDef[];
  counters?: Record<string, number>;
  /** Copie d'un sort préparé. */
  preparedSpell?: boolean;
  prepared?: boolean;
  attackedTurn?: number;
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
    /** Nombre de créatures mortes ce tour-ci. */
    creaturesDied?: number;
    /** Capacités « une fois par tour » déjà déclenchées (source:index). */
    onceFired: string[];
    /** Cartes de cimetière qu'on peut lancer ce tour-ci (Zul Ashur). */
    mayCastFromGraveyard?: ObjectId[];
    /** Muldrotha : types de permanents déjà joués depuis le cimetière ce tour-ci. */
    graveyardTypesUsed?: string[];
    /** Cartes du cimetière qui ont le flashback ce tour-ci (Sphinx of Forgotten Lore). */
    flashbackGranted?: ObjectId[];
    /** Combats supplémentaires à venir ce tour-ci (Aurelia). */
    extraCombats?: number;
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
  resolving: Resolution | null;
  /** Effets de remplacement et de prévention créés par des résolutions (jusqu'à la fin du tour). */
  replacements: CreatedReplacement[];
  /** Capacités déclenchées en attente d'être mises sur la pile. */
  triggers: PendingTrigger[];
  /** Capacités déclenchées retardées en attente de leur moment. */
  delayed: DelayedTrigger[];
  /** Cartes qu'un joueur peut jouer depuis l'exil jusqu'à la fin du tour `until` (impulsion, Etali…). */
  playPermissions?: { card: ObjectId; player: PlayerId; until: number; free?: boolean; anyTime?: boolean }[];
  /** Contrôle donné par une Aura (Confiscate) : contrôleur d'origine à rétablir quand l'Aura part. */
  auraControl?: { host: ObjectId; aura: ObjectId; original: PlayerId }[];
  /** Changements de contrôle « jusqu'à la fin du tour » (contrôleur d'origine à rétablir). */
  controlChanges?: { id: ObjectId; original: PlayerId }[];
  /** « Au prochain éphémère ou rituel que vous lancez ce tour-ci, copiez-le » (Teach by Example). */
  nextSpellCopies?: { player: PlayerId; turn: number }[];
  /** « Terminez le tour » (Time Stop) : le tour passe directement à l'étape de nettoyage. */
  endTurnRequested?: boolean;
  /** Joueurs à qui l'on a proposé leurs cartes « leyline » en début de partie. */
  leylineAsked?: PlayerId[];
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
  | "unlessPay"
  | "chooseOnEnter"
  | "piles"
  | "divideCounters"
  | "manaColor"
  | "payX"
  | "changeTarget"
  | "leyline"
  | "impulse"
  | "divideDamage"
  | "keepPerType"
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
        /** Minimum par destinataire (601.2d : au moins 1 par cible). */
        minEach?: number;
      }
  );

export type ChoicePurpose =
  | { kind: "effect" }
  | { kind: "combatDamage"; attacker: ObjectId }
  | { kind: "legend" }
  | { kind: "triggerOrder"; player: PlayerId }
  | { kind: "triggerTarget"; trigger: string; spec: string }
  | { kind: "triggerMode"; trigger: string }
  | { kind: "leyline"; player: PlayerId };

export interface CastChoices {
  /** Sans payer le coût de mana (Omniscience). */
  free?: boolean;
  /** Coût alternatif de la carte. */
  alternative?: boolean;
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
  attachedToTarget?: string;
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
      /** Carte exilée jouable (impulsion, Etali, Tinybones). */
      fromExile?: boolean;
      /** Doit être lancée sans payer son coût de mana (Etali). */
      free?: boolean;
      /** Peut être lancée sans payer son coût de mana (Omniscience). */
      freeAvailable?: boolean;
      /** Coût alternatif payable (Blasphemous Edict). */
      altAvailable?: boolean;
      /** Coût normal payable. */
      normalAvailable?: boolean;
      additional?: {
        discard?: { count: number; options: ObjectId[] };
        /** `orPay` : on peut payer ce mana au lieu de sacrifier (Eaten Alive). */
        sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
      };
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
  | { type: "copy"; stackId: string; defId: string; player: PlayerId }
  | { type: "poison"; player: PlayerId; amount: number; total: number }
  | { type: "endTurn"; player: PlayerId }
  | { type: "countered"; stackId: string; defId: string; by: string }
  | { type: "attach"; objectId: ObjectId; defId: string; to: ObjectId; toDefId: string }
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
  /** `objectId` et `defId` sont retirés (filterEvents) pour un déplacement caché → caché d'une carte adverse. */
  | { type: "moved"; owner: PlayerId; objectId?: ObjectId; defId?: string; from: Zone; to: Zone }
  | { type: "scry"; player: PlayerId; top: number; bottom: number }
  | { type: "choice"; player: PlayerId; intent: ChoiceIntent }
  | { type: "trigger"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "lose"; player: PlayerId; reason: "life" | "draw" | "concede" }
  | { type: "gameOver"; winner: PlayerId | null };
