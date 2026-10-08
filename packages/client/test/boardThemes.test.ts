/** Board textures: the choice is remembered, and the "random" draw always gives a real texture. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_THEMES, loadBoardTheme, resolveBoardTheme, saveBoardTheme } from "../src/boardThemes";

describe("board textures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a chosen texture is shown as is", () => {
    for (const t of BOARD_THEMES) expect(resolveBoardTheme(t.id, 0.5)).toBe(t.id);
  });

  it('"random" picks one of the textures, for any roll in [0, 1)', () => {
    const ids = BOARD_THEMES.map((t) => t.id);
    for (const roll of [0, 0.13, 0.5, 0.999999]) expect(ids).toContain(resolveBoardTheme("hasard", roll));
    // Every texture can come up.
    const seen = new Set(Array.from({ length: 70 }, (_, i) => resolveBoardTheme("hasard", i / 70)));
    expect(seen.size).toBe(BOARD_THEMES.length);
  });

  it("the choice is remembered; an unknown value or unavailable storage gives the default texture", () => {
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
    store.set("planecircle.board", "inconnue");
    expect(loadBoardTheme()).toBe("nuit");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
    });
    expect(loadBoardTheme()).toBe("nuit");
  });
});
