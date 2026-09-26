/**
 * Mise en page du champ de bataille (inspirée de MTGA), sans React :
 * - rangée de devant : créatures, puis planeswalkers et batailles ;
 * - rangée arrière : terrains en piles à gauche, artefacts et enchantements non-créatures à droite ;
 * - jetons identiques regroupés en piles « ×N » à partir de TOKEN_GROUP_MIN ;
 * - une rangée passe sur 2 lignes (ou plus dans les zones étroites) quand cela permet des cartes plus grandes,
 *   puis les cartes rétrécissent.
 */
import type { ObjectView } from "@mtgx/engine";

export const CARD_RATIO = 1.395;
/** Taille de la rangée arrière (terrains, artefacts, enchantements) par rapport aux créatures. */
export const LAND_SCALE = 0.72;
/** Recouvrement des terrains identiques empilés (voir .perm-group.pile). */
const LAND_OVERLAP = 0.74;
/** Décalage de chaque carte visible derrière une pile de jetons (voir .token-stack). */
export const TOKEN_OFFSET = 0.08;
/** Cartes montrées derrière la carte du dessus d'une pile de jetons. */
export const TOKEN_SHADOWS = 2;
/** Nombre de jetons identiques à partir duquel ils sont regroupés (« plus de 3 »). */
export const TOKEN_GROUP_MIN = 4;
/** Part de la hauteur d'une carte qui dépasse au-dessus de son hôte, par Aura ou Équipement attaché. */
export const ATTACH_PEEK = 0.2;
/** Plancher absolu : en dessous, la zone défile (overflow-y) plutôt que de rétrécir encore. */
export const MIN_W = 28;
const MAX_W = 160;
/** Espacements en pixels (doivent correspondre à styles.css). */
export const GAP = 10;
export const SEPARATOR = 28;
const PAD_X = 28;
const LINE_GAP = 6;
/** Lignes au plus par rangée : 2 suffisent en duel, davantage sert dans les zones étroites du multijoueur. */
const MAX_FRONT_LINES = 4;
const MAX_BACK_LINES = 3;
/** Hauteur fixe : marges verticales, avancée des attaquants, écart entre rangées. */
const FIXED_H = 40;

export interface Rows {
  creatures: ObjectView[];
  /** Planeswalkers et batailles non-créatures (attaquables) : au bout de la rangée de devant. */
  walkers: ObjectView[];
  lands: ObjectView[];
  /** Artefacts, enchantements et autres permanents non-créatures, non-terrains. */
  support: ObjectView[];
}

/** Répartit les permanents par rangée d'après leurs types courants (couches comprises). */
export function battlefieldRows(perms: ObjectView[]): Rows {
  const rows: Rows = { creatures: [], walkers: [], lands: [], support: [] };
  for (const o of perms) {
    if (o.types.includes("Creature")) rows.creatures.push(o);
    else if (o.types.includes("Planeswalker") || o.types.includes("Battle")) rows.walkers.push(o);
    else if (o.types.includes("Land")) rows.lands.push(o);
    else rows.support.push(o);
  }
  return rows;
}

/** Un emplacement de la rangée : carte seule, pile de terrains ou pile de jetons. */
export interface Slot {
  kind: "single" | "pile" | "tokens";
  objs: ObjectView[];
  /** Bloc de la rangée arrière (séparés par un espace plus large). */
  block?: "lands" | "support";
}

function grouped(objs: ObjectView[], keyOf: (o: ObjectView) => string | null): ObjectView[][] {
  const groups: ObjectView[][] = [];
  const byKey = new Map<string, ObjectView[]>();
  for (const o of objs) {
    const key = keyOf(o);
    let g = key === null ? undefined : byKey.get(key);
    if (!g) {
      g = [];
      if (key !== null) byKey.set(key, g);
      groups.push(g);
    }
    g.push(o);
  }
  return groups;
}

