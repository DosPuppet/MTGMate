/**
 * IA heuristique, paramétrée par un profil de niveau (profile.ts) :
 * - sorts et capacités : simulation à un coup sur un clone de l'état, puis évaluation du plateau ;
 * - blocages : recherche gloutonne par simulation du combat (niveau élevé : recherche, voir combat.ts) ;
 * - attaques : règles de combat simples (duels, attaque totale létale, sécurité en défense) ;
 *   niveau élevé : simulation des blocages adverses (combat.ts).
 */
import {
  type Agent,
  attackableDefenders,
  attackCandidates,
  blockCandidates,
  chars,
  creaturesControlledBy,
  type Decision,
  forcedAttackers,
  type GameState,
  hasKeyword,
  legalActions,
  manaValue,
  type ObjectId,
  opponentsOf,
  type PlayerId,
  requiredBlocks,
  unmetBlockRequirement,
} from "@mtgx/engine";
import { heuristicChoice, keepValue } from "./choices";
import { searchAttackers, searchBlocks } from "./combat";
import { afterCombat, creatureValue, evaluate, rollout, stackEmpty, targetOpponent, trySubmit } from "./evaluate";
import { enumerateDecisions } from "./options";
import { MEDIUM_PROFILE, type Profile } from "./profile";

/** IA de niveau moyen (fuzz, bench, tests). */
export function heuristicAgent(): Agent {
  return (s, me) => decide(s, me, MEDIUM_PROFILE);
}

export function decide(s: GameState, me: PlayerId, pr: Profile): Decision {
  const p = s.pending;
  switch (p?.kind) {
    case "mulligan":
      return keepHand(s, me, pr) || p.mulligans >= 2 ? { type: "keep" } : { type: "mulligan" };
    case "bottomCards":
      return { type: "bottom", cards: worstCards(s, me, p.count) };
    case "discard":
      return { type: "discard", cards: worstCards(s, me, p.count) };
    case "declareAttackers": {
      const chosen =
        pr.attack === "search"
          ? searchAttackers(s, me, pr)
          : pr.attack === "naive"
            ? naiveAttackers(s, me, pr)
            : chooseAttackers(s, me);
      return {
        type: "declareAttackers",
        attackers: chooseDefenders(s, me, [...new Set([...chosen, ...forcedAttackers(s, me)])]),
      };
    }
    case "declareBlockers": {
      const blocks =
        pr.block === "search" ? searchBlocks(s, me, pr) : pr.block === "naive" ? naiveBlocks(s, me) : chooseBlocks(s, me);
      return { type: "declareBlockers", blocks: withRequiredBlocks(s, me, blocks) };
    }
    case "choice":
      return { type: "choose", values: heuristicChoice(s, me, p.request) };
    case "priority":
      return choosePriority(s, me, pr);
    default:
      return { type: "pass" };
  }
}

/**
 * Répartition des attaquants : on envoie sur chaque planeswalker adverse (le plus chargé d'abord) juste assez
 * de force pour l'abattre, en commençant par les créatures évasives ; le reste attaque le joueur.
 * Si les attaquants suffisent à tuer le joueur, tout va sur le joueur.
 */
export function chooseDefenders(s: GameState, me: PlayerId, attackers: string[]): { id: string; defender: string }[] {
  const opp = targetOpponent(s, me);
  const power = (id: string) => Math.max(0, chars(s, id).power);
  const total = attackers.reduce((n, id) => n + power(id), 0);
  const out = new Map(attackers.map((id) => [id, opp as string]));
  if (total < (s.players[opp]?.life ?? 0)) {
    const walkers = attackableDefenders(s, me)
      .filter((d) => !s.players[d])
      .sort((a, b) => (s.objects[b]?.counters.loyalty ?? 0) - (s.objects[a]?.counters.loyalty ?? 0));
    const free = [...attackers].sort(
      (a, b) => Number(hasKeyword(s, b, "flying")) - Number(hasKeyword(s, a, "flying")) || power(b) - power(a),
    );
    for (const w of walkers) {
      let need = s.objects[w]?.counters.loyalty ?? 0;
      while (need > 0 && free.length) {
        const id = free.shift() as string;
        out.set(id, w);
        need -= power(id);
      }
    }
  }
  return attackers.map((id) => ({ id, defender: out.get(id) as string }));
}

