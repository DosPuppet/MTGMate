/**
 * Légalités Standard comparées à Scryfall (PLAN-C, C19 ; tâche hebdomadaire de la CI) : cartes bannies, cartes légales
 * absentes des données (nouvelle extension, extension non importée), cartes de nos données légales chez nous mais plus
 * chez Scryfall (rotation). Échoue (code 1) sur tout écart : réimporter (`npm run import-cards`) ou ajouter une
 * dérogation (`packages/cards/data/legality-overrides.json`), puis mettre à jour la liste du README.
 *
 * Usage : npx tsx tools/check-legality.ts
 */
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
const localBanned = new Set(local.filter((c) => c.legalities?.standard === "banned").map((c) => front(c.name)));
const localLegal = new Set(local.filter((c) => c.legalities?.standard === "legal").map((c) => front(c.name)));

const [banned, legal] = [await names("banned:standard"), await names("legal:standard")];
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();
const report: [string, string[]][] = [
  ["bannies chez Scryfall, pas chez nous", diff(banned, localBanned)],
  ["bannies chez nous, plus chez Scryfall", diff(localBanned, banned)],
  ["légales chez Scryfall, absentes ou non légales chez nous", diff(legal, localLegal)],
  ["légales chez nous, plus chez Scryfall (rotation ?)", diff(localLegal, legal)],
];
let failed = false;
for (const [label, list] of report) {
  if (!list.length) continue;
  failed = true;
  console.log(`${label} (${list.length}) :\n  ${list.slice(0, 50).join("\n  ")}${list.length > 50 ? "\n  …" : ""}`);
}
console.log(
  failed
    ? "Écarts avec Scryfall : réimporter ou ajouter une dérogation, puis mettre à jour le README."
    : `Légalités à jour : ${legal.size} cartes légales, ${banned.size} bannies.`,
);
process.exitCode = failed ? 1 : 0;
