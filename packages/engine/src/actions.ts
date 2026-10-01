/**
 * Actions de jeu élémentaires, partagées par les effets, le combat et les actions basées sur l'état.
 */

import { type AmountMod, chooseReplacementOrder } from "./modifiers";
import { applyEntersReplacements, type EntersContext, preventsCombatDamage } from "./replacement";
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
  opponentsOf,
  rulesEvent,
} from "./state";
import {
  controlledAbilitiesWithSource,
  doublers,
  playerStatic,
  playerStatics,
  playerStaticTotal,
  preventions,
  tokenMultiplier,
} from "./statics";
import { matchesObjectFilter, protectedFrom, sourceView } from "./targets";
import { checkCondition, queueLifelink } from "./triggers";
import { logTurnEvent } from "./turnlog";
import type { CardDef, CardType, Color, GameEvent, GameState, Keyword, ObjectId, PlayerId, TokenSpec, Zone } from "./types";

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
  bump(s); // Duelist of the Mind : force égale aux cartes piochées ce tour-ci
  rulesEvent(s, { e: "draw", player: p, nth: player.turnStats.cardsDrawn });
}

/**
 * Pioche N cartes : un seul événement de pioche pour les remplacements (616.1), dans l'ordre le plus favorable au joueur
 * (le plus de cartes, sauf s'il n'en a pas autant dans sa bibliothèque) : Vnwxt, Verbose Host (« piochez-en deux à la
 * place », pour chaque carte), Quantum Riddler (« autant plus une » avec une carte en main ou moins).
 */
export function drawCards(s: GameState, p: PlayerId, n: number): void {
  const player = s.players[p];
  if (!player || n <= 0) return;
  const mods: AmountMod[] = playerStatics(s, p, "drawDouble").map(() => ({ times: 2 }));
  if (player.hand.length <= 1) for (const _ of playerStatics(s, p, "drawPlusOneWhenHandSmall")) mods.push({ add: 1 });
  const most = chooseReplacementOrder(n, mods, "max");
  const total = most <= player.library.length ? most : chooseReplacementOrder(n, mods, "min");
  for (let i = 0; i < total; i++) drawCard(s, p);
}

export function gainLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // Giant Cindermaw : « les joueurs ne peuvent pas gagner de points de vie » ; Screaming Nemesis : ce joueur, pour la partie.
  if (playerStatic(s, p, "cantGainLife") || s.playerOrder.some((q) => playerStatic(s, q, "noLifeGainForAll"))) return;
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
  // Angel of Vitality (« autant plus 1 »), The Wind Crystal (« le double »).
  const mods: AmountMod[] = playerStatics(s, p, "lifeGainBonus").map(({ ab }) => ({ add: ab.lifeGainBonus ?? 0 }));
  for (let i = 0; i < doublers(s, p, "lifeGain"); i++) mods.push({ times: 2 });
  amount = chooseReplacementOrder(amount, mods, "max");
  player.life += amount;
  bump(s); // des caractéristiques peuvent dépendre des points de vie (Elenda)
  emit({ type: "life", player: p, delta: amount, life: player.life });
  player.turnStats.lifeGained += amount;
  player.turnStats.lifeGainEvents += 1;
  rulesEvent(s, { e: "lifeGain", player: p, amount, first: player.turnStats.lifeGainEvents === 1 });
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

export function loseLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // Bloodletter of Aclazotz : pendant le tour de son contrôleur, un adversaire perd le double.
  if (s.turn.active !== p) amount *= 2 ** doublersOfLifeLoss(s, s.turn.active);
  player.life -= amount;
  bump(s);
  emit({ type: "life", player: p, delta: -amount, life: player.life });
  player.turnStats.lifeLost += amount;
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

/** Inflige des blessures à un joueur ou à une créature (règle 120). */
function doublersOfLifeLoss(s: GameState, player: PlayerId): number {
  return playerStaticTotal(s, player, "doubleOpponentLifeLossYourTurn");
}