/** Complète les blocages pour respecter les exigences « doit être bloquée si possible ». */
export function withRequiredBlocks(
  s: GameState,
  me: PlayerId,
  blocks: { blocker: string; attacker: string }[],
): { blocker: string; attacker: string }[] {
  if (!unmetBlockRequirement(s, me, blocks)) return blocks;
  const req = requiredBlocks(s, me);
  const kept = blocks.filter((b) => !req.some((r) => r.blocker === b.blocker));
  return [...kept, ...req];
}

// ---------------------------------------------------------------------------
// Main de départ
// ---------------------------------------------------------------------------

const isLand = (s: GameState, id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");

function keepHand(s: GameState, me: PlayerId, pr: Profile): boolean {
  const hand = s.players[me]?.hand ?? [];
  const lands = hand.filter((id) => isLand(s, id)).length;
  if (hand.length <= 5) return true;
  if (pr.mulligan === "loose") return lands >= 1 && lands <= 6;
  return lands >= 2 && lands <= (hand.length === 7 ? 5 : 4);
}

/** Les cartes dont on se sépare en premier : terrains en trop, puis sorts les plus chers. */
function worstCards(s: GameState, me: PlayerId, count: number): ObjectId[] {
  const hand = [...(s.players[me]?.hand ?? [])];
  const landsInPlay = s.battlefield.filter((id) => s.objects[id]?.controller === me && isLand(s, id)).length;
  const lands = hand.filter((id) => isLand(s, id)).length;
  const cost = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost ?? null);
  const score = (id: ObjectId) => {
    if (isLand(s, id)) return landsInPlay + lands > 5 ? -1 : 10;
    return 8 - cost(id);
  };
  return hand.sort((a, b) => score(a) - score(b)).slice(0, count);
}

// ---------------------------------------------------------------------------
// Priorité : sorts et capacités par simulation
// ---------------------------------------------------------------------------

export interface ScoredOption {
  decision: Decision;
  /** Évaluation après résolution (simulation à un coup). */
  score: number;
}

/**
 * Options de l'IA à la priorité, évaluées par simulation à un coup. `null` : rien à jouer (hors de ses fenêtres
 * de jeu, ou aucune action). `forced` : décision évidente (un terrain, un renfort global létal).
 */
export function priorityOptions(
  s: GameState,
  me: PlayerId,
  pr: Profile,
): { baseline: number; options: ScoredOption[]; forced?: Decision } | null {
  const top = s.stack[s.stack.length - 1];
  if (top?.controller === me) return null;

  const myTurn = s.turn.active === me;
  const step = s.turn.step;
  const combatWindow = !!s.combat?.attackers.length && (step === "declareBlockers" || step === "firstStrikeDamage");
  const mainPhase = myTurn && (step === "main1" || step === "main2") && !top;
  const response = !!top;
  const opponentEnd = !myTurn && step === "end" && !top;
  // Débutant : ni réponse, ni tour de combat, ni jeu à la fin du tour adverse.
  if (!mainPhase && (!pr.responds || (!combatWindow && !response && !opponentEnd))) return null;

  const actions = legalActions(s, me).filter((a) => a.type === "cast" || a.type === "activate" || a.type === "playLand");
  if (actions.length === 0) return null;

  // Jouer un terrain d'abord.
  const land = actions.find((a) => a.type === "playLand");
  if (land && land.type === "playLand")
    return { baseline: 0, options: [], forced: { type: "playLand", card: land.card, payLife: land.payLife } };

  const until = combatWindow ? afterCombat(s.turn.number) : stackEmpty;
  const opts = { exposure: pr.exposure };
  const pass: Decision = { type: "pass" };
  const afterPass = trySubmit(s, me, pass);
  const baseline = afterPass ? evaluate(rollout(afterPass, until), me, opts) : evaluate(s, me, opts);
  const options: ScoredOption[] = [];
  for (const a of actions) {
    // Renfort global en rituel (Overrun…) : seulement pour une attaque potentiellement létale.
    if (a.type === "cast") {
      const d = s.defs[s.objects[a.card]?.defId ?? ""];
      if (d?.spell?.modes[0]?.effects.some((e) => e.op === "pumpAll")) {
        if (step === "main1" && overrunIsLethal(s, me)) return { baseline, options, forced: { type: "cast", card: a.card } };
        continue;
      }
    }
    // Coûts additionnels : on se sépare d'abord de ce qui a le moins de valeur.
    const rank = (ids: string[]) => [...ids].sort((x, y) => keepValue(s, me, x) - keepValue(s, me, y));
    for (const d of enumerateDecisions(a, 40, rank)) {
      const next = trySubmit(s, me, d);
      if (!next) continue;
      options.push({ decision: d, score: evaluate(rollout(next, until), me, opts) });
    }
  }
  return { baseline, options };
}

