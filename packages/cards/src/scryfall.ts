/**
 * Conversion des données Scryfall (data/*.json) en définitions de cartes du moteur.
 */
import {
  type CardDef,
  type CardScript,
  type CardType,
  type Color,
  type Keyword,
  type ObjectFilter,
  parseManaCost,
} from "@mtgx/engine";

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
  legalities?: CardDef["legalities"];
  /** Disposition « prepare » : le sort attaché à la créature. */
  prepare?: {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText: string;
    fr?: { name?: string; typeLine?: string; text?: string };
  };
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
  convoke: "convoke",
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

/** Garde : « Ward {2} », « Ward—Pay 7 life. » ou « Ward—{3}, Pay 3 life. » */
const WARD = /\bward(?: ((?:\{[^}]+\})+)|—(?:((?:\{[^}]+\})+), )?pay (\d+) life\.?)/i;

/** « Equip {3}{W} » (702.6) : capacité activée en rituel, cible une créature que vous contrôlez. */
export function parseEquip(text: string): string | undefined {
  return /^Equip ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1];
}

export function parseWard(text: string): CardDef["ward"] {
  const m = WARD.exec(stripReminder(text));
  if (!m) return undefined;
  if (m[1]) return { mana: parseManaCost(m[1]) };
  return { mana: m[2] ? parseManaCost(m[2]) : undefined, life: Number(m[3]) };
}

/** Équipage N (Véhicules). */
export function parseCrew(text: string): number | undefined {
  const m = /^Crew (\d+)/m.exec(stripReminder(text));
  return m ? Number(m[1]) : undefined;
}

/** Le texte ne contient-il que des mots-clés gérés par le moteur (créature « vanilla » ou « french vanilla ») ? */
/** Cycle (702.29) : « Cycling {2} », « Basic landcycling {2} », « Islandcycling {2} », « Wizardcycling {1} »… */
const CYCLING = /^(Basic land|[A-Z][a-z]+)?cycling ((?:\{[^}]+\})+)/im;

/**
 * Capacité de cycle lue dans le texte : « [coût], défaussez cette carte : piochez une carte » ou, pour un
 * cycle de type, « cherchez une carte [du type], révélez-la, mettez-la dans votre main ».
 */
export function parseCycling(text: string): CardDef["abilities"][number] | undefined {
  const m = CYCLING.exec(stripReminder(text));
  if (!m) return undefined;
  const kind = m[1];
  const filter: ObjectFilter | undefined =
    kind === "Basic land"
      ? { types: ["Land"], basic: true }
      : kind === "Land"
        ? { types: ["Land"] }
        : kind
          ? { subtype: kind }
          : undefined;
  return {
    kind: "activated",
    cost: { mana: parseManaCost(m[2] as string), discardSelf: true },
    targets: [],
    effects: filter
      ? [{ op: "search", filter, count: 1, to: { to: "hand" } }]
      : [{ op: "draw", who: { kind: "you" }, amount: 1 }],
    fromHand: true,
    label: kind ? `Cycle de ${kind === "Basic land" ? "terrain de base" : kind === "Land" ? "terrain" : kind}` : "Cycle",
  };
}

