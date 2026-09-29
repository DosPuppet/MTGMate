/**
 * Match BO3 contre l'IA de bout en bout : manche 1 concédée, score et réserve entre les manches (un échange dans
 * chaque sens), manche 2 commencée par le perdant, puis match perdu 0–2. Captures dans test-results/bo3/.
 * Prérequis : `npm run dev` lancé (redémarré après une modification du moteur).
 */
import { mkdirSync } from "node:fs";
import { deckById } from "@mtgx/cards";
import { chromium } from "playwright";

const OUT = "test-results/bo3";
mkdirSync(OUT, { recursive: true });

// Deck légal de 60 cartes (deck de bienvenue vert + Forêts) et une réserve de deux Giant Growth.
const green = deckById("bienvenue-vert").main;
const forests = (green.find(([, n]) => n === "Forest")?.[0] ?? 0) + 20;
const MAIN = [...green.filter(([, n]) => n !== "Forest"), [forests, "Forest"]] as [number, string][];
const SIDE: [number, string][] = [[2, "Giant Growth"]];
const AI = deckById("bienvenue-rouge").main;

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
  await page.screenshot({ path: `${OUT}/echec.png` });
  console.log(`ÉCHEC : ${msg}`);
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
  // Mulligan éventuel : on garde, puis on concède.
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

// Entre les manches : score et réserve.
await page
  .getByText("Score 0 – 1")
  .waitFor({ timeout: 5_000 })
  .catch(() => fail("score absent"));
await page
  .getByRole("heading", { name: "Réserve (2)" })
  .waitFor()
  .catch(() => fail("réserve absente"));
await page.screenshot({ path: `${OUT}/1-reserve.png` });
// Un Giant Growth dans le deck, une Forêt en réserve.
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
  .catch(() => fail("le deck ne compte plus 60 cartes"));
await page.getByRole("button", { name: "Manche suivante" }).click();

// Manche 2 : le perdant (vous) commence, avec le deck modifié.
await page
  .waitForFunction(
    () => {
      const s = (window as unknown as W).__mtgx.getState();
      return s.localMatch?.game === 2 && !!s.view && !s.view.over;
    },
    undefined,
    { timeout: 20_000 },
  )
  .catch(() => fail("la manche 2 ne démarre pas"));
const m2 = await state();
const growth = m2.localMatch?.deck.main.find(([, n]) => n === "Giant Growth")?.[0];
if (growth !== 1) await fail(`deck de la manche 2 : ${growth} Giant Growth au lieu de 1`);
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
if (starter !== "p1") await fail(`la manche 2 commence par ${starter} (le perdant, p1, devait commencer)`);
await concedeWhenReady();

// Match perdu 0–2 : plus de réserve.
await page
  .getByRole("heading", { name: "Match perdu" })
  .waitFor({ timeout: 5_000 })
  .catch(() => fail("issue du match absente"));
if ((await page.locator(".sideboard-editor").count()) > 0) await fail("réserve proposée après la fin du match");
await page.screenshot({ path: `${OUT}/2-match-perdu.png` });
console.log(
  errors.length
    ? `erreurs de page : ${errors.join(" | ")}`
    : "ok : BO3 contre l'IA (réserve, perdant qui commence, issue du match)",
);
await browser.close();
process.exit(errors.length ? 1 : 0);
