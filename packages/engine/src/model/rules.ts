/** Types du moteur — Filtres, cibles, déclencheurs, conditions, références et montants. Réexportés par `types.ts`. */
import type { CardType, Color, Keyword, ManaType, Step, TurnLogQuery, Zone } from "../types";

export interface TargetSpec {
  id: string;
  filter: TargetFilter;
  /** Valeur de mana totale des cibles au plus égale à N (Scout for Survivors). */
  maxTotalManaValue?: number;
  /** « jusqu'à une cible » */
  optional?: boolean;
  label?: string;
  /** Nombre de cibles pour ce mot « cible » (« jusqu'à deux créatures ciblées ») ; 1 par défaut. */
  count?: number;
  /** Nombre minimal de cibles quand `count` > 1 (« une ou deux cibles » : 1) ; `count` par défaut. */
  minCount?: number;
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
  /** Les cibles partagent un type de créature (Unbury : « deux cartes de créature ciblées qui partagent un type »). */
  shareCreatureType?: boolean;
  /** Nombre de cibles variable (« jusqu'à X créatures ciblées ») : remplace `count` au moment de choisir les cibles. */
  countAmount?: Amount;
  /** Filtre si le sort est kické ou si le cadeau est promis (« à la place, un permanent non-terrain ciblé »). */
  kickedFilter?: TargetFilter;
  /** Valeur de mana exacte évaluée quand la capacité réflexive est mise sur la pile (Wishing Well). */
  manaValueAmount?: Amount;
  /** Exactement X cibles, X étant choisi pour le sort ou la capacité (Rot-Curse Rakshasa : « X créatures ciblées »). */
  countX?: boolean;
}

export interface TargetFilter {
  players?: "any" | "you" | "opponent";
  objects?: ObjectFilter;
  /** Cartes dans un cimetière (« carte de créature ciblée de votre cimetière »). */
  cards?: { filter: ObjectFilter; whose?: "you" | "opponent" | "any" };
  /** Cartes exilées face visible (Blade of the Swarm : « carte exilée ciblée avec la distorsion »). */
  /** `linked` : exilées « avec » la source (Mimeoplasm). */
  /** `own` : que vous possédez (`true`) ou non (`false`, Sentinel of Lost Lore). */
  exiled?: { filter?: ObjectFilter; withWarp?: boolean; own?: boolean; linked?: boolean };
  /** Sorts sur la pile (« contrecarrez le sort de créature ciblé »). */
  spells?: ObjectFilter;
  /** Sorts ou capacités sur la pile à cible unique (Bolt Bend). */
  stackItems?: { singleTarget?: boolean; abilitiesOnly?: boolean; triggeredOnly?: boolean };
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
  /** N'a pas le même nom qu'un autre permanent correspondant (« qu'un jeton que vous contrôlez », Yenna). */
  notSameNameAs?: ObjectFilter;
  /** Attaché à la source (« chaque Aura et Équipement attaché à Kellan », « une Aura attachée à cette créature »). */
  attachedToSelf?: boolean;
  /** De force supérieure à celle de la source (furtivité : « ne peut pas être bloquée par des créatures de force supérieure »). */
  powerAboveSource?: boolean;
  /** Créature équipée (au moins un Équipement attaché). */
  equipped?: boolean;
  /** Enchanté par au moins une Aura (`true`), par une Aura que vous contrôlez (`byYou`), ou par aucune (`false`). */
  enchanted?: boolean | "byYou";
  /** Était attaché à la source quand celle-ci a quitté le champ de bataille (Zack Fair). */
  wasAttachedToSource?: boolean;
  /** Véhicule équipé par la source ce tour-ci (Balthier and Fran). */
  crewedBySource?: boolean;
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
  /** Bloqueuse. */
  blocking?: boolean;
  /** Multicolore (au moins deux couleurs). */
  /** Nombre exact de couleurs (« monocolore » : 1). */
  colorCount?: number;
  /** Ne correspond pas à ce filtre. */
  not?: ObjectFilter;
  multicolored?: boolean;
  /** Sort dont le mana dépensé est inférieur à sa valeur de mana (Unravel). */
  manaSpentBelowValue?: boolean;
  /** A subi des blessures ce tour-ci. */
  damaged?: boolean;
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
  /** Valeur de mana au plus égale au mana dépensé pour lancer la source (Astelli Reclaimer). */
  maxManaValueManaSpent?: boolean;
  /** Légendaire (true) ou non légendaire (false). */
  legendary?: boolean;
  /** Sort préparé (copie lancée depuis l'exil, Codie). */
  preparedSpell?: boolean;
  /** Lancé pour son coût de distorsion. */
  warped?: boolean;
  /** Permanent préparé. */
  prepared?: boolean;
  /** A attaqué ce tour-ci. */
  attackedThisTurn?: boolean;
  maxToughness?: number;
  /** Valeur de mana au plus égale au X du sort qui a mis la source en jeu (Dune Drifter). */
  maxManaValueX?: boolean;
  /** Contrôlé mais pas possédé (Laughing Jasper Flint). */
  notOwned?: boolean;
  /** Sort modal (Riku of Many Paths). */
  modal?: boolean;
  /** Aucun mana n'a été dépensé pour le lancer (ou il n'a pas été lancé) : Satoru. */
  noManaSpent?: boolean;
  /** Aucun de ces sous-types (« non-hors-la-loi » : Shoot the Sheriff). */
  noneOfSubtypes?: string[];
  /** Carte sans capacité (Fang-Druid Summoner, Rise from the Wreck). */
  noAbilities?: boolean;
  /** Valeur de mana paire ou impaire (Mutinous Massacre ; 0 est pair). */
  manaValueParity?: "odd" | "even";
  /** Endurance au plus égale au X du sort (Zero Point Ballad), résolue pendant la résolution. */
  maxToughnessX?: boolean;
  /** Permanent face cachée (Duskmourn). */
  faceDown?: boolean;
  /** N'est pas le permanent auquel la source est attachée (« autre que la créature enchantée »). */
  notAttachedToSource?: boolean;
  /** Objet lié à la source (Turn Inside Out : « quand elle meurt ce tour-ci »). */
  linkedToSource?: boolean;
  /** Endurance supérieure à sa force (Fecund Greenshell). */
  toughnessAbovePower?: boolean;
  /** Force supérieure à sa force de base (Kutzil, Sovereign Okinec Ahau). */
  powerAboveBase?: boolean;
  /** A au moins une capacité activée, autre qu'une capacité de mana (The Enigma Jewel). */
  withActivatedAbility?: boolean;
  /** Valeur de mana égale au X de la capacité ou du sort (`destroyAll` : Dauntless Dismantler). */
  manaValueX?: boolean;
  /** Valeur de mana de la parité choisie par la source (Gollum, Riddle Master). */
  parityChosen?: boolean;
  /** Valeur de mana, force ou endurance égale au nombre choisi par la source (Talion, the Kindly Lord). */
  numberChosen?: boolean;
  /** Sans aucun marqueur (Heartless Act). */
  noCounters?: boolean;
  /** Du nom choisi par la source en arrivant (Petrified Hamlet : « les terrains du nom choisi »). */
  nameChosen?: boolean;
  /** Carte avec une Aventure (hors du champ de bataille : cimetière, main ; Hearth Elemental). */
  adventure?: boolean;
  /** Permanent arrivé en étant lancé (« si vous l'avez lancée » : The Sibsig Ceremony). */
  cast?: boolean;
  /** Force inférieure à celle de la source (Formation Breaker : « les créatures de force inférieure ne peuvent pas la bloquer »). */
  powerBelowSource?: boolean;
}

