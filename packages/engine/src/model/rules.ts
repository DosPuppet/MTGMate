/** Types du moteur — Filtres, cibles, déclencheurs, conditions, références et montants. Réexportés par `types.ts`. */
import type { CardType, CastVia, Color, Keyword, ManaType, Step, TurnLogQuery, Zone } from "../types";

export interface TargetSpec {
  id: string;
  filter: TargetFilter;
  /** Valeur de mana totale des cibles au plus égale à N (Scout for Survivors). */
  maxTotalManaValue?: number;
  /** … ou à ce montant, évalué quand la capacité réflexive est mise sur la pile (Fire Lord Sozin : X payé). */
  maxTotalManaValueAmount?: Amount;
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
  /** Capacité déclenchée : la cible n'est pas l'objet de l'événement (« une créature autre que cette créature »). */
  notEventObject?: boolean;
  /** Chaque cible doit être attachée à une cible d'un autre mot « cible » (« Équipement attaché à cette créature »). */
  attachedToTarget?: string;
  /** Cibles contrôlées par des joueurs différents (« contrôlées par des joueurs différents »). */
  differentPlayers?: boolean;
  /** Les cibles partagent un type de créature (Unbury : « deux cartes de créature ciblées qui partagent un type »). */
  shareCreatureType?: boolean;
  /** Cibles de noms différents (Behold the Sinister Six! : « cartes de créature ciblées de noms différents »). */
  differentNames?: boolean;
  /** Nombre de cibles variable (« jusqu'à X créatures ciblées ») : remplace `count` au moment de choisir les cibles. */
  countAmount?: Amount;
  /** Filtre si le sort est kické ou si le cadeau est promis (« à la place, un permanent non-terrain ciblé »). */
  kickedFilter?: TargetFilter;
  /** Valeur de mana exacte évaluée quand la capacité réflexive est mise sur la pile (Wishing Well). */
  manaValueAmount?: Amount;
  /**
   * Valeur de mana maximale évaluée au ciblage, puis de nouveau à la résolution (608.2b) : « une carte de créature de
   * valeur de mana X ou moins, X étant les points de vie gagnés ce tour-ci » (Moseo).
   */
  maxManaValueAmount?: Amount;
  /**
   * Exactement X cibles, X étant choisi pour le sort ou la capacité (Rot-Curse Rakshasa : « X créatures ciblées ») ;
   * `"upTo"` : jusqu'à X cibles (Divergent Equation).
   */
  countX?: boolean | "upTo";
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
  /** … qui ciblent un permanent correspondant (Fugitive Droid : « un sort qui cible un artefact ou une créature que vous
   * contrôlez »). */
  spellsTargeting?: ObjectFilter;
  /** Sorts ou capacités sur la pile à cible unique (Bolt Bend). */
  /** `controller` : que vous contrôlez ; `source` : dont la source correspond (Scientist Supreme : « d'une source artefact »). */
  stackItems?: {
    singleTarget?: boolean;
    abilitiesOnly?: boolean;
    triggeredOnly?: boolean;
    controller?: "you";
    source?: ObjectFilter;
  };
}

