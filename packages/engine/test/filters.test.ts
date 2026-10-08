/**
 * Filtres d'objets (PLAN-H H10) : comparaisons dynamiques (`ObjectFilter.compare`, un seul résolveur `resolveCompare`),
 * attaches (`attached`) et équipage (`crew`). Un test par ancien champ : chacun se comporte exactement comme avant
 * (cas limites compris : force négative, dernières informations connues, X de la capacité ou du permanent).
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
const P0 = creature("Zéro", 0, 4, 0);

const id = (s: S, name: string) => {
  const found = s.battlefield.find((x) => s.defs[s.objects[x]?.defId ?? ""]?.name === name);
  if (!found) throw new Error(name);
  return found;
};

/** Noms des créatures de p2 qui correspondent au filtre, vu de p1, avec cette source. */
const matching = (s: S, f: ObjectFilter, sourceId?: string) =>
  s.battlefield
    .filter((x) => s.objects[x]?.controller === "p2" && matchesObjectFilter(s, "p1", x, f, sourceId))
    .map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name)
    .sort();

const board = (sourcePower: number, extra: CardDef[] = []) =>
  scenario({ p1: { battlefield: [SOURCE(sourcePower)] }, p2: { battlefield: [P0, P1, P2, P3, ...extra] } });

/** Contexte d'une résolution dont la source est `sourceId`. */
const resolving = (s: S, sourceId: string, x = 0, targets: Record<string, string[]> = {}): EffectContext => ({
  ...staticContext(s, "p1", sourceId),
  x,
  targets,
});

/** La source quitte le champ de bataille : seules restent ses dernières informations connues. */
function leave(s: S, sourceId: string, lki: Record<string, unknown>): void {
  s.lki[sourceId] = { ...snapshot(s, sourceId), ...lki };
  s.battlefield = s.battlefield.filter((x) => x !== sourceId);
  delete s.objects[sourceId];
  s.version += 1;
}

