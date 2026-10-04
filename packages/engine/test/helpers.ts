/**
 * Outils de test : construire une position de jeu précise et jouer des décisions.
 */
import { card } from "@mtgx/cards";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import { cloneState, createObject, registerDef } from "../src/state";
import { advance, emptyCombat } from "../src/turn";
import type { CardDef, CastNowRequest, ChoiceRequest, ChoiceValue, Decision, GameState, PlayerId, Step } from "../src/types";

export interface Permanent {
  name: string | CardDef;
  tapped?: boolean;
  /** Arrivée ce tour-ci (mal d'invocation). */
  sick?: boolean;
  damage?: number;
  /** Marqueurs déjà posés (une créature 0/0 qui doit survivre). */
  counters?: Record<string, number>;
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
      // Tours déjà commencés par ce joueur (Jace Reawakened) : un tour sur deux à deux joueurs.
      player.turnsTaken = Math.ceil(turn / 2);
      player.drewFromEmptyLibrary = false;
      const add = (c: string | CardDef, zone: "hand" | "library" | "graveyard") => {
        const d = def(c);
        registerDef(s, d);
        createObject(s, d.id, p, zone);
      };
      for (const c of side.hand ?? []) add(c, "hand");
      for (const c of side.library ?? Array(10).fill("Forest")) add(c, "library");
      for (const c of side.graveyard ?? []) add(c, "graveyard");
      for (const entry of side.battlefield ?? []) {
        const perm: Permanent =
          typeof entry === "object" && "name" in entry && !("types" in entry) ? entry : { name: entry as string | CardDef };
        const d = def(perm.name);
        registerDef(s, d);
        const o = createObject(s, d.id, p, "battlefield");
        o.controlledSince = perm.sick ? turn : 0;
        o.tapped = !!perm.tapped;
        o.damage = perm.damage ?? 0;
        if (d.loyalty) o.counters.loyalty = d.loyalty;
        if (perm.counters) Object.assign(o.counters, perm.counters);
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

/** Priorité « lancer maintenant » en attente pendant une résolution (608.2g), ou `undefined`. */
export function castNowOf(s: GameState): CastNowRequest | undefined {
  return s.pending?.kind === "priority" ? s.pending.castNow : undefined;
}

/** Passe (et suit les choix suggérés) jusqu'à une priorité « lancer maintenant ». */
export function untilCastNow(s: GameState): GameState {
  return passAccepting(s, (x) => !!castNowOf(x));
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

/**
 * Avance la partie jusqu'à la condition : passe la priorité, n'attaque ni ne bloque, défausse l'excédent et
 * accepte les choix suggérés.
 */
export function advanceUntil(s: GameState, until: (s: GameState) => boolean, max = 600): GameState {
  let cur = s;
  for (let i = 0; i < max && !until(cur); i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p.kind === "discard") {
      const hand = cur.players[p.player]?.hand ?? [];
      cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, p.count) });
    } else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Aides des fichiers de tests d'extension (docs/plans/PLAN-C.md, lot C2) : une seule écriture, importée par chacun.
// ---------------------------------------------------------------------------

/** Réponse à un choix pendant `settle` : `undefined` prend la réponse suggérée. */
export type Answer = (req: ChoiceRequest, player: PlayerId, s: GameState) => ChoiceValue[] | undefined;

export const lands = (name: string, n: number) => Array(n).fill(name) as string[];
export const nameOf = (s: GameState, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
export const namesIn = (s: GameState, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
export const exiled = (s: GameState, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

function settleWith(s: GameState, answer: Answer, noBlocks: boolean): GameState {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    else if (noBlocks && p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}

/** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
export const settle = (s: GameState, answer: Answer = () => undefined): GameState => settleWith(s, answer, false);

/** Comme `settle`, et les défenseurs ne bloquent pas. */
export const settleNoBlocks = (s: GameState, answer: Answer = () => undefined): GameState => settleWith(s, answer, true);

/** Joue (sans attaquer ni bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
export function throughCombat(s: GameState, answer: Answer = () => undefined): GameState {
  let cur = s;
  for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}

/** Lance la carte nommée depuis la main ; `extra` complète la décision (cibles, X, kicker…). */
export const cast = (s: GameState, player: PlayerId, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });

/** Variante de `cast` avec les cibles en paramètre. */
export const castTargets = (
  s: GameState,
  player: PlayerId,
  name: string,
  targets?: Record<string, string[]>,
  extra: object = {},
) => act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });

export const castable = (s: GameState, player: PlayerId, card: string) =>
  legalActions(s, player).some((a) => a.type === "cast" && a.card === card);

export const canActivate = (s: GameState, player: PlayerId, source: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source);

/** Réponse qui choisit les objets (ou joueurs) voulus quand ils font partie des options. */
export const picking =
  (want: string[]) =>
  (req: ChoiceRequest, _player?: PlayerId, _s?: GameState): ChoiceValue[] | undefined => {
    if (req.type !== "pick") return undefined;
    const picked = want.filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };

/** Sélectionne dans les options d'un choix l'objet nommé `name`. */
export const pickNamed = (s: GameState, req: ChoiceRequest, name: string) =>
  req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;

/** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
export function attack(s: GameState, attackers: string[]): GameState {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
}

/**
 * « Vous mettez des marqueurs » : `player` lance Fleeting Flight (de sa main, avec une Plaine) sur `target` et laisse le
 * sort se résoudre ; renvoie l'état et les noms des sources des capacités déclenchées qui attendent sur la pile.
 */
export function counterFrom(s: GameState, player: PlayerId, target: string): { s: GameState; triggered: string[] } {
  let cur = act(s, player, { type: "cast", card: idOf(s, player, "hand", "Fleeting Flight"), targets: { t: [target] } });
  cur = passUntil(cur, (x) => !x.stack.some((i) => i.kind === "spell"));
  const triggered = cur.stack.filter((i) => i.kind === "ability").map((i) => cur.defs[i.sourceDefId]?.name ?? "");
  return { s: cur, triggered };
}
