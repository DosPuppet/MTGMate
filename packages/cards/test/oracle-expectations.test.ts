/**
 * Attentes déduites de l'Oracle (P1 de l'audit, étape 7) : le test de fumée vérifie qu'une carte se joue sans planter ;
 * ici, pour les éphémères et rituels au texte simple (« ~ deals 3 damage to any target. », « Draw two cards. »…), on
 * lance la carte et on vérifie son effet. Les cartes au texte composé ne sont pas concernées.
 */
import { type CardDef, chars, dsl, type GameState, legalActions, RulesError, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { destroy } from "../../engine/src/actions";
import { act, customCard, idsOf, passAccepting, scenario } from "../../engine/test/helpers";
import { paragraphs, stripReminder } from "../src/audit";
import { implementedCards } from "../src/index";

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const n = (w: string) => (/^\d+$/.test(w) ? Number(w) : (NUM[w.toLowerCase()] ?? Number.NaN));

/** Une attente : la cible à choisir et ce qui doit avoir changé. */
interface Expectation {
  target?: "opponent" | "opponentCreature" | "myCreature";
  check: (before: GameState, after: GameState) => void;
}

const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => [l, l, l]);
// Créatures de référence : une grosse créature adverse (blessures sans la tuer), une créature à vous (renforts).
const BIG = "Gigantosaurus";
const MINE = "Bear Cub";
const life = (s: GameState, p: string) => s.players[p]?.life ?? 0;
const handSize = (s: GameState) => s.players.p1?.hand.length ?? 0;
/** Cartes sorties de la main par la mise en scène (1 : la carte lancée ; 0 : déclencheur d'une carte déjà en jeu). */
let castShift = 1;
const tokenCount = (s: GameState) => s.battlefield.filter((id) => s.objects[id]?.isToken).length;
const big = (s: GameState) => idsOf(s, "p2", "battlefield", BIG)[0];
const mine = (s: GameState) => idsOf(s, "p1", "battlefield", MINE)[0] as string;

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

