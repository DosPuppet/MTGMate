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
  ObjectId,
  PlayerId,
  TargetSpec,
  TriggerSpec,
  TurnLogQuery,
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
  kickerCost?: {
    sacrifice?: ObjectFilter;
    bounce?: ObjectFilter;
    blight?: number;
    tapPower?: number;
    collectEvidence?: number;
    /** « Exilez N cartes de votre cimetière ou payez [mana] » (Soaring Stoneglider), avec `kickerOrPay`. */
    exileGraveyard?: number;
    /** « Payez N points de vie ou payez [mana] » (Redirect Lightning), avec `kickerOrPay`. */
    life?: number;
  };
  /**
   * X du sort payé autrement qu'en mana, en coût additionnel : « payez X points de vie » (`life`, Vicious Rivalry),
   * « flétrissez X » (`blight`, Soul Immolation : X au plus la plus grande endurance parmi vos créatures ; la créature
   * est choisie comme pour un coût de capacité, `blightTarget`).
   */
  xCost?: "life" | "blight" | "waterbend";
  /**
   * Maîtrise de l'eau en coût additionnel du sort (Avatar) : « waterbend {N} » (`waterbend: N`), « waterbend {X} »
   * (`xCost: "waterbend"`), ou facultatif « you may waterbend {N} » (le kicker, `kickerKind: "waterbend"`). Ce mana-là
   * peut être payé en engageant des artefacts et créatures dégagés ({1} chacun).
   */
  waterbend?: number;
  /**
   * Coût additionnel obligatoire « flétrissez N ou payez [mana] » (Wild Unraveling, Bogslither's Embrace) : le kicker
   * sans mana (`kickerCost.blight`) ou, s'il n'est pas payé, ce mana.
   */
  kickerOrPay?: ManaCost;
  /** Web-slinging (Spider-Man) : coût alternatif (dans `altCost`), en renvoyant en main une créature engagée. */
  webSlinging?: ManaCost;
  /** Storied (Le Hobbit) : son contrôleur peut acquérir un récit durable (voir `stateBasedActions`). */
  storied?: boolean;
  /** Faufilement (Sneak, Tortues Ninja) : coût alternatif (dans `altCost`), en renvoyant un attaquant non bloqué. */
  sneak?: ManaCost;
  /** Chaos (Mayhem, Spider-Man) : lançable depuis le cimetière pour ce coût si elle a été défaussée ce tour-ci. */
  mayhem?: ManaCost;
  /** Paradigme (Strixhaven) : exilée à la résolution ; une copie gratuite au début de chacune de vos phases principales. */
  paradigm?: boolean;
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
  /** « Ce sort ne peut pas être copié » (Choreographed Sparks). */
  cantBeCopied?: boolean;
  /** « Ce sort coûte [mana] de plus pour chaque cible au-delà de la première » (Officious Interrogation). */
  costPerExtraTarget?: ManaCost;
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
    /** Les permanents à sacrifier : non-terrains (Valgavoth), créatures (Vein Ripper). */
    sacrificeFilter?: ObjectFilter;
    /** « Garde — Réunissez des preuves N » (Axebane Ferox). */
    collectEvidence?: number;
    /** « Garde — Maîtrise de l'eau {N} » (The Unagi of Kyoshi Island) : le mana de la garde est un coût de maîtrise de l'eau. */
    waterbend?: boolean;
    /** « Garde — Recevez N marqueurs poison » (The Serpent Society). */
    poison?: number;
    /** « Garde — Défaussez une carte ou payez [mana] » (Titania) : `discard` ou ce mana, au choix. */
    orMana?: ManaCost;
  };
  /** Coûts en plus du coût de flashback (Twinned Vision : « défaussez une carte » ; Group Project : « engagez trois créatures »). */
  flashbackCost?: AdditionalCost;
  /** « En coût additionnel pour lancer ce sort, … » (601.2b, 601.2h). */
  additionalCost?: AdditionalCost;
  /** « Ce sort coûte {N} de moins à lancer [si…] » (601.2f). */
  /** « Ce sort coûte {N} de moins si… » ; `colored` : symboles colorés retirés aussi (Brush Off : {1}{U}). */
  costReduction?: { generic: Amount; colored?: ManaCost["colored"]; condition?: Condition };
  /** Coût alternatif (« vous pouvez payer {B} plutôt que le coût de mana de ce sort si… »). */
  altCost?: { mana: ManaCost; condition: Condition; label: string; forage?: boolean };
  /** F/E définies par une capacité (604.3, couche 7a), ex. cartes dans les cimetières adverses. */
  cdaPT?: Amount;
  /** « En arrivant, choisissez un type de créature / une couleur » (614.12). */
  chooseOnEnter?: "creatureType" | "color" | "cardName" | "landName" | "landType" | "parity" | "mode" | "number";
  /** Sièges (TDM) : « en arrivant, choisissez Abzan ou Mardu » (avec `chooseOnEnter: "mode"`) ; lu par `cond.chosenMode`. */
  enterModes?: string[];
  /**
   * Dévorer (702.82) : « en arrivant, sacrifiez des [terrains] ; N marqueurs +1/+1 par permanent sacrifié ».
   * `graveyardUpToX` : « exilez jusqu'à X cartes de votre cimetière » à la place (Mimeoplasm, cartes liées).
   */
  devour?: { filter: ObjectFilter; n: number; graveyardUpToX?: boolean };
  /** Cloud, Planet's Champion : « les capacités d'équipement que vous activez qui la ciblent coûtent {N} de moins ». */
  equipDiscountWhenTargeted?: number;
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
  /** Copie à l'arrivée « sauf que son nom est [le sien] » (Chameleon, Master of Disguise). */
  entersAsCopyKeepName?: boolean;
  /**
   * Superior Spider-Man (Échange d'esprit) : peut arriver comme copie d'une carte de créature d'un cimetière, sauf son nom
   * et ses F/E (`entersAsCopyAddSubtypes` pour les types en plus) ; la carte copiée est exilée.
   */
  entersAsCopyOfGraveyard?: { filter: ObjectFilter; name?: string; power?: number; toughness?: number };
  /** Plot (702.170) : coût de l'action spéciale « complotez cette carte » (lu dans le texte). */
  plot?: ManaCost;
  /** Présage (702.143) : coût pour lancer la carte présagée à un tour ultérieur (lu dans le texte). */
  foretell?: ManaCost;
  /** Skyseer's Chariot : les capacités activées des sources du nom choisi coûtent {N} de plus (au lieu d'être interdites). */
  chosenNameTax?: number;
  /** « Vous pouvez lancer cette carte depuis votre cimetière [si…] » (Lightwheel Enhancements : vitesse maximale). */
  /** Lançable depuis le cimetière ; `discard` : en défaussant autant de cartes en plus (Alien Symbiosis). */
  castFromGraveyard?: { condition?: Condition; payLife?: number; sacrifice?: ObjectFilter; discard?: number; finality?: boolean };
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
  /** « Ce coût est réduit de {1} pour chaque… » (Fugitive Codebreaker) : réduction du coût de déguisement. */
  disguiseReduction?: Amount;
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
  kickerKind?: "offspring" | "gift" | "bargain" | "blight" | "teamwork" | "evidence" | "exileGraveyard" | "waterbend" | "life";
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
  | GraveyardReplacementAbilityDef
  | EventReplacementAbilityDef;

