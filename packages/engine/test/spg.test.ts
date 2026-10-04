/** Special Guests (SPG) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { spellCost } from "../src/stack";
import { chars } from "../src/state";
import {
  act,
  advanceUntil,
  attack,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const ARTIFACT = customCard({ name: "Test Trinket", types: ["Artifact"], typeLine: "Artifact" });

describe("Special Guests", () => {
  describe("Affinité pour les artefacts (702.41) : Frogmite, Thoughtcast", () => {
    it("{1} de moins par artefact que vous contrôlez", () => {
      const s = scenario({ p1: { battlefield: [ARTIFACT, ARTIFACT, ARTIFACT], hand: ["Frogmite", "Thoughtcast"] } });
      const frog = s.defs[s.objects[idOf(s, "p1", "hand", "Frogmite")]?.defId ?? ""];
      const thought = s.defs[s.objects[idOf(s, "p1", "hand", "Thoughtcast")]?.defId ?? ""];
      expect(frog && spellCost(s, "p1", frog, {}).generic).toBe(1);
      expect(thought && spellCost(s, "p1", thought, {})).toMatchObject({ generic: 1, colored: { U: 1 } });
    });

    it("Frogmite gratuit avec quatre artefacts", () => {
      let s = scenario({ p1: { battlefield: [ARTIFACT, ARTIFACT, ARTIFACT, ARTIFACT], hand: ["Frogmite"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Frogmite") }));
      expect(idsOf(s, "p1", "battlefield", "Frogmite")).toHaveLength(1);
    });
  });

  describe("Métallurgie : Galvanic Blast", () => {
    it("2 blessures, ou 4 avec trois artefacts au moment de la résolution", () => {
      const run = (artifacts: number) => {
        let s = scenario({ p1: { battlefield: ["Mountain", ...Array(artifacts).fill(ARTIFACT)], hand: ["Galvanic Blast"] } });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Galvanic Blast"), targets: { t: ["p2"] } }));
        return s.players.p2?.life;
      };
      expect(run(2)).toBe(18);
      expect(run(3)).toBe(16);
    });
  });

  describe("Empreinte : Chrome Mox", () => {
    it("exile une carte non-artefact non-terrain de la main ; produit un mana de ses couleurs", () => {
      let s = scenario({ p1: { hand: ["Chrome Mox", "Shock"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Chrome Mox") }), picking(s.players.p1?.hand ?? []));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      const mox = idOf(s, "p1", "battlefield", "Chrome Mox");
      const def = s.defs[s.objects[mox]?.defId ?? ""];
      expect(def?.abilities.find((a) => a.kind === "mana")).toMatchObject({ produceLinkedColors: true });
    });
  });

  describe("Défense totale (702.18) : Helix Pinnacle", () => {
    it("ne peut être la cible d'aucun sort, même de son contrôleur ; 100 marqueurs de tour : victoire à l'entretien", () => {
      let s = scenario({ p1: { battlefield: ["Helix Pinnacle", ...lands("Forest", 3)] } });
      const helix = idOf(s, "p1", "battlefield", "Helix Pinnacle");
      expect(chars(s, helix).keywords).toContain("shroud");
      (s.objects[helix] as { counters: Record<string, number> }).counters.tower = 99;
      s.version += 1;
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === helix);
      s = settle(act(s, "p1", { type: "activate", source: helix, ability: ab?.type === "activate" ? ab.ability : 0, x: 1 }));
      expect(s.objects[helix]?.counters.tower).toBe(100);
      s = advanceUntil(s, (x) => !!x.over || (x.turn.active === "p1" && x.turn.step === "draw"));
      expect(s.winner).toBe("p1");
    });
  });

  describe("Champion (702.72) : Mistbind Clique, Wanderwine Prophets", () => {
    it("sans autre Fée : la créature est sacrifiée", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Mistbind Clique"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mistbind Clique") }));
      expect(idsOf(s, "p1", "graveyard", "Mistbind Clique")).toHaveLength(1);
    });

    it("une Fée exilée jusqu'à son départ ; les terrains du joueur ciblé sont engagés", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Mocking Sprite"], hand: ["Mistbind Clique"] },
        p2: { battlefield: lands("Forest", 3) },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mistbind Clique") }), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Mistbind Clique")).toHaveLength(1);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Mocking Sprite"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.tapped)).toHaveLength(3);
      // Mistbind Clique quitte le champ de bataille : la Fée revient.
      const clique = idOf(s, "p1", "battlefield", "Mistbind Clique");
      (s.objects[clique] as { damage: number }).damage = 10;
      s.version += 1;
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Mocking Sprite")).toHaveLength(1);
    });

    it("Wanderwine Prophets : blessures de combat, sacrifier un Ondin donne un tour supplémentaire", () => {
      let s = scenario({ p1: { battlefield: ["Wanderwine Prophets", "Brineborn Cutthroat"] } });
      const merfolk = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Wanderwine Prophets")]), (req) =>
        req.type === "pick" ? [merfolk] : req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Brineborn Cutthroat")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.step === "upkeep" && x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });
  });
});
