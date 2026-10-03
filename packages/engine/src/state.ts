/**
 * Primitives de manipulation de l'état : identifiants, hasard déterministe,
 * événements, zones et caractéristiques calculées (couches).
 */
import type {
  CardDef,
  GameObject,
  GameState,
  LkiSnapshot,
  ManaCost,
  ManaType,
  ObjectId,
  PlayerId,
  Step,
  TurnStats,
  Zone,
} from "./types";

/** Types de permanent (Descente : « une carte de permanent a été mise dans votre cimetière »). */

// Événements d'affichage : `events.ts` (sans dépendance), réexportés ici.
export { collectEvents, emit } from "./events";

import { emit } from "./events";

// ---------------------------------------------------------------------------
// Événements de règles : écoutés par le module des déclencheurs (triggers.ts).
// Distincts des GameEvent, qui ne servent qu'à l'affichage.
// ---------------------------------------------------------------------------

export type RulesEvent =
  | {
      e: "zone";
      oldId: ObjectId | null;
      newId: ObjectId | null;
      from: Zone | null;
      to: Zone;
      /** Caractéristiques au moment du départ du champ de bataille. */
      lki: LkiSnapshot | null;
    }
  /** `instantSorceryBefore` : éphémères et rituels déjà lancés ce tour-ci par ce joueur (pour un éphémère ou un rituel). */
  | { e: "cast"; player: PlayerId; stackId: ObjectId; instantSorceryBefore?: number }
  /** Cartes défaussées (nouveaux identifiants, dans le cimetière). */
  | { e: "discard"; player: PlayerId; cards: ObjectId[] }
  | { e: "discardBatch"; player: PlayerId; count: number }
  | { e: "cycled"; player: PlayerId; card: ObjectId; x: number }
  | { e: "exhaust"; player: PlayerId; source: ObjectId }
  | { e: "crime"; player: PlayerId }
  | { e: "plotted"; card: ObjectId }
  | { e: "attack"; attacker: ObjectId; defender: PlayerId }
  /** `excess` : blessures en excès (120.4a) infligées à une créature ou à un planeswalker. */
  | {
      e: "damage";
      sourceId: ObjectId | null;
      /** Sort qui inflige les blessures (élément de pile qui se résout). */
      stackId?: string;
      sourceController?: PlayerId;
      target: string;
      amount: number;
      combat: boolean;
      excess?: number;
    }
  | { e: "step"; step: Step; active: PlayerId }
  /** `first` : première fois que ce joueur gagne des points de vie ce tour-ci. */
  | { e: "lifeGain"; player: PlayerId; amount: number; first: boolean }
  | { e: "lifeLoss"; player: PlayerId; amount: number }
  /** `nth` : rang de cette carte parmi celles piochées par ce joueur ce tour-ci. */
  | { e: "draw"; player: PlayerId; nth: number; objectId?: ObjectId }
  | { e: "attackWith"; player: PlayerId; count: number }
  | { e: "counters"; objectId: ObjectId; kind: string; amount: number; first: boolean; by: PlayerId }
  /** Un sort ou une capacité vient d'être mis sur la pile avec ces cibles (identifiant d'élément de pile). */
  | { e: "targeted"; stackId: string; controller: PlayerId; targets: string[] }
  | { e: "untap"; objectId: ObjectId }
  /** Un permanent recto-verso s'est transformé (701.28) : il a désormais les capacités de la face visible. */
  | { e: "transformed"; objectId: ObjectId }
  /** `by` : le joueur qui l'engage (contrôleur de ce qui se résout ; sinon, coût ou mana, son contrôleur). */
  /** `cause` : engagé pour payer un travail d'équipe ; `first` : la première fois de ce tour. */
  | { e: "tap"; objectId: ObjectId; by: PlayerId; cause?: "teamwork"; first?: boolean }
  /** Un joueur vient de regarder (scry) ou de surveiller. */
  | { e: "scry"; player: PlayerId }
  /** Un joueur a cherché dans sa bibliothèque (Wan Shi Tong). */
  | { e: "search"; player: PlayerId }
  /** Capacité de loyauté activée (`cost` : variation de loyauté, négative si des marqueurs sont retirés). */
  | { e: "loyalty"; player: PlayerId; sourceId: ObjectId; cost: number }
  /** Une créature bloque. */
  | { e: "block"; blocker: ObjectId; attacker: ObjectId }
  /** Des créatures ont infligé des blessures de combat à ce joueur (une étape de blessures). */
  | { e: "combatDamageBatch"; player: PlayerId; sources: ObjectId[] }
  /** Un permanent est sacrifié (par son contrôleur). */
  | { e: "sacrifice"; objectId: ObjectId; player: PlayerId }
  /** Un joueur perd la partie. */
  | { e: "playerLost"; player: PlayerId }
  /** Un permanent change de contrôleur (Zidane, Tantalus Thief). */
  | { e: "controlChange"; objectId: ObjectId; from: PlayerId; to: PlayerId }
  /** Une créature explore (701.44), en révélant une carte de terrain ou non. */
  | { e: "explore"; objectId: ObjectId; land: boolean }
  /** Un joueur découvre N (701.57). */
  | { e: "discover"; player: PlayerId; n: number }
  /** Un joueur active une capacité (qui n'est pas une capacité de mana). */
  | { e: "activated"; player: PlayerId; stackId: string }
  /** Une Monture devient montée. */
  | { e: "saddled"; objectId: ObjectId }
  /** Des créatures ont monté une Monture ou équipé un Véhicule (coût payé). */
  | { e: "crewed"; vehicle: ObjectId; crew: ObjectId[] }
  /** Un joueur manifeste avec effroi (déclencheurs « chaque fois que vous manifestez avec effroi »). */
  | { e: "manifestDread"; player: PlayerId; graveyard?: ObjectId[] }
  /** Un permanent face cachée est retourné face visible. */
  | { e: "turnedFaceUp"; objectId: ObjectId }
  /** Une Classe atteint un niveau. */
  | { e: "classLevel"; objectId: ObjectId; level: number }
  /** Un joueur joue un terrain. */
  | { e: "playLand"; player: PlayerId; objectId: ObjectId; from: Zone }
  /** Dépense N (Bloomburrow) : ce joueur vient de dépenser son N-ième mana total pour lancer des sorts ce tour-ci. */
  | { e: "expend"; player: PlayerId; n: number }
  /** Un joueur fourrage (701.61). */
  | { e: "forage"; player: PlayerId }
  /** Réunir des preuves (701.59). */
  | { e: "collectEvidence"; player: PlayerId }
  /** Une Affaire est résolue (Case File Auditor). */
  | { e: "caseSolved"; player: PlayerId; objectId: ObjectId }
  /** Un joueur offre un cadeau (702.174). */
  | { e: "gift"; player: PlayerId }
  /** Une porte de Salle est déverrouillée. */
  | { e: "unlock"; objectId: ObjectId; door: number; player: PlayerId }
  | { e: "blocked"; attacker: ObjectId; player: PlayerId }
  /** Maîtrise des éléments (Avatar) : ce joueur maîtrise l'eau, la terre, le feu ou l'air. */
  | { e: "bend"; player: PlayerId; kind: BendKind }
  /** Une créature attaquante a fait se déclencher une de ses capacités en attaquant (Firebender Ascension). */
  | { e: "attackTriggered"; player: PlayerId; objectId: ObjectId };

