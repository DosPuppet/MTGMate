/** Enchanting Tales (WOT) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { act, idOf, lands, scenario, settle } from "./helpers";

describe("Enchanting Tales", () => {
  describe("Blind Obedience", () => {
    it("extorsion : à chaque sort lancé, payer {W/B} fait perdre 1 PV à chaque adversaire et vous en fait gagner autant", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2), "Plains"], hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([22, 19, 19]);
    });

    it("les artefacts et créatures de vos adversaires arrivent engagés ; pas les vôtres", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Blind Obedience"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      let t = scenario({ p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bear Cub") }), () => [0]);
      expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });
  });
});