export interface AdditionalCost {
  discard?: number;
  /** « Défaussez une carte ou payez N points de vie » (Bitter Triumph) : sans défausse, le joueur paie ces PV. */
  discardOrLife?: number;
  /** « Défaussez une carte ou payez [mana] » (Titania) : sans défausse, ce mana s'ajoute au coût. */
  discardOrPay?: ManaCost;
  /** « Défaussez une carte ou sacrifiez un permanent » (Souls of the Lost) : un permanent choisi est sacrifié. */
  /** « … ou sacrifiez un permanent » ; un filtre : « … ou sacrifiez un artefact » (Demand Answers). */
  discardOrSacrifice?: boolean | ObjectFilter;
  /** Réunir des preuves X, X étant la valeur de mana totale des permanents ciblés (Urgent Necropsy). */
  collectEvidenceTargetsManaValue?: boolean;
  /**
   * Choisis automatiquement (Duskmourn) : permanents exilés (liés au permanent), renvoyés, engagés ; cartes du cimetière
   * exilées. `fromHand` : « contemplez un [type] et exilez-le » (Lorwyn Eclipsed) : un permanent que vous contrôlez ou
   * une carte de votre main.
   */
  exile?: { filter: ObjectFilter; count: number; fromHand?: boolean };
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
  /** S'applique aux sorts des adversaires (Thalia, the Survivor : générique négatif = taxe) ; `everyone` : à ceux de
   * tous les joueurs (Arachne, Psionic Weaver). */
  opponents?: boolean;
  everyone?: boolean;
  /** Réduction variable (affinité pour les artefacts : Sami, Wildcat Captain), ajoutée à `generic`. */
  genericAmount?: Amount;
  /** Seulement si la condition est remplie (Uthros Psionicist : « le deuxième sort que vous lancez chaque tour »). */
  condition?: Condition;
  /** Seulement pour les sorts lancés depuis ces zones (Aven Interrupter, Doc Aurlock : cimetière ou exil). */
  fromZones?: ("graveyard" | "exile")[];
  label?: string;
}

