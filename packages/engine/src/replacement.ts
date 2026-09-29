/**
 * Effets de remplacement et de prévention (614–615).
 *
 * - Portés par une carte : « arrive engagé », « arrive avec N marqueurs » (appliqués pendant le
 *   changement de zone, avant que les capacités déclenchées ne voient l'objet arriver).
 * - Créés par une résolution, jusqu'à la fin du tour : « si elle devait mourir, exilez-la à la place »,
 *   prévention des blessures de combat.
 * - « Au lieu du cimetière » (614.1a) : `replaceGraveyard`, qui applique l'ordre de 616.1 (auto-remplacement
 *   d'abord, puis un seul remplacement choisi pour le joueur affecté).
 * Limite : pour les autres événements (blessures, pioche, PV), plusieurs remplacements s'appliquent dans l'ordre du code.
 */

import { gainLife } from "./actions";
import { boardAmount } from "./effects";
import { changeCounters, chars, moveObject, newId, nextTimestamp, P1P1, setPrepared } from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { matchesCard, matchesObjectFilter, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type { Amount, Color, GameObject, GameState, ObjectId, PlayerId, Zone } from "./types";

/** Contexte d'arrivée sur le champ de bataille (valeur de X, kicker du sort qui arrive). */
export interface EntersContext {
  x?: number;
  kicked?: boolean;
  /** Arrive depuis la résolution d'un sort (« si vous l'avez lancé »). */
  cast?: boolean;
  /** Aura : l'objet auquel elle arrive attachée. */
  attachTo?: string;
  /** Lancé depuis la main (Myojin). */
  castFromHand?: boolean;
  castFromGraveyard?: boolean;
  /** Choix fait pendant la résolution (« en arrivant, choisissez… »). */
  chosen?: GameObject["chosen"];
  /** Terrain choc : les points de vie ont été payés (sinon il arrive engagé). */
  shockPaid?: boolean;
  /** Mana dépensé pour le lancer (Dyadrine). */
  manaSpent?: number;
  /** Dévorer : nombre de permanents sacrifiés en arrivant. */
  devoured?: number;
  /** Waxen Shapethief : définition copiée en arrivant (couche 1). */
  copyOf?: string;
  /** Mana dépensé par type et évocation : lus par les conditions des capacités d'arrivée (Deceit). */
  spentColors?: GameObject["spentColors"];
  evoked?: boolean;
}

/**
 * Montant évalué à l'arrivée, du point de vue de `o` (la source du remplacement).
 * `entering` : l'objet qui arrive, exclu des comptes (« pour chaque Ange que vous contrôlez déjà »).
 */
function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext, entering?: GameObject): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
  if (a.kind === "manaSpent") return ctx.manaSpent ?? 0;
  // Bioengineered Future : terrains arrivés ce tour-ci sous le contrôle de la source.
  if (a.kind === "turnEvents") return countTurnEvents(s, a.query, o.controller);
  if (a.kind === "maxPower") {
    // « la plus grande force parmi les autres créatures que vous contrôlez » (Prime Speaker Zegana)
    const f = withChosen(a.filter, o);
    return Math.max(
      0,
      ...s.battlefield
        .filter((id) => id !== (entering ?? o).id && matchesObjectFilter(s, o.controller, id, f, o.id))
        .map((id) => chars(s, id).power),
    );
  }
  if (a.kind === "count" || a.kind === "totalPower") {
    const f = withChosen(a.filter, o);
    const n = boardAmount(s, { ...a, filter: f }, o.controller, o.id);
    return entering && matchesObjectFilter(s, o.controller, entering.id, f, o.id) ? n - 1 : n;
  }
  return 0;
}

/** Choix par défaut quand un permanent « à choix » arrive sans résolution : le type ou la couleur les plus présents. */
function defaultChoice(
  s: GameState,
  o: GameObject,
  kind: "creatureType" | "color" | "cardName" | "landName",
): NonNullable<GameObject["chosen"]> {
  // Petrified Hamlet : le nom est choisi par sa capacité déclenchée d'arrivée ; rien avant sa résolution.
  if (kind === "landName") return { cardName: "—" };
  if (kind === "cardName") {
    // Nom le plus présent chez les adversaires (un terrain pour Petrified Hamlet).
    const names = s.battlefield
      .filter((id) => s.objects[id]?.controller !== o.controller)
      .map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? "");
    return { cardName: names[0] ?? "—" };
  }
  const tally = new Map<string, number>();
  const pl = s.players[o.controller];
  const ids = [
    ...s.battlefield.filter((id) => s.objects[id]?.controller === o.controller),
    ...(pl?.hand ?? []),
    ...(pl?.library ?? []),
  ];
  for (const id of ids) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (!d) continue;
    const keys = kind === "color" ? d.colors : d.types.includes("Creature") ? d.subtypes : [];
    for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return kind === "color" ? { color: (best as Color | undefined) ?? "W" } : { creatureType: best ?? "Human" };
}

