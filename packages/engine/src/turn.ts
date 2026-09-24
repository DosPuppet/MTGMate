/**
 * Structure du tour (500–514), priorité (117), combat (506–511) et actions basées sur l'état (704).
 */
import { type DamageSource, dealDamage, destroy, drawCard, putIntoGraveyard, sourceFromObject } from "./actions";
import { RulesError, resolveTop } from "./stack";
import {
  chars,
  creaturesControlledBy,
  emit,
  emptyPool,
  hasKeyword,
  isCreature,
  isSummoningSick,
  moveObject,
  obj,
  onBattlefield,
  opponentOf,
  shuffle,
} from "./state";
import type { GameState, ObjectId, PlayerId, Step } from "./types";
import { STEPS } from "./types";

export const MAX_HAND_SIZE = 7;

// ---------------------------------------------------------------------------
// Boucle principale : avance jusqu'à la prochaine décision
// ---------------------------------------------------------------------------

export function advance(s: GameState): void {
  let guard = 0;
  while (!s.pending && !s.over) {
    if (++guard > 100_000) throw new Error("advance : boucle infinie");
    switch (s.flow) {
      case "mulligan":
        nextMulligan(s);
        break;
      case "stepStart":
        beginStep(s);
        break;
      case "priority":
        stateBasedActions(s);
        if (!s.over) s.pending = { kind: "priority", player: s.priority.holder };
        break;
      case "stepEnd":
        endStep(s);
        break;
      case "tba":
        throw new Error("Action de tour en attente sans décision");
      case "over":
        return;
    }
  }
}

function givePriority(s: GameState): void {
  s.priority = { holder: s.turn.active, passes: 0 };
  s.flow = "priority";
}

// ---------------------------------------------------------------------------
// Mulligan de Londres (103.5)
// ---------------------------------------------------------------------------

function nextMulligan(s: GameState): void {
  const p = s.mulliganQueue[0];
  if (!p) {
    s.turn.number = 1;
    s.turn.active = s.turn.startingPlayer;
    s.turn.step = "untap";
    emit({ type: "turnStart", turn: 1, player: s.turn.active });
    s.flow = "stepStart";
    return;
  }
  s.pending = { kind: "mulligan", player: p, mulligans: s.players[p]?.mulligans ?? 0 };
}

export function takeMulligan(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  player.mulligans += 1;
  for (const id of [...player.hand]) moveObject(s, id, "library", { position: "bottom" });
  shuffle(s, player.library);
  for (let i = 0; i < 7; i++) drawCard(s, p);
  emit({ type: "mulligan", player: p, count: player.mulligans });
}

export function keepHand(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  if (player.mulligans > 0) {
    s.pending = { kind: "bottomCards", player: p, count: Math.min(player.mulligans, player.hand.length) };
    return;
  }
  s.mulliganQueue.shift();
  emit({ type: "keep", player: p, handSize: player.hand.length });
}

export function bottomCards(s: GameState, p: PlayerId, cards: ObjectId[], count: number): void {
  const player = s.players[p];
  if (!player) return;
  if (new Set(cards).size !== count || cards.some((c) => !player.hand.includes(c))) {
    throw new RulesError(`Choisissez ${count} carte(s) de votre main`);
  }
  for (const c of cards) moveObject(s, c, "library", { position: "bottom" });
  s.mulliganQueue.shift();
  emit({ type: "keep", player: p, handSize: player.hand.length });
}

// ---------------------------------------------------------------------------
// Étapes
// ---------------------------------------------------------------------------

function beginStep(s: GameState): void {
  const active = s.turn.active;
  switch (s.turn.step) {
    case "untap":
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (o.controller === active) o.tapped = false;
      }
      s.flow = "stepEnd"; // pas de priorité pendant l'étape de dégagement
      return;
    case "draw":
      // 103.8a : le joueur qui commence ne pioche pas lors de son premier tour.
      if (s.turn.number > 1) drawCard(s, active);
      givePriority(s);
      return;
    case "beginCombat":
      s.combat = { attackers: [], blockers: [], firstStrikers: [] };
      givePriority(s);
      return;
    case "declareAttackers":
      if (attackCandidates(s, active).length > 0) {
        s.pending = { kind: "declareAttackers", player: active };
        s.flow = "tba";
      } else givePriority(s);
      return;
    case "declareBlockers": {
      const defender = opponentOf(s, active);
      if (hasAnyLegalBlock(s, defender)) {
        s.pending = { kind: "declareBlockers", player: defender };
        s.flow = "tba";
      } else givePriority(s);
      return;
    }
    case "firstStrikeDamage":
      combatDamage(s, true);
      givePriority(s);
      return;
    case "combatDamage":
      combatDamage(s, false);
      givePriority(s);
      return;
    case "cleanup": {
      const excess = (s.players[active]?.hand.length ?? 0) - MAX_HAND_SIZE;
      if (excess > 0) {
        s.pending = { kind: "discard", player: active, count: excess };
        s.flow = "tba";
        return;
      }
      finishCleanup(s);
      return;
    }
    default:
      givePriority(s);
  }
}