/** Une phrase reconnue : sa cible et sa vérification ; « ok » : reconnue sans vérification ; null : inconnue. */
function clause(t: string): Clause | null {
  let m = /^~ deals (\d+) damage to (?:any target|target (?:player|opponent)(?: or planeswalker)?|each opponent)\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    const each = t.includes("each opponent");
    return { target: each ? undefined : "opponent", check: (b, a) => expect(life(b, "p2") - life(a, "p2")).toBe(d) };
  }
  m = /^~ deals (\d+) damage to target creature(?: or planeswalker)?\.$/.exec(t);
  if (m) {
    const d = n(m[1] as string);
    return { target: "opponentCreature", check: (_b, a) => expect(a.objects[big(a) ?? ""]?.damage).toBe(d) };
  }
  // Perte de PV adverse (et gain de PV) : « Each opponent loses 2 life and you gain 2 life. »
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
  // Pillage : « Draw a card, then discard a card. » (la main garde sa taille, moins la carte lancée).
  m = /^Draw (\w+) cards?, then discard (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string) - n(m[2] as string);
    return { check: (b, a) => expect(handSize(a) - (handSize(b) - castShift)).toBe(k) };
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
  m = /^Draw (\w+) cards?\.$/.exec(t);
  if (m) {
    const k = n(m[1] as string);
    // La carte lancée a quitté la main.
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
  // « Target creature [you control] gets ±N/±N [and gains …] until end of turn. »
  m =
    /^(Target creature(?: you control| an opponent controls)?|Creatures you control) gets? ([+-])(\d+)\/([+-])(\d+)(?: and gains? ([a-z ,]+?))? until end of turn\.$/.exec(
      t,
    );
  if (m) {
    const sign = (x: string) => (x === "-" ? -1 : 1);
    // « -1/-0 » : pas de -0 (toBe distingue -0 de 0).
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
        // Endurance réduite à 0 ou moins : la créature est morte (704.5f).
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
  if (/^Return target creature to its owner's hand\.$/.test(t))
    return {
      target: "opponentCreature",
      check: (_b, a) => expect(a.players.p2?.hand.some((id) => a.defs[a.objects[id]?.defId ?? ""]?.name === BIG)).toBe(true),
    };
  if (/^Destroy all creatures\.$/.test(t))
    return { check: (_b, a) => expect(a.battlefield.filter((id) => chars(a, id).types.includes("Creature"))).toEqual([]) };
  // Phrases reconnues sans vérification propre (effet annexe, ou déjà couvert par la phrase précédente).
  if (
    /^(?:Untap it|Untap that creature|Scry \d+|Surveil \d+|It gains haste until end of turn|If that (?:creature|creature or planeswalker) would die this turn, exile it instead)\.$/.test(
      t,
    )
  )
    return "ok";
  return null;
}

/** Attente pour un texte simple (phrases toutes reconnues, une seule sorte de cible), ou null. */
export function expectationFor(text: string, name: string): Expectation | null {
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
  return {
    target: targets[0],
    check: (b, a) => {
      for (const x of real) x.check(b, a);
    },
  };
}

/**
 * Créature dont la seule capacité (hors mots-clés) est « When this creature enters, … » : l'attente de cette phrase.
 * « it deals » devient « ~ deals », la première lettre passe en majuscule.
 */
export function enterExpectationFor(text: string, name: string): Expectation | null {
  return triggerExpectationFor(text, name, "enters");
}

/** Déclencheurs vérifiés : arrivée, mort, attaque de la créature elle-même. */
export type TriggerKind = "enters" | "dies" | "attacks";
const TRIGGER_RE: Record<TriggerKind, RegExp> = {
  enters: /^When (?:this creature|~) enters, (.*)$/,
  dies: /^When (?:this creature|~) dies, (.*)$/,
  attacks: /^Whenever (?:this creature|~) attacks, (.*)$/,
};

/**
 * Créature dont la seule capacité (hors mots-clés) est un déclencheur de ce type : l'attente de sa phrase.
 * « it deals » devient « ~ deals », la première lettre passe en majuscule.
 */
export function triggerExpectationFor(text: string, name: string, kind: TriggerKind): Expectation | null {
  const paras = paragraphs(text.replaceAll(name, "~"), false).filter((p) => p.kind !== "keywords");
  const only = paras.length === 1 ? paras[0] : undefined;
  const m = only?.kind === "triggered" ? TRIGGER_RE[kind].exec(only.text) : null;
  if (!m) return null;
  const rest = (m[1] as string).replace(/^it deals/, "~ deals");
  return expectationFor(rest.charAt(0).toUpperCase() + rest.slice(1), "~");
}

/** Lance la carte avec la cible voulue, laisse la pile se résoudre (choix : réponses suggérées). */
function castAndResolve(c: string | CardDef, e: Expectation): { before: GameState; after: GameState } {
  const name = typeof c === "string" ? c : c.name;
  let s = scenario({
    p1: { battlefield: [...LANDS, MINE], hand: [c], library: LANDS },
    p2: { battlefield: [BIG], hand: ["Forest", "Island", "Swamp"], library: LANDS },
  });
  const before = s;
  const card = s.players.p1?.hand.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === name) as string;
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && !a.faceDown);
  if (opt?.type !== "cast") throw new Error(`${name} : pas d'option de lancement`);
  const mode = opt.modes[0];
  const targets: Record<string, string[]> = {};
  const wanted =
    e.target === "opponent" ? "p2" : e.target === "opponentCreature" ? big(s) : e.target === "myCreature" ? mine(s) : undefined;
  for (const spec of mode?.targets ?? []) {
    if (!wanted || !spec.legal.includes(wanted)) throw new Error(`${name} : cible ${e.target} impossible`);
    targets[spec.id] = [wanted];
  }
  s = act(s, "p1", { type: "cast", card, targets, mode: mode?.index });
  castShift = 1;
  return { before, after: settleWith(s, name, e, wanted) };
}

