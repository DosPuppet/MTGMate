/**
 * Worker d'IA du serveur (PLAN-E, E14) : réfléchit à une décision d'un siège IA hors du fil principal, pour que les
 * autres salons ne soient pas bloqués. Reçoit l'état de la partie sans ses définitions de cartes (gardées ici par
 * salon, complétées à chaque envoi par celles qui manquaient : jetons créés en cours de partie).
 */
import { parentPort } from "node:worker_threads";
import { type AiBudget, type AiLevel, aiAgent } from "@mtgx/ai";
import type { CardDef, Decision, GameState } from "@mtgx/engine";

export type ToAiWorker =
  | {
      type: "decide";
      id: number;
      room: string;
      seat: string;
      level: AiLevel;
      players: number;
      seed: number;
      budget?: AiBudget;
      state: Omit<GameState, "defs">;
      /** Définitions que ce worker n'a pas encore pour ce salon. */
      defs?: Record<string, CardDef>;
    }
  | { type: "forget"; room: string };

export type FromAiWorker = { id: number; decision: Decision } | { id: number; error: string };

/** Définitions par salon (les salons les plus anciens sont oubliés au-delà de 64). */
const defsByRoom = new Map<string, Record<string, CardDef>>();
const MAX_ROOMS = 64;

parentPort?.on("message", (m: ToAiWorker) => {
  if (m.type === "forget") {
    defsByRoom.delete(m.room);
    return;
  }
  let defs = defsByRoom.get(m.room);
  if (!defs) {
    defs = {};
    defsByRoom.set(m.room, defs);
    if (defsByRoom.size > MAX_ROOMS) defsByRoom.delete(defsByRoom.keys().next().value as string);
  }
  if (m.defs) Object.assign(defs, m.defs);
  try {
    const state = { ...m.state, defs } as GameState;
    const decision = aiAgent(m.level, { seed: m.seed, budget: m.budget, players: m.players })(state, m.seat);
    parentPort?.postMessage({ id: m.id, decision } satisfies FromAiWorker);
  } catch (e) {
    parentPort?.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) } satisfies FromAiWorker);
  }
});
