/**
 * End-to-end test of the interface: plays a whole game against the AI by clicking like a human (playable cards, main
 * button, targets), and takes screenshots.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/ui-smoke.ts [screenshot-dir] [maxActions] [number of AIs]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/ui";
const MAX = Number(process.argv[3] ?? 400);
const AIS = Number(process.argv[4] ?? 1);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => {
  if (r.url().includes("/sounds/") && !r.ok()) errors.push(`sound not found: ${r.url()} (${r.status()})`);
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto("http://localhost:5173/?fast");
await page.screenshot({ path: join(OUT, "01-lobby.png") });
if (AIS > 1) await page.locator(".ai-count .seg button", { hasText: String(AIS) }).click();
await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
await page.getByRole("dialog").waitFor({ timeout: 10_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, "02-mulligan.png") });
await page.getByRole("button", { name: "Garder" }).click();

let shots = 3;
const shot = async (name: string) => page.screenshot({ path: join(OUT, `${String(shots++).padStart(2, "0")}-${name}.png`) });

let lastTurn = "";
const seen = new Set<string>();
for (let i = 0; i < MAX; i++) {
  await page.waitForTimeout(120);
  if (await page.locator(".gameover").count()) {
    await shot("end");
    console.log("Game over:", await page.locator(".gameover h2").innerText());
    break;
  }
  const turn = await page
    .locator(".phase-turn")
    .innerText()
    .catch(() => "");
  if (turn !== lastTurn && /Tour (3|6|9)\b/.test(turn)) await shot(turn.replace(/\W+/g, "-"));
  lastTurn = turn;

  // Choice dialogs
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    // Choice with a suggestion (options dialog or choice on the battlefield): suggestion, then confirmation.
    const suggest = dialog.getByRole("button", { name: "Suggestion" });
    if (await suggest.count()) {
      await suggest.click({ timeout: 1000 }).catch(() => {});
      await dialog
        .locator(".btn.primary:not([disabled])")
        .last()
        .click({ timeout: 1000 })
        .catch(() => {});
      continue;
    }
    // The dialog may close in the meantime (the AI plays fast in fast mode): retry on the next round.
    const title = await dialog
      .locator("h2")
      .innerText({ timeout: 1000 })
      .catch(() => null);
    if (title === null) continue;
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      const cards = dialog.locator(".hand-picker .card");
      for (let k = 0; k < n; k++) await cards.nth(k).click();
      await dialog.getByRole("button", { name: /Valider/ }).click();
    } else if (/X/.test(title)) await dialog.getByRole("button", { name: "Valider" }).click();
    else
      await dialog
        .locator(".btn.choice")
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
    continue;
  }

  // Targeting in progress: choose the first legal target.
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    if (!seen.has("targeting")) {
      seen.add("targeting");
      await page.mouse.move(800, 300);
      await page.waitForTimeout(200);
      await shot("targeting");
    }
    // The target may disappear in the meantime (the AI plays fast in fast mode): retry on the next round.
    await target.click({ force: true, timeout: 3000 }).catch(() => {});
    continue;
  }
  // Optional target: if nothing can be targeted, "Aucune cible" (no target).
  const none = page.getByRole("button", { name: "Aucune cible" });
  if (await none.count()) {
    await none.click();
    continue;
  }
  const banner = await page
    .locator(".banner")
    .innerText()
    .catch(() => "");
  if (/répondre/.test(banner) && !seen.has("response")) {
    seen.add("response");
    await shot("response");
  }

  const main = page.locator(".main-button");
  const label = (await main.innerText()).trim();
  if (await main.isDisabled()) continue;

  if (label === "Attaquer avec tous") {
    // MTGA style: a first press selects all the creatures, a second one confirms.
    await main.click({ timeout: 3000 }).catch(() => {});
    await shot("attack");
    await main.click({ timeout: 3000 }).catch(() => {});
    continue;
  }
  if (label === "Pas de blocage") {
    // Block with the first creature offered, if possible.
    const blocker = page.locator(".battlefield.me .glow-selectable").first();
    if (await blocker.count()) {
      await blocker.click({ force: true });
      const att = page.locator(".battlefield.opp .glow-target").first();
      if (await att.count()) await att.click({ force: true });
      await shot("block");
    }
    await page
      .locator(".main-button")
      .click({ timeout: 3000 })
      .catch(() => {});
    continue;
  }

  // Play a playable card from the hand (land first), otherwise the main button.
  const playable = page.locator(".hand .glow-playable");
  if ((await playable.count()) && !/Résoudre/.test(label)) {
    // Hover first: the card comes to the front of the fan (as for a player).
    await playable.first().hover({ force: true });
    await page.waitForTimeout(200);
    await playable.first().click({ force: true });
    continue;
  }
  // The AI may act between the check and the click: a missed click is simply retried on the next loop round.
  await main.click({ timeout: 3000 }).catch(() => {});
}

if (!(await page.locator(".gameover").count())) {
  await shot("stop");
  const dialog = await page
    .getByRole("dialog")
    .locator("h2")
    .innerText()
    .catch(() => "(none)");
  errors.push(`stopped without game over. Button: "${await page.locator(".main-button").innerText()}", dialog: ${dialog}`);
}
// Sound effects played during the game (dev-mode log, audio/sfx.ts).
const played = new Set(await page.evaluate(() => (window as unknown as { __sfxLog?: string[] }).__sfxLog ?? []));
const expected = ["shuffle", "draw", "land", "cast", "attack", "click"];
const silent = expected.filter((k) => !played.has(k));
console.log(`Sounds played: ${[...played].sort().join(", ")}`);
if (silent.length) errors.push(`sounds never played: ${silent.join(", ")}`);
console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "No page error.");
await browser.close();
if (errors.length) process.exit(1);
