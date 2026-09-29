/**
 * Service worker de MTG Mate (build de production seulement, enregistré par main.tsx).
 * - /assets/* (nommés par leur empreinte) et /sounds/* : depuis le cache après la première visite ; une nouvelle
 *   version d'un fichier remplace l'ancienne (même préfixe de nom) ;
 * - la page : réseau d'abord, cache si hors ligne (partie contre l'IA sans réseau ; les images de Scryfall, elles,
 *   restent au navigateur).
 * Ni le jeu en ligne (/ws), ni le relais des images (/scry/), ni /healthz ne passent par le cache.
 */
const CACHE = "mtgmate-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** « index-CtvfSpgD.js » → « index- » : les anciennes versions d'un même fichier. */
const prefixOf = (path) => path.replace(/-[\w-]{6,}\.(js|css)$/, "-");

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) {
      const prefix = prefixOf(path);
      for (const old of await cache.keys()) {
        const p = new URL(old.url).pathname;
        if (p !== path && p.startsWith("/assets/") && prefixOf(p) === prefix) await cache.delete(old);
      }
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/")) e.respondWith(cacheFirst(e.request));
  else if (e.request.mode === "navigate") e.respondWith(networkFirst(e.request));
});
