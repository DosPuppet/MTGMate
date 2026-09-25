/**
 * Structure du tour (500–514), priorité (117), combat (506–511) et actions basées sur l'état (704).
 */
import { type DamageSource, dealDamage, destroy, drawCard, putIntoGraveyard, sourceFromObject } from "./actions";
import { ask } from "./choices";
import { RulesError, resolveTop } from "./stack";
import {
  alivePlayers,
  apnapOrder,
  bump,
  changeCounters,
  chars,
  counterCount,
  creaturesControlledBy,
  emit,
  emptyPool,
  emptyTurnStats,
  hasKeyword,
  hasType,
  isCreature,
  isSummoningSick,
  M1M1,
  moveObject,
  nextPlayer,
  obj,
  onBattlefield,
  opponentsOf,
  P1P1,
  rulesEvent,
  shuffle,
} from "./state";
import { matchesObjectFilter } from "./targets";
import { processTriggers, releaseDelayedTriggers, simultaneously } from "./triggers";
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
        // 117.5 : actions basées sur l'état, puis capacités déclenchées, jusqu'à stabilité ;
        // l'une ou l'autre peut poser une question (règle des légendes, cibles…).
        stateBasedActions(s);
        if (s.over || s.pending) break;
        if (processTriggers(s)) break;
        s.pending = { kind: "priority", player: s.priority.holder };
        break;
      case "stepEnd":
        endStep(s);
        break;
      case "tba":
      case "resolving":
        throw new Error(`Décision attendue (${s.flow}) mais aucune n'est posée`);
      case "over":
        return;
    }
  }
}

function givePriority(s: GameState): void {
  s.priority = { holder: s.turn.active, passes: 0 };
  s.flow = "priority";
}

/** Début d'étape : déclenche les capacités « au début de… ». */
function stepEvent(s: GameState): void {
  if (s.turn.step === "end") releaseDelayedTriggers(s);
  rulesEvent(s, { e: "step", step: s.turn.step, active: s.turn.active });
}

// ---------------------------------------------------------------------------
// Mulligan de Londres (103.5)
// ---------------------------------------------------------------------------

function nextMulligan(s: GameState): void {
  const p = s.mulliganQueue[0];
  if (!p) {
    if (askLeylines(s)) return;
    s.turn.number = 1;
    s.turn.active = s.turn.startingPlayer;
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    emit({ type: "turnStart", turn: 1, player: s.turn.active });
    s.flow = "stepStart";
    return;
  }
  s.pending = { kind: "mulligan", player: p, mulligans: s.players[p]?.mulligans ?? 0 };
}

/** Cartes « leyline » de la main de départ (103.6), proposées dans l'ordre de jeu. Renvoie true si une question est posée. */
function askLeylines(s: GameState): boolean {
  const asked = (s.leylineAsked ??= []);
  const start = s.playerOrder.indexOf(s.turn.startingPlayer);
  const order = s.playerOrder.map((_, i) => s.playerOrder[(start + i) % s.playerOrder.length] as PlayerId);
  for (const p of order) {
    if (asked.includes(p)) continue;
    asked.push(p);
    const cards = (s.players[p]?.hand ?? []).filter((id) => s.defs[obj(s, id).defId]?.leyline);
    if (cards.length === 0) continue;
    ask(
      s,
      p,
      {
        type: "pick",
        intent: "leyline",
        prompt: "Cartes de votre main de départ que vous pouvez mettre sur le champ de bataille",
        options: cards,
        min: 0,
        max: cards.length,
        suggested: cards,
      },
      { kind: "leyline", player: p },
    );
    return true;
  }
  return false;
}

