/** Types du moteur — Cartes, capacités, coûts, effets continus (couches), jetons et déplacements. Réexportés par `types.ts`. */
import type {
  Amount,
  CardType,
  Color,
  Condition,
  Effect,
  GiftKind,
  Keyword,
  ManaCost,
  ManaType,
  ObjectFilter,
  PlayerId,
  TargetSpec,
  TriggerSpec,
} from "../types";

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
  /** Kicker sans mana (FIN) : « sacrifiez un artefact ou une créature », « renvoyez un terrain que vous contrôlez ». */
  /**
   * Kicker sans mana : sacrifier (FIN, Marchandage) ou renvoyer un permanent, flétrir N (`blight`, Lorwyn Eclipsed :
   * N marqueurs -1/-1 sur une créature que vous contrôlez), ou engager des créatures de force totale N (`tapPower`,
   * Travail d'équipe, Marvel Super Heroes).
   */
  kickerCost?: { sacrifice?: ObjectFilter; bounce?: ObjectFilter; blight?: number; tapPower?: number; collectEvidence?: number };
  /** Évocation (702.74) : coût alternatif (dans `altCost`) ; la créature est sacrifiée en arrivant. */
  evoke?: ManaCost;
  /** Coût de flashback : peut être lancée depuis le cimetière, puis exilée (702.34). */
  /** Harmonie (702.180) : son coût est aussi rangé ici (même lancement depuis le cimetière, puis exil), avec `harmonize`. */
  flashback?: ManaCost;
  /**
   * Harmonie (702.180) : lancée depuis le cimetière pour `flashback`, on peut engager une créature qu'on contrôle pour
   * réduire ce coût de {X}, X étant sa force.
   */
  harmonize?: boolean;
  /** « Ce sort ne peut pas être contrecarré. » */
  cantBeCountered?: boolean;
  /** Planeswalker : loyauté de départ (306.5b). */
  loyalty?: number;
  /** Aura : ce qu'elle peut enchanter (cible du sort d'Aura, puis légalité de l'attachement). */
  enchant?: { filter: ObjectFilter; label: string; player?: boolean };
  /** « Si cette carte est dans votre main de départ, vous pouvez commencer la partie avec elle sur le champ de bataille. » */
  leyline?: boolean;
  /** Garde : coût à payer (mana ou points de vie). */
  ward?: {
    mana?: ManaCost;
    life?: number;
    lifePower?: boolean;
    discard?: boolean;
    discardRandom?: boolean;
    sacrifice?: number;
    /** Les permanents à sacrifier sont non-terrains (Valgavoth). */
    sacrificeNonland?: boolean;
  };
  /** Flashback avec « défaussez une carte » en plus (Twinned Vision). */
  flashbackDiscard?: number;
  /** « En coût additionnel pour lancer ce sort, … » (601.2b, 601.2h). */
  additionalCost?: AdditionalCost;
  /** « Ce sort coûte {N} de moins à lancer [si…] » (601.2f). */
  costReduction?: { generic: Amount; condition?: Condition };
  /** Coût alternatif (« vous pouvez payer {B} plutôt que le coût de mana de ce sort si… »). */
  altCost?: { mana: ManaCost; condition: Condition; label: string; forage?: boolean };
  /** F/E définies par une capacité (604.3, couche 7a), ex. cartes dans les cimetières adverses. */
  cdaPT?: Amount;
  /** « En arrivant, choisissez un type de créature / une couleur » (614.12). */
  chooseOnEnter?: "creatureType" | "color" | "cardName" | "landName";
  /**
   * Dévorer (702.82) : « en arrivant, sacrifiez des [terrains] ; N marqueurs +1/+1 par permanent sacrifié ».
   * `graveyardUpToX` : « exilez jusqu'à X cartes de votre cimetière » à la place (Mimeoplasm, cartes liées).
   */
  devour?: { filter: ObjectFilter; n: number; graveyardUpToX?: boolean };
  /** The Masamune : les capacités déclenchées par une mort, de la créature équipée ou de vos emblèmes, se déclenchent une fois de plus. */
  doubleDeathTriggersForEquipped?: boolean;
  /** Cloud, Planet's Champion : « les capacités d'équipement que vous activez qui la ciblent coûtent {N} de moins ». */
  equipDiscountWhenTargeted?: number;
  /** Cloud, Midgar Mercenary : tant qu'elle est équipée, ses capacités déclenchées et celles de ses Équipements se déclenchent une fois de plus. */
  doubleTriggersWhenEquipped?: boolean;
  /** « Vous pouvez faire arriver cette créature comme copie d'un [permanent] que vous contrôlez » (Waxen Shapethief). */
  entersAsCopyOf?: ObjectFilter;
  /** « Si cette carte devait être mise dans un cimetière de n'importe où, mélangez-la dans la bibliothèque à la place. » */
  shuffleIntoLibrary?: boolean;
  /** Peut être lancée depuis le cimetière en retirant N marqueurs parmi vos créatures (Quilled Greatwurm). */
  graveyardCastRemoveCounters?: number;
  /** « [Cette carte] a le flash tant que … » (Take for a Ride, Colossal Rattlewurm). */
  flashIf?: Condition;
  /** « Exilez [ce sort] » à la résolution, au lieu du cimetière (Step Between Worlds). */
  exileOnResolve?: boolean;
  /** Visage Bandit : sous-types ajoutés quand elle arrive comme copie. */
  entersAsCopyAddSubtypes?: string[];
  /**
   * Superior Spider-Man (Échange d'esprit) : peut arriver comme copie d'une carte de créature d'un cimetière, sauf son nom
   * et ses F/E (`entersAsCopyAddSubtypes` pour les types en plus) ; la carte copiée est exilée.
   */
  entersAsCopyOfGraveyard?: { filter: ObjectFilter; name?: string; power?: number; toughness?: number };
  /** Plot (702.170) : coût de l'action spéciale « complotez cette carte » (lu dans le texte). */
  plot?: ManaCost;
  /** Skyseer's Chariot : les capacités activées des sources du nom choisi coûtent {N} de plus (au lieu d'être interdites). */
  chosenNameTax?: number;
  /** « Vous pouvez lancer cette carte depuis votre cimetière [si…] » (Lightwheel Enhancements : vitesse maximale). */
  castFromGraveyard?: { condition?: Condition; payLife?: number; sacrifice?: ObjectFilter };
  /** « Vous ne pouvez pas lancer ce sort à moins que… » (Proft, Sinister Mastermind : seuil). */
  castCondition?: Condition;
  /** Seule l'endurance est définie par une capacité (Tarmogoyf, avec `cdaPower`). */
  cdaToughness?: Amount;
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
  /** Disposition à plusieurs faces (aventure, carte scindée, recto-verso transformable ou modal, assemblage). */
  layout?: MultiFaceLayout;
  /**
   * Définitions complètes de chaque face (0 : recto, créature d'une aventure, moitié gauche). La carte elle-même
   * porte les caractéristiques hors du jeu : celles du recto, ou la réunion des deux moitiés d'une carte scindée.
   */
  faceDefs?: CardDef[];
  /** « En arrivant, vous pouvez payer N points de vie ; sinon, il arrive engagé » (terrains choc). */
  shockLand?: number;
  /** Distorsion (702.185) : coût, points de vie en plus, et lançable aussi depuis le cimetière (Timeline Culler). */
  warp?: { cost: ManaCost; life?: number; fromGraveyard?: boolean };
  /**
   * Station (702.184) : paliers « N+ | … » (mots-clés lus dans le texte, autres capacités dans le script) et seuil où le
   * Vaisseau devient une créature-artefact.
   */
  station?: { creatureAt?: number; thresholds: { n: number; keywords: Keyword[]; abilities: AbilityDef[] }[] };
  /** Imminence N (702.176) : marqueurs de temps à l'arrivée si le coût d'imminence (`altCost`) a été payé. */
  impending?: number;
  /** Déguisement (702.168) : coût pour retourner face visible une carte lancée face cachée pour {3}. */
  disguise?: ManaCost;
  /** Saga (714) : numéro du dernier chapitre (lu dans le texte). */
  saga?: { chapters: number };
  /** Classe (716) : capacités des niveaux 2, 3… (coût du niveau et capacités ajoutées). */
  classLevels?: { cost: ManaCost | null; abilities: AbilityDef[] }[];
  /** Affaire (719) : condition « Pour résoudre » et capacités « Résolue ». */
  caseToSolve?: Condition;
  caseSolved?: AbilityDef[];
  /** Assemblage (701.42) : les deux parties et la carte assemblée, par nom. */
  meld?: { parts: string[]; result?: string };
  /** Libellé du kicker : Progéniture (702.175) ou Cadeau (702.174), lus dans le texte (Bloomburrow). */
  kickerKind?: "offspring" | "gift" | "bargain" | "blight" | "teamwork" | "evidence";
  /** Cadeau (702.174) : ce que reçoit l'adversaire choisi si le cadeau est promis. */
  gift?: GiftKind;
  /** « En coût additionnel, fourragez ou payez [mana] » (Feed the Cycle) : le coût alternatif « Fourrager » l'évite. */
  forageOrPay?: ManaCost;
  /** Copie à l'arrivée : de n'importe quel contrôleur (Mockingbird), et mots-clés ajoutés. */
  entersAsCopyAnyController?: boolean;
  entersAsCopyAddKeywords?: Keyword[];
  /** Carte assemblée (verso commun de deux cartes) : elle ne se met pas dans un deck. */
  meldResult?: boolean;
  /** Définition de la carte assemblée, enregistrée dans la partie avec la carte (partie d'un assemblage). */
  meldResultDef?: CardDef;
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

