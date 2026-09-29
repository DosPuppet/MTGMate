/**
 * Replays de bout en bout : une partie contre l'IA, « Exporter la partie » (fichier téléchargé), puis « Revoir une
 * partie » avec ce fichier ; le visionneur avance, recule, saute à la fin et change de point de vue.
 * Captures dans test-results/replay/. Prérequis : `npm run dev` lancé (redémarré après une modification du moteur).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/replay";
mkdirSync(OUT, { recursive: true });
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:5173";

type View = {
  viewer: string;
  over: boolean;
  turn: { number: number; active: string };
  pending: { kind: string; player: string; count?: number } | null;
  hand: { id: string }[];
};
type Store = { view: View | null; replay: { index: number; total: number } | null; decide(d: unknown): void; endTurn(): void };
type W = { __mtgx: { getState(): Store } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
const fail = async (msg: string) => {
  await page.screenshot({ path: `${OUT}/echec.png` });
  console.log(`ÉCHEC : ${msg}`);
  await browser.close();
  process.exit(1);
};

await page.goto(`${base}/?fast`);
await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
await page.getByRole("button", { name: "Garder" }).click({ timeout: 20_000 });

// Quelques tours : on passe (fin du tour, attaques et blocages vides, choix suggérés).
const t0 = Date.now();
for (;;) {
  const v = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view);
  if (v && (v.turn.number >= 5 || v.over)) break;
  if (Date.now() - t0 > 60_000) await fail("la partie n'avance pas");
  if (v?.pending?.player === v?.viewer) {
    const kind = v?.pending?.kind;
    await page.evaluate((k) => {
      const s = (window as unknown as W).__mtgx.getState();
      if (k === "priority") s.endTurn();
      else if (k === "declareAttackers") s.decide({ type: "declareAttackers", attackers: [] });
      else if (k === "declareBlockers") s.decide({ type: "declareBlockers", blocks: [] });
      else if (k === "mulligan") s.decide({ type: "keep" });
      else if (k === "discard" && s.view?.pending)
        s.decide({ type: "discard", cards: s.view.hand.slice(0, s.view.pending.count ?? 1).map((c) => c.id) });
    }, kind);
    const suggest = page.getByRole("button", { name: "Suggestion" });
    if (await suggest.isVisible().catch(() => false)) {
      await suggest.click();
      await page.getByRole("button", { name: /Valider/ }).click();
    }
  }
  await page.waitForTimeout(150);
}

// Export : le fichier est téléchargé.
if (
  (await page.locator(".drawer-toggle, .menu-toggle").count()) > 0 &&
  !(await page.getByRole("button", { name: "Exporter la partie" }).isVisible())
)
  await page.locator(".drawer-toggle, .menu-toggle").first().click();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "Exporter la partie" }).click(),
]);
const file = `${OUT}/partie.json`;
await download.saveAs(file);
console.log(`ok : partie exportée (${download.suggestedFilename()})`);

// Retour à l'accueil, puis « Revoir une partie ».
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Menu" }).click();
await page.locator(".replay-open input[type=file]").setInputFiles(file);
await page.locator(".replay-bar").waitFor({ timeout: 15_000 });
const replay = () => page.evaluate(() => (window as unknown as W).__mtgx.getState().replay);
const r0 = await replay();
if (r0?.index !== 0 || (r0?.total ?? 0) < 20) await fail(`replay mal ouvert : ${JSON.stringify(r0)}`);
await page.screenshot({ path: `${OUT}/1-debut.png` });
for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "▶" }).click();
if ((await replay())?.index !== 5) await fail("l'avance pas à pas ne fonctionne pas");
await page.getByRole("button", { name: "◀" }).click();
if ((await replay())?.index !== 4) await fail("le retour en arrière ne fonctionne pas");
await page.getByRole("button", { name: "Fin", exact: true }).click();
const end = await replay();
if (!end || end.index !== end.total) await fail("le saut à la fin ne fonctionne pas");
const turn = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view?.turn.number);
if (!turn || turn < 5) await fail(`fin du replay au tour ${turn}`);
await page.screenshot({ path: `${OUT}/2-fin.png` });
await page.locator(".replay-viewer select").selectOption({ index: 1 });
const viewer = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view?.viewer);
if (viewer !== "p2") await fail("le changement de point de vue ne fonctionne pas");
await page.screenshot({ path: `${OUT}/3-point-de-vue-adverse.png` });
await page.getByRole("button", { name: "Quitter" }).click();
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor();

console.log(
  errors.length
    ? `erreurs de page : ${errors.join(" | ")}`
    : "ok : replay ouvert, parcouru, point de vue changé ; aucune erreur de page",
);
await browser.close();
process.exit(errors.length ? 1 : 0);
