/**
 * Decks du méta Standard (plan P4, `docs/meta/2026-09-29/`) : tous leurs noms de cartes sont reconnus, et les decks des
 * lots terminés sont légaux et jouables, réserve comprise (le BO3 en a besoin). La liste grandit à chaque lot.
 */
import { describe, expect, it } from "vitest";
import { metaDecks } from "../../../tools/meta-decks";

/** Decks rendus jouables par les lots du méta déjà faits (PLAN-P4.md). */
const PLAYABLE = [
  // Lot M1
  "Izzet Spellementals",
  "Mono-Green Landfall",
];

describe("decks du méta", () => {
  const decks = metaDecks();

  it("les vingt archétypes sont lus, sans carte inconnue", () => {
    expect(decks).toHaveLength(20);
    for (const d of decks) expect(d.unknown, d.name).toEqual([]);
  });

  it.each(PLAYABLE)("%s est légal et jouable, réserve comprise", (name) => {
    const d = decks.find((x) => x.name === name);
    expect(d?.playable).toBe(true);
  });
});
