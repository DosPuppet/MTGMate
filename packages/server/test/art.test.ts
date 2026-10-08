/** Illustrations personnelles (/art/, tools/custom-art.ts) : fichiers du dossier préparé seulement, en-têtes de cache. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/index";

let srv: RunningServer;
let none: RunningServer;
let dir = "";
let base = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mtgx-art-"));
  const art = join(dir, "art");
  mkdirSync(art);
  writeFileSync(join(art, "manifest.json"), JSON.stringify({ version: 1, cards: { "Sol Ring": "sol-ring-1234abcd.webp" } }));
  writeFileSync(join(art, "sol-ring-1234abcd.webp"), new Uint8Array([0x52, 0x49, 0x46, 0x46]));
  writeFileSync(join(dir, "secret.json"), "{}");
  srv = await startServer({ port: 0, host: "127.0.0.1", artDir: art });
  none = await startServer({ port: 0, host: "127.0.0.1", artDir: join(dir, "absent") });
  base = `http://127.0.0.1:${srv.port}`;
});
afterAll(async () => {
  await srv.close();
  await none.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("illustrations personnelles", () => {
  it("sert le manifeste (jamais en cache) et les images (cache long)", async () => {
    const m = await fetch(`${base}/art/manifest.json`);
    expect(m.status).toBe(200);
    expect(m.headers.get("content-type")).toBe("application/json");
    expect(m.headers.get("cache-control")).toBe("no-cache");
    expect((await m.json()).cards["Sol Ring"]).toBe("sol-ring-1234abcd.webp");
    const img = await fetch(`${base}/art/sol-ring-1234abcd.webp`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/webp");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await img.arrayBuffer())).toHaveLength(4);
  });

  it("refuse tout ce qui n'est pas un fichier du dossier", async () => {
    for (const path of ["/art/absente.webp", "/art/../secret.json", "/art/%2e%2e/secret.json", "/art/x.png", "/art/"])
      expect((await fetch(`${base}${path}`)).status, path).toBe(404);
    expect((await fetch(`${base}/art/manifest.json`, { method: "POST" })).status).toBe(405);
  });

  it("sans dossier : 404 (pas d'illustrations personnelles)", async () => {
    expect((await fetch(`http://127.0.0.1:${none.port}/art/manifest.json`)).status).toBe(404);
  });
});
