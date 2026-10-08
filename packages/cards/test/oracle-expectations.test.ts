/**
 * Expectations deduced from the Oracle text (audit P1, step 7): the smoke test checks that a card can be played without crashing;
 * here, for instants and sorceries with simple text ("~ deals 3 damage to any target.", "Draw two cards."...), we
 * cast the card and check its effect. Cards with compound text are not covered.
 */
import { type CardDef, chars, dsl, type GameState, legalActions, RulesError, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { destroy, gainLife, loseLife } from "../../engine/src/actions";
import { act, customCard, idsOf, passAccepting, scenario } from "../../engine/test/helpers";
import { paragraphs, stripReminder } from "../src/audit";
import { implementedCards } from "../src/index";

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const n = (w: string) => (/^\d+$/.test(w) ? Number(w) : (NUM[w.toLowerCase()] ?? Number.NaN));

/** An expectation: the target to choose and what must have changed. */
type TargetKind = "opponent" | "opponentCreature" | "myCreature" | "myGraveyardCreature";
interface Expectation {
  target?: TargetKind;
  /** Several targets of different kinds, in text order ("target creature you control ... target creature an opponent controls"). */
  targets?: TargetKind[];
  check: (before: GameState, after: GameState) => void;
  /** Interleaved condition (603.4, "if you attacked this turn"): the setup fulfills it, then checks it absent. */
  condition?: Condition603;
}

/** Supported interleaved conditions, and how the setup fulfills them. */
const CONDITIONS = {
  "you attacked this turn": (s: GameState) => {
    s.turnLog.push({ e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: [] });
  },
  "a creature died this turn": (s: GameState) => {
    destroy(s, idsOf(s, "p1", "battlefield", EXTRA)[0] as string);
  },
  "you gained or lost life this turn": (s: GameState) => {
    gainLife(s, "p1", 1);
  },
  "you control two or more tapped creatures": (s: GameState) => {
    for (const id of idsOf(s, "p1", "battlefield", EXTRA)) (s.objects[id] as { tapped: boolean }).tapped = true;
  },
  "a nonland permanent left the battlefield this turn or a spell was warped this turn": (s: GameState) => {
    destroy(s, idsOf(s, "p1", "battlefield", EXTRA)[0] as string);
  },
  "you gained life this turn": (s: GameState) => {
    gainLife(s, "p1", 1);
  },
  "an opponent lost life this turn": (s: GameState) => {
    loseLife(s, "p2", 1);
  },
  // Fifteen lands in the setup: always fulfilled.
  "you control six or more lands": (_s: GameState) => {},
  // Nothing is cast in the setup: always fulfilled, never "unfulfilled".
  "you haven't cast a spell from your hand this turn": (_s: GameState) => {},
} as const;
type Condition603 = keyof typeof CONDITIONS;
/** Two extra creatures for the conditions (dying, being tapped). */
const EXTRA = "Llanowar Elves";

const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => [l, l, l]);
// Reference creatures: a big opposing creature (damage without killing it), a creature of yours (reinforcements).
const BIG = "Gigantosaurus";
const MINE = "Bear Cub";
const life = (s: GameState, p: string) => s.players[p]?.life ?? 0;
const handSize = (s: GameState) => s.players.p1?.hand.length ?? 0;
/** Name of the creature whose trigger is checked ("this creature"), set by the setup. */
let selfName = "";
/** Cards taken out of the hand by the setup (1: the cast card; 0: trigger of a card already in play). */
let castShift = 1;
const tokenCount = (s: GameState) => s.battlefield.filter((id) => s.objects[id]?.isToken).length;
const big = (s: GameState) => idsOf(s, "p2", "battlefield", BIG)[0];
const mine = (s: GameState) => idsOf(s, "p1", "battlefield", MINE)[0] as string;
/** Creature card in your graveyard (returns from the graveyard). */
const DEAD = "Savannah Lions";
const deadCard = (s: GameState) => idsOf(s, "p1", "graveyard", DEAD)[0];
const count = (s: GameState, zone: "battlefield" | "graveyard" | "hand", name: string) => idsOf(s, "p1", zone, name).length;

const KEYWORDS: Record<string, string> = {
  trample: "trample",
  "first strike": "firstStrike",
  "double strike": "doubleStrike",
  reach: "reach",
  hexproof: "hexproof",
  indestructible: "indestructible",
  deathtouch: "deathtouch",
  vigilance: "vigilance",
  flying: "flying",
  lifelink: "lifelink",
  haste: "haste",
  menace: "menace",
};
const keywordList = (s: string) =>
  s
    .split(/, and |, | and /)
    .map((k) => KEYWORDS[k.trim()])
    .filter((k): k is string => !!k);

