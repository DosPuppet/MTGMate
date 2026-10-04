/**
 * Test d'interface du niveau de l'IA : sélecteur de l'accueil (retenu après rechargement), niveau transmis à la partie,
 * et latence de l'IA élevée en temps réel (sans le mode rapide), processeur normal puis ralenti 4 fois (CDP) :
 * l'écart entre deux actions visibles de l'IA doit rester proche de la pause de 0,9 s, réflexion comprise.
 *
 * Prérequis : `npm run dev` lancé. Usage : npx tsx tools/ai-smoke.ts [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const OUT = process.argv[2] ?? "test-results/ai";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`ÉCHEC : ${msg}`);
    failed = true;
    process.exitCode = 1;
  } else console.log(`ok : ${msg}`);
};

/** Joue en passant ses tours et mesure l'écart entre les mises à jour dues aux actions de l'IA (son tour). */
async function measure(page: Page, label: string): Promise<number[]> {
  await page.evaluate(`(() => {
    window.__gaps = [];
    let last = 0;
    const orig = window.__mtgx.getState().receive;
    window.__mtgx.setState({ receive: (m) => {
      const v = m.view;
      if (m.type === "update" && v && v.turn.active !== v.viewer && m.events.some((e) => e.type === "cast" || e.type === "playLand" || e.type === "attack" || e.type === "activate")) {
        const now = Date.now();
        if (last && now - last < 5000) window.__gaps.push(now - last);
        last = now;
      }
      orig(m);
    } });
  })()`);
  // Nos tours : fin du tour aussitôt ; les tours de l'IA se jouent en temps réel. Blocages et choix : réponse par défaut.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(`(() => {
      const g = window.__mtgx.getState();
      const v = g.view;
      if (!v) return "attente";
      if (v.over) return "fin";
      const p = v.pending;
      if (!p || p.player !== v.viewer) return "adverse";
      if (p.kind === "mulligan") { g.decide({ type: "keep" }); return "joué"; }
      if (p.kind === "declareBlockers") { g.decide({ type: "declareBlockers", blocks: [] }); return "joué"; }
      if (p.kind === "declareAttackers") { g.decide({ type: "declareAttackers", attackers: [] }); return "joué"; }
      if (p.kind === "choice" && p.request) { g.decide({ type: "choose", values: p.request.suggested }); return "joué"; }
      if (p.kind === "discard" || p.kind === "bottomCards") { g.decide({ type: p.kind === "discard" ? "discard" : "bottom", cards: v.hand.slice(0, p.count).map((c) => c.id) }); return "joué"; }
      if (v.turn.active === v.viewer) g.endTurn(); else g.decide({ type: "pass" });
      return "joué";
    })()`);
    if (state === "fin") break;
    const gaps = (await page.evaluate("window.__gaps.length")) as number;
    if (gaps >= 8) break;
    await page.waitForTimeout(150);
  }
  const gaps = (await page.evaluate("window.__gaps")) as number[];
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  return gaps;
}

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 880 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Le choix du format a la même présentation (`.ai-level`) : le bloc du niveau se reconnaît à son libellé.
  const levels = page.locator(".ai-level", { hasText: "Niveau de l'IA" }).locator(".seg button");
  check((await levels.and(page.locator(".on")).innerText()) === "Moyen", "niveau Moyen par défaut");
  await levels.filter({ hasText: "Élevé" }).click();
  await page.reload();
  check((await levels.and(page.locator(".on")).innerText()) === "Élevé", "niveau retenu après rechargement");
  await page.screenshot({ path: join(OUT, "lobby.png") });

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  for (const [label, rate] of [
    ["normal", 1],
    ["ralenti-x4", 4],
  ] as const) {
    await page.goto("http://localhost:5173/");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
    const gaps = await measure(page, label);
    const m = median(gaps);
    console.log(`${label} : ${gaps.length} écarts entre actions de l'IA, médiane ${m} ms, max ${Math.max(0, ...gaps)} ms`);
    check(gaps.length >= 3, `${label} : l'IA élevée joue`);
    check(m < 1600, `${label} : écart médian entre deux actions de l'IA < 1,6 s (pause 0,9 s + réflexion absorbée)`);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.evaluate("window.__mtgx.getState().backToLobby()");
  }
  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(" | ")}` : "aucune erreur de page");
} finally {
  await browser.close();
}
if (!failed) console.log("ok : niveau de l'IA et latence vérifiés");
