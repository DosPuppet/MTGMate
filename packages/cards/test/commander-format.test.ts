/**
 * Commander format (PLAN-E, E1): color identity (903.4) compared to Scryfall, deck construction rules (903.5:
 * 100 cards including the commander, singleton, identity, bans), Game Changers and estimated bracket, game deck.
 */
import { type CardDef, colorIdentity, plainText } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import edhData from "../data/edh.json";
import { buildGameDeck, CARDS, canBeCommander, canPair, DECKS, type DeckEntries, legalityIssue, validateDeck } from "../src";

const id = (name: string) => colorIdentity(CARDS[name]!).join("");

describe("color identity (903.4)", () => {
  it("matches Scryfall's for each card of the EDH pseudo-set (the whole catalog: npm run import-printings)", () => {
    for (const raw of edhData) {
      const want = ["W", "U", "B", "R", "G"].filter((c) => (raw.colorIdentity as string[]).includes(c)).join("");
      expect(id(raw.name), raw.name).toBe(want);
    }
  });

  it("cost, rules text, hybrid, Phyrexian, faces; reminder text excluded; basic land types", () => {
    expect(id("Edgar Markov")).toBe("WBR");
    expect(id("Sol Ring")).toBe("");
    expect(id("Command Tower")).toBe("");
    // {3}{U/B} : hybrid.
    expect(id("Helm of the Ghastlord")).toBe("UB");
    // {1}{B/P}{B/P} : Phyrexian.
    expect(id("Dismember")).toBe("B");
    // Rules text: "{T}: Add {W} or {B}.".
    expect(id("Caves of Koilos")).toBe("WB");
    // Reminder "({T}: Add {R}, {W}, or {B}.)" excluded, but Mountain Plains Swamp types.
    expect(id("Savai Triome")).toBe("WBR");
    // Modal card: the back face ({U} land) counts too.
    expect(id("Sink into Stupor // Soporific Springs")).toBe("U");
    // Convoke and madness reminder with no colored symbol outside the cost.
    expect(id("Markov Baron")).toBe("B");
    expect(id("Forest")).toBe("G");
  });
});

