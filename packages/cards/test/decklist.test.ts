import { describe, expect, it } from "vitest";
import {
  CARDS,
  CardIndex,
  DECKS,
  type DeckEntries,
  EXCLUDED_REPRINTS,
  legalityIssue,
  parseDeckList,
  SETS,
  serializeDeckList,
  sideboardSwapError,
  validateDeck,
} from "../src";

const index = new CardIndex(CARDS);

describe("lecture des decklists", () => {
  it("format MTGA : sections, nom du deck, codes de set", () => {
    const text = `About
Name Elfes pressés

Deck
4 Llanowar Elves (FDN) 227
20 Forest (FDN) 280
2 Giant Growth (FDN) 104

Sideboard
2 Broken Wings (FDN) 99
`;
    const d = parseDeckList(text, index);
    expect(d.name).toBe("Elfes pressés");
    expect(d.main).toEqual([
      [4, "Llanowar Elves"],
      [20, "Forest"],
      [2, "Giant Growth"],
    ]);
    expect(d.sideboard).toEqual([[2, "Broken Wings"]]);
    expect(d.issues.filter((i) => i.kind !== "unimplemented")).toEqual([]);
  });

  it("format MTGO : « 4x », préfixe SB:, réserve après une ligne vide", () => {
    const d = parseDeckList("4x Llanowar Elves\n20 Forest\nSB: 1 Giant Growth\n\n2 Broken Wings\n", index);
    expect(d.main).toEqual([
      [4, "Llanowar Elves"],
      [20, "Forest"],
    ]);
    expect(d.sideboard).toEqual([
      [1, "Giant Growth"],
      [2, "Broken Wings"],
    ]);
  });

  it("noms français, casse et accents indifférents ; lignes en double additionnées", () => {
    const d = parseDeckList("2 ELFES DE LLANOWAR\n2 elfes de llanowar\n3 Croissance gigantesque\n10 foret", index);
    expect(d.main).toEqual([
      [4, "Llanowar Elves"],
      [3, "Giant Growth"],
      [10, "Forest"],
    ]);
  });

  it("carte inconnue : erreur avec suggestion ; ligne illisible signalée", () => {
    const d = parseDeckList("4 Llanowar Elfs\nbonjour\n// commentaire\n", index);
    expect(d.main).toEqual([]);
    expect(d.issues.map((i) => [i.line, i.kind, i.suggestion])).toEqual([
      [1, "unknown", "Llanowar Elves"],
      [2, "syntax", undefined],
    ]);
  });

  it("section Commander (PLAN-E) : le commandant à part ; marque *CMDR* de Moxfield ; section Compagnon ignorée", () => {
    const d = parseDeckList("Commander\n1 Llanowar Elves\n\nDeck\n4 Forest", index);
    expect(d.commander).toEqual([[1, "Llanowar Elves"]]);
    expect(d.main).toEqual([[4, "Forest"]]);
    expect(d.sideboard).toEqual([]);
    const moxfield = parseDeckList("1 Llanowar Elves (FDN) 227 *CMDR*\n4 Forest", index);
    expect(moxfield.commander?.map((e) => e[1])).toEqual(["Llanowar Elves"]);
    expect(moxfield.main).toEqual([[4, "Forest"]]);
    const companion = parseDeckList("Companion\n1 Llanowar Elves\nDeck\n4 Forest", index);
    expect(companion.main).toEqual([[4, "Forest"]]);
    expect(companion.issues[0]?.kind).toBe("ignored");
    // Aller-retour : l'export écrit la section Commander en premier.
    const text = serializeDeckList({ commander: d.commander, main: d.main }, CARDS);
    expect(text).toMatch(/^Commander\n1 Llanowar Elves \(FDN\) \d+\n\nDeck\n4 Forest/);
    expect(parseDeckList(text, index).commander).toEqual(d.commander);
  });
});

describe("export des decklists", () => {
  const deck = DECKS.find((d) => d.id === "bienvenue-vert")!;

  it("aller-retour MTGA : relire l'export redonne le même deck", () => {
    const text = serializeDeckList({ ...deck, sideboard: [[2, "Broken Wings"]] }, CARDS);
    expect(text).toMatch(/^About\nName .+\n\nDeck\n\d+ Forest \(FDN\) \d+/);
    const back = parseDeckList(text, index);
    expect(back.name).toBe(deck.name);
    expect(back.main).toEqual(deck.main);
    expect(back.sideboard).toEqual([[2, "Broken Wings"]]);
  });

  it("aller-retour en texte simple avec les noms français", () => {
    const text = serializeDeckList(deck, CARDS, { format: "plain", lang: "fr" });
    expect(text).toContain("Elfes de Llanowar");
    expect(parseDeckList(text, index).main).toEqual(deck.main);
  });
});

