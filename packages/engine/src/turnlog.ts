/**
 * Journal des événements du tour (P1 de l'audit, étape 8) : au lieu d'un compteur par carte dans `TurnStats`
 * (« Nourritures sacrifiées ce tour-ci », « créatures exilées ce tour-ci »…), le moteur note chaque événement du tour
 * dans `s.turnLog`, et les cartes l'interrogent par un montant générique (`amount.turnEvents(requête)`).
 *
 * Le journal est vidé au début de chaque tour. Ses entrées sont petites et en JSON pur (invariants du fuzz).
 */
import type { CardType, Color, GameState, ObjectId, PlayerId, TurnLogEntry, TurnLogQuery, Zone } from "./types";

/** L'objet a-t-il attaqué ce tour-ci (sous cette identité : un objet revenu sur le champ de bataille est neuf) ? */
export function attackedThisTurn(s: GameState, id: ObjectId): boolean {
  return objectDidThisTurn(s, id, "attack");
}

/** L'objet a-t-il infligé des blessures ce tour-ci ? (même identité que `sourceKey`, voir `logDamage`) */
export function dealtDamageThisTurn(s: GameState, id: ObjectId): boolean {
  const key = s.objects[id]?.uid ?? id;
  return s.turnLog.some((e) => e.e === "damage" && e.sourceKey === key);
}

/**
 * Index des entrées par objet (`id` : marqueurs, activations, engagements, défausses, montures, attaques), dérivé du
 * journal et mémorisé par tableau : le journal ne fait que grandir pendant un tour (`logTurnEvent`) et il est remplacé
 * par un nouveau tableau au début du tour suivant (de même dans une copie de l'état). Les entrées d'un objet sont celles
 * de cet objet seulement : un objet qui change de zone est un nouvel objet (400.7), avec un nouvel identifiant.
 */
interface ObjectIndex {
  /** Entrées déjà indexées. */
  n: number;
  byId: Map<ObjectId, TurnLogEntry[]>;
  /** Marqueurs mis, « joueur|sorte » (une valeur par couple, dans l'ordre de la première fois) ; copie à chaque ajout. */
  countersPut: Map<ObjectId, string[]>;
}
const objectIndexes = new WeakMap<TurnLogEntry[], ObjectIndex>();
const NO_ENTRIES: readonly TurnLogEntry[] = [];
/** Aucun marqueur mis ce tour-ci : un tableau partagé (pas d'allocation, forme d'objet constante pour V8). */
const NO_COUNTERS_PUT: string[] = [];

function objectIndex(s: GameState): ObjectIndex {
  const log = s.turnLog;
  let ix = objectIndexes.get(log);
  if (!ix || ix.n > log.length) {
    ix = { n: 0, byId: new Map(), countersPut: new Map() };
    objectIndexes.set(log, ix);
  }
  for (; ix.n < log.length; ix.n++) {
    const e = log[ix.n] as TurnLogEntry;
    const id = "id" in e ? e.id : undefined;
    if (!id) continue;
    const list = ix.byId.get(id);
    if (list) list.push(e);
    else ix.byId.set(id, [e]);
    if (e.e === "counters") {
      const key = `${e.player}|${e.kind}`;
      const kinds = ix.countersPut.get(id) ?? NO_COUNTERS_PUT;
      if (!kinds.includes(key)) ix.countersPut.set(id, [...kinds, key]);
    }
  }
  return ix;
}

/** Entrées du tour qui concernent cet objet (sous cette identité). */
export function objectTurnEvents(s: GameState, id: ObjectId): readonly TurnLogEntry[] {
  return objectIndex(s).byId.get(id) ?? NO_ENTRIES;
}

/** Une entrée de cette sorte pour l'objet ce tour-ci ? */
export function objectDidThisTurn(s: GameState, id: ObjectId, event: TurnLogEntry["e"]): boolean {
  return objectTurnEvents(s, id).some((e) => e.e === event);
}

/**
 * Activations de l'objet ce tour-ci : une capacité de loyauté (606.3), ou la capacité « une fois par tour » d'indice
 * `index`.
 */
