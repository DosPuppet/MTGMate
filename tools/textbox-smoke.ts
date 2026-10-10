/**
 * One-off interface test of Deadpool, Trading Card's exchanged text boxes (Deadpool deck, rules 195): Deadpool is cast
 * and exchanges his text box with the opponent's Llanowar Elves; each shows a badge, and the preview shows the text box
 * it has ("Zone de texte de …"). Screenshots in test-results/textbox/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/textbox";
mkdirSync(OUT, { recursive: true });

type Decision = Record<string, unknown>;
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      passPriority(): void;
      decide(d: Decision): void;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string; request?: { prompt: string; options: string[] } } | null;
        hand: { id: string; name: string }[];
        battlefield: { id: string; name: string; controller: string; textBox?: { name: string } }[];
        stack: unknown[];
      } | null;
    };
  };
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173/?fast");
await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
  [[60, "Forest"]] as [number, string][],
  {
    p1: { cards: ["Swamp", "Swamp", "Mountain", "Mountain"], hand: ["Deadpool, Trading Card"] },
    p2: { cards: ["Llanowar Elves"] },
  },
] as const);
await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 }); // i18n-ignore: the French interface
// My first main phase, empty stack (the other priorities are passed).
await page.waitForFunction(
  () => {
    const st = (window as unknown as DevWindow).__mtgx.getState();
    const v = st.view;
    if (!v || v.pending?.player !== v.viewer || v.pending.kind !== "priority") return false;
    if (v.stack.length === 0 && v.turn.active === v.viewer && v.turn.step === "main1") return true;
    st.passPriority();
    return false;
  },
  undefined,
  { timeout: 60_000, polling: 500 },
);
// Cast Deadpool by clicking him in hand, then answer his question with the Elves.
const deadpool = await page.evaluate(
  () => (window as unknown as DevWindow).__mtgx.getState().view?.hand.find((c) => c.name.startsWith("Deadpool"))?.id,
);
await page.locator(`.hand [data-oid="${deadpool}"]`).first().click();
await page.waitForFunction(
  () => {
    const st = (window as unknown as DevWindow).__mtgx.getState();
    const v = st.view;
    if (v?.pending?.kind === "choice" && v.pending.player === v.viewer) return true;
    if (v?.pending?.kind === "priority" && v.pending.player === v.viewer && v.stack.length > 0) st.passPriority();
    return false;
  },
  undefined,
  { timeout: 30_000, polling: 300 },
);
await page.screenshot({ path: `${OUT}/1-question.png` });
await page.evaluate(() => {
  const st = (window as unknown as DevWindow).__mtgx.getState();
  const elves = st.view?.battlefield.find((o) => o.name === "Llanowar Elves")?.id;
  st.decide({ type: "choose", values: elves ? [elves] : [] });
});
await page.waitForFunction(
  () => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return !!v?.battlefield.some((o) => o.name.startsWith("Deadpool") && o.textBox);
  },
  undefined,
  { timeout: 30_000, polling: 300 },
);
const views = await page.evaluate(() =>
  (window as unknown as DevWindow).__mtgx
    .getState()
    .view?.battlefield.filter((o) => o.textBox)
    .map((o) => [o.name, o.textBox?.name]),
);
check(
  JSON.stringify(views?.sort()) ===
    JSON.stringify([
      ["Deadpool, Trading Card", "Llanowar Elves"],
      ["Llanowar Elves", "Deadpool, Trading Card"],
    ]),
  "both creatures carry the other's text box",
  views,
);
const ids = await page.evaluate(() =>
  (window as unknown as DevWindow).__mtgx
    .getState()
    .view?.battlefield.filter((o) => o.textBox)
    .map((o) => o.id),
);
check((await page.locator(".kw-badge[data-text-box]").count()) === 2, "a badge on each of the two creatures");
// The preview of Deadpool: the Elves' text box.
const dp = ids?.[0] ?? "";
await page.locator(`.battlefield [data-oid="${dp}"]`).first().hover();
const heading = page.locator(".preview-text-box");
check(
  await heading.waitFor({ timeout: 10_000 }).then(
    () => true,
    () => false,
  ),
  "the preview shows the exchanged text box",
);
console.log(`preview heading: ${await heading.textContent()}`);
await page.screenshot({ path: `${OUT}/2-preview.png` });
await browser.close();
if (errors.length) console.log(`page errors: ${errors.join(" | ")}`);
if (failures.length || errors.length) process.exit(1);
console.log("textbox-smoke: OK");
