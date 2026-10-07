import { CARDS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { frenchName, nameLabel, searchNames } from "../src/names";

describe("recherche d'un nom (question « nom »)", () => {
  const fr = CARDS["Llanowar Elves"]?.fr?.name as string;

  it("nom français d'abord, sans accents ni majuscules ; la réponse est le nom anglais", () => {
    expect(fr).toBeTruthy();
    expect(frenchName("Llanowar Elves")).toBe(fr);
    expect(searchNames("card", fr.toUpperCase(), "fr")[0]).toBe("Llanowar Elves");
    expect(searchNames("card", "éLFES de llAnowar", "fr")).toContain("Llanowar Elves");
    expect(nameLabel("Llanowar Elves", "card", "fr")).toBe(fr);
    expect(nameLabel("Llanowar Elves", "card", "en")).toBe("Llanowar Elves");
  });

  it("le nom anglais est aussi trouvé, après les noms français qui correspondent", () => {
    const hits = searchNames("card", "llanowar elves", "fr");
    expect(hits).toContain("Llanowar Elves");
    expect(searchNames("card", "llanowar", "en")[0]?.startsWith("Llanowar")).toBe(true);
  });

  it("terrains : seulement des cartes de terrain ; types de créature : la liste officielle", () => {
    expect(searchNames("land", "steam vents", "fr")).toContain("Steam Vents");
    expect(searchNames("land", "shock", "en")).not.toContain("Shock");
    expect(searchNames("creatureType", "gob", "fr")[0]).toBe("Goblin");
    expect(searchNames("creatureType", "time", "fr")).toContain("Time Lord");
  });

  it("recherche vide : aucun résultat ; au plus `limit` résultats", () => {
    expect(searchNames("card", "  ", "fr")).toEqual([]);
    expect(searchNames("card", "a", "fr", 25)).toHaveLength(25);
  });
});
