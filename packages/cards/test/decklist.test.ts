import { describe, expect, it } from "vitest";
import { CARDS, CardIndex, DECKS, parseDeckList, serializeDeckList, validateDeck } from "../src";

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

  it("section Commander ignorée et signalée", () => {
    const d = parseDeckList("Commander\n1 Llanowar Elves\nDeck\n4 Forest", index);
    expect(d.main).toEqual([[4, "Forest"]]);
    expect(d.issues[0]?.kind).toBe("ignored");
  });
});

describe("export des decklists", () => {
  const deck = DECKS[0]!;

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
  it("les decks préconstruits sont légaux et jouables", () => {
    for (const d of DECKS) expect(validateDeck(d, CARDS)).toMatchObject({ legal: true, playable: true, mainCount: 60 });
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

  it("les 517 cartes de Foundations sont légales en Standard (légalités Scryfall importées)", () => {
    const cards = Object.values(CARDS).filter((c) => !c.isToken);
    expect(cards).toHaveLength(517);
    expect(cards.filter((c) => c.legalities?.standard !== "legal").map((c) => c.name)).toEqual([]);
  });

  it("une carte bannie rend le deck illégal, même en réserve", () => {
    const cards = withCard({ standard: "banned" });
    for (const where of ["main", "side"] as const) {
      const v = validateDeck(deck(where), cards);
      expect(v).toMatchObject({ format: "standard", legal: false, playable: false });
      expect(v.errors).toEqual(["Carte fictive est bannie en Standard"]);
    }
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
