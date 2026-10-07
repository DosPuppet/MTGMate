/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « Turtle Power! » (Teenage Mutant Ninja Turtles).
 * Escouade, fusion, marqueurs (doublés, multipliés, comptés), copies qui attaquent les autres adversaires, jetons qui
 * attaquent chaque adversaire, déclenchements de pioche doublés, prévention changée en marqueurs.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  castable,
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

describe("Turtle Power! (EDH)", () => {
  describe("mots-clés", () => {
    it("escouade (702.157) : payée deux fois, Roadkill Rodney arrive avec deux copies", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), hand: ["Roadkill Rodney"] } });
      s = settle(castIt(s, "p1", "Roadkill Rodney", { x: 2 }));
      expect(onField(s, "p1", "Roadkill Rodney")).toBe(3);
      expect(tokens(s, "p1", "Roadkill Rodney")).toHaveLength(2);
      // Sans escouade : aucune copie (et les copies n'en créent pas).
      let t = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Roadkill Rodney"] } });
      t = settle(castIt(t, "p1", "Roadkill Rodney"));
      expect(onField(t, "p1", "Roadkill Rodney")).toBe(1);
    });

    it("fusion (702.102) : Double Jump et Flying Kick lancés ensemble depuis la main, gauche puis droite", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), ...lands("Mountain", 2), "Bear Cub"], hand: ["Double Jump // Flying Kick"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Double Jump // Flying Kick");
      const faces = legalActions(s, "p1").flatMap((a) => (a.type === "cast" && a.card === card ? [a.face] : []));
      expect(faces).toEqual(expect.arrayContaining([0, 1, 2]));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Double Jump // Flying Kick", { face: 2, targets: { j: [bear], ka: [bear], kb: [angel] } }));
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect([chars(s, bear).power, chars(s, bear).keywords.includes("flying")]).toEqual([5, true]);
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toContain("Double Jump // Flying Kick");
    });

    it("évolution (Ray Fillet) : un marqueur quand arrive une créature plus grande", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Ray Fillet, Wave Warrior"], hand: ["Bear Cub"] } });
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Ray Fillet, Wave Warrior"))).toBe(1);
    });
  });

  describe("commandant et créatures", () => {
    it("Heroes in a Half Shell : les Tortues et Ninjas qui blessent un joueur reçoivent un marqueur, et vous piochez", () => {
      let s = scenario({
        p1: { battlefield: ["Heroes in a Half Shell", "Splinter, the Mentor"], library: lands("Island", 5) },
      });
      const heroes = idOf(s, "p1", "battlefield", "Heroes in a Half Shell");
      const splinter = idOf(s, "p1", "battlefield", "Splinter, the Mentor");
      const h = hand(s, "p1");
      s = throughCombat(attack(s, [heroes, splinter]));
      expect([plusOne(s, heroes), plusOne(s, splinter)]).toEqual([1, 1]);
      expect(hand(s, "p1")).toBe(h + 1);
    });

    it("Shredder à trois joueurs : une copie non légendaire attaque l'autre adversaire, chacun perd la moitié de ses PV", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Shredder, Shadow Master"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Shredder, Shadow Master")], "p2");
      s = settle(s);
      const copy = tokens(s, "p1", "Shredder, Shadow Master")[0] ?? "";
      expect(s.combat?.attackers.find((a) => a.id === copy)?.defender).toBe("p3");
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      s = throughCombat(s);
      // 20 − 5 = 15, puis la moitié arrondie au supérieur (8) : 7.
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([7, 7]);
      expect(tokens(s, "p1", "Shredder, Shadow Master")).toHaveLength(0);
    });

    it("Krang : les capacités déclenchées par une pioche se déclenchent deux fois (Baxter : deux marqueurs)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Krang, the All-Powerful", "Baxter, Fly in the Ointment"],
          hand: ["Opt"],
          library: lands("Island", 5),
        },
      });
      s = settle(castIt(s, "p1", "Opt"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Baxter, Fly in the Ointment"))).toBe(2);
    });

    it("Vigor : les blessures à une autre de vos créatures sont prévenues, autant de marqueurs +1/+1 à la place", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Vigor", "Bear Cub"], hand: ["Shock"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [bear] } }));
      expect([s.objects[bear]?.damage, plusOne(s, bear)]).toEqual([0, 2]);
    });

    it("Raphael : vos créatures avec des marqueurs infligent le double de blessures", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, the Muscle", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Corpsejack Menace et Casey Jones : deux fois plus de marqueurs, et autant de blessures à un adversaire", () => {
      let s = scenario({
        p1: {
          battlefield: ["Casey Jones, Back Alley Brute", "Corpsejack Menace", "Bear Cub", ...lands("Plains", 2)],
          hand: ["Together Forever"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Together Forever"), picking([bear]));
      expect(plusOne(s, bear)).toBe(2);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Irma : devient une copie d'une autre de vos créatures, garde son nom et sa capacité, puis un marqueur", () => {
      let s = scenario({ p1: { battlefield: ["Irma, Part-Time Mutant", "Serra Angel"] } });
      const irma = idOf(s, "p1", "battlefield", "Irma, Part-Time Mutant");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      s = settle(s, picking([angel]));
      expect(chars(s, irma).name).toBe("Irma, Part-Time Mutant");
      expect([chars(s, irma).power, chars(s, irma).keywords.includes("flying")]).toEqual([5, true]);
    });

    it("Dimension X Pizzasaur : deux marqueurs, puis détruit une créature de valeur de mana au plus vos marqueurs", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Dimension X Pizzasaur"] },
        p2: { battlefield: ["Savannah Lions", "Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      // La créature qui reçoit les marqueurs, puis celle à détruire.
      const want = [bear, lions];
      s = settle(castIt(s, "p1", "Dimension X Pizzasaur"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? [want.shift() ?? ""] : undefined,
      );
      expect(plusOne(s, bear)).toBe(2);
      expect(onField(s, "p2", "Savannah Lions")).toBe(0);
      // Serra Angel (valeur de mana 5) n'était pas une cible permise avec deux marqueurs.
      expect(onField(s, "p2", "Serra Angel")).toBe(1);
    });
  });

  describe("artefacts, enchantements, sorts", () => {
    it("Coin of Mastery : un marqueur +1/+1 par mana d'artefact dépensé pour lancer la créature", () => {
      let s = scenario({
        p1: { battlefield: ["Coin of Mastery", "Sol Ring", ...lands("Forest", 2)], hand: ["Big Mother Mouser"] },
      });
      s = settle(castIt(s, "p1", "Big Mother Mouser"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Big Mother Mouser"))).toBe(4);
      // Sol Ring pour un seul {1} : le {C} en trop reste dans la réserve, un seul marqueur.
      let t = scenario({ p1: { battlefield: ["Coin of Mastery", "Sol Ring", "Forest"], hand: ["Bear Cub"] } });
      t = settle(castIt(t, "p1", "Bear Cub"));
      expect(plusOne(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Endless Foot Assault à trois joueurs : un Ninja engagé et attaquant pour chaque adversaire", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Endless Foot Assault", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = settle(s);
      const ninjas = tokens(s, "p1", "Ninja");
      expect(ninjas.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender).sort()).toEqual(["p2", "p3"]);
      expect(ninjas.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Game Over : {2} de moins si un joueur a au plus la moitié de ses PV de départ", () => {
      const at = (life: number) => scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Game Over"] }, p2: { life } });
      const s = at(10);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Game Over"))).toBe(true);
      const t = at(11);
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Game Over"))).toBe(false);
    });

    it("Here Comes a New Hero! : le joueur ciblé pioche X, une copie d'une créature de valeur de mana X ou moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Here Comes a New Hero!"], library: lands("Island", 5) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Here Comes a New Hero!", { x: 2, targets: { p: ["p1"], c: [bear] } }));
      expect(hand(s, "p1")).toBe(h - 1 + 2);
      expect(tokens(s, "p1", "Bear Cub")).toHaveLength(1);
    });

    it("Wave Goodbye : les créatures sans marqueur +1/+1 retournent en main", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), { name: "Bear Cub", counters: { "+1/+1": 1 } }], hand: ["Wave Goodbye"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Wave Goodbye"));
      expect([onField(s, "p1", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([1, 0]);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
    });

    it("Thriving Grove : la couleur choisie n'est pas le vert", () => {
      const s = scenario({ p1: { hand: ["Thriving Grove"] } });
      const grove = idOf(s, "p1", "hand", "Thriving Grove");
      const play = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === grove);
      const req = play?.type === "playLand" ? play.choose : undefined;
      expect(req?.type === "pick" ? [...req.options].sort() : []).toEqual(["B", "R", "U", "W"]);
    });

    it("Exploding Barrel : un marqueur de pression par mana ; la capacité coûte {1} de moins par marqueur", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Exploding Barrel", counters: { pressure: 7 } }, "Mountain"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", "Exploding Barrel", { targets: { t: [angel] } }));
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
    });
  });
});

describe("Turtle Power! (EDH) : provocation (PLAN-H, lot H3)", () => {
  it("Fast Forward : les créatures adverses sont provoquées jusqu'à votre prochain tour", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Mountain", 5), hand: ["Fast Forward"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Fast Forward"));
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p1"]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2");
    const to = (defender: string) => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender }] });
    expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
    expect(() => to("p1")).toThrow();
    s = to("p3");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
  });
});

describe("joueur attaqué en multijoueur (PLAN-H, lot H5)", () => {
  it("Shredder, Shadow Master : « attaque un joueur » — rien quand il attaque un planeswalker", () => {
    const run = (atWalker: boolean) => {
      let s = scenario({ players: 3, p1: { battlefield: ["Shredder, Shadow Master"] }, p2: { battlefield: ["Ajani Resolute"] } });
      const defender = atWalker ? idOf(s, "p2", "battlefield", "Ajani Resolute") : "p2";
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Shredder, Shadow Master")], defender);
      s = settle(s);
      return tokens(s, "p1", "Shredder, Shadow Master").map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender);
    };
    expect(run(false)).toEqual(["p3"]);
    expect(run(true)).toEqual([]);
  });
});
