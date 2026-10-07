/**
 * Actions de jeu élémentaires, partagées par les effets, le combat et les actions basées sur l'état.
 */

import { capReached, MAX_BATTLEFIELD, MAX_TOKENS_PER_EVENT } from "./limits";
import { type AmountMod, chooseReplacementOrder } from "./modifiers";
import { applyEntersReplacements, type EntersContext, preventsCombatDamage } from "./replacement";
import {
  bump,
  changeCounters,
  chars,
  commanderOf,
  createObject,
  emit,
  hasKeyword,
  hasType,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  obj,
  opponentsOf,
  rulesEvent,
  snapshot,
  tapObject,
} from "./state";
import {
  type ActiveReplacement,
  consumeReplacement,
  eventReplacements,
  playerProtectedFrom,
  playerSide,
  playerStatic,
  playerStatics,
  preventions,
  quantityMods,
  recipientMatches,
} from "./statics";
import { matchesObjectFilter, matchesView, protectedFrom, sourceView, withChosen } from "./targets";
import { pushInline, queueLifelink } from "./triggers";
import { countTurnEvents, logTurnEvent, zoneEntry } from "./turnlog";
import type {
  CardDef,
  CardType,
  Color,
  GameEvent,
  GameObject,
  GameState,
  Keyword,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TokenSpec,
  Zone,
} from "./types";

export interface DamageSource {
  /** Objet source, s'il est identifiable (pour les déclencheurs « inflige des blessures »). */
  id?: ObjectId;
  /** Sort qui se résout et inflige les blessures (Imodane : « un sort qui ne cible qu'une créature »). */
  stackId?: string;
  defId: string;
  controller: PlayerId;
  keywords: Keyword[];
}

/** `turnDraw` : la pioche de l'étape de pioche (504.1), que Notion Thief ne remplace pas. */
export function drawCard(s: GameState, p: PlayerId, turnDraw = false): void {
  const player = s.players[p];
  if (!player) return;
  // Notion Thief : « si un adversaire devait piocher une carte, sauf la première de son étape de pioche, il passe cette
  // pioche et vous piochez une carte à la place » (la pioche du voleur n'est pas remplacée à son tour).
  if (!turnDraw) {
    const thief = opponentsOf(s, p).find((q) => !s.players[q]?.lost && playerStatic(s, q, "stealsOpponentDraws"));
    if (thief) {
      drawCard(s, thief, true);
      return;
    }
  }
  const top = player.library[0];
  if (!top) {
    // Laboratory Maniac : « vous gagnez la partie à la place » (remplacement, appliqué par les actions basées sur l'état).
    if (player.drewFromEmptyLibrary !== "win") player.drewFromEmptyLibrary = playerStatic(s, p, "winOnEmptyDraw") ? "win" : true;
    emit({ type: "draw", player: p });
    return;
  }
  const id = moveObject(s, top, "hand");
  emit({ type: "draw", player: p, objectId: id ?? undefined, defId: s.objects[id ?? ""]?.defId });
  // Journal du tour (Duelist of the Mind : force égale aux cartes piochées ce tour-ci).
  logTurnEvent(s, { e: "draw", player: p });
  const nth = countTurnEvents(s, { event: "draw" }, p, p);
  // La pioche de l'étape de pioche du joueur (pas celle de Notion Thief, qui pioche à la place d'un autre).
  const stepDraw = turnDraw && s.turn.step === "draw" && s.turn.active === p;
  rulesEvent(s, { e: "draw", player: p, nth, objectId: id ?? undefined, ...(stepDraw ? { turnDraw: true } : {}) });
}

/**
 * Pioche N cartes : un seul événement de pioche pour les remplacements (616.1), dans l'ordre le plus favorable au joueur
 * (le plus de cartes, sauf s'il n'en a pas autant dans sa bibliothèque) : Vnwxt, Verbose Host (« piochez-en deux à la
 * place », pour chaque carte), Quantum Riddler (« autant plus une » avec une carte en main ou moins).
 */
/** `turnDraw` : la pioche de l'étape de pioche (la première carte seulement). */
export function drawCards(s: GameState, p: PlayerId, n: number, turnDraw = false): void {
  const player = s.players[p];
  if (!player || n <= 0) return;
  // Remplacements de la pioche (R1, famille I) ; Mornsong Aria : « les joueurs ne peuvent pas piocher ».
  const q = quantityMods(s, "draw", (a) => recipientMatches(s, a, p));
  if (q.prevented) return;
  const mods = q.mods;
  const most = chooseReplacementOrder(n, mods, "max");
  const total = most <= player.library.length ? most : chooseReplacementOrder(n, mods, "min");
  // Une pioche dans une bibliothèque vide suffit (704.5b) : pas la peine de continuer au-delà.
  const draws = Math.min(total, player.library.length + 1);
  for (let i = 0; i < draws; i++) drawCard(s, p, turnDraw && i === 0);
}