/** La source des blessures est-elle rouge (Ojer Axonil) ? */
/** Caractéristiques de la source des blessures (sur le champ de bataille, sinon dernières informations ou carte). */
function sourceChars(s: GameState, source: DamageSource): { colors: Color[]; types: CardType[]; supertypes: string[] } {
  if (source.id && s.objects[source.id]?.zone === "battlefield") {
    const c = chars(s, source.id);
    return { colors: c.colors, types: c.types, supertypes: c.supertypes };
  }
  const lki = source.id ? s.lki[source.id] : undefined;
  const d = s.defs[source.defId];
  return {
    colors: lki?.colors ?? d?.colors ?? [],
    types: lki?.types ?? d?.types ?? [],
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
    sourceSupertypes: src.supertypes,
    types: victim?.types,
    subtypes: victim?.subtypes,
  });
}

function redSource(s: GameState, source: DamageSource): boolean {
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
  // Absolute Virtue : les blessures des sources adverses à ce joueur sont prévenues.
  if (!unpreventable && isPlayer(s, target) && source.controller !== target && playerStatic(s, target, "protectionFromOpponents"))
    return;
  // The Mindskinner : les blessures de vos sources à un adversaire sont prévenues ; chaque adversaire meule autant.
  if (
    !unpreventable &&
    isPlayer(s, target) &&
    source.controller &&
    source.controller !== target &&
    playerStatic(s, source.controller, "damageToOpponentsMills")
  ) {
    for (const p of opponentsOf(s, source.controller)) {
      for (const id of (s.players[p]?.library ?? []).slice(0, amount)) {
        const o = obj(s, id);
        emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "library", to: "graveyard" });
        moveObject(s, id, "graveyard");
      }
    }
    return;
  }
  const targetObj = s.objects[target];
  if (targetObj?.zone === "battlefield") {
    // 702.16e : protection — les blessures d'une source qui correspond à sa qualité sont prévenues.
    if (!unpreventable && protectedFrom(s, target, sourceView(s, source.id, source.defId, source.controller))) return;
    // Summon: Alexander : « prévenez toutes les blessures infligées aux créatures que vous contrôlez ce tour-ci ».
    if (!unpreventable && playerStatic(s, targetObj.controller, "creaturesDamageImmune") && isCreature(s, target)) return;
  }
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
  // Ruric Thar, Magecrusher : « tant qu'il n'a pas encore infligé de blessures de combat » ; Karakyk Guardian : « tant
  // qu'il n'a pas encore infligé de blessures » (de combat ou non).
  const dealer = source.id ? s.objects[source.id] : undefined;
  if (dealer && ((combat && !dealer.dealtCombatDamage) || !dealer.dealtDamage)) {
    if (combat) dealer.dealtCombatDamage = true;
    dealer.dealtDamage = true;
    bump(s);
  }
  const victim = isPlayer(s, target) ? target : targetObj?.controller;
  // Remplacements qui modifient la quantité (614, 616.1) : chacun s'applique une fois, dans l'ordre que choisit le joueur
  // blessé (ou le contrôleur du permanent blessé), ici le moins de blessures pour lui (`chooseReplacementOrder`).
  const mods: AmountMod[] = [];
  const toOpponent = !!victim && victim !== source.controller;
  // Taii Wakeen : ce tour-ci, les blessures non de combat de vos sources sont augmentées de X.
  if (!combat)
    for (const { ab } of playerStatics(s, source.controller, "noncombatDamageBonusAll"))
      mods.push({ add: ab.noncombatDamageBonusAll ?? 0 });
  // Tomik, Izzet Sparkmage : blessures non de combat à un adversaire ou à ses permanents, +1.
  if (!combat && toOpponent) for (const _ of playerStatics(s, source.controller, "noncombatDamageBonus")) mods.push({ add: 1 });
  // Artist's Talent (niveau 3) : « … elle en inflige autant plus 2 à la place ».
  if (!combat && toOpponent)
    for (const { ab } of playerStatics(s, source.controller, "noncombatDamageBonusAmount"))
      mods.push({ add: ab.noncombatDamageBonusAmount ?? 0 });
  // Ojer Axonil : une source rouge qui inflige à un adversaire moins de blessures non de combat que sa force en inflige
  // autant que sa force à la place.
  if (!combat && redSource(s, source) && isPlayer(s, target) && target !== source.controller) {
    for (const { id, ab } of playerStatics(s, source.controller, "noncombatDamageAtLeastPower")) {
      if (ab.noncombatDamageAtLeastPower && id && s.objects[id]?.zone === "battlefield")
        mods.push({ atLeast: chars(s, id).power });
    }
  }
  // Valley Flamecaller : « si un Lézard, une Souris, une Loutre ou un Raton laveur que vous contrôlez devait infliger des
  // blessures, il en inflige autant plus 1 à la place ».
  if (source.id && s.objects[source.id]?.zone === "battlefield") {
    const id = source.id;
    for (const { id: from, ab } of playerStatics(s, source.controller, "damagePlusOneFrom"))
      if (ab.damagePlusOneFrom && matchesObjectFilter(s, source.controller, id, ab.damagePlusOneFrom, from))
        mods.push({ add: 1 });
  }
  // Far Fortune (vitesse maximale) : toute blessure de vos sources à un adversaire ou à ses permanents, +1.
  if (toOpponent) for (const _ of playerStatics(s, source.controller, "damagePlusOneToOpponents")) mods.push({ add: 1 });
  // Twinflame Tyrant : blessures d'une source que vous contrôlez à un adversaire ou à un permanent adverse, doublées.
  if (toOpponent) for (let i = 0; i < doublers(s, source.controller, "damageToOpponents"); i++) mods.push({ times: 2 });
  // Gratuitous Violence : blessures d'une créature que vous contrôlez, doublées.
  if (source.id && s.objects[source.id]?.zone === "battlefield" && isCreature(s, source.id)) {
    for (let i = 0; i < doublers(s, source.controller, "creatureDamage"); i++) mods.push({ times: 2 });
  }
  // Trance Kuja : « si un Sorcier que vous contrôlez devait infliger des blessures, il en inflige le double ».
  if (source.id && s.objects[source.id]?.zone === "battlefield") {
    const id = source.id;
    for (const { id: from, ab } of controlledAbilitiesWithSource(s, source.controller))
      if (ab.kind === "doubler" && ab.damageFilter && matchesObjectFilter(s, source.controller, id, ab.damageFilter, from))
        mods.push({ times: 2 });
  }
  // The Rollercrusher Ride (délire) : blessures non de combat de vos sources, doublées.
  if (!combat) {
    for (const { id: from, ab } of controlledAbilitiesWithSource(s, source.controller))
      if (
        ab.kind === "doubler" &&
        ab.noncombatDamage &&
        (!ab.condition || checkCondition(s, ab.condition, source.controller, from))
      )
        mods.push({ times: 2 });
  }
  // Lightning, Army of One : blessures à ce joueur ou à ses permanents doublées jusqu'au prochain tour de Lightning.
  if (victim) for (let i = 0; i < playerStaticTotal(s, victim, "damageTakenDoubled"); i++) mods.push({ times: 2 });
  amount = chooseReplacementOrder(amount, mods, "min");
  let excess = 0;
  if (isPlayer(s, target)) {
    // Suivi des joueurs blessés au combat par cette source ce tour-ci (Steel Hellkite).
    const src = source.id ? s.objects[source.id] : undefined;
    if (combat && src && !src.combatDamagedPlayers?.includes(target)) {
      src.combatDamagedPlayers = [...(src.combatDamagedPlayers ?? []), target];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, amount, combat });
    const hurt = s.players[target];
    if (hurt && !combat && amount > 0) hurt.turnStats.noncombatDamageTaken += amount;
    logDamage(s, source, target, target, true, amount, combat);
    loseLife(s, target, amount);
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
      o.damage += amount;
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
  // Émis avant le déplacement (ordre des événements), complété ensuite par la destination réelle :
  // un remplacement peut exiler la créature (Feu du dragon dévastateur) ou la mélanger dans la bibliothèque.
  const event: Extract<GameEvent, { type: "dies" }> = { type: "dies", objectId: id, defId: o.defId, to: "graveyard" };
  emit(event);
  const landed: { to?: Zone } = {};
  moveObject(s, id, "graveyard", { landed });
  if (landed.to) event.to = landed.to;
  removeFromCombat(s, id);
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
  putIntoGraveyard(s, id);
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