/** Maîtrise des éléments (Avatar) : l'eau (payer un coût), la terre, le feu (la capacité se résout) ou l'air. */
export type BendKind = "water" | "earth" | "fire" | "air";

/**
 * « Vous maîtrisez [l'élément] » : déclencheurs (« chaque fois que vous maîtrisez… ») et journal du tour (« si vous
 * avez fait les quatre ce tour-ci »).
 */
export function bent(s: GameState, player: PlayerId, kind: BendKind): void {
  logTurnEvent(s, { e: "bend", player, kind });
  rulesEvent(s, { e: "bend", player, kind });
}

/** Signale un événement de règles : les capacités déclenchées correspondantes sont mises en attente. */
export function rulesEvent(s: GameState, ev: RulesEvent): void {
  if (ev.e === "zone" && ev.from === "battlefield" && ev.lki) {
    s.leftBatch ??= [];
    s.leftBatch.push(ev.lki.id);
  }
  if (ev.e === "discard") {
    const pl = s.players[ev.player];
    if (pl) pl.turnStats.cardsDiscarded += ev.cards.length;
  }
  detectTriggers(s, ev);
}

// ---------------------------------------------------------------------------
// Copie de l'état : le moteur mute une copie, les états déjà renvoyés ne changent jamais.
// ---------------------------------------------------------------------------

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = deepClone((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Copie profonde de l'état, sauf les définitions de cartes (immuables, partagées).
 * Beaucoup plus rapide qu'Immer pour notre usage (simulations de l'IA) : voir tools/bench.ts.
 */
export function cloneState(s: GameState): GameState {
  const { defs, ...rest } = s;
  const copy = deepClone(rest) as GameState;
  copy.defs = { ...defs };
  return copy;
}

// ---------------------------------------------------------------------------
// Identifiants, horodatages, hasard (mulberry32, état stocké dans la partie)
// ---------------------------------------------------------------------------

export function newId(s: GameState, prefix = "o"): string {
  if (prefix === "o") return `o${s.nextId++}`;
  // Un compteur par préfixe : créer un effet ou un déclencheur de plus ne décale pas les identifiants des objets.
  const n = s.idCounters[prefix] ?? 1;
  s.idCounters[prefix] = n + 1;
  return `${prefix}${n}`;
}

export function nextTimestamp(s: GameState): number {
  s.timestamp += 1;
  return s.timestamp;
}

export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

export function emptyTurnStats(): TurnStats {
  return {
    lifeGained: 0,
    lifeGainEvents: 0,
    lifeLost: 0,
    cardsDrawn: 0,
    spellsCast: 0,
    scried: 0,
    noncombatDamageTaken: 0,
    loyaltyActivations: 0,
    cardsDiscarded: 0,
  };
}

export function emptyPool(): Record<ManaType, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

/** Change le contrôleur d'un permanent (horodatage de contrôle, événement de règles). */
export function setController(s: GameState, o: GameObject, to: PlayerId): void {
  const from = o.controller;
  o.controller = to;
  o.controlledSince = s.turn.number;
  if (from !== to) rulesEvent(s, { e: "controlChange", objectId: o.id, from, to });
}

export function obj(s: GameState, id: ObjectId): GameObject {
  const o = s.objects[id];
  if (!o) throw new Error(`Objet inconnu : ${id}`);
  return o;
}

export function defOf(s: GameState, id: ObjectId): CardDef {
  const d = s.defs[obj(s, id).defId];
  if (!d) throw new Error(`Définition inconnue pour ${id}`);
  return d;
}

export function isPlayer(s: GameState, id: string): boolean {
  return id in s.players;
}

// ---------------------------------------------------------------------------
// Joueurs (N joueurs : duel, multijoueur, Commander)
// ---------------------------------------------------------------------------

export function isAlive(s: GameState, p: PlayerId): boolean {
  return !!s.players[p] && !s.players[p]?.lost;
}

export function alivePlayers(s: GameState): PlayerId[] {
  return s.playerOrder.filter((p) => isAlive(s, p));
}

/** Adversaires encore en jeu, dans l'ordre du tour à partir du joueur suivant. */
export function opponentsOf(s: GameState, p: PlayerId): PlayerId[] {
  const i = s.playerOrder.indexOf(p);
  const rotated = [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
  return rotated.filter((q) => q !== p && isAlive(s, q));
}

/** Prochain joueur en jeu dans l'ordre du tour (le joueur lui-même s'il est seul). */
export function nextPlayer(s: GameState, p: PlayerId): PlayerId {
  return opponentsOf(s, p)[0] ?? p;
}

/** Ordre APNAP (101.4) : joueur actif d'abord, puis les autres dans l'ordre du tour. */
export function apnapOrder(s: GameState): PlayerId[] {
  const active = s.turn.active;
  return [...(isAlive(s, active) ? [active] : []), ...opponentsOf(s, active)];
}

export function onBattlefield(s: GameState, id: ObjectId): boolean {
  return s.objects[id]?.zone === "battlefield";
}

// ---------------------------------------------------------------------------
// Marqueurs
// ---------------------------------------------------------------------------

export const P1P1 = "+1/+1";
export const M1M1 = "-1/-1";

export function counterCount(o: { counters: Record<string, number> }, kind: string): number {
  return o.counters[kind] ?? 0;
}

/** Modification nette de F/E due aux marqueurs +1/+1 et -1/-1. */
export function counterPT(o: { counters: Record<string, number> }): number {
  return counterCount(o, P1P1) - counterCount(o, M1M1);
}

/** Engage un permanent (« chaque fois qu'il devient engagé »). */
export function tapObject(s: GameState, o: GameObject, cause?: "teamwork"): void {
  if (o.tapped) return;
  o.tapped = true;
  // Captain America, Living Legend : « si c'est la première fois que cette créature devient engagée ce tour-ci ».
  if (o.tapTurn !== s.turn.number) {
    o.tapTurn = s.turn.number;
    o.tapsThisTurn = 0;
  }
  o.tapsThisTurn = (o.tapsThisTurn ?? 0) + 1;
  bumpFor(s, "tapped"); // des capacités statiques peuvent en dépendre (« vos créatures légendaires engagées »)
  rulesEvent(s, {
    e: "tap",
    objectId: o.id,
    by: s.resolving?.controller ?? o.controller,
    ...(cause ? { cause } : {}),
    first: o.tapsThisTurn === 1,
  });
}

/**
 * Dégage un permanent. 122.1d : s'il a un marqueur d'étourdissement, on lui en retire un à la place. Renvoie true s'il a
 * été dégagé.
 */
export function untapObject(s: GameState, o: GameObject): boolean {
  if (!o.tapped) return false;
  // Blossombind : « la créature enchantée ne peut pas être dégagée ».
  if (quantityMods(s, "untap", (a) => recipientMatches(s, a, o.id)).prevented) return false;
  if ((o.counters.stun ?? 0) > 0) {
    changeCounters(s, o, "stun", -1);
    return false;
  }
  o.tapped = false;
  // Hedge Whisperer : « tant que cette créature reste engagée ».
  if (s.effects.some((e) => e.whileSourceTapped === o.id)) {
    s.effects = s.effects.filter((e) => e.whileSourceTapped !== o.id);
    bump(s);
  } else bumpFor(s, "tapped");
  rulesEvent(s, { e: "untap", objectId: o.id });
  return true;
}

/** Marqueurs dont le contrôleur du permanent veut le moins possible (ordre des remplacements, 616.1). */
const HARMFUL_COUNTERS = new Set(["-1/-1", "stun", "time", "doom", "bounty", "finality"]);

/**
 * Ajoute (ou retire, si n < 0) des marqueurs ; renvoie le nombre réellement modifié. `asCost` : marqueurs mis pour payer
 * un coût (loyauté +N, « mettez un marqueur : ») ; les remplacements « si un effet devait » ne s'y appliquent pas.
 */
export function changeCounters(s: GameState, o: GameObject, kind: string, n: number, asCost = false): number {
  // Remplacements (616.1), dans l'ordre que choisit le contrôleur du permanent : Doubling Season, The Earth Crystal
  // (« le double », y compris en arrivant), Yoshimaru, Caradora (« autant plus un » marqueur +1/+1). Il veut le plus de
  // marqueurs, sauf pour les marqueurs nuisibles.
  if (n > 0 && o.zone === "battlefield") {
    // Remplacements des marqueurs (R1, famille H) ; Blossombind : « on ne peut pas mettre de marqueurs dessus ».
    const q = quantityMods(
      s,
      "counters",
      (a) => (!a.r.counter || a.r.counter === kind) && !(asCost && a.r.effectOnly) && recipientMatches(s, a, o.id),
    );
    if (q.prevented) return 0;
    n = chooseReplacementOrder(n, q.mods, HARMFUL_COUNTERS.has(kind) ? "min" : "max");
  }
  const before = counterCount(o, kind);
  const after = Math.max(0, before + n);
  if (after === 0) delete o.counters[kind];
  else o.counters[kind] = after;
  if (after !== before) bump(s);
  if (after > before && o.zone === "battlefield") {
    // « la première fois que des marqueurs sont mis sur cette créature ce tour-ci » (Stalwart Successor).
    const first = o.countersPutTurn !== s.turn.number;
    o.countersPutTurn = s.turn.number;
    const by = s.resolving?.controller ?? o.controller;
    o.countersPutBy = first ? [by] : [...new Set([...(o.countersPutBy ?? []), by])];
    o.countersPutKinds = [...new Set([...(first ? [] : (o.countersPutKinds ?? [])), `${by}|${kind}`])];
    rulesEvent(s, { e: "counters", objectId: o.id, kind, amount: after - before, first, by });
    // Journal du tour (Lasting Tarfire : « si vous avez mis un marqueur sur une créature ce tour-ci ») : celui qui les
    // met est le contrôleur de ce qui se résout, sinon (coût, action) le contrôleur du permanent.
    const c = chars(s, o.id);
    logTurnEvent(s, {
      e: "counters",
      player: s.resolving?.controller ?? o.controller,
      kind,
      n: after - before,
      types: c.types,
      subtypes: c.subtypes,
    });
  }
  return after - before;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function zoneArray(s: GameState, o: GameObject): ObjectId[] | null {
  switch (o.zone) {
    case "battlefield":
      return s.battlefield;
    case "exile":
      return s.exile;
    case "stack":
      return null; // géré par s.stack
    default:
      return s.players[o.owner]?.[o.zone] ?? null;
  }
}

export function createObject(
  s: GameState,
  defId: string,
  owner: PlayerId,
  zone: Zone,
  opts: { uid?: string; isToken?: boolean; controller?: PlayerId } = {},
): GameObject {
  const id = newId(s);
  bump(s);
  const o: GameObject = {
    id,
    uid: opts.uid ?? `c${id}`,
    defId,
    owner,
    controller: opts.controller ?? owner,
    zone,
    tapped: false,
    damage: 0,
    deathtouched: false,
    counters: {},
    controlledSince: s.turn.number,
    timestamp: nextTimestamp(s),
    isToken: opts.isToken ?? false,
  };
  if (zone === "battlefield") o.baseController = o.controller;
  s.objects[id] = o;
  const arr = zoneArray(s, o);
  arr?.push(id);
  return o;
}

/**
 * Déplace un objet vers une autre zone. L'objet devient un nouvel objet (400.7) :
 * on renvoie son nouvel identifiant, ou null s'il cesse d'exister (jeton quittant le champ de bataille).
 */
export function moveObject(
  s: GameState,
  id: ObjectId,
  to: Zone,
  opts: {
    controller?: PlayerId;
    position?: "top" | "bottom";
    enters?: EntersContext;
    /** Arrive face cachée (manifester, cape) : la vraie carte reste cachée, sans remplacements ni déclencheurs d'arrivée. */
    faceDown?: { ward: boolean; upCosts: ManaCost[] };
    /** Reçoit la destination réelle, après les remplacements (exilée au lieu de mourir…). */
    landed?: { to?: Zone };
    /** Arrive transformé (712.14) ou engagé : fixé avant les remplacements et les déclencheurs d'arrivée. */
    transformed?: boolean;
    tapped?: boolean;
  } = {},
): ObjectId | null {
  const o = obj(s, id);
  // Copie d'un sort préparé ou d'une carte (Uldaros) : elle ne quitte l'exil que pour la pile ; ailleurs,
  // elle cesse d'exister (une copie de sort de permanent qui se résout devient un jeton).
  if ((o.preparedFor || o.cardCopy) && to !== "stack" && !(o.cardCopy && o.zone === "stack" && to === "battlefield")) {
    removeObject(s, id);
    return null;
  }
  // 303.4g : une Aura qui devrait arriver sans être lancée et sans rien de légal à enchanter reste dans sa zone.
  const auraDef = s.defs[o.defId]?.enchant;
  if (
    to === "battlefield" &&
    auraDef &&
    !auraDef.player &&
    o.zone !== "stack" &&
    !opts.enters?.attachTo &&
    !opts.faceDown &&
    auraHosts(s, opts.controller ?? o.controller, id).length === 0
  )
    return null;
  // Un permanent préparé qui quitte le champ de bataille : la copie de son sort cesse d'exister.
  if (o.preparedCopy && o.zone === "battlefield") setPrepared(s, o, false);
  // 614.1a / 616.1 : remplacements « au lieu du cimetière » (Progenitus, finalité, Rest in Peace, Valgavoth…).
  let shuffleIn = false;
  let linkTo: ObjectId | undefined;
  if (to === "graveyard") {
    const r = replaceGraveyard(s, o);
    to = r.to;
    shuffleIn = !!r.shuffle;
    linkTo = r.linkTo;
  }
  if (opts.landed) opts.landed.to = to;
  const from = zoneArray(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  // Dernières informations connues (608.2h), prises avant le retrait du combat : « quand une créature attaquante meurt ».
  const lki = o.zone === "battlefield" ? snapshot(s, id) : null;
  if (lki) {
    s.lki[id] = lki;
  }
  // 506.4 : un permanent qui quitte le champ de bataille est retiré du combat, quel que soit l'effet qui le déplace.
  if (o.zone === "battlefield" && s.combat) {
    s.combat.attackers = s.combat.attackers.filter((a) => a.id !== id);
    s.combat.blockers = s.combat.blockers.filter((b) => b.id !== id);
    for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => b !== id);
  }
  // Journal du tour : « créatures exilées ce tour-ci » (Vren), « cartes qui ont quitté votre cimetière » (Bonecache)…
  // Seulement les déplacements publics : une pioche (bibliothèque → main) n'y figure pas (information cachée).
  const hidden = (z: Zone) => z === "library" || z === "hand";
  if (o.zone !== to && !(hidden(o.zone) && hidden(to))) {
    const d = s.defs[o.defId];
    logTurnEvent(
      s,
      zoneEntry(
        o.zone,
        to,
        o.owner,
        lki?.controller ?? (to === "battlefield" ? (opts.controller ?? o.controller) : o.controller),
        // Face cachée (708) : une créature 2/2 sans type de créature ; la vraie carte n'est pas notée.
        (opts.faceDown || o.faceDown) && to === "battlefield"
          ? { types: ["Creature"], subtypes: [], token: o.isToken, faceDown: true }
          : {
              types: lki?.types ?? d?.types ?? [],
              subtypes: lki?.subtypes ?? d?.subtypes ?? [],
              token: o.isToken,
            },
      ),
    );
  }
  const from0 = o.zone;
  delete s.objects[id];
  // Permanent assemblé : il redevient ses deux cartes dans la zone de destination (701.42c).
  if (o.melded) {
    const parts = o.melded.map((p) =>
      createObject(s, p.defId, o.owner, to, { uid: p.uid, controller: to === "battlefield" ? o.controller : o.owner }),
    );
    if (to === "library") shuffle(s, s.players[o.owner]?.library ?? []);
    bump(s);
    rulesEvent(s, { e: "zone", oldId: id, newId: parts[0]?.id ?? null, from: from0, to, lki });
    if (from0 === "battlefield") releaseLinkedExile(s, id);
    return parts[0]?.id ?? null;
  }
  // Possession Engine : les effets qui durent « tant que vous contrôlez [la source] » cessent.
  if (from0 === "battlefield" && s.effects.some((e) => e.whileSource === id || e.whileSourceTapped === id)) {
    s.effects = s.effects.filter((e) => e.whileSource !== id && e.whileSourceTapped !== id);
    bump(s);
  }
  // 613.1b, 611.2 : un changement de contrôle lié à ce permanent (Aura qui donne le contrôle, effet « tant que ») prend
  // fin dès qu'il part, sans attendre les actions basées sur l'état (une résolution peut encore demander un choix).
  if (from0 === "battlefield" && (o.attachedTo || s.effects.some((e) => e.controller))) syncControl(s);
  // Emrakul : les effets « jusqu'à ce que cette carte soit lancée depuis l'exil » cessent. Lancée, la carte passe sur la
  // pile avant le paiement (601.2a) : l'effet dure jusqu'à ce que le sort soit lancé (601.2i, `castSpell`).
  if (from0 === "exile" && to !== "stack" && s.effects.some((e) => e.untilExiledUid === o.uid)) {
    s.effects = s.effects.filter((e) => e.untilExiledUid !== o.uid);
    bump(s);
  }
  if (o.isToken && to !== "battlefield") {
    bump(s);
    // Un jeton qui quitte le champ de bataille cesse d'exister, mais il « meurt » bien (déclencheurs).
    rulesEvent(s, { e: "zone", oldId: id, newId: null, from: from0, to, lki });
    if (from0 === "battlefield") releaseLinkedExile(s, id);
    return null;
  }

  // Face cachée : la carte est révélée en quittant le champ de bataille ; un sort lancé face cachée arrive face cachée.
  const staysFaceDown = !!o.faceDown && o.zone === "stack" && to === "battlefield";
  const cardId = o.faceDown && !staysFaceDown ? o.faceDown.card : o.defId;
  const hide = to === "battlefield" && !!opts.faceDown;
  if (hide) s.defs[FACE_DOWN_ID] ??= FACE_DOWN_DEF;
  const moved = createObject(s, hide ? FACE_DOWN_ID : cardId, o.owner, to, {
    uid: o.uid,
    isToken: o.isToken || (!!o.cardCopy && to === "battlefield"),
    controller: to === "battlefield" || to === "stack" ? (opts.controller ?? o.controller) : o.owner,
  });
  if (o.preparedFor) moved.preparedFor = o.preparedFor;
  if (o.cardCopy && to === "stack") moved.cardCopy = true;
  if (staysFaceDown) moved.faceDown = o.faceDown;
  if (hide && opts.faceDown) moved.faceDown = { card: cardId, ...opts.faceDown };
  if (to === "library" && opts.position !== "bottom") {
    const lib = s.players[o.owner]?.library;
    if (lib) {
      lib.pop();
      lib.unshift(moved.id);
    }
  }
  if (shuffleIn) shuffle(s, s.players[o.owner]?.library ?? []);
  if (to === "battlefield" && opts.transformed) {
    const d = s.defs[moved.defId];
    const back = d?.layout === "transform" ? d.faceDefs?.[1] : undefined;
    if (back) moved.faceDefId = back.id;
  }
  if (to === "battlefield" && opts.tapped) moved.tapped = true;
  // « mise dans un cimetière depuis le champ de bataille ce tour-ci » (Supper for Spiders).
  if (from0 === "battlefield") moved.arrivedFrom = "battlefield";
  if (to === "battlefield") applyEntersReplacements(s, moved, opts.enters ?? {});
  const linker = linkTo ? s.objects[linkTo] : undefined;
  if (linker) {
    linker.linked = [...(linker.linked ?? []), moved.id];
    bump(s);
  }
  rulesEvent(s, { e: "zone", oldId: id, newId: moved.id, from: from0, to, lki });
  if (from0 === "battlefield") releaseLinkedExile(s, id);
  return moved.id;
}

/** Carte cachée au spectateur (exilée face cachée, 406.3) : la vue ne montre que son dos. */
export const HIDDEN_CARD_ID = "hidden-card";

/** Identifiant de la définition générique d'un objet face cachée (708.2). */
export const FACE_DOWN_ID = "face-down";

/** Définition générique d'un objet face cachée : créature 2/2 sans nom, sans coût ni capacités (708.2). */
export const FACE_DOWN_DEF: CardDef = {
  id: FACE_DOWN_ID,
  name: "",
  typeLine: "Créature face cachée",
  manaCost: null,
  manaCostText: "",
  colors: [],
  supertypes: [],
  types: ["Creature"],
  subtypes: [],
  power: 2,
  toughness: 2,
  keywords: [],
  abilities: [],
  text: "",
  implemented: true,
};

/** Retourne face visible un permanent face cachée (702.168d, 701.58c) ; ses capacités « retournée » se déclenchent. */
export function turnFaceUp(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || !o.faceDown) return;
  o.defId = o.faceDown.card;
  delete o.faceDown;
  const stats = s.players[o.controller]?.turnStats;
  if (stats) stats.faceDownOrUp = (stats.faceDownOrUp ?? 0) + 1;
  bump(s);
  emit({ type: "turnedFaceUp", objectId: id, defId: o.defId });
  rulesEvent(s, { e: "turnedFaceUp", objectId: id });
}

/** Salle : déverrouille une porte (709.5e) ; « quand vous déverrouillez cette porte » se déclenche. */
export function unlockDoor(s: GameState, id: ObjectId, door: number): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || o.unlocked?.includes(door)) return;
  o.unlocked = [...(o.unlocked ?? []), door].sort();
  bump(s);
  rulesEvent(s, { e: "unlock", objectId: id, door, player: o.controller });
}

