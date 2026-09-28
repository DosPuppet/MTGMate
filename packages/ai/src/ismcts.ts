/**
 * ISMCTS (Information Set Monte Carlo Tree Search) pour les décisions de priorité du niveau élevé, en duel.
 *
 * L'IA ne voit ni la main adverse ni l'ordre des bibliothèques. À chaque itération, on tire une **déterminisation** :
 * la main adverse est retirée au hasard parmi (main + bibliothèque adverses), les bibliothèques sont mélangées. L'IA
 * connaît donc la liste du deck adverse, jamais sa main. On joue alors l'une des options de la racine (choisie par
 * UCB1, avec un biais vers les options que l'évaluation à un coup préfère), puis une simulation rapide (policy.ts)
 * jusqu'au début du prochain tour de l'IA, et on évalue la position obtenue.
 *
 * L'arbre est limité à la racine (les options de l'IA à cette décision) : avec quelques dizaines à quelques centaines
 * d'itérations, les nœuds plus profonds seraient trop peu visités pour être fiables.
 */
import { cloneState, type Decision, fallbackDecision, type GameState, opponentsOf, type PlayerId } from "@mtgx/engine";
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

/**
 * Une déterminisation de l'état vu par `me` : main adverse retirée parmi (main + bibliothèque adverses), bibliothèques
 * mélangées. Avant le mélange, les cartes sont rangées par définition : l'échantillon ne dépend que de l'ensemble des
 * cartes cachées (la liste du deck), jamais de leur répartition réelle entre main et bibliothèque.
 */
export function determinize(s: GameState, me: PlayerId, rand: () => number): GameState {
  const d = cloneState(s);
  const canonical = (ids: string[]) =>
    ids.sort((a, b) => {
      const da = d.objects[a]?.defId ?? "";
      const db = d.objects[b]?.defId ?? "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
  for (const p of opponentsOf(d, me)) {
    const pl = d.players[p];
    if (!pl) continue;
    const pool = canonical([...pl.hand, ...pl.library]);
    shuffleInPlace(pool, rand);
    pl.hand = pool.slice(0, pl.hand.length);
    pl.library = pool.slice(pl.hand.length);
    for (const id of pl.hand) {
      const o = d.objects[id];
      if (o) o.zone = "hand";
    }
    for (const id of pl.library) {
      const o = d.objects[id];
      if (o) o.zone = "library";
    }
  }
  const mine = d.players[me];
  if (mine) {
    canonical(mine.library);
    shuffleInPlace(mine.library, rand);
  }
  // Le hasard du moteur (pile ou face…) ne doit pas non plus être connu d'avance.
  d.rng = Math.floor(rand() * 2 ** 31);
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
