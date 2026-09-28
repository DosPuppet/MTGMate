/**
 * Partie « mise en scène » (tutoriel) : mains, bibliothèques dans l'ordre, permanents et points de vie connus d'avance.
 * Pas de mélange ni de main de départ tirée au hasard ; la partie commence au début du tour indiqué
 * (dégagement, entretien, pioche si ce n'est pas le premier tour du duel), ou par le mulligan si demandé.
 */
import { blankState, type StepResult } from "./game";
import { bump } from "./layers";
import { collectEvents, createObject, emit, opponentsOf, registerDef } from "./state";
import { advance, startTurnOf } from "./turn";
import type { CardDef, PlayerId } from "./types";

export interface ScenarioPermanent {
  def: CardDef;
  tapped?: boolean;
  /** Arrivé ce tour-ci : mal d'invocation. */
  sick?: boolean;
}

export interface ScenarioPlayer {
  id: PlayerId;
  name: string;
  life?: number;
  /** Bibliothèque dans l'ordre : la première carte est le dessus. */
  library: CardDef[];
  hand: CardDef[];
  battlefield?: ScenarioPermanent[];
  graveyard?: CardDef[];
}

export interface ScenarioOptions {
  seed: number;
  players: ScenarioPlayer[];
  /** Joueur dont c'est le tour. */
  active: PlayerId;
  /** Numéro du tour (1 par défaut). */
  turn?: number;
  /** Commencer par la décision de mulligan (tour 1). */
  mulligan?: boolean;
}

export function createScenario(opts: ScenarioOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    const turn = opts.mulligan ? 1 : Math.max(1, opts.turn ?? 1);
    const others = opponentsOf(s, opts.active);
    // En duel, le joueur qui a commencé joue les tours impairs (et ne pioche pas au premier).
    s.turn.startingPlayer = turn % 2 === 1 || s.playerOrder.length > 2 ? opts.active : (others[0] ?? opts.active);
    s.turn.active = opts.active;
    for (const p of opts.players) {
      const add = (d: CardDef, zone: "library" | "hand" | "graveyard") => {
        registerDef(s, d);
        return createObject(s, d.id, p.id, zone);
      };
      for (const d of p.library) add(d, "library");
      for (const d of p.hand) add(d, "hand");
      for (const d of p.graveyard ?? []) add(d, "graveyard");
      for (const perm of p.battlefield ?? []) {
        registerDef(s, perm.def);
        const o = createObject(s, perm.def.id, p.id, "battlefield");
        o.controlledSince = perm.sick ? turn : 0;
        o.tapped = !!perm.tapped;
        if (perm.def.loyalty) o.counters.loyalty = perm.def.loyalty;
      }
      const player = s.players[p.id];
      if (player && !opts.mulligan) {
        // Tours déjà joués : les permanents présents n'ont pas le mal d'invocation.
        player.lastTurnStarted = p.id === opts.active ? Math.max(0, turn - 2) : Math.max(1, turn - 1);
        player.turnsTaken = p.id === opts.active ? Math.floor((turn - 1) / 2) : Math.ceil((turn - 1) / 2);
      }
    }
    bump(s);
    emit({ type: "gameStart", startingPlayer: s.turn.startingPlayer });
    if (opts.mulligan) {
      s.mulliganQueue = [opts.active, ...others];
      s.flow = "mulligan";
    } else {
      s.turn.number = turn;
      s.turn.step = "untap";
      startTurnOf(s, opts.active);
      emit({ type: "turnStart", turn, player: opts.active });
      s.flow = "stepStart";
    }
    advance(s);
    return s;
  });
  return { state, events };
}
