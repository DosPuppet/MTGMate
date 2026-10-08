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
  setMonarch,
  setSpeed,
  sourceFromObject,
} from "./actions";
import { absentAnswer, ask, cardRef } from "./choices";
import { syncControl } from "./control";
import { announceDiscard, announceDiscardBatch, evalAmount, moveDiscarded, staticContext } from "./effects";
import { rethrowAsRules } from "./errors";
import { bumpFor, copiedDefId, copiedDefMap, copyingIn, effectivePower, snapshot } from "./layers";
import { MAX_FLOW_STEPS, MAX_SBA_PASSES } from "./limits";
import { manaValue, payMana } from "./mana";
import { answerCastNow, answerResolutionChoice, dropNowPermissions, RulesError, resolveTop } from "./stack";
import { announceNext } from "./stackChoices";
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
  cantLose,
  consumePlayerEffect,
  playerEffectValues,
  playerStatic,
  playerStatics,
  playerStaticTotal,
  skips,
  untapStepRule,
} from "./statics";
import { matchesObjectFilter, matchesView, protectedFrom, resolveFilter, sourceView } from "./targets";
import { processTriggers, pushInline, releaseDelayedTriggers, rulesTrigger, simultaneously } from "./triggers";
import { countTurnEvents, logTurnEvent } from "./turnlog";
import type {
  CardDef,
  Effect,
  GameState,
  ManaType,
  ObjectFilter,
  ObjectId,
  PendingDecision,
  PlayerId,
  StackItem,
  Step,
} from "./types";
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

/**
 * Étape de dégagement (502.3) : les permanents du joueur actif se dégagent, sauf ceux qu'il a choisi de garder engagés
 * (`keep`), ceux qui ne se dégagent pas lors de son étape de dégagement (remplacement `untap` avec `untapStep`) et ceux
 * qui sont épuisés (701.43). Prop Room, Unwinding Clock : les créatures (les artefacts) d'un autre joueur se dégagent
 * aussi (ce n'est pas l'étape de dégagement de leur contrôleur).
 */
function untapStep(s: GameState, keep: ObjectId[]): void {
  const active = s.turn.active;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    // Prop Room, Unwinding Clock : les créatures (les artefacts) de ce joueur se dégagent aussi pendant l'étape de
    // dégagement des autres joueurs.
    const propRoom =
      o.controller !== active &&
      playerStatics(s, o.controller, "untapOnOthersUntap").some(
        ({ id: src, ab }) => !!ab.untapOnOthersUntap && matchesObjectFilter(s, o.controller, id, ab.untapOnOthersUntap, src),
      );
    if (o.controller !== active && !propRoom) continue;
    // 701.43 : un permanent épuisé ne se dégage pas lors de la prochaine étape de dégagement (de son contrôleur).
    if (o.exerted && !propRoom) {
      o.exerted = undefined;
      continue;
    }
    if (!o.tapped || keep.includes(id)) continue;
    if (!propRoom && untapStepRule(s, id) === true) continue;
    // 122.1d : un marqueur d'étourdissement est retiré à la place du dégagement (`untapObject`).
    if (untapObject(s, o)) {
      const stats = s.players[o.controller]?.turnStats;
      if (stats && o.controller === active) stats.untappedInUntapStep = (stats.untappedInUntapStep ?? 0) + 1;
    }
  }
  s.flow = "stepEnd"; // pas de priorité pendant l'étape de dégagement
}

/** Réponse à la question de l'étape de dégagement : les permanents gardés engagés. */
export function answerUntapStep(s: GameState, keep: string[]): void {
  untapStep(s, keep);
}

