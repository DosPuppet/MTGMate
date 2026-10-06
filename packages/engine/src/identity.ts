/**
 * Identité de couleur (903.4, Commander, PLAN-E) : les couleurs de la carte (indicateur de couleur et capacités qui
 * définissent sa couleur compris, d'après les couleurs importées), plus celles des symboles de mana de son coût et de son
 * texte de règles (texte de rappel exclu ; symboles hybrides et phyrexians compris), sur toutes ses faces (903.4d), plus
 * celles des types de terrain de base de sa ligne de type (les Triomes et terrains doubles à types : Scryfall les compte
 * aussi). Pure, mise en cache par définition.
 */
import type { CardDef } from "./model/cards";
import type { Color } from "./types";

const ORDER: readonly Color[] = ["W", "U", "B", "R", "G"];
const LAND_TYPE_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const cache = new WeakMap<CardDef, Color[]>();

/** Couleurs des symboles de mana d'un texte (`{W}`, `{2/U}`, `{B/P}`, `{G/U/P}` ; `{C}`, `{X}`, `{T}` ignorés). */
function symbolColors(text: string, out: Set<Color>): void {
  for (const m of text.matchAll(/\{([^}]+)\}/g))
    for (const part of (m[1] as string).split("/")) if ((ORDER as string[]).includes(part)) out.add(part as Color);
}

function addFace(def: Pick<CardDef, "colors" | "manaCostText" | "text" | "subtypes">, out: Set<Color>): void {
  for (const c of def.colors ?? []) out.add(c);
  symbolColors(def.manaCostText ?? "", out);
  // Texte de rappel (entre parenthèses) exclu : il ne fait pas partie du texte de règles.
  symbolColors((def.text ?? "").replace(/\([^)]*\)/g, ""), out);
  for (const t of def.subtypes ?? []) {
    const c = LAND_TYPE_COLOR[t];
    if (c) out.add(c);
  }
}

/** Identité de couleur d'une carte, dans l'ordre WUBRG. */
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

/** L'identité `inner` est-elle comprise dans `outer` ? */
export function withinIdentity(inner: readonly Color[], outer: readonly Color[]): boolean {
  return inner.every((c) => outer.includes(c));
}
