import { CARDS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { frenchName, nameLabel, searchNames } from "../src/names";

describe("name search (the 'name' question)", () => {
  const fr = CARDS["Llanowar Elves"]?.fr?.name as string;

  it("French name first, ignoring accents and case; the answer is the English name", () => {
    expect(fr).toBeTruthy();
    expect(frenchName("Llanowar Elves")).toBe(fr);
    expect(searchNames("card", fr.toUpperCase(), "fr")[0]).toBe("Llanowar Elves");
    expect(searchNames("card", "éLFES de llAnowar", "fr")).toContain("Llanowar Elves"); // i18n-ignore: French search input
    expect(nameLabel("Llanowar Elves", "card", "fr")).toBe(fr);
    expect(nameLabel("Llanowar Elves", "card", "en")).toBe("Llanowar Elves");
  });

  it("the English name is also found, after the matching French names", () => {
    const hits = searchNames("card", "llanowar elves", "fr");
    expect(hits).toContain("Llanowar Elves");
    expect(searchNames("card", "llanowar", "en")[0]?.startsWith("Llanowar")).toBe(true);
  });

  it("lands: only land cards; creature types: the official list", () => {
    expect(searchNames("land", "steam vents", "fr")).toContain("Steam Vents");
    expect(searchNames("land", "shock", "en")).not.toContain("Shock");
    expect(searchNames("creatureType", "gob", "fr")[0]).toBe("Goblin");
    expect(searchNames("creatureType", "time", "fr")).toContain("Time Lord");
  });

  it("empty search: no result; at most `limit` results", () => {
    expect(searchNames("card", "  ", "fr")).toEqual([]);
    expect(searchNames("card", "a", "fr", 25)).toHaveLength(25);
  });
});
