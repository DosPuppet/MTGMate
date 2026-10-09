/**
 * Registry of the covered sets (PLAN-C, C19): code, names and last number of the main set, without the data. The only
 * list of sets: `sets.ts` adds data and scripts to it; the import tools (`tools/import-scryfall.ts`,
 * `tools/import-tokens.ts`) read it without loading the cards. Order matters: a reprint (same name) keeps the
 * definition of the first set.
 */
export interface SetInfo {
  code: string;
  name: string;
  nameFr: string;
  /** Last collector number of the main set (beyond: reprints, special cards). */
  mainMax: number;
  /**
   * Reprint set released with Standard sets (PLAN-G: Special Guests, bonus sheets): outside Standard, playable in
   * "Unlimited". `of`: the sets it was released with.
   */
  reprint?: {
    of: string[];
    /** Imported collector numbers (Special Guests: the range of each set of the app). */
    numbers?: [number, number][];
  };
  /**
   * Pseudo-set imported by name (PLAN-E, Commander): the cards of the decklists in `decks` (folder relative to the
   * repository root) missing from the catalog, each with the printing chosen by the import (`origin`). Outside Standard.
   */
  byName?: { decks: string };
}

/**
 * Cards of the reprint sets left out, whatever the set, with the reason (PLAN-G): part of the card only works in
 * Commander (partner, eminence, commander ninjutsu, command zone, commander's color identity, "if you control a
 * commander"). The EDH pseudo-set (PLAN-E) defines them: its import adds these names (PLAN-L L2).
 */
const COMMANDER_ONLY = "mechanic specific to Commander (defined in EDH)";
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
  // Reprint sets (PLAN-G), after the sets: a card already present keeps its definition and its image.
  {
    code: "SPG",
    name: "Special Guests",
    nameFr: "Invités spéciaux",
    mainMax: 0,
    reprint: {
      of: ["LCI", "MKM", "OTJ", "BLB", "DSK", "FDN", "DFT", "TDM", "EOE", "ECL", "SOS", "FRA"],
      // One range per set of the app (39–53: Modern Horizons 3, absent from the app).
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
  // Commander (PLAN-E): cards of the Commander decks missing from the sets above, imported by name
  // (`npm run import-cards -- edh`). The code is not that of a Scryfall set (CMD: Commander 2011).
  { code: "EDH", name: "Commander", nameFr: "Commander", mainMax: 0, byName: { decks: "docs/commander/decks" } },
];

/** Standard sets (without the reprint sets or the Commander pseudo-set). */
export const STANDARD_SETS: readonly SetInfo[] = SET_INFO.filter((s) => !s.reprint && !s.byName);
