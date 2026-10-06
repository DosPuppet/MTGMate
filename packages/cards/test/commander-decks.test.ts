/**
 * Commander (PLAN-E) : les decks de `docs/commander/decks/` (100 cartes, un commandant, tous les noms reconnus), le
 * pseudo-ensemble EDH importé par nom (chaque carte y est définie par EDH, avec son impression d'origine et l'identité de
 * couleur de Scryfall) et les données de `commander.json`.
 */
import { describe, expect, it } from "vitest";
import { commanderDecks } from "../../../tools/commander-decks";
import commanderData from "../data/commander.json";
import edhData from "../data/edh.json";
import { CARDS, DECKS, SET_BY_CODE } from "../src";

describe("decks Commander", () => {
  const decks = commanderDecks();

  it("Edgar Markov et Y'shtola : 100 cartes, un commandant, tous les noms connus du catalogue", () => {
    expect(decks.map((d) => d.id)).toEqual(["edgar-markov", "yshtola"]);
    for (const d of decks) {
      expect(d.unknown, d.id).toEqual([]);
      expect(d.commander.length, d.id).toBe(1);
      const count = [...d.commander, ...d.main].reduce((n, [k]) => n + k, 0);
      expect(count, d.id).toBe(100);
    }
  });

  it("les préconstruits Commander (cmd-<id>) reprennent exactement les decklists", () => {
    for (const d of decks) {
      const precon = DECKS.find((x) => x.id === `cmd-${d.id}`);
      expect(precon?.format, d.id).toBe("commander");
      expect(precon?.commander).toEqual(d.commander);
      expect(precon?.main).toEqual(d.main);
    }
  });

  it("chaque carte des decks absente des extensions est définie par le pseudo-ensemble EDH", () => {
    const names = new Set(edhData.map((c) => c.name));
    for (const d of decks)
      for (const [, name] of [...d.commander, ...d.main]) {
        const c = CARDS[name];
        expect(c, name).toBeDefined();
        if (c?.set === "EDH") expect(names.has(name), name).toBe(true);
      }
  });
});

describe("pseudo-ensemble EDH (import par nom)", () => {
  it("est importé par nom, hors Standard, et chacune de ses cartes y est définie (aucune autre extension ne la définit)", () => {
    expect(SET_BY_CODE.EDH?.byName).toBeDefined();
    for (const raw of edhData) {
      expect(CARDS[raw.name]?.set, raw.name).toBe("EDH");
      expect(raw.legalities?.standard, raw.name).not.toBe("legal");
    }
  });

  it("chaque carte garde son impression d'origine (export « (C17) 36 ») et l'identité de couleur de Scryfall", () => {
    for (const raw of edhData) {
      expect(raw.origin, raw.name).toMatch(/^[A-Z0-9]{3,5}$/);
      expect(CARDS[raw.name]?.origin, raw.name).toBe(raw.origin);
      expect(Array.isArray(raw.colorIdentity), raw.name).toBe(true);
    }
  });
});

describe("commander.json", () => {
  it("listes triées, sans doublon ; les Game Changers des decks sont connus", () => {
    for (const list of [commanderData.banned, commanderData.gameChangers, commanderData.notLegal]) {
      expect([...list].sort()).toEqual(list);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(commanderData.gameChangers).toContain("Smothering Tithe");
    expect(commanderData.banned).toContain("Black Lotus");
  });
});
