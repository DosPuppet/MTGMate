/**
 * Structure du tour (500–514), priorité (117), combat (506–511) et actions basées sur l'état (704).
 */

import {
  type DamageSource,
  dealDamage,
  destroy,
  drawCard,
  drawCards,
  phaseIn,
  putIntoGraveyard,
  removeFromCombat,
  setSpeed,
  sourceFromObject,
} from "./actions";
import { ask, cardRef } from "./choices";
import { syncControl } from "./control";
import { announceDiscard, announceDiscardBatch, evalAmount, moveDiscarded, staticContext } from "./effects";
import { rethrowAsRules } from "./errors";
import { bumpFor, copiedDefId, effectivePower, snapshot } from "./layers";
import { MAX_FLOW_STEPS, MAX_SBA_PASSES } from "./limits";
import { manaValue, payMana } from "./mana";
import { RulesError, resolveTop } from "./stack";
import { announceNext } from "./stackChoices";
import {
  alivePlayers,
  apnapOrder,
  bump,
  changeCounters,
  chars,
  commanderOf,
  counterCount,
  creaturesControlledBy,
  emit,
  emptyPool,
  emptyTurnStats,
  hasKeyword,
  hasType,
  isCreature,
  isPlayer,
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
  tapObject,
  untapObject,
} from "./state";
import {
  addPlayerEffect,
  consumePlayerEffect,
  playerEffectValues,
  playerStatic,
  playerStatics,
  playerStaticTotal,
} from "./statics";
import { matchesObjectFilter, matchesView, protectedFrom, resolveFilter, sourceView } from "./targets";
import { processTriggers, pushInline, releaseDelayedTriggers, simultaneously } from "./triggers";
import { countTurnEvents, logTurnEvent } from "./turnlog";
import type { CardDef, Effect, GameState, ManaType, ObjectFilter, ObjectId, PlayerId, StackItem, Step } from "./types";
import { STEPS } from "./types";

export const MAX_HAND_SIZE = 7;

// ---------------------------------------------------------------------------
// Boucle principale : avance jusqu'à la prochaine décision
// ---------------------------------------------------------------------------

/**
 * 104.4b : une boucle faite seulement d'actions obligatoires, que rien ne peut arrêter : la partie est nulle. Appelée par
 * les gardes du moteur (déroulement, actions basées sur l'état), de l'hôte, et par la détection des boucles (game.ts).
 */
export function declareLoopDraw(s: GameState): void {
  if (s.over) return;
  s.over = true;
  s.winner = null;
  s.flow = "over";
  s.pending = null;
  emit({ type: "gameOver", winner: null, reason: "loop" });
}

