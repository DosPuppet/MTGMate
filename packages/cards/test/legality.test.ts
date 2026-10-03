/** Légalités (PLAN-C, C19) : la liste des cartes bannies du README suit les données (légalités importées et dérogations). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import overrides from "../data/legality-overrides.json";
import { CARDS } from "../src/index";

const README = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "README.md");

describe("légalités Standard", () => {
  it("la liste des cartes bannies du README est celle des données", () => {
    const text = readFileSync(README, "utf8");
    const m = /\*\*Cartes bannies en Standard\*\* \((\d+)\) :\n\n((?:- .+\n)+)/.exec(text);
    expect(m, "section « Cartes bannies en Standard » du README").not.toBeNull();
    const listed = (m?.[2] ?? "")
      .trim()
      .split("\n")
      .map((l) => l.slice(2).trim());
    const banned = Object.values(CARDS)
      .filter((c) => !c.isToken && c.legalities?.standard === "banned")
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
    expect(listed).toEqual(banned);
    expect(Number(m?.[1])).toBe(banned.length);
  });

  it("chaque dérogation vise une carte connue et dit d'où elle vient", () => {
    for (const [name, o] of Object.entries(overrides as Record<string, { legalities?: object; source?: string }>)) {
      expect(CARDS[name], name).toBeDefined();
      expect(o.legalities, name).toBeDefined();
      expect(o.source, name).toBeTruthy();
    }
  });
});