export function gainLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // Screaming Nemesis : ce joueur ne peut pas gagner de points de vie, pour la partie.
  if (playerStatic(s, p, "cantGainLife")) return;
  // Grievous Wound : « le joueur enchanté ne peut pas gagner de points de vie ».
  if (
    s.battlefield.some(
      (id) =>
        s.objects[id]?.attachedTo === p &&
        chars(s, id).abilities.some((ab) => ab.kind === "playerStatic" && ab.enchantedPlayerCantGainLife),
    )
  )
    return;
  // Remplacements (616.1), dans l'ordre le plus favorable au joueur qui gagne les points de vie :
  // Angel of Vitality (« autant plus 1 »), The Wind Crystal (« le double ») ; Giant Cindermaw, Mornsong Aria : « les
  // joueurs ne peuvent pas gagner de points de vie ».
  const q = quantityMods(s, "lifeGain", (a) => recipientMatches(s, a, p));
  if (q.prevented) return;
  amount = chooseReplacementOrder(amount, q.mods, "max");
  player.life += amount;
  bump(s); // des caractéristiques peuvent dépendre des points de vie (Elenda)
  emit({ type: "life", player: p, delta: amount, life: player.life });
  logTurnEvent(s, { e: "lifeGain", player: p, amount });
  rulesEvent(s, { e: "lifeGain", player: p, amount, first: countTurnEvents(s, { event: "lifeGain" }, p, p) === 1 });
}

/** Fourrager (701.61) : peut-on exiler trois cartes de son cimetière ou sacrifier une Nourriture ? */
/** `exclude` : une carte du cimetière qui n'y sera plus (le sort lancé depuis le cimetière). */
export function canForage(s: GameState, p: PlayerId, exclude?: ObjectId): boolean {
  const gy = (s.players[p]?.graveyard ?? []).filter((id) => id !== exclude);
  return gy.length >= 3 || foodToSacrifice(s, p) !== undefined;
}

function foodToSacrifice(s: GameState, p: PlayerId): ObjectId | undefined {
  const foods = s.battlefield.filter((id) => s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Food"));
  // Un jeton de préférence, puis ce qui n'est pas une créature (Ygra rend les créatures Nourritures).
  return foods.sort((a, b) => rank(a) - rank(b))[0];
  function rank(id: ObjectId): number {
    return (s.objects[id]?.isToken ? 0 : 2) + (isCreature(s, id) ? 4 : 0);
  }
}

/**
 * Fourrager (701.61), choix automatique : trois cartes du cimetière (terrains d'abord) s'il y en a au moins trois,
 * sinon une Nourriture sacrifiée. Renvoie false si c'est impossible.
 */
export function forage(s: GameState, p: PlayerId): boolean {
  const player = s.players[p];
  if (!player) return false;
  if (player.graveyard.length >= 3) {
    const isLand = (id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");
    const chosen = [...player.graveyard].sort((a, b) => Number(isLand(b)) - Number(isLand(a))).slice(0, 3);
    for (const id of chosen) {
      const o = obj(s, id);
      emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "graveyard", to: "exile" });
      moveObject(s, id, "exile");
    }
  } else {
    const food = foodToSacrifice(s, p);
    if (!food) return false;
    sacrifice(s, food);
  }
  rulesEvent(s, { e: "forage", player: p });
  return true;
}

/**
 * Payer des points de vie (119.4) : les vérifications « assez de PV » restent celles de l'appelant. Ashiok, Wicked
 * Manipulator : si la bibliothèque a au moins autant de cartes, autant de cartes du dessus sont exilées à la place
 * (remplacement obligatoire, jamais partagé entre PV et cartes).
 */
export function payLife(s: GameState, p: PlayerId, amount: number): void {
  const library = s.players[p]?.library ?? [];
  if (amount <= 0) return;
  const exileInstead = eventReplacements(s, "payLife").some((a) => a.r.instead?.exileFromLibrary && recipientMatches(s, a, p));
  if (exileInstead && library.length >= amount) {
    for (const id of library.slice(0, amount)) {
      const o = obj(s, id);
      emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "library", to: "exile" });
      moveObject(s, id, "exile");
    }
    return;
  }
  loseLife(s, p, amount);
}

/** `damage` : la perte vient de blessures (Angel's Grace : « les blessures qui réduiraient vos PV en dessous de 1 »). */
export function loseLife(s: GameState, p: PlayerId, amount: number, damage = false): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // Remplacements de la perte de PV (Bloodletter of Aclazotz : pendant votre tour, un adversaire perd le double).
  const mods: AmountMod[] = [];
  for (const a of eventReplacements(s, "lifeLoss")) {
    if (!recipientMatches(s, a, p)) continue;
    // « Votre total de points de vie ne peut pas changer » (Teferi's Protection) : aucune perte (les blessures, elles,
    // sont bien infligées).
    if (a.r.modify.prevent) return;
    if (a.r.modify.add) mods.push({ add: a.r.modify.add });
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
  }
  amount = chooseReplacementOrder(amount, mods, "min");
  if (damage) {
    const floors = playerStatics(s, p, "damageLifeFloor").map(({ ab }) => ab.damageLifeFloor ?? 0);
    if (floors.length) amount = Math.min(amount, Math.max(0, player.life - Math.max(...floors)));
    if (amount <= 0) return;
  }
  player.life -= amount;
  bump(s);
  emit({ type: "life", player: p, delta: -amount, life: player.life });
  logTurnEvent(s, { e: "lifeLoss", player: p, amount });
  rulesEvent(s, { e: "lifeLoss", player: p, amount });
  // 702.179 : une fois par tour, quand un adversaire perd des points de vie pendant votre tour, votre vitesse augmente.
  const active = s.players[s.turn.active];
  if (p !== s.turn.active && active?.speed !== undefined && active.speed < 4 && !s.turn.speedRaised) {
    s.turn.speedRaised = true;
    setSpeed(s, s.turn.active, active.speed + 1);
  }
}

