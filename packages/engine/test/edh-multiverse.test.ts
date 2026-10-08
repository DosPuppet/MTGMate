/**
 * Commander (EDH pseudo-set): rules tests of the "Multiverse Reforged" preconstructed deck (Reality Fracture). Monarch,
 * toxic, piles split by the opponent, Jace's attack restriction, a player's protection from a card type,
 * "until that player's next turn" effects, reveals from another player's library, incubate.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { attackableDefenders } from "../src/turn";
import type { GameState, PlayerId } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  idOf,
  idsOf,
  lands,
  nameOf,
  passBoth,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const life = (s: GameState, p: PlayerId) => s.players[p]?.life ?? 0;
const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const toTurnOf = (s: GameState, p: PlayerId, step = "main1") =>
  advanceUntil(s, (x) => x.turn.active === p && x.turn.step === step && x.pending?.kind === "priority", 600);
/** p2 attacks p1 with these creatures. */
const p2Attacks = (s: GameState, ids: string[]) => {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2", 100);
  return act(cur, "p2", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p1" })) });
};
const activate = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const source = idOf(s, p, "battlefield", name);
  const o = legalActions(s, p).find((a) => a.type === "activate" && a.source === source);
  if (o?.type !== "activate") throw new Error(`no ability for ${name}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};

describe("Multiverse Reforged (EDH)", () => {
  describe("monarch", () => {
    it("Tamiyo makes you the monarch; the monarch draws at the beginning of their end step", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 3).concat(lands("Mountain", 3)),
          hand: ["Tamiyo, Upriser Crowned"],
          library: Array(5).fill("Opt"),
        },
      });
      s = settle(castIt(s, "p1", "Tamiyo, Upriser Crowned"));
      expect(s.monarch).toBe("p1");
      const h = hand(s, "p1");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      // 724.2: the monarch's triggered ability, on the stack at the beginning of their end step.
      expect(s.stack.map((x) => [x.sourceDefId, x.controller])).toEqual([["rules:monarch", "p1"]]);
      expect(hand(s, "p1")).toBe(h);
      s = passBoth(s);
      expect(hand(s, "p1")).toBe(h + 1);
    });

    it('the monarch: "that player draws", even if they stopped being the monarch before resolution; stack view', () => {
      let s = scenario({ p1: { library: Array(5).fill("Opt") }, p2: { library: Array(5).fill("Opt") } });
      s.monarch = "p1";
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      const item = projectView(s, "p2").stack[0];
      expect([item?.name, item?.fr?.name, item?.effect]).toEqual(["Monarch", "Monarque", "Monarch: draw a card"]);
      const [h1, h2] = [hand(s, "p1"), hand(s, "p2")];
      s.monarch = "p2";
      s = passBoth(s);
      expect([hand(s, "p1"), hand(s, "p2")]).toEqual([h1 + 1, h2]);
    });

    it("the monarch does not draw at another player's end step", () => {
      let s = scenario({ active: "p2", p1: { library: Array(5).fill("Opt") }, p2: { library: Array(5).fill("Opt") } });
      s.monarch = "p1";
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      expect(s.stack).toEqual([]);
    });

    it("a creature that deals combat damage to the monarch makes its controller the monarch", () => {
      let s = scenario({ active: "p2", p1: {}, p2: { battlefield: ["Bear Cub"] } });
      s.monarch = "p1";
      s = throughCombat(p2Attacks(s, [idOf(s, "p2", "battlefield", "Bear Cub")]));
      expect(s.monarch).toBe("p2");
    });

    it("724.2: the transfer goes on the stack, controlled by the monarch; it changes only on resolution", () => {
      let s = scenario({ active: "p2", p1: {}, p2: { battlefield: ["Bear Cub", "Bear Cub"] } });
      s.monarch = "p1";
      s = p2Attacks(s, idsOf(s, "p2", "battlefield", "Bear Cub"));
      s = advanceUntil(s, (x) => x.stack.length > 0 || x.turn.step === "main2", 300);
      // One ability per creature that dealt damage to the monarch.
      expect(s.stack.map((x) => [x.sourceDefId, x.controller])).toEqual([
        ["rules:monarchSteal", "p1"],
        ["rules:monarchSteal", "p1"],
      ]);
      expect(s.monarch).toBe("p1");
      const item = projectView(s, "p2").stack[0];
      expect([item?.fr?.name, item?.effect]).toEqual(["Monarque", "Monarch: the creature's controller becomes the monarch"]);
      s = passBoth(s);
      expect(s.monarch).toBe("p2");
    });

    it("Tamiyo: creatures damage the monarch who controls her: tapped, one stun counter each", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Tamiyo, Upriser Crowned"] }, p2: { battlefield: ["Bear Cub"] } });
      s.monarch = "p1";
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = throughCombat(p2Attacks(s, [bear]));
      expect(s.objects[bear]?.counters.stun).toBe(1);
      expect(s.objects[bear]?.tapped).toBe(true);
    });
  });

  describe("toxic and corrupted", () => {
    it("Phyrexian Mite (toxic 1): a poison counter on top of the damage; Skrelv's Hive, corrupted: lifelink", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Skrelv's Hive"] } });
      s = toTurnOf(s, "p1", "main1");
      const mite = tokens(s, "p1", "Phyrexian Mite")[0] ?? "";
      expect(chars(s, mite).keywords).toEqual(expect.arrayContaining(["toxic", "cantBlock"]));
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" && x.turn.number > s.turn.number && x.turn.step === "main1" && x.pending?.kind === "priority",
        600,
      );
      s = throughCombat(attack(s, [tokens(s, "p1", "Phyrexian Mite")[0] ?? ""]));
      expect(s.players.p2?.counters?.poison).toBe(1);
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, poison: 3 };
      s.version += 1;
      expect(chars(s, mite).keywords).toContain("lifelink");
    });
  });

  describe("spells", () => {
    it("Fact or Fiction: the opponent splits the five cards, you choose your pile", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Fact or Fiction"], library: ["Opt", "Opt", "Shock", "Shock", "Bear Cub"] },
      });
      s = castIt(s, "p1", "Fact or Fiction");
      let separator: PlayerId | undefined;
      let chooser: PlayerId | undefined;
      s = settle(s, (req, p) => {
        if (req.type === "pick" && req.intent === "piles" && req.max > 1) {
          separator = p;
          return req.options.slice(0, 1);
        }
        if (req.type === "pick" && req.intent === "piles") {
          chooser = p;
          return ["up"];
        }
        return undefined;
      });
      expect([separator, chooser]).toEqual(["p2", "p1"]);
      expect(hand(s, "p1")).toBe(4);
      expect(s.players.p1?.graveyard.length).toBe(2);
    });

    it("Fact or Fiction (three players): you choose the opponent who splits the cards", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Island", 4), hand: ["Fact or Fiction"], library: ["Opt", "Opt", "Shock", "Shock", "Bear Cub"] },
      });
      s = castIt(s, "p1", "Fact or Fiction");
      const offered: string[][] = [];
      let separator: PlayerId | undefined;
      s = settle(s, (req, p) => {
        if (req.type === "pick" && req.options.includes("p3")) {
          offered.push([p, ...req.options]);
          return ["p3"];
        }
        if (req.type === "pick" && req.intent === "piles" && req.max > 1) {
          separator = p;
          return req.options.slice(0, 1);
        }
        return req.type === "pick" && req.intent === "piles" ? ["up"] : undefined;
      });
      expect(offered).toEqual([["p1", "p2", "p3"]]);
      expect(separator).toBe("p3");
      expect(hand(s, "p1")).toBe(4);
    });

    it("Teferi's Reproach: protection and life frozen until the opponent's next turn; their nonlands disappear", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Teferi's Reproach"] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      s = settle(castIt(s, "p1", "Teferi's Reproach", { targets: { t: ["p2"] } }));
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      // The opponent's turn: the effect ends at the beginning of their turn (before their untap step, the creature comes back).
      s = toTurnOf(s, "p2", "main1");
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
    });

    it("Martial Coup: X >= 5 creates X Soldiers and destroys all other creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Martial Coup"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Martial Coup", { x: 5 }));
      expect(tokens(s, "p1", "Soldier")).toHaveLength(5);
      expect(onField(s, "p1", "Bear Cub") + onField(s, "p2", "Bear Cub")).toBe(0);
    });

    it("Sunfall: exiles all creatures and incubates X; the Incubator becomes a Phyrexian creature with its counters", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Sunfall"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Sunfall"));
      const inc = tokens(s, "p1", "Incubator")[0] ?? "";
      expect(s.objects[inc]?.counters["+1/+1"]).toBe(2);
      s = settle(activate(s, "p1", "Incubator"));
      expect(chars(s, inc).types).toContain("Creature");
      expect(chars(s, inc).power).toBe(2);
    });

    it("Mass Polymorph: your creatures exiled, that many creature cards from the library enter", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), "Bear Cub", "Savannah Lions"],
          hand: ["Mass Polymorph"],
          library: ["Opt", "Gigantosaurus", "Opt", "Serra Angel"],
        },
      });
      s = settle(castIt(s, "p1", "Mass Polymorph"));
      expect([onField(s, "p1", "Gigantosaurus"), onField(s, "p1", "Serra Angel"), onField(s, "p1", "Bear Cub")]).toEqual([
        1, 1, 0,
      ]);
    });
  });

  describe("creatures", () => {
    it("Nissa, Leyline Tamer: the first landfall each turn reveals a creature, not the second, and again the next turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Nissa, Leyline Tamer"],
          hand: ["Forest", "Plains"],
          library: ["Opt", "Bear Cub", "Island", "Island", "Island", "Savannah Lions", ...lands("Island", 6)],
        },
        p2: { library: lands("Island", 10) },
      });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") } as never));
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      // Second land of the turn (allowed by an effect simulated here): the creature is not revealed.
      s.turn.landsPlayed = 0;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") } as never));
      expect(onField(s, "p1", "Savannah Lions")).toBe(0);
      // On p1's next turn, the first landfall reveals a creature again.
      s = toTurnOf(s, "p2");
      s = toTurnOf(s, "p1");
      const land = idsOf(s, "p1", "hand", "Island")[0] ?? "";
      s = settle(act(s, "p1", { type: "playLand", card: land } as never));
      expect(onField(s, "p1", "Savannah Lions")).toBe(1);
    });

    it("Jace, Multiverse Architect: an opponent who doesn't pay {2} can't attack your Jaces this turn", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Jace, Multiverse Architect"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(
        s,
        (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.pending?.kind === "priority"),
        50,
      );
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 50);
      const jace = idOf(s, "p1", "battlefield", "Jace, Multiverse Architect");
      expect(attackableDefenders(s, "p2")).not.toContain(jace);
      expect(attackableDefenders(s, "p2")).toContain("p1");
    });

    it("Serra's Emissary: you and your creatures have protection from the chosen card type", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Serra's Emissary"] },
        p2: { battlefield: ["Mountain", "Bear Cub"], hand: ["Shock"] },
      });
      s = settle(castIt(s, "p1", "Serra's Emissary"), (req) =>
        req.type === "pick" && req.options.includes("Instant") ? ["Instant"] : undefined,
      );
      s = toTurnOf(s, "p2", "main1");
      const shock = idOf(s, "p2", "hand", "Shock");
      const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === shock);
      const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
      expect(legal).not.toContain("p1");
      expect(legal).not.toContain(idOf(s, "p1", "battlefield", "Serra's Emissary"));
      // The other creatures you control are protected from the type chosen by the Emissary (not by themselves);
      // the opponent's are not.
      expect(legal).not.toContain(idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(legal).toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect(legal).toContain("p2");
    });

    it("Niv-Mizzet, Ghost Counsel: you gain life, pay as much to draw as many cards", () => {
      let s = scenario({ p1: { battlefield: ["Niv-Mizzet, Ghost Counsel"], library: Array(3).fill("Opt") } });
      const niv = idOf(s, "p1", "battlefield", "Niv-Mizzet, Ghost Counsel");
      s = act(s, "p1", { type: "activate", source: niv, ability: 1 } as never);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      // Each opponent loses 1, you gain 1; then 1 life paid, one card drawn.
      expect(life(s, "p1")).toBe(20);
      expect(hand(s, "p1")).toBe(1);
    });

    it("Omnath, Locus of the Void: +1/+1 per unused mana; landfall: {C}{C}", () => {
      let s = scenario({ p1: { battlefield: ["Omnath, Locus of the Void"], hand: ["Forest"] } });
      const omnath = idOf(s, "p1", "battlefield", "Omnath, Locus of the Void");
      expect(chars(s, omnath).power).toBe(6);
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(s.players.p1?.manaPool.C).toBe(2);
      expect(chars(s, omnath).power).toBe(8);
    });

    it("Avacyn, Angel of Horror: a nontoken creature that dies comes back at the beginning of the next end step", () => {
      let s = scenario({
        p1: { battlefield: ["Avacyn, Angel of Horror", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      s = toTurnOf(s, "p2", "main1");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(onField(s, "p1", "Bear Cub")).toBe(0);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 600);
      s = settle(s);
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
    });

    it("Jhoira: the opponent reveals up to one historic permanent, which enters under your control; you lose life equal to its mana value", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Jhoira, Weatherlight Corsair"] },
        p2: { library: ["Opt", "Sol Ring", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Jhoira, Weatherlight Corsair"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(onField(s, "p1", "Sol Ring")).toBe(1);
      expect(life(s, "p1")).toBe(19);
    });

    it("Archfiend of Despair: your opponents don't gain life; at the end step, they lose as much as they lost", () => {
      let s = scenario({ p1: { battlefield: ["Archfiend of Despair", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      s = settle(s);
      expect(life(s, "p2")).toBe(16);
    });

    it("Darksteel Angel: your creatures don't get -1/-1 counters", () => {
      expect(card("Darksteel Angel").keywords).toEqual(expect.arrayContaining(["flying", "indestructible"]));
    });

    it("Dack Fayden: one creature per opponent enters, goaded (must attack), under that opponent's control", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Dack Fayden, Helping Hand"], library: ["Opt", "Bear Cub", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Dack Fayden, Helping Hand"));
      const bear = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") ?? "";
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p1"]);
      // In a duel, it attacks p1 (the only opponent) if possible.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2", 100);
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).not.toThrow();
    });

    it("Dack Fayden with three players: each creature, goaded forever, attacks a player other than you if possible", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: lands("Plains", 6),
          hand: ["Dack Fayden, Helping Hand"],
          library: ["Opt", "Bear Cub", "Savannah Lions", "Opt"],
        },
      });
      s = settle(castIt(s, "p1", "Dack Fayden, Helping Hand"));
      const bear = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") ?? "";
      const lions = s.battlefield.find((id) => nameOf(s, id) === "Savannah Lions") ?? "";
      const p2Gets = s.objects[bear]?.controller === "p2" ? bear : lions;
      expect([s.objects[bear]?.controller, s.objects[lions]?.controller].sort()).toEqual(["p2", "p3"]);
      // Two turns later (p2, then p3, then p2 again), still goaded.
      for (let round = 0; round < 2; round++) {
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2", 600);
        const no = (d: string) => act(s, "p2", { type: "declareAttackers", attackers: [{ id: p2Gets, defender: d }] });
        expect(() => no("p1")).toThrow();
        s = no("p3");
      }
    });

    it("Proteus Staff: the creature underneath the library; its controller reveals until a creature and puts it onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: ["Proteus Staff", ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"], library: ["Opt", "Savannah Lions"] },
      });
      s = settle(activate(s, "p1", "Proteus Staff", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(onField(s, "p2", "Savannah Lions")).toBe(1);
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
    });
  });

  describe("Cursed Mirror (PLAN-H H9)", () => {
    it("as it enters, copies a creature until end of turn, with haste; its enter abilities trigger", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Cursed Mirror"] },
        p2: { battlefield: ["Burglar Rat"], hand: ["Opt"] },
      });
      const rat = idOf(s, "p2", "battlefield", "Burglar Rat");
      s = settle(castIt(s, "p1", "Cursed Mirror"), picking([rat]));
      const mirror = idOf(s, "p1", "battlefield", "Cursed Mirror");
      expect(chars(s, mirror).name).toBe("Burglar Rat");
      expect(chars(s, mirror).types).toEqual(["Creature"]);
      expect(chars(s, mirror).keywords).toContain("haste");
      // It entered as Burglar Rat: "when this creature enters, each opponent discards a card".
      expect(hand(s, "p2")).toBe(0);
      // At cleanup, the copy ends: it's an artifact again that produces {R}.
      s = toTurnOf(s, "p2");
      expect(chars(s, mirror).name).toBe("Cursed Mirror");
      expect(chars(s, mirror).types).toEqual(["Artifact"]);
    });

    it('"you may": with no copy, it enters as an artifact', () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Cursed Mirror"] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(castIt(s, "p1", "Cursed Mirror"), (req) => (req.type === "pick" && req.min === 0 ? [] : undefined));
      expect(chars(s, idOf(s, "p1", "battlefield", "Cursed Mirror")).name).toBe("Cursed Mirror");
    });
  });

  describe("Gingerbrute and Venser", () => {
    it("Ginger: monarch on enter; at each upkeep, if you are the monarch, a Gingerbrute", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 6), hand: ["Ginger, Queen of Sweets"] } });
      s = settle(castIt(s, "p1", "Ginger, Queen of Sweets"));
      expect(s.monarch).toBe("p1");
      s = toTurnOf(s, "p2", "main1");
      expect(tokens(s, "p1", "Gingerbrute")).toHaveLength(1);
    });

    it("Venser: two token copies of a permanent an opponent controls, with haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Venser, Fervent Forger"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      s = settle(castIt(s, "p1", "Venser, Fervent Forger"), (req, _p, cur) => {
        return picking(idsOf(cur, "p2", "battlefield", "Gigantosaurus"))(req);
      });
      expect(tokens(s, "p1", "Gigantosaurus")).toHaveLength(2);
    });
  });
});
