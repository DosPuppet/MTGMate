/** Special Guests (SPG) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, drawCards, gainLife, sourceFromObject } from "../src/actions";
import { activated, fx, ref, spell, staticAbility, target, triggered, when } from "../src/dsl";
import { announceDiscard } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { spellCost } from "../src/stack";
import { chars, moveObject } from "../src/state";
import { attackTaxFor, canBlock } from "../src/turn";
import type { GameState } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  steal,
  stepTrail,
  throughCombat,
  untilCastNow,
} from "./helpers";

/** Attache l'Équipement à la créature (mise en scène). */
function attachTo(s: ReturnType<typeof scenario>, equipment: string, creature: string): void {
  (s.objects[equipment] as { attachedTo?: string }).attachedTo = creature;
  s.version += 1;
}

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

    it("Bridge from Below : le cimetière où va la créature est celui de son propriétaire, pas de son contrôleur", () => {
      let s = scenario({
        p1: { graveyard: ["Bridge from Below"], battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      steal(s, bear, "p2");
      steal(s, elves, "p1");
      // Votre Bear Cub, contrôlé par p2, va dans votre cimetière : un Zombie, et le Pont reste.
      destroy(s, bear);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(exiled(s, "Bridge from Below")).toHaveLength(0);
      // Les Llanowar Elves de p2, que vous contrôlez, vont dans le cimetière de p2 : le Pont est exilé.
      destroy(s, elves);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(exiled(s, "Bridge from Below")).toHaveLength(1);
    });

    it("Mephidross Vampire : vos créatures gagnent un marqueur en blessant une créature, pas un joueur ni un planeswalker", () => {
      const pinger = customCard({
        name: "Test Pinger",
        types: ["Creature"],
        typeLine: "Creature",
        power: 1,
        toughness: 1,
        abilities: [activated({ tap: true, targets: [target.any()], effects: [fx.damage(1, ref.target())] })],
      });
      const walker = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 3 });
      let s = scenario({
        p1: { battlefield: ["Mephidross Vampire", pinger] },
        p2: { battlefield: ["Bear Cub", walker] },
      });
      const pyro = idOf(s, "p1", "battlefield", "Test Pinger");
      const ping = (t: string) => {
        s = settle(act(s, "p1", { type: "activate", source: pyro, ability: 0, targets: { t: [t] } }));
        (s.objects[pyro] as { tapped: boolean }).tapped = false;
      };
      ping(idOf(s, "p2", "battlefield", "Test Walker"));
      ping("p2");
      expect(s.objects[pyro]?.counters["+1/+1"] ?? 0).toBe(0);
      ping(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect(s.objects[pyro]?.counters["+1/+1"]).toBe(1);
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

  describe("G4b : Special Guests de BLB, DSK, FDN et DFT", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

    it("Swords to Plowshares : exilée, son contrôleur gagne autant de PV que sa force", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Swords to Plowshares"] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(castIt(s, "Swords to Plowshares", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect([s.exile.map((id) => nameOf(s, id)), s.players.p2?.life]).toEqual([["Bear Cub"], 22]);
    });

    it("Relentless Rats : +1/+1 par autre Relentless Rats", () => {
      const s = scenario({ p1: { battlefield: ["Relentless Rats", "Relentless Rats", "Relentless Rats"] } });
      expect(chars(s, idsOf(s, "p1", "battlefield", "Relentless Rats")[0] as string).power).toBe(4);
    });

    it("Kindred Charge : une copie avec la célérité de chacune de vos créatures du type choisi", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 6), "Bear Cub", "Llanowar Elves"], hand: ["Kindred Charge"] },
      });
      s = settle(castIt(s, "Kindred Charge"), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(cubs).toHaveLength(2);
      expect(cubs.some((id) => s.objects[id]?.isToken && chars(s, id).keywords.includes("haste"))).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Sword of Fire and Ice : +2/+2, protection ; blessures de combat à un joueur : 2 blessures et une carte", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Sword of Fire and Ice"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      attachTo(s, idOf(s, "p1", "battlefield", "Sword of Fire and Ice"), cub);
      expect(chars(s, cub).power).toBe(4);
      const hand = s.players.p1?.hand.length ?? 0;
      s = throughCombat(attack(s, [cub]), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.life).toBe(14);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Hallowed Haunting : un sort d'enchantement donne un Esprit Clerc, F/E égales au nombre d'Esprits", () => {
      let s = scenario({ p1: { battlefield: ["Hallowed Haunting", ...lands("Plains", 4)], hand: ["Ghostly Prison"] } });
      s = settle(castIt(s, "Ghostly Prison"));
      const spirit = idOf(s, "p1", "battlefield", "Spirit Cleric");
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([1, 1]);
    });

    it("Damnation : détruit toutes les créatures, sans régénération", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Damnation"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[cub] as { regenShields?: number }).regenShields = 1;
      s = settle(castIt(s, "Damnation"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });

    it("Sacrifice : {B} autant que la valeur de mana de la créature sacrifiée", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Fiend Artisan"], hand: ["Sacrifice"] } });
      s = settle(castIt(s, "Sacrifice", { sacrifice: [idOf(s, "p1", "battlefield", "Fiend Artisan")] }));
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Unholy Heat : 2 blessures, 6 avec le délire", () => {
      const run = (gy: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Mountain"], hand: ["Unholy Heat"], graveyard: gy },
          p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 3 } }] },
        });
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(castIt(s, "Unholy Heat", { targets: { t: [cub] } }));
        return idsOf(s, "p2", "battlefield", "Bear Cub").length;
      };
      expect(run([])).toBe(1);
      expect(run(["Forest", "Bear Cub", "Shock", "Ghostly Prison"])).toBe(0);
    });

    it("Collected Company : jusqu'à deux créatures de valeur de mana 3 ou moins parmi les six du dessus", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Collected Company"],
          library: ["Bear Cub", "Forest", "Llanowar Elves", "Polyraptor", "Forest", "Bear Cub", "Forest"],
        },
      });
      s = settle(castIt(s, "Collected Company"));
      expect(s.battlefield.filter((id) => ["Bear Cub", "Llanowar Elves"].includes(nameOf(s, id) ?? ""))).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(0);
    });

    it("Condemn : l'attaquant au-dessous de la bibliothèque, son contrôleur gagne autant de PV que son endurance", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Plains"], hand: ["Condemn"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: cub, defender: "p1" }] });
      s = act(s, "p2", { type: "pass" });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Condemn"), targets: { t: [cub] } }));
      const lib = s.players.p2?.library ?? [];
      expect(nameOf(s, lib[lib.length - 1] as string)).toBe("Bear Cub");
      expect(s.players.p2?.life).toBe(22);
    });

    it("Embercleave : {1} de moins par attaquant ; arrive attachée à une de vos créatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Embercleave"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Embercleave"), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      const ember = idOf(s, "p1", "battlefield", "Embercleave");
      expect(s.objects[ember]?.attachedTo).toBe(cub);
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
    });

    it("Goblin Bushwhacker : kické, vos créatures gagnent +1/+0 et la célérité", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Goblin Bushwhacker"] } });
      s = settle(castIt(s, "Goblin Bushwhacker", { kicked: true }));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect([chars(s, cub).power, chars(s, cub).keywords.includes("haste")]).toEqual([3, true]);
    });

    it("Paradise Druid : défense talismanique tant qu'elle est dégagée", () => {
      const s = scenario({ p1: { battlefield: ["Paradise Druid", { name: "Paradise Druid", tapped: true }] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Paradise Druid");
      expect([chars(s, a as string).keywords.includes("hexproof"), chars(s, b as string).keywords.includes("hexproof")]).toEqual([
        true,
        false,
      ]);
    });

    it("Cavalier of Dawn : détruit un permanent non-terrain ; son contrôleur crée un Golem 3/3", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Cavalier of Dawn"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      const prison = idOf(s, "p2", "battlefield", "Ghostly Prison");
      s = settle(castIt(s, "Cavalier of Dawn"), (req) =>
        req.type === "pick" && req.options.includes(prison) ? [prison] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Ghostly Prison")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Golem")).toHaveLength(1);
    });

    it("Bone Miser : défausser une créature, un terrain ou autre chose", () => {
      let s = scenario({ p1: { battlefield: ["Bone Miser"], hand: ["Bear Cub", "Forest", "Shock"] } });
      s = settle(s);
      for (const n of ["Bear Cub", "Forest", "Shock"])
        announceDiscard(s, "p1", moveObject(s, idOf(s, "p1", "hand", n), "graveyard"));
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(s.players.p1?.manaPool.B).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Chandra's Ignition : votre créature blesse chaque autre créature et chaque adversaire", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"],
          hand: ["Chandra's Ignition"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Chandra's Ignition", { targets: { t: [mine] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Pathbreaker Ibex : en attaquant, vos créatures gagnent le piétinement et +X/+X", () => {
      let s = scenario({ p1: { battlefield: ["Pathbreaker Ibex", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Pathbreaker Ibex")]));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect([chars(s, cub).power, chars(s, cub).keywords.includes("trample")]).toEqual([5, true]);
    });
  });

  describe("G4c : Special Guests de TDM, EOE et ECL", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: ReturnType<typeof scenario>, source: string, extra: object = {}) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Arid Mesa : 1 PV et sacrifice, une Montagne ou une Plaine sur le champ de bataille", () => {
      let s = scenario({ p1: { battlefield: ["Arid Mesa"], library: ["Forest", "Plains", "Island"] } });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Arid Mesa")));
      expect([idsOf(s, "p1", "battlefield", "Plains").length, s.players.p1?.life]).toEqual([1, 19]);
    });

    it("Ruinous Ultimatum : détruit les permanents non-terrain adverses", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 3), ...lands("Swamp", 2), "Bear Cub"],
          hand: ["Ruinous Ultimatum"],
        },
        p2: { battlefield: ["Bear Cub", "Ghostly Prison", "Forest"] },
      });
      s = settle(castIt(s, "Ruinous Ultimatum"));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2").map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Warping Wail : exile une créature de force ou d'endurance 1 ou moins", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Ancient Tomb"], hand: ["Warping Wail"] },
        p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Warping Wail"));
      const legal = opt?.type === "cast" ? opt.modes.find((m) => m.index === 0)?.targets[0]?.legal : [];
      expect(legal).toEqual([idOf(s, "p2", "battlefield", "Llanowar Elves")]);
      s = settle(castIt(s, "Warping Wail", { mode: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Eldrazi Scion")).toHaveLength(1);
    });

    it("Deafening Silence : un seul sort non-créature par tour et par joueur", () => {
      let s = scenario({
        p1: { battlefield: ["Deafening Silence", ...lands("Mountain", 4)], hand: ["Shock", "Shock", "Goblin Sharpshooter"] },
      });
      s = settle(castIt(s, "Shock", { targets: { t: ["p2"] } }));
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Goblin Sharpshooter"))).toBe(true);
    });

    it("Nexus of Fate : un tour supplémentaire, puis mélangée dans la bibliothèque", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Nexus of Fate"] } });
      s = settle(castIt(s, "Nexus of Fate"));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library.some((id) => nameOf(s, id) === "Nexus of Fate")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "upkeep" && x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });

    it("Paradox Haze : au premier entretien du joueur enchanté, une vraie étape d'entretien de plus après celle-ci", () => {
      const clock = customCard({
        name: "Horloge d'entretien",
        types: ["Artifact"],
        typeLine: "Artifact",
        abilities: [triggered(when.step("upkeep"), [fx.gainLife(1)], { label: "1 PV" })],
      });
      let s = scenario({
        p1: { battlefield: [clock, ...lands("Island", 3)], hand: ["Paradox Haze"], library: ["Forest", "Island", "Swamp"] },
      });
      const haze = idOf(s, "p1", "hand", "Paradox Haze");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === haze);
      const spec = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
      s = settle(act(s, "p1", { type: "cast", card: haze, targets: { [spec]: ["p1"] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Paradox Haze")]?.attachedTo).toBe("p1");
      const { s: after, steps } = stepTrail(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.turn.step === "main1");
      // Deux étapes d'entretien, une seule pioche ; la seconde n'en ajoute pas d'autre (premier entretien du tour).
      expect(steps.slice(-4)).toEqual(["upkeep", "upkeep", "draw", "main1"]);
      expect(after.players.p1?.hand).toHaveLength(1);
      expect(after.players.p1?.life).toBe(22);
    });

    it("Magus of the Moon : les terrains non-base sont des Montagnes, sans leurs autres capacités", () => {
      const s = scenario({ p1: { battlefield: ["Magus of the Moon", "Forest"] }, p2: { battlefield: ["Ancient Tomb"] } });
      const tomb = idOf(s, "p2", "battlefield", "Ancient Tomb");
      expect(chars(s, tomb).subtypes).toEqual(["Mountain"]);
      expect(manaAbilitiesOf(s, tomb).map((a) => [a.produce, a.amount])).toEqual([[["R"], 1]]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).subtypes).toEqual(["Forest"]);
    });

    it("Magus of the Moon : seuls les types de terrain sont remplacés (305.7), et le terrain perd ses statiques", () => {
      const grove = customCard({
        name: "Test Dryad Grove",
        typeLine: "Land Creature — Forest Dryad",
        types: ["Land", "Creature"],
        subtypes: ["Forest", "Dryad"],
        power: 1,
        toughness: 1,
        abilities: [staticAbility({ types: ["Creature"], other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" })],
      });
      const s = scenario({ p1: { battlefield: ["Magus of the Moon", grove, "Scene of the Crime"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Test Dryad Grove")).subtypes.sort()).toEqual(["Dryad", "Mountain"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Scene of the Crime")).subtypes.sort()).toEqual(["Clue", "Mountain"]);
      // La statique du terrain ne s'applique plus : Magus of the Moon reste 2/2.
      expect(chars(s, idOf(s, "p1", "battlefield", "Magus of the Moon")).power).toBe(2);
    });

    it("Burgeoning : un adversaire joue un terrain, vous pouvez mettre un terrain de votre main", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Burgeoning"], hand: ["Forest"] }, p2: { hand: ["Island"] } });
      s = settle(act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Island") }), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Green Sun's Zenith : une créature verte de valeur de mana X ou moins, puis mélangée dans la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Green Sun's Zenith"], library: ["Bear Cub", "Regal Force", "Forest"] },
      });
      s = settle(castIt(s, "Green Sun's Zenith", { x: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.library.some((id) => nameOf(s, id) === "Green Sun's Zenith")).toBe(true);
    });

    it("Bitterblossom : à l'entretien, 1 PV et une Fée Gredine", () => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Bitterblossom"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect([s.players.p1?.life, idsOf(s, "p1", "battlefield", "Faerie Rogue").length]).toEqual([19, 1]);
    });

    it("Goblin Sharpshooter : ne se dégage pas, mais se dégage quand une créature meurt", () => {
      let s = scenario({ p1: { battlefield: ["Goblin Sharpshooter"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const gob = idOf(s, "p1", "battlefield", "Goblin Sharpshooter");
      s = settle(activate(s, gob, { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
      expect(s.objects[gob]?.tapped).toBe(false);
    });

    it("Devoted Druid : un marqueur −1/−1 la dégage", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Devoted Druid", tapped: true }] } });
      const druid = idOf(s, "p1", "battlefield", "Devoted Druid");
      s = settle(activate(s, druid));
      expect([s.objects[druid]?.tapped, s.objects[druid]?.counters["-1/-1"]]).toEqual([false, 1]);
    });

    it("Risen Reef : un terrain du dessus arrive engagé ; sinon la carte va en main", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Island"], hand: ["Risen Reef"], library: ["Forest", "Bear Cub"] },
      });
      s = settle(castIt(s, "Risen Reef"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(
        s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped && s.objects[id]?.controlledSince > 0),
      ).toHaveLength(1);
    });

    it("Darkness : aucune blessure de combat ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp"], hand: ["Darkness"] } });
      s = settle(castIt(s, "Darkness"));
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(20);
    });
  });

  describe("G4d : Special Guests de SOS et FRA", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const castOpt = (s: ReturnType<typeof scenario>, name: string) =>
      legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

    it("Door of Destinies : un marqueur par sort du type choisi ; vos créatures de ce type gagnent +1/+1 par marqueur", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: ["Door of Destinies", "Bear Cub"] } });
      s = settle(castIt(s, "Door of Destinies"), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      s = settle(castIt(s, "Bear Cub"));
      const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(cubs.map((id) => chars(s, id).power)).toEqual([3, 3]);
    });

    it("Archmage Emeritus : piochez en lançant ou en copiant un éphémère ou un rituel", () => {
      let s = scenario({
        p1: { battlefield: ["Archmage Emeritus", ...lands("Mountain", 4)], hand: ["Shock", "Dualcaster Mage"] },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      s = settle(castIt(s, "Dualcaster Mage"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      // Deux cartes jouées, deux piochées (lancement et copie).
      expect(s.players.p1?.hand.length).toBe(hand);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Library of Alexandria : piochez seulement avec exactement sept cartes en main", () => {
      const s = scenario({ p1: { battlefield: ["Library of Alexandria"], hand: Array(7).fill("Forest") } });
      const lib = idOf(s, "p1", "battlefield", "Library of Alexandria");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lib)).toBe(true);
      const t = scenario({ p1: { battlefield: ["Library of Alexandria"], hand: Array(6).fill("Forest") } });
      expect(
        legalActions(t, "p1").some(
          (a) => a.type === "activate" && a.source === idOf(t, "p1", "battlefield", "Library of Alexandria"),
        ),
      ).toBe(false);
    });

    it("Adrix and Nev : vos jetons sont créés en double", () => {
      let s = scenario({ p1: { battlefield: ["Adrix and Nev, Twincasters", ...lands("Mountain", 2)], hand: ["Dragon Fodder"] } });
      s = settle(castIt(s, "Dragon Fodder"));
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
    });

    it("Austere Command : six paires de modes", () => {
      const s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Austere Command"] } });
      const all = castOpt(s, "Austere Command");
      expect(all?.type === "cast" && all.modes.length).toBe(6);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 4), ...lands("Island", 2)], hand: ["Austere Command"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Ghostly Prison"] },
      });
      const opt = castOpt(t, "Austere Command");
      const pair =
        opt?.type === "cast"
          ? opt.modes.find((m) => m.label?.includes("VM 3 ou moins") && m.label.includes("enchantements"))
          : undefined;
      t = settle(castIt(t, "Austere Command", { mode: pair?.index }));
      expect(t.battlefield.filter((id) => t.objects[id]?.controller === "p2").map((id) => nameOf(t, id))).toEqual([
        "Shivan Dragon",
      ]);
    });

    it("Mind Twist : le joueur ciblé défausse X cartes au hasard", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Mind Twist"] },
        p2: { hand: ["Forest", "Forest", "Shock", "Opt"] },
      });
      s = settle(castIt(s, "Mind Twist", { x: 3, targets: { t: ["p2"] } }));
      expect([s.players.p2?.hand.length, s.players.p2?.graveyard.length]).toEqual([1, 3]);
    });

    it("Splinter Twin : la créature enchantée crée une copie d'elle-même avec la célérité", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Splinter Twin"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        castIt(s, "Splinter Twin", {
          targets: { [Object.keys(castOpt(s, "Splinter Twin")?.type === "cast" ? {} : {})[0] ?? "enchant"]: [cub] },
        }),
        (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined),
      );
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cub);
      expect(ab).toBeDefined();
      s = settle(act(s, "p1", { type: "activate", source: cub, ability: ab?.type === "activate" ? ab.ability : 0 }));
      const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => s.objects[id]?.isToken);
      expect(copies).toHaveLength(1);
      expect(chars(s, copies[0] as string).keywords).toContain("haste");
    });

    it("Root Maze : les artefacts et les terrains arrivent engagés, de chaque joueur", () => {
      let s = scenario({ p1: { battlefield: ["Root Maze"], hand: ["Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(s.objects[s.battlefield.find((id) => nameOf(s, id) === "Forest") as string]?.tapped).toBe(true);
    });

    it("Dolmen Gate : aucune blessure de combat à vos créatures attaquantes", () => {
      let s = scenario({ p1: { battlefield: ["Dolmen Gate", "Bear Cub"] }, p2: { battlefield: ["Shivan Dragon"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Shivan Dragon"), attacker: cub }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });
  describe("G4e : règles de joueur", () => {
    it("Thousand-Year Elixir : vos créatures activent comme si elles avaient la célérité ; {1}, {T} : dégagez", () => {
      let s = scenario({
        p1: { battlefield: ["Thousand-Year Elixir", "Forest", { name: "Llanowar Elves", sick: true }] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = act(s, "p1", { type: "tapForMana", source: elves, ability: 0 });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Thousand-Year Elixir"),
          ability: 1,
          targets: { t: [elves] },
        }),
      );
      expect(s.objects[elves]?.tapped).toBe(false);
    });

    it("Grim Haruspex : mue (face cachée pour {3}, sans garde) ; une autre créature non-jeton meurt, piochez", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3)], hand: ["Grim Haruspex"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grim Haruspex"), faceDown: true }));
      const down = s.battlefield.find((id) => s.objects[id]?.faceDown);
      expect(down).toBeDefined();
      expect(chars(s, down as string).keywords).not.toContain("ward");
      const t = scenario({ p1: { battlefield: ["Grim Haruspex", "Bear Cub"], library: lands("Swamp", 3) } });
      destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
      const u = settle(t);
      expect(u.players.p1?.hand).toHaveLength(1);
    });
  });
  describe("G4e : combat", () => {
    it("Mirri : en attaquant, chaque adversaire bloque avec une seule créature ; engagée, une seule créature vous attaque", () => {
      let s = scenario({
        p1: { battlefield: ["Mirri, Weatherlight Duelist", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", "Shivan Dragon"] },
      });
      const mirri = idOf(s, "p1", "battlefield", "Mirri, Weatherlight Duelist");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [mirri, cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: elves, attacker: cub },
            { blocker: dragon, attacker: mirri },
          ],
        }),
      ).toThrow();
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: dragon, attacker: cub }] });
      expect(s.combat?.blockers).toHaveLength(1);

      let t = scenario({
        active: "p2",
        p1: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      const two = [idOf(t, "p2", "battlefield", "Bear Cub"), idOf(t, "p2", "battlefield", "Llanowar Elves")];
      expect(() => act(t, "p2", { type: "declareAttackers", attackers: two.map((id) => ({ id, defender: "p1" })) })).toThrow();
    });
  });
  describe("G4e : lancer autrement", () => {
    it("Consign to Memory : réplique {1} (copiée X fois) ; contrecarre un sort incolore", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Consign to Memory"] },
        p2: { hand: ["Mana Crypt"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Mana Crypt") });
      s = act(s, "p2", { type: "pass" });
      const crypt = s.stack[0]?.id as string;
      const consign = idOf(s, "p1", "hand", "Consign to Memory");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === consign);
      expect(opt?.type === "cast" && opt.xMax).toBe(1);
      s = act(s, "p1", { type: "cast", card: consign, x: 1, targets: { t: [crypt] } });
      // La capacité de réplique copie le sort une fois.
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      expect(
        s.stack.filter((x) => x.sourceDefId === s.objects[consign]?.defId || nameOf(s, x.sourceId) === "Consign to Memory"),
      ).toHaveLength(2);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Mana Crypt")).toHaveLength(1);
    });

    it("Underworld Breach : évasion (le coût et trois autres cartes du cimetière) ; sacrifié à l'étape de fin", () => {
      let s = scenario({
        p1: { battlefield: ["Underworld Breach", "Mountain"], graveyard: ["Shock", "Forest", "Plains", "Island"] },
      });
      const shock = idOf(s, "p1", "graveyard", "Shock");
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Underworld Breach")).toHaveLength(1);
    });

    it("Phantasmal Image : copie d'une créature, Illusion ; ciblée, elle est sacrifiée", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Phantasmal Image"] },
        p2: { battlefield: ["Shivan Dragon", "Mountain"], hand: ["Shock"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Phantasmal Image") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      const image = idOf(s, "p1", "battlefield", "Phantasmal Image");
      expect(chars(s, image).name).toBe("Shivan Dragon");
      expect(chars(s, image).subtypes).toContain("Illusion");
      expect(chars(s, image).power).toBe(5);
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [image] } }));
      expect(s.objects[image]).toBeUndefined();
      expect(idsOf(s, "p1", "graveyard", "Phantasmal Image")).toHaveLength(1);
    });

    it("Flesh Duplicate : copie avec la disparition 3", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flesh Duplicate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flesh Duplicate") }));
      const dup = idOf(s, "p1", "battlefield", "Flesh Duplicate");
      expect(chars(s, dup).name).toBe("Bear Cub");
      expect(s.objects[dup]?.counters.time).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.objects[dup]?.counters.time).toBe(2);
    });

    it("Flesh Duplicate (PLAN-H H9) : les trois marqueurs de temps sont là dès son arrivée, sans capacité sur la pile", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flesh Duplicate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flesh Duplicate") });
      for (let i = 0; i < 20 && idsOf(s, "p1", "battlefield", "Flesh Duplicate").length === 0; i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      }
      const dup = idOf(s, "p1", "battlefield", "Flesh Duplicate");
      expect(s.objects[dup]?.counters.time).toBe(3);
      expect(s.stack).toHaveLength(0);
      expect(s.triggers).toHaveLength(0);
    });
  });
  describe("G4e : bibliothèque et pioche", () => {
    it("Necrodominance : étape de fin, payez X PV et piochez X ; main maximale cinq ; cimetière exilé", () => {
      let s = scenario({
        p1: { battlefield: ["Necrodominance"], hand: ["Shock"], library: lands("Swamp", 10) },
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.type === "number");
      s = act(s, "p1", { type: "choose", values: [7] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(13);
      expect(s.players.p1?.hand).toHaveLength(8);
      s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
      expect(s.players.p1?.hand).toHaveLength(5);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.length).toBeGreaterThanOrEqual(3);
    });

    it("taille de main maximale fixée par plusieurs effets : le plus récent l'emporte (613.11)", () => {
      // Jusqu'au tour suivant ; Necrodominance : aucun PV payé à l'étape de fin.
      const toNextTurn = (s: GameState) => {
        let cur = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "choice", 200);
        if (cur.pending?.kind === "choice") cur = act(cur, "p1", { type: "choose", values: [0] });
        return advanceUntil(cur, (x) => x.turn.active === "p2", 200);
      };
      // Library of Leng, puis Necrodominance (plus récente) : cinq.
      let s = toNextTurn(scenario({ p1: { battlefield: ["Library of Leng", "Necrodominance"], hand: lands("Swamp", 9) } }));
      expect(s.players.p1?.hand).toHaveLength(5);
      // Necrodominance, puis Library of Leng (plus récente) : pas de taille de main maximale.
      s = toNextTurn(scenario({ p1: { battlefield: ["Necrodominance", "Library of Leng"], hand: lands("Swamp", 9) } }));
      expect(s.players.p1?.hand).toHaveLength(9);
      // Necrodominance, puis The Ten Rings (plus récent) : dix, et non la plus petite.
      s = toNextTurn(scenario({ p1: { battlefield: ["Necrodominance", "The Ten Rings"], hand: lands("Swamp", 12) } }));
      expect(s.players.p1?.hand).toHaveLength(10);
    });

    it("Sphinx's Tutelage : vous piochez, l'adversaire meule deux cartes, et recommence si deux non-terrain partagent une couleur", () => {
      let s = scenario({
        p1: { battlefield: ["Sphinx's Tutelage"], library: lands("Island", 3) },
        p2: { library: ["Shock", "Lightning Strike", "Bear Cub", "Forest", "Island"] },
      });
      drawCards(s, "p1", 1);
      s = settle(s);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Shock", "Lightning Strike", "Bear Cub", "Forest"]);
    });

    it("Library of Leng : défaussée par un effet, la carte va au-dessus de la bibliothèque ; pas de main maximale", () => {
      const discarder = customCard({
        name: "Défausse de test",
        types: ["Sorcery"],
        typeLine: "Sorcery",
        spell: spell([], [fx.discard(1)]),
      });
      let s = scenario({ p1: { battlefield: ["Library of Leng"], hand: [discarder, "Shock"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Défausse de test") }));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shock");
    });

    it("Notion Thief : l'adversaire pioche une carte en plus, vous la piochez à sa place ; pas sa pioche de l'étape de pioche", () => {
      let s = scenario({
        active: "p2",
        step: "upkeep",
        p1: { battlefield: ["Notion Thief"], library: lands("Island", 3) },
        p2: { library: lands("Forest", 3) },
      });
      s = advanceUntil(s, (x) => x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      drawCards(s, "p2", 2);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });
  describe("G4e : dernières cartes", () => {
    it("Maddening Hex : le joueur enchanté lance un sort non-créature, un d6 et autant de blessures", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Maddening Hex"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const card = idOf(s, "p1", "hand", "Maddening Hex");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      const spec = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
      s = settle(act(s, "p1", { type: "cast", card, targets: { [spec]: ["p2"] } }));
      const hex = idOf(s, "p1", "battlefield", "Maddening Hex");
      expect(s.objects[hex]?.attachedTo).toBe("p2");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      const life = s.players.p2?.life ?? 20;
      expect(life).toBeLessThanOrEqual(19);
      expect(life).toBeGreaterThanOrEqual(14);
      // En duel, pas d'autre adversaire : l'Aura reste sur le joueur.
      expect(s.objects[hex]?.attachedTo).toBe("p2");
    });

    it("Painter's Servant : les permanents sont aussi de la couleur choisie", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Painter's Servant"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Painter's Servant") }), (req) =>
        req.type === "pick" && req.options.includes("U") ? ["U"] : undefined,
      );
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      const color = s.objects[idOf(s, "p1", "battlefield", "Painter's Servant")]?.chosen?.color as string;
      expect(chars(s, cub).colors).toEqual(expect.arrayContaining(["G", color]));
    });

    it("Sylvan Library : à l'étape de pioche, deux cartes de plus ; pour chacune des deux, 4 PV ou elle retourne au-dessus", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Sylvan Library"], library: ["Shock", "Bear Cub", "Forest", "Island"] },
      });
      let n = 0;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "choice");
      s = settle(s, (req) => (req.type === "yesNo" ? [++n === 1 ? 1 : n === 2 ? 1 : 0] : undefined));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(16);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
  describe("G4e : dernières cartes (2)", () => {
    it("Codie, Vociferous Codex : pas de sorts de permanent ; {4}, {T} : WUBRG, le prochain sort cascade vers un éphémère ou un rituel", () => {
      let s = scenario({
        p1: {
          battlefield: ["Codie, Vociferous Codex", ...lands("Mountain", 4)],
          hand: ["Bear Cub", "Lightning Strike"],
          library: ["Bear Cub", "Shock", "Forest"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      // Capacité de mana (605.1a) : résolue tout de suite, sans la pile.
      s = act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Codie, Vociferous Codex"), ability: 1 });
      expect(Object.values(s.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0)).toBe(5);
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
      const hit = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, hit)).toBe("Shock");
      s = settle(act(s, "p1", { type: "cast", card: hit, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Expropriate : chaque joueur vote ; le temps donne un tour supplémentaire, l'argent un permanent du votant", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Expropriate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(cub)) return [cub];
        return player === "p1" ? ["0"] : ["1"];
      });
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.extraTurns).toEqual(["p1"]);
      expect(exiled(s, "Expropriate")).toHaveLength(1);
    });

    it("Expropriate : votre vote pour l'argent reprend un permanent que vous possédez, contrôlé par un adversaire", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 9), "Bear Cub"], hand: ["Expropriate"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      steal(s, cub, "p2");
      let offered: string[] = [];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(cub)) {
          offered = req.options.map(String);
          return [cub];
        }
        return player === "p1" ? ["1"] : ["0"];
      });
      // Les permanents que vous possédez, qui que ce soit qui les contrôle ; pas les Llanowar Elves de p2.
      expect(offered).not.toContain(elves);
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.extraTurns).toEqual(["p1"]);
    });

    it("Eerie Ultimatum : un nombre quelconque de cartes de permanent de noms différents de votre cimetière", () => {
      const start = () =>
        scenario({
          p1: {
            battlefield: [...lands("Plains", 2), ...lands("Swamp", 3), ...lands("Forest", 2)],
            hand: ["Eerie Ultimatum"],
            graveyard: ["Bear Cub", "Bear Cub", "Llanowar Elves", "Shock"],
          },
        });
      let s = start();
      const cubs = s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Bear Cub") ?? [];
      // Deux Bear Cub : refusé.
      expect(() =>
        settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Eerie Ultimatum") }), (req) =>
          req.type === "pick" ? cubs : undefined,
        ),
      ).toThrow(RulesError);
      // Le choix par défaut : un Bear Cub et les Llanowar Elves.
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Eerie Ultimatum") }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Robe of Stars : +0/+3 ; {1}{W} : la créature équipée sort de phase jusqu'à votre prochaine étape de dégagement", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Robe of Stars", "Plains", "Mountain"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const robe = idOf(s, "p1", "battlefield", "Robe of Stars");
      (s.objects[robe] as { attachedTo?: string }).attachedTo = cub;
      s.version += 1;
      expect(chars(s, cub).toughness).toBe(5);
      s = settle(act(s, "p1", { type: "activate", source: robe, ability: 1 }));
      expect(s.battlefield).not.toContain(cub);
      expect(s.battlefield).not.toContain(robe);
      expect(s.objects[cub]?.zone).toBe("phasedOut");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.battlefield).toContain(cub);
      expect(s.objects[robe]?.attachedTo).toBe(cub);
      expect(chars(s, cub).toughness).toBe(5);
    });
  });
});