export type MultiFaceLayout = "adventure" | "split" | "transform" | "modal_dfc" | "meld" | "saga" | "class" | "case";

/** Une face affichable (sort préparé, autre face d'une carte à plusieurs faces). */
export interface PrepareFace {
  name: string;
  manaCost: string;
  typeLine: string;
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  /** Image propre à cette face (verso d'une carte recto-verso). */
  image?: string;
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
  /** Spree (702.172) : coût supplémentaire de ce mode (les modes combinés additionnent les leurs). */
  extraCost?: ManaCost;
  /** Mode disponible seulement si la condition est remplie (délire : « choisissez-en un ou plus à la place »). */
  condition?: Condition;
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
  | DoublerAbilityDef
  | GraveyardReplacementAbilityDef;

export interface AdditionalCost {
  discard?: number;
  /** « Défaussez une carte ou payez N points de vie » (Bitter Triumph) : sans défausse, le joueur paie ces PV. */
  discardOrLife?: number;
  /** « Défaussez une carte ou sacrifiez un permanent » (Souls of the Lost) : un permanent choisi est sacrifié. */
  discardOrSacrifice?: boolean;
  /** Choisis automatiquement (Duskmourn) : permanents exilés (liés au permanent), renvoyés, engagés ; cartes du cimetière exilées. */
  exile?: { filter: ObjectFilter; count: number };
  bounce?: { filter: ObjectFilter; count: number };
  tap?: { filter: ObjectFilter; count: number };
  exileGraveyard?: number;
  /** `orPay` : « sacrifiez une créature ou payez {3}{B} » (sans sacrifice, ce mana s'ajoute au coût). */
  sacrifice?: { filter: ObjectFilter; count: number; orPay?: ManaCost };
}

/** « Les sorts de [filtre] que vous lancez coûtent {N} de moins. » */
export interface CostReductionAbilityDef {
  kind: "costReduction";
  filter: ObjectFilter;
  generic: number;
  /** S'applique aux sorts des adversaires (Thalia, the Survivor : générique négatif = taxe). */
  opponents?: boolean;
  /** Réduction variable (affinité pour les artefacts : Sami, Wildcat Captain), ajoutée à `generic`. */
  genericAmount?: Amount;
  /** Seulement si la condition est remplie (Uthros Psionicist : « le deuxième sort que vous lancez chaque tour »). */
  condition?: Condition;
  /** Seulement pour les sorts lancés depuis ces zones (Aven Interrupter, Doc Aurlock : cimetière ou exil). */
  fromZones?: ("graveyard" | "exile")[];
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
  /** `abilityOfSource` : capacité d'une source quelconque correspondant au filtre (Steelswarm Operator) ; */
  /** `spellNotFromHand` : « seulement pour lancer un sort depuis ailleurs que votre main » (Mm'menon, the Right Hand). */
  restriction?: {
    spell?: ObjectFilter;
    abilityOfCreature?: ObjectFilter;
    abilityOfSource?: ObjectFilter;
    notSpellFromHand?: boolean;
    spellNotFromHand?: boolean;
  };
  /** Gene Pollinator : « engagez un permanent dégagé que vous contrôlez » en plus de {T} (choisi automatiquement). */
  tapAnother?: boolean;
  /** « N'activez que si vous contrôlez… » (Verges d'Aetherdrift). */
  condition?: Condition;
  /** « Une seule fois par tour » (Vivi Ornitier). */
  oncePerTurn?: boolean;
  /** Twitching Doll : « mettez un marqueur [nid] sur cette créature » quand on l'active. */
  addCounter?: string;
  /** Temple of Cyclical Time : « retirez un marqueur [de temps] de ce terrain » quand on l'active. */
  removeCounter?: string;
  /** Pit of Offerings : un mana de l'une des couleurs des cartes liées à la source (exilées avec elle). */
  produceLinkedColors?: boolean;
  /** The Core : autant de mana que de cartes de votre cimetière correspondant au filtre. */
  amountGraveyard?: ObjectFilter;
  /** Effet si ce mana sert à lancer un sort correspondant (Carnelian Orb : célérité ; Pyromancer's Goggles : copie). */
  /** `uncounterable` : « ce sort ne peut pas être contrecarré » (Cavern of Souls). */
  rider?: { spell: ObjectFilter; effect: "haste" | "copy" | "uncounterable" };
  amount: number;
  /** « {G} pour chaque Elfe que vous contrôlez » : le montant est le nombre de permanents correspondant. */
  amountPer?: ObjectFilter;
  /** The Eternity Elevator : autant de mana que de marqueurs de ce type sur la source. */
  amountCounters?: string;
  /** Redshift : autant de mana que la force de la source. */
  amountSelfPower?: boolean;
  /** Loot, the Nexus : un mana pour chaque force différente parmi les créatures que vous contrôlez. */
  amountDistinctPowers?: boolean;
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
  /**
   * Montée en puissance (Power-up, Marvel Super Heroes) : une seule fois, et le coût est réduit du coût de mana de la
   * source si elle est arrivée ce tour-ci.
   */
  powerUp?: boolean;
  /** Capacité activée depuis le cimetière (« Renvoyez cette carte de votre cimetière… »). */
  fromGraveyard?: boolean;
  /** Capacité activée depuis la main (cycle, « défaussez cette carte : … »). */
  fromHand?: boolean;
  /** Capacité de cycle (702.29) : déclencheurs « quand vous cyclez cette carte ». */
  cycling?: boolean;
  /** Exhaust (702.177) : une seule activation ; déclencheurs « chaque fois que vous activez une capacité d'exhaust ». */
  exhaust?: boolean;
  /** « N'activez qu'une fois par tour. » */
  oncePerTurn?: boolean;
  /** « N'activez que si… » / « … que pendant votre tour ». */
  activationCondition?: Condition;
  /** « Coûte {1} de moins pour chaque marqueur +1/+1 sur la créature ciblée » (Warrior's Blades). */
  reduceByTargetCounters?: boolean;
  /** Action spéciale (116) : pas de pile, effets immédiats (déverrouiller une porte de Salle). */
  specialAction?: boolean;
  /** « Cette capacité coûte {N} de moins à activer [si …] » (N évalué à l'activation). */
  reduction?: { generic: Amount; condition?: Condition };
}

export interface CostDef {
  mana?: ManaCost;
  tap?: boolean;
  sacrificeSelf?: boolean;
  /**
   * Fabrication (702.167) : exiler des matériaux parmi les autres permanents que vous contrôlez et/ou les cartes de votre
   * cimetière (choisis automatiquement, cartes du cimetière d'abord). `each` : un matériau par filtre (The Grim Captain) ;
   * `orMore` : un ou plusieurs ; `preferHighManaValue` : les plus chers d'abord (Jadeheart Attendant).
   */
  craft?: {
    filter?: ObjectFilter;
    count: number;
    orMore?: boolean;
    each?: ObjectFilter[];
    preferHighManaValue?: boolean;
    /** « Un ou plusieurs » : un matériau par couleur nouvelle (Sunbird Standard), plutôt que tout le cimetière. */
    distinctColors?: boolean;
  };
  /** Sacrifier d'autres permanents (choisis par le joueur). */
  sacrifice?: { filter: ObjectFilter; count: number };
  /** Retirer des marqueurs de la source. */
  removeCounters?: { kind: string; n: number };
  /** Engager d'autres permanents dégagés que vous contrôlez (choisis automatiquement). */
  tapOthers?: { filter: ObjectFilter; count: number };
  /** Engager la créature à laquelle la source est attachée (elle doit pouvoir utiliser {T}). */
  tapAttached?: boolean;
  /** Épuiser la source (701.43) : elle ne se dégagera pas lors de la prochaine étape de dégagement de son contrôleur. */
  exertSelf?: boolean;
  /** Capacité de loyauté (606) : marqueurs de loyauté ajoutés (+N) ou retirés (−N). */
  loyalty?: number;
  /** « −X » : X marqueurs de loyauté retirés (X choisi à l'activation). */
  loyaltyX?: boolean;
  /** Retirer un marqueur d'un permanent que vous contrôlez (choisi automatiquement : Sunstar Chaplain). */
  removeCounterFrom?: { filter: ObjectFilter; kind: string };
  /** Engager X permanents dégagés que vous contrôlez (X choisi à l'activation : Secluded Starforge). */
  tapX?: ObjectFilter;
  /** Exiler X cartes correspondantes de votre cimetière (X choisi à l'activation, cartes choisies automatiquement : Winter). */
  exileFromGraveyardX?: ObjectFilter;
  /** Sacrifier X permanents correspondants, X ≥ 1 (Radiant Lotus ; choisis automatiquement, la source en dernier). */
  sacrificeX?: ObjectFilter;
  /** Exiler d'autres cartes de votre cimetière (choisies automatiquement : Gallia). */
  exileFromGraveyard?: { filter: ObjectFilter; count: number };
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
  /** Défausser N cartes (choisies par le joueur ; par défaut les premières de la main). */
  discard?: number;
  /** Ninjutsu : renvoyer en main un attaquant non bloqué que vous contrôlez (choisi automatiquement : le plus faible). */
  returnUnblockedAttacker?: boolean;
  /** Fourrager (701.61) : exiler trois cartes de votre cimetière ou sacrifier une Nourriture (choix automatique). */
  forage?: boolean;
}
/** Modifications apportées par un effet continu, rangées par couche (613). */
export interface LayerMods {
  /** Couche 6 : capacités (non mots-clés) accordées. */
  addAbilities?: AbilityDef[];
  /** Couche 4 : types et sous-types ajoutés. */
  addTypes?: CardType[];
  addSubtypes?: string[];
  /** Couche 4 : surtypes ajoutés (« sauf que c'est légendaire »). */
  addSupertypes?: string[];
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
  /** Couche 1 : devient une copie de cette définition (valeurs copiables ; Hall of Echoes). */
  copyOf?: string;
  /** Assimilation Aegis : copie de la carte exilée par la source (liée par « exilez jusqu'à ce que »). */
  copyLinkedExile?: boolean;
  /** Territory Forge : a les capacités activées des cartes liées à la source. */
  gainLinkedActivated?: boolean;
  /** Marvin : a les capacités activées (imprimées) des créatures correspondantes qui n'ont pas son nom. */
  gainActivatedFrom?: ObjectFilter;
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

/**
 * 614.1a : « si [un objet] devait être mis dans un cimetière, exilez-le à la place » (Rest in Peace, Leyline of the Void,
 * Garruk, The Darkness Crystal, Valgavoth…). Plusieurs remplacements : voir `replaceGraveyard` (replacement.ts, 616.1).
 */
export interface GraveyardReplacementAbilityDef {
  kind: "graveyardReplacement";
  /** Objets concernés, vus du contrôleur de la source (types, jetons, « contrôlée par un adversaire »…). */
  filter?: ObjectFilter;
  /** Seulement depuis le champ de bataille (« mourir »). */
  fromBattlefield?: boolean;
  /** Cimetière visé : celui du contrôleur de la source, ou celui d'un de ses adversaires ; tous par défaut. */
  graveyardOf?: "you" | "opponent";
  /** Seulement ce que le contrôleur de la source ne contrôlait pas (Valgavoth). */
  notControlledByYou?: boolean;
  /** La carte exilée est liée à la source : par identifiant (Valgavoth, jouable) ou par identité physique (Darkness Crystal). */
  link?: "object" | "uid";
  /** Le contrôleur de la source gagne ces points de vie. */
  gainLife?: number;
  condition?: Condition;
  label?: string;
}

/** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
export interface CastPermissionAbilityDef {
  kind: "castPermission";
  /** « Vous pouvez lancer des sorts comme s'ils avaient le flash. » */
  flash?: true;
  /** Omniscience : sorts de votre main sans payer leur coût de mana. */
  freeFromHand?: true;
  /** Omnipresence : seulement les sorts de valeur de mana ≤ nombre de créatures que vous contrôlez. */
  freeMaxManaValueCreatures?: true;
  /** Null Summoner : lancer les cartes liées exilées (mana de n'importe quel type), sous condition. */
  linkedCards?: true;
  /** Intrepid Paleontologist : seulement les cartes liées que vous possédez et qui correspondent (mana ordinaire). */
  linkedFilter?: ObjectFilter;
  /** … et le permanent arrive avec un marqueur de finalité. */
  linkedFinality?: true;
  condition?: Condition;
  /** Tinybones : pendant votre tour, jouer les cartes exilées avec un marqueur de butin que vous ne possédez pas (mana de n'importe quel type). */
  stash?: true;
  /** Muldrotha : pendant votre tour, un terrain et un sort de permanent de chaque type depuis votre cimetière. */
  graveyardPermanentTypes?: true;
  label?: string;
}

/** Capacité statique qui s'applique à des joueurs (défense talismanique, « ne peut pas perdre »…). */
export interface PlayerStaticAbilityDef {
  kind: "playerStatic";
  /** Hall of Echoes : la règle des légendes ne s'applique pas à vos permanents. */
  noLegendRule?: boolean;
  /** Jace's Machinations : capacités de loyauté de vos Jace à vitesse d'éphémère. */
  jaceLoyaltyInstant?: boolean;
  /** Screaming Nemesis : vous ne pouvez pas gagner de points de vie. */
  cantGainLife?: boolean;
  /** Molten Tide : chaque Montagne engagée pour du mana en produit N {R} de plus. */
  extraMountainMana?: number;
  /** Taii Wakeen : les blessures non de combat de vos sources sont augmentées de N. */
  noncombatDamageBonusAll?: number;
  /** Theorist's Proxy : votre prochain sort ne peut pas être contrecarré (usage unique). */
  nextSpellUncounterable?: boolean;
  /** Pit Automaton : votre prochaine capacité d'exhaust est copiée (usage unique). */
  copyNextExhaust?: boolean;
  /** Lightning, Army of One : les blessures infligées à vous ou à vos permanents sont doublées. */
  damageTakenDoubled?: boolean;
  /** Sandswirl Wanderglyph : vous ne pouvez pas attaquer ce joueur (ni ses planeswalkers). */
  cantAttackPlayer?: PlayerId;
  /** The Tomb of Aclazotz : lancer un sort de créature depuis votre cimetière (usage unique ; finalité, Vampire). */
  castCreatureFromGraveyard?: boolean;
  /** Summon: Alexander : les blessures qui seraient infligées à vos créatures sont prévenues. */
  creaturesDamageImmune?: boolean;
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
  /** « Vous pouvez lancer des sorts d'artefact depuis votre cimetière en payant N PV en plus ; ils arrivent avec un marqueur de finalité » (Noctis). */
  artifactsFromGraveyardLife?: number;
  /** « Vous pouvez jouer des cartes depuis votre cimetière » (Hades, Sorcerer of Eld, avec `condition`). */
  playFromGraveyard?: boolean;
  /** « Les terrains que vous contrôlez arrivent dégagés » (The Wandering Minstrel). */
  landsEnterUntapped?: boolean;
  /** « Vous pouvez jouer la carte du dessus de votre bibliothèque » (The Lunar Whale, avec `condition`). */
  playTopCard?: boolean;
  /** « Chaque fois que vous engagez un terrain pour {C}, ajoutez {C} de plus » (Ultima, Origin of Oblivion). */
  extraColorlessFromLands?: boolean;
  /** « Vous avez la protection contre chacun de vos adversaires » (702.16j, Absolute Virtue). */
  protectionFromOpponents?: boolean;
  /** Seulement les cartes correspondantes (Traveling Chocobo : terrains et Oiseaux). */
  playTopFilter?: ObjectFilter;
  /** Traveling Chocobo : l'arrivée d'un de ces permanents fait se déclencher vos capacités une fois de plus. */
  doubleEnterTriggersFor?: ObjectFilter;
  /** « Ces jetons plus un jeton [X] sont créés à la place » (Quina, Qu Gourmet). */
  extraToken?: TokenSpec;
  /** « La première fois que vous lancez des pièces chaque tour, vous gagnez ces lancers » (Edgar, King of Figaro). */
  winFirstCoinFlips?: boolean;
  /** « Si un adversaire devait meuler des cartes, il en meule autant plus N à la place » (The Water Crystal). */
  opponentMillExtra?: number;
  /** « Les joueurs ne peuvent pas gagner de points de vie » (s'applique à tous les joueurs). */
  noLifeGainForAll?: boolean;
  /** « Les éphémères et rituels que vous contrôlez ne peuvent pas être contrecarrés. » */
  protectSpells?: boolean;
  /** Vizier of the Menagerie : lancer des créatures du dessus de sa bibliothèque (mana de n'importe quel type). */
  castCreaturesFromTop?: boolean;
  /** Yoshimaru : des marqueurs +1/+1 mis sur vos créatures : un de plus. */
  plusOneCounterBonus?: boolean;
  /** Tomik, Izzet Sparkmage : blessures non de combat de vos sources à un adversaire ou à ses permanents : +1. */
  noncombatDamageBonus?: boolean;
  /** Karn, Argent Defender (s'applique à tous) : l'arrivée d'artefacts et de créatures ne déclenche rien. */
  noEntersTriggers?: boolean;
  /** Yuriko, Blade of the Mighty (s'applique à tous) : pendant le combat, ni sorts ni capacités (hors mana). */
  noSpellsDuringCombat?: boolean;
  /** Starfield Vocalist : les capacités déclenchées de vos permanents par une arrivée se déclenchent une fois de plus. */
  doubleEnterTriggers?: boolean;
  /** Quantum Riddler : avec une carte en main ou moins, vous piochez une carte de plus. */
  drawPlusOneWhenHandSmall?: boolean;
  /** Mm'menon, the Right Hand : regarder la carte du dessus et lancer des sorts d'artefact depuis le dessus. */
  castArtifactsFromTop?: boolean;
  /** Weftwalking (s'applique à tous) : le premier sort de chaque joueur pendant son tour peut être lancé sans payer. */
  firstSpellFree?: boolean;
  /** Frenzied Baloth : vos sorts de créature ne peuvent pas être contrecarrés ; les blessures de combat ne peuvent pas être prévenues (tous). */
  protectCreatureSpells?: boolean;
  combatDamageUnpreventable?: boolean;
  /** Icetill Explorer : jouer des terrains depuis votre cimetière. */
  playLandsFromGraveyard?: boolean;
  /** Tannuk, Steadfast Second : les cartes de votre main correspondant au filtre ont la distorsion à ce coût. */
  grantWarp?: { filter: ObjectFilter; cost: ManaCost };
  /** Tapestry Warden : vos créatures dont l'endurance dépasse la force stationnent selon leur endurance. */
  stationByToughness?: boolean;
  /** Tomik, Orzhov Lawmage : au plus une créature peut attaquer chacun de vos planeswalkers à chaque combat. */
  walkersMaxOneAttacker?: boolean;
  /** Draconic Visitor : les jetons d'artefact que vous devriez créer sont remplacés par ce jeton. */
  replaceArtifactTokens?: TokenSpec;
  /** Samut, Tyrant of Naktamun : « les éphémères et rituels que vous contrôlez ont le second partagé ». */
  splitSecondInstantsSorceries?: boolean;
  /** Moonlit Meditation : la première fois de chaque tour, vos jetons sont des copies du permanent enchanté. */
  tokensAsCopiesOfAttached?: boolean;
  /** « Max speed — … » : la capacité ne s'applique que si la condition est remplie. */
  condition?: Condition;
  /** Vnwxt, Verbose Host : « si vous deviez piocher une carte, piochez-en deux à la place ». */
  drawDouble?: boolean;
  /** Far Fortune : les blessures de vos sources à un adversaire ou à ses permanents : +1. */
  damagePlusOneToOpponents?: boolean;
  /** Grand Abolisher : pendant votre tour, vos adversaires ne lancent pas de sorts ni n'activent de capacités d'artefacts, de créatures ou d'enchantements. */
  lockOpponentsOnYourTurn?: boolean;
  /** Worldwalker Helm : vos jetons d'artefact sont accompagnés d'un jeton Carte. */
  extraMapToken?: TokenSpec;
  /** Torpor Orb (tous) : l'arrivée de créatures ne déclenche rien. */
  noCreatureEntersTriggers?: boolean;
  /** Fblthp, Lost on the Range : vous pouvez regarder la carte du dessus de votre bibliothèque à tout moment. */
  lookAtTopCard?: boolean;
  /** Archangel of Tithes : les créatures ne peuvent vous attaquer que si leur contrôleur paie {1} pour chacune. */
  attackTax?: number;
  /** Archangel of Tithes (attaquant) : les créatures adverses ne bloquent que si leur contrôleur paie {1} pour chacune. */
  blockTax?: number;
  /** High Noon (tous les joueurs) : un seul sort par joueur et par tour. */
  oneSpellPerTurn?: boolean;
  /** Doc Aurlock : comploter des cartes de votre main coûte {N} de moins. */
  plotReduction?: number;
  /** Annie Joins Up : les capacités déclenchées de vos créatures légendaires se déclenchent une fois de plus. */
  doubleLegendaryTriggers?: boolean;
  /** Terror of the Peaks : les sorts adverses qui ciblent cette créature coûtent N PV de plus. */
  targetLifeTax?: number;
  /** Eriette, the Beguiler : vos Auras attachées à un permanent non-terrain adverse de VM inférieure ou égale en prennent le contrôle. */
  auraStealsCheaper?: boolean;
  /** Roxanne : quand vous engagez un jeton d'artefact pour du mana, un mana de plus de ce type. */
  artifactTokenManaBonus?: boolean;
  /** Boom Scholar : les capacités d'exhaust de vos autres permanents coûtent {N} de moins. */
  exhaustReduction?: number;
  /** Mutagen Man : les capacités activées de vos permanents correspondant au filtre coûtent {N} de moins. */
  activatedReduction?: { filter: ObjectFilter; n: number };
  /** Elvish Refueler : pendant votre tour, tant qu'aucune capacité d'exhaust n'a été activée, elles sont réactivables. */
  exhaustReuse?: boolean;
  /** Sanctum Lurker : vos planeswalkers ne vont pas au cimetière faute de loyauté. */
  walkersSurviveZeroLoyalty?: boolean;
  /** Fractured Realm : les capacités déclenchées de vos permanents se déclenchent une fois de plus. */
  doubleTriggers?: boolean;
  /** Dazzling Theater : vos sorts de créature ont la convocation. */
  convokeCreatureSpells?: boolean;
  /** Prop Room : vos créatures se dégagent pendant l'étape de dégagement des autres joueurs. */
  untapCreaturesOnOthersUntap?: boolean;
  /** Inquisitive Glimmer : déverrouiller une porte vous coûte {N} de moins. */
  unlockReduction?: number;
  /** The Mindskinner : les blessures de vos sources à un adversaire sont prévenues ; chaque adversaire meule autant. */
  damageToOpponentsMills?: boolean;
  /** Nowhere to Run : les créatures adverses sont ciblables malgré la défense talismanique ; leur garde ne se déclenche pas. */
  ignoreOpponentsHexproofWard?: boolean;
  /** Grievous Wound : le joueur enchanté ne peut pas gagner de points de vie. */
  enchantedPlayerCantGainLife?: boolean;
  /** Warped Space : une fois par tour, un sort lancé depuis l'exil peut l'être en payant {0}. */
  freeFromExileOncePerTurn?: boolean;
  /** Leyline of Mutation : coût alternatif pour tous vos sorts. */
  altCostAll?: ManaCost;
  /** Winter, Misanthropic Guide : taille de main maximale de chaque adversaire (évaluée pour le contrôleur). */
  opponentMaxHandSize?: Amount;
  /** Valgavoth : pendant votre tour, jouer les cartes liées à la source ; un sort ainsi lancé coûte des PV égaux à sa VM. */
  playLinkedPayLife?: boolean;
  /** Found Footage : vous pouvez regarder les créatures face cachée de vos adversaires à tout moment. */
  seeFaceDown?: boolean;
  /** Marina Vendrell's Grimoire : vous ne perdez pas la partie pour avoir 0 point de vie ou moins. */
  noLoseForLife?: boolean;
  /** Artist's Talent : blessures non de combat de vos sources à un adversaire ou à ses permanents : +N. */
  noncombatDamageBonusAmount?: number;
  /** Sunspine Lynx (tous) : les blessures ne peuvent pas être prévenues. */
  damageUnpreventable?: boolean;
  /** Festival of Embers : lancer des éphémères et des rituels depuis votre cimetière en payant N PV en plus. */
  instantsSorceriesFromGraveyardLife?: number;
  /** Valley Floodcaller : les sorts correspondants ont le flash. */
  flashFor?: ObjectFilter;
  /** Valley Flamecaller : les blessures de vos sources correspondantes : +1. */
  damagePlusOneFrom?: ObjectFilter;
  /** Osteomancer Adept : lancer des sorts de créature depuis votre cimetière en fourrageant (marqueur de finalité). */
  creaturesFromGraveyardForage?: boolean;
  /** Ojer Axonil : une source rouge que vous contrôlez inflige à un adversaire au moins autant de blessures non de combat que la force de la source de cette capacité. */
  noncombatDamageAtLeastPower?: boolean;
  /** Bloodletter of Aclazotz : pendant votre tour, un adversaire qui perd des points de vie en perd le double. */
  doubleOpponentLifeLossYourTurn?: boolean;
  /** Roaming Throne : les capacités déclenchées des autres créatures correspondantes que vous contrôlez se déclenchent une fois de plus. */
  doubleTriggersFor?: ObjectFilter;
  /** Twists and Turns : « si une créature que vous contrôlez devait explorer, regardez 1 d'abord ». */
  scryBeforeExplore?: boolean;
  /** Kutzil, Malamet Exemplar : « vos adversaires ne peuvent pas lancer de sorts pendant votre tour ». */
  opponentsCantCastYourTurn?: boolean;
  /** Sandswirl Wanderglyph : « chaque adversaire qui vous a attaqué ce tour-ci ne peut pas lancer de sorts ». */
  attackersCantCast?: boolean;
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
  /** Ojer Taq : « trois fois plus de jetons de créature ». */
  creatureTokensTriple?: boolean;
  counters?: boolean;
  /** Blessures d'une source que vous contrôlez à un adversaire ou à un permanent adverse. */
  damageToOpponents?: boolean;
  /** Blessures infligées par une créature que vous contrôlez, à n'importe quoi (Gratuitous Violence). */
  creatureDamage?: boolean;
  /** « Si vous deviez gagner des points de vie, vous en gagnez le double à la place » (The Wind Crystal). */
  lifeGain?: boolean;
  /** Blessures infligées par une source correspondante que vous contrôlez, doublées (Trance Kuja : vos Sorciers). */
  damageFilter?: ObjectFilter;
  /** Marqueurs doublés seulement sur les permanents correspondants (Loading Zone). */
  countersFilter?: ObjectFilter;
  /** Blessures non de combat de vos sources (The Rollercrusher Ride), à n'importe quel permanent ou joueur. */
  noncombatDamage?: boolean;
  /** Seulement si la condition est remplie (délire). */
  condition?: Condition;
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
  /** F/E multipliées par le nombre de cartes du cimetière du contrôleur correspondant au filtre (Winter). */
  perGraveyard?: ObjectFilter;
  /** … par tranche de N cartes (Dark Matter Manipulator : « pour chaque tranche de sept cartes »). */
  perDivisor?: number;
  /** F/E multipliées par la vitesse du contrôleur (Samut, the Driving Force). */
  perSpeed?: boolean;
  /** F/E multipliées par les points de vie du contrôleur (The Last Ride). */
  perLife?: boolean;
  /** F/E multipliées par le nombre de cartes dans la main du contrôleur (Stingerback Terror). */
  perHand?: boolean;
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
  /** « Choisissez un mode qui n'a pas déjà été choisi » (Demonic Pact) ; `turn` : ce tour-ci (Monument to Endurance). */
  uniqueModes?: boolean | "turn";
  /** « une ou plusieurs … » : une seule occurrence en attente à la fois (même lot d'événements). */
  batched?: boolean;
  /** Garde (702.21) : Nowhere to Run l'empêche de se déclencher. */
  ward?: boolean;
  label?: string;
}
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
  /** F/E définies par une capacité (Beau : le nombre de terrains que vous contrôlez). */
  cdaPT?: Amount;
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
  /** Types et sous-types remplacés (« c'est un enchantement ; ce n'est pas une créature », Duskmourn). */
  setTypes?: CardType[];
  setSubtypes?: string[];
  /** Arrive transformé (verso d'une carte recto-verso). */
  transformed?: boolean;
  /** Engagé et attaquant (Chorale of the Void) : il attaque le joueur qu'attaque une de vos créatures. */
  attacking?: boolean;
  /** Avec `libraryTop` : N-ième depuis le dessus (Riptide Gearhulk : 3). */
  fromTop?: number;
  /** Avec `libraryTop` : « mélangez-le dans la bibliothèque de son propriétaire ». */
  shuffle?: boolean;
}
