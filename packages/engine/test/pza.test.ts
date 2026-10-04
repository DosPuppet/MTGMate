/** Source Material (PZA) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { act, customCard, idOf, idsOf, lands, scenario, settle } from "./helpers";

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
    });
  });
});
