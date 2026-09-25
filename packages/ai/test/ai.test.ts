import { buildDeck, DECKS } from "@mtgx/cards";
import { createGame, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { act, idOf, passUntil, scenario } from "../../engine/test/helpers";
import { heuristicAgent, playGame, randomAgent } from "../src";

const decks = () => [buildDeck(DECKS[0]!), buildDeck(DECKS[1]!)] as [ReturnType<typeof buildDeck>, ReturnType<typeof buildDeck>];

describe("fuzz", () => {
  it("30 parties aléatoires respectent les invariants et se terminent", () => {
    for (let seed = 100; seed < 130; seed++) {
      const r = playGame({ seed, decks: decks(), agents: [randomAgent(seed), randomAgent(seed + 1)], check: true });
      expect(r.state.over).toBe(true);
      expect(r.illegal).toBe(0);
    }
  }, 60_000);

  it("rejeu déterministe : même graine + mêmes décisions = même état final", () => {
    const r = playGame({ seed: 7, decks: decks(), agents: [randomAgent(1), randomAgent(2)] });
    let { state } = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "IA 1", deck: decks()[0] },
        { id: "p2", name: "IA 2", deck: decks()[1] },
      ],
    });
    for (const { player, decision } of r.decisions) state = submit(state, player, decision).state;
    expect(JSON.stringify(state)).toBe(JSON.stringify(r.state));
  });
});

describe("IA heuristique", () => {
  const ai = heuristicAgent();

  it("bat l'IA aléatoire", () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = playGame({ seed, decks: decks(), agents: [ai, randomAgent(seed)] });
      if (r.state.winner === "p1") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });

  it("utilise un sort de dégâts pour tuer la meilleure créature adverse", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Abrade"] },
      p2: { battlefield: ["Bear Cub", "Thornweald Archer", "Fire Elemental"] },
    });
    const d = ai(s, "p1");
    expect(d.type).toBe("cast");
    // Fire Elemental (5/4) survit à 3 blessures : la cible doit être l'archer (contact mortel) ou l'ours.
    const target = d.type === "cast" ? d.targets?.t?.[0] : undefined;
    expect(target).toBe(idOf(s, "p2", "battlefield", "Thornweald Archer"));
  });

  it("bloque pour survivre à une attaque létale", () => {
    let s = scenario({
      active: "p2",
      p1: { life: 4, battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p2", "battlefield", "Fire Elemental"), defender: "p1" }],
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const d = ai(s, "p1");
    expect(d.type === "declareBlockers" && d.blocks).toHaveLength(1);
  });

  it("n'attaque pas dans un bloqueur qui la tue sans mourir", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Magnigoth Sentry"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const d = ai(s, "p1");
    expect(d.type === "declareAttackers" && d.attackers).toHaveLength(0);
  });

  it("utilise Giant Growth pour gagner un combat", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Skyraker Giant"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const giant = idOf(s, "p2", "battlefield", "Skyraker Giant");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: giant, defender: "p1" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p1", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p1", "battlefield", "Bear Cub"), attacker: giant }],
    });
    s = act(s, "p2", { type: "pass" });
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    const d = ai(s, "p1");
    expect(d.type).toBe("cast");
  });
});
