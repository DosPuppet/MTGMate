/** Relais des images de Scryfall (/scry/) : liste blanche, en-têtes de cache, erreurs amont. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/index";

const IMG = "/normal/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg";
const asked: string[] = [];
let srv: RunningServer;
let base = "";

beforeAll(async () => {
  srv = await startServer({
    port: 0,
    host: "127.0.0.1",
    async fetchImage(url) {
      asked.push(url);
      if (url.includes("/front/0/0/")) throw new Error("réseau");
      if (url.includes("/front/f/f/")) return new Response("absente", { status: 404 });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg", "content-length": "3", etag: '"abc"' },
      });
    },
  });
  base = `http://127.0.0.1:${srv.port}`;
});
afterAll(() => srv.close());

describe("relais des images de Scryfall", () => {
  it("relaie une image de carte, avec la date et un cache long", async () => {
    const r = await fetch(`${base}/scry${IMG}?1783909131`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(r.headers.get("etag")).toBe('"abc"');
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
    // Sans la chaîne de requête : une variante ne refait pas de requête différente à Scryfall.
    expect(asked.at(-1)).toBe(`https://cards.scryfall.io${IMG}`);
  });

  it("accepte HEAD et les illustrations (art_crop)", async () => {
    const r = await fetch(`${base}/scry${IMG.replace("normal", "art_crop")}`, { method: "HEAD" });
    expect(r.status).toBe(200);
  });

  it("refuse tout ce qui n'est pas une image de carte (pas de proxy ouvert)", async () => {
    const before = asked.length;
    for (const path of [
      "/scry/../../etc/passwd",
      "/scry/https://exemple.com/x.jpg",
      "/scry//exemple.com/normal/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg",
      "/scry/normal/front/8/d/pas-un-identifiant.jpg",
      "/scry/cards/search?q=bolt",
    ]) {
      const r = await fetch(`${base}${path}`);
      expect(r.status, path).toBe(404);
    }
    expect(asked.length).toBe(before);
  });

  it("refuse les autres méthodes", async () => {
    expect((await fetch(`${base}/scry${IMG}`, { method: "POST" })).status).toBe(405);
  });

  it("renvoie 404 si Scryfall n'a pas l'image, 502 s'il ne répond pas", async () => {
    expect((await fetch(`${base}/scry/normal/front/f/f/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg`)).status).toBe(404);
    expect((await fetch(`${base}/scry/normal/front/0/0/00000000-0000-0000-0000-000000000000.jpg`)).status).toBe(502);
  });
});
