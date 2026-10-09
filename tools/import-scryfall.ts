/**
 * Imports the data of a set from the Scryfall API (English + French) and writes a JSON reduced to the useful fields
 * to packages/cards/data/<set>.json.
 *
 * Usage: npm run import-cards -- [set|all|reprints|edh]   (default: fdn; "all": every Standard set except FDN and FRA;
 * "reprints": the reprint sets of the registry, PLAN-G; "edh": the Commander pseudo-set, imported by name from the
 * decklists of `docs/commander/decks/`, PLAN-E)
 *
 * The images are not downloaded: only their URLs are kept (Scryfall CDN).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUDED_REPRINTS, SET_INFO, STANDARD_SETS } from "../packages/cards/src/setRegistry";

/** Standard sets imported by "all": the registry (`cards/src/setRegistry.ts`), except FDN and FRA, already imported
 * and edited by hand, which are imported separately. */
const STANDARD = STANDARD_SETS.map((x) => x.code.toLowerCase()).filter((c) => c !== "fdn" && c !== "fra");
/** Reprint sets (Special Guests, bonus sheets): imported by "reprints". */
const REPRINTS = SET_INFO.filter((x) => x.reprint).map((x) => x.code.toLowerCase());
const ARG = (process.argv[2] ?? "fdn").toLowerCase();
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data");
/** French texts completed by hand (cards without a French printing that has its text). */
const FRENCH_OVERRIDES = JSON.parse(readFileSync(join(DATA_DIR, "french-overrides.json"), "utf8")) as Record<
  string,
  { name?: string; typeLine?: string; text?: string; faces?: { name?: string; typeLine?: string; text?: string }[] }
>;
const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };

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
  /** Faces: prepared spell, adventure, split card, double-faced card (each face then has its image), meld. */
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
  /** Related cards (meld: the two parts and the melded card). */
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
    // Too many requests: Scryfall asks to wait before retrying.
    for (let wait = 5000; res.status === 429 && wait <= 80000; wait *= 2) {
      console.log(`Scryfall 429: retrying in ${wait / 1000} s`);
      await sleep(wait);
      res = await fetch(url, { headers: HEADERS });
    }
    if (res.status === 404) return cards; // no card
    if (!res.ok) throw new Error(`Scryfall ${res.status} on ${url}`);
    const page = (await res.json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
    cards.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
    await sleep(120); // Scryfall asks for 50–100 ms between two requests
  }
  return cards;
}

/** Single-face layouts (one image): plain cards, "prepare" (creature + spell), Sagas, Classes, Cases. */
const SINGLE = new Set(["normal", "prepare", "saga", "class", "case", "meld"]);
/** Multi-face layouts: kept as they are (faces), handled by the engine in lots 0.3 to 0.6. */
const MULTI = new Set(["adventure", "split", "transform", "modal_dfc"]);

