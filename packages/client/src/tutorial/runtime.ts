/**
 * Tutoriel, partie pure : format des leçons, décisions permises (guidage strict), prédicats de fin d'étape
 * et solveur (la décision attendue par une étape, pour les tests). Aucune dépendance au DOM ni au store.
 */
import {
  type AutopilotSettings,
  autoTarget,
  type GameEvent,
  type GameView,
  type ObjectView,
  type TargetOption,
  type Step as TurnStep,
} from "@mtgx/engine";
import type { ScenarioSpec } from "../protocol";
import type { PlayerIntent } from "../store";

/** Élément de l'interface à entourer, ou carte (par nom) : dans la main, ou sur le champ de bataille d'un camp. */
export type Target =
  | "myLife"
  | "oppLife"
  | "hand"
  | "myField"
  | "oppField"
  | "library"
  | "graveyard"
  | "phaseBar"
  | "stops"
  | "mainButton"
  | "endTurn"
  | "log"
  | "preview"
  | "stack"
  | "settings"
  | { card: string; zone?: "hand" | "battlefield" | "stack"; owner?: "you" | "opponent" };

/**
 * Décision permise pendant une étape. Les cibles sont des noms de cartes, "opponent" (l'adversaire) ou "you" (vous).
 * « Combat » et « Résoudre » sont des "pass" ; « Fin du tour » est "endTurn".
 */
export type Allow =
  | { playLand: string }
  | { cast: string; target?: string }
  | { activate: string; target?: string }
  | { attack: string[] }
  | { block: [blocker: string, attacker: string][] }
  | "pass"
  | "endTurn"
  | "keep";

export interface Ctx {
  view: GameView;
  /** Événements de la dernière mise à jour. */
  events: GameEvent[];
  /** Nom de la carte affichée dans l'aperçu (survol ou appui long). */
  hovered: string | null;
}

export interface Tip {
  when: (c: Ctx) => boolean;
  text: string;
}