/** Usage permis d'un mana restreint (capacité de mana, ou mana ajouté par un effet : Ashling, Rimebound). */
export interface ManaRestriction {
  spell?: ObjectFilter;
  abilityOfCreature?: ObjectFilter;
  abilityOfSource?: ObjectFilter;
  notSpellFromHand?: boolean;
  spellNotFromHand?: boolean;
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
  restriction?: ManaRestriction;
  /** Gene Pollinator : « engagez un permanent dégagé que vous contrôlez » en plus de {T} (choisi automatiquement). */
  /** `"creature"` : une créature dégagée (Springleaf Drum). */
  tapAnother?: boolean | "creature";
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
  /** Dragonfire Blade : « coûte {1} de moins par couleur de la créature ciblée ». */
  reduceByTargetColors?: boolean;
  /** Capacité d'équipement (Kíli : la première de chaque tour peut coûter {0}). */
  equip?: boolean;
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
  /** `includeSelf` : la source peut faire partie des permanents sacrifiés (Rat King : « sacrifiez trois Rats »). */
  sacrifice?: { filter: ObjectFilter; count: number; includeSelf?: boolean };
  /** Flétrir N (ECL) : N marqueurs −1/−1 sur une créature que vous contrôlez (choisie automatiquement : `blightTarget`). */
  blight?: number;
  /** Réunir des preuves N (701.59, MKM) : cartes du cimetière de valeur de mana totale N ou plus (choisies automatiquement). */
  collectEvidence?: number;
  /**
   * Maîtrise de l'eau (Avatar) : le coût de mana est un coût « waterbend » ; en le payant, chaque artefact ou créature
   * dégagé que vous contrôlez peut être engagé pour payer {1} (choisi par le solveur, comme la convocation).
   */
  waterbend?: boolean;
  /** « X ne peut pas être 0 » : plus petite valeur de X permise (Katara, Water Tribe's Hope ; Gogo, Master of Mimicry). */
  minX?: number;
  /** Les preuves exilées sont liées à la source (Kylox's Voltstrider : « parmi les cartes exilées avec lui »). */
  linkEvidence?: boolean;
  /**
   * Retirer des marqueurs de la source. `kind: "any"` : « retirez N marqueurs de cette créature », de n'importe quelle
   * sorte (ECL), retirés par le moteur : les −1/−1 d'abord, les +1/+1 en dernier.
   */
  removeCounters?: { kind: string; n: number };
  /**
   * « Exilez un nombre quelconque de cartes [couleur] de votre cimetière avec N symboles de mana [couleur] ou plus parmi
   * leurs coûts » (Baron Helmut Zemo : vantardise) : choisies automatiquement (le moins de cartes), notées dans
   * `costExiled`.
   */
  exileGraveyardSymbols?: { color: ManaType; n: number };
  /** « Retirez un nombre quelconque de marqueurs [sorte] de cette créature » : X marqueurs (The Astonishing Ant-Man). */
  removeCountersX?: string;
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
  /** Retirer `n` marqueurs (1 par défaut) parmi des permanents correspondants que vous contrôlez (Iron Spider : deux). */
  removeCounterFrom?: { filter: ObjectFilter; kind: string; n?: number };
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
  /** « Payez X points de vie » (Krumar Initiate), X étant celui de la capacité. */
  payLifeX?: boolean;
  /** Défausser N cartes (choisies par le joueur ; par défaut les premières de la main). */
  discard?: number;
  /** … seulement des cartes correspondantes (Lluwen : « défaussez une carte de terrain »). */
  discardFilter?: ObjectFilter;
  /** Ninjutsu : renvoyer en main un attaquant non bloqué que vous contrôlez (choisi automatiquement : le plus faible). */
  returnUnblockedAttacker?: boolean;
  /** « Renvoyez [un permanent] que vous contrôlez dans la main de son propriétaire » (Urban Retreat : une créature
   * engagée) ; choisi par le joueur (`bounce`), sinon le moins cher. */
  bounceOther?: ObjectFilter;
  /** « Exilez [un permanent] que vous contrôlez » (The Soul Stone : une créature), le moins cher par défaut. */
  exileOther?: ObjectFilter;
  /** Fourrager (701.61) : exiler trois cartes de votre cimetière ou sacrifier une Nourriture (choix automatique). */
  forage?: boolean;
}
/** Modifications apportées par un effet continu, rangées par couche (613). */
/**
 * Règle de blocage d'une créature (couche 6, famille R4.1) : « ne peut pas être bloquée par [filtre] », « ne peut
 * bloquer que [filtre] », nombre de bloqueurs, « ne peut ni attaquer ni bloquer seule ». `label` : badge affiché.
 */
export interface BlockRule {
  /** Les bloqueurs qui correspondent au filtre ne peuvent pas la bloquer. */
  cantBeBlockedBy?: ObjectFilter;
  /** Elle ne peut bloquer qu'un attaquant qui correspond au filtre. */
  canBlockOnly?: ObjectFilter;
  /** Bloquée par au moins / au plus N créatures. */
  minBlockers?: number;
  maxBlockers?: number;
  /** Ne peut ni attaquer ni bloquer seule (Toby, Beastie Befriender). */
  notAlone?: boolean;
  /**
   * Ne peut pas attaquer ce joueur ni ses planeswalkers. Dans un script : `cantAttackSourceController` (Eriette of the
   * Charmed Apple : « ne peut pas vous attaquer »), remplacé par le contrôleur de la source quand la statique s'applique.
   */
  cantAttackPlayer?: PlayerId;
  cantAttackSourceController?: boolean;
  /**
   * Exigence de blocage (509.1c) : elle bloque ce tour-ci si possible (Culvert Ambusher, Hustle), ou bloque cet attaquant
   * si possible (Tolsimir : `mustBlockEventObject` dans un script, remplacé à la résolution par l'objet de l'événement).
   */
  mustBlock?: boolean;
  mustBlockAttacker?: ObjectId;
  mustBlockEventObject?: boolean;
  label: string;
}

/**
 * Protection (702.16) ou défense talismanique (702.11d) contre une qualité, décrite par un filtre sur la source (le
 * sort, ou la source de la capacité ou des blessures ; famille R4.2). Protection contre tout : filtre vide.
 */
export interface ProtectionRule {
  from: ObjectFilter;
  /** Défense talismanique : seulement contre le ciblage par un adversaire. Sinon protection (DEBT). */
  hexproofOnly?: boolean;
  label: string;
}

/**
 * « Utilise son endurance (ou une force modifiée) pour … » (famille R4.3) : blessures de combat (Ghalta, Loot, the
 * Anomaly), équipage et selle (pilotes, Interface Ace), station (Tapestry Warden).
 */
export interface PowerRule {
  uses: ("combatDamage" | "crew" | "station")[];
  /** L'endurance à la place de la force : toujours, ou seulement si elle est plus grande. */
  toughness?: "always" | "ifGreater";
  /** La valeur absolue d'une force négative. */
  absolute?: boolean;
  /** Comme si sa force était supérieure de N. */
  bonus?: number;
  label: string;
}

