/**
 * Importe les données d'un set depuis l'API Scryfall (anglais + français)
 * et écrit un JSON réduit aux champs utiles dans packages/cards/data/<set>.json.
 *
 * Usage : npm run import-cards -- [set]   (défaut : fdn)
 *
 * Les images ne sont pas téléchargées : on conserve seulement leurs URLs (CDN Scryfall).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SET = (process.argv[2] ?? "fdn").toLowerCase();
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", `${SET}.json`);
const HEADERS = { "User-Agent": "MTGX/0.1 (projet non commercial)", Accept: "application/json" };

interface ScryfallCard {
  name: string;
  lang: string;
  collector_number: string;
  rarity: string;
  layout: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  keywords: string[];
  produced_mana?: string[];
  printed_name?: string;
  printed_type_line?: string;
  printed_text?: string;
  image_uris?: { small: string; normal: string; art_crop: string };
  booster: boolean;
  promo: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?unique=prints&order=set&q=${encodeURIComponent(query)}`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 404) return cards; // aucune carte
    if (!res.ok) throw new Error(`Scryfall ${res.status} sur ${url}`);
    const page = (await res.json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
    cards.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120); // Scryfall demande 50–100 ms entre deux requêtes
  }
  return cards;
}

const en = await search(`set:${SET} lang:en`);
const fr = await search(`set:${SET} lang:fr`);
const frByNumber = new Map(fr.map((c) => [c.collector_number, c]));

// Une seule entrée par nom : la première impression « normale » (numéro le plus bas).
const byName = new Map<string, Record<string, unknown>>();
const sorted = [...en].sort((a, b) => Number.parseInt(a.collector_number, 10) - Number.parseInt(b.collector_number, 10));
for (const c of sorted) {
  if (c.layout !== "normal" || c.promo || !c.image_uris) continue;
  if (byName.has(c.name)) continue;
  const f = frByNumber.get(c.collector_number);
  byName.set(c.name, {
    name: c.name,
    number: c.collector_number,
    rarity: c.rarity,
    manaCost: c.mana_cost ?? "",
    cmc: c.cmc,
    typeLine: c.type_line,
    oracleText: c.oracle_text ?? "",
    power: c.power,
    toughness: c.toughness,
    colors: c.colors ?? [],
    keywords: c.keywords,
    producedMana: c.produced_mana,
    image: c.image_uris.normal,
    artCrop: c.image_uris.art_crop,
    fr: f
      ? {
          name: f.printed_name,
          typeLine: f.printed_type_line,
          text: f.printed_text,
          image: f.image_uris?.normal,
        }
      : undefined,
  });
}

const out = [...byName.values()];
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.length} cartes (${fr.length} impressions FR) écrites dans ${OUT}`);
