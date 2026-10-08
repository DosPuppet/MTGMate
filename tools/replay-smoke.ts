/**
 * End-to-end replays: a game against the AI, "Export the game" (downloaded file), then "Watch a game" with this file;
 * the viewer steps forward, back, jumps to the end and changes point of view.
 * Screenshots in test-results/replay/. Requires: `npm run dev` running (restarted after an engine change).
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
  await page.screenshot({ path: `${OUT}/failed.png` });
  console.log(`FAILED: ${msg}`);
  await browser.close();
  process.exit(1);
};

await page.goto(`${base}/?fast`);
await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
await page.getByRole("button", { name: "Garder" }).click({ timeout: 20_000 });

// A few turns: pass (end of turn, empty attacks and blocks, suggested choices).
const t0 = Date.now();
for (;;) {
  const v = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view);
  if (v && (v.turn.number >= 5 || v.over)) break;
  if (Date.now() - t0 > 60_000) await fail("the game does not progress");
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

// Export: the file is downloaded.
if (
  (await page.locator(".drawer-toggle, .menu-toggle").count()) > 0 &&
  !(await page.getByRole("button", { name: "Exporter la partie" }).isVisible())
)
  await page.locator(".drawer-toggle, .menu-toggle").first().click();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "Exporter la partie" }).click(),
]);
const file = `${OUT}/game.json`;
await download.saveAs(file);
console.log(`ok: game exported (${download.suggestedFilename()})`);

// Back to the home screen, then "Watch a game".
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Menu" }).click();
await page.locator(".replay-open input[type=file]").setInputFiles(file);
await page.locator(".replay-bar").waitFor({ timeout: 15_000 });
const replay = () => page.evaluate(() => (window as unknown as W).__mtgx.getState().replay);
const r0 = await replay();
if (r0?.index !== 0 || (r0?.total ?? 0) < 20) await fail(`replay badly opened: ${JSON.stringify(r0)}`);
await page.screenshot({ path: `${OUT}/1-start.png` });
for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "▶" }).click();
if ((await replay())?.index !== 5) await fail("stepping forward does not work");
await page.getByRole("button", { name: "◀" }).click();
if ((await replay())?.index !== 4) await fail("stepping back does not work");
await page.getByRole("button", { name: "Fin", exact: true }).click();
const end = await replay();
if (!end || end.index !== end.total) await fail("jumping to the end does not work");
const turn = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view?.turn.number);
if (!turn || turn < 5) await fail(`end of the replay at turn ${turn}`);
await page.screenshot({ path: `${OUT}/2-end.png` });
await page.locator(".replay-viewer select").selectOption({ index: 1 });
const viewer = await page.evaluate(() => (window as unknown as W).__mtgx.getState().view?.viewer);
if (viewer !== "p2") await fail("changing the point of view does not work");
await page.screenshot({ path: `${OUT}/3-opponent-point-of-view.png` });
await page.getByRole("button", { name: "Quitter" }).click();
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor();

console.log(
  errors.length ? `page errors: ${errors.join(" | ")}` : "ok: replay opened, browsed, point of view changed; no page error",
);
await browser.close();
process.exit(errors.length ? 1 : 0);