/** Un remplacement « exilez-le à la place » qui s'applique à un objet sur le point d'aller au cimetière. */
interface GraveyardCandidate {
  /** Contrôleur du remplacement (source, créateur de l'effet) ; absent pour une règle (marqueur de finalité). */
  controller?: PlayerId;
  sourceId?: ObjectId;
  link?: "object" | "uid";
  gainLife?: number;
  timestamp: number;
}

/** Destination après les remplacements « au lieu du cimetière » (614.1a, 616.1). */
export interface GraveyardOutcome {
  to: Zone;
  /** Progenitus : mélanger la bibliothèque après le déplacement. */
  shuffle?: boolean;
  /** Source à laquelle lier le nouvel objet (Valgavoth). */
  linkTo?: ObjectId;
}

function graveyardCandidates(s: GameState, o: GameObject): GraveyardCandidate[] {
  const out: GraveyardCandidate[] = [];
  const fromBattlefield = o.zone === "battlefield";
  // Effets créés par une résolution : « si elle devait mourir ce tour-ci, exilez-la à la place » (Lava Coil).
  if (fromBattlefield) {
    for (const r of s.replacements) if (r.kind === "exileIfDies" && r.objects.includes(o.id)) out.push({ timestamp: 0 });
    // 122.1h : marqueur de finalité.
    if ((o.counters.finality ?? 0) > 0) out.push({ timestamp: 0 });
  }
  // Capacités des permanents et emblèmes de chaque joueur.
  const graveyardOwner = o.owner;
  for (const p of s.playerOrder) {
    for (const { id, ab } of controlledAbilitiesWithSource(s, p)) {
      if (ab.kind !== "graveyardReplacement") continue;
      if (ab.fromBattlefield && !fromBattlefield) continue;
      if (ab.graveyardOf === "you" && graveyardOwner !== p) continue;
      if (ab.graveyardOf === "opponent" && graveyardOwner === p) continue;
      if (ab.notControlledByYou && o.controller === p) continue;
      if (ab.condition && !checkCondition(s, ab.condition, p, id)) continue;
      if (ab.filter) {
        const ok = fromBattlefield ? matchesObjectFilter(s, p, o.id, ab.filter, id) : matchesCard(s, p, o.id, ab.filter, id);
        if (!ok) continue;
      }
      out.push({ controller: p, sourceId: id, link: ab.link, gainLife: ab.gainLife, timestamp: s.objects[id]?.timestamp ?? 0 });
    }
  }
  return out;
}

/**
 * 614.1a / 616.1 : l'objet `o` devrait aller au cimetière. On applique d'abord son propre remplacement (616.1a :
 * Progenitus est mélangé dans la bibliothèque) ; sinon, parmi les « exilez-le à la place », le joueur affecté (le
 * contrôleur de l'objet, ou son propriétaire hors du champ de bataille) en choisit un (616.1e). Approximation (choix
 * auto) : il écarte d'abord ceux qui profitent à un adversaire (PV gagnés, carte liée), puis prend le plus ancien. Une
 * fois l'objet exilé, les autres ne s'appliquent plus (616.1f).
 */
export function replaceGraveyard(s: GameState, o: GameObject): GraveyardOutcome {
  if (!o.isToken && s.defs[o.defId]?.shuffleIntoLibrary) return { to: "library", shuffle: true };
  const candidates = graveyardCandidates(s, o);
  if (candidates.length === 0) return { to: "graveyard" };
  const chooser = o.zone === "battlefield" ? o.controller : o.owner;
  const helpsOpponent = (c: GraveyardCandidate) =>
    c.controller && c.controller !== chooser && (!!c.gainLife || !!c.link) ? 1 : 0;
  const chosen = [...candidates].sort((a, b) => helpsOpponent(a) - helpsOpponent(b) || a.timestamp - b.timestamp)[0];
  if (!chosen) return { to: "graveyard" };
  if (chosen.link === "uid" && chosen.sourceId) {
    const src = s.objects[chosen.sourceId];
    if (src) src.linkedUids = [...(src.linkedUids ?? []), o.uid];
  }
  if (chosen.gainLife && chosen.controller) gainLife(s, chosen.controller, chosen.gainLife);
  return { to: "exile", linkTo: chosen.link === "object" ? chosen.sourceId : undefined };
}

