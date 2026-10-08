/**
 * Standard legalities compared with Scryfall (PLAN-C, C19; weekly CI job): banned cards, legal cards absent from the
 * data (new set, set not imported), cards of our data legal for us but no longer on Scryfall (rotation). Fails
 * (code 1) on any gap: reimport (`npm run import-cards`) or add an override
 * (`packages/cards/data/legality-overrides.json`), then update the README list.
 *
 * Commander (PLAN-E, `--commander`): ban list, Game Changers (`is:gamechanger`) and catalog cards not legal in
 * Commander, compared with `packages/cards/data/commander.json`; `--write` rewrites the file (first-face names,
 * sorted).
 *
 * Usage: npx tsx tools/check-legality.ts [--commander [--write]]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "@mtgx/cards";

const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const front = (name: string) => name.split(" // ")[0] as string;

/** Names (once each) of the cards of a Scryfall search. */
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
    if (!res.ok) throw new Error(`Scryfall ${res.status} on ${url}`);
    const page = (await res.json()) as { data: { name: string }[]; has_more: boolean; next_page?: string };
    // First-face name: our data names "A" a "prepare" card that Scryfall names "A // B".
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

/** Prints the gaps; true if there are any. */
function printReport(report: [string, string[]][]): boolean {
  let failed = false;
  for (const [label, list] of report) {
    if (!list.length) continue;
    failed = true;
    console.log(`${label} (${list.length}):\n  ${list.slice(0, 50).join("\n  ")}${list.length > 50 ? "\n  …" : ""}`);
  }
  return failed;
}

async function checkStandard(): Promise<void> {
  const localBanned = new Set(local.filter((c) => c.legalities?.standard === "banned").map((c) => front(c.name)));
  const localLegal = new Set(local.filter((c) => c.legalities?.standard === "legal").map((c) => front(c.name)));

  const [banned, legal] = [await names("banned:standard"), await names("legal:standard")];
  const report: [string, string[]][] = [
    ["banned on Scryfall, not here", diff(banned, localBanned)],
    ["banned here, no longer on Scryfall", diff(localBanned, banned)],
    ["legal on Scryfall, absent or not legal here", diff(legal, localLegal)],
    ["legal here, no longer on Scryfall (rotation?)", diff(localLegal, legal)],
  ];
  const failed = printReport(report);
  console.log(
    failed
      ? "Gaps with Scryfall: reimport or add an override, then update the README."
      : `Legalities up to date: ${legal.size} legal cards, ${banned.size} banned.`,
  );
  process.exitCode = failed ? 1 : 0;
}

/** Commander data (PLAN-E): `packages/cards/data/commander.json`. */
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
  // Catalog cards neither legal nor banned in Commander ("Un-" cards, conspiracies…): one search, crossed with the
  // catalog.
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
      `commander.json written: ${fresh.banned.length} banned, ${fresh.gameChangers.length} Game Changers, ${fresh.notLegal.length} not legal in the catalog.`,
    );
    return;
  }
  const old = JSON.parse(readFileSync(FILE, "utf8")) as CommanderData;
  const failed = printReport([
    ["banned in Commander on Scryfall, not here", diff(banned, new Set(old.banned))],
    ["banned here, no longer on Scryfall", diff(new Set(old.banned), banned)],
    ["Game Changers on Scryfall, not here", diff(gameChangers, new Set(old.gameChangers))],
    ["Game Changers here, no longer on Scryfall", diff(new Set(old.gameChangers), gameChangers)],
    ["not legal in Commander on Scryfall, not here", diff(notLegal, new Set(old.notLegal))],
    ["not legal here, legal on Scryfall", diff(new Set(old.notLegal), notLegal)],
  ]);
  console.log(
    failed
      ? "Gaps with Scryfall: npx tsx tools/check-legality.ts --commander --write, then review the diff."
      : `Commander up to date: ${banned.size} banned, ${gameChangers.size} Game Changers.`,
  );
  process.exitCode = failed ? 1 : 0;
}