describe("Commander deck construction rules (903.5)", () => {
  const edgar = DECKS.find((d) => d.id === "cmd-edgar-markov")!;
  const yshtola = DECKS.find((d) => d.id === "cmd-yshtola")!;
  const urDragon = DECKS.find((d) => d.id === "cmd-ur-dragon")!;
  const rakdos = DECKS.find((d) => d.id === "cmd-rakdos")!;
  const multiverse = DECKS.find((d) => d.id === "cmd-multiverse-reforged")!;
  const turtles = DECKS.find((d) => d.id === "cmd-turtle-power")!;
  const blitz = DECKS.find((d) => d.id === "cmd-counter-blitz")!;
  const fantastic = DECKS.find((d) => d.id === "cmd-fantastic-four")!;
  const mutant = DECKS.find((d) => d.id === "cmd-mutant-menace")!;

  it("the preconstructed decks are legal; Game Changers and estimated bracket", () => {
    for (const d of [edgar, yshtola, urDragon, rakdos, multiverse, turtles, blitz, fantastic, mutant]) {
      const v = validateDeck(d, CARDS, "commander");
      expect(v.errors, d.id).toEqual([]);
      expect(v.legal).toBe(true);
      expect(v.mainCount).toBe(100);
      expect(v.minMain).toBe(100);
    }
    const e = validateDeck(edgar, CARDS, "commander");
    expect(e.commanders).toEqual(["Edgar Markov"]);
    expect(e.identity).toEqual(["W", "B", "R"]);
    expect(e.gameChangers?.sort()).toEqual([
      "Bolas's Citadel",
      "Demonic Tutor",
      "Smothering Tithe",
      "Teferi's Protection",
      "Vampiric Tutor",
    ]);
    expect(e.bracket).toBe("4+");
    const y = validateDeck(yshtola, CARDS, "commander");
    expect(y.identity).toEqual(["W", "U", "B"]);
    expect(y.gameChangers).toHaveLength(13);
    const u = validateDeck(urDragon, CARDS, "commander");
    expect(u.commanders).toEqual(["The Ur-Dragon"]);
    expect(u.identity).toEqual(["W", "U", "B", "R", "G"]);
    expect(u.gameChangers?.sort()).toEqual([
      "Chrome Mox",
      "Demonic Tutor",
      "Mana Vault",
      "Mox Diamond",
      "Smothering Tithe",
      "Teferi's Protection",
      "The One Ring",
    ]);
    expect(u.bracket).toBe("4+");
    const r = validateDeck(rakdos, CARDS, "commander");
    expect(r.commanders).toEqual(["Rakdos, Lord of Riots"]);
    expect(r.identity).toEqual(["B", "R"]);
    expect(r.gameChangers?.sort()).toEqual(["Demonic Tutor", "Vampiric Tutor"]);
    expect(r.bracket).toBe("3");
    // Official preconstructed decks: no Game Changer.
    const m = validateDeck(multiverse, CARDS, "commander");
    expect(m.commanders).toEqual(["Jace, Multiverse Architect"]);
    expect(m.identity).toEqual(["W", "U", "B", "R"]);
    expect(m.gameChangers).toEqual([]);
    expect(m.bracket).toBe("1–2");
    const t = validateDeck(turtles, CARDS, "commander");
    expect(t.commanders).toEqual(["Heroes in a Half Shell"]);
    expect(t.identity).toEqual(["W", "U", "B", "R", "G"]);
    expect(t.gameChangers).toEqual([]);
    const b = validateDeck(blitz, CARDS, "commander");
    expect(b.identity).toEqual(["W", "U", "G"]);
    expect(b.gameChangers).toEqual(["Farewell"]);
    expect(b.bracket).toBe("3");
    expect(validateDeck(fantastic, CARDS, "commander").identity).toEqual(["W", "U", "R", "G"]);
    expect(validateDeck(mutant, CARDS, "commander").identity).toEqual(["U", "B", "G"]);
  });

  const base = (): { commander: DeckEntries; main: DeckEntries } => ({
    commander: [[1, "Edgar Markov"]],
    main: edgar.main.map((e) => [...e] as typeof e),
  });
  const replace = (main: DeckEntries, from: string, to: string): DeckEntries =>
    main.map(([n, name]) => [n, name === from ? to : name]);

  it("missing commander, two commanders, non-legendary commander", () => {
    expect(validateDeck({ main: base().main }, CARDS, "commander").errors).toContain("Choose a commander");
    const two = {
      ...base(),
      commander: [
        [1, "Edgar Markov"],
        [1, "Elenda, the Dusk Rose"],
      ] as DeckEntries,
    };
    // Two commanders that can't be paired (neither has partner).
    expect(validateDeck(two, CARDS, "commander").errors.map(plainText)).toContain(
      "Edgar Markov and Elenda, the Dusk Rose can't be commanders together (partner, Background…)",
    );
    const notLegend = { commander: [[1, "Blood Artist"]] as DeckEntries, main: replace(base().main, "Blood Artist", "Swamp") };
    expect(validateDeck(notLegend, CARDS, "commander").errors.map(plainText)).toContain(
      "Blood Artist can't be your commander (legendary creature expected)",
    );
    expect(canBeCommander(CARDS["Y'shtola, Night's Blessed"]!)).toBe(true);
    expect(canBeCommander(CARDS["Sorin, Imperious Bloodlord"]!)).toBe(false);
  });

  it("commander pairs (702.124): partner, partner with, Partner—quality, friends forever, Background, Doctor's companion", () => {
    const bruse = CARDS["Bruse Tarl, Boorish Herder"] as CardDef;
    const reyhan = CARDS["Reyhan, Last of the Abzan"] as CardDef;
    const edgar = CARDS["Edgar Markov"] as CardDef;
    expect(canPair(bruse, reyhan)).toBe(true);
    expect(canPair(bruse, edgar)).toBe(false);
    const like = (name: string, text: string, extra: Partial<CardDef> = {}): CardDef => ({ ...edgar, name, text, ...extra });
    // "Partner with [name]": only that one, and not with a plain partner.
    expect(canPair(like("Pir", "Partner with Toothy"), like("Toothy", "Partner with Pir"))).toBe(true);
    expect(canPair(like("Pir", "Partner with Toothy"), bruse)).toBe(false);
    // "Partner—[quality]": the same quality only.
    expect(canPair(like("A", "Partner—Survivors"), like("B", "Partner—Survivors"))).toBe(true);
    expect(canPair(like("A", "Partner—Survivors"), bruse)).toBe(false);
    expect(canPair(like("A", "Friends forever"), like("B", "Friends forever"))).toBe(true);
    // "Choose a Background" with a legendary Background enchantment (which can then be a commander).
    const background = like("Raised by Giants", "", { types: ["Enchantment"], subtypes: ["Background"] });
    expect(canPair(like("Wilson", "Choose a Background"), background)).toBe(true);
    expect(canPair(bruse, background)).toBe(false);
    // The Mario & Luigi precon: two partners, legal.
    const deck = DECKS.find((d) => d.id === "cmd-mario-luigi");
    expect(deck && validateDeck(deck, CARDS, "commander").errors).toEqual([]);
  });

  it("exactly 100 cards; a single copy except basic lands; no sideboard", () => {
    const short = { ...base(), main: base().main.filter(([, n]) => n !== "Blood Artist") };
    expect(validateDeck(short, CARDS, "commander").errors.map(plainText)).toContain(
      "The deck has 99 cards, commander included (exactly 100 are needed)",
    );
    const twice = { ...base(), main: replace(base().main, "Viscera Seer", "Blood Artist") };
    expect(validateDeck(twice, CARDS, "commander").errors.map(plainText)).toContain(
      "Blood Artist: 2 copies (only one in Commander)",
    );
    // Six Swamps: basic lands, allowed.
    expect(validateDeck(base(), CARDS, "commander").errors).toEqual([]);
    const side = { ...base(), sideboard: [[1, "Shivan Dragon"]] as DeckEntries };
    expect(validateDeck(side, CARDS, "commander").errors).toContain("No sideboard in Commander");
  });

  it("commander's color identity; bans from commander.json", () => {
    const blue = { ...base(), main: replace(base().main, "Blood Artist", "Counterspell") };
    expect(validateDeck(blue, CARDS, "commander").errors.map(plainText)).toContain(
      "Counterspell is outside the commander's color identity",
    );
    // A basic land outside the identity too (Island).
    const island = { ...base(), main: replace(base().main, "Blood Artist", "Island") };
    expect(validateDeck(island, CARDS, "commander").errors.map(plainText)).toContain(
      "Island is outside the commander's color identity",
    );
    expect(plainText(legalityIssue(CARDS["Mana Crypt"]!, "commander") ?? "")).toBe("Mana Crypt is banned in Commander");
    expect(legalityIssue(CARDS["Sol Ring"]!, "commander")).toBeUndefined();
    const banned = { ...base(), main: replace(base().main, "Sol Ring", "Mana Crypt") };
    expect(validateDeck(banned, CARDS, "commander").errors.map(plainText)).toContain("Mana Crypt is banned in Commander");
  });

  it("game deck: the commander first, its index, then the other 99 cards", () => {
    const g = buildGameDeck(edgar);
    expect(g.deck).toHaveLength(100);
    expect(g.commanders).toEqual([0]);
    expect(g.deck[0]?.name).toBe("Edgar Markov");
    expect(buildGameDeck({ main: [[2, "Forest"]] }).commanders).toBeUndefined();
  });
});
