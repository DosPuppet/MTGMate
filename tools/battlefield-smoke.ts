/**
 * Test de bout en bout du champ de bataille chargé (disposition façon MTGA, board/layout.ts) :
 * des plateaux fournis sont mis en jeu par le bac à sable du mode dev (voir client/src/protocol.ts),
 * puis on vérifie les rangées, les piles de jetons, les lignes, l'absence de carte rognée et
 * l'attaque d'un jeton depuis une pile. Captures dans test-results/battlefield/.
 *
 * Prérequis : `npm run dev` lancé (redémarré après une modification du moteur).
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const OUT = "test-results/battlefield";
mkdirSync(OUT, { recursive: true });

type Side = { cards?: string[]; tokens?: [number, string][] };
/** Accès au store exposé en mode dev (client/src/main.tsx). */
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: Record<string, Side>): void;
      view: {
        viewer: string;
        pending: { kind: string; player: string } | null;
        battlefield: { id: string; types: string[] }[];
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
    "Shivan Dragon",
    "Savannah Lions",
    "Elvish Archdruid",
    "Gigantosaurus",
    "Omniscience",
    "Thousand-Year Storm",
    "Fishing Pole",
    "Cultivator's Caravan",
    "Ajani, Caller of the Pride",
    ...repeat(5, "Forest"),
    ...repeat(3, "Plains"),
  ],
  tokens: [
    [12, "Rabbit"],
    [3, "Goblin"],
    [5, "Treasure"],
  ],
};
const CROWDED: Side = {
  cards: [
    ...repeat(8, "Llanowar Elves"),
    ...repeat(6, "Savannah Lions"),
    ...repeat(5, "Courageous Goblin"),
    ...repeat(4, "Dwynen's Elite"),
    ...repeat(4, "Brazen Scourge"),
    "Vivien Reid",
    "Banner of Kinship",
    ...repeat(7, "Forest"),
  ],
  tokens: [
    [6, "Soldier"],
    [4, "Food"],
  ],
};
const LIGHT: Side = {
  cards: [...repeat(6, "Llanowar Elves"), "Omniscience", "Fishing Pole", ...repeat(5, "Forest")],
  tokens: [
    [5, "Goblin"],
    [2, "Treasure"],
  ],
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "ÉCHEC"} : ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

async function open(viewport: { width: number; height: number }, sandbox: Record<string, Side>, ais = 1): Promise<Page> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/");
  await page.evaluate(
    ([deck, sb, n]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, Array(n).fill(deck), sb),
    [DECK, sandbox, ais] as const,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  return page;
}

/** Mesures du plateau : cartes rognées par leur zone, piles de jetons, lignes par rangée, place des supports. */
async function audit(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const zones = [...document.querySelectorAll(".battlefield")];
    return {
      clipped: zones.map((bf) => {
        const z = bf.getBoundingClientRect();
        return [...bf.querySelectorAll(".perm > .card-slot")].filter((c) => {
          const b = c.getBoundingClientRect();
          return b.left < z.left - 1 || b.right > z.right + 1;
        }).length;
      }),
      stacks: [...document.querySelectorAll(".battlefield.me .token-count")].map((e) => e.textContent),
      lines: zones.map((bf) => [...bf.querySelectorAll(".perm-row")].map((row) => row.querySelectorAll(".perm-line").length)),
      /** Permanents mal rangés : non-créature devant (hors planeswalkers), créature derrière. */
      misplaced: (() => {
        const view = (window as unknown as DevWindow).__mtgx.getState().view;
        const types = new Map(view?.battlefield.map((o) => [o.id, o.types]) ?? []);
        // Pas de fonction nommée ici : tsx y injecterait __name, inconnu dans la page.
        const front = [...document.querySelectorAll(".perm-row.front .perm > [data-oid]")]
          .map((e) => (e as HTMLElement).dataset.oid ?? "")
          .filter((id) => !types.get(id)?.some((t) => t === "Creature" || t === "Planeswalker"));
        const back = [...document.querySelectorAll(".perm-row.back .perm > [data-oid]")]
          .map((e) => (e as HTMLElement).dataset.oid ?? "")
          .filter((id) => types.get(id)?.includes("Creature"));
        return [...front, ...back].length;
      })(),
      /** Largeur des cartes de la rangée de devant, par zone (hauteur / 1,395 : insensible à l'engagement). */
      frontW: zones.map((bf) =>
        Math.round((bf.querySelector(".perm-row.front .perm > .card-slot")?.getBoundingClientRect().height ?? 0) / 1.395),
      ),
      supportInBack: document.querySelectorAll(".battlefield.me .perm-row.back .slot.block-start").length,
    };
  });
  console.log(label, JSON.stringify(r));
  check(
    r.clipped.every((n) => n === 0),
    `${label} : aucune carte rognée`,
    r.clipped,
  );
  return r;
}

