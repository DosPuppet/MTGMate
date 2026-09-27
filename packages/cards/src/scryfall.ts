/**
 * Conversion des données Scryfall (data/*.json) en définitions de cartes du moteur.
 */
import {
  type CardDef,
  type CardScript,
  type CardType,
  type Color,
  dsl,
  type Keyword,
  type ManaCost,
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
  "start your engines!": "startYourEngines",
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
  /\bward(?: ((?:\{[^}]+\})+)|—(?:((?:\{[^}]+\})+), )?pay (\d+) life\.?|—discard a card( at random)?\.?|—sacrifice (two|three|four) permanents\.?)/i;

/** « Equip {3}{W} » (702.6) : capacité activée en rituel, cible une créature que vous contrôlez. */
/** « Equip {2} » ou, avec un nom de capacité, « Gae Bolg — Equip {4} ». */
export function parseEquip(text: string): string | undefined {
  return /^(?:[^\n—]+ — )?Equip ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1];
}

/** Héros : créature incolore 1/1 (Job select). */
const HERO_TOKEN = { name: "Hero", colors: [], types: ["Creature" as const], subtypes: ["Hero"], power: 1, toughness: 1 };

/** Job select : « quand cet Équipement arrive, créez un jeton Héros 1/1, puis attachez-lui cet Équipement ». */
function jobSelectAbility(keywords: string[]): CardDef["abilities"] {
  if (!keywords.some((k) => k.toLowerCase() === "job select")) return [];
  return [
    {
      kind: "triggered",
      trigger: { on: "enters", who: "self" },
      targets: [],
      effects: [
        { op: "createTokens", token: HERO_TOKEN, count: 1, store: "hero" },
        { op: "attach", what: { kind: "self" }, to: { kind: "stored", name: "hero" } },
      ],
      label: "Job select : Héros 1/1 équipé",
    },
  ];
}

export function parseWard(text: string): CardDef["ward"] {
  const m = WARD.exec(stripReminder(text));
  if (!m) return undefined;
  if (m[1]) return { mana: parseManaCost(m[1]) };
  // « Ward—Sacrifice three permanents. » (Emrakul, the Exigent Doom)
  if (m[5]) return { sacrifice: { two: 2, three: 3, four: 4 }[m[5].toLowerCase()] };
  // « Ward—Discard a card [at random]. » (Gideon the Oathless, Alpharael, Stonechosen)
  if (!m[3]) return m[4] ? { discard: true, discardRandom: true } : { discard: true };
  return { mana: m[2] ? parseManaCost(m[2]) : undefined, life: Number(m[3]) };
}

/** Plot (702.170) : « Plot {1}{W} ». */
export function parsePlot(text: string): ManaCost | undefined {
  const m = /^Plot ((?:\{[^}]+\})+)/m.exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Action spéciale de plot : depuis la main, au moment d'un rituel, la carte est exilée et devient complotée. */
function plotAbility(text: string): CardDef["abilities"] {
  const cost = parsePlot(text);
  if (!cost) return [];
  return [
    {
      kind: "activated",
      cost: { mana: cost },
      targets: [],
      effects: [{ op: "plot", what: { kind: "self" } }],
      fromHand: true,
      sorcerySpeed: true,
      specialAction: true,
      label: "Complot",
    },
  ];
}

/** Dévorer (702.82) : « Devour 2 », « Devour land 3 », « Devour artifact 1 ». */
export function parseDevour(text: string): CardDef["devour"] {
  const m = /^Devour(?: (land|artifact))? (\d+)/m.exec(stripReminder(text));
  if (!m) return undefined;
  const type = m[1] === "land" ? "Land" : m[1] === "artifact" ? "Artifact" : "Creature";
  return { filter: { types: [type] }, n: Number(m[2]) };
}

/** Distorsion (702.185) : « Warp {1}{W} » ou « Warp—{B}, Pay 2 life. » ; « …depuis votre cimetière avec sa distorsion ». */
export function parseWarp(text: string): CardDef["warp"] {
  const t = stripReminder(text);
  const m = /^Warp(?: |—)((?:\{[^}]+\})+)(?:, [Pp]ay (\d+) life)?/m.exec(t);
  if (!m) return undefined;
  return {
    cost: parseManaCost(m[1] as string),
    life: m[2] ? Number(m[2]) : undefined,
    fromGraveyard: /You may cast this card from your graveyard using its warp ability/.test(t) || undefined,
  };
}