describe("Special Guests : approximations levées (PLAN-H, H2c)", () => {
  it("Sylvan Library : les cartes remises au-dessus sont choisies parmi celles piochées ce tour-ci", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Sylvan Library"], hand: ["Opt"], library: ["Shock", "Bear Cub", "Forest", "Island"] },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    const offered: string[][] = [];
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "choice");
    let n = 0;
    s = settle(s, (req) => {
      if (req.type === "yesNo") return [++n === 1 ? 1 : 0];
      if (req.type === "pick") offered.push(req.options.map(String));
      return undefined;
    });
    expect(offered).toHaveLength(2);
    expect(offered.every((o) => !o.includes(opt) && o.length > 0)).toBe(true);
    expect(s.players.p1?.hand).toContain(opt);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Expropriate : à plusieurs, chaque joueur vote dans l'ordre du tour ; l'argent prend un permanent de chaque votant", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Island", 9), hand: ["Expropriate"] },
      p2: { battlefield: ["Bear Cub"] },
      p3: { battlefield: ["Llanowar Elves"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p3", "battlefield", "Llanowar Elves");
    const voters: string[] = [];
    const offered: string[][] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes("0")) {
        voters.push(player);
        return player === "p1" ? ["0"] : ["1"];
      }
      offered.push(req.options.map(String));
      return undefined;
    });
    expect(voters).toEqual(["p1", "p2", "p3"]);
    // Chaque vote pour l'argent : un permanent du votant (seul, il est pris sans question).
    expect(offered).toEqual([]);
    expect(s.objects[cub]?.controller).toBe("p1");
    expect(s.objects[elves]?.controller).toBe("p1");
    expect(s.extraTurns).toEqual(["p1"]);
  });
});