export function choosePriority(s: GameState, me: PlayerId, pr: Profile): Decision {
  const pass: Decision = { type: "pass" };
  const found = priorityOptions(s, me, pr);
  if (!found) return pass;
  if (found.forced) return found.forced;
  // Débutant : oublie parfois de jouer.
  if (pr.forgetfulness && pr.rand() < pr.forgetfulness) return pass;
  let best: Decision = pass;
  let bestScore = found.baseline + 0.25;
  /** Options meilleures que passer (le débutant prend parfois l'une d'elles au hasard). */
  const good: Decision[] = [];
  for (const { decision, score } of found.options) {
    if (score > found.baseline + 0.25) good.push(decision);
    if (score > bestScore) {
      bestScore = score;
      best = decision;
    }
  }
  if (pr.sloppiness && good.length > 1 && pr.rand() < pr.sloppiness) return good[Math.floor(pr.rand() * good.length)] as Decision;
  return best;
}

function overrunIsLethal(s: GameState, me: PlayerId): boolean {
  const opp = targetOpponent(s, me);
  const attackers = attackCandidates(s, me);
  if (attackers.length < 2) return false;
  const blockers = creaturesControlledBy(s, opp).filter((id) => !s.objects[id]?.tapped).length;
  const powers = attackers.map((id) => chars(s, id).power + 3).sort((a, b) => b - a);
  const unblocked = powers.slice(blockers).reduce((a, b) => a + b, 0);
  return unblocked >= (s.players[opp]?.life ?? 20);
}

// ---------------------------------------------------------------------------
// Blocages : glouton, par simulation du combat
// ---------------------------------------------------------------------------