export function answerLeylines(s: GameState, player: PlayerId, cards: ObjectId[]): void {
  for (const id of cards) {
    const o = s.objects[id];
    if (o?.zone === "hand" && o.owner === player && s.defs[o.defId]?.leyline) moveObject(s, id, "battlefield");
  }
  s.flow = "mulligan";
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
  if (s.turn.step !== "untap" && s.turn.step !== "cleanup") stepEvent(s);
  switch (s.turn.step) {
    case "untap":
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (o.controller !== active || !o.tapped) continue;
        if (hasKeyword(s, id, "doesntUntap")) continue;
        // 122.1d : un marqueur d'étourdissement est retiré à la place du dégagement.
        if (counterCount(o, "stun") > 0) changeCounters(s, o, "stun", -1);
        else {
          o.tapped = false;
          rulesEvent(s, { e: "untap", objectId: id });
        }
      }
      s.flow = "stepEnd"; // pas de priorité pendant l'étape de dégagement
      return;
    case "draw":
      // 103.8a : en duel, le joueur qui commence ne pioche pas lors de son premier tour
      // (103.8c : en multijoueur, personne ne saute sa pioche).
      if (s.turn.number > 1 || s.playerOrder.length > 2) drawCard(s, active);
      givePriority(s);
      return;
    case "beginCombat":
      s.combat = emptyCombat();
      givePriority(s);
      return;
    case "declareAttackers":
      if (attackCandidates(s, active).length > 0) {
        s.pending = { kind: "declareAttackers", player: active };
        s.flow = "tba";
      } else givePriority(s);
      return;
    case "declareBlockers": {
      // Chaque joueur attaqué déclare ses bloqueurs, dans l'ordre APNAP.
      // (Les règles les veulent simultanés ; l'ordre séquentiel est une simplification assumée.)
      const c = s.combat ?? emptyCombat();
      s.combat = c;
      c.blockQueue = apnapOrder(s).filter(
        (p) => p !== active && c.attackers.some((a) => defendingPlayer(s, a.defender) === p) && hasAnyLegalBlock(s, p),
      );
      nextBlockingPlayer(s);
      return;
    }
    case "firstStrikeDamage":
      startCombatDamage(s, true);
      return;
    case "combatDamage":
      startCombatDamage(s, false);
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
  s.replacements = [];
  bump(s);
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
  if (s.turn.step === "endCombat") {
    s.combat = null;
    bump(s);
  }
  // Dernières informations connues : plus nécessaires une fois la pile vide et l'étape finie.
  s.lki = {};
  const next = nextStep(s);
  if (next) {
    s.turn.step = next;
    emit({ type: "step", step: next });
  } else {
    s.turn.number += 1;
    s.turn.active = nextPlayer(s, s.turn.active);
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    s.turn.landsPlayed = 0;
    s.turn.attacked = false;
    s.turn.creatureDied = false;
    emit({ type: "turnStart", turn: s.turn.number, player: s.turn.active });
  }
  s.flow = "stepStart";
}

// ---------------------------------------------------------------------------
// Priorité
// ---------------------------------------------------------------------------

/** 117.3b : après la résolution, le joueur actif reçoit la priorité. */
export function afterResolution(s: GameState): void {
  s.priority = { holder: s.turn.active, passes: 0 };
  s.flow = "priority";
}

function startTurnOf(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (player) player.lastTurnStarted = s.turn.number;
  // Les statistiques « ce tour-ci » repartent de zéro pour tout le monde.
  for (const q of s.playerOrder) {
    const pl = s.players[q];
    if (pl) pl.turnStats = emptyTurnStats();
  }
  s.turn.onceFired = [];
  s.turn.mayCastFromGraveyard = [];
  s.turn.mayPlayFromExile = [];
}

export function emptyCombat(): NonNullable<GameState["combat"]> {
  return { attackers: [], blockers: [], firstStrikers: [], blockQueue: [], damageStep: null, assignQueue: [], assignments: {} };
}

/** 117.3d : la priorité passe au joueur suivant ; si tous passent à la suite, la pile se résout ou l'étape se termine. */
export function passPriority(s: GameState, player: PlayerId): void {
  s.priority.passes += 1;
  if (s.priority.passes >= alivePlayers(s).length) {
    if (s.stack.length > 0) {
      if (resolveTop(s)) afterResolution(s);
    } else {
      s.flow = "stepEnd";
    }
  } else {
    s.priority.holder = nextPlayer(s, player);
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
  return !hasKeyword(s, id, "defender") && !hasKeyword(s, id, "cantAttack");
}

/** Créatures qui « attaquent à chaque combat si possible » (508.1d). */
export function forcedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  return attackCandidates(s, player).filter((id) => hasKeyword(s, id, "mustAttack"));
}

