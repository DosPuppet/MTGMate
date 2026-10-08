/**
 * Standard meta decks (plan P4, `docs/meta/2026-09-29/`): all their card names are recognized, and the decks of the
 * finished lots are legal and playable, sideboard included (BO3 needs it). The list grows with each lot.
 */
import { describe, expect, it } from "vitest";
import { metaDecks } from "../../../tools/meta-decks";
import { CARDS, DECKS, type DeckEntries, validateDeck } from "../src";

/** Decks made playable by the meta lots already done (PLAN-P4 in docs/history.md). */
const PLAYABLE = [
  // Lot M1
  "Izzet Spellementals",
  "Mono-Green Landfall",
  // Lot M2
  "Dimir Midrange",
  "Jund Sacrifice",
  // Lot M3
  "Dimir Excruciator",
  "Azorius Control",
  "Selesnya Landfall",
  // Lot M4
  "4c Control",
  "Boros Dragons",
  "Jeskai Artifacts",
  // Lot M5
  "Boros Dwarves",
  "Lifegain",
  "Mardu Discard",
  "Boros Tokens",
  // Lot M6
  "Izzet Aggro",
  "Mono-Black Aggro",
  "Azorius Momo",
  "Golgari Midrange",
  "Bant Airbending Combo",
  "Jeskai Control",
];

describe("meta decks", () => {
  const decks = metaDecks();

  it("the twenty archetypes are read, with no unknown card", () => {
    expect(decks).toHaveLength(20);
    for (const d of decks) expect(d.unknown, d.name).toEqual([]);
  });

  it("phase 1 is over: the twenty archetypes are playable", () => {
    expect(PLAYABLE).toHaveLength(20);
  });

  it.each(PLAYABLE)("%s is legal and playable, sideboard included", (name) => {
    const d = decks.find((x) => x.name === name);
    expect(d?.playable).toBe(true);
  });
});

describe("meta precon decks", () => {
  const prebuilt = DECKS.filter((d) => d.id.startsWith("meta-"));
  const total = (l: DeckEntries) => {
    const m = new Map<string, number>();
    for (const [n, x] of l) m.set(x, (m.get(x) ?? 0) + n);
    return [...m].sort(([a], [b]) => (a < b ? -1 : 1));
  };

  it("the first five archetypes, in meta order", () => {
    expect(prebuilt.map((d) => d.name)).toEqual([
      "Izzet Spellementals",
      "Mono-Green Landfall",
      "Dimir Midrange",
      "Jund Sacrifice",
      "4c Control",
    ]);
  });

  it.each(prebuilt.map((d) => [d.name, d] as const))(
    "%s: legal, playable, identical to the list, with an illustration",
    (name, d) => {
      const v = validateDeck(d, CARDS);
      expect(v.errors).toEqual([]);
      expect(v.playable).toBe(true);
      expect(d.cover).toBeTruthy();
      const listed = metaDecks().find((x) => x.name === name);
      expect(total(d.main)).toEqual(total(listed?.main ?? []));
      expect(total(d.sideboard ?? [])).toEqual(total(listed?.sideboard ?? []));
    },
  );
});
