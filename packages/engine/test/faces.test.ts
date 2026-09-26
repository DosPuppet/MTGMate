/**
 * Cartes à plusieurs faces (branche Standard, lots 0.3 à 0.6) : aventures et présages.
 */
import { describe, expect, it } from "vitest";
import { fx, ref, spell, target } from "../src/dsl";
import { legalActions } from "../src/legal";
import { parseManaCost } from "../src/mana";
import { chars } from "../src/state";
import type { CardDef, GameState } from "../src/types";
import { act, customCard, idOf, passBoth, scenario } from "./helpers";

/** Aventure de test : « Ourson rêveur » 2/2 {1}{G} // « Pique-nique » rituel {G} : piochez une carte. */
const creatureFace = customCard({
  name: "Ourson rêveur",
  manaCost: parseManaCost("{1}{G}"),
  manaCostText: "{1}{G}",
  colors: ["G"],
  power: 2,
  toughness: 2,
});
const adventureFace = customCard({
  name: "Pique-nique",
  typeLine: "Sorcery — Adventure",
  types: ["Sorcery"],
  subtypes: ["Adventure"],
  manaCost: parseManaCost("{G}"),
  manaCostText: "{G}",
  colors: ["G"],
  spell: spell([], [fx.draw(1)]),
});
const ADVENTURER: CardDef = {
  ...creatureFace,
  id: "test-ourson-reveur-pique-nique",
  name: "Ourson rêveur // Pique-nique",
  layout: "adventure",
  faceDefs: [
    { ...creatureFace, id: "test-ourson__0" },
    { ...adventureFace, id: "test-ourson__1" },
  ],
};

/** Présage de test : « Augure » rituel {1} : 1 blessure à n'importe quelle cible, puis mélangé dans la bibliothèque. */
const OMEN = customCard({
  name: "Augure",
  typeLine: "Sorcery — Omen",
  types: ["Sorcery"],
  subtypes: ["Omen"],
  manaCost: parseManaCost("{1}"),
  manaCostText: "{1}",
  spell: spell([target.any()], [fx.damage(1, ref.target())]),
});

const castOptions = (s: GameState, card: string) => legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === card);

describe("aventures (715)", () => {
  it("deux options : la créature et l'aventure ; l'aventure a ses propres caractéristiques sur la pile", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: [ADVENTURER] } });
    const card = idOf(s, "p1", "hand", ADVENTURER.name);
    const opts = castOptions(s, card);
    expect(opts.map((o) => (o.type === "cast" ? (o.faceName ?? "recto") : ""))).toEqual(["recto", "Pique-nique"]);
    s = act(s, "p1", { type: "cast", card, face: 1 });
    const onStack = s.stack[0]?.sourceId as string;
    expect(chars(s, onStack).types).toEqual(["Sorcery"]);
    expect(chars(s, onStack).name).toBe("Pique-nique");
  });

  it("l'aventure résolue part en exil « en aventure » ; seule la créature se lance ensuite depuis l'exil", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Forest"], hand: [ADVENTURER] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ADVENTURER.name), face: 1 });
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand); // la carte est partie, une carte piochée
    const exiled = s.exile.find((id) => s.objects[id]?.defId === ADVENTURER.id) as string;
    expect(s.objects[exiled]?.onAdventure).toBe(true);
    const opts = castOptions(s, exiled);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.type === "cast" && opts[0].face).toBeUndefined();
    s = act(s, "p1", { type: "cast", card: exiled });
    s = passBoth(s);
    expect(idOf(s, "p1", "battlefield", ADVENTURER.name)).toBeDefined();
    expect(() => act(s, "p1", { type: "cast", card: exiled, face: 1 })).toThrow();
  });

  it("une aventure contrecarrée va au cimetière (et non en exil)", () => {
    let s = scenario({
      p1: { battlefield: ["Forest"], hand: [ADVENTURER] },
      p2: { battlefield: ["Island", "Island", "Island"], hand: ["Cancel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ADVENTURER.name), face: 1 });
    const spellId = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Cancel"), targets: { t: [spellId] } });
    s = passBoth(s);
    expect(idOf(s, "p1", "graveyard", ADVENTURER.name)).toBeDefined();
    expect(s.exile.some((id) => s.objects[id]?.defId === ADVENTURER.id)).toBe(false);
  });
});

describe("présages (Tarkir: Dragonstorm)", () => {
  it("un présage résolu est mélangé dans la bibliothèque de son propriétaire", () => {
    let s = scenario({ p1: { battlefield: ["Forest"], hand: [OMEN] } });
    const library = s.players.p1?.library.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Augure"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.library.length).toBe(library + 1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });
});

describe("présage à deux faces (disposition « adventure » chez Scryfall)", () => {
  it("la face présage lancée est mélangée dans la bibliothèque, pas exilée en aventure", () => {
    const omenFace = { ...OMEN, id: "test-dragon__1", name: "Augure du dragon" };
    const dragon: CardDef = {
      ...creatureFace,
      id: "test-dragon",
      name: "Dragon // Augure du dragon",
      layout: "adventure",
      faceDefs: [{ ...creatureFace, id: "test-dragon__0" }, omenFace],
    };
    let s = scenario({ p1: { battlefield: ["Forest"], hand: [dragon] } });
    const library = s.players.p1?.library.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", dragon.name), face: 1, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p1?.library.length).toBe(library + 1);
    expect(s.exile).toHaveLength(0);
  });
});
