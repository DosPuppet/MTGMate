/**
 * ISMCTS (Information Set Monte Carlo Tree Search) pour les décisions de priorité du niveau élevé, en duel.
 *
 * L'IA ne voit ni la main adverse, ni la liste de son deck, ni l'ordre des bibliothèques. À chaque itération, on tire
 * une **déterminisation** : les cartes cachées adverses sont tirées de ce qu'on a vu de lui (`determinize`). On joue alors l'une des options de la racine (choisie par
 * UCB1, avec un biais vers les options que l'évaluation à un coup préfère), puis une simulation rapide (policy.ts)
 * jusqu'au début du prochain tour de l'IA, et on évalue la position obtenue.
 *
 * L'arbre est limité à la racine (les options de l'IA à cette décision) : avec quelques dizaines à quelques centaines
 * d'itérations, les nœuds plus profonds seraient trop peu visités pour être fiables.
 */
import {
  cloneState,
  commanderOf,
  type Decision,
  fallbackDecision,
  type GameState,
  opponentsOf,
  type PlayerId,
} from "@mtgx/engine";
import { evaluate, onlyRulesErrors, step } from "./evaluate";
import { priorityOptions } from "./heuristic";
import { fastPolicy } from "./policy";
import type { Profile } from "./profile";

export interface IsmctsConfig {
  rand: () => number;
  /** Nombre fixe d'itérations (tests, tournoi : reproductible). */
  iterations?: number;
  /** Sinon, budget en temps (interface) : on s'arrête à l'échéance. */
  ms?: number;
  /** En dessous (machine lente), la recherche n'est pas assez fiable : on garde la décision heuristique. */
  minIterations?: number;
  maxIterations?: number;
  /** Nombre d'options examinées à la racine (passer compris). */
  width?: number;
  /** Nombre maximal de décisions par simulation. */
  horizon?: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}

/** Proportion de terrains supposée dans les cartes cachées d'un adversaire (deck de 60 à 24 terrains). */
const LAND_SHARE = 0.4;
const BASICS: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

/**
 * Cartes vues d'un adversaire : ce qu'il possède sur le champ de bataille, dans son cimetière, en exil (face visible)
 * et ses sorts sur la pile. Ses terrains de base, ceux des couleurs vues.
 */
function seenCards(s: GameState, p: PlayerId, me: PlayerId): { spells: string[]; lands: string[] } {
  // Une carte exilée face cachée que `me` ne peut pas regarder n'est pas vue (406.3).
  const hidden = (id: string) => !!s.objects[id]?.exiledFaceDown && !s.objects[id]?.exiledFaceDown?.includes(me);
  const visible = [
    ...s.battlefield,
    ...(s.players[p]?.graveyard ?? []),
    ...s.exile.filter((id) => !hidden(id)),
    ...s.stack.filter((i) => i.kind === "spell" && !i.copy).map((i) => i.sourceId),
  ]
    .map((id) => s.objects[id])
    // Un commandant (singleton, toujours connu) ne sert pas à deviner les cartes cachées.
    .filter((o) => !!o && o.owner === p && !o.faceDown && !o.isToken && !o.cardCopy && !commanderOf(s, o));
  const defs = visible.map((o) => o?.defId as string);
  const spells = defs.filter((id) => !s.defs[id]?.types.includes("Land"));
  const colors = new Set(defs.flatMap((id) => s.defs[id]?.colors ?? []));
  const basicIds = (names: string[]) =>
    Object.values(s.defs)
      .filter((d) => names.includes(d.name) && d.supertypes.includes("Basic") && !d.isToken)
      .map((d) => d.id);
  let lands = basicIds([...colors].map((c) => BASICS[c] as string));
  if (lands.length === 0) lands = defs.filter((id) => s.defs[id]?.types.includes("Land"));
  if (lands.length === 0) lands = basicIds(Object.values(BASICS));
  return { spells, lands };
}

/**
 * Une déterminisation de l'état vu par `me` (P3 de l'audit) : les cartes cachées de chaque adversaire (main et
 * bibliothèque) sont remplacées par un tirage fondé sur ses seules cartes vues (et des terrains de base de ses couleurs),
 * dans la proportion d'un deck ordinaire. L'IA ne tire donc profit ni de sa main ni de la liste de son deck. Sa propre
 * bibliothèque est mélangée. Le hasard du moteur est retiré.
 */
