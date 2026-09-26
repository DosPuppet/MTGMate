/**
 * Actions de jeu élémentaires, partagées par les effets, le combat et les actions basées sur l'état.
 */

import { applyEntersReplacements, preventsCombatDamage } from "./replacement";
import {
  bump,
  changeCounters,
  chars,
  createObject,
  emit,
  hasKeyword,
  hasType,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  obj,
  rulesEvent,
} from "./state";
import { controlledAbilitiesWithSource, doublers, playerStatic, preventions } from "./statics";
import { matchesObjectFilter } from "./targets";
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
  player.turnStats.cardsDrawn += 1;
  rulesEvent(s, { e: "draw", player: p, nth: player.turnStats.cardsDrawn });
}

export function gainLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // Giant Cindermaw : « les joueurs ne peuvent pas gagner de points de vie ».
  if (s.playerOrder.some((q) => playerStatic(s, q, "noLifeGainForAll"))) return;
  // Angel of Vitality : « vous gagnez autant plus 1 à la place ».
  amount += controlledAbilitiesWithSource(s, p).reduce(
    (n, { ab }) => n + (ab.kind === "playerStatic" ? (ab.lifeGainBonus ?? 0) : 0),
    0,
  );
  player.life += amount;
  bump(s); // des caractéristiques peuvent dépendre des points de vie (Elenda)
  emit({ type: "life", player: p, delta: amount, life: player.life });
  player.turnStats.lifeGained += amount;
  player.turnStats.lifeGainEvents += 1;
  rulesEvent(s, { e: "lifeGain", player: p, amount, first: player.turnStats.lifeGainEvents === 1 });
}

export function loseLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  player.life -= amount;
  bump(s);
  emit({ type: "life", player: p, delta: -amount, life: player.life });
  player.turnStats.lifeLost += amount;
  rulesEvent(s, { e: "lifeLoss", player: p, amount });
}

/** Inflige des blessures à un joueur ou à une créature (règle 120). */
export function dealDamage(s: GameState, source: DamageSource, target: string, amount: number, combat: boolean): void {
  if (amount <= 0) return;
  if (combat && preventsCombatDamage(s, target)) return;
  const targetObj = s.objects[target];
  if (targetObj?.zone === "battlefield") {
    // 702.16e : protection contre tout — les blessures sont prévenues.
    if (hasKeyword(s, target, "protectionFromEverything")) return;
  }
  // Préventions statiques : blessures reçues (Crystal Barricade, Fog Bank) ou infligées par la source (Fog Bank).
  for (const p of preventions(s)) {
    if (p.ab.noncombatOnly && combat) continue;
    if (p.ab.combatOnly && !combat) continue;
    if (p.ab.bySource) {
      if (source.id === p.sourceId) return;
      continue;
    }
    if (targetObj?.zone === "battlefield" && matchesObjectFilter(s, p.controller, target, p.ab.filter, p.sourceId)) return;
  }
  // Ruric Thar, Magecrusher : « tant qu'il n'a pas encore infligé de blessures de combat ».
  const dealer = combat && source.id ? s.objects[source.id] : undefined;
  if (dealer && !dealer.dealtCombatDamage) {
    dealer.dealtCombatDamage = true;
    bump(s);
  }
  // Twinflame Tyrant : blessures d'une source que vous contrôlez à un adversaire ou à un permanent adverse, doublées.
  const victim = isPlayer(s, target) ? target : targetObj?.controller;
  // Tomik, Izzet Sparkmage : blessures non de combat à un adversaire ou à ses permanents, +1.
  if (!combat && victim && victim !== source.controller && playerStatic(s, source.controller, "noncombatDamageBonus"))
    amount += 1;
  if (victim && victim !== source.controller) amount *= 2 ** doublers(s, source.controller, "damageToOpponents");
  // Gratuitous Violence : blessures d'une créature que vous contrôlez, doublées.
  if (source.id && s.objects[source.id]?.zone === "battlefield" && isCreature(s, source.id)) {
    amount *= 2 ** doublers(s, source.controller, "creatureDamage");
  }
  if (isPlayer(s, target)) {
    // Suivi des joueurs blessés au combat par cette source ce tour-ci (Steel Hellkite).
    const src = source.id ? s.objects[source.id] : undefined;
    if (combat && src && !src.combatDamagedPlayers?.includes(target)) {
      src.combatDamagedPlayers = [...(src.combatDamagedPlayers ?? []), target];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, amount, combat });
    const hurt = s.players[target];
    if (hurt && !combat && amount > 0) hurt.turnStats.noncombatDamageTaken += amount;
    loseLife(s, target, amount);
  } else {
    const o = s.objects[target];
    // 506.4 : un planeswalker attaqué qui a quitté le champ de bataille ne reçoit pas de blessures.
    if (o?.zone !== "battlefield") return;
    const creature = isCreature(s, target);
    const walker = hasType(s, target, "Planeswalker");
    if (!creature && !walker) return;
    // 120.3c : les blessures infligées à un planeswalker lui retirent autant de marqueurs de loyauté.
    if (walker) changeCounters(s, o, "loyalty", -Math.min(amount, o.counters.loyalty ?? 0));
    if (creature) {
      o.damage += amount;
      if (source.keywords.includes("deathtouch")) o.deathtouched = true;
      // Suivi « blessée par cette créature ce tour-ci » (Predator Ooze).
      if (source.id && !o.damagedBy?.includes(source.id)) o.damagedBy = [...(o.damagedBy ?? []), source.id];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, targetDefId: o.defId, amount, combat });
  }
  if (source.keywords.includes("lifelink")) gainLife(s, source.controller, amount);
  rulesEvent(s, { e: "damage", sourceId: source.id ?? null, sourceController: source.controller, target, amount, combat });
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

export function createTokens(s: GameState, controller: PlayerId, t: TokenSpec, count: number): ObjectId[] {
  // Draconic Visitor : les jetons d'artefact deviennent des Dragons 5/5 volants.
  if (t.types.includes("Artifact")) {
    const replacement = controlledAbilitiesWithSource(s, controller).find(
      ({ ab }) => ab.kind === "playerStatic" && !!ab.replaceArtifactTokens,
    )?.ab;
    if (replacement?.kind === "playerStatic" && replacement.replaceArtifactTokens) t = replacement.replaceArtifactTokens;
  }
  const created: ObjectId[] = [];
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
  // Doubling Season : « crée deux fois plus de ces jetons ».
  const n = count * 2 ** doublers(s, controller, "tokens");
  for (let i = 0; i < n; i++) {
    const o = createObject(s, defId, controller, "battlefield", { isToken: true });
    o.timestamp = nextTimestamp(s);
    emit({ type: "token", objectId: o.id, defId, controller });
    rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
    created.push(o.id);
  }
  return created;
}

/** Jeton copie d'une carte : mêmes valeurs copiables (sa définition), mais c'est un jeton (707.2). */
export function createTokenCopy(s: GameState, controller: PlayerId, defId: string): ObjectId {
  const o = createObject(s, defId, controller, "battlefield", { isToken: true });
  o.timestamp = nextTimestamp(s);
  applyEntersReplacements(s, o, {});
  emit({ type: "token", objectId: o.id, defId, controller });
  rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
  return o.id;
}