export function chooseBlocks(s: GameState, me: PlayerId): { blocker: ObjectId; attacker: ObjectId }[] {
  const cands = blockCandidates(s, me);
  const attackers = [...(s.combat?.attackers ?? [])].sort((a, b) => chars(s, b.id).power - chars(s, a.id).power);
  const until = afterCombat(s.turn.number);
  const simulate = (blocks: { blocker: ObjectId; attacker: ObjectId }[]) => {
    const next = trySubmit(s, me, { type: "declareBlockers", blocks });
    return next ? evaluate(rollout(next, until), me) : Number.NEGATIVE_INFINITY;
  };

  const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
  const used = new Set<ObjectId>();
  let current = simulate(blocks);
  for (const a of attackers) {
    const options = cands.filter((c) => !used.has(c.blocker) && c.attackers.includes(a.id)).map((c) => c.blocker);
    let bestBlock: ObjectId[] | null = null;
    let bestScore = current + 0.05;
    const tries: ObjectId[][] = options.map((b) => [b]);
    // Menace : essayer les paires de bloqueurs.
    if (hasKeyword(s, a.id, "menace")) {
      tries.length = 0;
      for (let i = 0; i < options.length; i++)
        for (let j = i + 1; j < options.length; j++) tries.push([options[i] as ObjectId, options[j] as ObjectId]);
    }
    for (const group of tries) {
      const score = simulate([...blocks, ...group.map((blocker) => ({ blocker, attacker: a.id }))]);
      if (score > bestScore) {
        bestScore = score;
        bestBlock = group;
      }
    }
    if (bestBlock) {
      for (const b of bestBlock) {
        blocks.push({ blocker: b, attacker: a.id });
        used.add(b);
      }
      current = bestScore;
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Attaques : règles de combat
// ---------------------------------------------------------------------------

/** Issue d'un duel attaquant/bloqueur, initiative et contact mortel compris. */
export function duel(s: GameState, a: ObjectId, b: ObjectId): { aDies: boolean; bDies: boolean } {
  const A = chars(s, a);
  const B = chars(s, b);
  const has = (c: typeof A, k: string) => c.keywords.includes(k as never);
  const aFirst = has(A, "firstStrike") || has(A, "doubleStrike");
  const bFirst = has(B, "firstStrike") || has(B, "doubleStrike");
  let aDmg = s.objects[a]?.damage ?? 0;
  let bDmg = s.objects[b]?.damage ?? 0;
  let aDT = false;
  let bDT = false;
  const dead = (dmg: number, dt: boolean, c: typeof A) => !has(c, "indestructible") && (dmg >= c.toughness || (dt && dmg > 0));
  let aDead = false;
  let bDead = false;
  if (aFirst || bFirst) {
    if (aFirst) {
      bDmg += A.power;
      bDT ||= has(A, "deathtouch");
    }
    if (bFirst) {
      aDmg += B.power;
      aDT ||= has(B, "deathtouch");
    }
    aDead = dead(aDmg, aDT, A);
    bDead = dead(bDmg, bDT, B);
  }
  const aDealsAgain = !aDead && !bDead && (!aFirst || has(A, "doubleStrike"));
  const bDealsAgain = !bDead && !aDead && (!bFirst || has(B, "doubleStrike"));
  if (aDealsAgain) {
    bDmg += A.power;
    bDT ||= has(A, "deathtouch");
  }
  if (bDealsAgain) {
    aDmg += B.power;
    aDT ||= has(B, "deathtouch");
  }
  return { aDies: aDead || dead(aDmg, aDT, A), bDies: bDead || dead(bDmg, bDT, B) };
}

function couldBlock(s: GameState, blocker: ObjectId, attacker: ObjectId): boolean {
  if (s.objects[blocker]?.tapped) return false;
  if (hasKeyword(s, attacker, "flying") && !hasKeyword(s, blocker, "flying") && !hasKeyword(s, blocker, "reach")) return false;
  return true;
}

function worth(s: GameState, id: ObjectId): number {
  const o = s.objects[id];
  const d = o && s.defs[o.defId];
  return d ? creatureValue(d, (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0)) : 0;
}

export function chooseAttackers(s: GameState, me: PlayerId): ObjectId[] {
  // On attaque l'adversaire visé ; la contre-attaque peut venir de n'importe quel adversaire.
  const opp = targetOpponent(s, me);
  const cands = attackCandidates(s, me).filter((id) => chars(s, id).power > 0);
  const blockers = creaturesControlledBy(s, opp).filter((id) => !s.objects[id]?.tapped);
  const oppCreatures = opponentsOf(s, me).flatMap((p) => creaturesControlledBy(s, p));
  const oppLife = s.players[opp]?.life ?? 20;
  const myLife = s.players[me]?.life ?? 20;

  // Attaque totale si les dégâts non bloquables suffisent.
  const powers = cands.map((id) => chars(s, id).power).sort((a, b) => b - a);
  const surelyThrough = powers.slice(blockers.length).reduce((a, b) => a + b, 0);
  if (cands.length > 0 && surelyThrough >= oppLife) return cands;

  const attackers = cands.filter((a) => {
    const able = blockers.filter((b) => couldBlock(s, b, a));
    return able.every((b) => {
      const { aDies, bDies } = duel(s, a, b);
      if (!aDies) return true; // au pire, le bloqueur encaisse
      if (bDies) return worth(s, a) <= worth(s, b) * 1.2; // échange acceptable
      return false; // bloqueur qui tue sans mourir
    });
  });

  // Sécurité : garder assez de bloqueurs pour ne pas mourir à la contre-attaque.
  const threat = oppCreatures
    .filter((id) => !hasKeyword(s, id, "defender"))
    .map((id) => chars(s, id).power)
    .sort((a, b) => b - a);
  const exposed = () => {
    const staying = creaturesControlledBy(s, me).filter((id) => !attackers.includes(id) || hasKeyword(s, id, "vigilance")).length;
    return threat.slice(staying).reduce((a, b) => a + b, 0);
  };
  const byValue = [...attackers].sort((a, b) => worth(s, a) - worth(s, b));
  while (attackers.length > 0 && exposed() >= myLife) {
    const drop = byValue.shift();
    if (!drop) break;
    attackers.splice(attackers.indexOf(drop), 1);
  }
  return attackers;
}

// ---------------------------------------------------------------------------
// Débutant : attaques et blocages naïfs
// ---------------------------------------------------------------------------

/**
 * Attaque avec ce qu'aucun bloqueur ne tue sans mourir, plus un peu au hasard ; sans penser à la contre-attaque.
 */
function naiveAttackers(s: GameState, me: PlayerId, pr: Profile): ObjectId[] {
  const opp = targetOpponent(s, me);
  const blockers = creaturesControlledBy(s, opp).filter((id) => !s.objects[id]?.tapped);
  return attackCandidates(s, me).filter((a) => {
    if (chars(s, a).power <= 0) return false;
    const safe = blockers
      .filter((b) => couldBlock(s, b, a))
      .every((b) => {
        const { aDies, bDies } = duel(s, a, b);
        return !aDies || bDies;
      });
    return safe || pr.rand() < 0.3;
  });
}

/**
 * Bloque quand le bloqueur tue l'attaquant sans mourir ; sinon seulement pour ne pas mourir (bloqueurs sacrifiés).
 */
export function naiveBlocks(s: GameState, me: PlayerId): { blocker: ObjectId; attacker: ObjectId }[] {
  const cands = blockCandidates(s, me);
  const attackers = [...(s.combat?.attackers ?? [])].sort((a, b) => chars(s, b.id).power - chars(s, a.id).power);
  const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
  const used = new Set<ObjectId>();
  const free = (a: string) => cands.filter((c) => !used.has(c.blocker) && c.attackers.includes(a)).map((c) => c.blocker);
  for (const a of attackers) {
    const good = free(a.id).find((b) => {
      const { aDies, bDies } = duel(s, a.id, b);
      return aDies && !bDies;
    });
    if (good) {
      blocks.push({ blocker: good, attacker: a.id });
      used.add(good);
    }
  }
  // Attaque létale : on sacrifie les plus petits bloqueurs devant les plus gros attaquants non bloqués.
  const life = s.players[me]?.life ?? 20;
  const unblocked = () =>
    attackers.filter((a) => !blocks.some((b) => b.attacker === a.id)).reduce((n, a) => n + Math.max(0, chars(s, a.id).power), 0);
  for (const a of attackers) {
    if (unblocked() < life) break;
    if (blocks.some((b) => b.attacker === a.id)) continue;
    const chump = free(a.id).sort((x, y) => worth(s, x) - worth(s, y))[0];
    if (chump) {
      blocks.push({ blocker: chump, attacker: a.id });
      used.add(chump);
    }
  }
  return blocks;
}
