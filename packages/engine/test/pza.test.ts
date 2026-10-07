/** Source Material (PZA) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { drawCards } from "../src/actions";
import { legalActions } from "../src/legal";
import { changeCounters, chars, moveObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { act, advanceUntil, attack, customCard, idOf, idsOf, lands, scenario, settle, throughCombat } from "./helpers";

const ARTIFACT = customCard({ name: "Test Trinket", types: ["Artifact"], typeLine: "Artifact" });
const CONSTRUCT = customCard({
  name: "Test Construct",
  types: ["Artifact", "Creature"],
  typeLine: "Artifact Creature — Construct",
  power: 1,
  toughness: 1,
});

describe("Source Material", () => {
  describe("Modulaire (702.43) : Arcbound Ravager", () => {
    it("arrive avec un marqueur ; sacrifier un artefact en ajoute un ; en mourant, ses marqueurs vont sur une créature-artefact", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), ARTIFACT, CONSTRUCT], hand: ["Arcbound Ravager"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Arcbound Ravager") }));
      const ravager = idOf(s, "p1", "battlefield", "Arcbound Ravager");
      expect(s.objects[ravager]?.counters["+1/+1"]).toBe(1);
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ravager);
      const trinket = idOf(s, "p1", "battlefield", "Test Trinket");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: ravager,
          ability: ab?.type === "activate" ? ab.ability : 0,
          sacrifice: [trinket],
        }),
      );
      expect(s.objects[ravager]?.counters["+1/+1"]).toBe(2);
      // Ravager se sacrifie lui-même : ses deux marqueurs vont sur la créature-artefact.
      const construct = idOf(s, "p1", "battlefield", "Test Construct");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: ravager,
          ability: ab?.type === "activate" ? ab.ability : 0,
          sacrifice: [ravager],
        }),
        (req) => (req.type === "pick" && req.options.includes(construct) ? [construct] : undefined),
      );
      expect(idsOf(s, "p1", "graveyard", "Arcbound Ravager")).toHaveLength(1);
      expect(s.objects[construct]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, construct).power).toBe(3);
    });
  });

  describe("Greffe (702.58) : Cytoplast Manipulator", () => {
    it("arrive avec deux marqueurs ; une autre créature arrive : un marqueur peut y être déplacé", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Cytoplast Manipulator", counters: { "+1/+1": 2 } }, ...lands("Forest", 2)],
          hand: ["Bear Cub"],
        },
      });
      const cyto = idOf(s, "p1", "battlefield", "Cytoplast Manipulator");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[cyto]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("{U}, {T} : contrôle d'une créature avec un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Cytoplast Manipulator", counters: { "+1/+1": 2 } }, "Island"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
      });
      const cyto = idOf(s, "p1", "battlefield", "Cytoplast Manipulator");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cyto);
      // Les créatures avec un marqueur +1/+1, la sienne comprise ; pas les Elfes.
      expect(ab?.type === "activate" && ab.targets[0]?.legal).toEqual([cyto, bear]);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: cyto,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: [bear] },
        }),
      );
      expect(s.objects[bear]?.controller).toBe("p1");
      // Le Manipulator quitte le champ de bataille : la créature revient aussitôt à son propriétaire (seul effet de
      // contrôle en jeu, retiré avec la source).
      moveObject(s, cyto, "exile");
      expect(s.objects[bear]?.controller).toBe("p2");
    });
  });

  describe("G9 : Source Material", () => {
    const equip = (s: ReturnType<typeof scenario>, eq: string, creature: string) => {
      (s.objects[eq] as { attachedTo?: string }).attachedTo = creature;
      s.version += 1;
    };

    it("Teleportation Circle : à votre étape de fin, un de vos artefacts ou créatures est exilé puis revient", () => {
      let s = scenario({ p1: { battlefield: ["Teleportation Circle", { name: "Bear Cub", counters: { "+1/+1": 2 } }] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" || x.turn.active === "p2", 200);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      const back = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Rhythm of the Wild : vos sorts de créature ne peuvent pas être contrecarrés", () => {
      const s = scenario({ p1: { battlefield: ["Rhythm of the Wild"] } });
      expect(playerStatic(s, "p1", "uncounterable")).toBe(true);
    });

    it("Metallic Mimic : vos autres créatures du type choisi arrivent avec un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Metallic Mimic", "Bear Cub"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Metallic Mimic") }), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Metallic Mimic")).subtypes).toContain("Bear");
    });

    it("Umezawa's Jitte : deux marqueurs en blessant au combat ; un marqueur retiré donne 2 PV", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Umezawa's Jitte"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const jitte = idOf(s, "p1", "battlefield", "Umezawa's Jitte");
      equip(s, jitte, cub);
      s = throughCombat(attack(s, [cub]));
      expect(s.objects[jitte]?.counters.charge).toBe(2);
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === jitte && a.label?.includes("2 PV"));
      s = settle(act(s, "p1", { type: "activate", source: jitte, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect([s.players.p1?.life, s.objects[jitte]?.counters.charge]).toEqual([22, 1]);
    });

    it("Shadowspear : {1}, les permanents adverses perdent la défense talismanique et l'indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Shadowspear", "Plains"] }, p2: { battlefield: ["Carnage Tyrant"] } });
      const spear = idOf(s, "p1", "battlefield", "Shadowspear");
      const ab = legalActions(s, "p1").find(
        (a) => a.type === "activate" && a.source === spear && !a.label?.startsWith("Équiper"),
      );
      s = settle(act(s, "p1", { type: "activate", source: spear, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect(chars(s, idOf(s, "p2", "battlefield", "Carnage Tyrant")).keywords).not.toContain("hexproof");
    });

    it("All Will Be One : vous mettez des marqueurs, autant de blessures", () => {
      let s = scenario({
        p1: { battlefield: ["All Will Be One", "Bear Cub", ...lands("Forest", 2)], hand: ["Hardened Scales"] },
      });
      changeCounters(s, s.objects[idOf(s, "p1", "battlefield", "Bear Cub")] as never, "+1/+1", 3);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });
  });
  describe("G4e : combat", () => {
    it("Waves of Aggression : dégage les attaquants, un combat et une phase principale de plus ; retrace", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 5)], hand: ["Waves of Aggression"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = throughCombat(attack(s, [cub]));
      expect(s.players.p2?.life).toBe(18);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waves of Aggression") }));
      expect(s.objects[cub]?.tapped).toBe(false);
      s = throughCombat(attack(s, [cub]));
      expect(s.players.p2?.life).toBe(16);
      expect(s.turn.active).toBe("p1");
      // Retrace : depuis le cimetière en défaussant une carte de terrain.
      const r = scenario({ p1: { battlefield: lands("Mountain", 5), graveyard: ["Waves of Aggression"], hand: ["Bear Cub"] } });
      const waves = idOf(r, "p1", "graveyard", "Waves of Aggression");
      expect(legalActions(r, "p1").some((a) => a.type === "cast" && a.card === waves)).toBe(false);
      const q = scenario({ p1: { battlefield: lands("Mountain", 5), graveyard: ["Waves of Aggression"], hand: ["Forest"] } });
      const w2 = idOf(q, "p1", "graveyard", "Waves of Aggression");
      expect(legalActions(q, "p1").some((a) => a.type === "cast" && a.card === w2)).toBe(true);
    });
  });
  describe("G4e : bibliothèque et pioche", () => {
    it("Trouble in Pairs : deuxième sort ou deuxième pioche d'un adversaire, vous piochez ; ses tours supplémentaires sont passés", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Trouble in Pairs"], library: lands("Plains", 5) },
        p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(0);
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      drawCards(s, "p2", 2);
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(2);
      s.extraTurns = ["p2"];
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });
  });
  describe("G4e : dernières cartes (2)", () => {
    it("Plague of Vermin : chaque joueur paie des PV et crée autant de Rats", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: ["Plague of Vermin"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Plague of Vermin") }), (req, player) =>
        req.type === "number" ? [player === "p1" ? 3 : 2] : undefined,
      );
      expect(s.players.p1?.life).toBe(17);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(3);
      expect(idsOf(s, "p2", "battlefield", "Rat")).toHaveLength(2);
    });
  });
});

describe("Source Material : approximations levées (PLAN-H, H2c)", () => {
  it("Plague of Vermin : à plusieurs, chaque joueur paie à son tour (en commençant par vous) et crée autant de Rats", () => {
    let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 7), hand: ["Plague of Vermin"] } });
    const payers: string[] = [];
    const paid: Record<string, number> = { p1: 3, p2: 2, p3: 1 };
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Plague of Vermin") }), (req, player) => {
      if (req.type !== "number") return undefined;
      payers.push(player);
      return [paid[player] ?? 0];
    });
    expect(payers).toEqual(["p1", "p2", "p3"]);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([17, 18, 19]);
    expect(["p1", "p2", "p3"].map((p) => idsOf(s, p, "battlefield", "Rat").length)).toEqual([3, 2, 1]);
  });
});
