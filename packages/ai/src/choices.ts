/**
 * Réponses de l'IA aux choix génériques (regard, défausse, sacrifice, répartition des blessures…).
 */
import { type ChoiceRequest, type ChoiceValue, chars, type GameState, manaValue, type PlayerId } from "@mtgx/engine";
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
    const score = evaluate(rollout(next, stackEmpty, 60, true), me);
    if (score > bestScore) {
      bestScore = score;
      best = values;
    }
  }
  return best;
}

/**
 * Suite d'une réponse simulée jusqu'à la pile vide : les questions suivantes (cibles des déclencheurs ordonnés, choix
 * d'une résolution) reçoivent leur réponse suggérée, au lieu d'arrêter la simulation à la première question. `s` est une
 * copie de travail (résultat de `trySubmit`) : elle est modifiée sur place.
 */
function settle(s: GameState): GameState {
  let cur = s;
  for (let i = 0; i < 30 && !cur.over; i++) {
    const p = cur.pending;
    if (p?.kind === "choice") {
      const next = trySubmit(cur, p.player, { type: "choose", values: p.request.suggested });
      if (!next) break;
      cur = next;
    } else if (p?.kind === "priority" && !stackEmpty(cur)) cur = rollout(cur, stackEmpty, 60, true);
    else break;
    if (cur.pending?.kind === "priority" && stackEmpty(cur)) break;
  }
  return cur;
}

/** Comme `bestBySimulation`, en menant chaque simulation jusqu'à la pile vide (`settle`). */
function bestSettled(s: GameState, me: PlayerId, candidates: ChoiceValue[][]): ChoiceValue[] | null {
  let best: ChoiceValue[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  for (const values of candidates) {
    const key = JSON.stringify(values);
    if (seen.has(key)) continue;
    seen.add(key);
    const next = trySubmit(s, me, { type: "choose", values });
    if (!next) continue;
    const score = evaluate(settle(next), me);
    if (score > bestScore) {
      bestScore = score;
      best = values;
    }
  }
  return best;
}

/** Blessures qui détruisent ce destinataire (créature : endurance moins les blessures ; contact mortel non compté). */
function lethalNeed(s: GameState, id: string): number {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return Number.POSITIVE_INFINITY;
  const c = chars(s, id);
  if (c.types.includes("Planeswalker")) return Math.max(1, o.counters.loyalty ?? 0);
  if (!c.types.includes("Creature")) return Number.POSITIVE_INFINITY;
  return Math.max(1, c.toughness - (o.damage ?? 0));
}

/**
 * Répartitions candidates : la suggestion du moteur, tout sur un destinataire (le minimum aux autres), et pour des
 * blessures, de quoi détruire d'abord les créatures adverses les plus précieuses, le reste au joueur s'il en fait partie.
 */
function divideCandidates(s: GameState, me: PlayerId, req: Extract<ChoiceRequest, { type: "divide" }>): ChoiceValue[][] {
  const out: ChoiceValue[][] = [req.suggested];
  const n = req.among.length;
  const minEach = req.minEach ?? 0;
  const rest = req.total - minEach * n;
  if (rest < 0) return out;
  for (let i = 0; i < n && i < 6; i++) out.push(req.among.map((_, j) => minEach + (j === i ? rest : 0)));
  if (req.intent !== "combatDamage" && req.intent !== "divideDamage") return out;
  const value = (id: string) => {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    return d ? creatureValue(d) : 0;
  };
  const hostile = (id: string) => !!s.objects[id] && s.objects[id]?.controller !== me;
  const order = req.among
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => !s.players[id] && hostile(id))
    .sort((a, b) => value(b.id) - value(a.id));
  const values = req.among.map(() => minEach);
  let left = rest;
  for (const { id, i } of order) {
    const need = Math.max(0, (req.lethal?.needs[id] ?? lethalNeed(s, id)) - minEach);
    if (!Number.isFinite(need) || need > left) continue;
    values[i] = (values[i] ?? 0) + need;
    left -= need;
  }
  const player = req.among.findIndex((id) => !!s.players[id] && id !== me);
  const sink = player >= 0 ? player : (order[0]?.i ?? 0);
  values[sink] = (values[sink] ?? 0) + left;
  out.push(values);
  return out;
}

/**
 * Choix de plusieurs options (regard, recherche, piles, prolifération…) : le sens d'un bon choix dépend de l'effet
 * (garder ses meilleures cartes, exiler les pires de l'adversaire). Candidats : la suggestion du moteur, les options les
 * plus et les moins précieuses, et pour des permanents ou des joueurs, les siens seuls ou ceux des adversaires seuls ;
 * la simulation départage.
 */
