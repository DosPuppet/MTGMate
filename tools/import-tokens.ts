/**
 * Imports the tokens of the Standard sets from Scryfall (token sets "t<code>") and writes
 * packages/cards/data/tokens.json: name, type line, P/T, colors, text and image URL.
 * The client uses it to show a token with its image (`tokenImage`, packages/cards/src/tokenImages.ts).
 *
 * Usage: npm run import-tokens
 * The images are not downloaded: only their URLs are kept (Scryfall CDN).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SET_INFO } from "../packages/cards/src/setRegistry";

/** Sets whose tokens are taken (the newest first: their image is preferred for the same name). */
const SETS = [
  "lci",
  "dsk",
  "blb",
  "fin",
  "otj",
  "big",
  "dft",
  "eoe",
  "fdn",
  "tdm",
  "woe",
  "mkm",
  "tla",
  "spm",
  "hob",
  "ecl",
  "sos",
  "msh",
  "tmt",
];
// Every set of the registry (`cards/src/setRegistry.ts`) except FRA (no tokens on Scryfall), the reprints and the
// Commander pseudo-set: a set added to the registry must take its place in this order of preference.
const missing = SET_INFO.filter((x) => !x.reprint && !x.byName)
  .map((x) => x.code.toLowerCase())
  .filter((c) => c !== "fra" && !SETS.includes(c));
if (missing.length) throw new Error(`Registry sets missing from the token list: ${missing.join(", ")}`);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "tokens.json");
const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };

interface ScryfallToken {
  name: string;
  type_line: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  oracle_text?: string;
  set: string;
  image_uris?: { normal: string };
  card_faces?: {
    name: string;
    type_line: string;
    power?: string;
    toughness?: string;
    colors?: string[];
    oracle_text?: string;
    image_uris?: { normal: string };
  }[];
}

export interface TokenArt {
  name: string;
  typeLine: string;
  power?: number;
  toughness?: number;
  colors: string[];
  text: string;
  image: string;
  set: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string): Promise<ScryfallToken[]> {
  const out: ScryfallToken[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 404) return out; // no tokens for this set
    if (!res.ok) throw new Error(`Scryfall ${res.status} for ${q}`);
    const page = (await res.json()) as { data: ScryfallToken[]; has_more: boolean; next_page?: string };
    out.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120); // politeness towards the API (10 requests per second at most)
  }
  return out;
}

const num = (v?: string) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);

const tokens: TokenArt[] = [];
for (const set of SETS) {
  const found = await search(`set:t${set}`);
  for (const t of found) {
    // Double-faced tokens (two tokens back to back): each face is a token.
    const faces = t.card_faces?.length ? t.card_faces.map((f) => ({ ...f, set: t.set })) : [t];
    for (const f of faces) {
      const image = f.image_uris?.normal ?? t.image_uris?.normal;
      if (!image || !f.type_line.includes("Token")) continue;
      tokens.push({
        name: f.name,
        typeLine: f.type_line,
        power: num(f.power),
        toughness: num(f.toughness),
        colors: f.colors ?? t.colors ?? [],
        text: f.oracle_text ?? "",
        image,
        set: t.set,
      });
    }
  }
  console.log(`t${set}: ${found.length} token(s)`);
}
writeFileSync(OUT, `${JSON.stringify(tokens, null, 1)}\n`);
console.log(`${tokens.length} token faces written to ${OUT}`);