type Clause = Expectation | "ok";

/** A recognized sentence: its target and its check; "ok": recognized without a check; null: unknown. */
function clause(t: string): Clause | null {
  let m = /^~ deals (\d+) damage to (?:any target|target (?:player|opponent)(?: or planeswalker)?|each opponent)\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    const each = t.includes("each opponent");
    return { target: each ? undefined : "opponent", check: (b, a) => expect(life(b, "p2") - life(a, "p2")).toBe(d) };
  }
  m = /^~ deals (\d+) damage to you\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    return { check: (b, a) => expect(life(b, "p1") - life(a, "p1")).toBe(d) };
  }
  m = /^~ deals (\d+) damage to target creature(?: or planeswalker)?\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    return { target: "opponentCreature", check: (_b, a) => expect(a.objects[big(a) ?? ""]?.damage).toBe(d) };
  }
  // Opponent life loss (and life gain): "Each opponent loses 2 life and you gain 2 life."
  m = /^(Each|Target) opponent loses (\d+) life(?: and you gain (\d+) life)?\.$/.exec(t);
  if (m) {
    const [lose, gain] = [Number(m[2]), m[3] ? Number(m[3]) : 0];
    return {
      target: m[1] === "Target" ? "opponent" : undefined,
      check: (b, a) => {
        expect(life(b, "p2") - life(a, "p2")).toBe(lose);
        expect(life(a, "p1") - life(b, "p1")).toBe(gain);
      },
    };
  }
  m = /^(?:Each|Target) opponent discards (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return {
      target: t.startsWith("Target") ? "opponent" : undefined,
      check: (b, a) => expect((b.players.p2?.hand.length ?? 0) - (a.players.p2?.hand.length ?? 0)).toBe(k),
    };
  }
  m = /^Mill (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return { check: (b, a) => expect((b.players.p1?.library.length ?? 0) - (a.players.p1?.library.length ?? 0)).toBe(k) };
  }
  // Loot: "Draw a card, then discard a card." (the hand keeps its size, minus the cast card).
  m = /^Draw (\w+) cards?, then discard (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string) - n(m[2] as string);
    return { check: (b, a) => expect(handSize(a) - (handSize(b) - castShift)).toBe(k) };
  }
  // On the creature carrying the trigger ("put a +1/+1 counter on this creature").
  m = /^Put (\w+) \+1\/\+1 counters? on (?:this creature|~)\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    const self = (s: GameState) => idsOf(s, "p1", "battlefield", selfName)[0] ?? "";
    return {
      check: (b, a) =>
        expect((a.objects[self(a)]?.counters["+1/+1"] ?? 0) - (b.objects[self(b)]?.counters["+1/+1"] ?? 0)).toBe(k),
    };
  }
  m = /^Put (\w+) \+1\/\+1 counters? on target creature(?: you control)?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return {
      target: "myCreature",
      check: (b, a) =>
        expect((a.objects[mine(a)]?.counters["+1/+1"] ?? 0) - (b.objects[mine(b)]?.counters["+1/+1"] ?? 0)).toBe(k),
    };
  }
  if (/^Gain control of target creature until end of turn\.$/.test(t))
    return {
      target: "opponentCreature",
      check: (_b, a) => expect(a.objects[idsOf(a, "p1", "battlefield", BIG)[0] ?? ""]).toBeDefined(),
    };
  // "Surveil 2, then draw two cards." (surveil doesn't change the hand).
  m = /^(?:Surveil \d+, then )?[Dd]raw (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    // The cast card left the hand.
    return { check: (b, a) => expect(handSize(a) - (handSize(b) - castShift)).toBe(k) };
  }
  m = /^You gain (\d+) life\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return { check: (b, a) => expect(life(a, "p1") - life(b, "p1")).toBe(k) };
  }
  m = /^Create (\w+) (?:tapped )?(?:\d+\/\d+ [^.]*?creature|[A-Z][a-z]+) tokens?(?: with [a-z ,]+)?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return { check: (b, a) => expect(tokenCount(a) - tokenCount(b)).toBe(k) };
  }
  // "Target creature [you control] gets ±N/±N [and gains ...] until end of turn."
  m =
    /^(Target creature(?: you control| an opponent controls)?|Creatures you control) gets? ([+-])(\d+)\/([+-])(\d+)(?: and gains? ([a-z ,]+?))? until end of turn\.$/.exec(
      t,
    );
  if (m) {
    const sign = (x: string) => (x === "-" ? -1 : 1);
    // "-1/-0": no -0 (toBe distinguishes -0 from 0).
    const p = sign(m[2] as string) * Number(m[3]) || 0;
    const q = sign(m[4] as string) * Number(m[5]) || 0;
    const kws = m[6] ? keywordList(m[6]) : [];
    const hostile = p < 0 || q < 0;
    const all = m[1] === "Creatures you control";
    if (hostile && all) return null;
    const who = (s: GameState) => (hostile ? (big(s) as string) : mine(s));
    return {
      target: all ? undefined : hostile ? "opponentCreature" : "myCreature",
      check: (b, a) => {
        // Toughness reduced to 0 or less: the creature is dead (704.5f).
        if (hostile && !big(a)) return expect(chars(b, who(b)).toughness + q).toBeLessThanOrEqual(0);
        expect(chars(a, who(a)).power - chars(b, who(b)).power).toBe(p);
        expect(chars(a, who(a)).toughness - chars(b, who(b)).toughness).toBe(q);
        for (const k of kws) expect(chars(a, who(a)).keywords).toContain(k);
      },
    };
  }
  m = /^Target creature(?: you control)? gains ([a-z ,]+?) until end of turn\.$/.exec(t);
  if (m) {
    const kws = keywordList(m[1] as string);
    return {
      target: "myCreature",
      check: (_b, a) => {
        for (const k of kws) expect(chars(a, mine(a)).keywords).toContain(k);
      },
    };
  }
  if (
    /^(?:Destroy|Exile) target (?:creature|creature or planeswalker|nonland permanent|creature or enchantment|permanent|nonland permanent an opponent controls|creature an opponent controls)\.$/.test(
      t,
    )
  )
    return { target: "opponentCreature", check: (_b, a) => expect(big(a)).toBeUndefined() };
  if (/^Return target (?:creature|nonland permanent) to its owner's hand\.$/.test(t))
    return {
      target: "opponentCreature",
      check: (_b, a) => expect(a.players.p2?.hand.some((id) => a.defs[a.objects[id]?.defId ?? ""]?.name === BIG)).toBe(true),
    };
  // "Return target card from your graveyard to your hand." (Auroral Procession): the setup targets the creature.
  // "Return up to two target creature cards...": the setup targets only one.
  m =
    /^Return (?:target (?:creature )?card|up to (?:two|three) target creature cards) from your graveyard to (your hand|the battlefield)\.$/.exec(
      t,
    );
  if (m) {
    const zone = m[1] === "your hand" ? "hand" : "battlefield";
    return {
      target: "myGraveyardCreature",
      check: (b, a) => {
        expect(count(b, "graveyard", DEAD) - count(a, "graveyard", DEAD)).toBe(1);
        expect(count(a, zone, DEAD) - count(b, zone, DEAD)).toBe(1);
      },
    };
  }
  // Investigate (701.16): a Clue token.
  if (/^Investigate\.$/.test(t)) return { check: (b, a) => expect(tokenCount(a) - tokenCount(b)).toBe(1) };
  // "Target creature you control deals damage equal to its power to target creature an opponent controls."
  if (
    /^Target creature you control deals damage equal to its power to target creature (?:an opponent controls|or planeswalker you don't control)\.$/.test(
      t,
    )
  )
    return {
      targets: ["myCreature", "opponentCreature"],
      check: (_b, a) => expect(a.objects[big(a) ?? ""]?.damage).toBe(chars(a, mine(a)).power),
    };
  if (/^Tap target creature(?: an opponent controls)?\.$/.test(t))
    return { target: "opponentCreature", check: (_b, a) => expect(a.objects[big(a) ?? ""]?.tapped).toBe(true) };
  m = /^(Each|Target) opponent mills (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[2] as string);
    return {
      target: m[1] === "Target" ? "opponent" : undefined,
      check: (b, a) => expect((b.players.p2?.library.length ?? 0) - (a.players.p2?.library.length ?? 0)).toBe(k),
    };
  }
  m = /^You lose (\d+) life\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    return { check: (b, a) => expect(life(b, "p1") - life(a, "p1")).toBe(k) };
  }
  m = /^~ deals (\d+) damage to each creature\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    return {
      check: (b, a) => {
        const id = big(a);
        if (id) expect(a.objects[id]?.damage).toBe(d);
        else expect(chars(b, big(b) as string).toughness).toBeLessThanOrEqual(d);
      },
    };
  }
  if (/^Destroy all creatures\.$/.test(t))
    return { check: (_b, a) => expect(a.battlefield.filter((id) => chars(a, id).types.includes("Creature"))).toEqual([]) };
  // Sentences recognized without a check of their own (side effect, or already covered by the previous sentence).
  if (
    /^(?:Untap it|Untap that creature|Scry \d+|Surveil \d+|It gains haste until end of turn|If that (?:creature|creature or planeswalker) would die this turn, exile it instead)\.$/.test(
      t,
    )
  )
    return "ok";
  return null;
}

