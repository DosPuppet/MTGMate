/**
 * Outils de test : construire une position de jeu précise et jouer des décisions.
 */
import { card } from "@mtgx/cards";
import { produce } from "immer";
import { createGame, submit } from "../src/game";
import { createObject } from "../src/state";
import { advance } from "../src/turn";
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

export function scenario(opts: { p1?: Side; p2?: Side; active?: PlayerId; step?: Step; turn?: number }): GameState {
  const { state } = createGame({
    seed: 42,
    startingPlayer: "p1",
    players: [
      { id: "p1", name: "Alice", deck: [] },
      { id: "p2", name: "Bob", deck: [] },
    ],
  });
  return produce(state, (s) => {
    const turn = opts.turn ?? 3;
    s.mulliganQueue = [];
    s.pending = null;
    s.turn = {
      number: turn,
      active: opts.active ?? "p1",
      step: opts.step ?? "main1",
      landsPlayed: 0,
      attacked: false,
      startingPlayer: "p1",
    };
    for (const p of ["p1", "p2"] as const) {
      const side = opts[p] ?? {};
      const player = s.players[p];
      if (!player) continue;
      player.life = side.life ?? 20;
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
    if (s.turn.step === "declareAttackers" || s.turn.step === "declareBlockers")
      s.combat = { attackers: [], blockers: [], firstStrikers: [] };
    s.flow = "priority";
    s.priority = { holder: s.turn.active, passes: 0 };
    advance(s);
  });
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