export interface LayerMods {
  /**
   * Couche 7c : `power`/`toughness` multipliés, pour chaque objet touché, par son nombre de types de créature, au plus
   * cette valeur (Diligent Zookeeper : « +1/+1 pour chacun de ses types de créature, au maximum 10 » ; changelin : tous).
   */
  perOwnCreatureTypes?: number;
  /** Couche 6 : règles « utilise son endurance pour » accordées. */
  addPowerRules?: PowerRule[];
  /** Couche 6 : protections et défenses talismaniques « contre [filtre] » accordées. */
  addProtections?: ProtectionRule[];
  /** Couche 6 : capacités (non mots-clés) accordées. */
  addAbilities?: AbilityDef[];
  /** Couche 6 : règles de blocage accordées. */
  addBlockRules?: BlockRule[];
  /** Couche 4 : types et sous-types ajoutés. */
  addTypes?: CardType[];
  addSubtypes?: string[];
  /** Couche 4 : surtypes ajoutés (« sauf que c'est légendaire »). */
  addSupertypes?: string[];
  /** Supertypes retirés (« sauf qu'elle n'est pas légendaire », The Apprentice's Folly, Yenna). */
  removeSupertypes?: string[];
  /** Couche 4 : types remplacés (« est un terrain et perd tous ses autres types »), sous-types remplacés. */
  setTypes?: CardType[];
  setSubtypes?: string[];
  /** Nom remplacé (Witness Protection). */
  setName?: string;
  /** Couche 5 : couleurs remplacées ; `addColors` : « en plus de ses autres couleurs ». */
  setColors?: Color[];
  /** « Le terrain enchanté est de la couleur choisie » (Shimmerwilds Growth) : la couleur choisie par la source. */
  setColorsChosen?: boolean;
  addColors?: Color[];
  /** Couche 4 : a tous les types de créature (Soulstone Sanctuary, changelin). */
  allCreatureTypes?: boolean;
  /** Couche 4 : a en plus le type de terrain de base choisi par la source (Multiversal Passage). */
  addChosenLandType?: boolean;
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
  /**
   * Territory Forge : a les capacités activées des cartes liées à la source ; `triggered` : aussi leurs capacités
   * déclenchées ; `chosenName` : seulement la carte liée dont le nom a été choisi en dernier (Koh, the Face Stealer).
   */
  gainLinkedActivated?: boolean | { triggered?: boolean; chosenName?: boolean };
  /** Marvin : a les capacités activées (imprimées) des créatures correspondantes qui n'ont pas son nom. */
  gainActivatedFrom?: ObjectFilter;
  /** Les capacités activées des cartes correspondantes du cimetière de son contrôleur (Thranduil, the Elvenking). */
  gainActivatedFromGraveyard?: ObjectFilter;
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
  /** Head of the Hunt : « quand vous le faites, créez [ce jeton] » (créé aussitôt). */
  createToken?: TokenSpec;
  condition?: Condition;
  label?: string;
}

/**
 * Remplacement ou prévention d'un événement chiffré (614, 615, 616 ; famille E et F de PLAN-R, lot R1) : blessures ou
 * perte de points de vie, vues du contrôleur du remplacement. Imprimé : `EventReplacementAbilityDef` ; temporaire :
 * effet de joueur (`fx.thisTurn({ replacement })`) ; bouclier « la prochaine fois que » (615.7) : effet à usage unique.
 */
export interface EventReplacement {
  /**
   * L'événement chiffré : blessures et perte de PV (familles E et F) ; jetons créés et marqueurs mis (famille H) ; PV
   * gagnés, cartes piochées, cartes meulées, mana produit (famille I) ; `untap` : un permanent qui se dégage (seule la
   * prévention s'y applique : Blossombind, « ne peut pas être dégagée ») ; `payLife` : des PV payés (Ashiok, Wicked
   * Manipulator : `instead.exileFromLibrary`, autant de cartes du dessus de la bibliothèque exilées à la place).
   */
  /** `connive` : une créature va comploter ; `modify.add` : son contrôleur pioche d'abord autant de cartes (Leader). */
  event: "damage" | "lifeLoss" | "lifeGain" | "draw" | "mill" | "counters" | "tokens" | "mana" | "untap" | "payLife" | "connive";
  /** Source des blessures (filtre vu du contrôleur : `controller: "you"` pour « vos sources ») ; mana : le permanent engagé. */
  source?: ObjectFilter;
  /**
   * Joueur concerné, vu du contrôleur : lui (`you`), lui ou ses permanents (`yourSide`), un adversaire (`opponent`), un
   * adversaire ou ses permanents (`opponentSide`) ; absent : tous. Blessures : le blessé ; perte ou gain de PV, pioche,
   * meule : le joueur ; marqueurs : le contrôleur du permanent ; jetons : celui qui les crée ; mana : celui qui engage.
   */
  to?: "you" | "yourSide" | "opponent" | "opponentSide";
  /** Seulement un permanent correspondant : blessé (Summon: Alexander), qui reçoit les marqueurs ; jetons : le jeton créé. */
  toFilter?: ObjectFilter;
  /** Marqueurs : seulement cette sorte (« +1/+1 »). */
  counter?: string;
  /** Marqueurs : pas ceux mis pour payer un coût (Doubling Season : « si un effet devait mettre des marqueurs »). */
  effectOnly?: boolean;
  /**
   * Jetons : d'autres jetons à la place (Draconic Visitor : un Dragon 5/5) ou des copies du permanent auquel la source est
   * attachée (Moonlit Meditation, Mirrormind Crown) ; `firstEachTurn` : seulement la première fois de chaque tour.
   */
  instead?: { token?: TokenSpec; copyOfAttached?: boolean; firstEachTurn?: boolean; exileFromLibrary?: boolean };
  /** Jetons : « ces jetons plus un jeton [N] » (Quina : une Grenouille ; Worldwalker Helm : une Carte). */
  plus?: TokenSpec;
  /**
   * Mana : seulement quand ce type est produit (Ultima : un terrain engagé pour {C}) ; le mana ajouté en plus est du même
   * type (`same`, par défaut), de la couleur choisie par la source (`chosen`, Shimmerwilds Growth) ou de ce type.
   */
  manaProduced?: ManaType;
  /** `any` : un mana de n'importe quelle couleur (Buried in the Garden) — approché : la couleur du mana produit. */
  extraMana?: "same" | "chosen" | "any" | ManaType;
  /** true : seulement les blessures de combat ; false : seulement les autres. */
  combat?: boolean;
  /** « autant plus N », « le double », « au moins la force de [la source du remplacement] », « prévenez-les ». */
  /**
   * `addSourceCounters` : en plus, autant que de marqueurs de ce type sur la source du remplacement (Fated Firepower :
   * « plus le nombre de marqueurs de feu sur cet enchantement »).
   */
  modify: {
    add?: number;
    addSourceCounters?: string;
    /** En plus, autant que la force de la source du remplacement (Hawkeye, Young Avenger). */
    addSourcePower?: boolean;
    times?: number;
    atLeastSourcePower?: boolean;
    prevent?: boolean;
  };
  /** Après une prévention : chaque adversaire du contrôleur meule autant (The Mindskinner) ; capacité réflexive
   * « quand des blessures sont prévenues ainsi » (New Way Forward : `amount.eventAmount` et `ref.eventObject`, la source) ;
   * autant de marqueurs de ce type sur la source du remplacement, dans le même remplacement (Anti-Venom). */
  onPrevent?: { opponentsMill?: boolean; reflexive?: Effect[]; counters?: string };
  /** Blessures : infligées à la place au permanent auquel la source est attachée (With Great Power). */
  redirectToAttached?: boolean;
  /** Bouclier : seulement cette source, choisie à la création (`sourceDefIs` pour un sort sans objet). */
  sourceIs?: ObjectId;
  sourceDefIs?: string;
  /** Bouclier : l'objet qui l'a créé (source de la capacité réflexive). */
  origin?: { id: ObjectId; defId: string };
}

