import { buildDeck, deckById } from "@mtgx/cards";
import { createGame, submit } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { randomDeck } from "../../../tools/random-deck";
import { act, idOf, passUntil, scenario } from "../../engine/test/helpers";
import { heuristicAgent, playGame, randomAgent } from "../src";

const decks = () =>
  [buildDeck(deckById("welcome-green")), buildDeck(deckById("welcome-red"))] as [
    ReturnType<typeof buildDeck>,
    ReturnType<typeof buildDeck>,
  ];

describe("fuzz", () => {
  it("30 random games respect the invariants and finish", () => {
    for (let seed = 100; seed < 130; seed++) {
      const r = playGame({ seed, decks: decks(), agents: [randomAgent(seed), randomAgent(seed + 1)], check: true });
      expect(r.state.over).toBe(true);
      expect(r.illegal).toBe(0);
    }
  }, 60_000);

  it("deterministic replay: same seed + same decisions = same final state", () => {
    const r = playGame({ seed: 7, decks: decks(), agents: [randomAgent(1), randomAgent(2)] });
    let { state } = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "AI 1", deck: decks()[0] },
        { id: "p2", name: "AI 2", deck: decks()[1] },
      ],
    });
    for (const { player, decision } of r.decisions) state = submit(state, player, decision).state;
    expect(JSON.stringify(state)).toBe(JSON.stringify(r.state));
  });

  it("deterministic replay with 3 players, random decks from the whole pool, heuristic AI", () => {
    const deckList = [0, 1, 2].map((i) => randomDeck(4242 + i));
    const r = playGame({ seed: 11, decks: deckList, agents: [heuristicAgent(), heuristicAgent(), randomAgent(3)] });
    let { state } = createGame({
      seed: 11,
      players: deckList.map((deck, i) => ({ id: `p${i + 1}`, name: `AI ${i + 1}`, deck })),
    });
    for (const { player, decision } of r.decisions) state = submit(state, player, decision).state;
    expect(r.decisions.length).toBeGreaterThan(100);
    expect(JSON.stringify(state)).toBe(JSON.stringify(r.state));
  }, 60_000);
});

describe("IA heuristique", () => {
  const ai = heuristicAgent();

  it("beats the random AI", () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = playGame({ seed, decks: decks(), agents: [ai, randomAgent(seed)] });
      if (r.state.winner === "p1") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });

  it("uses a damage spell to kill the opponent's best creature", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Abrade"] },
      p2: { battlefield: ["Bear Cub", "Thornweald Archer", "Fire Elemental"] },
    });
    const d = ai(s, "p1");
    expect(d.type).toBe("cast");
    // Fire Elemental (5/4) survives 3 damage: the target must be the archer (deathtouch) or the bear.
    const target = d.type === "cast" ? d.targets?.t?.[0] : undefined;
    expect(target).toBe(idOf(s, "p2", "battlefield", "Thornweald Archer"));
  });

  it("blocks to survive a lethal attack", () => {
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

  it("doesn't attack into a blocker that kills it without dying", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Magnigoth Sentry"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const d = ai(s, "p1");
    expect(d.type === "declareAttackers" && d.attackers).toHaveLength(0);
  });

  it("uses Giant Growth to win a combat", () => {
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

  it('"cast it" during a resolution (Discover): the AI casts the free card', () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest", "Forest", "Forest", "Forest", "Forest"],
        hand: ["Walk with the Ancestors"],
        library: ["Island", "Llanowar Elves", "Plains"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Walk with the Ancestors"), targets: { t: [] } });
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "pass" });
    const p = s.pending;
    expect(p?.kind === "priority" && p.castNow?.cards.length).toBe(1);
    const d = heuristicAgent()(s, "p1");
    expect(d.type).toBe("cast");
  });
});
