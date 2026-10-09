/**
 * One-off interface test of the shared dialog (PLAN-L L10): the window takes the focus on opening, Tab stays inside it,
 * Escape closes it and gives the focus back to the button that opened it (deck editor's import window).
 *
 * Requires: `npm run dev` running.
 */
import { chromium } from "playwright";

type DevWindow = { __mtgx: { getState(): { openDeckBuilder(id?: string | null): void } } };

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
await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().openDeckBuilder());
const opener = page.getByRole("button", { name: "Importer", exact: true }); // i18n-ignore: the French interface
await opener.focus();
await opener.press("Enter");
const dialog = page.getByRole("dialog", { name: "Importer une decklist" }); // i18n-ignore: the French interface
await dialog.waitFor({ timeout: 10_000 });
check(await dialog.evaluate((d) => d.getAttribute("aria-modal") === "true"), "aria-modal");
check(await dialog.evaluate((d) => d === document.activeElement), "the window takes the focus");
let inside = true;
for (let i = 0; i < 25; i++) {
  await page.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
  inside &&= await dialog.evaluate((d) => d.contains(document.activeElement));
}
check(inside, "Tab stays inside the window");
await page.keyboard.press("Escape");
check(await dialog.isHidden(), "Escape closes it");
check(await opener.evaluate((b) => b === document.activeElement), "the focus goes back to the opening button");

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("dialog-smoke: all good");
