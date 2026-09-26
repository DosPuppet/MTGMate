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
  /** Assemblage : les deux parties et la carte assemblée. */
  meld?: { parts: string[]; result?: string };
  /** Disposition Scryfall quand elle n'est pas « normal » (saga, class, case, adventure, transform…). */
  layout?: string;
  /** Cartes à plusieurs faces (aventure, scindée, recto-verso, assemblage) : toutes les faces. */
  faces?: RawFace[];
}

export interface RawFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  image?: string;
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
const WARD =
  /\bward(?: ((?:\{[^}]+\})+)|—(?:((?:\{[^}]+\})+), )?pay (\d+) life\.?|—discard a card\.?|—sacrifice (two|three|four) permanents\.?)/i;

/** « Equip {3}{W} » (702.6) : capacité activée en rituel, cible une créature que vous contrôlez. */
export function parseEquip(text: string): string | undefined {
  return /^Equip ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1];
}

export function parseWard(text: string): CardDef["ward"] {
  const m = WARD.exec(stripReminder(text));
  if (!m) return undefined;
  if (m[1]) return { mana: parseManaCost(m[1]) };
  // « Ward—Sacrifice three permanents. » (Emrakul, the Exigent Doom)
  if (m[4]) return { sacrifice: { two: 2, three: 3, four: 4 }[m[4].toLowerCase()] };
  // « Ward—Discard a card. » (Gideon the Oathless)
  if (!m[3]) return { discard: true };
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
function intrinsicAbilities(
  keywords: Set<Keyword>,
  ward: CardDef["ward"],
  equip?: string,
  crew?: number,
  equipReduced?: boolean,
): CardDef["abilities"] {
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
      reduceByTargetCounters: equipReduced || undefined,
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
        {
          op: "unlessPay",
          who: { kind: "eventPlayer" },
          mana: ward.mana,
          life: ward.life,
          discard: ward.discard,
          sacrifice: ward.sacrifice,
          skip: 1,
        },
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

/** Dispositions à plusieurs faces que le moteur sait jouer (complété lot par lot : aventures, recto-verso…). */
export const HANDLED_LAYOUTS = new Set<string>(["adventure", "transform", "modal_dfc", "meld"]);

/**
 * Définition d'une carte. Pour une carte à plusieurs faces, chaque face a sa propre définition (script cherché par
 * le nom de la face dans `scripts`), et la carte porte les caractéristiques hors du jeu : le recto, ou la réunion
 * des deux moitiés d'une carte scindée.
 */
export function toCardDef(
  raw: RawCard,
  script: CardScript | undefined,
  set: string,
  scripts: Record<string, CardScript> = {},
): CardDef {
  if (!raw.faces?.length) {
    const d = singleDef(raw, script, set);
    // Assemblage (meld) : chaque carte est importée seule ; jouable quand le moteur gère la disposition.
    if (raw.layout === "meld" && !HANDLED_LAYOUTS.has("meld")) d.implemented = false;
    if (raw.meld) {
      d.layout = "meld";
      d.meld = { parts: raw.meld.parts, result: raw.meld.result };
      d.meldResult = raw.name === raw.meld.result;
    }
    return d;
  }
  const faceDefs = raw.faces.map((f, i) => ({
    ...singleDef(faceRaw(raw, f), scripts[f.name], set),
    id: `${slug(raw.name)}__${i}`,
  }));
  const front = faceDefs[0] as CardDef;
  // 712.8e : la valeur de mana du verso d'une carte transformable est celle de son recto.
  const back = faceDefs[1];
  if (raw.layout === "transform" && back && !back.manaCost) back.manaCost = front.manaCost;
  // La carte hors du jeu a les caractéristiques et le comportement de son recto (script du recto).
  const base = singleDef(
    { ...faceRaw(raw, raw.faces[0] as RawFace), name: raw.name, image: raw.image, fr: raw.fr },
    script ?? scripts[raw.faces[0]?.name ?? ""],
    set,
  );
  const layout = raw.layout as CardDef["layout"];
  const card: CardDef = {
    ...base,
    id: slug(raw.name),
    name: raw.name,
    layout,
    faceDefs,
    // Le texte de la carte est celui du recto ; les autres faces sont affichées à part (aperçu).
    text: layout === "split" ? "" : front.text,
    legalities: raw.legalities,
    implemented: !!layout && HANDLED_LAYOUTS.has(layout) && faceDefs.every((f) => f.implemented),
  };
  if (layout === "split") {
    // 709.4 : hors de la pile, une carte scindée a les caractéristiques combinées de ses deux moitiés.
    const halves = faceDefs.slice(0, 2);
    const costs = halves.map((h) => h.manaCost).filter((c): c is NonNullable<typeof c> => !!c);
    card.manaCost = costs.length ? costs.reduce((a, b) => addManaCosts(a, b)) : front.manaCost;
    card.manaCostText = halves.map((h) => h.manaCostText).join(" // ");
    card.colors = [...new Set(halves.flatMap((h) => h.colors))];
    card.types = [...new Set(halves.flatMap((h) => h.types))];
    card.typeLine = halves.map((h) => h.typeLine).join(" // ");
  }
  return card;
}

/** Somme de deux coûts de mana (valeur de mana d'une carte scindée). */
function addManaCosts(
  a: NonNullable<CardDef["manaCost"]>,
  b: NonNullable<CardDef["manaCost"]>,
): NonNullable<CardDef["manaCost"]> {
  const colored = { ...a.colored };
  for (const [m, n] of Object.entries(b.colored))
    colored[m as keyof typeof colored] = (colored[m as keyof typeof colored] ?? 0) + (n ?? 0);
  return {
    generic: a.generic + b.generic,
    colored,
    x: a.x + b.x,
    hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])],
    twoHybrid: [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])],
  };
}

/** Données brutes d'une face, au format d'une carte simple. */
function faceRaw(raw: RawCard, f: RawFace): RawCard {
  const text = f.oracleText.toLowerCase();
  return {
    ...raw,
    name: f.name,
    manaCost: f.manaCost,
    typeLine: f.typeLine,
    oracleText: f.oracleText,
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    // Couleurs : celles de la face (recto-verso), sinon celles de son coût (aventure, moitié de carte scindée).
    colors: f.colors ?? (["W", "U", "B", "R", "G"] as const).filter((c) => f.manaCost.includes(c)),
    keywords: raw.keywords.filter((k) => text.includes(k.toLowerCase())),
    image: f.image ?? raw.image,
    fr: f.fr,
    faces: undefined,
    layout: undefined,
  };
}

function singleDef(raw: RawCard, script: CardScript | undefined, set: string): CardDef {
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
  if (
    (power === null || toughness === null) &&
    script?.cdaPT === undefined &&
    script?.cdaPower === undefined &&
    script?.cdaToughness === undefined
  )
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
      ...intrinsicAbilities(
        keywords,
        ward,
        parseEquip(raw.oracleText),
        parseCrew(raw.oracleText),
        /costs \{1\} less to activate for each \+1\/\+1 counter on the creature it targets/.test(raw.oracleText),
      ),
      ...(parseCycling(raw.oracleText) ? [parseCycling(raw.oracleText) as CardDef["abilities"][number]] : []),
    ],
    cdaPower: script?.cdaPower,
    cdaToughness: script?.cdaToughness,
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
    flashbackDiscard: script?.flashbackDiscard,
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
