/**
 * Choix génériques : validation des réponses et construction des demandes.
 */
import { RulesError } from "./errors";
import { isNameAllowed } from "./names";
import type { ChoicePurpose, ChoiceRequest, ChoiceValue, GameState, PlayerId } from "./types";

/**
 * Repère d'une carte dans un texte destiné au joueur (invite, libellé) : l'interface le remplace par le nom de la carte
 * dans sa langue (`localizeText` du client).
 */
export function cardRef(defId: string): string {
  return `⟦${defId}⟧`;
}

export function ask(s: GameState, player: PlayerId, request: ChoiceRequest, purpose: ChoicePurpose): void {
  s.pending = { kind: "choice", player, request, purpose };
}

/**
 * Réponse à la place d'un joueur qui a quitté la partie (800.4a) : il ne prend plus aucune décision, donc ne fait rien
 * de ce qui est facultatif (« peut » refusé, aucun objet choisi si c'est permis, le minimum d'un nombre) ; sinon, la
 * réponse proposée par le moteur.
 */
export function absentAnswer(req: ChoiceRequest): ChoiceValue[] {
  switch (req.type) {
    case "yesNo":
      return [0];
    case "pick":
      return req.min === 0 ? [] : req.suggested;
    case "number":
      return [req.min];
    default:
      return req.suggested;
  }
}

const isInt = (v: ChoiceValue): v is number => typeof v === "number" && Number.isInteger(v);

/** Vérifie qu'une réponse respecte la demande ; lève une RulesError sinon (`s` : noms acceptés d'une question « nom »). */
export function validateChoice(req: ChoiceRequest, values: ChoiceValue[], s: GameState): void {
  switch (req.type) {
    case "name": {
      const v = values[0];
      if (values.length !== 1 || typeof v !== "string") throw new RulesError("Un nom attendu");
      if (!isNameAllowed(s, req.of, v))
        throw new RulesError(req.of === "creatureType" ? `Type de créature inconnu : ${v}` : `Nom de carte inconnu : ${v}`);
      return;
    }
    case "pick": {
      if (new Set(values).size !== values.length) throw new RulesError("Choix en double");
      if (values.some((v) => typeof v !== "string" || !req.options.includes(v))) throw new RulesError("Choix hors des options");
      if (values.length < req.min || values.length > req.max) {
        throw new RulesError(
          req.min === req.max ? `Choisissez exactement ${req.min}` : `Choisissez entre ${req.min} et ${req.max}`,
        );
      }
      return;
    }
    case "number": {
      const v = values[0];
      if (values.length !== 1 || v === undefined || !isInt(v) || v < req.min || v > req.max) {
        throw new RulesError(`Nombre attendu entre ${req.min} et ${req.max}`);
      }
      return;
    }
    case "order": {
      const sorted = [...values].map(String).sort();
      const expected = [...req.items].sort();
      if (sorted.length !== expected.length || sorted.some((v, i) => v !== expected[i])) throw new RulesError("Ordre invalide");
      return;
    }
    case "yesNo":
      if (values.length !== 1 || (values[0] !== 0 && values[0] !== 1)) throw new RulesError("Réponse oui/non attendue");
      return;
    case "divide": {
      if (values.length !== req.among.length || values.some((v) => !isInt(v) || v < 0))
        throw new RulesError("Répartition invalide");
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (sum !== req.total) throw new RulesError(`Répartissez exactement ${req.total}`);
      if (req.minEach && values.some((v) => (v as number) < (req.minEach as number))) {
        throw new RulesError(`Au moins ${req.minEach} pour chacun`);
      }
      if (req.lethal) {
        const lethal = req.lethal;
        const toPlayer = values[req.among.indexOf(lethal.player)] as number | undefined;
        if (toPlayer && toPlayer > 0) {
          for (const [id, need] of Object.entries(lethal.needs)) {
            if ((values[req.among.indexOf(id)] as number) < need) {
              throw new RulesError("Piétinement : chaque bloqueur doit recevoir des blessures mortelles avant le joueur");
            }
          }
        }
      }
      return;
    }
  }
}

/** Réponse sous forme de table cible → quantité, pour une répartition. */
export function divisionOf(req: Extract<ChoiceRequest, { type: "divide" }>, values: ChoiceValue[]): Record<string, number> {
  const out: Record<string, number> = {};
  req.among.forEach((id, i) => {
    out[id] = Number(values[i] ?? 0);
  });
  return out;
}
