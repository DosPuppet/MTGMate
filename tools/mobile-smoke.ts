/**
 * Test de bout en bout de l'interface sur tablette et téléphone (émulation d'appareils Playwright) :
 * main de 10 cartes et champ de bataille chargé par le bac à sable du mode dev. On vérifie que la main,
 * le bouton principal et les deux champs tiennent dans l'écran, sans défilement de page ; puis les gestes
 * tactiles (appui long = aperçu ; tap = carte levée, second tap = jouée) et l'écran « tournez l'appareil ».
 * Captures dans test-results/mobile/.
 *
 * Prérequis : `npm run dev` lancé (redémarré après une modification du moteur).
 */
import { mkdirSync } from "node:fs";
import { type BrowserContextOptions, chromium, devices, type Page } from "playwright";

const OUT = "test-results/mobile";
mkdirSync(OUT, { recursive: true });

type Side = { cards?: string[]; tokens?: [number, string][]; hand?: string[] };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: Record<string, Side>): void;
      view: {
        viewer: string;
        turn: { active: string };
        pending: { kind: string; player: string } | null;
        hand: { id: string; name: string }[];
        battlefield: { id: string }[];
      } | null;
    };
  };
};

const DECK: [number, string][] = [[60, "Forest"]];
const repeat = (n: number, name: string) => Array<string>(n).fill(name);
const ME: Side = {
  cards: [
    "Llanowar Elves",
    "Serra Angel",
    "Savannah Lions",
    "Elvish Archdruid",
    "Omniscience",
    ...repeat(4, "Forest"),
    ...repeat(3, "Plains"),
  ],
  tokens: [[3, "Goblin"]],
  hand: [
    "Llanowar Elves",
    "Giant Growth",
    "Serra Angel",
    "Shivan Dragon",
    "Opt",
    "Savannah Lions",
    "Pacifism",
    "Helpful Hunter",
    "Forest",
    "Plains",
  ],
};
const OPP: Side = {
  cards: [...repeat(5, "Llanowar Elves"), "Shivan Dragon", "Vivien Reid", ...repeat(6, "Mountain")],
  tokens: [[5, "Treasure"]],
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "ÉCHEC"} : ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();

async function open(device: BrowserContextOptions, opp: Side = OPP): Promise<Page> {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/");
  await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
    DECK,
    { p1: ME, p2: opp },
  ] as const);
  return page;
}

async function keep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
}

/** Éléments hors de l'écran : cartes de la main, bouton principal, cartes des champs de bataille. */
async function fits(page: Page, label: string): Promise<void> {
  // Code passé en texte : tsx injecterait __name dans les fonctions fléchées nommées.
  const r = (await page.evaluate(`(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = (el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1;
    };
    // Une carte de la main peut dépasser sous l'écran (comme sur MTGA), mais ses bords et son haut (nom de la carte) doivent se voir.
    const handOut = [...document.querySelectorAll(".hand-card")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.right > vw + 1 || b.top > vh - 30;
    }).length;
    return {
      hand: document.querySelectorAll(".hand-card").length,
      handOut,
      button: [...document.querySelectorAll(".main-button")].filter(out).length,
      perms: [...document.querySelectorAll(".battlefield .perm > .card-slot")].filter(out).length,
      scroll: document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1,
    };
  })()`)) as { hand: number; handOut: number; button: number; perms: number; scroll: boolean };
  console.log(label, JSON.stringify(r));
  check(r.hand >= 10 && r.handOut === 0, `${label} : main entière à l'écran`, r);
  check(r.button === 0, `${label} : bouton principal à l'écran`, r);
  check(r.perms === 0, `${label} : champs de bataille à l'écran`, r);
  check(!r.scroll, `${label} : pas de défilement de page`, r);
}

const DEVICES: [string, BrowserContextOptions][] = [
  ["ipad-paysage", devices["iPad (gen 7) landscape"]],
  ["ipad-pro-portrait", devices["iPad Pro 11"]],
  ["tablette-android", devices["Galaxy Tab S4 landscape"]],
  ["pixel-paysage", devices["Pixel 7 landscape"]],
  ["iphone-paysage", devices["iPhone 13 landscape"]],
];

