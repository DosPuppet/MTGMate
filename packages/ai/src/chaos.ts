/**
 * Décisions corrompues, pour le fuzz « chaos » : à partir d'une décision légale, on fabrique ce qu'un client
 * malveillant ou bogué pourrait envoyer (identifiant inconnu ou d'une zone cachée, index hors bornes, tableau vidé
 * ou dupliqué, champ supprimé, mauvais type…). Le moteur doit refuser chacune par une RulesError, ou l'accepter
 * si elle est légale par hasard, sans jamais modifier l'état reçu.
 */
import type { Decision, GameState } from "@mtgx/engine";

const DECISION_TYPES: Decision["type"][] = [
  "keep",
  "mulligan",
  "bottom",
  "pass",
  "playLand",
  "cast",
  "activate",
  "tapForMana",
  "declareAttackers",
  "declareBlockers",
  "discard",
  "choose",
];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Path = (string | number)[];

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

/** Chemins de tous les nœuds (feuilles et conteneurs) de la décision, sauf la racine. */
function paths(v: Json, prefix: Path = [], out: Path[] = []): Path[] {
  if (v && typeof v === "object") {
    for (const [k, x] of Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v)) {
      const p = [...prefix, k];
      out.push(p);
      paths(x as Json, p, out);
    }
  }
  return out;
}

function parentOf(root: Json, path: Path): { parent: Record<string | number, Json>; key: string | number } {
  let cur = root as Record<string | number, Json>;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string | number, Json>;
  return { parent: cur, key: path[path.length - 1] as string | number };
}

/** Une variante corrompue de `d` (copie : `d` n'est pas modifiée). */
export function corruptDecision(s: GameState, d: Decision, rand: () => number): Decision {
  const out = JSON.parse(JSON.stringify(d)) as Json & { type: string };
  const all = paths(out).filter((p) => p[0] !== "type");
  const ids = Object.keys(s.objects);
  const kind = Math.floor(rand() * 8);
  if (kind === 0 || all.length === 0) {
    // Autre type de décision, mêmes champs.
    out.type = pick(rand, DECISION_TYPES);
    return out as Decision;
  }
  const { parent, key } = parentOf(out, pick(rand, all));
  const cur = parent[key] as Json;
  switch (kind) {
    case 1:
      parent[key] = "o999999";
      break;
    case 2:
      // Objet existant, souvent dans une zone cachée (bibliothèque, main adverse).
      parent[key] = ids.length ? pick(rand, ids) : "o1";
      break;
    case 3:
      parent[key] = pick(rand, [-1, 999, 0.5, 1e9]);
      break;
    case 4:
      parent[key] = Array.isArray(cur) ? (cur.length ? [...cur, cur[0] as Json] : ["o999999"]) : [];
      break;
    case 5:
      parent[key] = Array.isArray(cur) ? [] : null;
      break;
    case 6:
      if (Array.isArray(parent)) parent.splice(key as number, 1);
      else delete parent[key];
      break;
    default:
      parent[key] = Array.isArray(cur) ? "o1" : typeof cur === "string" ? { id: cur } : String(cur);
  }
  return out as Decision;
}
