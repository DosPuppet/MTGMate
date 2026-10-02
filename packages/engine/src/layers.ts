/**
 * Système de couches (613) : caractéristiques calculées des objets.
 *
 * Toutes les caractéristiques du champ de bataille sont calculées en une passe, couche par couche,
 * les effets de chaque couche étant appliqués par ordre d'horodatage :
 *   4 types · 5 couleurs · 6 capacités · 7b F/E fixées · 7c modifications et marqueurs · 7d échange.
 * Les effets viennent de deux sources : les effets continus issus de résolutions (s.effects, ensemble
 * d'objets verrouillé) et les capacités statiques des permanents (ensemble réévalué à chaque calcul).
 *
 * Le résultat est mis en cache par état et par `s.version`, que le moteur incrémente à chaque changement
 * pouvant affecter les caractéristiques (voir `bump`). Le fuzz vérifie que le cache ne diverge jamais.
 * Couche 1 : copie d'une définition (`copyOf`), pour une durée, avec ses exceptions copiables (707.9b). La couche 2
 * (contrôle) est calculée à part (`control.ts`). Dépendances (613.8) : par point fixe (`computeBattlefield`) ; limite :
 * une statique accordée par une autre statique n'est pas gérée.
 */
import { manaValue } from "./mana";
import { counterPT, obj } from "./state";
import { ALL_CREATURE_TYPES, matchesView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type {
  AbilityDef,
  Amount,
  BlockRule,
  CardDef,
  CardType,
  Color,
  GameObject,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
  PowerRule,
  ProtectionRule,
} from "./types";

export interface Characteristics {
  name: string;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  toughness: number;
  /** Force de base : après la couche 7b (F/E fixées), avant les marqueurs et les modifications. */
  basePower?: number;
  keywords: Keyword[];
  /** Capacités non-mot-clé effectives (vides si l'objet a perdu toutes ses capacités). */
  abilities: AbilityDef[];
  /** Règles de blocage (« ne peut pas être bloquée par… »), comme des capacités. */
  blockRules: BlockRule[];
  /** Protections et défenses talismaniques « contre [filtre] ». */
  protections: ProtectionRule[];
  /** « Utilise son endurance pour » (blessures de combat, équipage, station). */
  powerRules: PowerRule[];
  controller: PlayerId;
}

/** 122.1b : marqueurs qui donnent un mot-clé (le nom du marqueur est celui du mot-clé du moteur). */
const KEYWORD_COUNTERS: Record<string, Keyword> = {
  flying: "flying",
  firstStrike: "firstStrike",
  doubleStrike: "doubleStrike",
  deathtouch: "deathtouch",
  hexproof: "hexproof",
  indestructible: "indestructible",
  lifelink: "lifelink",
  menace: "menace",
  reach: "reach",
  trample: "trample",
  vigilance: "vigilance",
  haste: "haste",
  decayed: "decayed",
};

/** Invalide le cache des caractéristiques. */
export function bump(s: GameState): void {
  s.version += 1;
}

/** 604.3 / 613.4a : F/E définies par une capacité (« égales au nombre de cartes dans les cimetières adverses »). */
/** Filtre évalué sur les caractéristiques imprimées (types, sous-types, « l'un de ») : pas de récursion dans les couches. */
/** Force totale (imprimée) des cartes liées. */
export function linkedTotalPower(s: GameState, linked: ObjectId[] | undefined): number {
  return (linked ?? []).reduce((n, id) => n + Math.max(0, s.defs[s.objects[id]?.defId ?? ""]?.power ?? 0), 0);
}

/** Couleurs (imprimées) parmi les cartes liées. */
export function linkedColors(s: GameState, linked: ObjectId[] | undefined): Color[] {
  return [...new Set((linked ?? []).flatMap((id) => s.defs[s.objects[id]?.defId ?? ""]?.colors ?? []))];
}

function printedMatch(d: Pick<CardDef, "types" | "subtypes"> | undefined, f: ObjectFilter): boolean {
  if (!d) return false;
  if (f.types && !f.types.some((t) => d.types.includes(t))) return false;
  if (f.notTypes?.some((t) => d.types.includes(t))) return false;
  if (f.subtype && !d.subtypes.includes(f.subtype)) return false;
  if (f.notSubtype && d.subtypes.includes(f.notSubtype)) return false;
  // Super-Adaptoid : « le nombre de créatures légendaires que vous contrôlez ».
  if (f.legendary && !(d as { supertypes?: string[] }).supertypes?.includes("Legendary")) return false;
  if (f.anySubtype && !f.anySubtype.some((t) => d.subtypes.includes(t))) return false;
  if (f.anyOf && !f.anyOf.some((g) => printedMatch(d, g))) return false;
  const permanentTypes: CardType[] = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];
  if (f.permanent && !d.types.some((t) => permanentTypes.includes(t))) return false;
  if (f.nonland && d.types.includes("Land")) return false;
  return true;
}

/** Une valeur de F/E définie par une capacité qui lit les permanents (et dépend donc des couches, 613.8). */
function readsBattlefield(a: Amount): boolean {
  if (typeof a === "number") return false;
  if (a.kind === "sum") return a.of.some(readsBattlefield);
  if (a.kind === "basicLandTypes" || a.kind === "maxManaValue" || a.kind === "colorsAmong" || a.kind === "countersAmong")
    return true;
  return a.kind === "count" && (!a.zone || a.zone === "battlefield");
}

/** Types et sous-types d'un permanent pendant le calcul : ceux de la passe précédente (613.8), sinon imprimés. */
function typesOf(s: GameState, id: ObjectId): { types: CardType[]; subtypes: string[] } | undefined {
  return provisional?.get(id) ?? s.defs[obj(s, id).defId];
}