for (const [name, device] of DEVICES) {
  const page = await open(device);
  await keep(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await fits(page, name);
  await page.context().close();
}

/** Passe (bouton principal) jusqu'à avoir la priorité pendant votre propre tour. */
async function myPriority(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const v = await page.evaluate(() => {
      const view = (window as unknown as DevWindow).__mtgx.getState().view;
      return (
        view && { mine: view.pending?.player === view.viewer, myTurn: view.turn.active === view.viewer, kind: view.pending?.kind }
      );
    });
    if (v?.mine && v.myTurn && v.kind === "priority") {
      await page.waitForTimeout(800);
      return;
    }
    if (v?.mine && v.kind === "priority") await page.locator(".main-button").click();
    await page.waitForTimeout(500);
  }
  throw new Error("pas de priorité pendant votre tour");
}

/** Appui long au doigt (vrais événements tactiles, via CDP). */
async function longPress(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const handCount = (page: Page) => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view?.hand.length ?? 0);

// Gestes tactiles sur iPad paysage (adversaire sans créatures : pas d'attaque à bloquer avant votre tour).
{
  const page = await open(devices["iPad (gen 7) landscape"], { cards: repeat(4, "Mountain") });
  await keep(page);
  await myPriority(page);
  // Appui long sur une carte du champ de bataille : aperçu en surimpression, fermé par un tap.
  const perm = page.locator(".battlefield.me .perm > .card-slot").first();
  const pb = await perm.boundingBox();
  if (pb) await longPress(page, pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.waitForTimeout(300);
  check(await page.locator(".touch-preview .preview-img").isVisible(), "appui long : aperçu de la carte en surimpression");
  await page.screenshot({ path: `${OUT}/geste-appui-long.png` });
  await page.locator(".touch-preview").tap({ position: { x: 10, y: 10 } });
  check((await page.locator(".touch-preview").count()) === 0, "un tap ferme l'aperçu");

  // Premier tap sur un terrain jouable : il se lève sans être joué ; second tap : il est joué.
  const before = await handCount(page);
  const land = page.locator(".hand-card:has(.glow-playable)").first();
  const lb = await land.boundingBox();
  // Tap sur le haut visible de la carte (le reste dépasse sous l'écran ou sous ses voisines).
  if (lb) await page.touchscreen.tap(lb.x + 12, lb.y + 12);
  await page.waitForTimeout(500);
  check((await page.locator(".hand-card.lifted").count()) === 1, "premier tap : carte levée");
  check((await handCount(page)) === before, "premier tap : carte pas encore jouée");
  await page.screenshot({ path: `${OUT}/geste-carte-levee.png` });
  const up = await page.locator(".hand-card.lifted").boundingBox();
  if (up) await page.touchscreen.tap(up.x + up.width / 2, up.y + up.height / 3);
  await page.waitForTimeout(800);
  check((await handCount(page)) < before, "second tap : carte jouée", { before, after: await handCount(page) });
  await page.context().close();
}

// Tiroir (réglages, journal) sur iPad en portrait.
{
  const page = await open(devices["iPad Pro 11"]);
  await keep(page);
  const vw = page.viewportSize()?.width ?? 0;
  const hidden = await page.locator(".sidebar").boundingBox();
  check(!!hidden && hidden.x >= vw - 1, "portrait : barre latérale repliée");
  await page.locator(".drawer-toggle").tap();
  await page.waitForTimeout(400);
  const shown = await page.locator(".sidebar").boundingBox();
  check(!!shown && shown.x + shown.width <= vw + 1 && shown.x < vw - 100, "☰ : tiroir ouvert", shown);
  await page.screenshot({ path: `${OUT}/tiroir.png` });
  await page.locator(".drawer-scrim").tap({ position: { x: 20, y: 300 } });
  await page.waitForTimeout(400);
  const closed = await page.locator(".sidebar").boundingBox();
  check(!!closed && closed.x >= vw - 1, "tap à côté : tiroir refermé");
  await page.context().close();
}

// Téléphone en portrait : invitation à tourner l'appareil.
{
  const page = await open(devices["iPhone 13"]);
  await page.waitForTimeout(1500);
  check(await page.locator(".rotate-hint").isVisible(), "téléphone en portrait : « Tournez votre appareil »");
  await page.screenshot({ path: `${OUT}/iphone-portrait.png` });
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`Erreurs de page :\n${errors.join("\n")}`);
else console.log("ok : aucune erreur de page");
process.exit(failures.length || errors.length ? 1 : 0);