/** Remplacement d'un événement chiffré imprimé sur un permanent (« si une source que vous contrôlez devait… »). */
export interface EventReplacementAbilityDef extends EventReplacement {
  kind: "eventReplacement";
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
  /** Seulement les sorts correspondants (Dracogenesis : « vous pouvez lancer des sorts de Dragon sans payer »). */
  freeFilter?: ObjectFilter;
  /** Une fois par tour (Zaffai and the Tempests) ; `condition` : seulement quand elle est remplie (pendant votre tour). */
  freeOncePerTurn?: true;
  /** Omnipresence : seulement les sorts de valeur de mana ≤ nombre de créatures que vous contrôlez. */
  freeMaxManaValueCreatures?: true;
  /** Null Summoner : lancer les cartes liées exilées (mana de n'importe quel type), sous condition. */
  linkedCards?: true;
  /**
   * Hama, the Bloodbender : les cartes liées se lancent en maîtrisant l'eau {X} plutôt qu'en payant leur coût de mana,
   * X étant leur valeur de mana.
   */
  linkedWaterbend?: true;
  /** Intrepid Paleontologist : seulement les cartes liées que vous possédez et qui correspondent (mana ordinaire). */
  linkedFilter?: ObjectFilter;
  /** … et le permanent arrive avec un marqueur de finalité. */
  linkedFinality?: true;
  /**
   * Variantes des cartes liées (Lorwyn Eclipsed) : de n'importe quel propriétaire (`linkedAnyOwner`, Maralen) ; sans
   * payer le coût de mana (`linkedFree`) ; valeur de mana au plus ce montant (`linkedMaxManaValue`) ; une fois par tour
   * (`linkedOncePerTurn`) ; seulement les cartes exilées ce tour-ci (`linkedThisTurn`) ; en retirant N marqueurs parmi
   * vos créatures (`linkedRemoveCounters`, Dawnhand Dissident).
   */
  linkedAnyOwner?: true;
  linkedFree?: true;
  linkedMaxManaValue?: Amount;
  linkedOncePerTurn?: true;
  linkedThisTurn?: true;
  linkedRemoveCounters?: number;
  /** … avec du mana de n'importe quel type (Taster of Wares). */
  linkedAnyMana?: true;
  condition?: Condition;
  /** Tinybones : pendant votre tour, jouer les cartes exilées avec un marqueur de butin que vous ne possédez pas (mana de n'importe quel type). */
  stash?: true;
  /** Muldrotha : pendant votre tour, un terrain et un sort de permanent de chaque type depuis votre cimetière. */
  graveyardPermanentTypes?: true;
  label?: string;
}

/**
 * « Le prochain sort [correspondant] que vous lancez ce tour-ci… » (famille N, R4.6) : copié (Teach by Example),
 * incontrecarrable (Theorist's Proxy), avec des marqueurs ou la célérité à l'arrivée (Summon: Fenrir).
 */
export interface NextSpell {
  filter?: ObjectFilter;
  copy?: boolean;
  /** La copie n'est pas légendaire (The Clone Saga). */
  copyNonlegendary?: boolean;
  /** Réduction du coût générique de ce sort (Don & Raph : l'affinité pour les artefacts, `amount.count(…)`). */
  reduce?: Amount;
  uncounterable?: boolean;
  counters?: number;
  haste?: boolean;
}

