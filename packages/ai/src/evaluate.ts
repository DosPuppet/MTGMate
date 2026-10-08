/**
 * Evaluation of a position from a player's point of view, and simulation by cloning the state.
 *
 * Creatures are valued from their **lasting** characteristics: those on the battlefield, without the "until end of
 * turn" effects. An Aura (Pacifism), an Equipment or a permanent pump therefore count through their effect on the
 * creature; a temporary pump counts only through what it changes in combat.
 */
import {
  applyMutable,
  type CardDef,
  type Characteristics,
  chars,
  cloneState,
  commanderOf,
  computeBattlefield,
  type Decision,
  fallbackDecision,
  type GameState,
  type ObjectId,
  opponentsOf,
  type PlayerId,
  RulesError,
  submit,
  untapStepRule,
} from "@mtgx/engine";

// ---------------------------------------------------------------------------
// Creature value
// ---------------------------------------------------------------------------

type Profile = Pick<Characteristics, "power" | "toughness" | "keywords" | "abilities">;

/** A creature that does not untap during its controller's untap step (Claustrophobia, Mana Vault…). */
export function staysTapped(s: GameState, id: ObjectId): boolean {
  return untapStepRule(s, id) === true;
}

/**
 * Value of a creature: an offensive part (power, evasion) and a defensive part (toughness, blocking).
 * "Can't attack" cancels the first, "can't block" most of the second (Pacifism: both).
 * `stuck`: it does not untap during its controller's untap step (`staysTapped`).
 */
export function profileValue(c: Profile, stuck = false): number {
  const p = Math.max(0, c.power);
  const t = c.toughness;
  if (t <= 0) return 0;
  const k = new Set(c.keywords);
  let offense = p * 0.6;
  if (k.has("flying")) offense += 0.4 + p * 0.3;
  if (k.has("unblockable")) offense += p * 0.4;
  if (k.has("menace")) offense += p * 0.15;
  if (k.has("trample")) offense += p * 0.1;
  if (k.has("doubleStrike")) offense += p * 0.6;
  if (k.has("lifelink")) offense += p * 0.25;
  if (k.has("deathtouch")) offense += 0.5;
  let defense = t * 0.4;
  if (k.has("deathtouch")) defense += 0.5;
  if (k.has("firstStrike")) defense += 0.3 + p * 0.1;
  if (k.has("reach")) defense += 0.2;
  if (k.has("vigilance")) defense += 0.3;
  const cantAttack = (k.has("cantAttack") || k.has("defender")) && !k.has("attacksDespiteDefender");
  if (cantAttack) offense = 0;
  if (k.has("cantBlock")) defense *= 0.2;
  let v = 0.5 + offense + defense;
  if (k.has("hexproof")) v += 0.6;
  if (k.has("indestructible")) v += 1.5;
  if (stuck) v *= 0.4;
  for (const a of c.abilities) v += a.kind === "mana" ? 0.6 : 0.4;
  return v;
}

/** Value of a creature from its definition (card in hand, in the graveyard…) and its +1/+1 counters. */
export function creatureValue(d: CardDef, counters = 0): number {
  return profileValue({
    power: (d.power ?? 0) + counters,
    toughness: (d.toughness ?? 0) + counters,
    keywords: d.keywords,
    abilities: d.abilities,
  });
}

/**
 * Lasting characteristics on the battlefield: without the "until end of turn" effects.
 * Without a temporary effect (the usual case), they are the engine's cached characteristics.
 */
export function durableChars(s: GameState): (id: ObjectId) => Characteristics {
  if (!s.effects.some((e) => e.duration === "endOfTurn")) return (id) => chars(s, id);
  const map = computeBattlefield({ ...s, effects: s.effects.filter((e) => e.duration !== "endOfTurn") });
  return (id) => map.get(id) ?? chars(s, id);
}

/** Value of life: each point counts more when one is low. */
export function lifeValue(life: number): number {
  return life <= 0 ? -1000 : 8 * Math.log(1 + life);
}

/**
 * "Effective" life (Commander, PLAN-E): life, reduced in proportion to the combat damage received from the most
 * threatening commander (21 kill, 704.6c); without commander damage, the life total.
 */
export function effectiveLife(s: GameState, p: PlayerId): number {
  const life = s.players[p]?.life ?? 0;
  if (!s.commander) return life;
  let worst = 0;
  for (const c of Object.values(s.commander.cards)) worst = Math.max(worst, c.damage[p] ?? 0);
  return worst > 0 ? (life * Math.max(0, 21 - worst)) / 21 : life;
}

