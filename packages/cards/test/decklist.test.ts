import { plainText } from "@mtgx/engine";
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

describe("reading decklists", () => {
  it("MTGA format: sections, deck name, set codes", () => {
    const text = `About
Name Rushed Elves

Deck
4 Llanowar Elves (FDN) 227
20 Forest (FDN) 280
2 Giant Growth (FDN) 104

Sideboard
2 Broken Wings (FDN) 99
`;
    const d = parseDeckList(text, index);
    expect(d.name).toBe("Rushed Elves");
    expect(d.main).toEqual([
      [4, "Llanowar Elves"],
      [20, "Forest"],
      [2, "Giant Growth"],
    ]);
    expect(d.sideboard).toEqual([[2, "Broken Wings"]]);
    expect(d.issues.filter((i) => i.kind !== "unimplemented")).toEqual([]);
  });

  it('MTGO format: "4x", SB: prefix, sideboard after a blank line', () => {
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

  it("French names, case and accents ignored; duplicate lines added up", () => {
    const d = parseDeckList("2 ELFES DE LLANOWAR\n2 elfes de llanowar\n3 Croissance gigantesque\n10 foret", index);
    expect(d.main).toEqual([
      [4, "Llanowar Elves"],
      [3, "Giant Growth"],
      [10, "Forest"],
    ]);
  });

  it("unknown card: error with suggestion; unreadable line reported", () => {
    const d = parseDeckList("4 Llanowar Elfs\nbonjour\n// commentaire\n", index);
    expect(d.main).toEqual([]);
    expect(d.issues.map((i) => [i.line, i.kind, i.suggestion])).toEqual([
      [1, "unknown", "Llanowar Elves"],
      [2, "syntax", undefined],
    ]);
  });

  it("Commander section (PLAN-E): the commander apart; Moxfield's *CMDR* mark; Companion section ignored", () => {
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
    // Round trip: the export writes the Commander section first.
    const text = serializeDeckList({ commander: d.commander, main: d.main }, CARDS);
    expect(text).toMatch(/^Commander\n1 Llanowar Elves \(FDN\) \d+\n\nDeck\n4 Forest/);
    expect(parseDeckList(text, index).commander).toEqual(d.commander);
  });
});

describe("decklist export", () => {
  const deck = DECKS.find((d) => d.id === "welcome-green")!;

  it("MTGA round trip: reading the export back gives the same deck", () => {
    const text = serializeDeckList({ ...deck, sideboard: [[2, "Broken Wings"]] }, CARDS);
    expect(text).toMatch(/^About\nName .+\n\nDeck\n\d+ Forest \(FDN\) \d+/);
    const back = parseDeckList(text, index);
    expect(back.name).toBe(deck.name);
    expect(back.main).toEqual(deck.main);
    expect(back.sideboard).toEqual([[2, "Broken Wings"]]);
  });

  it("plain text round trip with the French names", () => {
    const text = serializeDeckList(deck, CARDS, { format: "plain", lang: "fr" });
    expect(text).toContain("Elfes de Llanowar");
    expect(parseDeckList(text, index).main).toEqual(deck.main);
  });
});

describe("construction rules", () => {
  it("the preconstructed decks are legal and playable (the Commander decks, once their cards are done)", () => {
    // Playable Commander preconstructed decks (PLAN-E): at the end of their card lots (E11 Edgar, E12 Y'shtola).
    const commanderPlayable: string[] = [
      "cmd-edgar-markov",
      "cmd-yshtola",
      "cmd-ur-dragon",
      "cmd-rakdos",
      "cmd-multiverse-reforged",
      "cmd-turtle-power",
      "cmd-counter-blitz",
      "cmd-fantastic-four",
      "cmd-mutant-menace",
      "cmd-vision",
      "cmd-dark-leo",
      "cmd-ur-sphinx",
      "cmd-vivi",
      "cmd-sephiroth",
      "cmd-mario-luigi",
    ];
    for (const d of DECKS) {
      if (d.format === "commander") {
        const v = validateDeck(d, CARDS, "commander");
        expect(v, d.id).toMatchObject({ legal: true, playable: commanderPlayable.includes(d.id), mainCount: 100 });
        continue;
      }
      const welcome = d.id.startsWith("welcome-");
      const v = validateDeck(d, CARDS);
      expect(v, d.id).toMatchObject({ legal: true, playable: true, welcome });
      // 40 cards for a welcome deck; at least 60 otherwise (the meta's 4c Control has 61).
      if (welcome) expect(v.mainCount, d.id).toBe(40);
      else expect(v.mainCount, d.id).toBeGreaterThanOrEqual(60);
    }
  });

  it("a welcome deck (40 cards) is played as is, not a modified copy", () => {
    const d = DECKS.find((x) => x.id === "welcome-red")!;
    // Same list, in another order and split differently: recognized.
    const [first, ...rest] = d.main;
    const split: DeckEntries = [...rest.reverse(), [first![0] - 1, first![1]], [1, first![1]]];
    expect(validateDeck({ main: split }, CARDS)).toMatchObject({ legal: true, welcome: true, minMain: 40 });
    // One card changed: the 60-card minimum applies.
    const changed: [number, string][] = d.main.map(([n, name]) => [n, name === "Shivan Dragon" ? "Serra Angel" : name]);
    expect(validateDeck({ main: changed }, CARDS)).toMatchObject({ legal: false, welcome: false, minMain: 60 });
    expect(validateDeck({ main: changed }, CARDS).errors.map(plainText)).toContain("The deck has 40 cards (minimum 60)");
  });

  it("60 cards minimum, 4 copies maximum except basic lands, 15-card sideboard", () => {
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
    expect(v.errors.map(plainText)).toEqual([
      "The deck has 35 cards (minimum 60)",
      "The sideboard has 16 cards (maximum 15)",
      "Llanowar Elves: 5 copies (maximum 4)",
    ]);
  });

  it("copies in the deck and the sideboard add up", () => {
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
    expect(v.errors.map(plainText)).toEqual(["Giant Growth: 5 copies (maximum 4)"]);
  });

  it("a card not yet implemented makes the deck unplayable, without making it illegal", () => {
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

describe("sideboard", () => {
  it("an unimplemented card in the sideboard does not prevent playing", () => {
    const unimplemented = { ...CARDS["Shivan Dragon"]!, name: "Carte fictive", implemented: false };
    const v = validateDeck(
      { main: [[60, "Forest"]], sideboard: [[1, unimplemented.name]] },
      { ...CARDS, [unimplemented.name]: unimplemented },
    );
    expect(v).toMatchObject({ legal: true, playable: true });
    expect(v.warnings[0]).toContain("(sideboard)");
  });
});

describe("legality in Standard", () => {
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

  it("the cards of the covered sets are legal in Standard, except the 13 banned ones (Scryfall legalities)", () => {
    // The reprint sets (PLAN-G) and the Commander pseudo-set (PLAN-E) are outside Standard: checked separately.
    const reprints = new Set(SETS.filter((s) => s.reprint || s.byName).map((s) => s.code));
    const cards = Object.values(CARDS).filter((c) => !c.isToken && !reprints.has(c.set ?? ""));
    expect(cards.filter((c) => c.set === "FDN")).toHaveLength(517);
    // Reality Fracture: 285 cards, including 6 reprints of Foundations (basic lands, Unsummon).
    expect(cards.filter((c) => c.set === "FRA")).toHaveLength(279);
    // Outside Standard: exactly the 13 banned cards (to recheck at each ban announcement).
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

  it('prepare card: the creature and its spell, and the "Creature // Spell" name on import', () => {
    const angel = CARDS["Blossom-Blessed Angel"];
    expect(angel?.prepareFace).toMatchObject({ name: "Seed Suture", typeLine: "Sorcery", manaCost: "{G/W}" });
    expect(angel?.types).toEqual(["Creature"]);
    const d = parseDeckList("2 Blossom-Blessed Angel // Seed Suture", new CardIndex(CARDS));
    expect(d.main).toEqual([[2, "Blossom-Blessed Angel"]]);
  });

  it("a banned card makes the deck illegal, even in the sideboard", () => {
    const cards = withCard({ standard: "banned" });
    for (const where of ["main", "side"] as const) {
      const v = validateDeck(deck(where), cards);
      expect(v).toMatchObject({ format: "standard", legal: false, playable: false });
      expect(v.errors.map(plainText)).toEqual(["Carte fictive is banned in Standard"]);
    }
  });

  it("unlimited: any card of the catalog, whatever its legality; the construction rules remain", () => {
    for (const legalities of [{ standard: "banned" }, { standard: "not_legal" }, undefined]) {
      for (const where of ["main", "side"] as const) {
        const v = validateDeck(deck(where), withCard(legalities), "unlimited");
        expect(v).toMatchObject({ format: "unlimited", legal: true, errors: [] });
      }
    }
    // 60 cards minimum, 4 copies at most.
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
    expect(five.errors.map(plainText)).toEqual(["Carte fictive: 5 copies (maximum 4)"]);
    // An assembled card still cannot be put in a deck.
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
    // The sideboard swap of an unlimited match keeps the banned card.
    expect(sideboardSwapError(deck("side"), deck("side"), withCard({ standard: "banned" }), "unlimited")).toBeNull();
    expect(plainText(sideboardSwapError(deck("side"), deck("side"), withCard({ standard: "banned" })) ?? "")).toBe(
      "Carte fictive is banned in Standard",
    );
  });

  it('reprints (PLAN-G): none is legal in Standard, all are playable in "Unlimited", with no Commander-only card', () => {
    const reprints = SETS.filter((s) => s.reprint);
    expect(reprints.map((s) => s.code)).toEqual(["SPG", "EOS", "WOT", "OTP", "FCA", "SOA", "PZA", "REX"]);
    const codes = new Set(reprints.map((s) => s.code));
    const cards = Object.values(CARDS).filter((c) => !c.isToken && codes.has(c.set ?? ""));
    expect(cards.length).toBeGreaterThan(400);
    expect(cards.filter((c) => c.legalities?.standard === "legal").map((c) => c.name)).toEqual([]);
    for (const c of cards) expect(legalityIssue(c, "unlimited"), c.name).toBeUndefined();
    // A card set aside from the reprints may come from a Commander deck (EDH pseudo-set, PLAN-E), never from a reprint.
    for (const name of Object.keys(EXCLUDED_REPRINTS)) expect(CARDS[name]?.set ?? "EDH", name).toBe("EDH");
  });

  it("a card outside Standard or with no known legality makes the deck illegal", () => {
    expect(validateDeck(deck("main"), withCard({ standard: "not_legal" })).errors.map(plainText)).toEqual([
      "Carte fictive is not legal in Standard",
    ]);
    expect(validateDeck(deck("main"), withCard(undefined)).errors.map(plainText)).toEqual([
      "Carte fictive: legality in Standard unknown",
    ]);
  });

  it("the import flags illegal cards", () => {
    const cards = withCard({ standard: "banned" });
    const d = parseDeckList("1 Carte fictive\n59 Forest", new CardIndex(cards));
    expect(d.main).toHaveLength(2);
    expect(d.issues.map((i) => [i.line, i.kind, plainText(i.message)])).toEqual([
      [1, "illegal", "Carte fictive is banned in Standard"],
    ]);
  });
});

describe("multi-faced cards (lot 0.3)", () => {
  it("each face has its definition; the card carries the front face, or the union of the halves of a split card", () => {
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

  it('decklists: the front face alone (MTGA) or "A/B" (MTGO); export of the front face, full name for a split card', () => {
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
