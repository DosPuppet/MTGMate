/**
 * Enregistrement d'une partie : graine, joueurs et decks (dans l'ordre), puis toutes les décisions appliquées.
 * Le moteur étant déterministe, rejouer ces décisions redonne exactement la même partie : reprise d'une partie en
 * ligne après un redémarrage du serveur, replays, export d'une partie pour signaler un bug.
 *
 * Les decks sont enregistrés par noms de cartes : `resolve` redonne les définitions au rejeu.
 */
export { outcomeHash } from "./fingerprint";

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, type StepResult, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export const RECORD_FORMAT = "mtgx-game";
export const RECORD_VERSION = 1;

/**
 * Version des règles du moteur. Elle avance à chaque lot qui change le comportement d'une partie (docs/plans/PLAN-R.md, lots
 * « [règles] ») : un enregistrement d'une autre version peut ne plus se rejouer à l'identique. Absente d'un
 * enregistrement : 0.
 *
 * - 1 : un compteur d'identifiants par préfixe (lot F1).
 * - 2 : corrections R0.1 (second partagé, protection, 704.5b, gagner ou perdre la partie, marqueurs payés comme coût,
 *   506.4).
 * - 3 : corrections R0.2 (taxes des sorts gratuits, taxes d'attaque et de blocage cumulées, obligation d'attaquer sans
 *   payer de taxe).
 * - 4 : nettoyage avec actions basées sur l'état, déclencheurs et priorité (514.3a, R0.3).
 * - 5 : lien de vie, un gain par source et par lot de blessures simultanées (R0.4).
 * - 6 : des permanents qui arrivent en même temps se voient arriver (603.6a, R0.5).
 * - 7 : accès unique aux statiques de joueur, conditions et effets sur les joueurs respectés partout (R4.0).
 * - 8 : marqueurs, types, état engagé, attaque, célérité et Imminence posés avant l'événement d'arrivée ; défenseur des
 *   jetons attaquants au choix (R2.1).
 * - 9 : copies de permanents (valeur de mana, loyauté et remplacements de la définition copiée, copie d'une copie,
 *   copie par une statique, copie d'un sort de Clone ; R2.2).
 * - 10 : un Clone ou une Aura qui arrive sans être lancé choisit ce qu'il copie ou enchante ; une Aura sans rien à
 *   enchanter reste dans sa zone (707.5, 303.4f, 303.4g ; R2.3).
 * - 11 : ordre des remplacements qui modifient un nombre (blessures, marqueurs, PV, pioche) choisi pour le joueur affecté ;
 *   toutes les pioches de la partie passent par les remplacements (616.1 ; R1).
 * - 12 : une copie de sort est un objet sur la pile ; nouvelles cibles au choix pour toute copie, qui deviennent ses
 *   cibles (garde) ; répartition des blessures et des marqueurs annoncée à la mise sur la pile, part d'une cible devenue
 *   illégale perdue (707.10c, 601.2d, 608.2b ; R3).
 * - 13 : le contrôle est une couche (613.1b) : contrôleur de base et effets de contrôle horodatés ; un joueur qui quitte
 *   la partie rend ce qu'il avait volé (800.4a ; R2.4).
 * - 14 : dépendances de couches par point fixe (conditions, « pour chaque », F/E définies qui lisent des permanents) ;
 *   exceptions de copie copiables ; couleurs ajoutées (613.8, 707.9b, 105.3 ; R2.5).
 * - 15 : protection et défense talismanique « contre [filtre] » : Sword of Wealth and Power protège des éphémères et
 *   des rituels, Resilient Roadrunner des Coyotes (702.16 ; R4.2).
 * - 16 : permissions de jouer depuis le cimetière ou le dessus de la bibliothèque unifiées (une permission sans coût passe
 *   avant Muldrotha ; Forgotten Cellar : seulement des sorts) ; modificateurs de coût des capacités unifiés (R4.4).
 * - 17 : mulligans tour de table par tour de table (103.5) ; blocages des défenseurs appliqués ensemble (509.1 ; R5).
 * - 18 : boucle d'actions obligatoires, partie nulle (104.4b) ; les déclenchements d'un joueur qui quitte la partie
 *   cessent d'exister (800.4a ; R6).
 * - 19 : justesse des cartes (R7) : « l'objet de l'événement » et « si la source… » lisent les dernières informations
 *   connues d'un objet parti (603.10) ; `pumpAll` respecte « autre » ; prouesses multiples ; terrain joué depuis le
 *   cimetière par une permission ; le solveur de mana préfère la capacité qui produit le plus (Tablet of Discovery).
 * - 20 : Tarkir: Dragonstorm, lot A : un « si » intermédiaire sur l'objet de l'événement est vérifié au déclenchement et
 *   à la résolution (603.4 ; Aclazotz) ; « a déjà infligé des blessures » (Karakyk Guardian) ; « valeur de mana X ou
 *   moins » dans une recherche (Nature's Rhythm).
 * - 21 : remplacements des blessures et de la perte de PV en données (`EventReplacement`, R1, familles E et F) ; une
 *   prévention d'un autre joueur que le blessé passe avant les modifications, la sienne après (616.1) ; boucliers « la
 *   prochaine fois que » (615.7, New Way Forward) ; des blessures prévenues ne comptent pas comme infligées.
 * - 22 : un permanent qui quitte le champ de bataille est toujours retiré du combat (506.4), quel que soit l'effet ou le
 *   coût qui le déplace (Lorwyn Eclipsed : « contemplez et exilez » un attaquant).
 * - 23 : Lorwyn Eclipsed, lot B : « du type choisi » lu partout (filtres d'effet, déclencheurs, réductions de coût,
 *   remplacements ; choix d'un sort ou d'un emblème) ; « quand il se transforme en… » ; flétrissure (702.80) ; « dégagez »
 *   retire un marqueur d'étourdissement (122.1d) ; les jetons créés sont au journal du tour ; « une autre carte » reconnaît
 *   la source morte ; une réduction de coût voit la carte lancée (contempler) ; « retirez un marqueur » de toute sorte ;
 *   le cache des couches est invalidé après le départ des permanents d'un joueur éliminé (800.4a).
 * - 24 : Lorwyn Eclipsed, lot C : un sort lancé est vu avec sa valeur de mana et son nom (filtres de mana restreint et de
 *   réductions de coût) ; mana restreint dans la réserve ; marqueurs mis au journal du tour ; un sort sur la pile peut
 *   gagner un mot-clé ; « lancer les cartes exilées liées » avec ses variantes (gratuit, une fois par tour, ce tour-ci…).
 * - 25 : Lorwyn Eclipsed, lot D : remplacements des familles H et I (jetons, marqueurs, PV gagnés, pioche, meule, mana) en
 *   données (`EventReplacement`), doubleurs et drapeaux convertis ; « ces jetons plus un jeton » appliqué une fois par
 *   événement ; un permanent peut ne pas pouvoir être dégagé ; « le terrain enchanté est de la couleur choisie ».
 * - 26 : Wilds of Eldraine, socle : jetons-Auras (Rôles), un seul Rôle par joueur sur un même permanent (704.5y).
 * - 27 : Secrets of Strixhaven, socle : une condition « si » d'une capacité déclenchée lit les montants de l'objet de
 *   l'événement (mana dépensé pour le sort lancé : Increment) ; Wilds of Eldraine, lots C4 et C5 : paiement de PV
 *   centralisé (Ashiok), « une fois par tour » depuis le dessus de la bibliothèque, coûts de capacités réduits.
 * - 28 : Secrets of Strixhaven, lot A : les montants « arrive avec » savent additionner, opposer, prendre un maximum et
 *   compter les couleurs dépensées (Sheriff of Safe Passage arrivait sans marqueur) ; les conditions « arrive avec »
 *   voient X ; « répartissez X marqueurs » sans minimum par cible quand X est plus petit que le nombre de cibles.
 * - 29 : Secrets of Strixhaven, lot A6 : le mana dépensé d'un éphémère ou d'un rituel qui se résout est lu (`manaSpent`) ;
 *   une carte lancée depuis l'exil avec « puis exilez-la » y retourne ; filtres de valeur de mana « X » et « couleurs
 *   dépensées ».
 * - 30 : Secrets of Strixhaven, lot C1 : « jouable jusqu'à votre prochain tour » pour le propriétaire (Memory Vessel ne
 *   valait que ce tour-ci) et « jusqu'à la fin de son prochain tour » ; qui a mis des marqueurs sur un objet ce tour-ci ;
 *   moitiés de PV et de main par joueur ; capacités retardées « au début de votre prochaine phase principale ».
 * - 31 : Secrets of Strixhaven, lot C2 : une copie de sort n'hérite plus des modifications d'arrivée de l'original ; le
 *   jeton copie d'un sort de permanent reçoit les siennes (célérité, sacrifice en fin de tour) ; sort gratuit de la main
 *   une fois par tour ; « ce sort ne peut pas être copié ».
 * - 32 : Secrets of Strixhaven, lot C3 : cascade (702.85) ; l'événement de pioche désigne la carte piochée (miracle) ;
 *   « lancer maintenant » pour un coût donné depuis la main.
 * - 33 : Murders at Karlov Manor, lot A : une capacité déclenchée « une à N cibles » respecte le minimum (Armament
 *   Dragon n'avait aucune cible sous N créatures) ; la condition d'un déclencheur voit l'événement (montant) ; « s'il
 *   n'a pas de carte en main » hors résolution ; désignation suspect (701.60).
 * - 34 : Murders at Karlov Manor, lot A6 : un sort ou une capacité à « X cibles » est proposé même sans cible (X = 0) ;
 *   l'IA ajuste X au nombre de cibles.
 * - 35 : Murders at Karlov Manor, lot B1 : réunir des preuves en coût de capacité (et de mana), en effet facultatif (N ou
 *   X), en garde, et « chaque fois que vous réunissez des preuves » ; choix automatique des preuves sans gâcher une carte
 *   chère ; garde « sacrifiez [type] » filtrée.
 * - 36 : Murders at Karlov Manor, lot B2 : X dans un coût de déguisement, coût de déguisement réduit, réduction des sorts
 *   face cachée, interdiction de retourner face visible, terrain lancé face cachée ; une arrivée face cachée est notée
 *   au journal du tour comme une créature sans type (la carte reste cachée).
 * - 37 : Murders at Karlov Manor, lot C3 : un sort qui quitte la pile passe par un seul chemin (exil ou dessous de la
 *   bibliothèque à la place du cimetière) ; `cond.refMatches` résout son filtre ; un déclencheur « quitte » d'une créature
 *   exilée suit la nouvelle carte ; effets « tant que la source reste engagée ».
 * - 38 : Avatar: The Last Airbender, socle : le mana de la maîtrise du feu reste jusqu'à la fin du combat (et non du tour) ;
 *   maîtrise de l'eau (artefacts et créatures engagés pour {1}) dans les coûts des capacités activées.
 */