/** Fixe la vitesse d'un joueur (702.179). */
export function setSpeed(s: GameState, p: PlayerId, speed: number): void {
  const player = s.players[p];
  if (!player || player.speed === speed) return;
  player.speed = speed;
  bump(s);
  emit({ type: "speed", player: p, speed });
}

/**
 * Destinataire d'un remplacement (blessures ou perte de PV), vu de son contrôleur : lui, lui ou ses permanents, un
 * adversaire, un adversaire ou ses permanents, et le filtre du permanent blessé.
 */
/** Le remplacement s'applique-t-il à ces blessures (combat, source, destinataire) ? */
function damageReplacementApplies(
  s: GameState,
  a: ActiveReplacement,
  source: DamageSource,
  target: string,
  combat: boolean,
): boolean {
  const r = a.r;
  if (r.combat !== undefined && r.combat !== combat) return false;
  // Bouclier : la source choisie (un sort sans objet est reconnu par sa carte et son contrôleur).
  if (r.sourceIs && source.id !== r.sourceIs && !(!source.id && source.defId === r.sourceDefIs)) return false;
  if (r.source) {
    const id = source.id;
    const ok =
      id && s.objects[id]?.zone === "battlefield"
        ? matchesObjectFilter(s, a.controller, id, r.source, a.sourceId)
        : (() => {
            // « Arrivée ce tour-ci » ne se lit que sur le champ de bataille.
            if (r.source?.enteredThisTurn) return false;
            const v = sourceView(s, id, source.defId, source.controller);
            const chooser = a.sourceId ? (s.objects[a.sourceId] ?? s.lki[a.sourceId]) : undefined;
            return !!v && matchesView(v, withChosen(r.source as ObjectFilter, chooser), a.controller, a.sourceId);
          })();
    if (!ok) return false;
  }
  return recipientMatches(s, a, target);
}

/**
 * Prévention par un remplacement (615) : un bouclier « la prochaine fois que » est retiré ; The Mindskinner fait meuler
 * les adversaires, New Way Forward a une capacité réflexive (« quand des blessures sont prévenues ainsi »), Anti-Venom
 * reçoit autant de marqueurs +1/+1.
 */
function preventByReplacement(
  s: GameState,
  a: ActiveReplacement,
  source: DamageSource,
  amount: number,
  target: ObjectId | PlayerId,
): void {
  consumeReplacement(s, a);
  const after = a.r.onPrevent;
  if (after?.opponentsMill) {
    for (const p of opponentsOf(s, a.controller)) {
      for (const id of (s.players[p]?.library ?? []).slice(0, amount)) {
        const o = obj(s, id);
        emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "library", to: "graveyard" });
        moveObject(s, id, "graveyard");
      }
    }
  }
  if (after?.counters && a.sourceId && s.objects[a.sourceId]?.zone === "battlefield")
    changeCounters(s, obj(s, a.sourceId), after.counters, amount);
  if (after?.countersOnDamaged && s.objects[target]?.zone === "battlefield")
    changeCounters(s, obj(s, target), after.countersOnDamaged, amount);
  if (after?.reflexive) {
    const origin = a.r.origin ?? (a.sourceId ? { id: a.sourceId, defId: obj(s, a.sourceId).defId } : undefined);
    if (origin)
      pushInline(
        s,
        a.controller,
        origin.id,
        origin.defId,
        { targets: [], effects: after.reflexive, label: "Blessures prévenues" },
        { objectId: source.id, player: source.controller, amount },
      );
  }
}

/** La source des blessures est-elle rouge (Ojer Axonil) ? */
/** Caractéristiques de la source des blessures (sur le champ de bataille, sinon dernières informations ou carte). */
function sourceChars(
  s: GameState,
  source: DamageSource,
): { colors: Color[]; types: CardType[]; subtypes: string[]; supertypes: string[] } {
  if (source.id && s.objects[source.id]?.zone === "battlefield") {
    const c = chars(s, source.id);
    return { colors: c.colors, types: c.types, subtypes: c.subtypes, supertypes: c.supertypes };
  }
  const lki = source.id ? s.lki[source.id] : undefined;
  const d = s.defs[source.defId];
  return {
    colors: lki?.colors ?? d?.colors ?? [],
    types: lki?.types ?? d?.types ?? [],
    subtypes: lki?.subtypes ?? d?.subtypes ?? [],
    supertypes: lki?.supertypes ?? d?.supertypes ?? [],
  };
}

