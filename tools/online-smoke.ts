/**
 * Test de bout en bout du jeu en ligne : deux navigateurs (contextes séparés) jouent un duel via le serveur.
 * A crée la partie, B rejoint par le lien d'invitation ; les deux jouent en cliquant, puis on vérifie la corde,
 * la reprise après rechargement de la page, la fin de partie et la revanche. Captures dans test-results/online/.
 *
 * Prérequis : `npm run server` (MTGX_DECISION_MS=45000 conseillé) et `npm run dev` lancés.
 * Usage : npm run online-smoke -- [maxTours] [--base http://127.0.0.1:8787]
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

const OUT = "test-results/online";
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
/** URL de l'appli : serveur de dev (défaut) ou serveur de production, éventuellement derrière nginx. */
const BASE = (baseIdx >= 0 ? args.splice(baseIdx, 2)[1] : undefined) ?? "http://localhost:5173";
const MAX_ROUNDS = Number(args[0] ?? 600);
mkdirSync(OUT, { recursive: true });

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "ÉCHEC"} : ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

async function open(browser: Browser, name: string, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  page.on("pageerror", (e) => errors.push(`${name} : ${e.message}`));
  await page.goto(url);
  return page;
}

/** Un pas de jeu « humain » : fenêtres de choix, cibles, cartes jouables, bouton principal. */
async function step(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const title = await dialog
      .locator("h2")
      .innerText()
      .catch(() => "");
    if (/Victoire|Défaite|nul/.test(title)) return;
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      for (let k = 0; k < n; k++)
        await dialog
          .locator(".hand-picker .card")
          .nth(k)
          .click({ force: true })
          .catch(() => {});
    }
    const primary = dialog.locator(".modal-actions .btn.primary:not([disabled])");
    const choice = dialog.locator(".btn.choice");
    if (await primary.count())
      await primary
        .first()
        .click({ force: true })
        .catch(() => {});
    else if (await choice.count())
      await choice
        .first()
        .click({ force: true })
        .catch(() => {});
    else
      await dialog
        .locator(".card")
        .first()
        .click({ force: true })
        .catch(() => {});
    return;
  }
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    await target.click({ force: true }).catch(() => {});
    return;
  }
  const main = page.locator(".main-button");
  const label = await main.innerText().catch(() => "");
  const playable = page.locator(".hand .glow-playable");
  if ((await playable.count()) && !/Résoudre|Attaquer|Bloquer|Pas d/.test(label) && Math.random() < 0.7) {
    await playable
      .first()
      .hover({ force: true })
      .catch(() => {});
    await playable
      .first()
      .click({ force: true })
      .catch(() => {});
    return;
  }
  if (/Pas d'attaque/.test(label)) {
    const tous = page.getByRole("button", { name: "Tous attaquent" });
    if (await tous.count()) await tous.click().catch(() => {});
  }
  if (!(await main.isDisabled().catch(() => true))) await main.click({ timeout: 2000 }).catch(() => {});
}

const over = (page: Page) => page.locator(".gameover").count();

const browser = await chromium.launch();
const a = await open(browser, "A", `${BASE}/`);
await a.getByRole("button", { name: "Contre un joueur" }).click();
await a.getByPlaceholder("Pseudo visible par votre adversaire").fill("Alice");
await a.getByRole("button", { name: "Créer", exact: true }).click();
const code = (await a.getByTestId("room-code").innerText({ timeout: 10_000 })).trim();
check(/^[A-Z0-9]{6}$/.test(code), `salon créé (code ${code})`);
await a.screenshot({ path: `${OUT}/1-attente.png` });

const b = await open(browser, "B", `${BASE}/?room=${code}`);
await b.getByPlaceholder("Pseudo visible par votre adversaire").fill("Bob");
check((await b.getByLabel("Code du salon").inputValue()) === code, "le lien d'invitation pré-remplit le code");
await b.getByRole("button", { name: "Rejoindre" }).click();

/** Les mulligans se décident l'un après l'autre (le premier joueur d'abord) : on garde dès que c'est demandé. */
async function keepBoth(): Promise<void> {
  const kept = new Set<Page>();
  for (let i = 0; i < 100 && kept.size < 2; i++) {
    for (const p of [a, b]) {
      const keep = p.getByRole("button", { name: "Garder" });
      if (!kept.has(p) && (await keep.count())) {
        await keep.click().catch(() => {});
        kept.add(p);
      }
    }
    await a.waitForTimeout(200);
  }
  if (kept.size < 2) throw new Error("mulligan : « Garder » jamais proposé");
}
await keepBoth();
await a.waitForTimeout(800);
check((await a.locator(".player-bar.opp .player-name").innerText()).includes("Bob"), "A voit le pseudo de Bob");
check((await b.locator(".player-bar.opp .player-name").innerText()).includes("Alice"), "B voit le pseudo d'Alice");
await a.screenshot({ path: `${OUT}/2-debut-A.png` });

// Quelques tours de jeu.
for (let i = 0; i < 8 && !(await over(a)); i++) {
  await step(a);
  await step(b);
  await a.waitForTimeout(120);
}

// Corde : on laisse le joueur qui doit décider réfléchir jusqu'à la corde (fin des 45 s).
// Qui doit décider : l'adversaire « réfléchit… » (indicateur visible, aussi en production).
const waiting = (await a.locator(".player-bar.opp .thinking").count()) ? "B" : "A";
if (!(await over(a))) {
  await a.waitForTimeout(27_000);
  check(
    (await a.locator(".rope").count()) > 0 && (await b.locator(".rope").count()) > 0,
    `corde visible des deux côtés (${waiting} décide)`,
  );
  await a.screenshot({ path: `${OUT}/3-corde.png` });
}

// Reprise après rechargement de la page de B.
if (!(await over(a))) {
  await b.reload();
  await b.locator(".battlefield").first().waitFor({ timeout: 15_000 });
  check((await b.locator(".hand .card").count()) > 0, "B retrouve sa partie (main) après rechargement");
  await b.screenshot({ path: `${OUT}/4-reprise-B.png` });
}

// Jusqu'à la fin de la partie.
for (let i = 0; i < MAX_ROUNDS && !(await over(a)); i++) {
  await step(a);
  await step(b);
  await a.waitForTimeout(80);
}
const finished = (await over(a)) > 0 && (await over(b)) > 0;
check(finished, "partie terminée des deux côtés");
if (finished) {
  const ta = await a.locator(".gameover h2").innerText();
  const tb = await b.locator(".gameover h2").innerText();
  check((ta === "Victoire !") !== (tb === "Victoire !") || ta === tb, `résultats cohérents (${ta} / ${tb})`);
  await a.screenshot({ path: `${OUT}/5-fin-A.png` });
  // Revanche.
  await a.getByRole("button", { name: "Revanche" }).click();
  await b.getByText("propose une revanche").waitFor({ timeout: 5000 });
  await b.getByRole("button", { name: "Revanche" }).click();
  await keepBoth();
  check(true, "revanche : nouvelle partie lancée (mains gardées des deux côtés)");
  await a.screenshot({ path: `${OUT}/6-revanche.png` });
}

check(errors.length === 0, "aucune erreur de page", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} échec(s)`);
  process.exit(1);
}
