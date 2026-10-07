import { buildDeck, card, deckById } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { cond } from "../src/dsl";
import { createGame } from "../src/game";
import { checkCondition } from "../src/triggers";
import { eliminate } from "../src/turn";
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

  it("journal du tour : un joueur éliminé n'est plus un adversaire (800.4a) ; « un adversaire a perdu des PV » l'ignore", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      p2: { life: 3 },
      p3: { life: 10 },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.lost).toBe(true);
    // p2 a perdu des PV ce tour-ci, mais a quitté la partie : aucun adversaire en partie n'en a perdu.
    expect(checkCondition(s, cond.opponentLostLife, "p1")).toBe(false);
    s.turnLog.push({ e: "lifeLoss", player: "p3", amount: 1 });
    expect(checkCondition(s, cond.opponentLostLife, "p1")).toBe(true);
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

  it("le joueur actif éliminé par une action basée sur l'état ne reçoit pas la priorité", () => {
    // Le joueur actif est à 0 point de vie : l'action basée sur l'état l'élimine, et son tour s'arrête.
    let s = scenario({ players: 3, p1: { hand: ["Forest"] } });
    (s.players.p1 as { life: number }).life = 0;
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(s.players.p1?.lost).toBe(true);
    expect(s.pending?.player).not.toBe("p1");
    expect(s.turn.active).toBe("p2");
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
      players: ["p1", "p2", "p3"].map((id, i) => ({
        id,
        name: id,
        deck: buildDeck(deckById(i % 2 ? "bienvenue-rouge" : "bienvenue-vert")),
      })),
    });
    for (const p of ["p1", "p2", "p3"]) s = act(s, p, { type: "keep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(8);
  });

  it("800.4a : un sort qu'un joueur éliminé contrôle sans le posséder est exilé (pas laissé sur la pile)", () => {
    let s = scenario({ players: 3, active: "p3", p3: { battlefield: ["Mountain"], hand: ["Shock"] } });
    s = act(s, "p3", { type: "cast", card: idOf(s, "p3", "hand", "Shock"), targets: { t: ["p2"] } });
    // La carte appartient à p1 (lancée depuis l'exil, par exemple) ; p3 quitte la partie.
    const spell = s.stack[0]?.sourceId as string;
    (s.objects[spell] as { owner: string }).owner = "p1";
    eliminate(s, ["p3"]);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[spell]).toBeUndefined();
    expect(s.exile.map((id) => [s.objects[id]?.owner, s.defs[s.objects[id]?.defId ?? ""]?.name])).toEqual([["p1", "Shock"]]);
  });

  // Fuzz strict, Commander à 4 (seed 62) : Willie Lumpkin tue p2 par ses blessures de combat ; sa capacité se résout
  // ensuite et demandait à p2, éliminé, s'il voulait piocher.
  const willieHits = (life: number, defender: "p2" | "p4" = "p2") => {
    let s = scenario({
      players: 4,
      p1: { battlefield: ["Willie Lumpkin, Postman"], library: ["Forest", "Forest"] },
      [defender]: { life, library: ["Forest", "Forest"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const willie = idOf(s, "p1", "battlefield", "Willie Lumpkin, Postman");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: willie, defender }] });
    // Willie ne peut pas être bloqué : aucune déclaration de bloqueurs.
    return passUntil(s, (x) => x.stack.length > 0 || x.pending?.kind === "choice");
  };

  it("800.4a : une question posée pendant une résolution à un joueur éliminé n'est pas posée (il ne fait rien)", () => {
    let s = willieHits(1);
    expect(s.players.p2?.lost).toBe(true);
    expect(s.stack).toHaveLength(1);
    s = passUntil(s, (x) => x.stack.length === 0 || x.pending?.kind === "choice");
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("800.4a : un joueur qui abandonne pendant une question qui lui est posée en cours de résolution, la résolution se termine", () => {
    let s = willieHits(20);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "concede" });
    expect(s.players.p2?.lost).toBe(true);
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("800.4a : le dernier joueur à avoir passé abandonne pendant sa question : la priorité revient au joueur actif (117.3b)", () => {
    let s = willieHits(20, "p4");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p4");
    s = act(s, "p4", { type: "concede" });
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("800.4a : le contrôleur de la capacité qui se résout abandonne pendant la question d'un autre : elle cesse d'exister", () => {
    let s = willieHits(20);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    const before = s.players.p2?.hand.length ?? 0;
    s = act(s, "p1", { type: "concede" });
    expect(s.players.p1?.lost).toBe(true);
    expect(s.pending?.kind).not.toBe("choice");
    expect(s.stack).toHaveLength(0);
    // p2 n'a pas pioché grâce à la capacité de Willie, partie avec son contrôleur.
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
  /** Chaque joueur garde, sauf `p1` qui prend `n` mulligans avant de garder. */
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

  it("à trois joueurs ou plus, le premier mulligan est gratuit : sept cartes gardées, aucune au-dessous", () => {
    const one = mulliganThenKeep(start(3), 1);
    expect(one.bottom).toBe(0);
    expect(one.s.players.p1?.hand).toHaveLength(7);
    const two = mulliganThenKeep(start(4), 2);
    expect(two.bottom).toBe(1);
  });

  it("en duel, chaque mulligan compte", () => {
    expect(mulliganThenKeep(start(2), 1).bottom).toBe(1);
  });

  it("en Commander, le premier mulligan est gratuit, duel compris : puis une carte, deux cartes…", () => {
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

  it("la décision annonce le nombre de cartes à mettre au-dessous", () => {
    let s = start(3);
    s = act(s, "p1", { type: "mulligan" });
    for (let i = 0; i < 5 && s.pending?.player !== "p1"; i++) s = act(s, s.pending?.player as string, { type: "keep" });
    expect(s.pending).toMatchObject({ kind: "mulligan", player: "p1", mulligans: 1, bottom: 0 });
  });
});
