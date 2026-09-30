/** Types du moteur — Effets (union `Effect` : un `op` par effet ; traitements dans `ops/`). Réexportés par `types.ts`. */
import type {
  AbilityDef,
  Amount,
  CardType,
  Color,
  Condition,
  DelayedTiming,
  Keyword,
  LayerMods,
  ManaCost,
  ManaType,
  MoveSpec,
  ObjectFilter,
  PlayerStaticAbilityDef,
  Ref,
  TargetSpec,
  TokenSpec,
} from "../types";

export type Effect =
  /** Maîtrise de l'air (Avatar) : exile le permanent ou le sort ; son propriétaire peut le lancer pour {2} tant qu'il est exilé. */
  | { op: "airbend"; what: Ref }
  /** « Exploitez [cette Gemme d'infinité] » : ses capacités ∞ deviennent actives. */
  | { op: "harness" }
  /**
   * Deadly Cover-Up : exilez une carte du cimetière d'un adversaire (au choix du contrôleur), puis toutes les cartes du
   * même nom de son cimetière, de sa main et de sa bibliothèque ; il mélange, puis pioche autant que de cartes exilées
   * de sa main.
   */
  /** `of` : la cible (The End) plutôt qu'une carte choisie dans un cimetière adverse. */
  | { op: "exileNamesakes"; of?: Ref }
  /** Amasser (701.47) : N marqueurs +1/+1 sur une Armée du joueur (créée 0/0 noire au besoin), qui devient aussi du sous-type. */
  | { op: "amass"; who: Ref; subtype: string; amount: Amount }
  /** Effet de joueur jusqu'à la fin du tour (« les blessures ne peuvent pas être prévenues ce tour-ci »). */
  /** `untilYourNextTurn` : jusqu'au début du prochain tour du contrôleur ; `times` : autant d'effets à usage unique. */
  | {
      op: "playerEffect";
      ability: Omit<PlayerStaticAbilityDef, "kind">;
      who?: Ref;
      untilYourNextTurn?: boolean;
      times?: Amount;
    }
  /** Proliférer N fois (701.34), choix automatique : vos permanents qui ont des marqueurs, et chez les adversaires marqueurs -1/-1, d'étourdissement et de poison. */
  | { op: "proliferate"; times: Amount }
  /** « Retirez jusqu'à N marqueurs » (choix automatique : loyauté, +1/+1, puis les autres). */
  | { op: "removeCounters"; what: Ref; n: number; kind?: string; store?: string }
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
  /** `untilLeavesExile` : l'effet cesse quand cette carte quitte l'exil (Emrakul). */
  | {
      op: "modify";
      what: Ref;
      mods: LayerMods;
      duration: "endOfTurn" | "permanent" | "untilYourNextTurn";
      untilLeavesExile?: Ref;
      /** « tant que [la source] reste sur le champ de bataille » (Kitesail Larcenist). */
      whileSource?: boolean;
    }
  /** `store` : les cartes mises au cimetière ainsi (« si une carte de créature est mise dans un cimetière de cette façon »). */
  | { op: "destroy"; what: Ref; store?: string }
  /** « Engagez un nombre quelconque de [permanents] dégagés que vous contrôlez » : `store` mémorise leur nombre. */
  | { op: "tapChosen"; filter: ObjectFilter; store: string }
  /** « Mettez ces marqueurs sur [cible] » : les marqueurs qu'avait l'objet de l'événement (dernières informations connues). */
  | { op: "lkiCountersTo"; to: Ref }
  /** « Il ne peut plus gagner de points de vie de la partie » (Screaming Nemesis). */
  | { op: "cantGainLife"; who: Ref }
  /** The Tale of Tamiyo : « meulez deux cartes ; si elles partagent un type de carte, piochez et recommencez ». */
  | { op: "millWhileShared" }
  | { op: "draw"; who: Ref; amount: Amount }
  | { op: "gainLife"; who: Ref; amount: Amount }
  /** `tapped` : jetons engagés ; `attacking` : engagés et attaquants (le même défenseur que la source, sinon le premier adversaire). */
  /** `pt` : jeton X/X (force et endurance égales au montant, Dance of the Tumbleweeds). */
  | {
      op: "createTokens";
      token: TokenSpec;
      count: Amount;
      for?: Ref;
      store?: string;
      tapped?: boolean;
      attacking?: boolean;
      pt?: Amount;
    }
  /** Marqueurs (par défaut +1/+1) ; un montant négatif en retire. */
  | { op: "addCounters"; what: Ref; amount: Amount; kind?: string }
  | { op: "loseLife"; who: Ref; amount: Amount; store?: string }
  | { op: "bounce"; what: Ref }
  | { op: "exile"; what: Ref }
  /**
   * `halfLibrary` : chaque joueur meule la moitié de sa bibliothèque, arrondie à l'inférieur (Singularity Rupture) ;
   * `graveyardSize` : autant de cartes qu'il y en a dans son cimetière (Riverchurn Monument).
   */
  | {
      op: "mill";
      who: Ref;
      amount: Amount;
      store?: { name: string; filter?: ObjectFilter };
      halfLibrary?: boolean;
      graveyardSize?: boolean;
    }
  /** Chaque joueur désigné sacrifie un permanent correspondant ; celui qui ne peut pas défausse une carte (Momentum Breaker). */
  | { op: "sacrificeElseDiscard"; who: Ref; filter: ObjectFilter }
  /** Retire un marqueur de chacun de N permanents correspondants (choisis automatiquement) ; `store` : 1 si fait. */
  | { op: "removeCounterFromEach"; filter: ObjectFilter; n: number; kind: string; store?: string }
  /** Effets avec choix pendant la résolution. */
  | { op: "scry"; amount: Amount }
  /** `toHand` : les cartes ainsi mises au cimetière et correspondantes vont ensuite en main (Enlightened Confidant). */
  /** `store` : le nombre de cartes remises au-dessus (Starving Revenant). */
  | { op: "surveil"; amount: Amount; toHand?: { filter?: ObjectFilter; maxManaValue?: Amount }; store?: string }
  /** `chooser: "controller"` : le contrôleur de l'effet choisit dans la main révélée (« Pilfer »). */
  | {
      op: "discard";
      who: Ref;
      amount: Amount;
      filter?: ObjectFilter;
      chooser?: "controller";
      optional?: boolean;
      store?: string;
      /** « … au hasard » */
      random?: boolean;
      /** Mémorise, sous `store`, seulement le nombre de cartes défaussées correspondant à ce filtre (« cartes non-terrain »). */
      storeFilter?: ObjectFilter;
      /** « … à moins de défausser une carte [de ce type] » (Alpharael, Dreaming Acolyte). */
      unlessFilter?: ObjectFilter;
      /** La carte choisie est exilée au lieu d'être défaussée (Intimidation Tactics). */
      exile?: boolean;
    }
  | {
      op: "sacrifice";
      who: Ref;
      filter: ObjectFilter;
      amount: Amount;
      optional?: boolean;
      store?: string;
      /** « … avec la plus grande valeur de mana parmi … » (Break Under Pressure). */
      greatestManaValue?: boolean;
      /** « … choisit une créature qu'il contrôle et l'exile » (Sothera) : `store` mémorise les cartes exilées. */
      exile?: boolean;
      /** La moitié des permanents correspondants, arrondie à l'inférieur (Zodiark). */
      half?: boolean;
      /** « … avec la plus grande force parmi … » (Consumed by Greed). */
      greatestPower?: boolean;
    }
  /** « Vous pouvez payer {X}. Si vous le faites, … » : les `skip` effets suivants sont ignorés sinon. */
  | { op: "mayPay"; cost: ManaCost; prompt: string; skip: number; life?: number }
  /** « Vous pouvez » : si le contrôleur refuse, les `skip` effets suivants sont ignorés. */
  | { op: "may"; prompt: string; skip: number; who?: Ref; store?: string }
  /** « Si cette créature devait mourir ce tour-ci, exilez-la à la place. » */
  | { op: "exileIfDies"; what: Ref }
  /** « Prévenez toutes les blessures de combat qui devraient être infligées à … ce tour-ci. » */
  | { op: "preventCombatDamage"; what: Ref }
  /** Double le nombre de marqueurs +1/+1. */
  | { op: "doubleCounters"; what: Ref }
  | { op: "tap"; what: Ref; untap?: boolean }
  /** Blessures à chaque créature correspondant au filtre (et éventuellement à des joueurs). */
  | { op: "damageAll"; amount: Amount; filter?: ObjectFilter; players?: Ref; source?: Ref }
  | { op: "destroyAll"; filter: ObjectFilter; store?: string }
  | { op: "addCountersAll"; filter: ObjectFilter; amount: Amount; kind?: string }
  /** Effet continu « jusqu'à la fin du tour » sur tous les permanents correspondant au filtre. */
  | { op: "modifyAll"; filter: ObjectFilter; mods: LayerMods; duration?: "endOfTurn" | "untilYourNextTurn" }
  /** Sacrifier un objet précis (jeton temporaire, « sacrifiez-la »). */
  | { op: "sacrificeIt"; what: Ref }
  /** Déplace un objet (retour en main, exil, retour du cimetière sur le champ de bataille…). */
  | { op: "moveTo"; what: Ref; spec: MoveSpec; store?: { name: string; filter?: ObjectFilter } }
  /** Double les marqueurs de chaque type (ou d'un type donné). */
  | { op: "doubleAllCounters"; what: Ref }
  /** Déplace tous les objets d'une zone correspondant au filtre. */
  | {
      op: "moveAll";
      from: "battlefield" | "graveyard" | "hand";
      whose: Ref;
      filter: ObjectFilter;
      spec: MoveSpec;
      store?: string;
    }
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
      rest: "bottom" | "graveyard" | "top" | "hand";
      /** Valeur de mana maximale des cartes prises (évaluée à la résolution). */
      maxManaValue?: Amount;
      /** Valeur de mana totale des cartes prises au plus égale à N (Michelangelo's Technique). */
      maxTotalManaValue?: number;
      /** Mémorise le nombre de cartes prises (« si vous n'avez pas mis de carte dans votre main ainsi »). */
      store?: string;
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
      /** Valeur de mana exacte (Repurposing Bay : 1 + celle de l'artefact sacrifié). */
      manaValue?: Amount;
    }
  | { op: "shuffle"; who: Ref }
  /** Échange le contrôle de deux permanents (Trade the Helm). */
  | { op: "exchangeControl"; a: Ref; b: Ref }
  /** Gagne le contrôle tant que vous contrôlez la source ; `restrict` : il ne peut ni attaquer ni bloquer (Possession Engine). */
  | { op: "gainControlWhileSource"; what: Ref; restrict?: boolean }
  /** Base de F/E de chaque permanent correspondant égale au montant, jusqu'à la fin du tour (Sita Varma). */
  | { op: "setBasePTAll"; filter: ObjectFilter; amount: Amount; powerOnly?: boolean }
  /** Pit Automaton : la prochaine capacité d'exhaust (non de mana) activée ce tour-ci est copiée. */
  | { op: "copyNextExhaust" }
  /** La carte (ou le sort) est exilée et devient complotée (702.170). */
  | { op: "plot"; what: Ref }
  /** Tarnation Vista : un mana de chaque couleur présente parmi les permanents correspondants. */
  | { op: "addManaColorsAmong"; filter: ObjectFilter; linked?: boolean }
  /** Chaque joueur peut mélanger sa main et son cimetière dans sa bibliothèque, puis pioche N cartes (Step Between Worlds). */
  | { op: "mayShuffleHandGraveyardDraw"; n: number }
  /** 705 : pile ou face ; `store` vaut 1 si le contrôleur gagne. */
  | { op: "coinFlip"; store: string }
  /** Obeka : N étapes d'entretien supplémentaires (approximation : les déclencheurs « au début de votre entretien »). */
  | { op: "extraUpkeeps"; amount: Amount }
  /** Lilah : le sort (sur la pile) sera exilé et comploté au lieu d'aller au cimetière. */
  | { op: "plotOnResolve"; what: Ref }
  /** Taii Wakeen : ce tour-ci, vos blessures non de combat sont augmentées de N. */
  | { op: "noncombatBonusThisTurn"; amount: Amount }
  /** Another Round : choisir des permanents que vous contrôlez, les exiler et les renvoyer, N fois. */
  | { op: "flickerChosen"; filter: ObjectFilter; times: Amount }
  /** Choisir un nom de carte (sans voir de carte cachée), mémorisé pour `exileNamed` (Ancient Vendetta). */
  | { op: "chooseCardName" }
  /** Exile jusqu'à N cartes du nom choisi du cimetière, de la main et de la bibliothèque du joueur, qui mélange. */
  | { op: "exileNamed"; who: Ref; max: number }
  /** « Vous pouvez payer le coût de mana de [cette carte] » (paiement automatique) ; `store` : 1 si payé. */
  | { op: "payCostOf"; what: Ref; store: string; prompt: string }
  /** Jeton copie d'un objet (valeurs copiables), avec d'éventuelles modifications. */
  | {
      op: "copyToken";
      of: Ref;
      count?: Amount;
      addKeywords?: Keyword[];
      /** « … excepté que c'est un Cauchemar en plus de ses autres types » */
      addSubtypes?: string[];
      sacrificeAtEndStep?: boolean;
      /** « Exilez ce jeton au début de la prochaine étape de fin » (Stormsplitter). */
      exileAtEndStep?: boolean;
      /** « … sauf que c'est légendaire » (Adagia, Windswept Bastion). */
      legendary?: boolean;
      /** Capacités ajoutées à la copie (Face Yourself). */
      addAbilities?: AbilityDef[];
      /** Copie engagée (Kambal). */
      tapped?: boolean;
      /** Engagée et attaquante (Calamity, Galloping Inferno). */
      attacking?: boolean;
      /** F/E de base fixées (Nexus of Becoming : 3/3). */
      pt?: number;
      /** « … sauf que ses capacités d'équipement coûtent {N} de moins » (Firion) ; `sacrificeAtNextUpkeep` en plus. */
      equipDiscount?: number;
      sacrificeAtNextUpkeep?: boolean;
      /** « … sauf que c'est un Démon noir » (Ardyn, the Usurper) : couleurs et sous-types remplacés. */
      setColors?: Color[];
      /** « … en plus de ses autres couleurs » (The Jolly Balloon Man). */
      addColors?: Color[];
      setSubtypes?: string[];
      /** « … sauf que c'est un artefact en plus » (Molten Duplication, Vaultborn Tyrant). */
      addTypes?: CardType[];
    }
  /** Capacité déclenchée retardée : « au début de la prochaine étape de fin, … ». Les références sont figées maintenant. */
  | {
      op: "delayed";
      at: DelayedTiming;
      effects: Effect[];
      bind?: Record<string, Ref>;
      vars?: Record<string, Amount>;
    }
  /** Capacité déclenchée réflexive (« quand vous le faites, … ») : ses cibles sont choisies à sa mise sur la pile. */
  /** `bind` : objets figés maintenant, relus comme cibles par la capacité réflexive (« cette créature »). */
  | { op: "reflexive"; targets: TargetSpec[]; effects: Effect[]; bind?: Record<string, Ref> }
  /** Contrecarre un sort ou une capacité sur la pile (701.5). */
  | { op: "counter"; what: Ref; exile?: boolean }
  /** « … à moins que [joueur] ne paie X » : s'il paie, les `skip` effets suivants sont ignorés. */
  | {
      op: "unlessPay";
      paidStore?: string;
      discard?: boolean;
      discardRandom?: boolean;
      sacrifice?: number;
      /** Les permanents sacrifiés sont non-terrains (garde de Valgavoth). */
      sacrificeNonland?: boolean;
      who: Ref;
      mana?: ManaCost;
      /** {1} pour chaque… (Swallowed by Leviathan). */
      genericAmount?: Amount;
      /** Points de vie variables (Raubahn : sa force). */
      lifeAmount?: Amount;
      life?: number;
      skip: number;
    }
  /** « Vous pouvez lancer [cette carte] depuis votre cimetière ce tour-ci. » */
  | { op: "allowCastFromGraveyard"; what: Ref }
  /** « En arrivant, choisissez un type de créature / une couleur » (sort de permanent qui se résout). */
  | { op: "chooseOnEnter"; kind: "creatureType" | "color" | "cardName" | "landName" | "landType" | "parity" }
  /** Dévorer : pendant la résolution du sort de permanent, sacrifier des permanents (nombre mémorisé). */
  | { op: "devour"; filter: ObjectFilter; graveyardUpToX?: boolean }
  /** Pendant la résolution d'un sort de permanent : choisir le permanent à copier en arrivant. */
  /** `anyController` : n'importe quel permanent sur le champ de bataille (Mockingbird). */
  | { op: "chooseCopy"; filter: ObjectFilter; anyController?: boolean; fromGraveyards?: boolean }
  /** Mimeoplasm : la source devient une copie de la carte, 0/0, en gardant ses capacités activées. */
  | { op: "becomeCopyKeepAbilities"; what: Ref }
  /** Révèle des cartes jusqu'à N cartes correspondantes ; celles-ci vont selon `to`, le reste dessous au hasard. */
  | { op: "revealUntilN"; filter: ObjectFilter; n: number; to: MoveSpec }
  /** Le contrôleur sépare les N cartes du dessus en deux piles, un adversaire en choisit une (en main), l'autre au cimetière. */
  | { op: "piles"; n: number }
  /** Carte de cimetière qui gagne le flashback jusqu'à la fin du tour (coût : son coût de mana). */
  /** `free` : flashback {0} (Archmage's Newt montée). */
  | { op: "grantFlashback"; what: Ref; free?: boolean }
  /** « Terminez le tour » (723). */
  | { op: "endTurn" }
  /** Le contrôleur de l'effet prend le contrôle de l'objet jusqu'à la fin du tour. */
  | { op: "gainControl"; what: Ref }
  /** Copies d'un sort sur la pile (mêmes cibles). */
  | { op: "copySpell"; what: Ref; count: Amount }
  /** Chaque joueur désigné révèle des cartes jusqu'à une carte correspondant au filtre, puis les met toutes au cimetière. */
  | { op: "millUntil"; who: Ref; filter: ObjectFilter }
  /** Exile les N cartes du dessus de la bibliothèque de chaque joueur désigné (mémorisées sous `store`). */
  | { op: "exileTop"; who: Ref; n: Amount; store: string }
  /** Permet au contrôleur de jouer ces cartes exilées ce tour-ci. `spellsOnly` : lancer seulement, sans timing, gratuitement. */
  /**
   * `forever` : « tant qu'elle reste exilée » (Emrakul) ; `condition` : seulement tant qu'elle est remplie ;
   * `forOwner` : le propriétaire de la carte peut la jouer (Lightstall Inquisitor), `extraCost` et `landsTapped`.
   */
  | {
      op: "grantPlay";
      what: Ref;
      /** « jusqu'à la fin de votre prochain tour » */
      untilYourNextTurn?: boolean;
      free?: boolean;
      anyTime?: boolean;
      forever?: boolean;
      condition?: Condition;
      forOwner?: boolean;
      extraCost?: number;
      landsTapped?: boolean;
      /** Du mana de n'importe quel type peut être dépensé (Tinybones, Laughing Jasper Flint). */
      anyMana?: boolean;
      /** Le sort est exilé au lieu d'aller au cimetière (Quistis Trepe). */
      exileAfter?: boolean;
      /** Une seule des cartes désignées peut être lancée (Buster Sword). */
      oneOf?: boolean;
    }
  /** Exile les cartes du dessus jusqu'à une carte correspondante (mémorisée) : Territorial Bruntar. */
  | { op: "exileUntil"; filter: ObjectFilter; store: string }
  /** Spikeshell Harrier : si sa vitesse dépasse celle de chaque autre joueur, elle baisse de 1 (pas sous 1). */
  | { op: "reduceSpeed"; who: Ref }
  /** « Vous contrôlez [le joueur ciblé] pendant son prochain tour » (The Dominion Bracelet). */
  | { op: "controlNextTurn"; who: Ref }
  /** « Votre total de points de vie devient N » (The Endstone). */
  | { op: "setLife"; who: Ref; amount: Amount }
  /** Chaque joueur désigné exile une carte de sa main (à son choix), mémorisée (Lightstall Inquisitor). */
  | { op: "exileFromOwnHand"; who: Ref; store: string }
  /** « Sacrifiez-le à moins d'engager un permanent dégagé que vous contrôlez » (Command Bridge). */
  | { op: "tapOrSacrifice" }
  /** Copie les cartes désignées et permet d'en lancer gratuitement, pour une valeur de mana totale limitée (Uldaros). */
  /**
   * Copies des cartes désignées, lancées pendant la résolution (valeur de mana totale limitée) ; `paid` : en payant
   * leur coût (Kaervek) ; `storeCast` : nombre de copies lancées.
   */
  | { op: "castCopiesFree"; what: Ref[]; maxTotalManaValue: number; paid?: boolean; storeCast?: string }
  /** « La règle des légendes ne s'applique pas aux permanents que vous contrôlez ce tour-ci. » */
  | { op: "noLegendRuleThisTurn" }
  /** Transforme les permanents recto-verso désignés (712.10 : recto ↔ verso). */
  | { op: "transform"; what: Ref }
  /** « Exilez-les, puis assemblez-les en [carte] » : la source et un permanent du nom donné (701.42). */
  | { op: "meld"; with: string }
  /** Les créatures désignées explorent (701.44), `times` fois. */
  | { op: "explore"; what: Ref; times?: Amount }
  /**
   * Découverte N (701.57) : exiler depuis le dessus jusqu'à une carte non-terrain de valeur de mana N ou moins, la
   * lancer sans payer son coût de mana ou la mettre en main ; le reste dessous dans un ordre aléatoire.
   * `who` : le joueur qui découvre (vous par défaut) ; `store` : la carte découverte.
   */
  | { op: "discover"; n: Amount; who?: Ref; store?: string }
  /**
   * 608.2g : « vous pouvez lancer [ces cartes] » pendant la résolution. Le joueur lance tout de suite une des cartes
   * (puis une autre si `many`), ou refuse. `free` : sans payer leur coût de mana ; `exileAfter` : exilé au lieu d'aller
   * au cimetière. `storeCast` / `storeRest` : cartes lancées / restées dans leur zone, pour les effets suivants.
   */
  | {
      op: "castNow";
      what: Ref;
      free?: boolean;
      many?: boolean;
      exileAfter?: boolean;
      anyMana?: boolean;
      storeCast?: string;
      storeRest?: string;
    }
  /** Fabrication : « renvoyez cette carte transformée sous le contrôle de son propriétaire » ; les matériaux lui sont liés. */
  | { op: "craftReturn" }
  /**
   * Tishana's Tidebinder : contrecarrez la capacité ; si c'est celle d'un artefact, d'une créature ou d'un planeswalker,
   * ce permanent perd toutes ses capacités tant que la source de l'effet reste sur le champ de bataille.
   */
  | { op: "counterAbilitySilence"; what: Ref }
  /** Sandswirl Wanderglyph : « [ce joueur] ne peut pas vous attaquer, ni vos planeswalkers, ce tour-ci ». */
  | { op: "cantAttackYouThisTurn"; who: Ref }
  /** Unstable Glyphbridge : pour chaque joueur, choisissez une créature correspondante ; détruisez toutes les autres. */
  | { op: "destroyAllButOnePerPlayer"; keep: ObjectFilter }
  /**
   * Fabrication Foundry : exilez des [artefacts] que vous contrôlez de valeur de mana totale au moins N (les moins chers
   * d'abord) ; `store` vaut 1 si c'est fait.
   */
  | { op: "exileForManaValue"; filter: ObjectFilter; atLeast: Amount; store: string }
  /** The Tomb of Aclazotz : « vous pouvez lancer un sort de créature depuis votre cimetière ce tour-ci » (finalité, Vampire). */
  | { op: "graveyardCreatureOnce" }
  /** « [Ce sort] gagne le rebond » (702.88). */
  | { op: "grantRebound"; what: Ref }
  /** Sovereign Okinec Ahau : autant de marqueurs +1/+1 que l'écart entre sa force et sa force de base. */
  | { op: "countersAboveBase"; filter: ObjectFilter }
  /** Les créatures désignées ont la connivence (701.50) : leur contrôleur pioche, défausse ; non-terrain : marqueur +1/+1. */
  | { op: "connive"; what: Ref }
  /** La Monture source devient montée jusqu'à la fin du tour (702.171a). */
  /** La source (ou le permanent désigné) devient montée jusqu'à la fin du tour. */
  | { op: "saddle"; what?: Ref }
  /** Met les cartes désignées sur le champ de bataille face cachée (manifester ; `ward` : cape). */
  | { op: "putFaceDown"; what: Ref; ward: boolean }
  /** Manifestation effroyable (701.62) : regarder les deux cartes du dessus, en manifester une, l'autre au cimetière. */
  /** Manifestation effroyable (701.62) : `who` manifeste (vous par défaut), `times` fois ; `store` mémorise les créatures face cachée. */
  | { op: "manifestDread"; who?: Ref; times?: Amount; store?: string }
  /** Retourne face visible les permanents désignés (sans payer de coût). */
  | { op: "turnFaceUp"; what: Ref }
  /** Distorsion : exile le permanent à la prochaine étape de fin (il pourra être lancé depuis l'exil un tour suivant). */
  | { op: "warpExile"; what: Ref }
  /** Station (702.184a) : des marqueurs de charge égaux à la force de la créature engagée pour le coût. */
  | { op: "station" }
  /** La Classe source passe au niveau N (716.2a). */
  | { op: "setClassLevel"; level: number }
  /** L'Affaire source devient résolue (719.2). */
  | { op: "solveCase" }
  /** Déverrouille la porte N d'une Salle (709.5e). */
  | { op: "unlockDoor"; what: Ref; door: number }
  /**
   * Salle : « déverrouillez une porte verrouillée » (`unlock`) ou « verrouillez ou déverrouillez une porte » (`toggle`)
   * d'une des Salles désignées ; le joueur choisit la porte s'il y en a plusieurs.
   */
  | { op: "door"; what: Ref; mode: "unlock" | "toggle" }
  /** « [Ce permanent] devient une copie de [la cible] jusqu'à la fin du tour » (couche 1). */
  | { op: "becomeCopy"; what: Ref; of: Ref; duration: "endOfTurn" | "permanent" }
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
  | { op: "loseGame"; who?: Ref }
  /** « Faites un tour supplémentaire après celui-ci » (Ultimecia, Omnipotent). */
  | { op: "extraTurn" }
  /** Triple Triad : chaque joueur exile sa carte du dessus ; la vôtre et celles de valeur de mana inférieure sont jouables gratuitement ce tour-ci. */
  | { op: "tripleTriad" }
  /** « Détachez-le » (Stolen Uniform, Unexpected Request) ; `ifAttachedTo` : seulement s'il est attaché à ce permanent. */
  | { op: "unattach"; what: Ref; ifAttachedTo?: Ref }
  /** « Exilez-le, puis mettez-le sur le champ de bataille transformé avec un marqueur de finalité » (Esper Origins). */
  | { op: "resolveToBattlefieldTransformed" }
  /** « Jusqu'à votre prochain tour, les blessures infligées à ce joueur ou à ses permanents sont doublées » (Lightning). */
  | { op: "doubleDamageTo"; who: Ref }
  /** « Prévenez toutes les blessures infligées aux créatures que vous contrôlez ce tour-ci » (Summon: Alexander). */
  | { op: "preventDamageToYourCreatures" }
  /** Le prochain sort de créature lancé ce tour-ci arrive avec des marqueurs +1/+1 ou la célérité. */
  | { op: "nextCreatureSpell"; counters?: number; haste?: boolean }
  /** Le sort désigné (sur la pile) arrive avec N marqueurs +1/+1 de plus (Torgal). */
  | { op: "spellArrivalCounters"; what: Ref; amount: Amount }
  /** « Il y a une étape de fin supplémentaire après celle-ci » (Y'shtola Rhul). */
  | { op: "extraEndStep" }
  /** « Chaque [créature] inflige des blessures égales à sa force à [cible] » (Bartz and Boko). */
  /** `from` : les créatures désignées à la place du filtre (Coordinated Clobbering). */
  | { op: "eachDealsDamage"; filter: ObjectFilter; to: Ref; from?: Ref }
  /** Hauntwoods Shrieker : révélez le permanent face cachée ; si c'est une carte de créature, vous pouvez le retourner. */
  | { op: "revealFaceDown"; what: Ref }
  /** Compte les résolutions de cette capacité ce tour-ci, mémorisé sous `store` (Venom Connoisseur). */
  | { op: "countResolution"; store: string }
  /** Détruit les permanents non-terrains de valeur X des joueurs blessés au combat par la source ce tour-ci. */
  | { op: "hellkite" }
  /** Lie des cartes à la source (Hoarding Dragon). */
  /** `to` : lie à cet objet plutôt qu'à la source (un emblème créé par le sort). */
  | { op: "link"; what: Ref; to?: Ref }
  /** « Ce joueur choisit l'un d'eux » : `store` le choisi, `${store}Rest` les autres (Trial of Agony). */
  | { op: "chooseAmong"; what: Ref; chooser: Ref; store: string }
  /** Attache une Aura ou un Équipement à un permanent (701.3). */
  | { op: "attach"; what: Ref; to: Ref }
  /** Ajoute du mana à la réserve du contrôleur. */
  /** `times` : chaque mana est ajouté autant de fois (« {G} pour chaque marqueur »). */
  | { op: "addMana"; mana: ManaType[]; times?: Amount }
  /** Molten Tide : jusqu'à la fin du tour, chaque Montagne engagée pour du mana produit {R} de plus. */
  | { op: "extraMountainMana" }
  /** Chaque joueur peut défausser sa main et piocher sept cartes (Arc of Fortune). */
  | { op: "mayWheel" }
  /** « Choisissez un type de créature. Détruisez toutes les créatures qui ne sont pas du type choisi. » */
  | { op: "destroyAllButChosenType" }
  /** Le joueur désigné révèle sa main ; le contrôleur y choisit une carte correspondante, exilée et liée à la source. */
  | { op: "exileFromHandLinked"; who: Ref; filter: ObjectFilter; untilLeaves?: boolean }
  /** « Exilez toutes les cartes de la bibliothèque de chaque adversaire, sauf celle du dessous. » */
  /** `keep` : cartes laissées au-dessous (1 par défaut ; Doomsday Excruciator : 6). */
  | { op: "exileLibraryButBottom"; who: Ref; keep?: number }
  /** Ajoute N mana d'une couleur choisie par le contrôleur. */
  | { op: "addManaChoice"; n: Amount }
  /** Exile les N cartes du dessus ; le contrôleur en choisit une qu'il peut jouer ce tour-ci. */
  | { op: "impulse"; n: number; until?: "thisTurn" | "yourNextTurn" }
  /** Blessures réparties comme le contrôleur le désire entre les cibles (au moins 1 chacune). */
  | { op: "damageDivided"; total: Amount; to: Ref }
  /** Chaque joueur désigné garde un permanent de chaque type et sacrifie le reste. */
  | { op: "keepOnePerType"; who: Ref }
  /** Le contrôleur reçoit un emblème (114) portant ces capacités. */
  | {
      op: "emblem";
      name: string;
      abilities: AbilityDef[];
      text: string;
      untilYourNextTurn?: boolean;
      thisTurn?: boolean;
      /** Mémorise l'emblème (pour y lier des objets). */
      store?: string;
    }
  /** Exile jusqu'à ce que la source quitte le champ de bataille (610.3). */
  | { op: "exileUntilLeaves"; what: Ref }
  /** Choisir des cartes (non ciblées) dans une zone du contrôleur et les déplacer. */
  | {
      op: "pickFromZone";
      zone: "graveyard" | "hand";
      filter: ObjectFilter;
      count: Amount;
      min?: number;
      /** Choix au hasard (Omenpath Journey). */
      random?: boolean;
      to: MoveSpec;
      prompt?: string;
      /** Exclut les objets mémorisés sous ce nom (« une autre carte de permanent »). */
      excludeStored?: string;
      /** Valeur de mana au plus égale à ce montant (Anticausal Vestige : le nombre de terrains). */
      maxManaValue?: Amount;
      /** Mémorise les objets déplacés. */
      store?: string;
      /** Choisir parmi ces objets plutôt que dans la zone (cartes exilées avec la source, mémorisées…). */
      pool?: Ref;
    }
  /** Le propriétaire met l'objet au-dessus ou au-dessous de sa bibliothèque. */
  /** `topDamage` : si le propriétaire la met au-dessus, la source lui inflige N blessures (Clash of Elements). */
  | { op: "libraryTopOrBottom"; what: Ref; topDamage?: number }
  /** Chaque joueur désigné perd N points de vie à moins de défausser une carte ou de sacrifier un permanent. */
  /** `damage` : la source inflige ces blessures au lieu de la perte de points de vie (Osseous Sticktwister). */
  /** `times` : répété N fois (Rottenmouth Viper : pour chaque marqueur de fléau). */
  | {
      op: "punisher";
      who: Ref;
      loseLife: number;
      discard?: boolean;
      sacrifice?: ObjectFilter;
      damage?: Amount;
      times?: Amount;
    }
  /** Révéler jusqu'à une carte correspondant au filtre : elle va en main, le reste au-dessous dans un ordre aléatoire. */
  | { op: "revealUntil"; filter: ObjectFilter; to: MoveSpec }
  /**
   * Fourrager (701.61, Bloomburrow) : exiler trois cartes de son cimetière ou sacrifier une Nourriture (choix automatique).
   * `skip` : « vous pouvez fourrager ; si vous le faites, … » (les `skip` effets suivants sont ignorés sinon).
   */
  | { op: "forage"; skip: number }
  /** Cadeau (702.174) : l'adversaire choisi reçoit le cadeau promis. */
  | { op: "gift"; kind: GiftKind; token?: TokenSpec }
  /** Dégage tous les permanents correspondants du contrôleur. */
  | { op: "untapAll"; filter: ObjectFilter }
  /** Chaque joueur subit des blessures égales au nombre de ses permanents correspondants (Sunspine Lynx). */
  | { op: "damageEachPlayerPer"; filter: ObjectFilter }
  /**
   * Portent of Calamity : révéler X cartes, en exiler une par type de carte (choix automatique), le reste au cimetière.
   * Mémorise `$ids:free` (le sort à lancer gratuitement si quatre cartes ou plus ont été exilées) et `$ids:rest`.
   */
  | { op: "portent" };

/** Ce qu'offre un cadeau : une carte, une Nourriture, un Poisson engagé, un Trésor. */
export type GiftKind = "card" | "food" | "fish" | "treasure";

// ---------------------------------------------------------------------------
// État de partie
// ---------------------------------------------------------------------------