/** Journal du tour : blessures (Temple of Power, Sidequest: Play Blitzball…). */
function logDamage(
  s: GameState,
  source: DamageSource,
  target: string,
  player: PlayerId,
  toPlayer: boolean,
  amount: number,
  combat: boolean,
): void {
  if (amount <= 0) return;
  const src = sourceChars(s, source);
  const victim = toPlayer ? undefined : chars(s, target);
  logTurnEvent(s, {
    e: "damage",
    player,
    toPlayer,
    amount,
    combat,
    sourceController: source.controller,
    sourceColors: src.colors,
    sourceTypes: src.types,
    sourceSubtypes: src.subtypes,
    sourceSupertypes: src.supertypes,
    sourceKey:
      (source.id ? (s.objects[source.id]?.uid ?? s.lki[source.id]?.uid ?? source.id) : undefined) ??
      source.stackId ??
      source.defId,
    types: victim?.types,
    subtypes: victim?.subtypes,
  });
}

function _redSource(s: GameState, source: DamageSource): boolean {
  if (source.id && s.objects[source.id]?.zone === "battlefield") return chars(s, source.id).colors.includes("R");
  const lki = source.id ? s.lki[source.id] : undefined;
  return (lki?.colors ?? s.defs[source.defId]?.colors ?? []).includes("R");
}

