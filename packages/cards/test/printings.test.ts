/**
 * Printings (PLAN-G, G1): the artwork of a reprint, or of a printing from the table (`printings.ts`), chosen
 * by the deck, without changing anything about the rules.
 */
import {
  CUSTOM_PRINTING,
  createRecordedGame,
  customArtSet,
  customPrinting,
  isGameRecord,
  keyedPrinting,
  projectView,
  replayGame,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  buildDeck,
  CARDS,
  CardIndex,
  card,
  DECKS,
  type DeckEntries,
  deckPrintings,
  parseDeckList,
  serializeDeckList,
  validateDeck,
} from "../src";
import { findPrinting, hasPrinting, printingOptions } from "../src/printings";

const GHALTA = "Ghalta, Primal Hunger";
const ghalta = card(GHALTA);
const spg = ghalta.printings?.find((p) => p.set === "SPG");

describe("reprint printings", () => {
  it("an already-known card gets the reprint's printing, with its artwork", () => {
    expect(ghalta.set).not.toBe("SPG");
    expect(spg).toMatchObject({ key: `SPG-${spg?.number}`, set: "SPG" });
    expect(spg?.image).toBeTruthy();
    expect(spg?.image).not.toBe(ghalta.image);
    // Several reprints: one printing per set (Doubling Season: Enchanting Tales and Source Material).
    expect(card("Doubling Season").printings?.map((p) => p.set)).toEqual(["WOT", "PZA"]);
    // A card from a reprint-only set has no printing besides its own.
    expect(Object.values(CARDS).filter((c) => c.printings?.some((p) => p.set === c.set))).toEqual([]);
  });

  it('MTGA: "(SPG) 11" chooses the printing, found again on export; legality stays the card\'s', () => {
    const text = `Deck\n2 ${GHALTA} (SPG) ${spg?.number}\n2 ${GHALTA} (RIX) 130\n56 Forest (FDN) 279\n`;
    const parsed = parseDeckList(text, new CardIndex(CARDS));
    expect(parsed.main).toEqual([
      [4, GHALTA, spg?.key],
      [56, "Forest"],
    ]);
    expect(serializeDeckList({ main: parsed.main }, CARDS)).toContain(`4 ${GHALTA} (SPG) ${spg?.number}`);
    const plain: DeckEntries = [
      [4, GHALTA],
      [56, "Forest"],
    ];
    expect(validateDeck({ main: parsed.main }, CARDS)).toEqual(validateDeck({ main: plain }, CARDS));
    // A number that is not a printing of the card: ignored.
    expect(parseDeckList(`4 ${GHALTA} (SPG) 999\n`, new CardIndex(CARDS)).main).toEqual([[4, GHALTA]]);
  });

  it("in game, the object shows the chosen artwork; the replay finds it again; the opponent does not see the hand", () => {
    const main: DeckEntries = [
      [30, GHALTA, spg?.key],
      [30, "Forest"],
    ];
    const other: DeckEntries = [
      [30, GHALTA],
      [30, "Forest"],
    ];
    const { state, record } = createRecordedGame({
      seed: 3,
      players: [
        { id: "p1", name: "A", deck: buildDeck({ main }), printings: deckPrintings({ main }) },
        { id: "p2", name: "B", deck: buildDeck({ main: other }), printings: deckPrintings({ main: other }) },
      ],
    });
    const images = (s: typeof state, p: string) =>
      Object.values(s.objects)
        .filter((o) => o.owner === p && o.defId === ghalta.id)
        .map((o) => s.printings?.[o.uid]);
    expect(new Set(images(state, "p1"))).toEqual(new Set([spg?.key]));
    expect(images(state, "p2").every((k) => k === undefined)).toBe(true);
    const shown = (s: typeof state, viewer: string) =>
      projectView(s, viewer)
        .hand.filter((v) => v.name === GHALTA)
        .map((v) => [v.image, v.fr?.image]);
    const hand1 = shown(state, "p1");
    const hand2 = shown(state, "p2");
    expect(hand1.length).toBeGreaterThan(0);
    expect(new Set(hand1.flat())).toEqual(new Set([spg?.image, spg?.frImage ?? spg?.image]));
    for (const [img] of hand2) expect(img).toBe(ghalta.image);
    // Nothing of p1's hand in p2's view.
    expect(JSON.stringify(projectView(state, "p2"))).not.toContain(spg?.image);
    // The record keeps the printings; the replay restores them.
    const saved = JSON.parse(JSON.stringify(record));
    expect(isGameRecord(saved)).toBe(true);
    expect(saved.players[0].printings).toHaveLength(60);
    expect(saved.players[1].printings).toBeUndefined();
    const replayed = replayGame(saved, (name) => card(name)).state;
    expect(replayed.printings).toEqual(state.printings);
  });

  it("a printing the card does not have is ignored by the engine", () => {
    const main: DeckEntries = [
      [4, "Forest", "SPG-13"],
      [56, "Plains"],
    ];
    const { state } = createRecordedGame({
      seed: 1,
      players: [
        { id: "p1", name: "A", deck: buildDeck({ main }), printings: deckPrintings({ main }) },
        { id: "p2", name: "B", deck: buildDeck({ main }) },
      ],
    });
    expect(state.printings).toBeUndefined();
  });
});

