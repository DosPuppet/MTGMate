import { describe, expect, it } from "vitest";
import { fx, spell } from "../src/dsl";
import { legalActions } from "../src/legal";
import { availableMana, parseManaCost, solvePayment } from "../src/mana";
import { act, customCard, idOf, idsOf, passBoth, scenario } from "./helpers";

const castOption = (s: ReturnType<typeof scenario>, name: string, zone: "hand" | "graveyard" = "hand") =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", zone, name));

describe("costs (601.2f–h)", () => {
  it("hybrid: {G/W} can be paid with a Forest or a Plains", () => {
    const hybrid = customCard({
      name: "Hybrid",
      manaCost: parseManaCost("{1}{G/W}"),
      manaCostText: "{1}{G/W}",
      power: 2,
      toughness: 2,
    });
    let s = scenario({ p1: { battlefield: ["Plains", "Mountain"], hand: [hybrid] } });
    expect(castOption(s, "Hybrid")).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hybrid") });
    expect(s.stack).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: [hybrid] } });
    expect(castOption(t, "Hybrid")).toBeUndefined();
  });

  it("additional cost: Thrill of Possibility discards a chosen card", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Thrill of Possibility", "Forest", "Bear Cub"] } });
    const opt = castOption(s, "Thrill of Possibility");
    expect(opt?.type === "cast" && opt.additional?.discard?.count).toBe(1);
    const forest = idOf(s, "p1", "hand", "Forest");
    // Without the discard, casting is refused.
    expect(() => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thrill of Possibility") })).toThrow();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thrill of Possibility"), discard: [forest] });
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
    s = passBoth(s);
    expect(s.players.p1?.hand).toHaveLength(3); // Bear Cub + 2 drawn cards
  });

  it("additional cost: Arbiter of Woe requires sacrificing a creature", () => {
    const s = scenario({ p1: { battlefield: Array(6).fill("Swamp"), hand: ["Arbiter of Woe"] } });
    expect(castOption(s, "Arbiter of Woe")).toBeUndefined(); // no creature to sacrifice
    let t = scenario({ p1: { battlefield: [...Array(6).fill("Swamp"), "Bear Cub"], hand: ["Arbiter of Woe"] } });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Arbiter of Woe"),
      sacrifice: [idOf(t, "p1", "battlefield", "Bear Cub")],
    });
    expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("flashback: Think Twice is cast again from the graveyard then exiled", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island", "Island"], graveyard: ["Think Twice"] } });
    const opt = castOption(s, "Think Twice", "graveyard");
    expect(opt?.type === "cast" && opt.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") });
    s = passBoth(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(1);
  });

  it("reductions: Ghalta costs X less, Dragonlord's Servant reduces Dragons", () => {
    // Cost 12, creatures with 12 total power: Ghalta now costs only {G}{G}.
    const s = scenario({ p1: { battlefield: ["Forest", "Forest", "Quakestrider Ceratops"], hand: ["Ghalta, Primal Hunger"] } });
    expect(castOption(s, "Ghalta, Primal Hunger")).toBeDefined();
    const t = scenario({
      p1: { battlefield: [...Array(4).fill("Mountain"), "Dragonlord's Servant"], hand: ["Rapacious Dragon"] },
    });
    expect(castOption(t, "Rapacious Dragon")).toBeDefined(); // {4}{R} - {1}
  });

  it("Treasure: used only if the lands are not enough", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain"), hand: ["Rapacious Dragon", "Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rapacious Dragon") });
    s = passBoth(s);
    s = passBoth(s); // trigger: two Treasures
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    // Bear Cub ({1}{G}): no land produces green, both Treasures are sacrificed.
    const plan = solvePayment(s, "p1", parseManaCost("{1}{G}"));
    expect(plan?.taps.length).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
  });

  it("an X spell stays castable with X = 0 and shows the maximum X", () => {
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

describe("solveur de paiement", () => {
  it("a land with two {T} mana abilities is only committed once", () => {
    // "Lands you control have '{T}: Add one mana of any color'": each Forest then has
    // two mana abilities, but only one can be used.
    const prism = customCard({
      name: "Prisme",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [
        {
          kind: "static",
          affects: { types: ["Land"], controller: "you" },
          mods: { addAbilities: [{ kind: "mana", cost: { tap: true }, produce: ["W", "U", "B", "R", "G"], amount: 1 }] },
        },
      ],
    });
    const s = scenario({ p1: { battlefield: ["Forest", prism] } });
    expect(solvePayment(s, "p1", parseManaCost("{2}"))).toBeNull();
    expect(solvePayment(s, "p1", parseManaCost("{U}"))?.taps).toHaveLength(1);
    expect(availableMana(s, "p1")).toBe(1);
  });
});

describe("Mana abilities with a cost (605.1a, 605.3b): without the stack", () => {
  const capital = (active: "p1" | "p2") => {
    const s = scenario({
      active,
      p1: { battlefield: ["Capital City", "Plains"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    return s;
  };
  const activateCity = (s: ReturnType<typeof scenario>) => {
    const city = idOf(s, "p1", "battlefield", "Capital City");
    const a = legalActions(s, "p1").find(
      (x) =>
        x.type === "activate" &&
        x.source === city &&
        s.defs[s.objects[city]?.defId ?? ""]?.abilities[x.ability]?.kind === "activated",
    );
    if (a?.type !== "activate") throw new Error("ability unavailable");
    return act(s, "p1", { type: "activate", source: city, ability: a.ability });
  };

  it("Capital City: mana is added without using the stack, and the player keeps priority", () => {
    let s = activateCity(capital("p1"));
    expect(s.stack).toHaveLength(0);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("manaColor");
    s = act(s, "p1", { type: "choose", values: ["B"] });
    expect(s.stack).toHaveLength(0);
    expect(s.players.p1?.manaPool.B).toBe(1);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("in response to an opposing spell: the spell stays alone on the stack, priority returns to the player who activated", () => {
    let s = capital("p2");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    s = activateCity(s);
    s = act(s, "p1", { type: "choose", values: ["R"] });
    expect(s.stack.map((x) => s.defs[x.sourceDefId]?.name)).toEqual(["Burst Lightning"]);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.manaPool.R).toBe(1);
  });
});
