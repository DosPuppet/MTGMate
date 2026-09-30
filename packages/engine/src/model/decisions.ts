/** Types du moteur — Décisions, choix, options d'action et événements. Réexportés par `types.ts`. */
import type { GiftKind, ManaCost, ManaType, ObjectId, PlayerId, Step, Zone } from "../types";

export type PendingDecision =
  | { kind: "mulligan"; player: PlayerId; mulligans: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  /**
   * `castNow` : priorité restreinte pendant une résolution (608.2g, « vous pouvez lancer cette carte ») : le joueur
   * lance l'une des cartes proposées, ou passe pour refuser. La résolution reprend ensuite.
   */
  | { kind: "priority"; player: PlayerId; castNow?: CastNowRequest }
  | { kind: "declareAttackers"; player: PlayerId }
  | { kind: "declareBlockers"; player: PlayerId }
  | { kind: "discard"; player: PlayerId; count: number }
  | { kind: "choice"; player: PlayerId; request: ChoiceRequest; purpose: ChoicePurpose };

/** Cartes qu'un joueur peut lancer pendant la résolution d'un sort ou d'une capacité. */
export interface CastNowRequest {
  cards: ObjectId[];
  prompt: string;
}

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
  | "proliferate"
  | "impulse"
  | "divideDamage"
  | "keepPerType"
  | "discover"
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
  /** Permanents engagés pour le coût (station, équipage, monture), choisis par le joueur. */
  tap?: ObjectId[];
  /** Matériaux d'une fabrication (702.167), choisis par le joueur. */
  materials?: ObjectId[];
  /** Face lancée d'une carte à plusieurs faces (1 : l'aventure) ; absente : la carte elle-même (recto). */
  face?: number;
  /** Lancée face cachée pour {3} (déguisement). */
  faceDown?: boolean;
  /** Lancée pour son coût de distorsion (702.185). */
  warp?: boolean;
}

export type Decision =
  | { type: "keep" }
  | { type: "mulligan" }
  | { type: "bottom"; cards: ObjectId[] }
  | { type: "pass" }
  /** `landType` : type de terrain de base choisi en arrivant (Multiversal Passage). */
  | { type: "playLand"; card: ObjectId; payLife?: boolean; landType?: string }
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
  /** Nombre minimal de cibles (« une ou deux cibles ») ; `count` par défaut. */
  min?: number;
  /** Contrainte entre les cibles : même joueur, ou joueurs différents (avec le joueur de chaque cible). */
  group?: { kind: "same" | "different"; holders: Record<string, string> };
  kickedCount?: number;
  /** Cibles légales si le sort est kické ou si le cadeau est promis (filtre différent). */
  kickedLegal?: string[];
  otherThan?: string[];
  attachedToTarget?: string;
}

export interface ModeOption {
  index: number;
  label?: string;
  targets: TargetOption[];
  /** Mode possible seulement en payant le coût additionnel (« si vous l'avez payé, choisissez les deux »). */
  requiresKicker?: boolean;
}

export type ActionOption =
  | { type: "pass" }
  /** `landType` : type de terrain de base choisi en arrivant (Multiversal Passage). */
  | { type: "playLand"; card: ObjectId; payLife?: boolean; landType?: string }
  | {
      type: "cast";
      card: ObjectId;
      /** Face lancée (aventure…) et son nom, pour l'interface. */
      face?: number;
      faceName?: string;
      /** Lancée face cachée pour {3} (déguisement). */
      faceDown?: boolean;
      /** Lancée pour son coût de distorsion. */
      warp?: boolean;
      modes: ModeOption[];
      xMax: number | null;
      kickerAffordable: boolean;
      /** Coût optionnel propre à l'extension (Bloomburrow) : question et réponses affichées à la place de « kicker ». */
      kickerPrompt?: { title: string; without: string; with: string };
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
      /** Libellé du coût alternatif (« Imminence 4 — {2}{W}{W} »). */
      altLabel?: string;
      /** Coût normal payable. */
      normalAvailable?: boolean;
      additional?: {
        /** `orLife` : on peut payer ces PV au lieu de défausser ; `orSacrifice` : les options comprennent des permanents. */
        discard?: { count: number; options: ObjectId[]; orLife?: number; orSacrifice?: boolean };
        /** `orPay` : on peut payer ce mana au lieu de sacrifier (Eaten Alive). */
        sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
        /**
         * Harmonie (702.180) : au plus `count` (1) créature à engager, facultative, qui réduit le coût de sa force
         * (`powers`) ; `suggested` : le choix par défaut (appliqué si la décision n'a pas de `tap`).
         */
        tap?: { count: number; options: ObjectId[]; powers: Record<ObjectId, number>; suggested: ObjectId[]; optional: true };
      };
      /**
       * Kicker sans mana (Marchandage, FIN) : permanents qui peuvent le payer si le sort est kické, le choix par défaut en
       * premier ; le joueur en désigne un par `sacrifice`.
       */
      kickerPermanents?: ObjectId[];
      /** Travail d'équipe : créatures à engager si le sort est kické (force totale `minPower`), désignées par `tap`. */
      kickerTap?: {
        count: number;
        options: ObjectId[];
        minPower: number;
        powers: Record<ObjectId, number>;
        suggested: ObjectId[];
      };
    }
  | {
      type: "activate";
      source: ObjectId;
      ability: number;
      label?: string;
      targets: TargetOption[];
      xMax: number | null;
      additional?: {
        sacrifice?: { count: number; options: ObjectId[] };
        /**
         * Permanents à engager : exactement `count` (station), ou, avec `minPower`, autant qu'on veut pourvu que leur force
         * totale (`powers`) atteigne `minPower` (équipage, monture). `suggested` : le choix par défaut.
         */
        tap?: {
          count: number;
          options: ObjectId[];
          minPower?: number;
          powers?: Record<ObjectId, number>;
          suggested?: ObjectId[];
        };
        discard?: { count: number; options: ObjectId[] };
        /** Fabrication : entre `min` et `max` matériaux parmi `options` (cimetière et permanents). */
        materials?: { min: number; max: number; options: ObjectId[]; suggested: ObjectId[] };
      };
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
  /** Cartes révélées à tous (dessus de la bibliothèque qui explore…). */
  | { type: "reveal"; player: PlayerId; defIds: string[] }
  /** Cadeau (702.174) offert par `player` à `to`. */
  | { type: "gift"; player: PlayerId; to: PlayerId; kind: GiftKind }
  /** Un permanent face cachée est retourné face visible (la carte est révélée). */
  | { type: "turnedFaceUp"; objectId: ObjectId; defId: string }
  /** 702.170 : la carte devient complotée. */
  | { type: "plotted"; player: PlayerId; defId: string }
  /** 705 : pile ou face. */
  | { type: "coinFlip"; player: PlayerId; won: boolean }
  /** 702.179 : nouvelle vitesse du joueur. */
  | { type: "speed"; player: PlayerId; speed: number }
  /** 722 : `by` contrôle le tour de `player`. */
  | { type: "turnControl"; player: PlayerId; by: PlayerId }
  /** Un permanent recto-verso se transforme (`defId` : la face désormais visible). */
  | { type: "transform"; objectId: ObjectId; defId: string }
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
  | { type: "lose"; player: PlayerId; reason: "life" | "draw" | "poison" | "concede" }
  | { type: "gameOver"; winner: PlayerId | null };