export function activatedThisTurn(s: GameState, id: ObjectId, which: { loyalty: true } | { index: number }): boolean {
  return objectTurnEvents(s, id).some((e) => e.e === "activate" && ("loyalty" in which ? !!e.loyalty : e.index === which.index));
}

/**
 * Marqueurs mis sur l'objet ce tour-ci, « joueur|sorte » (filtre `countersPutByYouThisTurn`) ; le tableau renvoyé n'est
 * jamais modifié ensuite (les dernières informations connues le gardent).
 */
export function countersPutThisTurn(s: GameState, id: ObjectId): string[] {
  return objectIndex(s).countersPut.get(id) ?? NO_COUNTERS_PUT;
}

/**
 * Invalidation du cache des couches après une entrée : installée par `layers.ts` (qui dépend de ce module) pour ne
 * l'invalider que s'il lit le journal (PLAN-S, P2) ; par défaut, toujours.
 */
let invalidate = (s: GameState): void => {
  s.version += 1;
};
export function onTurnLogged(fn: (s: GameState) => void): void {
  invalidate = fn;
}

export function logTurnEvent(s: GameState, entry: TurnLogEntry): void {
  s.turnLog.push(entry);
  // Des capacités statiques en dépendent (raid, « si vous avez attaqué avec un Vaisseau »).
  invalidate(s);
}

/**
 * Joueur « concerné » par une entrée : contrôleur d'un permanent qui quitte ou rejoint le champ de bataille, sinon
 * propriétaire de la carte déplacée (`byOwner` : toujours le propriétaire) ; lanceur ; joueur blessé ; sacrificateur.
 */
function subjectOf(e: TurnLogEntry, byOwner?: boolean): PlayerId | undefined {
  switch (e.e) {
    case "zone":
      return !byOwner && (e.from === "battlefield" || e.to === "battlefield") ? e.controller : e.owner;
    default:
      return e.player;
  }
}

const hasAny = <T>(have: readonly T[] | undefined, want: readonly T[] | undefined) =>
  !want || want.some((x) => have?.includes(x));

type Chars = {
  types?: readonly CardType[];
  subtypes?: readonly string[];
  supertypes?: readonly string[];
  colors?: readonly Color[];
};

/** Le comparateur des caractéristiques (`TurnLogQuery` : de l'objet de l'entrée, ou de la source des blessures). */
function charsMatch(have: Chars, q: Pick<TurnLogQuery, "types" | "subtype" | "supertype" | "colors">): boolean {
  if (!hasAny<CardType>(have.types, q.types)) return false;
  if (q.subtype && !have.subtypes?.includes(q.subtype)) return false;
  if (q.supertype && !have.supertypes?.includes(q.supertype)) return false;
  return hasAny<Color>(have.colors, q.colors);
}

function matches(s: GameState, e: TurnLogEntry, q: TurnLogQuery, me: PlayerId, subject?: PlayerId): boolean {
  if (e.e !== q.event) return false;
  const who = subjectOf(e, q.byOwner);
  // « Un adversaire » : un adversaire encore en partie (800.4a : un joueur qui a quitté la partie n'est plus un adversaire).
  const opponent = () => who !== me && !!who && !s.players[who]?.lost;
  if (subject !== undefined ? who !== subject : q.who === "you" ? who !== me : q.who === "opponent" ? !opponent() : false)
    return false;
  if (!charsMatch(e, q)) return false;
  if (q.notTypes?.some((x) => e.types?.includes(x))) return false;
  if (q.notSubtype && e.subtypes?.includes(q.notSubtype)) return false;
  if (q.keyword && !(e as { keywords?: string[] }).keywords?.includes(q.keyword)) return false;
  if (q.token !== undefined && !!(e as { token?: boolean }).token !== q.token) return false;
  if (q.faceDown !== undefined && !!(e as { faceDown?: boolean }).faceDown !== q.faceDown) return false;
  if (e.e === "zone") {
    if (q.from && e.from !== q.from) return false;
    if (q.to && e.to !== q.to) return false;
  }
  if ((e.e === "cast" || e.e === "playLand") && q.fromZone && e.fromZone !== q.fromZone) return false;
  if (e.e === "cast" && q.warped && !e.warped) return false;
  if (e.e === "cast" && q.minManaValue !== undefined && (e.manaValue ?? 0) < q.minManaValue) return false;
  if (e.e === "activate" && q.equip && !e.equip) return false;
  if (e.e === "activate" && q.loyalty && !e.loyalty) return false;
  if (e.e === "attack" && q.againstYou && e.defender !== me) return false;
  if (e.e === "damage") {
    if (q.combat !== undefined && e.combat !== q.combat) return false;
    if (q.toPlayer !== undefined && e.toPlayer !== q.toPlayer) return false;
    const src = q.source;
    if (src?.controller === "you" && e.sourceController !== me) return false;
    if (
      src &&
      !charsMatch(
        { types: e.sourceTypes, subtypes: e.sourceSubtypes, supertypes: e.sourceSupertypes, colors: e.sourceColors },
        src,
      )
    )
      return false;
  }
  return true;
}

