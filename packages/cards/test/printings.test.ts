/** Impressions (PLAN-G, G1) : l'illustration d'une réédition choisie par le deck, sans rien changer aux règles. */
import { createRecordedGame, isGameRecord, projectView, replayGame } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  buildDeck,
  CARDS,
  CardIndex,
  card,
  type DeckEntries,
  deckPrintings,
  parseDeckList,
  serializeDeckList,
  validateDeck,
} from "../src";

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
