/**
 * Interface test of the AI level: home-screen selector (remembered after a reload), level passed to the game, and
 * latency of the high AI in real time (without fast mode), with a normal CPU then a CPU throttled 4 times (CDP): the
 * gap between two visible AI actions must stay close to the 0.9 s pause, thinking included.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/ai-smoke.ts [screenshot-dir]
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
    console.log(`FAILED: ${msg}`);
    failed = true;
    process.exitCode = 1;
  } else console.log(`ok: ${msg}`);
};

/** Plays by passing its turns and measures the gap between the updates due to the AI's actions (its turn). */
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
  // Our turns: end of turn at once; the AI's turns are played in real time. Blocks and choices: default answer.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(`(() => {
      const g = window.__mtgx.getState();
      const v = g.view;
      if (!v) return "waiting";
      if (v.over) return "over";
      const p = v.pending;
      if (!p || p.player !== v.viewer) return "opponent";
      if (p.kind === "mulligan") { g.decide({ type: "keep" }); return "played"; }
      if (p.kind === "declareBlockers") { g.decide({ type: "declareBlockers", blocks: [] }); return "played"; }
      if (p.kind === "declareAttackers") { g.decide({ type: "declareAttackers", attackers: [] }); return "played"; }
      if (p.kind === "choice" && p.request) { g.decide({ type: "choose", values: p.request.suggested }); return "played"; }
      if (p.kind === "discard" || p.kind === "bottomCards") { g.decide({ type: p.kind === "discard" ? "discard" : "bottom", cards: v.hand.slice(0, p.count).map((c) => c.id) }); return "played"; }
      if (v.turn.active === v.viewer) g.endTurn(); else g.decide({ type: "pass" });
      return "played";
    })()`);
    if (state === "over") break;
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
  // The format choice has the same look (`.ai-level`): the level block is recognized by its label.
  const levels = page.locator(".ai-level", { hasText: "Niveau de l'IA" }).locator(".seg button");
  check((await levels.and(page.locator(".on")).innerText()) === "Moyen", "medium level by default");
  await levels.filter({ hasText: "Élevé" }).click();
  await page.reload();
  check((await levels.and(page.locator(".on")).innerText()) === "Élevé", "level remembered after reload");
  await page.screenshot({ path: join(OUT, "lobby.png") });

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  for (const [label, rate] of [
    ["normal", 1],
    ["throttled-x4", 4],
  ] as const) {
    await page.goto("http://localhost:5173/");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.getByRole("button", { name: "Jouer contre l'IA" }).click();
    const gaps = await measure(page, label);
    const m = median(gaps);
    console.log(`${label}: ${gaps.length} gaps between AI actions, median ${m} ms, max ${Math.max(0, ...gaps)} ms`);
    check(gaps.length >= 3, `${label}: the high AI plays`);
    check(m < 1600, `${label}: median gap between two AI actions < 1.6 s (0.9 s pause + thinking absorbed)`);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.evaluate("window.__mtgx.getState().backToLobby()");
  }
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
} finally {
  await browser.close();
}
if (!failed) console.log("ok: AI level and latency checked");