/** Déguisement (702.168) : « Disguise {1}{W} ». */
export function parseDisguise(text: string): CardDef["disguise"] {
  const m = /^Disguise ((?:\{[^}]+\})+)/m.exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Monture (702.171) : « Saddle N ». */
export function parseSaddle(text: string): number | undefined {
  const m = /^Saddle (\d+)/m.exec(stripReminder(text));
  return m ? Number(m[1]) : undefined;
}

/** Équipage N (Véhicules). */
/** « Crew 1. Activate only once each turn. » (Luxurious Locomotive) */
export function crewOncePerTurn(text: string): boolean {
  return /^Crew \d+\. Activate only once each turn\./m.test(stripReminder(text));
}

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
    cycling: true,
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
  saddle?: number,
  crewOnce?: boolean,
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
  if (saddle !== undefined) out.push(dsl.saddleAbility(saddle));
  if (crew !== undefined) out.push(dsl.crewAbility(crew, crewOnce));
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
  if (ward) out.push(dsl.wardAbility(ward));
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
export const HANDLED_LAYOUTS = new Set<string>(["adventure", "transform", "modal_dfc", "meld", "split"]);

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
    card.subtypes = [...new Set(halves.flatMap((h) => h.subtypes))];
    card.keywords = [];
    // Salle (709.5) : la carte n'a que les actions spéciales « déverrouiller » ; chaque porte garde ses capacités,
    // et « quand vous déverrouillez cette porte » vise sa propre porte.
    const room = halves.every((h) => h.subtypes.includes("Room"));
    halves.forEach((h, door) => {
      h.abilities = h.abilities.map((ab) =>
        ab.kind === "triggered" && ab.trigger.on === "unlockDoor" ? { ...ab, trigger: { on: "unlockDoor", door } } : ab,
      );
    });
    card.abilities = room
      ? halves.map((h, door) => ({
          kind: "activated" as const,
          cost: { mana: h.manaCost ?? undefined },
          targets: [],
          effects: [{ op: "unlockDoor" as const, what: { kind: "self" as const }, door }],
          sorcerySpeed: true,
          specialAction: true,
          activationCondition: { kind: "doorLocked" as const, door },
          label: `Déverrouiller ${h.name}`,
        }))
      : [];
  }
  return card;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

/**
 * Saga (714) : dernier chapitre lu dans le texte. Classe (716) : coûts des niveaux lus dans le texte (« {W}: Level 2 »),
 * capacités de niveau prises dans le script, et capacités « Niveau N » générées (rituel, depuis le niveau N−1).
 * Affaire (719) : déclencheur « au début de votre étape de fin, si [condition], elle est résolue » généré.
 */
function sagaClassCase(
  raw: RawCard,
  script: CardScript | undefined,
): Partial<CardDef> & { extraAbilities?: CardDef["abilities"] } {
  const text = stripReminder(raw.oracleText);
  if (raw.layout === "saga") {
    const chapters = [...text.matchAll(/^([IVX]+(?:, [IVX]+)*) —/gm)].flatMap((m) =>
      (m[1] ?? "").split(", ").map((r) => ROMAN[r] ?? 0),
    );
    return { layout: "saga", saga: { chapters: Math.max(0, ...chapters) } };
  }
  if (raw.layout === "class") {
    const costs = [...text.matchAll(/^((?:\{[^}]+\})+): Level (\d+)/gm)].map((m) => ({
      cost: parseManaCost(m[1] ?? ""),
      level: Number(m[2]),
    }));
    const levels = costs.map((c, i) => ({ cost: c.cost, abilities: script?.classLevels?.[i] ?? [] }));
    const levelUps: CardDef["abilities"] = costs.map((c) => ({
      kind: "activated",
      cost: { mana: c.cost },
      targets: [],
      effects: [{ op: "setClassLevel", level: c.level }],
      sorcerySpeed: true,
      activationCondition: { kind: "classLevel", level: c.level - 1 },
      label: `Niveau ${c.level}`,
    }));
    return { layout: "class", classLevels: levels, extraAbilities: levelUps };
  }
  if (/^Station \(/m.test(raw.oracleText)) return parseStation(raw, script);
  if (raw.layout === "case") {
    const solve: CardDef["abilities"][number] = {
      kind: "triggered",
      trigger: { on: "step", step: "end", whose: "you" },
      targets: [],
      effects: [{ op: "solveCase" }],
      condition: {
        kind: "all",
        of: [{ kind: "not", cond: { kind: "solved" } }, script?.caseToSolve ?? { kind: "not", cond: { kind: "yourTurn" } }],
      },
      label: "Pour résoudre",
    };
    return {
      layout: "case",
      caseToSolve: script?.caseToSolve,
      caseSolved: script?.caseSolved ?? [],
      extraAbilities: [solve],
    };
  }
  return {};
}