export function attackCandidates(s: GameState, player: PlayerId): ObjectId[] {
  return creaturesControlledBy(s, player).filter((id) => canAttack(s, id));
}

/** Joueur défenseur d'une attaque : le joueur attaqué, ou le contrôleur du planeswalker attaqué (dernier connu s'il est parti). */
export function defendingPlayer(s: GameState, defender: string): PlayerId {
  if (s.players[defender]) return defender;
  return s.objects[defender]?.controller ?? s.lki[defender]?.controller ?? defender;
}

/** Ce qu'un joueur peut attaquer : ses adversaires et leurs planeswalkers (506.2). */
export function attackableDefenders(s: GameState, player: PlayerId): string[] {
  const opps = opponentsOf(s, player);
  const walkers = s.battlefield.filter((id) => opps.includes(obj(s, id).controller) && hasType(s, id, "Planeswalker"));
  return [...opps, ...walkers];
}

export function declareAttackers(s: GameState, player: PlayerId, attackers: { id: ObjectId; defender: string }[]): void {
  const seen = new Set<ObjectId>();
  const defenders = attackableDefenders(s, player);
  for (const a of attackers) {
    if (seen.has(a.id)) throw new RulesError("Créature déclarée deux fois");
    seen.add(a.id);
    if (!canAttack(s, a.id) || obj(s, a.id).controller !== player) throw new RulesError("Cette créature ne peut pas attaquer");
    if (!defenders.includes(a.defender)) throw new RulesError("Joueur ou planeswalker défenseur invalide");
  }
  // 508.1d : les créatures qui « attaquent à chaque combat si possible » doivent être déclarées.
  const forced = attackCandidates(s, player).filter((id) => hasKeyword(s, id, "mustAttack") && !seen.has(id));
  if (forced.length > 0) throw new RulesError(`${chars(s, forced[0] as ObjectId).name} doit attaquer si elle le peut`);
  if (!s.combat) s.combat = emptyCombat();
  for (const a of attackers) {
    if (!hasKeyword(s, a.id, "vigilance")) obj(s, a.id).tapped = true;
    s.combat.attackers.push({ id: a.id, defender: a.defender, blockers: [], blocked: false });
  }
  bump(s);
  for (const a of attackers) rulesEvent(s, { e: "attack", attacker: a.id, defender: a.defender });
  if (attackers.length > 0) rulesEvent(s, { e: "attackWith", player, count: attackers.length });
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
  if (!a || !onBattlefield(s, attacker) || b.controller !== defendingPlayer(s, a.defender)) return false;
  if (hasKeyword(s, blocker, "cantBlock") || hasKeyword(s, attacker, "unblockable")) return false;
  if (hasKeyword(s, attacker, "flying") && !hasKeyword(s, blocker, "flying") && !hasKeyword(s, blocker, "reach")) return false;
  if (hasKeyword(s, attacker, "cantBeBlockedByWalls") && chars(s, blocker).subtypes.includes("Wall")) return false;
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
  c.blockers.push(...blocks.map((b) => ({ id: b.blocker, attacker: b.attacker })));
  for (const a of c.attackers) {
    if (defendingPlayer(s, a.defender) !== player) continue;
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
  nextBlockingPlayer(s);
}

function nextBlockingPlayer(s: GameState): void {
  const p = s.combat?.blockQueue.shift();
  if (p) {
    s.pending = { kind: "declareBlockers", player: p };
    s.flow = "tba";
  } else givePriority(s);
}

/** Blessures mortelles restantes pour une créature (702.2c : 1 suffit avec le contact mortel). */
function lethalFor(s: GameState, id: ObjectId, deathtouch: boolean): number {
  const remaining = Math.max(0, chars(s, id).toughness - obj(s, id).damage);
  return deathtouch ? Math.min(1, remaining) : remaining;
}

function dealsDamageNow(s: GameState, id: ObjectId, firstStrikeStep: boolean): boolean {
  const kw = chars(s, id).keywords;
  if (firstStrikeStep) return kw.includes("firstStrike") || kw.includes("doubleStrike");
  return !s.combat?.firstStrikers.includes(id) || kw.includes("doubleStrike");
}

/** Répartition par défaut : tuer le plus de bloqueurs possible, le reste au joueur si piétinement. */
function defaultAssignment(s: GameState, attacker: ObjectId): Record<string, number> {
  const a = s.combat?.attackers.find((x) => x.id === attacker);
  const out: Record<string, number> = {};
  if (!a) return out;
  const src = sourceFromObject(s, attacker);
  const deathtouch = src.keywords.includes("deathtouch");
  const trample = src.keywords.includes("trample");
  const blockers = a.blockers.filter((b) => onBattlefield(s, b));
  const order = [...blockers].sort((x, y) => lethalFor(s, x, deathtouch) - lethalFor(s, y, deathtouch));
  let remaining = Math.max(0, chars(s, attacker).power);
  for (const b of order) {
    const amount = Math.min(remaining, lethalFor(s, b, deathtouch));
    out[b] = amount;
    remaining -= amount;
  }
  if (remaining > 0) {
    if (trample) out[a.defender] = remaining;
    else if (order[0]) out[order[0]] = (out[order[0]] ?? 0) + remaining;
  }
  return out;
}

/**
 * 510.1 : chaque attaquant bloqué répartit ses blessures. Un vrai choix n'existe que s'il y a plusieurs
 * bloqueurs, ou un bloqueur et le piétinement : on pose alors la question au contrôleur de l'attaquant.
 */
function startCombatDamage(s: GameState, firstStrikeStep: boolean): void {
  const c = s.combat;
  if (!c) {
    givePriority(s);
    return;
  }
  c.damageStep = firstStrikeStep ? "first" : "regular";
  c.assignments = {};
  c.assignQueue = c.attackers
    .filter((a) => {
      if (!a.blocked || !onBattlefield(s, a.id) || !dealsDamageNow(s, a.id, firstStrikeStep)) return false;
      if (chars(s, a.id).power <= 0) return false;
      const alive = a.blockers.filter((b) => onBattlefield(s, b)).length;
      return alive >= 2 || (alive === 1 && hasKeyword(s, a.id, "trample"));
    })
    .map((a) => a.id);
  nextCombatAssignment(s);
}

function nextCombatAssignment(s: GameState): void {
  const c = s.combat;
  if (!c) {
    givePriority(s);
    return;
  }
  const attacker = c.assignQueue.shift();
  if (!attacker) {
    combatDamage(s, c.damageStep === "first");
    c.damageStep = null;
    givePriority(s);
    return;
  }
  const a = c.attackers.find((x) => x.id === attacker);
  if (!a) {
    nextCombatAssignment(s);
    return;
  }
  const src = sourceFromObject(s, attacker);
  const deathtouch = src.keywords.includes("deathtouch");
  const trample = src.keywords.includes("trample");
  const blockers = a.blockers.filter((b) => onBattlefield(s, b));
  const among = trample ? [...blockers, a.defender] : blockers;
  const suggestedMap = defaultAssignment(s, attacker);
  ask(
    s,
    obj(s, attacker).controller,
    {
      type: "divide",
      intent: "combatDamage",
      prompt: `Répartissez les ${chars(s, attacker).power} blessures de ${s.defs[obj(s, attacker).defId]?.name ?? "l'attaquant"}`,
      among,
      total: chars(s, attacker).power,
      lethal: trample
        ? { player: a.defender, needs: Object.fromEntries(blockers.map((b) => [b, lethalFor(s, b, deathtouch)])) }
        : undefined,
      suggested: among.map((id) => suggestedMap[id] ?? 0),
      autoOk: true,
    },
    { kind: "combatDamage", attacker },
  );
  s.flow = "tba";
}

export function answerCombatAssignment(s: GameState, attacker: ObjectId, division: Record<string, number>): void {
  if (!s.combat) throw new RulesError("Pas de combat en cours");
  s.combat.assignments[attacker] = division;
  nextCombatAssignment(s);
}

function combatDamage(s: GameState, firstStrikeStep: boolean): void {
  const c = s.combat;
  if (!c) return;
  const assignments: { src: DamageSource; target: string; amount: number }[] = [];
  const dealt: ObjectId[] = [];

  for (const a of c.attackers) {
    if (!onBattlefield(s, a.id) || !dealsDamageNow(s, a.id, firstStrikeStep)) continue;
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
    const division = c.assignments[a.id] ?? defaultAssignment(s, a.id);
    for (const [target, amount] of Object.entries(division)) if (amount > 0) assignments.push({ src, target, amount });
  }

  for (const b of c.blockers) {
    if (!onBattlefield(s, b.id) || !onBattlefield(s, b.attacker) || !dealsDamageNow(s, b.id, firstStrikeStep)) continue;
    const power = chars(s, b.id).power;
    if (power <= 0) continue;
    dealt.push(b.id);
    assignments.push({ src: sourceFromObject(s, b.id), target: b.attacker, amount: power });
  }

  if (firstStrikeStep) c.firstStrikers = dealt;
  // 510.2 : toutes les blessures de combat sont infligées simultanément.
  simultaneously(s, () => {
    for (const x of assignments) dealDamage(s, x.src, x.target, x.amount, true);
  });
}

// ---------------------------------------------------------------------------
// Actions basées sur l'état (704)
// ---------------------------------------------------------------------------

export function checkGameOver(s: GameState): void {
  const losers: PlayerId[] = [];
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (!player || player.lost) continue;
    if (player.life <= 0 || player.drewFromEmptyLibrary) {
      losers.push(p);
      emit({ type: "lose", player: p, reason: player.life <= 0 ? "life" : "draw" });
    }
  }
  eliminate(s, losers);
}