/**
 * Événement déclencheur (603). « self » : la source elle-même ; sinon un objet correspondant au filtre,
 * vu du contrôleur de la source.
 */
export type TriggerSpec =
  /**
   * `fromZone` : seulement un objet arrivé depuis cette zone, ou lancé depuis elle (Twilight Diviner : un cimetière ;
   * Extraordinary Journey : l'exil).
   */
  | { on: "enters"; who: "self" | ObjectFilter; fromZone?: "graveyard" | "exile" }
  | { on: "dies"; who: "self" | ObjectFilter }
  /** `to` : seulement vers cette zone (« quand cet artefact est mis au cimetière depuis le champ de bataille »). */
  /** `whileCrafting` : exilé comme matériau d'une fabrication (Market Gnome). */
  /** `who` filtre : « chaque fois qu'une créature que vous contrôlez avec un marqueur +1/+1 quitte le champ de bataille ». */
  | { on: "leaves"; who: "self" | "linked" | ObjectFilter; to?: Zone; whileCrafting?: boolean }
  /**
   * « Quand ce permanent se transforme en [cette face] » : porté par la face visée, il ne se déclenche que lorsque le
   * permanent devient cette face (les capacités sont lues après la transformation).
   */
  | { on: "transformsSelf" }
  /** « Chaque fois qu'un adversaire cherche dans sa bibliothèque » (Wan Shi Tong). */
  | { on: "search"; whose: "you" | "opponent" | "any" }
  /** « Quand un adversaire perd la partie » (Shinryu). */
  | { on: "playerLoses"; whose: "opponent" | "any" }
  /** `defending: "you"` : elle attaque le contrôleur ou un planeswalker qu'il contrôle. */
  /** « Chaque fois qu'un adversaire acquiert le contrôle d'un permanent qui était à vous » (Zidane). */
  | { on: "controlChange" }
  /** `alone` : « chaque fois qu'une créature que vous contrôlez attaque seule » (Squall, Seifer). */
  | { on: "attacks"; who: "self" | ObjectFilter; defending?: "you"; alone?: boolean }
  | { on: "dealsCombatDamage"; who: "self" | ObjectFilter; toPlayer?: boolean; toOpponent?: boolean }
  /** `targeting` : le sort cible un objet correspondant, ou un adversaire (`opponent`). */
  | {
      on: "castSpell";
      by: "you" | "opponent" | "any";
      filter?: ObjectFilter;
      /** `orFilter` : le sort correspond au filtre OU cible ce qui est indiqué (Danitha, Sword of Hope). */
      targeting?: { objects?: ObjectFilter; opponent?: boolean; orFilter?: boolean };
      /** « votre deuxième sort de chaque tour » : le N-ième sort lancé par ce joueur ce tour-ci. */
      nth?: number;
      /** « un sort avec une seule cible » (Spinerock Tyrant). */
      singleTarget?: boolean;
      /** « …, si ce n'est pas son tour » (Adrenaline Jockey, March of the World Ooze). */
      notTheirTurn?: boolean;
      /** Sort modal (Riku of Many Paths). */
      modal?: boolean;
      /** Lancé depuis ailleurs que la main (Kellan, the Kid). */
      notFromHand?: boolean;
      /** « …, si au moins N mana a été dépensé pour le lancer » (Final Fantasy). */
      minManaSpent?: number;
      /** « un sort qu'il ne possède pas » (Gonti, Night Minister). */
      notOwned?: boolean;
      /**
       * Alania : le premier sort de l'un de ces types (« Instant », « Sorcery ») ou sous-types (« Otter ») lancé ce tour-ci,
       * autre que la source.
       */
      firstOf?: string[];
      /** « en utilisant du mana produit par [cette source] » (Tecutlan, Barracks of the Thousand). */
      usingManaFromSelf?: boolean;
      /** Lancé depuis l'exil (Quintorius Kand). */
      fromExile?: boolean;
      /** Lancé depuis la main (Ojer Pakpatiq). */
      fromHand?: boolean;
    }
  | { on: "step"; step: Step; whose: "you" | "opponent" | "any" }
  | { on: "landfall" }
  /** « Chaque fois que vous gagnez des points de vie [pour la première fois ce tour] » */
  | { on: "gainLife"; first?: boolean }
  /** « Chaque fois que vous piochez [votre deuxième carte ce tour] » ; `whose` relatif au contrôleur. */
  | { on: "draw"; whose: "you" | "opponent" | "any"; nth?: number }
  | { on: "loseLife"; whose: "you" | "opponent" | "any" }
  /** « Chaque fois que vous attaquez [avec au moins N créatures] » */
  | { on: "attackWith"; min?: number; filter?: ObjectFilter }
  /** « Chaque fois que des marqueurs sont placés sur … » */
  /** `firstThisTurn` : « si c'est la première fois ce tour-ci que des marqueurs sont mis sur elle » (Stalwart Successor). */
  | { on: "countersPut"; who: "self" | ObjectFilter; kind?: string; firstThisTurn?: boolean }
  /** Blessures infligées par une source (non de combat seulement si demandé), éventuellement à un adversaire. */
  /** `anySourceYouControl` : toute source (sort compris) contrôlée par le contrôleur de la capacité (Niv-Mizzet). */
  | {
      on: "dealsDamage";
      who: "self" | ObjectFilter;
      noncombatOnly?: boolean;
      toOpponent?: boolean;
      anySourceYouControl?: boolean;
      /** Taii Wakeen : des blessures égales à l'endurance de la créature blessée. */
      exactToughness?: boolean;
      /**
       * Imodane : la source est un sort (filtré par `who`) qui ne cible qu'une seule créature, et les blessures sont
       * infligées à cette créature.
       */
      spellToSoleTarget?: boolean;
    }
  /** « Chaque fois qu'un adversaire défausse une carte » */
  | { on: "discard"; whose: "you" | "opponent" | "any" }
  /** « Chaque fois que [cette créature] devient la cible d'un sort ou d'une capacité [qu'un adversaire contrôle] » */
  /** `byYou` : un sort ou une capacité que le contrôleur de la source contrôle (Vaillance, Bloomburrow). */
  /** `spells` : les sorts correspondants aussi (« une créature ou un sort de créature que vous contrôlez », Surrak). */
  | {
      on: "becomesTarget";
      who: "self" | ObjectFilter;
      byOpponent?: boolean;
      bySpellYouControl?: boolean;
      byYou?: boolean;
      spells?: boolean;
    }
  /** « Chaque fois que [la créature équipée] se dégage » */
  | { on: "untaps"; who: "self" | ObjectFilter }
  /** « Chaque fois que [cette créature] devient engagée » */
  /** `byYou` : « chaque fois que vous engagez [une créature] » (Solitary Sanctuary : une créature adverse). */
  | { on: "taps"; who: "self" | ObjectFilter; byYou?: boolean }
  /** « Chaque fois que vous regardez (scry) ou surveillez » (Reality Fracture). */
  | { on: "scryOrSurveil" }
  /** « Quand vous défaussez cette carte » (se déclenche depuis le cimetière). */
  | { on: "discardSelf" }
  /** « Quand vous lancez ce sort » (la source est le sort sur la pile). */
  | { on: "castSelf" }
  /** Chapitre de Saga (714.2) : un marqueur de savoir fait atteindre ou dépasser l'un de ces chapitres. */
  | { on: "chapter"; chapters: number[] }
  /** « Quand cette Classe atteint le niveau N » (716). */
  | { on: "classLevel"; level: number }
  /** « Chaque fois qu'une [créature] explore [une carte de terrain / non-terrain] » (701.44). */
  | { on: "explores"; who: "self" | ObjectFilter; land?: boolean }
  /** « Chaque fois que vous sacrifiez [un permanent] » */
  | { on: "sacrifice"; anyPlayer?: boolean; byOpponent?: boolean; who: ObjectFilter }
  /** « Chaque fois que cette Monture devient montée » (702.171). */
  | { on: "saddled" }
  /** « Chaque fois que cette créature monte une Monture ou équipe un Véhicule [pendant votre phase principale] » ; l'objet de l'événement est la Monture ou le Véhicule. */
  | { on: "crews"; mainPhase?: boolean }
  /** « Quand cette créature est retournée face visible » ; `who` : « chaque fois qu'un permanent [filtre] est retourné face visible ». */
  | { on: "turnedFaceUp"; who?: ObjectFilter }
  /** « Chaque fois que le joueur enchanté subit des blessures » (Aura de joueur). */
  | { on: "attachedPlayerDamaged" }
  /** « Chaque fois qu'une [créature] devient bloquée » (Norin). */
  | { on: "becomesBlocked"; who: ObjectFilter }
  /** « Chaque fois que vous manifestez l'effroi » : l'objet de l'événement est la carte mise au cimetière. */
  | { on: "manifestDread" }
  /** « Quand vous déverrouillez cette porte » (Salle : `door` est fixé à l'import d'après la face). */
  | { on: "unlockDoor"; door?: number }
  /** Sinistre (Duskmourn) : « chaque fois qu'un enchantement que vous contrôlez arrive et chaque fois que vous déverrouillez entièrement une Salle ». */
  | { on: "eerie" }
  /** « Chaque fois que cette créature (ou la créature enchantée/équipée) subit des blessures » */
  /** Filtre : « chaque fois qu'une créature que vous contrôlez subit des blessures » (The Sensational She-Hulk). */
  | { on: "isDealtDamage"; who: "self" | "attached" | ObjectFilter }
  /** « Chaque fois qu'une ou plusieurs [créatures] subissent des blessures en excès [non de combat] » (120.4a). */
  | { on: "excessDamage"; who: ObjectFilter; noncombatOnly?: boolean }
  /** « Chaque fois qu'une ou plusieurs [créatures] infligent des blessures de combat à un joueur » : une fois par étape et par joueur. */
  | { on: "combatDamageBatch"; who: ObjectFilter }
  /** « Chaque fois qu'une [créature] bloque » */
  /** `eventObject: "attacker"` : l'objet de l'événement est l'attaquant bloqué (Skewer Slinger : « cette créature »). */
  | { on: "blocks"; who: "self" | ObjectFilter; attacker?: ObjectFilter; eventObject?: "attacker" }
  /** « Chaque fois que [créature] meurt ou est exilée » (depuis le champ de bataille). */
  | { on: "diesOrExiled"; who: "self" | ObjectFilter; minPower?: number }
  /** « Chaque fois que vous jouez un terrain » */
  | { on: "playLand" }
  /** « Chaque fois que [vous] défaussez une ou plusieurs cartes » (montant : leur nombre). */
  | { on: "discardBatch"; whose: "you" | "opponent" | "any" }
  /** « Quand vous cyclez cette carte » (depuis le cimetière ; montant : le X du coût de cycle). */
  | { on: "cycleSelf" }
  /** « Chaque fois que vous activez une capacité d'exhaust » */
  | { on: "exhaustActivated" }
  /** « Chaque fois que vous commettez un crime » (700.13) */
  | { on: "crime" }
  /** « Quand cette carte devient complotée » */
  | { on: "plottedSelf" }
  /** « Chaque fois que vous activez une capacité qui cible une créature ou un joueur » (Ertha Jo). */
  | { on: "activateTargeting" }
  /**
   * Une carte change de zone (Ketramose : « mises en exil depuis les cimetières et/ou le champ de bataille » ;
   * Dredger's Insight : « quittent votre cimetière »). `whose` : le propriétaire de la carte.
   */
  | { on: "zoneChange"; from: Zone[]; to?: Zone[]; filter?: ObjectFilter; whose?: "you" | "any" }
  /** « Chaque fois que vous activez une capacité de loyauté [en retirant au moins N marqueurs] » ; `byOpponent` : un adversaire l'active. */
  | { on: "loyaltyActivated"; minRemoved?: number; byOpponent?: boolean }
  /** Dépense N (Bloomburrow) : « chaque fois que vous dépensez votre N-ième mana total pour lancer des sorts pendant un tour ». */
  | { on: "expend"; n: number }
  /** « Chaque fois que vous fourragez » (Corpseberry Cultivator). */
  | { on: "forage" }
  /** « Chaque fois que vous offrez un cadeau » (Jolly Gerbils). */
  | { on: "gift" }
  /** « Chaque fois que vous gagnez ou perdez des points de vie » (Wax-Wane Witness). */
  | { on: "lifeChange" }
  /** « Chaque fois qu'une [créature] quitte le champ de bataille sans mourir » (Dour Port-Mage, Three Tree Scribe). */
  | { on: "leavesWithoutDying"; who: ObjectFilter }
  /** « Chaque fois que vous découvrez » (`amount.eventAmount` : la valeur N). */
  | { on: "discover" }
  /** « Chaque fois que vous activez une capacité qui n'est pas une capacité de mana » (l'objet : la capacité sur la pile). */
  | { on: "activateAbility" };

