/** Stellar Sights (EOS) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { chars } from "../src/state";
import { act, attack, idOf, idsOf, lands, scenario, settle } from "./helpers";

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
});
