/**
 * Test de bout en bout du Commander (PLAN-E, E5) : partie à quatre joueurs contre trois IA, lancée par le magasin du mode
 * dev (`window.__mtgx`, decks simples de Foundations : un commandant bon marché et des terrains de base). Vérifie les
 * 40 points de vie, une puce de commandant par joueur, le commandant au bout de la main (lançable depuis la zone de
 * commandement), son passage en jeu, et prend des captures (`test-results/commander/`).
 *
 * Prérequis : `npm run dev` lancé. Usage : npx tsx tools/commander-smoke.ts [dossier-captures] [maxActions]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/commander";
const MAX = Number(process.argv[3] ?? 300);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto("http://localhost:5173/?fast");
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor({ timeout: 30_000 });
// Le format Commander est proposé à l'accueil.
await page.getByRole("button", { name: "Commander", exact: true }).first().click();
// Les préconstruits Commander, classés par bracket estimé (pastille sur l'illustration).
await page
  .locator(".deck-choice")
  .first()
  .getByRole("tab", { name: /^Commander/ })
  .click();
const brackets = await page.locator(".deck-choice").first().locator(".deck-tile .deck-bracket").allInnerTexts();
const order = ["Bracket 1–2", "Bracket 3", "Bracket 4+"];
const ranks = brackets.map((b) => order.indexOf(b.trim()));
if (brackets.length < 3 || ranks.some((r, i) => r < 0 || (i > 0 && r < (ranks[i - 1] ?? 0))))
  errors.push(`decks Commander non classés par bracket : ${brackets.join(", ")}`);
await page.screenshot({ path: join(OUT, "01-accueil-commander.png") });

// Éditeur de deck : le préconstruit Edgar Markov, validé en Commander (100 cartes, Game Changers, bracket estimé).
await page.getByRole("button", { name: "Mes decks" }).click();
await page.locator(".deck-select").selectOption("cmd-edgar-markov");
const summary = await page.locator("[data-testid=commander-summary]").innerText({ timeout: 10_000 });
if (!/Game Changers : 5 · bracket estimé 4\+/.test(summary)) errors.push(`éditeur : « ${summary} »`);
const deckTab = await page.locator(".deck-tabs button").first().innerText();
if (!/100\s*\/\s*100/.test(deckTab)) errors.push(`éditeur : onglet du deck « ${deckTab} »`);
await page.screenshot({ path: join(OUT, "01b-editeur-commander.png") });
await page.getByRole("button", { name: "← Accueil" }).click();
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor({ timeout: 10_000 });

// Partie à quatre : Giada (W) contre Fynn (G), Kellan (R) et Zul Ashur (B), decks de terrains de base et de créatures.
await page.evaluate(() => {
  const w = window as unknown as {
    __mtgx: { getState: () => { startGame: (...args: unknown[]) => void } };
  };
  w.__mtgx.getState().startGame(
    [
      [55, "Plains"],
      [44, "Savannah Lions"],
    ],
    [
      [
        [55, "Forest"],
        [44, "Llanowar Elves"],
      ],
      [
        [55, "Mountain"],
        [44, "Fanatical Firebrand"],
      ],
      [[99, "Swamp"]],
    ],
    undefined,
    "beginner",
    undefined,
    {
      player: [[1, "Giada, Font of Hope"]],
      ai: [[[1, "Fynn, the Fangbearer"]], [[1, "Kellan, Planar Trailblazer"]], [[1, "Zul Ashur, Lich Lord"]]],
    },
  );
});
await page.getByRole("dialog").waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "Garder" }).click();

let shots = 2;
const shot = async (name: string) => page.screenshot({ path: join(OUT, `${String(shots++).padStart(2, "0")}-${name}.png`) });

// Début de partie : 40 PV et une puce de commandant par joueur.
await page.locator("[data-testid=commander-chip]").first().waitFor({ timeout: 15_000 });
const chips = await page.locator("[data-testid=commander-chip]").count();
if (chips !== 4) errors.push(`${chips} puce(s) de commandant au lieu de 4`);
const life = (await page.locator(".player-bar.me .avatar").innerText()).replace(/\D+/g, "");
if (!life.startsWith("40")) errors.push(`points de vie de départ : ${life} au lieu de 40`);
await shot("debut");

let castCommander = false;
let commanderInPlay = false;
let lastProgress = "";
let stuck = 0;
const TRACE = !!process.env.TRACE;
for (let i = 0; i < MAX; i++) {
  await page.waitForTimeout(120);
  if (TRACE)
    console.log(
      i,
      new Date().toISOString().slice(11, 19),
      await page
        .locator(".main-button")
        .innerText()
        .catch(() => "?"),
    );
  if (await page.locator(".gameover").count()) {
    await shot("fin");
    console.log("Partie terminée :", await page.locator(".gameover h2").innerText());
    break;
  }
  if (await page.locator("[data-testid=eliminated]").count()) {
    await shot("elimine");
    console.log("Joueur éliminé : la partie continue sans lui.");
    break;
  }
  const myChip = await page
    .locator(".player-bar.me [data-testid=commander-chip]")
    .innerText()
    .catch(() => "");
  if (!commanderInPlay && /en jeu/.test(myChip)) {
    commanderInPlay = true;
    await shot("commandant-en-jeu");
  }
  if (commanderInPlay && i > 120) break;

  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
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
    const title = await dialog
      .locator("h2")
      .innerText({ timeout: 1000 })
      .catch(() => null);
    if (title === null) continue;
    // 903.9a : remettre le commandant dans la zone de commandement.
    if (/zone de commandement/.test(title)) {
      await shot("retour-commandant");
      await dialog
        .getByRole("button", { name: "Oui" })
        .click({ timeout: 2000 })
        .catch(() => {});
      continue;
    }
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      const cards = dialog.locator(".hand-picker .card");
      for (let k = 0; k < n; k++) await cards.nth(k).click();
      await dialog.getByRole("button", { name: /Valider/ }).click();
    } else
      await dialog
        .locator(".btn.choice")
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
    continue;
  }
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    await target.click({ force: true, timeout: 3000 }).catch(() => {});
    continue;
  }
  const main = page.locator(".main-button");
  const label = (await main.innerText().catch(() => "")).trim();
  if (await main.isDisabled().catch(() => true)) continue;
  if (label === "Attaquer avec tous") {
    await main.click({ timeout: 3000 }).catch(() => {});
    await main.click({ timeout: 3000 }).catch(() => {});
    continue;
  }
  // Le commandant, au bout de la main avec l'étiquette « Commandant » : lancé dès qu'il est jouable.
  const commanderCard = page
    .locator(".hand > *", { has: page.locator(".zone-tag", { hasText: "Commandant" }) })
    .locator(".glow-playable")
    .first();
  if (!castCommander && (await commanderCard.count())) {
    await shot("commandant-lancable");
    await commanderCard.hover({ force: true });
    await commanderCard.click({ force: true }).catch(() => {});
    castCommander = true;
    continue;
  }
  const playable = page.locator(".hand .glow-playable");
  // Sous charge, un clic sur une carte peut rester sans effet : après quelques essais sans progrès (même bouton, même
  // main, même journal), on passe par le bouton principal au lieu de recliquer la même carte jusqu'à la fin de la boucle.
  const progress = `${label}|${await page.locator(".hand > *").count()}|${await page.locator(".log .log-line").count()}`;
  stuck = progress === lastProgress ? stuck + 1 : 0;
  lastProgress = progress;
  if ((await playable.count()) && !/Résoudre/.test(label) && stuck < 4) {
    await playable.first().hover({ force: true });
    await page.waitForTimeout(150);
    await playable.first().click({ force: true });
    continue;
  }
  await main.click({ timeout: 3000 }).catch(() => {});
}

if (!castCommander) errors.push("le commandant n'a jamais été proposé au bout de la main");
if (!commanderInPlay) errors.push("le commandant n'est jamais arrivé en jeu");
await shot("arret");
console.log(errors.length ? `Erreurs :\n${errors.join("\n")}` : "ok : aucune erreur de page");
await browser.close();
if (errors.length) process.exit(1);