export interface ObjectFilter {
  /** L'objet doit avoir au moins un de ces types. */
  types?: CardType[];
  /** L'objet ne doit avoir aucun de ces types (« non-créature »…). */
  notTypes?: CardType[];
  subtype?: string;
  controller?: "you" | "opponent";
  keyword?: Keyword;
  /** « un autre » : exclut la source de la capacité. */
  other?: boolean;
  /** La source elle-même (« quand cette créature meurt, si ce n'était pas un Démon »). */
  self?: boolean;
  /** Le permanent auquel la source est attachée (« la créature équipée »). */
  attachedToSource?: boolean;
  /** A le même nom qu'un permanent correspondant (Key to the Side-Door : « une carte légendaire du même nom qu'un
   * permanent légendaire que vous contrôlez »). */
  sameNameAs?: ObjectFilter;
  /** N'a pas le même nom qu'un autre permanent correspondant (« qu'un jeton que vous contrôlez », Yenna). */
  notSameNameAs?: ObjectFilter;
  /** Attaché à la source (« chaque Aura et Équipement attaché à Kellan », « une Aura attachée à cette créature »). */
  attachedToSelf?: boolean;
  /** De force supérieure à celle de la source (furtivité : « ne peut pas être bloquée par des créatures de force supérieure »). */
  powerAboveSource?: boolean;
  /**
   * Relations à un objet désigné, évaluées à la résolution par `withX` (références de zone, `moveAll`, recherche) : de force
   * supérieure à la sienne (Fell the Mighty : la créature ciblée), qui partage un type de créature avec lui (Shared
   * Animosity : l'objet de l'événement).
   */
  powerAboveOf?: Ref;
  sharesCreatureTypeWith?: Ref;
  /** Créature équipée (au moins un Équipement attaché). */
  equipped?: boolean;
  /** Modifié (700.9) : porte un marqueur, est équipé, ou enchanté par une Aura que son contrôleur contrôle. */
  modified?: boolean;
  /** Enchanté par au moins une Aura (`true`), par une Aura que vous contrôlez (`byYou`), ou par aucune (`false`). */
  enchanted?: boolean | "byYou";
  /** Était attaché à la source quand celle-ci a quitté le champ de bataille (Zack Fair). */
  wasAttachedToSource?: boolean;
  /** Véhicule équipé par la source ce tour-ci (Balthier and Fran). */
  crewedBySource?: boolean;
  /** A piloté ou monté la source ce tour-ci (Giant Beaver : « une créature qui l'a montée ce tour-ci »). */
  crewedSource?: boolean;
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
  /** Au moins un de ces sous-types (« Chat ou Chien »…). */
  anySubtype?: string[];
  notSubtype?: string;
  minManaValue?: number;
  maxPower?: number;
  /** Terrain de base (`false` : « non de base »). */
  basic?: boolean;
  /** Carte permanente (hors pile) : artefact, créature, enchantement, terrain, planeswalker, bataille. */
  permanent?: boolean;
  /** Au moins un de ces filtres (« artefact, enchantement ou créature avec le vol »). */
  anyOf?: ObjectFilter[];
  /** Jeton (`false` : « non-jeton »). */
  token?: boolean;
  minToughness?: number;
  /** A reçu des blessures de la source ce tour-ci (Predator Ooze). */
  damagedBySource?: boolean;
  /** Du type de créature / de la couleur choisis par la source en arrivant. */
  subtypeChosen?: boolean;
  colorChosen?: boolean;
  /** Mise dans sa zone actuelle ce tour-ci (« carte mise dans un cimetière ce tour-ci »). */
  enteredThisTurn?: boolean;
  /** Du type de carte choisi par la source (Arachne : le choix est un mode d'arrivée, `enterModes` = types de carte). */
  typeChosen?: boolean;
  /** Attaché au permanent auquel la source est attachée (With Great Power : « chaque Aura et Équipement attachés à
   * elle »). */
  attachedToSourceHost?: boolean;
  /** Mise dans sa zone depuis le champ de bataille ce tour-ci (Supper for Spiders). */
  fromBattlefieldThisTurn?: boolean;
  /** Carte défaussée ce tour-ci (chaos, Mayhem : « si vous l'avez défaussée ce tour-ci »). */
  discardedThisTurn?: boolean;
  /** Valeur de mana inférieure ou égale à la force de la source (« … inférieure ou égale à la force d'Alesha »). */
  maxManaValueSourcePower?: boolean;
  /** Valeur de mana égale à la force de la source (Jackal, Genius Geneticist). */
  manaValueSourcePower?: boolean;
  /** Valeur de mana égale au nombre de marqueurs de cette sorte sur la source, ou à sa dernière information (Blast Zone). */
  manaValueSourceCounters?: string;
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
  /** Valeur de mana au plus égale au nombre de couleurs dépensées pour lancer la source (convergence, Sundering Archaic). */
  maxManaValueColorsSpent?: boolean;
  /** Contrôlé mais pas possédé (Laughing Jasper Flint). */
  notOwned?: boolean;
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
  /** Valeur de mana égale au X de la capacité ou du sort (`destroyAll` : Dauntless Dismantler ; `moveAll` : Fix What's Broken). */
  manaValueX?: boolean;
  /** Valeur de mana de la parité choisie par la source (Gollum, Riddle Master). */
  parityChosen?: boolean;
  /** Valeur de mana, force ou endurance égale au nombre choisi par la source (Talion, the Kindly Lord). */
  numberChosen?: boolean;
  /** Du nom choisi par la source en arrivant (Petrified Hamlet : « les terrains du nom choisi »). */
  nameChosen?: boolean;
  /** A infligé des blessures ce tour-ci (Treacherous Greed). */
  dealtDamageThisTurn?: boolean;
  /** Suspect ou non (701.60 : « créature suspecte ciblée »). */
  suspected?: boolean;
  /**
   * Vous avez mis un marqueur sur lui ce tour-ci (Fractal Tender) ; une sorte : un marqueur de cette sorte (Kid Loki :
   * « un ou plusieurs marqueurs +1/+1 »). Lu aussi par les capacités statiques.
   */
  countersPutByYouThisTurn?: boolean | string;
  /** A le déguisement (Expose the Culprit : « créatures face visible que vous contrôlez avec le déguisement »). */
  disguise?: boolean;
  /** {X} dans son coût de mana (« un sort avec {X} dans son coût de mana » : Matterbending Mage, Paradox Surveyor). */
  hasX?: boolean;
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
  /** Un permanent correspondant est détruit par un sort ou une capacité (d'un adversaire : `byOpponent`) ; joueur de l'événement : celui qui détruit. */
  | { on: "destroyed"; who: ObjectFilter; byOpponent?: boolean }
  /** `to` : seulement vers cette zone (« quand cet artefact est mis au cimetière depuis le champ de bataille »). */
  /** `whileCrafting` : exilé comme matériau d'une fabrication (Market Gnome). */
  /** `who` filtre : « chaque fois qu'une créature que vous contrôlez avec un marqueur +1/+1 quitte le champ de bataille ». */
  /** `from` : une autre zone de départ que le champ de bataille (Kaya : des cartes de créature de votre cimetière exilées). */
  /** `withoutDying` : « quitte le champ de bataille sans mourir » (Dour Port-Mage, Three Tree Scribe). */
  | {
      on: "leaves";
      who: "self" | "linked" | ObjectFilter;
      to?: Zone;
      from?: Zone;
      whileCrafting?: boolean;
      withoutDying?: boolean;
    }
  /**
   * « Chaque fois que vous gagnez des points de vie [pour la première fois ce tour] », « chaque fois qu'un adversaire perd
   * des points de vie », « chaque fois que vous gagnez ou perdez des points de vie » (`change` absent) ; `whose` relatif au
   * contrôleur, vous par défaut.
   */
  | { on: "life"; change?: "gain" | "loss"; whose?: "you" | "opponent" | "any"; first?: boolean }
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
      /** « si du mana d'un [Trésor] a été dépensé pour le lancer » (Smaug, Wicked Worm) : une source correspondante, vue
       * par ses dernières informations si elle est partie. */
      usingManaFrom?: ObjectFilter;
      /** Lancé depuis l'exil (Quintorius Kand). */
      fromExile?: boolean;
      /** Lancé depuis la main (Ojer Pakpatiq). */
      fromHand?: boolean;
    }
  | { on: "step"; step: Step; whose: "you" | "opponent" | "any" }
  | { on: "landfall" }
  /** « Chaque fois que vous piochez [votre deuxième carte ce tour] » ; `whose` relatif au contrôleur. */
  | { on: "draw"; whose: "you" | "opponent" | "any"; nth?: number }
  /** « Chaque fois que vous attaquez [avec au moins N créatures] » */
  /** `anyPlayer` : « chaque fois qu'un joueur attaque avec N créatures ou plus » (Aurelia, the Law Above). */
  /**
   * `defending: "you"` : un adversaire attaque, et seuls comptent ses attaquants qui vous attaquent, vous ou vos
   * planeswalkers (Tomik, Wielder of Law) ; le joueur de l'événement est alors l'attaquant.
   */
  | { on: "attackWith"; min?: number; filter?: ObjectFilter; anyPlayer?: boolean; defending?: "you" }
  /** « Chaque fois que des marqueurs sont placés sur … » */
  /** `firstThisTurn` : « si c'est la première fois ce tour-ci que des marqueurs sont mis sur elle » (Stalwart Successor). */
  /** `by: "you"` : « chaque fois que vous mettez des marqueurs » (celui qui les met : contrôleur de ce qui se résout, sinon
   * du permanent). */
  | { on: "countersPut"; who: "self" | ObjectFilter; kind?: string; firstThisTurn?: boolean; by?: "you" }
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
      /** Un joueur ciblé compte aussi (Loki, God of Mischief : « un joueur ou un permanent »). */
      players?: boolean;
      /** Seulement par une capacité (pas un sort). */
      abilitiesOnly?: boolean;
    }
  /** « Chaque fois que [la créature équipée] se dégage » */
  | { on: "untaps"; who: "self" | ObjectFilter }
  /** « Chaque fois que [cette créature] devient engagée » */
  /** `byYou` : « chaque fois que vous engagez [une créature] » (Solitary Sanctuary : une créature adverse). */
  /**
   * `cause: "teamwork"` : engagé pour payer un travail d'équipe (Agent Maria Hill) ; `firstThisTurn` : la première fois
   * qu'il devient engagé ce tour-ci (Captain America, Living Legend).
   */
  | { on: "taps"; who: "self" | ObjectFilter; byYou?: boolean; cause?: "teamwork"; firstThisTurn?: boolean }
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
  /** `attached` : la créature enchantée ou équipée, ou le joueur enchanté (Aura de joueur, Grievous Wound). */
  | { on: "isDealtDamage"; who: "self" | "attached" | ObjectFilter }
  /** « Chaque fois que vous copiez un sort [correspondant] » (Kalamax, the Stormsire) ; `ref.eventObject` : la copie. */
  | { on: "copySpell"; filter?: ObjectFilter }
  /** « Chaque fois qu'une ou plusieurs [créatures] subissent des blessures en excès [non de combat] » (120.4a). */
  | { on: "excessDamage"; who: ObjectFilter; noncombatOnly?: boolean }
  /** « Chaque fois qu'une ou plusieurs [créatures] infligent des blessures de combat à un joueur » : une fois par étape et par joueur. */
  | { on: "combatDamageBatch"; who: ObjectFilter }
  /** « Chaque fois qu'une [créature] bloque » */
  /** `eventObject: "attacker"` : l'objet de l'événement est l'attaquant bloqué (Skewer Slinger : « cette créature »). */
  | { on: "blocks"; who: "self" | ObjectFilter; attacker?: ObjectFilter; eventObject?: "attacker" }
  /** « Chaque fois que [créature] meurt ou est exilée » (depuis le champ de bataille). */
  | { on: "diesOrExiled"; who: "self" | ObjectFilter; minPower?: number }
  /** « Chaque fois que vous jouez un terrain » ; `from` : seulement depuis ces zones (« depuis l'exil », Ghost-Spider). */
  /** `whose` : qui joue le terrain (vous par défaut ; Burgeoning : un adversaire). */
  | { on: "playLand"; from?: Zone[]; whose?: "you" | "opponent" | "any" }
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
  /** « Chaque fois que vous réunissez des preuves » (Surveillance Monitor). */
  | { on: "collectEvidence" }
  /** « Chaque fois qu'une créature que vous contrôlez fait, en attaquant, se déclencher une de ses capacités. » */
  | { on: "attackAbilityTriggered" }
  /** « Chaque fois que vous maîtrisez l'eau, la terre, le feu ou l'air » (Avatar). */
  | { on: "bend" }
  /** « Chaque fois que vous résolvez une Affaire » (Case File Auditor). */
  | { on: "caseSolved" }
  /** « Chaque fois que vous offrez un cadeau » (Jolly Gerbils). */
  | { on: "gift" }
  /** « Chaque fois que vous découvrez » (`amount.eventAmount` : la valeur N). */
  | { on: "discover" }
  /** « Chaque fois que vous activez une capacité qui n'est pas une capacité de mana » (l'objet : la capacité sur la pile) ;
   * `source` : seulement celle d'un permanent correspondant (Elrond, Moon-Reader : « d'une créature »). */
  | { on: "activateAbility"; source?: ObjectFilter };