/** Expectation for a simple text (all sentences recognized, a single kind of target), or null. */
export function expectationFor(text: string, name: string): Expectation | null {
  // "Max speed —": a condition without "if" in the text (other ability words are followed by an explicit "if").
  if (/^Max speed — /m.test(text)) return null;
  const t = stripReminder(text.replaceAll(name, "~")).replace(/^This spell/, "~");
  if (t.includes("\n")) return null;
  const parts = t
    .split(/(?<=\.)\s+/)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .map(clause);
  if (parts.some((x) => x === null)) return null;
  const real = parts.filter((x): x is Expectation => !!x && x !== "ok");
  const targets = [...new Set(real.map((x) => x.target).filter(Boolean))];
  if (real.length === 0 || targets.length > 1) return null;
  // Multiple targets: only if it is the only checked sentence.
  const multi = real.find((x) => x.targets);
  if (multi && (real.length > 1 || targets.length > 0)) return null;
  return {
    target: targets[0],
    targets: multi?.targets,
    check: (b, a) => {
      for (const x of real) x.check(b, a);
    },
  };
}

/**
 * Creature whose only ability (besides keywords) is "When this creature enters, ...": the expectation of that sentence.
 * "it deals" becomes "~ deals", the first letter is capitalized.
 */
export function enterExpectationFor(text: string, name: string): Expectation | null {
  return triggerExpectationFor(text, name, "enters");
}

