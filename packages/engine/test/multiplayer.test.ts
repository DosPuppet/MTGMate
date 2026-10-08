import { buildDeck, card, deckById } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { cond } from "../src/dsl";
import { createGame } from "../src/game";
import { checkCondition } from "../src/triggers";
import { eliminate } from "../src/turn";
import { act, idOf, passUntil, scenario } from "./helpers";

describe("multijoueur", () => {
  it("priority goes around the table in order", () => {
    let s = scenario({ players: 4, p1: { battlefield: ["Mountain"], hand: ["Burst Lightning"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p3"] } });
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(s.pending?.player as string);
      s = act(s, s.pending?.player as string, { type: "pass" });
    }
    expect(order).toEqual(["p1", "p2", "p3", "p4"]);
    expect(s.players.p3?.life).toBe(18);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("the next turn goes back to the next player", () => {
    let s = scenario({ players: 3, step: "end" });
    s = passUntil(s, (x) => x.turn.active !== "p1");
    expect(s.turn.active).toBe("p2");
    expect(s.players.p2?.lastTurnStarted).toBe(s.turn.number);
  });

  it("different opponents can be attacked; each declares blockers", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Swab Goblin"] },
      p2: { battlefield: ["Magnigoth Sentry"] },
      p3: { battlefield: ["Thornweald Archer"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: bear, defender: "p2" },
        { id: goblin, defender: "p3" },
      ],
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(s.pending).toEqual({ kind: "declareBlockers", player: "p2" });
    s = act(s, "p2", { type: "declareBlockers", blocks: [] });
    expect(s.pending).toEqual({ kind: "declareBlockers", player: "p3" });
    s = act(s, "p3", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p3", "battlefield", "Thornweald Archer"), attacker: goblin }],
    });
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p3?.life).toBe(20);
    expect(s.objects[goblin]).toBeUndefined();
  });

  it("an eliminated player can't be attacked, nor oneself", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).toThrow();
  });

  it('turn log: an eliminated player is no longer an opponent (800.4a); "an opponent lost life" ignores them', () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      p2: { life: 3 },
      p3: { life: 10 },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.lost).toBe(true);
    // p2 lost life this turn, but left the game: no opponent still in the game lost any.
    expect(checkCondition(s, cond.opponentLostLife, "p1")).toBe(false);
    s.turnLog.push({ e: "lifeLoss", player: "p3", amount: 1 });
    expect(checkCondition(s, cond.opponentLostLife, "p1")).toBe(true);
  });

  it("an eliminated player leaves the game with their cards, the others continue", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Mountain"], hand: ["Boltwave"] },
      p2: { life: 3, battlefield: ["Bear Cub"] },
      p3: { life: 10 },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Boltwave") });
    s = passUntil(s, (x) => x.stack.length === 0);
    // Boltwave deals 3 to each opponent: p2 dies, p3 goes to 7.
    expect(s.players.p2?.lost).toBe(true);
    expect(s.players.p3?.life).toBe(7);
    expect(s.over).toBe(false);
    expect(Object.values(s.objects).some((o) => o.owner === "p2")).toBe(false);
    expect(s.pending?.player).toBe("p1");
    // Priority no longer goes through p2.
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p3");
  });

  it("the active player eliminated by a state-based action doesn't receive priority", () => {
    // The active player is at 0 life: the state-based action eliminates them, and their turn ends.
    let s = scenario({ players: 3, p1: { hand: ["Forest"] } });
    (s.players.p1 as { life: number }).life = 0;
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(s.players.p1?.lost).toBe(true);
    expect(s.pending?.player).not.toBe("p1");
    expect(s.turn.active).toBe("p2");
  });

  it("concession in multiplayer: the game continues without the player", () => {
    let s = scenario({ players: 3 });
    s = act(s, "p2", { type: "concede" });
    expect(s.over).toBe(false);
    expect(s.players.p2?.lost).toBe(true);
    s = act(s, "p3", { type: "concede" });
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("103.8c: in multiplayer, the first player draws on their first turn", () => {
    let { state: s } = createGame({
      seed: 5,
      startingPlayer: "p1",
      players: ["p1", "p2", "p3"].map((id, i) => ({
        id,
        name: id,
        deck: buildDeck(deckById(i % 2 ? "welcome-red" : "welcome-green")),
      })),
    });
    for (const p of ["p1", "p2", "p3"]) s = act(s, p, { type: "keep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(8);
  });

  it("800.4a: a spell an eliminated player controls without owning is exiled (not left on the stack)", () => {
    let s = scenario({ players: 3, active: "p3", p3: { battlefield: ["Mountain"], hand: ["Shock"] } });
    s = act(s, "p3", { type: "cast", card: idOf(s, "p3", "hand", "Shock"), targets: { t: ["p2"] } });
    // The card belongs to p1 (cast from exile, for example); p3 leaves the game.
    const spell = s.stack[0]?.sourceId as string;
    (s.objects[spell] as { owner: string }).owner = "p1";
    eliminate(s, ["p3"]);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[spell]).toBeUndefined();
    expect(s.exile.map((id) => [s.objects[id]?.owner, s.defs[s.objects[id]?.defId ?? ""]?.name])).toEqual([["p1", "Shock"]]);
  });

  // Strict fuzz, 4-player Commander (seed 62): Willie Lumpkin kills p2 with combat damage; its ability then resolves
  // and asked p2, who was eliminated, whether they wanted to draw.
  const willieHits = (life: number, defender: "p2" | "p4" = "p2") => {
    let s = scenario({
      players: 4,
      p1: { battlefield: ["Willie Lumpkin, Postman"], library: ["Forest", "Forest"] },
      [defender]: { life, library: ["Forest", "Forest"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const willie = idOf(s, "p1", "battlefield", "Willie Lumpkin, Postman");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: willie, defender }] });
    // Willie can't be blocked: no blocker declaration.
    return passUntil(s, (x) => x.stack.length > 0 || x.pending?.kind === "choice");
  };

  it("800.4a: a question asked during a resolution to an eliminated player isn't asked (they do nothing)", () => {
    let s = willieHits(1);
    expect(s.players.p2?.lost).toBe(true);
    expect(s.stack).toHaveLength(1);
    s = passUntil(s, (x) => x.stack.length === 0 || x.pending?.kind === "choice");
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("800.4a: a player who concedes during a question asked to them mid-resolution: the resolution ends", () => {
    let s = willieHits(20);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "concede" });
    expect(s.players.p2?.lost).toBe(true);
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("800.4a: the last player to have passed concedes during their question: priority returns to the active player (117.3b)", () => {
    let s = willieHits(20, "p4");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p4");
    s = act(s, "p4", { type: "concede" });
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("800.4a: the controller of the resolving ability concedes during another player's question: it ceases to exist", () => {
    let s = willieHits(20);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    const before = s.players.p2?.hand.length ?? 0;
    s = act(s, "p1", { type: "concede" });
    expect(s.players.p1?.lost).toBe(true);
    expect(s.pending?.kind).not.toBe("choice");
    expect(s.stack).toHaveLength(0);
    // p2 didn't draw thanks to Willie's ability, gone with its controller.
    expect(s.players.p2?.hand.length ?? 0).toBe(before);
  });
});

describe("mulligan gratuit (103.5c)", () => {
  const forests = () => Array.from({ length: 40 }, () => card("Forest"));
  const start = (players: number) =>
    createGame({
      seed: 3,
      startingPlayer: "p1",
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `J${i + 1}`, deck: forests() })),
    }).state;
  /** Each player keeps, except `p1` who takes `n` mulligans before keeping. */
  const mulliganThenKeep = (s0: ReturnType<typeof start>, n: number) => {
    let s = s0;
    let taken = 0;
    for (let i = 0; i < 40 && s.pending && (s.pending.kind === "mulligan" || s.pending.kind === "bottomCards"); i++) {
      const p = s.pending;
      if (p.kind === "bottomCards") return { s, bottom: p.count };
      if (p.player === "p1" && taken < n) {
        taken++;
        s = act(s, "p1", { type: "mulligan" });
      } else s = act(s, p.player, { type: "keep" });
    }
    return { s, bottom: 0 };
  };

  it("with three or more players, the first mulligan is free: seven cards kept, none put on the bottom", () => {
    const one = mulliganThenKeep(start(3), 1);
    expect(one.bottom).toBe(0);
    expect(one.s.players.p1?.hand).toHaveLength(7);
    const two = mulliganThenKeep(start(4), 2);
    expect(two.bottom).toBe(1);
  });

  it("in a duel, each mulligan counts", () => {
    expect(mulliganThenKeep(start(2), 1).bottom).toBe(1);
  });

  it("in Commander, the first mulligan is free, duels included: then one card, two cards…", () => {
    const duel = () =>
      createGame({
        seed: 3,
        startingPlayer: "p1",
        variant: "commander",
        players: ["p1", "p2"].map((id) => ({
          id,
          name: id,
          deck: [card("Edgar Markov"), ...Array.from({ length: 99 }, () => card("Swamp"))],
          commanders: [0],
        })),
      }).state;
    expect(mulliganThenKeep(duel(), 1).bottom).toBe(0);
    expect(mulliganThenKeep(duel(), 2).bottom).toBe(1);
    expect(mulliganThenKeep(duel(), 3).bottom).toBe(2);
  });

  it("the decision announces the number of cards to put on the bottom", () => {
    let s = start(3);
    s = act(s, "p1", { type: "mulligan" });
    for (let i = 0; i < 5 && s.pending?.player !== "p1"; i++) s = act(s, s.pending?.player as string, { type: "keep" });
    expect(s.pending).toMatchObject({ kind: "mulligan", player: "p1", mulligans: 1, bottom: 0 });
  });
});
