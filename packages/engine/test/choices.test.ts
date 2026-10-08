import { describe, expect, it } from "vitest";
import { fx, ref, spell, target } from "../src/dsl";
import { projectView } from "../src/view";
import { act, customCard, idOf, idsOf, passBoth, scenario } from "./helpers";

const sorcery = (name: string, effects: Parameters<typeof spell>[1], targets: Parameters<typeof spell>[0] = []) =>
  customCard({
    name,
    typeLine: "Sorcery",
    types: ["Sorcery"],
    power: undefined,
    toughness: undefined,
    spell: spell(targets, effects),
  });

const SCRY2 = sorcery("Scrying", [fx.scry(2), fx.draw(1)]);
const MIND_ROT = sorcery("Mind Rot", [fx.discard(2, ref.target())], [target.player("t", "opponent")]);
const EDICT = sorcery("Edict", [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })]);
const MAYBE = sorcery("Maybe", [fx.may("draw a card?", fx.draw(1)), fx.gainLife(1)]);
const LEGEND = customCard({ name: "Unique Hero", supertypes: ["Legendary"], power: 2, toughness: 2 });

describe("resolution suspended on a choice", () => {
  it("scry 2: you choose the bottom, then the order, then you draw", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub", "Mountain", "Giant Growth"] } });
    const [forest, bear] = s.players.p1?.library ?? [];
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Scrying")[0] as string });
    s = passBoth(s);
    // First question: which cards to put on the bottom?
    expect(s.flow).toBe("resolving");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type === "pick" && p.request.options).toEqual([forest, bear]);
    // The choosing player sees the hidden cards; the opponent doesn't.
    const mine = projectView(s, "p1").pending;
    expect(mine?.kind === "choice" && mine.objects?.map((o) => o.name)).toEqual(["Forest", "Bear Cub"]);
    const theirs = projectView(s, "p2").pending;
    expect(theirs?.kind === "choice" && theirs.request).toBeUndefined();
    s = act(s, "p1", { type: "choose", values: [forest as string] });
    // Only one card stays on top: no order question, you draw the bear.
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Bear Cub"]);
    expect(s.players.p1?.library.at(-1)).toBe(forest);
    expect(idsOf(s, "p1", "graveyard", "Scrying")).toHaveLength(1);
  });

  it("scry 2 keeping everything: order question", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub", "Mountain"] } });
    const [forest, bear] = s.players.p1?.library ?? [];
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Scrying")[0] as string });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [] });
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type).toBe("order");
    s = act(s, "p1", { type: "choose", values: [bear as string, forest as string] });
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.defs[s.objects[s.players.p1?.hand[0] ?? ""]?.defId ?? ""]?.name).toBe("Bear Cub");
    expect(s.players.p1?.library[0]).toBe(forest);
  });

  it("an illegal answer leaves the question pending", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Scrying")[0] as string });
    s = passBoth(s);
    expect(() => act(s, "p1", { type: "choose", values: ["inexistant"] })).toThrow();
    expect(s.pending?.kind).toBe("choice");
  });

  it("discard: the targeted opponent chooses", () => {
    let s = scenario({ p1: { hand: [MIND_ROT] }, p2: { hand: ["Forest", "Bear Cub", "Giant Growth"] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Mind Rot")[0] as string, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.pending?.player).toBe("p2");
    const forest = idOf(s, "p2", "hand", "Forest");
    const growth = idOf(s, "p2", "hand", "Giant Growth");
    s = act(s, "p2", { type: "choose", values: [forest, growth] });
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("sacrifice: each opponent chooses, with no question if they have only one option", () => {
    let s = scenario({
      players: 3,
      p1: { hand: [EDICT] },
      p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      p3: { battlefield: ["Swab Goblin"] },
    });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Edict")[0] as string });
    for (let i = 0; i < 3; i++) s = act(s, s.pending?.player as string, { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [idOf(s, "p2", "battlefield", "Bear Cub")] });
    expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p3", "battlefield", "Swab Goblin")).toHaveLength(0);
  });

  it('"you may": declining skips only the optional effect', () => {
    let s = scenario({ p1: { hand: [MAYBE] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Maybe")[0] as string });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [0] });
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.life).toBe(21);
  });
});

describe("legend rule", () => {
  it("the player chooses the legend they keep", () => {
    let s = scenario({ p1: { battlefield: [LEGEND], hand: [LEGEND] } });
    const old = idsOf(s, "p1", "battlefield", "Unique Hero")[0] as string;
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Unique Hero")[0] as string });
    s = passBoth(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("legend");
    s = act(s, "p1", { type: "choose", values: [old] });
    expect(idsOf(s, "p1", "battlefield", "Unique Hero")).toEqual([old]);
    expect(idsOf(s, "p1", "graveyard", "Unique Hero")).toHaveLength(1);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });
});

describe("Counter kind removed chosen by the player (lot K6)", () => {
  const REMOVAL = customCard({
    name: "Test Removal",
    typeLine: "Sorcery",
    types: ["Sorcery"],
    spell: spell([target.creature()], [fx.removeCounters(ref.target(), 1)]),
  });
  const run = (answer: string | null) => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 2, stun: 1 } }], hand: [REMOVAL] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", REMOVAL.name), targets: { t: [bear] } });
    const asked: string[][] = [];
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice" && p.request.type === "pick") {
        asked.push(p.request.options);
        s = act(s, p.player, { type: "choose", values: answer ? [answer] : p.request.suggested });
      } else break;
    }
    return { counters: s.objects[bear]?.counters, asked };
  };

  it("two kinds: the question offers both, the suggestion keeps the earlier order (+1/+1 first)", () => {
    const stun = run("stun");
    expect(stun.asked).toEqual([["+1/+1", "stun"]]);
    expect(stun.counters).toEqual({ "+1/+1": 2 });
    expect(run(null).counters).toEqual({ "+1/+1": 1, stun: 1 });
  });
});

describe("Choice in a zone: the filter keeps its maximum mana value (lot K8)", () => {
  it('"a card with mana value 2 or less from your graveyard": the more expensive ones aren\'t offered', () => {
    const RECALL = customCard({
      name: "Test Recall",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: spell([], [fx.pickFromZone("graveyard", { maxManaValue: 2 }, { to: "hand" }, { min: 0 })]),
    });
    let s = scenario({ p1: { hand: [RECALL], graveyard: ["Bear Cub", "Serra Angel"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", RECALL.name) });
    let options: string[] = [];
    for (let i = 0; i < 10 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice" && p.request.type === "pick") {
        options = p.request.options.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? id);
        s = act(s, p.player, { type: "choose", values: p.request.suggested });
      } else break;
    }
    expect(options).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });
});
