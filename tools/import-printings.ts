/**
 * Table des impressions (apparences) de chaque carte du catalogue, d'après le fichier « Default Cards » de Scryfall :
 * le deck peut choisir l'illustration d'une carte parmi toutes ses impressions papier (éditeur de deck, menu « Illustration »).
 *
 * - une entrée par apparence : même illustration, même cadre, même bordure, mêmes effets de cadre → une seule impression
 *   (la plus ancienne) ;
 * - impressions papier seulement : ni numériques, ni surdimensionnées, ni « memorabilia » (bords dorés), ni jetons ;
 * - une carte imprimée dans une seule langue garde la sienne (Archives mystiques japonaises de STA, planeswalkers
 *   japonais de WAR…) ;
 * - terrains de base : les versions pleine carte seulement ;
 * - l'impression de la carte et celles des rééditions du catalogue (`CardDef.printings`, avec leur image française) ne
 *   sont pas reprises.
 *
 * Écrit packages/cards/data/printings.json : { sets: { CODE: nom }, cards: { nom: "SET num id année[ langue];…" } }
 * (id : identifiant Scryfall sans tirets ; du plus récent au plus ancien).
 *
 * Usage : npm run import-printings [-- <fichier default-cards .jsonl.gz déjà téléchargé>]
 */
import { createReadStream, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { CARDS } from "../packages/cards/src/index";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "printings.json");
const HEADERS = { "User-Agent": "MTGX/0.1 (projet non commercial)", Accept: "application/json" };

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
}

const SKIPPED_SET_TYPES = new Set(["memorabilia", "token", "minigame"]);
const SKIPPED_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem", "reversible_card"]);

async function input(): Promise<NodeJS.ReadableStream> {
  const local = process.argv[2];
  if (local) return createReadStream(local).pipe(createGunzip());
  const bulk = (await (await fetch("https://api.scryfall.com/bulk-data", { headers: HEADERS })).json()) as {
    data: { type: string; jsonl_download_uri?: string; download_uri?: string }[];
  };
  const entry = bulk.data.find((d) => d.type === "default_cards");
  const uri = entry?.jsonl_download_uri;
  if (!uri) throw new Error("Scryfall : fichier « default_cards » (jsonl) introuvable");
  console.log(`Téléchargement : ${uri}`);
  const res = await fetch(uri, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Scryfall : ${res.status}`);
  return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(createGunzip());
}

const prints: ScryfallPrint[] = [];
for await (const line of createInterface({ input: await input() })) {
  if (!line.trim()) continue;
  const c = JSON.parse(line) as ScryfallPrint;
  if (!CARDS[c.name] || c.digital || c.oversized) continue;
  if (SKIPPED_SET_TYPES.has(c.set_type) || SKIPPED_LAYOUTS.has(c.layout)) continue;
  if (c.image_status === "missing" || c.image_status === "placeholder") continue;
  if (!c.image_uris && !c.card_faces?.[0]?.image_uris) continue;
  prints.push(c);
}
// La plus ancienne impression d'une apparence la représente.
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
  // Apparences déjà proposées : la carte elle-même et ses rééditions du catalogue.
  const known = new Set([`${def.set}-${def.number}`, ...(def.printings ?? []).map((p) => p.key)]);
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
console.log(`${total} impressions pour ${Object.keys(cards).length} cartes, ${Object.keys(sets).length} ensembles → ${OUT}`);
