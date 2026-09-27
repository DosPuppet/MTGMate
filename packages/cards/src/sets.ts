/**
 * Extensions couvertes : données Scryfall (data/<set>.json) et scripts des cartes.
 * L'ordre compte : une réimpression (même nom) garde la définition de la première extension.
 */
import type { CardDef, CardScript } from "@mtgx/engine";
import bigData from "../data/big.json";
import blbData from "../data/blb.json";
import dftData from "../data/dft.json";
import dskData from "../data/dsk.json";
import eclData from "../data/ecl.json";
import eoeData from "../data/eoe.json";
import fdnData from "../data/fdn.json";
import finData from "../data/fin.json";
import fraData from "../data/fra.json";
import hobData from "../data/hob.json";
import lciData from "../data/lci.json";
import mkmData from "../data/mkm.json";
import mshData from "../data/msh.json";
import otjData from "../data/otj.json";
import sosData from "../data/sos.json";
import spmData from "../data/spm.json";
import tdmData from "../data/tdm.json";
import tlaData from "../data/tla.json";
import tmtData from "../data/tmt.json";
import woeData from "../data/woe.json";
import { BIG_SCRIPTS } from "./big/index";
import { DFT_SCRIPTS } from "./dft/index";
import { EOE_SCRIPTS } from "./eoe/index";
import { FDN_SCRIPTS } from "./fdn/index";
import { FRA_SCRIPTS } from "./fra/index";
import { OTJ_SCRIPTS } from "./otj/index";
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
  // Branche Standard : extensions importées (lot 0.2), scripts ajoutés set par set (phase 1).
  {
    code: "EOE",
    name: "Edge of Eternities",
    nameFr: "Aux confins de l'éternité",
    mainMax: 276,
    data: eoeData as RawCard[],
    scripts: EOE_SCRIPTS,
  },
  { code: "DFT", name: "Aetherdrift", nameFr: "Aetherdrift", mainMax: 291, data: dftData as RawCard[], scripts: DFT_SCRIPTS },
  {
    code: "OTJ",
    name: "Outlaws of Thunder Junction",
    nameFr: "Les hors-la-loi de Croisetonnerre",
    mainMax: 286,
    data: otjData as RawCard[],
    scripts: OTJ_SCRIPTS,
  },
  { code: "BIG", name: "The Big Score", nameFr: "Le gros coup", mainMax: 30, data: bigData as RawCard[], scripts: BIG_SCRIPTS },
  { code: "BLB", name: "Bloomburrow", nameFr: "Bloomburrow", mainMax: 281, data: blbData as RawCard[], scripts: {} },
  {
    code: "TDM",
    name: "Tarkir: Dragonstorm",
    nameFr: "Tarkir : Tempête draconique",
    mainMax: 291,
    data: tdmData as RawCard[],
    scripts: {},
  },
  {
    code: "WOE",
    name: "Wilds of Eldraine",
    nameFr: "Les friches d'Eldraine",
    mainMax: 276,
    data: woeData as RawCard[],
    scripts: {},
  },
  {
    code: "SOS",
    name: "Secrets of Strixhaven",
    nameFr: "Secrets de Strixhaven",
    mainMax: 362,
    data: sosData as RawCard[],
    scripts: {},
  },
  { code: "ECL", name: "Lorwyn Eclipsed", nameFr: "Lorwyn éclipsé", mainMax: 401, data: eclData as RawCard[], scripts: {} },
  {
    code: "TLA",
    name: "Avatar: The Last Airbender",
    nameFr: "Avatar : le dernier maître de l'air",
    mainMax: 286,
    data: tlaData as RawCard[],
    scripts: {},
  },
  {
    code: "SPM",
    name: "Marvel's Spider-Man",
    nameFr: "Marvel's Spider-Man",
    mainMax: 198,
    data: spmData as RawCard[],
    scripts: {},
  },
  {
    code: "MSH",
    name: "Marvel Super Heroes",
    nameFr: "Marvel Super Heroes",
    mainMax: 429,
    data: mshData as RawCard[],
    scripts: {},
  },
  {
    code: "TMT",
    name: "Teenage Mutant Ninja Turtles",
    nameFr: "Les Tortues Ninja",
    mainMax: 319,
    data: tmtData as RawCard[],
    scripts: {},
  },
  { code: "HOB", name: "The Hobbit", nameFr: "Le Hobbit", mainMax: 320, data: hobData as RawCard[], scripts: {} },
  {
    code: "MKM",
    name: "Murders at Karlov Manor",
    nameFr: "Meurtres au manoir Karlov",
    mainMax: 286,
    data: mkmData as RawCard[],
    scripts: {},
  },
  {
    code: "DSK",
    name: "Duskmourn: House of Horror",
    nameFr: "Duskmourn : la Maison de l'horreur",
    mainMax: 301,
    data: dskData as RawCard[],
    scripts: {},
  },
  {
    code: "LCI",
    name: "The Lost Caverns of Ixalan",
    nameFr: "Les cavernes oubliées d'Ixalan",
    mainMax: 291,
    data: lciData as RawCard[],
    scripts: {},
  },
  { code: "FIN", name: "Final Fantasy", nameFr: "Final Fantasy", mainMax: 309, data: finData as RawCard[], scripts: {} },
];

export const SET_BY_CODE: Record<string, CardSet> = Object.fromEntries(SETS.map((s) => [s.code, s]));

/** Carte du set principal de son extension (numéro de collection jusqu'à `mainMax`, terrains de base compris). */
export function isMainSet(c: CardDef): boolean {
  const set = c.set ? SET_BY_CODE[c.set] : undefined;
  return !c.isToken && !!set && Number.parseInt(c.number ?? "999", 10) <= set.mainMax;
}