/** Checked triggers: entering, dying, attacking of the creature itself. */
export type TriggerKind = "enters" | "dies" | "attacks" | "endStep" | "upkeep";
const TRIGGER_RE: Record<TriggerKind, RegExp> = {
  enters: /^When (?:this creature|~) enters, (.*)$/,
  dies: /^When (?:this creature|~) dies, (.*)$/,
  attacks: /^Whenever (?:this creature|~) attacks, (.*)$/,
  endStep: /^At the beginning of your end step, (?:if ([^,]+), )?(.*)$/,
  upkeep: /^At the beginning of your upkeep, (?:if ([^,]+), )?(.*)$/,
};

/**
 * Creature whose only ability (besides keywords) is a trigger of this kind: the expectation of its sentence.
 * "it deals" becomes "~ deals", the first letter is capitalized.
 */
export function triggerExpectationFor(text: string, name: string, kind: TriggerKind): Expectation | null {
  if (/^Max speed — /m.test(text)) return null;
  const paras = paragraphs(text.replaceAll(name, "~"), false).filter((p) => p.kind !== "keywords");
  // Entering and dying: a single ability (a static would change the measurements by appearing or disappearing).
  // Attacking, end step, upkeep: the creature is in play before and after; its statics and activated abilities
  // do not skew the differences, but another trigger could fire too.
  const trigs = paras.filter((p) => p.kind === "triggered");
  const others = paras.filter((p) => p.kind !== "triggered");
  const alone = kind === "enters" || kind === "dies" ? paras.length === 1 : others.every((p) => p.kind !== "spell");
  const only = trigs.length === 1 && alone ? trigs[0] : undefined;
  const m = only ? TRIGGER_RE[kind].exec(only.text) : null;
  if (!m) return null;
  // End step, upkeep: optional interleaved condition (group 1), effect (group 2).
  const phased = kind === "endStep" || kind === "upkeep";
  const cond = phased ? m[1] : undefined;
  if (cond !== undefined && !(cond in CONDITIONS)) return null;
  const rest = ((phased ? m[2] : m[1]) as string).replace(/^(?:it|this creature) deals/, "~ deals");
  const e = expectationFor(rest.charAt(0).toUpperCase() + rest.slice(1), "~");
  // Multiple targets of a trigger: the setup can only give one.
  if (e?.targets) return null;
  return e && cond ? { ...e, condition: cond as Condition603 } : e;
}

