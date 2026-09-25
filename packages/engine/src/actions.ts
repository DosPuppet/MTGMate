/**
 * Actions de jeu élémentaires, partagées par les effets, le combat et les actions basées sur l'état.
 */

import { preventsCombatDamage } from "./replacement";
import {
  bump,
  chars,
  createObject,
  emit,
  hasKeyword,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  obj,
  rulesEvent,
} from "./state";
import type { CardDef, GameState, Keyword, ObjectId, PlayerId, TokenSpec } from "./types";

export interface DamageSource {
  /** Objet source, s'il est identifiable (pour les déclencheurs « inflige des blessures »). */
  id?: ObjectId;
  defId: string;
  controller: PlayerId;
  keywords: Keyword[];
}

export function drawCard(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  const top = player.library[0];
  if (!top) {
    player.drewFromEmptyLibrary = true;
    emit({ type: "draw", player: p });
    return;
  }
  const id = moveObject(s, top, "hand");
  emit({ type: "draw", player: p, objectId: id ?? undefined, defId: s.objects[id ?? ""]?.defId });
}

export function gainLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  player.life += amount;
  emit({ type: "life", player: p, delta: amount, life: player.life });
  rulesEvent(s, { e: "lifeGain", player: p, amount });
}

export function loseLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  player.life -= amount;
  emit({ type: "life", player: p, delta: -amount, life: player.life });
}

/** Inflige des blessures à un joueur ou à une créature (règle 120). */
export function dealDamage(s: GameState, source: DamageSource, target: string, amount: number, combat: boolean): void {
  if (amount <= 0) return;
  if (combat && preventsCombatDamage(s, target)) return;
  if (isPlayer(s, target)) {
    emit({ type: "damage", sourceDefId: source.defId, target, amount, combat });
    loseLife(s, target, amount);
  } else {
    const o = s.objects[target];
    if (o?.zone !== "battlefield" || !isCreature(s, target)) return;
    o.damage += amount;
    if (source.keywords.includes("deathtouch")) o.deathtouched = true;
    emit({ type: "damage", sourceDefId: source.defId, target, targetDefId: o.defId, amount, combat });
  }
  if (source.keywords.includes("lifelink")) gainLife(s, source.controller, amount);
  rulesEvent(s, { e: "damage", sourceId: source.id ?? null, target, amount, combat });
}

export function sourceFromObject(s: GameState, id: ObjectId): DamageSource {
  const o = obj(s, id);
  return { id, defId: o.defId, controller: o.controller, keywords: chars(s, id).keywords };
}

/** Détruit un permanent (sauf indestructible). Renvoie true s'il a quitté le champ de bataille. */
export function destroy(s: GameState, id: ObjectId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  if (hasKeyword(s, id, "indestructible")) return false;
  emit({ type: "destroy", objectId: id, defId: o.defId });
  putIntoGraveyard(s, id);
  return true;
}

/** Met un permanent au cimetière de son propriétaire (mort, sacrifice, endurance 0…). */
export function putIntoGraveyard(s: GameState, id: ObjectId): void {
  const o = obj(s, id);
  emit({ type: "dies", objectId: id, defId: o.defId, to: "graveyard" });
  moveObject(s, id, "graveyard");
  removeFromCombat(s, id);
}

export function removeFromCombat(s: GameState, id: ObjectId): void {
  if (!s.combat) return;
  bump(s);
  s.combat.attackers = s.combat.attackers.filter((a) => a.id !== id);
  s.combat.blockers = s.combat.blockers.filter((b) => b.id !== id);
  for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => b !== id);
}

export function tokenDefId(t: TokenSpec): string {
  const kw = (t.keywords ?? []).join("-");
  return `token:${t.name.toLowerCase().replace(/\W+/g, "-")}-${t.power ?? "x"}-${t.toughness ?? "x"}-${t.colors.join("")}${kw ? `-${kw}` : ""}`;
}

export function createTokens(s: GameState, controller: PlayerId, t: TokenSpec, count: number): void {
  const defId = tokenDefId(t);
  if (!s.defs[defId]) {
    const def: CardDef = {
      id: defId,
      name: t.name,
      typeLine: `Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`,
      manaCost: null,
      manaCostText: "",
      colors: t.colors,
      supertypes: [],
      types: t.types,
      subtypes: t.subtypes,
      power: t.power,
      toughness: t.toughness,
      keywords: t.keywords ?? [],
      abilities: t.abilities ?? [],
      text: t.text ?? "",
      implemented: true,
      isToken: true,
    };
    s.defs[defId] = def;
  }
  for (let i = 0; i < count; i++) {
    const o = createObject(s, defId, controller, "battlefield", { isToken: true });
    o.timestamp = nextTimestamp(s);
    emit({ type: "token", objectId: o.id, defId, controller });
    rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
  }
}