/** Conditions (« if intermédiaire » 603.4, « tant que »…). */
export type Condition =
  | { kind: "controls"; filter: ObjectFilter; atLeast?: number }
  /** Le sort qui met l'objet en jeu a été kické. */
  | { kind: "kicked" }
  | { kind: "yourTurn" }
  | { kind: "opponentsTurn" }
  /** La source a au moins N marqueurs de ce type. */
  | { kind: "counterAtLeast"; counter: string; n: number }
  /** Votre total de vie dépasse votre total de départ d'au moins `by`. */
  | { kind: "lifeAboveStart"; by: number }
  | { kind: "not"; cond: Condition }
  /**
   * La source a été lancée (le sort qui se résout, ou le permanent qu'il est devenu) : depuis cette zone, ou pour ce coût
   * alternatif (Web-slinging, chaos, faufilement, évocation…).
   */
  | { kind: "cast"; from?: Zone; via?: CastVia }
  /** Valeur mémorisée pendant la résolution (« si vous le faites », « si une carte de créature a été exilée »). */
  | { kind: "var"; name: string; atLeast?: number }
  | { kind: "all"; of: Condition[] }
  /** Le joueur désigné a exactement N points de vie (évalué pendant la résolution). */
  | { kind: "refLife"; ref: Ref; equals: number }
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
  /** Un montant évalué du point de vue du contrôleur atteint N (« force totale 8 ou plus »). */
  | { kind: "amountAtLeast"; amount: Amount; n: number }
  /** Un montant strictement plus grand qu'un autre, évalués à la résolution (Evil's Thrall). */
  | { kind: "amountGreater"; a: Amount; b: Amount }
  /** X du sort qui se résout. */
  | { kind: "xAtLeast"; n: number }
  /** « tant que vous avez N mana non dépensé ou plus » (Ozai, the Phoenix King). */
  | { kind: "manaPoolAtLeast"; n: number }
  /** C'est la première étape de fin de ce tour (Y'shtola Rhul). */
  | { kind: "firstEndStep" }
  /** C'est la première phase de combat du tour (Genji Glove). */
  | { kind: "firstCombat" }
  /** Vous contrôlez une créature de force la plus grande ou à égalité (Summon: Fenrir). */
  | { kind: "controlsGreatestPower" }
  /** La source est préparée. */
  | { kind: "prepared" }
  /** « Contempler un Jace » : vous contrôlez un Jace ou vous avez une carte de Jace en main. */
  /** « Si {U}{U} a été dépensé pour le lancer » : au moins N mana de ce type dépensé pour lancer la source. */
  | { kind: "spentColor"; color: ManaType; n: number }
  /** Faufilement : étape de déclaration des bloqueurs, avec un attaquant non bloqué que vous contrôlez. */
  | { kind: "sneakWindow" }
  /** Vous avez un récit durable (Storied). */
  | { kind: "enduringStory" }
  /** La source a été exploitée (Harness) : ses capacités ∞ sont actives. */
  | { kind: "harnessed" }
  /** L'objet de l'événement (parti du champ de bataille) avait la plus grande force parmi les créatures de son contrôleur,
   * en comptant celles parties en même temps (Kraven the Hunter). */
  | { kind: "eventObjectGreatestPower" }
  /** Contempler (701.63) : vous contrôlez un permanent correspondant, ou vous révélez une carte correspondante de votre main. */
  | { kind: "behold"; filter: ObjectFilter }
  /** Le sort a été lancé en contemplant (coût additionnel `behold`). */
  | { kind: "beheld" }
  /** La condition `whenCast` de la carte était remplie quand le sort a été lancé. */
  | { kind: "metWhenCast" }
  /** Une seule créature attaque, et elle attaque un joueur (« attaque seule un joueur »). */
  | { kind: "attackingAlone" }
  /** Un adversaire a subi des blessures non de combat au tour précédent (Command the Stage). */
  | { kind: "opponentDealtNoncombatDamageLastTurn" }
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
  | { kind: "solved" }
  /** Vitesse maximale (4) ; `not` pour « un joueur qui n'a pas la vitesse maximale ». */
  | { kind: "maxSpeed" }
  /** Au moins N cartes en exil (Ketramose). */
  | { kind: "exileAtLeast"; n: number }
  /** Nombre total de marqueurs sur la source pair (Sab-Sunen). */
  | { kind: "evenCounters" }
  /** C'est au moins votre N-ième tour (Jace Reawakened : « pas pendant vos trois premiers tours »). */
  | { kind: "turnsTakenAtLeast"; n: number }
  /** C'est cette étape (Smoky Lounge : « votre première phase principale »). */
  | { kind: "step"; step: Step }
  /** Le montant est un nombre premier (Zimone, All-Questioning). */
  | { kind: "prime"; amount: Amount }
  /** Au moins une des conditions. */
  | { kind: "any"; of: Condition[] }
  /** Un adversaire a plus de terrains, de points de vie, de créatures ou de cartes en main que vous (Beza). */
  | { kind: "opponentHasMore"; what: "lands" | "life" | "creatures" | "hand" }
  /** Le joueur désigné a au plus N cartes en main (évalué pendant la résolution). */
  | { kind: "handAtMost"; ref: Ref; n: number }
  /** Le joueur désigné (vous par défaut) a le plus de points de vie, ou est à égalité (Preacher of the Schism). */
  | { kind: "mostLife"; ref?: Ref };
