/**
 * Oracle expectations on recurring text forms (lot K5 of the 2026-10-03 analysis): lands' mana,
 * "enters tapped", Equipment bonuses, number of modes of modal spells. Each card whose text has the form is
 * checked in a game: a card that does not follow it fails the test, unless an intended gap is listed in `EXCEPTIONS`
 * with its reason.
 */
import { type CardDef, chars, dsl, type GameState, legalActions, type ManaType } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { manaAbilitiesOf } from "../../engine/src/mana";
import { act, customCard, idOf, scenario } from "../../engine/test/helpers";
import { stripReminder } from "../src/audit";
import { implementedCards } from "../src/index";

/** Intended gaps: card → reason. */
const EXCEPTIONS: Record<string, string> = {};

const cards = implementedCards().filter((c) => !c.isToken && !EXCEPTIONS[c.name]);
const lines = (c: CardDef) =>
  (c.text ?? "")
    .split("\n")
    .map((l) => stripReminder(l.trim()))
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Lands' mana: "{T}: Add {G}.", "{T}: Add {W} or {U}.", "{T}: Add one mana of any color."
// ---------------------------------------------------------------------------

const ANY: ManaType[] = ["W", "U", "B", "R", "G"];
const SYMBOL = /\{([WUBRGC])\}/g;

/** Colors announced by a simple "{T}: Add …" line, or null. */
function landMana(line: string): ManaType[] | null {
  if (line === "{T}: Add one mana of any color.") return ANY;
  if (!/^\{T\}: Add \{[WUBRGC]\}(?:(?:,| or|, or) \{[WUBRGC]\})*\.$/.test(line)) return null;
  return [...line.matchAll(SYMBOL)].map((m) => m[1] as ManaType);
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

describe("Oracle: lands' mana ({T}: Add …)", () => {
  const cases = cards
    .filter((c) => c.types.includes("Land") && !c.faceDefs?.length)
    .map((c) => ({
      c,
      wanted: lines(c)
        .map(landMana)
        .filter((x): x is ManaType[] => !!x),
    }))
    .filter((x) => x.wanted.length > 0);

  it("the filter recognizes enough lands to be useful", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s produces the mana of its text", (_name, { c, wanted }) => {
    for (const colors of wanted) expect(producesAll(c, colors), `${c.name}: "{T}: Add ${colors.join("/")}"`).toBe(true);
  });

  it("the test can fail: a land that announces {G} but produces {R} is detected", () => {
    const faulty = customCard({
      name: "Fake Grove",
      typeLine: "Land",
      types: ["Land"],
      text: "{T}: Add {G}.",
      abilities: [dsl.manaAbility("R")],
    });
    expect(landMana("{T}: Add {G}.")).toEqual(["G"]);
    expect(producesAll(faulty, ["G"])).toBe(false);
  });
});

/** A "{T}: Add one mana of one of these colors" ability, with no other cost. */
function producesAll(c: CardDef, colors: ManaType[]): boolean {
  const s = scenario({ p1: { battlefield: [c] } });
  const id = idOf(s, "p1", "battlefield", c.name);
  return manaAbilitiesOf(s, id).some(
    (a) =>
      a.cost.tap &&
      !a.cost.mana &&
      !a.cost.payLife &&
      a.cost.self !== "sacrifice" &&
      a.amount === 1 &&
      sameSet(a.produce, colors),
  );
}

// ---------------------------------------------------------------------------
// "This land enters tapped."; a land whose text does not mention being tapped enters untapped.
// ---------------------------------------------------------------------------

function playLand(name: string): { s: GameState; id: string } {
  let s = scenario({ p1: { hand: [name] } });
  const card = idOf(s, "p1", "hand", name);
  const opt = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === card && !a.payLife);
  if (opt?.type !== "playLand") throw new Error(`${name}: no option to play the land`);
  s = act(s, "p1", opt);
  // "As it enters" choice (type, color): the suggested answer.
  for (let i = 0; i < 5 && s.pending?.kind === "choice"; i++)
    s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
  return { s, id: idOf(s, "p1", "battlefield", name) };
}

