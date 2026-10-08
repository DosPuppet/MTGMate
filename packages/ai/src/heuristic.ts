/**
 * Heuristic AI, parameterized by a level profile (profile.ts):
 * - spells and abilities: one-move simulation on a clone of the state, then evaluation of the board;
 * - blocks: greedy search by combat simulation (expert level: search, see combat.ts);
 * - attacks: simple combat rules (duels, lethal all-out attack, defensive safety);
 *   expert level: simulation of the opposing blocks (combat.ts).
 */
import {
  type Agent,
  attackableDefenders,
  attackCandidates,
  blockCandidates,
  chars,
  commanderOf,
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
  preferredDefenders,
  repairAttacks,
  repairBlocks,
} from "@mtgx/engine";
import { heuristicChoice, keepValue } from "./choices";
import { searchAttackers, searchBlocks } from "./combat";
import { afterCombat, creatureValue, evaluate, rollout, stackEmpty, targetOpponent, trySubmit } from "./evaluate";
import { enumerateDecisions } from "./options";
import { MEDIUM_PROFILE, type Profile } from "./profile";

/** Medium-level AI (fuzz, bench, tests). */
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
 * Distribution of the attackers: each opposing planeswalker (the most loaded first) gets just enough power to take it
 * down, starting with the evasive creatures; the rest attacks the player.
 * If the attackers are enough to kill the player, everything goes at the player.
 * Each creature attacks only what it can attack ("can't attack you") and, if it has attack requirements (goad,
 * "attacks that player"), what satisfies the most of them; the declaration is then completed to respect as many
 * requirements as possible (508.1d).
 */
export function chooseDefenders(s: GameState, me: PlayerId, attackers: string[]): { id: string; defender: string }[] {
  const opp = attackTarget(s, me, attackers);
  const power = (id: string) => Math.max(0, chars(s, id).power);
  const total = attackers.reduce((n, id) => n + power(id), 0);
  const preferred = new Map(attackers.map((id) => [id, preferredDefenders(s, id)]));
  // The targeted player if allowed, otherwise the first allowed player, otherwise an allowed planeswalker.
  const fallback = (id: string) => {
    const list = preferred.get(id) ?? [];
    return list.includes(opp) ? opp : (list.find((d) => !!s.players[d]) ?? list[0]);
  };
  const out = new Map<string, string | undefined>(attackers.map((id) => [id, fallback(id)]));
  if (total < (s.players[opp]?.life ?? 0)) {
    const walkers = attackableDefenders(s, me)
      .filter((d) => !s.players[d])
      .sort((a, b) => (s.objects[b]?.counters.loyalty ?? 0) - (s.objects[a]?.counters.loyalty ?? 0));
    const free = [...attackers].sort(
      (a, b) => Number(hasKeyword(s, b, "flying")) - Number(hasKeyword(s, a, "flying")) || power(b) - power(a),
    );
    for (const w of walkers) {
      let need = s.objects[w]?.counters.loyalty ?? 0;
      for (const id of [...free]) {
        if (need <= 0) break;
        if (!preferred.get(id)?.includes(w)) continue;
        free.splice(free.indexOf(id), 1);
        out.set(id, w);
        need -= power(id);
      }
    }
  }
  const decl = attackers.flatMap((id) => {
    const defender = out.get(id);
    return defender ? [{ id, defender }] : [];
  });
  return repairAttacks(s, me, decl);
}

/**
 * Attacked player (multiplayer, PLAN-C C17): the one the attack can kill (lowest life first); otherwise the most
 * threatening one (power on the battlefield, planeswalkers, hand), with low life breaking ties in favor of the one who
 * has the least. In a duel, the only opponent.
 */
function attackTarget(s: GameState, me: PlayerId, attackers: string[]): PlayerId {
  const opps = opponentsOf(s, me);
  if (opps.length <= 1) return opps[0] ?? targetOpponent(s, me);
  const total = attackers.reduce((n, id) => n + Math.max(0, chars(s, id).power), 0);
  const life = (p: PlayerId) => s.players[p]?.life ?? 0;
  // Commander: an attacking commander can finish a player off with its commander damage (21, 704.6c).
  const commanderKills = (p: PlayerId) =>
    attackers.some((id) => {
      const c = commanderOf(s, s.objects[id]);
      return !!c && (c.damage[p] ?? 0) + Math.max(0, chars(s, id).power) >= 21;
    });
  const killable = opps.filter((p) => total >= life(p) || commanderKills(p)).sort((a, b) => life(a) - life(b));
  if (killable[0]) return killable[0];
  const threat = (p: PlayerId) => {
    let t = (s.players[p]?.hand.length ?? 0) * 0.5;
    for (const id of s.battlefield) {
      if (s.objects[id]?.controller !== p) continue;
      const c = chars(s, id);
      if (c.types.includes("Creature")) t += Math.max(0, c.power);
      if (c.types.includes("Planeswalker")) t += 3;
    }
    return t - life(p) / 10;
  };
  return [...opps].sort((a, b) => threat(b) - threat(a))[0] ?? targetOpponent(s, me);
}

