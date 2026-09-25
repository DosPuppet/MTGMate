/**
 * API publique du moteur : création de partie et soumission de décisions.
 * Chaque appel renvoie un nouvel état (immuable, via Immer) et la liste des événements produits.
 */
import { drawCard } from "./actions";
import { divisionOf, validateChoice } from "./choices";
import { activateManaAbility } from "./mana";
import { activateAbility, answerResolutionChoice, castSpell, playLand, RulesError } from "./stack";
import { cloneState, collectEvents, createObject, emit, emptyPool, opponentsOf, random, shuffle } from "./state";
import { answerTriggerOrder, answerTriggerTarget } from "./triggers";
import {
  advance,
  afterResolution,
  answerCombatAssignment,
  answerLegendChoice,
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

export function createGame(opts: GameOptions): StepResult {
  const [state, events] = collectEvents(() => {
    if (opts.players.length < 2) throw new Error("Il faut au moins deux joueurs");
    const first = opts.players[0] as PlayerSetup;
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
      lki: {},
      winner: null,
      over: false,
    };
    for (const p of opts.players) {
      s.players[p.id] = {
        id: p.id,
        name: p.name,
        life: opts.startingLife ?? 20,
        library: [],
        hand: [],
        graveyard: [],
        command: [],
        manaPool: emptyPool(),
        drewFromEmptyLibrary: false,
        lost: false,
        mulligans: 0,
        lastTurnStarted: 0,
      };
      for (const card of p.deck) {
        s.defs[card.id] ??= card;
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

function apply(s: GameState, player: PlayerId, d: Decision): void {
  if (d.type === "concede") {
    const pl = s.players[player];
    if (pl && !pl.lost) {
      emit({ type: "lose", player, reason: "concede" });
      eliminate(s, [player]);
    }
    return;
  }
  const p = s.pending;
  if (s.over || !p) throw new RulesError("Aucune décision attendue");
  if (p.player !== player) throw new RulesError("Ce n'est pas à vous de décider");

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
          playLand(s, player, d.card);
          s.priority.passes = 0;
          break;
        case "cast":
          castSpell(s, player, d.card, d);
          break;
        case "activate":
          activateAbility(s, player, d.source, d.ability, d);
          break;
        case "tapForMana":
          try {
            activateManaAbility(s, player, d.source, d.ability, d.color);
          } catch (e) {
            throw new RulesError((e as Error).message);
          }
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
