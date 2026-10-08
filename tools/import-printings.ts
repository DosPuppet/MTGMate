/**
 * Table of the printings (looks) of each catalog card, from Scryfall's "Default Cards" file: a deck can choose the art
 * of a card among all its paper printings (deck builder, "Art" menu).
 *
 * - one entry per look: same art, same frame, same border, same frame effects → a single printing (the oldest);
 * - paper printings only: neither digital, nor oversized, nor "memorabilia" (gold borders), nor tokens;
 * - a card printed in a single language keeps its own (Japanese Mystical Archive of STA, Japanese planeswalkers of
 *   WAR…);
 * - basic lands: the full-art versions only;
 * - the printing of the card and those of the catalog reprints (`CardDef.printings`, with their French image) are not
 *   repeated.
 *
 * Writes packages/cards/data/printings.json: { sets: { CODE: name }, cards: { name: "SET num id year[ language];…" } }
 * (id: Scryfall identifier without dashes; from the newest to the oldest).
 *
 * Color identity (PLAN-E): the identity computed by the engine (`colorIdentity`) is compared with Scryfall's for every
 * catalog card; a gap is reported (exit code 1), the table is written anyway.
 *
 * Usage: npm run import-printings [-- <default-cards .jsonl.gz file already downloaded>]
 */
import { createReadStream, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { colorIdentity } from "@mtgx/engine";
import { CARDS } from "../packages/cards/src/index";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "printings.json");
const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };

interface ScryfallPrint {
  id: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  set_type: string;
  collector_number: string;
  released_at: string;
  layout: string;
  digital: boolean;
  oversized: boolean;
  full_art: boolean;
  textless: boolean;
  frame: string;
  border_color: string;
  frame_effects?: string[];
  illustration_id?: string;
  image_status: string;
  image_uris?: unknown;
  card_faces?: { illustration_id?: string; image_uris?: unknown }[];
  color_identity?: string[];
}

const SKIPPED_SET_TYPES = new Set(["memorabilia", "token", "minigame"]);
const SKIPPED_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem", "reversible_card"]);

async function input(): Promise<NodeJS.ReadableStream> {
  const local = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (local) return createReadStream(local).pipe(createGunzip());
  const bulk = (await (await fetch("https://api.scryfall.com/bulk-data", { headers: HEADERS })).json()) as {
    data: { type: string; jsonl_download_uri?: string; download_uri?: string }[];
  };
  const entry = bulk.data.find((d) => d.type === "default_cards");
  const uri = entry?.jsonl_download_uri;
  if (!uri) throw new Error('Scryfall: "default_cards" file (jsonl) not found');
  console.log(`Downloading: ${uri}`);
  const res = await fetch(uri, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Scryfall: ${res.status}`);
  return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(createGunzip());
}

const prints: ScryfallPrint[] = [];
/** Color identity according to Scryfall, by name (the same for every printing). */
const identity = new Map<string, string[]>();
for await (const line of createInterface({ input: await input() })) {
  if (!line.trim()) continue;
  const c = JSON.parse(line) as ScryfallPrint;
  if (!CARDS[c.name]) continue;
  // Playtest cards and memorabilia with the same name (Red Herring, Earth Rumble…): identity of another card.
  if (c.color_identity && !SKIPPED_LAYOUTS.has(c.layout) && !SKIPPED_SET_TYPES.has(c.set_type) && c.set_type !== "funny")
    identity.set(c.name, c.color_identity);
  if (c.digital || c.oversized) continue;
  if (SKIPPED_SET_TYPES.has(c.set_type) || SKIPPED_LAYOUTS.has(c.layout)) continue;
  if (c.image_status === "missing" || c.image_status === "placeholder") continue;
  if (!c.image_uris && !c.card_faces?.[0]?.image_uris) continue;
  prints.push(c);
}
// The oldest printing of a look represents it.
prints.sort((a, b) => a.released_at.localeCompare(b.released_at) || a.set.localeCompare(b.set));

const look = (c: ScryfallPrint) =>
  [
    c.illustration_id ?? c.card_faces?.[0]?.illustration_id,
    c.lang,
    c.frame,
    c.border_color,
    c.full_art,
    c.textless,
    [...(c.frame_effects ?? [])].sort().join(","),
  ].join("|");
const keyOf = (c: ScryfallPrint) => `${c.set.toUpperCase()}-${c.collector_number}`;

const byName = new Map<string, ScryfallPrint[]>();
for (const c of prints) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);

const sets: Record<string, string> = {};
const cards: Record<string, string> = {};
let total = 0;
for (const name of Object.keys(CARDS).sort()) {
  const def = CARDS[name];
  const list = byName.get(name);
  if (!def || !list) continue;
  // Looks already offered: the card itself and its catalog reprints.
  const known = new Set([`${def.origin ?? def.set}-${def.number}`, ...(def.printings ?? []).map((p) => p.key)]);
  const seen = new Set(list.filter((c) => known.has(keyOf(c))).map(look));
  const basic = def.supertypes.includes("Basic");
  const kept: ScryfallPrint[] = [];
  for (const c of list) {
    if (known.has(keyOf(c)) || (basic && !c.full_art)) continue;
    const l = look(c);
    if (seen.has(l)) continue;
    seen.add(l);
    kept.push(c);
  }
  if (!kept.length) continue;
  kept.reverse();
  for (const c of kept) sets[c.set.toUpperCase()] ??= c.set_name;
  cards[name] = kept
    .map((c) =>
      [
        c.set.toUpperCase(),
        c.collector_number,
        c.id.replaceAll("-", ""),
        c.released_at.slice(0, 4),
        ...(c.lang === "en" ? [] : [c.lang]),
      ].join(" "),
    )
    .join(";");
  total += kept.length;
}

const sortedSets = Object.fromEntries(Object.entries(sets).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify({ sets: sortedSets, cards }, null, 1)}\n`);
console.log(`${total} printings for ${Object.keys(cards).length} cards, ${Object.keys(sets).length} sets → ${OUT}`);

// Color identity: engine computation against Scryfall.
const ORDER = ["W", "U", "B", "R", "G"];
const mismatches: string[] = [];
for (const [name, want] of identity) {
  const def = CARDS[name];
  if (!def || def.isToken) continue;
  const got = colorIdentity(def).join("");
  const expected = ORDER.filter((c) => want.includes(c)).join("");
  if (got !== expected) mismatches.push(`${name}: computed ${got || "colorless"}, Scryfall ${expected || "colorless"}`);
}
console.log(`Color identity: ${identity.size} cards compared with Scryfall, ${mismatches.length} gap(s)`);
for (const m of mismatches) console.log(`  ${m}`);
if (mismatches.length) process.exitCode = 1;
