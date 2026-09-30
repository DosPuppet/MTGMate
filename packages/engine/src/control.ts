/**
 * Couche 2 (613.1b) : le contrôle des permanents. Chaque permanent a un contrôleur de base (`baseController`, fixé à
 * son arrivée) ; les effets de contrôle (`ContinuousEffect.controller` : vol « jusqu'à la fin du tour », don, échange,
 * « tant que vous contrôlez ») et les Auras qui donnent le contrôle (Confiscate, Eriette) s'y appliquent par ordre
 * d'horodatage (613.7). `syncControl` recalcule le contrôleur de chaque permanent et le change si besoin : quand un
 * effet prend fin, le permanent revient à qui le contrôlerait sans lui, même si d'autres effets ont pris fin entre-temps.
 *
 * `o.controller` reste la valeur stockée que lit tout le moteur ; elle n'est à jour qu'après `syncControl`, appelé à la
 * fin de chaque opération de contrôle, dans les actions basées sur l'état, après le nettoyage et quand un joueur quitte
 * la partie (800.4a).
 */
import { removeFromCombat } from "./actions";
import { chars } from "./layers";
import { manaValue } from "./mana";
import { bump, newId, nextTimestamp, setController } from "./state";
import { playerStatic } from "./statics";
import type { ContinuousEffect, GameState, ObjectId, PlayerId } from "./types";

/** Ajoute un effet de contrôle et l'applique aussitôt. */
export function addControlEffect(
  s: GameState,
  ids: ObjectId[],
  to: PlayerId,
  duration: ContinuousEffect["duration"],
  extra: Pick<ContinuousEffect, "whileSource" | "whileControlledBy"> = {},
): void {
  if (ids.length === 0) return;
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: [...ids], duration, controller: to, ...extra });
  bump(s);
  syncControl(s);
}

/** Un joueur qui a quitté la partie ne contrôle plus rien par un effet (800.4a). */
const inGame = (s: GameState, p: PlayerId | undefined) => !!p && !!s.players[p] && !s.players[p]?.lost;

/**
 * Recalcule le contrôleur de chaque permanent (couche 2). Renvoie true si un contrôleur a changé. Idempotent : un
 * second appel ne change rien (invariant du fuzz).
 */
export function syncControl(s: GameState): boolean {
  let changed = false;
  // Le contrôleur d'une Aura qui donne le contrôle peut lui-même dépendre d'un effet : quelques passes au plus.
  for (let pass = 0; pass < 4; pass++) {
    const claims = controlClaims(s);
    let moved = false;
    for (const id of s.battlefield) {
      const o = s.objects[id];
      if (!o) continue;
      const base = o.baseController ?? o.controller;
      const list = claims.get(id);
      let to = base;
      if (list) {
        list.sort((a, b) => a.ts - b.ts);
        to = (list[list.length - 1] as { to: PlayerId }).to;
      }
      if (to === o.controller) continue;
      removeFromCombat(s, id);
      setController(s, o, to);
      moved = true;
    }
    if (!moved) break;
    changed = true;
    bump(s);
  }
  return changed;
}

/** Contrôleurs imposés à chaque permanent, avec leur horodatage. Retire les effets « tant que » qui ont pris fin. */
function controlClaims(s: GameState): Map<ObjectId, { ts: number; to: PlayerId }[]> {
  const claims = new Map<ObjectId, { ts: number; to: PlayerId }[]>();
  const claim = (id: ObjectId, ts: number, to: PlayerId) => {
    const list = claims.get(id);
    if (list) list.push({ ts, to });
    else claims.set(id, [{ ts, to }]);
  };
  // Possession Engine : « tant que vous contrôlez [la source] » ; l'effet cesse pour de bon (611.2b).
  const ended = s.effects.filter(
    (e) => e.whileControlledBy && e.whileSource && s.objects[e.whileSource]?.controller !== e.whileControlledBy,
  );
  if (ended.length) {
    s.effects = s.effects.filter((e) => !ended.includes(e));
    bump(s);
  }
  for (const e of s.effects) {
    if (!e.controller || !inGame(s, e.controller)) continue;
    for (const id of e.affected) claim(id, e.timestamp, e.controller);
  }
  for (const id of s.battlefield) {
    const aura = s.objects[id];
    const host = aura?.attachedTo ? s.objects[aura.attachedTo] : undefined;
    if (!aura || host?.zone !== "battlefield" || !inGame(s, aura.controller)) continue;
    const d = s.defs[aura.defId];
    // Confiscate : « vous contrôlez le permanent enchanté ».
    // Eriette, the Beguiler : une Aura attachée à un permanent non-terrain de valeur de mana inférieure ou égale (sur un
    // permanent que son contrôleur contrôle déjà, sans effet).
    const steals =
      !!d?.subtypes.includes("Aura") &&
      !chars(s, host.id).types.includes("Land") &&
      manaValue(s.defs[host.defId]?.manaCost) <= manaValue(d?.manaCost) &&
      playerStatic(s, aura.controller, "auraStealsCheaper");
    if (d?.controlsEnchanted || steals) claim(host.id, aura.timestamp, aura.controller);
  }
  return claims;
}
