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

const SCRY2 = sorcery("Présage", [fx.scry(2), fx.draw(1)]);
const MIND_ROT = sorcery("Pourriture", [fx.discard(2, ref.target())], [target.player("t", "opponent")]);
const EDICT = sorcery("Édit", [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })]);
const MAYBE = sorcery("Peut-être", [fx.may("piocher une carte ?", fx.draw(1)), fx.gainLife(1)]);
const LEGEND = customCard({ name: "Héros unique", supertypes: ["Legendary"], power: 2, toughness: 2 });

describe("résolution suspendue sur un choix", () => {
  it("regard 2 : on choisit le dessous, puis l'ordre, puis on pioche", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub", "Mountain", "Giant Growth"] } });
    const [forest, bear] = s.players.p1?.library ?? [];
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Présage")[0] as string });
    s = passBoth(s);
    // Première question : quelles cartes mettre au-dessous ?
    expect(s.flow).toBe("resolving");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type === "pick" && p.request.options).toEqual([forest, bear]);
    // Le joueur qui choisit voit les cartes cachées ; l'adversaire non.
    const mine = projectView(s, "p1").pending;
    expect(mine?.kind === "choice" && mine.objects?.map((o) => o.name)).toEqual(["Forest", "Bear Cub"]);
    const theirs = projectView(s, "p2").pending;
    expect(theirs?.kind === "choice" && theirs.request).toBeUndefined();
    s = act(s, "p1", { type: "choose", values: [forest as string] });
    // Une seule carte reste au-dessus : pas de question d'ordre, on pioche l'ours.
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Bear Cub"]);
    expect(s.players.p1?.library.at(-1)).toBe(forest);
    expect(idsOf(s, "p1", "graveyard", "Présage")).toHaveLength(1);
  });

  it("regard 2 en gardant tout : question d'ordre", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub", "Mountain"] } });
    const [forest, bear] = s.players.p1?.library ?? [];
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Présage")[0] as string });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [] });
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type).toBe("order");
    s = act(s, "p1", { type: "choose", values: [bear as string, forest as string] });
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.defs[s.objects[s.players.p1?.hand[0] ?? ""]?.defId ?? ""]?.name).toBe("Bear Cub");
    expect(s.players.p1?.library[0]).toBe(forest);
  });

  it("une réponse illégale laisse la question posée", () => {
    let s = scenario({ p1: { hand: [SCRY2], library: ["Forest", "Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Présage")[0] as string });
    s = passBoth(s);
    expect(() => act(s, "p1", { type: "choose", values: ["inexistant"] })).toThrow();
    expect(s.pending?.kind).toBe("choice");
  });

  it("défausse : c'est l'adversaire ciblé qui choisit", () => {
    let s = scenario({ p1: { hand: [MIND_ROT] }, p2: { hand: ["Forest", "Bear Cub", "Giant Growth"] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Pourriture")[0] as string, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.pending?.player).toBe("p2");
    const forest = idOf(s, "p2", "hand", "Forest");
    const growth = idOf(s, "p2", "hand", "Giant Growth");
    s = act(s, "p2", { type: "choose", values: [forest, growth] });
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("sacrifice : chaque adversaire choisit, sans question s'il n'a qu'une option", () => {
    let s = scenario({
      players: 3,
      p1: { hand: [EDICT] },
      p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      p3: { battlefield: ["Swab Goblin"] },
    });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Édit")[0] as string });
    for (let i = 0; i < 3; i++) s = act(s, s.pending?.player as string, { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [idOf(s, "p2", "battlefield", "Bear Cub")] });
    expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p3", "battlefield", "Swab Goblin")).toHaveLength(0);
  });

  it("« vous pouvez » : refuser saute seulement l'effet optionnel", () => {
    let s = scenario({ p1: { hand: [MAYBE] } });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Peut-être")[0] as string });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [0] });
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.life).toBe(21);
  });
});

describe("règle des légendes", () => {
  it("le joueur choisit la légende qu'il garde", () => {
    let s = scenario({ p1: { battlefield: [LEGEND], hand: [LEGEND] } });
    const old = idsOf(s, "p1", "battlefield", "Héros unique")[0] as string;
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Héros unique")[0] as string });
    s = passBoth(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("legend");
    s = act(s, "p1", { type: "choose", values: [old] });
    expect(idsOf(s, "p1", "battlefield", "Héros unique")).toEqual([old]);
    expect(idsOf(s, "p1", "graveyard", "Héros unique")).toHaveLength(1);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });
});

describe("Sorte de marqueur retirée choisie par le joueur (lot K6)", () => {
  const RETRAIT = customCard({
    name: "Retrait d'essai",
    typeLine: "Sorcery",
    types: ["Sorcery"],
    spell: spell([target.creature()], [fx.removeCounters(ref.target(), 1)]),
  });
  const run = (answer: string | null) => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 2, stun: 1 } }], hand: [RETRAIT] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", RETRAIT.name), targets: { t: [bear] } });
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

  it("deux sortes : la question propose les deux, la suggestion garde l'ordre d'avant (+1/+1 d'abord)", () => {
    const stun = run("stun");
    expect(stun.asked).toEqual([["+1/+1", "stun"]]);
    expect(stun.counters).toEqual({ "+1/+1": 2 });
    expect(run(null).counters).toEqual({ "+1/+1": 1, stun: 1 });
  });
});

describe("Choix dans une zone : le filtre garde sa valeur de mana maximale (lot K8)", () => {
  it("« une carte de valeur de mana 2 ou moins de votre cimetière » : les plus chères ne sont pas proposées", () => {
    const RAPPEL = customCard({
      name: "Rappel d'essai",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: spell([], [fx.pickFromZone("graveyard", { maxManaValue: 2 }, { to: "hand" }, { min: 0 })]),
    });
    let s = scenario({ p1: { hand: [RAPPEL], graveyard: ["Bear Cub", "Serra Angel"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", RAPPEL.name) });
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
