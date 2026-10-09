/**
 * Custom art: a local directory of card images (proxies, alternative versions) that replace the Scryfall ones,
 * wherever the card is shown, when the "Custom art" box is checked. Nothing from this directory goes into Git: the
 * prepared images go to `data/art/` (ignored), served on /art/ by the game server and by Vite in development
 * (`MTGX_ART_DIR` for another directory).
 *
 * File names recognized (the English name of the card, as in the catalog, case-insensitive):
 * - "Sol Ring.png", "Ancient Tomb (City Ruins).png": the text in parentheses (alternative name) is ignored;
 * - "_" stands for an apostrophe ("Urza_s Saga"); punctuation ignored; one letter of difference allowed if only one
 *   card matches ("Ugin, Eye of the Storm");
 * - "Wastes (The Cage) 2.png": numbered variant; "Extra - Basalt Monolith.png"; "1_2_Explore the Vastlands" (face 2
 *   of a double-faced card: each face is looked up by its name);
 * - "Token - Robot 1.png": token, by its name; "Card Back 1.png": card back.
 * A single image per name: the one at the top level of the directory before those of the subdirectories, the
 * unnumbered one before the smallest variant. Unknown names and discarded variants are listed.
 *
 * The images are cropped to the card format (63 × 88: the print bleed is removed), scaled down to 672 px wide and
 * converted to WebP by Playwright's Chromium (no extra dependency). An image already prepared and not modified is not
 * redone; the files no longer used are deleted.
 *
 * Several directories (one per proxy deck: Nier_cards, MarioLuigi_cards): all of them are prepared together, since
 * the files not found in the sources are deleted. Each directory is an art set (`dir=set`, by default the directory's
 * name in lowercase: "Nier_cards=nier"), whose images are listed apart in the manifest (`sets`): a deck that chooses
 * the "custom:<set>" printing looks there first (its own tokens, its own version of a card shared by two decks). The
 * shared lists (`cards`, `tokens`, `back`), read by the plain "custom" printing, take the first directory given on a
 * shared name.
 *
 * Usage: npm run custom-art -- <image directory>[=<set>] [<image directory>[=<set>]…] [--out data/art]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { CARDS } from "../packages/cards/src/index";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? (args[outIdx + 1] ?? "") : process.env.MTGX_ART_DIR || "data/art";
const srcArgs = args
  .filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1))
  .map((a) => {
    const eq = a.lastIndexOf("=");
    return eq > 0 ? { dir: a.slice(0, eq), set: a.slice(eq + 1) } : { dir: a, set: "" };
  });
/** An art set's name: lowercase letters, digits and dashes (`customArtSet`, engine). */
const setName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
if (!srcArgs.length || srcArgs.some((a) => !existsSync(a.dir)) || !OUT) {
  console.error("Usage: npm run custom-art -- <image directory>[=<set>] [<image directory>[=<set>]…] [--out data/art]");
  process.exit(1);
}
const SOURCES = srcArgs.map((a) => resolve(a.dir));
const SETS = srcArgs.map((a) => setName(a.set || basename(resolve(a.dir))));
if (SETS.some((x) => !x) || new Set(SETS).size !== SETS.length) {
  console.error(`Art set names: empty or repeated (${SETS.join(", ")}); give them with <directory>=<set>.`);
  process.exit(1);
}
const WIDTH = 672;
const HEIGHT = 936;

type Kind = "card" | "token" | "back";
interface Source {
  file: string;
  /** Rank of its directory among the sources (the first one wins). */
  root: number;
  kind: Kind;
  name: string;
  /** 0: top level of the directory; 1: subdirectory. */
  depth: number;
  /** 0: no number. */
  variant: number;
}

function walk(dir: string, depth = 0): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), depth + 1) : /\.(png|jpe?g|webp)$/i.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function parse(file: string, root: number): Source {
  let base = basename(file, extname(file)).trim();
  const depth = relative(SOURCES[root] as string, file).split(/[\\/]/).length > 1 ? 1 : 0;
  let kind: Kind = "card";
  if (/^card back\b/i.test(base)) kind = "back";
  else if (/^token - /i.test(base)) kind = "token";
  base = base.replace(/^(token|extra) - /i, "").replace(/^1_[12]_/, "");
  let variant = 0;
  const num = base.match(/\s(\d+)$/);
  if (num) {
    variant = Number(num[1]);
    base = base.slice(0, -num[0].length);
  }
  const name = base
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/_/g, "'")
    .trim();
  return { file, root, kind, name, depth, variant };
}

/** Comparison key of names: case, accents, punctuation and spaces ignored ("Power-Plant" = "Power Plant"). */
const nameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/** Names of the catalog (cards and faces) → exact name. */
const catalog = new Map<string, string>();
for (const c of Object.values(CARDS)) for (const d of [c, ...(c.faceDefs ?? [])]) catalog.set(nameKey(d.name), d.name);