export const RULES_VERSION = 38;

/** Un point de contrôle toutes les N décisions (plus la dernière de la partie). */
export const CHECKPOINT_EVERY = 25;

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  version: typeof RECORD_VERSION;
  seed: number;
  /**
   * Premier joueur imposé à la création (absent : tiré au sort par le moteur, ce qui consomme son hasard ; le rejeu doit
   * refaire ce tirage, pas le remplacer par son résultat).
   */
  startingPlayer?: PlayerId;
  startingLife?: number;
  players: { id: PlayerId; name: string; deck: string[] }[];
  /** Décisions appliquées, dans l'ordre : [joueur qui a décidé, décision]. */
  decisions: [PlayerId, Decision][];
  /** Date de début (ISO), pour l'affichage. */
  createdAt?: string;
  /** Version des règles du moteur qui a joué la partie (absente : 0). */
  rules?: number;
  /** Points de contrôle : [nombre de décisions appliquées, `outcomeHash` de l'état obtenu]. */
  checkpoints?: [number, string][];
}

/** Crée la partie et l'enregistrement qui permettra de la rejouer. */
export function createRecordedGame(opts: GameOptions): StepResult & { record: GameRecord } {
  const result = createGame(opts);
  const record: GameRecord = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    seed: opts.seed,
    startingPlayer: opts.startingPlayer,
    startingLife: opts.startingLife,
    players: opts.players.map((p) => ({ id: p.id, name: p.name, deck: p.deck.map((c) => c.name) })),
    decisions: [],
    createdAt: new Date().toISOString(),
    rules: RULES_VERSION,
    checkpoints: [],
  };
  return { ...result, record };
}