/**
 * Élimine des joueurs. Si au plus un joueur reste, la partie se termine ; sinon (800.4a)
 * leurs objets quittent la partie et le jeu continue sans eux.
 */
export function eliminate(s: GameState, losers: PlayerId[]): void {
  if (losers.length === 0) return;
  const holderLeaving = losers.includes(s.priority.holder);
  const activeLeaving = losers.includes(s.turn.active);
  for (const p of losers) {
    const player = s.players[p];
    if (player) player.lost = true;
  }
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    s.over = true;
    s.winner = alive[0] ?? null;
    s.flow = "over";
    s.pending = null;
    emit({ type: "gameOver", winner: s.winner });
    return;
  }
  for (const p of losers) removePlayerObjects(s, p);
  s.mulliganQueue = s.mulliganQueue.filter((q) => !losers.includes(q));
  const pendingLeaving = !!s.pending && losers.includes(s.pending.player);
  if (pendingLeaving) s.pending = null;
  if (s.flow === "mulligan") return;
  if (activeLeaving) {
    // Simplification : le tour d'un joueur qui quitte la partie s'arrête immédiatement.
    s.combat = null;
    bump(s);
    s.turn.step = "cleanup";
    s.flow = "stepEnd";
  } else if (pendingLeaving && s.flow === "tba") {
    nextBlockingPlayer(s); // seul cas où un joueur non actif doit une action de tour
  } else if (holderLeaving) {
    s.priority = { holder: nextPlayer(s, s.priority.holder), passes: 0 };
  }
}