function cdaValue(s: GameState, o: GameObject, a: Amount): number {
  if (typeof a === "number") return a;
  // Fabrication : cartes exilées pour fabriquer ce permanent (Mastercraft Raptor, Sunbird Effigy).
  if (a.kind === "linkedTotalPower") return linkedTotalPower(s, o.linked);
  if (a.kind === "linkedColors") return linkedColors(s, o.linked).length;
  if (a.kind === "sum") return a.of.reduce<number>((n, x) => n + cdaValue(s, o, x), 0);
  if (a.kind === "cardTypesInGraveyards") {
    const types = new Set<string>();
    for (const p of s.playerOrder)
      for (const id of s.players[p]?.graveyard ?? []) for (const t of s.defs[obj(s, id).defId]?.types ?? []) types.add(t);
    return types.size;
  }
  if (a.kind === "basicLandTypes") {
    // Domaine : sous-types des terrains du contrôleur (passe précédente, sinon imprimés).
    const subtypes = new Set(
      s.battlefield.flatMap((id) => {
        const x = obj(s, id);
        const d = typesOf(s, id);
        return x.controller === o.controller && d?.types.includes("Land") ? d.subtypes : [];
      }),
    );
    return ["Plains", "Island", "Swamp", "Mountain", "Forest"].filter((t) => subtypes.has(t)).length;
  }
  if (a.kind === "colorsAmong") {
    // Vivid (Squawkroaster) : couleurs parmi les permanents du contrôleur, couleurs imprimées (pendant le calcul des
    // couches, les couleurs modifiées des autres permanents ne sont pas encore connues).
    const colors = new Set<string>();
    for (const id of s.battlefield) {
      const x = obj(s, id);
      if (a.filter.controller === "you" && x.controller !== o.controller) continue;
      // Earthen Ally : « parmi les Alliés que vous contrôlez » (types de la passe précédente, sinon imprimés).
      if (!printedMatch(typesOf(s, id), a.filter)) continue;
      for (const c of s.defs[x.faceDefId ?? x.defId]?.colors ?? []) colors.add(c);
    }
    return colors.size;
  }
  // Toph, the Blind Bandit : marqueurs +1/+1 sur les terrains que vous contrôlez.
  if (a.kind === "countersAmong") {
    return s.battlefield.reduce((n, id) => {
      const x = obj(s, id);
      if (a.filter.controller === "you" && x.controller !== o.controller) return n;
      if (!printedMatch(typesOf(s, id), a.filter)) return n;
      return n + Math.max(0, x.counters[a.counter] ?? 0);
    }, 0);
  }
  // Duelist of the Mind : cartes piochées ce tour-ci.
  if (a.kind === "cardsDrawnThisTurn") return s.players[o.controller]?.turnStats.cardsDrawn ?? 0;
  if (a.kind === "maxManaValue") {
    // Emissary Escort : plus grande valeur de mana parmi vos autres artefacts (types imprimés).
    return Math.max(
      0,
      ...s.battlefield
        .filter((id) => {
          const x = obj(s, id);
          const d = typesOf(s, id);
          if (a.filter.other && id === o.id) return false;
          if (a.filter.controller === "you" && x.controller !== o.controller) return false;
          return !a.filter.types || a.filter.types.some((t) => d?.types.includes(t));
        })
        .map((id) => manaValue(s.defs[obj(s, id).defId]?.manaCost)),
    );
  }
  if (a.kind !== "count") return 0;
  if (a.zone === "exile") {
    // Cosmogoyf : cartes que vous possédez en exil.
    return s.exile.filter((id) => obj(s, id).owner === o.controller).length;
  }
  if (!a.zone || a.zone === "battlefield") {
    // « égales au nombre de créatures que vous contrôlez » (types de la passe précédente, sinon imprimés).
    return s.battlefield.filter((id) => {
      const x = obj(s, id);
      if (a.filter.controller === "you" && x.controller !== o.controller) return false;
      return printedMatch(typesOf(s, id), a.filter);
    }).length;
  }
  const zone = a.zone;
  const players =
    a.whose === "all"
      ? s.playerOrder
      : a.whose === "opponents"
        ? s.playerOrder.filter((p) => p !== o.controller)
        : [o.controller];
  return players
    .filter((p) => !s.players[p]?.lost)
    .flatMap((p) => s.players[p]?.[zone] ?? [])
    .filter((id) => printedMatch(s.defs[obj(s, id).defId], a.filter)).length;
}

/**
 * Définition effective d'un objet : celle qu'il copie (couche 1, effet le plus récent), sinon sa face active
 * (aventure lancée, verso), sinon la sienne.
 */
export function copiedDefId(s: GameState, id: ObjectId): string {
  let best: { t: number; def: string } | null = null;
  for (const e of s.effects) {
    if (e.copyOf && e.affected.includes(id) && (!best || e.timestamp > best.t)) best = { t: e.timestamp, def: e.copyOf };
  }
  // Copie portée par une statique d'un permanent attaché (Assimilation Aegis : « la créature équipée devient une copie de
  // la carte exilée ») ; horodatage de la statique : celui de l'attachement (613.7e).
  for (const x of s.battlefield) {
    const src = s.objects[x];
    if (src?.attachedTo !== id) continue;
    const def = staticCopyOf(s, x);
    if (def && (!best || src.timestamp > best.t)) best = { t: src.timestamp, def };
  }
  const o = obj(s, id);
  return best?.def ?? o.faceDefId ?? o.defId;
}

/** Champs de `LayerMods` qui sont des listes (cumulées quand on fusionne des modifications). */
const LIST_MODS = [
  "addAbilities",
  "addTypes",
  "addSubtypes",
  "addSupertypes",
  "removeSupertypes",
  "addKeywords",
  "removeKeywords",
  "addColors",
  "addBlockRules",
  "addProtections",
  "addPowerRules",
] as const satisfies (keyof LayerMods)[];

/** Fusionne des modifications dans l'ordre : les listes se cumulent, les autres valeurs sont remplacées. */
export function mergeMods(...all: (LayerMods | undefined)[]): LayerMods | undefined {
  const out: Record<string, unknown> = {};
  for (const m of all) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (v === undefined) continue;
      if ((LIST_MODS as readonly string[]).includes(k))
        out[k] = [...new Set([...((out[k] as unknown[]) ?? []), ...(v as unknown[])])];
      else out[k] = v;
    }
  }
  return Object.keys(out).length ? (out as LayerMods) : undefined;
}

/**
 * 707.9b : exceptions copiables d'un permanent (celles des effets de copie qui le touchent, dans l'ordre des
 * horodatages), que reprend une copie de ce permanent. Sans la définition copiée elle-même (`copiedDefId`).
 */
