/**
 * Object filters (PLAN-H H10): dynamic comparisons (`ObjectFilter.compare`, a single `resolveCompare` resolver),
 * attachments (`attached`) and crew (`crew`). One test per former field: each behaves exactly as before
 * (edge cases included: negative power, last known information, X of the ability or of the permanent).
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { amount, cmp, ref } from "../src/dsl";
import { type EffectContext, staticContext, withX } from "../src/effects";
import { legalActions } from "../src/legal";
import { snapshot } from "../src/state";
import { matchesCard, matchesObjectFilter, matchesView, withChosen } from "../src/targets";
import type { ActionOption, CardDef, GameState, ObjectFilter } from "../src/types";
import { act, customCard, idOf, lands, scenario, settle } from "./helpers";

type S = GameState;

const creature = (name: string, power: number, toughness: number, mv = 0): CardDef =>
  customCard({ name, power, toughness, manaCost: { generic: mv, colored: {}, x: 0 }, manaCostText: `{${mv}}` });

const SOURCE = (power: number) => creature(`Source ${power}`, power, 1);
const P1 = creature("Un", 1, 3, 1);
const P2 = creature("Deux", 2, 2, 2);
const P3 = creature("Trois", 3, 1, 3);
const P0 = creature("Zero", 0, 4, 0);

const id = (s: S, name: string) => {
  const found = s.battlefield.find((x) => s.defs[s.objects[x]?.defId ?? ""]?.name === name);
  if (!found) throw new Error(name);
  return found;
};

/** Names of p2's creatures that match the filter, seen from p1, with this source. */
const matching = (s: S, f: ObjectFilter, sourceId?: string) =>
  s.battlefield
    .filter((x) => s.objects[x]?.controller === "p2" && matchesObjectFilter(s, "p1", x, f, sourceId))
    .map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name)
    .sort();

const board = (sourcePower: number, extra: CardDef[] = []) =>
  scenario({ p1: { battlefield: [SOURCE(sourcePower)] }, p2: { battlefield: [P0, P1, P2, P3, ...extra] } });

/** Context of a resolution whose source is `sourceId`. */
const resolving = (s: S, sourceId: string, x = 0, targets: Record<string, string[]> = {}): EffectContext => ({
  ...staticContext(s, "p1", sourceId),
  x,
  targets,
});

/** The source leaves the battlefield: only its last known information remains. */
function leave(s: S, sourceId: string, lki: Record<string, unknown>): void {
  s.lki[sourceId] = { ...snapshot(s, sourceId), ...lki };
  s.battlefield = s.battlefield.filter((x) => x !== sourceId);
  delete s.objects[sourceId];
  s.version += 1;
}

