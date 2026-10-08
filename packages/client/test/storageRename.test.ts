/** Rename: the browser's "mtgmate.*" keys are carried over to "planecircle.*". */
import { afterEach, describe, expect, it, vi } from "vitest";

function stubStorage(entries: Record<string, string>): Map<string, string> {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
}

describe("carrying over MTG Mate keys", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("each mtgmate.* key moves to planecircle.*, without overwriting a new key; other keys stay", async () => {
    const store = stubStorage({
      "mtgmate.board": "bois",
      "mtgmate.decks": '{"state":{}}',
      "mtgmate.lang": "en",
      "planecircle.lang": "fr",
      "mtgx.images": "on",
    });
    await import("../src/storageRename");
    expect(Object.fromEntries(store)).toEqual({
      "planecircle.board": "bois",
      "planecircle.decks": '{"state":{}}',
      "planecircle.lang": "fr",
      "mtgx.images": "on",
    });
  });

  it("unavailable storage does not block loading", async () => {
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("unavailable");
      },
    });
    await expect(import("../src/storageRename")).resolves.toBeDefined();
  });
});
