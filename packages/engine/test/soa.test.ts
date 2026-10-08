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
});