function removePlayerObjects(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  bump(s);
  for (const o of Object.values(s.objects)) {
    if (o.owner !== p && o.controller === p && o.zone === "battlefield") moveObject(s, o.id, "exile");
  }
  const gone = new Set(
    Object.values(s.objects)
      .filter((o) => o.owner === p)
      .map((o) => o.id),
  );
  for (const id of gone) delete s.objects[id];
  player.library = [];
  player.hand = [];
  player.graveyard = [];
  player.command = [];
  s.battlefield = s.battlefield.filter((id) => !gone.has(id));
  s.exile = s.exile.filter((id) => !gone.has(id));
  s.stack = s.stack.filter((item) => item.controller !== p && (item.kind === "ability" || !gone.has(item.sourceId)));
  if (s.combat) {
    s.combat.attackers = s.combat.attackers.filter((a) => !gone.has(a.id) && defendingPlayer(s, a.defender) !== p);
    s.combat.blockers = s.combat.blockers.filter((b) => !gone.has(b.id));
    s.combat.blockQueue = s.combat.blockQueue.filter((q) => q !== p);
    for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => !gone.has(b));
  }
  s.effects = s.effects.filter((e) => e.affected.some((id) => !gone.has(id)));
}

export function stateBasedActions(s: GameState): void {
  simultaneously(s, () => stateBasedActionsOnce(s));
}