/** Laisse la pile et les déclencheurs se résoudre ; la cible d'un déclencheur est celle voulue, les autres choix suggérés. */
function settleWith(s0: GameState, name: string, e: Expectation, wanted: string | undefined): GameState {
  let s = s0;
  for (let i = 0; i < 40 && s.stack.length + (s.pending?.kind === "choice" ? 1 : 0) + s.triggers.length > 0; i++) {
    const p = s.pending;
    if (!p) break;
    try {
      // Cible d'un déclencheur d'arrivée : celle voulue.
      const values =
        p.kind === "choice" && p.request.intent === "triggerTarget" && p.request.type === "pick" && wanted
          ? p.request.options.includes(wanted)
            ? [wanted]
            : null
          : p.kind === "choice"
            ? p.request.suggested
            : null;
      if (p.kind === "choice" && !values) throw new Error(`${name} : cible ${e.target} impossible pour le déclencheur`);
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
 * Déclencheur d'une créature déjà en jeu : elle meurt (détruite) ou attaque, puis la pile se résout. Pas de carte
 * lancée : la main ne perd rien.
 */
function triggerAndResolve(name: string, e: Expectation, kind: "dies" | "attacks"): { before: GameState; after: GameState } {
  let s = scenario({
    step: kind === "attacks" ? "beginCombat" : "main1",
    p1: { battlefield: [...LANDS, MINE, name], library: LANDS },
    p2: { battlefield: [BIG], hand: ["Forest", "Island", "Swamp"], library: LANDS },
  });
  const self = idsOf(s, "p1", "battlefield", name)[0] as string;
  const wanted =
    e.target === "opponent" ? "p2" : e.target === "opponentCreature" ? big(s) : e.target === "myCreature" ? mine(s) : undefined;
  if (kind === "attacks") {
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    const before = s;
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: self, defender: "p2" }] });
    castShift = 0;
    return { before, after: settleWith(s, name, e, wanted) };
  }
  const before = s;
  s = structuredClone(s);
  destroy(s, self);
  s = act(s, "p1", { type: "pass" });
  castShift = 0;
  return { before, after: settleWith(s, name, e, wanted) };
}

describe("attentes déduites de l'Oracle (sorts au texte simple)", () => {
  const cases = implementedCards()
    .filter((c) => !c.isToken && !c.faceDefs?.length && (c.types.includes("Instant") || c.types.includes("Sorcery")))
    .filter((c) => !c.manaCost?.x && !c.additionalCost)
    .map((c) => ({ c, e: expectationFor(c.text ?? "", c.name) }))
    .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

  it("le filtre reconnaît assez de cartes pour être utile", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s fait ce que dit son texte", (_name, { c, e }) => {
    const { before, after } = castAndResolve(c.name, e);
    e.check(before, after);
  });
});

describe("attentes déduites de l'Oracle (créatures « quand elle arrive »)", () => {
  const cases = implementedCards()
    .filter((c) => !c.isToken && !c.faceDefs?.length && c.types.includes("Creature") && !c.types.includes("Land"))
    .filter((c) => !c.manaCost?.x && !c.additionalCost && !c.abilities.some((a) => a.kind === "replacement"))
    .map((c) => ({ c, e: enterExpectationFor(c.text ?? "", c.name) }))
    .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

  it("le filtre reconnaît assez de cartes pour être utile", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s fait ce que dit son texte en arrivant", (_name, { c, e }) => {
    const { before, after } = castAndResolve(c.name, e);
    e.check(before, after);
  });
});

describe.each(["dies", "attacks"] as const)("attentes déduites de l'Oracle (créatures : déclencheur « %s »)", (kind) => {
  const cases = implementedCards()
    .filter((c) => !c.isToken && !c.faceDefs?.length && c.types.includes("Creature") && !c.types.includes("Land"))
    .map((c) => ({ c, e: triggerExpectationFor(c.text ?? "", c.name, kind) }))
    .filter((x): x is { c: (typeof x)["c"]; e: Expectation } => !!x.e);

  it("le filtre reconnaît au moins quelques cartes", () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s fait ce que dit son texte", (_name, { c, e }) => {
    const { before, after } = triggerAndResolve(c.name, e, kind);
    e.check(before, after);
  });
});

describe("attentes déduites de l'Oracle : le test sait échouer", () => {
  it("un script qui inflige 2 blessures quand le texte en annonce 3 est détecté", () => {
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