export function copiableExceptions(s: GameState, id: ObjectId | undefined): LayerMods | undefined {
  if (!id || s.objects[id]?.zone !== "battlefield") return undefined;
  const effects = s.effects.filter((e) => e.copiable && e.affected.includes(id)).sort((a, b) => a.timestamp - b.timestamp);
  if (effects.length === 0) return undefined;
  return mergeMods(
    ...effects.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !EFFECT_FIELDS.has(k))) as LayerMods),
  );
}

/** Champs d'un effet continu qui ne sont pas des modifications de couches (ni la copie elle-même). */
const EFFECT_FIELDS = new Set([
  "id",
  "timestamp",
  "affected",
  "duration",
  "until",
  "untilExiledUid",
  "whileSource",
  "copiable",
  "controller",
  "whileControlledBy",
  "copyOf",
]);

/**
 * Valeur de mana vue par les filtres : celle de ce que copie le permanent (707.2) ; sinon celle de la carte (le verso
 * d'une carte transformable a la valeur de mana du recto, 712.8e).
 */
function viewManaValue(s: GameState, id: ObjectId, o: GameObject): number {
  if (o.zone === "battlefield") {
    const copied = copiedDefId(s, id);
    if (copied !== (o.faceDefId ?? o.defId)) return manaValue(s.defs[copied]?.manaCost);
  }
  return manaValue(s.defs[o.defId]?.manaCost);
}

/** Définition que copie le permanent auquel `source` est attaché, d'après une statique `copyLinkedExile` de `source`. */
function staticCopyOf(s: GameState, source: ObjectId): string | undefined {
  const d = s.defs[s.objects[source]?.defId ?? ""];
  if (!d?.abilities.some((ab) => ab.kind === "static" && ab.affects === "attached" && ab.mods.copyLinkedExile)) return undefined;
  const card = s.linkedExile.find((l) => l.sourceId === source)?.cards.find((c) => s.objects[c]?.zone === "exile");
  return card ? s.objects[card]?.defId : undefined;
}

