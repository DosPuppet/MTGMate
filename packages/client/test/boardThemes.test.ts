/** Textures du plateau : choix retenu, et tirage « au hasard » qui donne toujours une vraie texture. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_THEMES, loadBoardTheme, resolveBoardTheme, saveBoardTheme } from "../src/boardThemes";

describe("textures du plateau", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("une texture choisie s'affiche telle quelle", () => {
    for (const t of BOARD_THEMES) expect(resolveBoardTheme(t.id, 0.5)).toBe(t.id);
  });

  it("« au hasard » tire une des textures, pour tout tirage de [0, 1)", () => {
    const ids = BOARD_THEMES.map((t) => t.id);
    for (const roll of [0, 0.13, 0.5, 0.999999]) expect(ids).toContain(resolveBoardTheme("hasard", roll));
    // Chaque texture peut sortir.
    const seen = new Set(Array.from({ length: 70 }, (_, i) => resolveBoardTheme("hasard", i / 70)));
    expect(seen.size).toBe(BOARD_THEMES.length);
  });

  it("le choix est retenu ; une valeur inconnue ou un stockage indisponible donne la texture par défaut", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(loadBoardTheme()).toBe("nuit");
    saveBoardTheme("bois");
    expect(loadBoardTheme()).toBe("bois");
    saveBoardTheme("hasard");
    expect(loadBoardTheme()).toBe("hasard");
    store.set("mtgmate.board", "inconnue");
    expect(loadBoardTheme()).toBe("nuit");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("indisponible");
      },
    });
    expect(loadBoardTheme()).toBe("nuit");
  });
});
