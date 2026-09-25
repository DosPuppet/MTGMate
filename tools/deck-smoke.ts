/**
 * Test de bout en bout du deckbuilder : import d'une decklist (noms FR, faute de frappe corrigée par suggestion),
 * édition par clics, export, persistance après rechargement, puis partie jouée avec le deck.
 *
 * Prérequis : `npm run dev` lancé. Usage : npx tsx tools/deck-smoke.ts [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/decks";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`ÉCHEC : ${msg}`);
    process.exitCode = 1;
  } else console.log(`ok : ${msg}`);
};

await page.goto("http://localhost:5173/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: "Mes decks" }).click();
await page.getByRole("button", { name: "Importer" }).click();
const LIST = `About
Name Test importé

Deck
4 Elfes de Llanowar
4 Bear Cub (FDN) 552
4 Thornweald Archer
4 Magnigoth Sentry
4 Tajuru Pathwarden
4 Giant Growth
4 Bite Down
4 Overun
4 Druid of the Cowl
24 Forest

Sideboard
2 Broken Wings
`;
await page.locator(".decklist-input").fill(LIST);
await page.screenshot({ path: join(OUT, "01-import.png") });
check((await page.locator(".import-report .v-error").count()) === 1, "une seule ligne en erreur (Overun)");
await page.getByRole("button", { name: /Remplacer par « Overrun »/ }).click();
check((await page.locator(".import-report .v-error").count()) === 0, "suggestion appliquée");
await page.getByRole("button", { name: "Créer un nouveau deck" }).click();
await page.waitForTimeout(300);
check((await page.locator(".deck-name-input").inputValue()) === "Test importé", "nom du deck repris de la liste");
check((await page.locator(".deck-tabs").innerText()).includes("60"), "60 cartes dans le deck");
check((await page.locator(".v-ok").count()) === 1, "deck valide et jouable");
await page.screenshot({ path: join(OUT, "02-deck.png") });

// Édition par clics : retirer un Giant Growth, ajouter un Llanowar Elves refusé (déjà 4).
await page
  .locator(".deck-line", { hasText: /Croissance gigantesque|Giant Growth/ })
  .getByRole("button", { name: "Retirer" })
  .click();
check((await page.locator(".deck-tabs").innerText()).includes("59"), "retrait d'une carte");
await page.locator(".filters .search").fill("elfes de llanowar");
await page.locator(".collection-grid .card").first().click();
check((await page.locator(".toast").innerText()).includes("4 exemplaires"), "5e exemplaire refusé");
await page.locator(".filters .search").fill("croissance");
await page.locator(".collection-grid .card").first().click();
check((await page.locator(".deck-tabs").innerText()).includes("60"), "ajout depuis la collection");

// Export.
await page.getByRole("button", { name: "Exporter" }).click();
const exported = await page.locator(".decklist-output").inputValue();
check(/^About\nName Test importé\n\nDeck\n/.test(exported) && exported.includes("(FDN)"), "export au format MTGA");
check(exported.includes("Sideboard\n2 Broken Wings"), "réserve exportée");
await page.getByRole("button", { name: "Fermer" }).click();

// Persistance.
await page.reload();
await page.getByRole("button", { name: "Mes decks" }).click();
check((await page.locator(".deck-name-input").inputValue()) === "Test importé", "deck conservé après rechargement");

// Partie avec le deck.
await page.getByRole("button", { name: "Tester contre l'IA" }).click();
await page.getByRole("button", { name: "Garder" }).click();
for (let i = 0; i < 300 && !(await page.locator(".gameover").count()); i++) {
  await page.waitForTimeout(150);
  if (await page.getByRole("dialog").count()) {
    await page
      .getByRole("dialog")
      .locator(".btn.primary, .btn.choice")
      .first()
      .click({ force: true })
      .catch(() => {});
    continue;
  }
  const t = page.locator(".glow-target").first();
  if (await t.count()) {
    await t.click({ force: true });
    continue;
  }
  const main = page.locator(".main-button");
  if (await main.isDisabled()) continue;
  await main.click({ timeout: 3000 }).catch(() => {});
}
await page.screenshot({ path: join(OUT, "03-partie.png") });
check((await page.locator(".battlefield").count()) >= 2, "partie lancée avec le deck importé");
console.log(errors.length ? `Erreurs de page :\n${errors.join("\n")}` : "Aucune erreur de page.");
await browser.close();