describe("règles de construction", () => {
  it("les decks préconstruits sont légaux et jouables (les decks Commander, une fois leurs cartes faites)", () => {
    // Préconstruits Commander (PLAN-E) jouables : à la fin de leurs lots de cartes (E11 Edgar, E12 Y'shtola).
    const commanderPlayable: string[] = ["cmd-edgar-markov", "cmd-yshtola", "cmd-ur-dragon", "cmd-rakdos"];
    for (const d of DECKS) {
      if (d.format === "commander") {
        const v = validateDeck(d, CARDS, "commander");
        expect(v, d.id).toMatchObject({ legal: true, playable: commanderPlayable.includes(d.id), mainCount: 100 });
        continue;
      }
      const welcome = d.id.startsWith("bienvenue-");
      const v = validateDeck(d, CARDS);
      expect(v, d.id).toMatchObject({ legal: true, playable: true, welcome });
      // 40 cartes pour un deck de bienvenue ; 60 au moins sinon (4c Control du méta en a 61).
      if (welcome) expect(v.mainCount, d.id).toBe(40);
      else expect(v.mainCount, d.id).toBeGreaterThanOrEqual(60);
    }
  });

  it("un deck de bienvenue (40 cartes) se joue tel quel, pas une copie modifiée", () => {
    const d = DECKS.find((x) => x.id === "bienvenue-rouge")!;
    // Même liste, dans un autre ordre et découpée autrement : reconnue.
    const [first, ...rest] = d.main;
    const split: DeckEntries = [...rest.reverse(), [first![0] - 1, first![1]], [1, first![1]]];
    expect(validateDeck({ main: split }, CARDS)).toMatchObject({ legal: true, welcome: true, minMain: 40 });
    // Une carte changée : les 60 cartes minimum s'appliquent.
    const changed: [number, string][] = d.main.map(([n, name]) => [n, name === "Shivan Dragon" ? "Serra Angel" : name]);
    expect(validateDeck({ main: changed }, CARDS)).toMatchObject({ legal: false, welcome: false, minMain: 60 });
    expect(validateDeck({ main: changed }, CARDS).errors).toContain("Le deck contient 40 cartes (minimum 60)");
  });

  it("60 cartes minimum, 4 exemplaires maximum sauf terrains de base, réserve de 15", () => {
    const v = validateDeck(
      {
        main: [
          [5, "Llanowar Elves"],
          [30, "Forest"],
        ],
        sideboard: [[16, "Mountain"]],
      },
      CARDS,
    );
    expect(v.legal).toBe(false);
    expect(v.errors).toEqual([
      "Le deck contient 35 cartes (minimum 60)",
      "La réserve contient 16 cartes (maximum 15)",
      "Llanowar Elves : 5 exemplaires (maximum 4)",
    ]);
  });

  it("les exemplaires du deck et de la réserve s'additionnent", () => {
    const v = validateDeck(
      {
        main: [
          [3, "Giant Growth"],
          [57, "Forest"],
        ],
        sideboard: [[2, "Giant Growth"]],
      },
      CARDS,
    );
    expect(v.errors).toEqual(["Giant Growth : 5 exemplaires (maximum 4)"]);
  });

  it("une carte pas encore gérée rend le deck non jouable, sans le rendre illégal", () => {
    const unimplemented = { ...CARDS["Shivan Dragon"]!, name: "Carte fictive", implemented: false };
    const v = validateDeck(
      {
        main: [
          [1, unimplemented.name],
          [59, "Forest"],
        ],
      },
      { ...CARDS, [unimplemented.name]: unimplemented },
    );
    expect(v).toMatchObject({ legal: true, playable: false });
    expect(v.warnings).toHaveLength(1);
  });
});

describe("réserve", () => {
  it("une carte non gérée en réserve n'empêche pas de jouer", () => {
    const unimplemented = { ...CARDS["Shivan Dragon"]!, name: "Carte fictive", implemented: false };
    const v = validateDeck(
      { main: [[60, "Forest"]], sideboard: [[1, unimplemented.name]] },
      { ...CARDS, [unimplemented.name]: unimplemented },
    );
    expect(v).toMatchObject({ legal: true, playable: true });
    expect(v.warnings[0]).toContain("(réserve)");
  });
});

