/** Stellar Sights (EOS) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { act, advanceUntil, attack, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;

describe("Stellar Sights", () => {
  describe("Exaltation (702.83) : Cathedral of War", () => {
    it("une créature qui attaque seule gagne +1/+1 ; pas si deux créatures attaquent", () => {
      const base = () => scenario({ p1: { battlefield: ["Cathedral of War", "Bear Cub", "Bear Cub"] } });
      let s = base();
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [a as string]));
      expect(chars(s, a as string).power).toBe(3);
      s = base();
      s = settle(attack(s, [a as string, b as string]));
      expect(chars(s, a as string).power).toBe(2);
    });

    it("arrive engagée", () => {
      let s = scenario({ p1: { hand: ["Cathedral of War"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Cathedral of War") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Cathedral of War")]?.tapped).toBe(true);
    });
  });

  describe("Modulaire (702.43) : Power Depot", () => {
    it("arrive engagé avec un marqueur +1/+1", () => {
      let s = scenario({ p1: { hand: ["Power Depot"], battlefield: lands("Forest", 1) } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Power Depot") });
      const depot = idOf(s, "p1", "battlefield", "Power Depot");
      expect(s.objects[depot]?.tapped).toBe(true);
      expect(s.objects[depot]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("G3a : terrains", () => {
    const tapMana = (s: S, name: string, ability = 0, color?: string) =>
      act(s, "p1", {
        type: "tapForMana",
        source: idOf(s, "p1", "battlefield", name),
        ability,
        ...(color ? { color } : {}),
      } as never);

    it("Ancient Tomb : {C}{C}, et 2 blessures à vous", () => {
      let s = scenario({ p1: { battlefield: ["Ancient Tomb"] } });
      s = tapMana(s, "Ancient Tomb");
      expect(s.players.p1?.manaPool.C).toBe(2);
      expect(s.players.p1?.life).toBe(18);
    });

    it("Grove of the Burnwillows : {R} ou {G}, et chaque adversaire gagne 1 PV ; {C} sans contrepartie", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Grove of the Burnwillows"] } });
      s = tapMana(s, "Grove of the Burnwillows", 1, "G");
      expect(s.players.p1?.manaPool.G).toBe(1);
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([21, 21]);
    });

    it("Mana Confluence : un mana de n'importe quelle couleur pour 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Mana Confluence"] } });
      s = tapMana(s, "Mana Confluence", 0, "B");
      expect([s.players.p1?.manaPool.B, s.players.p1?.life]).toEqual([1, 19]);
    });

    it("Celestial Colonnade : arrive engagée ; devient une 4/4 volante avec la vigilance, toujours un terrain", () => {
      let s = scenario({ p1: { battlefield: ["Celestial Colonnade", ...lands("Plains", 3), ...lands("Island", 2)] } });
      const col = idOf(s, "p1", "battlefield", "Celestial Colonnade");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === col);
      s = settle(act(s, "p1", { type: "activate", source: col, ability: ab?.type === "activate" ? ab.ability : 0 }));
      const c = chars(s, col);
      expect([c.power, c.toughness, c.types.includes("Land"), c.types.includes("Creature")]).toEqual([4, 4, true, true]);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(c.colors.sort()).toEqual(["U", "W"]);
    });

    it("Mutavault : une 2/2 de tous les types de créature", () => {
      let s = scenario({ p1: { battlefield: ["Mutavault", "Plains"] } });
      const m = idOf(s, "p1", "battlefield", "Mutavault");
      s = settle(act(s, "p1", { type: "activate", source: m, ability: 1 }));
      expect([chars(s, m).power, chars(s, m).keywords.includes("changeling")]).toEqual([2, true]);
    });

    it("Wandering Fumarole : {0} échange force et endurance", () => {
      let s = scenario({ p1: { battlefield: ["Wandering Fumarole", ...lands("Island", 2), ...lands("Mountain", 2)] } });
      const f = idOf(s, "p1", "battlefield", "Wandering Fumarole");
      const animate = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === f);
      s = settle(act(s, "p1", { type: "activate", source: f, ability: animate?.type === "activate" ? animate.ability : 0 }));
      expect([chars(s, f).power, chars(s, f).toughness]).toEqual([1, 4]);
      const swap = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === f && a.label?.startsWith("Échangez"));
      s = settle(act(s, "p1", { type: "activate", source: f, ability: swap?.type === "activate" ? swap.ability : 0 }));
      expect([chars(s, f).power, chars(s, f).toughness]).toEqual([4, 1]);
    });

    it("Strip Mine et Dust Bowl : détruisent un terrain (non-base pour Dust Bowl, en sacrifiant un terrain)", () => {
      let s = scenario({ p1: { battlefield: ["Strip Mine"] }, p2: { battlefield: ["Forest"] } });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Strip Mine"),
          ability: 1,
          targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Strip Mine")).toHaveLength(1);
      const t = scenario({
        p1: { battlefield: ["Dust Bowl", ...lands("Plains", 3), "Plains"] },
        p2: { battlefield: ["Forest", "Mana Confluence"] },
      });
      const bowl = idOf(t, "p1", "battlefield", "Dust Bowl");
      const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === bowl);
      // Les terrains non-base seulement (Dust Bowl lui-même en est un) : pas la Forêt.
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toContain(idOf(t, "p2", "battlefield", "Mana Confluence"));
      expect(legal).not.toContain(idOf(t, "p2", "battlefield", "Forest"));
    });

    it("Lotus Field : en arrivant, sacrifiez deux terrains ; trois mana d'une couleur", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Lotus Field"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Lotus Field") }));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
      const lotus = idOf(s, "p1", "battlefield", "Lotus Field");
      (s.objects[lotus] as { tapped: boolean }).tapped = false;
      s = tapMana(s, "Lotus Field", 0, "U");
      expect(s.players.p1?.manaPool.U).toBe(3);
    });

    it("Contested War Zone : la créature qui vous blesse en combat donne ce terrain à son contrôleur", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Contested War Zone"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.objects[s.battlefield.find((id) => nameOf(s, id) === "Contested War Zone") as string]?.controller).toBe("p2");
    });

    it("Mystifying Maze : l'attaquant adverse est exilé, puis revient engagé à l'étape de fin", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Mystifying Maze", ...lands("Plains", 4)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Mystifying Maze"),
          ability: 1,
          targets: { t: [bear] },
        }),
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p1");
      const back = idsOf(s, "p2", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.tapped).toBe(true);
    });

    it("Endless Sands : exile vos créatures, puis les rend en se sacrifiant", () => {
      let s = scenario({ p1: { battlefield: ["Endless Sands", "Bear Cub", ...lands("Plains", 6)] } });
      const sands = idOf(s, "p1", "battlefield", "Endless Sands");
      s = settle(
        act(s, "p1", { type: "activate", source: sands, ability: 1, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      (s.objects[sands] as { tapped: boolean }).tapped = false;
      s = settle(act(s, "p1", { type: "activate", source: sands, ability: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Endless Sands")).toHaveLength(1);
    });

    it("Thespian's Stage : devient une copie du terrain ciblé et garde sa capacité", () => {
      let s = scenario({
        p1: { battlefield: ["Thespian's Stage", ...lands("Plains", 2)] },
        p2: { battlefield: ["Ancient Tomb"] },
      });
      const stage = idOf(s, "p1", "battlefield", "Thespian's Stage");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: stage,
          ability: 1,
          targets: { t: [idOf(s, "p2", "battlefield", "Ancient Tomb")] },
        }),
      );
      expect(nameOf(s, stage)).toBe("Thespian's Stage");
      expect(chars(s, stage).name).toBe("Ancient Tomb");
      expect(
        chars(s, stage).abilities.some((a) => a.kind === "activated" && a.label === "Devient une copie du terrain ciblé"),
      ).toBe(true);
    });
  });
});
