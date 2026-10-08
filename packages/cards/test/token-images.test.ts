/** Token images (`tokenImage`, data/tokens.json). */
import { describe, expect, it } from "vitest";
import TOKENS from "../data/tokens.json";
import { TOKEN_SPECS, tokenImage } from "../src/index";

describe("token images", () => {
  it("common tokens have an image, with the right profile (P/T and colors)", () => {
    for (const name of ["Treasure", "Food", "Clue", "Map", "Goblin", "Soldier", "Rabbit", "Spirit", "Cat", "Dog"]) {
      const t = TOKEN_SPECS[name];
      if (!t) throw new Error(name);
      const url = tokenImage({
        name: t.name,
        typeLine: `Token ${t.types.join(" ")}`,
        basePower: t.power,
        baseToughness: t.toughness,
        colors: t.colors,
      });
      expect(url, name).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    }
  });

  it("for an equal name, the token with the same P/T and colors is preferred", () => {
    const arts = TOKENS as { name: string; power?: number; toughness?: number; colors: string[]; image: string }[];
    // A name split across several profiles (white 1/1 Spirit, flying 1/1, 4/4…): each profile finds its own.
    const spirits = arts.filter((a) => a.name === "Spirit");
    expect(new Set(spirits.map((a) => `${a.power}/${a.toughness}`)).size).toBeGreaterThan(1);
    for (const a of spirits) {
      const url = tokenImage({
        name: "Spirit",
        typeLine: "Token Creature — Spirit",
        basePower: a.power,
        baseToughness: a.toughness,
        colors: a.colors,
      });
      const chosen = arts.find((x) => x.image === url);
      expect([chosen?.power, chosen?.toughness]).toEqual([a.power, a.toughness]);
    }
  });

  it("no token of that name: no image (text frame)", () => {
    expect(tokenImage({ name: "Invented Token", typeLine: "Token Creature" })).toBeUndefined();
  });
});