// 1. Duel chargé, 1600×900 : piles, rangées, deuxième ligne chez l'adversaire.
let page = await open({ width: 1600, height: 900 }, { p1: ME, p2: CROWDED });
await page.screenshot({ path: `${OUT}/1-duel-1600.png` });
let r = await audit(page, "duel 1600");
check(r.stacks.includes("×12") && r.stacks.includes("×5"), "jetons identiques regroupés (×12, ×5)", r.stacks);
check(!r.stacks.includes("×3"), "3 jetons identiques ne sont pas regroupés", r.stacks);
check(r.supportInBack === 1, "artefacts et enchantements dans la rangée arrière, séparés des terrains", r.supportInBack);
check(r.misplaced === 0, "créatures et planeswalkers devant, aucun artefact ou enchantement non-créature", r.misplaced);
check((r.lines[0]?.[1] ?? 0) >= 2, "l'adversaire chargé passe sur plusieurs lignes", r.lines);
check(
  (r.frontW[1] ?? 0) > (r.frontW[0] ?? 0) + 10,
  "chaque camp a sa taille : vos cartes restent plus grandes que celles de l'adversaire chargé",
  r.frontW,
);

// 2. Attaque d'un jeton à la fois depuis la pile.
const pending = () =>
  page.evaluate(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return v?.pending ? `${v.pending.kind}|${v.pending.player === v.viewer}` : "";
  });
for (let i = 0; i < 80 && (await pending()) !== "declareAttackers|true"; i++) {
  const main = page.locator(".main-button");
  if (!(await main.isDisabled())) await main.click().catch(() => {});
  await page.waitForTimeout(300);
}
check((await pending()) === "declareAttackers|true", "déclaration des attaquants atteinte");
const stackTop = (n: number) =>
  page.locator(".battlefield.me .token-stack", { hasText: `×${n}` }).locator(":scope > .perm .card");
await stackTop(12).click();
await page.waitForTimeout(400);
await stackTop(11).click();
await page.waitForTimeout(400);
const after = await page.locator(".battlefield.me .token-count").allInnerTexts();
check(after.includes("×10"), "deux clics sur la pile font attaquer deux jetons (×12 → ×10)", after);
check(/Attaquer \(2\)/.test(await page.locator(".main-button").innerText()), "le bouton compte 2 attaquants");
await page.screenshot({ path: `${OUT}/2-attack.png` });
await page.context().browser()?.close();

// 3. Petit écran.
page = await open({ width: 1280, height: 720 }, { p1: ME, p2: CROWDED });
await page.screenshot({ path: `${OUT}/3-duel-1280.png` });
await audit(page, "duel 1280");
await page.context().browser()?.close();

// 4. Quatre joueurs : zones adverses étroites.
page = await open({ width: 1600, height: 900 }, { p1: ME, p2: LIGHT, p3: LIGHT, p4: CROWDED }, 3);
await page.screenshot({ path: `${OUT}/4-four-players.png` });
r = await audit(page, "4 joueurs");
check((r.lines[2]?.[1] ?? 0) > 2, "zone adverse étroite et chargée : plus de 2 lignes plutôt que des cartes rognées", r.lines);
await page.context().browser()?.close();

check(errors.length === 0, "aucune erreur de page", errors);
if (failures.length) {
  console.log(`${failures.length} échec(s)`);
  process.exit(1);
}
