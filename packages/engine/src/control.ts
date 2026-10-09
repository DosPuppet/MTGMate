/**
 * Layer 2 (613.1b): control of permanents. Each permanent has a base controller (`baseController`, set when it
 * enters); control effects (`ContinuousEffect.controller`: steal "until end of turn", donate, exchange, "for as long as
 * you control") and the Auras that grant control (Confiscate, Eriette) apply to it in timestamp order (613.7).
 * `syncControl` recomputes the controller of each permanent and changes it if needed: when an effect ends, the
 * permanent goes back to whoever would control it without it, even if other effects ended in the meantime.
 *
 * `o.controller` remains the stored value that the whole engine reads; it is up to date only after `syncControl`,
 * called at the end of each control operation, in state-based actions, after cleanup and when a player leaves the game
 * (800.4a).
 */
import { removeFromCombat } from "./actions";
import { bump, newId, nextTimestamp, setController } from "./state";
import type { ContinuousEffect, GameState, ObjectId, PlayerId } from "./types";

/** Adds a control effect and applies it at once. */
export function addControlEffect(
  s: GameState,
  ids: ObjectId[],
  to: PlayerId,
  duration: ContinuousEffect["duration"],
  extra: Pick<ContinuousEffect, "whileSource" | "whileControlledBy" | "whileAttached" | "until" | "sinceTurn"> = {},
): void {
  if (ids.length === 0) return;
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: [...ids], duration, controller: to, ...extra });
  bump(s);
  syncControl(s);
}

/** A player who has left the game no longer controls anything through an effect (800.4a). */
const inGame = (s: GameState, p: PlayerId | undefined) => !!p && !!s.players[p] && !s.players[p]?.lost;

/**
 * Recomputes the controller of each permanent (layer 2). Returns true if a controller changed. Idempotent: a second
 * call changes nothing (fuzz invariant).
 */
export function syncControl(s: GameState): boolean {
  let changed = false;
  // The controller of an Aura that grants control can itself depend on an effect: a few passes at most.
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

/** Controllers imposed on each permanent, with their timestamp. Removes the "for as long as" effects that have ended. */
function controlClaims(s: GameState): Map<ObjectId, { ts: number; to: PlayerId }[]> {
  const claims = new Map<ObjectId, { ts: number; to: PlayerId }[]>();
  const claim = (id: ObjectId, ts: number, to: PlayerId) => {
    const list = claims.get(id);
    if (list) list.push({ ts, to });
    else claims.set(id, [{ ts, to }]);
  };
  // Possession Engine: "for as long as you control [the source]"; the effect ends for good (611.2b).
  // Eriette: "for as long as that Aura is attached to it".
  const ended = s.effects.filter(
    (e) =>
      (e.whileControlledBy && e.whileSource && s.objects[e.whileSource]?.controller !== e.whileControlledBy) ||
      (e.whileAttached &&
        (s.objects[e.whileAttached]?.zone !== "battlefield" ||
          !e.affected.includes(s.objects[e.whileAttached]?.attachedTo ?? ""))),
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
    // Confiscate: "you control enchanted permanent".
    if (d?.controlsEnchanted) claim(host.id, aura.timestamp, aura.controller);
  }
  return claims;
}
