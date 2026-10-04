/** Mystical Archive (SOA) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { suspendCard } from "../src/stack";
import { chars } from "../src/state";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  idOf,
  idsOf,
  lands,
  nameOf,
  scenario,
  settle,
  throughCombat,
  untilCastNow,
} from "./helpers";

const castOption = (s: ReturnType<typeof scenario>, card: string) =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Mystical Archive", () => {
  describe("Surcharge (702.96) : Cyclonic Rift", () => {
    it("ciblé pour {1}{U} : un permanent non-terrain adverse revient en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Cyclonic Rift"] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      const opt = castOption(s, rift);
      // Deux îles : seul le mode normal est payable.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.index)).toEqual([0]);
      const bears = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: rift, mode: 0, targets: { t: [bears] } }));
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("surchargé pour {6}{U} : chaque permanent non-terrain adverse, sans cible ; les vôtres et les terrains restent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 7), "Bear Cub"], hand: ["Cyclonic Rift"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      // Deux options : le coût normal (gratuité et coûts alternatifs possibles), et la surcharge à part.
      const opts = legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === rift);
      expect(opts.map((o) => o.type === "cast" && o.modes.map((m) => m.label))).toEqual([
        ["Coût normal"],
        ["Surcharge — {6}{U}"],
      ]);
      s = settle(act(s, "p1", { type: "cast", card: rift, mode: 1 }));
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // Les sept îles ont payé la surcharge.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(7);
    });

    it("la surcharge ne se lance pas gratuitement ni avec un autre coût alternatif (118.9a)", () => {
      const s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Cyclonic Rift"] } });
      const rift = idOf(s, "p1", "hand", "Cyclonic Rift");
      expect(() => act(s, "p1", { type: "cast", card: rift, mode: 1, free: true })).toThrow();
      expect(() => act(s, "p1", { type: "cast", card: rift, mode: 1, alternative: true })).toThrow();
    });
  });

  describe("Winds of Abandon", () => {
    it("ciblé : la créature est exilée, son contrôleur cherche un terrain de base, engagé", () => {
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

    it("surchargé : chaque créature adverse exilée, et autant de terrains de base pour son contrôleur", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Winds of Abandon"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"], library: ["Forest", "Forest", "Forest", "Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winds of Abandon"), mode: 1 }));
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.exile).toHaveLength(2);
    });
  });

  describe("Déluge (702.40) : Empty the Warrens, Brain Freeze", () => {
    it("une copie pour chaque sort lancé avant lui ce tour-ci, par n'importe quel joueur", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Shock", "Empty the Warrens"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      // L'adversaire lance un sort à son tour de priorité (en réponse à rien : il garde la main au vide de pile).
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Empty the Warrens") });
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = settle(s);
      // Un sort avant Empty the Warrens (le premier Shock) : une copie, soit quatre Gobelins ; le Shock adverse, lancé
      // après, ne compte pas.
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
    });

    it("Brain Freeze : chaque copie fait meuler trois cartes", () => {
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

    it("Prismatic Ending : exile si sa valeur de mana ne dépasse pas le nombre de couleurs dépensées", () => {
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

    it("Pongify : la créature est détruite (sans régénération), son contrôleur crée un Singe 3/3", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Pongify"] }, p2: { battlefield: ["Shivan Dragon"] } });
      s = settle(castIt(s, "Pongify", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect([idsOf(s, "p2", "graveyard", "Shivan Dragon").length, idsOf(s, "p2", "battlefield", "Ape").length]).toEqual([1, 1]);
    });

    it("Living End : suspendue ; chacun exile ses cartes de créature du cimetière, sacrifie ses créatures, puis remet les exilées", () => {
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

    it("Smallpox : chaque joueur perd 1 PV, défausse, sacrifie une créature et un terrain", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Smallpox", "Forest"] },
        p2: { battlefield: ["Forest", "Llanowar Elves"], hand: ["Opt"] },
      });
      s = settle(castIt(s, "Smallpox"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 19]);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Llanowar Elves", "Opt"]);
    });

    it("Subterranean Tremors : X blessures aux créatures sans vol ; X ≥ 4, détruisez les artefacts", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Subterranean Tremors"] },
        p2: { battlefield: ["Shivan Dragon", "Bear Cub", "Mana Crypt"] },
      });
      s = settle(castIt(s, "Subterranean Tremors", { x: 4 }));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2").map((id) => nameOf(s, id))).toEqual([
        "Shivan Dragon",
      ]);
    });

    it("Awaken the Woods : X Dryades des forêts, terrains-créatures", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Awaken the Woods"] } });
      s = settle(castIt(s, "Awaken the Woods", { x: 3 }));
      const dryads = idsOf(s, "p1", "battlefield", "Forest Dryad");
      expect(dryads).toHaveLength(3);
      expect(manaAbilitiesOf(s, dryads[0] as string)[0]?.produce).toEqual(["G"]);
    });

    it("Berserk : piétinement et +X/+0 ; détruite à l'étape de fin si elle a attaqué", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Berserk"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Berserk", { targets: { t: [cub] } }));
      expect(chars(s, cub).power).toBe(4);
      s = throughCombat(attack(s, [cub]));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Glimpse of Nature : chaque sort de créature lancé ce tour-ci fait piocher", () => {
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

    it("Culling Ritual : détruit les permanents non-terrain de VM 2 ou moins ; un mana par permanent détruit", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Culling Ritual"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"] },
      });
      s = settle(castIt(s, "Culling Ritual"));
      const pool = s.players.p1?.manaPool;
      expect((pool?.B ?? 0) + (pool?.G ?? 0)).toBe(2);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Bring to Light : une carte de valeur de mana au plus égale aux couleurs dépensées, lancée gratuitement", () => {
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

    it("Expressive Iteration : une carte en main, une au-dessous, une exilée jouable ce tour-ci", () => {
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
});
