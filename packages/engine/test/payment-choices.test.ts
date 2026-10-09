/**
 * Payment choices (PLAN-L L7): Phyrexian mana paid with life or mana as the player chooses (107.4f), the color of a
 * hybrid symbol chosen for any hybrid cost (107.4e).
 */
import { describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import type { GameState } from "../src/types";
import { act, idOf, lands, scenario } from "./helpers";

const castOption = (s: GameState, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
const tappedLands = (s: GameState, name: string) =>
  s.battlefield.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === name && s.objects[id]?.tapped).length;

describe("payment choices (PLAN-L L7)", () => {
  it("Gut Shot: {R/P} paid with {R} or 2 life, as the player chooses", () => {
    const setup = () => scenario({ p1: { battlefield: ["Mountain"], hand: ["Gut Shot"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Gut Shot");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.phyrexianLife).toEqual([0, 1]);
    const cast = (life?: number) =>
      act(setup(), "p1", {
        type: "cast",
        card,
        targets: { t: ["p2"] },
        ...(life !== undefined ? { phyrexianLife: life } : {}),
      });
    // Without a choice: the mana pays first.
    const auto = cast();
    expect([auto.players.p1?.life, tappedLands(auto, "Mountain")]).toEqual([20, 1]);
    const life = cast(1);
    expect([life.players.p1?.life, tappedLands(life, "Mountain")]).toEqual([18, 0]);
    const mana = cast(0);
    expect([mana.players.p1?.life, tappedLands(mana, "Mountain")]).toEqual([20, 1]);
    // More symbols than the cost has: refused.
    expect(() => cast(2)).toThrow(RulesError);
  });

  it("K'rrik: three {B/P}, any number of them paid with life; not more life than the player has", () => {
    const setup = (life = 20) => {
      const s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: ["K'rrik, Son of Yawgmoth"] } });
      if (s.players.p1) s.players.p1.life = life;
      return s;
    };
    const s = setup();
    const card = idOf(s, "p1", "hand", "K'rrik, Son of Yawgmoth");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.phyrexianLife).toEqual([0, 1, 2, 3]);
    const two = act(setup(), "p1", { type: "cast", card, phyrexianLife: 2 });
    expect([two.players.p1?.life, tappedLands(two, "Swamp")]).toEqual([16, 5]);
    // 5 life: at most two symbols with life (paying life needs at least that much, 119.4).
    const low = setup(5);
    const lowOpt = castOption(low, card);
    expect(lowOpt?.type === "cast" && lowOpt.phyrexianLife).toEqual([0, 1, 2]);
    expect(() => act(setup(5), "p1", { type: "cast", card, phyrexianLife: 3 })).toThrow(RulesError);
  });

  it("only the mana: no choice offered when life can't pay (4 Swamps, 1 life)", () => {
    const s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Surgical Extraction"] }, p2: { graveyard: ["Shock"] } });
    if (s.players.p1) s.players.p1.life = 1;
    const opt = castOption(s, idOf(s, "p1", "hand", "Surgical Extraction"));
    expect(opt?.type).toBe("cast");
    expect(opt?.type === "cast" && opt.phyrexianLife).toBeUndefined();
  });

  it("hybrid: the color is chosen for any hybrid spell (Dryad Militant {G/W})", () => {
    const setup = () => scenario({ p1: { battlefield: ["Forest", "Plains"], hand: ["Dryad Militant"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Dryad Militant");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && [opt.hybridColors, opt.hybridMatters]).toEqual([["G", "W"], undefined]);
    const w = act(setup(), "p1", { type: "cast", card, hybridAs: "W" });
    expect([tappedLands(w, "Plains"), tappedLands(w, "Forest")]).toEqual([1, 0]);
    const g = act(setup(), "p1", { type: "cast", card, hybridAs: "G" });
    expect([tappedLands(g, "Plains"), tappedLands(g, "Forest")]).toEqual([0, 1]);
    expect(() => act(setup(), "p1", { type: "cast", card, hybridAs: "U" })).toThrow(RulesError);
  });
});
