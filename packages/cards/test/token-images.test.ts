/** Images des jetons (`tokenImage`, data/tokens.json). */
import { describe, expect, it } from "vitest";
import TOKENS from "../data/tokens.json";
import { TOKEN_SPECS, tokenImage } from "../src/index";

describe("images des jetons", () => {
  it("les jetons courants ont une image, au bon profil (F/E et couleurs)", () => {
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

  it("à nom égal, le jeton aux mêmes F/E et couleurs est préféré", () => {
    const arts = TOKENS as { name: string; power?: number; toughness?: number; colors: string[]; image: string }[];
    // Un nom décliné en plusieurs profils (Spirit 1/1 blanc, 1/1 volant, 4/4…) : chaque profil retrouve le sien.
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

  it("aucun jeton de ce nom : pas d'image (cadre texte)", () => {
    expect(tokenImage({ name: "Jeton inventé", typeLine: "Token Creature" })).toBeUndefined();
  });
});
