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
import { checkCondition } from "./triggers";
import type { Amount, GameObject, GameState, ObjectId, Zone } from "./types";

/** Contexte d'arrivée sur le champ de bataille (valeur de X, kicker du sort qui arrive). */
export interface EntersContext {
  x?: number;
  kicked?: boolean;
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
  for (const ab of s.defs[o.defId]?.abilities ?? []) {
    if (ab.kind !== "replacement") continue;
    if (ab.condition) {
      const ok = ab.condition.kind === "kicked" ? !!ctx.kicked : checkCondition(s, ab.condition, o.controller, o.id);
      if (!ok) continue;
    }
    if (ab.entersTapped) o.tapped = true;
    if (ab.entersWithCounters !== undefined) o.counters.p1p1 += amountAtEntry(s, ab.entersWithCounters, o, ctx);
  }
}

/** 615 : ces blessures de combat sont-elles prévenues ? */
export function preventsCombatDamage(s: GameState, target: string): boolean {
  return s.replacements.some((r) => r.kind === "preventCombatDamage" && r.objects.includes(target));
}

export function addReplacement(s: GameState, kind: "exileIfDies" | "preventCombatDamage", objects: ObjectId[], id: string): void {
  if (objects.length) s.replacements.push({ id, kind, objects });
}
