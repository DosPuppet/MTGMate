/**
 * Test de bout en bout du tutoriel : chaque leçon est suivie dans le navigateur en cliquant comme un joueur
 * (cartes, cibles, bouton principal, « Suivant »), d'après les décisions attendues par ses étapes.
 * Vérifie aussi le refus d'une action hors guide et la reprise après rechargement de la page.
 * La leçon 9 (partie libre) est suivie jusqu'au début de la partie.
 *
 * Prérequis : `npm run dev` lancé. Usage : npx tsx tools/tutorial-smoke.ts [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GameView } from "@mtgx/engine";
import { chromium, type Page } from "playwright";
import { LESSONS } from "../packages/client/src/tutorial/lessons";
import { type Allow, solve } from "../packages/client/src/tutorial/runtime";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
/** `--only 2,3` : seulement ces leçons (sans les vérifications du menu). */
const ONLY = onlyAt >= 0 ? (args.splice(onlyAt, 2)[1] ?? "").split(",").map(Number) : null;
const DEBUG = args.includes("--debug");
const OUT = args.find((a) => !a.startsWith("--")) ?? "test-results/tutorial";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 880 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console : ${m.text()}`);
});
page.on("worker", (w) => w.on("console", (m) => m.type() === "error" && errors.push(`worker : ${m.text()}`)));
let failed = false;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`ÉCHEC : ${msg}`);
    failed = true;
    process.exitCode = 1;
  } else console.log(`ok : ${msg}`);
};

interface TutoState {
  lessonId: string | null;
  step: number;
  finished: boolean;
}

const tuto = (p: Page) =>
  p.evaluate(() => {
    const t = (window as unknown as { __tuto: { getState(): TutoState } }).__tuto.getState();
    return { lessonId: t.lessonId, step: t.step, finished: t.finished };
  });
const gameView = (p: Page) =>
  p.evaluate(
    () => (window as unknown as { __mtgx: { getState(): { view: unknown } } }).__mtgx.getState().view,
  ) as Promise<GameView | null>;

/** Élément d'un objet ou d'un joueur (les jetons d'une pile n'ont pas tous d'élément). */
const objectEl = (id: string) => page.locator(`[data-oid="${id}"], [data-oids~="${id}"]`).first();

/** Clic comme un joueur : les cartes de la main se chevauchent, on vise leur coin visible (en haut à gauche). */
async function clickObj(id: string, v: GameView): Promise<void> {
  const inHand = v.hand.some((o) => o.id === id);
  await objectEl(id).click(inHand ? { position: { x: 14, y: 30 } } : undefined);
}

async function clickMain(): Promise<void> {
  const ok = page.locator(".stack-reveal-ok");
  if (await ok.isVisible().catch(() => false)) await ok.click();
  else await page.locator('[data-tuto="main-button"]').click();
}

/** Réalise l'étape comme un joueur, à partir de la décision attendue. */
async function act(allow: Allow, v: GameView): Promise<void> {
  const intent = solve(allow, v);
  if (!intent) throw new Error(`rien à faire pour ${JSON.stringify(allow)}`);
  switch (intent.type) {
    case "keep":
      await page.getByRole("button", { name: "Garder" }).click();
      return;
    case "pass":
    case "endTurn":
      await clickMain();
      return;
    case "playLand":
      await clickObj(intent.card, v);
      return;
    case "cast":
    case "activate": {
      await clickObj(intent.type === "cast" ? intent.card : intent.source, v);
      const target = Object.values(intent.targets ?? {}).flat()[0];
      if (!target) return;
      // Cible choisie automatiquement quand elle est la seule possible : pas de clic.
      const targeting = await page
        .waitForFunction(
          () =>
            (window as unknown as { __mtgx: { getState(): { casting: { stage: string } | null } } }).__mtgx.getState().casting
              ?.stage === "target",
          undefined,
          { timeout: 1500 },
        )
        .then(() => true)
        .catch(() => false);
      if (targeting) await clickObj(target, v);
      return;
    }
    case "declareAttackers":
      for (const a of intent.attackers) await objectEl(a.id).click();
      await clickMain();
      return;
    case "declareBlockers":
      for (const b of intent.blocks) {
        await objectEl(b.blocker).click();
        // Un bloqueur qui ne peut bloquer qu'un attaquant est assigné dès le premier clic.
        const assigned = await page.evaluate(
          (id) =>
            id in (window as unknown as { __mtgx: { getState(): { blocks: Record<string, string> } } }).__mtgx.getState().blocks,
          b.blocker,
        );
        if (!assigned) await objectEl(b.attacker).click();
      }
      await clickMain();
      return;
    default:
      throw new Error(`décision non gérée : ${intent.type}`);
  }
}

/** Attend que l'étape (ou la leçon) change ; échoue si le tutoriel reste bloqué. */
async function waitProgress(before: TutoState, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const s = await tuto(page);
    if (s.step !== before.step || s.finished !== before.finished || s.lessonId !== before.lessonId) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`bloqué : ${what}`);
}

async function playLesson(index: number): Promise<void> {
  const lesson = LESSONS[index];
  if (!lesson) return;
  for (let guard = 0; guard < 200; guard++) {
    const s = await tuto(page);
    if (s.finished || s.lessonId !== lesson.id) return;
    const step = lesson.steps[s.step];
    if (!step) throw new Error(`étape ${s.step} introuvable`);
    const where = `${lesson.id} étape ${s.step + 1}`;
    if (step.free) return; // partie libre (leçon 9) : on s'arrête là
    if (step.next) {
      await page.locator(".coach-next").click();
      await waitProgress(s, where);
      continue;
    }
    const t = step.target;
    if (step.allow) {
      // Étape d'action : on attend que la décision attendue soit possible (worker qui démarre, tour adverse…).
      const deadline = Date.now() + 15_000;
      let done = false;
      while (!done && Date.now() < deadline) {
        const v = await gameView(page);
        const allow = v && step.allow.find((a) => solve(a, v));
        if (v && allow) {
          if (DEBUG) console.log(where, JSON.stringify(allow));
          await act(allow, v);
          done = true;
        } else {
          const now = await tuto(page);
          if (now.step !== s.step || now.finished) done = true;
          else await page.waitForTimeout(100);
        }
      }
      if (!done) throw new Error(`bloqué : ${where} (action attendue impossible)`);
      // L'étape peut demander plusieurs décisions (« Passer » puis bloquer) : on repasse dans la boucle.
      await waitProgress(s, where).catch(() => {});
      continue;
    }
    if (typeof t === "object") {
      // Étape de survol : on attend que la carte soit à l'écran.
      await page.waitForFunction((name) => {
        const v = (window as unknown as { __mtgx: { getState(): { view: GameView | null } } }).__mtgx.getState().view;
        return !!v && [...v.battlefield, ...v.hand].some((o) => o.name === name);
      }, t.card);
      const v = await gameView(page);
      const id = v?.battlefield.find((o) => o.name === t.card)?.id ?? v?.hand.find((o) => o.name === t.card)?.id;
      if (id) await objectEl(id).hover();
    }
    // Étape d'attente (tour adverse) : on laisse la partie avancer.
    await waitProgress(s, where);
  }
  throw new Error(`${lesson.id} : trop d'étapes`);
}

