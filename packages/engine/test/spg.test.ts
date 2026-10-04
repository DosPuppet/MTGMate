/** Special Guests (SPG) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, gainLife, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { spellCost } from "../src/stack";
import { chars } from "../src/state";
import { attackTaxFor, canBlock } from "../src/turn";
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

  describe("G4a : Special Guests de LCI, MKM et OTJ", () => {
    it("Lord of Atlantis : les autres Ondins gagnent +1/+1 et la traversée des îles", () => {
      const s = scenario({
        p1: { battlefield: ["Lord of Atlantis", "Brineborn Cutthroat"] },
        p2: { battlefield: ["Island", "Bear Cub"] },
      });
      const cut = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      expect(chars(s, cut).power).toBe(3);
      let t = attack(s, [cut]);
      t = advanceUntil(t, (x) => x.pending?.kind === "declareBlockers");
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Bear Cub"), cut)).toBe(false);
      const noIsland = scenario({
        p1: { battlefield: ["Lord of Atlantis", "Brineborn Cutthroat"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      let u = attack(noIsland, [cut]);
      u = advanceUntil(u, (x) => x.pending?.kind === "declareBlockers");
      expect(canBlock(u, idOf(u, "p2", "battlefield", "Bear Cub"), cut)).toBe(true);
    });

    it("Bridge from Below : depuis le cimetière, un Zombie par créature non-jeton qui meurt ; exilée si une créature adverse meurt", () => {
      let s = scenario({
        p1: { graveyard: ["Bridge from Below"], battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      s = settle(s);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bridge from Below"]);
    });

    it("Rampaging Ferocidon : aucun joueur ne gagne de PV ; une autre créature arrive, 1 blessure à son contrôleur", () => {
      let s = scenario({ p1: { battlefield: ["Rampaging Ferocidon", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      gainLife(s, "p1", 3);
      gainLife(s, "p2", 3);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.players.p1?.life).toBe(19);
    });

    it("Kalamax : le premier éphémère du tour est copié s'il est engagé ; chaque copie lui donne un marqueur", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Kalamax, the Stormsire", tapped: true }, ...lands("Mountain", 2)],
          hand: ["Shock", "Shock"],
        },
      });
      const kal = idOf(s, "p1", "battlefield", "Kalamax, the Stormsire");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(s.objects[kal]?.counters["+1/+1"]).toBe(1);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Mana Crypt : {C}{C} ; à l'entretien, pile ou face et 3 blessures en cas de perte", () => {
      const s = scenario({ p1: { battlefield: ["Mana Crypt"] } });
      const crypt = idOf(s, "p1", "battlefield", "Mana Crypt");
      expect(manaAbilitiesOf(s, crypt)[0]).toMatchObject({ produce: ["C"], amount: 2 });
      let t = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mana Crypt"] } });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect([17, 20]).toContain(t.players.p1?.life);
    });

    it("Star Compass : arrive engagé ; les couleurs de vos terrains de base", () => {
      const s = scenario({ p1: { battlefield: ["Star Compass", "Forest", "Island", "Mana Confluence"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Star Compass"))[0]?.produce).toEqual(["U", "G"]);
    });

    it("Ghostly Prison : attaquer son contrôleur coûte {2} par créature", () => {
      const s = scenario({ active: "p2", p1: { battlefield: ["Ghostly Prison"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(attackTaxFor(s, "p1")).toBe(2);
    });

    it("Show and Tell : chaque joueur peut mettre une carte de permanent de sa main sur le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Show and Tell", "Bear Cub"] },
        p2: { hand: ["Llanowar Elves"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Show and Tell") }), (req) =>
        req.type === "pick" && req.options.length ? [req.options[0] as string] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Tragic Slip : −1/−1, ou −13/−13 si une créature est morte ce tour-ci (morbide)", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Tragic Slip"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 5 } }] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tragic Slip"), targets: { t: [cub] } }));
      expect(chars(s, cub).power).toBe(6);
      let t = scenario({
        p1: { battlefield: ["Swamp", "Llanowar Elves"], hand: ["Tragic Slip"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 5 } }] },
      });
      destroy(t, idOf(t, "p1", "battlefield", "Llanowar Elves"));
      t = settle(
        act(t, "p1", {
          type: "cast",
          card: idOf(t, "p1", "hand", "Tragic Slip"),
          targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Victimize : sacrifiez une créature, deux cartes de créature reviennent engagées", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Llanowar Elves"],
          hand: ["Victimize"],
          graveyard: ["Bear Cub", "Brineborn Cutthroat"],
        },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Brineborn Cutthroat")];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Victimize"), targets: { t: targets } }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      const back = [...idsOf(s, "p1", "battlefield", "Bear Cub"), ...idsOf(s, "p1", "battlefield", "Brineborn Cutthroat")];
      expect(back.map((id) => s.objects[id]?.tapped)).toEqual([true, true]);
    });

    it("Crashing Footfalls : suspension 4 depuis la main (action spéciale), puis deux Rhinocéros 4/4", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Crashing Footfalls"] } });
      const card = idOf(s, "p1", "hand", "Crashing Footfalls");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
      expect(ab?.type === "activate" && ab.label).toBe("Suspension 4 — {G}");
      s = act(s, "p1", { type: "activate", source: card, ability: ab?.type === "activate" ? ab.ability : 0 });
      const exiled = s.exile.find((id) => nameOf(s, id) === "Crashing Footfalls") as string;
      expect([s.objects[exiled]?.counters.time, s.stack.length]).toEqual([4, 0]);
    });

    it("Tireless Tracker : atterrissage, un Indice ; sacrifier un Indice, un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Tireless Tracker", ...lands("Plains", 2)], hand: ["Forest"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(act(s, "p1", { type: "activate", source: clue, ability: 0 }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Tireless Tracker")]?.counters["+1/+1"]).toBe(1);
    });

    it("Drown in the Loch : détruit une créature de valeur de mana au plus égale au cimetière de son contrôleur", () => {
      const run = (gy: number) => {
        let s = scenario({
          p1: { battlefield: ["Island", "Swamp"], hand: ["Drown in the Loch"] },
          p2: { battlefield: ["Bear Cub"], graveyard: Array(gy).fill("Forest") },
        });
        s = settle(
          act(s, "p1", {
            type: "cast",
            card: idOf(s, "p1", "hand", "Drown in the Loch"),
            mode: 1,
            targets: { c: [idOf(s, "p2", "battlefield", "Bear Cub")] },
          }),
        );
        return idsOf(s, "p2", "battlefield", "Bear Cub").length;
      };
      expect(run(1)).toBe(1);
      expect(run(2)).toBe(0);
    });

    it("Field of the Dead : un Zombie quand un terrain arrive, avec sept terrains aux noms différents", () => {
      let s = scenario({
        p1: { battlefield: ["Field of the Dead", "Forest", "Island", "Swamp", "Mountain", "Plains"], hand: ["Desert"] },
      });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Desert") }));
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
    });

    it("Desertion : un sort de créature contrecarré arrive sous votre contrôle", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 5), hand: ["Desertion"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Desertion"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      const cub = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect([s.objects[cub]?.controller, s.objects[cub]?.owner]).toEqual(["p1", "p2"]);
    });

    it("Port Razer : ne peut pas attaquer un joueur qu'il a déjà attaqué ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Port Razer"] } });
      const razer = idOf(s, "p1", "battlefield", "Port Razer");
      s = attack(s, [razer]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: razer, defender: "p2" }] })).toThrow(
        /déjà attaqué/,
      );
    });

    it("Scapeshift : sacrifiez des terrains, autant de cartes de terrain arrivent engagées", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Scapeshift"], library: ["Desert", "Island", "Plains"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scapeshift") }), (req) =>
        req.type === "pick" && req.intent !== "search" ? req.options.slice(0, 2) : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
      expect(s.battlefield.filter((id) => ["Desert", "Island", "Plains"].includes(nameOf(s, id) ?? ""))).toHaveLength(2);
    });

    it("Desert : seulement à l'étape de fin du combat", () => {
      const s = scenario({ p1: { battlefield: ["Desert"] }, p2: { battlefield: ["Bear Cub"] } });
      const desert = idOf(s, "p1", "battlefield", "Desert");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === desert)).toBe(false);
    });

    it("Polyraptor : chaque fois qu'il subit des blessures, un jeton copie", () => {
      const s = scenario({ p1: { battlefield: ["Polyraptor"] } });
      dealDamage(
        s,
        sourceFromObject(s, idOf(s, "p1", "battlefield", "Polyraptor")),
        idOf(s, "p1", "battlefield", "Polyraptor"),
        1,
        false,
      );
      const t = settle(s);
      expect(idsOf(t, "p1", "battlefield", "Polyraptor")).toHaveLength(2);
    });
  });
});
