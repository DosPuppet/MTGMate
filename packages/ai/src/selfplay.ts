/**
 * Parties IA contre IA avec vérification d'invariants : sert au fuzzing du moteur et aux tests.
 */

import type { CardDef } from "@mtgx/engine";
import { type Agent, createGame, type Decision, fallbackDecision, type GameState, RulesError, submit } from "@mtgx/engine";

export interface SelfPlayResult {
  state: GameState;
  decisions: { player: string; decision: Decision }[];
  illegal: number;
  turns: number;
}

/** Vérifie la cohérence de l'état ; renvoie la liste des violations. */
export function checkInvariants(s: GameState, totalCards: number): string[] {
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
    for (const z of ["library", "hand", "graveyard"] as const) for (const id of pl[z]) place(id, `${p}.${z}`);
  }
  for (const id of s.battlefield) place(id, "battlefield");
  for (const id of s.exile) place(id, "exile");
  for (const item of s.stack) if (item.kind === "spell") place(item.sourceId, "stack");
  for (const [id, o] of Object.entries(s.objects)) {
    if (!seen.has(id)) errors.push(`${id} (${o.defId}) n'est dans aucune zone`);
    const where = seen.get(id) ?? "";
    if (!where.endsWith(o.zone)) errors.push(`${id} : zone ${o.zone} mais rangé dans ${where}`);
    if (o.damage < 0) errors.push(`${id} : blessures négatives`);
  }
  const cards = Object.values(s.objects).filter((o) => !o.isToken).length;
  if (cards !== totalCards) errors.push(`nombre de cartes : ${cards} au lieu de ${totalCards}`);
  if (!s.over && !s.pending) errors.push("partie non terminée sans décision en attente");
  if (s.over && s.pending) errors.push("partie terminée avec une décision en attente");
  return errors;
}

export function playGame(opts: {
  seed: number;
  decks: [CardDef[], CardDef[]];
  agents: [Agent, Agent];
  maxDecisions?: number;
  check?: boolean;
}): SelfPlayResult {
  const total = opts.decks[0].length + opts.decks[1].length;
  let { state } = createGame({
    seed: opts.seed,
    players: [
      { id: "p1", name: "IA 1", deck: opts.decks[0] },
      { id: "p2", name: "IA 2", deck: opts.decks[1] },
    ],
  });
  const agents: Record<string, Agent> = { p1: opts.agents[0], p2: opts.agents[1] };
  const decisions: SelfPlayResult["decisions"] = [];
  let illegal = 0;
  const max = opts.maxDecisions ?? 5000;
  for (let i = 0; i < max && state.pending && !state.over; i++) {
    const p = state.pending;
    let d = (agents[p.player] as Agent)(state, p.player);
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
      const errors = checkInvariants(state, total);
      if (errors.length) throw new Error(`Invariants violés (seed ${opts.seed}, décision ${i}) :\n${errors.join("\n")}`);
    }
  }
  return { state, decisions, illegal, turns: state.turn.number };
}
