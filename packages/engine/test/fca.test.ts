/** Through the Ages (FCA) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { loseLife } from "../src/actions";
import { legalActions } from "../src/legal";
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
  settleNoBlocks,
  untilCastNow,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Through the Ages", () => {
  describe("Ruée (702.109) : Ragavan, Nimble Pilferer", () => {
    it("lancé pour sa ruée : célérité, puis retour en main au début de la prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Ragavan, Nimble Pilferer"] } });
      const card = idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altLabel).toBe("Ruée — {1}{R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).toContain("haste");
      expect(s.objects[rag]?.cast?.via).toBe("dash");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "hand", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("lancé normalement : ni célérité ni retour", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Ragavan, Nimble Pilferer"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer") }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).not.toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("blessures de combat à un joueur : un Trésor, et sa carte du dessus exilée, lançable ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Ragavan, Nimble Pilferer", ...lands("Forest", 2)] },
        p2: { library: ["Llanowar Elves", "Forest"] },
      });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")]));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const elves = s.exile.find((id) => nameOf(s, id) === "Llanowar Elves") as string;
      expect(elves).toBeDefined();
      expect(castOption(s, elves)).toBeDefined();
    });
  });

  describe("Spectacle (702.137) : Light Up the Stage", () => {
    it("le coût de spectacle n'est proposé que si un adversaire a perdu des points de vie ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Light Up the Stage"], library: lands("Island", 5) } });
      const card = idOf(s, "p1", "hand", "Light Up the Stage");
      let opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altAvailable).toBeFalsy();
      loseLife(s, "p2", 1);
      opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altLabel).toBe("Spectacle — {R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      // {R} payé : deux Montagnes encore dégagées ; les deux cartes exilées sont jouables.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(2);
      const exiled = s.exile.filter((id) => nameOf(s, id) === "Island");
      expect(exiled).toHaveLength(2);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && exiled.includes(a.card))).toBe(true);
    });
  });

  describe("Mizzix's Mastery", () => {
    it("surchargé : chaque éphémère ou rituel de votre cimetière exilé, copié et lancé gratuitement", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 8),
          hand: ["Mizzix's Mastery"],
          graveyard: ["Shock", "Shock", "Bear Cub"],
        },
      });
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mizzix's Mastery"), mode: 1 }));
      // Deux copies à lancer gratuitement ; la créature reste au cimetière.
      for (let i = 0; i < 2; i++) {
        const copy = castNowOf(s)?.cards[0] as string;
        expect(nameOf(s, copy)).toBe("Shock");
        s = untilCastNow(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
        if (i === 0) expect(castNowOf(s)?.cards).toHaveLength(1);
      }
      s = settle(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Mizzix's Mastery", "Shock", "Shock"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });
});
