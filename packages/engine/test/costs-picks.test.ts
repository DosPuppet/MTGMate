/**
 * Objects paid as a cost, chosen by the player (PLAN-C in docs/history.md, lots C7 and C8): `legalActions` offers the choices
 * (`picks`), the engine applies the player's or, failing that, its own suggestion, and refuses an invalid choice.
 */
import { describe, expect, it } from "vitest";
import { fx, ref, spell, target } from "../src/dsl";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import type { ActionOption, GameState } from "../src/types";
import { act, customCard, idOf, lands, scenario, settle } from "./helpers";

const activation = (s: GameState, source: string, label: string) =>
  legalActions(s, "p1").find(
    (a): a is Extract<ActionOption, { type: "activate" }> =>
      a.type === "activate" && a.source === source && !!a.label?.includes(label),
  );
const bear = (name: string, power = 2, toughness = 2) => customCard({ name, power, toughness });

describe("objects paid as a cost, chosen by the player", () => {
  it("blight as a cost: the chosen creature gets the counter, otherwise the engine's suggestion", () => {
    const base = { battlefield: ["Dawnhand Dissident", bear("Petit", 2, 2), bear("Gros", 4, 4)] };
    let s = scenario({ p1: base });
    const dissident = idOf(s, "p1", "battlefield", "Dawnhand Dissident");
    const [petit, gros] = [idOf(s, "p1", "battlefield", "Petit"), idOf(s, "p1", "battlefield", "Gros")];
    const option = activation(s, dissident, "surveil");
    const pick = option?.picks?.find((p) => p.slot === "blight");
    expect(pick?.options).toEqual(expect.arrayContaining([petit, gros]));
    // Suggestion: a creature that survives (the sturdiest).
    expect(pick?.suggested).toEqual([gros]);
    s = act(s, "p1", {
      type: "activate",
      source: dissident,
      ability: option?.ability ?? -1,
      targets: {},
      picks: { blight: [petit] },
    });
    expect(s.objects[petit]?.counters["-1/-1"]).toBe(1);
    expect(s.objects[gros]?.counters["-1/-1"]).toBeUndefined();
    // Without a choice: the suggestion.
    let t = scenario({ p1: base });
    const d2 = idOf(t, "p1", "battlefield", "Dawnhand Dissident");
    t = act(t, "p1", { type: "activate", source: d2, ability: activation(t, d2, "surveil")?.ability ?? -1, targets: {} });
    expect(t.objects[idOf(t, "p1", "battlefield", "Gros")]?.counters["-1/-1"]).toBe(1);
  });

  it("an invalid choice is refused (object outside the options, wrong number)", () => {
    const s = scenario({
      p1: { battlefield: ["Dawnhand Dissident", bear("Petit", 1, 1)] },
      p2: { battlefield: [bear("Ennemi")] },
    });
    const dissident = idOf(s, "p1", "battlefield", "Dawnhand Dissident");
    const ability = activation(s, dissident, "surveillance")?.ability ?? -1;
    const enemy = idOf(s, "p2", "battlefield", "Ennemi");
    const petit = idOf(s, "p1", "battlefield", "Petit");
    expect(() => act(s, "p1", { type: "activate", source: dissident, ability, targets: {}, picks: { blight: [enemy] } })).toThrow(
      RulesError,
    );
    expect(() =>
      act(s, "p1", { type: "activate", source: dissident, ability, targets: {}, picks: { blight: [petit, dissident] } }),
    ).toThrow(RulesError);
  });

  it("collect evidence: the chosen cards, of sufficient total mana value (Polygraph Orb)", () => {
    let s = scenario({
      p1: { battlefield: ["Polygraph Orb", ...lands("Island", 2)], graveyard: ["Opt", "Opt", "Opt", "Lightning Strike"] },
    });
    const orb = idOf(s, "p1", "battlefield", "Polygraph Orb");
    const option = activation(s, orb, "loses 3 life");
    const pick = option?.picks?.find((p) => p.slot === "evidence");
    expect(pick?.minTotal?.n).toBe(3);
    const opts = s.players.p1?.graveyard.filter((id) => s.objects[id]?.defId === "opt") ?? [];
    // Three Opt (value 1 each) rather than Lightning Strike (value 2... insufficient alone).
    expect(() =>
      act(s, "p1", {
        type: "activate",
        source: orb,
        ability: option?.ability ?? -1,
        targets: {},
        picks: { evidence: opts.slice(0, 2) },
      }),
    ).toThrow(RulesError);
    s = act(s, "p1", { type: "activate", source: orb, ability: option?.ability ?? -1, targets: {}, picks: { evidence: opts } });
    expect(s.players.p1?.graveyard.map((id) => s.objects[id]?.defId)).toEqual(["lightning-strike"]);
  });

  it("convoke: the chosen creatures pay (and all must be used), the others stay untapped", () => {
    const reds = ["Rouge A", "Rouge B", "Rouge C"].map((n) => customCard({ name: n, power: 1, toughness: 1, colors: ["R"] }));
    const base = { battlefield: [...lands("Mountain", 3), ...reds], hand: ["Collective Inferno"] };
    let s = scenario({ p1: base });
    const inferno = idOf(s, "p1", "hand", "Collective Inferno");
    const option = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === inferno,
    );
    const pick = option?.picks?.find((p) => p.slot === "convoke");
    expect(pick?.atMost).toBe(true);
    const [a, b, c] = ["Rouge A", "Rouge B", "Rouge C"].map((n) => idOf(s, "p1", "battlefield", n));
    // {3}{R}{R}: three Mountains and two chosen creatures.
    s = act(s, "p1", { type: "cast", card: inferno, picks: { convoke: [a as string, c as string] } });
    expect([a, b, c].map((id) => s.objects[id as string]?.tapped)).toEqual([true, false, true]);
    // Too many chosen creatures for the cost: refused.
    const t = scenario({ p1: { ...base, battlefield: [...lands("Mountain", 4), ...reds] } });
    const all = ["Rouge A", "Rouge B", "Rouge C"].map((n) => idOf(t, "p1", "battlefield", n));
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Collective Inferno"), picks: { convoke: all } }),
    ).not.toThrow();
    expect(() =>
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Collective Inferno"),
        picks: { convoke: [...all, idOf(t, "p1", "battlefield", "Mountain")] },
      }),
    ).toThrow(RulesError);
  });
});

