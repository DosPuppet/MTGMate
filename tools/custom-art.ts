/**
 * Illustrations personnelles : un dossier local d'images de cartes (proxys, versions alternatives) qui remplacent celles
 * de Scryfall, partout où la carte s'affiche, quand la case « Illustrations personnelles » est cochée. Rien de ce dossier
 * n'entre dans Git : les images préparées vont dans `data/art/` (ignoré), servi sur /art/ par le serveur de parties et par
 * Vite en développement (`MTGX_ART_DIR` pour un autre dossier).
 *
 * Noms de fichiers reconnus (le nom anglais de la carte, comme dans le catalogue, casse indifférente) :
 * - « Sol Ring.png », « Ancient Tomb (City Ruins).png » : le texte entre parenthèses (nom alternatif) est ignoré ;
 * - « _ » tient lieu d'apostrophe (« Urza_s Saga ») ; ponctuation ignorée ; une lettre d'écart admise si une seule carte
 *   convient (« Ugin, Eye of the Storm ») ;
 * - « Wastes (The Cage) 2.png » : variante numérotée ; « Extra - Basalt Monolith.png » ; « 1_2_Explore the Vastlands »
 *   (face 2 d'une carte à deux faces : chaque face est cherchée par son nom) ;
 * - « Token - Robot 1.png » : jeton, par son nom ; « Card Back 1.png » : dos des cartes.
 * Une seule image par nom : celle du premier niveau du dossier avant celles des sous-dossiers, la non numérotée avant la
 * plus petite variante. Les noms inconnus et les variantes écartées sont listés.
 *
 * Les images sont recadrées au format d'une carte (63 × 88 : le fond perdu d'impression est retiré), réduites à 672 px de
 * large et converties en WebP par le Chromium de Playwright (aucune dépendance de plus). Une image déjà préparée et non
 * modifiée n'est pas refaite ; les fichiers qui ne servent plus sont effacés.
 *
 * Usage : npm run custom-art -- <dossier des images> [--out data/art]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { CARDS } from "../packages/cards/src/index";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? (args[outIdx + 1] ?? "") : process.env.MTGX_ART_DIR || "data/art";
const srcArg = args.find((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));
if (!srcArg || !existsSync(srcArg) || !OUT) {
  console.error("Usage : npm run custom-art -- <dossier des images> [--out data/art]");
  process.exit(1);
}
const SRC = resolve(srcArg);
const WIDTH = 672;
const HEIGHT = 936;

type Kind = "card" | "token" | "back";
interface Source {
  file: string;
  kind: Kind;
  name: string;
  /** 0 : premier niveau du dossier ; 1 : sous-dossier. */
  depth: number;
  /** 0 : sans numéro. */
  variant: number;
}

function walk(dir: string, depth = 0): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), depth + 1) : /\.(png|jpe?g|webp)$/i.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function parse(file: string): Source {
  let base = basename(file, extname(file)).trim();
  const depth = relative(SRC, file).split(/[\\/]/).length > 1 ? 1 : 0;
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
  return { file, kind, name, depth, variant };
}

/** Clé de comparaison des noms : casse, accents, ponctuation et espaces ignorés (« Power-Plant » = « Power Plant »). */
const nameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/** Noms du catalogue (cartes et faces) → nom exact. */
const catalog = new Map<string, string>();
for (const c of Object.values(CARDS)) for (const d of [c, ...(c.faceDefs ?? [])]) catalog.set(nameKey(d.name), d.name);

/** Une lettre de plus, de moins ou changée (« Eye of the Storm » pour « Eye of the Storms ») : le seul nom si un seul convient. */
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
const chosen = new Map<string, Source>();
const unknown = new Set<string>();
const skipped: string[] = [];
for (const src of walk(SRC).map(parse)) {
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
  const prev = chosen.get(key);
  if (!prev || better(src, prev) < 0) {
    if (prev) skipped.push(relative(SRC, prev.file));
    chosen.set(key, src);
  } else skipped.push(relative(SRC, src.file));
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
/** Nom du fichier préparé : change avec l'image source (cache d'un an côté navigateur). */
function outName(src: Source): string {
  const st = statSync(src.file);
  const hash = createHash("sha1").update(`${src.file}:${st.size}:${st.mtimeMs}`).digest("hex").slice(0, 8);
  const label = src.kind === "back" ? "back" : src.kind === "token" ? `token-${slug(src.name)}` : slug(src.name);
  return `${label}-${hash}.webp`;
}

mkdirSync(OUT, { recursive: true });
const manifest: { version: 1; cards: Record<string, string>; tokens: Record<string, string>; back?: string } = {
  version: 1,
  cards: {},
  tokens: {},
};
const todo: { src: Source; out: string }[] = [];
for (const src of chosen.values()) {
  const out = outName(src);
  if (src.kind === "back") manifest.back = out;
  else if (src.kind === "token") manifest.tokens[src.name] = out;
  else manifest.cards[src.name] = out;
  if (!existsSync(join(OUT, out))) todo.push({ src, out });
}

// Recadrage (fond perdu retiré : marge égale sur les quatre côtés qui ramène au format 63 × 88), réduction par moitiés
// successives (meilleur lissage qu'une seule réduction), puis WebP. Code de page en texte : pas de fonction nommée.
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
      if (done % 10 === 0) console.log(`  ${done} images préparées…`);
    }
    await page.close();
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: 4 }, work));
  await browser.close();
  console.log(`${done} images préparées en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}

// Fichiers préparés qui ne servent plus (image source modifiée ou retirée).
const used = new Set([...Object.values(manifest.cards), ...Object.values(manifest.tokens), manifest.back]);
for (const f of readdirSync(OUT)) if (f.endsWith(".webp") && !used.has(f)) unlinkSync(join(OUT, f));
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

const n = Object.keys(manifest.cards).length;
const tk = Object.keys(manifest.tokens).length;
console.log(`${OUT}/manifest.json : ${n} cartes, ${tk} jetons${manifest.back ? ", dos des cartes" : ""}.`);
if (skipped.length) console.log(`Variantes écartées (une seule image par nom) : ${skipped.length}.`);
if (unknown.size) console.log(`Cartes absentes du catalogue (ignorées) : ${[...unknown].sort().join(", ")}.`);
