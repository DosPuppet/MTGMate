/**
 * Test de bout en bout du relais des images (client/src/images.ts, route /scry/ du serveur) :
 * - Scryfall bloqué (comme par un proxy d'entreprise) : le relais s'active tout seul, les images s'affichent ;
 * - Scryfall accessible : images en direct ; la case « Images par le serveur Planecircle » force le relais,
 *   et le choix survit à un rechargement.
 * Captures dans test-results/proxy/.
 *
 * Prérequis : `npm run dev` lancé (Vite relaie /scry vers Scryfall en dev).
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

const OUT = "test-results/proxy";
mkdirSync(OUT, { recursive: true });
// ?fast : mode rapide des tests (IA sans pause), mode dev seulement.
const BASE = "http://localhost:5173/?fast";

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "ÉCHEC"} : ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

/** Illustrations des decks de l'accueil (fond CSS) : URL et chargement effectif. */
type Covers = { urls: string[] };
const covers = (page: Page) =>
  page.evaluate(`(() => ({
    urls: [...document.querySelectorAll(".deck-art")]
      .map((e) => getComputedStyle(e).backgroundImage.replace(/^url\\("?|"?\\)$/g, ""))
      .filter((u) => u && u !== "none"),
  }))()`) as Promise<Covers>;

/** Images des cartes affichées (main, champ de bataille) : URL et chargement effectif. */
type Imgs = { total: number; loaded: number; srcs: string[] };
const cardImages = (page: Page) =>
  page.evaluate(`(() => {
    const imgs = [...document.querySelectorAll(".card img")];
    return { total: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, srcs: imgs.map((i) => i.getAttribute("src")) };
  })()`) as Promise<Imgs>;

/** Toutes les images d'un fond CSS se chargent-elles ? */
const loadAll = (page: Page, urls: string[]) =>
  page.evaluate(
    (us) =>
      Promise.all(
        us.map(
          (u) =>
            new Promise<boolean>((res) => {
              const i = new Image();
              i.onload = () => res(i.naturalWidth > 0);
              i.onerror = () => res(false);
              i.src = u;
            }),
        ),
      ),
    urls,
  );

async function newPage(browser: Browser, blockScryfall: boolean): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  if (blockScryfall) await ctx.route("https://cards.scryfall.io/**", (r) => r.abort("blockedbyclient"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}

async function startGame(page: Page): Promise<void> {
  await page.evaluate(
    `window.__mtgx.getState().startGame([[60, "Forest"]], [[[60, "Forest"]]], { p1: { cards: ["Llanowar Elves", "Serra Angel"] } })`,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch();

// 1. Scryfall bloqué : bascule automatique sur le relais.
{
  const page = await newPage(browser, true);
  await page.goto(BASE);
  await page.waitForFunction(`document.querySelector(".image-relay input")?.checked === true`, undefined, { timeout: 15_000 });
  check(true, "Scryfall bloqué : relais activé automatiquement (case cochée)");
  const c = await covers(page);
  check(c.urls.length > 0 && c.urls.every((u) => u.includes("/scry/")), "accueil : illustrations par /scry/", c.urls.slice(0, 2));
  const ok = await loadAll(page, c.urls);
  check(ok.every(Boolean), "accueil : illustrations chargées", ok);
  await page.screenshot({ path: `${OUT}/1-accueil-bloque.png` });
  await startGame(page);
  const imgs = await cardImages(page);
  check(
    imgs.total > 0 && imgs.loaded === imgs.total && imgs.srcs.every((s) => s?.startsWith("/scry/")),
    "partie : images des cartes chargées par /scry/",
    { ...imgs, srcs: imgs.srcs.slice(0, 2) },
  );
  await page.screenshot({ path: `${OUT}/2-partie-bloque.png` });
  await page.context().close();
}

// 2. Scryfall accessible : direct ; la case force le relais, mémorisé.
{
  const page = await newPage(browser, false);
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  const box = page.locator(".image-relay input");
  check(!(await box.isChecked()), "Scryfall accessible : relais inactif");
  let c = await covers(page);
  check(
    c.urls.length > 0 && c.urls.every((u) => u.startsWith("https://cards.scryfall.io/")),
    "accueil : illustrations en direct",
    c.urls.slice(0, 2),
  );
  await box.check();
  c = await covers(page);
  check(
    c.urls.every((u) => u.includes("/scry/")),
    "case cochée : illustrations par /scry/",
    c.urls.slice(0, 2),
  );
  await page.reload();
  await page.waitForTimeout(1500);
  check(await page.locator(".image-relay input").isChecked(), "choix mémorisé après rechargement");
  await startGame(page);
  let imgs = await cardImages(page);
  check(imgs.total > 0 && imgs.srcs.every((s) => s?.startsWith("/scry/")), "partie : relais forcé", imgs.srcs.slice(0, 2));
  // Décocher dans les réglages de la partie : retour en direct.
  await page.locator(".sidebar .image-relay input").uncheck();
  await page.waitForTimeout(500);
  imgs = await cardImages(page);
  check(
    imgs.srcs.every((s) => s?.startsWith("https://cards.scryfall.io/")),
    "réglages de la partie : case décochée, retour en direct",
    imgs.srcs.slice(0, 2),
  );
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`Erreurs de page :\n${errors.join("\n")}`);
else console.log("ok : aucune erreur de page");
process.exit(failures.length || errors.length ? 1 : 0);