async function importSet(SET: string): Promise<void> {
  const OUT = join(DATA_DIR, `${SET}.json`);
  // Reprint set: only the selected numbers, without the excluded cards (PLAN-G).
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
  // Different French numbering (reprints, promos): matched by the English name.
  const frByName = new Map(fr.map((c) => [c.name, c]));
  const frOf = (c: ScryfallCard) => frByNumber.get(c.collector_number) ?? frByName.get(c.name);

  // A single entry per name: the first "normal" printing (lowest number).
  const byName = new Map<string, Record<string, unknown>>();
  const sorted = [...en].sort((a, b) => Number.parseInt(a.collector_number, 10) - Number.parseInt(b.collector_number, 10));
  // A promo printing counts only for a card that has no other one in the set (Melek, Reforged Researcher, Tomik,
  // Wielder of Law and Voja, Jaws of the Conclave: MKM promos only, legal in Standard).
  const regular = new Set(sorted.filter((c) => !c.promo).map((c) => c.name));
  for (const c of sorted) {
    if (c.promo && regular.has(c.name)) continue;
    const entry = entryOf(c, frOf(c));
    if (entry && !byName.has(entry.name as string)) byName.set(entry.name as string, entry);
  }

  const out = [...byName.values()];
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${SET}: ${out.length} cards (${fr.length} FR printings) written to ${OUT}`);
}

/** Scryfall set types whose printing can serve as the default printing (no Secret Lair, no promo). */
const PRINT_SET_TYPES = new Set(["commander", "expansion", "core", "masters", "draft_innovation", "starter"]);
/** Sets left out despite their type: The List (stamped printings), Mystery Booster. */
const PRINT_SETS_EXCLUDED = new Set(["plst", "mb1", "mb2", "mbc"]);
/** Card names in batches (queries `!"A" or !"B"`): a search URL stays short. */
const NAME_BATCH = 15;

/**
 * Pseudo-set imported by name (PLAN-E): every card of the registry's decklists (`byName.decks`), and for EDH the
 * reprints left out of the reprint sets (`EXCLUDED_REPRINTS`), absent from the other sets of the catalog, each with a default printing (the newest one from an ordinary set, normal frame), its set of
 * origin (`origin`) and Scryfall's color identity (`colorIdentity`, checked against the identity computed by the
 * engine). The French text comes from the French printing of the same set if it exists, otherwise from the newest one
 * (without its image). A card already imported stays, even if no decklist cites it any more (modified deck): it serves
 * the players' decks.
 */
async function importByName(SET: string): Promise<void> {
  const info = SET_INFO.find((x) => x.code.toLowerCase() === SET);
  if (!info?.byName) throw new Error(`${SET} is not a set imported by name`);
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
  // The reprints left out of the reprint sets for a Commander-only mechanic (PLAN-G, PLAN-L L2): defined here.
  if (info.code === "EDH") for (const name of Object.keys(EXCLUDED_REPRINTS)) wanted.add(name);
  // Cards already imported: kept (modified deck, card removed from its list).
  const ownFile = join(DATA_DIR, `${info.code.toLowerCase()}.json`);
  if (existsSync(ownFile))
    for (const c of JSON.parse(readFileSync(ownFile, "utf8")) as { name: string }[])
      wanted.add(c.name.split(" // ")[0] as string);
  // Names already in the catalog (full name and first face), outside the imported set.
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
  // A name with double quotes (Henzie "Toolbox" Torre) between single quotes: Scryfall doesn't read \" in an exact name.
  const exact = (n: string) => (n.includes('"') ? `!'${n}'` : `!"${n}"`);
  const query = (list: string[]) => `(${list.map(exact).join(" or ")})`;
  const front = (c: ScryfallCard) => c.name.split(" // ")[0] as string;
  const en: ScryfallCard[] = [];
  const fr: ScryfallCard[] = [];
  for (const b of batches) {
    en.push(...(await search(`${query(b)} lang:en game:paper`)));
    fr.push(...(await search(`${query(b)} lang:fr game:paper`)));
  }
  // A printing announced but not yet released is not selected.
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
    // Cards are preferably in French: the French printing of the same set if it has its text, otherwise the newest
    // French printing (ordinary first, with its printed text first), image included.
    const frPrints = fr.filter((c) => c.name === chosen?.name);
    // Text printed in French: some printings (EOC on Scryfall) carry the English text.
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
    // French text completed by hand when no French printing has its own (`french-overrides.json`).
    // By the decklist name (the front of a multi-face card) or by the full name of the card.
    const fix = FRENCH_OVERRIDES[name] ?? FRENCH_OVERRIDES[String(entry.name)];
    const { faces: faceFixes, ...cardFix } = fix ?? {};
    const withFr = fix ? { ...entry, fr: { ...(entry.fr as object | undefined), ...cardFix } } : entry;
    // Multi-face card: the text of each face (Double Jump // Flying Kick, without a French printing).
    if (faceFixes && Array.isArray(withFr.faces))
      withFr.faces = (withFr.faces as { fr?: object }[]).map((face, i) =>
        faceFixes[i] ? { ...face, fr: { ...face.fr, ...faceFixes[i] } } : face,
      );
    out.push({ ...withFr, origin: chosen.set.toUpperCase(), colorIdentity: chosen.color_identity });
  }
  const OUT = join(DATA_DIR, `${SET}.json`);
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(
    `${SET}: ${out.length} cards written to ${OUT} (${wanted.size} names in the decklists, ${known.size} in the catalog)`,
  );
  if (missing.length) console.log(`Not found on Scryfall (${missing.length}): ${missing.join(", ")}`);
  if (unsupported.length) console.log(`Unhandled layout (${unsupported.length}): ${unsupported.join(", ")}`);
  if (missing.length || unsupported.length) process.exitCode = 1;
}

/** Data entry of a Scryfall printing (and of its French printing), or nothing for an unhandled layout. */
function entryOf(c: ScryfallCard, f: ScryfallCard | undefined): Record<string, unknown> | undefined {
  if (!(SINGLE.has(c.layout) || MULTI.has(c.layout))) return undefined;
  const image = c.image_uris ?? c.card_faces?.[0]?.image_uris;
  if (!image) return undefined;
  if (MULTI.has(c.layout)) return multiFace(c, f, image);
  // "prepare" card: face 0 (the creature) gives the card, face 1 is the spell it prepares.
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
    // Only the formats in scope: to reimport at each rotation or ban announcement.
    legalities: { standard: c.legalities.standard },
    // Saga, Class, Case, meld: the layout is used by the engine.
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
 * Multi-face card: face 0 gives the default characteristics (full name "A // B" kept), and all the faces are kept
 * with their text, their P/T and, for double-faced cards, their image.
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

// After the declarations: a module-level `await` runs before the `const`s that follow it.
if (ARG === "edh") await importByName("edh");
else for (const set of ARG === "all" ? STANDARD : ARG === "reprints" ? REPRINTS : [ARG]) await importSet(set);