/** Ajoute une décision acceptée à l'enregistrement, avec un point de contrôle toutes les `CHECKPOINT_EVERY` décisions. */
export function recordDecision(record: GameRecord, player: PlayerId, d: Decision, after: GameState): void {
  record.decisions.push([player, d]);
  const n = record.decisions.length;
  if (n % CHECKPOINT_EVERY !== 0 && !after.over) return;
  record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(after)]];
}

/** Vérifie la forme d'un enregistrement reçu (fichier importé, disque du serveur). */
export function isGameRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  return (
    !!r &&
    r.format === RECORD_FORMAT &&
    r.version === RECORD_VERSION &&
    Number.isInteger(r.seed) &&
    (r.rules === undefined || Number.isInteger(r.rules)) &&
    (r.checkpoints === undefined ||
      (Array.isArray(r.checkpoints) &&
        r.checkpoints.every((c) => Array.isArray(c) && Number.isInteger(c[0]) && typeof c[1] === "string"))) &&
    (r.startingPlayer === undefined || typeof r.startingPlayer === "string") &&
    Array.isArray(r.players) &&
    r.players.every((p) => typeof p?.id === "string" && typeof p.name === "string" && Array.isArray(p.deck)) &&
    Array.isArray(r.decisions) &&
    r.decisions.every((d) => Array.isArray(d) && typeof d[0] === "string" && !!d[1] && typeof d[1] === "object")
  );
}