/**
 * Commander (PLAN-E): a commander waiting in the command zone is a threat that is always available; it is worth a bit
 * less than once in play, and all the less as its tax is high.
 */
function commandZoneValue(s: GameState, p: PlayerId): number {
  let v = 0;
  for (const id of s.players[p]?.command ?? []) {
    const o = s.objects[id];
    const c = commanderOf(s, o);
    const d = o ? s.defs[o.defId] : undefined;
    if (c && d) v += (0.6 * creatureValue(d)) / (1 + c.casts / 2);
  }
  return v;
}

/**
 * Value of a card in hand: a potential. A permanent is worth less in hand than once in play (where it acts);
 * an instant or a sorcery keeps its flexibility until the right moment.
 */
function handCardValue(d: CardDef): number {
  if (d.types.includes("Land")) return 0.3;
  if (d.types.includes("Instant") || d.types.includes("Sorcery")) return 1.5;
  return 0.7;
}

/**
 * Opponent targeted first: the lowest in life (on a tie, the most threatening on the board).
 * In a duel, it is simply the opponent.
 */
export function targetOpponent(s: GameState, me: PlayerId): PlayerId {
  const opps = opponentsOf(s, me);
  const power = (p: PlayerId) =>
    s.battlefield.reduce((n, id) => {
      const o = s.objects[id];
      return o?.controller === p ? n + (s.defs[o.defId]?.power ?? 0) : n;
    }, 0);
  return [...opps].sort((a, b) => effectiveLife(s, a) - effectiveLife(s, b) || power(b) - power(a))[0] ?? me;
}

// ---------------------------------------------------------------------------
// Opposing threat next turn (expert level)
// ---------------------------------------------------------------------------

/**
 * Damage the opponents can deal to `me` on their next attack, given the blockers `me` will have (its untapped
 * creatures: those that attacked stay tapped until its next turn).
 * Simple estimate: flying creatures get through if `me` has neither flying nor reach; each blocker stops
 * one of the biggest remaining attackers.
 */