function stateBasedActionsOnce(s: GameState): void {
  for (let guard = 0; guard < 100; guard++) {
    checkGameOver(s);
    if (s.over) return;
    const toGraveyard: ObjectId[] = [];
    const toDestroy: ObjectId[] = [];
    let changed = false;

    for (const id of s.battlefield) {
      const o = obj(s, id);
      // 704.5q : les marqueurs +1/+1 et -1/-1 s'annulent.
      const both = Math.min(counterCount(o, P1P1), counterCount(o, M1M1));
      if (both > 0) {
        changeCounters(s, o, P1P1, -both);
        changeCounters(s, o, M1M1, -both);
        changed = true;
      }
      // 704.5i : un planeswalker sans marqueur de loyauté va au cimetière.
      if (hasType(s, id, "Planeswalker") && counterCount(o, "loyalty") <= 0) {
        toGraveyard.push(id);
        continue;
      }
      if (!isCreature(s, id)) continue;
      const c = chars(s, id);
      if (c.toughness <= 0)
        toGraveyard.push(id); // 704.5f
      else if (o.damage >= c.toughness || (o.deathtouched && o.damage > 0)) toDestroy.push(id); // 704.5g–h
    }

    // 704.5m–n : Auras attachées illégalement (cimetière), Équipements attachés illégalement (détachés).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const d = s.defs[o.defId];
      if (d?.enchant) {
        const host = o.attachedTo;
        const legal =
          !!host && host !== id && onBattlefield(s, host) && matchesObjectFilter(s, o.controller, host, d.enchant.filter, id);
        if (!legal) toGraveyard.push(id);
      } else if (o.attachedTo && !(onBattlefield(s, o.attachedTo) && isCreature(s, o.attachedTo) && hasType(s, id, "Artifact"))) {
        o.attachedTo = undefined;
        bump(s);
        changed = true;
      }
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
    let legendChoice: { player: PlayerId; ids: ObjectId[] } | null = null;
    for (const ids of legends.values()) {
      if (ids.length < 2) continue;
      legendChoice ??= { player: obj(s, ids[0] as ObjectId).controller, ids };
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
    if (changed) continue;
    if (legendChoice) {
      // 704.5j : le joueur choisit la légende qu'il garde ; les autres vont au cimetière.
      const newest = [...legendChoice.ids].sort((x, y) => obj(s, y).timestamp - obj(s, x).timestamp)[0] as ObjectId;
      ask(
        s,
        legendChoice.player,
        {
          type: "pick",
          intent: "legend",
          prompt: `Règle des légendes : choisissez le ${s.defs[obj(s, newest).defId]?.name ?? "permanent"} à garder`,
          options: legendChoice.ids,
          min: 1,
          max: 1,
          suggested: [newest],
        },
        { kind: "legend" },
      );
    }
    return;
  }
}

export function answerLegendChoice(s: GameState, keep: ObjectId, options: ObjectId[]): void {
  for (const id of options) if (id !== keep && onBattlefield(s, id)) putIntoGraveyard(s, id);
}
