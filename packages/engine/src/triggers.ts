/**
 * Capacités déclenchées (603).
 *
 * - Détection : au moment de l'événement (via les événements de règles émis par state.ts / actions.ts).
 *   Les capacités « quitte le champ de bataille » regardent en arrière (603.10a) : pendant un lot
 *   d'événements simultanés (actions basées sur l'état, un effet), les sources sont celles présentes au début du lot.
 * - Mise sur la pile : juste avant qu'un joueur reçoive la priorité (603.3b), dans l'ordre APNAP ;
 *   chaque joueur ordonne ses déclenchements, choisit leur mode et leurs cibles (603.3c–d) via les choix génériques.
 * - Capacités retardées (603.7) et réflexives (603.12) : créées par des effets, avec leurs propres effets et cibles.
 */

import { canForage, gainLife } from "./actions";
import { ask, cardRef } from "./choices";
import { boardAmount, evalAmount, resolveRef } from "./effects";
import { RulesError, rethrowAsRules } from "./errors";
import { copiedDefId } from "./layers";
import {
  apnapOrder,
  chars,
  emit,
  isCreature,
  isPlayer,
  newId,
  obj,
  onBattlefield,
  opponentsOf,
  type RulesEvent,
  rulesEvent,
  snapshot,
} from "./state";
import { playerStatic, playerStatics } from "./statics";
import { legalTargets, matchesCard, matchesObjectFilter, matchesView, validateTargets, withChosen } from "./targets";
import { countTurnEvents } from "./turnlog";
import type {
  AbilityDef,
  Amount,
  CardType,
  Condition,
  DelayedTiming,
  GameState,
  InlineAbility,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PendingTrigger,
  PlayerId,
  StackItem,
  TargetSpec,
  TriggerEventData,
  TriggeredAbilityDef,
  TriggerSpec,
  TurnLogQuery,
} from "./types";

interface Source {
  id: ObjectId;
  view: LkiSnapshot;
}

const hasTriggers = (abilities: AbilityDef[] | undefined) => !!abilities?.some((a) => a.kind === "triggered");