/** One letter more, less or changed ("Eye of the Storm" for "Eye of the Storms"): the only name if only one matches. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}
function nearName(key: string): string | undefined {
  if (key.length < 8) return undefined;
  const found = [...catalog].filter(([k]) => oneEdit(key, k));
  return found.length === 1 ? found[0]?.[1] : undefined;
}

const better = (a: Source, b: Source) => a.depth - b.depth || a.variant - b.variant;
/** The image chosen for each name, in each art set (`root` + name). */
const chosen = new Map<string, Source>();
const unknown = new Set<string>();
const skipped: string[] = [];
for (const src of SOURCES.flatMap((dir, root) => walk(dir).map((f) => parse(f, root)))) {
  let key: string;
  if (src.kind === "back") key = "back";
  else if (src.kind === "token") key = `token:${src.name}`;
  else {
    const name = catalog.get(nameKey(src.name)) ?? nearName(nameKey(src.name));
    if (!name) {
      unknown.add(src.name);
      continue;
    }
    src.name = name;
    key = `card:${name}`;
  }
  key = `${src.root}\u0000${key}`;
  const prev = chosen.get(key);
  if (!prev || better(src, prev) < 0) {
    if (prev) skipped.push(prev.file);
    chosen.set(key, src);
  } else skipped.push(src.file);
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
/** Name of the prepared file: changes with the source image (one-year cache in the browser). */
function outName(src: Source): string {
  const st = statSync(src.file);
  const hash = createHash("sha1").update(`${src.file}:${st.size}:${st.mtimeMs}`).digest("hex").slice(0, 8);
  const label = src.kind === "back" ? "back" : src.kind === "token" ? `token-${slug(src.name)}` : slug(src.name);
  return `${label}-${hash}.webp`;
}

mkdirSync(OUT, { recursive: true });
interface ArtSet {
  cards: Record<string, string>;
  tokens: Record<string, string>;
  back?: string;
}
const manifest: ArtSet & { version: 2; sets: Record<string, ArtSet> } = {
  version: 2,
  cards: {},
  tokens: {},
  sets: Object.fromEntries(SETS.map((x) => [x, { cards: {}, tokens: {} }])),
};
const todo: { src: Source; out: string }[] = [];
const record = (into: ArtSet, src: Source, out: string, first: boolean) => {
  if (src.kind === "back") into.back = first ? (into.back ?? out) : out;
  else if (src.kind === "token") into.tokens[src.name] = first ? (into.tokens[src.name] ?? out) : out;
  else into.cards[src.name] = first ? (into.cards[src.name] ?? out) : out;
};
// In the order of the directories: the shared lists keep the first one.
for (const src of [...chosen.values()].sort((a, b) => a.root - b.root)) {
  const out = outName(src);
  record(manifest.sets[SETS[src.root] as string] as ArtSet, src, out, false);
  record(manifest, src, out, true);
  if (!existsSync(join(OUT, out)) && !todo.some((t) => t.out === out)) todo.push({ src, out });
}

// Cropping (bleed removed: an equal margin on the four sides that brings back the 63 × 88 format), scaling down by
// successive halves (better smoothing than a single scaling), then WebP. Page code as text: no named function.
const RESIZE = `async ([url, W, H]) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  let w = img.naturalWidth, h = img.naturalHeight;
  let m = (88 * w - 63 * h) / 50;
  let sx = m, sy = m, sw = w - 2 * m, sh = h - 2 * m;
  if (m < 0 || m > w * 0.1) {
    if (w / h > 63 / 88) { sh = h; sw = h * 63 / 88; sx = (w - sw) / 2; sy = 0; }
    else { sw = w; sh = w * 88 / 63; sy = (h - sh) / 2; sx = 0; }
  }
  let canvas = document.createElement("canvas");
  canvas.width = Math.round(sw); canvas.height = Math.round(sh);
  canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  while (canvas.width > W * 2) {
    const half = document.createElement("canvas");
    half.width = Math.round(canvas.width / 2); half.height = Math.round(canvas.height / 2);
    const ctx = half.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, half.width, half.height);
    canvas = half;
  }
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, W, H);
  return out.toDataURL("image/webp", 0.88);
}`;

if (todo.length) {
  const browser = await chromium.launch();
  const MIME: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  let done = 0;
  const work = async () => {
    const page = await browser.newPage();
    await page.route("http://art.local/**", (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      if (!path) return route.fulfill({ body: "<!doctype html><title>art</title>", contentType: "text/html" });
      return route.fulfill({ body: readFileSync(path), contentType: MIME[extname(path).toLowerCase()] ?? "image/png" });
    });
    await page.goto("http://art.local/");
    for (let t = todo.shift(); t; t = todo.shift()) {
      const url = `http://art.local/${encodeURIComponent(t.src.file)}`;
      const data = (await page.evaluate(`(${RESIZE})(${JSON.stringify([url, WIDTH, HEIGHT])})`)) as string;
      writeFileSync(join(OUT, t.out), Buffer.from(data.slice(data.indexOf(",") + 1), "base64"));
      done++;
      if (done % 10 === 0) console.log(`  ${done} images prepared…`);
    }
    await page.close();
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: 4 }, work));
  await browser.close();
  console.log(`${done} images prepared in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}

// Prepared files no longer used (source image modified or removed).
const used = new Set(
  Object.values(manifest.sets).flatMap((x) => [...Object.values(x.cards), ...Object.values(x.tokens), x.back]),
);
for (const f of readdirSync(OUT)) if (f.endsWith(".webp") && !used.has(f)) unlinkSync(join(OUT, f));
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

const n = Object.keys(manifest.cards).length;
const tk = Object.keys(manifest.tokens).length;
console.log(`${OUT}/manifest.json: ${n} cards, ${tk} tokens${manifest.back ? ", card back" : ""}.`);
for (const [name, x] of Object.entries(manifest.sets))
  console.log(
    `  set "${name}": ${Object.keys(x.cards).length} cards, ${Object.keys(x.tokens).length} tokens${x.back ? ", card back" : ""}`,
  );
if (skipped.length) console.log(`Discarded variants (a single image per name): ${skipped.length}.`);
if (unknown.size) console.log(`Cards absent from the catalog (ignored): ${[...unknown].sort().join(", ")}.`);