/** Terrains identiques regroupés en piles (même définition, même état engagé) ; ceux de `solo` restent seuls. */
export function landGroups(lands: ObjectView[], solo?: ReadonlySet<string>): ObjectView[][] {
  return grouped(lands, (o) => (solo?.has(o.id) ? null : `${o.defId}|${o.tapped}`));
}

/** Ce qui distingue deux jetons à l'écran et pour les décisions (état, F/E, marqueurs, capacités). */
export function tokenKey(o: ObjectView): string {
  const counters = Object.entries(o.counters)
    .filter(([, n]) => n)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    o.defId,
    o.name,
    o.controller,
    o.tapped,
    o.sick,
    o.attacking,
    o.blocking,
    o.power,
    o.toughness,
    o.damage,
    counters,
    [...o.keywords].sort(),
    o.types,
    o.chosen,
  ]);
}

/**
 * Jetons identiques regroupés quand ils sont au moins TOKEN_GROUP_MIN ; les autres permanents
 * (et les jetons de `solo`, qui portent des attachements) restent seuls. L'ordre d'origine est conservé.
 * `extraKey` ajoute l'état propre à l'interface (lueur, attaquant choisi…) : deux jetons dans des états
 * différents ne sont jamais regroupés.
 */
export function tokenSlots(
  objs: ObjectView[],
  solo?: ReadonlySet<string>,
  extraKey: (o: ObjectView) => string = () => "",
): Slot[] {
  const groups = grouped(objs, (o) => (o.isToken && !solo?.has(o.id) ? `${tokenKey(o)}|${extraKey(o)}` : null));
  const out: Slot[] = [];
  for (const g of groups) {
    if (g.length >= TOKEN_GROUP_MIN) out.push({ kind: "tokens", objs: g });
    else for (const o of g) out.push({ kind: "single", objs: [o] });
  }
  return out;
}

/** Emplacements de la rangée de devant et de la rangée arrière. */
export function battlefieldSlots(
  rows: Rows,
  solo?: ReadonlySet<string>,
  extraKey?: (o: ObjectView) => string,
): { front: Slot[]; back: Slot[] } {
  const front = [
    ...tokenSlots(rows.creatures, solo, extraKey),
    ...rows.walkers.map((o): Slot => ({ kind: "single", objs: [o] })),
  ];
  const back = [
    ...landGroups(rows.lands, solo).map((g): Slot => ({ kind: g.length > 1 ? "pile" : "single", objs: g, block: "lands" })),
    ...tokenSlots(rows.support, solo, extraKey).map((s): Slot => ({ ...s, block: "support" })),
  ];
  return { front, back };
}

/** Largeur d'un emplacement, en largeurs de carte (une carte engagée occupe sa hauteur). */
export function slotUnits(s: Slot): number {
  const first = s.objs[0];
  const slot = first?.tapped ? CARD_RATIO : 1;
  if (s.kind === "pile") return slot + (s.objs.length - 1) * (slot - LAND_OVERLAP);
  if (s.kind === "tokens") return slot + TOKEN_OFFSET * Math.min(TOKEN_SHADOWS, s.objs.length - 1);
  return slot;
}

/** Largeur maximale de carte pour qu'une ligne tienne dans `avail` pixels. */
function lineFit(line: Slot[], avail: number, scale: number): number {
  if (!line.length) return MAX_W;
  const units = line.reduce((a, s) => a + slotUnits(s), 0);
  const blocks = new Set(line.map((s) => s.block)).size;
  const fixed = GAP * (line.length - 1) + (blocks > 1 ? SEPARATOR - GAP : 0);
  return (avail - fixed) / (units * scale);
}

/**
 * Découpe une rangée en `n` lignes consécutives (ordre conservé), en minimisant la largeur de la ligne
 * la plus chargée (partition linéaire, programmation dynamique : les rangées sont courtes).
 */
