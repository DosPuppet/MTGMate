import type { GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { zoneGroups } from "../src/prompts/ZoneTabs";

const card = (id: string, owner: string, zone: string) => ({ id, owner, zone }) as unknown as ObjectView;
const view = {
  viewer: "p2",
  players: { p1: { name: "Alice" }, p2: { name: "Vous" }, p3: { name: "Chloé" } }, // i18n-ignore: French interface names
} as unknown as GameView;

describe("zone tabs", () => {
  it("one group per graveyard (yours first), then exile; zones with no option do not appear", () => {
    const objects = [
      card("a", "p1", "graveyard"),
      card("b", "p2", "graveyard"),
      card("c", "p1", "graveyard"),
      card("d", "p3", "exile"),
    ];
    expect(zoneGroups(view, objects, ["a", "b", "c", "d"])).toEqual([
      { key: "gy:p2", label: "Votre cimetière", ids: ["b"] }, // i18n-ignore: French interface label
      { key: "gy:p1", label: "Cimetière d'Alice", ids: ["a", "c"] }, // i18n-ignore: French interface label
      { key: "exile", label: "Exil", ids: ["d"] },
    ]);
  });

  it("a single graveyard, or options outside the graveyards: a single group", () => {
    expect(zoneGroups(view, [card("a", "p1", "graveyard")], ["a"])).toHaveLength(1);
    expect(zoneGroups(view, [card("x", "p2", "library")], ["x", "p1"])).toEqual([
      { key: "other", label: "Autres", ids: ["x", "p1"] },
    ]);
  });
});