/** Salle : carte scindée dont les moitiés sont des enchantements (portes). */
const COMBAT_STEPS = new Set([
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
]);

/** 722 : le joueur qui prend la décision en attente (le contrôleur du tour, s'il y en a un). */
export function decider(s: GameState): PlayerId | undefined {
  const p = s.pending;
  if (!p) return undefined;
  const tc = s.turnControl;
  const inCombat = COMBAT_STEPS.has(s.turn.step);
  if (tc && tc.turn === s.turn.number && p.player === tc.player && !s.players[tc.by]?.lost && (!tc.combatOnly || inCombat))
    return tc.by;
  return p.player;
}

export function isRoom(d: CardDef | undefined): boolean {
  return d?.layout === "split" && !!d.faceDefs?.every((f) => f.subtypes.includes("Room"));
}

/** Enregistre une définition de carte dans la partie, avec les définitions de ses faces. */
export function registerDef(s: GameState, d: CardDef): void {
  s.defs[d.id] ??= d;
  for (const f of d.faceDefs ?? []) s.defs[f.id] ??= f;
  if (d.meldResultDef) registerDef(s, d.meldResultDef);
}

/** Retire un objet du jeu sans passer par une zone (copie de sort qui cesse d'exister, carte assemblée). */
export function removeFromGame(s: GameState, id: ObjectId): void {
  removeObject(s, id);
}