/**
 * Restriction de lancer (famille D, R4.5), vue du joueur qui a la statique : qui est concerné, quand, et ce qui est
 * interdit (tous les sorts, au-delà de N par tour, ou ceux lancés d'ailleurs que de la main).
 */
export interface CastLimit {
  who: "you" | "opponents" | "each";
  /** Seulement pendant le tour du joueur de la statique, ou pendant le combat. */
  during?: "yourTurn" | "combat";
  /** Seulement les adversaires qui ont attaqué le joueur de la statique ce tour-ci (Sandswirl Wanderglyph). */
  attackedYou?: boolean;
  /** Au plus N sorts par tour (High Noon : 1). */
  maxSpells?: number;
  /** Seulement les sorts lancés d'ailleurs que de la main (Avatar's Wrath). */
  exceptFromHand?: boolean;
  /** Seulement retourner des permanents face visible (Karlov Watchdog) : ni les sorts ni les capacités ne sont bloqués. */
  faceUp?: boolean;
  /** Bloque aussi les capacités activées (hors mana) : toutes (Yuriko), ou d'artefacts, de créatures et d'enchantements (Grand Abolisher). */
  abilities?: "all" | "artifactsCreaturesEnchantments";
}

/**
 * Déclenchements modifiés (famille G, R4.5) : une fois de plus (Fractured Realm, Starfield Vocalist, Annie Joins Up,
 * Roaming Throne, Traveling Chocobo) ou jamais (Torpor Orb, Karn, Argent Defender).
 */
export interface TriggerMod {
  effect: "again" | "none";
  /** Seulement les déclenchements dus à l'arrivée d'un permanent, qui correspond à `entering`. */
  onEnter?: boolean;
  /** Seulement les déclenchements dus à une créature qui attaque (« chaque fois que … attaque », « … que vous attaquez »). */
  onAttack?: boolean;
  entering?: ObjectFilter;
  /** Seulement les déclenchements dus à la mort d'une créature (The Masamune). */
  onDies?: boolean;
  /**
   * Capacités concernées : celles des permanents correspondants (par défaut, vos permanents). `attachedToSource` : le
   * permanent auquel la source de la statique est attachée, y compris s'il vient de quitter le champ de bataille.
   */
  sources?: ObjectFilter;
  /** Aussi les capacités de vos emblèmes (The Masamune : « … ou d'un emblème que vous possédez »). */
  emblems?: boolean;
  /** Concerne les capacités de tous les joueurs (Torpor Orb). */
  everyone?: boolean;
}

/**
 * Modificateur de coût des capacités activées (famille A, R4.4) : {N} de moins, ou {0} pour la première de ce tour.
 */
export interface AbilityCostMod {
  /** Capacités concernées : exhaust, Équiper, déverrouiller une porte, comploter ; sinon toutes. */
  ability?: "exhaust" | "equip" | "unlock" | "plot" | "powerUp";
  /** Sources concernées (Mutagen Man : vos jetons d'artefact). */
  source?: ObjectFilter;
  /** Pas les capacités de la source de la statique (Boom Scholar : « vos autres permanents »). */
  notSelf?: boolean;
  reduce?: number;
  /**
   * Réduction variable, évaluée pour la source de la statique (Agatha of the Vile Cauldron : sa force) ; `minOneMana` :
   * le coût en mana ne descend pas sous un mana.
   */
  reduceAmount?: Amount;
  minOneMana?: boolean;
  /**
   * Le mana se dépense pour ces capacités comme s'il était de n'importe quel type (Agatha's Soul Cauldron : capacités
   * des créatures que vous contrôlez).
   */
  anyMana?: boolean;
  /** La première de ces capacités activée ce tour-ci coûte {0} (Kíli the Resourceful, Équiper). */
  firstThisTurnFree?: boolean;
}

/**
 * Permission de jouer depuis une zone (famille C, R4.4) : les cartes de son cimetière ou la carte du dessus de sa
 * bibliothèque, qui correspondent au filtre, se jouent (terrains) ou se lancent (sorts), avec d'éventuels coûts ou
 * effets en plus.
 */
export interface PlayFromZone {
  zone: "graveyard" | "libraryTop";
  filter?: ObjectFilter;
  /** Terrains, sorts, ou les deux (par défaut). */
  what?: "lands" | "spells";
  /** Points de vie payés en plus (Noctis, Festival of Embers). */
  payLife?: number;
  /** Fourrager en plus (Osteomancer Adept). */
  forage?: boolean;
  /** Le permanent arrive avec un marqueur de finalité. */
  finality?: boolean;
  /** Du mana de n'importe quel type (Vizier of the Menagerie). */
  anyMana?: boolean;
  /** Sous-types en plus à l'arrivée (The Tomb of Aclazotz : Vampire). */
  addSubtypes?: string[];
  /** Une fois par tour (Johann, Apprentice Sorcerer) ; `onceKey` : posé par le moteur, la permission utilisée. */
  oncePerTurn?: boolean;
  onceKey?: string;
  /**
   * La carte a le flashback (Iroh, Grand Lotus) : lancée depuis le cimetière, puis exilée ; son coût est `cost`, sinon
   * son coût de mana.
   */
  flashback?: boolean;
  /** Un sort de créature lancé ainsi arrive avec N marqueurs +1/+1 de plus (Mikey & Don, Party Planners). */
  counters?: number;
  /** Faufilement donné (Ninja Teen : « vos cartes de créature du cimetière ont le faufilement {3}{B} ») : la carte se
   * lance pour ce coût pendant la fenêtre de faufilement, en renvoyant un attaquant non bloqué. */
  sneak?: ManaCost;
  /** « Payez des PV égaux à sa valeur de mana plutôt que son coût de mana » (Gwenom, Remorseless). */
  payLifeManaValue?: boolean;
  /** La carte a le chaos (Goblin Formula) : lancée depuis le cimetière pour son coût de chaos, son coût de mana. */
  mayhem?: boolean;
  cost?: ManaCost;
}

