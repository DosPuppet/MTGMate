/**
 * API publique du moteur : création de partie et soumission de décisions.
 * Chaque appel renvoie un nouvel état (copie de travail, l'état reçu n'est jamais modifié) et les événements produits.
 */

import { drawCard } from "./actions";
import { divisionOf, validateChoice } from "./choices";
import { checkDecisionShape } from "./decisionShape";
import { outcomeHash } from "./fingerprint";
import { LOOP_LIMIT, LOOP_SUSPECT } from "./limits";
import { activateManaAbility, undoMana } from "./mana";
import { activateAbility, answerCastNow, answerResolutionChoice, castSpell, playLand, RulesError } from "./stack";
import { answerStackChoice } from "./stackChoices";
import {
  cloneState,
  collectEvents,
  createObject,
  decider,
  emit,
  emptyPool,
  emptyTurnStats,
  opponentsOf,
  random,
  registerDef,
  shuffle,
} from "./state";
import { answerTriggerMode, answerTriggerOrder, answerTriggerTarget } from "./triggers";
import {
  advance,
  afterResolution,
  answerCombatAssignment,
  answerLegendChoice,
  answerLeylines,
  bottomCards,
  declareAttackers,
  declareBlockers,
  declareLoopDraw,
  declareMulligan,
  discardToHandSize,
  eliminate,
  keepHand,
  passPriority,
} from "./turn";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  deck: CardDef[];
}

export interface GameOptions {
  seed: number;
  /** Deux joueurs ou plus, dans l'ordre du tour. */
  players: PlayerSetup[];
  startingPlayer?: PlayerId;
  startingLife?: number;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/** État vide d'une partie : les joueurs, sans aucune carte (partagé par `createGame` et `createScenario`). */
export function blankState(opts: {
  seed: number;
  players: { id: PlayerId; name: string; life?: number }[];
  startingLife?: number;
}): GameState {
  if (opts.players.length < 2) throw new Error("Il faut au moins deux joueurs");
  const first = opts.players[0] as { id: PlayerId };
  const s: GameState = {
    version: 0,
    rng: opts.seed | 0,
    idCounters: {},
    timestamp: 0,
    defs: {},
    objects: {},
    players: {},
    playerOrder: opts.players.map((p) => p.id),
    battlefield: [],
    exile: [],
    stack: [],
    turn: {
      number: 0,
      active: first.id,
      step: "untap",
      landsPlayed: 0,
      onceFired: [],
      startingPlayer: first.id,
    },
    flow: "mulligan",
    priority: { holder: first.id, passes: 0 },
    combat: null,
    effects: [],
    pending: null,
    mulliganQueue: [],
    resolving: null,
    replacements: [],
    triggers: [],
    delayed: [],
    linkedExile: [],
    lki: {},
    turnLog: [],
    playerEffects: [],
    winner: null,
    over: false,
  };
  for (const p of opts.players) {
    const life = p.life ?? opts.startingLife ?? 20;
    s.players[p.id] = {
      id: p.id,
      name: p.name,
      life,
      library: [],
      hand: [],
      graveyard: [],
      command: [],
      manaPool: emptyPool(),
      drewFromEmptyLibrary: false,
      lost: false,
      mulligans: 0,
      lastTurnStarted: 0,
      startingLife: opts.startingLife ?? 20,
      turnStats: emptyTurnStats(),
    };
  }
  return s;
}

export function createGame(opts: GameOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    for (const p of opts.players) {
      for (const card of p.deck) {
        registerDef(s, card);
        createObject(s, card.id, p.id, "library");
      }
      shuffle(s, s.players[p.id]?.library ?? []);
    }
    const starting = opts.startingPlayer ?? (s.playerOrder[Math.floor(random(s) * s.playerOrder.length)] as PlayerId);
    s.turn.startingPlayer = starting;
    s.turn.active = starting;
    emit({ type: "gameStart", startingPlayer: starting });
    for (const p of s.playerOrder) for (let i = 0; i < 7; i++) drawCard(s, p);
    s.mulliganQueue = [starting, ...opponentsOf(s, starting)];
    advance(s);
    return s;
  });
  return { state, events };
}

function expect<T extends Decision["type"]>(d: Decision, ...types: T[]): asserts d is Extract<Decision, { type: T }> {
  if (!types.includes(d.type as T)) throw new RulesError(`Décision inattendue : ${d.type}`);
}

