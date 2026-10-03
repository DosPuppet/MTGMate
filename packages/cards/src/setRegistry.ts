/**
 * Registre des extensions couvertes (PLAN-C, C19) : code, noms et dernier numéro du set principal, sans les données.
 * Seule liste des extensions : `sets.ts` y joint données et scripts ; les outils d'import (`tools/import-scryfall.ts`,
 * `tools/import-tokens.ts`) la lisent sans charger les cartes. L'ordre compte : une réimpression (même nom) garde la
 * définition de la première extension.
 */
export interface SetInfo {
  code: string;
  name: string;
  nameFr: string;
  /** Dernier numéro de collection du set principal (au-delà : réimpressions, cartes spéciales). */
  mainMax: number;
}

export const SET_INFO: readonly SetInfo[] = [
  { code: "FDN", name: "Foundations", nameFr: "Fondations", mainMax: 281 },
  { code: "FRA", name: "Reality Fracture", nameFr: "Réalité fracturée", mainMax: 289 },
  { code: "EOE", name: "Edge of Eternities", nameFr: "Aux confins de l'éternité", mainMax: 276 },
  { code: "DFT", name: "Aetherdrift", nameFr: "Aetherdrift", mainMax: 291 },
  { code: "OTJ", name: "Outlaws of Thunder Junction", nameFr: "Les hors-la-loi de Croisetonnerre", mainMax: 286 },
  { code: "BIG", name: "The Big Score", nameFr: "Le gros coup", mainMax: 30 },
  { code: "BLB", name: "Bloomburrow", nameFr: "Bloomburrow", mainMax: 281 },
  { code: "TDM", name: "Tarkir: Dragonstorm", nameFr: "Tarkir : Tempête draconique", mainMax: 291 },
  { code: "WOE", name: "Wilds of Eldraine", nameFr: "Les friches d'Eldraine", mainMax: 276 },
  { code: "SOS", name: "Secrets of Strixhaven", nameFr: "Secrets de Strixhaven", mainMax: 362 },
  { code: "ECL", name: "Lorwyn Eclipsed", nameFr: "Lorwyn éclipsé", mainMax: 401 },
  { code: "TLA", name: "Avatar: The Last Airbender", nameFr: "Avatar : le dernier maître de l'air", mainMax: 286 },
  { code: "SPM", name: "Marvel's Spider-Man", nameFr: "Marvel's Spider-Man", mainMax: 198 },
  { code: "MSH", name: "Marvel Super Heroes", nameFr: "Marvel Super Heroes", mainMax: 429 },
  { code: "TMT", name: "Teenage Mutant Ninja Turtles", nameFr: "Les Tortues Ninja", mainMax: 319 },
  { code: "HOB", name: "The Hobbit", nameFr: "Le Hobbit", mainMax: 320 },
  { code: "MKM", name: "Murders at Karlov Manor", nameFr: "Meurtres au manoir Karlov", mainMax: 286 },
  { code: "DSK", name: "Duskmourn: House of Horror", nameFr: "Mornebrune : la Maison de l'horreur", mainMax: 301 },
  { code: "LCI", name: "The Lost Caverns of Ixalan", nameFr: "Les cavernes oubliées d'Ixalan", mainMax: 291 },
  { code: "FIN", name: "Final Fantasy", nameFr: "Final Fantasy", mainMax: 309 },
];