function base(s: GameState, o: GameObject, defId = o.defId): Characteristics {
  const d = s.defs[defId];
  if (!d) throw new Error(`Définition inconnue : ${o.defId}`);
  if (o.zone === "battlefield" && d.layout === "split" && d.faceDefs) return roomBase(o, d);
  if (o.faceDown) return faceDownBase(o, s.defs[o.faceDown.card]);
  const cda = d.cdaPT === undefined ? undefined : cdaValue(s, o, d.cdaPT);
  const cdaPower = d.cdaPower === undefined ? undefined : cdaValue(s, o, d.cdaPower);
  const cdaToughness = d.cdaToughness === undefined ? undefined : cdaValue(s, o, d.cdaToughness);
  const station = stationTraits(o, d);
  // Imminence (702.176a) : ce n'est pas une créature tant qu'il a un marqueur de temps (ni ses types de créature).
  const impending = !!o.impending && o.zone === "battlefield" && (o.counters.time ?? 0) > 0;
  return {
    name: d.name,
    types: impending
      ? d.types.filter((t) => t !== "Creature")
      : station.creature && !d.types.includes("Creature")
        ? [...d.types, "Creature"]
        : [...d.types],
    subtypes: impending ? [] : [...d.subtypes],
    supertypes: [...d.supertypes],
    colors: [...d.colors],
    power: cdaPower ?? cda ?? d.power ?? 0,
    toughness: cdaToughness ?? cda ?? d.toughness ?? 0,
    keywords: [...new Set([...d.keywords, ...station.keywords])],
    abilities: levelAbilities(o, d),
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

/** Capacités imprimées d'un permanent : niveaux atteints d'une Classe (716), capacités « Résolue » d'une Affaire (719). */
export function levelAbilities(o: GameObject, d: CardDef): AbilityDef[] {
  if (o.zone !== "battlefield" || (!d.classLevels && !d.caseSolved && !d.station)) return d.abilities;
  const levels = (d.classLevels ?? []).slice(0, Math.max(0, (o.classLevel ?? 1) - 1)).flatMap((l) => l.abilities);
  // Station (702.184) : capacités des paliers atteints par les marqueurs de charge.
  const charge = o.counters.charge ?? 0;
  const station = (d.station?.thresholds ?? []).filter((t) => charge >= t.n).flatMap((t) => t.abilities);
  return [...d.abilities, ...levels, ...station, ...(o.solved ? (d.caseSolved ?? []) : [])];
}

/** Station : un Vaisseau devient une créature-artefact à son seuil ; mots-clés des paliers atteints. */
function stationTraits(o: GameObject, d: CardDef): { creature: boolean; keywords: Keyword[] } {
  const charge = o.counters.charge ?? 0;
  const st = d.station;
  if (!st || o.zone !== "battlefield") return { creature: false, keywords: [] };
  return {
    creature: st.creatureAt !== undefined && charge >= st.creatureAt,
    keywords: st.thresholds.filter((t) => charge >= t.n).flatMap((t) => t.keywords),
  };
}

/** Garde {2} des permanents face cachée par déguisement ou cape (702.168b, 701.58a). */
const FACE_DOWN_WARD: AbilityDef = {
  kind: "triggered",
  ward: true,
  trigger: { on: "becomesTarget", who: "self", byOpponent: true },
  targets: [],
  effects: [
    { op: "unlessPay", who: { kind: "eventPlayer" }, mana: { generic: 2, colored: {}, x: 0 }, skip: 1 },
    { op: "counter", what: { kind: "eventObject" } },
  ],
  label: "Garde {2}",
};

/**
 * Face cachée (708.2) : créature 2/2 sans nom, sans couleur ni sous-type ; garde {2} s'il y a lieu, et l'action
 * spéciale « retourner face visible » pour chaque coût possible (déguisement, coût de mana d'une carte de créature).
 */
function faceDownBase(o: GameObject, card?: CardDef): Characteristics {
  const fd = o.faceDown as NonNullable<GameObject["faceDown"]>;
  // Fugitive Codebreaker : « ce coût [de déguisement] est réduit de {1} pour chaque… » (le premier coût, s'il y en a un).
  const disguiseReduction = card?.disguise && card.disguiseReduction ? { generic: card.disguiseReduction } : undefined;
  return {
    name: "",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    power: 2,
    toughness: 2,
    keywords: fd.ward ? ["ward"] : [],
    abilities: [
      ...(fd.ward ? [FACE_DOWN_WARD] : []),
      ...fd.upCosts.map(
        (cost, i): AbilityDef => ({
          kind: "activated",
          cost: { mana: cost },
          targets: [],
          effects: [{ op: "turnFaceUp", what: { kind: "self" } }],
          specialAction: true,
          ...(i === 0 && disguiseReduction ? { reduction: disguiseReduction } : {}),
          label: "Retourner face visible",
        }),
      ),
    ],
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

/**
 * Salle sur le champ de bataille (709.5c) : nom, couleurs et capacités de ses portes déverrouillées ; les
 * capacités « déverrouiller » de la carte restent (actions spéciales).
 */
function roomBase(o: GameObject, d: CardDef): Characteristics {
  const open = (d.faceDefs ?? []).filter((_, i) => o.unlocked?.includes(i));
  return {
    name: open.map((f) => f.name).join(" // "),
    types: [...d.types],
    subtypes: [...new Set([...d.subtypes, ...open.flatMap((f) => f.subtypes)])],
    supertypes: [...d.supertypes],
    colors: [...new Set(open.flatMap((f) => f.colors))],
    power: 0,
    toughness: 0,
    keywords: [...new Set(open.flatMap((f) => f.keywords))],
    abilities: [...d.abilities, ...open.flatMap((f) => f.abilities)],
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

interface Applied {
  timestamp: number;
  mods: LayerMods;
  /** Objets concernés : fixés (résolution) ou déterminés au moment de la couche (statique). */
  affected: ObjectId[] | { sourceId: ObjectId; controller: PlayerId; filter: "self" | "attached" | ObjectFilter };
}

const cache = new WeakMap<GameState, { key: string; map: Map<ObjectId, Characteristics> }>();
let computing = false;
/** Caractéristiques de la passe précédente (613.8), lues pendant le calcul à la place des caractéristiques imprimées. */
let provisional: Map<ObjectId, Characteristics> | null = null;
/** Lectures de caractéristiques d'un permanent pendant le calcul : une condition qui n'en fait pas ne dépend pas des couches. */
let reads = 0;
/** Vues des permanents pendant une collecte des statiques (les caractéristiques lues ne changent pas pendant elle). */
let viewCache: Map<ObjectId, LkiSnapshot> | null = null;
/** Pendant une collecte : permanents équipés, et s'il existe des copies (sinon la valeur de mana est celle de la carte). */
let scan: { equipped: Set<ObjectId>; enchanted: Map<ObjectId, PlayerId[]>; copying: boolean } | null = null;

/** Contrôleurs des Auras attachées à chaque permanent (sous-types imprimés : une Aura ne perd pas ce sous-type). */
function enchantedMap(s: GameState): Map<ObjectId, PlayerId[]> {
  const out = new Map<ObjectId, PlayerId[]>();
  for (const x of s.battlefield) {
    const a = s.objects[x];
    if (!a?.attachedTo || !s.defs[a.defId]?.subtypes.includes("Aura")) continue;
    out.set(a.attachedTo, [...(out.get(a.attachedTo) ?? []), a.controller]);
  }
  return out;
}

function view(s: GameState, id: ObjectId, c: Characteristics, o: GameObject, attacking: boolean): LkiSnapshot {
  return {
    id,
    defId: o.defId,
    owner: o.owner,
    controller: c.controller,
    types: c.types,
    subtypes: c.subtypes,
    supertypes: c.supertypes,
    colors: c.colors,
    power: c.power,
    toughness: c.toughness,
    basePower: c.basePower,
    keywords: c.keywords,
    isToken: o.isToken,
    attacking,
    name: c.name,
    manaValue: scan && !scan.copying ? manaValue(s.defs[o.defId]?.manaCost) : viewManaValue(s, id, o),
    suspected: o.suspected || undefined,
    // « un sort avec {X} dans son coût de mana » (Matterbending Mage).
    hasX: (!o.faceDown && (s.defs[o.faceDefId ?? o.defId]?.manaCost?.x ?? 0) > 0) || undefined,
    tapped: o.tapped,
    damage: o.zone === "battlefield" ? o.damage : undefined,
    uid: o.uid,
    linked: o.linked,
    damagedBy: o.damagedBy,
    attachedTo: o.attachedTo,
    blocking: !!s.combat?.blockers.some((b) => b.id === id),
    damaged: o.damage > 0 || undefined,
    counters: o.counters,
    preparedSpell: !!o.preparedFor || undefined,
    prepared: !!o.preparedCopy || undefined,
    warped: o.warped || undefined,
    faceDown: !!o.faceDown || undefined,
    // Sort sur la pile : le mana dépensé est porté par l'élément de pile (Unravel).
    manaSpent: o.manaSpent ?? (o.zone === "stack" ? s.stack.find((x) => x.id === id)?.manaSpent : undefined),
    attackedTurn: o.attackedTurn,
    lastAttachedTo: o.lastAttachedTo,
    cast: o.cast || undefined,
    crewedByThisTurn: o.crewedBy?.turn === s.turn.number ? o.crewedBy.ids : undefined,
    equipped: scan
      ? (o.zone === "battlefield" && scan.equipped.has(id)) || undefined
      : (o.zone === "battlefield" &&
          s.battlefield.some(
            (x) => s.objects[x]?.attachedTo === id && s.defs[s.objects[x]?.defId ?? ""]?.subtypes.includes("Equipment"),
          )) ||
        undefined,
    enchantedBy: o.zone === "battlefield" ? (scan ? scan.enchanted : enchantedMap(s)).get(id) : undefined,
  };
}

/** Vue d'un objet pendant le calcul des couches : caractéristiques de la passe précédente, sinon imprimées. */
function snapshotBase(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  if (o.zone !== "battlefield") return view(s, id, base(s, o), o, false);
  reads++;
  const hit = viewCache?.get(id);
  if (hit) return hit;
  const v = view(s, id, provisional?.get(id) ?? base(s, o), o, false);
  viewCache?.set(id, v);
  return v;
}

/** Au plus trois applications des couches pour résoudre les dépendances (613.8). */
const MAX_PASSES = 3;

/**
 * Calcule, sans cache, les caractéristiques de tous les objets du champ de bataille.
 *
 * 613.8 par point fixe : une première passe évalue les statiques (conditions, « pour chaque », F/E définies par une
 * capacité, capacités copiées) sur les caractéristiques imprimées. Si l'une d'elles dépend du champ de bataille, on
 * les réévalue sur le résultat provisoire (`provisional`) et on recommence tant que leur signature change.
 */
export function computeBattlefield(s: GameState): Map<ObjectId, Characteristics> {
  const copying =
    s.effects.some((e) => e.copyOf) || s.battlefield.some((x) => !!s.objects[x]?.attachedTo && !!staticCopyOf(s, x));
  const defOfId = (id: ObjectId) => (copying ? copiedDefId(s, id) : (obj(s, id).faceDefId ?? obj(s, id).defId));
  const prev = provisional;
  try {
    provisional = null;
    let collected = collectStatics(s, defOfId);
    let out = applyLayers(s, collected.applied, defOfId);
    for (let pass = 1; pass < MAX_PASSES && collected.dependent; pass++) {
      provisional = out;
      const next = collectStatics(s, defOfId, collected);
      if (next.signature === collected.signature) break;
      collected = next;
      out = applyLayers(s, next.applied, defOfId);
    }
    return out;
  } finally {
    provisional = prev;
  }
}

/** Capacité statique d'un objet, avec l'horodatage de sa source. */
interface StaticSlot {
  id: ObjectId;
  ab: Extract<AbilityDef, { kind: "static" }>;
  ts: number;
}

interface Collected {
  /** Effets à appliquer, dans l'ordre des horodatages. */
  applied: Applied[];
  /** Ce qui ne dépend pas des couches : réutilisé tel quel aux passes suivantes. */
  fixed: Applied[];
  /** Statiques qui lisent des permanents, réévaluées à chaque passe (613.8). */
  dependentSlots: StaticSlot[];
  /** Résumé de ce qui dépend des couches ; `dependent` : il y en a. */
  signature: string;
  dependent: boolean;
}

/**
 * Effets à appliquer : effets de résolution et capacités statiques. Avec `previous` (passe suivante), seules les
 * statiques dépendantes et les F/E définies par une capacité qui lisent des permanents sont réévaluées.
 */
function collectStatics(s: GameState, defOfId: (id: ObjectId) => string, previous?: Collected): Collected {
  const sig: (string | number)[] = [];
  let dependent = false;
  // F/E définies par une capacité qui comptent des permanents (types, types de terrain de base).
  for (const id of s.battlefield) {
    const d = s.defs[defOfId(id)];
    if (!d || (d.cdaPT === undefined && d.cdaPower === undefined && d.cdaToughness === undefined)) continue;
    const o = obj(s, id);
    for (const a of [d.cdaPT, d.cdaPower, d.cdaToughness]) {
      if (a === undefined || !readsBattlefield(a)) continue;
      dependent = true;
      sig.push(`${id}:${cdaValue(s, o, a)}`);
    }
  }
  const prev = computing;
  const prevViews = viewCache;
  const prevScan = scan;
  computing = true;
  viewCache = new Map();
  scan = {
    equipped: new Set(
      s.battlefield.flatMap((x) => {
        const e = s.objects[x];
        return e?.attachedTo && s.defs[e.defId]?.subtypes.includes("Equipment") ? [e.attachedTo] : [];
      }),
    ),
    enchanted: enchantedMap(s),
    copying: s.effects.some((e) => e.copyOf) || s.battlefield.some((x) => !!s.objects[x]?.attachedTo && !!staticCopyOf(s, x)),
  };
  try {
    if (previous) {
      const applied = [...previous.fixed];
      for (const slot of previous.dependentSlots) {
        const r = evalStatic(s, slot, sig);
        if (r.entry) applied.push(r.entry);
      }
      applied.sort((a, b) => a.timestamp - b.timestamp);
      return { ...previous, applied, signature: sig.join(","), dependent: true };
    }
    const fixed: Applied[] = s.effects.map((e) => ({ timestamp: e.timestamp, mods: e, affected: e.affected }));
    const applied = [...fixed];
    const dependentSlots: StaticSlot[] = [];
    for (const slot of staticSlots(s, defOfId)) {
      const r = evalStatic(s, slot, sig);
      if (r.dependent) {
        dependent = true;
        dependentSlots.push(slot);
      } else if (r.entry) fixed.push(r.entry);
      if (r.entry) applied.push(r.entry);
    }
    applied.sort((a, b) => a.timestamp - b.timestamp);
    return { applied, fixed, dependentSlots, signature: sig.join(","), dependent };
  } finally {
    computing = prev;
    viewCache = prevViews;
    scan = prevScan;
  }
}

/** Capacités statiques en vigueur : permanents, puis emblèmes (zone de commandement). */
function staticSlots(s: GameState, defOfId: (id: ObjectId) => string): StaticSlot[] {
  // Une source qui perd toutes ses capacités (Witness Protection, effet « perd toutes ses capacités ») n'applique plus
  // les siennes ; approximation de 613.8 à un niveau.
  const lost = new Set<ObjectId>();
  for (const e of s.effects) if (e.loseAllAbilities) for (const id of e.affected) lost.add(id);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!o.attachedTo) continue;
    for (const ab of s.defs[defOfId(id)]?.abilities ?? []) {
      if (ab.kind === "static" && ab.affects === "attached" && ab.mods.loseAllAbilities) lost.add(o.attachedTo);
    }
  }
  const slots: StaticSlot[] = [];
  const emblems = s.playerOrder.flatMap((p) => s.players[p]?.command ?? []);
  for (const id of [...s.battlefield, ...emblems]) {
    if (lost.has(id)) continue;
    const o = obj(s, id);
    const own = o.zone === "battlefield" ? defOfId(id) : o.defId;
    const ownDef = s.defs[own];
    // Salle : capacités de ses portes déverrouillées. Face cachée : aucune capacité statique.
    const printed = o.faceDown
      ? []
      : o.zone === "battlefield" && ownDef?.layout === "split" && ownDef.faceDefs
        ? roomBase(o, ownDef).abilities
        : ownDef
          ? levelAbilities(o, ownDef)
          : [];
    // Statiques accordées par un effet de résolution (Roar of the Fifth People, chapitre II : « gagne “Les
    // créatures que vous contrôlez ont…” »). Une statique accordée par une autre statique n'est pas gérée (613.8).
    // 613.7a : horodatage le plus récent entre l'objet et l'effet qui accorde la capacité.
    const grantedAt = new Map<AbilityDef, number>();
    for (const e of s.effects) {
      if (!e.affected.includes(id)) continue;
      for (const ab of e.addAbilities ?? []) if (ab.kind === "static") grantedAt.set(ab, Math.max(o.timestamp, e.timestamp));
    }
    for (const ab of grantedAt.size ? [...printed, ...grantedAt.keys()] : printed) {
      if (ab.kind === "static") slots.push({ id, ab, ts: grantedAt.get(ab) ?? o.timestamp });
    }
  }
  return slots;
}

/**
 * Évalue une statique : l'effet qu'elle applique (ou aucun si sa condition n'est pas remplie), et si elle dépend des
 * couches (condition ou compte qui lit des permanents). Ajoute à `sig` ce qui en dépend.
 */
function evalStatic(s: GameState, slot: StaticSlot, sig: (string | number)[]): { entry: Applied | null; dependent: boolean } {
  const { id, ab } = slot;
  const o = obj(s, id);
  let dependent = false;
  if (ab.condition) {
    const before = reads;
    const ok = checkCondition(s, ab.condition, o.controller, id);
    // Seule une condition qui lit des permanents dépend des couches (« tant que vous contrôlez un Dragon »).
    if (reads !== before) dependent = true;
    sig.push(ok ? 1 : 0);
    if (!ok) return { entry: null, dependent };
  }
  let mods = ab.mods;
  if (mods.gainLinkedActivated) {
    // Territory Forge : les capacités activées (et de mana) des cartes liées ; Koh : aussi déclenchées, de la carte choisie.
    const g = typeof mods.gainLinkedActivated === "object" ? mods.gainLinkedActivated : {};
    const extra = (o.linked ?? [])
      .filter((c) => s.objects[c]?.zone === "exile")
      .map((c) => s.defs[s.objects[c]?.defId ?? ""])
      .filter((d) => !g.chosenName || (!!d && d.name === o.chosen?.cardName))
      .slice(0, g.chosenName ? 1 : undefined)
      .flatMap((d) => d?.abilities ?? [])
      .filter((a) => a.kind === "activated" || a.kind === "mana" || (g.triggered && a.kind === "triggered"));
    sig.push(`gl${o.chosen?.cardName ?? ""}`);
    mods = { ...mods, gainLinkedActivated: undefined, addAbilities: [...(mods.addAbilities ?? []), ...extra] };
  }
  if (mods.gainActivatedFrom) {
    // Marvin, Murderous Mimic : les capacités activées imprimées des créatures correspondantes qui n'ont pas son nom.
    const f = mods.gainActivatedFrom;
    const name = s.defs[o.defId]?.name;
    const extra = s.battlefield
      .filter((x) => x !== id && matchesView(snapshotBase(s, x), f, o.controller, id))
      .filter((x) => s.defs[s.objects[x]?.defId ?? ""]?.name !== name)
      .flatMap((x) => s.defs[s.objects[x]?.defId ?? ""]?.abilities ?? [])
      .filter((a) => (a.kind === "activated" && !a.specialAction && !a.fromHand && !a.fromGraveyard) || a.kind === "mana");
    mods = { ...mods, gainActivatedFrom: undefined, addAbilities: [...(mods.addAbilities ?? []), ...extra] };
    dependent = true;
    sig.push(`a${extra.length}`);
  }
  if (mods.addBlockRules?.some((r) => r.cantAttackSourceController)) {
    const rules = mods.addBlockRules.map((r) =>
      r.cantAttackSourceController ? { ...r, cantAttackSourceController: undefined, cantAttackPlayer: o.controller } : r,
    );
    mods = { ...mods, addBlockRules: rules };
    sig.push(`ca${o.controller}`);
  }
  if (mods.setColorsChosen) {
    const color = o.chosen?.color;
    mods = { ...mods, setColorsChosen: undefined, setColors: color ? [color] : undefined };
  }
  if (mods.copyLinkedExile) {
    const card = s.linkedExile.find((l) => l.sourceId === id)?.cards.find((c) => s.objects[c]?.zone === "exile");
    const defId = card ? s.objects[card]?.defId : undefined;
    mods = defId ? { ...mods, copyOf: defId, copyLinkedExile: undefined } : { ...mods, copyLinkedExile: undefined };
  }
  if (ab.perSpeed || ab.perLife || ab.perHand || ab.perTurnEvents) {
    const pl = s.players[o.controller];
    const n = ab.perTurnEvents
      ? countTurnEvents(s, ab.perTurnEvents, o.controller)
      : ab.perSpeed
        ? (pl?.speed ?? 0)
        : ab.perHand
          ? (pl?.hand.length ?? 0)
          : Math.max(0, pl?.life ?? 0);
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
    // Aettir and Priwen : « F/E de base X/X, où X est votre total de points de vie ».
    if (mods.setPower !== undefined) mods = { ...mods, setPower: mods.setPower * n };
    if (mods.setToughness !== undefined) mods = { ...mods, setToughness: mods.setToughness * n };
  } else if (ab.perAmount !== undefined) {
    // Earthen Ally : « +1/+0 pour chaque couleur parmi les Alliés que vous contrôlez » (calculé comme une F/E de CDA).
    const n = cdaValue(s, o, ab.perAmount);
    if (readsBattlefield(ab.perAmount)) {
      dependent = true;
      sig.push(`a${n}`);
    }
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
  } else if (ab.per || ab.perCounter || ab.perGraveyard) {
    // « +1/+1 pour chaque Forêt » / « pour chaque marqueur de camaraderie » / « pour chaque carte de créature de votre cimetière ».
    const f = ab.per ? withChosen(ab.per, o) : null;
    const g = ab.perGraveyard;
    const raw = g
      ? (s.players[o.controller]?.graveyard ?? []).filter((x) => matchesView(snapshotBase(s, x), g, o.controller, id)).length
      : f
        ? s.battlefield.filter((x) => matchesView(snapshotBase(s, x), f, o.controller, id)).length
        : (o.counters[ab.perCounter as string] ?? 0);
    const n = ab.perDivisor ? Math.floor(raw / ab.perDivisor) : raw;
    if (f) {
      dependent = true;
      sig.push(`n${n}`);
    }
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
    // Porcelain Gallery : « F/E de base égales au nombre de créatures que vous contrôlez ».
    if (mods.setPower !== undefined) mods = { ...mods, setPower: mods.setPower * n };
    if (mods.setToughness !== undefined) mods = { ...mods, setToughness: mods.setToughness * n };
  }
  const affects = typeof ab.affects === "string" ? ab.affects : withChosen(ab.affects, o);
  if (mods.addChosenSubtype && o.chosen?.creatureType) {
    mods = { ...mods, addSubtypes: [...(mods.addSubtypes ?? []), o.chosen.creatureType] };
  }
  if (mods.addChosenLandType && o.chosen?.landType) {
    mods = { ...mods, addSubtypes: [...(mods.addSubtypes ?? []), o.chosen.landType] };
  }
  return {
    entry: { timestamp: slot.ts, mods, affected: { sourceId: id, controller: o.controller, filter: affects } },
    dependent,
  };
}

/** Applique les couches 1 et 4 à 7 aux objets du champ de bataille. */
function applyLayers(s: GameState, applied: Applied[], defOfId: (id: ObjectId) => string): Map<ObjectId, Characteristics> {
  const out = new Map<ObjectId, Characteristics>();
  const attacking = new Set(s.combat?.attackers.map((a) => a.id) ?? []);
  // Couche 1 : copie (valeurs copiables de la définition copiée).
  for (const id of s.battlefield) out.set(id, base(s, obj(s, id), defOfId(id)));

  const targets = (a: Applied): ObjectId[] => {
    if (Array.isArray(a.affected)) return a.affected.filter((id) => out.has(id));
    const { sourceId, controller, filter } = a.affected;
    if (filter === "self") return out.has(sourceId) ? [sourceId] : [];
    if (filter === "attached") {
      const host = obj(s, sourceId).attachedTo;
      return host && out.has(host) ? [host] : [];
    }
    const ids: ObjectId[] = [];
    for (const [id, c] of out) {
      if (matchesView(view(s, id, c, obj(s, id), attacking.has(id)), filter, controller, sourceId)) ids.push(id);
    }
    return ids;
  };
  // Les ensembles des capacités statiques sont déterminés au moment où leur couche s'applique (613.6) :
  // on les fige à la première couche où l'effet agit.
  const fixed = new Map<Applied, ObjectId[]>();
  const affectedBy = (a: Applied) => {
    let ids = fixed.get(a);
    if (!ids) {
      ids = targets(a);
      fixed.set(a, ids);
    }
    return ids;
  };
  const layer = (has: (m: LayerMods) => boolean, apply: (c: Characteristics, m: LayerMods) => void) => {
    for (const a of applied) if (has(a.mods)) for (const id of affectedBy(a)) apply(out.get(id) as Characteristics, a.mods);
  };

  // Couche 4 : types (et nom, pour Witness Protection).
  layer(
    (m) =>
      !!(
        m.addTypes ||
        m.addSubtypes ||
        m.setTypes ||
        m.setSubtypes ||
        m.setName ||
        m.allCreatureTypes ||
        m.addSupertypes ||
        m.removeSupertypes
      ),
    (c, m) => {
      if (m.setTypes) {
        c.types = [...m.setTypes];
        c.subtypes = [...(m.setSubtypes ?? [])];
      } else if (m.setSubtypes) c.subtypes = [...m.setSubtypes];
      if (m.setName) c.name = m.setName;
      for (const t of m.addSupertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      if (m.removeSupertypes?.length) c.supertypes = c.supertypes.filter((t) => !m.removeSupertypes?.includes(t));
      if (m.allCreatureTypes && !c.subtypes.includes(ALL_CREATURE_TYPES)) c.subtypes.push(ALL_CREATURE_TYPES);
      for (const t of m.addTypes ?? []) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.addSubtypes ?? []) if (!c.subtypes.includes(t)) c.subtypes.push(t);
    },
  );
  // Couche 5 : couleurs, remplacées ou ajoutées (« en plus de ses autres couleurs »).
  layer(
    (m) => !!(m.setColors || m.addColors),
    (c, m) => {
      if (m.setColors) c.colors = [...m.setColors];
      for (const k of m.addColors ?? []) if (!c.colors.includes(k)) c.colors.push(k);
    },
  );
  // Couche 6 : capacités.
  layer(
    (m) =>
      !!(
        m.addKeywords?.length ||
        m.removeKeywords?.length ||
        m.loseAllAbilities ||
        m.addAbilities?.length ||
        m.addBlockRules?.length ||
        m.addProtections?.length ||
        m.addPowerRules?.length
      ),
    (c, m) => {
      if (m.loseAllAbilities) {
        c.keywords = [];
        c.abilities = [];
        c.blockRules = [];
        c.protections = [];
        c.powerRules = [];
      }
      if (m.addPowerRules?.length) c.powerRules = [...c.powerRules, ...m.addPowerRules];
      if (m.addBlockRules?.length) c.blockRules = [...c.blockRules, ...m.addBlockRules];
      if (m.addProtections?.length) c.protections = [...c.protections, ...m.addProtections];
      for (const k of m.removeKeywords ?? []) c.keywords = c.keywords.filter((x) => x !== k);
      for (const k of m.addKeywords ?? []) if (!c.keywords.includes(k)) c.keywords.push(k);
      if (m.addAbilities?.length) c.abilities = [...c.abilities, ...m.addAbilities];
    },
  );
  // 122.1b : marqueurs de capacité (vol, lien de vie, contact mortel…), appliqués après les autres effets de couche 6.
  for (const [id, c] of out) {
    for (const [kind, n] of Object.entries(obj(s, id).counters)) {
      const k = KEYWORD_COUNTERS[kind];
      if (k && n > 0 && !c.keywords.includes(k)) c.keywords.push(k);
    }
    // 701.60c : un permanent suspect a la menace et « ne peut pas bloquer » tant qu'il est suspect.
    if (obj(s, id).suspected) for (const k of ["menace", "cantBlock"] as const) if (!c.keywords.includes(k)) c.keywords.push(k);
    // 702.108 : une prouesse accordée (Bria) ou portée par un jeton (Loutre) a sa capacité déclenchée.
    if (c.keywords.includes("prowess") && !c.abilities.some((ab) => ab.kind === "triggered" && ab.label === "Prouesse")) {
      c.abilities = [...c.abilities, PROWESS];
    }
    // 702.147 : la décomposition (imprimée, accordée ou par un marqueur) a sa capacité déclenchée.
    if (c.keywords.includes("decayed") && !c.abilities.includes(DECAYED)) c.abilities = [...c.abilities, DECAYED];
  }
  // Couche 7b : F/E fixées.
  layer(
    (m) => m.setPower !== undefined || m.setToughness !== undefined,
    (c, m) => {
      if (m.setPower !== undefined) c.power = m.setPower;
      if (m.setToughness !== undefined) c.toughness = m.setToughness;
    },
  );
  // Couche 7c : marqueurs, puis modifications (tout est additif : l'ordre n'importe pas).
  for (const [id, c] of out) {
    const o = obj(s, id);
    c.basePower = c.power;
    c.power += counterPT(o);
    c.toughness += counterPT(o);
  }
  layer(
    (m) => !!(m.power || m.toughness),
    (c, m) => {
      // Diligent Zookeeper : multiplié par le nombre de types de créature de l'objet touché (changelin : tous).
      const k =
        m.perOwnCreatureTypes === undefined
          ? 1
          : Math.min(m.perOwnCreatureTypes, c.keywords.includes("changeling") ? m.perOwnCreatureTypes : c.subtypes.length);
      c.power += (m.power ?? 0) * k;
      c.toughness += (m.toughness ?? 0) * k;
    },
  );
  // Couche 7d : échange.
  layer(
    (m) => !!m.switchPT,
    (c) => {
      [c.power, c.toughness] = [c.toughness, c.power];
    },
  );
  return out;
}

/** Prouesse (702.108) : « chaque fois que vous lancez un sort non-créature, cette créature gagne +1/+1 jusqu'à la fin du tour ». */
const PROWESS: AbilityDef = {
  kind: "triggered",
  trigger: { on: "castSpell", by: "you", filter: { notTypes: ["Creature"] } },
  targets: [],
  effects: [{ op: "pump", what: { kind: "self" }, power: 1, toughness: 1 }],
  label: "Prouesse",
};

/** Décomposition (702.147b) : « quand cette créature attaque, sacrifiez-la à la fin du combat ». */
const DECAYED: AbilityDef = {
  kind: "triggered",
  trigger: { on: "attacks", who: "self" },
  targets: [],
  effects: [
    {
      op: "delayed",
      at: "endOfCombat",
      effects: [{ op: "sacrificeIt", what: { kind: "target", id: "d" } }],
      bind: { d: { kind: "self" } },
    },
  ],
  label: "Décomposition",
};

function battlefieldChars(s: GameState): Map<ObjectId, Characteristics> {
  const key = `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.map;
  const map = computeBattlefield(s);
  cache.set(s, { key, map });
  return map;
}

export function chars(s: GameState, id: ObjectId): Characteristics {
  const o = obj(s, id);
  // Pendant le calcul (conditions des capacités statiques), on lit la passe précédente, sinon les caractéristiques de base.
  if (o.zone !== "battlefield" || computing) {
    if (computing && o.zone === "battlefield") reads++;
    return provisional?.get(id) ?? base(s, o, o.faceDefId ?? o.defId);
  }
  return battlefieldChars(s).get(id) ?? base(s, o);
}

/**
 * Force qui compte pour un usage (famille R4.3) : blessures de combat, équipage et selle, station. Valeur absolue, puis
 * endurance, puis bonus.
 */
export function effectivePower(
  c: Pick<Characteristics, "power" | "toughness"> & { powerRules?: PowerRule[] },
  use: PowerRule["uses"][number],
): number {
  const rules = (c.powerRules ?? []).filter((r) => r.uses.includes(use));
  let power = c.power;
  if (power < 0 && rules.some((r) => r.absolute)) power = -power;
  if (rules.some((r) => r.toughness === "always")) power = c.toughness;
  else if (rules.some((r) => r.toughness === "ifGreater") && c.toughness > power) power = c.toughness;
  return power + rules.reduce((n, r) => n + (r.bonus ?? 0), 0);
}

export function hasType(s: GameState, id: ObjectId, t: CardType): boolean {
  return chars(s, id).types.includes(t);
}

export function hasKeyword(s: GameState, id: ObjectId, k: Keyword): boolean {
  return chars(s, id).keywords.includes(k);
}

export function isCreature(s: GameState, id: ObjectId): boolean {
  return hasType(s, id, "Creature");
}

/**
 * Mal d'invocation (302.6) : une créature ne peut attaquer ni utiliser {T} que si son contrôleur
 * la contrôle sans interruption depuis le début de son tour le plus récent.
 */
export function isSummoningSick(s: GameState, id: ObjectId): boolean {
  const o = obj(s, id);
  if (!isCreature(s, id) || hasKeyword(s, id, "haste")) return false;
  const recent = s.players[o.controller]?.lastTurnStarted ?? 0;
  return !(recent >= 1 && o.controlledSince < recent);
}

export function creaturesControlledBy(s: GameState, p: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => obj(s, id).controller === p && isCreature(s, id));
}

/** Instantané des caractéristiques actuelles d'un objet (dernières informations connues). */
export function snapshot(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  const c = chars(s, id);
  return {
    ...view(s, id, c, o, !!s.combat?.attackers.some((a) => a.id === id)),
    abilities: c.abilities,
    counters: { ...o.counters },
    // Choix fait en arrivant (type, couleur…) : lu par « du type choisi » même après son départ (dernière information).
    ...(o.chosen ? { chosen: { ...o.chosen } } : {}),
  };
}
