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
import { changeCounters, moveObject, P1P1 } from "./state";
import { matchesObjectFilter } from "./targets";
import { checkCondition } from "./triggers";
import type { Amount, GameObject, GameState, ObjectId, Zone } from "./types";

/** Contexte d'arrivée sur le champ de bataille (valeur de X, kicker du sort qui arrive). */
export interface EntersContext {
  x?: number;
  kicked?: boolean;
  /** Arrive depuis la résolution d'un sort (« si vous l'avez lancé »). */
  cast?: boolean;
}

function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
  if (a.kind === "count" || a.kind === "totalPower") return boardAmount(s, a, o.controller, o.id);
  return 0;
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
  // Remplacements portés par d'autres permanents (« les créatures de vos adversaires arrivent engagées »).
  for (const id of s.battlefield) {
    const src = s.objects[id];
    if (!src || id === o.id) continue;
    for (const ab of s.defs[src.defId]?.abilities ?? []) {
      if (ab.kind !== "replacement" || !ab.affects) continue;
      if (!matchesObjectFilter(s, src.controller, o.id, ab.affects, id)) continue;
      if (ab.entersTapped) o.tapped = true;
      if (ab.entersWithCounters !== undefined) changeCounters(s, o, P1P1, amountAtEntry(s, ab.entersWithCounters, src, ctx));
    }
  }
  for (const ab of s.defs[o.defId]?.abilities ?? []) {
    if (ab.kind !== "replacement" || ab.affects) continue;
    if (ab.condition) {
      const ok = ab.condition.kind === "kicked" ? !!ctx.kicked : checkCondition(s, ab.condition, o.controller, o.id);
      if (!ok) continue;
    }
    if (ab.entersTapped) o.tapped = true;
    if (ab.entersWithCounters !== undefined) changeCounters(s, o, P1P1, amountAtEntry(s, ab.entersWithCounters, o, ctx));
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