function initial(record: GameRecord, resolve: (name: string) => CardDef): StepResult {
  return createGame({
    seed: record.seed,
    startingPlayer: record.startingPlayer,
    startingLife: record.startingLife,
    players: record.players.map((p) => ({ id: p.id, name: p.name, deck: p.deck.map(resolve) })),
  });
}

/** Rejoue la partie jusqu'à la décision `upTo` (exclue ; toutes par défaut) : état et événements produits. */
export function replayGame(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  upTo = record.decisions.length,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = initial(record, resolve);
  const all = [...events];
  for (const [player, d] of record.decisions.slice(0, upTo)) {
    ({ state, events } = submit(state, player, d));
    all.push(...events);
  }
  return { state, events: all };
}

/** Tous les états de la partie : le départ, puis un par décision (replays pas à pas). */
export function replayStates(record: GameRecord, resolve: (name: string) => CardDef): GameState[] {
  let { state } = initial(record, resolve);
  const out = [state];
  for (const [player, d] of record.decisions) {
    state = submit(state, player, d).state;
    out.push(state);
  }
  return out;
}

/** Rejeu vérifié : où et pourquoi la partie cesse d'être celle qui a été enregistrée. */
export interface ReplayDivergence {
  /** Nombre de décisions appliquées sans écart. */
  index: number;
  reason: "error" | "checkpoint";
  message: string;
}

/**
 * Rejoue l'enregistrement en vérifiant ses points de contrôle, et s'arrête à la première divergence : décision refusée
 * (ou erreur du moteur), ou empreinte différente. `onStep` reçoit chaque état validé (le départ compris) et les événements
 * qui y mènent. Seuls les états antérieurs au point de contrôle qui échoue sont montrés comme sûrs : l'écart peut dater
 * d'avant lui, mais pas d'avant le point de contrôle précédent.
 */
export function replayChecked(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  onStep?: (state: GameState, events: GameEvent[]) => void,
): { state: GameState; applied: number; divergence: ReplayDivergence | null } {
  let { state, events } = initial(record, resolve);
  onStep?.(state, events);
  const expected = new Map(record.checkpoints ?? []);
  let verified = { state, applied: 0 };
  const pending: [GameState, GameEvent[]][] = [];
  const flush = () => {
    for (const [st, ev] of pending) onStep?.(st, ev);
    pending.length = 0;
  };
  for (let i = 0; i < record.decisions.length; i++) {
    const [player, d] = record.decisions[i] as [PlayerId, Decision];
    try {
      ({ state, events } = submit(state, player, d));
    } catch (e) {
      flush();
      const message = e instanceof Error ? e.message : String(e);
      return { state, applied: i, divergence: { index: i, reason: "error", message } };
    }
    pending.push([state, events]);
    const hash = expected.get(i + 1);
    if (hash === undefined) continue;
    if (hash !== outcomeHash(state)) {
      pending.length = 0;
      return {
        state: verified.state,
        applied: verified.applied,
        divergence: { index: verified.applied, reason: "checkpoint", message: `écart constaté à la décision ${i + 1}` },
      };
    }
    flush();
    verified = { state, applied: i + 1 };
  }
  flush();
  return { state, applied: record.decisions.length, divergence: null };
}
