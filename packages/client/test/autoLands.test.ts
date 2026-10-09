import type { DeckEntries } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { colorPips, withBasicLands } from "../src/decks/autoLands";

const total = (d: DeckEntries | null) => (d ?? []).reduce((a, [n]) => a + n, 0);
const basics = (d: DeckEntries | null) =>
  Object.fromEntries(
    (d ?? []).filter(([, n]) => /^(Plains|Island|Swamp|Mountain|Forest)$/.test(n)).map(([n, name]) => [name, n]),
  );

describe("automatic basic lands (PLAN-L L9)", () => {
  it("counts the colored symbols of the spells, lands excluded", () => {
    expect(
      colorPips([
        [4, "Lightning Strike"],
        [2, "Serra Angel"],
        [3, "Forest"],
      ]),
    ).toMatchObject({ R: 4, W: 4, G: 0 });
  });

  it("fills to the deck size by the symbols' shares; the other cards stay", () => {
    // 24 cards: 12 red, 12 white and 6 green symbols; 36 lands: 14.4, 14.4, 7.2, the remainder to the first.
    const main: DeckEntries = [
      [12, "Lightning Strike"],
      [6, "Serra Angel"],
      [6, "Bear Cub"],
      [5, "Plains"],
    ];
    const out = withBasicLands(main, 60);
    expect(total(out)).toBe(60);
    expect(out?.find(([, n]) => n === "Lightning Strike")?.[0]).toBe(12);
    expect(basics(out)).toEqual({ Plains: 15, Mountain: 14, Forest: 7 });
  });

  it("at least one land of each color used; the printing of a basic already there is kept", () => {
    const out = withBasicLands(
      [
        [20, "Lightning Strike"],
        [1, "Serra Angel"],
        [10, "Mountain", "custom"],
      ],
      40,
    );
    expect(basics(out).Plains).toBeGreaterThanOrEqual(1);
    expect(out?.find(([, n]) => n === "Mountain")?.[2]).toBe("custom");
  });

  it("Commander: only the colors of the identity; no room or no color: nothing", () => {
    const out = withBasicLands(
      [
        [10, "Lightning Strike"],
        [10, "Serra Angel"],
      ],
      99,
      ["R"],
    );
    expect(basics(out)).toEqual({ Mountain: 79 });
    expect(withBasicLands([[60, "Lightning Strike"]], 60)).toBeNull();
    expect(withBasicLands([[10, "Ornithopter"]], 60)).toBeNull();
  });
});
