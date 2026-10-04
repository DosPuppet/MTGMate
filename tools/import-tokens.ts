/**
 * Importe les jetons des extensions Standard depuis Scryfall (sets de jetons « t<code> ») et écrit
 * packages/cards/data/tokens.json : nom, ligne de type, F/E, couleurs, texte et URL de l'image.
 * Le client s'en sert pour afficher un jeton avec son image (`tokenImage`, packages/cards/src/tokenImages.ts).
 *
 * Usage : npm run import-tokens
 * Les images ne sont pas téléchargées : on conserve seulement leurs URLs (CDN Scryfall).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SET_INFO } from "../packages/cards/src/setRegistry";

/** Extensions dont on prend les jetons (les plus récentes d'abord : leur image est préférée à nom égal). */
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
// Toutes les extensions du registre (`cards/src/setRegistry.ts`) sauf FRA (sans jetons chez Scryfall) et les rééditions : une extension
// ajoutée au registre doit prendre sa place dans cet ordre de préférence.
const missing = SET_INFO.filter((x) => !x.reprint)
  .map((x) => x.code.toLowerCase())
  .filter((c) => c !== "fra" && !SETS.includes(c));
if (missing.length) throw new Error(`Extensions du registre absentes de la liste des jetons : ${missing.join(", ")}`);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "tokens.json");
const HEADERS = { "User-Agent": "MTGX/0.1 (projet non commercial)", Accept: "application/json" };

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
    if (res.status === 404) return out; // pas de jetons pour cette extension
    if (!res.ok) throw new Error(`Scryfall ${res.status} pour ${q}`);
    const page = (await res.json()) as { data: ScryfallToken[]; has_more: boolean; next_page?: string };
    out.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120); // politesse envers l'API (10 requêtes par seconde au plus)
  }
  return out;
}

const num = (v?: string) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);

const tokens: TokenArt[] = [];
for (const set of SETS) {
  const found = await search(`set:t${set}`);
  for (const t of found) {
    // Jetons recto-verso (deux jetons au dos l'un de l'autre) : chaque face est un jeton.
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
  console.log(`t${set} : ${found.length} jeton(s)`);
}
writeFileSync(OUT, `${JSON.stringify(tokens, null, 1)}\n`);
console.log(`${tokens.length} faces de jetons écrites dans ${OUT}`);
