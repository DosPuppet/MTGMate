/**
 * One-off interface test of the payment choices (PLAN-L L7): the Phyrexian mana window (Gut Shot paid with 2 life),
 * then, in full control, the hybrid color window and the "mana" stage where the player taps the source to pay with
 * (Dryad Militant paid with the Plains). Screenshots in test-results/payment/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/payment";
mkdirSync(OUT, { recursive: true });

type Obj = { id: string; name: string; tapped?: boolean; controller?: string };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      setFullControl(on: boolean): void;
      pickTarget(id: string): void;
      passPriority(): void;
      casting: { stage: string } | null;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string } | null;
        hand: Obj[];
        battlefield: Obj[];
        stack: unknown[];
        players: Record<string, { life: number; manaPool: Record<string, number> }>;
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
  [[60, "Swamp"]] as [number, string][],
  { p1: { cards: ["Mountain", "Forest", "Plains"], hand: ["Gut Shot", "Dryad Militant"] } },
] as const);
await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
/** My priority with an empty stack (in my first main phase if `main`; the other priorities are passed). */
const myPriority = (main = false) =>
  page.waitForFunction(
    (main) => {
      const st = (window as unknown as DevWindow).__mtgx.getState();
      const v = st.view;
      const mine = !!v && v.stack.length === 0 && v.pending?.kind === "priority" && v.pending.player === v.viewer;
      if (!mine || !main) return mine;
      if (v.turn.active === v.viewer && v.turn.step === "main1") return true;
      st.passPriority();
      return false;
    },
    main,
    { timeout: 60_000, polling: 500 },
  );
await myPriority();
const view = () => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view);
const idIn = async (zone: "hand" | "battlefield", name: string) =>
  (await view())?.[zone].find((o) => o.name === name && (zone === "hand" || o.controller === "p1"))?.id ?? "";

// 1. Phyrexian mana: Gut Shot paid with 2 life, the Mountain stays untapped.
await page
  .locator(`.hand [data-oid="${await idIn("hand", "Gut Shot")}"]`)
  .first()
  .click();
const phyrexian = page.getByText("Payer le mana phyrexian avec…"); // i18n-ignore: the French interface is tested
check(
  await phyrexian.waitFor({ timeout: 5000 }).then(
    () => true,
    () => false,
  ),
  "Phyrexian window shown",
);
await page.screenshot({ path: `${OUT}/1-phyrexian.png` });
await page.getByRole("button", { name: "2 points de vie pour un symbole" }).click(); // i18n-ignore: the French interface is tested
await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().pickTarget("p2"));
await page.waitForTimeout(500);
await myPriority();
const v1 = await view();
check(v1?.players.p1?.life === 18, "2 life paid", v1?.players.p1?.life);
check(v1?.players.p2?.life === 19, "Gut Shot dealt 1 damage", v1?.players.p2?.life);
check(!v1?.battlefield.find((o) => o.name === "Mountain" && o.controller === "p1")?.tapped, "Mountain untapped");

// 2. Full control: the hybrid color, then the source tapped by hand (the Plains).
await myPriority(true);
await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().setFullControl(true));
await page
  .locator(`.hand [data-oid="${await idIn("hand", "Dryad Militant")}"]`)
  .first()
  .click();
check(
  await page
    .getByText("Payer le mana hybride en…")
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    ),
  "hybrid window in full control",
);
await page.screenshot({ path: `${OUT}/2-hybrid.png` });
await page.getByRole("button", { name: "Automatique" }).click();
const stage = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage);
check(stage === "mana", "mana stage", stage);
await page
  .locator(`[data-oid="${await idIn("battlefield", "Plains")}"]`)
  .first()
  .click();
await page.waitForFunction(() => {
  const v = (window as unknown as DevWindow).__mtgx.getState().view;
  return (v?.players.p1?.manaPool.W ?? 0) > 0;
});
const stage2 = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage);
check(stage2 === "mana", "the cast goes on after tapping", stage2);
await page.screenshot({ path: `${OUT}/3-mana-stage.png` });
await page.getByTestId("pay-mana").click();
await page.waitForTimeout(1500);
// Full control keeps the priority with the spell on the stack: passed until it resolves.
await page.waitForFunction(
  () => {
    const st = (window as unknown as DevWindow).__mtgx.getState();
    const v = st.view;
    const mine = !!v && v.pending?.kind === "priority" && v.pending.player === v.viewer;
    if (mine && v.stack.length > 0) st.passPriority();
    return mine && v.stack.length === 0;
  },
  undefined,
  { timeout: 30_000, polling: 500 },
);
const v2 = await view();
const mine = (name: string) => v2?.battlefield.find((o) => o.name === name && o.controller === "p1");
check(!!mine("Dryad Militant"), "Dryad Militant on the battlefield");
check(!!mine("Plains")?.tapped && !mine("Forest")?.tapped, "paid with the Plains tapped by hand", {
  plains: mine("Plains")?.tapped,
  forest: mine("Forest")?.tapped,
});
await page.screenshot({ path: `${OUT}/4-done.png` });

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("payment-smoke: all good");
