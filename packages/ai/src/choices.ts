/**
 * Réponses de l'IA aux choix génériques (regard, défausse, sacrifice, répartition des blessures…).
 */
import { type ChoiceRequest, type ChoiceValue, type GameState, manaValue, type PlayerId } from "@mtgx/engine";
import { creatureValue, evaluate, rollout, stackEmpty, trySubmit } from "./evaluate";

const isLand = (s: GameState, id: string) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");

function landCount(s: GameState, me: PlayerId): number {
  const onBoard = s.battlefield.filter((id) => s.objects[id]?.controller === me && isLand(s, id)).length;
  const inHand = (s.players[me]?.hand ?? []).filter((id) => isLand(s, id)).length;
  return onBoard + inHand;
}

/** Valeur « à garder » d'une carte, du point de vue de `me`. */
export function keepValue(s: GameState, me: PlayerId, id: string): number {
  const o = s.objects[id];
  const d = o && s.defs[o.defId];
  if (!d) return 0;
  const lands = landCount(s, me);
  if (d.types.includes("Land")) return lands >= 5 ? 0.5 : 6;
  const cost = manaValue(d.manaCost);
  if (o.zone === "battlefield" && d.types.includes("Creature"))
    return creatureValue(d, (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0));
  return 5 - Math.max(0, cost - lands - 1);
}

/** Essaie chaque réponse candidate, laisse la pile se résoudre et garde la meilleure position. */
function bestBySimulation(s: GameState, me: PlayerId, candidates: ChoiceValue[][]): ChoiceValue[] | null {
  let best: ChoiceValue[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const values of candidates) {
    const next = trySubmit(s, me, { type: "choose", values });
    if (!next) continue;
    const score = evaluate(rollout(next, stackEmpty), me);
    if (score > bestScore) {
      bestScore = score;
      best = values;
    }
  }
  return best;
}

export function heuristicChoice(s: GameState, me: PlayerId, req: ChoiceRequest): ChoiceValue[] {
  if (req.type === "pick" && req.intent === "triggerTarget" && req.max === 1) {
    const candidates = req.options.map((o) => [o] as ChoiceValue[]);
    if (req.min === 0) candidates.push([]);
    return bestBySimulation(s, me, candidates) ?? req.suggested;
  }
  if (req.type === "pick") {
    const byValue = [...req.options].sort((a, b) => keepValue(s, me, a) - keepValue(s, me, b));
    switch (req.intent) {
      case "scryBottom":
      case "surveilGraveyard":
        // On se débarrasse de ce qui ne servira pas (terrains en trop, sorts trop chers).
        return req.options.filter((id) => keepValue(s, me, id) < 3).slice(0, req.max);
      case "discard":
      case "sacrifice":
        return byValue.slice(0, req.min);
      default:
        return req.suggested;
    }
  }
  if (req.type === "order") {
    // Le plus utile en premier.
    return [...req.items].sort((a, b) => keepValue(s, me, b) - keepValue(s, me, a));
  }
  return req.suggested;
}

export function mulberryChoice(rand: () => number, req: ChoiceRequest): ChoiceValue[] {
  switch (req.type) {
    case "pick": {
      const n = req.min + Math.floor(rand() * (req.max - req.min + 1));
      let pool = [...req.options];
      const out: string[] = [];
      const g = req.group;
      while (out.length < n && pool.length) {
        const id = pool.splice(Math.floor(rand() * pool.length), 1)[0] as string;
        out.push(id);
        if (g) pool = pool.filter((x) => (g.kind === "same" ? g.holders[x] === g.holders[id] : g.holders[x] !== g.holders[id]));
      }
      return out.length >= req.min ? out : req.suggested.map(String);
    }
    case "number":
      return [req.min + Math.floor(rand() * (req.max - req.min + 1))];
    case "order": {
      const items = [...req.items];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [items[i], items[j]] = [items[j] as string, items[i] as string];
      }
      return items;
    }
    case "yesNo":
      return [rand() < 0.5 ? 0 : 1];
    case "divide": {
      // Répartition aléatoire entre les bloqueurs uniquement (toujours légale, même avec le piétinement).
      if (rand() < 0.5) return req.suggested;
      const creatures = req.among.map((id, i) => (id === req.lethal?.player ? -1 : i)).filter((i) => i >= 0);
      const values = req.among.map(() => 0);
      for (let k = 0; k < req.total; k++) {
        const i = creatures[Math.floor(rand() * creatures.length)] ?? 0;
        values[i] = (values[i] ?? 0) + 1;
      }
      return values;
    }
  }
}
