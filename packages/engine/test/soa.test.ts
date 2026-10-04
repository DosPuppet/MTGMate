/** Mystical Archive (SOA) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { act, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

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
});