export function discardToHandSize(s: GameState, p: PlayerId, cards: ObjectId[], count: number): void {
  const player = s.players[p];
  if (!player) return;
  if (new Set(cards).size !== count || cards.some((c) => !player.hand.includes(c))) {
    throw new RulesError(`Défaussez exactement ${count} carte(s)`);
  }
  const defIds = cards.map((c) => obj(s, c).defId);
  for (const c of cards) moveObject(s, c, "graveyard");
  emit({ type: "discard", player: p, defIds });
  finishCleanup(s);
}

function finishCleanup(s: GameState): void {
  // 514.2 : les blessures sont retirées et les effets « jusqu'à la fin du tour » prennent fin.
  for (const id of s.battlefield) {
    const o = obj(s, id);
    o.damage = 0;
    o.deathtouched = false;
  }
  s.effects = s.effects.filter((e) => e.duration !== "endOfTurn");
  s.flow = "stepEnd";
}

function nextStep(s: GameState): Step | null {
  const step = s.turn.step;
  if (step === "cleanup") return null;
  if (step === "declareAttackers" && (s.combat?.attackers.length ?? 0) === 0) return "endCombat";
  if (step === "declareBlockers") {
    const firstStrike = combatants(s).some((id) => hasKeyword(s, id, "firstStrike") || hasKeyword(s, id, "doubleStrike"));
    return firstStrike ? "firstStrikeDamage" : "combatDamage";
  }
  return STEPS[STEPS.indexOf(step) + 1] ?? null;
}

function endStep(s: GameState): void {
  // 500.4 : les réserves de mana se vident à la fin de chaque étape et phase.
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (player) player.manaPool = emptyPool();
  }
  if (s.turn.step === "endCombat") s.combat = null;
  const next = nextStep(s);
  if (next) {
    s.turn.step = next;
    emit({ type: "step", step: next });
  } else {
    s.turn.number += 1;
    s.turn.active = opponentOf(s, s.turn.active);
    s.turn.step = "untap";
    s.turn.landsPlayed = 0;
    s.turn.attacked = false;
    emit({ type: "turnStart", turn: s.turn.number, player: s.turn.active });
  }
  s.flow = "stepStart";
}

// ---------------------------------------------------------------------------
// Priorité
// ---------------------------------------------------------------------------