/** Completes the blocks to respect as many blocking requirements as possible (509.1c, `repairBlocks`). */
export function withRequiredBlocks(
  s: GameState,
  me: PlayerId,
  blocks: { blocker: string; attacker: string }[],
): { blocker: string; attacker: string }[] {
  return repairBlocks(s, me, blocks);
}

// ---------------------------------------------------------------------------
// Opening hand
// ---------------------------------------------------------------------------

const isLand = (s: GameState, id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");

const BASIC_MANA: Record<string, string> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/** Colors produced by the lands in hand (printed mana abilities, basic land types). */
function landColors(s: GameState, hand: ObjectId[]): Set<string> {
  const out = new Set<string>();
  for (const id of hand.filter((x) => isLand(s, x))) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    for (const ab of d?.abilities ?? []) {
      if (ab.kind === "mana") for (const c of ab.produce) out.add(c);
    }
    // 305.6: a basic land type grants its mana ability (basic lands do not print it).
    for (const t of d?.subtypes ?? []) {
      const c = BASIC_MANA[t];
      if (c) out.add(c);
    }
  }
  return out;
}

function keepHand(s: GameState, me: PlayerId, pr: Profile): boolean {
  const hand = s.players[me]?.hand ?? [];
  const lands = hand.filter((id) => isLand(s, id)).length;
  if (hand.length <= 5) return true;
  if (pr.mulligan === "loose") return lands >= 1 && lands <= 6;
  if (lands < 2 || lands > (hand.length === 7 ? 5 : 4)) return false;
  // Colors (P3): at least one spell in hand whose colored symbols are all produced by its lands.
  const colors = landColors(s, hand);
  const spells = hand.filter((id) => !isLand(s, id));
  if (spells.length === 0) return true;
  // Mana curve (PLAN-C C17): with two lands, a spell of mana value 2 or less; with more, a spell castable on the turn
  // after the last land enters (not a hand of 6-drops with three lands).
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost ?? { generic: 0, colored: {}, x: 0 });
  if (Math.min(...spells.map(mv)) > (lands <= 2 ? 2 : lands + 1)) return false;
  if (colors.size === 0) return true;
  return spells.some((id) => {
    const cost = s.defs[s.objects[id]?.defId ?? ""]?.manaCost;
    return Object.entries(cost?.colored ?? {}).every(([c, n]) => !n || colors.has(c));
  });
}

/** The cards we part with first: extra lands, then the most expensive spells. */
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
// Priority: spells and abilities by simulation
// ---------------------------------------------------------------------------

export interface ScoredOption {
  decision: Decision;
  /** Evaluation after resolution (one-move simulation). */
  score: number;
}

/**
 * Options of the AI at priority, evaluated by one-move simulation. `null`: nothing to play (outside its play windows,
 * or no action). `forced`: obvious decision (a land, a lethal global pump).
 */
export function priorityOptions(
  s: GameState,
  me: PlayerId,
  pr: Profile,
): { baseline: number; options: ScoredOption[]; forced?: Decision } | null {
  const top = s.stack[s.stack.length - 1];
  // "Cast it" during a resolution (608.2g): an offer to evaluate, at every level, even on its own spell.
  const castNow = s.pending?.kind === "priority" && !!s.pending.castNow;
  if (top?.controller === me && !castNow) return null;

  const myTurn = s.turn.active === me;
  const step = s.turn.step;
  const combatWindow = !!s.combat?.attackers.length && (step === "declareBlockers" || step === "firstStrikeDamage");
  const mainPhase = myTurn && (step === "main1" || step === "main2") && !top;
  const response = !!top;
  const opponentEnd = !myTurn && step === "end" && !top;
  // Beginner: no response, no combat trick, no play at the end of the opponent's turn.
  if (!castNow && !mainPhase && (!pr.responds || (!combatWindow && !response && !opponentEnd))) return null;

  const actions = legalActions(s, me).filter((a) => a.type === "cast" || a.type === "activate" || a.type === "playLand");
  if (actions.length === 0) return null;

  // Play a land first.
  const land = actions.find((a) => a.type === "playLand");
  if (land && land.type === "playLand")
    return { baseline: 0, options: [], forced: { type: "playLand", card: land.card, payLife: land.payLife } };

  const until = combatWindow ? afterCombat(s.turn.number) : stackEmpty;
  const opts = { exposure: pr.exposure };
  const pass: Decision = { type: "pass" };
  const afterPass = trySubmit(s, me, pass);
  const baseline = afterPass ? evaluate(rollout(afterPass, until, 60, true), me, opts) : evaluate(s, me, opts);
  const options: ScoredOption[] = [];
  for (const a of actions) {
    // Global power pump as a sorcery (Overrun…): only for a potentially lethal attack. A pump without a power bonus
    // (Flawless Maneuver: indestructible) is evaluated like the other spells.
    if (a.type === "cast") {
      const d = s.defs[s.objects[a.card]?.defId ?? ""];
      const overrun = d?.spell?.modes[0]?.effects.some(
        (e) => e.op === "pump" && e.what.kind === "zone" && (typeof e.power !== "number" || e.power > 0),
      );
      if (overrun) {
        // A way to cast it that can really be paid (normal cost, without paying, alternative cost…).
        const forced =
          step === "main1" && overrunIsLethal(s, me) ? enumerateDecisions(a).find((v) => trySubmit(s, me, v)) : undefined;
        if (forced) return { baseline, options, forced };
        continue;
      }
    }
    // Additional costs: we part first with what has the least value.
    const rank = (ids: string[]) => [...ids].sort((x, y) => keepValue(s, me, x) - keepValue(s, me, y));
    for (const d of enumerateDecisions(a, 40, rank)) {
      const next = trySubmit(s, me, d);
      if (!next) continue;
      options.push({ decision: d, score: evaluate(rollout(next, until, 60, true), me, opts) });
    }
  }
  return { baseline, options };
}