/** Conditions (« if intermédiaire » 603.4, « tant que »…). */
export type Condition =
  | { kind: "attackedThisTurn"; subtype?: string }
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
  /**
   * Celestial Reunion : vous pouvez contempler `count` créatures (vos créatures, cartes de créature de votre main) d'un
   * type que l'objet désigné a aussi (pendant la résolution).
   */
  | { kind: "beholdSharingType"; ref: Ref; count: number }
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
  | { kind: "creaturesDiedAtLeast"; n: number; underOpponent?: boolean }
  /** C'est la première étape de fin de ce tour (Y'shtola Rhul). */
  | { kind: "firstEndStep" }
  /** C'est la première phase de combat du tour (Genji Glove). */
  | { kind: "firstCombat" }
  /** Vous contrôlez une créature de force la plus grande ou à égalité (Summon: Fenrir). */
  | { kind: "controlsGreatestPower" }
  /** Un adversaire a subi des blessures non de combat ce tour-ci. */
  | { kind: "opponentDealtNoncombatDamage" }
  /** Le contrôleur a pioché au moins N cartes ce tour-ci. */
  | { kind: "drewAtLeast"; n: number }
  /** Le contrôleur a lancé au moins N sorts [non-créature] ce tour-ci. */
  | { kind: "castThisTurn"; n: number; noncreature?: boolean; exactly?: boolean }
  /** La source est préparée. */
  | { kind: "prepared" }
  /** « Contempler un Jace » : vous contrôlez un Jace ou vous avez une carte de Jace en main. */
  /** « Si {U}{U} a été dépensé pour le lancer » : au moins N mana de ce type dépensé pour lancer la source. */
  | { kind: "spentColor"; color: ManaType; n: number }
  /** Faufilement : étape de déclaration des bloqueurs, avec un attaquant non bloqué que vous contrôlez. */
  | { kind: "sneakWindow" }
  /** Vous avez un récit durable (Storied). */
  | { kind: "enduringStory" }
  /** Le sort qui se résout a été lancé pour son coût de faufilement. */
  | { kind: "sneaked" }
  /** La source a été exploitée (Harness) : ses capacités ∞ sont actives. */
  | { kind: "harnessed" }
  /** La source a été lancée pour son coût d'évocation. */
  | { kind: "evoked" }
  /** Contempler (701.63) : vous contrôlez un permanent correspondant, ou vous révélez une carte correspondante de votre main. */
  | { kind: "behold"; filter: ObjectFilter }
  /** Le contrôleur a activé une capacité de loyauté ce tour-ci. */
  | { kind: "activatedLoyaltyThisTurn" }
  /** Une seule créature attaque, et elle attaque un joueur (« attaque seule un joueur »). */
  | { kind: "attackingAlone" }
  /** Un adversaire a subi des blessures non de combat au tour précédent (Command the Stage). */
  | { kind: "opponentDealtNoncombatDamageLastTurn" }
  /** Le sort qui se résout a été lancé depuis la main / en flashback. */
  | { kind: "spellCastFromHand" }
  | { kind: "spellCastFromGraveyard" }
  /** La source a déjà infligé des blessures de combat (Ruric Thar, Magecrusher). */
  | { kind: "sourceDealtCombatDamage" }
  /** Sièges : la source a choisi ce mode en arrivant. */
  | { kind: "chosenMode"; mode: string }
  /** La source a déjà infligé des blessures, de combat ou non (Karakyk Guardian). */
  | { kind: "sourceDealtDamage" }
  /** Salle (709.5) : la porte N de la source est verrouillée ; toutes ses portes sont déverrouillées. */
  | { kind: "doorLocked"; door: number }
  /** Classe : la source est exactement à ce niveau. Affaire : la source est résolue. */
  | { kind: "classLevel"; level: number }
  /** Monture : la source a été montée ce tour-ci. */
  | { kind: "saddled" }
  /** Vide : un permanent non-terrain a quitté le champ de bataille ou un sort a été lancé avec la distorsion ce tour-ci. */
  | { kind: "void" }
  | { kind: "solved" }
  | { kind: "fullyUnlocked" }
  /** Un joueur (encore en partie) ne contrôle aucune créature (Sothera, the Supervoid). */
  | { kind: "playerWithoutCreatures" }
  /** Un adversaire a N points de vie ou moins (Bloodghast). */
  | { kind: "opponentLifeAtMost"; n: number }
  /** Vitesse maximale (4) ; `not` pour « un joueur qui n'a pas la vitesse maximale ». */
  | { kind: "maxSpeed" }
  /** Au moins N cartes en exil (Ketramose). */
  | { kind: "exileAtLeast"; n: number }
  /** Nombre total de marqueurs sur la source pair (Sab-Sunen). */
  | { kind: "evenCounters" }
  /** Vous avez commis un crime ce tour-ci. */
  | { kind: "crimeThisTurn" }
  /** C'est au moins votre N-ième tour (Jace Reawakened : « pas pendant vos trois premiers tours »). */
  | { kind: "turnsTakenAtLeast"; n: number }
  /** Le permanent source a été lancé depuis le cimetière (Undead Sprinter). */
  | { kind: "castFromGraveyard" }
  /** C'est cette étape (Smoky Lounge : « votre première phase principale »). */
  | { kind: "step"; step: Step }
  /** Une créature correspondant au filtre est morte ce tour-ci (Undead Sprinter : non-Zombie). */
  | { kind: "creatureDiedMatching"; filter: ObjectFilter }
  /** Le montant est un nombre premier (Zimone, All-Questioning). */
  | { kind: "prime"; amount: Amount }
  /** Un permanent est arrivé face cachée sous votre contrôle ou vous avez retourné un permanent face visible ce tour-ci. */
  | { kind: "faceDownOrUpThisTurn" }
  /** Au moins une des conditions. */
  | { kind: "any"; of: Condition[] }
  /** Un adversaire a plus de terrains, de points de vie, de créatures ou de cartes en main que vous (Beza). */
  | { kind: "opponentHasMore"; what: "lands" | "life" | "creatures" | "hand" }
  /** Vous avez perdu des points de vie ce tour-ci. */
  | { kind: "lostLifeThisTurn" }
  /** Le joueur désigné a perdu des points de vie ce tour-ci (évalué pendant la résolution). */
  | { kind: "refLostLife"; ref: Ref }
  /** Le joueur désigné a au plus N cartes en main (évalué pendant la résolution). */
  | { kind: "handAtMost"; ref: Ref; n: number }
  /** Une cible a été choisie pour ce mot « cible » (« jusqu'à une … »). */
  | { kind: "targetChosen"; spec: string }
  /** Vous avez sacrifié une Nourriture ce tour-ci (Bonecache Overseer). */
  /** Vous pouvez fourrager (trois cartes dans votre cimetière ou une Nourriture). */
  | { kind: "canForage" }
  /** Le joueur désigné (vous par défaut) a le plus de points de vie, ou est à égalité (Preacher of the Schism). */
  | { kind: "mostLife"; ref?: Ref };
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
  /** Cartes exilées « jusqu'à ce que » la source quitte le champ de bataille (Pinnacle Starcage). */
  | { kind: "exiledWith" }
  /** Les joueurs (encore en partie) qui n'ont pas la vitesse maximale (Outpace Oblivion). */
  | { kind: "playersWithoutMaxSpeed" }
  /** Carte du dessus de la bibliothèque de chaque joueur désigné. */
  | { kind: "libraryTop"; who: Ref }
  /** Cartes exilées face visible appartenant aux joueurs désignés (Binding Negotiation). */
  | { kind: "exiledCardsOf"; who: Ref }
  /** Toutes les cartes des cimetières (Lazav). */
  | { kind: "allGraveyards" }
  /** Sorts et capacités sur la pile contrôlés par les joueurs désignés (Glen Elendra's Answer), sauf celui qui se résout. */
  | { kind: "stackItemsOf"; who: Ref }
  /** Créatures qui ont monté ou équipé la source ce tour-ci (Fortune, Calamity, The Gitrog, Luxurious Locomotive). */
  | { kind: "crewedBy" }
  /** Permanents sacrifiés pour payer le coût de la capacité (Ayli). */
  | { kind: "costSacrificed" }
  /** Cartes défaussées pour payer le coût additionnel du sort (Grab the Prize). */
  | { kind: "costDiscarded" }
  /** Les objets désignés qui correspondent au filtre, dans n'importe quelle zone (Ghost Vacuum : les cartes de créature). */
  | { kind: "filtered"; ref: Ref; filter: ObjectFilter }
  /** Les objets de `ref` moins ceux de `exclude` (« toutes les autres créatures »). */
  | { kind: "except"; ref: Ref; exclude: Ref }
  /** Le joueur de l'événement (joueur blessé, lanceur du sort…). */
  | { kind: "eventPlayer" }
  /** Le contrôleur (ou, hors du champ de bataille, le dernier contrôleur connu) de l'objet désigné. */
  | { kind: "controllerOf"; ref: Ref }
  /** Objets déplacés plus tôt pendant la résolution (`store` d'un déplacement), sous leur nouvel identifiant. */
  | { kind: "stored"; name: string }
  /** Permanents correspondants contrôlés par le joueur désigné (« chaque créature que le joueur ciblé contrôle »). */
  | { kind: "permanentsOf"; player: Ref; filter: ObjectFilter }
  /** Cartes en main d'un joueur, de valeur de mana au plus `maxManaValue` (Buster Sword). */
  | { kind: "handOf"; player: Ref; filter: ObjectFilter; maxManaValue?: Amount }
  /** Le joueur défenseur de la source attaquante (celui qui contrôle le planeswalker attaqué). */
  | { kind: "defendingPlayer" }
  /** Réunion de références, sans doublon (Call the Spirit Dragons : les Dragons choisis pour chaque couleur). */
  | { kind: "union"; of: Ref[] };

