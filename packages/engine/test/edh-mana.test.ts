/**
 * Commander (pseudo-ensemble EDH, PLAN-E) : tests de règles de la base de mana commune des decks Commander (E8) :
 * terrains douloureux et talismans, terrains à contrôle, « deux terrains de base », Triomes, fetchs, terrains
 * légendaires, terrains filtres et restreints, rocs de mana, « pas de taille maximale de main ».
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, PlayerId } from "../src/types";
import { act, advanceUntil, canActivate, castable, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = GameState;
const tapMana = (s: S, name: string, ability = 0, color?: string, player: PlayerId = "p1") =>
  act(s, player, {
    type: "tapForMana",
    source: idOf(s, player, "battlefield", name),
    ability,
    ...(color ? { color } : {}),
  } as never);
const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
const tapped = (s: S, name: string) => s.objects[idOf(s, "p1", "battlefield", name)]?.tapped;
const produced = (s: S, player: PlayerId, name: string) =>
  [...new Set(manaAbilitiesOf(s, idOf(s, player, "battlefield", name)).flatMap((m) => m.produce))].sort();
const pool = (s: S) => s.players.p1?.manaPool;
/** Indice de la capacité activée (ou du cycle) proposée pour l'objet. */
const activation = (s: S, source: string, player: PlayerId = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return a?.type === "activate" ? a.ability : undefined;
};
const tokens = (s: S, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1" && nameOf(s, id) === name);

describe("Commander (EDH) : base de mana", () => {
  describe("terrains douloureux et talismans", () => {
    it("Adarkar Wastes, Caves of Koilos, Underground River : {C} sans contrepartie, une couleur pour 1 blessure", () => {
      let s = scenario({ p1: { battlefield: ["Adarkar Wastes", "Caves of Koilos", "Underground River"] } });
      s = tapMana(s, "Adarkar Wastes", 0);
      expect([pool(s)?.C, s.players.p1?.life]).toEqual([1, 20]);
      s = tapMana(s, "Caves of Koilos", 1, "B");
      expect([pool(s)?.B, s.players.p1?.life]).toEqual([1, 19]);
      s = tapMana(s, "Underground River", 1, "U");
      expect([pool(s)?.U, s.players.p1?.life]).toEqual([1, 18]);
      expect(produced(s, "p1", "Adarkar Wastes")).toEqual(["C", "U", "W"]);
    });

    it("Talisman of Dominance, of Hierarchy, of Progress : {C}, ou une couleur et 1 blessure de l'artefact", () => {
      let s = scenario({
        p1: { battlefield: ["Talisman of Dominance", "Talisman of Hierarchy", "Talisman of Progress"] },
      });
      expect(produced(s, "p1", "Talisman of Dominance")).toEqual(["B", "C", "U"]);
      expect(produced(s, "p1", "Talisman of Hierarchy")).toEqual(["B", "C", "W"]);
      expect(produced(s, "p1", "Talisman of Progress")).toEqual(["C", "U", "W"]);
      s = tapMana(s, "Talisman of Dominance", 1, "U");
      s = tapMana(s, "Talisman of Hierarchy", 0);
      s = tapMana(s, "Talisman of Progress", 1, "W");
      expect([pool(s)?.U, pool(s)?.C, pool(s)?.W, s.players.p1?.life]).toEqual([1, 1, 1, 18]);
    });

    it("Sol Ring : {C}{C}", () => {
      let s = scenario({ p1: { battlefield: ["Sol Ring"] } });
      s = tapMana(s, "Sol Ring");
      expect(pool(s)?.C).toBe(2);
    });
  });

  describe("terrains à contrôle", () => {
    it("Glacial Fortress, Isolated Chapel : engagés sans Plaine ni autre type nommé, dégagés sinon", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Glacial Fortress"] } });
      s = playLand(s, "Glacial Fortress");
      expect(tapped(s, "Glacial Fortress")).toBe(true);
      expect(produced(s, "p1", "Glacial Fortress")).toEqual(["U", "W"]);
      let t = scenario({ p1: { battlefield: ["Plains"], hand: ["Isolated Chapel"] } });
      t = playLand(t, "Isolated Chapel");
      expect(tapped(t, "Isolated Chapel")).toBe(false);
      expect(produced(t, "p1", "Isolated Chapel")).toEqual(["B", "W"]);
    });

    it("Dragonskull Summit, Drowned Catacomb : un type de terrain non de base compte (Triome) ; celui d'un adversaire non", () => {
      let s = scenario({ p1: { battlefield: ["Savai Triome"], hand: ["Dragonskull Summit"] } });
      s = playLand(s, "Dragonskull Summit");
      expect(tapped(s, "Dragonskull Summit")).toBe(false);
      let t = scenario({ p1: { hand: ["Drowned Catacomb"] }, p2: { battlefield: ["Island"] } });
      t = playLand(t, "Drowned Catacomb");
      expect(tapped(t, "Drowned Catacomb")).toBe(true);
      expect(produced(t, "p1", "Drowned Catacomb")).toEqual(["B", "U"]);
    });
  });

  describe("« deux terrains de base ou plus », Triomes, terrains tricolores", () => {
    it("Prairie Stream, Sunken Hollow : engagés avec un seul terrain de base, dégagés avec deux ; types de base", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Savai Triome"], hand: ["Prairie Stream"] } });
      s = playLand(s, "Prairie Stream");
      expect(tapped(s, "Prairie Stream")).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Prairie Stream")).subtypes).toEqual(["Plains", "Island"]);
      let t = scenario({ p1: { battlefield: ["Plains", "Island"], hand: ["Sunken Hollow"] } });
      t = playLand(t, "Sunken Hollow");
      expect(tapped(t, "Sunken Hollow")).toBe(false);
      expect(produced(t, "p1", "Sunken Hollow")).toEqual(["B", "U"]);
    });

    it("Savai Triome, Raffine's Tower, Arcane Sanctum : arrivent engagés ; trois couleurs ; cycle {3}", () => {
      let s = scenario({ p1: { hand: ["Savai Triome", "Arcane Sanctum"] } });
      s = playLand(s, "Savai Triome");
      expect(tapped(s, "Savai Triome")).toBe(true);
      expect(produced(s, "p1", "Savai Triome")).toEqual(["B", "R", "W"]);
      s = { ...s, turn: { ...s.turn, landsPlayed: 0 } };
      s = playLand(s, "Arcane Sanctum");
      expect(tapped(s, "Arcane Sanctum")).toBe(true);
      expect(produced(s, "p1", "Arcane Sanctum")).toEqual(["B", "U", "W"]);
      // Cycle {3} : défaussez Raffine's Tower, piochez une carte.
      let c = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Raffine's Tower"], library: ["Plains"] } });
      const tower = idOf(c, "p1", "hand", "Raffine's Tower");
      const ability = activation(c, tower);
      expect(ability).toBeDefined();
      c = settle(act(c, "p1", { type: "activate", source: tower, ability: ability as number }));
      expect(idsOf(c, "p1", "graveyard", "Raffine's Tower")).toHaveLength(1);
      expect(idsOf(c, "p1", "hand", "Plains")).toHaveLength(1);
    });
  });

  describe("fetchs", () => {
    it("Bloodstained Mire, Flooded Strand, Polluted Delta : {T}, 1 PV, sacrifice : une carte de l'un des deux types", () => {
      let s = scenario({
        p1: { battlefield: ["Polluted Delta"], library: ["Forest", "Savai Triome", "Island"] },
      });
      const delta = idOf(s, "p1", "battlefield", "Polluted Delta");
      s = act(s, "p1", { type: "activate", source: delta, ability: activation(s, delta) as number });
      let offered: string[] = [];
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(s, id) as string).sort();
        return req.options.filter((id) => nameOf(s, id) === "Savai Triome");
      });
      // La Triome est un Marais : elle peut être cherchée ; la Forêt non.
      expect(offered).toEqual(["Island", "Savai Triome"]);
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "graveyard", "Polluted Delta")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Savai Triome")).toHaveLength(1);
      // La carte cherchée arrive dégagée, même une Triome (« arrive engagée » est son propre remplacement).
      for (const [land, a, b] of [
        ["Bloodstained Mire", "Swamp", "Mountain"],
        ["Flooded Strand", "Plains", "Island"],
      ] as const) {
        let t = scenario({ p1: { battlefield: [land], library: [a, "Forest", b] } });
        const id = idOf(t, "p1", "battlefield", land);
        t = act(t, "p1", { type: "activate", source: id, ability: activation(t, id) as number });
        let names: string[] = [];
        t = settle(t, (req) => {
          if (req.type === "pick") names = req.options.map((x) => nameOf(t, x) as string).sort();
          return undefined;
        });
        expect(names).toEqual([a, b].sort());
      }
    });
  });

  describe("terrains légendaires", () => {
    it("Urborg, Tomb of Yawgmoth : chaque terrain, adverse compris, est aussi un Marais", () => {
      const s = scenario({ p1: { battlefield: ["Urborg, Tomb of Yawgmoth", "Forest"] }, p2: { battlefield: ["Plains"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).subtypes).toEqual(["Forest", "Swamp"]);
      expect(produced(s, "p1", "Forest")).toEqual(["B", "G"]);
      expect(produced(s, "p1", "Urborg, Tomb of Yawgmoth")).toEqual(["B"]);
      expect(produced(s, "p2", "Plains")).toEqual(["B", "W"]);
    });

    it("Otawara, Soaring City : {U} ; canalisation depuis la main, {1} de moins par créature légendaire", () => {
      let s = scenario({
        p1: { battlefield: ["Arahbo, the First Fang", "Island", "Island"], hand: ["Otawara, Soaring City"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const ota = idOf(s, "p1", "hand", "Otawara, Soaring City");
      // {3}{U} moins {1} (une créature légendaire) : deux Îles ne suffisent pas.
      expect(canActivate(s, "p1", ota)).toBe(false);
      s = scenario({
        p1: {
          battlefield: ["Arahbo, the First Fang", "Edgar Markov", "Island", "Island"],
          hand: ["Otawara, Soaring City"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const ota2 = idOf(s, "p1", "hand", "Otawara, Soaring City");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "activate", source: ota2, ability: activation(s, ota2) as number, targets: { t: [bear] } });
      s = settle(s);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Otawara, Soaring City")).toHaveLength(1);
      // Terrain : {U}.
      const t = scenario({ p1: { battlefield: ["Otawara, Soaring City"] } });
      expect(produced(t, "p1", "Otawara, Soaring City")).toEqual(["U"]);
    });

    it("Phyrexian Tower : {C}, ou {T} et sacrifier une créature : {B}{B}", () => {
      let s = scenario({ p1: { battlefield: ["Phyrexian Tower"] } });
      const tower = idOf(s, "p1", "battlefield", "Phyrexian Tower");
      expect(produced(s, "p1", "Phyrexian Tower")).toEqual(["C"]);
      expect(canActivate(s, "p1", tower)).toBe(false);
      s = scenario({ p1: { battlefield: ["Phyrexian Tower", "Savannah Lions"] } });
      const t2 = idOf(s, "p1", "battlefield", "Phyrexian Tower");
      s = act(s, "p1", { type: "activate", source: t2, ability: activation(s, t2) as number });
      expect(pool(s)?.B).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Savannah Lions")).toHaveLength(1);
      expect(tapped(s, "Phyrexian Tower")).toBe(true);
    });
  });

  describe("terrains à capacité", () => {
    it("Bojuka Bog : arrive engagé, exile le cimetière du joueur ciblé ; {B}", () => {
      let s = scenario({
        p1: { hand: ["Bojuka Bog"], graveyard: ["Shock"] },
        p2: { graveyard: ["Bear Cub", "Savannah Lions"] },
      });
      s = playLand(s, "Bojuka Bog");
      s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      if (s.stack.length || s.pending?.kind !== "priority") throw new Error("déclenchement non résolu");
      expect(s.players.p2?.graveyard).toEqual([]);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
      expect(tapped(s, "Bojuka Bog")).toBe(true);
      expect(produced(s, "p1", "Bojuka Bog")).toEqual(["B"]);
    });

    it("Sunken Ruins : {C} ; {U/B}, {T} : {U}{U}, {U}{B} ou {B}{B}", () => {
      let s = scenario({ p1: { battlefield: ["Sunken Ruins", "Swamp"] } });
      const ruins = idOf(s, "p1", "battlefield", "Sunken Ruins");
      s = act(s, "p1", { type: "activate", source: ruins, ability: activation(s, ruins) as number });
      // Répartition des deux mana entre {U} et {B} : ici {U}{B}.
      expect(s.pending).toMatchObject({ kind: "choice", request: { type: "divide", among: ["U", "B"], total: 2 } });
      s = act(s, "p1", { type: "choose", values: [1, 1] });
      expect([pool(s)?.U, pool(s)?.B]).toEqual([1, 1]);
      expect(tapped(s, "Swamp")).toBe(true);
      // Sans autre source : le coût {U/B} ne peut pas être payé par Sunken Ruins elle-même.
      const t = scenario({ p1: { battlefield: ["Sunken Ruins"] } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Sunken Ruins"))).toBe(false);
    });

    it("Unclaimed Territory : le mana de couleur ne sert qu'aux sorts de créature du type choisi", () => {
      const hand = ["Unclaimed Territory", "Vampire of the Dire Moon", "Savannah Lions"];
      // Le type est choisi en jouant le terrain (614.12).
      for (const [type, vampire, lions] of [
        ["Vampire", true, false],
        ["Cat", false, true],
      ] as const) {
        let s = scenario({ p1: { hand } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Unclaimed Territory"), chosen: type });
        expect(s.objects[idOf(s, "p1", "battlefield", "Unclaimed Territory")]?.chosen?.creatureType).toBe(type);
        // {C} ne paie ni {B} ni {W} : seul le mana de couleur, réservé au type choisi, le permet.
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Vampire of the Dire Moon"))).toBe(vampire);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(lions);
      }
      // Pas pour un sort non-créature : Shock reste impayable.
      const t = scenario({ p1: { battlefield: ["Unclaimed Territory"], hand: ["Shock"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Shock"))).toBe(false);
    });

    it("Voldaren Estate : 1 PV pour un mana réservé aux sorts de Vampire ; jeton Sang, {1} de moins par Vampire", () => {
      let s = scenario({
        p1: { battlefield: ["Voldaren Estate"], hand: ["Vampire of the Dire Moon", "Savannah Lions"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Vampire of the Dire Moon"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(false);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      expect(s.players.p1?.life).toBe(19);
      // {5}, {T} moins deux Vampires : trois Marais suffisent.
      let b = scenario({
        p1: {
          battlefield: ["Voldaren Estate", "Vampire of the Dire Moon", "Edgar Markov", ...lands("Swamp", 4)],
          hand: ["Shock"],
          library: ["Plains"],
        },
      });
      const estate = idOf(b, "p1", "battlefield", "Voldaren Estate");
      b = settle(act(b, "p1", { type: "activate", source: estate, ability: activation(b, estate) as number }));
      expect(tokens(b, "Blood")).toHaveLength(1);
      expect(b.battlefield.filter((id) => nameOf(b, id) === "Swamp" && b.objects[id]?.tapped)).toHaveLength(3);
      // Sang : {1}, {T}, défaussez une carte, sacrifiez ce jeton : piochez une carte.
      const blood = tokens(b, "Blood")[0] as string;
      b = settle(act(b, "p1", { type: "activate", source: blood, ability: 0 }));
      expect(idsOf(b, "p1", "graveyard", "Shock")).toHaveLength(1);
      expect(idsOf(b, "p1", "hand", "Plains")).toHaveLength(1);
      expect(tokens(b, "Blood")).toHaveLength(0);
    });
  });

  describe("artefacts", () => {
    it("Relic of Legends : {T}, ou engager une créature légendaire dégagée (même arrivée ce tour-ci)", () => {
      let s = scenario({
        p1: { battlefield: ["Relic of Legends", { name: "Edgar Markov", sick: true }, "Savannah Lions"] },
      });
      s = tapMana(s, "Relic of Legends", 1, "R");
      expect(pool(s)?.R).toBe(1);
      expect(tapped(s, "Relic of Legends")).toBe(false);
      expect(tapped(s, "Edgar Markov")).toBe(true);
      expect(tapped(s, "Savannah Lions")).toBe(false);
      s = tapMana(s, "Relic of Legends", 0, "U");
      expect(pool(s)?.U).toBe(1);
      // Sans créature légendaire dégagée, la seconde capacité n'est pas disponible.
      const t = scenario({ p1: { battlefield: ["Relic of Legends", "Savannah Lions"], hand: ["Bear Cub"] } });
      expect(() => tapMana(t, "Relic of Legends", 1, "R")).toThrow();
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
      // Le paiement automatique engage la créature légendaire : deux mana pour Bear Cub.
      let u = scenario({ p1: { battlefield: ["Relic of Legends", "Edgar Markov"], hand: ["Bear Cub"] } });
      expect(castable(u, "p1", idOf(u, "p1", "hand", "Bear Cub"))).toBe(true);
      u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Bear Cub") });
      expect([tapped(u, "Relic of Legends"), tapped(u, "Edgar Markov")]).toEqual([true, true]);
    });

    it("Reliquary Tower, Thought Vessel, Decanter of Endless Water : pas de taille maximale de main", () => {
      for (const source of ["Reliquary Tower", "Thought Vessel", "Decanter of Endless Water"]) {
        let s = scenario({ p1: { battlefield: [source], hand: lands("Plains", 9) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(9);
      }
      let s = scenario({ p1: { battlefield: ["Decanter of Endless Water", "Thought Vessel"] } });
      expect(produced(s, "p1", "Decanter of Endless Water")).toEqual(["B", "G", "R", "U", "W"]);
      s = tapMana(s, "Thought Vessel");
      expect(pool(s)?.C).toBe(1);
      // Témoin : sans eux, la main est ramenée à sept cartes.
      let c = scenario({ p1: { hand: lands("Plains", 9) } });
      c = advanceUntil(c, (x) => x.turn.active === "p2");
      expect(c.players.p1?.hand).toHaveLength(7);
    });
  });
});