/** Propriété lue par un agrégat (`Amount` `aggregate`). */
export type AggregateProperty =
  | "power"
  | "toughness"
  | "manaValue"
  | "color"
  /** Paire de couleurs d'un objet qui a exactement deux couleurs (Niv-Mizzet, Guildpact). */
  | "colorPair"
  | "cardType"
  | "permanentType"
  | "subtype"
  | "basicLandType"
  | "name"
  /** Sortes de marqueurs présents (Hundred-Battle Veteran). */
  | "counterKind"
  /** Nombre de marqueurs de la sorte `counter`. */
  | "counters";

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
  /** Les permanents attachés à l'objet désigné (« un Équipement attaché à cette créature », Light of Judgment). */
  | { kind: "attachmentsOf"; ref: Ref }
  /** « Cette carte », où qu'elle soit maintenant (suit l'identité physique : Angelic Destiny). */
  | { kind: "selfCard" }
  /** Cartes liées à la source (Hoarding Dragon). */
  | { kind: "linked" }
  /** Cartes exilées « jusqu'à ce que » la source quitte le champ de bataille (Pinnacle Starcage). */
  | { kind: "exiledWith" }
  /** Les cibles du sort ou de la capacité de l'événement (Storm, Windrider : « ces créatures »). */
  | { kind: "targetsOfEventObject" }
  /** La capacité la plus récente sur la pile dont la source est l'objet de l'événement (Firebender Ascension). */
  | { kind: "abilitiesFromEventObject" }
  /** Carte du dessus de la bibliothèque de chaque joueur désigné. */
  | { kind: "libraryTop"; who: Ref }
  /** Créatures qui ont monté ou équipé la source ce tour-ci (Fortune, Calamity, The Gitrog, Luxurious Locomotive). */
  | { kind: "crewedBy" }
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
  /** « Chaque joueur qui contrôle le plus de [créatures] » (No Witnesses). */
  | { kind: "playersWithMost"; filter: ObjectFilter }
  /** Le joueur défenseur de la source attaquante (celui qui contrôle le planeswalker attaqué). */
  | { kind: "defendingPlayer" }
  /**
   * Les joueurs désignés pour qui la condition est vraie, évaluée de leur point de vue (« chaque adversaire qui a au plus
   * une carte en main », « les joueurs qui n'ont pas la vitesse maximale »).
   */
  | { kind: "playersWhere"; of: Ref; where: Condition }
  /**
   * Ce qui a été payé en objets pour le coût du sort ou de la capacité qui se résout (dernières informations connues) :
   * permanents sacrifiés, cartes défaussées (encore présentes), cartes exilées, créature renvoyée pour le Web-slinging.
   */
  | { kind: "cost"; paid: "sacrificed" | "discarded" | "exiled" | "bounced" }
  /**
   * Les objets d'une zone des joueurs désignés, correspondant au filtre : permanents qu'ils contrôlent, cartes de leur
   * cimetière, de leur main (valeur de mana au plus `maxManaValue`), cartes qu'ils possèdent exilées face visible, sorts et
   * capacités qu'ils contrôlent sur la pile (sauf ce qui se résout).
   */
  | {
      kind: "zone";
      zone: "battlefield" | "graveyard" | "hand" | "exile" | "stack";
      who: Ref;
      filter?: ObjectFilter;
      maxManaValue?: Amount;
    }
  /**
   * Les objets du même nom que les objets désignés (eux compris) : sur le champ de bataille (Maelstrom Pulse), ou dans
   * votre cimetière (Rat King, Verminister).
   */
  | { kind: "sameName"; ref: Ref; zone: "battlefield" | "graveyard" }
  /** Réunion de références, sans doublon (Call the Spirit Dragons : les Dragons choisis pour chaque couleur). */
  | { kind: "union"; of: Ref[] }
  /** Les créatures qui bloquent les objets désignés ou sont bloquées par eux pendant ce combat (Ride Down). */
  | { kind: "combatPartners"; ref: Ref };

