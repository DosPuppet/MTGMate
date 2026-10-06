/**
 * Importe les données d'un set depuis l'API Scryfall (anglais + français)
 * et écrit un JSON réduit aux champs utiles dans packages/cards/data/<set>.json.
 *
 * Usage : npm run import-cards -- [set|all|reprints|edh]   (défaut : fdn ; « all » : toutes les extensions Standard hors
 * FDN et FRA ; « reprints » : les ensembles de rééditions du registre, PLAN-G ; « edh » : le pseudo-ensemble Commander,
 * importé par nom depuis les decklists de `docs/commander/decks/`, PLAN-E)
 *
 * Les images ne sont pas téléchargées : on conserve seulement leurs URLs (CDN Scryfall).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
/** Textes français complétés à la main (cartes sans impression française qui ait son texte). */
const FRENCH_OVERRIDES = JSON.parse(readFileSync(join(DATA_DIR, "french-overrides.json"), "utf8")) as Record<
  string,
  { name?: string; typeLine?: string; text?: string }
>;
const HEADERS = { "User-Agent": "MTGX/0.1 (projet non commercial)", Accept: "application/json" };

interface ScryfallCard {
  name: string;
  lang: string;
  set: string;
  set_type: string;
  released_at: string;
  collector_number: string;
  color_identity: string[];
  digital: boolean;
  full_art: boolean;
  border_color: string;
  frame_effects?: string[];
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
    if (c.promo && regular.has(c.name)) continue;
    const entry = entryOf(c, frOf(c));
    if (entry && !byName.has(entry.name as string)) byName.set(entry.name as string, entry);
  }

  const out = [...byName.values()];
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${SET} : ${out.length} cartes (${fr.length} impressions FR) écrites dans ${OUT}`);
}

/** Types d'ensembles Scryfall dont l'impression peut servir d'impression par défaut (pas de Secret Lair ni de promotion). */
const PRINT_SET_TYPES = new Set(["commander", "expansion", "core", "masters", "draft_innovation", "starter"]);
/** Ensembles écartés malgré leur type : The List (impressions tamponnées), Mystery Booster. */
const PRINT_SETS_EXCLUDED = new Set(["plst", "mb1", "mb2", "mbc"]);
/** Noms des cartes par lots (requêtes « !"A" or !"B" ») : une URL de recherche reste courte. */
const NAME_BATCH = 15;

/**
 * Pseudo-ensemble importé par nom (PLAN-E) : toutes les cartes des decklists du registre (`byName.decks`) absentes des
 * autres ensembles du catalogue, chacune avec une impression par défaut (la plus récente d'un ensemble ordinaire, cadre
 * normal), son ensemble d'origine (`origin`) et l'identité de couleur de Scryfall (`colorIdentity`, vérifiée contre
 * l'identité calculée par le moteur). Le texte français vient de l'impression française de même ensemble si elle existe,
 * sinon de la plus récente (sans son image).
 */
async function importByName(SET: string): Promise<void> {
  const info = SET_INFO.find((x) => x.code.toLowerCase() === SET);
  if (!info?.byName) throw new Error(`${SET} n'est pas un ensemble importé par nom`);
  const ROOT = join(DATA_DIR, "..", "..", "..");
  const deckDir = join(ROOT, info.byName.decks);
  const wanted = new Set<string>();
  for (const file of readdirSync(deckDir)
    .filter((f) => f.endsWith(".txt"))
    .sort()) {
    for (const line of readFileSync(join(deckDir, file), "utf8").split("\n")) {
      const m = /^\s*\d+\s*[xX]?\s+(.+?)\s*$/.exec(line);
      if (m && !line.trim().startsWith("//")) wanted.add((m[1] as string).replace(/\s+\([A-Za-z0-9]{2,6}\).*$/, "").trim());
    }
  }
  // Noms déjà au catalogue (nom complet et première face), hors de l'ensemble importé.
  const known = new Set<string>();
  for (const s of SET_INFO.filter((x) => x.code !== info.code)) {
    const data = JSON.parse(readFileSync(join(DATA_DIR, `${s.code.toLowerCase()}.json`), "utf8")) as { name: string }[];
    for (const c of data) {
      known.add(c.name);
      known.add(c.name.split(" // ")[0] as string);
    }
  }
  const names = [...wanted].filter((n) => !known.has(n)).sort();
  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += NAME_BATCH) batches.push(names.slice(i, i + NAME_BATCH));
  const query = (list: string[]) => `(${list.map((n) => `!"${n.replace(/"/g, '\\"')}"`).join(" or ")})`;
  const front = (c: ScryfallCard) => c.name.split(" // ")[0] as string;
  const en: ScryfallCard[] = [];
  const fr: ScryfallCard[] = [];
  for (const b of batches) {
    en.push(...(await search(`${query(b)} lang:en game:paper`)));
    fr.push(...(await search(`${query(b)} lang:fr game:paper`)));
  }
  // Une impression annoncée mais pas encore sortie n'est pas retenue.
  const today = new Date().toISOString().slice(0, 10);
  const regularPrint = (c: ScryfallCard) =>
    !c.promo &&
    !c.digital &&
    !c.full_art &&
    c.border_color === "black" &&
    PRINT_SET_TYPES.has(c.set_type) &&
    !PRINT_SETS_EXCLUDED.has(c.set) &&
    c.released_at <= today &&
    !(c.frame_effects ?? []).some((e) => e === "showcase" || e === "extendedart" || e === "etched" || e === "inverted");
  const out: Record<string, unknown>[] = [];
  const missing: string[] = [];
  const unsupported: string[] = [];
  for (const name of names) {
    const prints = en.filter((c) => c.name === name || front(c) === name);
    if (!prints.length) {
      missing.push(name);
      continue;
    }
    const newest = (list: ScryfallCard[]) => [...list].sort((a, b) => b.released_at.localeCompare(a.released_at))[0];
    const chosen = newest(prints.filter(regularPrint)) ?? newest(prints.filter((c) => !c.digital)) ?? prints[0];
    // Les cartes sont de préférence en français : l'impression française de la même extension si elle a son texte, sinon
    // la plus récente impression française (ordinaire d'abord, avec son texte imprimé d'abord), image comprise.
    const frPrints = fr.filter((c) => c.name === chosen?.name);
    // Texte imprimé en français : certaines impressions (EOC sur Scryfall) portent le texte anglais.
    const printed = (c: ScryfallCard) =>
      c.card_faces?.length
        ? c.card_faces.some((x) => x.printed_text && x.printed_text !== x.oracle_text)
        : !!c.printed_text && c.printed_text !== c.oracle_text;
    const frSame = frPrints.find((c) => c.set === chosen?.set);
    const withText = frPrints.filter(printed);
    const frOther =
      newest(withText.filter(regularPrint)) ??
      newest(withText.filter((c) => !c.digital)) ??
      newest(frPrints.filter(regularPrint)) ??
      newest(frPrints.filter((c) => !c.digital));
    const f = frSame && (printed(frSame) || !frOther || !printed(frOther)) ? frSame : frOther;
    const entry = chosen && entryOf(chosen, f);
    if (!chosen || !entry) {
      unsupported.push(`${name} (${chosen?.layout})`);
      continue;
    }
    // Texte français complété à la main quand aucune impression française n'a le sien (`french-overrides.json`).
    const fix = FRENCH_OVERRIDES[name];
    const withFr = fix ? { ...entry, fr: { ...(entry.fr as object | undefined), ...fix } } : entry;
    out.push({ ...withFr, origin: chosen.set.toUpperCase(), colorIdentity: chosen.color_identity });
  }
  const OUT = join(DATA_DIR, `${SET}.json`);
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(
    `${SET} : ${out.length} cartes écrites dans ${OUT} (${wanted.size} noms dans les decklists, ${known.size} au catalogue)`,
  );
  if (missing.length) console.log(`Introuvables chez Scryfall (${missing.length}) : ${missing.join(", ")}`);
  if (unsupported.length) console.log(`Disposition non gérée (${unsupported.length}) : ${unsupported.join(", ")}`);
  if (missing.length || unsupported.length) process.exitCode = 1;
}

/** Entrée de données d'une impression Scryfall (et de son impression française), ou rien pour une disposition non gérée. */
function entryOf(c: ScryfallCard, f: ScryfallCard | undefined): Record<string, unknown> | undefined {
  if (!(SINGLE.has(c.layout) || MULTI.has(c.layout))) return undefined;
  const image = c.image_uris ?? c.card_faces?.[0]?.image_uris;
  if (!image) return undefined;
  if (MULTI.has(c.layout)) return multiFace(c, f, image);
  // Carte à préparer : la face 0 (la créature) donne la carte, la face 1 est le sort qu'elle prépare.
  const [main, spell] = c.layout === "prepare" ? (c.card_faces ?? []) : [];
  const name = main?.name ?? c.name;
  const [frMain, frSpell] = f?.card_faces ?? [];
  return {
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
  };
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

// Après les déclarations : `await` au niveau du module s'exécute avant les `const` qui le suivent.
if (ARG === "edh") await importByName("edh");
else for (const set of ARG === "all" ? STANDARD : ARG === "reprints" ? REPRINTS : [ARG]) await importSet(set);