export function passPriority(s: GameState, player: PlayerId): void {
  s.priority.passes += 1;
  const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
  if (s.priority.passes >= alive.length) {
    if (s.stack.length > 0) {
      resolveTop(s);
      s.priority = { holder: s.turn.active, passes: 0 };
    } else {
      s.flow = "stepEnd";
    }
  } else {
    s.priority.holder = opponentOf(s, player);
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function combatants(s: GameState): ObjectId[] {
  if (!s.combat) return [];
  return [...s.combat.attackers.map((a) => a.id), ...s.combat.blockers.map((b) => b.id)].filter((id) => onBattlefield(s, id));
}

export function canAttack(s: GameState, id: ObjectId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || !isCreature(s, id)) return false;
  if (o.controller !== s.turn.active || o.tapped || isSummoningSick(s, id)) return false;
  return !hasKeyword(s, id, "defender");
}

export function attackCandidates(s: GameState, player: PlayerId): ObjectId[] {
  return creaturesControlledBy(s, player).filter((id) => canAttack(s, id));
}

export function declareAttackers(s: GameState, player: PlayerId, attackers: { id: ObjectId; defender: PlayerId }[]): void {
  const seen = new Set<ObjectId>();
  for (const a of attackers) {
    if (seen.has(a.id)) throw new RulesError("Créature déclarée deux fois");
    seen.add(a.id);
    if (!canAttack(s, a.id) || obj(s, a.id).controller !== player) throw new RulesError("Cette créature ne peut pas attaquer");
    if (a.defender !== opponentOf(s, player)) throw new RulesError("Joueur défenseur invalide");
  }
  if (!s.combat) s.combat = { attackers: [], blockers: [], firstStrikers: [] };
  for (const a of attackers) {
    if (!hasKeyword(s, a.id, "vigilance")) obj(s, a.id).tapped = true;
    s.combat.attackers.push({ id: a.id, defender: a.defender, blockers: [], blocked: false });
  }
  s.turn.attacked = attackers.length > 0;
  if (attackers.length > 0) {
    emit({ type: "attack", player, attackers: attackers.map((a) => ({ id: a.id, defId: obj(s, a.id).defId })) });
  }
  givePriority(s);
}

export function canBlock(s: GameState, blocker: ObjectId, attacker: ObjectId): boolean {
  const b = s.objects[blocker];
  if (b?.zone !== "battlefield" || !isCreature(s, blocker) || b.tapped) return false;
  const a = s.combat?.attackers.find((x) => x.id === attacker);
  if (!a || !onBattlefield(s, attacker) || b.controller !== a.defender) return false;
  if (hasKeyword(s, attacker, "flying") && !hasKeyword(s, blocker, "flying") && !hasKeyword(s, blocker, "reach")) return false;
  return true;
}

/** Pour chaque bloqueur potentiel, les attaquants qu'il peut bloquer. */
export function blockCandidates(s: GameState, player: PlayerId): { blocker: ObjectId; attackers: ObjectId[] }[] {
  const attackers = s.combat?.attackers.map((a) => a.id) ?? [];
  return creaturesControlledBy(s, player)
    .map((blocker) => ({ blocker, attackers: attackers.filter((a) => canBlock(s, blocker, a)) }))
    .filter((c) => c.attackers.length > 0);
}

function hasAnyLegalBlock(s: GameState, player: PlayerId): boolean {
  const cands = blockCandidates(s, player);
  return (s.combat?.attackers ?? []).some((a) => {
    const n = cands.filter((c) => c.attackers.includes(a.id)).length;
    return hasKeyword(s, a.id, "menace") ? n >= 2 : n >= 1;
  });
}

export function declareBlockers(s: GameState, player: PlayerId, blocks: { blocker: ObjectId; attacker: ObjectId }[]): void {
  const c = s.combat;
  if (!c) throw new RulesError("Pas de combat en cours");
  const seen = new Set<ObjectId>();
  for (const b of blocks) {
    if (seen.has(b.blocker)) throw new RulesError("Une créature ne peut bloquer qu'un attaquant");
    seen.add(b.blocker);
    if (obj(s, b.blocker).controller !== player || !canBlock(s, b.blocker, b.attacker)) {
      throw new RulesError("Blocage illégal");
    }
  }
  for (const a of c.attackers) {
    const n = blocks.filter((b) => b.attacker === a.id).length;
    if (n === 1 && hasKeyword(s, a.id, "menace"))
      throw new RulesError("Une créature avec la menace doit être bloquée par au moins deux créatures");
  }
  c.blockers = blocks.map((b) => ({ id: b.blocker, attacker: b.attacker }));
  for (const a of c.attackers) {
    a.blockers = blocks.filter((b) => b.attacker === a.id).map((b) => b.blocker);
    a.blocked = a.blockers.length > 0;
  }
  if (blocks.length > 0) {
    emit({
      type: "block",
      player,
      blocks: blocks.map((b) => ({ ...b, blockerDefId: obj(s, b.blocker).defId, attackerDefId: obj(s, b.attacker).defId })),
    });
  }
  givePriority(s);
}

/** Blessures mortelles restantes pour une créature (702.2c : 1 suffit avec le contact mortel). */
function lethalFor(s: GameState, id: ObjectId, deathtouch: boolean): number {
  const remaining = Math.max(0, chars(s, id).toughness - obj(s, id).damage);
  return deathtouch ? Math.min(1, remaining) : remaining;
}

function combatDamage(s: GameState, firstStrikeStep: boolean): void {
  const c = s.combat;
  if (!c) return;
  const dealsNow = (id: ObjectId) => {
    const kw = chars(s, id).keywords;
    if (firstStrikeStep) return kw.includes("firstStrike") || kw.includes("doubleStrike");
    return !c.firstStrikers.includes(id) || kw.includes("doubleStrike");
  };
  const assignments: { src: DamageSource; target: string; amount: number }[] = [];
  const dealt: ObjectId[] = [];

  for (const a of c.attackers) {
    if (!onBattlefield(s, a.id) || !dealsNow(a.id)) continue;
    const power = chars(s, a.id).power;
    if (power <= 0) continue;
    dealt.push(a.id);
    const src = sourceFromObject(s, a.id);
    const trample = src.keywords.includes("trample");
    if (!a.blocked) {
      assignments.push({ src, target: a.defender, amount: power });
      continue;
    }
    const blockers = a.blockers.filter((b) => onBattlefield(s, b));
    if (blockers.length === 0) {
      // 702.19e : un attaquant bloqué avec le piétinement dont les bloqueurs ont disparu blesse le joueur.
      if (trample) assignments.push({ src, target: a.defender, amount: power });
      continue;
    }
    // Répartition automatique : tuer le plus de bloqueurs possible, le reste au joueur si piétinement.
    const deathtouch = src.keywords.includes("deathtouch");
    const order = [...blockers].sort((x, y) => lethalFor(s, x, deathtouch) - lethalFor(s, y, deathtouch));
    let remaining = power;
    const perBlocker = new Map<ObjectId, number>();
    for (const b of order) {
      const amount = Math.min(remaining, lethalFor(s, b, deathtouch));
      perBlocker.set(b, amount);
      remaining -= amount;
    }
    if (remaining > 0) {
      if (trample) assignments.push({ src, target: a.defender, amount: remaining });
      else {
        const first = order[0] as ObjectId;
        perBlocker.set(first, (perBlocker.get(first) ?? 0) + remaining);
      }
    }
    for (const [b, amount] of perBlocker) if (amount > 0) assignments.push({ src, target: b, amount });
  }

  for (const b of c.blockers) {
    if (!onBattlefield(s, b.id) || !onBattlefield(s, b.attacker) || !dealsNow(b.id)) continue;
    const power = chars(s, b.id).power;
    if (power <= 0) continue;
    dealt.push(b.id);
    assignments.push({ src: sourceFromObject(s, b.id), target: b.attacker, amount: power });
  }

  if (firstStrikeStep) c.firstStrikers = dealt;
  // 510.2 : toutes les blessures de combat sont infligées simultanément.
  for (const x of assignments) dealDamage(s, x.src, x.target, x.amount, true);
}

// ---------------------------------------------------------------------------
// Actions basées sur l'état (704)
// ---------------------------------------------------------------------------

export function checkGameOver(s: GameState): void {
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (!player || player.lost) continue;
    if (player.life <= 0 || player.drewFromEmptyLibrary) {
      player.lost = true;
      emit({ type: "lose", player: p, reason: player.life <= 0 ? "life" : "draw" });
    }
  }
  const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
  if (alive.length < s.playerOrder.length && alive.length <= 1) {
    s.over = true;
    s.winner = alive[0] ?? null;
    s.flow = "over";
    s.pending = null;
    emit({ type: "gameOver", winner: s.winner });
  }
}