export function advance(s: GameState): void {
  let guard = 0;
  while (!s.pending && !s.over) {
    if (++guard > MAX_FLOW_STEPS) {
      declareLoopDraw(s);
      return;
    }
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
        // Un joueur actif éliminé par ces actions met fin au tour (`eliminate` change le flux).
        if (s.over || s.pending || s.flow !== "priority") break;
        // Nouvelles cibles d'une copie, répartition : avant les déclencheurs (la garde en dépend) et la priorité.
        if (announceNext(s)) break;
        if (processTriggers(s) || s.flow !== "priority") break;
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

/**
 * Premier joueur à recevoir la priorité : le joueur actif, ou, s'il a quitté la partie pendant son tour (800.4a :
 * le tour continue sans joueur actif), le joueur suivant.
 */
function firstPriority(s: GameState): PlayerId {
  const active = s.turn.active;
  return s.players[active]?.lost ? nextPlayer(s, active) : active;
}

function givePriority(s: GameState): void {
  s.priority = { holder: firstPriority(s), passes: 0 };
  s.flow = "priority";
}

/** Début d'étape : déclenche les capacités « au début de… ». */
function stepEvent(s: GameState): void {
  if (s.turn.step === "end") releaseDelayedTriggers(s);
  if (s.turn.step === "endCombat") releaseDelayedTriggers(s, "endCombat");
  if (s.turn.step === "main1" || s.turn.step === "main2") releaseDelayedTriggers(s, "main");
  if (s.turn.step === "upkeep") {
    releaseDelayedTriggers(s, "upkeep");
    suspendUpkeep(s);
  }
  rulesEvent(s, { e: "step", step: s.turn.step, active: s.turn.active });
}

/**
 * Suspension (702.62a) : au début de l'entretien de son propriétaire, chaque carte suspendue en exil perd un marqueur
 * de temps ; quand le dernier est retiré, il peut la lancer sans payer son coût de mana (une créature a la célérité).
 */
const SUSPEND_TICK: Effect[] = [
  { op: "removeCounters", what: { kind: "self" }, n: 1, kind: "time" },
  { op: "if", cond: { kind: "not", cond: { kind: "counterAtLeast", counter: "time", n: 1 } }, skip: 2 },
  { op: "playerEffect", ability: { nextSpell: { filter: { types: ["Creature"] }, haste: true } }, once: true },
  { op: "castNow", what: { kind: "self" }, free: true },
];

function suspendUpkeep(s: GameState): void {
  for (const id of s.exile) {
    const o = s.objects[id];
    if (!o?.suspended || o.owner !== s.turn.active || (o.counters.time ?? 0) <= 0) continue;
    pushInline(s, o.owner, id, o.defId, {
      targets: [],
      effects: SUSPEND_TICK,
      label: "Suspension : retirez un marqueur de temps",
    });
  }
}

// ---------------------------------------------------------------------------
// Mulligan de Londres (103.5)
// ---------------------------------------------------------------------------

function nextMulligan(s: GameState): void {
  // 103.5 : fin d'un tour de table ; ceux qui ont décidé de prendre un mulligan le prennent ensemble, puis redécident.
  if (s.mulliganQueue.length === 0 && s.mulliganTaken?.length) {
    const taken = s.mulliganTaken;
    s.mulliganTaken = [];
    for (const q of taken) takeMulligan(s, q);
    s.mulliganQueue = taken;
  }
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
  const mulligans = s.players[p]?.mulligans ?? 0;
  s.pending = { kind: "mulligan", player: p, mulligans, bottom: mulliganBottom(s, mulligans) };
}

/**
 * Cartes à mettre au-dessous de la bibliothèque en gardant après `mulligans` mulligans (103.5) ; 103.5c : dans une
 * partie à plusieurs (trois joueurs ou plus), le premier mulligan ne compte pas.
 */
function mulliganBottom(s: GameState, mulligans: number): number {
  return Math.max(0, mulligans - (s.playerOrder.length > 2 ? 1 : 0));
}

/** Cartes « leyline » de la main de départ (103.6), proposées dans l'ordre de jeu. Renvoie true si une question est posée. */
function askLeylines(s: GameState): boolean {
  s.leylineAsked ??= [];
  const asked = s.leylineAsked;
  const start = s.playerOrder.indexOf(s.turn.startingPlayer);
  const order = s.playerOrder.map((_, i) => s.playerOrder[(start + i) % s.playerOrder.length] as PlayerId);
  for (const p of order) {
    if (asked.includes(p)) continue;
    asked.push(p);
    const cards = (s.players[p]?.hand ?? []).filter((id) => leylineFor(s, p, id));
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

/** La carte de la main de départ peut-elle commencer sur le champ de bataille (Gemstone Caverns : si vous ne commencez pas) ? */
function leylineFor(s: GameState, player: PlayerId, id: ObjectId): CardDef["leyline"] {
  const l = s.defs[obj(s, id).defId]?.leyline;
  return l && (l === true || !l.notStartingPlayer || s.turn.startingPlayer !== player) ? l : undefined;
}

export function answerLeylines(s: GameState, player: PlayerId, cards: ObjectId[]): void {
  for (const id of cards) {
    const o = s.objects[id];
    const l = o?.zone === "hand" && o.owner === player ? leylineFor(s, player, id) : undefined;
    if (!l) continue;
    const placed = moveObject(s, id, "battlefield");
    if (l === true) continue;
    if (l.counter && placed && s.objects[placed]) changeCounters(s, obj(s, placed), l.counter, 1);
    // « Si vous le faites, exilez une carte de votre main » : choix automatique, la carte non-terrain de plus petite
    // valeur de mana (un terrain s'il n'y en a pas).
    if (l.exileFromHand) {
      const hand = s.players[player]?.hand ?? [];
      const mv = (h: ObjectId) => {
        const d = s.defs[obj(s, h).defId];
        return d?.types.includes("Land") ? 100 : manaValue(d?.manaCost);
      };
      const pick = [...hand].sort((a, b) => mv(a) - mv(b))[0];
      if (pick) moveObject(s, pick, "exile");
    }
  }
  s.flow = "mulligan";
}

/** 103.5 : le joueur décide de prendre un mulligan ; il le prendra avec les autres à la fin de ce tour de table. */
export function declareMulligan(s: GameState, p: PlayerId): void {
  s.mulliganQueue = s.mulliganQueue.filter((q) => q !== p);
  s.mulliganTaken = [...(s.mulliganTaken ?? []), p];
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
  const bottom = mulliganBottom(s, player.mulligans);
  if (bottom > 0) {
    s.pending = { kind: "bottomCards", player: p, count: Math.min(bottom, player.hand.length) };
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
  // 505.1a : rang de la phase principale, avant ses déclencheurs (seule la première précède le combat).
  if (s.turn.step === "main1") s.turn.mainPhase = 1;
  else if (s.turn.step === "main2") s.turn.mainPhase = (s.turn.mainPhase ?? 1) + 1;
  if (s.turn.step !== "untap" && s.turn.step !== "cleanup") stepEvent(s);
  switch (s.turn.step) {
    case "untap":
      // 502.1 : le retour en phase précède le dégagement.
      phaseIn(s, active);
      for (const id of s.battlefield) {
        const o = obj(s, id);
        // Prop Room : les créatures de ce joueur se dégagent aussi pendant l'étape de dégagement des autres joueurs.
        const propRoom =
          o.controller !== active && isCreature(s, id) && playerStatic(s, o.controller, "untapCreaturesOnOthersUntap");
        if (o.controller !== active && !propRoom) continue;
        // 701.43 : un permanent épuisé ne se dégage pas lors de la prochaine étape de dégagement (de son contrôleur).
        if (o.exerted && !propRoom) {
          o.exerted = undefined;
          continue;
        }
        if (!o.tapped) continue;
        if (hasKeyword(s, id, "doesntUntap")) continue;
        // Hedge Whisperer : « vous pouvez choisir de ne pas la dégager » (choix automatique : tant que son effet dure).
        if (hasKeyword(s, id, "mayNotUntap") && s.effects.some((e) => e.whileSourceTapped === id)) continue;
        // 122.1d : un marqueur d'étourdissement est retiré à la place du dégagement (`untapObject`).
        if (untapObject(s, o)) {
          const stats = s.players[o.controller]?.turnStats;
          if (stats && o.controller === active) stats.untappedInUntapStep = (stats.untappedInUntapStep ?? 0) + 1;
        }
      }
      s.flow = "stepEnd"; // pas de priorité pendant l'étape de dégagement
      return;
    case "draw":
      // 103.8a : en duel, le joueur qui commence ne pioche pas lors de son premier tour
      // (103.8c : en multijoueur, personne ne saute sa pioche).
      if (s.turn.number > 1 || s.playerOrder.length > 2) {
        drawCards(s, active, 1, true);
      }
      givePriority(s);
      return;
    case "main1":
      // 714.3b : au début de la première phase principale, un marqueur de savoir sur chaque Saga du joueur actif.
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (o.controller === active && s.defs[copiedDefId(s, id)]?.saga) changeCounters(s, o, "lore", 1);
      }
      givePriority(s);
      return;
    case "beginCombat":
      s.combat = emptyCombat();
      s.turn.combats = (s.turn.combats ?? 0) + 1;
      givePriority(s);
      return;
    case "declareAttackers":
      if (attackCandidates(s, active).length > 0) {
        s.pending = { kind: "declareAttackers", player: active };
        s.flow = "tba";
      } else givePriority(s);
      return;
    case "declareBlockers": {
      // Chaque joueur attaqué déclare ses bloqueurs, dans l'ordre APNAP, sans voir ceux des autres : ils sont appliqués
      // ensemble à la fin (509.1).
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
      // 402.2 : taille de main maximale (`null` : « vous n'avez pas de taille de main maximale »).
      const max = maxHandSize(s, active);
      const excess = max === null ? 0 : (s.players[active]?.hand.length ?? 0) - max;
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
  for (const c of cards) announceDiscard(s, p, moveDiscarded(s, p, c));
  announceDiscardBatch(s, p, cards.length);
  emit({ type: "discard", player: p, defIds });
  finishCleanup(s);
}

function finishCleanup(s: GameState): void {
  // 514.2 : les blessures sont retirées et les effets « jusqu'à la fin du tour » prennent fin.
  for (const id of s.battlefield) {
    const o = obj(s, id);
    // Ancient Adamantoise : ses blessures restent.
    if (!hasKeyword(s, id, "keepsDamage")) o.damage = 0;
    o.deathtouched = false;
    delete o.regenShields;
    o.damagedBy = undefined;
    o.combatDamagedPlayers = undefined;
  }
  s.effects = s.effects.filter(
    (e) =>
      e.duration !== "endOfTurn" &&
      !(e.duration === "endOfYourNextTurn" && e.until === s.turn.active && s.turn.number > (e.sinceTurn ?? 0)),
  );
  s.replacements = [];
  // Emblèmes « jusqu'à la fin du tour » (Jace Reawakened −6, Prairie Dog).
  for (const p of s.playerOrder) {
    for (const id of [...(s.players[p]?.command ?? [])]) {
      const until = s.objects[id]?.expiresEndOfTurn;
      if (until !== undefined && s.turn.number >= until) moveObject(s, id, "exile");
    }
  }
  // Fin des changements de contrôle « jusqu'à la fin du tour » (Involuntary Employment) : couche 2 recalculée.
  syncControl(s);
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (pl) {
      pl.manaKeep = undefined;
      pl.manaKeepCombat = undefined;
    }
  }
  bump(s);
  // 514.3a : si des actions basées sur l'état sont accomplies ou que des capacités se déclenchent pendant le nettoyage,
  // les joueurs reçoivent la priorité, puis une nouvelle étape de nettoyage a lieu.
  const acted = stateBasedActions(s);
  if (s.over) return;
  if (acted || s.pending || s.triggers.length > 0) {
    s.turn.cleanupAgain = true;
    givePriority(s);
    return;
  }
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

/** Dernière étape de sa phase : les phases ajoutées « après cette phase » viennent ensuite (500.8). */
function endsPhase(s: GameState, next: Step | null): boolean {
  switch (s.turn.step) {
    // Une phase de début sans pioche (Necropotence) ou réduite à son entretien (Obeka) finit avec l'entretien.
    case "upkeep":
      return !!s.turn.upkeepOnly || next !== "draw";
    case "draw":
    case "main1":
    case "main2":
    case "endCombat":
      return true;
    default:
      return false;
  }
}

/**
 * L'étape suivante compte tenu des étapes et des phases ajoutées : d'abord une étape ajoutée après celle-ci (500.10) ;
 * à la fin d'une phase, la première phase ajoutée (500.8), le tour reprenant ensuite là où il allait.
 */
function addedNext(s: GameState, next: Step | null): Step | null {
  const t = s.turn;
  const step = t.addedSteps?.shift();
  if (!t.addedSteps?.length) delete t.addedSteps;
  if (step) return step;
  if (!endsPhase(s, next)) return next;
  delete t.upkeepOnly;
  const phase = t.addedPhases?.shift();
  if (!t.addedPhases?.length) delete t.addedPhases;
  if (phase) {
    if (t.resumeAt === undefined && next) t.resumeAt = next;
    if (phase === "upkeep") t.upkeepOnly = true;
    return phase;
  }
  const resume = t.resumeAt;
  delete t.resumeAt;
  return resume ?? next;
}

/** Les étapes et phases ajoutées prennent fin avec le tour (ou quand le tour est terminé, 723). */
function clearAdded(s: GameState): void {
  delete s.turn.addedPhases;
  delete s.turn.addedSteps;
  delete s.turn.resumeAt;
  delete s.turn.upkeepOnly;
}

function endStep(s: GameState): void {
  // 500.4 : les réserves de mana se vident à la fin de chaque étape et phase.
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (!player) continue;
    // Savage Ventmaw : le mana gardé jusqu'à la fin du tour (et pas encore dépensé) reste dans la réserve ; celui de la
    // maîtrise du feu, jusqu'à la fin du combat. Le mana dépensé est compté d'abord sur celui qui se vide le plus tôt.
    const keep = player.manaKeep;
    const keepCombat = s.turn.step === "endCombat" ? undefined : player.manaKeepCombat;
    if (s.turn.step === "endCombat") player.manaKeepCombat = undefined;
    const pool = emptyPool();
    for (const m of Object.keys(player.manaPool) as ManaType[]) {
      const k = Math.min(keep?.[m] ?? 0, player.manaPool[m]);
      const kc = Math.min(keepCombat?.[m] ?? 0, player.manaPool[m] - k);
      pool[m] = k + kc;
      if (keep && keep[m] !== undefined) keep[m] = k;
      if (keepCombat && keepCombat[m] !== undefined) keepCombat[m] = kc;
    }
    // The Last Agni Kai : ces types ne se vident pas ; Ozai, the Phoenix King : le mana non dépensé devient rouge.
    const unspent = playerStatics(s, p, "keepUnspentMana").map(({ ab }) => ab.keepUnspentMana);
    for (const k of unspent) for (const m of k?.types ?? []) pool[m] = player.manaPool[m];
    const becomes = unspent.find((k) => k?.becomes)?.becomes;
    if (becomes) {
      const total = (Object.keys(player.manaPool) as ManaType[]).reduce((n, m) => n + player.manaPool[m], 0);
      for (const m of Object.keys(pool) as ManaType[]) pool[m] = 0;
      pool[becomes] = total;
    }
    // La réserve ne change le cache des couches que si elle a changé (une réserve vide le reste à chaque étape).
    const changed =
      !!player.restrictedMana?.length || (Object.keys(pool) as ManaType[]).some((m) => pool[m] !== player.manaPool[m]);
    player.manaPool = pool;
    player.restrictedMana = undefined;
    if (changed) bumpFor(s, "mana");
  }
  if (s.turn.step === "endCombat") {
    // La prochaine phase de combat contrôlée (Secret of Bloodbending) est terminée.
    if (s.turnControl?.combatOnly && s.turnControl.turn === s.turn.number) s.turnControl = undefined;
    s.combat = null;
    bump(s);
  }
  // 514.3a : après une priorité pendant le nettoyage, une nouvelle étape de nettoyage (et non le tour suivant).
  if (s.turn.step === "cleanup" && s.turn.cleanupAgain) {
    s.turn.cleanupAgain = false;
    s.lki = {};
    s.flow = "stepStart";
    return;
  }

  // Dernières informations connues : plus nécessaires une fois la pile vide et l'étape finie.
  s.lki = {};
  let next = nextStep(s);
  // 500.11 : une étape passée n'a pas lieu (Necropotence : « passez votre étape de pioche »).
  if (next === "draw" && playerStatic(s, s.turn.active, "skipDrawStep")) next = "main1";
  // 500.8, 500.10 : étapes ajoutées après celle-ci, puis phases ajoutées après la phase qui finit.
  next = addedNext(s, next);
  if (next) {
    s.turn.step = next;
    if (next === "end") s.turn.endSteps = (s.turn.endSteps ?? 0) + 1;
    emit({ type: "step", step: next });
  } else {
    s.turn.number += 1;
    // Capacités retardées « … ce tour-ci » : elles prennent fin avec le tour.
    if (s.delayed.some((d) => d.at === "thisTurn")) s.delayed = s.delayed.filter((d) => d.at !== "thisTurn");
    // 500.7 : un tour supplémentaire (le dernier créé d'abord), sinon le joueur suivant.
    let extra = s.extraTurns?.pop();
    // Trouble in Pairs : un adversaire qui devrait commencer un tour supplémentaire le passe.
    while (extra && playerStatic(s, extra, "skipExtraTurns")) extra = s.extraTurns?.pop();
    s.turn.active = extra && s.players[extra] && !s.players[extra]?.lost ? extra : nextPlayer(s, s.turn.active);
    // Ral Zarek : un joueur qui doit passer son tour le passe (un effet consommé par tour passé).
    for (let guard = 0; guard < s.playerOrder.length && consumePlayerEffect(s, s.turn.active, "skipTurn"); guard++)
      s.turn.active = nextPlayer(s, s.turn.active);
    s.turn.endSteps = 0;
    clearAdded(s);
    delete s.turn.mainPhase;
    s.turn.combats = 0;
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    s.turn.landsPlayed = 0;
    s.turn.speedRaised = false;
    emit({ type: "turnStart", turn: s.turn.number, player: s.turn.active });
  }
  s.flow = "stepStart";
}

// ---------------------------------------------------------------------------
// Priorité
// ---------------------------------------------------------------------------

/** 117.3b : après la résolution, le joueur actif reçoit la priorité. */
export function afterResolution(s: GameState): void {
  if (s.endTurnRequested) {
    // 723.1 : le tour passe directement à l'étape de nettoyage.
    s.endTurnRequested = false;
    clearAdded(s);
    s.turn.step = "cleanup";
    emit({ type: "step", step: "cleanup" });
    s.flow = "stepStart";
    return;
  }
  s.priority = { holder: firstPriority(s), passes: 0 };
  s.flow = "priority";
}

/**
 * 723 : « Terminez le tour ». Tout ce qui est sur la pile est exilé (le sort qui se résout compris),
 * les capacités en attente disparaissent, le combat s'arrête, puis on passe au nettoyage.
 */
export function endTheTurn(s: GameState, r: { item: StackItem }): void {
  for (const item of s.stack) {
    if (item.id === r.item.id) continue;
    if (item.kind === "spell" && s.objects[item.sourceId]) moveObject(s, item.sourceId, "exile");
  }
  s.stack = s.stack.filter((x) => x.id === r.item.id);
  r.item.flashback = true; // le sort qui se résout est exilé à la fin de sa résolution
  s.triggers = [];
  s.combat = null;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (pl) {
      pl.manaPool = emptyPool();
      pl.restrictedMana = undefined;
    }
  }
  s.endTurnRequested = true;
  bump(s);
  emit({ type: "endTurn", player: r.item.controller });
}

export function startTurnOf(s: GameState, p: PlayerId): void {
  // 722 : le tour contrôlé commence (ou le contrôle précédent se termine).
  if (s.turnControl?.turn !== undefined && s.turnControl.turn !== s.turn.number) s.turnControl = undefined;
  if (s.turnControl && s.turnControl.turn === undefined && s.turnControl.player === p) {
    s.turnControl.turn = s.turn.number;
    emit({ type: "turnControl", player: p, by: s.turnControl.by, combatOnly: s.turnControl.combatOnly });
  }
  const player = s.players[p];
  if (player) {
    player.lastTurnStarted = s.turn.number;
    player.turnsTaken = (player.turnsTaken ?? 0) + 1;
  }
  // Les statistiques « ce tour-ci » repartent de zéro pour tout le monde (on garde les blessures non de combat du tour passé).
  for (const q of s.playerOrder) {
    const pl = s.players[q];
    if (!pl) continue;
    pl.noncombatDamageLastTurn = countTurnEvents(s, { event: "damage", combat: false, toPlayer: true, sum: true }, q, q);
    pl.turnStats = emptyTurnStats();
  }
  s.turnLog = [];
  // Effets sur les joueurs « ce tour-ci » (ou jusqu'à un tour passé) : expirés.
  s.playerEffects = s.playerEffects.filter((e) => e.until === null || e.until >= s.turn.number);
  s.turn.onceFired = [];
  // « Jusqu'à votre prochain tour » : effets et emblèmes temporaires de ce joueur.
  const before = s.effects.length;
  s.effects = s.effects.filter((e) => !(e.duration === "untilYourNextTurn" && e.until === p));
  if (s.effects.length !== before) bump(s);
  for (const pl of s.playerOrder) {
    const cmd = s.players[pl]?.command ?? [];
    for (const id of [...cmd]) if (s.objects[id]?.expiresAtTurnOf === p) moveObject(s, id, "exile");
  }
  s.turn.graveyardTypesUsed = [];
  // Permissions de jouer depuis l'exil : celles qui ont expiré disparaissent. Découverte (701.57a) : une carte
  // qui n'a pas été lancée va dans la main de son propriétaire.
  for (const perm of s.playPermissions ?? []) {
    if (perm.until < s.turn.number && perm.orHand && s.objects[perm.card]?.zone === "exile") moveObject(s, perm.card, "hand");
  }
  if (s.playPermissions) s.playPermissions = s.playPermissions.filter((p) => p.until >= s.turn.number);
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

/**
 * Blessures de combat qu'une créature assigne : sa force, ou son endurance si elle est plus grande (Ghalta),
 * ou la valeur absolue d'une force négative (Loot, the Anomaly).
 */
export function combatPower(s: GameState, id: ObjectId): number {
  return effectivePower(chars(s, id), "combatDamage");
}

export function canAttack(s: GameState, id: ObjectId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || !isCreature(s, id)) return false;
  if (o.controller !== s.turn.active || o.tapped || isSummoningSick(s, id)) return false;
  const defender = hasKeyword(s, id, "defender") && !hasKeyword(s, id, "attacksDespiteDefender");
  return !defender && !hasKeyword(s, id, "cantAttack");
}

/**
 * Créatures qui « attaquent à chaque combat si possible » (508.1d). Une obligation n'impose jamais de payer un coût :
 * si chaque défenseur possible exige une taxe d'attaque (Archangel of Tithes), elles ne sont pas obligées d'attaquer.
 */
export function forcedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  const defenders = untaxedDefenders(s, player);
  if (defenders.length === 0) return [];
  // Une créature qui ne peut attaquer aucun de ces défenseurs (« ne peut pas vous attaquer ») n'est pas obligée.
  return attackCandidates(s, player).filter(
    (id) => hasKeyword(s, id, "mustAttack") && defenders.some((d) => !attackRestriction(s, id, d)),
  );
}

/** Les attaques obligées, chacune vers un défenseur sans taxe d'attaque qu'elle peut attaquer (automatisme : « Fin du tour »). */
export function forcedAttacks(s: GameState, player: PlayerId): { id: ObjectId; defender: string }[] {
  const defenders = untaxedDefenders(s, player);
  return forcedAttackers(s, player).map((id) => {
    const allowed = defenders.filter((d) => !attackRestriction(s, id, d));
    return { id, defender: (allowed.find((d) => !!s.players[d]) ?? allowed[0]) as string };
  });
}

/**
 * Pourquoi cette créature ne peut pas attaquer ce défenseur (joueur ou planeswalker), sinon null : « ne peut pas vous
 * attaquer, ni vos planeswalkers » (Eriette of the Charmed Apple), « ne peut pas attaquer un joueur qu'elle a déjà attaqué
 * ce tour-ci » (Port Razer).
 */
function attackRestriction(s: GameState, id: ObjectId, defender: string): string | null {
  const dp = defendingPlayer(s, defender);
  const rules = chars(s, id).blockRules;
  if (rules.some((r) => r.cantAttackPlayer === dp)) return `${chars(s, id).name} ne peut pas attaquer ce joueur`;
  if (
    rules.some((r) => r.notDefendersAttackedThisTurn) &&
    s.turnLog.some((e) => e.e === "attack" && e.id === id && e.defender === dp)
  )
    return `${chars(s, id).name} a déjà attaqué ce joueur ce tour-ci`;
  return null;
}

/** Taxe d'attaque (Archangel of Tithes) pour attaquer ce défenseur ou ses planeswalkers : {N} par créature. */
export function attackTaxFor(s: GameState, defender: string): number {
  return playerStaticTotal(s, defendingPlayer(s, defender), "attackTax");
}

function untaxedDefenders(s: GameState, player: PlayerId): string[] {
  return attackableDefenders(s, player).filter((d) => attackTaxFor(s, d) === 0);
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
  // Sandswirl Wanderglyph : « il ne peut pas vous attaquer, ni les planeswalkers que vous contrôlez, ce tour-ci ».
  const banned = new Set(playerEffectValues(s, player, "cantAttackPlayer"));
  const opps = opponentsOf(s, player).filter((p) => !banned.has(p));
  // The Aetherspark : « tant qu'il est attaché à une créature, il ne peut pas être attaqué ».
  const walkers = s.battlefield.filter(
    (id) => opps.includes(obj(s, id).controller) && hasType(s, id, "Planeswalker") && !obj(s, id).attachedTo,
  );
  return [...opps, ...walkers];
}

/**
 * 402.2 : taille de main maximale (7, `null` : aucune). Les effets qui la fixent (« votre taille de main maximale est de
 * cinq », « vous n'avez pas de taille de main maximale », éventuellement pour les adversaires) sont des effets sur les
 * règles du jeu, appliqués dans l'ordre de leurs horodatages (613.11) : le plus récent l'emporte. L'horodatage d'une
 * statique est celui de sa source (permanent, emblème) ; celui d'un effet sur le joueur, celui de sa création.
 */
function maxHandSize(s: GameState, player: PlayerId): number | null {
  const set: { ts: number; value: () => number | null }[] = [];
  const tsOf = (id: ObjectId | undefined, timestamp: number | undefined) =>
    timestamp ?? (id ? (s.objects[id]?.timestamp ?? 0) : 0);
  for (const { id, timestamp } of playerStatics(s, player, "noMaxHandSize"))
    set.push({ ts: tsOf(id, timestamp), value: () => null });
  for (const { id, ab, timestamp } of playerStatics(s, player, "maxHandSize")) {
    const amount = ab.maxHandSize;
    if (amount === undefined) continue;
    const ctx = staticContext(s, (id && s.objects[id]?.controller) || player, id, { sourceDefId: "" });
    set.push({ ts: tsOf(id, timestamp), value: () => Math.max(0, evalAmount(s, ctx, amount)) });
  }
  if (!set.length) return MAX_HAND_SIZE;
  let last = set[0] as (typeof set)[number];
  for (const e of set) if (e.ts >= last.ts) last = e;
  return last.value();
}

export function declareAttackers(s: GameState, player: PlayerId, attackers: { id: ObjectId; defender: string }[]): void {
  const seen = new Set<ObjectId>();
  const defenders = attackableDefenders(s, player);
  for (const a of attackers) {
    if (seen.has(a.id)) throw new RulesError("Créature déclarée deux fois");
    seen.add(a.id);
    if (!canAttack(s, a.id) || obj(s, a.id).controller !== player) throw new RulesError("Cette créature ne peut pas attaquer");
    if (!defenders.includes(a.defender)) throw new RulesError("Joueur ou planeswalker défenseur invalide");
    const restriction = attackRestriction(s, a.id, a.defender);
    if (restriction) throw new RulesError(restriction);
  }
  // Tomik, Orzhov Lawmage : au plus une créature attaque chacun des planeswalkers de son contrôleur ; Mirri, Weatherlight
  // Duelist : au plus une créature attaque son contrôleur.
  for (const w of new Set(attackers.map((a) => a.defender))) {
    const walker = s.objects[w];
    const limited = walker
      ? playerStatics(s, walker.controller, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "walkers")
      : playerStatics(s, w, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "you");
    if (limited && attackers.filter((a) => a.defender === w).length > 1) {
      throw new RulesError(`Une seule créature peut attaquer ${walker ? chars(s, w).name : "ce joueur"}`);
    }
  }
  // 508.1d : les créatures qui « attaquent à chaque combat si possible » doivent être déclarées (sauf si attaquer
  // coûte quelque chose partout : une obligation n'impose pas de payer).
  const forced = forcedAttackers(s, player).filter((id) => !seen.has(id));
  if (forced.length > 0) throw new RulesError(`${chars(s, forced[0] as ObjectId).name} doit attaquer si elle le peut`);
  // Toby, Beastie Befriender : « ce jeton ne peut pas attaquer seul ».
  const alone = attackers.length === 1 ? attackers[0]?.id : undefined;
  if (alone && chars(s, alone).blockRules.some((r) => r.notAlone))
    throw new RulesError(`${chars(s, alone).name} ne peut pas attaquer seule`);
  // Archangel of Tithes : {1} pour chaque créature qui attaque un joueur protégé (ou ses planeswalkers).
  const tax = attackers.reduce((n, a) => n + attackTaxFor(s, a.defender), 0);
  if (tax > 0) {
    try {
      payMana(s, player, { generic: tax, colored: {}, x: 0 });
    } catch (e) {
      rethrowAsRules(e, `Il faut payer {${tax}} pour attaquer`);
    }
  }
  if (!s.combat) s.combat = emptyCombat();
  for (const a of attackers) {
    if (!hasKeyword(s, a.id, "vigilance")) tapObject(s, obj(s, a.id));
    s.combat.attackers.push({ id: a.id, defender: a.defender, blockers: [], blocked: false });
  }
  bump(s);
  for (const a of attackers) rulesEvent(s, { e: "attack", attacker: a.id, defender: a.defender });
  // Journal du tour : attaques (« si vous avez attaqué avec un Vaisseau », Sandswirl Wanderglyph).
  for (const a of attackers) {
    const c = chars(s, a.id);
    const defender = defendingPlayer(s, a.defender) ?? a.defender;
    logTurnEvent(s, { e: "attack", player, defender, types: c.types, subtypes: c.subtypes, id: a.id });
  }
  if (attackers.length > 0) rulesEvent(s, { e: "attackWith", player, count: attackers.length });
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
  if (hasKeyword(s, blocker, "cantBlock") || hasKeyword(s, blocker, "decayed") || hasKeyword(s, attacker, "unblockable"))
    return false;
  // 702.16f : une créature avec la protection contre [filtre] ne peut pas être bloquée par ce qui y correspond.
  if (protectedFrom(s, attacker, snapshot(s, blocker))) return false;
  if (hasKeyword(s, attacker, "flying") && !hasKeyword(s, blocker, "flying") && !hasKeyword(s, blocker, "reach")) return false;
  // Règles de blocage (R4.1) : « ne peut bloquer que [filtre] » (Drone), « ne peut pas être bloquée par [filtre] ».
  const own = chars(s, blocker).blockRules;
  if (own.some((r) => r.canBlockOnly && !matchesView(snapshot(s, attacker), r.canBlockOnly, b.controller, blocker))) return false;
  // Traversée de terrain (702.14) : imblocable si le défenseur contrôle un permanent correspondant.
  const walks = chars(s, attacker).blockRules.filter((r) => r.unblockableIfDefenderControls);
  if (
    walks.some((r) =>
      s.battlefield.some(
        (id) =>
          obj(s, id).controller === b.controller &&
          matchesObjectFilter(s, b.controller, id, r.unblockableIfDefenderControls as ObjectFilter, attacker),
      ),
    )
  )
    return false;
  const rules = chars(s, attacker).blockRules.filter((r) => r.cantBeBlockedBy);
  if (rules.length) {
    const v = snapshot(s, blocker);
    const who = obj(s, attacker).controller;
    if (rules.some((r) => matchesView(v, resolveFilter(s, r.cantBeBlockedBy as ObjectFilter, attacker), who, attacker)))
      return false;
  }
  return true;
}

/** Nombre minimal de bloqueurs d'un attaquant : 1, 2 avec la menace, plus selon ses règles de blocage. */
function minBlockers(s: GameState, id: ObjectId): number {
  const rules = chars(s, id).blockRules.map((r) => r.minBlockers ?? 0);
  return Math.max(hasKeyword(s, id, "menace") ? 2 : 1, ...rules);
}

/** Nombre maximal de bloqueurs d'un attaquant (« ne peut pas être bloquée par plus d'une créature »). */
function maxBlockers(s: GameState, id: ObjectId): number {
  return Math.min(Number.POSITIVE_INFINITY, ...chars(s, id).blockRules.map((r) => r.maxBlockers ?? Number.POSITIVE_INFINITY));
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
    return n >= minBlockers(s, a.id);
  });
}

type Block = { blocker: ObjectId; attacker: ObjectId };

/**
 * 509.1c : une exigence de blocage d'un défenseur — un attaquant « qui doit être bloqué si possible », ou une créature
 * qui « bloque si possible » (`attackers` : seulement ces attaquants, « bloque ce Loup si possible »).
 */
export type BlockRequirement =
  | { kind: "attacker"; attacker: ObjectId }
  | { kind: "blocker"; blocker: ObjectId; attackers?: ObjectId[] };

/** Les exigences de blocage de `player` ; aucune si bloquer coûte quelque chose (509.1d, Archangel of Tithes). */
export function blockRequirements(s: GameState, player: PlayerId): BlockRequirement[] {
  const tax = s.playerOrder.filter((p) => p !== player).reduce((n, p) => n + playerStaticTotal(s, p, "blockTax"), 0);
  if (tax > 0) return [];
  const attackers = (s.combat?.attackers ?? []).filter((a) => defendingPlayer(s, a.defender) === player).map((a) => a.id);
  const out: BlockRequirement[] = attackers
    .filter((a) => hasKeyword(s, a, "mustBeBlocked"))
    .map((attacker) => ({ kind: "attacker" as const, attacker }));
  for (const id of creaturesControlledBy(s, player)) {
    const rules = chars(s, id).blockRules.filter((r) => r.mustBlock || r.mustBlockAttacker);
    if (rules.length === 0) continue;
    if (rules.some((r) => r.mustBlock)) out.push({ kind: "blocker", blocker: id });
    else {
      const specific = rules.map((r) => r.mustBlockAttacker).filter((x): x is ObjectId => !!x && attackers.includes(x));
      if (specific.length) out.push({ kind: "blocker", blocker: id, attackers: specific });
    }
  }
  return out;
}

/** Exigences respectées par une déclaration. */
function obeyedRequirements(reqs: BlockRequirement[], blocks: Block[]): BlockRequirement[] {
  return reqs.filter((r) => {
    if (r.kind === "attacker") return blocks.some((b) => b.attacker === r.attacker);
    const b = blocks.find((x) => x.blocker === r.blocker);
    return !!b && (!r.attackers || r.attackers.includes(b.attacker));
  });
}

/** Nombre de créatures avec lesquelles ce joueur peut bloquer (Mirri, Weatherlight Duelist : une seule). */
function maxBlockingCreatures(s: GameState, player: PlayerId): number {
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...playerStatics(s, player, "maxBlockingCreatures").map(({ ab }) => ab.maxBlockingCreatures ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * La déclaration respecte-t-elle le nombre de bloqueurs de chaque attaquant (menace, « pas plus d'une »), le nombre de
 * créatures qui bloquent et « pas seule » ?
 */
function blockShapeLegal(s: GameState, player: PlayerId, blocks: Block[]): boolean {
  if (new Set(blocks.map((b) => b.blocker)).size > maxBlockingCreatures(s, player)) return false;
  const per = new Map<ObjectId, number>();
  for (const b of blocks) per.set(b.attacker, (per.get(b.attacker) ?? 0) + 1);
  for (const [a, n] of per) if (n < minBlockers(s, a) || n > maxBlockers(s, a)) return false;
  const lone = blocks.length === 1 ? blocks[0]?.blocker : undefined;
  return !lone || !chars(s, lone).blockRules.some((r) => r.notAlone);
}

/** Nœuds au plus de la recherche du maximum : au-delà, le meilleur trouvé (qui ne peut que sous-estimer le maximum). */
const BLOCK_SEARCH_NODES = 50_000;

/**
 * 509.1c : le plus grand nombre d'exigences qu'une déclaration légale peut respecter, et une telle déclaration (pour les
 * seules créatures concernées). `prefer` : les blocages voulus, essayés d'abord (l'IA qui répare ses blocages).
 */
function bestRequiredBlocks(
  s: GameState,
  player: PlayerId,
  reqs: BlockRequirement[],
  prefer: Block[] = [],
): { max: number; best: Block[] } {
  if (reqs.length === 0) return { max: 0, best: [] };
  const attackers = (s.combat?.attackers ?? []).filter((a) => defendingPlayer(s, a.defender) === player).map((a) => a.id);
  const required = new Set(reqs.flatMap((r) => (r.kind === "attacker" ? [r.attacker] : [])));
  const own = new Map(reqs.flatMap((r) => (r.kind === "blocker" ? [[r.blocker, r] as const] : [])));
  const relevant = creaturesControlledBy(s, player).filter((id) => own.has(id) || [...required].some((a) => canBlock(s, id, a)));
  const domains = relevant.map((id) => {
    const r = own.get(id);
    const useful = attackers.filter(
      (a) => canBlock(s, id, a) && (required.has(a) || (r?.kind === "blocker" && (!r.attackers || r.attackers.includes(a)))),
    );
    const wanted = prefer.find((b) => b.blocker === id)?.attacker;
    const options: (ObjectId | null)[] = [null, ...useful];
    // Le blocage voulu d'abord (s'il est utile) ; sinon « ne bloque pas » d'abord.
    if (wanted && useful.includes(wanted)) options.sort((x, y) => (x === wanted ? -1 : y === wanted ? 1 : 0));
    return options;
  });
  let best: Block[] = [];
  let max = -1;
  let nodes = 0;
  const current: Block[] = [];
  const visit = (i: number): void => {
    if (++nodes > BLOCK_SEARCH_NODES || max === reqs.length) return;
    if (i === relevant.length) {
      if (!blockShapeLegal(s, player, current)) return;
      const n = obeyedRequirements(reqs, current).length;
      if (n > max) {
        max = n;
        best = [...current];
      }
      return;
    }
    for (const a of domains[i] ?? [null]) {
      if (a) current.push({ blocker: relevant[i] as ObjectId, attacker: a });
      visit(i + 1);
      if (a) current.pop();
    }
  };
  visit(0);
  return { max: Math.max(0, max), best };
}

/**
 * 509.1c : la première exigence non respectée par cette déclaration alors qu'une autre déclaration légale en respecte
 * plus ; null si la déclaration respecte le maximum possible.
 */
export function unmetBlockRequirement(s: GameState, player: PlayerId, blocks: Block[]): BlockRequirement | null {
  const reqs = blockRequirements(s, player);
  if (reqs.length === 0) return null;
  const obeyed = obeyedRequirements(reqs, blocks);
  if (obeyed.length >= bestRequiredBlocks(s, player, reqs).max) return null;
  return reqs.find((r) => !obeyed.includes(r)) ?? null;
}

/** Blocages par défaut : ceux qui respectent le plus d'exigences (509.1c) ; vide sans exigence. */
export function requiredBlocks(s: GameState, player: PlayerId): Block[] {
  return bestRequiredBlocks(s, player, blockRequirements(s, player)).best;
}

/**
 * Blocages voulus (par l'IA) complétés pour respecter le plus d'exigences possible : les créatures concernées reprennent
 * le meilleur blocage proche de celui voulu, les autres gardent le leur.
 */
export function repairBlocks(s: GameState, player: PlayerId, blocks: Block[]): Block[] {
  if (!unmetBlockRequirement(s, player, blocks)) return blocks;
  const { best } = bestRequiredBlocks(s, player, blockRequirements(s, player), blocks);
  const fixed = new Set(best.map((b) => b.blocker));
  const reqs = blockRequirements(s, player);
  const own = new Set(reqs.flatMap((r) => (r.kind === "blocker" ? [r.blocker] : [])));
  const required = reqs.flatMap((r) => (r.kind === "attacker" ? [r.attacker] : []));
  const relevant = (id: ObjectId) => own.has(id) || required.some((a) => canBlock(s, id, a));
  const merged = [...blocks.filter((b) => !fixed.has(b.blocker) && !relevant(b.blocker)), ...best];
  return blockShapeLegal(s, player, merged) ? merged : best;
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
  const lone = blocks.length === 1 ? blocks[0]?.blocker : undefined;
  if (lone && chars(s, lone).blockRules.some((r) => r.notAlone))
    throw new RulesError(`${chars(s, lone).name} ne peut pas bloquer seule`);
  // 509.1c : la déclaration respecte autant d'exigences de blocage que possible (sans payer de coût, 509.1d).
  const unmet = unmetBlockRequirement(s, player, blocks);
  if (unmet?.kind === "attacker") throw new RulesError(`${chars(s, unmet.attacker).name} doit être bloquée si possible`);
  if (unmet?.kind === "blocker") throw new RulesError(`${chars(s, unmet.blocker).name} doit bloquer si possible`);
  // Archangel of Tithes (attaquant) : {1} par créature qui bloque.
  const perBlocker = s.playerOrder.filter((p) => p !== player).reduce((n, p) => n + playerStaticTotal(s, p, "blockTax"), 0);
  if (blocks.length && perBlocker > 0) {
    const tax = blocks.length * perBlocker;
    try {
      payMana(s, player, { generic: tax, colored: {}, x: 0 });
    } catch (e) {
      rethrowAsRules(e, `Il faut payer {${tax}} pour bloquer`);
    }
  }
  const cap = maxBlockingCreatures(s, player);
  if (new Set(blocks.map((b) => b.blocker)).size > cap)
    throw new RulesError(
      cap === 1 ? "Vous ne pouvez bloquer qu'avec une seule créature" : `Vous ne pouvez bloquer qu'avec ${cap} créatures`,
    );
  for (const a of c.attackers) {
    const n = blocks.filter((b) => b.attacker === a.id).length;
    const min = minBlockers(s, a.id);
    if (n > 0 && n < min)
      throw new RulesError(
        min === 2 && hasKeyword(s, a.id, "menace")
          ? "Une créature avec la menace doit être bloquée par au moins deux créatures"
          : `Cette créature ne peut être bloquée que par ${min} créatures ou plus`,
      );
    const max = maxBlockers(s, a.id);
    if (n > max)
      throw new RulesError(
        max === 1
          ? "Cette créature ne peut pas être bloquée par plus d'une créature"
          : `Cette créature ne peut pas être bloquée par plus de ${max} créatures`,
      );
  }
  // 509.1 : les blocages des défenseurs sont simultanés ; ceux-ci sont gardés (et cachés) jusqu'au dernier défenseur.
  c.pendingBlocks = [...(c.pendingBlocks ?? []), { player, blocks }];
  nextBlockingPlayer(s);
}

/** Applique ensemble les blocages de tous les défenseurs (509.1), dans l'ordre de leurs déclarations. */
function commitBlocks(s: GameState): void {
  const c = s.combat;
  if (!c) return;
  const pending = c.pendingBlocks ?? [];
  c.pendingBlocks = undefined;
  for (const { player, blocks } of pending) applyBlocks(s, c, player, blocks);
}

function applyBlocks(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  player: PlayerId,
  blocks: { blocker: ObjectId; attacker: ObjectId }[],
): void {
  blocks = blocks.filter((b) => onBattlefield(s, b.blocker) && c.attackers.some((a) => a.id === b.attacker));
  c.blockers.push(...blocks.map((b) => ({ id: b.blocker, attacker: b.attacker })));
  for (const b of blocks) rulesEvent(s, { e: "block", blocker: b.blocker, attacker: b.attacker });
  // 509.1h : chaque attaquant qui a au moins un bloqueur devient bloqué (Norin).
  for (const a of new Set(blocks.map((b) => b.attacker))) {
    const o = s.objects[a];
    if (o) rulesEvent(s, { e: "blocked", attacker: a, player: o.controller });
  }
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
}

function nextBlockingPlayer(s: GameState): void {
  const p = s.combat?.blockQueue.shift();
  if (p) {
    s.pending = { kind: "declareBlockers", player: p };
    s.flow = "tba";
  } else {
    commitBlocks(s);
    givePriority(s);
  }
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
  let remaining = Math.max(0, combatPower(s, attacker));
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
      if (combatPower(s, a.id) <= 0) return false;
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
      prompt: `Répartissez les ${combatPower(s, attacker)} blessures de ${cardRef(obj(s, attacker).defId)}`,
      among,
      total: combatPower(s, attacker),
      lethal: trample
        ? { player: a.defender, needs: Object.fromEntries(blockers.map((b) => [b, lethalFor(s, b, deathtouch)])) }
        : undefined,
      suggested: among.map((id) => suggestedMap[id] ?? 0),
      // Plusieurs bloqueurs : le joueur répartit (suggestion préremplie) ; un bloqueur et le piétinement : l'automatisme
      // donne les blessures mortelles au bloqueur et le reste au joueur (PLAN-C, C18).
      autoOk: blockers.length <= 1,
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
    const power = combatPower(s, a.id);
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
    const power = combatPower(s, b.id);
    if (power <= 0) continue;
    dealt.push(b.id);
    assignments.push({ src: sourceFromObject(s, b.id), target: b.attacker, amount: power });
  }

  if (firstStrikeStep) c.firstStrikers = dealt;
  // 510.2 : toutes les blessures de combat sont infligées simultanément.
  simultaneously(s, () => {
    for (const x of assignments) dealDamage(s, x.src, x.target, x.amount, true);
    // « Chaque fois qu'une ou plusieurs créatures … infligent des blessures de combat à un joueur » : une fois par joueur.
    const byPlayer = new Map<PlayerId, ObjectId[]>();
    for (const x of assignments) {
      if (!s.players[x.target] || x.amount <= 0 || !x.src.id) continue;
      byPlayer.set(x.target, [...(byPlayer.get(x.target) ?? []), x.src.id]);
    }
    for (const [player, sources] of byPlayer) rulesEvent(s, { e: "combatDamageBatch", player, sources });
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
    // Laboratory Maniac : la pioche impossible a été remplacée par une victoire (adversaires éliminés, sauf `cantLose`).
    if (player.drewFromEmptyLibrary === "win") {
      player.drewFromEmptyLibrary = false;
      const opponents = opponentsOf(s, p);
      if (!opponents.some((q) => playerStatic(s, q, "cantLose"))) losers.push(...opponents.filter((q) => !losers.includes(q)));
      continue;
    }
    // Herald of Eternal Dawn : « vous ne pouvez pas perdre la partie ». 704.5c : 10 marqueurs poison ou plus.
    // Marina Vendrell's Grimoire : « vous ne perdez pas la partie pour avoir 0 point de vie ou moins ».
    const lifeLoss = player.life <= 0 && !playerStatic(s, p, "noLoseForLife");
    const poisoned = (player.poison ?? 0) >= 10;
    // 704.6c : 21 blessures de combat ou plus d'un même commandant au cours de la partie.
    const commanderDamage = !!s.commander && Object.values(s.commander.cards).some((c) => (c.damage[p] ?? 0) >= 21);
    if ((lifeLoss || player.drewFromEmptyLibrary || poisoned || commanderDamage) && !playerStatic(s, p, "cantLose")) {
      losers.push(p);
      emit({
        type: "lose",
        player: p,
        reason: lifeLoss ? "life" : poisoned ? "poison" : commanderDamage ? "commander" : "draw",
      });
    }
    // 704.5b : seule compte une pioche impossible depuis la dernière vérification ; un joueur qui ne pouvait pas perdre
    // ne perd pas plus tard pour une pioche ancienne.
    player.drewFromEmptyLibrary = false;
  }
  eliminate(s, [...new Set(losers)]);
}

/**
 * Élimine des joueurs. Si au plus un joueur reste, la partie se termine ; sinon (800.4a)
 * leurs objets quittent la partie et le jeu continue sans eux.
 */
export function eliminate(s: GameState, losers: PlayerId[]): void {
  if (losers.length === 0) return;
  bump(s); // des caractéristiques peuvent dépendre des joueurs encore en jeu
  const holderLeaving = losers.includes(s.priority.holder);
  const activeLeaving = losers.includes(s.turn.active);
  for (const p of losers) {
    const player = s.players[p];
    if (player) player.lost = true;
  }
  // Tous les perdants sont marqués avant que les déclencheurs ne relisent les caractéristiques.
  bump(s);
  for (const p of losers) rulesEvent(s, { e: "playerLost", player: p });
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
  if (s.mulliganTaken) s.mulliganTaken = s.mulliganTaken.filter((q) => !losers.includes(q));
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
  // 800.4a : les effets qui lui donnent le contrôle d'objets prennent fin (couche 2 : `syncControl` ignore les effets et
  // les Auras d'un joueur qui a quitté la partie), puis ce qu'il contrôle encore est exilé.
  syncControl(s);
  // Ses permanents hors phase reviennent en phase avant de quitter la partie (ils ne reviendraient jamais sinon).
  phaseIn(s, p);
  for (const o of Object.values(s.objects)) {
    if (o.owner !== p && o.controller === p && o.zone === "battlefield") moveObject(s, o.id, "exile");
    // Contrôlé par un autre effet : à la fin de celui-ci, il revient à son propriétaire.
    else if (o.owner !== p && o.baseController === p) o.baseController = o.owner;
  }
  s.effects = s.effects.filter((e) => e.controller !== p);
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
  player.phasedOut = [];
  s.battlefield = s.battlefield.filter((id) => !gone.has(id));
  s.exile = s.exile.filter((id) => !gone.has(id));
  // 800.4a : un sort qu'il contrôle sans le posséder (carte adverse lancée depuis l'exil) est exilé ; une copie cesse
  // d'exister (`moveObject`).
  for (const item of s.stack)
    if (item.kind === "spell" && item.controller === p && !gone.has(item.sourceId) && s.objects[item.sourceId])
      moveObject(s, item.sourceId, "exile");
  s.stack = s.stack.filter((item) => item.controller !== p && (item.kind === "ability" || !gone.has(item.sourceId)));
  // 800.4a : ses capacités déclenchées en attente et retardées cessent d'exister.
  s.triggers = s.triggers.filter((t) => t.controller !== p);
  s.delayed = s.delayed.filter((d) => d.controller !== p);
  if (s.combat) {
    // Des créatures cessent d'attaquer : des statiques « créatures attaquantes » en dépendent.
    bump(s);
    s.combat.attackers = s.combat.attackers.filter((a) => !gone.has(a.id) && defendingPlayer(s, a.defender) !== p);
    s.combat.blockers = s.combat.blockers.filter((b) => !gone.has(b.id));
    s.combat.blockQueue = s.combat.blockQueue.filter((q) => q !== p);
    s.combat.pendingBlocks = s.combat.pendingBlocks?.filter((b) => b.player !== p);
    for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => !gone.has(b));
  }
  s.effects = s.effects.filter((e) => e.affected.some((id) => !gone.has(id)));
  // Ses permanents ont disparu : leurs capacités statiques ne s'appliquent plus (Ygra, Eater of All).
  bump(s);
}

/** Actions basées sur l'état (704.3). Renvoie true si l'une d'elles a été accomplie (ou une question posée). */
export function stateBasedActions(s: GameState): boolean {
  let acted = false;
  simultaneously(s, () => {
    acted = stateBasedActionsOnce(s);
  });
  return acted;
}

function stateBasedActionsOnce(s: GameState): boolean {
  const alive = () => s.playerOrder.filter((p) => !s.players[p]?.lost).length;
  const before = alive();
  let acted = false;
  for (let guard = 0; guard < MAX_SBA_PASSES; guard++) {
    checkGameOver(s);
    if (s.over) return true;
    if (alive() !== before) acted = true;
    // 702.179a : « Start your engines! » — un joueur sans vitesse qui contrôle un tel permanent a la vitesse 1.
    for (const id of s.battlefield) {
      const c = s.players[obj(s, id).controller];
      if (c && c.speed === undefined && hasKeyword(s, id, "startYourEngines")) setSpeed(s, c.id, 1);
    }
    // Storied (Le Hobbit) : avec trois artefacts, légendaires et/ou Sagas ou plus, le contrôleur d'un permanent qui a
    // cette capacité acquiert un récit durable, pour le reste de la partie.
    for (const id of s.battlefield) {
      const p = obj(s, id).controller;
      if (!s.defs[obj(s, id).defId]?.storied || playerStatic(s, p, "enduringStory")) continue;
      const n = s.battlefield.filter((x) => {
        if (obj(s, x).controller !== p) return false;
        const c = chars(s, x);
        return c.types.includes("Artifact") || c.supertypes.includes("Legendary") || c.subtypes.includes("Saga");
      }).length;
      if (n >= 3) addPlayerEffect(s, p, { enduringStory: true }, null);
    }
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
      if (
        hasType(s, id, "Planeswalker") &&
        counterCount(o, "loyalty") <= 0 &&
        !playerStatic(s, o.controller, "walkersSurviveZeroLoyalty")
      ) {
        toGraveyard.push(id);
        continue;
      }
      // 714.4 : une Saga dont le dernier chapitre est atteint, et dont aucun chapitre n'attend, est sacrifiée.
      // Face active : une Saga au verso (Summons de FIN) ; une Saga retournée au recto n'en est plus une.
      const saga = s.defs[copiedDefId(s, id)]?.saga;
      if (
        saga &&
        counterCount(o, "lore") >= saga.chapters &&
        !s.stack.some((x) => x.kind === "ability" && x.sourceId === id) &&
        !s.triggers.some((t) => t.sourceId === id)
      ) {
        toGraveyard.push(id);
        continue;
      }
      if (!isCreature(s, id)) continue;
      const c = chars(s, id);
      if (c.toughness <= 0)
        toGraveyard.push(id); // 704.5f
      else if (o.damage >= c.toughness || (o.deathtouched && o.damage > 0)) toDestroy.push(id); // 704.5g–h
    }

    // Couche 2 : Confiscate (le contrôleur de l'Aura contrôle le permanent enchanté, et le rend quand l'Aura part), fin
    // des effets « tant que vous contrôlez ».
    if (syncControl(s)) changed = true;

    // 704.5m–n : Auras attachées illégalement (cimetière), Équipements attachés illégalement (détachés).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const d = s.defs[o.defId];
      if (d?.enchant) {
        const host = o.attachedTo;
        // Aura de joueur (Grievous Wound) : attachée à un joueur encore en partie.
        const legal = d.enchant.player
          ? !!host && isPlayer(s, host) && !s.players[host]?.lost
          : !!host &&
            host !== id &&
            onBattlefield(s, host) &&
            !protectedFrom(s, host, sourceView(s, id)) &&
            matchesObjectFilter(s, o.controller, host, d.enchant.filter, id);
        if (!legal) toGraveyard.push(id);
      } else if (
        o.attachedTo &&
        !(
          onBattlefield(s, o.attachedTo) &&
          isCreature(s, o.attachedTo) &&
          hasType(s, id, "Artifact") &&
          // 301.5c : un Équipement qui est aussi une créature ne peut pas équiper une créature (Iron Man Armor animée).
          !isCreature(s, id) &&
          !protectedFrom(s, o.attachedTo, sourceView(s, id))
        )
      ) {
        o.lastAttachedTo = o.attachedTo;
        o.attachedTo = undefined;
        bump(s);
        changed = true;
      }
    }

    // 704.5y : plusieurs Rôles d'un même joueur attachés au même permanent : seul le plus récent reste.
    const roles = new Map<string, ObjectId[]>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (!o.attachedTo || toGraveyard.includes(id) || !chars(s, id).subtypes.includes("Role")) continue;
      const key = `${o.attachedTo}|${o.controller}`;
      roles.set(key, [...(roles.get(key) ?? []), id]);
    }
    for (const ids of roles.values()) {
      if (ids.length < 2) continue;
      const newest = [...ids].sort((a, b) => obj(s, b).timestamp - obj(s, a).timestamp)[0];
      for (const id of ids) if (id !== newest) toGraveyard.push(id);
    }

    // 704.5j : règle des légendes (v1 : on garde automatiquement le plus récent).
    const legends = new Map<string, ObjectId[]>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      // Caractéristiques calculées : une copie (Hall of Echoes) porte le nom et le supertype copiés.
      const c = chars(s, id);
      if (!c.supertypes.includes("Legendary")) continue;
      if (
        playerStatics(s, o.controller, "noLegendRule").some(
          ({ id: src, ab }) =>
            ab.noLegendRule === true || matchesObjectFilter(s, o.controller, id, ab.noLegendRule as ObjectFilter, src),
        )
      )
        continue;
      const key = `${o.controller}|${c.name}`;
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
    // 506.4 : un permanent qui cesse d'être une créature (Véhicule, terrain animé) est retiré du combat.
    if (s.combat) {
      for (const id of combatants(s)) {
        if (!isCreature(s, id)) {
          removeFromCombat(s, id);
          changed = true;
        }
      }
    }
    if (changed) {
      acted = true;
      continue;
    }
    if (legendChoice) {
      acted = true;
      // 704.5j : le joueur choisit la légende qu'il garde ; les autres vont au cimetière.
      const newest = [...legendChoice.ids].sort((x, y) => obj(s, y).timestamp - obj(s, x).timestamp)[0] as ObjectId;
      ask(
        s,
        legendChoice.player,
        {
          type: "pick",
          intent: "legend",
          prompt: `Règle des légendes : choisissez le ${cardRef(obj(s, newest).defId)} à garder`,
          options: legendChoice.ids,
          min: 1,
          max: 1,
          suggested: [newest],
        },
        { kind: "legend" },
      );
      return acted;
    }
    // 903.9a : un commandant arrivé dans un cimetière ou en exil depuis la dernière vérification : son propriétaire peut
    // le remettre dans la zone de commandement (une question par objet ; un refus vaut jusqu'à son prochain changement de
    // zone).
    const offer = commanderReturnOffer(s);
    if (offer) {
      acted = true;
      ask(
        s,
        offer.owner,
        {
          type: "yesNo",
          intent: "commanderZone",
          prompt: `Remettre ${cardRef(obj(s, offer.id).defId)} dans la zone de commandement ?`,
          suggested: [1],
        },
        { kind: "commanderZone", card: offer.id },
      );
    }
    return acted;
  }
  // Toujours des actions à faire après `MAX_SBA_PASSES` passes : une boucle d'actions obligatoires (104.4b).
  declareLoopDraw(s);
  return true;
}

