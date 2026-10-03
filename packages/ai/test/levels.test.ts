/**
 * Niveaux de l'IA : comportements attendus du niveau élevé (attaques et blocages par simulation) et du débutant.
 */
import { type GameState, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { act, customCard, idOf, passAccepting, passUntil, scenario } from "../../engine/test/helpers";
import { aiAgent } from "../src";

const expert = () => aiAgent("expert", { seed: 1, budget: { iterations: 40 }, players: 2 });

/** L'adversaire (p2) attaque avec `attackers` ; renvoie l'état où p1 déclare ses bloqueurs. */
function attackedBy(s0: GameState, attackers: string[]): GameState {
  let s = passUntil(s0, (x) => x.pending?.kind === "declareAttackers");
  s = act(s, "p2", {
    type: "declareAttackers",
    attackers: attackers.map((name) => ({ id: idOf(s, "p2", "battlefield", name), defender: "p1" })),
  });
  return passUntil(s, (x) => x.pending?.kind === "declareBlockers");
}

describe("IA élevée : combat par simulation", () => {
  it("garde un bloqueur quand la contre-attaque serait létale", () => {
    let s = scenario({
      p1: { life: 5, battlefield: ["Bear Cub"] },
      p2: { battlefield: [{ name: "Fire Elemental", tapped: true }] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const d = expert()(s, "p1");
    expect(d.type === "declareAttackers" && d.attackers).toHaveLength(0);
  });

  it("attaque avec tout quand c'est létal", () => {
    let s = scenario({
      p1: { battlefield: ["Savannah Lions", "Savannah Lions"] },
      p2: { life: 2, battlefield: ["Bear Cub"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const d = expert()(s, "p1");
    expect(d.type === "declareAttackers" && d.attackers).toHaveLength(2);
  });

  it("bloque à deux pour tuer un gros attaquant", () => {
    const s = attackedBy(
      scenario({ active: "p2", p1: { battlefield: ["Bear Cub", "Bear Cub"] }, p2: { battlefield: ["Fire Elemental"] } }),
      ["Fire Elemental"],
    );
    const d = expert()(s, "p1");
    expect(d.type === "declareBlockers" && d.blocks).toHaveLength(2);
    const after = submit(s, "p1", d).state;
    const fe = passAccepting(after, (x) => x.turn.step === "main2" || x.turn.step === "end");
    expect(fe.players.p2?.graveyard.some((id) => fe.defs[fe.objects[id]?.defId ?? ""]?.name === "Fire Elemental")).toBe(true);
  });
});

describe("IA débutante", () => {
  it("joue ses terrains et, le plus souvent, ses créatures", () => {
    let cast = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const ai = aiAgent("beginner", { seed });
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Forest", "Bear Cub"] } });
      const land = ai(s, "p1");
      expect(land.type).toBe("playLand");
      s = submit(s, "p1", land).state;
      if (ai(s, "p1").type === "cast") cast++;
    }
    expect(cast).toBeGreaterThanOrEqual(6);
  });

  it("ne répond pas aux sorts adverses", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Scorching Dragonfire"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Scorching Dragonfire"), mode: 0, targets: { t: [bear] } });
    s = act(s, "p2", { type: "pass" });
    expect(aiAgent("beginner", { seed: 1 })(s, "p1").type).toBe("pass");
    // Le moyen, lui, sauve son Ourson.
    expect(aiAgent("medium")(s, "p1").type).toBe("cast");
  });
});

describe("choix de l'IA (PLAN-C, lot C17)", () => {
  const medium = () => aiAgent("medium", { seed: 1, players: 2 });
  const brute = customCard({ name: "Brute", power: 3, toughness: 3 });

  it("répartition des blessures de combat : détruit le bloqueur le plus précieux plutôt que le plus fragile", () => {
    let s = scenario({ p1: { battlefield: [brute] }, p2: { battlefield: ["Vampire Nighthawk", "Llanowar Elves"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const b = idOf(s, "p1", "battlefield", "Brute");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: b, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const hawk = idOf(s, "p2", "battlefield", "Vampire Nighthawk");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [
        { blocker: hawk, attacker: b },
        { blocker: elves, attacker: b },
      ],
    });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type === "divide" && p.request.intent).toBe("combatDamage");
    // Suggestion du moteur : la moindre endurance d'abord (l'Elfe).
    const req = p?.kind === "choice" && p.request.type === "divide" ? p.request : null;
    expect(req?.suggested[req.among.indexOf(elves)]).toBe(1);
    const d = medium()(s, "p1");
    const values = d.type === "choose" ? (d.values as number[]) : [];
    expect(values[req?.among.indexOf(hawk) ?? -1]).toBe(3);
  });

  it("mulligan : rend une main à deux terrains sans sort de valeur 2 ou moins", () => {
    let s = scenario({
      p1: { hand: ["Forest", "Forest", "Serra Angel", "Serra Angel", "Shivan Dragon", "Shivan Dragon", "Gigantosaurus"] },
    });
    s = { ...s, pending: { kind: "mulligan", player: "p1", mulligans: 0 } } as GameState;
    expect(medium()(s, "p1")).toEqual({ type: "mulligan" });
  });
});
