/** Changement de nom : les clés « mtgmate.* » du navigateur sont reprises sous « planecircle.* ». */
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

describe("reprise des clés de MTG Mate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("chaque clé mtgmate.* passe sous planecircle.*, sans écraser une clé nouvelle ; les autres clés restent", async () => {
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

  it("un stockage indisponible ne bloque pas le chargement", async () => {
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("indisponible");
      },
    });
    await expect(import("../src/storageRename")).resolves.toBeDefined();
  });
});