/** 903.9a : le premier commandant au cimetière ou en exil dont le retour n'a pas encore été proposé. */
function commanderReturnOffer(s: GameState): { owner: PlayerId; id: ObjectId } | undefined {
  const cards = s.commander?.cards;
  if (!cards) return undefined;
  for (const rec of Object.values(cards)) {
    const owner = s.players[rec.owner];
    if (!owner || owner.lost) continue;
    for (const id of [...owner.graveyard, ...s.exile]) {
      const o = s.objects[id];
      if (o && commanderOf(s, o) === rec && rec.offered !== id) {
        rec.offered = id;
        return { owner: rec.owner, id };
      }
    }
  }
  return undefined;
}

/** 903.9a : réponse du propriétaire ; oui, le commandant (toujours au cimetière ou en exil) va dans la zone de commandement. */
export function answerCommanderZone(s: GameState, card: ObjectId, yes: boolean): void {
  const o = s.objects[card];
  if (!yes || !o || (o.zone !== "graveyard" && o.zone !== "exile")) return;
  emit({ type: "moved", owner: o.owner, objectId: card, defId: o.defId, from: o.zone, to: "command" });
  moveObject(s, card, "command");
}

export function answerLegendChoice(s: GameState, keep: ObjectId, options: ObjectId[]): void {
  for (const id of options) if (id !== keep && onBattlefield(s, id)) putIntoGraveyard(s, id);
}