/** Début d'étape : déclenche les capacités « au début de… ». */
function stepEvent(s: GameState): void {
  if (s.turn.step === "end") releaseDelayedTriggers(s);
  // Monarque (724.2) : « au début de l'étape de fin du monarque, ce joueur pioche une carte » (capacité sur la pile).
  if (s.turn.step === "end" && s.monarch === s.turn.active && !s.players[s.monarch]?.lost) rulesTrigger(s, s.monarch, "monarch");
  if (s.turn.step === "endCombat") releaseDelayedTriggers(s, "endCombat");
  if (s.turn.step === "main1" || s.turn.step === "main2") releaseDelayedTriggers(s, "main");
  // Radiation (Fallout) : au début de sa phase principale précombat, si le joueur actif a des marqueurs de radiation
  // (condition revérifiée à la résolution).
  if (s.turn.step === "main1" && s.turn.mainPhase === 1 && !s.players[s.turn.active]?.lost)
    rulesTrigger(s, s.turn.active, "radiation");
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
 * partie à plusieurs (trois joueurs ou plus), le premier mulligan ne compte pas ; en Commander aussi, duel compris
 * (règle du format, choix de l'utilisateur).
 */
function mulliganBottom(s: GameState, mulligans: number): number {
  return Math.max(0, mulligans - (s.playerOrder.length > 2 || s.commander ? 1 : 0));
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
    case "untap": {
      // 502.1 : le retour en phase précède le dégagement.
      phaseIn(s, active);
      // 502.3 : le joueur actif choisit d'abord les permanents qu'il peut ne pas dégager (Hedge Whisperer : « vous pouvez
      // choisir de ne pas dégager cette créature lors de votre étape de dégagement »), puis tout se dégage en même temps.
      const optional = s.battlefield.filter((id) => {
        const o = obj(s, id);
        return o.controller === active && o.tapped && !o.exerted && untapStepRule(s, id) === "may";
      });
      if (optional.length === 0) {
        untapStep(s, []);
        return;
      }
      ask(
        s,
        active,
        {
          type: "pick",
          intent: "other",
          prompt: "Permanents que vous ne dégagez pas lors de cette étape de dégagement",
          options: optional,
          min: 0,
          max: optional.length,
          // Réponse proposée : les garder engagés tant qu'un effet dure « tant qu'ils restent engagés ».
          suggested: optional.filter((id) => s.effects.some((e) => e.whileSourceTapped === id)),
        },
        { kind: "untap", player: active },
      );
      s.flow = "tba";
      return;
    }
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
      // Les bloqueurs sont en cours de déclaration : aucun attaquant n'est encore « non bloqué » (filtre `blocked`).
      bumpFor(s, "blocks");
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
  expireEmblems(s);
  // Fin des changements de contrôle « jusqu'à la fin du tour » (Involuntary Employment) : couche 2 recalculée.
  syncControl(s);
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (pl) {
      pl.manaKeep = undefined;
      pl.manaKeepCombat = undefined;
      if (pl.restrictedMana?.some((m) => m.keep)) {
        pl.restrictedMana = pl.restrictedMana.filter((m) => !m.keep);
        if (!pl.restrictedMana.length) pl.restrictedMana = undefined;
        bumpFor(s, "mana");
      }
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
    // Le mana marqué « gardé jusqu'à la fin du tour » reste (Klauth) ; il se vide au nettoyage.
    const kept = player.restrictedMana?.filter((m) => m.keep);
    player.restrictedMana = kept?.length ? kept : undefined;
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
  if (next === "draw" && skips(s, s.turn.active, "drawStep")) next = "main1";
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
    while (extra && skips(s, extra, "extraTurns")) extra = s.extraTurns?.pop();
    s.turn.active = extra && s.players[extra] && !s.players[extra]?.lost ? extra : nextPlayer(s, s.turn.active);
    // Ral Zarek : un joueur qui doit passer son tour le passe (un effet consommé par tour passé).
    for (let guard = 0; guard < s.playerOrder.length && consumePlayerEffect(s, s.turn.active, "skips", "turn"); guard++)
      s.turn.active = nextPlayer(s, s.turn.active);
    s.turn.endSteps = 0;
    clearAdded(s);
    delete s.turn.mainPhase;
    s.turn.combats = 0;
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    s.turn.landsPlayed = 0;
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

/**
 * Emblèmes temporaires (`GameObject.expires`) : au nettoyage (sans joueur), ceux dont le tour de fin est atteint ; au
 * début du tour de `startOf`, ceux qui durent jusqu'à son prochain tour.
 */
function expireEmblems(s: GameState, startOf?: PlayerId): void {
  for (const p of s.playerOrder) {
    for (const id of [...(s.players[p]?.command ?? [])]) {
      const x = s.objects[id]?.expires;
      if (!x) continue;
      const due = "endOfTurn" in x ? startOf === undefined && s.turn.number >= x.endOfTurn : x.turnOf === startOf;
      if (due) moveObject(s, id, "exile");
    }
  }
}

export function startTurnOf(s: GameState, p: PlayerId): void {
  // 722 : le tour contrôlé commence (ou le contrôle précédent se termine).
  if (s.turnControl?.turn !== undefined && s.turnControl.turn !== s.turn.number) s.turnControl = undefined;
  if (s.turnControl && s.turnControl.turn === undefined && s.turnControl.player === p) {
    s.turnControl.turn = s.turn.number;
    // Emrakul, the Promised End : « après ce tour, ce joueur prend un tour supplémentaire ».
    if (s.turnControl.thenExtraTurn) s.extraTurns = [...(s.extraTurns ?? []), p];
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
  // « la première fois que cette capacité se résout ce tour-ci » (Nissa, Leyline Tamer ; Belladonna Took) : compteurs remis
  // à zéro à chaque tour.
  s.turn.resolutionCounts = undefined;
  // « Jusqu'à votre prochain tour » : effets et emblèmes temporaires de ce joueur.
  const before = s.effects.length;
  s.effects = s.effects.filter((e) => !(e.duration === "untilYourNextTurn" && e.until === p));
  if (s.effects.length !== before) bump(s);
  expireEmblems(s, p);
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
 * Exigence d'attaque d'une créature (508.1d) : attaquer (« attaque à chaque combat si possible », provocation), attaquer
 * un joueur autre que `not` (provocation, 701.38a), ou l'un des joueurs `players` (Silver Surfer, Galactus). Une attaque
 * contre un planeswalker ne satisfait que la première.
 */
export type AttackRequirement =
  | { kind: "attack" }
  | { kind: "otherPlayer"; not: PlayerId }
  | { kind: "player"; players: PlayerId[] };

/** Les exigences d'attaque d'une créature. */
export function attackRequirements(s: GameState, id: ObjectId): AttackRequirement[] {
  const out: AttackRequirement[] = [];
  if (hasKeyword(s, id, "mustAttack")) out.push({ kind: "attack" });
  const goaders = new Set<string>();
  for (const r of chars(s, id).blockRules) {
    // 701.38c : chaque joueur qui la provoque ajoute ses exigences ; le même joueur, une seule fois. Les règles de `fx.goad`
    // ont toutes le même libellé : une règle de même forme qui n'est pas une provocation (Maximum Carnage) a le sien et
    // garde ses exigences à côté d'une provocation du même joueur.
    const key = `${r.goadedBy}|${r.label}`;
    if (r.goadedBy && r.goadedBy !== "you" && !goaders.has(key)) {
      goaders.add(key);
      out.push({ kind: "attack" }, { kind: "otherPlayer", not: r.goadedBy });
    }
    if (r.mustAttackPlayer === "mostLifeOpponent") {
      // Galactus : un adversaire qui a le plus de points de vie parmi les adversaires de son contrôleur.
      const opps = opponentsOf(s, obj(s, id).controller);
      const top = Math.max(...opps.map((p) => s.players[p]?.life ?? 0));
      out.push({ kind: "player", players: opps.filter((p) => (s.players[p]?.life ?? 0) === top) });
    } else if (r.mustAttackPlayer && r.mustAttackPlayer !== "eventPlayer")
      out.push({ kind: "player", players: [r.mustAttackPlayer] });
  }
  return out;
}

/** Nombre d'exigences satisfaites par une attaque contre ce défenseur (`null` : elle n'attaque pas). */
function obeyedAttack(s: GameState, reqs: AttackRequirement[], defender: string | null): number {
  if (!defender) return 0;
  const player = s.players[defender] ? defender : null;
  return reqs.filter(
    (r) => r.kind === "attack" || (player !== null && (r.kind === "otherPlayer" ? player !== r.not : r.players.includes(player))),
  ).length;
}

/** Ce que cette créature peut attaquer : les défenseurs de son contrôleur, moins ses restrictions (taxe comprise). */
export function allowedDefenders(s: GameState, id: ObjectId): string[] {
  if (!canAttack(s, id)) return [];
  return attackableDefenders(s, obj(s, id).controller).filter((d) => !attackRestriction(s, id, d));
}

/**
 * Les défenseurs qui satisfont le plus d'exigences de cette créature sans payer de taxe (provocation : un joueur autre
 * que celui qui l'a provoquée) ; tous ceux qu'elle peut attaquer si elle n'a pas d'exigence ou n'en peut satisfaire aucune.
 */
export function preferredDefenders(s: GameState, id: ObjectId): string[] {
  const allowed = allowedDefenders(s, id);
  const reqs = attackRequirements(s, id);
  if (reqs.length === 0) return allowed;
  const free = allowed.filter((d) => attackTaxFor(s, d) === 0);
  const best = Math.max(0, ...free.map((d) => obeyedAttack(s, reqs, d)));
  return best > 0 ? free.filter((d) => obeyedAttack(s, reqs, d) === best) : allowed;
}

type Attack = { id: ObjectId; defender: string };

/** Tomik, Orzhov Lawmage : une seule créature attaque chacun de ses planeswalkers ; Mirri : une seule attaque son contrôleur. */
function oneAttackerOnly(s: GameState, defender: string): boolean {
  const walker = s.objects[defender];
  return walker
    ? playerStatics(s, walker.controller, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "walkers")
    : playerStatics(s, defender, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "you");
}

/** La déclaration respecte-t-elle « une seule créature attaque » (Mirri, Tomik) ? */
function oneAttackerLegal(s: GameState, attacks: Attack[]): boolean {
  for (const d of new Set(attacks.map((a) => a.defender)))
    if (oneAttackerOnly(s, d) && attacks.filter((a) => a.defender === d).length > 1) return false;
  return true;
}

/** La créature seule de cette déclaration ne peut pas attaquer seule (Toby, Beastie Befriender). */
function loneNotAlone(s: GameState, attacks: Attack[]): boolean {
  const lone = attacks.length === 1 ? attacks[0]?.id : undefined;
  return !!lone && chars(s, lone).blockRules.some((r) => r.notAlone);
}

/** La déclaration respecte-t-elle « une seule créature attaque » et « pas seule » ? */
function attackShapeLegal(s: GameState, attacks: Attack[]): boolean {
  return oneAttackerLegal(s, attacks) && !loneNotAlone(s, attacks);
}

/**
 * « Pas seule » : une autre créature qui peut accompagner cette attaque seule sans coût, sinon null. Elle rend légale une
 * déclaration qui respecte les exigences de la première (508.1d).
 */
function attackCompanion(s: GameState, player: PlayerId, attacks: Attack[]): Attack | null {
  for (const id of attackCandidates(s, player)) {
    if (attacks.some((a) => a.id === id)) continue;
    for (const defender of allowedDefenders(s, id)) {
      const a = { id, defender };
      if (attackTaxFor(s, defender) === 0 && oneAttackerLegal(s, [...attacks, a])) return a;
    }
  }
  return null;
}

/** Nœuds au plus de la recherche du maximum (comme pour les blocages). */
const ATTACK_SEARCH_NODES = 50_000;

/**
 * 508.1d : le plus grand nombre d'exigences d'attaque qu'une déclaration légale peut respecter sans payer de coût, et une
 * telle déclaration (pour les seules créatures qui ont des exigences, plus une compagne si l'une d'elles ne peut pas
 * attaquer seule). `prefer` : les attaques voulues, essayées d'abord. `paid` : les attaques dont la déclaration paie la
 * taxe ; chacune s'ajoute aux choix de sa créature, sans dispenser les autres de leurs exigences sans coût.
 */
function bestRequiredAttacks(
  s: GameState,
  player: PlayerId,
  prefer: Attack[] = [],
  paid: Attack[] = [],
): { max: number; best: Attack[] } {
  const relevant = attackCandidates(s, player)
    .map((id) => ({ id, reqs: attackRequirements(s, id) }))
    .filter((x) => x.reqs.length > 0);
  if (relevant.length === 0) return { max: 0, best: [] };
  // Pour chaque créature : les défenseurs sans taxe qui satisfont au moins une exigence, du meilleur au moins bon (à
  // égalité, l'attaque voulue, puis les joueurs avant les planeswalkers), puis « n'attaque pas ».
  const domains = relevant.map(({ id, reqs }) => {
    const wanted = prefer.find((a) => a.id === id)?.defender;
    const opts = allowedDefenders(s, id)
      .filter((d) => attackTaxFor(s, d) === 0 || paid.some((a) => a.id === id && a.defender === d))
      .map((d) => ({ d: d as string | null, n: obeyedAttack(s, reqs, d) }))
      .filter((o) => o.n > 0)
      .sort((a, b) => b.n - a.n || Number(b.d === wanted) - Number(a.d === wanted));
    return [...opts, { d: null, n: 0 }];
  });
  const rest = domains.map((d) => d[0]?.n ?? 0);
  for (let i = rest.length - 2; i >= 0; i--) rest[i] = (rest[i] as number) + (rest[i + 1] as number);
  const bound = rest[0] ?? 0;
  let best: Attack[] = [];
  let max = -1;
  let nodes = 0;
  const current: Attack[] = [];
  const visit = (i: number, score: number): void => {
    if (++nodes > ATTACK_SEARCH_NODES || max === bound) return;
    if (i === relevant.length) {
      if (score <= max || !oneAttackerLegal(s, current)) return;
      const companion = loneNotAlone(s, current) ? attackCompanion(s, player, current) : undefined;
      if (companion === null) return;
      max = score;
      best = companion ? [...current, companion] : [...current];
      return;
    }
    if (score + (rest[i] ?? 0) <= max) return;
    for (const o of domains[i] ?? []) {
      if (o.d) current.push({ id: relevant[i]?.id as ObjectId, defender: o.d });
      visit(i + 1, score + o.n);
      if (o.d) current.pop();
    }
  };
  visit(0, 0);
  return { max: Math.max(0, max), best };
}

/** Nombre d'exigences d'attaque respectées par une déclaration (une attaque payée compte aussi). */
function obeyedAttacks(s: GameState, attacks: Attack[]): number {
  return attacks.reduce((n, a) => n + obeyedAttack(s, attackRequirements(s, a.id), a.defender), 0);
}

/**
 * 508.1d : pourquoi cette déclaration respecte moins d'exigences d'attaque qu'une autre déclaration légale (sans coût),
 * sinon null.
 */
export function unmetAttackRequirement(s: GameState, player: PlayerId, attacks: Attack[]): string | null {
  const paid = attacks.filter((a) => attackTaxFor(s, a.defender) > 0);
  const { max, best } = bestRequiredAttacks(s, player, [], paid);
  if (max === 0 || obeyedAttacks(s, attacks) >= max) return null;
  for (const b of best) {
    const reqs = attackRequirements(s, b.id);
    const mine = attacks.find((a) => a.id === b.id);
    if (obeyedAttack(s, reqs, mine?.defender ?? null) >= obeyedAttack(s, reqs, b.defender)) continue;
    const name = chars(s, b.id).name;
    if (!mine) return `${name} doit attaquer si elle le peut`;
    if (reqs.some((r) => r.kind === "player")) return `${name} doit attaquer le joueur imposé si possible`;
    return `${name} est provoquée : elle doit attaquer un joueur autre que celui qui l'a provoquée si possible`;
  }
  return "Cette déclaration ne respecte pas autant d'exigences d'attaque que possible";
}

/**
 * Créatures obligées d'attaquer (508.1d) : celles de la meilleure déclaration des exigences. Une obligation n'impose
 * jamais de payer un coût : si chaque défenseur possible exige une taxe d'attaque (Archangel of Tithes), elles ne sont pas
 * obligées d'attaquer.
 */
export function forcedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  return forcedAttacks(s, player).map((a) => a.id);
}

/**
 * Les attaques obligées, chacune vers le défenseur qui satisfait le plus d'exigences (provocation : un joueur autre que
 * celui qui l'a provoquée ; à défaut, un joueur avant un planeswalker) : déclaration par défaut et automatisme.
 */
export function forcedAttacks(s: GameState, player: PlayerId): Attack[] {
  return bestRequiredAttacks(s, player).best;
}

/**
 * Attaques voulues (par l'IA) complétées pour respecter le plus d'exigences possible : les créatures qui en ont reprennent
 * la meilleure attaque proche de celle voulue ; les autres gardent la leur, ou attaquent un autre défenseur sans taxe si
 * « une seule créature attaque » (Mirri, Tomik) l'interdit désormais, ou restent chez elles.
 */
export function repairAttacks(s: GameState, player: PlayerId, attacks: Attack[]): Attack[] {
  if (!unmetAttackRequirement(s, player, attacks)) return attacks;
  const { best } = bestRequiredAttacks(s, player, attacks);
  const fixed = new Set(best.map((a) => a.id));
  const merged = [...best];
  for (const a of attacks) {
    if (fixed.has(a.id)) continue;
    const others = allowedDefenders(s, a.id).filter((d) => d !== a.defender && attackTaxFor(s, d) === 0);
    const defender = [a.defender, ...others].find((d) => oneAttackerLegal(s, [...merged, { id: a.id, defender: d }]));
    if (defender) merged.push({ id: a.id, defender });
  }
  return attackShapeLegal(s, merged) && !unmetAttackRequirement(s, player, merged) ? merged : best;
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

/**
 * Taxe d'attaque pour attaquer ce défenseur : {N} par créature. Propaganda ne taxe que les attaques contre son contrôleur,
 * Archangel of Tithes (`defending: "youOrYourPlaneswalkers"`) aussi celles contre ses planeswalkers.
 */
export function attackTaxFor(s: GameState, defender: string): number {
  const walker = !s.players[defender];
  let n = 0;
  for (const { ab } of playerStatics(s, defendingPlayer(s, defender), "attackTax")) {
    const tax = ab.attackTax;
    if (typeof tax === "number") n += walker ? 0 : tax;
    else if (tax) n += tax.amount;
  }
  return n;
}

export function attackCandidates(s: GameState, player: PlayerId): ObjectId[] {
  return creaturesControlledBy(s, player).filter((id) => canAttack(s, id));
}

/** Joueur défenseur d'une attaque : le joueur attaqué, ou le contrôleur du planeswalker attaqué (dernier connu s'il est parti). */
export function defendingPlayer(s: GameState, defender: string): PlayerId {
  if (s.players[defender]) return defender;
  return s.objects[defender]?.controller ?? s.lki[defender]?.controller ?? defender;
}

/**
 * Ce qu'un joueur peut attaquer : ses adversaires et leurs planeswalkers (506.2). `declared` : faux pour un permanent mis
 * sur le champ de bataille attaquant (508.4), que les restrictions d'attaque des joueurs ne concernent pas.
 */
export function attackableDefenders(s: GameState, player: PlayerId, declared = true): string[] {
  // « Ne peut pas attaquer [ce joueur ni ses planeswalkers] » (`cantAttack`) : Sandswirl Wanderglyph (« il ne peut pas
  // vous attaquer, ni les planeswalkers que vous contrôlez, ce tour-ci ») ; avec un sous-type, seulement ces
  // planeswalkers (Jace, Multiverse Architect : « ses créatures ne peuvent pas attaquer vos Jace ce tour-ci »).
  const bans = declared ? playerEffectValues(s, player, "cantAttack") : [];
  const banned = (d: string) => {
    const walker = s.objects[d];
    const of = walker ? walker.controller : d;
    return bans.some((b) => b.of === of && (!b.subtype || (!!walker && chars(s, d).subtypes.includes(b.subtype))));
  };
  const opps = opponentsOf(s, player);
  // The Aetherspark : « tant qu'il est attaché à une créature, il ne peut pas être attaqué ».
  const walkers = s.battlefield.filter(
    (id) => opps.includes(obj(s, id).controller) && hasType(s, id, "Planeswalker") && !obj(s, id).attachedTo,
  );
  return [...opps, ...walkers].filter((d) => !banned(d));
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
  for (const { id, ab, timestamp } of playerStatics(s, player, "maxHandSize")) {
    const amount = ab.maxHandSize;
    if (amount === undefined) continue;
    if (amount === "none") {
      set.push({ ts: tsOf(id, timestamp), value: () => null });
      continue;
    }
    const ctx = staticContext(s, (id && s.objects[id]?.controller) || player, id, { sourceDefId: "" });
    set.push({ ts: tsOf(id, timestamp), value: () => Math.max(0, evalAmount(s, ctx, amount)) });
  }
  if (!set.length) return MAX_HAND_SIZE;
  let last = set[0] as (typeof set)[number];
  for (const e of set) if (e.ts >= last.ts) last = e;
  return last.value();
}

export function declareAttackers(s: GameState, player: PlayerId, declared: { id: ObjectId; defender: string }[]): void {
  let attackers = declared;
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
    if (oneAttackerOnly(s, w) && attackers.filter((a) => a.defender === w).length > 1) {
      throw new RulesError(`Une seule créature peut attaquer ${s.objects[w] ? chars(s, w).name : "ce joueur"}`);
    }
  }
  // 508.1d : la déclaration respecte autant d'exigences d'attaque que possible (« attaque à chaque combat si possible »,
  // provocation, « attaque ce joueur ») ; une obligation n'impose pas de payer une taxe d'attaque.
  const unmet = unmetAttackRequirement(s, player, attackers);
  if (unmet) throw new RulesError(unmet);
  // Toby, Beastie Befriender : « ce jeton ne peut pas attaquer seul ».
  const alone = attackers.length === 1 ? attackers[0]?.id : undefined;
  if (alone && chars(s, alone).blockRules.some((r) => r.notAlone))
    throw new RulesError(`${chars(s, alone).name} ne peut pas attaquer seule`);
  // 508.1f : les créatures qui attaquent s'engagent, puis (508.1h) la taxe d'attaque se paie (Archangel of Tithes : {1}
  // pour chaque créature qui attaque un joueur protégé ou ses planeswalkers) ; une créature sacrifiée pour la payer
  // (Rejeton Eldrazi) quitte le combat.
  for (const a of attackers) if (!hasKeyword(s, a.id, "vigilance")) tapObject(s, obj(s, a.id));
  const tax = attackers.reduce((n, a) => n + attackTaxFor(s, a.defender), 0);
  if (tax > 0) {
    try {
      payMana(s, player, { generic: tax, colored: {}, x: 0 });
    } catch (e) {
      rethrowAsRules(e, `Il faut payer {${tax}} pour attaquer`);
    }
    attackers = attackers.filter((a) => s.objects[a.id]?.zone === "battlefield" && s.objects[a.id]?.controller === player);
  }
  if (!s.combat) s.combat = emptyCombat();
  for (const a of attackers) s.combat.attackers.push({ id: a.id, defender: a.defender, blockers: [], blocked: false });
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
  // « Ne peut pas être bloquée par les créatures que ce joueur contrôle » (The Black Gate).
  if (chars(s, attacker).blockRules.some((r) => r.cantBeBlockedByPlayer === b.controller)) return false;
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
  // Les attaquants deviennent bloqués ou non bloqués (filtres `blocked` et `blocking` des statiques : Throatseeker).
  bumpFor(s, "blocks");
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
    // Monarque (724.2) : chaque créature qui inflige des blessures de combat au monarque déclenche une capacité contrôlée par
    // lui, qui fait du contrôleur de la créature le monarque à sa résolution.
    const monarch = s.monarch;
    if (monarch) for (const id of new Set(byPlayer.get(monarch))) rulesTrigger(s, monarch, "monarchSteal", { objectId: id });
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
      if (!opponents.some((q) => cantLose(s, q))) losers.push(...opponents.filter((q) => !losers.includes(q)));
      continue;
    }
    // Herald of Eternal Dawn : « vous ne pouvez pas perdre la partie ». 704.5c : 10 marqueurs poison ou plus.
    // Marina Vendrell's Grimoire : « vous ne perdez pas la partie pour avoir 0 point de vie ou moins ».
    const lifeLoss = player.life <= 0 && !cantLose(s, p, "life");
    const poisoned = (player.counters?.poison ?? 0) >= 10;
    // 704.6c : 21 blessures de combat ou plus d'un même commandant au cours de la partie.
    const commanderDamage = !!s.commander && Object.values(s.commander.cards).some((c) => (c.damage[p] ?? 0) >= 21);
    if ((lifeLoss || player.drewFromEmptyLibrary || poisoned || commanderDamage) && !cantLose(s, p)) {
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
  // 724.4 : le monarque quitte la partie : le joueur actif le devient (le suivant si c'est lui qui part).
  if (s.monarch && losers.includes(s.monarch)) {
    const next = [s.turn.active, ...s.playerOrder].find((p) => !s.players[p]?.lost);
    s.monarch = undefined;
    if (next) setMonarch(s, next);
  }
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
  const pending = s.pending;
  const pendingLeaving = !!pending && losers.includes(pending.player);
  if (pendingLeaving) s.pending = null;
  if (s.flow === "mulligan") return;
  // Abandon en pleine résolution (800.4a) : le joueur à qui la question était posée, ou le contrôleur de ce qui se
  // résout, quitte la partie ; la résolution reprend sans lui, ou s'arrête si l'objet a quitté la pile avec lui.
  const resolvingGone = !!s.resolving && !s.stack.some((x) => x.id === s.resolving?.item.id);
  const resume = s.flow === "resolving" && !!s.resolving?.awaiting && (pendingLeaving || resolvingGone);
  if (resume) {
    s.pending = null;
    resumeWithoutLeaver(s, pending);
  }
  if (activeLeaving) {
    // Simplification : le tour d'un joueur qui quitte la partie s'arrête immédiatement.
    s.combat = null;
    bump(s);
    s.turn.step = "cleanup";
    s.flow = "stepEnd";
  } else if (pendingLeaving && s.flow === "tba") {
    nextBlockingPlayer(s); // seul cas où un joueur non actif doit une action de tour
  } else if (holderLeaving && !resume) {
    // Après une résolution reprise, la priorité a déjà été rendue (au joueur actif, 117.3b).
    s.priority = { holder: nextPlayer(s, s.priority.holder), passes: 0 };
  }
}

/**
 * 800.4a : le joueur à qui une résolution posait une question, ou le contrôleur de ce qui se résout, quitte la partie
 * (abandon). Le sort ou la capacité d'un joueur qui part a quitté la pile avec lui : la résolution s'arrête. Sinon, elle reprend avec la réponse d'un absent
 * (`absentAnswer`, refus d'un « lancez-la maintenant »), comme `continueResolution` pour les questions suivantes.
 */
function resumeWithoutLeaver(s: GameState, pending: PendingDecision | null): void {
  const r = s.resolving;
  if (!r?.awaiting) return;
  if (!pending || !s.stack.some((x) => x.id === r.item.id)) {
    s.resolving = null;
    dropNowPermissions(s);
    afterResolution(s);
    return;
  }
  // Capacité de mana (605.3b) : la priorité revient au joueur qui l'a activée.
  const back = r.returnPriority;
  const done = pending.kind === "choice" ? answerResolutionChoice(s, absentAnswer(pending.request)) : answerCastNow(s, null);
  if (!done) return;
  if (back) {
    s.priority = back;
    s.flow = "priority";
  } else afterResolution(s);
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
    // Ascension (702.131b) : le contrôleur d'un permanent qui l'a et qui contrôle dix permanents ou plus reçoit la
    // bénédiction de la cité pour le reste de la partie (une capacité statique, vérifiée aux mêmes moments que ces actions).
    for (const id of s.battlefield) {
      const pl = s.players[obj(s, id).controller];
      if (!pl || pl.citysBlessing || !hasKeyword(s, id, "ascend")) continue;
      if (s.battlefield.filter((x) => obj(s, x).controller === pl.id).length >= 10) {
        pl.citysBlessing = true;
        bump(s);
      }
    }
    const toGraveyard: ObjectId[] = [];
    const toDestroy: ObjectId[] = [];
    let changed = false;
    // Définitions copiées, en un parcours (test des Sagas) ; sans copie en jeu, la face de chaque permanent.
    const copied = copyingIn(s) ? copiedDefMap(s) : null;

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
      const saga = s.defs[copied?.get(id) ?? o.faceDefId ?? o.defId]?.saga;
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
    // 903.9a et 903.9b : un commandant arrivé dans un cimetière, en exil, dans la main ou dans la bibliothèque de son
    // propriétaire depuis la dernière vérification : son propriétaire peut le remettre dans la zone de commandement (une
    // question par objet, jamais répondue par l'automatisme ; un refus vaut jusqu'à son prochain changement de zone).
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
          // En main, le commandant se relance sans taxe (903.8) : le garder est proposé (Command Beacon) ; ailleurs, oui.
          suggested: [obj(s, offer.id).zone === "hand" ? 0 : 1],
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

/**
 * 903.9a et 903.9b : le premier commandant au cimetière, en exil, dans la main ou dans la bibliothèque de son
 * propriétaire dont le retour n'a pas encore été proposé. 903.9b est un remplacement : la question est posée juste après
 * l'arrivée en main ou dans la bibliothèque, à la vérification suivante (approximation de timing).
 */
function commanderReturnOffer(s: GameState): { owner: PlayerId; id: ObjectId } | undefined {
  const cards = s.commander?.cards;
  if (!cards) return undefined;
  // Vérifié à chaque passe des actions basées sur l'état : mêmes zones dans le même ordre, sans copier les listes.
  for (const [uid, rec] of Object.entries(cards)) {
    const owner = s.players[rec.owner];
    if (!owner || owner.lost) continue;
    for (const zone of [owner.graveyard, s.exile, owner.hand, owner.library])
      for (const id of zone) {
        const o = s.objects[id];
        if (o && !o.isToken && o.uid === uid && rec.offered !== id) {
          rec.offered = id;
          return { owner: rec.owner, id };
        }
      }
  }
  return undefined;
}

/** Zones d'où un commandant peut retourner dans la zone de commandement (903.9a, 903.9b). */
const COMMANDER_RETURN_ZONES: readonly string[] = ["graveyard", "exile", "hand", "library"];

/**
 * 903.9a et 903.9b : réponse du propriétaire ; oui, le commandant (toujours dans la zone où il est arrivé) va dans la
 * zone de commandement.
 */
export function answerCommanderZone(s: GameState, card: ObjectId, yes: boolean): void {
  const o = s.objects[card];
  if (!yes || !o || !COMMANDER_RETURN_ZONES.includes(o.zone)) return;
  emit({ type: "moved", owner: o.owner, objectId: card, defId: o.defId, from: o.zone, to: "command" });
  moveObject(s, card, "command");
}

export function answerLegendChoice(s: GameState, keep: ObjectId, options: ObjectId[]): void {
  for (const id of options) if (id !== keep && onBattlefield(s, id)) putIntoGraveyard(s, id);
}