/** Capacité statique qui s'applique à des joueurs (défense talismanique, « ne peut pas perdre »…). */
export interface PlayerStaticAbilityDef {
  /** Jouer ou lancer des cartes depuis le cimetière ou le dessus de la bibliothèque (famille C, R4.4). */
  playFrom?: PlayFromZone;
  /** Coût des capacités activées modifié (famille A, R4.4). */
  abilityCost?: AbilityCostMod;
  /** Restriction de lancer des sorts (et d'activer des capacités) (famille D, R4.5). */
  castLimit?: CastLimit;
  /**
   * Coût des sorts correspondants : {N} de moins (`reduce`, Goblin Maskmaker : « vos sorts face cachée lancés ce
   * tour-ci ») ; le mana se dépense comme s'il était de n'importe quelle couleur (`anyMana`, Case File Auditor) ; des
   * symboles colorés de moins (`reduceSymbols`, Aang, Master of Elements : « {W}{U}{B}{R}{G} de moins »), chacun retirant
   * un symbole de sa couleur, sinon {1} du générique (601.2f).
   */
  spellCost?: { filter: ObjectFilter; reduce?: number; anyMana?: boolean; reduceSymbols?: ManaCost["colored"] };
  /** Déclenchements doublés ou supprimés (famille G, R4.5). */
  triggerMod?: TriggerMod;
  /** Remplacement ou prévention d'un événement chiffré, posé par un effet (familles E et F, R1). */
  replacement?: EventReplacement;
  /** « Le prochain sort que vous lancez ce tour-ci… » (famille N, R4.6), posé par un effet à usage unique. */
  nextSpell?: NextSpell;
  kind: "playerStatic";
  /** Hall of Echoes : la règle des légendes ne s'applique pas à vos permanents ; seulement à ceux-ci (Spider-Verse : vos
   * Araignées). */
  noLegendRule?: boolean | ObjectFilter;
  /** Jace's Machinations : capacités de loyauté de vos Jace à vitesse d'éphémère. */
  jaceLoyaltyInstant?: boolean;
  /** Screaming Nemesis : vous ne pouvez pas gagner de points de vie. */
  cantGainLife?: boolean;
  /** Pit Automaton : votre prochaine capacité d'exhaust est copiée (usage unique). */
  copyNextExhaust?: boolean;
  /** Sandswirl Wanderglyph : vous ne pouvez pas attaquer ce joueur (ni ses planeswalkers). */
  cantAttackPlayer?: PlayerId;
  /** « Vous avez la défense talismanique. » */
  hexproof?: boolean;
  /** « Vous ne pouvez pas perdre la partie et vos adversaires ne peuvent pas la gagner. » */
  cantLose?: boolean;
  /** « Vous n'avez pas de taille de main maximale. » */
  noMaxHandSize?: boolean;
  /** Mots-clés des sorts correspondants que le joueur contrôle (Lo and Li : « vos sorts de Leçon ont le lien de vie »). */
  spellKeywords?: { filter: ObjectFilter; keywords: Keyword[] };
  /**
   * Mana non dépensé (500.4) : ces types ne se vident pas à la fin des étapes et des phases (The Last Agni Kai, posé par
   * `fx.thisTurn`) ; `becomes` : il devient de ce type au lieu de se vider (Ozai, the Phoenix King).
   */
  keepUnspentMana?: { types?: ManaType[]; becomes?: ManaType };
  /** « Vous pouvez jouer un terrain supplémentaire lors de chacun de vos tours. » */
  extraLands?: number;
  /** « Les terrains que vous contrôlez arrivent dégagés » (The Wandering Minstrel). */
  landsEnterUntapped?: boolean;
  /** « Vous avez la protection contre chacun de vos adversaires » (702.16j, Absolute Virtue). */
  protectionFromOpponents?: boolean;
  /** « La première fois que vous lancez des pièces chaque tour, vous gagnez ces lancers » (Edgar, King of Figaro). */
  winFirstCoinFlips?: boolean;
  /**
   * « [Les sorts] que vous contrôlez ne peuvent pas être contrecarrés » (`filter` : éphémères et rituels, Sphinx of the
   * Final Word ; créatures, Frenzied Baloth ; absent : tous, Chimil) ; `abilities` : les capacités non plus ; `everyone` :
   * ceux de tous les joueurs (Spider-Punk : « les sorts et les capacités ne peuvent pas être contrecarrés »).
   */
  uncounterable?: { filter?: ObjectFilter; abilities?: boolean; everyone?: boolean };
  /** Weftwalking (s'applique à tous) : le premier sort de chaque joueur pendant son tour peut être lancé sans payer. */
  firstSpellFree?: boolean;
  /** Frenzied Baloth : les blessures de combat ne peuvent pas être prévenues (tous). */
  combatDamageUnpreventable?: boolean;
  /** Tannuk, Steadfast Second : les cartes de votre main correspondant au filtre ont la distorsion à ce coût. */
  grantWarp?: { filter: ObjectFilter; cost: ManaCost };
  /** Tomik, Orzhov Lawmage : au plus une créature peut attaquer chacun de vos planeswalkers à chaque combat. */
  walkersMaxOneAttacker?: boolean;
  /** « Max speed — … » : la capacité ne s'applique que si la condition est remplie. */
  condition?: Condition;
  /** Fblthp, Lost on the Range : vous pouvez regarder la carte du dessus de votre bibliothèque à tout moment. */
  lookAtTopCard?: boolean;
  /** Archangel of Tithes : les créatures ne peuvent vous attaquer que si leur contrôleur paie {1} pour chacune. */
  attackTax?: number;
  /** Archangel of Tithes (attaquant) : les créatures adverses ne bloquent que si leur contrôleur paie {1} pour chacune. */
  blockTax?: number;
  /** Terror of the Peaks : les sorts adverses qui ciblent cette créature coûtent N PV de plus. */
  targetLifeTax?: number;
  /** Eriette, the Beguiler : vos Auras attachées à un permanent non-terrain adverse de VM inférieure ou égale en prennent le contrôle. */
  auraStealsCheaper?: boolean;
  /** Elvish Refueler : pendant votre tour, tant qu'aucune capacité d'exhaust n'a été activée, elles sont réactivables. */
  exhaustReuse?: boolean;
  /** Shang-Chi : les capacités des créatures correspondantes s'activent comme si elles avaient la célérité (pas l'attaque). */
  activateAsThoughHaste?: ObjectFilter;
  /** Wonder Man, Hollywood Hero : chaque montée en puissance de vos permanents peut être activée N fois de plus. */
  powerUpExtraUses?: number;
  /** Récit durable (Storied, Le Hobbit) : acquis pour le reste de la partie (effet de joueur permanent). */
  enduringStory?: boolean;
  /** Ral Zarek : « passe son prochain tour » (un effet par tour passé, consommé). */
  skipTurn?: boolean;
  /** Sanctum Lurker : vos planeswalkers ne vont pas au cimetière faute de loyauté. */
  walkersSurviveZeroLoyalty?: boolean;
  /** Prop Room : vos créatures se dégagent pendant l'étape de dégagement des autres joueurs. */
  untapCreaturesOnOthersUntap?: boolean;
  /** Nowhere to Run : les créatures adverses sont ciblables malgré la défense talismanique ; leur garde ne se déclenche pas. */
  ignoreOpponentsHexproofWard?: boolean;
  /** Grievous Wound : le joueur enchanté ne peut pas gagner de points de vie. */
  enchantedPlayerCantGainLife?: boolean;
  /** Warped Space : une fois par tour, un sort lancé depuis l'exil peut l'être en payant {0}. */
  freeFromExileOncePerTurn?: boolean;
  /** Leyline of Mutation : coût alternatif pour tous vos sorts. */
  /**
   * Coût alternatif de vos sorts : un coût de mana (Leyline of Mutation : {W}{U}{B}{R}{G}) ou réunir des preuves N
   * (Conspiracy Unraveler : 10) « plutôt que payer le coût de mana » ; seulement les sorts correspondant à `filter`, et
   * avec `webSlinging` en renvoyant une créature engagée (Amazing Spider-Man : « Web-slinging {G}{W}{U} »).
   */
  altCostAll?: { mana?: ManaCost; collectEvidence?: number; filter?: ObjectFilter; webSlinging?: boolean };
  /** Winter, Misanthropic Guide : taille de main maximale de chaque adversaire (évaluée pour le contrôleur). */
  opponentMaxHandSize?: Amount;
  /** Valgavoth : pendant votre tour, jouer les cartes liées à la source ; un sort ainsi lancé coûte des PV égaux à sa VM. */
  playLinkedPayLife?: boolean;
  /** Found Footage : vous pouvez regarder les créatures face cachée de vos adversaires à tout moment. */
  seeFaceDown?: boolean;
  /** Marina Vendrell's Grimoire : vous ne perdez pas la partie pour avoir 0 point de vie ou moins. */
  noLoseForLife?: boolean;
  /** Sunspine Lynx (tous) : les blessures ne peuvent pas être prévenues. */
  damageUnpreventable?: boolean;
  /** Twists and Turns : « si une créature que vous contrôlez devait explorer, regardez 1 d'abord ». */
  scryBeforeExplore?: boolean;
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
  /** F/E multipliées par un compte du journal du tour (Kinbinding : « créatures arrivées sous votre contrôle ce tour-ci »). */
  perTurnEvents?: TurnLogQuery;
  /**
   * F/E multipliées par un montant calculé comme une F/E définie par une capacité (Earthen Ally : « pour chaque couleur
   * parmi les Alliés que vous contrôlez ») : montants lisibles pendant les couches (`colorsAmong`, `count`…).
   */
  perAmount?: Amount;
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
  /** « Cette capacité ne se déclenche qu'une fois par tour. » ; `ifDone` : « faites ceci une seule fois par tour » (elle se
   * déclenche tant que l'effet n'a pas été fait, `fx.doneOncePerTurn` le note ; Spider-Verse). */
  oncePerTurn?: boolean | "ifDone";
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
  /** Jeton Aura (Rôles de Wilds of Eldraine) : ce qu'il peut enchanter. */
  enchant?: CardDef["enchant"];
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
  /** Sur le champ de bataille enveloppé d'une cape (701.58 : face cachée, 2/2, garde {2}) (Vannifar). */
  cloak?: boolean;
  /**
   * Exilée face cachée (406.3) : qui peut la regarder — le contrôleur de l'effet (« vous pouvez la regarder »), son
   * propriétaire (présage) ou personne (Doomsday Excruciator).
   */
  faceDown?: "you" | "owner" | "nobody";
}
