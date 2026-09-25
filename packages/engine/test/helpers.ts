/**
 * Outils de test : construire une position de jeu précise et jouer des décisions.
 */
import { card } from "@mtgx/cards";
import { createGame, submit } from "../src/game";
import { cloneState, createObject } from "../src/state";
import { advance, emptyCombat } from "../src/turn";
import type { CardDef, Decision, GameState, PlayerId, Step } from "../src/types";

export interface Permanent {
  name: string | CardDef;
  tapped?: boolean;
  /** Arrivée ce tour-ci (mal d'invocation). */
  sick?: boolean;
  damage?: number;
}

export interface Side {
  life?: number;
  battlefield?: (string | CardDef | Permanent)[];
  hand?: (string | CardDef)[];
  library?: (string | CardDef)[];
  graveyard?: (string | CardDef)[];
}

const def = (c: string | CardDef): CardDef => (typeof c === "string" ? card(c) : c);

const NAMES = ["Alice", "Bob", "Chloé", "David", "Emma", "Farid"];

export interface ScenarioOptions {
  p1?: Side;
  p2?: Side;
  p3?: Side;
  p4?: Side;
  /** Nombre de joueurs (2 par défaut) : p1, p2, p3… */
  players?: number;
  active?: PlayerId;
  step?: Step;
  turn?: number;
}

export function scenario(opts: ScenarioOptions): GameState {
  const ids = Array.from({ length: opts.players ?? 2 }, (_, i) => `p${i + 1}`);
  const { state } = createGame({
    seed: 42,
    startingPlayer: "p1",
    players: ids.map((id, i) => ({ id, name: NAMES[i] ?? id, deck: [] })),
  });
  const s = cloneState(state);
  {
    const turn = opts.turn ?? 3;
    s.mulliganQueue = [];
    s.pending = null;
    s.turn = {
      number: turn,
      active: opts.active ?? "p1",
      step: opts.step ?? "main1",
      landsPlayed: 0,
      attacked: false,
      creatureDied: false,
      onceFired: [],
      startingPlayer: "p1",
    };
    for (const p of ids) {
      const side = (opts as Record<string, Side | undefined>)[p] ?? {};
      const player = s.players[p];
      if (!player) continue;
      player.life = side.life ?? 20;
      // Tout le monde a déjà joué un tour : les créatures présentes n'ont pas le mal d'invocation.
      player.lastTurnStarted = p === s.turn.active ? turn : Math.max(1, turn - 1);
      player.drewFromEmptyLibrary = false;
      const add = (c: string | CardDef, zone: "hand" | "library" | "graveyard") => {
        const d = def(c);
        s.defs[d.id] ??= d;
        createObject(s, d.id, p, zone);
      };
      for (const c of side.hand ?? []) add(c, "hand");
      for (const c of side.library ?? Array(10).fill("Forest")) add(c, "library");
      for (const c of side.graveyard ?? []) add(c, "graveyard");
      for (const entry of side.battlefield ?? []) {
        const perm: Permanent =
          typeof entry === "object" && "name" in entry && !("types" in entry) ? entry : { name: entry as string | CardDef };
        const d = def(perm.name);
        s.defs[d.id] ??= d;
        const o = createObject(s, d.id, p, "battlefield");
        o.controlledSince = perm.sick ? turn : 0;
        o.tapped = !!perm.tapped;
        o.damage = perm.damage ?? 0;
      }
    }
    if (s.turn.step === "declareAttackers" || s.turn.step === "declareBlockers") s.combat = emptyCombat();
    s.flow = "priority";
    s.priority = { holder: s.turn.active, passes: 0 };
    advance(s);
  }
  return s;
}

export function act(s: GameState, player: PlayerId, d: Decision): GameState {
  return submit(s, player, d).state;
}

/** Le joueur qui doit décider passe, jusqu'à ce que `until` soit vrai (ou 200 passes). */
export function passUntil(s: GameState, until: (s: GameState) => boolean): GameState {
  let cur = s;
  for (let i = 0; i < 200 && !until(cur) && cur.pending?.kind === "priority"; i++) {
    cur = act(cur, cur.pending.player, { type: "pass" });
  }
  return cur;
}

/** Comme passUntil, mais accepte aussi la réponse suggérée aux choix (répartition des blessures…). */
export function passAccepting(s: GameState, until: (s: GameState) => boolean): GameState {
  let cur = s;
  for (let i = 0; i < 300 && !until(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}

/** Les deux joueurs passent une fois : résout le dessus de la pile (ou termine l'étape). */
export function passBoth(s: GameState): GameState {
  let cur = s;
  for (let i = 0; i < 2 && cur.pending?.kind === "priority"; i++) cur = act(cur, cur.pending.player, { type: "pass" });
  return cur;
}

export function idsOf(s: GameState, player: PlayerId, zone: "hand" | "battlefield" | "graveyard", name: string): string[] {
  const list = zone === "battlefield" ? s.battlefield : (s.players[player]?.[zone] ?? []);
  return list.filter((id) => {
    const o = s.objects[id];
    return o && o.controller === player && s.defs[o.defId]?.name === name;
  });
}

export function idOf(s: GameState, player: PlayerId, zone: "hand" | "battlefield" | "graveyard", name: string): string {
  const id = idsOf(s, player, zone, name)[0];
  if (!id) throw new Error(`${name} introuvable (${player}, ${zone})`);
  return id;
}

export function customCard(partial: Partial<CardDef> & { name: string }): CardDef {
  return {
    id: `test-${partial.name.toLowerCase().replace(/\W+/g, "-")}`,
    typeLine: "Creature",
    manaCost: { generic: 0, colored: {}, x: 0 },
    manaCostText: "{0}",
    colors: [],
    supertypes: [],
    types: ["Creature"],
    subtypes: [],
    keywords: [],
    abilities: [],
    text: "",
    implemented: true,
    ...partial,
  };
}
