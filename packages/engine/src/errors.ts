/** Décision illégale : l'état d'origine reste inchangé. */
export class RulesError extends Error {}

/**
 * Relance une erreur attrapée autour d'une étape pouvant être illégale (paiement, cibles) : une RulesError devient
 * une RulesError au message donné ; toute autre erreur est un bug du moteur et remonte telle quelle (jamais
 * déguisée en décision illégale, sinon l'IA et le fuzz la masquent).
 */
export function rethrowAsRules(e: unknown, message?: string): never {
  if (e instanceof RulesError) throw message === undefined ? e : new RulesError(message);
  throw e;
}
