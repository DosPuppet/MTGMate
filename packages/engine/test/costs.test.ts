import { describe, expect, it } from "vitest";
import { fx, spell } from "../src/dsl";
import { legalActions } from "../src/legal";
import { parseManaCost, solvePayment } from "../src/mana";
import { act, customCard, idOf, idsOf, passBoth, scenario } from "./helpers";

const castOption = (s: ReturnType<typeof scenario>, name: string, zone: "hand" | "graveyard" = "hand") =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", zone, name));

describe("coûts (601.2f–h)", () => {
  it("hybride : {G/W} se paie avec une Forêt ou une Plaine", () => {
    const hybrid = customCard({
      name: "Hybride",
      manaCost: parseManaCost("{1}{G/W}"),
      manaCostText: "{1}{G/W}",
      power: 2,
      toughness: 2,
    });
    let s = scenario({ p1: { battlefield: ["Plains", "Mountain"], hand: [hybrid] } });
    expect(castOption(s, "Hybride")).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hybride") });
    expect(s.stack).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: [hybrid] } });
    expect(castOption(t, "Hybride")).toBeUndefined();
  });

  it("coût additionnel : Thrill of Possibility défausse une carte choisie", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Thrill of Possibility", "Forest", "Bear Cub"] } });
    const opt = castOption(s, "Thrill of Possibility");
    expect(opt?.type === "cast" && opt.additional?.discard?.count).toBe(1);
    const forest = idOf(s, "p1", "hand", "Forest");
    // Sans la défausse, le lancement est refusé.
    expect(() => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thrill of Possibility") })).toThrow();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thrill of Possibility"), discard: [forest] });
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
    s = passBoth(s);
    expect(s.players.p1?.hand).toHaveLength(3); // Bear Cub + 2 cartes piochées
  });

  it("coût additionnel : Arbiter of Woe demande de sacrifier une créature", () => {
    const s = scenario({ p1: { battlefield: Array(6).fill("Swamp"), hand: ["Arbiter of Woe"] } });
    expect(castOption(s, "Arbiter of Woe")).toBeUndefined(); // aucune créature à sacrifier
    let t = scenario({ p1: { battlefield: [...Array(6).fill("Swamp"), "Bear Cub"], hand: ["Arbiter of Woe"] } });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Arbiter of Woe"),
      sacrifice: [idOf(t, "p1", "battlefield", "Bear Cub")],
    });
    expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("flashback : Think Twice se relance depuis le cimetière puis est exilée", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island", "Island"], graveyard: ["Think Twice"] } });
    const opt = castOption(s, "Think Twice", "graveyard");
    expect(opt?.type === "cast" && opt.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") });
    s = passBoth(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(1);
  });

  it("réductions : Ghalta coûte X de moins, Dragonlord's Servant réduit les Dragons", () => {
    // 12 de coût, créatures pour 12 de force : Ghalta ne coûte plus que {G}{G}.
    const s = scenario({ p1: { battlefield: ["Forest", "Forest", "Quakestrider Ceratops"], hand: ["Ghalta, Primal Hunger"] } });
    expect(castOption(s, "Ghalta, Primal Hunger")).toBeDefined();
    const t = scenario({
      p1: { battlefield: [...Array(4).fill("Mountain"), "Dragonlord's Servant"], hand: ["Rapacious Dragon"] },
    });
    expect(castOption(t, "Rapacious Dragon")).toBeDefined(); // {4}{R} - {1}
  });

  it("Trésor : utilisé seulement si les terrains ne suffisent pas", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain"), hand: ["Rapacious Dragon", "Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rapacious Dragon") });
    s = passBoth(s);
    s = passBoth(s); // déclenchement : deux Trésors
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    // Bear Cub ({1}{G}) : aucun terrain ne produit du vert, les deux Trésors sont sacrifiés.
    const plan = solvePayment(s, "p1", parseManaCost("{1}{G}"));
    expect(plan?.taps.length).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
  });

  it("un sort à X reste lançable avec X = 0 et affiche le X maximal", () => {
    const fireball = customCard({
      name: "Boule de feu",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      manaCost: parseManaCost("{X}{R}"),
      manaCostText: "{X}{R}",
      spell: spell([], [fx.draw(1)]),
    });
    const s = scenario({ p1: { battlefield: Array(4).fill("Mountain"), hand: [fireball] } });
    const opt = castOption(s, "Boule de feu");
    expect(opt?.type === "cast" && opt.xMax).toBe(3);
  });
});
