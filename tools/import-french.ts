/**
 * Missing French data of a set (PLAN-C, C19), without reimporting the rest (FDN and FRA are edited by hand): for each
 * card without `fr`, the French printing of the same set (same number, otherwise same English name), otherwise that of
 * another set (name, type, text; the image stays the English one, since the art may differ).
 * "prepare" cards: the prepared spell also gets its French text. Multi-face cards are left to the importer (one French
 * text per face).
 *
 * Usage: npx tsx tools/import-french.ts <set>   (rewrites packages/cards/data/<set>.json identically, fr added)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SET = (process.argv[2] ?? "").toLowerCase();
if (!SET) throw new Error("Usage: npx tsx tools/import-french.ts <set>");
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", `${SET}.json`);
const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FrPrint {
  name: string;
  collector_number: string;
  set: string;
  released_at: string;
  printed_name?: string;
  printed_type_line?: string;
  printed_text?: string;
  image_uris?: { normal: string };
  card_faces?: { printed_name?: string; printed_type_line?: string; printed_text?: string }[];
}
interface Entry {
  name: string;
  number: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  prepare?: { name: string; fr?: { name?: string; typeLine?: string; text?: string } };
}

async function search(query: string): Promise<FrPrint[]> {
  const out: FrPrint[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(query)}`;
  while (url) {
    let res = await fetch(url, { headers: HEADERS });
    for (let wait = 5000; res.status === 429 && wait <= 80000; wait *= 2) {
      await sleep(wait);
      res = await fetch(url, { headers: HEADERS });
    }
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Scryfall ${res.status} on ${url}`);
    const page = (await res.json()) as { data: FrPrint[]; has_more: boolean; next_page?: string };
    out.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120);
  }
  return out;
}

const raw = readFileSync(FILE, "utf8");
const data = JSON.parse(raw) as Entry[];
// Multi-face cards: one French text per face, given by the importer (`tools/import-scryfall.ts`).
const missing = data.filter((c) => !c.fr && !(c as { faces?: unknown }).faces);
const front = (n: string) => n.split(" // ")[0] as string;

// 1. Same set: by number, otherwise by English name.
const same = await search(`set:${SET} lang:fr`);
const byNumber = new Map(same.map((p) => [p.collector_number, p]));
const byName = new Map(same.map((p) => [front(p.name), p]));
// 2. Other sets: the newest French printing of each name still missing (grouped queries).
const elsewhere = new Map<string, FrPrint>();
const rest = missing.filter((c) => !byNumber.get(c.number) && !byName.get(c.name)).map((c) => c.name);
for (let i = 0; i < rest.length; i += 20) {
  const batch = rest.slice(i, i + 20);
  for (const p of await search(`lang:fr (${batch.map((n) => `!"${n}"`).join(" or ")})`)) {
    const cur = elsewhere.get(front(p.name));
    if (!cur || p.released_at > cur.released_at) elsewhere.set(front(p.name), p);
  }
}

let filled = 0;
for (const c of missing) {
  const local = byNumber.get(c.number) ?? byName.get(c.name);
  const p = local ?? elsewhere.get(c.name);
  if (!p) continue;
  const [main, spell] = p.card_faces ?? [];
  c.fr = {
    name: main?.printed_name ?? p.printed_name,
    typeLine: main?.printed_type_line ?? p.printed_type_line,
    text: main?.printed_text ?? p.printed_text,
    ...(local && p.image_uris ? { image: p.image_uris.normal } : {}),
  };
  if (c.prepare && spell)
    c.prepare.fr = { name: spell.printed_name, typeLine: spell.printed_type_line, text: spell.printed_text };
  filled++;
}
writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
console.log(
  `${SET}: ${filled} / ${missing.length} cards without French completed (${same.length} French printings of the set, ${elsewhere.size} from other sets)`,
);
