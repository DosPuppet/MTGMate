/**
 * Extensions couvertes : données Scryfall (data/<set>.json) et scripts des cartes.
 * L'ordre compte : une réimpression (même nom) garde la définition de la première extension.
 */
import type { CardDef, CardScript } from "@mtgx/engine";
import fdnData from "../data/fdn.json";
import fraData from "../data/fra.json";
import { FDN_SCRIPTS } from "./fdn/index";
import { FRA_SCRIPTS } from "./fra/index";
import type { RawCard } from "./scryfall";

export interface CardSet {
  code: string;
  name: string;
  nameFr: string;
  /** Dernier numéro de collection du set principal (au-delà : réimpressions, cartes spéciales). */
  mainMax: number;
  data: RawCard[];
  scripts: Record<string, CardScript>;
}

export const SETS: CardSet[] = [
  { code: "FDN", name: "Foundations", nameFr: "Fondations", mainMax: 281, data: fdnData as RawCard[], scripts: FDN_SCRIPTS },
  {
    code: "FRA",
    name: "Reality Fracture",
    nameFr: "Réalité fracturée",
    mainMax: 289,
    data: fraData as RawCard[],
    scripts: FRA_SCRIPTS,
  },
];

export const SET_BY_CODE: Record<string, CardSet> = Object.fromEntries(SETS.map((s) => [s.code, s]));

/** Carte du set principal de son extension (numéro de collection jusqu'à `mainMax`, terrains de base compris). */
export function isMainSet(c: CardDef): boolean {
  const set = c.set ? SET_BY_CODE[c.set] : undefined;
  return !c.isToken && !!set && Number.parseInt(c.number ?? "999", 10) <= set.mainMax;
}