describe("légalité en Standard", () => {
  const withCard = (legalities: Record<string, string> | undefined) => {
    const c = { ...CARDS["Shivan Dragon"]!, name: "Carte fictive", legalities } as (typeof CARDS)[string];
    return { ...CARDS, [c.name]: c };
  };
  const deck = (where: "main" | "side") => ({
    main: [
      [where === "main" ? 1 : 0, "Carte fictive"],
      [where === "main" ? 59 : 60, "Forest"],
    ].filter(([n]) => (n as number) > 0) as [number, string][],
    sideboard: where === "side" ? ([[1, "Carte fictive"]] as [number, string][]) : [],
  });

  it("les cartes des extensions couvertes sont légales en Standard, sauf les 13 bannies (légalités Scryfall)", () => {
    // Les ensembles de rééditions (PLAN-G) et le pseudo-ensemble Commander (PLAN-E) sont hors Standard : vérifiés à part.
    const reprints = new Set(SETS.filter((s) => s.reprint || s.byName).map((s) => s.code));
    const cards = Object.values(CARDS).filter((c) => !c.isToken && !reprints.has(c.set ?? ""));
    expect(cards.filter((c) => c.set === "FDN")).toHaveLength(517);
    // Reality Fracture : 285 cartes, dont 6 réimpressions de Foundations (terrains de base, Unsummon).
    expect(cards.filter((c) => c.set === "FRA")).toHaveLength(279);
    // Hors Standard : exactement les 13 cartes bannies (à revérifier à chaque annonce de bannissement).
    expect(cards.filter((c) => c.legalities?.standard !== "legal" && c.legalities?.standard !== "banned")).toEqual([]);
    expect(
      cards
        .filter((c) => c.legalities?.standard === "banned")
        .map((c) => c.name)
        .sort(),
    ).toEqual([
      "Abuelo's Awakening",
      "Badgermole Cub",
      "Cori-Steel Cutter",
      "Gran-Gran",
      "Heartfire Hero",
      "Hopeless Nightmare",
      "Monstrous Rage",
      "Proft's Eidetic Memory",
      "Screaming Nemesis",
      "Stormchaser's Talent",
      "This Town Ain't Big Enough",
      "Up the Beanstalk",
      "Vivi Ornitier",
    ]);
  });

  it("carte à préparer : la créature et son sort, et le nom « Créature // Sort » à l'import", () => {
    const angel = CARDS["Blossom-Blessed Angel"];
    expect(angel?.prepareFace).toMatchObject({ name: "Seed Suture", typeLine: "Sorcery", manaCost: "{G/W}" });
    expect(angel?.types).toEqual(["Creature"]);
    const d = parseDeckList("2 Blossom-Blessed Angel // Seed Suture", new CardIndex(CARDS));
    expect(d.main).toEqual([[2, "Blossom-Blessed Angel"]]);
  });

  it("une carte bannie rend le deck illégal, même en réserve", () => {
    const cards = withCard({ standard: "banned" });
    for (const where of ["main", "side"] as const) {
      const v = validateDeck(deck(where), cards);
      expect(v).toMatchObject({ format: "standard", legal: false, playable: false });
      expect(v.errors).toEqual(["Carte fictive est bannie en Standard"]);
    }
  });

  it("sans limite : toute carte du catalogue, quelle que soit sa légalité ; les règles de construction restent", () => {
    for (const legalities of [{ standard: "banned" }, { standard: "not_legal" }, undefined]) {
      for (const where of ["main", "side"] as const) {
        const v = validateDeck(deck(where), withCard(legalities), "unlimited");
        expect(v).toMatchObject({ format: "unlimited", legal: true, errors: [] });
      }
    }
    // 60 cartes minimum, 4 exemplaires au plus.
    const five = validateDeck(
      {
        main: [
          [5, "Carte fictive"],
          [55, "Forest"],
        ],
      },
      withCard(undefined),
      "unlimited",
    );
    expect(five.errors).toEqual(["Carte fictive : 5 exemplaires (maximum 4)"]);
    // Une carte assemblée ne se met toujours pas dans un deck.
    const meld = Object.values(CARDS).find((c) => c.meldResult);
    if (meld)
      expect(
        validateDeck(
          {
            main: [
              [1, meld.name],
              [59, "Forest"],
            ],
          },
          CARDS,
          "unlimited",
        ).legal,
      ).toBe(false);
    // L'échange de réserve d'un match sans limite garde la carte bannie.
    expect(sideboardSwapError(deck("side"), deck("side"), withCard({ standard: "banned" }), "unlimited")).toBeNull();
    expect(sideboardSwapError(deck("side"), deck("side"), withCard({ standard: "banned" }))).toBe(
      "Carte fictive est bannie en Standard",
    );
  });

  it("rééditions (PLAN-G) : aucune n'est légale en Standard, toutes se jouent en « Sans limite », sans carte propre au Commander", () => {
    const reprints = SETS.filter((s) => s.reprint);
    expect(reprints.map((s) => s.code)).toEqual(["SPG", "EOS", "WOT", "OTP", "FCA", "SOA", "PZA", "REX"]);
    const codes = new Set(reprints.map((s) => s.code));
    const cards = Object.values(CARDS).filter((c) => !c.isToken && codes.has(c.set ?? ""));
    expect(cards.length).toBeGreaterThan(400);
    expect(cards.filter((c) => c.legalities?.standard === "legal").map((c) => c.name)).toEqual([]);
    for (const c of cards) expect(legalityIssue(c, "unlimited"), c.name).toBeUndefined();
    // Une carte écartée des rééditions peut venir d'un deck Commander (pseudo-ensemble EDH, PLAN-E), jamais d'une réédition.
    for (const name of Object.keys(EXCLUDED_REPRINTS)) expect(CARDS[name]?.set ?? "EDH", name).toBe("EDH");
  });

  it("une carte hors Standard ou sans légalité connue rend le deck illégal", () => {
    expect(validateDeck(deck("main"), withCard({ standard: "not_legal" })).errors).toEqual([
      "Carte fictive n'est pas légale en Standard",
    ]);
    expect(validateDeck(deck("main"), withCard(undefined)).errors).toEqual(["Carte fictive : légalité en Standard inconnue"]);
  });

  it("l'import signale les cartes illégales", () => {
    const cards = withCard({ standard: "banned" });
    const d = parseDeckList("1 Carte fictive\n59 Forest", new CardIndex(cards));
    expect(d.main).toHaveLength(2);
    expect(d.issues.map((i) => [i.line, i.kind, i.message])).toEqual([[1, "illegal", "Carte fictive est bannie en Standard"]]);
  });
});