function apply(s: GameState, submitter: PlayerId, d: Decision): void {
  checkDecisionShape(s, d);
  // Toute autre décision que produire ou annuler du mana rend les engagements de mana définitifs.
  if (d.type !== "tapForMana" && d.type !== "undoMana") s.manaUndo = undefined;
  s.leftBatch = undefined;
  if (d.type === "concede") {
    const player = submitter;
    const pl = s.players[player];
    if (pl && !pl.lost) {
      emit({ type: "lose", player, reason: "concede" });
      eliminate(s, [player]);
    }
    return;
  }
  const p = s.pending;
  if (s.over || !p) throw new RulesError("Aucune décision attendue");
  // 722 : le joueur qui contrôle ce tour décide à la place du joueur contrôlé (la décision reste celle du joueur contrôlé).
  if (p.player !== submitter && decider(s) !== submitter) throw new RulesError("Ce n'est pas à vous de décider");
  const player = p.player;

  // La décision en attente est consommée avant d'appliquer la réponse : le gestionnaire
  // peut lui-même poser la décision suivante (défenseur suivant, cartes à remettre…).
  s.pending = null;
  switch (p.kind) {
    case "mulligan":
      expect(d, "keep", "mulligan");
      if (d.type === "keep") keepHand(s, player);
      else declareMulligan(s, player);
      return;
    case "bottomCards":
      expect(d, "bottom");
      bottomCards(s, player, d.cards, p.count);
      return;
    case "declareAttackers":
      expect(d, "declareAttackers");
      declareAttackers(s, player, d.attackers);
      return;
    case "declareBlockers":
      expect(d, "declareBlockers");
      declareBlockers(s, player, d.blocks);
      return;
    case "discard":
      expect(d, "discard");
      discardToHandSize(s, player, d.cards, p.count);
      return;
    case "choice": {
      expect(d, "choose");
      try {
        validateChoice(p.request, d.values);
      } catch (e) {
        s.pending = p; // la question reste posée
        throw e;
      }
      emit({ type: "choice", player, intent: p.request.intent });
      switch (p.purpose.kind) {
        case "effect": {
          // Capacité de mana (605.3b) : la priorité revient au joueur qui l'a activée.
          const back = s.resolving?.returnPriority;
          if (answerResolutionChoice(s, d.values)) {
            if (back) {
              s.priority = back;
              s.flow = "priority";
            } else afterResolution(s);
          }
          return;
        }
        case "combatDamage":
          if (p.request.type !== "divide") throw new RulesError("Répartition attendue");
          answerCombatAssignment(s, p.purpose.attacker, divisionOf(p.request, d.values));
          return;
        case "legend":
          if (p.request.type !== "pick") throw new RulesError("Choix attendu");
          answerLegendChoice(s, String(d.values[0]), p.request.options);
          return;
        case "triggerOrder":
          answerTriggerOrder(s, p.purpose.player, d.values.map(String));
          return;
        case "triggerTarget":
          answerTriggerTarget(s, p.purpose.trigger, p.purpose.spec, d.values.map(String));
          return;
        case "triggerMode":
          answerTriggerMode(s, p.purpose.trigger, Number(d.values[0]));
          return;
        case "leyline":
          answerLeylines(s, p.purpose.player, d.values.map(String));
          return;
        case "stackChoice":
          answerStackChoice(s, p.purpose.stackId, p.request, d.values);
          return;
      }
      return;
    }
    case "priority":
      if (p.castNow) {
        // 608.2g : lancer une des cartes proposées (ou passer pour refuser), puis la résolution reprend.
        expect(d, "pass", "cast", "tapForMana", "undoMana");
        if (d.type === "tapForMana" || d.type === "undoMana") {
          if (d.type === "tapForMana") activateManaAbility(s, player, d.source, d.ability, d.color);
          else undoMana(s, player, d.source);
          s.pending = p;
          return;
        }
        let spell: string | null = null;
        if (d.type === "cast") {
          if (!p.castNow.cards.includes(d.card)) throw new RulesError("Cette carte ne peut pas être lancée maintenant");
          castSpell(s, player, d.card, d);
          // Le sort lancé (nouvel objet sur la pile, 400.7) : les effets suivants peuvent s'y référer.
          spell = s.stack[s.stack.length - 1]?.sourceId ?? d.card;
        }
        if (answerCastNow(s, spell)) afterResolution(s);
        return;
      }
      expect(d, "pass", "playLand", "cast", "activate", "tapForMana", "undoMana");
      switch (d.type) {
        case "pass":
          passPriority(s, player);
          break;
        case "playLand":
          playLand(s, player, d.card, !!d.payLife, d.landType, d.chosen);
          s.priority.passes = 0;
          break;
        case "cast":
          castSpell(s, player, d.card, d);
          break;
        case "activate":
          activateAbility(s, player, d.source, d.ability, d);
          break;
        case "tapForMana":
          activateManaAbility(s, player, d.source, d.ability, d.color);
          break;
        case "undoMana":
          undoMana(s, player, d.source);
          break;
      }
      return;
  }
}

/**
 * Applique la décision d'un joueur puis fait avancer la partie jusqu'à la prochaine décision.
 * Lève une RulesError si la décision est illégale (l'état d'origine reste inchangé).
 */
export function submit(state: GameState, player: PlayerId, decision: Decision): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
    return s;
  });
  return { state: next, events };
}

/**
 * 104.4b : détection d'une boucle d'actions obligatoires. Tant que les joueurs ne font que passer alors que la pile n'est
 * pas vide (déclenchements qui se relancent), on compte ; au-delà de `LOOP_SUSPECT`, on relève l'empreinte canonique
 * de l'état (`outcomeHash`) : la même trois fois, ou plus de `LOOP_LIMIT` passes, et la partie est nulle.
 */
function watchLoop(s: GameState, d: Decision, stacked: boolean): void {
  if (s.over) return;
  if (d.type !== "pass" || !stacked || s.stack.length === 0) {
    s.loop = undefined;
    return;
  }
  s.loop ??= { passes: 0, seen: [] };
  const loop = s.loop;
  loop.passes += 1;
  if (loop.passes > LOOP_LIMIT) {
    declareLoopDraw(s);
    return;
  }
  if (loop.passes < LOOP_SUSPECT) return;
  const h = outcomeHash(s);
  if (loop.seen.filter((x) => x === h).length >= 2) declareLoopDraw(s);
  else loop.seen.push(h);
}

/**
 * Variante sans copie, réservée aux simulations (IA) sur une copie de travail obtenue par `cloneState`.
 * Attention : si la décision est illégale, l'état peut rester à moitié modifié.
 */
export function applyMutable(s: GameState, player: PlayerId, decision: Decision): void {
  collectEvents(() => {
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
  });
}

/** 104.4b : l'hôte constate une boucle de décisions automatiques ; la partie est nulle. */
export function drawByLoop(state: GameState): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    declareLoopDraw(s);
    return s;
  });
  return { state: next, events };
}
