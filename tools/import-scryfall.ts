/**
 * Importe les données d'un set depuis l'API Scryfall (anglais + français)
 * et écrit un JSON réduit aux champs utiles dans packages/cards/data/<set>.json.
 *
 * Usage : npm run import-cards -- [set|all|reprints]   (défaut : fdn ; « all » : toutes les extensions Standard hors FDN
 * et FRA ; « reprints » : les ensembles de rééditions du registre, PLAN-G)
 *
 * Les images ne sont pas téléchargées : on conserve seulement leurs URLs (CDN Scryfall).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUDED_REPRINTS, SET_INFO, STANDARD_SETS } from "../packages/cards/src/setRegistry";

/** Extensions Standard importées par « all » : le registre (`cards/src/setRegistry.ts`), sauf FDN et FRA, déjà importées
 * et retouchées, qui s'importent à part. */
const STANDARD = STANDARD_SETS.map((x) => x.code.toLowerCase()).filter((c) => c !== "fdn" && c !== "fra");
/** Ensembles de rééditions (Special Guests, feuilles bonus) : importés par « reprints ». */
const REPRINTS = SET_INFO.filter((x) => x.reprint).map((x) => x.code.toLowerCase());
const ARG = (process.argv[2] ?? "fdn").toLowerCase();
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data");
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
  loyalty?: string;
  colors?: string[];
  keywords: string[];
  produced_mana?: string[];
  printed_name?: string;
  printed_type_line?: string;
  printed_text?: string;
  image_uris?: { small: string; normal: string; art_crop: string };
  /** Faces : sort préparé, aventure, carte scindée, recto-verso (chaque face a alors son image), assemblage. */
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line: string;
    oracle_text?: string;
    power?: string;
    toughness?: string;
    loyalty?: string;
    colors?: string[];
    printed_name?: string;
    printed_type_line?: string;
    printed_text?: string;
    image_uris?: { small: string; normal: string; art_crop: string };
  }[];
  legalities: Record<string, string>;
  /** Cartes liées (assemblage : les deux parties et la carte assemblée). */
  all_parts?: { component: string; name: string }[];
  booster: boolean;
  promo: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?unique=prints&order=set&q=${encodeURIComponent(query)}`;
  while (url) {
    let res = await fetch(url, { headers: HEADERS });
    // Trop de requêtes : Scryfall demande d'attendre avant de réessayer.
    for (let wait = 5000; res.status === 429 && wait <= 80000; wait *= 2) {
      console.log(`Scryfall 429 : nouvel essai dans ${wait / 1000} s`);
      await sleep(wait);
      res = await fetch(url, { headers: HEADERS });
    }
    if (res.status === 404) return cards; // aucune carte
    if (!res.ok) throw new Error(`Scryfall ${res.status} sur ${url}`);
    const page = (await res.json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
    cards.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120); // Scryfall demande 50–100 ms entre deux requêtes
  }
  return cards;
}

/** Dispositions à une face (une image) : cartes simples, « à préparer » (créature + sort), Sagas, Classes, Affaires. */
const SINGLE = new Set(["normal", "prepare", "saga", "class", "case", "meld"]);
/** Dispositions à plusieurs faces : gardées telles quelles (faces), gérées par le moteur aux lots 0.3 à 0.6. */
const MULTI = new Set(["adventure", "split", "transform", "modal_dfc"]);

for (const set of ARG === "all" ? STANDARD : ARG === "reprints" ? REPRINTS : [ARG]) await importSet(set);

async function importSet(SET: string): Promise<void> {
  const OUT = join(DATA_DIR, `${SET}.json`);
  // Ensemble de rééditions : seulement les numéros retenus, sans les cartes exclues (PLAN-G).
  const reprint = SET_INFO.find((x) => x.code.toLowerCase() === SET)?.reprint;
  const kept = (c: ScryfallCard) => {
    if (!reprint) return true;
    const n = Number.parseInt(c.collector_number, 10);
    if (reprint.numbers && !reprint.numbers.some(([a, b]) => n >= a && n <= b)) return false;
    return !EXCLUDED_REPRINTS[c.name];
  };
  const en = (await search(`set:${SET} lang:en`)).filter(kept);
  const fr = await search(`set:${SET} lang:fr`);
  const frByNumber = new Map(fr.map((c) => [c.collector_number, c]));
  // Numérotation française différente (réimpressions, promotions) : rapprochement par le nom anglais.
  const frByName = new Map(fr.map((c) => [c.name, c]));
  const frOf = (c: ScryfallCard) => frByNumber.get(c.collector_number) ?? frByName.get(c.name);

  // Une seule entrée par nom : la première impression « normale » (numéro le plus bas).
  const byName = new Map<string, Record<string, unknown>>();
  const sorted = [...en].sort((a, b) => Number.parseInt(a.collector_number, 10) - Number.parseInt(b.collector_number, 10));
  // Une impression promotionnelle ne compte que pour une carte qui n'en a pas d'autre dans le set (Melek, Reforged
  // Researcher, Tomik, Wielder of Law et Voja, Jaws of the Conclave : promotions de MKM seulement, légales en Standard).
  const regular = new Set(sorted.filter((c) => !c.promo).map((c) => c.name));
  for (const c of sorted) {
    if ((c.promo && regular.has(c.name)) || !(SINGLE.has(c.layout) || MULTI.has(c.layout))) continue;
    const image = c.image_uris ?? c.card_faces?.[0]?.image_uris;
    if (!image) continue;
    if (MULTI.has(c.layout)) {
      if (byName.has(c.name)) continue;
      byName.set(c.name, multiFace(c, frOf(c), image));
      continue;
    }
    // Carte à préparer : la face 0 (la créature) donne la carte, la face 1 est le sort qu'elle prépare.
    const [main, spell] = c.layout === "prepare" ? (c.card_faces ?? []) : [];
    const name = main?.name ?? c.name;
    if (byName.has(name)) continue;
    const f = frOf(c);
    const [frMain, frSpell] = f?.card_faces ?? [];
    byName.set(name, {
      name,
      number: c.collector_number,
      rarity: c.rarity,
      manaCost: main ? (main.mana_cost ?? "") : (c.mana_cost ?? ""),
      cmc: c.cmc,
      typeLine: main?.type_line ?? c.type_line,
      oracleText: main ? (main.oracle_text ?? "") : (c.oracle_text ?? ""),
      power: main?.power ?? c.power,
      toughness: main?.toughness ?? c.toughness,
      loyalty: c.loyalty,
      colors: c.colors ?? [],
      keywords: c.keywords,
      producedMana: c.produced_mana,
      image: image.normal,
      artCrop: image.art_crop,
      // Seuls les formats du périmètre : à réimporter à chaque rotation ou annonce de bannissement.
      legalities: { standard: c.legalities.standard },
      // Saga, Classe, Affaire, assemblage : la disposition sert au moteur.
      layout: c.layout === "normal" || c.layout === "prepare" ? undefined : c.layout,
      meld:
        c.layout === "meld"
          ? {
              parts: (c.all_parts ?? []).filter((p) => p.component === "meld_part").map((p) => p.name),
              result: c.all_parts?.find((p) => p.component === "meld_result")?.name,
            }
          : undefined,
      prepare: spell
        ? {
            name: spell.name,
            manaCost: spell.mana_cost ?? "",
            typeLine: spell.type_line,
            oracleText: spell.oracle_text ?? "",
            fr: frSpell
              ? { name: frSpell.printed_name, typeLine: frSpell.printed_type_line, text: frSpell.printed_text }
              : undefined,
          }
        : undefined,
      fr: f
        ? {
            name: frMain?.printed_name ?? f.printed_name,
            typeLine: frMain?.printed_type_line ?? f.printed_type_line,
            text: frMain?.printed_text ?? f.printed_text,
            image: f.image_uris?.normal,
          }
        : undefined,
    });
  }

  const out = [...byName.values()];
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${SET} : ${out.length} cartes (${fr.length} impressions FR) écrites dans ${OUT}`);
}