function pickCandidates(s: GameState, me: PlayerId, req: Extract<ChoiceRequest, { type: "pick" }>): ChoiceValue[][] {
  const out: ChoiceValue[][] = [req.suggested];
  const byValue = [...req.options].sort((a, b) => keepValue(s, me, b) - keepValue(s, me, a));
  out.push(byValue.slice(0, req.max), byValue.slice(-Math.max(req.min, 1)).reverse().slice(0, req.max));
  if (req.min === 0) out.push([]);
  const mine = (id: string) => id === me || s.objects[id]?.controller === me || s.objects[id]?.owner === me;
  out.push(req.options.filter(mine).slice(0, req.max), req.options.filter((id) => !mine(id)).slice(0, req.max));
  return out.filter((v) => v.length >= req.min && v.length <= req.max);
}

/** Toutes les permutations (petits ensembles seulement). */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/**
 * Pile très haute ou plateau énorme (boucle de déclenchements : Ganax et Draconic Visitor, Scourge of Valkas) : chaque
 * simulation résoudrait toute la pile, et une réponse coûterait des minutes (mesuré au tournoi Commander du 06/10/2026).
 * Les choix y prennent la suggestion du moteur, ou l'ordre par valeur.
 */
const COSTLY_STACK = 12;
const COSTLY_FIELD = 150;

export function heuristicChoice(s: GameState, me: PlayerId, req: ChoiceRequest): ChoiceValue[] {
  if (s.stack.length > COSTLY_STACK || s.battlefield.length > COSTLY_FIELD) {
    if (req.type === "order") return [...req.items].sort((a, b) => keepValue(s, me, b) - keepValue(s, me, a));
    return req.suggested;
  }
  // Répartition (blessures de combat, blessures ou marqueurs répartis) : candidats simulés (PLAN-C, C17).
  if (req.type === "divide") return bestSettled(s, me, divideCandidates(s, me, req)) ?? req.suggested;
  // Ordre des déclencheurs : chaque ordre essayé jusqu'à trois capacités (six ordres).
  if (req.type === "order" && req.intent === "triggerOrder" && req.items.length <= 3)
    return bestSettled(s, me, permutations(req.items)) ?? req.suggested;
  if (req.type === "pick" && req.max > 1 && !["discard", "sacrifice", "scryBottom", "surveilGraveyard"].includes(req.intent))
    return bestSettled(s, me, pickCandidates(s, me, req)) ?? req.suggested;
  if (req.type === "pick" && (req.intent === "triggerTarget" || req.intent === "changeTarget") && req.max === 1) {
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
      default: {
        // Choix d'une seule option parmi peu : on essaie chacune (P3 ; avant, la réponse suggérée).
        if (req.max === 1 && req.options.length <= 6) {
          const candidates = req.options.map((o) => [o] as ChoiceValue[]);
          if (req.min === 0) candidates.push([]);
          return bestBySimulation(s, me, candidates) ?? req.suggested;
        }
        return req.suggested;
      }
    }
  }
  // « Vous pouvez », « à moins que … ne paie » : oui et non sont essayés (P3 ; avant, toujours la suggestion).
  if (req.type === "yesNo") return bestBySimulation(s, me, [[1], [0]]) ?? req.suggested;
  // Petit nombre à choisir (X à payer…) : chaque valeur est essayée.
  if (req.type === "number" && req.max - req.min <= 5) {
    const candidates = Array.from({ length: req.max - req.min + 1 }, (_, i) => [req.min + i] as ChoiceValue[]);
    return bestBySimulation(s, me, candidates) ?? req.suggested;
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
      // Répartition aléatoire entre les bloqueurs uniquement (toujours légale, même avec le piétinement), au moins
      // `minEach` pour chacun (« au moins 1 à chaque cible »).
      if (rand() < 0.5) return req.suggested;
      const minEach = req.minEach ?? 0;
      if (req.total < minEach * req.among.length) return req.suggested;
      const creatures = req.among.map((id, i) => (id === req.lethal?.player ? -1 : i)).filter((i) => i >= 0);
      const values = req.among.map(() => minEach);
      for (let k = minEach * req.among.length; k < req.total; k++) {
        const i = creatures[Math.floor(rand() * creatures.length)] ?? 0;
        values[i] = (values[i] ?? 0) + 1;
      }
      return values;
    }
  }
}