export function onlyKeywords(text: string): boolean {
  const t = stripReminder(text);
  if (!t) return true;
  return t
    .split("\n")
    .filter((line) => !CYCLING.test(line.trim()))
    .map((line) => line.replace(new RegExp(WARD.source, "gi"), "ward").trim())
    .every((line) => line.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
}

function parseInt0(v: string | undefined): number | undefined | null {
  if (v === undefined) return undefined;
  return /^-?\d+$/.test(v) ? Number(v) : null;
}

/** Capacités déclenchées portées par un mot-clé (702.108 prouesse, 702.21 garde). */
function intrinsicAbilities(keywords: Set<Keyword>, ward: CardDef["ward"], equip?: string, crew?: number): CardDef["abilities"] {
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
  if (crew !== undefined) {
    // 702.122 : « Équipage N : engagez des créatures de force totale N ou plus : ce Véhicule devient une créature-artefact. »
    out.push({
      kind: "activated",
      cost: { crew },
      targets: [],
      effects: [{ op: "modify", what: { kind: "self" }, mods: { addTypes: ["Artifact", "Creature"] }, duration: "endOfTurn" }],
      label: `Équipage ${crew}`,
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

/** Définition du sort préparé d'une carte « à préparer » (copiée en exil quand la créature devient préparée). */
function prepareSpellDef(raw: RawCard, spell: NonNullable<CardScript["prepareSpell"]>, set: string): CardDef {
  const p = raw.prepare as NonNullable<RawCard["prepare"]>;
  const types =
    p.typeLine
      .split(" — ")[0]
      ?.split(" ")
      .filter((w): w is CardType => CARD_TYPES.has(w as CardType)) ?? [];
  const manaCost = p.manaCost ? parseManaCost(p.manaCost) : null;
  const colors = (["W", "U", "B", "R", "G"] as Color[]).filter((c) => p.manaCost.includes(c));
  return {
    id: `${slug(raw.name)}--${slug(p.name)}`,
    name: p.name,
    typeLine: p.typeLine,
    manaCost,
    manaCostText: p.manaCost,
    colors,
    supertypes: [],
    types,
    subtypes: [],
    keywords: [],
    abilities: [],
    spell,
    text: p.oracleText,
    fr: p.fr ? { name: p.fr.name, typeLine: p.fr.typeLine, text: p.fr.text } : undefined,
    image: raw.image,
    artCrop: raw.artCrop,
    implemented: true,
    set,
    number: raw.number,
    rarity: raw.rarity,
    legalities: raw.legalities,
  };
}

export function toCardDef(raw: RawCard, script: CardScript | undefined, set: string): CardDef {
  const [left = "", right = ""] = raw.typeLine.split(" — ");
  const words = left.split(" ").filter(Boolean);
  const supertypes = words.filter((w) => SUPERTYPES.has(w));
  const types = words.filter((w): w is CardType => CARD_TYPES.has(w as CardType));
  const subtypes = right.split(" ").filter(Boolean);

  let implemented = !!script || onlyKeywords(raw.oracleText);
  // Cartes « à préparer » : jouables seulement si le script décrit leur sort.
  if (raw.prepare && !script?.prepareSpell) implemented = false;
  let manaCost = null;
  try {
    manaCost = raw.manaCost ? parseManaCost(raw.manaCost) : null;
  } catch {
    implemented = false;
  }
  const power = parseInt0(raw.power);
  const toughness = parseInt0(raw.toughness);
  // F/E variables (*) : seulement si le script les définit (capacité de définition de caractéristiques).
  if ((power === null || toughness === null) && script?.cdaPT === undefined && script?.cdaPower === undefined)
    implemented = false;

  const keywords = new Set<Keyword>();
  // « Hexproof from X » n'est pas la défense talismanique complète (Scryfall liste aussi « Hexproof »).
  const partialHexproof = raw.keywords.includes("Hexproof from");
  for (const k of raw.keywords) {
    const kw = KEYWORD_NAMES[k.toLowerCase()];
    if (kw && !(kw === "hexproof" && partialHexproof)) keywords.add(kw);
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
    abilities: [
      ...(script?.abilities ?? []),
      ...intrinsicAbilities(keywords, ward, parseEquip(raw.oracleText), parseCrew(raw.oracleText)),
      ...(parseCycling(raw.oracleText) ? [parseCycling(raw.oracleText) as CardDef["abilities"][number]] : []),
    ],
    cdaPower: script?.cdaPower,
    castCondition: script?.castCondition,
    flashExtraCost: script?.flashExtraCost ? parseManaCost(script.flashExtraCost) : undefined,
    opponentDiscardToBattlefield: script?.opponentDiscardToBattlefield,
    controlsEnchanted: script?.controlsEnchanted,
    enchant: script?.enchant,
    loyalty: raw.loyalty ? Number(raw.loyalty) : undefined,
    leyline: script?.leyline,
    altCost: script?.altCost
      ? { mana: parseManaCost(script.altCost.mana), condition: script.altCost.condition, label: script.altCost.label }
      : undefined,
    cdaPT: script?.cdaPT,
    chooseOnEnter: script?.chooseOnEnter,
    shuffleIntoLibrary: script?.shuffleIntoLibrary,
    graveyardCastRemoveCounters: script?.graveyardCastRemoveCounters,
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
    prepareSpell: raw.prepare && script?.prepareSpell ? prepareSpellDef(raw, script.prepareSpell, set) : undefined,
    prepareFace: raw.prepare
      ? {
          name: raw.prepare.name,
          manaCost: raw.prepare.manaCost,
          typeLine: raw.prepare.typeLine,
          text: raw.prepare.oracleText,
          fr: raw.prepare.fr,
        }
      : undefined,
    implemented,
    set,
    number: raw.number,
    rarity: raw.rarity,
    legalities: raw.legalities,
  };
}