describe("table des impressions", () => {
  const BOLT = "Lightning Bolt";
  const bolt = card(BOLT);
  const sta = findPrinting(bolt, "STA", "42") as string;
  const staJa = printingOptions(bolt).find((p) => p.set === "STA" && p.lang === "ja");

  it("all appearances of a card: its own, its reprints, then the table, without duplicates", () => {
    const options = printingOptions(bolt);
    expect(options[0]).toEqual({ set: bolt.set, number: bolt.number });
    expect(options.length).toBeGreaterThan(10);
    expect(new Set(options.map((p) => `${p.set}-${p.number}`)).size).toBe(options.length);
    expect(keyedPrinting(sta)).toMatchObject({ set: "STA", number: "42" });
    expect(options.find((p) => p.key === sta)).toMatchObject({ setName: "Strixhaven Mystical Archive", year: 2021 });
    // Mystical Archive Japanese versions: printed in Japanese only.
    expect(staJa?.key).toBeTruthy();
    expect(hasPrinting(bolt, staJa?.key as string)).toBe(true);
    // A catalog reprint keeps its key (and its French image); the table does not take it again.
    const doubling = printingOptions(card("Doubling Season"));
    expect(doubling.filter((p) => p.set === "PZA").map((p) => p.key)).toEqual(["PZA-11"]);
  });

  it("each table key can be read (set, number, image) and fits in a server deck line", () => {
    for (const c of Object.values(CARDS))
      for (const p of printingOptions(c).filter((x) => x.key?.includes("@"))) {
        const key = p.key as string;
        expect(keyedPrinting(key), key).toMatchObject({ set: p.set, number: p.number });
        expect(key.length, key).toBeLessThanOrEqual(64);
      }
  });

  it("basic lands: full-art versions only", () => {
    const sets = new Set(printingOptions(card("Forest")).map((p) => p.set));
    // Zendikar, Unstable: full-art forests; Alpha, Magic 2010: forests with an ordinary frame.
    for (const set of ["ZEN", "UST"]) expect(sets.has(set)).toBe(true);
    for (const set of ["LEA", "M10"]) expect(sets.has(set)).toBe(false);
  });

  it("a key that is not a printing of the card is refused", () => {
    expect(hasPrinting(card("Shock"), sta)).toBe(false);
    expect(hasPrinting(bolt, sta.replace(/@.*/, "@0123456789abcdef0123456789abcdef"))).toBe(false);
    expect(hasPrinting(bolt, "STA-42")).toBe(false);
  });

  it('MTGA: "(STA) 42" chooses the table\'s printing if it is loaded, and comes back on export', () => {
    const text = `Deck\n4 ${BOLT} (STA) 42\n56 Mountain\n`;
    const index = new CardIndex(CARDS);
    expect(parseDeckList(text, index, findPrinting).main).toEqual([
      [4, BOLT, sta],
      [56, "Mountain"],
    ]);
    expect(parseDeckList(text, index).main[0]).toEqual([4, BOLT]);
    expect(serializeDeckList({ main: [[4, BOLT, sta]] }, CARDS)).toContain(`4 ${BOLT} (STA) 42`);
  });

  it("in game, the object shows the printing's image; the replay finds it again; the opponent does not see the hand", () => {
    const main: DeckEntries = [
      [30, BOLT, staJa?.key],
      [30, "Mountain"],
    ];
    const image = keyedPrinting(staJa?.key as string)?.image;
    const { state, record } = createRecordedGame({
      seed: 5,
      players: [
        { id: "p1", name: "A", deck: buildDeck({ main }), printings: deckPrintings({ main }) },
        { id: "p2", name: "B", deck: buildDeck({ main }) },
      ],
    });
    const hand = (viewer: string) => projectView(state, viewer).hand.filter((v) => v.name === BOLT);
    expect(hand("p1").length).toBeGreaterThan(0);
    for (const v of hand("p1")) expect([v.image, v.fr?.image]).toEqual([image, image]);
    for (const v of hand("p2")) expect(v.image).toBe(bolt.image);
    expect(JSON.stringify(projectView(state, "p2"))).not.toContain(image);
    const replayed = replayGame(JSON.parse(JSON.stringify(record)), (name) => card(name)).state;
    expect(replayed.printings).toEqual(state.printings);
  });
});