/** 614.1c–d : effets qui modifient la façon dont un permanent arrive sur le champ de bataille. */
export function applyEntersReplacements(s: GameState, o: GameObject, ctx: EntersContext): void {
  if (ctx.kicked) o.kicked = true;
  if (ctx.cast) o.cast = true;
  if (ctx.castFromHand) o.castFromHand = true;
  if (ctx.castFromGraveyard) o.castFromGraveyard = true;
  // Mana dépensé, connu dès l'arrivée (« si aucun mana n'a été dépensé pour la lancer »).
  if (ctx.manaSpent !== undefined) o.manaSpent = ctx.manaSpent;
  if (ctx.spentColors) o.spentColors = ctx.spentColors;
  if (ctx.evoked) o.evoked = true;
  if (ctx.attachTo) o.attachedTo = ctx.attachTo;
  // 614.12 : « en arrivant, choisissez… » (le choix vient de la résolution, sinon choix par défaut).
  const choose = s.defs[o.defId]?.chooseOnEnter;
  if (choose) o.chosen = ctx.chosen ?? defaultChoice(s, o, choose);
  // 707.9 : « arrive comme copie de … » (Waxen Shapethief).
  if (ctx.copyOf) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "permanent",
      copyOf: ctx.copyOf,
      // Visage Bandit : « sauf que c'est un Métamorphe Voleur en plus de ses autres types ».
      addSubtypes: s.defs[o.defId]?.entersAsCopyAddSubtypes,
      // Mockingbird : « … et elle a le vol ».
      addKeywords: s.defs[o.defId]?.entersAsCopyAddKeywords,
      // Superior Spider-Man : « sauf que son nom est … et que c'est un 4/4 ».
      ...(s.defs[o.defId]?.entersAsCopyOfGraveyard?.name ? { setName: s.defs[o.defId]?.entersAsCopyOfGraveyard?.name } : {}),
      ...(s.defs[o.defId]?.entersAsCopyOfGraveyard?.power !== undefined
        ? {
            setPower: s.defs[o.defId]?.entersAsCopyOfGraveyard?.power,
            setToughness: s.defs[o.defId]?.entersAsCopyOfGraveyard?.toughness,
          }
        : {}),
    });
    s.version += 1; // cache des couches
  }
  // 702.82 : dévorer N (les permanents ont été sacrifiés pendant la résolution).
  const devour = s.defs[o.defId]?.devour;
  if (devour && ctx.devoured) changeCounters(s, o, P1P1, devour.n * ctx.devoured);
  // Terrain choc : engagé, sauf si les points de vie ont été payés en le jouant (mis en jeu par un effet : engagé).
  if (s.defs[o.defId]?.shockLand && !ctx.shockPaid) o.tapped = true;
  // 714.3a : une Saga arrive avec un marqueur de savoir.
  if (s.defs[o.faceDefId ?? o.defId]?.saga) changeCounters(s, o, "lore", 1);
  // 306.5b : un planeswalker arrive avec sa loyauté imprimée.
  const loyalty = s.defs[o.defId]?.loyalty;
  if (loyalty) changeCounters(s, o, "loyalty", loyalty);
  // Remplacements portés par d'autres permanents (« les créatures de vos adversaires arrivent engagées »).
  for (const id of s.battlefield) {
    const src = s.objects[id];
    if (!src || id === o.id) continue;
    // Capacités calculées : porte déverrouillée d'une Salle, verso, copie.
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "replacement" || !ab.affects) continue;
      if (!matchesObjectFilter(s, src.controller, o.id, ab.affects, id)) continue;
      if (ab.entersTapped) o.tapped = true;
      if (ab.entersWithCounters !== undefined) {
        changeCounters(s, o, ab.counterKind ?? P1P1, amountAtEntry(s, ab.entersWithCounters, src, ctx, o));
      }
    }
  }
  for (const ab of s.defs[o.defId]?.abilities ?? []) {
    if (ab.kind !== "replacement" || ab.affects) continue;
    if (ab.condition) {
      const ok = ab.condition.kind === "kicked" ? !!ctx.kicked : checkCondition(s, ab.condition, o.controller, o.id);
      if (!ok) continue;
    }
    if (ab.entersTapped) o.tapped = true;
    if (ab.entersPrepared) setPrepared(s, o, true);
    if (ab.entersWithCounters !== undefined)
      changeCounters(s, o, ab.counterKind ?? P1P1, amountAtEntry(s, ab.entersWithCounters, o, ctx));
  }
  // The Wandering Minstrel : « les terrains que vous contrôlez arrivent dégagés ».
  if (o.tapped && s.defs[o.defId]?.types.includes("Land") && playerStatic(s, o.controller, "landsEnterUntapped"))
    o.tapped = false;
  // « Arrive engagé » : des statiques en dépendent (« vos autres créatures engagées ont la défense talismanique »).
  s.version += 1;
}

/** 610.3 : la source d'un exil « jusqu'à ce que » quitte le champ de bataille : les cartes reviennent. */
export function releaseLinkedExile(s: GameState, sourceId: ObjectId): void {
  const links = s.linkedExile.filter((l) => l.sourceId === sourceId);
  if (links.length === 0) return;
  s.linkedExile = s.linkedExile.filter((l) => l.sourceId !== sourceId);
  for (const l of links) {
    for (const id of l.cards) {
      const o = s.objects[id];
      if (o?.zone === "exile") moveObject(s, id, l.toHand ? "hand" : "battlefield", { controller: o.owner });
    }
  }
}

/** 615 : ces blessures de combat sont-elles prévenues ? */
export function preventsCombatDamage(s: GameState, target: string): boolean {
  return s.replacements.some((r) => r.kind === "preventCombatDamage" && r.objects.includes(target));
}

export function addReplacement(s: GameState, kind: "exileIfDies" | "preventCombatDamage", objects: ObjectId[], id: string): void {
  if (objects.length) s.replacements.push({ id, kind, objects });
}