describe("ObjectFilter.compare : comparaisons dynamiques (un champ retiré par test)", () => {
  it("powerAboveSource → cmp.power('>', amount.sourcePower) : force supérieure, sans plancher, d'après les dernières informations", () => {
    const f = { compare: [cmp.power(">", amount.sourcePower)] };
    let s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Trois"]);
    s = board(-1);
    expect(matching(s, f, id(s, "Source -1"))).toEqual(["Deux", "Trois", "Un", "Zéro"]);
    s = board(2);
    const src = id(s, "Source 2");
    leave(s, src, { power: 1 });
    expect(matching(s, f, src)).toEqual(["Deux", "Trois"]);
    // Sans source : 0.
    expect(matching(s, f, undefined)).toEqual(["Deux", "Trois", "Un"]);
  });

  it("powerBelowSource → cmp.power('<', amount.sourcePower) : force inférieure (Formation Breaker)", () => {
    const f = { compare: [cmp.power("<", amount.sourcePower)] };
    const s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Un", "Zéro"]);
    const t = board(-1);
    expect(matching(t, f, id(t, "Source -1"))).toEqual([]);
  });

  it("powerAboveOf → cmp.power('>', amount.rawPowerOf(ref)) : force supérieure à celle de la cible, à la résolution", () => {
    const f = { types: ["Creature" as const], compare: [cmp.power(">", amount.rawPowerOf(ref.target()))] };
    const s = board(5, [creature("Moins un", -1, 5)]);
    const src = id(s, "Source 5");
    const names = (g: ObjectFilter) => matching(s, g, src);
    expect(names(withX(s, f, resolving(s, src, 0, { t: [id(s, "Deux")] })))).toEqual(["Trois"]);
    // Force négative : sans plancher (une créature de force 0 a une force supérieure).
    expect(names(withX(s, f, resolving(s, src, 0, { t: [id(s, "Moins un")] })))).toEqual(["Deux", "Trois", "Un", "Zéro"]);
    // Sans créature désignée sur le champ de bataille, rien ne correspond.
    expect(names(withX(s, f, resolving(s, src, 0, { t: [] })))).toEqual([]);
  });

  it("manaValueSourcePower → cmp.manaValue('=', amount.sourcePower) : valeur de mana égale à la force (Jackal)", () => {
    const f = { compare: [cmp.manaValue("=", amount.sourcePower)] };
    const s = board(2);
    expect(matching(s, f, id(s, "Source 2"))).toEqual(["Deux"]);
  });

  it("maxManaValueSourcePower → cmp.manaValue('<=', amount.sourcePower) : au plus la force (Alesha), dernières informations", () => {
    const f = { compare: [cmp.manaValue("<=", amount.sourcePower)] };
    const s = board(2);
    const src = id(s, "Source 2");
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zéro"]);
    leave(s, src, { power: 1 });
    expect(matching(s, f, src)).toEqual(["Un", "Zéro"]);
  });

  it("maxManaValueSourcePower (Loki Laufeyson) : la borne figée à la résolution ne descend pas sous 0", () => {
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

  it("manaValueSourceCounters → cmp.manaValue('=', amount.lkiCounters(sorte)) : marqueurs de la source (Blast Zone)", () => {
    const f = { compare: [cmp.manaValue("=", amount.lkiCounters("charge"))] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zéro"]);
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
    expect(matching(s, f, src)).toEqual(["Un", "Zéro"]);
  });

  it("maxManaValueManaSpent → cmp.manaValue('<=', amount.sourceManaSpent) : permanent, dernières informations (Astelli)", () => {
    const f = { compare: [cmp.manaValue("<=", amount.sourceManaSpent)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zéro"]);
    s.objects[src]!.cast = { manaSpent: 2 } as never;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zéro"]);
    leave(s, src, { manaSpent: 1 });
    expect(matching(s, f, src)).toEqual(["Un", "Zéro"]);
  });

  it("maxManaValueColorsSpent → cmp.manaValue('<=', amount.colorsSpent) : convergence (Sundering Archaic)", () => {
    const f = { compare: [cmp.manaValue("<=", amount.colorsSpent)] };
    const s = board(1);
    const src = id(s, "Source 1");
    s.objects[src]!.cast = { spentColors: { W: 1, U: 2, B: 0 } } as never;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zéro"]);
  });

  it("maxManaValueX → cmp.manaValue('<=', amount.x) : le X de la capacité à la résolution, sinon celui du permanent", () => {
    const f = { compare: [cmp.manaValue("<=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, f, src)).toEqual(["Zéro"]);
    s.objects[src]!.x = 2;
    expect(matching(s, f, src)).toEqual(["Deux", "Un", "Zéro"]);
    expect(matching(s, withX(s, f, resolving(s, src, 1)), src)).toEqual(["Un", "Zéro"]);
    // Une carte (cimetière, bibliothèque) : même comparaison.
    const t = scenario({ p1: { battlefield: [SOURCE(1)], graveyard: [P1, P3] } });
    const tsrc = id(t, "Source 1");
    t.objects[tsrc]!.x = 2;
    const cards = (t.players.p1?.graveyard ?? []).filter((x) => matchesCard(t, "p1", x, f, tsrc));
    expect(cards.map((x) => t.defs[t.objects[x]?.defId ?? ""]?.name)).toEqual(["Un"]);
  });

  it("maxToughnessX → cmp.toughness('<=', amount.x) : endurance au plus X à la résolution (Zero Point Ballad)", () => {
    const f = { compare: [cmp.toughness("<=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, withX(s, f, resolving(s, src, 2)), src)).toEqual(["Deux", "Trois"]);
  });

  it("manaValueX → cmp.manaValue('=', amount.x) : valeur de mana égale à X à la résolution (Dauntless Dismantler)", () => {
    const f = { compare: [cmp.manaValue("=", amount.x)] };
    const s = board(1);
    const src = id(s, "Source 1");
    expect(matching(s, withX(s, f, resolving(s, src, 3)), src)).toEqual(["Trois"]);
    expect(matching(s, withX(s, f, resolving(s, src, 0)), src)).toEqual(["Zéro"]);
  });

  it("toughnessAbovePower → cmp.toughness('>', 'power') : endurance supérieure à sa force (Fecund Greenshell)", () => {
    const f = { compare: [cmp.toughness(">", "power")] };
    const s = board(1);
    expect(matching(s, f)).toEqual(["Un", "Zéro"]);
    // Lu aussi directement sur une vue (déclencheurs).
    expect(matchesView(snapshot(s, id(s, "Un")), f, "p1")).toBe(true);
    expect(matchesView(snapshot(s, id(s, "Deux")), f, "p1")).toBe(false);
  });

  it("powerAboveBase → cmp.power('>', 'basePower') : force supérieure à sa force de base (Kutzil)", () => {
    const f = { compare: [cmp.power(">", "basePower")] };
    const s = board(1);
    expect(matching(s, f)).toEqual([]);
    (s.objects[id(s, "Deux")] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
    s.version += 1;
    expect(matching(s, f)).toEqual(["Deux"]);
  });

  it("manaValueParity → cmp.parity : valeur de mana paire ou impaire (Mutinous Massacre), parité choisie (Gollum)", () => {
    const s = board(1);
    expect(matching(s, { compare: [cmp.parity("odd")] })).toEqual(["Trois", "Un"]);
    expect(matching(s, { compare: [cmp.parity("even")] })).toEqual(["Deux", "Zéro"]);
    expect(withChosen({ parityChosen: true }, { chosen: { parity: "odd" } })).toEqual({
      compare: [{ what: "manaValue", cmp: "odd" }],
    });
    // Sans choix : pair.
    expect(matching(s, withChosen({ parityChosen: true }, {}))).toEqual(["Deux", "Zéro"]);
  });

  it("un montant non résolu (filtre lu directement sur une vue) est ignoré, comme les anciens champs", () => {
    const s = board(2);
    expect(matchesView(snapshot(s, id(s, "Un")), { compare: [cmp.power(">", amount.sourcePower)] }, "p1")).toBe(true);
  });
});

describe("ObjectFilter.attached et crew : attaches et équipage (un champ retiré par test)", () => {
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

  it("attachedToSource → attached: 'host' : le permanent auquel la source est attachée", () => {
    const { s, src, un } = attachedBoard();
    expect(all(s, { attached: "host" }, src)).toEqual([]);
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "host" }, src)).toEqual(["Un"]);
    expect(all(s, { attached: "host" })).toEqual([]);
  });

  it("notAttachedToSource → attached: 'notHost' : tout autre que lui (sans source : tous)", () => {
    const { s, src, un } = attachedBoard();
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { types: ["Creature"], attached: "notHost" }, src)).toEqual(["Deux", "Trois", "Zéro"]);
    expect(all(s, { types: ["Creature"], attached: "notHost" })).toEqual(["Deux", "Trois", "Un", "Zéro"]);
  });

  it("attachedToSelf → attached: 'toSource' : attaché à la source", () => {
    const { s, src, un } = attachedBoard();
    expect(all(s, { attached: "toSource" }, un)).toEqual([]);
    s.objects[src]!.attachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "toSource" }, un)).toEqual(["Test Aura"]);
    expect(matchesView(snapshot(s, src), { attached: "toSource" }, "p1", un)).toBe(true);
  });

  it("attachedToSourceHost → attached: 'toHost' : attaché au permanent auquel la source est attachée", () => {
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

  it("wasAttachedToSource → attached: 'wasToSource' : était attaché à la source quand elle est partie", () => {
    const { s, src, un } = attachedBoard();
    s.objects[src]!.lastAttachedTo = un;
    s.version += 1;
    expect(all(s, { attached: "wasToSource" }, un)).toEqual(["Test Aura"]);
    s.objects[src]!.attachedTo = id(s, "Deux");
    s.version += 1;
    expect(all(s, { attached: "wasToSource" }, un)).toEqual([]);
  });

  it("crewedBySource → crew: 'bySource' : un Véhicule que la source a piloté ce tour-ci", () => {
    const { s, un, deux } = attachedBoard();
    s.objects[deux]!.crewedBy = { turn: s.turn.number, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "bySource" }, un)).toEqual(["Deux"]);
    s.objects[deux]!.crewedBy = { turn: s.turn.number - 1, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "bySource" }, un)).toEqual([]);
  });

  it("crewedSource → crew: 'source' : une créature qui a piloté ou monté la source ce tour-ci", () => {
    const { s, un, deux } = attachedBoard();
    s.objects[deux]!.crewedBy = { turn: s.turn.number, ids: [un] };
    s.version += 1;
    expect(all(s, { crew: "source" }, deux)).toEqual(["Un"]);
    expect(all(s, { crew: "source" })).toEqual([]);
  });
});