/** Passes priority until a trigger waits (stack, or target question), without leaving the turn. */
function passUntilTrigger(s0: GameState, step: "end" | "upkeep"): GameState {
  let s = s0;
  const reached = (x: GameState) => x.turn.step === step && x.turn.active === "p1";
  for (let i = 0; i < 30 && s.pending?.kind === "priority" && !(reached(s) && s.stack.length > 0); i++) {
    if (reached(s) && s.stack.length === 0) break;
    s = act(s, s.pending.player, { type: "pass" });
  }
  return s;
}

/** Identifier of the target wanted by the expectation. */
function wantedFor(s: GameState, e: Expectation): string | undefined {
  switch (e.target) {
    case "opponent":
      return "p2";
    case "opponentCreature":
      return big(s);
    case "myCreature":
      return mine(s);
    case "myGraveyardCreature":
      return deadCard(s);
    default:
      return undefined;
  }
}

/** Casts the card with the wanted target, lets the stack resolve (choices: suggested answers). */
function castAndResolve(c: string | CardDef, e: Expectation): { before: GameState; after: GameState } {
  const name = typeof c === "string" ? c : c.name;
  let s = scenario({
    p1: { battlefield: [...LANDS, MINE], hand: [c], library: LANDS, graveyard: [DEAD] },
    p2: { battlefield: [BIG], hand: ["Forest", "Island", "Swamp"], library: LANDS },
  });
  const before = s;
  const card = s.players.p1?.hand.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === name) as string;
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && !a.faceDown);
  if (opt?.type !== "cast") throw new Error(`${name}: no cast option`);
  const mode = opt.modes[0];
  const targets: Record<string, string[]> = {};
  const wanted = wantedFor(s, e);
  for (const [i, spec] of (mode?.targets ?? []).entries()) {
    const kind = e.targets?.[i] ?? e.target;
    const id = e.targets ? wantedFor(s, { target: kind, check: () => {} }) : wanted;
    if (!id || !spec.legal.includes(id)) throw new Error(`${name} : cible ${kind} impossible`);
    targets[spec.id] = [id];
  }
  s = act(s, "p1", { type: "cast", card, targets, mode: mode?.index });
  castShift = 1;
  return { before, after: settleWith(s, name, e, wanted) };
}

/** Lets the stack and the triggers resolve; a trigger's target is the wanted one, the other choices suggested. */
function settleWith(s0: GameState, name: string, e: Expectation, wanted: string | undefined): GameState {
  let s = s0;
  for (let i = 0; i < 40 && s.stack.length + (s.pending?.kind === "choice" ? 1 : 0) + s.triggers.length > 0; i++) {
    const p = s.pending;
    if (!p) break;
    try {
      // Target of an enter trigger: the wanted one.
      const values =
        p.kind === "choice" && p.request.intent === "triggerTarget" && p.request.type === "pick" && wanted
          ? p.request.options.includes(wanted)
            ? [wanted]
            : null
          : p.kind === "choice"
            ? p.request.suggested
            : null;
      if (p.kind === "choice" && !values) throw new Error(`${name}: target ${e.target} impossible for the trigger`);
      s =
        p.kind === "choice"
          ? submit(s, p.player, { type: "choose", values: values ?? [] }).state
          : submit(s, p.player, { type: "pass" }).state;
    } catch (err) {
      if (err instanceof RulesError) throw new Error(`${name} : ${err.message}`);
      throw err;
    }
  }
  return s;
}

/**
 * Trigger of a creature already in play: it dies (destroyed) or attacks, then the stack resolves. No cast card:
 * the hand loses nothing.
 */