export function splitLines(slots: Slot[], n: number): Slot[][] {
  const k = Math.min(n, slots.length);
  if (k <= 1) return [slots];
  const units = slots.map(slotUnits);
  const prefix = [0];
  for (const u of units) prefix.push((prefix[prefix.length - 1] as number) + u);
  const sum = (i: number, j: number) => (prefix[j] as number) - (prefix[i] as number);
  // cost[l][j] : meilleure charge maximale pour les j premiers emplacements en l lignes ; cut : début de la dernière ligne.
  const len = slots.length;
  const cost = Array.from({ length: k + 1 }, () => Array<number>(len + 1).fill(Number.POSITIVE_INFINITY));
  const cut = Array.from({ length: k + 1 }, () => Array<number>(len + 1).fill(0));
  for (let j = 1; j <= len; j++) (cost[1] as number[])[j] = sum(0, j);
  for (let l = 2; l <= k; l++) {
    for (let j = l; j <= len; j++) {
      for (let i = l - 1; i < j; i++) {
        const c = Math.max((cost[l - 1] as number[])[i] as number, sum(i, j));
        if (c < ((cost[l] as number[])[j] as number)) {
          (cost[l] as number[])[j] = c;
          (cut[l] as number[])[j] = i;
        }
      }
    }
  }
  const lines: Slot[][] = [];
  let j = len;
  for (let l = k; l >= 1; l--) {
    const i = l === 1 ? 0 : ((cut[l] as number[])[j] as number);
    lines.unshift(slots.slice(i, j));
    j = i;
  }
  return lines;
}

export interface BattlefieldFit {
  cardW: number;
  frontLines: number;
  backLines: number;
}

/**
 * Taille des cartes et nombre de lignes par rangée pour une zone de `width` × `height` pixels :
 * la combinaison qui donne les plus grandes cartes, à 2 px près en faveur de moins de lignes.
 */
export function fitBattlefield(
  width: number,
  height: number,
  front: Slot[],
  back: Slot[],
  /** Nombre maximal d'Auras et d'Équipements attachés à une même carte. */
  attachDepth = 0,
): BattlefieldFit {
  const avail = width - PAD_X;
  let best: { raw: number; frontLines: number; backLines: number } | undefined;
  // Moins de lignes d'abord : une ligne de plus doit faire gagner plus de 2 px.
  const combos: [number, number][] = [];
  for (let f = 1; f <= MAX_FRONT_LINES; f++) for (let b = 1; b <= MAX_BACK_LINES; b++) combos.push([f, b]);
  combos.sort((x, y) => x[0] + x[1] - (y[0] + y[1]));
  for (const [f, b] of combos) {
    if ((f > 1 && front.length < f) || (b > 1 && back.length < b)) continue;
    const peek = 1 + ATTACH_PEEK * attachDepth;
    const byHeight = (height - FIXED_H - LINE_GAP * (f - 1 + b - 1)) / (CARD_RATIO * peek * (f + b * LAND_SCALE));
    const byFront = Math.min(...splitLines(front, f).map((l) => lineFit(l, avail, 1)));
    const byBack = Math.min(...splitLines(back, b).map((l) => lineFit(l, avail, LAND_SCALE)));
    // Comparaison avant le plancher MIN_W : sous ce seuil, on garde l'option qui déborde le moins.
    const raw = Math.min(MAX_W, byHeight, byFront, byBack);
    if (!best || raw > best.raw + 2) best = { raw, frontLines: f, backLines: b };
  }
  if (!best) return { cardW: MAX_W, frontLines: 1, backLines: 1 };
  return { cardW: Math.floor(Math.max(MIN_W, best.raw)), frontLines: best.frontLines, backLines: best.backLines };
}

/** Élément du plateau qui représente un objet (carte seule, ou pile de jetons qui le contient). */
export function findObjectEl(id: string): Element | null {
  const esc = CSS.escape(id);
  return document.querySelector(`[data-oid="${esc}"]`) ?? document.querySelector(`[data-oids~="${esc}"]`);
}
