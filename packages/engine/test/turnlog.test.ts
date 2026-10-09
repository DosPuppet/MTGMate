/** Turn event log (`turnlog.ts`): recording by the engine and card queries. */
import { describe, expect, it } from "vitest";
import { dealDamage, sacrifice, sourceFromObject } from "../src/actions";
import { announceDiscard, moveDiscarded } from "../src/effects";
import { changeCounters, moveObject, obj, tapObject, untapObject } from "../src/state";
import { matchesObjectFilter } from "../src/targets";
import { countersPutThisTurn, countTurnEvents, objectDidThisTurn, objectTurnEvents } from "../src/turnlog";
import type { TurnLogQuery } from "../src/types";
import { act, advanceUntil, canActivate, idOf, passBoth, scenario } from "./helpers";

describe("turn log", () => {
  it('filter: an object-specific field in `not` or `anyOf` is evaluated ("a creature that didn\'t attack this turn")', () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Savannah Lions"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    s.turnLog.push({ e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: ["Bear"], id: cub });
    const notAttacked = { types: ["Creature" as const], not: { attackedThisTurn: true } };
    expect(matchesObjectFilter(s, "p1", cub, notAttacked)).toBe(false);
    expect(matchesObjectFilter(s, "p1", lions, notAttacked)).toBe(true);
    const attackedOrLions = { anyOf: [{ attackedThisTurn: true }, { subtype: "Cat" }] };
    expect(matchesObjectFilter(s, "p1", cub, attackedOrLions)).toBe(true);
    expect(matchesObjectFilter(s, "p1", lions, attackedOrLions)).toBe(true);
  });

  it("opposing creatures exiled from the battlefield (Vren)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Bear Cub", "Forest"] } });
    moveObject(s, idOf(s, "p2", "battlefield", "Bear Cub"), "exile");
    moveObject(s, idOf(s, "p2", "battlefield", "Forest"), "exile");
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "exile");
    const q: TurnLogQuery = { event: "zone", from: "battlefield", to: "exile", types: ["Creature"], who: "opponent" };
    expect(countTurnEvents(s, q, "p1")).toBe(1);
    expect(countTurnEvents(s, q, "p2")).toBe(1);
  });

  it("Food sacrificed, spell cast from hand", () => {
    let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Llanowar Elves"] } });
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p1")).toBe(0);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p1")).toBe(1);
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p2")).toBe(0);
    const t = scenario({ p1: { battlefield: ["Forest"] } });
    sacrifice(t, idOf(t, "p1", "battlefield", "Forest"));
    expect(countTurnEvents(t, { event: "sacrifice", who: "you" }, "p1")).toBe(1);
    expect(countTurnEvents(t, { event: "sacrifice", who: "you", subtype: "Food" }, "p1")).toBe(0);
  });

  it("combat damage per player (the greatest total) and sources", () => {
    const s = scenario({ p1: { battlefield: ["Shivan Dragon", "Bear Cub"] } });
    const dragon = sourceFromObject(s, idOf(s, "p1", "battlefield", "Shivan Dragon"));
    const cub = sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    dealDamage(s, dragon, "p2", 5, true);
    dealDamage(s, cub, "p2", 2, true);
    dealDamage(s, cub, "p1", 3, false);
    const combat: TurnLogQuery = { event: "damage", toPlayer: true, combat: true, sum: true, perPlayer: true };
    expect(countTurnEvents(s, combat, "p1")).toBe(7);
    expect(countTurnEvents(s, { event: "damage", sum: true, source: { colors: ["R"], controller: "you" } }, "p1")).toBe(5);
    expect(countTurnEvents(s, { event: "damage", combat: false, who: "you", sum: true }, "p1")).toBe(3);
  });

  it("the log resets at the next turn", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "graveyard");
    expect(s.turnLog.length).toBeGreaterThan(0);
    const turn = s.turn.number;
    s = advanceUntil(s, (x) => x.turn.number === turn + 1 && x.turn.step === "upkeep");
    // The new turn's draw isn't in it (library → hand: hidden information).
    expect(s.turnLog).toEqual([]);
  });

  // PLAN-H H11: the former "this turn" object fields are log entries keyed by its identifier; an object
  // that changes zone is a new object (400.7), without the old one's entries.
  it("606.3: one loyalty ability per turn; back on the battlefield, it's a new object (400.7)", () => {
    let s = scenario({ p1: { battlefield: ["Ajani, Caller of the Pride", "Bear Cub"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani, Caller of the Pride");
    s = act(s, "p1", { type: "activate", source: ajani, ability: 0, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } });
    s = passBoth(s);
    expect(canActivate(s, "p1", ajani)).toBe(false);
    const back = moveObject(s, moveObject(s, ajani, "hand") ?? "", "battlefield") ?? "";
    expect(objectDidThisTurn(s, back, "activate")).toBe(false);
    expect(canActivate(s, "p1", back)).toBe(true);
  });

  it("counters put this turn, per player and per kind; taps; discard (chaos)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"], hand: ["Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(countersPutThisTurn(s, bear)).toEqual([]);
    changeCounters(s, obj(s, bear), "+1/+1", 1);
    changeCounters(s, obj(s, bear), "+1/+1", 1);
    expect(countersPutThisTurn(s, bear)).toEqual(["p1|+1/+1"]);
    expect(matchesObjectFilter(s, "p1", bear, { countersPutByYouThisTurn: "+1/+1" })).toBe(true);
    expect(matchesObjectFilter(s, "p2", bear, { countersPutByYouThisTurn: true })).toBe(false);
    tapObject(s, obj(s, bear));
    untapObject(s, obj(s, bear));
    tapObject(s, obj(s, bear));
    expect(objectTurnEvents(s, bear).filter((e) => e.e === "tap")).toHaveLength(2);
    const again = moveObject(s, moveObject(s, bear, "hand") ?? "", "battlefield") ?? "";
    expect(countersPutThisTurn(s, again)).toEqual([]);
    expect(matchesObjectFilter(s, "p1", again, { countersPutByYouThisTurn: true })).toBe(false);
    expect(objectDidThisTurn(s, again, "tap")).toBe(false);
    const forest = idOf(s, "p1", "hand", "Forest");
    const discarded = moveDiscarded(s, "p1", forest);
    announceDiscard(s, "p1", discarded);
    expect(objectDidThisTurn(s, discarded ?? "", "discard")).toBe(true);
    expect(objectDidThisTurn(s, forest, "discard")).toBe(false);
  });
});