export function dealDamage(s: GameState, source: DamageSource, target: string, amount: number, combat: boolean): void {
  if (amount <= 0) return;
  // Ancient Adamantoise : les blessures à son contrôleur et à ses autres permanents lui sont infligées à la place.
  const owner = isPlayer(s, target)
    ? target
    : s.objects[target]?.zone === "battlefield"
      ? s.objects[target]?.controller
      : undefined;
  const absorber = owner
    ? s.battlefield.find(
        (id) => id !== target && s.objects[id]?.controller === owner && isCreature(s, id) && hasKeyword(s, id, "absorbsDamage"),
      )
    : undefined;
  if (absorber) target = absorber;
  // With Great Power… : « les blessures qui vous seraient infligées sont infligées à la créature enchantée à la place ».
  for (const a of eventReplacements(s, "damage")) {
    if (!a.r.redirectToAttached || !a.sourceId || !damageReplacementApplies(s, a, source, target, combat)) continue;
    const host = s.objects[a.sourceId]?.attachedTo;
    if (host && s.objects[host]?.zone === "battlefield" && host !== target) {
      target = host;
      break;
    }
  }
  // Frenzied Baloth : « les blessures de combat ne peuvent pas être prévenues ».
  // Sunspine Lynx : « les blessures ne peuvent pas être prévenues ».
  const unpreventable =
    (combat && s.playerOrder.some((p) => playerStatic(s, p, "combatDamageUnpreventable"))) ||
    s.playerOrder.some((p) => playerStatic(s, p, "damageUnpreventable"));
  if (combat && !unpreventable && preventsCombatDamage(s, target)) return;
  if (
    combat &&
    !unpreventable &&
    s.objects[target]?.zone === "battlefield" &&
    chars(s, target).keywords.includes("combatDamageImmune")
  )
    return;
  // Protection du joueur (702.16) : les blessures des sources adverses (Absolute Virtue) ou de toute source (Teferi's
  // Protection) sont prévenues.
  if (!unpreventable && isPlayer(s, target) && playerProtectedFrom(s, target, source.controller, source.id)) return;
  const targetObj = s.objects[target];
  const victim = isPlayer(s, target) ? target : targetObj?.controller;
  // Remplacements et préventions des blessures (R1, 616.1) : le joueur blessé choisit l'ordre, le moins de blessures
  // pour lui. Une prévention d'un autre joueur passe donc avant les modifications (The Mindskinner meule le moins), la
  // sienne après (New Way Forward renvoie le plus).
  const reps = eventReplacements(s, "damage").filter(
    (a) => !a.r.redirectToAttached && damageReplacementApplies(s, a, source, target, combat),
  );
  const foreignPrevention = unpreventable ? undefined : reps.find((a) => a.r.modify.prevent && a.controller !== victim);
  if (foreignPrevention) {
    preventByReplacement(s, foreignPrevention, source, amount, target);
    return;
  }
  // 702.16e : protection — les blessures d'une source qui correspond à sa qualité sont prévenues.
  if (
    targetObj?.zone === "battlefield" &&
    !unpreventable &&
    protectedFrom(s, target, sourceView(s, source.id, source.defId, source.controller))
  )
    return;
  // Préventions statiques : blessures reçues (Crystal Barricade, Fog Bank) ou infligées par la source (Fog Bank).
  for (const p of unpreventable ? [] : preventions(s)) {
    if (p.ab.noncombatOnly && combat) continue;
    if (p.ab.combatOnly && !combat) continue;
    if (p.ab.bySource) {
      if (source.id === p.sourceId) return;
      continue;
    }
    if (targetObj?.zone === "battlefield" && matchesObjectFilter(s, p.controller, target, p.ab.filter, p.sourceId)) return;
  }
  // Remplacements qui modifient la quantité (614, 616.1) : chacun s'applique une fois, dans l'ordre que choisit le joueur
  // blessé (ou le contrôleur du permanent blessé), ici le moins de blessures pour lui (`chooseReplacementOrder`).
  const mods: AmountMod[] = [];
  for (const a of reps) {
    const m = a.r.modify;
    if (m.add) mods.push({ add: m.add });
    if (m.addSourcePower && a.sourceId && s.objects[a.sourceId]?.zone === "battlefield") {
      const p = Math.max(0, chars(s, a.sourceId).power);
      if (p > 0) mods.push({ add: p });
    }
    if (m.addSourceCounters && a.sourceId) {
      const n = s.objects[a.sourceId]?.counters[m.addSourceCounters] ?? 0;
      if (n > 0) mods.push({ add: n });
    }
    if (m.times) mods.push({ times: m.times });
    // Ojer Axonil : « au moins autant de blessures que la force de [cette créature] ».
    if (m.atLeastSourcePower && a.sourceId && s.objects[a.sourceId]?.zone === "battlefield")
      mods.push({ atLeast: chars(s, a.sourceId).power });
  }
  const _toOpponent = !!victim && victim !== source.controller;
  amount = chooseReplacementOrder(amount, mods, "min");
  const ownPrevention = unpreventable ? undefined : reps.find((a) => a.r.modify.prevent && a.controller === victim);
  if (ownPrevention) {
    preventByReplacement(s, ownPrevention, source, amount, target);
    return;
  }
  if (amount <= 0) return;
  // 122.1c : un permanent avec un marqueur de bouclier qui devrait subir des blessures perd ce marqueur à la place
  // (un remplacement, pas une prévention : « ne peut pas être prévenu » ne l'empêche pas).
  if (targetObj?.zone === "battlefield" && (targetObj.counters.shield ?? 0) > 0) {
    changeCounters(s, targetObj, "shield", -1);
    return;
  }
  // Ruric Thar, Magecrusher : « tant qu'il n'a pas encore infligé de blessures de combat » ; Karakyk Guardian : « tant
  // qu'il n'a pas encore infligé de blessures » (de combat ou non).
  const dealer = source.id ? s.objects[source.id] : undefined;
  if (dealer && ((combat && !dealer.dealtCombatDamage) || !dealer.dealtDamage)) {
    if (combat) dealer.dealtCombatDamage = true;
    dealer.dealtDamage = true;
    bump(s);
  }
  let excess = 0;
  if (isPlayer(s, target)) {
    // Suivi des joueurs blessés au combat par cette source ce tour-ci (Steel Hellkite).
    const src = source.id ? s.objects[source.id] : undefined;
    if (combat && src && !src.combatDamagedPlayers?.includes(target)) {
      src.combatDamagedPlayers = [...(src.combatDamagedPlayers ?? []), target];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, amount, combat });
    logDamage(s, source, target, target, true, amount, combat);
    // 903.10a : blessures de combat d'un commandant, cumulées sur la partie (704.6c : 21, le joueur perd).
    const commander = combat ? commanderOf(s, src) : undefined;
    if (commander) commander.damage[target] = (commander.damage[target] ?? 0) + amount;
    // Toxique N (702.164) : des blessures de combat à un joueur lui donnent aussi N marqueurs poison.
    const toxic = combat && src && source.keywords.includes("toxic") ? (s.defs[src.defId]?.toxic ?? 1) : 0;
    const poisoned = s.players[target];
    if (toxic && poisoned) {
      poisoned.counters ??= {};
      const counters = poisoned.counters;
      counters.poison = (counters.poison ?? 0) + toxic;
      emit({ type: "poison", player: target, amount: toxic, total: counters.poison });
    }
    // Infection (702.90b) : des marqueurs poison au lieu d'une perte de points de vie.
    // Phyrexian Unlife : à 0 PV ou moins, comme si la source avait l'infection.
    const pl = s.players[target];
    if (pl && (source.keywords.includes("infect") || (pl.life <= 0 && playerStatic(s, target, "infectDamageAtZeroLife")))) {
      pl.counters ??= {};
      const counters = pl.counters;
      counters.poison = (counters.poison ?? 0) + amount;
      emit({ type: "poison", player: target, amount, total: counters.poison });
    } else loseLife(s, target, amount, true);
  } else {
    const o = s.objects[target];
    // 506.4 : un planeswalker attaqué qui a quitté le champ de bataille ne reçoit pas de blessures.
    if (o?.zone !== "battlefield") return;
    const creature = isCreature(s, target);
    const walker = hasType(s, target, "Planeswalker");
    if (!creature && !walker) return;
    // Wolverine : les blessures précédentes sont guéries avant que les nouvelles soient marquées.
    if (creature && chars(s, target).keywords.includes("damageHealsFirst")) {
      o.damage = 0;
      o.deathtouched = false;
    }
    // 120.4a : blessures en excès, au-delà des blessures mortelles (contact mortel : 1 suffit) ou de la loyauté.
    const deathtouch = source.keywords.includes("deathtouch");
    const lethal = creature
      ? Math.max(0, deathtouch ? (o.damage > 0 || o.deathtouched ? 0 : 1) : chars(s, target).toughness - o.damage)
      : (o.counters.loyalty ?? 0);
    excess = Math.max(0, amount - lethal);
    // 120.3c : les blessures infligées à un planeswalker lui retirent autant de marqueurs de loyauté.
    if (walker) changeCounters(s, o, "loyalty", -Math.min(amount, o.counters.loyalty ?? 0));
    if (creature) {
      // Flétrissure (702.80), infection (702.90b) : des marqueurs −1/−1 au lieu de blessures marquées (ce sont toujours
      // des blessures).
      if (source.keywords.includes("wither") || source.keywords.includes("infect")) changeCounters(s, o, "-1/-1", amount);
      else o.damage += amount;
      if (source.keywords.includes("deathtouch")) o.deathtouched = true;
      // Suivi « blessée par cette créature ce tour-ci » (Predator Ooze).
      if (source.id && !o.damagedBy?.includes(source.id)) o.damagedBy = [...(o.damagedBy ?? []), source.id];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, targetDefId: o.defId, amount, combat });
    logDamage(s, source, target, o.controller, false, amount, combat);
  }
  // Lien de vie : un gain par source et par lot de blessures simultanées (voir `queueLifelink`).
  if (source.keywords.includes("lifelink") && amount > 0) {
    const key = source.id ?? `${source.defId}|${source.controller}`;
    if (!queueLifelink(key, source.controller, amount)) gainLife(s, source.controller, amount);
  }
  rulesEvent(s, {
    e: "damage",
    sourceId: source.id ?? null,
    stackId: source.stackId,
    sourceController: source.controller,
    target,
    amount,
    combat,
    excess: excess || undefined,
  });
}

