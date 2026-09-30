/**
 * Parties IA contre IA avec vérification d'invariants : sert au fuzzing du moteur et aux tests.
 */

import type { CardDef } from "@mtgx/engine";
import {
  type Agent,
  chars,
  cloneState,
  computeBattlefield,
  createGame,
  type Decision,
  fallbackDecision,
  type GameState,
  RulesError,
  submit,
  syncControl,
} from "@mtgx/engine";
import { corruptDecision } from "./chaos";
import { mulberry32 } from "./random";

export interface SelfPlayResult {
  state: GameState;
  decisions: { player: string; decision: Decision }[];
  illegal: number;
  turns: number;
}

/** Vérifie la cohérence de l'état ; renvoie la liste des violations. */
export function checkInvariants(s: GameState, deckSizes: Record<string, number>): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const place = (id: string, where: string) => {
    if (seen.has(id)) errors.push(`${id} présent dans ${seen.get(id)} et ${where}`);
    seen.set(id, where);
    if (!s.objects[id]) errors.push(`${id} (${where}) n'existe pas`);
  };
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    for (const z of ["library", "hand", "graveyard", "command"] as const) for (const id of pl[z]) place(id, `${p}.${z}`);
  }
  for (const id of s.battlefield) place(id, "battlefield");
  for (const id of s.exile) place(id, "exile");
  // Un sort sur la pile, copie comprise (objet sans carte, 707.10).
  for (const item of s.stack) if (item.kind === "spell") place(item.sourceId, "stack");
  for (const [id, o] of Object.entries(s.objects)) {
    if (!seen.has(id)) errors.push(`${id} (${o.defId}) n'est dans aucune zone`);
    const where = seen.get(id) ?? "";
    if (!where.endsWith(o.zone)) errors.push(`${id} : zone ${o.zone} mais rangé dans ${where}`);
    if (o.damage < 0) errors.push(`${id} : blessures négatives`);
  }
  // Les cartes des joueurs éliminés quittent la partie (800.4a) ; les autres sont conservées.
  for (const p of s.playerOrder) {
    // Ni les jetons, ni les copies de sorts préparés (Reality Fracture) ne sont des cartes.
    // Un permanent assemblé représente ses deux cartes.
    const owned = Object.values(s.objects)
      .filter((o) => o.owner === p && !o.isToken && !o.preparedFor && !o.cardCopy)
      .reduce((n, o) => n + (o.melded?.length ?? 1), 0);
    const size = deckSizes[p] ?? 0;
    // Éliminé en cours de partie : 0 carte ; éliminé par le coup final : ses cartes restent.
    const ok = s.players[p]?.lost ? owned === 0 || owned === size : owned === size;
    if (!ok) errors.push(`${p} : ${owned} cartes au lieu de ${size}`);
  }
  // Couche 2 : le contrôle est déjà à jour (un nouveau calcul ne change rien). Partie finie : les objets du perdant
  // restent en place, ses effets de contrôle aussi.
  const probe = s.over ? null : cloneState(s);
  if (probe && syncControl(probe)) {
    const moved = s.battlefield.filter((id) => probe.objects[id]?.controller !== s.objects[id]?.controller);
    for (const id of moved) {
      const o = s.objects[id];
      errors.push(`${id} (${o?.defId}) : contrôle périmé, ${o?.controller} au lieu de ${probe.objects[id]?.controller}`);
    }
  }
  // Le cache des couches ne doit jamais diverger d'un calcul à neuf.
  const fresh = computeBattlefield(s);
  for (const id of s.battlefield) {
    const cached = chars(s, id) as unknown as Record<string, unknown>;
    const now = fresh.get(id) as unknown as Record<string, unknown> | undefined;
    if (JSON.stringify(cached) !== JSON.stringify(now)) {
      // Champs divergents, pour trouver le `bump` manquant.
      const diff = Object.keys({ ...cached, ...now }).filter((k) => JSON.stringify(cached[k]) !== JSON.stringify(now?.[k]));
      errors.push(`${id} (${s.objects[id]?.defId}) : cache des caractéristiques périmé (${diff.join(", ")})`);
    }
  }
  // Nombres : jamais NaN ni infini ; marqueurs, blessures et mana jamais négatifs.
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    if (!Number.isFinite(pl.life)) errors.push(`${p} : points de vie ${pl.life}`);
    for (const [m, n] of Object.entries(pl.manaPool)) if (!(Number.isFinite(n) && n >= 0)) errors.push(`${p} : mana ${m} = ${n}`);
  }
  for (const [id, o] of Object.entries(s.objects)) {
    for (const [k, n] of Object.entries(o.counters))
      if (!(Number.isFinite(n) && n >= 0)) errors.push(`${id} : marqueurs ${k} = ${n}`);
    if (!Number.isFinite(o.damage)) errors.push(`${id} : blessures ${o.damage}`);
  }
  // Références : une Aura ou un Équipement est attaché à un permanent (ou à un joueur) ; les combattants sont en jeu.
  // L'attachement n'est vérifié qu'à la priorité : en pleine résolution, les actions basées sur l'état (704.5m-n)
  // n'ont pas encore détaché ce qui l'est illégalement. La priorité « lancer maintenant » (608.2g) est encore dans la
  // résolution (Zoyowa's Justice mélange une créature enchantée, puis découvre).
  const onBattlefield = new Set(s.battlefield);
  const settled = s.pending?.kind === "priority" && !s.pending.castNow;
  for (const id of settled ? s.battlefield : []) {
    const to = s.objects[id]?.attachedTo;
    if (to && !onBattlefield.has(to) && !s.players[to]) errors.push(`${id} attaché à ${to}, absent du champ de bataille`);
  }
  for (const a of s.combat?.attackers ?? [])
    if (!onBattlefield.has(a.id)) errors.push(`attaquant ${a.id} absent du champ de bataille`);
  for (const b of s.combat?.blockers ?? [])
    if (!onBattlefield.has(b.id)) errors.push(`bloqueur ${b.id} absent du champ de bataille`);
  if (s.pending && s.players[s.pending.player]?.lost) errors.push(`décision attendue d'un joueur éliminé (${s.pending.player})`);
  // Sérialisable en JSON (sauvegarde, rejeu, envoi) : ni Map, ni Set, ni fonction, ni nombre non fini.
  const bad = nonJson({ ...s, defs: undefined });
  if (bad) errors.push(`état non sérialisable en JSON : ${bad}`);
  if (!s.over && !s.pending) errors.push("partie non terminée sans décision en attente");
  if (s.over && s.pending) errors.push("partie terminée avec une décision en attente");
  return errors;
}

