/**
 * IA heuristique (v1) :
 * - sorts et capacités : simulation à un coup sur un clone de l'état, puis évaluation du plateau ;
 * - blocages : recherche gloutonne par simulation du combat ;
 * - attaques : règles de combat simples (duels, attaque totale létale, sécurité en défense).
 */
import {
  type Agent,
  attackCandidates,
  blockCandidates,
  chars,
  creaturesControlledBy,
  type Decision,
  type GameState,
  hasKeyword,
  legalActions,
  manaValue,
  type ObjectId,
  opponentOf,
  type PlayerId,
} from "@mtgx/engine";
import { afterCombat, creatureValue, evaluate, rollout, stackEmpty, trySubmit } from "./evaluate";
import { enumerateDecisions } from "./options";

export function heuristicAgent(): Agent {
  return (s, me) => decide(s, me);
}

function decide(s: GameState, me: PlayerId): Decision {
  const p = s.pending;
  switch (p?.kind) {
    case "mulligan":
      return keepHand(s, me) || p.mulligans >= 2 ? { type: "keep" } : { type: "mulligan" };
    case "bottomCards":
      return { type: "bottom", cards: worstCards(s, me, p.count) };
    case "discard":
      return { type: "discard", cards: worstCards(s, me, p.count) };
    case "declareAttackers":
      return { type: "declareAttackers", attackers: chooseAttackers(s, me).map((id) => ({ id, defender: opponentOf(s, me) })) };
    case "declareBlockers":
      return { type: "declareBlockers", blocks: chooseBlocks(s, me) };
    case "priority":
      return choosePriority(s, me);
    default:
      return { type: "pass" };
  }
}

// ---------------------------------------------------------------------------
// Main de départ
// ---------------------------------------------------------------------------

const isLand = (s: GameState, id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");

function keepHand(s: GameState, me: PlayerId): boolean {
  const hand = s.players[me]?.hand ?? [];
  const lands = hand.filter((id) => isLand(s, id)).length;
  if (hand.length <= 5) return true;
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

function choosePriority(s: GameState, me: PlayerId): Decision {
  const pass: Decision = { type: "pass" };
  const top = s.stack[s.stack.length - 1];
  if (top?.controller === me) return pass;

  const myTurn = s.turn.active === me;
  const step = s.turn.step;
  const combatWindow = !!s.combat?.attackers.length && (step === "declareBlockers" || step === "firstStrikeDamage");
  const mainPhase = myTurn && (step === "main1" || step === "main2") && !top;
  const response = !!top;
  const opponentEnd = !myTurn && step === "end" && !top;
  if (!mainPhase && !combatWindow && !response && !opponentEnd) return pass;

  const actions = legalActions(s, me).filter((a) => a.type === "cast" || a.type === "activate" || a.type === "playLand");
  if (actions.length === 0) return pass;

  // Jouer un terrain d'abord.
  const land = actions.find((a) => a.type === "playLand");
  if (land && land.type === "playLand") return { type: "playLand", card: land.card };

  const until = combatWindow ? afterCombat(s.turn.number) : stackEmpty;
  const afterPass = trySubmit(s, me, pass);
  const baseline = afterPass ? evaluate(rollout(afterPass, until), me) : evaluate(s, me);

  let best: Decision = pass;
  let bestScore = baseline + 0.25;
  for (const a of actions) {
    // Renfort global en rituel (Overrun…) : seulement pour une attaque potentiellement létale.
    if (a.type === "cast") {
      const d = s.defs[s.objects[a.card]?.defId ?? ""];
      if (d?.spell?.modes[0]?.effects.some((e) => e.op === "pumpAll")) {
        if (step === "main1" && overrunIsLethal(s, me)) return { type: "cast", card: a.card };
        continue;
      }
    }
    for (const d of enumerateDecisions(a)) {
      const next = trySubmit(s, me, d);
      if (!next) continue;
      const score = evaluate(rollout(next, until), me);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
  }
  return best;
}

function overrunIsLethal(s: GameState, me: PlayerId): boolean {
  const opp = opponentOf(s, me);
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

function chooseBlocks(s: GameState, me: PlayerId): { blocker: ObjectId; attacker: ObjectId }[] {
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
  return d ? creatureValue(d, o.counters.p1p1 - o.counters.m1m1) : 0;
}

function chooseAttackers(s: GameState, me: PlayerId): ObjectId[] {
  const opp = opponentOf(s, me);
  const cands = attackCandidates(s, me).filter((id) => chars(s, id).power > 0);
  const oppCreatures = creaturesControlledBy(s, opp);
  const blockers = oppCreatures.filter((id) => !s.objects[id]?.tapped);
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
