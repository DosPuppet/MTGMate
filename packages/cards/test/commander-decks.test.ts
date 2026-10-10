/**
 * Commander (PLAN-E): the decks of `docs/commander/decks/` (100 cards, one commander, every name recognized), the
 * EDH pseudo-set imported by name (each card is defined there by EDH, with its original printing and Scryfall's color
 * identity) and the data of `commander.json`.
 */
import { describe, expect, it } from "vitest";
import { commanderDecks } from "../../../tools/commander-decks";
import commanderData from "../data/commander.json";
import edhData from "../data/edh.json";
import { CARDS, DECKS, type DeckEntries, SET_BY_CODE } from "../src";

describe("decks Commander", () => {
  const decks = commanderDecks();

  it("Commander decks: 100 cards, one commander or a pair, every name known to the catalog", () => {
    expect(decks.map((d) => d.id)).toEqual([
      "counter-blitz",
      "dark-leo",
      "edgar-markov",
      "fantastic-four",
      "mario-luigi",
      "multiverse-reforged",
      "mutant-menace",
      "rakdos",
      "sephiroth",
      "tevesh-jeska",
      "turtle-power",
      "ur-dragon",
      "ur-sphinx",
      "vision",
      "vivi",
      "yshtola",
    ]);
    for (const d of decks) {
      expect(d.unknown, d.id).toEqual([]);
      // One commander, or a pair (702.124: Mario & Luigi, two partners).
      expect([1, 2], d.id).toContain(d.commander.length);
      const count = [...d.commander, ...d.main].reduce((n, [k]) => n + k, 0);
      expect(count, d.id).toBe(100);
    }
  });

  it("Commander precons (cmd-<id>) match the decklists exactly", () => {
    for (const d of decks) {
      const precon = DECKS.find((x) => x.id === `cmd-${d.id}`);
      expect(precon?.format, d.id).toBe("commander");
      // The cards and their count; the printing may differ (precon with custom art).
      const names = (entries: DeckEntries | undefined) => entries?.map(([n, name]) => [n, name]);
      expect(names(precon?.commander)).toEqual(names(d.commander));
      expect(names(precon?.main)).toEqual(names(d.main));
    }
  });

  it("every deck card missing from the sets is defined by the EDH pseudo-set", () => {
    const names = new Set(edhData.map((c) => c.name));
    for (const d of decks)
      for (const [, name] of [...d.commander, ...d.main]) {
        const c = CARDS[name];
        expect(c, name).toBeDefined();
        if (c?.set === "EDH") expect(names.has(name), name).toBe(true);
      }
  });
});

describe("EDH pseudo-set (import by name)", () => {
  it("is imported by name, outside Standard, and each of its cards is defined there (no other set defines it)", () => {
    expect(SET_BY_CODE.EDH?.byName).toBeDefined();
    for (const raw of edhData) {
      expect(CARDS[raw.name]?.set, raw.name).toBe("EDH");
      expect(raw.legalities?.standard, raw.name).not.toBe("legal");
    }
  });

  it('each card keeps its original printing (export "(C17) 36") and Scryfall\'s color identity', () => {
    for (const raw of edhData) {
      expect(raw.origin, raw.name).toMatch(/^[A-Z0-9]{3,5}$/);
      expect(CARDS[raw.name]?.origin, raw.name).toBe(raw.origin);
      expect(Array.isArray(raw.colorIdentity), raw.name).toBe(true);
    }
  });
});

describe("commander.json", () => {
  it("sorted lists, no duplicates; the decks' Game Changers are known", () => {
    for (const list of [commanderData.banned, commanderData.gameChangers, commanderData.notLegal]) {
      expect([...list].sort()).toEqual(list);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(commanderData.gameChangers).toContain("Smothering Tithe");
    expect(commanderData.banned).toContain("Black Lotus");
  });
});
