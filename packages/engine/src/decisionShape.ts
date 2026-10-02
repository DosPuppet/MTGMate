/**
 * Forme d'une décision reçue (client en ligne, IA, script) : vérifiée avant de toucher au moteur, pour qu'une
 * décision mal formée soit refusée par une RulesError plutôt que de provoquer une TypeError au fond du moteur.
 * La légalité (cartes en main, cibles, coûts…) reste vérifiée par les règles elles-mêmes.
 */
import { RulesError } from "./errors";
import type { Decision, GameState } from "./types";

type Rec = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
/** Liste d'objets distincts (cartes défaussées, sacrifiées…) : un doublon n'a pas de sens. */
const isIdSet = (v: unknown): v is string[] => isStrArray(v) && new Set(v).size === v.length;

function bad(field: string): never {
  throw new RulesError(`Décision mal formée : ${field}`);
}

/** Champ facultatif : absent (undefined), ou conforme. */
function opt(d: Rec, field: string, ok: (v: unknown) => boolean): void {
  if (d[field] !== undefined && !ok(d[field])) bad(field);
}

/** Objet cité comme carte ou source de l'action : il doit exister. */
function objectRef(s: GameState, d: Rec, field: string): void {
  const id = d[field];
  if (!isStr(id)) bad(field);
  if (!s.objects[id]) throw new RulesError("Objet inconnu");
}

/** Objets cités dans une liste : ils doivent tous exister. */
function objectRefs(s: GameState, ids: unknown[]): void {
  if (ids.some((id) => !s.objects[id as string])) throw new RulesError("Objet inconnu");
}

function castChoices(s: GameState, d: Rec): void {
  for (const f of ["free", "alternative", "kicked", "faceDown", "warp"]) opt(d, f, (v) => typeof v === "boolean");
  for (const f of ["mode", "x", "face"]) opt(d, f, isIndex);
  for (const f of ["discard", "sacrifice", "tap", "materials", "bounce"]) {
    opt(d, f, isIdSet);
    objectRefs(s, (d[f] as string[] | undefined) ?? []);
  }
  opt(d, "targets", (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isStrArray));
  // Objets payés en coût, par emplacement : des listes d'identifiants d'objets existants (répétés pour les marqueurs).
  opt(d, "picks", (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isStrArray));
  for (const ids of Object.values((d.picks as Record<string, string[]> | undefined) ?? {})) objectRefs(s, ids);
}

function pairs(v: unknown, a: string, b: string): boolean {
  return Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && isStr((x as Rec)[a]) && isStr((x as Rec)[b]));
}

export function checkDecisionShape(s: GameState, raw: Decision): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("décision");
  const d = raw as unknown as Rec;
  switch (raw.type) {
    case "keep":
    case "mulligan":
    case "pass":
    case "concede":
      return;
    case "bottom":
    case "discard":
      if (!isIdSet(d.cards)) bad("cards");
      objectRefs(s, d.cards);
      return;
    case "playLand":
      objectRef(s, d, "card");
      opt(d, "payLife", (v) => typeof v === "boolean");
      opt(d, "landType", (v) => typeof v === "string");
      opt(d, "chosen", (v) => typeof v === "string");
      return;
    case "cast":
      objectRef(s, d, "card");
      castChoices(s, d);
      return;
    case "activate":
      objectRef(s, d, "source");
      if (!isIndex(d.ability)) bad("ability");
      castChoices(s, d);
      return;
    case "undoMana":
      objectRef(s, d, "source");
      return;
    case "tapForMana":
      objectRef(s, d, "source");
      if (!isIndex(d.ability)) bad("ability");
      opt(d, "color", isStr);
      return;
    case "declareAttackers":
      if (!pairs(d.attackers, "id", "defender")) bad("attackers");
      if (!isIdSet((d.attackers as Rec[]).map((a) => a.id))) bad("attackers");
      objectRefs(
        s,
        (d.attackers as Rec[]).map((a) => a.id),
      );
      return;
    case "declareBlockers":
      if (!pairs(d.blocks, "blocker", "attacker")) bad("blocks");
      objectRefs(
        s,
        (d.blocks as Rec[]).flatMap((b) => [b.blocker, b.attacker]),
      );
      return;
    case "choose":
      if (!Array.isArray(d.values) || !d.values.every((v) => isStr(v) || Number.isFinite(v))) bad("values");
      return;
    default:
      bad("type");
  }
}