/**
 * Carte à plusieurs faces : la face 0 donne les caractéristiques par défaut (nom complet « A // B » gardé),
 * et toutes les faces sont conservées avec leur texte, leurs F/E et, pour les recto-verso, leur image.
 */
function multiFace(
  c: ScryfallCard,
  f: ScryfallCard | undefined,
  image: { normal: string; art_crop: string },
): Record<string, unknown> {
  const faces = c.card_faces ?? [];
  const front = faces[0];
  return {
    name: c.name,
    number: c.collector_number,
    rarity: c.rarity,
    layout: c.layout,
    manaCost: front?.mana_cost ?? "",
    cmc: c.cmc,
    typeLine: front?.type_line ?? c.type_line,
    oracleText: front?.oracle_text ?? "",
    power: front?.power,
    toughness: front?.toughness,
    loyalty: front?.loyalty,
    colors: c.colors ?? front?.colors ?? [],
    keywords: c.keywords,
    producedMana: c.produced_mana,
    image: image.normal,
    artCrop: image.art_crop,
    legalities: { standard: c.legalities.standard },
    faces: faces.map((x, i) => {
      const fx = f?.card_faces?.[i];
      return {
        name: x.name,
        manaCost: x.mana_cost ?? "",
        typeLine: x.type_line,
        oracleText: x.oracle_text ?? "",
        power: x.power,
        toughness: x.toughness,
        loyalty: x.loyalty,
        colors: x.colors,
        image: x.image_uris?.normal,
        fr: fx
          ? { name: fx.printed_name, typeLine: fx.printed_type_line, text: fx.printed_text, image: fx.image_uris?.normal }
          : undefined,
      };
    }),
    fr: f
      ? {
          name: f.card_faces?.[0]?.printed_name ?? f.printed_name,
          typeLine: f.card_faces?.[0]?.printed_type_line ?? f.printed_type_line,
          text: f.card_faces?.[0]?.printed_text ?? f.printed_text,
          image: (f.image_uris ?? f.card_faces?.[0]?.image_uris)?.normal,
        }
      : undefined,
  };
}