export function sourceFromObject(s: GameState, id: ObjectId): DamageSource {
  const o = obj(s, id);
  return { id, defId: o.defId, controller: o.controller, keywords: chars(s, id).keywords };
}

/** Détruit un permanent (sauf indestructible). Renvoie true s'il a quitté le champ de bataille. */
/** `by` : le contrôleur du sort ou de la capacité qui détruit (« un sort ou une capacité qu'un adversaire contrôle détruit », Karmic Justice). */
export function destroy(s: GameState, id: ObjectId, noRegenerate = false, by?: PlayerId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  if (hasKeyword(s, id, "indestructible")) return false;
  // 122.1c : un permanent avec un marqueur de bouclier qui devrait être détruit perd ce marqueur à la place.
  if ((o.counters.shield ?? 0) > 0) {
    changeCounters(s, o, "shield", -1);
    return false;
  }
  // Régénération (701.19c) : la destruction est remplacée ; le permanent est engagé, retiré du combat et ses blessures
  // sont retirées.
  if (o.regenShields && !noRegenerate) {
    o.regenShields -= 1;
    if (!o.regenShields) delete o.regenShields;
    if (!o.tapped) tapObject(s, o);
    removeFromCombat(s, id);
    o.damage = 0;
    o.deathtouched = false;
    bump(s);
    return false;
  }
  emit({ type: "destroy", objectId: id, defId: o.defId });
  if (by) rulesEvent(s, { e: "destroyed", lki: snapshot(s, id), by });
  putIntoGraveyard(s, id);
  return true;
}

/** Met un permanent au cimetière de son propriétaire (mort, sacrifice, endurance 0…). */
export function putIntoGraveyard(s: GameState, id: ObjectId): ObjectId | null {
  const o = obj(s, id);
  // Émis avant le déplacement (ordre des événements), complété ensuite par la destination réelle :
  // un remplacement peut exiler la créature (Feu du dragon dévastateur) ou la mélanger dans la bibliothèque.
  const event: Extract<GameEvent, { type: "dies" }> = { type: "dies", objectId: id, defId: o.defId, to: "graveyard" };
  emit(event);
  const landed: { to?: Zone } = {};
  const moved = moveObject(s, id, "graveyard", { landed });
  if (landed.to) event.to = landed.to;
  removeFromCombat(s, id);
  return moved;
}

/** Sacrifier (701.21) : le contrôleur met le permanent au cimetière ; « chaque fois que vous sacrifiez… » se déclenche. */
export function sacrifice(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return;
  // Zurgo, Thunder's Decree : « ce jeton ne peut pas être sacrifié ».
  if (hasKeyword(s, id, "cantBeSacrificed")) return;
  rulesEvent(s, { e: "sacrifice", objectId: id, player: o.controller });
  const c = chars(s, id);
  logTurnEvent(s, {
    e: "sacrifice",
    player: o.controller,
    types: c.types,
    subtypes: c.subtypes,
    supertypes: c.supertypes,
    token: o.isToken || undefined,
  });
  const moved = putIntoGraveyard(s, id);
  // « Chaque fois qu'un adversaire sacrifie… mettez cette carte sur le champ de bataille » (It That Betrays) : les
  // déclenchements créés avant le déplacement suivent la carte dans sa nouvelle zone.
  if (moved) for (const t of s.triggers) if (t.event.objectId === id && !t.event.newObjectId) t.event.newObjectId = moved;
}

/**
 * Phasing (702.26) : le permanent et ce qui lui est attaché (indirectement, 702.26g) sortent de phase ; ils sont traités
 * comme s'ils n'existaient pas, sans changer de zone (ni départ ni arrivée), jusqu'à l'étape de dégagement de leur
 * contrôleur (`phaseIn`).
 */
