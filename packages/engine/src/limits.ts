/**
 * Plafonds de sécurité du moteur (docs/moteur.md, « Plafonds de sécurité » ; docs/plans/PLAN-C.md, lot C1).
 *
 * Les gardes de boucle déclarent la partie nulle (104.4b) ; les autres coupent un montant. Une coupure émet l'événement
 * `capReached` (journal de la partie, compté par le fuzz) : elle signale une approximation, jamais un fonctionnement
 * normal. Tout plafond nouveau va ici, dans docs/moteur.md et dans docs/approximations.md.
 */
import { emit } from "./events";

/** Étapes du déroulement (`advance`) sans décision : au-delà, boucle d'actions obligatoires, partie nulle. */
export const MAX_FLOW_STEPS = 100_000;
/** Passes d'actions basées sur l'état d'affilée : au-delà, partie nulle. */
export const MAX_SBA_PASSES = 100;
/** Passes pile non vide au-delà desquelles on relève l'empreinte de l'état (boucle obligatoire, 104.4b). */
export const LOOP_SUSPECT = 20;
/** Passes pile non vide au-delà desquelles la partie est nulle, même sans empreinte répétée. */
export const LOOP_LIMIT = 2000;
/** Décisions automatiques (IA, automatisme) d'affilée dans un tour : au-delà, partie nulle (`GameHost`). */
export const MAX_AUTOMATIC_DECISIONS = 10_000;
/** Jetons créés par un même événement. */
export const MAX_TOKENS_PER_EVENT = 100;
/** Objets sur le champ de bataille au-delà desquels aucun jeton n'est créé. */
export const MAX_BATTLEFIELD = 400;
/** Montant remplacé (blessures, marqueurs, PV, cartes, jetons) : des doubleurs qui se multiplient donneraient l'infini. */
export const MAX_AMOUNT = 1_000_000;
/** Remplacements chiffrés d'un même événement dont on essaie tous les ordres (616.1) ; au-delà, l'ordre du code. */
export const MAX_PERMUTED = 5;
/** Applications des couches pour résoudre les dépendances (613.8, point fixe). */
export const MAX_LAYER_PASSES = 3;

export type CapName = "tokens" | "amount" | "permutations" | "layers";

/** Une coupure a eu lieu : événement de journal (sans information cachée). */
export function capReached(cap: CapName): void {
  emit({ type: "capReached", cap });
}