function triggerAndResolve(
  name: string,
  e: Expectation,
  kind: "dies" | "attacks" | "endStep" | "upkeep",
  conditionMet = true,
): { before: GameState; after: GameState; fired: boolean } {
  let s = scenario({
    step: kind === "attacks" ? "beginCombat" : kind === "endStep" ? "main2" : kind === "upkeep" ? "end" : "main1",
    // Upkeep: start from the end step of the opposing turn.
    active: kind === "upkeep" ? "p2" : "p1",
    p1: { battlefield: [...LANDS, MINE, name, EXTRA, EXTRA], library: LANDS, graveyard: [DEAD] },
    p2: { battlefield: [BIG], hand: ["Forest", "Island", "Swamp"], library: LANDS },
  });
  const self = idsOf(s, "p1", "battlefield", name)[0] as string;
  selfName = name;
  const wanted = wantedFor(s, e);
  if (kind === "attacks") {
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    const before = s;
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: self, defender: "p2" }] });
    castShift = 0;
    return { before, after: settleWith(s, name, e, wanted), fired: true };
  }
  if (kind === "endStep" || kind === "upkeep") {
    if (e.condition && conditionMet) {
      s = structuredClone(s);
      CONDITIONS[e.condition](s);
      s.version += 1;
    }
    // Pass until the end step trigger (on the stack, or its target question).
    const before = s;
    const at = kind === "endStep" ? "end" : "upkeep";
    s = passUntilTrigger(s, at);
    const fired = s.turn.step === at && s.turn.active === "p1" && (s.stack.length > 0 || s.pending?.kind === "choice");
    castShift = 0;
    return { before, after: settleWith(s, name, e, wanted), fired };
  }
  const before = s;
  s = structuredClone(s);
  destroy(s, self);
  s = act(s, "p1", { type: "pass" });
  castShift = 0;
  return { before, after: settleWith(s, name, e, wanted), fired: true };
}

describe("expectations deduced from the Oracle (spells with simple text)", () => {
  const cases = implementedCards()
    .filter((c) => !c.isToken && !c.faceDefs?.length && (c.types.includes("Instant") || c.types.includes("Sorcery")))
    .filter((c) => !c.manaCost?.x && !c.additionalCost)
    .map((c) => ({ c, e: expectationFor(c.text ?? "", c.name) }))
    .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

  it("the filter recognizes enough cards to be useful", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s does what its text says", (_name, { c, e }) => {
    const { before, after } = castAndResolve(c.name, e);
    e.check(before, after);
  });
});

describe('expectations deduced from the Oracle (creatures "when it enters")', () => {
  const cases = implementedCards()
    .filter((c) => !c.isToken && !c.faceDefs?.length && c.types.includes("Creature") && !c.types.includes("Land"))
    .filter((c) => !c.manaCost?.x && !c.additionalCost && !c.abilities.some((a) => a.kind === "replacement"))
    .map((c) => ({ c, e: enterExpectationFor(c.text ?? "", c.name) }))
    .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

  it("the filter recognizes enough cards to be useful", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s does what its text says when entering", (_name, { c, e }) => {
    const { before, after } = castAndResolve(c.name, e);
    e.check(before, after);
  });
});

describe.each(["dies", "attacks", "endStep", "upkeep"] as const)(
  'expectations deduced from the Oracle (creatures: trigger "%s")',
  (kind) => {
    const cases = implementedCards()
      .filter((c) => !c.isToken && !c.faceDefs?.length && c.types.includes("Creature") && !c.types.includes("Land"))
      .map((c) => ({ c, e: triggerExpectationFor(c.text ?? "", c.name, kind) }))
      .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

    it("the filter recognizes at least a few cards", () => {
      expect(cases.length).toBeGreaterThanOrEqual(kind === "upkeep" ? 1 : 3);
    });

    it.each(cases.map((x) => [x.c.name, x] as const))("%s does what its text says", (_name, { c, e }) => {
      const { before, after } = triggerAndResolve(c.name, e, kind);
      e.check(before, after);
    });

    // 603.4: without the interleaved condition, the trigger does not fire.
    // Conditions always fulfilled by the setup: checked in one direction only.
    const always: string[] = ["you haven't cast a spell from your hand this turn", "you control six or more lands"];
    const conditional = cases.filter((x) => x.e.condition && !always.includes(x.e.condition));
    it.each(conditional.map((x) => [x.c.name, x] as const))("%s: nothing without its condition", (_name, { c, e }) => {
      expect(triggerAndResolve(c.name, e, kind, false).fired).toBe(false);
    });
  },
);

describe("expectations deduced from the Oracle: the test can fail", () => {
  it("a script that deals 2 damage when the text says 3 is detected", () => {
    const text = "Faulty Bolt deals 3 damage to any target.";
    const faulty = customCard({
      name: "Faulty Bolt",
      typeLine: "Instant",
      types: ["Instant"],
      text,
      spell: dsl.spell([dsl.target.any()], [dsl.fx.damage(2, dsl.ref.target())]),
    });
    const e = expectationFor(text, "Faulty Bolt");
    expect(e?.target).toBe("opponent");
    const { before, after } = castAndResolve(faulty, e as Expectation);
    expect(() => e?.check(before, after)).toThrow();
  });
});
