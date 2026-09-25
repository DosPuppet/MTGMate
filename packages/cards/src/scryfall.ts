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
  loyalty?: string;
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
  prowess: "prowess",
  ward: "ward",
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

/** Garde : « Ward {2} » ou « Ward—Pay 7 life. » */
const WARD = /\bward(?: ((?:\{[^}]+\})+)|—pay (\d+) life\.?)/i;

/** « Equip {3}{W} » (702.6) : capacité activée en rituel, cible une créature que vous contrôlez. */
export function parseEquip(text: string): string | undefined {
  return /^Equip ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1];
}

export function parseWard(text: string): CardDef["ward"] {
  const m = WARD.exec(stripReminder(text));
  if (!m) return undefined;
  return m[1] ? { mana: parseManaCost(m[1]) } : { life: Number(m[2]) };
}

/** Le texte ne contient-il que des mots-clés gérés par le moteur (créature « vanilla » ou « french vanilla ») ? */
export function onlyKeywords(text: string): boolean {
  const t = stripReminder(text);
  if (!t) return true;
  return t
    .split("\n")
    .map((line) => line.replace(new RegExp(WARD.source, "gi"), "ward").trim())
    .every((line) => line.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
}

function parseInt0(v: string | undefined): number | undefined | null {
  if (v === undefined) return undefined;
  return /^-?\d+$/.test(v) ? Number(v) : null;
}

/** Capacités déclenchées portées par un mot-clé (702.108 prouesse, 702.21 garde). */
function intrinsicAbilities(keywords: Set<Keyword>, ward: CardDef["ward"], equip?: string): CardDef["abilities"] {
  const out: CardDef["abilities"] = [];
  if (keywords.has("prowess")) {
    out.push({
      kind: "triggered",
      trigger: { on: "castSpell", by: "you", filter: { notTypes: ["Creature"] } },
      targets: [],
      effects: [{ op: "pump", what: { kind: "self" }, power: 1, toughness: 1 }],
      label: "Prouesse",
    });
  }
  if (equip) {
    out.push({
      kind: "activated",
      cost: { mana: parseManaCost(equip) },
      targets: [
        { id: "t", label: "créature que vous contrôlez", filter: { objects: { types: ["Creature"], controller: "you" } } },
      ],
      effects: [{ op: "attach", what: { kind: "self" }, to: { kind: "target", id: "t" } }],
      sorcerySpeed: true,
      label: `Équiper ${equip}`,
    });
  }
  if (ward) {
    // « Chaque fois que ce permanent devient la cible d'un sort ou d'une capacité qu'un adversaire contrôle,
    // contrecarrez-le à moins que ce joueur ne paie [coût]. »
    out.push({
      kind: "triggered",
      trigger: { on: "becomesTarget", who: "self", byOpponent: true },
      targets: [],
      effects: [
        { op: "unlessPay", who: { kind: "eventPlayer" }, mana: ward.mana, life: ward.life, skip: 1 },
        { op: "counter", what: { kind: "eventObject" } },
      ],
      label: "Garde",
    });
  }
  return out;
}

export function toCardDef(raw: RawCard, script?: CardScript, set = "FDN"): CardDef {
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
  const ward = parseWard(raw.oracleText);
  if (ward) keywords.add("ward");

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
    abilities: [...(script?.abilities ?? []), ...intrinsicAbilities(keywords, ward, parseEquip(raw.oracleText))],
    enchant: script?.enchant,
    loyalty: raw.loyalty ? Number(raw.loyalty) : undefined,
    leyline: script?.leyline,
    ward,
    cantBeCountered: script?.cantBeCountered,
    spell: script?.spell,
    kicker: script?.kicker ? parseManaCost(script.kicker) : undefined,
    flashback: script?.flashback ? parseManaCost(script.flashback) : undefined,
    additionalCost: script?.additionalCost,
    costReduction: script?.costReduction,
    text: raw.oracleText,
    fr: raw.fr,
    image: raw.image,
    artCrop: raw.artCrop,
    implemented,
    set,
    number: raw.number,
    rarity: raw.rarity,
  };
}
