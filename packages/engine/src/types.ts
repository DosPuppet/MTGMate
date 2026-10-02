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
  /** Changelin (702.73) : a tous les types de créature, dans toutes les zones. */
  | "changeling"
  /** Flétrissure (702.80) : ses blessures aux créatures prennent la forme de marqueurs −1/−1. */
  | "wither"
  /** « Doit être bloquée si possible » (509.1c). */
  | "mustBeBlocked"
  /** Wolverine : « si des blessures devaient lui être infligées, elles le sont, mais les autres blessures sont guéries ». */
  | "damageHealsFirst"
  /** Restrictions (pas des mots-clés imprimés, mais gérées comme des capacités de couche 6). */
  | "cantBlock"
  | "cantAttack"
  | "unblockable"
  | "mustAttack"
  | "doesntUntap"
  /** Stuck in Summoner's Sanctum : « ses capacités activées ne peuvent pas être activées ». */
  | "noActivatedAbilities"
  /** Ancient Adamantoise : « les blessures ne sont pas retirées de cette créature pendant l'étape de nettoyage ». */
  | "keepsDamage"
  /** Ancient Adamantoise : les blessures infligées à son contrôleur et à ses autres permanents lui sont infligées à la place. */
  | "absorbsDamage"
  /** Diamond Weapon : « prévenez toutes les blessures de combat qui devraient lui être infligées ». */
  | "combatDamageImmune"
  /** Convocation (702.51) : les créatures peuvent aider à payer le sort. */
  | "convoke"
  /** Improvisation (702.126) : les artefacts dégagés peuvent payer {1} chacun du coût du sort. */
  | "improvise"
  /** Émeute (702.136) : il arrive avec un marqueur +1/+1 ou la célérité, au choix de son contrôleur. */
  | "riot"
  /** Ghalta the Immovable : peut attaquer comme si elle n'avait pas le défenseur. */
  | "attacksDespiteDefender"
  /** « Start your engines! » (702.179) : si vous n'avez pas de vitesse, elle démarre à 1. */
  | "startYourEngines"
  /** Décomposition (702.147) : ne peut pas bloquer, et quand elle attaque, elle est sacrifiée à la fin du combat. */
  | "decayed"
  /** « Ne peut pas être sacrifié » (Zurgo, Thunder's Decree : ses jetons Guerrier pendant votre étape de fin). */
  | "cantBeSacrificed"
  /** « Ne peut pas devenir suspecte » (Airtight Alibi, 701.60). */
  | "cantBeSuspected"
  /** « Vous pouvez choisir de ne pas dégager cette créature lors de votre étape de dégagement » (Hedge Whisperer). */
  | "mayNotUntap";

/** Restrictions : affichées différemment des mots-clés. */
export const RESTRICTIONS: readonly Keyword[] = [
  "cantBlock",
  "cantAttack",
  "unblockable",
  "mustAttack",
  "doesntUntap",
  "noActivatedAbilities",
  "keepsDamage",
  "absorbsDamage",
  "combatDamageImmune",
  "damageHealsFirst",
  "cantBeSacrificed",
  "cantBeSuspected",
  "mayNotUntap",
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
  "decayed",
];

export * from "./model/cards";
export * from "./model/decisions";
export * from "./model/effects";
export * from "./model/rules";
export * from "./model/state";
