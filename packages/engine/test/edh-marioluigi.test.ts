/**
 * Commander (EDH pseudo-set): rules tests for the "Mario & Luigi" deck (partners Bruse Tarl and Reyhan). Two
 * commanders (702.124: each its own tax), +1/+1 counters, granted blitz (Henzie), "the chosen player" (Saskia),
 * Champion of Lambholt's blocking rule.
 */
import { buildGameDeck, deckById } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { canBlock } from "../src/turn";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: GameState, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
const activate = (s: GameState, p: PlayerId, source: ObjectId, extra: object = {}, index = 0) => {
  const o = activations(s, p, source)[index];
  if (!o) throw new Error(`no ability for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const plusOne = (s: GameState, id: ObjectId) => s.objects[id]?.counters["+1/+1"] ?? 0;
const tokensNamed = (s: GameState, p: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
/** Casts a commander from the command zone. */
const castCommander = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const id = (s.players[p]?.command ?? []).find((x) => nameOf(s, x) === name) ?? "";
  return act(s, p, { type: "cast", card: id, ...extra } as never);
};

describe("Mario & Luigi, partners (EDH)", () => {
  describe("two commanders", () => {
    it("the precon starts with both partners in the command zone; each one has its own tax", () => {
      const d = buildGameDeck(deckById("cmd-mario-luigi"));
      expect(d.commanders).toEqual([0, 1]);
      const { state } = createGame({
        seed: 3,
        variant: "commander",
        players: [
          { id: "p1", name: "A", deck: d.deck, commanders: d.commanders },
          { id: "p2", name: "B", deck: buildGameDeck(deckById("cmd-edgar-markov")).deck, commanders: [0] },
        ],
      });
      expect(namesIn(state, state.players.p1?.command).sort()).toEqual([
        "Bruse Tarl, Boorish Herder",
        "Reyhan, Last of the Abzan",
      ]);
      // Each one is cast with its own tax (903.8): Reyhan cast twice, Bruse never.
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4).concat(lands("Swamp", 3), lands("Forest", 3), lands("Mountain", 2)),
          command: ["Bruse Tarl, Boorish Herder", "Reyhan, Last of the Abzan"],
        },
      });
      s = settle(castCommander(s, "p1", "Reyhan, Last of the Abzan"));
      const reyhan = idOf(s, "p1", "battlefield", "Reyhan, Last of the Abzan");
      expect(plusOne(s, reyhan)).toBe(3);
      const rec = Object.values(s.commander?.cards ?? {});
      expect(rec.map((r) => r.casts).sort()).toEqual([0, 1]);
      // Bruse: {2}{R}{W} without tax (8 lands left: payable), Reyhan's tax doesn't apply to it.
      expect(castable(s, "p1", (s.players.p1?.command ?? [])[0] ?? "")).toBe(true);
    });

    it("Jirina Kudro: a Human Soldier for each time you've cast a commander (both counted)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 7), ...lands("Swamp", 4), ...lands("Mountain", 4), ...lands("Forest", 4)],
          hand: ["Jirina Kudro"],
          command: ["Bruse Tarl, Boorish Herder", "Reyhan, Last of the Abzan"],
        },
      });
      s = settle(castCommander(s, "p1", "Reyhan, Last of the Abzan"));
      s = settle(
        castCommander(s, "p1", "Bruse Tarl, Boorish Herder"),
        picking([idOf(s, "p1", "battlefield", "Reyhan, Last of the Abzan")]),
      );
      s = settle(castIt(s, "p1", "Jirina Kudro"));
      expect(tokensNamed(s, "p1", "Human Soldier")).toHaveLength(2);
      // Other Humans +2/+0: Bruse (Human Ally) 5/3.
      expect(chars(s, idOf(s, "p1", "battlefield", "Bruse Tarl, Boorish Herder")).power).toBe(5);
    });

    it("Bruse Tarl: enters or attacks, a creature you control gains double strike and lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Bruse Tarl, Boorish Herder", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bruse Tarl, Boorish Herder")]), picking([bear]));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["doubleStrike", "lifelink"]));
    });

    it("Reyhan: a creature with counters dies, its counters go to a target creature", () => {
      let s = scenario({
        p1: {
          battlefield: [
            { name: "Reyhan, Last of the Abzan", counters: { "+1/+1": 3 } },
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            "Savannah Lions",
          ],
        },
        p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", "Lightning Bolt"),
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      } as never);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : picking([lions])(req)));
      expect(plusOne(s, lions)).toBe(1);
    });
  });

  describe("counters", () => {
    it("Cathars' Crusade and Conclave Mentor: a creature entering puts one more counter on each creature", () => {
      let s = scenario({ p1: { battlefield: ["Cathars' Crusade", "Conclave Mentor", "Forest", "Forest"], hand: ["Bear Cub"] } });
      const mentor = idOf(s, "p1", "battlefield", "Conclave Mentor");
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, mentor)).toBe(2);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
    });

    it("Tuskguard Captain and Abzan Falconer: outlast; creatures with a counter have trample and flying", () => {
      let s = scenario({ p1: { battlefield: ["Tuskguard Captain", "Abzan Falconer", "Forest", "Bear Cub"] } });
      const captain = idOf(s, "p1", "battlefield", "Tuskguard Captain");
      s = settle(activate(s, "p1", captain));
      expect(plusOne(s, captain)).toBe(1);
      expect(s.objects[captain]?.tapped).toBe(true);
      expect(chars(s, captain).keywords).toEqual(expect.arrayContaining(["trample", "flying"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
    });

    it("Ghave: enters with five counters; {1}, remove a counter: a Saproling", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Ghave, Guru of Spores"],
        },
      });
      s = settle(castIt(s, "p1", "Ghave, Guru of Spores"));
      const ghave = idOf(s, "p1", "battlefield", "Ghave, Guru of Spores");
      expect(plusOne(s, ghave)).toBe(5);
      s = settle(activate(s, "p1", ghave, {}, 0));
      expect(tokensNamed(s, "p1", "Saproling")).toHaveLength(1);
      expect(plusOne(s, ghave)).toBe(4);
    });

    it("Mikaeus, the Lunarch: X counters; remove one: a counter on each other creature", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Mikaeus, the Lunarch"] } });
      s = settle(castIt(s, "p1", "Mikaeus, the Lunarch", { x: 2 }));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Mikaeus, the Lunarch"))).toBe(2);
      // On the battlefield since an earlier turn: {T} abilities.
      s = scenario({ p1: { battlefield: ["Bear Cub", { name: "Mikaeus, the Lunarch", counters: { "+1/+1": 2 } }] } });
      const mikaeus = idOf(s, "p1", "battlefield", "Mikaeus, the Lunarch");
      s = settle(activate(s, "p1", mikaeus, {}, 1));
      expect(plusOne(s, mikaeus)).toBe(1);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Kresh: another creature dies, X counters (its power)", () => {
      const s = scenario({
        p1: { battlefield: ["Kresh the Bloodbraided"] },
        p2: { battlefield: ["Consecrated Sphinx", "Mountain", "Mountain", "Mountain", "Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      // The Bolt kills nothing here: Savannah Lions instead.
      let t = scenario({
        p1: { battlefield: ["Kresh the Bloodbraided", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      t = act(t, "p2", {
        type: "cast",
        card: idOf(t, "p2", "hand", "Lightning Bolt"),
        targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] },
      } as never);
      t = settle(t, yes);
      expect(plusOne(t, idOf(t, "p1", "battlefield", "Kresh the Bloodbraided"))).toBe(3);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Grenzo: the bottom card goes to the graveyard; a creature with power up to Grenzo's enters", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Grenzo, Dungeon Warden", counters: { "+1/+1": 1 } }, ...lands("Swamp", 4)],
          library: ["Island", "Island", "Bear Cub"],
        },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Grenzo, Dungeon Warden")));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Grenzo, Dungeon Warden")));
      expect(graveyardNames(s, "p1")).toEqual(["Island"]);
    });

    it("Mayael's Aria: counters with power 5, 10 life with power 10", () => {
      let s = scenario({ p1: { battlefield: ["Mayael's Aria", { name: "Bear Cub", counters: { "+1/+1": 8 } }] }, active: "p2" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(9);
      expect(s.players.p1?.life).toBe(30);
    });
  });

  describe("other cards", () => {
    it("Henzie: a creature spell of mana value 4+ cast for blitz has haste, draws when it dies, and is sacrificed", () => {
      let s = scenario({
        p1: {
          battlefield: ['Henzie "Toolbox" Torre', ...lands("Swamp", 2), ...lands("Plains", 2), "Forest"],
          hand: ["Ghave, Guru of Spores"],
          library: lands("Swamp", 5),
        },
      });
      const ghave = idOf(s, "p1", "hand", "Ghave, Guru of Spores");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === ghave);
      expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
      s = settle(castIt(s, "p1", "Ghave, Guru of Spores", { alternative: true }));
      const g = idOf(s, "p1", "battlefield", "Ghave, Guru of Spores");
      expect(chars(s, g).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(graveyardNames(s, "p1")).toContain("Ghave, Guru of Spores");
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Saskia: combat damage to a player is also dealt to the chosen player", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 1), ...lands("Swamp", 1), ...lands("Mountain", 1), ...lands("Forest", 1), "Bear Cub"],
          hand: ["Saskia the Unyielding"],
        },
        players: 3,
      });
      s = settle(castIt(s, "p1", "Saskia the Unyielding"), (req) =>
        req.type === "pick" && req.intent === "chooseOnEnter" ? ["p3"] : undefined,
      );
      const saskia = idOf(s, "p1", "battlefield", "Saskia the Unyielding");
      expect(s.objects[saskia]?.chosen?.player).toBe("p3");
      s = act(
        advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
        "p1",
        {
          type: "declareAttackers",
          attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
        },
      );
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p3?.life).toBe(18);
    });

    it("Champion of Lambholt: creatures with less power than Champion's can't block your creatures", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Champion of Lambholt", counters: { "+1/+1": 2 } }, "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions", "Consecrated Sphinx"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bear]);
      // Champion 3/3: the Lions (2) can't block, the Sphinx (4) can.
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Consecrated Sphinx"), bear)).toBe(true);
    });

    it("Kibo: each player creates a Banana ({T}, sacrifice: {R} or {G}, 2 life)", () => {
      let s = scenario({ p1: { battlefield: ["Kibo, Uktabi Prince"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Kibo, Uktabi Prince")));
      expect(tokensNamed(s, "p1", "Banana")).toHaveLength(1);
      expect(tokensNamed(s, "p2", "Banana")).toHaveLength(1);
    });

    it("Single Combat: each player keeps one creature or planeswalker; no such spells until the end of your next turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Savannah Lions"], hand: ["Single Combat"] },
        p2: { battlefield: ["Consecrated Sphinx", "Dazzling Sphinx", "Island"], hand: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Single Combat"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(2);
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority" && x.pending.player === "p2",
      );
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Bear Cub"))).toBe(false);
    });

    it("Beast Within: destroy a permanent, its controller gets a 3/3 Beast; Kazuul's Fury: damage equal to the sacrificed power", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Beast Within"] },
        p2: { battlefield: ["Consecrated Sphinx"] },
      });
      s = settle(castIt(s, "p1", "Beast Within", { targets: { t: [idOf(s, "p2", "battlefield", "Consecrated Sphinx")] } }));
      expect(tokensNamed(s, "p2", "Beast")).toHaveLength(1);
      let t = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), { name: "Bear Cub", counters: { "+1/+1": 2 } }],
          hand: ["Kazuul's Fury // Kazuul's Cliffs"],
        },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(castIt(t, "p1", "Kazuul's Fury // Kazuul's Cliffs", { targets: { t: ["p2"] }, sacrifice: [bear] }));
      expect(t.players.p2?.life).toBe(16);
    });

    it("The Balrog of Moria: dies, you may exile it to exile a creature of each opponent", () => {
      let s = scenario({
        p1: { battlefield: ["The Balrog of Moria"] },
        p2: { battlefield: ["Consecrated Sphinx", "Mountain", "Mountain", "Mountain"], hand: ["Lightning Bolt"] },
      });
      const balrog = idOf(s, "p1", "battlefield", "The Balrog of Moria");
      const o = s.objects[balrog];
      if (o) o.damage = 7;
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Bolt"), targets: { t: [balrog] } } as never);
      s = settle(s, (req, _p, st) =>
        req.type === "yesNo"
          ? [1]
          : req.type === "pick"
            ? req.options.filter((id) => nameOf(st, id) === "Consecrated Sphinx")
            : undefined,
      );
      expect(exiled(s, "The Balrog of Moria")).toHaveLength(1);
      expect(exiled(s, "Consecrated Sphinx")).toHaveLength(1);
    });
  });
});