/**
 * Station (702.184) : « Station (…) » puis des paliers « N+ | … » (les lignes suivantes appartiennent au dernier palier).
 * Les mots-clés d'un palier sont lus ; ses autres capacités viennent du script (`stationAbilities[N]`), sans quoi la
 * carte reste non gérée. La capacité « Station » (engager une autre créature, en rituel) est générée.
 */
function parseStation(
  raw: RawCard,
  script: CardScript | undefined,
): Partial<CardDef> & { extraAbilities?: CardDef["abilities"]; stationIncomplete?: boolean } {
  const creatureAt = /It's an artifact creature at (\d+)\+/.exec(raw.oracleText);
  const lines = stripReminder(raw.oracleText).split("\n");
  const start = lines.findIndex((l) => /^Station\b/.test(l.trim()));
  const thresholds: { n: number; parts: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^(\d+)\+ \| (.*)$/.exec(line.trim());
    if (m) thresholds.push({ n: Number(m[1]), parts: [m[2] as string] });
    else if (thresholds.length && line.trim()) thresholds[thresholds.length - 1]?.parts.push(line.trim());
  }
  let incomplete = false;
  const station = {
    creatureAt: creatureAt ? Number(creatureAt[1]) : undefined,
    thresholds: thresholds.map((t) => {
      const keywordParts = t.parts.filter((p) => p.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
      const others = t.parts.length - keywordParts.length;
      const abilities = script?.stationAbilities?.[t.n] ?? [];
      if (others > 0 && !script?.stationAbilities?.[t.n]) incomplete = true;
      return {
        n: t.n,
        keywords: keywordParts.flatMap((p) => p.split(/,\s*/).map((k) => KEYWORD_NAMES[k.trim().toLowerCase()] as Keyword)),
        abilities,
      };
    }),
  };
  const stationAbility: CardDef["abilities"][number] = {
    kind: "activated",
    cost: { tapOthers: { filter: { types: ["Creature"] }, count: 1 } },
    targets: [],
    effects: [{ op: "station" }],
    sorcerySpeed: true,
    label: "Station",
  };
  return { station, extraAbilities: [stationAbility], stationIncomplete: incomplete };
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
  // « Enchanted permanent has ward {1} » (Hardlight Containment) : garde accordée, pas celle de la carte.
  const ward = raw.keywords.some((k) => k.toLowerCase() === "ward") ? parseWard(raw.oracleText) : undefined;
  if (ward) keywords.add("ward");

  const {
    extraAbilities = [],
    stationIncomplete,
    ...levelFields
  } = sagaClassCase(raw, script) as ReturnType<typeof sagaClassCase> & { stationIncomplete?: boolean };
  // Station : un palier dont les capacités (autres que des mots-clés) ne sont pas scriptées rend la carte non gérée.
  if (stationIncomplete) implemented = false;
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
        parseSaddle(raw.oracleText),
        crewOncePerTurn(raw.oracleText),
      ),
      ...plotAbility(raw.oracleText),
      ...jobSelectAbility(raw.keywords),
      ...(parseCycling(raw.oracleText) ? [parseCycling(raw.oracleText) as CardDef["abilities"][number]] : []),
      ...extraAbilities,
    ],
    ...levelFields,
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
    castFromGraveyard: script?.castFromGraveyard,
    flashIf: script?.flashIf,
    exileOnResolve: script?.exileOnResolve,
    entersAsCopyAddSubtypes: script?.entersAsCopyAddSubtypes,
    chosenNameTax: script?.chosenNameTax,
    ward,
    cantBeCountered: script?.cantBeCountered,
    spell: script?.spell,
    kicker: script?.kicker ? parseManaCost(script.kicker) : undefined,
    flashback: script?.flashback ? parseManaCost(script.flashback) : undefined,
    flashbackDiscard: script?.flashbackDiscard,
    disguise: parseDisguise(raw.oracleText),
    warp: parseWarp(raw.oracleText),
    plot: parsePlot(raw.oracleText),
    devour: script?.devour ?? parseDevour(raw.oracleText),
    entersAsCopyOf: script?.entersAsCopyOf,
    shockLand: /As this land enters, you may pay (\d+) life\. If you don't, it enters tapped\./.exec(raw.oracleText)
      ? Number(/you may pay (\d+) life/.exec(raw.oracleText)?.[1])
      : undefined,
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