export function choosePriority(s: GameState, me: PlayerId, pr: Profile): Decision {
  const pass: Decision = { type: "pass" };
  const found = priorityOptions(s, me, pr);
  if (!found) return pass;
  if (found.forced) return found.forced;
  // Beginner: sometimes forgets to play.
  if (pr.forgetfulness && pr.rand() < pr.forgetfulness) return pass;
  let best: Decision = pass;
  let bestScore = found.baseline + 0.25;
  /** Options better than passing (the beginner sometimes takes one of them at random). */
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
// Blocks: greedy, by combat simulation
// ---------------------------------------------------------------------------

export function chooseBlocks(s: GameState, me: PlayerId): { blocker: ObjectId; attacker: ObjectId }[] {
  const cands = blockCandidates(s, me);
  const attackers = [...(s.combat?.attackers ?? [])].sort((a, b) => chars(s, b.id).power - chars(s, a.id).power);
  const until = afterCombat(s.turn.number);
  const simulate = (blocks: { blocker: ObjectId; attacker: ObjectId }[]) => {
    const next = trySubmit(s, me, { type: "declareBlockers", blocks });
    return next ? evaluate(rollout(next, until, 60, true), me) : Number.NEGATIVE_INFINITY;
  };

  const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
  const used = new Set<ObjectId>();
  let current = simulate(blocks);
  for (const a of attackers) {
    const options = cands.filter((c) => !used.has(c.blocker) && c.attackers.includes(a.id)).map((c) => c.blocker);
    let bestBlock: ObjectId[] | null = null;
    let bestScore = current + 0.05;
    const tries: ObjectId[][] = options.map((b) => [b]);
    // Menace: try pairs of blockers.
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
// Attacks: combat rules
// ---------------------------------------------------------------------------

/** Outcome of an attacker/blocker duel, first strike and deathtouch included. */
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
  // We attack the targeted opponent; the counterattack can come from any opponent.
  const opp = targetOpponent(s, me);
  const cands = attackCandidates(s, me).filter((id) => chars(s, id).power > 0);
  const blockers = creaturesControlledBy(s, opp).filter((id) => !s.objects[id]?.tapped);
  const oppCreatures = opponentsOf(s, me).flatMap((p) => creaturesControlledBy(s, p));
  const oppLife = s.players[opp]?.life ?? 20;
  const myLife = s.players[me]?.life ?? 20;

  // All-out attack if the unblockable damage is enough.
  const powers = cands.map((id) => chars(s, id).power).sort((a, b) => b - a);
  const surelyThrough = powers.slice(blockers.length).reduce((a, b) => a + b, 0);
  if (cands.length > 0 && surelyThrough >= oppLife) return cands;

  const attackers = cands.filter((a) => {
    const able = blockers.filter((b) => couldBlock(s, b, a));
    return able.every((b) => {
      const { aDies, bDies } = duel(s, a, b);
      if (!aDies) return true; // at worst, the blocker takes it
      if (bDies) return worth(s, a) <= worth(s, b) * 1.2; // acceptable trade
      return false; // blocker that kills without dying
    });
  });

  // Safety: keep enough blockers not to die on the counterattack.
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
// Beginner: naive attacks and blocks
// ---------------------------------------------------------------------------

/**
 * Attacks with what no blocker kills without dying, plus a bit at random; without thinking of the counterattack.
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
 * Blocks when the blocker kills the attacker without dying; otherwise only so as not to die (chump blockers).
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
  // Lethal attack: we chump the biggest unblocked attackers with the smallest blockers.
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