/** Leçon 2 : une action hors guide est refusée ; après rechargement de la page, la leçon est proposée à la reprise. */
async function refusalAndResume(): Promise<void> {
  await page.locator(".lesson-tile").nth(1).click();
  await page.locator(".coach-next").click();
  // La partie doit être prête (priorité au joueur) : un délai fixe ne suffit pas sur une machine chargée.
  await page.waitForFunction(() => {
    const v = (window as unknown as { __mtgx: { getState(): { view: GameView | null } } }).__mtgx.getState().view;
    return !!v && v.pending?.kind === "priority" && v.pending.player === v.viewer;
  });
  const v = await gameView(page);
  const plains = v?.hand.find((o) => o.name === "Plains");
  if (plains && v) await clickObj(plains.id, v);
  await page.waitForTimeout(200);
  check(
    (
      await page
        .locator(".toast")
        .innerText()
        .catch(() => "")
    ).includes("Forêt"),
    "action hors guide refusée",
  );
  check(!((await gameView(page))?.battlefield.some((o) => o.name === "Plains") ?? true), "la Plaine n'a pas été jouée");
  await page.screenshot({ path: join(OUT, "01-refus.png") });
  await page.reload();
  await page.getByRole("button", { name: "Apprendre à jouer" }).click();
  check(
    await page.getByRole("button", { name: /Reprendre : Terrains et mana/ }).isVisible(),
    "reprise proposée après rechargement",
  );
}

try {
  await page.goto("http://localhost:5173/?fast");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Apprendre à jouer" }).click();
  await page.screenshot({ path: join(OUT, "00-menu.png") });
  check((await page.locator(".lesson-tile").count()) === LESSONS.length, `${LESSONS.length} leçons au menu`);
  if (ONLY === null) await refusalAndResume();

  for (let i = 0; i < LESSONS.length; i++) {
    const lesson = LESSONS[i];
    if (!lesson || (ONLY !== null && !ONLY.includes(i + 1))) continue;
    if ((await page.locator(".tutorial-menu").count()) === 0) {
      await page.goto("http://localhost:5173/?fast");
      await page.getByRole("button", { name: "Apprendre à jouer" }).click();
    }
    await page.locator(".lesson-tile").nth(i).click();
    const t0 = Date.now();
    try {
      await playLesson(i);
      if (DEBUG) console.log(`  leçon ${i + 1} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      await page.waitForTimeout(300);
      const s = await tuto(page);
      await page.screenshot({ path: join(OUT, `lesson-${i + 1}-${lesson.id}.png`) });
      if (lesson.steps.some((st) => st.free))
        check(s.lessonId === lesson.id && !s.finished, `leçon ${i + 1} : partie libre atteinte`);
      else check(s.finished, `leçon ${i + 1} (${lesson.title}) terminée`);
    } catch (e) {
      await page.screenshot({ path: join(OUT, `lesson-${i + 1}-${lesson.id}-echec.png`) });
      check(false, `leçon ${i + 1} (${lesson.title}) : ${(e as Error).message}`);
    }
    // Retour au menu du tutoriel.
    const coach = page.locator(".coach");
    if (
      await coach
        .getByRole("button", { name: "Menu du tutoriel" })
        .isVisible()
        .catch(() => false)
    )
      await coach.getByRole("button", { name: "Menu du tutoriel" }).click();
    else if (
      await coach
        .getByRole("button", { name: "Quitter" })
        .isVisible()
        .catch(() => false)
    )
      await coach.getByRole("button", { name: "Quitter" }).click();
  }
  if (ONLY === null) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, "99-menu-fin.png") });
    check((await page.locator(".lesson-tile.done").count()) === LESSONS.length - 1, "leçons 1 à 8 marquées terminées");
  }
} finally {
  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(" | ")}` : "aucune erreur de page");
  await browser.close();
}
if (!failed) console.log("ok : tutoriel suivi de bout en bout");
