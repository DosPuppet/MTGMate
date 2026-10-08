/**
 * "Name" questions (card name, land card name, creature type): they no longer list the cards of the game
 * (the opposing decklist); public names are featured first, and any catalog name (creature types: the
 * official list, 205.3m) is accepted. An unknown name is refused (RulesError); a name from the game still is (games
 * saved before the catalog).
 */
import { nameCatalog } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { CREATURE_TYPES, registerNameCatalog } from "../src/names";
import type { ChoiceRequest, GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, cast, customCard, idOf, lands, passUntil, scenario, settle } from "./helpers";

type NameRequest = Extract<ChoiceRequest, { type: "name" }>;

/** The pending "name" question (throws otherwise). */
function nameRequest(s: GameState): NameRequest {
  const p = s.pending;
  if (p?.kind !== "choice" || p.request.type !== "name") throw new Error(`no "name" question: ${JSON.stringify(p)}`);
  return p.request;
}

const untilChoice = (s: GameState) => passUntil(s, (x) => x.pending?.kind === "choice");

/** p2's hidden cards (hand, library), never to be seen in p1's question. */
const HIDDEN = { hand: ["Shock"], library: ["Sheoldred, the Apocalypse", "Hallowed Fountain", "Opt"] };

afterEach(() => registerNameCatalog(null));

describe("nom de carte (Skyseer's Chariot)", () => {
  const start = () =>
    untilChoice(
      cast(
        scenario({
          p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Skyseer's Chariot"] },
          p2: { battlefield: ["Engine Rat"], graveyard: ["Llanowar Elves"], ...HIDDEN },
        }),
        "p1",
        "Skyseer's Chariot",
      ),
    );

  it("public names only: opposing permanents, then yours, then graveyards; nothing from the opposing hand or library", () => {
    const req = nameRequest(start());
    expect(req.of).toBe("card");
    expect(req.featured.slice(0, 3)).toEqual(["Engine Rat", "Plains", "Bear Cub"]);
    expect(req.featured).toContain("Llanowar Elves");
    expect(req.suggested).toEqual(["Engine Rat"]);
    const seen = JSON.stringify(projectView(start(), "p1").pending);
    for (const hidden of ["Shock", "Sheoldred, the Apocalypse", "Hallowed Fountain"]) expect(seen).not.toContain(hidden);
  });

  it("the question does not depend on the catalog (same game, same question)", () => {
    const without = nameRequest(start());
    registerNameCatalog(nameCatalog());
    expect(nameRequest(start())).toEqual(without);
  });

  it("a catalog name absent from the game is accepted (with the catalog), an unknown name is refused", () => {
    let s = start();
    expect(() => act(s, "p1", { type: "choose", values: ["Lightning Bolt Imaginaire"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Steam Vents"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Engine Rat", "Bear Cub"] })).toThrow(RulesError);
    registerNameCatalog(nameCatalog());
    s = settle(act(s, "p1", { type: "choose", values: ["Steam Vents"] }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Skyseer's Chariot")]?.chosen?.cardName).toBe("Steam Vents");
  });

  it("a name from a card in the game, even hidden, is still accepted without a catalog (games saved before it)", () => {
    const s = settle(act(start(), "p1", { type: "choose", values: ["Shock"] }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Skyseer's Chariot")]?.chosen?.cardName).toBe("Shock");
  });
});

describe("nom de carte (Ancient Vendetta)", () => {
  it("opposing graveyards first; any catalog name is accepted", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] },
      p2: { battlefield: ["Engine Rat"], graveyard: ["Llanowar Elves"], ...HIDDEN },
    });
    s = untilChoice(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } }));
    const req = nameRequest(s);
    expect(req.featured.slice(0, 2)).toEqual(["Llanowar Elves", "Engine Rat"]);
    expect(req.suggested).toEqual(["Llanowar Elves"]);
    expect(req.featured).not.toContain("Sheoldred, the Apocalypse");
    expect(() => act(s, "p1", { type: "choose", values: ["Invented name"] })).toThrow(RulesError);
    // Naming a card from the opposing library (through the catalog): it is exiled.
    registerNameCatalog(nameCatalog());
    s = settle(act(s, "p1", { type: "choose", values: ["Sheoldred, the Apocalypse"] }));
    expect(s.players.p2?.library.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Sheoldred, the Apocalypse")).toBe(
      false,
    );
  });
});

describe("nom de carte de terrain (Petrified Hamlet)", () => {
  const start = () => {
    const s = scenario({
      p1: { hand: ["Petrified Hamlet"] },
      p2: { battlefield: ["Mountain", "Steam Vents"], graveyard: ["Cavern of Souls"], ...HIDDEN },
    });
    return untilChoice(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Petrified Hamlet") }));
  };

  it("public lands, nonbasic first; never a hidden land", () => {
    const req = nameRequest(start());
    expect(req.of).toBe("land");
    expect(req.featured.slice(0, 2)).toEqual(["Steam Vents", "Mountain"]);
    expect(req.featured).toContain("Cavern of Souls");
    expect(req.featured).not.toContain("Hallowed Fountain");
    expect(req.featured).not.toContain("Engine Rat");
    expect(req.suggested).toEqual(["Steam Vents"]);
  });

  it("a catalog land is accepted; a card that is not a land is refused", () => {
    const s = start();
    registerNameCatalog(nameCatalog());
    expect(() => act(s, "p1", { type: "choose", values: ["Shock"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Invented name"] })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "choose", values: ["Watery Grave"] }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Petrified Hamlet")]?.chosen?.cardName).toBe("Watery Grave");
  });
});

describe("creature type (205.3m)", () => {
  const start = () =>
    untilChoice(
      cast(
        scenario({
          p1: {
            battlefield: [...lands("Island", 4), "Bear Cub"],
            hand: ["Leyline of Transformation"],
            library: ["Llanowar Elves"],
          },
          p2: {
            battlefield: ["Serra Angel"],
            library: ["Sheoldred, the Apocalypse"],
            hand: [customCard({ name: "Hidden Goblin", subtypes: ["Goblin"], power: 1, toughness: 1 })],
          },
        }),
        "p1",
        "Leyline of Transformation",
      ),
    );

  it("the whole official list, without listing it; your types first, then those of creatures in play", () => {
    expect(CREATURE_TYPES).toHaveLength(324);
    expect(CREATURE_TYPES).toContain("Time Lord");
    const req = nameRequest(start());
    expect(req.of).toBe("creatureType");
    expect(req.featured).toEqual(expect.arrayContaining(["Bear", "Elf", "Druid", "Angel"]));
    expect(req.featured.indexOf("Angel")).toBeGreaterThan(req.featured.indexOf("Elf"));
    // Neither the Phyrexian in the opposing library nor the Goblin in its hand.
    expect(req.featured).not.toContain("Phyrexian");
    expect(req.featured).not.toContain("Goblin");
    expect(JSON.stringify(projectView(start(), "p1").pending)).not.toContain("Phyrexian");
  });

  it("a type from the list absent from the game is accepted; an unknown type is refused", () => {
    const s = start();
    expect(() => act(s, "p1", { type: "choose", values: ["Plains"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Not a type"] })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "choose", values: ["Phelddagrif"] }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Leyline of Transformation")]?.chosen?.creatureType).toBe("Phelddagrif");
  });
});