export interface Step {
  text: string | ((c: Ctx) => string);
  target?: Target;
  /** Explication : bouton « Suivant », adversaire en pause. */
  next?: true;
  /** Condition de fin de l'étape (sans `next`). */
  until?: (c: Ctx) => boolean;
  /** Décisions acceptées pendant l'étape (guidage strict). */
  allow?: Allow[];
  /** Rappel affiché quand le joueur fait autre chose. */
  hint?: string;
  /** Partie libre : toutes les décisions sont permises, le guide donne des conseils (`tips`). */
  free?: true;
  tips?: Tip[];
  /** Réglages de l'automatisme (arrêts) appliqués en entrant dans l'étape. */
  settings?: Partial<AutopilotSettings>;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  scenario: ScenarioSpec;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Lecture de la vue
// ---------------------------------------------------------------------------

export type Who = "you" | "opponent";

const playerId = (v: GameView, who: Who): string => (who === "you" ? v.viewer : (v.opponents[0] ?? ""));

const named = (list: ObjectView[], name: string) => list.filter((o) => o.name === name);

/** Ids désignés par une référence de cible : "opponent", "you" ou un nom de permanent. */
function refIds(v: GameView, ref: string): string[] {
  if (ref === "opponent" || ref === "you") return [playerId(v, ref)];
  return [...named(v.battlefield, ref).map((o) => o.id), ...v.stack.filter((it) => it.name === ref).map((it) => it.id)];
}

const nameOf = (v: GameView, id: string): string | undefined =>
  [...v.hand, ...v.battlefield, ...v.playableExile].find((o) => o.id === id)?.name;

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// ---------------------------------------------------------------------------
// Guidage strict : la décision du joueur est-elle celle qu'attend l'étape ?
// ---------------------------------------------------------------------------

export function matches(allow: Allow, intent: PlayerIntent, v: GameView): boolean {
  if (typeof allow === "string") return intent.type === allow;
  if ("playLand" in allow) return intent.type === "playLand" && nameOf(v, intent.card) === allow.playLand;
  if ("cast" in allow || "activate" in allow) {
    const ok =
      "cast" in allow
        ? intent.type === "cast" && nameOf(v, intent.card) === allow.cast
        : intent.type === "activate" && nameOf(v, intent.source) === allow.activate;
    if (!ok || !allow.target || (intent.type !== "cast" && intent.type !== "activate")) return ok;
    const wanted = refIds(v, allow.target);
    return Object.values(intent.targets ?? {})
      .flat()
      .some((id) => wanted.includes(id));
  }
  if ("attack" in allow) {
    return (
      intent.type === "declareAttackers" &&
      sameSet(
        intent.attackers.map((a) => nameOf(v, a.id) ?? ""),
        allow.attack,
      )
    );
  }
  if ("block" in allow) {
    return (
      intent.type === "declareBlockers" &&
      sameSet(
        intent.blocks.map((b) => `${nameOf(v, b.blocker)}>${nameOf(v, b.attacker)}`),
        allow.block.map(([b, a]) => `${b}>${a}`),
      )
    );
  }
  return false;
}

/** Décisions toujours permises : produire du mana à la main, répondre à une question du moteur. */
export function alwaysAllowed(intent: PlayerIntent): boolean {
  return intent.type === "tapForMana" || intent.type === "undoMana" || intent.type === "choose" || intent.type === "concede";
}

// ---------------------------------------------------------------------------
// Solveur : la décision qui réalise une étape (tests, script d'interface)
// ---------------------------------------------------------------------------

export function solve(allow: Allow, v: GameView): PlayerIntent | null {
  const p = v.pending;
  if (!p || p.player !== v.viewer) return null;
  if (allow === "keep") return p.kind === "mulligan" ? { type: "keep" } : null;
  if (typeof allow === "string") return p.kind === "priority" ? { type: allow } : null;
  if ("attack" in allow) {
    if (p.kind !== "declareAttackers") return null;
    const taken: string[] = [];
    for (const name of allow.attack) {
      const id = (p.candidates ?? []).find((c) => !taken.includes(c) && nameOf(v, c) === name);
      if (!id) return null;
      taken.push(id);
    }
    const defender = p.defenders?.[0] ?? playerId(v, "opponent");
    return { type: "declareAttackers", attackers: taken.map((id) => ({ id, defender })) };
  }
  if ("block" in allow) {
    if (p.kind !== "declareBlockers") return null;
    const blocks: { blocker: string; attacker: string }[] = [];
    for (const [b, a] of allow.block) {
      const cand = (p.candidates ?? []).find((c) => nameOf(v, c.blocker) === b && !blocks.some((x) => x.blocker === c.blocker));
      const attacker = cand?.attackers.find((id) => nameOf(v, id) === a);
      if (!cand || !attacker) return null;
      blocks.push({ blocker: cand.blocker, attacker });
    }
    return { type: "declareBlockers", blocks };
  }
  if (p.kind !== "priority") return null;
  const actions = p.actions ?? [];
  if ("playLand" in allow) {
    const a = actions.find((o) => o.type === "playLand" && nameOf(v, o.card) === allow.playLand);
    return a?.type === "playLand" ? { type: "playLand", card: a.card } : null;
  }
  const wanted = allow.target ? refIds(v, allow.target) : [];
  const pickTargets = (specs: TargetOption[]) => {
    const out: Record<string, string[]> = {};
    for (const spec of specs) {
      const id = spec.legal.find((l) => wanted.includes(l)) ?? autoTarget(spec) ?? (spec.optional ? undefined : spec.legal[0]);
      out[spec.id] = id ? [id] : [];
    }
    return out;
  };
  if ("cast" in allow) {
    const a = actions.find((o) => o.type === "cast" && nameOf(v, o.card) === allow.cast);
    if (a?.type !== "cast") return null;
    const mode = a.modes[0];
    return { type: "cast", card: a.card, mode: mode?.index ?? 0, targets: pickTargets(mode?.targets ?? []), kicked: false };
  }
  const a = actions.find((o) => o.type === "activate" && nameOf(v, o.source) === allow.activate);
  if (a?.type !== "activate") return null;
  return { type: "activate", source: a.source, ability: a.ability, targets: pickTargets(a.targets) };
}

// ---------------------------------------------------------------------------
// Prédicats des étapes
// ---------------------------------------------------------------------------

export const onField =
  (name: string, who: Who = "you") =>
  (c: Ctx) =>
    c.view.battlefield.some((o) => o.name === name && o.controller === playerId(c.view, who));

export const inGraveyard =
  (name: string, who: Who = "you") =>
  (c: Ctx) =>
    (c.view.players[playerId(c.view, who)]?.graveyard ?? []).some((o) => o.name === name);

export const onStack = (name: string) => (c: Ctx) => c.view.stack.some((it) => it.name === name);

export const stackEmpty = (c: Ctx) => c.view.stack.length === 0;

export const lifeOf = (c: Ctx, who: Who) => c.view.players[playerId(c.view, who)]?.life ?? 0;

/** Décision du joueur en attente, d'un type donné. */
export const pendingMine = (kind: string) => (c: Ctx) => c.view.pending?.player === c.view.viewer && c.view.pending.kind === kind;

/** Le joueur a la priorité pendant son tour, à cette étape. */
export const myStep = (step: TurnStep) => (c: Ctx) =>
  c.view.turn.active === c.view.viewer && c.view.turn.step === step && pendingMine("priority")(c);

export const hovered = (name?: string) => (c: Ctx) => (name ? c.hovered === name : c.hovered !== null);

export const gameOver = (c: Ctx) => c.view.over;

export const all =
  (...preds: ((c: Ctx) => boolean)[]) =>
  (c: Ctx) =>
    preds.every((p) => p(c));

export const stepText = (s: Step, c: Ctx | null): string => (typeof s.text === "string" ? s.text : c ? s.text(c) : "");