/** Poids d'une entrée : sa quantité (blessures, vie, cartes défaussées) pour une somme, sinon 1. */
const weight = (e: TurnLogEntry, q: TurnLogQuery) => (q.sum && "amount" in e ? e.amount : 1);

/**
 * Valeurs d'une entrée pour `distinct` : source des blessures, sorte de maîtrise, types de carte, joueur concerné, créature
 * qui attaque.
 */
function distinctValues(e: TurnLogEntry, d: NonNullable<TurnLogQuery["distinct"]>): readonly string[] {
  switch (d) {
    case "source":
      return e.e === "damage" ? [e.sourceKey ?? e.sourceController] : [];
    case "kind":
      return e.e === "bend" ? [e.kind] : [];
    case "type":
      return e.types ?? [];
    case "player": {
      const p = subjectOf(e);
      return p ? [p] : [];
    }
    case "object":
      return e.e === "attack" && e.id ? [e.id] : [];
    case "defender":
      return e.e === "attack" ? [e.defender] : [];
  }
}

/**
 * Nombre d'entrées du tour qui correspondent (ou somme des quantités, `sum` ; ou nombre de valeurs différentes,
 * `distinct`), vu de `me`. `perPlayer` : le plus grand total parmi les joueurs concernés (« un joueur a subi 10 blessures
 * de combat ou plus ce tour-ci »).
 */
export function countTurnEvents(s: GameState, q: TurnLogQuery, me: PlayerId, subject?: PlayerId): number {
  if (q.distinct) {
    const values = new Set<string>();
    for (const e of s.turnLog) if (matches(s, e, q, me, subject)) for (const v of distinctValues(e, q.distinct)) values.add(v);
    return values.size;
  }
  if (subject !== undefined) return s.turnLog.reduce((n, e) => n + (matches(s, e, q, me, subject) ? weight(e, q) : 0), 0);
  if (q.perPlayer) {
    return Math.max(
      0,
      ...s.playerOrder.map((p) => s.turnLog.reduce((n, e) => n + (matches(s, e, q, me, p) ? weight(e, q) : 0), 0)),
    );
  }
  return s.turnLog.reduce((n, e) => n + (matches(s, e, q, me) ? weight(e, q) : 0), 0);
}

/**
 * Entrée d'un déplacement de zone (caractéristiques connues au moment du déplacement). `controller` : celui qui le
 * contrôlait en partant du champ de bataille, ou qui le contrôle en y arrivant.
 */
export function zoneEntry(
  from: Zone | null,
  to: Zone,
  owner: PlayerId,
  controller: PlayerId,
  c: { types: CardType[]; subtypes: string[]; token: boolean; faceDown?: boolean },
): TurnLogEntry {
  return {
    e: "zone",
    from,
    to,
    owner,
    controller,
    types: c.types,
    subtypes: c.subtypes,
    token: c.token || undefined,
    ...(c.faceDown ? { faceDown: true } : {}),
  };
}
