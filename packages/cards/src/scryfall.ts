/**
 * Conversion des données Scryfall (data/*.json) en définitions de cartes du moteur.
 */
import { type CardDef, type CardScript, type CardType, type Color, type Keyword, parseManaCost } from "@mtgx/engine";

export interface RawCard {
  name: string;
  number: string;
  rarity: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  colors: string[];
  keywords: string[];
  producedMana?: string[];
  image: string;
  artCrop: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
}

const KEYWORD_NAMES: Record<string, Keyword> = {
  flying: "flying",
  reach: "reach",
  "first strike": "firstStrike",
  "double strike": "doubleStrike",
  deathtouch: "deathtouch",
  lifelink: "lifelink",
  trample: "trample",
  vigilance: "vigilance",
  haste: "haste",
  menace: "menace",
  defender: "defender",
  flash: "flash",
  hexproof: "hexproof",
  indestructible: "indestructible",
};

const CARD_TYPES = new Set<CardType>([
  "Land",
  "Creature",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Planeswalker",
  "Battle",
]);
const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World"]);

export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripReminder(text: string): string {
  return text.replace(/\([^)]*\)/g, "").trim();
}

/** Le texte ne contient-il que des mots-clés gérés par le moteur (créature « vanilla » ou « french vanilla ») ? */
export function onlyKeywords(text: string): boolean {
  const t = stripReminder(text);
  if (!t) return true;
  return t.split("\n").every((line) => line.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
}

function parseInt0(v: string | undefined): number | undefined | null {
  if (v === undefined) return undefined;
  return /^-?\d+$/.test(v) ? Number(v) : null;
}

export function toCardDef(raw: RawCard, script?: CardScript): CardDef {
  const [left = "", right = ""] = raw.typeLine.split(" — ");
  const words = left.split(" ").filter(Boolean);
  const supertypes = words.filter((w) => SUPERTYPES.has(w));
  const types = words.filter((w): w is CardType => CARD_TYPES.has(w as CardType));
  const subtypes = right.split(" ").filter(Boolean);

  let implemented = !!script || onlyKeywords(raw.oracleText);
  let manaCost = null;
  try {
    manaCost = raw.manaCost ? parseManaCost(raw.manaCost) : null;
  } catch {
    implemented = false;
  }
  const power = parseInt0(raw.power);
  const toughness = parseInt0(raw.toughness);
  if (power === null || toughness === null) implemented = false; // F/E variables (*) : pas encore géré

  const keywords = new Set<Keyword>();
  for (const k of raw.keywords) {
    const kw = KEYWORD_NAMES[k.toLowerCase()];
    if (kw) keywords.add(kw);
  }
  for (const k of script?.keywords ?? []) keywords.add(k);

  return {
    id: slug(raw.name),
    name: raw.name,
    typeLine: raw.typeLine,
    manaCost,
    manaCostText: raw.manaCost,
    colors: raw.colors.filter((c): c is Color => "WUBRG".includes(c)),
    supertypes,
    types,
    subtypes,
    power: power ?? undefined,
    toughness: toughness ?? undefined,
    keywords: [...keywords],
    abilities: script?.abilities ?? [],
    spell: script?.spell,
    kicker: script?.kicker ? parseManaCost(script.kicker) : undefined,
    text: raw.oracleText,
    fr: raw.fr,
    image: raw.image,
    artCrop: raw.artCrop,
    implemented,
  };
}
