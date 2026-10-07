/**
 * Catalogue des noms (questions « nom » du moteur) : toutes les cartes et leurs faces ; la liste officielle des types de
 * créature (205.3m, dans le moteur) couvre tous les types des cartes et des jetons du catalogue.
 */
import { CREATURE_TYPES } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { CARDS, nameCatalog, TOKEN_SPECS } from "../src";

/** Sous-types d'artefact et d'enchantement (205.3g, 205.3h) que portent des créatures-artefacts ou des enchantements. */
const NON_CREATURE_SUBTYPES = new Set([
  "Attraction",
  "Blood",
  "Bobblehead",
  "Book",
  "Clue",
  "Contraption",
  "Equipment",
  "Food",
  "Fortification",
  "Gold",
  "Heartwood",
  "Incubator",
  "Infinity",
  "Junk",
  "Lander",
  "Map",
  "Mutagen",
  "Powerstone",
  "Spacecraft",
  "Stone",
  "Treasure",
  "Vehicle",
  "Vibranium",
  "Aura",
  "Background",
  "Cartouche",
  "Case",
  "Class",
  "Curse",
  "Plan",
  "Role",
  "Room",
  "Rune",
  "Saga",
  "Shard",
  "Shrine",
]);

describe("catalogue des noms", () => {
  it("toutes les cartes et chacune de leurs faces ; les terrains à part", () => {
    const c = nameCatalog();
    expect(c.cards).toContain("Llanowar Elves");
    expect(c.cards).toContain("Riling Dawnbreaker");
    expect(c.cards).toContain("Signaling Roar");
    expect(c.lands).toContain("Steam Vents");
    expect(c.lands).not.toContain("Shock");
    expect(c.lands.every((n) => c.cards.includes(n))).toBe(true);
    expect(new Set(c.cards).size).toBe(c.cards.length);
  });

  it("chaque type de créature d'une carte ou d'un jeton est dans la liste officielle (205.3m)", () => {
    const types = new Set(CREATURE_TYPES);
    const missing = new Set<string>();
    for (const card of Object.values(CARDS))
      for (const d of [card, ...(card.faceDefs ?? [])])
        if (d.types.includes("Creature") || /Kindred|Tribal/.test(d.typeLine))
          for (const t of d.subtypes) if (!types.has(t) && !NON_CREATURE_SUBTYPES.has(t)) missing.add(`${t} (${d.name})`);
    for (const [name, spec] of Object.entries(TOKEN_SPECS))
      if (spec.types?.includes("Creature"))
        for (const t of spec.subtypes ?? []) if (!types.has(t) && !NON_CREATURE_SUBTYPES.has(t)) missing.add(`${t} (${name})`);
    expect([...missing]).toEqual([]);
  });
});