describe("impression personnelle (illustrations locales du serveur)", () => {
  it("The Vision and Mario & Luigi precons take it, each with its art set; the view marks faces, tokens and players", () => {
    const vision = DECKS.find((d) => d.id === "cmd-vision");
    const mario = DECKS.find((d) => d.id === "cmd-mario-luigi");
    expect([vision?.art, mario?.art]).toEqual(["custom:nier", "custom:mario"]);
    const keys = (d: typeof vision) => new Set([...(d?.commander ?? []), ...(d?.main ?? [])].map((e) => e[2]));
    expect([...keys(vision)]).toEqual(["custom:nier"]);
    expect([...keys(mario)]).toEqual(["custom:mario"]);
    // The other precons keep the Scryfall printings.
    expect(DECKS.filter((d) => d.main.some((e) => customArtSet(e[2]) !== undefined)).map((d) => d.id)).toEqual([
      "cmd-vision",
      "cmd-mario-luigi",
    ]);
    // Plain custom printing, or one of an art set (lowercase letters, digits, dashes).
    expect(customPrinting("mario")).toBe("custom:mario");
    expect([customArtSet(CUSTOM_PRINTING), customArtSet("custom:mario"), customArtSet("custom:Bad Set")]).toEqual([
      "",
      "mario",
      undefined,
    ]);
    expect(hasPrinting(card("Sol Ring"), CUSTOM_PRINTING)).toBe(true);
    expect(hasPrinting(card("Sol Ring"), "custom:mario")).toBe(true);
    expect(hasPrinting(card("Sol Ring"), "custom:../x")).toBe(false);
    // p1 plays the "mario" set, p2 the plain custom printing (old decks), p3 none.
    const deck = (key?: string): DeckEntries => [[30, "Sol Ring", ...(key ? [key] : [])] as DeckEntries[number], [30, "Wastes"]];
    const { state } = createRecordedGame({
      seed: 5,
      players: [
        { id: "p1", name: "A", deck: buildDeck({ main: deck() }), printings: deckPrintings({ main: deck("custom:mario") }) },
        { id: "p2", name: "B", deck: buildDeck({ main: deck() }), printings: deckPrintings({ main: deck(CUSTOM_PRINTING) }) },
        { id: "p3", name: "C", deck: buildDeck({ main: deck() }) },
      ],
    });
    const v1 = projectView(state, "p1");
    const rings = v1.hand.filter((v) => v.name === "Sol Ring");
    expect(rings.length).toBeGreaterThan(0);
    for (const v of rings) expect(v.customArt).toBe("mario");
    for (const v of v1.hand.filter((x) => x.name === "Wastes")) expect(v.customArt).toBeUndefined();
    expect([v1.players.p1?.customArt, v1.players.p2?.customArt, v1.players.p3?.customArt]).toEqual(["mario", true, undefined]);
    for (const v of projectView(state, "p2").hand.filter((x) => x.name === "Sol Ring")) expect(v.customArt).toBe(true);
    for (const v of projectView(state, "p3").hand) expect(v.customArt).toBeUndefined();
  });
});
