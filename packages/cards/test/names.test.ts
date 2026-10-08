/**
 * Name catalog (the engine's "name" questions): all cards and their faces; the official list of creature types
 * (205.3m, in the engine) covers every type of the catalog's cards and tokens.
 */
import { CREATURE_TYPES } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { CARDS, nameCatalog, TOKEN_SPECS } from "../src";

/** Artifact and enchantment subtypes (205.3g, 205.3h) carried by artifact creatures or enchantments. */
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

describe("name catalog", () => {
  it("all cards and each of their faces; lands apart", () => {
    const c = nameCatalog();
    expect(c.cards).toContain("Llanowar Elves");
    expect(c.cards).toContain("Riling Dawnbreaker");
    expect(c.cards).toContain("Signaling Roar");
    expect(c.lands).toContain("Steam Vents");
    expect(c.lands).not.toContain("Shock");
    expect(c.lands.every((n) => c.cards.includes(n))).toBe(true);
    expect(new Set(c.cards).size).toBe(c.cards.length);
  });

  it("every creature type of a card or token is in the official list (205.3m)", () => {
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
