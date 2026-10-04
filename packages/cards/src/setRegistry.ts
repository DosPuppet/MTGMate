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
  /**
   * Ensemble de rééditions sorti avec des extensions du Standard (PLAN-G : Special Guests, feuilles bonus) : hors
   * Standard, jouable en « Sans limite ». `of` : les extensions avec lesquelles il est sorti.
   */
  reprint?: {
    of: string[];
    /** Numéros de collection importés (Special Guests : la plage de chaque extension de l'appli). */
    numbers?: [number, number][];
  };
}

/**
 * Cartes des ensembles de rééditions laissées de côté, quel que soit l'ensemble, avec la raison (PLAN-G) : une partie de
 * la carte ne fonctionne qu'en Commander (partenaire, éminence, ninjutsu de commandant, zone de commandement, identité de
 * couleur du commandant, « si vous contrôlez un commandant »).
 */
const COMMANDER_ONLY = "mécanique propre au Commander (à reprendre avec Commander)";
export const EXCLUDED_REPRINTS: Readonly<Record<string, string>> = {
  "Akroma's Will": COMMANDER_ONLY,
  "Breeches, Brazen Plunderer": COMMANDER_ONLY,
  "Bruse Tarl, Boorish Herder": COMMANDER_ONLY,
  "Command Beacon": COMMANDER_ONLY,
  "Command Tower": COMMANDER_ONLY,
  "Dargo, the Shipwrecker": COMMANDER_ONLY,
  "Inalla, Archmage Ritualist": COMMANDER_ONLY,
  "Ishai, Ojutai Dragonspeaker": COMMANDER_ONLY,
  "Jeska's Will": COMMANDER_ONLY,
  "Kraum, Ludevic's Opus": COMMANDER_ONLY,
  "Malcolm, Keen-Eyed Navigator": COMMANDER_ONLY,
  "Thrasios, Triton Hero": COMMANDER_ONLY,
  "Tymna the Weaver": COMMANDER_ONLY,
  "Vial Smasher the Fierce": COMMANDER_ONLY,
  "Yuriko, the Tiger's Shadow": COMMANDER_ONLY,
};

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
  // Rééditions (PLAN-G), après les extensions : une carte déjà présente garde sa définition et son image.
  {
    code: "SPG",
    name: "Special Guests",
    nameFr: "Invités spéciaux",
    mainMax: 0,
    reprint: {
      of: ["LCI", "MKM", "OTJ", "BLB", "DSK", "FDN", "DFT", "TDM", "EOE", "ECL", "SOS", "FRA"],
      // Une plage par extension de l'appli (39–53 : Modern Horizons 3, absente de l'appli).
      numbers: [
        [1, 38],
        [54, 168],
      ],
    },
  },
  {
    code: "EOS",
    name: "Edge of Eternities: Stellar Sights",
    nameFr: "Aux confins de l'éternité : merveilles stellaires",
    mainMax: 0,
    reprint: { of: ["EOE"] },
  },
  {
    code: "WOT",
    name: "Wilds of Eldraine: Enchanting Tales",
    nameFr: "Les friches d'Eldraine : contes enchanteurs",
    mainMax: 0,
    reprint: { of: ["WOE"] },
  },
  { code: "OTP", name: "Breaking News", nameFr: "Dernières nouvelles", mainMax: 0, reprint: { of: ["OTJ"] } },
  {
    code: "FCA",
    name: "Final Fantasy: Through the Ages",
    nameFr: "Final Fantasy : à travers les âges",
    mainMax: 0,
    reprint: {
      of: ["FIN"],
    },
  },
  {
    code: "SOA",
    name: "Secrets of Strixhaven Mystical Archive",
    nameFr: "Archive mystique de Secrets de Strixhaven",
    mainMax: 0,
    reprint: { of: ["SOS"] },
  },
  {
    code: "PZA",
    name: "Teenage Mutant Ninja Turtles Source Material",
    nameFr: "Les Tortues Ninja : sources",
    mainMax: 0,
    reprint: { of: ["TMT"] },
  },
  {
    code: "REX",
    name: "Jurassic World Collection",
    nameFr: "Collection Jurassic World",
    mainMax: 0,
    reprint: { of: ["LCI"] },
  },
];

/** Extensions du Standard (sans les ensembles de rééditions). */
export const STANDARD_SETS: readonly SetInfo[] = SET_INFO.filter((s) => !s.reprint);
