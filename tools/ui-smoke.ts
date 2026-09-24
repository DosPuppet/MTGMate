/**
 * Test de bout en bout de l'interface : joue une partie complète contre l'IA en cliquant
 * comme un humain (cartes jouables, bouton principal, cibles), et prend des captures.
 *
 * Prérequis : `npm run dev` lancé. Usage : npx tsx tools/ui-smoke.ts [dossier-captures] [maxActions]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/ui";
const MAX = Number(process.argv[3] ?? 400);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto("http://localhost:5173/");
await page.screenshot({ path: join(OUT, "01-lobby.png") });
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
  await page.waitForTimeout(250);
  if (await page.locator(".gameover").count()) {
    await shot("fin");
    console.log("Partie terminée :", await page.locator(".gameover h2").innerText());
    break;
  }
  const turn = await page
    .locator(".phase-turn")
    .innerText()
    .catch(() => "");
  if (turn !== lastTurn && /Tour (3|6|9)\b/.test(turn)) await shot(turn.replace(/\W+/g, "-"));
  lastTurn = turn;

  // Fenêtres de choix
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const title = await dialog.locator("h2").innerText();
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      const cards = dialog.locator(".hand-picker .card");
      for (let k = 0; k < n; k++) await cards.nth(k).click();
      await dialog.getByRole("button", { name: /Valider/ }).click();
    } else if (/X/.test(title)) await dialog.getByRole("button", { name: "Valider" }).click();
    else await dialog.locator(".btn.choice").first().click();
    continue;
  }

  // Ciblage en cours : choisir la première cible légale.
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    if (!seen.has("ciblage")) {
      seen.add("ciblage");
      await page.mouse.move(800, 300);
      await page.waitForTimeout(200);
      await shot("ciblage");
    }
    await target.click({ force: true });
    continue;
  }
  const banner = await page
    .locator(".banner")
    .innerText()
    .catch(() => "");
  if (/répondre/.test(banner) && !seen.has("reponse")) {
    seen.add("reponse");
    await shot("reponse");
  }

  const main = page.locator(".main-button");
  const label = (await main.innerText()).trim();
  if (await main.isDisabled()) continue;

  if (label === "Pas d'attaque") {
    const all = page.getByRole("button", { name: "Tous attaquent" });
    if (await all.count()) {
      await all.click();
      await shot("attaque");
    }
    await main.click();
    continue;
  }
  if (label === "Pas de blocage") {
    // Bloquer avec la première créature proposée, si possible.
    const blocker = page.locator(".battlefield.me .glow-selectable").first();
    if (await blocker.count()) {
      await blocker.click();
      const att = page.locator(".battlefield.opp .glow-target").first();
      if (await att.count()) await att.click();
      await shot("blocage");
    }
    await page.locator(".main-button").click();
    continue;
  }

  // Jouer une carte jouable de la main (terrain d'abord), sinon bouton principal.
  const playable = page.locator(".hand .glow-playable");
  if ((await playable.count()) && !/Résoudre/.test(label)) {
    await playable.first().click();
    continue;
  }
  await main.click();
}

console.log(errors.length ? `Erreurs :\n${errors.join("\n")}` : "Aucune erreur de page.");
await browser.close();