export function determinize(s: GameState, me: PlayerId, rand: () => number): GameState {
  const d = cloneState(s);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)] as T;
  for (const p of opponentsOf(d, me)) {
    const pl = d.players[p];
    if (!pl) continue;
    const { spells, lands } = seenCards(s, p, me);
    // Ses permanents face cachée (déguisement, cape, manifestation) : la carte cachée est tirée aussi.
    for (const id of d.battlefield) {
      const o = d.objects[id];
      if (o?.faceDown && o.controller === p && spells.length) o.faceDown = { ...o.faceDown, card: pick(spells) };
    }
    // Ses cartes exilées face cachée que `me` ne peut pas regarder (présage, Hideaway…).
    for (const id of d.exile) {
      const o = d.objects[id];
      if (o?.owner === p && o.exiledFaceDown && !o.exiledFaceDown.includes(me) && spells.length) o.defId = pick(spells);
    }
    for (const id of [...pl.hand, ...pl.library]) {
      const o = d.objects[id];
      // Un commandant est public (Commander) : il reste ce qu'il est, même dans une main.
      if (!o || commanderOf(d, o)) continue;
      const land = spells.length === 0 || rand() < LAND_SHARE;
      const def = land && lands.length ? pick(lands) : spells.length ? pick(spells) : undefined;
      if (def) {
        o.defId = def;
        o.faceDefId = undefined;
      }
    }
    shuffleInPlace(pl.library, rand);
  }
  const mine = d.players[me];
  if (mine) {
    const canonical = [...mine.library].sort((a, b) => {
      const da = d.objects[a]?.defId ?? "";
      const db = d.objects[b]?.defId ?? "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    shuffleInPlace(canonical, rand);
    mine.library = canonical;
  }
  // Le hasard du moteur (pile ou face…) ne doit pas non plus être connu d'avance.
  d.rng = Math.floor(rand() * 2 ** 31);
  d.version += 1;
  return d;
}

const policy = fastPolicy();

/**
 * Simulation rapide jusqu'au début du prochain tour de `me` (ou la fin de la partie, ou `horizon` décisions).
 * Une décision refusée par le moteur est remplacée par la décision par défaut ; si elle aussi échoue, on s'arrête.
 */
function playout(start: GameState, me: PlayerId, horizon: number): GameState {
  let d = start;
  const startTurn = d.turn.number;
  for (let i = 0; i < horizon && !d.over && d.pending; i++) {
    if (d.turn.number > startTurn && d.turn.active === me) break;
    const p = d.pending;
    try {
      d = step(d, p.player, policy(d, p.player), true);
    } catch (e) {
      onlyRulesErrors(e);
      try {
        d = step(d, p.player, fallbackDecision(d, p), true);
      } catch (e2) {
        onlyRulesErrors(e2);
        break;
      }
    }
  }
  return d;
}

const keyOf = (d: Decision) => JSON.stringify(d);

export interface Candidate {
  decision: Decision;
  /** Évaluation à un coup : biais initial de la recherche. */
  prior: number;
}

/**
 * Choisit parmi `cands` par ISMCTS, ou `null` si trop peu d'itérations ont tenu dans le temps imparti
 * (la décision heuristique est alors meilleure qu'une recherche bâclée).
 */
export function ismctsChoose(s: GameState, me: PlayerId, cands: Candidate[], cfg: IsmctsConfig): Decision | null {
  if (cands.length < 2) return cands[0]?.decision ?? null;
  const root = evaluate(s, me);
  const bestPrior = Math.max(...cands.map((c) => c.prior));
  // Biais initial : les options que l'évaluation à un coup préfère sont explorées d'abord et départagent les égalités.
  const bias = cands.map((c) => 0.3 * sigmoid((c.prior - bestPrior) / 3));
  const n = cands.map(() => 0);
  const w = cands.map(() => 0);
  const horizon = cfg.horizon ?? 200;
  const t0 = Date.now();
  const maxIt = cfg.iterations ?? cfg.maxIterations ?? 600;
  let total = 0;
  for (let it = 0; it < maxIt * 2 && total < maxIt; it++) {
    if (cfg.iterations === undefined && Date.now() - t0 > (cfg.ms ?? 700)) break;
    // UCB1 : d'abord chaque option une fois (dans l'ordre de l'évaluation à un coup), puis compromis
    // entre les meilleures moyennes et les options peu explorées.
    let i = n.indexOf(0);
    if (i < 0) {
      let best = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < cands.length; k++) {
        const nk = n[k] as number;
        const ucb = (w[k] as number) / nk + 0.7 * Math.sqrt(Math.log(total) / nk) + (bias[k] as number) / (nk + 1);
        if (ucb > best) {
          best = ucb;
          i = k;
        }
      }
    }
    let d = determinize(s, me, cfg.rand);
    try {
      d = step(d, me, (cands[i] as Candidate).decision, true);
    } catch (e) {
      onlyRulesErrors(e);
      // Option impossible dans cette déterminisation : elle ne compte pas.
      n[i] = (n[i] as number) + 1;
      total++;
      continue;
    }
    d = playout(d, me, horizon);
    const reward = d.over ? (d.winner === me ? 1 : 0) : sigmoid((evaluate(d, me) - root) / 6);
    n[i] = (n[i] as number) + 1;
    w[i] = (w[i] as number) + reward;
    total++;
  }
  if (cfg.iterations === undefined && total < (cfg.minIterations ?? 24)) return null;
  // Option la plus visitée (la plus sûre) ; à égalité, la meilleure moyenne.
  let pick = 0;
  for (let k = 1; k < cands.length; k++) {
    const better =
      (n[k] as number) > (n[pick] as number) ||
      ((n[k] as number) === (n[pick] as number) && (w[k] as number) > (w[pick] as number));
    if (better) pick = k;
  }
  return (cands[pick] as Candidate).decision;
}

/**
 * Décision de priorité par ISMCTS, ou `null` : pas de choix à faire (une seule option sensée), ou trop peu
 * d'itérations dans le temps imparti.
 */
export function ismctsPriority(s: GameState, me: PlayerId, pr: Profile, cfg: IsmctsConfig): Decision | null {
  const found = priorityOptions(s, me, pr);
  if (!found) return null;
  if (found.forced) return found.forced;
  const width = cfg.width ?? 6;
  const pass: Decision = { type: "pass" };
  const seen = new Set<string>([keyOf(pass)]);
  const cands: Candidate[] = [{ decision: pass, prior: found.baseline }];
  for (const o of [...found.options].sort((a, b) => b.score - a.score)) {
    if (cands.length >= width) break;
    const k = keyOf(o.decision);
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push({ decision: o.decision, prior: o.score });
  }
  if (cands.length < 2) return null;
  return ismctsChoose(s, me, cands, cfg);
}
