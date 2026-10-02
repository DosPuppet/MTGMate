/** Fichiers du client servis par le serveur : compression (brotli, gzip) et en-têtes de cache. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/index";

let srv: RunningServer | null = null;
let dir = "";
afterEach(async () => {
  await srv?.close();
  srv = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function get(port: number, path: string, encoding?: string): Promise<{ headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((ok, ko) => {
    const req = request({ port, path, headers: encoding ? { "Accept-Encoding": encoding } : {} }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => ok({ headers: res.headers as Record<string, unknown>, body: Buffer.concat(chunks) }));
    });
    req.on("error", ko);
    req.end();
  });
}

describe("fichiers du client", () => {
  it("politique de contenu (CSP) : scripts du site seulement, images de Scryfall, pas d'encadrement", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>MTG Mate</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });
    const csp = String((await get(srv.port, "/")).headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data: https://cards.scryfall.io");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("compressés (brotli, sinon gzip), en cache un an pour /assets/, jamais pour index.html", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    mkdirSync(join(dir, "assets"));
    const js = `export const data = ${JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ carte: `Carte ${i}` })))};`;
    writeFileSync(join(dir, "assets", "index-abc.js"), js);
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>MTG Mate</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });

    const br = await get(srv.port, "/assets/index-abc.js", "gzip, deflate, br");
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers["cache-control"]).toMatch(/immutable/);
    expect(brotliDecompressSync(br.body).toString()).toBe(js);
    expect(br.body.length).toBeLessThan(js.length / 4);

    const gz = await get(srv.port, "/assets/index-abc.js", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gz.body).toString()).toBe(js);

    // En-têtes de sécurité sur les fichiers servis.
    expect(br.headers["x-content-type-options"]).toBe("nosniff");
    expect(br.headers["x-frame-options"]).toBe("DENY");

    const plain = await get(srv.port, "/assets/index-abc.js");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.toString()).toBe(js);

    const html = await get(srv.port, "/", "br");
    expect(html.headers["cache-control"]).toBe("no-cache");
  });

  it("une URL mal encodée répond 400, sans arrêter le serveur", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>MTG Mate</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });
    expect((await fetch(`http://127.0.0.1:${srv.port}/%`)).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${srv.port}/healthz`)).status).toBe(200);
  });
});