/** Chemin du premier élément de `v` qui ne survivrait pas à JSON.stringify / JSON.parse, ou null. */
function nonJson(v: unknown, path = "état"): string | null {
  if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? null : `${path} = ${v}`;
  if (typeof v !== "object") return `${path} : ${typeof v}`;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = nonJson(v[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return `${path} : instance de ${proto?.constructor?.name ?? "?"}`;
  for (const k in v) {
    const r = nonJson((v as Record<string, unknown>)[k], `${path}.${k}`);
    if (r) return r;
  }
  return null;
}

/** Joue une partie entre IA (2 joueurs ou plus : un deck et un agent par joueur). */
export function playGame(opts: {
  seed: number;
  decks: CardDef[][];
  agents: Agent[];
  maxDecisions?: number;
  check?: boolean;
  startingLife?: number;
  /** Fuzz « chaos » : avant chaque décision, `perDecision` variantes corrompues sont soumises et doivent être refusées proprement. */
  chaos?: { seed: number; perDecision: number };
}): SelfPlayResult {
  const ids = opts.decks.map((_, i) => `p${i + 1}`);
  const deckSizes = Object.fromEntries(ids.map((id, i) => [id, opts.decks[i]?.length ?? 0]));
  let { state } = createGame({
    seed: opts.seed,
    startingLife: opts.startingLife,
    players: ids.map((id, i) => ({ id, name: `IA ${i + 1}`, deck: opts.decks[i] ?? [] })),
  });
  const agents: Record<string, Agent> = Object.fromEntries(ids.map((id, i) => [id, opts.agents[i] as Agent]));
  const decisions: SelfPlayResult["decisions"] = [];
  let illegal = 0;
  const max = opts.maxDecisions ?? 5000;
  const chaosRand = opts.chaos ? mulberry32(opts.chaos.seed) : null;
  for (let i = 0; i < max && state.pending && !state.over; i++) {
    const p = state.pending;
    let d = (agents[p.player] as Agent)(state, p.player);
    if (chaosRand && opts.chaos) probe(state, p.player, d, chaosRand, opts.chaos.perDecision, `seed ${opts.seed}, décision ${i}`);
    try {
      state = submit(state, p.player, d).state;
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      illegal++;
      d = fallbackDecision(state, p);
      state = submit(state, p.player, d).state;
    }
    decisions.push({ player: p.player, decision: d });
    if (opts.check) {
      const errors = checkInvariants(state, deckSizes);
      if (errors.length) throw new Error(`Invariants violés (seed ${opts.seed}, décision ${i}) :\n${errors.join("\n")}`);
    }
  }
  return { state, decisions, illegal, turns: state.turn.number };
}

/** État sans les définitions (partagées, immuables) : sert à vérifier qu'une soumission n'a rien modifié. */
function fingerprint(s: GameState): string {
  return JSON.stringify({ ...s, defs: undefined });
}

/**
 * Soumet des variantes corrompues de `d` : chacune doit être refusée par une RulesError (ou acceptée si elle est
 * légale par hasard), et l'état d'origine ne doit jamais changer (`submit` est transactionnel).
 */
function probe(state: GameState, player: string, d: Decision, rand: () => number, count: number, where: string): void {
  const before = fingerprint(state);
  for (let k = 0; k < count; k++) {
    const bad = corruptDecision(state, d, rand);
    try {
      submit(state, player, bad);
    } catch (e) {
      if (!(e instanceof RulesError)) {
        throw new Error(`Chaos (${where}) : erreur non RulesError pour ${JSON.stringify(bad)} (légale : ${JSON.stringify(d)})`, {
          cause: e,
        });
      }
    }
  }
  if (fingerprint(state) !== before) throw new Error(`Chaos (${where}) : une soumission a modifié l'état d'origine`);
}
