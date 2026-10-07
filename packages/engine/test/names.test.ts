/**
 * Questions « nom » (nom de carte, de carte de terrain, type de créature) : elles ne listent plus les cartes de la partie
 * (la decklist adverse) ; des noms publics sont mis en avant, et tout nom du catalogue (types de créature : la liste
 * officielle, 205.3m) est accepté. Un nom inconnu est refusé (RulesError) ; un nom de la partie l'est toujours (parties
 * enregistrées avant le catalogue).
 */
import { nameCatalog } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { CREATURE_TYPES, registerNameCatalog } from "../src/names";
import type { ChoiceRequest, GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, cast, customCard, idOf, lands, passUntil, scenario, settle } from "./helpers";

type NameRequest = Extract<ChoiceRequest, { type: "name" }>;

/** La question « nom » en attente (lève sinon). */
function nameRequest(s: GameState): NameRequest {
  const p = s.pending;
  if (p?.kind !== "choice" || p.request.type !== "name") throw new Error(`pas de question « nom » : ${JSON.stringify(p)}`);
  return p.request;
}

const untilChoice = (s: GameState) => passUntil(s, (x) => x.pending?.kind === "choice");

/** Cartes cachées de p2 (main, bibliothèque), à ne jamais voir dans la question de p1. */
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

  it("noms publics seulement : permanents adverses, puis les vôtres, puis les cimetières ; rien de la main ni de la bibliothèque adverses", () => {
    const req = nameRequest(start());
    expect(req.of).toBe("card");
    expect(req.featured.slice(0, 3)).toEqual(["Engine Rat", "Plains", "Bear Cub"]);
    expect(req.featured).toContain("Llanowar Elves");
    expect(req.suggested).toEqual(["Engine Rat"]);
    const seen = JSON.stringify(projectView(start(), "p1").pending);
    for (const hidden of ["Shock", "Sheoldred, the Apocalypse", "Hallowed Fountain"]) expect(seen).not.toContain(hidden);
  });

  it("la question ne dépend pas du catalogue (même partie, même question)", () => {
    const without = nameRequest(start());
    registerNameCatalog(nameCatalog());
    expect(nameRequest(start())).toEqual(without);
  });

  it("un nom du catalogue absent de la partie est accepté (avec le catalogue), un nom inconnu est refusé", () => {
    let s = start();
    expect(() => act(s, "p1", { type: "choose", values: ["Lightning Bolt Imaginaire"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Steam Vents"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Engine Rat", "Bear Cub"] })).toThrow(RulesError);
    registerNameCatalog(nameCatalog());
    s = settle(act(s, "p1", { type: "choose", values: ["Steam Vents"] }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Skyseer's Chariot")]?.chosen?.cardName).toBe("Steam Vents");
  });

  it("un nom d'une carte de la partie, même cachée, reste accepté sans catalogue (parties enregistrées avant lui)", () => {
    const s = settle(act(start(), "p1", { type: "choose", values: ["Shock"] }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Skyseer's Chariot")]?.chosen?.cardName).toBe("Shock");
  });
});

describe("nom de carte (Ancient Vendetta)", () => {
  it("les cimetières adverses en tête ; tout nom du catalogue est accepté", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] },
      p2: { battlefield: ["Engine Rat"], graveyard: ["Llanowar Elves"], ...HIDDEN },
    });
    s = untilChoice(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } }));
    const req = nameRequest(s);
    expect(req.featured.slice(0, 2)).toEqual(["Llanowar Elves", "Engine Rat"]);
    expect(req.suggested).toEqual(["Llanowar Elves"]);
    expect(req.featured).not.toContain("Sheoldred, the Apocalypse");
    expect(() => act(s, "p1", { type: "choose", values: ["Nom inventé"] })).toThrow(RulesError);
    // Nommer une carte de la bibliothèque adverse (par le catalogue) : elle est exilée.
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

  it("terrains publics, non de base d'abord ; jamais un terrain caché", () => {
    const req = nameRequest(start());
    expect(req.of).toBe("land");
    expect(req.featured.slice(0, 2)).toEqual(["Steam Vents", "Mountain"]);
    expect(req.featured).toContain("Cavern of Souls");
    expect(req.featured).not.toContain("Hallowed Fountain");
    expect(req.featured).not.toContain("Engine Rat");
    expect(req.suggested).toEqual(["Steam Vents"]);
  });

  it("un terrain du catalogue est accepté ; une carte qui n'est pas un terrain est refusée", () => {
    const s = start();
    registerNameCatalog(nameCatalog());
    expect(() => act(s, "p1", { type: "choose", values: ["Shock"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Nom inventé"] })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "choose", values: ["Watery Grave"] }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Petrified Hamlet")]?.chosen?.cardName).toBe("Watery Grave");
  });
});

describe("type de créature (205.3m)", () => {
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
            hand: [customCard({ name: "Gobelin caché", subtypes: ["Goblin"], power: 1, toughness: 1 })],
          },
        }),
        "p1",
        "Leyline of Transformation",
      ),
    );

  it("toute la liste officielle, sans la lister ; vos types d'abord, puis ceux des créatures en jeu", () => {
    expect(CREATURE_TYPES).toHaveLength(324);
    expect(CREATURE_TYPES).toContain("Time Lord");
    const req = nameRequest(start());
    expect(req.of).toBe("creatureType");
    expect(req.featured).toEqual(expect.arrayContaining(["Bear", "Elf", "Druid", "Angel"]));
    expect(req.featured.indexOf("Angel")).toBeGreaterThan(req.featured.indexOf("Elf"));
    // Ni la Phyrexienne de la bibliothèque adverse ni le Gobelin de sa main.
    expect(req.featured).not.toContain("Phyrexian");
    expect(req.featured).not.toContain("Goblin");
    expect(JSON.stringify(projectView(start(), "p1").pending)).not.toContain("Phyrexian");
  });

  it("un type de la liste absent de la partie est accepté ; un type inconnu est refusé", () => {
    const s = start();
    expect(() => act(s, "p1", { type: "choose", values: ["Plains"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "choose", values: ["Pas un type"] })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "choose", values: ["Phelddagrif"] }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Leyline of Transformation")]?.chosen?.creatureType).toBe("Phelddagrif");
  });
});