function liveSources(s: GameState): Source[] {
  const out: Source[] = [];
  // Capacités déclenchées accordées, ou copiées (couche 1) : on ne peut pas se fier aux capacités imprimées.
  // Prouesse (702.108) et décomposition (702.147) : la capacité déclenchée est ajoutée par les couches à toute créature
  // qui a le mot-clé (imprimé, accordé ou, pour la décomposition, par un marqueur).
  const grants = (m: { addAbilities?: AbilityDef[]; addKeywords?: string[] }) =>
    !!m.addAbilities?.some((a) => a.kind === "triggered") ||
    !!m.addKeywords?.includes("prowess") ||
    !!m.addKeywords?.includes("decayed");
  const granted =
    s.effects.some((e) => e.copyOf || grants(e)) ||
    s.battlefield.some((id) => (s.defs[obj(s, id).defId]?.abilities ?? []).some((ab) => ab.kind === "static" && grants(ab.mods)));
  for (const id of s.battlefield) {
    // Filtre rapide sur les capacités imprimées, sauf si un effet accorde des capacités déclenchées.
    const o = obj(s, id);
    const d = s.defs[o.faceDefId ?? o.defId];
    // Salle : les capacités déclenchées sont portées par ses portes.
    const levels = !!d?.classLevels || !!d?.caseSolved;
    if (
      !granted &&
      !levels &&
      !hasTriggers(d?.abilities) &&
      !d?.keywords.includes("prowess") &&
      !d?.keywords.includes("decayed") &&
      !(o.counters.decayed ?? 0) &&
      !d?.faceDefs?.some((f) => hasTriggers(f.abilities))
    )
      continue;
    const view = snapshot(s, id);
    if (hasTriggers(view.abilities)) out.push({ id, view });
  }
  // Cartes dont une capacité se déclenche depuis le cimetière (Flamewake Phoenix).
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.graveyard ?? []) {
      const abs = s.defs[obj(s, id).defId]?.abilities;
      if (abs?.some((a) => a.kind === "triggered" && a.fromGraveyard)) out.push({ id, view: snapshot(s, id) });
    }
  }
  // « Quand vous lancez ce sort » : le sort sur la pile (Emrakul, the Exigent Doom).
  for (const item of s.stack) {
    if (item.kind !== "spell" || !s.objects[item.id]) continue;
    const abs = s.defs[item.sourceDefId]?.abilities;
    if (abs?.some((a) => a.kind === "triggered" && a.trigger.on === "castSelf"))
      out.push({ id: item.id, view: snapshot(s, item.id) });
  }
  // Emblèmes (zone de commandement).
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.command ?? []) {
      if (hasTriggers(s.defs[obj(s, id).defId]?.abilities)) out.push({ id, view: snapshot(s, id) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lots d'événements simultanés (regard en arrière)
// ---------------------------------------------------------------------------

let batchBefore: Source[] | null = null;
/**
 * Lien de vie pendant un lot d'événements simultanés : un seul gain de points de vie par source (120.3f, 119.9). Une
 * créature qui blesse plusieurs objets ou joueurs en même temps (piétinement, plusieurs bloqueurs) déclenche une seule
 * fois « chaque fois que vous gagnez des points de vie ».
 */
let lifelinkBatch: Map<string, { controller: PlayerId; amount: number }> | null = null;
/**
 * 603.6a : des permanents qui arrivent en même temps se voient arriver les uns les autres. Chaque arrivée d'un lot est
 * détectée tout de suite (sources présentes à cet instant), puis revue à la fin du lot pour les sources arrivées après
 * elle dans le même lot.
 */
let enterBatch: { ev: RulesEvent; seen: Set<ObjectId> }[] | null = null;

/** Met de côté un gain de lien de vie jusqu'à la fin du lot en cours ; false s'il n'y a pas de lot (gain immédiat). */
export function queueLifelink(key: string, controller: PlayerId, amount: number): boolean {
  if (!lifelinkBatch) return false;
  const pending = lifelinkBatch.get(key);
  if (pending) pending.amount += amount;
  else lifelinkBatch.set(key, { controller, amount });
  return true;
}

/** Montant évalué hors résolution (sommes, force d'un objet, vitesse…), comme pendant une résolution sans cible. */
function checkAmount(
  s: GameState,
  a: Amount,
  controller: PlayerId,
  sourceId?: ObjectId,
  eventObject?: ObjectId,
  event?: TriggerEventData,
): number {
  const ctx = {
    controller,
    sourceId: sourceId ?? "",
    sourceDefId: (sourceId && s.objects[sourceId]?.defId) || "",
    sourceSnapshot: { keywords: [], power: 0 },
    targets: {},
    x: 0,
    kicked: false,
    // L'objet de l'événement (Increment : « si le mana dépensé pour lancer ce sort »).
    ...(event || eventObject ? { event: { ...event, objectId: eventObject ?? event?.objectId } } : {}),
  };
  return evalAmount(s, ctx, a);
}

/** Exécute `fn` comme un ensemble d'événements simultanés (actions basées sur l'état, un effet…). */
export function simultaneously<T>(s: GameState, fn: () => T): T {
  if (batchBefore) return fn();
  batchBefore = liveSources(s);
  lifelinkBatch = new Map();
  enterBatch = [];
  try {
    const result = fn();
    // Arrivées du lot : les permanents arrivés ensemble se voient arriver (603.6a).
    const enters = enterBatch;
    enterBatch = null;
    for (const { ev, seen } of enters) detectTriggers(s, ev, (src) => !seen.has(src.id));
    // Les gains du lien de vie ont lieu avec les blessures du lot : un par source, dans l'ordre des blessures.
    const gains = lifelinkBatch;
    lifelinkBatch = null;
    for (const { controller, amount } of gains.values()) gainLife(s, controller, amount);
    return result;
  } finally {
    batchBefore = null;
    lifelinkBatch = null;
    enterBatch = null;
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** Le joueur a le plus de points de vie, ou est à égalité (parmi les joueurs encore en jeu). */
export function mostLife(s: GameState, p: PlayerId): boolean {
  const life = (x: PlayerId) => s.players[x]?.life ?? 0;
  return s.playerOrder.every((x) => s.players[x]?.lost || life(p) >= life(x));
}

/** Créatures mortes ce tour-ci (champ de bataille → cimetière), sous n'importe quel contrôleur. */
const DIED_QUERY: TurnLogQuery = { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"] };

/**
 * Condition hors résolution. `eventObject` : l'objet de l'événement déclencheur, pour un « si » intermédiaire qui le
 * concerne (603.4 : « chaque fois qu'un adversaire défausse une carte, si c'est une carte de terrain »).
 */
export function checkCondition(
  s: GameState,
  c: Condition,
  controller: PlayerId,
  sourceId?: ObjectId,
  eventObject?: ObjectId,
  /** L'événement déclencheur entier (« si 3 blessures ou plus » : Innocent Bystander). */
  event?: TriggerEventData,
): boolean {
  switch (c.kind) {
    case "step":
      return s.turn.step === c.step;
    case "creatureDiedMatching":
      return countTurnEvents(s, { ...DIED_QUERY, subtype: c.filter.subtype, notSubtype: c.filter.notSubtype }, controller) > 0;
    case "castFromGraveyard":
      return !!(sourceId && s.objects[sourceId]?.castFromGraveyard);
    case "faceDownOrUpThisTurn":
      return (s.players[controller]?.turnStats.faceDownOrUp ?? 0) > 0;
    case "prime": {
      const n = checkAmount(s, c.amount, controller, sourceId);
      if (n < 2) return false;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
      return true;
    }
    case "turnsTakenAtLeast":
      return (s.players[controller]?.turnsTaken ?? 0) >= c.n;
    case "crimeThisTurn":
      return (s.players[controller]?.turnStats.crimes ?? 0) > 0;
    case "exileAtLeast":
      return s.exile.length >= c.n;
    case "evenCounters": {
      const o = sourceId ? s.objects[sourceId] : undefined;
      return !!o && Object.values(o.counters).reduce((n, x) => n + x, 0) % 2 === 0;
    }
    case "maxSpeed":
      return (s.players[controller]?.speed ?? 0) >= 4;
    case "opponentLifeAtMost":
      return opponentsOf(s, controller).some((p) => (s.players[p]?.life ?? 0) <= c.n);
    case "playerWithoutCreatures":
      return s.playerOrder.some(
        (p) => !s.players[p]?.lost && !s.battlefield.some((id) => s.objects[id]?.controller === p && isCreature(s, id)),
      );
    case "attackedThisTurn":
      return (
        s.turn.active === controller && countTurnEvents(s, { event: "attack", who: "you", subtype: c.subtype }, controller) > 0
      );
    case "creatureDiedThisTurn":
      return countTurnEvents(s, DIED_QUERY, controller) > 0;
    case "firstEndStep":
      return (s.turn.endSteps ?? 0) <= 1;
    case "firstCombat":
      return (s.turn.combats ?? 0) <= 1;
    case "controlsGreatestPower": {
      const creatures = s.battlefield.filter((id) => isCreature(s, id));
      const best = Math.max(-Infinity, ...creatures.map((id) => chars(s, id).power));
      return creatures.some((id) => s.objects[id]?.controller === controller && chars(s, id).power === best);
    }
    case "creaturesDiedAtLeast":
      if (c.underOpponent)
        return (
          countTurnEvents(
            s,
            { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"], who: "opponent" },
            controller,
          ) >= c.n
        );
      return countTurnEvents(s, DIED_QUERY, controller) >= c.n;
    case "scriedThisTurn":
      return (s.players[controller]?.turnStats.scried ?? 0) > 0;
    case "opponentDealtNoncombatDamage":
      return opponentsOf(s, controller).some((q) => (s.players[q]?.turnStats.noncombatDamageTaken ?? 0) > 0);
    case "drewAtLeast":
      return (s.players[controller]?.turnStats.cardsDrawn ?? 0) >= c.n;
    case "castThisTurn": {
      const st = s.players[controller]?.turnStats;
      const n =
        (c.noncreature
          ? countTurnEvents(s, { event: "cast", who: "you", notTypes: ["Creature"] }, controller)
          : st?.spellsCast) ?? 0;
      return c.exactly ? n === c.n : n >= c.n;
    }
    case "attackingAlone": {
      const atk = s.combat?.attackers ?? [];
      return atk.length === 1 && !!s.players[atk[0]?.defender ?? ""];
    }
    case "opponentDealtNoncombatDamageLastTurn":
      return opponentsOf(s, controller).some((q) => (s.players[q]?.noncombatDamageLastTurn ?? 0) > 0);
    case "spellCastFromHand":
      return !!s.resolving?.item.fromHand;
    case "spellCastFromGraveyard":
      return !!s.resolving?.item.flashback;
    case "classLevel":
      return (s.objects[sourceId ?? ""]?.classLevel ?? 1) === c.level;
    case "saddled":
      return s.objects[sourceId ?? ""]?.saddledTurn === s.turn.number;
    case "void":
      // Vide : un permanent non-terrain a quitté le champ de bataille, ou un sort a été lancé avec la distorsion.
      return (
        countTurnEvents(s, { event: "zone", from: "battlefield", notTypes: ["Land"] }, controller) > 0 ||
        countTurnEvents(s, { event: "cast", warped: true }, controller) > 0
      );
    case "solved":
      return !!s.objects[sourceId ?? ""]?.solved;
    case "doorLocked":
      return !!sourceId && !s.objects[sourceId]?.unlocked?.includes(c.door);
    case "fullyUnlocked": {
      const faces = sourceId ? (s.defs[s.objects[sourceId]?.defId ?? ""]?.faceDefs?.length ?? 0) : 0;
      return faces > 0 && (s.objects[sourceId ?? ""]?.unlocked?.length ?? 0) >= faces;
    }
    case "sourceDealtCombatDamage":
      return !!(sourceId && s.objects[sourceId]?.dealtCombatDamage);
    case "chosenMode":
      return !!sourceId && s.objects[sourceId]?.chosen?.mode === c.mode;
    case "sourceDealtDamage":
      return !!(sourceId && s.objects[sourceId]?.dealtDamage);
    case "activatedLoyaltyThisTurn":
      return (s.players[controller]?.turnStats.loyaltyActivations ?? 0) > 0;
    case "behold": {
      const f = { ...c.filter, controller: "you" as const };
      const here = s.battlefield.some((id) => matchesObjectFilter(s, controller, id, f, sourceId));
      return (
        here || (s.players[controller]?.hand ?? []).some((id) => id !== sourceId && matchesCard(s, controller, id, f, sourceId))
      );
    }
    case "spentColor": {
      const item = s.resolving && s.resolving.item.id === sourceId ? s.resolving.item : s.stack.find((x) => x.id === sourceId);
      const spent = (sourceId && (s.objects[sourceId]?.spentColors ?? item?.spentColors)) || {};
      return (spent[c.color] ?? 0) >= c.n;
    }
    case "sneakWindow":
      return (
        s.turn.step === "declareBlockers" &&
        s.turn.active === controller &&
        s.pending?.kind !== "declareBlockers" &&
        !!s.combat?.attackers.some((a) => !a.blocked && s.objects[a.id]?.controller === controller)
      );
    case "enduringStory":
      return playerStatic(s, controller, "enduringStory");
    case "sneaked": {
      const item = s.resolving && s.resolving.item.id === sourceId ? s.resolving.item : s.stack.find((x) => x.id === sourceId);
      return !!item?.sneaked;
    }
    case "harnessed":
      return !!sourceId && !!s.objects[sourceId]?.harnessed;
    case "evoked":
      return !!sourceId && !!s.objects[sourceId]?.evoked;
    case "prepared": {
      const src = sourceId ? s.objects[sourceId] : undefined;
      return !!src?.preparedCopy && !!s.objects[src.preparedCopy];
    }
    case "controls": {
      const n = s.battlefield.filter((id) =>
        matchesObjectFilter(s, controller, id, { ...c.filter, controller: "you" }, sourceId),
      ).length;
      return n >= (c.atLeast ?? 1);
    }
    case "lifeAtLeast":
      return (s.players[controller]?.life ?? 0) >= c.amount;
    case "kicked":
      // Permanent arrivé depuis un sort kické (sinon : évalué à l'arrivée ou à la résolution).
      return !!(sourceId && s.objects[sourceId]?.kicked);
    case "yourTurn":
      return s.turn.active === controller;
    case "opponentsTurn":
      return s.turn.active !== controller;
    case "threshold":
      return (s.players[controller]?.graveyard.length ?? 0) >= 7;
    case "counterAtLeast": {
      // La source, ou ses dernières informations connues (« si elle avait un marqueur… » en mourant).
      const counters = sourceId ? (s.objects[sourceId]?.counters ?? s.lki[sourceId]?.counters) : undefined;
      return !!counters && (counters[c.counter] ?? 0) >= c.n;
    }
    case "lifeAboveStart": {
      const p = s.players[controller];
      return !!p && p.life >= p.startingLife + c.by;
    }
    case "opponentLostLifeThisTurn":
      return opponentsOf(s, controller).some((q) => (s.players[q]?.turnStats.lifeLost ?? 0) > 0);
    case "not":
      return !checkCondition(s, c.cond, controller, sourceId, eventObject, event);
    case "all":
      return c.of.every((x) => checkCondition(s, x, controller, sourceId, eventObject, event));
    case "wasCast":
      return !!(sourceId && s.objects[sourceId]?.cast);
    case "castFromHand":
      return !!(sourceId && s.objects[sourceId]?.castFromHand);
    case "battlefieldCount":
      return s.battlefield.filter((id) => matchesView(snapshot(s, id), c.filter, controller, sourceId)).length >= c.atLeast;
    case "sourceMatches": {
      if (!sourceId) return false;
      if (onBattlefield(s, sourceId)) return matchesObjectFilter(s, controller, sourceId, c.filter, sourceId);
      // Source partie (« quand elle meurt, si ce n'est pas un jeton ») : ses dernières informations connues (603.10).
      const lki = s.objects[sourceId] ? undefined : s.lki[sourceId];
      return !!lki && matchesView(lki, c.filter, controller, sourceId);
    }
    // Lue pendant la résolution seulement (`evalCondition`).
    case "beholdSharingType":
      return false;
    case "targetMatches":
    case "refMatches":
    case "eventObjectMatches": {
      // Au déclenchement : l'objet de l'événement (ses dernières informations connues s'il est parti).
      if (!eventObject) return false;
      const v = s.lki[eventObject] ?? (s.objects[eventObject] ? snapshot(s, eventObject) : undefined);
      return !!v && matchesView(v, c.filter, controller, sourceId);
    }
    case "xAtLeast":
      return false; // évalués au lancement (stack.ts) ou pendant la résolution (effects.ts)
    case "lifeGainedAtLeast":
      return (s.players[controller]?.turnStats.lifeGained ?? 0) >= c.n;
    case "amountAtLeast": {
      const a = c.amount;
      if (typeof a === "number") return a >= c.n;
      if (a.kind === "count" && a.zone && a.zone !== "battlefield") {
        // Cartes d'une zone (« deux éphémères ou rituels ou plus dans votre cimetière »).
        const zone = a.zone;
        const players = a.whose === "all" ? s.playerOrder : a.whose === "opponents" ? opponentsOf(s, controller) : [controller];
        const n = players
          .flatMap((p) => (zone === "exile" ? s.exile.filter((id) => s.objects[id]?.owner === p) : (s.players[p]?.[zone] ?? [])))
          .filter((id) => matchesView(snapshot(s, id), { ...a.filter, controller: undefined }, controller, sourceId)).length;
        return n >= c.n;
      }
      if (a.kind === "count" || a.kind === "totalPower") return boardAmount(s, a, controller, sourceId) >= c.n;
      return checkAmount(s, a, controller, sourceId, eventObject, event) >= c.n;
    }
    case "any":
      return c.of.some((x) => checkCondition(s, x, controller, sourceId, eventObject, event));
    case "opponentHasMore": {
      const measure = (p: PlayerId): number => {
        if (c.what === "life") return s.players[p]?.life ?? 0;
        if (c.what === "hand") return s.players[p]?.hand.length ?? 0;
        const type = c.what === "lands" ? "Land" : "Creature";
        return s.battlefield.filter((id) => s.objects[id]?.controller === p && chars(s, id).types.includes(type)).length;
      };
      const mine = measure(controller);
      return opponentsOf(s, controller).some((p) => measure(p) > mine);
    }
    case "lostLifeThisTurn":
      return (s.players[controller]?.turnStats.lifeLost ?? 0) > 0;
    case "canForage":
      return canForage(s, controller);
    case "mostLife": {
      // Avec une référence (le joueur défenseur…) : évaluée pendant la résolution (effects.ts).
      if (c.ref) return false;
      return mostLife(s, controller);
    }
    case "handAtMost": {
      // « s'il n'a pas de carte en main » hors résolution (« Pour résoudre » d'une Affaire, condition d'un déclencheur).
      const ctx = {
        controller,
        sourceId: sourceId ?? "",
        sourceDefId: "",
        sourceSnapshot: { keywords: [], power: 0 },
        targets: {},
        x: 0,
        kicked: false,
      };
      return resolveRef(s, ctx, c.ref).some((p) => !!s.players[p] && (s.players[p]?.hand.length ?? 0) <= c.n);
    }
    case "var":
    case "refLife":
    case "refLostLife":
    case "targetChosen":
      return false; // évalué pendant la résolution (effects.ts)
  }
}

// ---------------------------------------------------------------------------
// Détection
// ---------------------------------------------------------------------------

function matchWho(who: "self" | ObjectFilter, v: LkiSnapshot, src: Source): boolean {
  if (who === "self") return v.id === src.id;
  // « la créature équipée / enchantée »
  if (who.attachedToSource && v.id !== src.view.attachedTo) return false;
  // Turn Inside Out : l'objet lié à l'emblème.
  if (who.linkedToSource && !src.view.linked?.includes(v.id)) return false;
  return matchesView(v, withChosen(who, src.view), src.view.controller, src.id);
}

function whose(rel: "you" | "opponent" | "any", player: PlayerId, controller: PlayerId): boolean {
  return rel === "any" || (rel === "you" ? player === controller : player !== controller);
}

function liveView(s: GameState, id: ObjectId | null): LkiSnapshot | null {
  return id && s.objects[id] ? snapshot(s, id) : null;
}

/** L'événement correspond-il au déclencheur ? Renvoie les données de l'événement, ou null. */
function matchTrigger(s: GameState, ev: RulesEvent, t: TriggerSpec, src: Source): TriggerEventData | null {
  const me = src.view.controller;
  switch (t.on) {
    case "enters": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      // Torpor Orb (créatures), Karn, Argent Defender (artefacts et créatures) : leur arrivée ne déclenche rien.
      if (
        v &&
        s.playerOrder.some((p) =>
          playerStatics(s, p, "triggerMod").some(
            ({ id, ab }) =>
              ab.triggerMod?.effect === "none" &&
              ab.triggerMod.onEnter &&
              (!ab.triggerMod.entering || matchesView(v, ab.triggerMod.entering, p, id)),
          ),
        )
      )
        return null;
      if (t.fromZone) {
        const arrived = ev.newId ? s.objects[ev.newId] : undefined;
        const cast = t.fromZone === "graveyard" ? arrived?.castFromGraveyard : arrived?.castFromExile;
        if (ev.from !== t.fromZone && !cast) return null;
      }
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "dies": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || ev.to !== "graveyard" || !ev.lki) return null;
      // « Meurt » : une créature, sauf si le filtre nomme d'autres types (« une créature ou un artefact meurt », Edge of Eternities).
      const typed = t.who !== "self" && (!!t.who.types || !!t.who.anyOf);
      if (!typed && !ev.lki.types.includes("Creature")) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "playerLoses":
      return ev.e === "playerLost" &&
        ev.player !== me &&
        (t.whose === "any" || opponentsOf(s, me).includes(ev.player) || s.players[ev.player]?.lost)
        ? { player: ev.player }
        : null;
    case "controlChange":
      return ev.e === "controlChange" && ev.from === me && ev.to !== me ? { objectId: ev.objectId, player: ev.to } : null;
    case "leaves": {
      // Depuis une autre zone (Kaya : cartes de votre cimetière exilées) : la carte arrivée, vue dans sa nouvelle zone.
      if (t.from && t.from !== "battlefield") {
        if (ev.e !== "zone" || ev.from !== t.from || (t.to && ev.to !== t.to) || !ev.newId || typeof t.who !== "object")
          return null;
        const v = liveView(s, ev.newId);
        return v && matchWho(t.who, v, src) ? { objectId: ev.newId, player: v.controller } : null;
      }
      if (ev.e !== "zone" || ev.from !== "battlefield" || !ev.lki) return null;
      if (t.to && ev.to !== t.to) return null;
      if (t.whileCrafting && !s.turn.crafting) return null;
      // Zenos yae Galvus : « quand la créature choisie quitte le champ de bataille » (liée à la source).
      if (t.who === "linked") return s.objects[src.id]?.linked?.includes(ev.lki.id) ? { objectId: ev.lki.id } : null;
      if (typeof t.who === "object")
        return matchWho(t.who, ev.lki, src)
          ? {
              objectId: ev.lki.id,
              player: ev.lki.controller,
              // Vers l'exil (Kaya) : la carte exilée devient l'objet de l'événement.
              ...(t.to === "exile" && ev.newId ? { newObjectId: ev.newId } : {}),
            }
          : null;
      return ev.lki.id === src.id ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined } : null;
    }
    case "attacks": {
      if (ev.e !== "attack") return null;
      const v = liveView(s, ev.attacker);
      if (!v || !matchWho(t.who, v, src)) return null;
      // « … vous attaque ou attaque un planeswalker que vous contrôlez » (Jace, Reality Sculptor).
      if (t.defending === "you" && ev.defender !== me && s.objects[ev.defender]?.controller !== me) return null;
      if (t.alone && (s.combat?.attackers.length ?? 0) !== 1) return null;
      return { objectId: ev.attacker, player: ev.defender };
    }
    case "attackWith": {
      if (ev.e !== "attackWith" || (!t.anyPlayer && ev.player !== me)) return null;
      // « Chaque fois que vous attaquez avec un ou plusieurs [Rats] » : seulement les attaquants correspondants.
      const f = t.filter;
      const count = f
        ? (s.combat?.attackers ?? []).filter((a) => {
            const v = liveView(s, a.id);
            return !!v && v.controller === ev.player && matchesView(v, f, me, src.id);
          }).length
        : ev.count;
      return count >= (t.min ?? 1) ? { player: me, amount: count } : null;
    }
    case "dealsCombatDamage":
    case "dealsDamage": {
      if (ev.e !== "damage") return null;
      if (t.on === "dealsDamage" && t.spellToSoleTarget) {
        const item = ev.stackId
          ? s.resolving?.item.id === ev.stackId
            ? s.resolving.item
            : s.stack.find((x) => x.id === ev.stackId)
          : undefined;
        const targets = item ? Object.values(item.targets).flat() : [];
        if (!item || targets.length !== 1 || targets[0] !== ev.target || !s.objects[ev.target] || !isCreature(s, ev.target))
          return null;
        const v = liveView(s, item.sourceId) ?? s.lki[item.sourceId] ?? null;
        if (!v || !matchWho(t.who, v, src)) return null;
        return { objectId: ev.target, amount: ev.amount };
      }
      if (t.on === "dealsDamage" && t.anySourceYouControl) {
        if (ev.sourceController !== me || (t.noncombatOnly && ev.combat)) return null;
        const toOpp = !!s.players[ev.target] && ev.target !== me;
        if (t.toOpponent && !toOpp) return null;
        if (t.exactToughness) {
          const victim = s.objects[ev.target];
          if (victim?.zone !== "battlefield" || !isCreature(s, ev.target) || chars(s, ev.target).toughness !== ev.amount)
            return null;
        }
        return { objectId: ev.sourceId ?? undefined, player: toOpp ? ev.target : undefined, amount: ev.amount };
      }
      if (!ev.sourceId) return null;
      if (t.on === "dealsCombatDamage" && !ev.combat) return null;
      if (t.on === "dealsDamage" && t.noncombatOnly && ev.combat) return null;
      const toPlayer = !!s.players[ev.target];
      if (t.on === "dealsCombatDamage" && t.toPlayer && !toPlayer) return null;
      // « … à l'un de vos adversaires » (Gonti, Night Minister).
      if (t.on === "dealsCombatDamage" && t.toOpponent && (!toPlayer || ev.target === me)) return null;
      if (t.on === "dealsDamage" && t.toOpponent && (!toPlayer || ev.target === me)) return null;
      const v = liveView(s, ev.sourceId) ?? s.lki[ev.sourceId] ?? null;
      if (!v || !matchWho(t.who, v, src)) return null;
      return { objectId: ev.sourceId, player: toPlayer ? ev.target : undefined, amount: ev.amount };
    }
    case "castSpell": {
      if (ev.e !== "cast" || !whose(t.by, ev.player, me)) return null;
      const v = liveView(s, ev.stackId);
      // « un sort de la couleur choisie » (Diamond Mare) : le choix de la source.
      const f = t.filter ? withChosen(t.filter, s.objects[src.id]) : undefined;
      const filterOk = !f || (!!v && matchesView(v, f, me, src.id));
      if (!filterOk && !t.targeting?.orFilter) return null;
      // « un sort qui cible une créature que vous contrôlez / un adversaire » (Danitha).
      if (t.targeting) {
        const item = s.stack.find((x) => x.id === ev.stackId);
        const targets = item ? Object.values(item.targets).flat() : [];
        const tg = t.targeting;
        const ok = targets.some((id) =>
          s.players[id] ? !!tg.opponent && id !== me : !!tg.objects && matchesObjectFilter(s, me, id, tg.objects, src.id),
        );
        // Danitha, Sword of Hope : « un sort d'Équipement ou un sort qui cible… ».
        if (!ok && !(t.targeting.orFilter && f && filterOk)) return null;
      }
      if (t.singleTarget) {
        const item = s.stack.find((x) => x.id === ev.stackId);
        if (!item || Object.values(item.targets).flat().length !== 1) return null;
      }
      // « votre deuxième sort de chaque tour ».
      if (t.nth !== undefined && s.players[ev.player]?.turnStats.spellsCast !== t.nth) return null;
      if (t.notTheirTurn && s.turn.active === ev.player) return null;
      if (t.modal) {
        const d = s.defs[s.objects[ev.stackId]?.defId ?? ""];
        if ((d?.spell?.modes?.length ?? 0) < 2) return null;
      }
      if (t.notFromHand && s.stack.find((x) => x.id === ev.stackId)?.fromHand) return null;
      if (t.fromExile && !s.stack.find((x) => x.id === ev.stackId)?.fromExile) return null;
      if (t.fromHand && !s.stack.find((x) => x.id === ev.stackId)?.fromHand) return null;
      if (t.usingManaFromSelf && !s.stack.find((x) => x.id === ev.stackId)?.manaSources?.includes(src.id)) return null;
      if (t.minManaSpent !== undefined && (s.stack.find((x) => x.id === ev.stackId)?.manaSpent ?? 0) < t.minManaSpent)
        return null;
      if (t.notOwned && s.objects[ev.stackId]?.owner === ev.player) return null;
      // Alania : le premier éphémère, le premier rituel ou le premier sort de Loutre (autre qu'elle) de ce tour.
      if (t.firstOf) {
        // Journal du tour : un seul sort de ce type (ou de ce sous-type de créature), celui-ci.
        const castOf = (k: string) =>
          countTurnEvents(
            s,
            (
              ["Instant", "Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"] as string[]
            ).includes(k)
              ? { event: "cast", types: [k as CardType] }
              : { event: "cast", types: ["Creature"], subtype: k },
            me,
            ev.player,
          );
        const first =
          !!v &&
          ev.stackId !== src.id &&
          t.firstOf.some((k) => (v.types.includes(k as CardType) || v.subtypes.includes(k)) && castOf(k) === 1);
        if (!first) return null;
      }
      // `amount` : éphémères et rituels déjà lancés ce tour-ci (Thousand-Year Storm).
      return { objectId: ev.stackId, player: ev.player, amount: ev.instantSorceryBefore };
    }
    case "discard":
      return ev.e === "discard" && whose(t.whose, ev.player, me) ? { objectId: ev.cards[0], player: ev.player } : null;
    case "discardBatch":
      return ev.e === "discardBatch" && whose(t.whose, ev.player, me) ? { player: ev.player, amount: ev.count } : null;
    case "loyaltyActivated": {
      if (ev.e !== "loyalty") return null;
      if (t.byOpponent ? ev.player === me : ev.player !== me) return null;
      if (t.minRemoved !== undefined && -ev.cost < t.minRemoved) return null;
      return { objectId: ev.sourceId, player: ev.player };
    }
    case "isDealtDamage": {
      if (typeof t.who === "object") {
        if (ev.e !== "damage" || ev.amount <= 0) return null;
        const v = liveView(s, ev.target);
        return v && matchWho(t.who, v, src) ? { objectId: ev.target, amount: ev.amount, player: me } : null;
      }
      // La créature enchantée ou équipée (Cryoshatter, Pain for All), ou la source elle-même.
      const who = t.who === "attached" ? src.view.attachedTo : src.id;
      return ev.e === "damage" && who && ev.target === who && ev.amount > 0
        ? { objectId: who, amount: ev.amount, player: me }
        : null;
    }
    case "excessDamage": {
      if (ev.e !== "damage" || !ev.excess || (t.noncombatOnly && ev.combat)) return null;
      const v = liveView(s, ev.target);
      if (!v || !matchWho(t.who, v, src)) return null;
      return { objectId: ev.target, amount: ev.excess, player: v.controller };
    }
    case "blocks": {
      if (ev.e !== "block") return null;
      const v = liveView(s, ev.blocker);
      if (!v || !matchWho(t.who, v, src)) return null;
      // « … bloque une créature avec le vol » (Skystinger).
      const a = liveView(s, ev.attacker);
      if (t.attacker && (!a || !matchesView(a, t.attacker, me, src.id))) return null;
      return { objectId: t.eventObject === "attacker" ? ev.attacker : ev.blocker, player: v.controller };
    }
    case "chapter": {
      // 714.2b : chaque chapitre atteint ou dépassé par les marqueurs de savoir posés.
      if (ev.e !== "counters" || ev.kind !== "lore" || ev.objectId !== src.id) return null;
      const after = s.objects[src.id]?.counters.lore ?? 0;
      const before = after - ev.amount;
      return t.chapters.some((n) => before < n && n <= after) ? { objectId: src.id, player: src.view.controller } : null;
    }
    case "classLevel":
      return ev.e === "classLevel" && ev.objectId === src.id && ev.level === t.level
        ? { objectId: src.id, player: src.view.controller }
        : null;
    case "activateAbility": {
      if (ev.e !== "activated" || ev.player !== me) return null;
      const item = s.stack.find((x) => x.id === ev.stackId);
      return item && !item.copy ? { objectId: item.id, player: me } : null;
    }
    case "discover":
      return ev.e === "discover" && ev.player === me ? { player: me, amount: ev.n } : null;
    case "explores": {
      if (ev.e !== "explore" || (t.land !== undefined && t.land !== ev.land)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
    }
    case "combatDamageBatch": {
      if (ev.e !== "combatDamageBatch") return null;
      const ok = ev.sources.some((id) => {
        const v = liveView(s, id) ?? s.lki[id];
        return !!v && matchesView(v, t.who, me, src.id);
      });
      return ok ? { player: ev.player } : null;
    }
    case "sacrifice": {
      if (ev.e !== "sacrifice" || (ev.player !== me && !t.anyPlayer) || (t.byOpponent && ev.player === me)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: ev.player } : null;
    }
    case "search":
      if (ev.e !== "search") return null;
      if ((t.whose === "you" && ev.player !== me) || (t.whose === "opponent" && ev.player === me)) return null;
      return { player: ev.player };
    case "saddled":
      return ev.e === "saddled" && ev.objectId === src.id ? { objectId: src.id, player: src.view.controller } : null;
    case "crews": {
      if (ev.e !== "crewed" || !ev.crew.includes(src.id)) return null;
      if (t.mainPhase && (s.turn.active !== me || (s.turn.step !== "main1" && s.turn.step !== "main2"))) return null;
      return { objectId: ev.vehicle, player: me };
    }
    case "turnedFaceUp": {
      if (ev.e !== "turnedFaceUp") return null;
      if (!t.who) return ev.objectId === src.id ? { objectId: src.id, player: src.view.controller } : null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "manifestDread":
      return ev.e === "manifestDread" && ev.player === me ? { objectId: ev.graveyard?.[0], player: me } : null;
    case "attachedPlayerDamaged":
      return ev.e === "damage" && ev.target === src.view.attachedTo && isPlayer(s, ev.target)
        ? { player: ev.target, amount: ev.amount }
        : null;
    case "becomesBlocked": {
      if (ev.e !== "blocked") return null;
      const v = liveView(s, ev.attacker);
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "eerie": {
      if (ev.e === "zone" && ev.to === "battlefield") {
        const v = liveView(s, ev.newId);
        return v && v.controller === me && v.types.includes("Enchantment") ? { objectId: v.id, player: me } : null;
      }
      if (ev.e !== "unlock" || ev.player !== me) return null;
      const room = s.objects[ev.objectId];
      const doors = s.defs[room?.defId ?? ""]?.faceDefs?.length ?? 0;
      return doors > 0 && (room?.unlocked?.length ?? 0) >= doors ? { objectId: ev.objectId, player: me } : null;
    }
    case "unlockDoor":
      return ev.e === "unlock" && ev.objectId === src.id && (t.door === undefined || t.door === ev.door)
        ? { objectId: src.id, player: ev.player }
        : null;
    case "diesOrExiled": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || (ev.to !== "graveyard" && ev.to !== "exile") || !ev.lki) return null;
      if (!ev.lki.types.includes("Creature") || (t.minPower !== undefined && ev.lki.power < t.minPower)) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "playLand":
      return ev.e === "playLand" && ev.player === me ? { objectId: ev.objectId, player: me } : null;
    case "castSelf":
      return ev.e === "cast" && ev.stackId === src.id ? { objectId: src.id, player: me } : null;
    case "zoneChange": {
      if (ev.e !== "zone" || !ev.from || !t.from.includes(ev.from) || (t.to && !t.to.includes(ev.to))) return null;
      const card = (ev.newId && s.objects[ev.newId]) || undefined;
      const owner = card?.owner ?? ev.lki?.owner;
      if (t.whose === "you" && owner !== me) return null;
      if (t.filter) {
        const d = s.defs[card?.defId ?? ev.lki?.defId ?? ""];
        if (!d || (t.filter.types && !t.filter.types.some((x) => d.types.includes(x)))) return null;
      }
      return { objectId: ev.newId ?? undefined, player: owner ?? me };
    }
    case "crime":
      return ev.e === "crime" && ev.player === me ? { player: me } : null;
    case "activateTargeting": {
      if (ev.e !== "targeted" || ev.controller !== me) return null;
      const item = s.stack.find((x) => x.id === ev.stackId);
      if (item?.kind !== "ability" || item.inline || item.copy) return null;
      if (s.defs[item.sourceDefId]?.abilities[item.abilityIndex]?.kind !== "activated") return null;
      const ok = ev.targets.some((id) => !!s.players[id] || (s.objects[id]?.zone === "battlefield" && isCreature(s, id)));
      return ok ? { objectId: item.id, player: me } : null;
    }
    case "plottedSelf":
      return ev.e === "plotted" && ev.card === src.id ? { objectId: src.id, player: me } : null;
    case "exhaustActivated":
      return ev.e === "exhaust" && ev.player === me ? { objectId: ev.source, player: me } : null;
    case "transformsSelf":
      return ev.e === "transformed" && ev.objectId === src.id ? { objectId: src.id, player: me } : null;
    case "cycleSelf":
      return ev.e === "cycled" && ev.card === src.id ? { objectId: src.id, player: ev.player, amount: ev.x } : null;
    case "discardSelf":
      return ev.e === "discard" && ev.cards.includes(src.id) ? { objectId: src.id, player: ev.player } : null;
    case "step":
      return ev.e === "step" && ev.step === t.step && whose(t.whose, ev.active, me) ? { player: ev.active } : null;
    case "landfall": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      return v?.types.includes("Land") && v.controller === me ? { objectId: v.id, player: me } : null;
    }
    case "gainLife":
      return ev.e === "lifeGain" && ev.player === me && (!t.first || ev.first) ? { player: me, amount: ev.amount } : null;
    case "scryOrSurveil":
      return ev.e === "scry" && ev.player === me ? { player: me } : null;
    case "loseLife":
      return ev.e === "lifeLoss" && whose(t.whose, ev.player, me) ? { player: ev.player, amount: ev.amount } : null;
    case "draw":
      // La carte piochée est l'objet de l'événement (miracle : Lorehold, the Historian).
      return ev.e === "draw" && whose(t.whose, ev.player, me) && (t.nth === undefined || ev.nth === t.nth)
        ? { player: ev.player, amount: 1, objectId: ev.objectId }
        : null;
    case "taps": {
      if (ev.e !== "tap" || (t.byYou && ev.by !== me)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
    }
    case "untaps": {
      if (ev.e !== "untap") return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
    }
    case "becomesTarget": {
      if (ev.e !== "targeted") return null;
      // « Chaque fois qu'une créature que vous contrôlez devient la cible… » (Pawpatch Recruit) : l'objet ciblé.
      const who = t.who;
      const hit =
        who === "self"
          ? ev.targets.includes(src.id)
            ? src.id
            : undefined
          : ev.targets.find((id) => {
              const v = liveView(s, id);
              const zone = s.objects[id]?.zone;
              return !!v && (zone === "battlefield" || (!!t.spells && zone === "stack")) && matchWho(who, v, src);
            });
      if (!hit) return null;
      if (t.byOpponent && ev.controller === me) return null;
      // Vaillance : un sort ou une capacité que vous contrôlez.
      if (t.byYou && ev.controller !== me) return null;
      if (who !== "self") return { objectId: hit, player: ev.controller };
      // « Chaque fois que vous lancez un sort qui cible cette créature » : une copie n'est pas lancée.
      const byItem = s.stack.find((x) => x.id === ev.stackId);
      if (t.bySpellYouControl && (ev.controller !== me || byItem?.kind !== "spell" || byItem.copy)) return null;
      return { objectId: ev.stackId, player: ev.controller };
    }
    case "expend":
      return ev.e === "expend" && ev.player === me && ev.n === t.n ? { player: me } : null;
    case "forage":
      return ev.e === "forage" && ev.player === me ? { player: me } : null;
    case "collectEvidence":
      return ev.e === "collectEvidence" && ev.player === me ? { player: me } : null;
    case "bend":
      return ev.e === "bend" && ev.player === me && (!t.kinds || t.kinds.includes(ev.kind)) ? { player: me } : null;
    case "caseSolved":
      return ev.e === "caseSolved" && ev.player === me ? { player: me, objectId: ev.objectId } : null;
    case "gift":
      return ev.e === "gift" && ev.player === me ? { player: me } : null;
    case "lifeChange":
      return (ev.e === "lifeGain" || ev.e === "lifeLoss") && ev.player === me ? { player: me, amount: ev.amount } : null;
    case "leavesWithoutDying": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || !ev.lki) return null;
      if (ev.to === "graveyard" && ev.lki.types.includes("Creature")) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "countersPut": {
      if (ev.e !== "counters" || (t.kind && ev.kind !== t.kind) || (t.firstThisTurn && !ev.first)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, amount: ev.amount, player: v.controller } : null;
    }
  }
}

/** `only` : ne regarder que certaines sources (revue des arrivées en fin de lot, 603.6a). */
export function detectTriggers(s: GameState, ev: RulesEvent, only?: (src: Source) => boolean): void {
  if (s.over) return;
  const leaving = ev.e === "zone" && ev.from === "battlefield";
  let sources: Source[];
  if (leaving) {
    sources = batchBefore ?? liveSources(s);
    // L'objet qui part peut se déclencher lui-même (« quand cette créature meurt »).
    if (ev.lki && hasTriggers(ev.lki.abilities) && !sources.some((x) => x.id === ev.lki?.id)) {
      sources = [...sources, { id: ev.lki.id, view: ev.lki }];
    }
  } else {
    sources = liveSources(s);
    if (!only && enterBatch && ev.e === "zone" && ev.to === "battlefield")
      enterBatch.push({ ev, seen: new Set(sources.map((x) => x.id)) });
  }
  if (only) sources = sources.filter(only);
  for (const src of sources) {
    (src.view.abilities ?? []).forEach((ab, index) => {
      if (ab.kind !== "triggered") return;
      // Une capacité « depuis le cimetière » ne se déclenche que là, les autres jamais depuis le cimetière.
      if (!!ab.fromGraveyard !== (s.objects[src.id]?.zone === "graveyard")) return;
      const data = matchTrigger(s, ev, ab.trigger, src);
      if (!data) return;
      // Nowhere to Run : la garde des créatures des adversaires de son contrôleur ne se déclenche pas.
      if (
        ab.ward &&
        ev.e === "targeted" &&
        ev.controller !== src.view.controller &&
        src.view.types.includes("Creature") &&
        playerStatic(s, ev.controller, "ignoreOpponentsHexproofWard")
      )
        return;
      if (ab.condition && !checkCondition(s, ab.condition, src.view.controller, src.id, data.objectId, data)) return;
      // « une ou plusieurs … » : un seul déclenchement en attente pour ce lot d'événements.
      if (ab.batched && s.triggers.some((t) => t.sourceId === src.id && t.abilityIndex === index)) return;
      if (ab.oncePerTurn) {
        const key = `${src.view.defId}:${src.id}:${index}`;
        if (s.turn.onceFired.includes(key)) return;
        s.turn.onceFired.push(key);
      }
      // Cloud, Midgar Mercenary : Cloud équipé, ou un Équipement attaché à Cloud.
      const cloud = (id: string | undefined) =>
        !!id && onBattlefield(s, id) && !!s.defs[copiedDefId(s, id)]?.doubleTriggersWhenEquipped && !!snapshot(s, id).equipped;
      const equippedCloud =
        (src.view.equipped && cloud(src.id)) || (src.view.subtypes.includes("Equipment") && cloud(src.view.attachedTo));
      const again =
        1 +
        (equippedCloud ? 1 : 0) +
        triggerDoublers(s, src, ev) +
        (ev.e === "zone" && ev.from === "battlefield" && ev.to === "graveyard" && ev.lki?.types.includes("Creature")
          ? masamunes(s, src.id, src.view.controller)
          : 0);
      for (let k = 0; k < again; k++) {
        s.triggers.push({
          id: newId(s, "t"),
          sourceId: src.id,
          sourceDefId: src.view.defId,
          abilityIndex: index,
          controller: src.view.controller,
          sourceSnapshot: { keywords: src.view.keywords, power: src.view.power, controller: src.view.controller },
          event: data,
          targets: {},
          // Capacité accordée (pas dans la définition) : on la transporte avec le déclenchement.
          inline: (s.defs[src.view.defId]?.abilities[index] ?? null) === ab ? undefined : inlineOf(ab),
        });
      }
    });
  }
}

function inlineOf(ab: TriggeredAbilityDef): InlineAbility {
  return { targets: ab.targets, effects: ab.effects, label: ab.label };
}

// ---------------------------------------------------------------------------
// Capacités retardées et réflexives
// ---------------------------------------------------------------------------

/** Crée une capacité retardée « au début de la prochaine étape de fin ». */
export function createDelayed(
  s: GameState,
  controller: PlayerId,
  sourceId: ObjectId,
  sourceDefId: string,
  ability: InlineAbility,
  at: DelayedTiming = "nextEndStep",
): void {
  const lateInTurn = s.turn.step === "end" || s.turn.step === "cleanup";
  // « à votre prochaine étape de fin » : celle de ce tour si c'est le vôtre et qu'elle n'est pas passée.
  s.delayed.push({
    id: newId(s, "d"),
    controller,
    sourceId,
    sourceDefId,
    at,
    // « à l'étape de fin de votre prochain tour » : pas ce tour-ci.
    notBeforeTurn:
      at === "yourNextEndStep" || at === "nextUpkeep" || at === "yourNextUpkeep" || lateInTurn
        ? s.turn.number + 1
        : s.turn.number,
    ability,
  });
}

/** The Masamune : Équipements « doubleurs de morts » attachés à la source, ou (pour un emblème) à une créature de son propriétaire. */
function masamunes(s: GameState, sourceId: ObjectId, player: PlayerId): number {
  const flagged = (id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.doubleDeathTriggersForEquipped;
  const emblem = s.objects[sourceId]?.zone === "command";
  return s.battlefield.filter((id) => {
    const host = s.objects[id]?.attachedTo;
    if (!host || !flagged(id)) return false;
    return emblem ? s.objects[host]?.controller === player : host === sourceId;
  }).length;
}

/**
 * Déclenchements supplémentaires (famille G) : Fractured Realm (vos permanents), Starfield Vocalist (une arrivée),
 * Traveling Chocobo (l'arrivée d'un terrain ou d'un Oiseau à vous), Annie Joins Up (vos créatures légendaires),
 * Roaming Throne (les autres créatures du type choisi), Windcrag Siege (une créature qui attaque).
 */
function triggerDoublers(s: GameState, src: Source, ev: RulesEvent): number {
  const player = src.view.controller;
  const entered = ev.e === "zone" && ev.to === "battlefield" ? (ev.newId ?? undefined) : undefined;
  // Par défaut, les capacités de vos permanents (ou d'un permanent qui vient de quitter le champ de bataille).
  const permanent = (s.objects[src.id]?.zone ?? "battlefield") === "battlefield";
  return playerStatics(s, player, "triggerMod").filter(({ id, ab }) => {
    const m = ab.triggerMod;
    if (m?.effect !== "again") return false;
    if (m.onEnter && !entered) return false;
    // Windcrag Siege : « si une créature qui attaque fait se déclencher une capacité d'un permanent que vous contrôlez ».
    if (m.onAttack && ev.e !== "attack" && ev.e !== "attackWith") return false;
    if (m.entering && !(entered && s.objects[entered] && matchesObjectFilter(s, player, entered, m.entering, id))) return false;
    if (!m.sources) return permanent;
    const holder = id ? s.objects[id] : undefined;
    return matchesView(src.view, holder ? withChosen(m.sources, holder) : m.sources, player, id);
  }).length;
}

/** Au début de l'étape de fin (ou à la fin du combat) : les capacités retardées dont c'est le moment se déclenchent. */
export function releaseDelayedTriggers(s: GameState, moment: "end" | "endCombat" | "upkeep" | "main" = "end"): void {
  const due = s.delayed.filter((d) => {
    if (d.notBeforeTurn > s.turn.number) return false;
    // Mana Sculpt : « au début de votre prochaine phase principale » (celle d'après combat comprise).
    if (moment === "main") return d.at === "yourNextMain" && s.turn.active === d.controller;
    if (d.at === "yourNextMain") return false;
    if (moment === "endCombat") return d.at === "endOfCombat";
    // Firion : « au début du prochain entretien ».
    // Rebond : « au début de votre prochain entretien ».
    if (moment === "upkeep") return d.at === "nextUpkeep" || (d.at === "yourNextUpkeep" && s.turn.active === d.controller);
    if (d.at === "endOfCombat" || d.at === "nextUpkeep" || d.at === "yourNextUpkeep") return false;
    // « … de votre prochain tour » : seulement pendant un tour de son contrôleur.
    return (d.at !== "yourNextEndStep" && d.at !== "yourEndStep") || s.turn.active === d.controller;
  });
  if (due.length === 0) return;
  s.delayed = s.delayed.filter((d) => !due.includes(d));
  for (const d of due) pushInline(s, d.controller, d.sourceId, d.sourceDefId, d.ability);
}

/** Met en attente une capacité retardée ou réflexive (elle ira sur la pile à la prochaine priorité). */
export function pushInline(
  s: GameState,
  controller: PlayerId,
  sourceId: ObjectId,
  sourceDefId: string,
  ability: InlineAbility,
  event: TriggerEventData = {},
): void {
  s.triggers.push({
    id: newId(s, "t"),
    sourceId,
    sourceDefId,
    abilityIndex: -1,
    controller,
    sourceSnapshot: { keywords: [], power: 0, controller },
    event,
    targets: { ...(ability.bound ?? {}) },
    inline: ability,
  });
}

// ---------------------------------------------------------------------------
// Mise sur la pile
// ---------------------------------------------------------------------------

export function triggeredAbility(s: GameState, t: { sourceDefId: string; abilityIndex: number }): TriggeredAbilityDef | null {
  const ab = s.defs[t.sourceDefId]?.abilities[t.abilityIndex];
  return ab?.kind === "triggered" ? ab : null;
}

/** Cibles d'un déclenchement : celles de la capacité retardée/réflexive, du mode choisi, ou de la capacité. */
export function triggerTargetSpecs(
  s: GameState,
  t: { sourceDefId: string; abilityIndex: number; mode?: number; inline?: InlineAbility },
): TargetSpec[] {
  if (t.inline) return t.inline.targets;
  const ab = triggeredAbility(s, t);
  if (!ab) return [];
  if (ab.modes) return ab.modes[t.mode ?? 0]?.targets ?? [];
  return ab.targets;
}

/** Carte et capacité d'un déclenchement en attente (interface : rappel de l'effet pendant le choix de ses cibles). */
export function pendingTriggerSource(s: GameState, triggerId: string): { defId: string; label?: string } | null {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) return null;
  const label = t.inline?.label ?? triggeredAbility(s, t)?.label;
  return { defId: t.sourceDefId, ...(label ? { label } : {}) };
}

function triggerLabel(s: GameState, t: PendingTrigger): string {
  const label = t.inline?.label ?? triggeredAbility(s, t)?.label;
  return `${cardRef(t.sourceDefId)}${label ? ` — ${label}` : ""}`;
}

/**
 * Met les capacités déclenchées en attente sur la pile, en posant les questions nécessaires.
 * Renvoie true si quelque chose a changé (capacité mise sur la pile ou question posée).
 */
export function processTriggers(s: GameState): boolean {
  if (s.triggers.length === 0) return false;
  // 800.4a : un déclenchement d'un joueur qui a quitté la partie (créé après coup, d'une dernière information) n'existe pas.
  if (s.triggers.some((t) => s.players[t.controller]?.lost))
    s.triggers = s.triggers.filter((t) => !s.players[t.controller]?.lost);
  let changed = false;
  // 603.3b : APNAP — le joueur actif met les siennes en premier (elles se résoudront en dernier).
  for (const p of apnapOrder(s)) {
    const mine = s.triggers.filter((t) => t.controller === p);
    if (mine.length === 0) continue;
    if (mine.length > 1 && !mine.every((t) => t.ordered)) {
      ask(
        s,
        p,
        {
          type: "order",
          intent: "triggerOrder",
          prompt: "Ordre de résolution de vos capacités déclenchées (la première se résout en premier)",
          items: mine.map((t) => t.id),
          labels: Object.fromEntries(mine.map((t) => [t.id, triggerLabel(s, t)])),
          suggested: mine.map((t) => t.id),
          autoOk: true,
        },
        { kind: "triggerOrder", player: p },
      );
      return true;
    }
    // Dans l'ordre de résolution voulu, la dernière va sur la pile en premier.
    for (const t of [...mine].reverse()) {
      if (!chooseTriggerMode(s, t)) return true; // question posée
      if (!chooseTriggerTargets(s, t)) return true;
      s.triggers = s.triggers.filter((x) => x.id !== t.id);
      const specs = triggerTargetSpecs(s, t);
      if (!t.inline && !triggeredAbility(s, t)) continue;
      // 603.3d : une capacité sans cible légale pour une cible requise est retirée.
      if (specs.some((spec) => !spec.optional && (t.targets[spec.id]?.length ?? 0) === 0)) continue;
      const item: StackItem = {
        id: newId(s, "a"),
        kind: "ability",
        controller: t.controller,
        sourceId: t.sourceId,
        sourceDefId: t.sourceDefId,
        abilityIndex: t.abilityIndex,
        mode: t.mode ?? 0,
        targets: t.targets,
        x: 0,
        kicked: false,
        sourceSnapshot: t.sourceSnapshot,
        event: t.event,
        inline: t.inline,
      };
      s.stack.push(item);
      s.priority.passes = 0;
      changed = true;
      const all = Object.values(item.targets).flat();
      if (all.length) rulesEvent(s, { e: "targeted", stackId: item.id, controller: item.controller, targets: all });
      checkCrime(s, item.controller, all);
      emit({
        type: "trigger",
        player: t.controller,
        stackId: item.id,
        defId: t.sourceDefId,
        targets: specs.flatMap((spec) => t.targets[spec.id] ?? []),
      });
    }
  }
  return changed;
}

/** Capacité modale : le contrôleur choisit le mode (603.3c). Renvoie false si une question a été posée. */
function chooseTriggerMode(s: GameState, t: PendingTrigger): boolean {
  if (t.inline || t.mode !== undefined) return true;
  const modes = triggeredAbility(s, t)?.modes;
  if (!modes) return true;
  // Seuls les modes dont les cibles requises existent sont proposés (et, pour Demonic Pact, pas encore choisis).
  const ab = triggeredAbility(s, t);
  const o = s.objects[t.sourceId];
  const used = !ab?.uniqueModes
    ? []
    : ab.uniqueModes === "turn"
      ? o?.usedModesTurn === s.turn.number
        ? (o?.usedModes ?? [])
        : []
      : (o?.usedModes ?? []);
  const possible = modes
    .map((m, i) => ({ m, i }))
    .filter(({ i }) => !used.includes(i))
    .filter(({ m }) => m.targets.every((spec) => spec.optional || legalTargets(s, t.controller, spec).length > 0));
  if (possible.length <= 1) {
    t.mode = possible[0]?.i ?? modes.findIndex((_, i) => !used.includes(i));
    markModeUsed(s, t);
    return true;
  }
  ask(
    s,
    t.controller,
    {
      type: "pick",
      intent: "triggerMode",
      prompt: `${triggerLabel(s, t)} : choisissez un mode`,
      options: possible.map(({ i }) => String(i)),
      labels: Object.fromEntries(possible.map(({ m, i }) => [String(i), m.label ?? `Mode ${i + 1}`])),
      min: 1,
      max: 1,
      suggested: [String(possible[0]?.i ?? 0)],
    },
    { kind: "triggerMode", trigger: t.id },
  );
  return false;
}

/** Choisit les cibles d'un déclenchement ; renvoie false si une question a été posée. */
function chooseTriggerTargets(s: GameState, t: PendingTrigger): boolean {
  for (const spec of triggerTargetSpecs(s, t)) {
    if (t.targets[spec.id] !== undefined) continue;
    const taken = new Set((spec.otherThan ?? []).flatMap((o) => t.targets[o] ?? []));
    const legal = legalTargets(s, t.controller, spec, t.sourceId).filter((id) => !taken.has(id));
    const count = spec.count ?? 1;
    // « une à trois cibles » (`target.between`) : au moins `minCount` (Armament Dragon, Glint Weaver).
    const min = spec.optional ? 0 : (spec.minCount ?? count);
    if (legal.length === 0 || legal.length < min) {
      t.targets[spec.id] = [];
      continue;
    }
    if (legal.length === count && min === count && !spec.samePlayer && !spec.differentPlayers) {
      t.targets[spec.id] = legal;
      continue;
    }
    const first = suggestTarget(s, t.controller, legal);
    let group: { kind: "same" | "different"; holders: Record<string, string> } | undefined;
    if (spec.samePlayer || spec.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      group = { kind: spec.samePlayer ? "same" : "different", holders };
    }
    const suggested: string[] = [];
    // Phoenix, Warden of Fire : « d'une valeur de mana totale de 6 ou moins ».
    const mv = (id: string) => (s.objects[id] ? (snapshot(s, id).manaValue ?? 0) : 0);
    let total = 0;
    for (const id of [first, ...legal.filter((x) => x !== first)]) {
      if (suggested.length >= count) break;
      if (spec.maxTotalManaValue !== undefined && total + mv(id) > spec.maxTotalManaValue) continue;
      total += mv(id);
      if (group?.kind === "same" && suggested.length && group.holders[suggested[0] as string] !== group.holders[id]) continue;
      if (group?.kind === "different" && suggested.some((x) => group?.holders[x] === group?.holders[id])) continue;
      suggested.push(id);
    }
    ask(
      s,
      t.controller,
      {
        type: "pick",
        intent: "triggerTarget",
        prompt: `${triggerLabel(s, t)} : choisissez ${count > 1 ? `jusqu'à ${count} cibles — ` : ""}${spec.label ?? "une cible"}`,
        options: legal,
        min: Math.min(min, legal.length),
        max: count,
        suggested,
        group,
      },
      { kind: "triggerTarget", trigger: t.id, spec: spec.id },
    );
    return false;
  }
  return true;
}

/** Cible proposée par défaut : la meilleure créature adverse, sinon un adversaire, sinon la première option. */
function suggestTarget(s: GameState, controller: PlayerId, legal: string[]): string {
  const opps = new Set(opponentsOf(s, controller));
  const theirs = legal
    .filter((id) => onBattlefield(s, id) && opps.has(obj(s, id).controller))
    .sort((a, b) => chars(s, b).power - chars(s, a).power);
  return theirs[0] ?? legal.find((id) => opps.has(id)) ?? (legal[0] as string);
}

export function answerTriggerOrder(s: GameState, player: PlayerId, order: string[]): void {
  const mine = new Map(s.triggers.filter((t) => t.controller === player).map((t) => [t.id, t]));
  const others = s.triggers.filter((t) => t.controller !== player);
  const ordered = order.map((id) => mine.get(id)).filter((t): t is PendingTrigger => !!t);
  for (const t of ordered) t.ordered = true;
  s.triggers = [...others, ...ordered];
}

export function answerTriggerTarget(s: GameState, triggerId: string, specId: string, values: string[]): void {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) throw new RulesError("Capacité déclenchée introuvable");
  const spec = triggerTargetSpecs(s, t).find((x) => x.id === specId);
  if (!spec) throw new RulesError("Cible inconnue");
  try {
    t.targets[specId] =
      validateTargets(
        s,
        t.controller,
        [{ ...spec, optional: true }],
        { ...t.targets, [specId]: values },
        { sourceId: t.sourceId },
      )[specId] ?? [];
  } catch (e) {
    rethrowAsRules(e);
  }
}

export function answerTriggerMode(s: GameState, triggerId: string, mode: number): void {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) throw new RulesError("Capacité déclenchée introuvable");
  t.mode = mode;
  markModeUsed(s, t);
}

/** « Choisissez un mode qui n'a pas déjà été choisi » : on retient le mode sur la source. */
function markModeUsed(s: GameState, t: PendingTrigger): void {
  if (t.mode === undefined || t.mode < 0 || !triggeredAbility(s, t)?.uniqueModes) return;
  const o = s.objects[t.sourceId];
  if (!o) return;
  // « … ce tour-ci » : la liste repart de zéro à chaque tour.
  if (triggeredAbility(s, t)?.uniqueModes === "turn" && o.usedModesTurn !== s.turn.number) {
    o.usedModes = [];
    o.usedModesTurn = s.turn.number;
  }
  o.usedModes = [...(o.usedModes ?? []), t.mode];
}

/**
 * 700.13 : commettre un crime — cibler un adversaire, un objet qu'il contrôle (permanent, sort, capacité)
 * ou une carte de son cimetière.
 */
export function checkCrime(s: GameState, player: PlayerId, targets: string[]): void {
  const opponent = (p: PlayerId | undefined) => !!p && p !== player && !!s.players[p];
  const crime = targets.some((id) => {
    if (s.players[id]) return opponent(id);
    const o = s.objects[id];
    if (o?.zone === "battlefield") return opponent(o.controller);
    if (o?.zone === "graveyard") return opponent(o.owner);
    const item = s.stack.find((x) => x.id === id);
    return opponent(item?.controller);
  });
  if (!crime) return;
  const stats = s.players[player]?.turnStats;
  if (stats) stats.crimes = (stats.crimes ?? 0) + 1;
  s.version += 1; // conditions « si vous avez commis un crime ce tour-ci »
  rulesEvent(s, { e: "crime", player });
}
