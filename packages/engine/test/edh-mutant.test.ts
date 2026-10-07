/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « Mutant Menace » (Fallout). Marqueurs de
 * radiation et radiation, cartes meulées (déclencheurs groupés, « meulée ce tour-ci »), prolifération des joueurs.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, sourceFromObject } from "../src/actions";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { changeCounters } from "../src/state";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const activate = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const source = idOf(s, p, "battlefield", name);
  const o = legalActions(s, p).find((a) => a.type === "activate" && a.source === source);
  if (o?.type !== "activate") throw new Error(`pas de capacité pour ${name}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const toMain1Of = (s: GameState, p: PlayerId) =>
  advanceUntil(s, (x) => x.turn.active === p && x.turn.step === "main1" && x.pending?.kind === "priority", 600);

describe("Mutant Menace (EDH)", () => {
  describe("radiation", () => {
    it("au début de sa première phase principale, le joueur meule ; chaque carte non-terrain : 1 PV et un marqueur en moins", () => {
      let s = scenario({ active: "p2", p1: { library: ["Opt", "Forest", "Shock", "Opt", "Opt"] } });
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 3 };
      s = toMain1Of(s, "p1");
      // Pioche (Opt), puis meule de trois : Forest, Shock, Opt → deux cartes non-terrain.
      expect([s.players.p1?.counters?.rad, s.players.p1?.life, s.players.p1?.graveyard.length]).toEqual([1, 18, 3]);
    });

    it("Strong, the Brutish Thespian : la radiation fait gagner des PV", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Strong, the Brutish Thespian"], library: ["Opt", "Shock", "Opt"] } });
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 2 };
      s = toMain1Of(s, "p1");
      expect([s.players.p1?.counters?.rad, s.players.p1?.life]).toEqual([0, 22]);
    });

    it("The Wise Mothman : chaque joueur reçoit un marqueur ; des cartes non-terrain meulées mettent des marqueurs +1/+1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Swamp", "Forest", "Bear Cub"], hand: ["The Wise Mothman"] },
        p2: { library: ["Opt", "Shock", "Forest"] },
      });
      s = settle(castIt(s, "p1", "The Wise Mothman"));
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([1, 1]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const moth = idOf(s, "p1", "battlefield", "The Wise Mothman");
      // L'adversaire subit la radiation à son tour : il meule une carte non-terrain (Shock, sous Opt pioché).
      s = toMain1Of(s, "p2");
      s = settle(s, picking([bear, moth]));
      expect(plusOne(s, bear) + plusOne(s, moth)).toBe(1);
    });

    it("la prolifération donne un marqueur de radiation de plus à un joueur qui en a", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2).concat(["Swamp", "Swamp"]), hand: ["Atomize"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, rad: 2 };
      s = settle(castIt(s, "p1", "Atomize", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) =>
        req.type === "pick" && req.intent === "proliferate" ? ["p2"] : undefined,
      );
      expect(s.players.p2?.counters?.rad).toBe(3);
    });
  });

  describe("cartes meulées", () => {
    it("Raul : chaque joueur meule ; une fois par tour, un sort meulé ce tour-ci se lance depuis le cimetière", () => {
      let s = scenario({
        p1: { battlefield: ["Raul, Trouble Shooter", "Mountain"], library: ["Shock", "Forest"] },
        p2: { library: ["Opt"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"));
      const shock = idOf(s, "p1", "graveyard", "Shock");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === shock)).toBe(true);
    });

    it("Tato Farmer : un terrain meulé ce tour-ci arrive engagé sous votre contrôle", () => {
      let s = scenario({
        p1: { battlefield: ["Tato Farmer", "Raul, Trouble Shooter"] },
        p2: { library: ["Plains", "Opt"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"));
      const plains = idOf(s, "p2", "graveyard", "Plains");
      s = settle(activate(s, "p1", "Tato Farmer", { targets: { t: [plains] } }));
      const mine = idsOf(s, "p1", "battlefield", "Plains");
      expect(mine).toHaveLength(1);
      expect(s.objects[mine[0] ?? ""]?.tapped).toBe(true);
    });

    it("Screeching Scorchbeast : des cartes non-terrain meulées créent autant de Zombies Mutants, une fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Screeching Scorchbeast", "Raul, Trouble Shooter"], library: ["Opt"] },
        p2: { library: ["Shock"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(tokens(s, "p1", "Zombie Mutant")).toHaveLength(2);
    });
  });

  describe("créatures et sorts", () => {
    it("Glowing One : il donne quatre marqueurs de radiation au joueur qu'il blesse", () => {
      let s = scenario({ p1: { battlefield: ["Glowing One"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Glowing One")]));
      expect(s.players.p2?.counters?.rad).toBe(4);
    });

    it("Bloatfly Swarm : les blessures retirent des marqueurs +1/+1 et irradient chaque joueur", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", { name: "Bloatfly Swarm", counters: { "+1/+1": 5 } }], hand: ["Shock"] },
      });
      const fly = idOf(s, "p1", "battlefield", "Bloatfly Swarm");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [fly] } }));
      expect([s.objects[fly]?.damage, plusOne(s, fly), s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([
        0, 3, 2, 2,
      ]);
    });

    it("Hancock : +X/+X aux autres Zombies et Mutants, X ses marqueurs ; undying le ramène avec un marqueur", () => {
      let s = scenario({ p1: { battlefield: ["Hancock, Ghoulish Mayor", "Glowing One", "Mountain"], hand: ["Shock"] } });
      const hancock = idOf(s, "p1", "battlefield", "Hancock, Ghoulish Mayor");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [hancock] } }));
      const back = idOf(s, "p1", "battlefield", "Hancock, Ghoulish Mayor");
      expect(plusOne(s, back)).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Glowing One")).power).toBe(3);
    });

    it("Nuclear Fallout : chaque créature -2X/-2X, chaque joueur X marqueurs de radiation", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3)], hand: ["Nuclear Fallout"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Nuclear Fallout", { x: 1 }));
      expect([onField(s, "p2", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([0, 1]);
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([1, 1]);
    });

    it("Vault 12 : chapitre II, un Zombie Mutant par marqueur de radiation parmi les joueurs", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Vault 12: The Necropolis"] } });
      s = settle(castIt(s, "p1", "Vault 12: The Necropolis"));
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([3, 3]);
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 0 };
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.pending?.kind === "priority" &&
          x.turn.number > 3,
        600,
      );
      // p2 a subi la radiation pendant son tour (bibliothèque de Forêts : aucune carte non-terrain, il garde ses 3).
      expect(tokens(s, "p1", "Zombie Mutant").length).toBe(3);
    });

    it("Contaminated Drink : piochez X, puis la moitié de X (arrondie au supérieur) en marqueurs de radiation", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Island", "Island"], hand: ["Contaminated Drink"], library: lands("Island", 5) },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Contaminated Drink", { x: 2 }));
      expect(hand(s, "p1")).toBe(h - 1 + 2);
      expect(s.players.p1?.counters?.rad).toBe(1);
    });
  });
});

describe("Mutant Menace : approximations levées (PLAN-H, H2c)", () => {
  it("Finality : vous pouvez mettre deux marqueurs +1/+1 sur une de vos créatures (choisie, pas ciblée) ; puis -4/-4 à toutes", () => {
    const start = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 3), "Serra Angel"], hand: ["Find // Finality"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = start();
    const mine = idOf(s, "p1", "battlefield", "Serra Angel");
    const offered: string[][] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Find // Finality"), face: 1 }), (req) => {
      if (req.type !== "pick") return undefined;
      offered.push(req.options.map(String));
      return [mine];
    });
    // Le choix se fait à la résolution, parmi vos créatures seulement.
    expect(offered).toEqual([[mine]]);
    expect(plusOne(s, mine)).toBe(2);
    expect(chars(s, mine).power).toBe(2);
    expect(onField(s, "p2", "Serra Angel")).toBe(0);
    // « Vous pouvez » : sans créature choisie, pas de marqueurs, et votre Ange meurt aussi.
    let t = start();
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Find // Finality"), face: 1 }), (req) =>
      req.type === "pick" ? [] : undefined,
    );
    expect(onField(t, "p1", "Serra Angel")).toBe(0);
  });

  it("Nightkin Ambusher : imblocable tant que le joueur défenseur (pas un autre adversaire) a un marqueur de radiation", () => {
    const run = (defender: PlayerId) => {
      let s = scenario({ players: 3, p1: { battlefield: ["Nightkin Ambusher"] } });
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, rad: 1 };
      const ambusher = idOf(s, "p1", "battlefield", "Nightkin Ambusher");
      s = attackPlayer(s, [ambusher], defender);
      return chars(s, ambusher).keywords.includes("unblockable");
    };
    expect(run("p2")).toBe(true);
    expect(run("p3")).toBe(false);
  });

  it("Mutational Advantage : blessures prévenues sur les permanents qui avaient des marqueurs à la résolution, pas sur ceux qui en reçoivent ensuite", () => {
    let s = scenario({
      p1: {
        battlefield: [
          ...lands("Island", 1),
          ...lands("Forest", 2),
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Llanowar Elves",
        ],
        hand: ["Mutational Advantage"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(castIt(s, "p1", "Mutational Advantage"), picking([cub]));
    expect(plusOne(s, cub)).toBe(2);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    // Les Elfes reçoivent un marqueur après la résolution : ils ne sont pas protégés.
    changeCounters(s, s.objects[elves] as never, "+1/+1", 1);
    dealDamage(s, sourceFromObject(s, elves), cub, 3, false);
    dealDamage(s, sourceFromObject(s, cub), elves, 1, false);
    expect(s.objects[cub]?.damage).toBe(0);
    expect(s.objects[elves]?.damage).toBe(1);
  });

  it("Mutational Advantage : la prévention est un effet, pas une capacité : Final Showdown (perte des capacités) ne la retire pas", () => {
    let s = scenario({
      p1: {
        battlefield: [
          ...lands("Island", 1),
          ...lands("Forest", 2),
          ...lands("Plains", 2),
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
        ],
        hand: ["Mutational Advantage", "Final Showdown"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castIt(s, "p1", "Mutational Advantage"), picking([cub]));
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Final Showdown"));
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Les créatures perdent leurs capacités") : undefined;
    expect(mode).toBeDefined();
    s = settle(castIt(s, "p1", "Final Showdown", { mode: mode?.index }));
    // Défense talismanique et indestructible sont des capacités accordées : elles sont perdues.
    expect(chars(s, cub).keywords).not.toContain("hexproof");
    expect(chars(s, cub).keywords).not.toContain("indestructible");
    // Les blessures restent prévenues, de combat ou non.
    dealDamage(s, sourceFromObject(s, cub), cub, 3, false);
    dealDamage(s, sourceFromObject(s, cub), cub, 2, true);
    expect(s.objects[cub]?.damage).toBe(0);
  });
});
