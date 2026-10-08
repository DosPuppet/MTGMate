/**
 * Impressions (PLAN-G, G1) : l'illustration d'une réédition, ou d'une impression de la table (`printings.ts`), choisie
 * par le deck, sans rien changer aux règles.
 */
import { CUSTOM_PRINTING, createRecordedGame, isGameRecord, keyedPrinting, projectView, replayGame } from "@mtgx/engine";
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

describe("impressions des rééditions", () => {
  it("une carte déjà connue reçoit l'impression de la réédition, avec son illustration", () => {
    expect(ghalta.set).not.toBe("SPG");
    expect(spg).toMatchObject({ key: `SPG-${spg?.number}`, set: "SPG" });
    expect(spg?.image).toBeTruthy();
    expect(spg?.image).not.toBe(ghalta.image);
    // Plusieurs rééditions : une impression par ensemble (Doubling Season : Enchanting Tales et Source Material).
    expect(card("Doubling Season").printings?.map((p) => p.set)).toEqual(["WOT", "PZA"]);
    // Une carte d'un ensemble de rééditions seulement n'a pas d'impression en plus d'elle-même.
    expect(Object.values(CARDS).filter((c) => c.printings?.some((p) => p.set === c.set))).toEqual([]);
  });

  it("MTGA : « (SPG) 11 » choisit l'impression, retrouvée à l'export ; la légalité reste celle de la carte", () => {
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
    // Un numéro qui n'est pas une impression de la carte : ignoré.
    expect(parseDeckList(`4 ${GHALTA} (SPG) 999\n`, new CardIndex(CARDS)).main).toEqual([[4, GHALTA]]);
  });

  it("en partie, l'objet montre l'illustration choisie ; le replay la retrouve ; l'adversaire ne voit pas la main", () => {
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
    // Rien de la main de p1 dans la vue de p2.
    expect(JSON.stringify(projectView(state, "p2"))).not.toContain(spg?.image);
    // L'enregistrement garde les impressions ; le rejeu les rétablit.
    const saved = JSON.parse(JSON.stringify(record));
    expect(isGameRecord(saved)).toBe(true);
    expect(saved.players[0].printings).toHaveLength(60);
    expect(saved.players[1].printings).toBeUndefined();
    const replayed = replayGame(saved, (name) => card(name)).state;
    expect(replayed.printings).toEqual(state.printings);
  });

  it("une impression que la carte n'a pas est ignorée par le moteur", () => {
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

  it("toutes les apparences d'une carte : la sienne, ses rééditions, puis la table, sans doublon", () => {
    const options = printingOptions(bolt);
    expect(options[0]).toEqual({ set: bolt.set, number: bolt.number });
    expect(options.length).toBeGreaterThan(10);
    expect(new Set(options.map((p) => `${p.set}-${p.number}`)).size).toBe(options.length);
    expect(keyedPrinting(sta)).toMatchObject({ set: "STA", number: "42" });
    expect(options.find((p) => p.key === sta)).toMatchObject({ setName: "Strixhaven Mystical Archive", year: 2021 });
    // Archives mystiques japonaises : imprimées en japonais seulement.
    expect(staJa?.key).toBeTruthy();
    expect(hasPrinting(bolt, staJa?.key as string)).toBe(true);
    // Une réédition du catalogue garde sa clé (et son image française) ; la table ne la reprend pas.
    const doubling = printingOptions(card("Doubling Season"));
    expect(doubling.filter((p) => p.set === "PZA").map((p) => p.key)).toEqual(["PZA-11"]);
  });

  it("chaque clé de la table se lit (ensemble, numéro, image) et tient dans une ligne de deck du serveur", () => {
    for (const c of Object.values(CARDS))
      for (const p of printingOptions(c).filter((x) => x.key?.includes("@"))) {
        const key = p.key as string;
        expect(keyedPrinting(key), key).toMatchObject({ set: p.set, number: p.number });
        expect(key.length, key).toBeLessThanOrEqual(64);
      }
  });

  it("terrains de base : les versions pleine carte seulement", () => {
    const sets = new Set(printingOptions(card("Forest")).map((p) => p.set));
    // Zendikar, Unstable : forêts pleine carte ; Alpha, Magic 2010 : forêts à cadre ordinaire.
    for (const set of ["ZEN", "UST"]) expect(sets.has(set)).toBe(true);
    for (const set of ["LEA", "M10"]) expect(sets.has(set)).toBe(false);
  });

  it("une clé qui n'est pas une impression de la carte est refusée", () => {
    expect(hasPrinting(card("Shock"), sta)).toBe(false);
    expect(hasPrinting(bolt, sta.replace(/@.*/, "@0123456789abcdef0123456789abcdef"))).toBe(false);
    expect(hasPrinting(bolt, "STA-42")).toBe(false);
  });

  it("MTGA : « (STA) 42 » choisit l'impression de la table si elle est chargée, et revient à l'export", () => {
    const text = `Deck\n4 ${BOLT} (STA) 42\n56 Mountain\n`;
    const index = new CardIndex(CARDS);
    expect(parseDeckList(text, index, findPrinting).main).toEqual([
      [4, BOLT, sta],
      [56, "Mountain"],
    ]);
    expect(parseDeckList(text, index).main[0]).toEqual([4, BOLT]);
    expect(serializeDeckList({ main: [[4, BOLT, sta]] }, CARDS)).toContain(`4 ${BOLT} (STA) 42`);
  });

  it("en partie, l'objet montre l'image de l'impression ; le replay la retrouve ; l'adversaire ne voit pas la main", () => {
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
  it("le préconstruit The Vision la prend pour chaque carte ; la vue marque ses faces, ses jetons et son joueur", () => {
    const vision = DECKS.find((d) => d.id === "cmd-vision");
    expect(vision?.art).toBe("custom");
    expect([...(vision?.commander ?? []), ...(vision?.main ?? [])].every((e) => e[2] === CUSTOM_PRINTING)).toBe(true);
    // Les autres préconstruits gardent les impressions de Scryfall.
    expect(DECKS.filter((d) => d.main.some((e) => e[2] === CUSTOM_PRINTING)).map((d) => d.id)).toEqual(["cmd-vision"]);
    expect(hasPrinting(card("Sol Ring"), CUSTOM_PRINTING)).toBe(true);
    const main: DeckEntries = [
      [30, "Sol Ring", CUSTOM_PRINTING],
      [30, "Wastes"],
    ];
    const { state } = createRecordedGame({
      seed: 5,
      players: [
        { id: "p1", name: "A", deck: buildDeck({ main }), printings: deckPrintings({ main }) },
        { id: "p2", name: "B", deck: buildDeck({ main }) },
      ],
    });
    const v1 = projectView(state, "p1");
    const rings = v1.hand.filter((v) => v.name === "Sol Ring");
    expect(rings.length).toBeGreaterThan(0);
    for (const v of rings) expect(v.customArt).toBe(true);
    for (const v of v1.hand.filter((x) => x.name === "Wastes")) expect(v.customArt).toBeUndefined();
    expect(v1.players.p1?.customArt).toBe(true);
    expect(v1.players.p2?.customArt).toBeUndefined();
    for (const v of projectView(state, "p2").hand) expect(v.customArt).toBeUndefined();
  });
});
