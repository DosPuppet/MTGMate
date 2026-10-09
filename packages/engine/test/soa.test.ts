/** Mystical Archive (SOA): card rules tests (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, loseLife } from "../src/actions";
import { fx, ref, spell, target } from "../src/dsl";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { suspendCard } from "../src/stack";
import { chars } from "../src/state";
import { isLegalTarget } from "../src/targets";
import { plainText } from "../src/text";
import { stateBasedActions } from "../src/turn";
import { logTurnEvent } from "../src/turnlog";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  scenario,
  settle,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

const castOption = (s: ReturnType<typeof scenario>, card: string) =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Mystical Archive", () => {
  describe("Surcharge (702.96) : Cyclonic Rift", () => {
    it("targeted for {1}{U}: an opposing nonland permanent returns to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Cyclonic Rift"] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      const opt = castOption(s, rift);
      // Two Islands: only the normal mode is payable.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.index)).toEqual([0]);
      const bears = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: rift, mode: 0, targets: { t: [bears] } }));
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("overloaded for {6}{U}: each opposing nonland permanent, without a target; yours and the lands stay", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 7), "Bear Cub"], hand: ["Cyclonic Rift"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      // Two options: the normal cost (free casting and alternative costs possible), and overload separately.
      const opts = legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === rift);
      expect(opts.map((o) => o.type === "cast" && o.modes.map((m) => plainText(m.label ?? "")))).toEqual([
        ["Normal cost"],
        ["Overload — {6}{U}"],
      ]);
      s = settle(act(s, "p1", { type: "cast", card: rift, mode: 1 }));
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // The seven Islands paid for overload.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(7);
    });

    it("overload cannot be cast for free or with another alternative cost (118.9a)", () => {
      const s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Cyclonic Rift"] } });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      expect(() => act(s, "p1", { type: "cast", card: rift, mode: 1, free: true })).toThrow();
      expect(() => act(s, "p1", { type: "cast", card: rift, mode: 1, alternative: true })).toThrow();
    });
  });

  describe("Winds of Abandon", () => {
    it("targeted: the creature is exiled, its controller searches for a basic land, tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Winds of Abandon"] },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Forest", "Bear Cub"] },
      });
      const bears = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winds of Abandon"), mode: 0, targets: { t: [bears] } }),
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      const forests = idsOf(s, "p2", "battlefield", "Forest");
      expect(forests).toHaveLength(1);
      expect(s.objects[forests[0] as string]?.tapped).toBe(true);
    });

    it("overloaded: each opposing creature exiled, and as many basic lands for its controller", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Winds of Abandon"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"], library: ["Forest", "Forest", "Forest", "Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winds of Abandon"), mode: 1 }));
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.exile).toHaveLength(2);
    });

    it("targeted: the controller of the exiled creature searches, not its owner", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Winds of Abandon"], library: ["Plains", "Plains"] },
        p2: { library: ["Forest", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      steal(s, bear, "p2");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winds of Abandon"), mode: 0, targets: { t: [bear] } }),
      );
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(2);
    });

    it("overloaded: each controller searches for as many lands as their exiled creatures, stolen ones included", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Winds of Abandon"], library: ["Plains", "Plains"] },
        p2: { battlefield: ["Llanowar Elves"], library: ["Forest", "Forest", "Forest"] },
        p3: { battlefield: ["Serra Angel"], library: ["Island", "Island", "Island"] },
      });
      steal(s, idOf(s, "p1", "battlefield", "Bear Cub"), "p2");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winds of Abandon"), mode: 1 }));
      expect(s.exile).toHaveLength(3);
      // p2 controlled two creatures (their Elves and your Bear Cub), p3 one; you, none.
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(2);
      expect(idsOf(s, "p3", "battlefield", "Island")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(6);
    });
  });

  describe("Storm (702.40): Empty the Warrens, Brain Freeze", () => {
    it("one copy for each spell cast before it this turn, by any player", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Shock", "Empty the Warrens"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      // The opponent casts a spell on their priority turn (in response to nothing: they keep priority at empty stack).
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Empty the Warrens") });
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = settle(s);
      // A spell before Empty the Warrens (the first Shock): one copy, so four Goblins; the opposing Shock, cast
      // afterwards, does not count.
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
    });

    it("Brain Freeze: each copy mills three cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Opt", "Opt", "Brain Freeze"] },
        p2: { library: lands("Forest", 20) },
      });
      for (let i = 0; i < 2; i++) s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }));
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Brain Freeze"), targets: { t: ["p2"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(9);
    });
  });

  describe("G8 : Mystical Archive", () => {
    type S = ReturnType<typeof scenario>;
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

    it("Prismatic Ending: exiles if its mana value does not exceed the number of colors spent", () => {
      const run = (lands: string[], victim: string) => {
        let s = scenario({ p1: { battlefield: lands, hand: ["Prismatic Ending"] }, p2: { battlefield: [victim] } });
        s = settle(
          castIt(s, "Prismatic Ending", { x: lands.length - 1, targets: { t: [idOf(s, "p2", "battlefield", victim)] } }),
        );
        return idsOf(s, "p2", "battlefield", victim).length;
      };
      expect(run(["Plains", "Forest"], "Bear Cub")).toBe(0);
      expect(run(["Plains", "Plains"], "Bear Cub")).toBe(1);
    });

    it("Pongify: the creature is destroyed (no regeneration), its controller creates a 3/3 Ape", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Pongify"] }, p2: { battlefield: ["Shivan Dragon"] } });
      s = settle(castIt(s, "Pongify", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect([idsOf(s, "p2", "graveyard", "Shivan Dragon").length, idsOf(s, "p2", "battlefield", "Ape").length]).toEqual([1, 1]);
    });

    it("Living End: suspended; everyone exiles their creature cards from the graveyard, sacrifices their creatures, then returns the exiled ones", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Bear Cub"], hand: ["Living End"], graveyard: ["Shivan Dragon"] },
        p2: { battlefield: ["Llanowar Elves"], graveyard: ["Polyraptor"] },
      });
      suspendCard(s, idOf(s, "p1", "hand", "Living End"), 1);
      s = untilCastNow(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep"));
      const card = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Polyraptor")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Smallpox: each player loses 1 life, discards, sacrifices a creature and a land", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Smallpox", "Forest"] },
        p2: { battlefield: ["Forest", "Llanowar Elves"], hand: ["Opt"] },
      });
      s = settle(castIt(s, "Smallpox"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 19]);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Llanowar Elves", "Opt"]);
    });

    it("Subterranean Tremors: X damage to creatures without flying; X >= 4, destroy the artifacts", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Subterranean Tremors"] },
        p2: { battlefield: ["Shivan Dragon", "Bear Cub", "Mana Crypt"] },
      });
      s = settle(castIt(s, "Subterranean Tremors", { x: 4 }));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2").map((id) => nameOf(s, id))).toEqual([
        "Shivan Dragon",
      ]);
    });

    it("Awaken the Woods: X Forest Dryads, land creatures", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Awaken the Woods"] } });
      s = settle(castIt(s, "Awaken the Woods", { x: 3 }));
      const dryads = idsOf(s, "p1", "battlefield", "Forest Dryad");
      expect(dryads).toHaveLength(3);
      expect(manaAbilitiesOf(s, dryads[0] as string)[0]?.produce).toEqual(["G"]);
    });

    it("Berserk: trample and +X/+0; destroyed at the end step if it attacked", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Berserk"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Berserk", { targets: { t: [cub] } }));
      expect(chars(s, cub).power).toBe(4);
      s = throughCombat(attack(s, [cub]));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Glimpse of Nature: each creature spell cast this turn draws a card", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Glimpse of Nature", "Llanowar Elves", "Llanowar Elves"],
          library: lands("Forest", 5),
        },
      });
      s = settle(castIt(s, "Glimpse of Nature"));
      s = settle(castIt(s, "Llanowar Elves"));
      s = settle(castIt(s, "Llanowar Elves"));
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Culling Ritual: destroys nonland permanents with MV 2 or less; one mana per destroyed permanent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Culling Ritual"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"] },
      });
      s = settle(castIt(s, "Culling Ritual"));
      const pool = s.players.p1?.manaPool;
      expect((pool?.B ?? 0) + (pool?.G ?? 0)).toBe(2);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Bring to Light: a card with mana value at most the colors spent, cast for free", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Island", "Mountain"],
          hand: ["Bring to Light"],
          library: ["Shivan Dragon", "Bear Cub", "Forest"],
        },
      });
      s = untilCastNow(castIt(s, "Bring to Light"));
      expect(castNowOf(s)?.cards.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    });

    it("Expressive Iteration: one card in hand, one on the bottom, one exiled playable this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Mountain"],
          hand: ["Expressive Iteration"],
          library: ["Forest", "Shock", "Opt", "Plains"],
        },
      });
      s = settle(castIt(s, "Expressive Iteration"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.exile).toHaveLength(1);
    });
  });

  describe("G4e: player rules", () => {
    it("Angel's Grace: you don't lose this turn; damage doesn't take your life below 1", () => {
      let s = scenario({ p1: { life: 3, battlefield: ["Plains"], hand: ["Angel's Grace"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Angel's Grace") }));
      dealDamage(s, { defId: "test", controller: "p2", keywords: [] }, "p1", 10, false);
      expect(s.players.p1?.life).toBe(1);
      // Life loss is not limited, but the player does not lose the game this turn.
      loseLife(s, "p1", 5);
      stateBasedActions(s);
      expect(s.players.p1?.life).toBe(-4);
      expect(s.players.p1?.lost).toBe(false);
    });
  });
  describe("G4e : combat", () => {
    it("Veil of Summer: draws if an opponent cast a blue or black spell; hexproof from blue and black", () => {
      const drain = customCard({
        name: "Drain de test",
        types: ["Instant"],
        typeLine: "Instant",
        colors: ["B"],
        spell: spell([target.player()], [fx.loseLife(1, ref.target())]),
      });
      let s = scenario({
        p1: { battlefield: ["Forest"], hand: ["Veil of Summer"], library: lands("Forest", 3) },
        p2: { hand: [drain] },
      });
      logTurnEvent(s, {
        e: "cast",
        player: "p2",
        types: ["Instant"],
        subtypes: [],
        supertypes: [],
        fromZone: "hand",
        colors: ["U"],
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Veil of Summer") }));
      expect(s.players.p1?.hand).toHaveLength(1);
      const src = idOf(s, "p2", "hand", "Drain de test");
      expect(isLegalTarget(s, "p2", target.player(), "p1", src)).toBe(false);
      expect(isLegalTarget(s, "p2", target.player(), "p2", src)).toBe(true);
    });

    it("Deflecting Palm: prevents damage from the chosen source and deals it to its controller", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Mountain", "Plains"], hand: ["Deflecting Palm"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deflecting Palm") }), (req) =>
        req.type === "pick" && req.options.includes(shock) ? [shock] : undefined,
      );
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(18);
    });
  });
  describe("G4e: library and drawing", () => {
    it("Ad Nauseam: the top card to hand, as much life lost as its MV; you can repeat", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Ad Nauseam"], library: ["Shivan Dragon", "Shock", "Forest", "Island"] },
      });
      let asked = 0;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ad Nauseam") }), (req) =>
        req.type === "yesNo" ? [++asked < 2 ? 1 : 0] : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon", "Shock"]);
      expect(s.players.p1?.life).toBe(20 - 6 - 1);
    });
  });
  describe("L11: Mystical Archive", () => {
    type S = ReturnType<typeof scenario>;
    const float = (s: S, player: "p1" | "p2", ...names: string[]) => {
      let cur = s;
      for (const n of names) {
        const id = cur.battlefield.find(
          (x) => nameOf(cur, x) === n && cur.objects[x]?.controller === player && !cur.objects[x]?.tapped,
        ) as string;
        cur = act(cur, player, { type: "tapForMana", source: id, ability: 0 });
      }
      return cur;
    };
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const libraryCard = (s: S, name: string) => s.players.p1?.library.find((id) => nameOf(s, id) === name) as string;
    const names = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

    it("Armageddon: destroys all lands, yours included; the other permanents stay", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Armageddon"] },
        p2: { battlefield: ["Forest", "Mana Confluence", "Sol Ring"] },
      });
      s = settle(castIt(s, "Armageddon"));
      expect(names(s, s.battlefield).sort()).toEqual(["Bear Cub", "Sol Ring"]);
      expect(names(s, s.players.p2?.graveyard).sort()).toEqual(["Forest", "Mana Confluence"]);
    });

    describe("Flusterstorm", () => {
      const run = (theirMountains: number, pay: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Island"], hand: ["Flusterstorm"] },
          p2: { battlefield: lands("Mountain", theirMountains), hand: ["Shock"] },
        });
        s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
        s = act(s, "p2", { type: "pass" });
        const shock = s.stack[0]?.id as string;
        return settle(
          act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flusterstorm"), targets: { t: [shock] } }),
          (req) => (req.intent === "unlessPay" ? [pay ? 1 : 0] : undefined),
        );
      };

      it("counters the instant unless its controller pays {1}", () => {
        // One Mountain, tapped for Shock: cannot pay.
        const broke = run(1, true);
        expect(broke.players.p1?.life).toBe(20);
        expect(names(broke, broke.players.p2?.graveyard)).toEqual(["Shock"]);
        // Can pay, but declines.
        const refused = run(3, false);
        expect(refused.players.p1?.life).toBe(20);
        expect(names(refused, refused.players.p2?.graveyard)).toEqual(["Shock"]);
      });

      it("storm: the opposing spell cast before it gives one copy; {1} must be paid twice", () => {
        // Two Mountains: one for Shock, one spare: pays for one Flusterstorm, not for the copy.
        expect(run(2, true).players.p1?.life).toBe(20);
        // Three Mountains: pays both.
        const paid = run(3, true);
        expect(paid.players.p1?.life).toBe(18);
        expect(paid.battlefield.filter((id) => paid.objects[id]?.tapped && paid.objects[id]?.controller === "p2")).toHaveLength(
          3,
        );
      });

      it("only an instant or sorcery spell", () => {
        const s = scenario({
          active: "p2",
          p1: { battlefield: ["Island"], hand: ["Flusterstorm"] },
          p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        });
        let t = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
        t = act(t, "p2", { type: "pass" });
        const flu = idOf(t, "p1", "hand", "Flusterstorm");
        expect(castOption(t, flu)).toBeUndefined();
      });
    });

    it("Triumph of the Hordes: your creatures get +1/+1, trample and infect until end of turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Triumph of the Hordes"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(castIt(s, "Triumph of the Hordes"));
      expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 3]);
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["trample", "infect"]));
      expect([chars(s, elves).power, chars(s, elves).keywords]).toEqual([1, []]);
      s = advanceUntil(attack(s, [cub]), (x) => x.turn.step === "main2");
      // Infect: poison counters instead of life loss.
      expect([s.players.p2?.life, s.players.p2?.counters?.poison]).toEqual([20, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, cub).power, chars(s, cub).keywords]).toEqual([2, []]);
    });

    it("Vampiric Tutor: the chosen card on top of your library, and you lose 2 life", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Vampiric Tutor"], library: ["Forest", "Forest", "Shivan Dragon", "Forest"] },
      });
      const dragon = libraryCard(s, "Shivan Dragon");
      s = settle(castIt(s, "Vampiric Tutor"), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      expect(s.players.p1?.library[0]).toBe(dragon);
      expect(s.players.p1?.library).toHaveLength(4);
      expect(s.players.p1?.life).toBe(18);
    });

    it("Brotherhood's End: 3 damage to each creature and planeswalker; or destroy artifacts with mana value 3 or less", () => {
      const BIG = customCard({
        name: "Test Monolith",
        types: ["Artifact"],
        typeLine: "Artifact",
        manaCost: { generic: 4, colored: {}, x: 0 },
        manaCostText: "{4}",
      });
      const base = () =>
        scenario({
          p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Brotherhood's End"] },
          p2: { battlefield: ["Shivan Dragon", "Vivien Reid", "Sol Ring", BIG] },
        });
      let s = base();
      s = settle(castIt(s, "Brotherhood's End", { mode: 0 }));
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      expect([s.objects[dragon]?.damage, s.objects[idOf(s, "p2", "battlefield", "Vivien Reid")]?.counters.loyalty]).toEqual([
        3, 2,
      ]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      expect(idsOf(s, "p2", "battlefield", "Sol Ring")).toHaveLength(1);
      s = settle(castIt(base(), "Brotherhood's End", { mode: 1 }));
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Sol Ring"]);
      expect(idsOf(s, "p2", "battlefield", "Test Monolith")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Crop Rotation: sacrifice a land as an additional cost; a land card from your library onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Crop Rotation"], library: ["Plains", "Mana Confluence", "Bear Cub"] },
      });
      const confluence = libraryCard(s, "Mana Confluence");
      s = float(s, "p1", "Forest");
      const other = s.battlefield.find((id) => nameOf(s, id) === "Forest" && !s.objects[id]?.tapped) as string;
      s = settle(castIt(s, "Crop Rotation", { sacrifice: [other] }), (req) =>
        req.type === "pick" && req.options.includes(confluence) ? [confluence] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Mana Confluence")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      // Without a land to sacrifice: cannot be cast.
      const t = scenario({ p1: { battlefield: ["Llanowar Elves"], hand: ["Crop Rotation"] } });
      expect(castOption(t, idOf(t, "p1", "hand", "Crop Rotation"))).toBeUndefined();
    });

    it("Culling the Weak: sacrifice a creature as an additional cost; add {B}{B}{B}{B}", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Culling the Weak"] } });
      s = float(s, "p1", "Swamp");
      s = settle(castIt(s, "Culling the Weak", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(s.players.p1?.manaPool.B).toBe(4);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Preordain: scry 2, then draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Preordain"], library: ["Forest", "Bear Cub", "Mountain"] } });
      const [forest] = s.players.p1?.library ?? [];
      let asked = false;
      s = settle(castIt(s, "Preordain"), (req) => {
        if (req.type !== "pick" || !req.options.includes(forest as string)) return undefined;
        asked = true;
        expect(req.options).toHaveLength(2);
        return [forest as string];
      });
      expect(asked).toBe(true);
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library.at(-1)).toBe(forest);
    });

    it("Pyretic Ritual: add {R}{R}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Pyretic Ritual"] } });
      s = settle(castIt(float(s, "p1", "Mountain", "Mountain"), "Pyretic Ritual"));
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    it("Reprieve: the target spell returns to its owner's hand; you draw a card", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Reprieve"], library: ["Forest", "Forest"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(castIt(s, "Reprieve", { targets: { t: [shock] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(names(s, s.players.p2?.hand)).toEqual(["Shock"]);
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
    });

    it("Return to the Ranks: X creature cards with mana value 2 or less return; convoke", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Bear Cub", "Serra Angel"],
          hand: ["Return to the Ranks"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"],
        },
      });
      const card = idOf(s, "p1", "hand", "Return to the Ranks");
      const opt = castOption(s, card);
      const gy = (n: string) => idOf(s, "p1", "graveyard", n);
      expect([...(opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [])].sort()).toEqual(
        [gy("Bear Cub"), gy("Llanowar Elves")].sort(),
      );
      expect(opt?.type === "cast" && opt.picks?.some((p) => p.slot === "convoke")).toBe(true);
      const helpers = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")];
      // {X}{W}{W} with X = 2: one Plains and the Angel pay {W}{W}, the other Plains and the Bear Cub {2} (convoke).
      s = settle(
        act(s, "p1", {
          type: "cast",
          card,
          x: 2,
          targets: { t: [gy("Bear Cub"), gy("Llanowar Elves")] },
          picks: { convoke: helpers },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(names(s, s.players.p1?.graveyard).sort()).toEqual(["Return to the Ranks", "Shivan Dragon"]);
      expect(helpers.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Return to the Ranks: a creature with a mana ability can be tapped for convoke (702.51a)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Llanowar Elves"], hand: ["Return to the Ranks"], graveyard: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Return to the Ranks");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.picks?.find((p) => p.slot === "convoke")?.options).toContain(elves);
      // {X}{W}{W} with X = 1: the Plains pay {W}{W}, the Elves {1} by convoke (not by their own mana).
      s = settle(
        act(s, "p1", {
          type: "cast",
          card,
          x: 1,
          targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] },
          picks: { convoke: [elves] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.objects[elves]?.tapped).toBe(true);
      expect(s.players.p1?.manaPool.G ?? 0).toBe(0);
    });

    it("Shamanic Revelation: a card per creature you control; ferocious: 4 life per creature with power 4 or greater", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), "Bear Cub", "Shivan Dragon", "Shivan Dragon"],
          hand: ["Shamanic Revelation"],
        },
        p2: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
      });
      s = settle(castIt(s, "Shamanic Revelation"));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.life).toBe(28);
    });

    it("Sheoldred's Edict: each opponent sacrifices a nontoken creature, a creature token or a planeswalker of their choice", () => {
      const base = () => {
        const s = scenario({
          players: 3,
          p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Sheoldred's Edict"] },
          p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Vivien Reid"] },
          p3: { battlefield: ["Shivan Dragon"] },
        });
        (s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")] as { isToken: boolean }).isToken = true;
        return s;
      };
      const left = (s: S, p: "p1" | "p2" | "p3") =>
        names(
          s,
          s.battlefield.filter((id) => s.objects[id]?.controller === p && nameOf(s, id) !== "Swamp"),
        ).sort();
      let s = settle(castIt(base(), "Sheoldred's Edict", { mode: 0 }));
      expect([left(s, "p1"), left(s, "p2"), left(s, "p3")]).toEqual([["Bear Cub"], ["Llanowar Elves", "Vivien Reid"], []]);
      s = settle(castIt(base(), "Sheoldred's Edict", { mode: 1 }));
      expect([left(s, "p2"), left(s, "p3")]).toEqual([["Bear Cub", "Vivien Reid"], ["Shivan Dragon"]]);
      s = settle(castIt(base(), "Sheoldred's Edict", { mode: 2 }));
      expect([left(s, "p1"), left(s, "p2"), left(s, "p3")]).toEqual([
        ["Bear Cub"],
        ["Bear Cub", "Llanowar Elves"],
        ["Shivan Dragon"],
      ]);
    });
  });
});
