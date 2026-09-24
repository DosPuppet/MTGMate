/**
 * API publique du moteur : création de partie et soumission de décisions.
 * Chaque appel renvoie un nouvel état (immuable, via Immer) et la liste des événements produits.
 */
import { produce } from "immer";
import { drawCard } from "./actions";
import { activateManaAbility } from "./mana";
import { activateAbility, castSpell, playLand, RulesError } from "./stack";
import { collectEvents, createObject, emit, emptyPool, random, shuffle } from "./state";
import {
  advance,
  bottomCards,
  checkGameOver,
  declareAttackers,
  declareBlockers,
  discardToHandSize,
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
  players: [PlayerSetup, PlayerSetup];
  startingPlayer?: PlayerId;
  startingLife?: number;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export function createGame(opts: GameOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const [a, b] = opts.players;
    const s: GameState = {
      rng: opts.seed | 0,
      nextId: 1,
      timestamp: 0,
      defs: {},
      objects: {},
      players: {},
      playerOrder: [a.id, b.id],
      battlefield: [],
      exile: [],
      stack: [],
      turn: { number: 0, active: a.id, step: "untap", landsPlayed: 0, attacked: false, startingPlayer: a.id },
      flow: "mulligan",
      priority: { holder: a.id, passes: 0 },
      combat: null,
      effects: [],
      pending: null,
      mulliganQueue: [],
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
        manaPool: emptyPool(),
        drewFromEmptyLibrary: false,
        lost: false,
        mulligans: 0,
      };
      for (const card of p.deck) {
        s.defs[card.id] ??= card;
        createObject(s, card.id, p.id, "library");
      }
      shuffle(s, s.players[p.id]?.library ?? []);
    }
    const starting = opts.startingPlayer ?? (random(s) < 0.5 ? a.id : b.id);
    s.turn.startingPlayer = starting;
    s.turn.active = starting;
    emit({ type: "gameStart", startingPlayer: starting });
    for (const p of s.playerOrder) for (let i = 0; i < 7; i++) drawCard(s, p);
    s.mulliganQueue = [starting, ...s.playerOrder.filter((p) => p !== starting)];
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
      pl.lost = true;
      emit({ type: "lose", player, reason: "concede" });
      s.pending = null;
      checkGameOver(s);
    }
    return;
  }
  const p = s.pending;
  if (s.over || !p) throw new RulesError("Aucune décision attendue");
  if (p.player !== player) throw new RulesError("Ce n'est pas à vous de décider");

  switch (p.kind) {
    case "mulligan":
      expect(d, "keep", "mulligan");
      s.pending = null;
      if (d.type === "keep") keepHand(s, player);
      else takeMulligan(s, player);
      return;
    case "bottomCards":
      expect(d, "bottom");
      bottomCards(s, player, d.cards, p.count);
      s.pending = null;
      return;
    case "declareAttackers":
      expect(d, "declareAttackers");
      declareAttackers(s, player, d.attackers);
      s.pending = null;
      return;
    case "declareBlockers":
      expect(d, "declareBlockers");
      declareBlockers(s, player, d.blocks);
      s.pending = null;
      return;
    case "discard":
      expect(d, "discard");
      discardToHandSize(s, player, d.cards, p.count);
      s.pending = null;
      return;
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
      s.pending = null;
      return;
  }
}

/**
 * Applique la décision d'un joueur puis fait avancer la partie jusqu'à la prochaine décision.
 * Lève une RulesError si la décision est illégale (l'état d'origine reste inchangé).
 */
export function submit(state: GameState, player: PlayerId, decision: Decision): StepResult {
  const [next, events] = collectEvents(() =>
    produce(state, (s) => {
      apply(s, player, decision);
      advance(s);
    }),
  );
  return { state: next, events };
}
