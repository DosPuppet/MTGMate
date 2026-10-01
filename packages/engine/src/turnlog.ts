/**
 * Journal des événements du tour (P1 de l'audit, étape 8) : au lieu d'un compteur par carte dans `TurnStats`
 * (« Nourritures sacrifiées ce tour-ci », « créatures exilées ce tour-ci »…), le moteur note chaque événement du tour
 * dans `s.turnLog`, et les cartes l'interrogent par un montant générique (`amount.turnEvents(requête)`).
 *
 * Le journal est vidé au début de chaque tour. Ses entrées sont petites et en JSON pur (invariants du fuzz).
 */
import type { CardType, Color, GameState, PlayerId, TurnLogEntry, TurnLogQuery, Zone } from "./types";

export function logTurnEvent(s: GameState, entry: TurnLogEntry): void {
  s.turnLog.push(entry);
  // Des capacités statiques en dépendent (raid, « si vous avez attaqué avec un Vaisseau ») : cache des couches (`bump`).
  s.version += 1;
}

/**
 * Joueur « concerné » par une entrée : contrôleur d'un permanent qui quitte ou rejoint le champ de bataille, sinon
 * propriétaire de la carte déplacée (`byOwner` : toujours le propriétaire) ; lanceur ; joueur blessé ; sacrificateur.
 */
function subjectOf(e: TurnLogEntry, byOwner?: boolean): PlayerId | undefined {
  switch (e.e) {
    case "zone":
      return !byOwner && (e.from === "battlefield" || e.to === "battlefield") ? e.controller : e.owner;
    case "cast":
    case "counters":
    case "sacrifice":
    case "attack":
    case "activate":
      return e.player;
    case "damage":
      return e.player;
  }
}

const hasAny = <T>(have: readonly T[] | undefined, want: readonly T[] | undefined) =>
  !want || want.some((x) => have?.includes(x));

function matches(e: TurnLogEntry, q: TurnLogQuery, me: PlayerId, subject?: PlayerId): boolean {
  if (e.e !== q.event) return false;
  const who = subjectOf(e, q.byOwner);
  if (subject !== undefined ? who !== subject : q.who === "you" ? who !== me : q.who === "opponent" ? who === me : false)
    return false;
  if (!hasAny<CardType>(e.types, q.types)) return false;
  if (q.notTypes?.some((x) => e.types?.includes(x))) return false;
  if (q.subtype && !e.subtypes?.includes(q.subtype)) return false;
  if (q.notSubtype && e.subtypes?.includes(q.notSubtype)) return false;
  const extra = e as { supertypes?: string[]; token?: boolean };
  if (q.supertype && !extra.supertypes?.includes(q.supertype)) return false;
  if (q.token !== undefined && !!extra.token !== q.token) return false;
  if (q.faceDown !== undefined && !!(e as { faceDown?: boolean }).faceDown !== q.faceDown) return false;
  if (e.e === "zone") {
    if (q.from && e.from !== q.from) return false;
    if (q.to && e.to !== q.to) return false;
  }
  if (e.e === "cast" && q.fromZone && e.fromZone !== q.fromZone) return false;
  if (e.e === "cast" && q.warped && !e.warped) return false;
  if (e.e === "activate" && q.equip && !e.equip) return false;
  if (e.e === "attack" && q.againstYou && e.defender !== me) return false;
  if (e.e === "damage") {
    if (q.combat !== undefined && e.combat !== q.combat) return false;
    if (q.toPlayer !== undefined && e.toPlayer !== q.toPlayer) return false;
    if (q.sourceYours && e.sourceController !== me) return false;
    if (!hasAny<Color>(e.sourceColors, q.sourceColors)) return false;
    if (!hasAny<CardType>(e.sourceTypes, q.sourceTypes)) return false;
    if (q.sourceSupertype && !e.sourceSupertypes?.includes(q.sourceSupertype)) return false;
  }
  return true;
}

const weight = (e: TurnLogEntry, q: TurnLogQuery) => (q.sum && e.e === "damage" ? e.amount : 1);

/**
 * Nombre d'entrées du tour qui correspondent (ou somme des blessures, `sum`), vu de `me`. `perPlayer` : le plus grand
 * total parmi les joueurs concernés (« un joueur a subi 10 blessures de combat ou plus ce tour-ci »).
 */
export function countTurnEvents(s: GameState, q: TurnLogQuery, me: PlayerId, subject?: PlayerId): number {
  if (q.distinctSources) {
    const keys = new Set<string>();
    for (const e of s.turnLog) if (e.e === "damage" && matches(e, q, me, subject)) keys.add(e.sourceKey ?? e.sourceController);
    return keys.size;
  }
  if (subject !== undefined) return s.turnLog.reduce((n, e) => n + (matches(e, q, me, subject) ? weight(e, q) : 0), 0);
  if (q.perPlayer) {
    return Math.max(0, ...s.playerOrder.map((p) => s.turnLog.reduce((n, e) => n + (matches(e, q, me, p) ? weight(e, q) : 0), 0)));
  }
  return s.turnLog.reduce((n, e) => n + (matches(e, q, me) ? weight(e, q) : 0), 0);
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