describe("Oracle: lands that enter tapped", () => {
  const lands = cards.filter((c) => c.types.includes("Land") && !c.faceDefs?.length && !c.types.includes("Creature"));
  const tapped = lands.filter((c) => lines(c).includes("This land enters tapped."));
  // "If this land would enter, sacrifice a Swamp instead" (Lake of the Dead): a replacement, not an untapped land.
  const untapped = lands.filter((c) => !/tapped|untap|enters|would enter|As this land/i.test(c.text ?? ""));

  it("the filters recognize enough lands to be useful", () => {
    expect(tapped.length).toBeGreaterThanOrEqual(20);
    expect(untapped.length).toBeGreaterThanOrEqual(10);
  });

  it.each(tapped.map((c) => [c.name] as const))("%s enters tapped", (name) => {
    const { s, id } = playLand(name);
    expect(s.objects[id]?.tapped).toBe(true);
  });

  it.each(untapped.map((c) => [c.name] as const))("%s enters untapped", (name) => {
    const { s, id } = playLand(name);
    expect(s.objects[id]?.tapped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Equipment: "Equipped creature gets +N/+M [and has K]."
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, string> = {
  flying: "flying",
  trample: "trample",
  vigilance: "vigilance",
  lifelink: "lifelink",
  deathtouch: "deathtouch",
  haste: "haste",
  menace: "menace",
  reach: "reach",
  "first strike": "firstStrike",
  "double strike": "doubleStrike",
  hexproof: "hexproof",
  indestructible: "indestructible",
  ward: "ward",
};

function equipBonus(line: string): { p: number; t: number; keywords: string[] } | null {
  const m = /^Equipped creature gets ([+-]\d+)\/([+-]\d+)(?: and has ([a-z ,]+?))?\.$/.exec(line);
  if (!m) return null;
  const keywords = (m[3] ?? "")
    .split(/, and |, | and /)
    .filter(Boolean)
    .map((k) => KEYWORDS[k.trim()]);
  if (keywords.some((k) => !k)) return null;
  return { p: Number(m[1]), t: Number(m[2]), keywords: keywords as string[] };
}

describe("Oracle: Equipment bonuses", () => {
  const cases = cards
    .filter((c) => c.subtypes.includes("Equipment") && !c.faceDefs?.length && !c.types.includes("Creature"))
    .map((c) => ({
      c,
      bonus: lines(c)
        .map(equipBonus)
        .find((x) => !!x),
    }))
    .filter((x): x is { c: CardDef; bonus: NonNullable<ReturnType<typeof equipBonus>> } => !!x.bonus);

  it("the filter recognizes enough Equipment to be useful", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s gives the bonus of its text", (_name, { c, bonus }) => {
    const s = scenario({ p1: { battlefield: [c.name, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const before = chars(s, bear);
    const eq = s.objects[idOf(s, "p1", "battlefield", c.name)];
    if (!eq) throw new Error("Equipment missing");
    eq.attachedTo = bear;
    s.version += 1;
    const after = chars(s, bear);
    expect([after.power - before.power, after.toughness - before.toughness]).toEqual([bonus.p, bonus.t]);
    for (const k of bonus.keywords) expect(after.keywords, `${c.name}: ${k}`).toContain(k);
  });
});

// ---------------------------------------------------------------------------
// Modal spells: "Choose one —" followed by N bullets: N modes (combinations for "one or both", "two", "one or more").
// ---------------------------------------------------------------------------

const binom = (n: number, k: number): number => (k === 0 || k === n ? 1 : binom(n - 1, k - 1) + binom(n - 1, k));

function expectedModes(text: string): number | null {
  const all = text.split("\n").map((l) => l.trim());
  const head = all.find((l) => /^Choose (one|two|three|one or both|one or more) —$/.test(l));
  if (!head) return null;
  const n = all.filter((l) => l.startsWith("•")).length;
  if (n < 2) return null;
  if (head === "Choose one —") return n;
  if (head === "Choose two —") return binom(n, 2);
  if (head === "Choose three —") return binom(n, 3);
  if (head === "Choose one or both —") return n === 2 ? 3 : null;
  return 2 ** n - 1;
}

describe("Oracle: number of modes of modal spells", () => {
  const cases = cards
    .filter((c) => (c.types.includes("Instant") || c.types.includes("Sorcery")) && !c.faceDefs?.length && c.spell)
    .map((c) => ({ c, n: expectedModes(c.text ?? "") }))
    .filter((x): x is { c: CardDef; n: number } => x.n !== null);

  it("the filter recognizes enough spells to be useful", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s has the modes of its text", (_name, { c, n }) => {
    expect(c.spell?.modes.length).toBe(n);
  });
});
