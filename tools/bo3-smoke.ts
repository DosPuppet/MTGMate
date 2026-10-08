/**
 * End-to-end BO3 match against the AI: game 1 conceded, score and sideboard between the games (one swap in each
 * direction), game 2 started by the loser, then match lost 0–2. Screenshots in test-results/bo3/.
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { deckById } from "@mtgx/cards";
import { chromium } from "playwright";

const OUT = "test-results/bo3";
mkdirSync(OUT, { recursive: true });

// A legal 60-card deck (green welcome deck + Forests) and a sideboard of two Giant Growth.
const green = deckById("welcome-green").main;
const forests = (green.find(([, n]) => n === "Forest")?.[0] ?? 0) + 20;
const MAIN = [...green.filter(([, n]) => n !== "Forest"), [forests, "Forest"]] as [number, string][];
const SIDE: [number, string][] = [[2, "Giant Growth"]];
const AI = deckById("welcome-red").main;

type View = {
  viewer: string;
  over: boolean;
  turn: { number: number; active: string };
  pending: { kind: string; player: string } | null;
};
type Store = {
  view: View | null;
  localMatch: { game: number; wins: Record<string, number>; winner: string | null; deck: { main: [number, string][] } } | null;
  startGame(d: unknown, ai: unknown, sandbox: unknown, level: string, match: unknown): void;
  decide(d: unknown): void;
};
type W = { __mtgx: { getState(): Store } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
const fail = async (msg: string) => {
  await page.screenshot({ path: `${OUT}/failed.png` });
  console.log(`FAILED: ${msg}`);
  await browser.close();
  process.exit(1);
};
const state = () => page.evaluate(() => (window as unknown as W).__mtgx.getState());
const concedeWhenReady = async () => {
  await page
    .waitForFunction(
      () => {
        const v = (window as unknown as W).__mtgx.getState().view;
        return !!v && !v.over && v.turn.number >= 1;
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  // Possible mulligan: keep, then concede.
  await page
    .getByRole("button", { name: "Garder" })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  await page.evaluate(() => (window as unknown as W).__mtgx.getState().decide({ type: "concede" }));
  await page.waitForFunction(() => (window as unknown as W).__mtgx.getState().view?.over, undefined, { timeout: 10_000 });
};

await page.goto("http://localhost:5173/?fast");
await page.evaluate(
  ([main, ai, side]) =>
    (window as unknown as W).__mtgx.getState().startGame(main, [ai], undefined, "medium", { bestOf: 3, sideboard: side }),
  [MAIN, AI, SIDE] as const,
);
await concedeWhenReady();

// Between the games: score and sideboard.
await page
  .getByText("Score 0 – 1")
  .waitFor({ timeout: 5_000 })
  .catch(() => fail("score missing"));
await page
  .getByRole("heading", { name: "Réserve (2)" })
  .waitFor()
  .catch(() => fail("sideboard missing"));
await page.screenshot({ path: `${OUT}/1-sideboard.png` });
// One Giant Growth into the deck, one Forest into the sideboard.
await page
  .locator(".sideboard-editor li", { hasText: /Giant Growth|Croissance gigantesque/ })
  .getByRole("button", { name: "←" })
  .click();
await page
  .locator(".sideboard-editor li", { hasText: /Forest|Forêt/ })
  .getByRole("button", { name: "→" })
  .click();
await page
  .getByRole("heading", { name: "Deck (60)" })
  .waitFor()
  .catch(() => fail("the deck no longer has 60 cards"));
await page.getByRole("button", { name: "Manche suivante" }).click();

// Game 2: the loser (you) starts, with the modified deck.
await page
  .waitForFunction(
    () => {
      const s = (window as unknown as W).__mtgx.getState();
      return s.localMatch?.game === 2 && !!s.view && !s.view.over;
    },
    undefined,
    { timeout: 20_000 },
  )
  .catch(() => fail("game 2 does not start"));
const m2 = await state();
const growth = m2.localMatch?.deck.main.find(([, n]) => n === "Giant Growth")?.[0];
if (growth !== 1) await fail(`deck of game 2: ${growth} Giant Growth instead of 1`);
await page
  .waitForFunction(() => ((window as unknown as W).__mtgx.getState().view?.turn.number ?? 0) >= 1, undefined, { timeout: 20_000 })
  .catch(() => undefined);
await page
  .getByRole("button", { name: "Garder" })
  .click({ timeout: 5_000 })
  .catch(() => undefined);
await page.waitForFunction(() => ((window as unknown as W).__mtgx.getState().view?.turn.number ?? 0) >= 1, undefined, {
  timeout: 20_000,
});
const starter = (await state()).view?.turn.active;
if (starter !== "p1") await fail(`game 2 starts with ${starter} (the loser, p1, should have started)`);
await concedeWhenReady();

// Match lost 0–2: no more sideboard.
await page
  .getByRole("heading", { name: "Match perdu" })
  .waitFor({ timeout: 5_000 })
  .catch(() => fail("match outcome missing"));
if ((await page.locator(".sideboard-editor").count()) > 0) await fail("sideboard offered after the end of the match");
await page.screenshot({ path: `${OUT}/2-match-lost.png` });
console.log(
  errors.length ? `page errors: ${errors.join(" | ")}` : "ok: BO3 against the AI (sideboard, loser starts, match outcome)",
);
await browser.close();
process.exit(errors.length ? 1 : 0);
