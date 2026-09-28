/**
 * API publique du moteur : création de partie et soumission de décisions.
 * Chaque appel renvoie un nouvel état (copie de travail, l'état reçu n'est jamais modifié) et les événements produits.
 */
import { drawCard } from "./actions";
import { divisionOf, validateChoice } from "./choices";
import { checkDecisionShape } from "./decisionShape";
import { activateManaAbility } from "./mana";
import { activateAbility, answerResolutionChoice, castSpell, playLand, RulesError } from "./stack";
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
  discardToHandSize,
  eliminate,
  keepHand,
  passPriority,
  takeMulligan,
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
    nextId: 1,
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
      attacked: false,
      creatureDied: false,
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
      else takeMulligan(s, player);
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
        case "effect":
          if (answerResolutionChoice(s, d.values)) afterResolution(s);
          return;
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
      }
      return;
    }
    case "priority":
      expect(d, "pass", "playLand", "cast", "activate", "tapForMana");
      switch (d.type) {
        case "pass":
          passPriority(s, player);
          break;
        case "playLand":
          playLand(s, player, d.card, !!d.payLife);
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
    apply(s, player, decision);
    advance(s);
    return s;
  });
  return { state: next, events };
}

/**
 * Variante sans copie, réservée aux simulations (IA) sur une copie de travail obtenue par `cloneState`.
 * Attention : si la décision est illégale, l'état peut rester à moitié modifié.
 */
export function applyMutable(s: GameState, player: PlayerId, decision: Decision): void {
  collectEvents(() => {
    apply(s, player, decision);
    advance(s);
  });
}