export function phaseOut(s: GameState, id: ObjectId): void {
  const all = [id];
  for (let i = 0; i < all.length; i++)
    for (const x of s.battlefield) if (s.objects[x]?.attachedTo === all[i] && !all.includes(x)) all.push(x);
  for (const x of all) {
    const o = s.objects[x];
    const pl = o ? s.players[o.owner] : undefined;
    if (o?.zone !== "battlefield" || !pl) continue;
    removeFromCombat(s, x);
    s.battlefield = s.battlefield.filter((y) => y !== x);
    o.zone = "phasedOut";
    pl.phasedOut = [...(pl.phasedOut ?? []), x];
    emit({ type: "moved", owner: o.owner, objectId: x, defId: o.defId, from: "battlefield", to: "phasedOut" });
  }
  bump(s);
}

/** 502.1 : au début de l'étape de dégagement, les permanents hors phase de ce joueur reviennent en phase. */
export function phaseIn(s: GameState, player: PlayerId): void {
  let changed = false;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    for (const x of [...(pl?.phasedOut ?? [])]) {
      const o = s.objects[x];
      if (!o || !pl || o.controller !== player) continue;
      pl.phasedOut = pl.phasedOut.filter((y) => y !== x);
      o.zone = "battlefield";
      s.battlefield.push(x);
      emit({ type: "moved", owner: o.owner, objectId: x, defId: o.defId, from: "phasedOut", to: "battlefield" });
      changed = true;
    }
  }
  if (changed) bump(s);
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
  return `token:${t.name.toLowerCase().replace(/\W+/g, "-")}-${t.power ?? "x"}-${t.toughness ?? "x"}-${t.colors.join("")}${kw ? `-${kw}` : ""}${t.toxic ? `-toxic${t.toxic}` : ""}`;
}

/** Monarque (724) : le joueur désigné le devient (un seul monarque à la fois). */
export function setMonarch(s: GameState, player: PlayerId): void {
  if (s.monarch === player || !s.players[player] || s.players[player]?.lost) return;
  s.monarch = player;
  emit({ type: "monarch", player });
  bump(s);
}

/** `enters` : modifications d'arrivée imposées par l'effet (engagés, attaquants, marqueurs), avant l'événement d'arrivée. */
/**
 * Plafonds des jetons (`limits.ts`) : des doubleurs de jetons qui se multiplient (copies d'Exalted Sunborn) donnent vite un
 * nombre astronomique, voire infini en JavaScript (voir docs/approximations.md).
 */
function tokenRoom(s: GameState, n: number): number {
  const room = Math.max(0, Math.min(n, MAX_TOKENS_PER_EVENT, MAX_BATTLEFIELD - s.battlefield.length));
  if (room < n) capReached("tokens");
  return room;
}

/** Remplacements des jetons (R1, famille H), vus de celui qui les crée et du jeton créé. */
function tokenReplacements(s: GameState, controller: PlayerId, v: LkiSnapshot) {
  return eventReplacements(s, "tokens").filter(
    (a) =>
      playerSide(s, a, controller) &&
      (!a.r.toFilter || matchesView(v, a.r.toFilter, a.controller, a.sourceId)) &&
      (!a.r.instead?.firstEachTurn || !s.turn.onceFired.includes(`tokens:${a.sourceId}`)),
  );
}

/** Draconic Visitor : d'autres jetons à la place (les jetons d'artefact deviennent des Dragons 5/5 volants). */
function swappedToken(s: GameState, controller: PlayerId, t: TokenSpec): TokenSpec {
  return tokenReplacements(s, controller, tokenView(t, controller)).find((a) => !!a.r.instead?.token)?.r.instead?.token ?? t;
}

/**
 * Moonlit Meditation, Mirrormind Crown : le remplacement qui crée, à la place, des copies du permanent auquel sa source
 * est attachée (la première fois de chaque tour). `may` : « vous pouvez » — la question est posée avant la création par
 * l'effet qui crée les jetons (`copyDeclined` de `createTokens`).
 */
export function tokenCopyReplacement(
  s: GameState,
  controller: PlayerId,
  t: TokenSpec,
): { sourceId: ObjectId; controller: PlayerId; host: ObjectId; may: boolean; firstEachTurn: boolean } | undefined {
  const t2 = swappedToken(s, controller, t);
  for (const a of tokenReplacements(s, controller, tokenView(t2, controller))) {
    const host = a.sourceId ? s.objects[s.objects[a.sourceId]?.attachedTo ?? ""] : undefined;
    if (a.sourceId && a.r.instead?.copyOfAttached && host?.zone === "battlefield")
      return {
        sourceId: a.sourceId,
        controller: a.controller,
        host: host.id,
        may: !!a.r.instead.may,
        firstEachTurn: !!a.r.instead.firstEachTurn,
      };
  }
  return undefined;
}