describe("cartes à plusieurs faces (lot 0.3)", () => {
  it("chaque face a sa définition ; la carte porte le recto, ou la réunion des moitiés d'une carte scindée", () => {
    const adventure = CARDS["Riling Dawnbreaker // Signaling Roar"];
    expect(adventure?.layout).toBe("adventure");
    expect(adventure?.faceDefs?.map((f) => [f.name, f.types])).toEqual([
      ["Riling Dawnbreaker", ["Creature"]],
      ["Signaling Roar", ["Sorcery"]],
    ]);
    expect(adventure?.types).toEqual(["Creature"]);
    const split = CARDS["Cease // Desist"];
    expect(split?.types).toEqual(["Instant", "Sorcery"]);
    expect(split?.colors.sort()).toEqual(["B", "G", "W"]);
    const dfc = CARDS["Aang, at the Crossroads // Aang, Destined Savior"];
    expect(dfc?.faceDefs?.[1]?.image).toMatch(/^https:/);
    expect(dfc?.faceDefs?.[1]?.image).not.toBe(dfc?.image);
  });

  it("decklists : le recto seul (MTGA) ou « A/B » (MTGO) ; export du recto, nom complet pour une carte scindée", () => {
    const index = new CardIndex(CARDS);
    expect(index.find("Riling Dawnbreaker")).toBe("Riling Dawnbreaker // Signaling Roar");
    expect(index.find("Cease/Desist")).toBe("Cease // Desist");
    const text = serializeDeckList(
      {
        main: [
          [2, "Riling Dawnbreaker // Signaling Roar"],
          [1, "Cease // Desist"],
        ],
      },
      CARDS,
    );
    expect(text).toContain("2 Riling Dawnbreaker (TDM)");
    expect(text).toContain("1 Cease // Desist (MKM)");
  });
});