describe('614.12: "as it enters, choose..." asked of the player (PLAN-C, lot C9)', () => {
  it("Cavern of Souls played: the type chosen while playing it, otherwise the default choice; a choice outside the options is refused", () => {
    let s = scenario({ p1: { hand: ["Cavern of Souls"] } });
    const cavern = idOf(s, "p1", "hand", "Cavern of Souls");
    const option = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "playLand" }> => a.type === "playLand" && a.card === cavern,
    );
    expect(option?.choose?.type).toBe("name");
    // The whole official list of types (205.3m), not only those of the decks in the game.
    s = act(s, "p1", { type: "playLand", card: cavern, chosen: "Phelddagrif" });
    expect(s.objects[idOf(s, "p1", "battlefield", "Cavern of Souls")]?.chosen).toEqual({ creatureType: "Phelddagrif" });
    s = scenario({ p1: { hand: ["Cavern of Souls"] } });
    expect(() => act(s, "p1", { type: "playLand", card: cavern, chosen: "Not a type" })).toThrow(RulesError);
    s = act(s, "p1", { type: "playLand", card: cavern, chosen: "Elf" });
    expect(s.objects[idOf(s, "p1", "battlefield", "Cavern of Souls")]?.chosen).toEqual({ creatureType: "Elf" });
    // Without a choice: the default choice, as before.
    let t = scenario({ p1: { hand: ["Cavern of Souls"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Cavern of Souls") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Cavern of Souls")]?.chosen?.creatureType).toBeDefined();
  });

  it("a permanent put onto the battlefield by an effect: the question is asked of its new controller", () => {
    const raise = customCard({
      name: "Rappel de test",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell([target.cardInGraveyard("t", { types: ["Land"] })], [fx.toBattlefield(ref.target())]),
    });
    let s = scenario({ p1: { hand: [raise], graveyard: ["Cavern of Souls"] } });
    const cavern = idOf(s, "p1", "graveyard", "Cavern of Souls");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rappel de test"), targets: { t: [cavern] } });
    let asked = false;
    s = settle(s, (req) => {
      if (req.intent !== "chooseOnEnter") return undefined;
      asked = true;
      return ["Goblin"];
    });
    expect(asked).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Cavern of Souls")]?.chosen).toEqual({ creatureType: "Goblin" });
  });
});

describe("Additional costs of a spell chosen by the player (lot K6)", () => {
  const castOpt = (s: GameState, name: string) =>
    legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  it("Fear of Isolation: the player chooses the permanent returned; without a choice, the engine's suggestion", () => {
    const setup = () =>
      scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub", "Serra Angel"], hand: ["Fear of Isolation"] } });
    let s = setup();
    const opt = castOpt(s, "Fear of Isolation");
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "costBounce") : undefined;
    expect(pick?.count).toBe(1);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(pick?.options).toContain(angel);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Isolation"), picks: { costBounce: [angel] } }));
    expect(idOf(s, "p1", "hand", "Serra Angel")).toBeDefined();
    expect(idOf(s, "p1", "battlefield", "Bear Cub")).toBeDefined();
    // An object outside the options is refused.
    const t = setup();
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Fear of Isolation"), picks: { costBounce: ["inconnu"] } }),
    ).toThrow(RulesError);
  });

  it("Abhorrent Oculus: the player chooses the six cards exiled from the graveyard", () => {
    const gy = ["Bear Cub", "Serra Angel", "Opt", "Shock", "Island", "Forest", "Swamp"];
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Abhorrent Oculus"], graveyard: gy } });
    const keep = idOf(s, "p1", "graveyard", "Serra Angel");
    const six = (s.players.p1?.graveyard ?? []).filter((id) => id !== keep);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Abhorrent Oculus"), picks: { costGraveyard: six } }));
    expect(s.players.p1?.graveyard).toEqual([keep]);
    expect(idOf(s, "p1", "battlefield", "Abhorrent Oculus")).toBeDefined();
  });
});
