/**
 * Légalités Standard comparées à Scryfall (PLAN-C, C19 ; tâche hebdomadaire de la CI) : cartes bannies, cartes légales
 * absentes des données (nouvelle extension, extension non importée), cartes de nos données légales chez nous mais plus
 * chez Scryfall (rotation). Échoue (code 1) sur tout écart : réimporter (`npm run import-cards`) ou ajouter une
 * dérogation (`packages/cards/data/legality-overrides.json`), puis mettre à jour la liste du README.
 *
 * Commander (PLAN-E, `--commander`) : liste de bannissement, Game Changers (`is:gamechanger`) et cartes du catalogue non
 * légales en Commander, comparées à `packages/cards/data/commander.json` ; `--write` réécrit le fichier (noms de la
 * première face, triés).
 *
 * Usage : npx tsx tools/check-legality.ts [--commander [--write]]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "@mtgx/cards";

const HEADERS = { "User-Agent": "MTGX/0.1 (projet non commercial)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const front = (name: string) => name.split(" // ")[0] as string;

/** Noms (une fois chacun) des cartes d'une recherche Scryfall. */
async function names(query: string): Promise<Set<string>> {
  const out = new Set<string>();
  let url: string | null = `https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(query)}`;
  while (url) {
    let res = await fetch(url, { headers: HEADERS });
    for (let wait = 5000; res.status === 429 && wait <= 80000; wait *= 2) {
      await sleep(wait);
      res = await fetch(url, { headers: HEADERS });
    }
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Scryfall ${res.status} sur ${url}`);
    const page = (await res.json()) as { data: { name: string }[]; has_more: boolean; next_page?: string };
    // Nom de la première face : nos données nomment « A » une carte « à préparer » que Scryfall nomme « A // B ».
    for (const c of page.data) out.add(front(c.name));
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120);
  }
  return out;
}

const local = Object.values(CARDS).filter((c) => !c.isToken);
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();
const args = process.argv.slice(2);
if (args.includes("--commander")) await checkCommander(args.includes("--write"));
else await checkStandard();

/** Affiche les écarts ; vrai s'il y en a. */
function printReport(report: [string, string[]][]): boolean {
  let failed = false;
  for (const [label, list] of report) {
    if (!list.length) continue;
    failed = true;
    console.log(`${label} (${list.length}) :\n  ${list.slice(0, 50).join("\n  ")}${list.length > 50 ? "\n  …" : ""}`);
  }
  return failed;
}

async function checkStandard(): Promise<void> {
  const localBanned = new Set(local.filter((c) => c.legalities?.standard === "banned").map((c) => front(c.name)));
  const localLegal = new Set(local.filter((c) => c.legalities?.standard === "legal").map((c) => front(c.name)));

  const [banned, legal] = [await names("banned:standard"), await names("legal:standard")];
  const report: [string, string[]][] = [
    ["bannies chez Scryfall, pas chez nous", diff(banned, localBanned)],
    ["bannies chez nous, plus chez Scryfall", diff(localBanned, banned)],
    ["légales chez Scryfall, absentes ou non légales chez nous", diff(legal, localLegal)],
    ["légales chez nous, plus chez Scryfall (rotation ?)", diff(localLegal, legal)],
  ];
  const failed = printReport(report);
  console.log(
    failed
      ? "Écarts avec Scryfall : réimporter ou ajouter une dérogation, puis mettre à jour le README."
      : `Légalités à jour : ${legal.size} cartes légales, ${banned.size} bannies.`,
  );
  process.exitCode = failed ? 1 : 0;
}

/** Données Commander (PLAN-E) : `packages/cards/data/commander.json`. */
interface CommanderData {
  checked: string;
  banned: string[];
  gameChangers: string[];
  notLegal: string[];
}

async function checkCommander(write: boolean): Promise<void> {
  const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "commander.json");
  const sorted = (x: Set<string>) => [...x].sort();
  const banned = await names("banned:commander");
  const gameChangers = await names("is:gamechanger");
  // Cartes du catalogue ni légales ni bannies en Commander (cartes « Un- », conspirations…) : une recherche, croisée avec
  // le catalogue.
  const catalogue = new Set(local.map((c) => front(c.name)));
  const notLegal = new Set(
    [
      ...(await names(
        "game:paper -legal:commander -banned:commander -layout:art_series -is:token -set_type:memorabilia -is:funny",
      )),
    ].filter((n) => catalogue.has(n)),
  );
  const fresh: CommanderData = {
    checked: new Date().toISOString().slice(0, 10),
    banned: sorted(banned),
    gameChangers: sorted(gameChangers),
    notLegal: sorted(notLegal),
  };
  if (write) {
    writeFileSync(FILE, `${JSON.stringify(fresh, null, 1)}\n`);
    console.log(
      `commander.json écrit : ${fresh.banned.length} bannies, ${fresh.gameChangers.length} Game Changers, ${fresh.notLegal.length} non légales au catalogue.`,
    );
    return;
  }
  const old = JSON.parse(readFileSync(FILE, "utf8")) as CommanderData;
  const failed = printReport([
    ["bannies en Commander chez Scryfall, pas chez nous", diff(banned, new Set(old.banned))],
    ["bannies chez nous, plus chez Scryfall", diff(new Set(old.banned), banned)],
    ["Game Changers chez Scryfall, pas chez nous", diff(gameChangers, new Set(old.gameChangers))],
    ["Game Changers chez nous, plus chez Scryfall", diff(new Set(old.gameChangers), gameChangers)],
    ["non légales en Commander chez Scryfall, pas chez nous", diff(notLegal, new Set(old.notLegal))],
    ["non légales chez nous, légales chez Scryfall", diff(new Set(old.notLegal), notLegal)],
  ]);
  console.log(
    failed
      ? "Écarts avec Scryfall : npx tsx tools/check-legality.ts --commander --write, puis relire le diff."
      : `Commander à jour : ${banned.size} bannies, ${gameChangers.size} Game Changers.`,
  );
  process.exitCode = failed ? 1 : 0;
}
