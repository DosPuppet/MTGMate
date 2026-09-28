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
  /** Hybrides monocolores {2/W} : un mana de cette couleur ou deux mana génériques. */
  twoHybrid?: ManaType[];
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
  /** Cynical Loner : « ne peut pas être bloquée par des Lueurs ». */
  | "cantBeBlockedByGlimmers"
  /** Toby, Beastie Befriender : « ce jeton ne peut ni attaquer ni bloquer seul ». */
  | "cantAttackOrBlockAlone"
  /** « Ne peut pas être bloquée par des créatures de force 2 ou moins. » */
  | "cantBeBlockedByPowerLE2"
  /** Azure Beastbinder : « ne peut pas être bloquée par des créatures de force 2 ou plus ». */
  | "cantBeBlockedByPowerGE2"
  /** « Doit être bloquée si possible » (509.1c). */
  | "mustBeBlocked"
  /** Restrictions (pas des mots-clés imprimés, mais gérées comme des capacités de couche 6). */
  | "cantBlock"
  | "cantAttack"
  | "unblockable"
  | "mustAttack"
  | "canBlockOnlyFlyers"
  | "cantBeBlockedByMoreThanOne"
  | "doesntUntap"
  | "cantBeBlockedByWalls"
  /** Stuck in Summoner's Sanctum : « ses capacités activées ne peuvent pas être activées ». */
  | "noActivatedAbilities"
  /** Ancient Adamantoise : « les blessures ne sont pas retirées de cette créature pendant l'étape de nettoyage ». */
  | "keepsDamage"
  /** Ancient Adamantoise : les blessures infligées à son contrôleur et à ses autres permanents lui sont infligées à la place. */
  | "absorbsDamage"
  /** Relentless X-ATM092 : « ne peut être bloquée que par trois créatures ou plus ». */
  | "minThreeBlockers"
  /** Diamond Weapon : « prévenez toutes les blessures de combat qui devraient lui être infligées ». */
  | "combatDamageImmune"
  /** Convocation (702.51) : les créatures peuvent aider à payer le sort. */
  | "convoke"
  /** Ghalta the Immovable : si son endurance dépasse sa force, elle inflige ses blessures de combat selon son endurance. */
  | "assignsToughness"
  /** Loot, the Anomaly : une force négative inflige ses blessures de combat comme si elle était positive. */
  | "absolutePowerDamage"
  /** Ghalta the Immovable : peut attaquer comme si elle n'avait pas le défenseur. */
  | "attacksDespiteDefender"
  /** Resilient Roadrunner : ne peut être bloquée que par des créatures avec la célérité. */
  | "cantBeBlockedExceptByHaste"
  /** Pilote (Aetherdrift) : monte et équipe comme si sa force était supérieure de 2. */
  | "crewPlus2"
  /** Interface Ace : monte et équipe avec son endurance plutôt que sa force. */
  | "crewWithToughness"
  /** « Start your engines! » (702.179) : si vous n'avez pas de vitesse, elle démarre à 1. */
  | "startYourEngines";

/** Restrictions : affichées différemment des mots-clés. */
export const RESTRICTIONS: readonly Keyword[] = [
  "cantBlock",
  "canBlockOnlyFlyers",
  "cantAttack",
  "unblockable",
  "mustAttack",
  "doesntUntap",
  "cantBeBlockedByWalls",
  "noActivatedAbilities",
  "minThreeBlockers",
  "cantAttackOrBlockAlone",
  "keepsDamage",
  "absorbsDamage",
  "combatDamageImmune",
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

export * from "./model/cards";
export * from "./model/decisions";
export * from "./model/effects";
export * from "./model/rules";
export * from "./model/state";