export function createTokens(
  s: GameState,
  controller: PlayerId,
  t: TokenSpec,
  count: number,
  extras = true,
  enters: EntersContext = {},
  /** Le contrôleur de Moonlit Meditation a refusé les copies (« vous pouvez »). */
  copyDeclined = false,
): ObjectId[] {
  const tokenReps = (v: LkiSnapshot) => tokenReplacements(s, controller, v);
  t = swappedToken(s, controller, t);
  // Moonlit Meditation, Mirrormind Crown : la première fois de chaque tour, des copies du permanent auquel la source est
  // attachée, à la place. Refusées, la première fois est tout de même passée.
  const copies = count > 0 ? tokenCopyReplacement(s, controller, t) : undefined;
  if (copies) {
    if (copies.firstEachTurn) s.turn.onceFired.push(`tokens:${copies.sourceId}`);
    const model = copyDeclined ? undefined : s.objects[copies.host];
    if (model) {
      const out: ObjectId[] = [];
      const n = tokenRoom(s, chooseReplacementOrder(count, tokenModifiers(tokenReps(snapshot(s, model.id))), "max"));
      for (let i = 0; i < n; i++) out.push(createTokenCopy(s, controller, model.defId));
      return out;
    }
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
      supertypes: t.legendary ? ["Legendary"] : [],
      types: t.types,
      subtypes: t.subtypes,
      power: t.power,
      toughness: t.toughness,
      cdaPT: t.cdaPT,
      enchant: t.enchant,
      keywords: t.toxic ? [...new Set([...(t.keywords ?? []), "toxic" as const])] : (t.keywords ?? []),
      ...(t.toxic ? { toxic: t.toxic } : {}),
      abilities: t.abilities ?? [],
      text: t.text ?? "",
      implemented: true,
      isToken: true,
    };
    s.defs[defId] = def;
  }
  // Doubling Season : « crée deux fois plus de ces jetons » ; Ojer Taq : trois fois plus de jetons de créature.
  const reps = tokenReps(tokenView(t, controller));
  const n = tokenRoom(s, chooseReplacementOrder(count, tokenModifiers(reps), "max"));
  for (let i = 0; i < n; i++) {
    const o = createObject(s, defId, controller, "battlefield", { isToken: true });
    o.timestamp = nextTimestamp(s);
    // Remplacements d'arrivée des autres permanents (« chaque créature que vous contrôlez arrive avec… ») ; un jeton
    // décrit engagé (`TokenSpec.tapped`) arrive engagé.
    applyEntersReplacements(s, o, t.tapped ? { ...enters, tapped: true } : enters);
    emit({ type: "token", objectId: o.id, defId, controller });
    rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
    logTokenArrival(s, o);
    created.push(o.id);
  }
  // Quina (« ces jetons plus une Grenouille »), Worldwalker Helm (« plus une Carte ») : les jetons ajoutés ne déclenchent
  // pas de nouveau remplacement.
  if (extras && count > 0) for (const a of reps) if (a.r.plus) created.push(...createTokens(s, controller, a.r.plus, 1, false));
  return created;
}

/** Jeton copie d'une carte : mêmes valeurs copiables (sa définition), mais c'est un jeton (707.2). */
export function createTokenCopy(s: GameState, controller: PlayerId, defId: string, enters: EntersContext = {}): ObjectId {
  const o = createObject(s, defId, controller, "battlefield", { isToken: true });
  o.timestamp = nextTimestamp(s);
  applyEntersReplacements(s, o, enters);
  emit({ type: "token", objectId: o.id, defId, controller });
  rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
  logTokenArrival(s, o);
  return o.id;
}

/** Journal du tour : un jeton créé arrive sur le champ de bataille (« une créature est arrivée sous votre contrôle »). */
function logTokenArrival(s: GameState, o: GameObject): void {
  const c = chars(s, o.id);
  logTurnEvent(s, zoneEntry(null, "battlefield", o.owner, o.controller, { types: c.types, subtypes: c.subtypes, token: true }));
}

/** Le jeton tel qu'il serait créé (filtres des remplacements de jetons). */
function tokenView(t: TokenSpec, controller: PlayerId): LkiSnapshot {
  return {
    id: "",
    defId: tokenDefId(t),
    owner: controller,
    controller,
    name: t.name,
    types: t.types,
    subtypes: t.subtypes,
    supertypes: t.legendary ? ["Legendary"] : [],
    colors: t.colors,
    power: t.power ?? 0,
    toughness: t.toughness ?? 0,
    keywords: t.keywords ?? [],
    isToken: true,
  };
}

/** Modifications du nombre de jetons : « le double » (Doubling Season), « le triple » (Ojer Taq), « autant plus N ». */
function tokenModifiers(reps: ActiveReplacement[]): AmountMod[] {
  const mods: AmountMod[] = [];
  for (const a of reps) {
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
    if (a.r.modify.add) mods.push({ add: a.r.modify.add });
  }
  return mods;
}

/**
 * Nombre de jetons copies créés pour `count` (Doubling Season, Ojer Taq…) : les multiplicateurs des remplacements de
 * jetons qui s'appliquent à ce modèle.
 */
export function tokenCopyCount(s: GameState, controller: PlayerId, model: LkiSnapshot, count: number): number {
  const reps = eventReplacements(s, "tokens").filter(
    (a) => playerSide(s, a, controller) && (!a.r.toFilter || matchesView(model, a.r.toFilter, a.controller, a.sourceId)),
  );
  return tokenRoom(s, chooseReplacementOrder(count, tokenModifiers(reps), "max"));
}
