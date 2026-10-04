/** Breaking News (OTP) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { loseLife } from "../src/actions";
import { legalActions } from "../src/legal";
import { act, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string, player = "p1") =>
  legalActions(s, player).find((a) => a.type === "cast" && a.card === card);

describe("Breaking News", () => {
  describe("Escalade (702.120) : Collective Defiance", () => {
    it("un mode au coût normal ; chaque mode en plus coûte {1}", () => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const opt = castOption(s, idOf(s, "p1", "hand", "Collective Defiance"));
      // Quatre Montagnes : un mode ({1}{R}{R}) ou deux ({1}{R}{R} + {1}) ; pas les trois.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.label?.split(" + ").length)).toEqual([1, 1, 2, 1, 2, 2]);
    });

    it("deux modes : 4 blessures à la créature et 3 à l'adversaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Collective Defiance");
      const opt = castOption(s, card);
      const both =
        opt?.type === "cast"
          ? opt.modes.find((m) => m.label?.includes("4 blessures") && m.label.includes("3 blessures"))
          : undefined;
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card, mode: both?.index, targets: { c: [bear], o: ["p2"] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
    });

    it("le joueur ciblé défausse sa main, puis pioche autant de cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Collective Defiance"] },
        p2: { hand: ["Bear Cub", "Bear Cub", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Collective Defiance"), mode: 0, targets: { p: ["p2"] } }),
      );
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest"]);
      expect(s.players.p2?.graveyard).toHaveLength(3);
    });
  });

  describe("Fendre (702.148) : Fierce Retribution", () => {
    it("pour {1}{W}, seulement une créature attaquante ; fendu pour {5}{W}, n'importe quelle créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const opt = castOption(s, card);
      // Aucune créature n'attaque : seul le mode fendu a une cible.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.label)).toEqual(["Fendre — {5}{W}"]);
      expect(() => act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(6);
    });

    it("pour {1}{W}, détruit la créature qui attaque", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = attackWith(s, bear);
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      s = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Skewer the Critics", () => {
    it("spectacle {R} après une perte de points de vie adverse ; 3 blessures à n'importe quelle cible", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Skewer the Critics"] } });
      const card = idOf(s, "p1", "hand", "Skewer the Critics");
      expect(castOption(s, card)).toBeUndefined();
      loseLife(s, "p2", 2);
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(15);
    });
  });
});

/** p2 attaque p1 avec la créature, puis p1 reçoit la priorité à la déclaration des attaquants. */
function attackWith(s: S, id: string): S {
  let cur = s;
  for (let i = 0; i < 50 && cur.pending?.kind !== "declareAttackers"; i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  cur = act(cur, "p2", { type: "declareAttackers", attackers: [{ id, defender: "p1" }] });
  for (let i = 0; i < 10 && !(cur.pending?.kind === "priority" && cur.pending.player === "p1"); i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  return cur;
}