function removeObject(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (!o) return;
  const arr = zoneArray(s, o);
  const i = arr?.indexOf(id) ?? -1;
  if (arr && i >= 0) arr.splice(i, 1);
  delete s.objects[id];
}

/**
 * Reality Fracture : un permanent qui a un sort préparé devient préparé (une copie de ce sort est créée en
 * exil, que son contrôleur peut lancer) ou dé-préparé (la copie cesse d'exister). Sans sort préparé, rien.
 */
export function setPrepared(s: GameState, o: GameObject, on: boolean): void {
  if (!on) {
    if (o.preparedCopy) removeObject(s, o.preparedCopy);
    delete o.preparedCopy;
    return;
  }
  const spell = s.defs[o.defId]?.prepareSpell;
  if (!spell || o.zone !== "battlefield" || (o.preparedCopy && s.objects[o.preparedCopy])) return;
  s.defs[spell.id] ??= spell;
  const copy = createObject(s, spell.id, o.controller, "exile");
  copy.preparedFor = o.id;
  o.preparedCopy = copy.id;
}

// ---------------------------------------------------------------------------
// Caractéristiques calculées : voir layers.ts (réexportées ici pour commodité).
// ---------------------------------------------------------------------------

import { syncControl } from "./control";
import { bump, bumpFor, chars, snapshot } from "./layers";
import { chooseReplacementOrder } from "./modifiers";
import { applyEntersReplacements, auraHosts, type EntersContext, releaseLinkedExile, replaceGraveyard } from "./replacement";
import { quantityMods, recipientMatches } from "./statics";
import { detectTriggers } from "./triggers";
import { logTurnEvent, zoneEntry } from "./turnlog";

export {
  bump,
  type Characteristics,
  chars,
  creaturesControlledBy,
  hasKeyword,
  hasType,
  isCreature,
  isSummoningSick,
  sickForActivation,
  snapshot,
} from "./layers";