/** `enters` : modifications d'arrivée imposées par l'effet (engagés, attaquants, marqueurs), avant l'événement d'arrivée. */
export function createTokens(
  s: GameState,
  controller: PlayerId,
  t: TokenSpec,
  count: number,
  extras = true,
  enters: EntersContext = {},
): ObjectId[] {
  // Draconic Visitor : les jetons d'artefact deviennent des Dragons 5/5 volants.
  if (t.types.includes("Artifact")) {
    const replacement = playerStatics(s, controller, "replaceArtifactTokens").find(({ ab }) => !!ab.replaceArtifactTokens)?.ab
      .replaceArtifactTokens;
    if (replacement) t = replacement;
  }
  const created: ObjectId[] = [];
  // Worldwalker Helm : « ces jetons plus un jeton Carte supplémentaire » (la Carte elle-même n'en ajoute pas).
  const extraMap =
    t.types.includes("Artifact") && t.name !== "Map"
      ? playerStatics(s, controller, "extraMapToken").find(({ ab }) => !!ab.extraMapToken)?.ab.extraMapToken
      : undefined;
  // Moonlit Meditation : la première fois de chaque tour, des copies du permanent enchanté à la place.
  const meditation = playerStatics(s, controller, "tokensAsCopiesOfAttached").find(
    ({ id, ab }) =>
      !!id &&
      !!ab.tokensAsCopiesOfAttached &&
      !s.turn.onceFired.includes(`copies:${id}`) &&
      !!s.objects[id]?.attachedTo &&
      !!s.objects[s.objects[id]?.attachedTo ?? ""],
  );
  if (meditation?.id) {
    s.turn.onceFired.push(`copies:${meditation.id}`);
    const model = s.objects[s.objects[meditation.id]?.attachedTo ?? ""];
    if (model) {
      const n = count * tokenMultiplier(s, controller, !!s.defs[model.defId]?.types.includes("Creature"));
      for (let i = 0; i < n; i++) created.push(createTokenCopy(s, controller, model.defId));
      return created;
    }
  }
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
      keywords: t.keywords ?? [],
      abilities: t.abilities ?? [],
      text: t.text ?? "",
      implemented: true,
      isToken: true,
    };
    s.defs[defId] = def;
  }
  // Doubling Season : « crée deux fois plus de ces jetons ».
  const n = count * tokenMultiplier(s, controller, t.types.includes("Creature"));
  for (let i = 0; i < n; i++) {
    const o = createObject(s, defId, controller, "battlefield", { isToken: true });
    o.timestamp = nextTimestamp(s);
    // Remplacements d'arrivée des autres permanents (« chaque créature que vous contrôlez arrive avec… »).
    applyEntersReplacements(s, o, enters);
    emit({ type: "token", objectId: o.id, defId, controller });
    rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
    created.push(o.id);
  }
  if (extraMap) created.push(...createTokens(s, controller, extraMap, 1));
  // Quina, Qu Gourmet : « ces jetons plus un jeton Grenouille 1/1 » (le jeton ajouté ne déclenche pas le remplacement).
  if (extras && count > 0) {
    for (const { ab } of playerStatics(s, controller, "extraToken")) {
      if (ab.extraToken) created.push(...createTokens(s, controller, ab.extraToken, 1, false));
    }
  }
  return created;
}

/** Jeton copie d'une carte : mêmes valeurs copiables (sa définition), mais c'est un jeton (707.2). */
export function createTokenCopy(s: GameState, controller: PlayerId, defId: string, enters: EntersContext = {}): ObjectId {
  const o = createObject(s, defId, controller, "battlefield", { isToken: true });
  o.timestamp = nextTimestamp(s);
  applyEntersReplacements(s, o, enters);
  emit({ type: "token", objectId: o.id, defId, controller });
  rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
  return o.id;
}
