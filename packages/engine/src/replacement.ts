/**
 * Effets de remplacement et de prévention (614–615).
 *
 * - Portés par une carte : « arrive engagé », « arrive avec N marqueurs » (appliqués pendant le
 *   changement de zone, avant que les capacités déclenchées ne voient l'objet arriver).
 * - Créés par une résolution, jusqu'à la fin du tour : « si elle devait mourir, exilez-la à la place »,
 *   prévention des blessures de combat.
 * Limite actuelle : si plusieurs remplacements s'appliquent au même événement, le premier l'emporte
 * (le choix du joueur affecté, 616.1, viendra avec des cartes qui en ont besoin).
 */
import { boardAmount } from "./effects";
import { changeCounters, chars, moveObject, P1P1, setPrepared } from "./state";
import { matchesObjectFilter, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import type { Amount, Color, GameObject, GameState, ObjectId, Zone } from "./types";

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
  /** Choix fait pendant la résolution (« en arrivant, choisissez… »). */
  chosen?: GameObject["chosen"];
}

/**
 * Montant évalué à l'arrivée, du point de vue de `o` (la source du remplacement).
 * `entering` : l'objet qui arrive, exclu des comptes (« pour chaque Ange que vous contrôlez déjà »).
 */
function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext, entering?: GameObject): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
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
  kind: "creatureType" | "color" | "cardName",
): NonNullable<GameObject["chosen"]> {
  if (kind === "cardName") {
    // Nom le plus présent chez les adversaires.
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

/** 614.1 : la destination d'un changement de zone peut être remplacée (« exilez-la à la place »). */
export function replaceDestination(s: GameState, o: GameObject, to: Zone): Zone {
  if (o.zone === "battlefield" && to === "graveyard") {
    if (s.replacements.some((r) => r.kind === "exileIfDies" && r.objects.includes(o.id))) return "exile";
  }
  return to;
}

/** 614.1c–d : effets qui modifient la façon dont un permanent arrive sur le champ de bataille. */
export function applyEntersReplacements(s: GameState, o: GameObject, ctx: EntersContext): void {
  if (ctx.kicked) o.kicked = true;
  if (ctx.cast) o.cast = true;
  if (ctx.castFromHand) o.castFromHand = true;
  if (ctx.attachTo) o.attachedTo = ctx.attachTo;
  // 614.12 : « en arrivant, choisissez… » (le choix vient de la résolution, sinon choix par défaut).
  const choose = s.defs[o.defId]?.chooseOnEnter;
  if (choose) o.chosen = ctx.chosen ?? defaultChoice(s, o, choose);
  // 306.5b : un planeswalker arrive avec sa loyauté imprimée.
  const loyalty = s.defs[o.defId]?.loyalty;
  if (loyalty) changeCounters(s, o, "loyalty", loyalty);
  // Remplacements portés par d'autres permanents (« les créatures de vos adversaires arrivent engagées »).
  for (const id of s.battlefield) {
    const src = s.objects[id];
    if (!src || id === o.id) continue;
    for (const ab of s.defs[src.defId]?.abilities ?? []) {
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
}

/** 610.3 : la source d'un exil « jusqu'à ce que » quitte le champ de bataille : les cartes reviennent. */
export function releaseLinkedExile(s: GameState, sourceId: ObjectId): void {
  const links = s.linkedExile.filter((l) => l.sourceId === sourceId);
  if (links.length === 0) return;
  s.linkedExile = s.linkedExile.filter((l) => l.sourceId !== sourceId);
  for (const l of links) {
    for (const id of l.cards) {
      const o = s.objects[id];
      if (o?.zone === "exile") moveObject(s, id, "battlefield", { controller: o.owner });
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