export function incomingDamage(s: GameState, me: PlayerId, dc = durableChars(s)): number {
  const creatures = (p: PlayerId) =>
    s.battlefield.filter((id) => s.objects[id]?.controller === p && dc(id).types.includes("Creature"));
  const blockers = creatures(me).filter((id) => !s.objects[id]?.tapped && !dc(id).keywords.includes("cantBlock"));
  const airBlockers = blockers.filter((id) => dc(id).keywords.some((k) => k === "flying" || k === "reach")).length;
  const ground: number[] = [];
  let air = 0;
  for (const p of opponentsOf(s, me)) {
    for (const id of creatures(p)) {
      const k = dc(id).keywords;
      if ((k.includes("cantAttack") || k.includes("defender")) && !k.includes("attacksDespiteDefender")) continue;
      if (s.objects[id]?.tapped && staysTapped(s, id)) continue;
      const dmg = Math.max(0, dc(id).power) * (k.includes("doubleStrike") ? 2 : 1);
      if (dmg === 0) continue;
      if (k.includes("unblockable") || (k.includes("flying") && airBlockers === 0)) air += dmg;
      else ground.push(dmg);
    }
  }
  ground.sort((a, b) => b - a);
  return air + ground.slice(blockers.length).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvalOptions {
  /** Take the opposing counterattack into account (during one's own turn). */
  exposure?: boolean;
}

/**
 * Evaluation from the point of view of `me`. In multiplayer, each opponent weighs 1/n:
 * weakening a single opponent counts less than winning oneself. In a duel, nothing changes.
 */
export function evaluate(s: GameState, me: PlayerId, opts: EvalOptions = {}): number {
  const mine = s.players[me];
  if (!mine) return 0;
  if (s.over) return s.winner === me ? 1e6 : -1e6 + mine.life * 100;
  if (mine.lost) return -1e6 + mine.life * 100;
  const opps = opponentsOf(s, me);
  const w = 1 / Math.max(1, opps.length);
  let score = lifeValue(effectiveLife(s, me));
  for (const p of opps) score -= w * lifeValue(effectiveLife(s, p));
  if (s.commander) {
    score += commandZoneValue(s, me);
    for (const p of opps) score -= w * commandZoneValue(s, p);
  }

  const dc = durableChars(s);
  const lands: Record<PlayerId, number> = {};
  for (const id of s.battlefield) {
    const o = s.objects[id];
    if (!o) continue;
    const c = dc(id);
    const sign = c.controller === me ? 1 : -w;
    let v: number;
    if (c.types.includes("Creature")) v = profileValue(c, staysTapped(s, id));
    // Planeswalker: worth all the more as it has loyalty (a source of advantage every turn).
    else if (c.types.includes("Planeswalker")) v = 3 + (o.counters.loyalty ?? 0) * 0.9;
    else if (c.types.includes("Land")) {
      // Beyond 7 lands, one more land brings little.
      lands[c.controller] = (lands[c.controller] ?? 0) + 1;
      v = (lands[c.controller] ?? 0) > 7 ? 0.4 : 1;
    }
    // Equipment: a value of its own, attached or not (it can change bearer); its effect shows on the equipped
    // creature. Attached Aura: its value shows on its host (it goes away with it).
    else if (c.subtypes.includes("Equipment")) v = 1.1;
    else if (o.attachedTo) v = 0.3;
    else v = 1 + Math.min(1, c.abilities.length * 0.3);
    score += sign * v;
  }
  // Emblems: lasting advantage (tokens of the command zone; a waiting commander is not one).
  const emblems = (p: string) => (s.players[p]?.command ?? []).filter((id) => s.objects[id]?.isToken).length;
  score += emblems(mine.id) * 8;
  for (const p of opps) score -= w * emblems(p) * 8;
  for (const id of mine.hand) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (d) score += handCardValue(d);
  }
  for (const p of opps) score -= w * (s.players[p]?.hand.length ?? 0) * 1.1;
  if (mine.library.length === 0) score -= 5;

  if (opts.exposure && s.turn.active === me) {
    // What the counterattack would cost: half of the life loss (the opponent may not attack),
    // but a lethal counterattack is very heavily penalized.
    const dmg = incomingDamage(s, me, dc);
    if (dmg > 0) score -= dmg >= mine.life ? 40 : 0.5 * (lifeValue(mine.life) - lifeValue(mine.life - dmg));
  }
  return score;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Only illegal decisions (RulesError) are expected in a simulation: any other error is an engine bug and goes up
 * (the fuzz sees it; in a game, GameHost falls back on the default decision).
 */
export function onlyRulesErrors(e: unknown): void {
  if (!(e instanceof RulesError)) throw e;
}

export function trySubmit(s: GameState, player: PlayerId, d: Decision): GameState | null {
  try {
    return submit(s, player, d).state;
  } catch (e) {
    onlyRulesErrors(e);
    return null;
  }
}

/**
 * Everybody passes until `until` is true, or a decision other than priority appears. `owned`: `s` is already a
 * working copy the caller does not read again (result of `trySubmit`), changed in place.
 */
export function rollout(s: GameState, until: (s: GameState) => boolean, max = 60, owned = false): GameState {
  if (s.over || s.pending?.kind !== "priority" || until(s)) return s;
  // A single copy, then we mutate the working copy: passing is always legal.
  const cur = owned ? s : cloneState(s);
  for (let i = 0; i < max && !cur.over && cur.pending?.kind === "priority" && !until(cur); i++) {
    applyMutable(cur, cur.pending.player, { type: "pass" });
  }
  return cur;
}

/**
 * Applies a decision in a simulation. Passing (always legal, and by far the most frequent) changes the working copy
 * in place; any other decision goes through `submit`, which works on a copy: if it is illegal, the exception leaves
 * `cur` intact (`applyMutable` is not transactional).
 * `owned`: `cur` is already a working copy that may be changed.
 */
export function step(cur: GameState, player: PlayerId, d: Decision, owned: boolean): GameState {
  if (d.type === "pass" && owned) {
    applyMutable(cur, player, d);
    return cur;
  }
  return submit(cur, player, d).state;
}

/**
 * Like `rollout`, but each decision gets the default answer (pass, suggested choice, required blocks…):
 * the simulation goes through the resolution and combat choices (damage assignment, trigger targets).
 */
export function simulate(s: GameState, until: (s: GameState) => boolean, max = 120): GameState {
  if (s.over || !s.pending || until(s)) return s;
  let cur = cloneState(s);
  for (let i = 0; i < max && !cur.over && cur.pending && !until(cur); i++) {
    try {
      cur = step(cur, cur.pending.player, fallbackDecision(cur, cur.pending), true);
    } catch (e) {
      onlyRulesErrors(e);
      break;
    }
  }
  return cur;
}

export const stackEmpty = (s: GameState) => s.stack.length === 0;

export function afterCombat(turn: number) {
  return (s: GameState) =>
    s.stack.length === 0 && (s.turn.number !== turn || ["endCombat", "main2", "end", "cleanup"].includes(s.turn.step));
}