export function stateBasedActions(s: GameState): void {
  for (let guard = 0; guard < 100; guard++) {
    checkGameOver(s);
    if (s.over) return;
    const toGraveyard: ObjectId[] = [];
    const toDestroy: ObjectId[] = [];
    let changed = false;

    for (const id of s.battlefield) {
      const o = obj(s, id);
      // 704.5q : les marqueurs +1/+1 et -1/-1 s'annulent.
      const both = Math.min(o.counters.p1p1, o.counters.m1m1);
      if (both > 0) {
        o.counters.p1p1 -= both;
        o.counters.m1m1 -= both;
        changed = true;
      }
      if (!isCreature(s, id)) continue;
      const c = chars(s, id);
      if (c.toughness <= 0)
        toGraveyard.push(id); // 704.5f
      else if (o.damage >= c.toughness || (o.deathtouched && o.damage > 0)) toDestroy.push(id); // 704.5g–h
    }

    // 704.5j : règle des légendes (v1 : on garde automatiquement le plus récent).
    const legends = new Map<string, ObjectId[]>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const d = s.defs[o.defId];
      if (!d?.supertypes.includes("Legendary")) continue;
      const key = `${o.controller}|${d.name}`;
      legends.set(key, [...(legends.get(key) ?? []), id]);
    }
    for (const ids of legends.values()) {
      if (ids.length < 2) continue;
      const sorted = [...ids].sort((a, b) => obj(s, b).timestamp - obj(s, a).timestamp);
      toGraveyard.push(...sorted.slice(1));
    }

    for (const id of new Set(toGraveyard)) {
      if (onBattlefield(s, id)) {
        putIntoGraveyard(s, id);
        changed = true;
      }
    }
    for (const id of toDestroy) {
      if (onBattlefield(s, id) && destroy(s, id)) changed = true;
    }
    for (const id of s.battlefield) obj(s, id).deathtouched = false;
    if (!changed) return;
  }
}