describe("ObjectFilter.compare: dynamic comparisons (one field removed per test)", () => {
  it("powerAboveSource → cmp.power('>', amount.sourcePower): greater power, no floor, from last known information", () => {
    const f = { compare: [cmp.power(">", amount.sourcePower)] };
    let s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Trois"]);
    s = board(-1);
    expect(matching(s, f, id(s, "Source -1"))).toEqual(["Deux", "Trois", "Un", "Zero"]);
    s = board(2);
    const src = id(s, "Source 2");
    leave(s, src, { power: 1 });
    expect(matching(s, f, src)).toEqual(["Deux", "Trois"]);
    // With no source: 0.
    expect(matching(s, f, undefined)).toEqual(["Deux", "Trois", "Un"]);
  });

  it("powerBelowSource → cmp.power('<', amount.sourcePower): lesser power (Formation Breaker)", () => {
    const f = { compare: [cmp.power("<", amount.sourcePower)] };
    const s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Un", "Zero"]);
    const t = board(-1);
    expect(matching(t, f, id(t, "Source -1"))).toEqual([]);
  });

  it("powerAboveOf → cmp.power('>', amount.rawPowerOf(ref)): power greater than the target's, on resolution", () => {
    const f = { types: ["Creature" as const], compare: [cmp.power(">", amount.rawPowerOf(ref.target()))] };
    const s = board(5, [creature("Moins un", -1, 5)]);
    const src = id(s, "Source 5");
    const names = (g: ObjectFilter) => matching(s, g, src);
    expect(names(withX(s, f, resolving(s, src, 0, { t: [id(s, "Deux")] })))).toEqual(["Trois"]);
    // Negative power: no floor (a creature with power 0 has greater power).
    expect(names(withX(s, f, resolving(s, src, 0, { t: [id(s, "Moins un")] })))).toEqual(["Deux", "Trois", "Un", "Zero"]);
    // With no designated creature on the battlefield, nothing matches.
    expect(names(withX(s, f, resolving(s, src, 0, { t: [] })))).toEqual([]);
  });

  it("manaValueSourcePower → cmp.manaValue('=', amount.sourcePower): mana value equal to the power (Jackal)", () => {
    const f = { compare: [cmp.manaValue("=", amount.sourcePower)] };
    const s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Deux"]);
  });

  it("maxManaValueSourcePower → cmp.manaValue('<=', amount.sourcePower): at most the power (Alesha), last known information", () => {
    const f = { compare: [cmp.manaValue("<=", amount.sourcePower)] };
    const s = board(2);
    const src = id(s, "Source 2");
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zero"]);
    leave(s, src, { power: 1 });
    expect(matching(s, f, src)).toEqual(["Un", "Zero"]);
  });

  it("maxManaValueSourcePower (Loki Laufeyson): the bound fixed on resolution does not go below 0", () => {
    const frozen = (power: number) => {
      const loki = { ...card("Loki Laufeyson"), id: `test-loki-${power}`, power };
      let s = scenario({ p1: { battlefield: [loki, ...lands("Mountain", 2)] } });
      const src = idOf(s, "p1", "battlefield", "Loki Laufeyson");
      const option = legalActions(s, "p1").find(
        (a): a is Extract<ActionOption, { type: "activate" }> =>
          a.type === "activate" && a.source === src && /next/.test(a.label ?? ""),
      );
      s = settle(act(s, "p1", { type: "activate", source: src, ability: option?.ability ?? -1 }));
      return s.playerEffects.find((e) => e.ability.nextSpell)?.ability.nextSpell?.filter?.compare;
    };
    expect(frozen(3)).toEqual([{ what: "manaValue", cmp: "<=", to: 3 }]);
    expect(frozen(-2)).toEqual([{ what: "manaValue", cmp: "<=", to: 0 }]);
  });

  it("manaValueSourceCounters → cmp.manaValue('=', amount.lkiCounters(kind)): counters on the source (Blast Zone)", () => {
    const f = { compare: [cmp.manaValue("=", amount.lkiCounters("charge"))] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zero"]);
    (s.objects[src] as { counters: Record<string, number> }).counters.charge = 2;
    s.version += 1;
    expect(matching(s, f, src)).toEqual(["Deux"]);
    leave(s, src, { counters: { charge: 3 } });
    expect(matching(s, f, src)).toEqual(["Trois"]);
  });

  it("manaValueSourceCounters { atMost } → cmp.manaValue('<=', amount.lkiCounters(sorte)) : As Foretold", () => {
    const f = { compare: [cmp.manaValue("<=", amount.lkiCounters("time"))] };
    const s = board(1);
    const src = id(s, "Source 1");
    (s.objects[src] as { counters: Record<string, number> }).counters.time = 1;
    s.version += 1;
    expect(matching(s, f, src)).toEqual(["Un", "Zero"]);
  });

  it("maxManaValueManaSpent → cmp.manaValue('<=', amount.sourceManaSpent): permanent, last known information (Astelli)", () => {
    const f = { compare: [cmp.manaValue("<=", amount.sourceManaSpent)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zero"]);
    s.objects[src]!.cast = { manaSpent: 2 } as never;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zero"]);
    leave(s, src, { manaSpent: 1 });
    expect(matching(s, f, src)).toEqual(["Un", "Zero"]);
  });

  it("maxManaValueColorsSpent → cmp.manaValue('<=', amount.colorsSpent) : convergence (Sundering Archaic)", () => {
    const f = { compare: [cmp.manaValue("<=", amount.colorsSpent)] };
    const s = board(1);
    const src = id(s, "Source 1");
    s.objects[src]!.cast = { spentColors: { W: 1, U: 2, B: 0 } } as never;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zero"]);
  });

  it("maxManaValueX → cmp.manaValue('<=', amount.x): the ability's X on resolution, otherwise the permanent's", () => {
    const f = { compare: [cmp.manaValue("<=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zero"]);
    s.objects[src]!.x = 2;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zero"]);
    expect(matching(s, withX(s, f, resolving(s, src, 1)), src)).toEqual(["Un", "Zero"]);
    // A card (graveyard, library): same comparison.
    const t = scenario({ p1: { battlefield: [SOURCE(1)], graveyard: [P1, P3] } });
    const tsrc = id(t, "Source 1");
    t.objects[tsrc]!.x = 2;
    const cards = (t.players.p1?.graveyard ?? []).filter((x) => matchesCard(t, "p1", x, f, tsrc));
    expect(cards.map((x) => t.defs[t.objects[x]?.defId ?? ""]?.name)).toEqual(["Un"]);
  });

  it("maxToughnessX → cmp.toughness('<=', amount.x): toughness at most X on resolution (Zero Point Ballad)", () => {
    const f = { compare: [cmp.toughness("<=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, withX(s, f, resolving(s, src, 2)), src)).toEqual(["Deux", "Trois"]);
  });

  it("manaValueX → cmp.manaValue('=', amount.x): mana value equal to X on resolution (Dauntless Dismantler)", () => {
    const f = { compare: [cmp.manaValue("=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, withX(s, f, resolving(s, src, 3)), src)).toEqual(["Trois"]);
    expect(matching(s, withX(s, f, resolving(s, src, 0)), src)).toEqual(["Zero"]);
  });

  it("toughnessAbovePower → cmp.toughness('>', 'power'): toughness greater than its power (Fecund Greenshell)", () => {
    const f = { compare: [cmp.toughness(">", "power")] };
    const s = board(1);
    expect(matching(s, f)).toEqual(["Un", "Zero"]);
    // Also read directly on a view (triggers).
    expect(matchesView(snapshot(s, id(s, "Un")), f, "p1")).toBe(true);
    expect(matchesView(snapshot(s, id(s, "Deux")), f, "p1")).toBe(false);
  });

  it("powerAboveBase → cmp.power('>', 'basePower'): power greater than its base power (Kutzil)", () => {
    const f = { compare: [cmp.power(">", "basePower")] };
    const s = board(1);
    expect(matching(s, f)).toEqual([]);
    (s.objects[id(s, "Deux")] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
    s.version += 1;
    expect(matching(s, f)).toEqual(["Deux"]);
  });

  it("manaValueParity → cmp.parity: even or odd mana value (Mutinous Massacre), chosen parity (Gollum)", () => {
    const s = board(1);
    expect(matching(s, { compare: [cmp.parity("odd")] })).toEqual(["Trois", "Un"]);
    expect(matching(s, { compare: [cmp.parity("even")] })).toEqual(["Deux", "Zero"]);
    expect(withChosen({ chosen: "parity" }, { chosen: { parity: "odd" } })).toEqual({
      compare: [{ what: "manaValue", cmp: "odd" }],
    });
    // With no choice: even.
    expect(matching(s, withChosen({ chosen: "parity" }, {}))).toEqual(["Deux", "Zero"]);
  });

  it("an unresolved amount (filter read directly on a view) is ignored, like the former fields", () => {
    const s = board(2);
    expect(matchesView(snapshot(s, id(s, "Un")), { compare: [cmp.power(">", amount.sourcePower)] }, "p1")).toBe(true);
  });
});

describe("ObjectFilter.attached and crew: attachments and crew (one field removed per test)", () => {
  const aura = customCard({ name: "Test Aura", types: ["Enchantment"], typeLine: "Enchantment — Aura", subtypes: ["Aura"] });
  const attachedBoard = () => {
    const s = scenario({ p1: { battlefield: [aura, P1, P2] }, p2: { battlefield: [P0, P3] } });
    return { s, src: id(s, "Test Aura"), un: id(s, "Un"), deux: id(s, "Deux") };
  };
  const all = (s: S, f: ObjectFilter, src?: string) =>
    s.battlefield
      .filter((x) => matchesObjectFilter(s, "p1", x, f, src))
      .map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name)
      .sort();

  it("attachedToSource → attached: 'host': the permanent the source is attached to", () => {
    const { s, src, un } = attachedBoard();
    expect(all(s, { attached: "host" }, src)).toEqual([]);
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "host" }, src)).toEqual(["Un"]);
    expect(all(s, { attached: "host" })).toEqual([]);
  });

  it("notAttachedToSource → attached: 'notHost': any other than it (with no source: all)", () => {
    const { s, src, un } = attachedBoard();
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { types: ["Creature"], attached: "notHost" }, src)).toEqual(["Deux", "Trois", "Zero"]);
    expect(all(s, { types: ["Creature"], attached: "notHost" })).toEqual(["Deux", "Trois", "Un", "Zero"]);
  });

  it("attachedToSelf → attached: 'toSource': attached to the source", () => {
    const { s, src, un } = attachedBoard();
    expect(all(s, { attached: "toSource" }, un)).toEqual([]);
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "toSource" }, un)).toEqual(["Test Aura"]);
    expect(matchesView(snapshot(s, src), { attached: "toSource" }, "p1", un)).toBe(true);
  });

  it("attachedToSourceHost → attached: 'toHost': attached to the permanent the source is attached to", () => {
    const aura2 = customCard({ name: "Test Aura 2", types: ["Enchantment"], typeLine: "Enchantment — Aura", subtypes: ["Aura"] });
    const s = scenario({ p1: { battlefield: [aura, aura2, P1] } });
    const [a1, a2, un] = [id(s, "Test Aura"), id(s, "Test Aura 2"), id(s, "Un")];
    s.objects[a1]!.attachedTo = un;
    s.objects[a2]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "toHost" }, a1)).toEqual(["Test Aura", "Test Aura 2"]);
    s.objects[a1]!.attachedTo = undefined;
    s.version += 1;
    expect(all(s, { attached: "toHost" }, a1)).toEqual([]);
  });

  it("wasAttachedToSource → attached: 'wasToSource': was attached to the source when it left", () => {
    const { s, src, un } = attachedBoard();
    s.objects[src]!.lastAttachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "wasToSource" }, un)).toEqual(["Test Aura"]);
    s.objects[src]!.attachedTo = id(s, "Deux");
    s.version += 1;
    expect(all(s, { attached: "wasToSource" }, un)).toEqual([]);
  });

  it("crewedBySource → crew: 'bySource': a Vehicle the source crewed this turn", () => {
    const { s, un, deux } = attachedBoard();
    s.objects[deux]!.crewedBy = { turn: s.turn.number, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "bySource" }, un)).toEqual(["Deux"]);
    s.objects[deux]!.crewedBy = { turn: s.turn.number - 1, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "bySource" }, un)).toEqual([]);
  });

  it("crewedSource → crew: 'source': a creature that crewed or saddled the source this turn", () => {
    const { s, un, deux } = attachedBoard();
    s.objects[deux]!.crewedBy = { turn: s.turn.number, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "source" }, deux)).toEqual(["Un"]);
    expect(all(s, { crew: "source" })).toEqual([]);
  });
});