export type Amount =
  | number
  | { kind: "x" }
  | { kind: "kicked"; yes: number; no: number }
  | { kind: "powerOf"; ref: Ref }
  /** Quantité de l'événement (blessures infligées, vie gagnée…). */
  | { kind: "eventAmount" }
  /** Nombre d'objets correspondant au filtre, vus du contrôleur (sur le champ de bataille par défaut). */
  | {
      kind: "count";
      filter: ObjectFilter;
      zone?: "battlefield" | "graveyard" | "hand" | "exile";
      whose?: "you" | "opponents" | "all";
    }
  /** Vie gagnée par le contrôleur ce tour-ci. */
  | { kind: "lifeGainedThisTurn" }
  /** Marqueurs d'un type sur un objet. */
  | { kind: "countersOn"; ref: Ref; counter: string }
  /** Nombre de valeurs de mana différentes parmi les permanents non-terrains du contrôleur. */
  | { kind: "differentManaValues" }
  /** Vivid (ECL) : nombre de couleurs parmi les permanents correspondants (vus du contrôleur). */
  | { kind: "colorsAmong"; filter: ObjectFilter }
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
  /** Blessures marquées sur la source (dernières informations connues : Tangled Colony, « les blessures subies ce tour-ci »). */
  | { kind: "lkiDamage" }
  | { kind: "manaValueOf"; ref: Ref }
  /** Convergence : nombre de couleurs de mana dépensées pour lancer la source (le sort qui se résout). */
  | { kind: "colorsSpent" }
  | { kind: "toughnessOf"; ref: Ref }
  /** Nombre de couleurs de l'objet (Ramos). */
  | { kind: "colorsOf"; ref: Ref }
  /** Plus grande force parmi les permanents correspondants. */
  | { kind: "maxPower"; filter: ObjectFilter }
  /** Nombre de noms différents parmi les permanents correspondants (Maze's End). */
  | { kind: "distinctNames"; filter: ObjectFilter }
  /** Nombre de cartes dans une zone du contrôleur. */
  | { kind: "cardsIn"; zone: "hand" | "graveyard" | "library" }
  /** Points de vie perdus ce tour-ci par le contrôleur (Rowan, Scion of War). */
  | { kind: "lifeLostThisTurn" }
  /** Domaine : types de terrains de base parmi les terrains du contrôleur. */
  | { kind: "basicLandTypes" }
  /** Marqueurs d'un type parmi les permanents correspondants (« marqueurs de loyauté parmi les Jace »). */
  | { kind: "countersAmong"; filter: ObjectFilter; counter: string }
  /** La moitié des points de vie du joueur désigné, arrondie à l'unité supérieure (Alpharael). */
  | { kind: "halfLife"; who: Ref }
  /** Mana dépensé pour lancer la source (Astelli Reclaimer, Dyadrine). */
  | { kind: "manaSpent" }
  /** Votre vitesse (0 si vous n'en avez pas). */
  | { kind: "speed" }
  /** Sorts que vous avez lancés ce tour-ci. */
  | { kind: "spellsCastThisTurn" }
  /** Cartes que vous avez piochées ce tour-ci (Duelist of the Mind). */
  | { kind: "cardsDrawnThisTurn" }
  | { kind: "creaturesDiedThisTurn" }
  /** Somme des valeurs de mana des permanents correspondants (Summon: Bahamut). */
  /** `zone: "exile"` : les cartes que vous possédez en exil (Ashiok, Wicked Manipulator). */
  | { kind: "totalManaValue"; filter: ObjectFilter; zone?: "exile" }
  /** Mana dépensé pour lancer le sort de l'événement (Shantotto, Tellah). */
  | { kind: "eventManaSpent" }
  /** Types de carte différents parmi les objets désignés (Kefka : « parmi les cartes défaussées »). */
  | { kind: "cardTypesOf"; ref: Ref }
  /** Dévotion à une couleur (700.5) : symboles de cette couleur dans les coûts de mana de vos permanents. */
  | { kind: "devotion"; color: Color }
  /** Nombre d'objets désignés (Luxurious Locomotive : les créatures qui l'ont équipé). */
  | { kind: "refCount"; ref: Ref }
  /** Forces différentes parmi les créatures correspondantes (Collector's Cage). */
  | { kind: "distinctPowers"; filter: ObjectFilter }
  /** Types de carte différents parmi les permanents correspondants (Loot, the Key to Everything). */
  | { kind: "cardTypesAmong"; filter: ObjectFilter }
  /** Plus grande valeur de mana parmi les permanents correspondants (Emissary Escort). */
  | { kind: "maxManaValue"; filter: ObjectFilter }
  /** Tarmogoyf : types de cartes parmi les cartes de tous les cimetières. */
  | { kind: "cardTypesInGraveyards" }
  /** Portes déverrouillées parmi les Salles que contrôle le contrôleur (Duskmourn). */
  | { kind: "unlockedDoors" }
  /** Le plus grand des montants. */
  | { kind: "max"; of: Amount[] }
  /** Plus grande force parmi les cartes de créature de votre main (Monstrous Emergence). */
  | { kind: "maxPowerInHand" }
  /** Adversaires qui ont perdu des points de vie ce tour-ci (Kaito). */
  | { kind: "opponentsLostLife" }
  /** X du sort qui a mis la source en jeu (Meathook Massacre II). */
  | { kind: "sourceX" }
  /** Noms différents parmi les portes déverrouillées de ses Salles (Promising Stairs). */
  | { kind: "unlockedDoorNames" }
  /** Délire : types de cartes parmi les cartes du cimetière du contrôleur. */
  | { kind: "cardTypesInGraveyard" }
  | { kind: "cardsDiscardedThisTurn" }
  /** Plus grande endurance parmi les permanents correspondants (Ghalta the Immovable). */
  | { kind: "maxToughness"; filter: ObjectFilter }
  /** Plus grande valeur de mana parmi les cartes de votre cimetière (Hapatra). */
  | { kind: "maxManaValueInGraveyard" }
  /** Couleurs différentes parmi les permanents correspondants (Karn, Gilded Guardian). */
  | { kind: "distinctColors"; filter: ObjectFilter }
  /** Nombre de sous-types différents parmi les permanents correspondants (« types de planeswalker », Tam). */
  | { kind: "distinctSubtypes"; filter: ObjectFilter }
  /** Objets désignés encore en exil (Dragonhawk : « celles de ces cartes encore exilées »). */
  | { kind: "inExile"; ref: Ref }
  /** Créatures exilées sous le contrôle de vos adversaires ce tour-ci (Vren). */
  /** Adversaires qui ont au plus N cartes en main (Bandit's Talent). */
  | { kind: "opponentsWithHandAtMost"; n: number }
  /** Force de la source quand la capacité s'est déclenchée (« quand cette créature meurt, … égales à sa force »). */
  | { kind: "lkiPower" }
  /** Cartes qui ont quitté votre cimetière ce tour-ci (Bonecache Overseer). */
  /** Mana produit par des Cavernes dépensé pour lancer la source (Bat Colony). */
  | { kind: "caveManaSpent" }
  /** Force totale des cartes liées à la source (matériaux d'une fabrication : Mastercraft Raptor). */
  | { kind: "linkedTotalPower" }
  /** Nombre de couleurs parmi les cartes liées à la source (Sunbird Effigy). */
  | { kind: "linkedColors" }
  /** Créatures qui ont quitté le champ de bataille sous votre contrôle ce tour-ci. */
  /** Créatures avec lesquelles vous avez attaqué ce tour-ci. */
  | { kind: "attackersThisTurn" }
  /** Types de permanent parmi les cartes de votre cimetière (Matzalantli). */
  | { kind: "permanentTypesInGraveyard" }
  /** Blessures non de combat infligées par vos sources rouges ce tour-ci (Temple of Power). */
  /** Journal du tour (`turnlog.ts`) : entrées correspondantes, vues du contrôleur de la capacité. */
  /** `of` : compter pour ces joueurs (« les cartes meulées par le joueur ciblé ») plutôt que pour le contrôleur. */
  | { kind: "turnEvents"; query: TurnLogQuery; of?: Ref }
  /** Permanents dégagés pendant votre étape de dégagement de ce tour (The Millennium Calendar). */
  | { kind: "untappedInUntapStep" }
  /** Sortes de marqueurs différentes parmi les permanents correspondants (Hundred-Battle Veteran). */
  | { kind: "counterKindsAmong"; filter: ObjectFilter }
  /** Endurance totale des permanents correspondants (Betor, Kin to All). */
  | { kind: "totalToughness"; filter: ObjectFilter };
