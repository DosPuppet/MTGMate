import { buildDeck, DECKS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game";
import { act, idOf, passUntil, scenario } from "./helpers";

describe("multijoueur", () => {
  it("la priorité fait le tour de table dans l'ordre", () => {
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

  it("le tour suivant revient au joueur suivant", () => {
    let s = scenario({ players: 3, step: "end" });
    s = passUntil(s, (x) => x.turn.active !== "p1");
    expect(s.turn.active).toBe("p2");
    expect(s.players.p2?.lastTurnStarted).toBe(s.turn.number);
  });

  it("on peut attaquer des adversaires différents ; chacun déclare ses bloqueurs", () => {
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

  it("on ne peut pas attaquer un joueur éliminé ni soi-même", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).toThrow();
  });

  it("un joueur éliminé quitte la partie avec ses cartes, les autres continuent", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Mountain"], hand: ["Boltwave"] },
      p2: { life: 3, battlefield: ["Bear Cub"] },
      p3: { life: 10 },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Boltwave") });
    s = passUntil(s, (x) => x.stack.length === 0);
    // Boltwave inflige 3 à chaque adversaire : p2 meurt, p3 passe à 7.
    expect(s.players.p2?.lost).toBe(true);
    expect(s.players.p3?.life).toBe(7);
    expect(s.over).toBe(false);
    expect(Object.values(s.objects).some((o) => o.owner === "p2")).toBe(false);
    expect(s.pending?.player).toBe("p1");
    // La priorité ne passe plus par p2.
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p3");
  });

  it("abandon en multijoueur : la partie continue sans le joueur", () => {
    let s = scenario({ players: 3 });
    s = act(s, "p2", { type: "concede" });
    expect(s.over).toBe(false);
    expect(s.players.p2?.lost).toBe(true);
    s = act(s, "p3", { type: "concede" });
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("103.8c : en multijoueur, le premier joueur pioche à son premier tour", () => {
    let { state: s } = createGame({
      seed: 5,
      startingPlayer: "p1",
      players: ["p1", "p2", "p3"].map((id, i) => ({ id, name: id, deck: buildDeck(DECKS[i % 2]!) })),
    });
    for (const p of ["p1", "p2", "p3"]) s = act(s, p, { type: "keep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(8);
  });
});
