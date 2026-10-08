/**
 * Color identity (903.4, Commander, PLAN-E): the card's colors (color indicator and color-defining abilities included,
 * from the imported colors), plus those of the mana symbols of its cost and of its rules text (reminder text excluded;
 * hybrid and Phyrexian symbols included), on all its faces (903.4d), plus those of the basic land types of its type
 * line (the Triomes and typed dual lands: Scryfall counts them too). Pure, cached per definition.
 */
import type { CardDef } from "./model/cards";
import type { Color } from "./types";

const ORDER: readonly Color[] = ["W", "U", "B", "R", "G"];
const LAND_TYPE_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const cache = new WeakMap<CardDef, Color[]>();

/** Colors of the mana symbols of a text (`{W}`, `{2/U}`, `{B/P}`, `{G/U/P}`; `{C}`, `{X}`, `{T}` ignored). */
function symbolColors(text: string, out: Set<Color>): void {
  for (const m of text.matchAll(/\{([^}]+)\}/g))
    for (const part of (m[1] as string).split("/")) if ((ORDER as string[]).includes(part)) out.add(part as Color);
}

function addFace(def: Pick<CardDef, "colors" | "manaCostText" | "text" | "subtypes">, out: Set<Color>): void {
  for (const c of def.colors ?? []) out.add(c);
  symbolColors(def.manaCostText ?? "", out);
  // Reminder text (in parentheses) excluded: it is not part of the rules text.
  symbolColors((def.text ?? "").replace(/\([^)]*\)/g, ""), out);
  for (const t of def.subtypes ?? []) {
    const c = LAND_TYPE_COLOR[t];
    if (c) out.add(c);
  }
}

/** Color identity of a card, in WUBRG order. */
export function colorIdentity(def: CardDef): Color[] {
  const known = cache.get(def);
  if (known) return known;
  const out = new Set<Color>();
  addFace(def, out);
  for (const f of def.faceDefs ?? []) addFace(f, out);
  if (def.prepareFace) {
    symbolColors(def.prepareFace.manaCost, out);
    symbolColors(def.prepareFace.text.replace(/\([^)]*\)/g, ""), out);
  }
  const result = ORDER.filter((c) => out.has(c));
  cache.set(def, result);
  return result;
}

/** Is the identity `inner` contained in `outer`? */
export function withinIdentity(inner: readonly Color[], outer: readonly Color[]): boolean {
  return inner.every((c) => outer.includes(c));
}