export type Amount =
  | number
  /**
   * Agrégat sur des objets : ceux du filtre sur le champ de bataille (vus du contrôleur), ceux d'une autre zone (`zone`,
   * des joueurs `whose`, vous par défaut), ou les objets désignés (`of`). Sur le champ de bataille, les caractéristiques
   * calculées ; ailleurs, imprimées (dernières informations connues pour un objet parti). `fn` : somme (chaque valeur
   * bornée à 0), plus grande valeur (0 sans objet), nombre de valeurs différentes, ou `mostShared` : le plus grand nombre
   * d'objets qui ont un type de créature en commun (changelins compris).
   */
  | {
      kind: "aggregate";
      fn: "sum" | "max" | "distinct" | "mostShared";
      property: AggregateProperty;
      filter?: ObjectFilter;
      zone?: "graveyard" | "hand" | "exile";
      whose?: "you" | "opponents" | "all";
      of?: Ref;
      /** Sorte de marqueur (`property: "counters"`). */
      counter?: string;
    }
  /**
   * Ce qui a été dépensé pour lancer la source (le sort qui se résout, ou le permanent qu'il est devenu), ou les objets
   * désignés (`of` : le sort de l'événement…) : X, mana, nombre de couleurs de mana, mana des Cavernes.
   */
  | { kind: "spent"; what: "x" | "mana" | "colors" | "cave"; of?: Ref }
  /**
   * Symboles de mana de cette couleur, hybrides compris, dans les coûts de mana des objets désignés (Namor : le sort de
   * l'événement) ; sans `of`, de vos permanents (dévotion, 700.5).
   */
  | { kind: "manaSymbols"; color: ManaType; of?: Ref }
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
  /** Marqueurs d'un type sur un objet. */
  | { kind: "countersOn"; ref: Ref; counter: string }
  | { kind: "sum"; of: Amount[] }
  /** Opposé (« -X/-0 ») et division entière (« pour chaque tranche de sept cartes »). */
  | { kind: "neg"; of: Amount }
  | { kind: "div"; of: Amount; by: number }
  /** Puissance : `base` à la puissance `of` (Mathemagics : « 2^X cartes »), bornée à 2^20. */
  | { kind: "pow"; base: number; of: Amount }
  /** Valeur mémorisée pendant la résolution (vie perdue de cette façon, blessures en excès…). */
  | { kind: "var"; name: string }
  | { kind: "lifeTotal" }
  /** Blessures marquées sur la source (dernières informations connues : Tangled Colony, « les blessures subies ce tour-ci »). */
  | { kind: "lkiDamage" }
  | { kind: "manaValueOf"; ref: Ref }
  | { kind: "toughnessOf"; ref: Ref }
  /** Nombre de cartes dans une zone du contrôleur. */
  | { kind: "cardsIn"; zone: "hand" | "graveyard" | "library" }
  /** La moitié des points de vie du joueur désigné, arrondie à l'unité supérieure (Alpharael). */
  | { kind: "halfLife"; who: Ref }
  /** Votre vitesse (0 si vous n'en avez pas). */
  | { kind: "speed" }
  /** Nombre d'objets désignés (Luxurious Locomotive : les créatures qui l'ont équipé). */
  | { kind: "refCount"; ref: Ref }
  /** Portes déverrouillées parmi les Salles que contrôle le contrôleur (Duskmourn). */
  | { kind: "unlockedDoors" }
  /** Le plus grand des montants. */
  | { kind: "max"; of: Amount[] }
  /** Nombre de cimetières qui contiennent au moins N cartes (Master's Councillors, The Master of Lake-town). */
  | { kind: "graveyardsWithAtLeast"; n: number }
  /** Noms différents parmi les portes déverrouillées de ses Salles (Promising Stairs). */
  | { kind: "unlockedDoorNames" }
  /** Objets désignés encore en exil (Dragonhawk : « celles de ces cartes encore exilées »). */
  | { kind: "inExile"; ref: Ref }
  /** Adversaires qui ont plus de cartes en main que vous (Wojek Investigator). */
  | { kind: "opponentsWithMoreInHand" }
  /** Force de la source quand la capacité s'est déclenchée (« quand cette créature meurt, … égales à sa force »). */
  | { kind: "lkiPower" }
  /** Journal du tour (`turnlog.ts`) : entrées correspondantes, vues du contrôleur de la capacité. */
  /** `of` : compter pour ces joueurs (« les cartes meulées par le joueur ciblé ») plutôt que pour le contrôleur. */
  | { kind: "turnEvents"; query: TurnLogQuery; of?: Ref }
  /** Permanents dégagés pendant votre étape de dégagement de ce tour (The Millennium Calendar). */
  | { kind: "untappedInUntapStep" };
