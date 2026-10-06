/**
 * Commander (pseudo-ensemble EDH) : tests de règles du deck Rakdos, Lord of Riots. Pertes de PV des adversaires et
 * réductions de coût, blessures à chaque joueur, dévotion, Eldrazi (lancer, annihilateur, cimetière), boucles « pour chaque
 * joueur », nombres secrets, victime X, exhumation.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const life = (s: GameState, p: PlayerId) => s.players[p]?.life ?? 0;
const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const toTurnOf = (s: GameState, p: PlayerId, step = "main1") =>
  advanceUntil(s, (x) => x.turn.active === p && x.turn.step === step && x.pending?.kind === "priority", 600);

describe("Rakdos, Lord of Riots (EDH)", () => {
  describe("commandant", () => {
    it("ne se lance que si un adversaire a perdu des PV ce tour-ci ; vos créatures coûtent {1} de moins par PV perdu", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 3)],
          hand: ["Rakdos, Lord of Riots", "Gigantosaurus", "Shock"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Rakdos, Lord of Riots"))).toBe(false);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      // p2 a perdu 2 PV : Rakdos ({B}{B}{R}{R}) se lance ; Gigantosaurus ({G}{G}{G}{G}{G}) coûte 2 de moins en générique,
      // mais ses symboles verts restent dus.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Rakdos, Lord of Riots"))).toBe(true);
    });

    it("la réduction porte sur le générique d'un sort de créature, selon les PV perdus par les adversaires", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Rakdos, Lord of Riots"], hand: ["Shock", "Shivan Dragon"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(false);
      const after = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      // 4 Montagnes restantes : {4}{R}{R} − 2 = {2}{R}{R}, payable.
      expect(castable(after, "p1", idOf(after, "p1", "hand", "Shivan Dragon"))).toBe(true);
    });
  });

  describe("pour chaque joueur", () => {
    it("Lim-Dûl's Hex : chaque joueur paie {B} ou {3}, sinon subit 1 blessure", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Lim-Dûl's Hex", "Swamp"] },
        p2: { battlefield: lands("Island", 3) },
      });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s, (req, p) => (req.type === "yesNo" ? [p === "p1" ? 1 : 0] : undefined));
      expect(life(s, "p1")).toBe(20);
      expect(life(s, "p2")).toBe(19);
    });

    it("Protection Racket : l'adversaire paie la valeur de mana en PV et la carte est exilée, sinon elle va en main", () => {
      const run = (pay: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Protection Racket"], library: ["Shivan Dragon", "Opt"] },
        });
        s = toTurnOf(s, "p1", "upkeep");
        return settle(s, (req) => (req.type === "yesNo" ? [pay ? 1 : 0] : undefined));
      };
      const paid = run(true);
      expect(life(paid, "p2")).toBe(14);
      expect(paid.exile.map((id) => nameOf(paid, id))).toContain("Shivan Dragon");
      const refused = run(false);
      expect(refused.players.p1?.hand.map((id) => nameOf(refused, id))).toContain("Shivan Dragon");
    });

    it("Gray Merchant : chaque adversaire perd X PV (dévotion au noir), vous gagnez la somme", () => {
      let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 5), hand: ["Gray Merchant of Asphodel"] } });
      s = settle(castIt(s, "p1", "Gray Merchant of Asphodel"));
      expect([life(s, "p2"), life(s, "p3")]).toEqual([18, 18]);
      expect(life(s, "p1")).toBe(24);
    });
  });

  describe("nombres secrets : Wheel of Misfortune", () => {
    it("le plus grand nombre fait des blessures à qui l'a choisi ; ceux qui n'ont pas choisi le plus petit renouvellent leur main", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Wheel of Misfortune", "Opt"] },
        p2: { hand: ["Opt", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Wheel of Misfortune"), (req, p) => (req.type === "number" ? [p === "p1" ? 3 : 0] : undefined));
      expect(life(s, "p1")).toBe(17);
      expect(life(s, "p2")).toBe(20);
      // p1 n'a pas choisi le plus petit : il défausse et pioche sept cartes ; p2 garde sa main.
      expect(hand(s, "p1")).toBe(7);
      expect(hand(s, "p2")).toBe(2);
    });
  });

  describe("Ob Nixilis, the Adversary", () => {
    it("victime X : la copie n'est pas légendaire et a une loyauté de départ X", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain", "Swamp", "Gigantosaurus"], hand: ["Ob Nixilis, the Adversary"] },
      });
      s = settle(castIt(s, "p1", "Ob Nixilis, the Adversary"), (req, _p, cur) =>
        req.type === "pick" ? (picking(idsOf(cur, "p1", "battlefield", "Gigantosaurus"))(req) ?? undefined) : undefined,
      );
      const obs = idsOf(s, "p1", "battlefield", "Ob Nixilis, the Adversary");
      expect(obs).toHaveLength(2);
      const copy = obs.find((id) => s.objects[id]?.isToken) ?? "";
      expect(s.objects[copy]?.counters.loyalty).toBe(10);
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
    });
  });

  describe("Eldrazi", () => {
    it("Kozilek, Butcher of Truth : piochez quatre cartes en le lançant ; annihilateur 4", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Kozilek, Butcher of Truth"], library: ["Opt", "Opt", "Opt", "Opt"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Kozilek, Butcher of Truth"));
      expect(hand(s, "p1")).toBe(h - 1 + 4);
      let a = scenario({ p1: { battlefield: ["Kozilek, Butcher of Truth"] }, p2: { battlefield: lands("Forest", 5) } });
      a = throughCombat(attack(a, [idOf(a, "p1", "battlefield", "Kozilek, Butcher of Truth")]));
      expect(a.battlefield.filter((id) => a.objects[id]?.controller === "p2")).toHaveLength(1);
    });

    it("Kozilek, Butcher of Truth mis au cimetière depuis la main : son propriétaire mélange son cimetière dans sa bibliothèque", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Wheel of Misfortune", "Kozilek, Butcher of Truth"],
          graveyard: ["Opt", "Opt"],
          library: Array(10).fill("Shock"),
        },
      });
      // p1 choisit 3, p2 choisit 0 : p1 défausse sa main (Kozilek) et pioche sept cartes.
      s = settle(castIt(s, "p1", "Wheel of Misfortune"), (req, p) => (req.type === "number" ? [p === "p1" ? 3 : 0] : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Kozilek, Butcher of Truth");
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Kozilek, Butcher of Truth");
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Opt");
    });

    it("It That Betrays : un adversaire sacrifie un permanent non-jeton, il arrive sous votre contrôle", () => {
      let s = scenario({ p1: { battlefield: ["It That Betrays"] }, p2: { battlefield: ["Bear Cub", "Forest", "Forest"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "It That Betrays")]));
      // Annihilateur 2 : p2 sacrifie deux permanents, qui arrivent sous le contrôle de p1.
      expect(s.battlefield.filter((id) => s.objects[id]?.owner === "p2" && s.objects[id]?.controller === "p1")).toHaveLength(2);
    });

    it("Ulamog, the Ceaseless Hunger : exile deux permanents en le lançant ; en attaquant, vingt cartes du défenseur", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Ulamog, the Ceaseless Hunger"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"], library: Array(25).fill("Forest") },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Ulamog, the Ceaseless Hunger"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear, lions] : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      let a = scenario({ p1: { battlefield: ["Ulamog, the Ceaseless Hunger"] }, p2: { library: Array(25).fill("Forest") } });
      a = throughCombat(attack(a, [idOf(a, "p1", "battlefield", "Ulamog, the Ceaseless Hunger")]));
      expect(a.players.p2?.library).toHaveLength(5);
    });

    it("Ulamog, the Defiler : l'adversaire exile la moitié de sa bibliothèque (arrondie au-dessus) ; marqueurs = plus grande valeur de mana en exil", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Ulamog, the Defiler"] },
        p2: { library: ["Gigantosaurus", ...Array(4).fill("Forest")] },
      });
      s = settle(castIt(s, "p1", "Ulamog, the Defiler"));
      expect(s.players.p2?.library).toHaveLength(2);
      const ulamog = idOf(s, "p1", "battlefield", "Ulamog, the Defiler");
      expect(s.objects[ulamog]?.counters["+1/+1"]).toBe(5);
      // Annihilateur X : ses cinq marqueurs.
      expect(chars(s, ulamog).power).toBe(12);
    });

    it("Emrakul, the Promised End : vous contrôlez le prochain tour de l'adversaire, puis il prend un tour supplémentaire", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 13), hand: ["Emrakul, the Promised End"] } });
      s = settle(castIt(s, "p1", "Emrakul, the Promised End"));
      expect(s.turnControl).toMatchObject({ player: "p2", by: "p1", thenExtraTurn: true });
      const turn = s.turn.number;
      s = advanceUntil(s, (x) => x.turn.number === turn + 1 && x.pending?.kind === "priority", 600);
      expect(s.turn.active).toBe("p2");
      expect(s.extraTurns).toEqual(["p2"]);
      s = advanceUntil(s, (x) => x.turn.number === turn + 2 && x.pending?.kind === "priority", 600);
      expect(s.turn.active).toBe("p2");
      expect(s.turnControl).toBeUndefined();
    });

    it("Emrakul, the World Anew : gagnez le contrôle des créatures du joueur ciblé ; folie — payez six {C}", () => {
      expect(card("Emrakul, the World Anew").madness).toMatchObject({ colored: { C: 6 } });
      let s = scenario({
        p1: { battlefield: lands("Wastes", 12), hand: ["Emrakul, the World Anew"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Emrakul, the World Anew", { targets: { t: ["p2"] } }));
      expect(s.battlefield.filter((id) => s.objects[id]?.owner === "p2" && s.objects[id]?.controller === "p1")).toHaveLength(2);
    });

    it("Kozilek, the Broken Reality : le joueur ciblé manifeste deux cartes de sa main ; vous piochez autant", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 9), hand: ["Kozilek, the Broken Reality"], library: ["Opt", "Opt"] },
        p2: { hand: ["Bear Cub", "Opt", "Shock"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Kozilek, the Broken Reality"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(hand(s, "p2")).toBe(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.faceDown)).toHaveLength(2);
      expect(hand(s, "p1")).toBe(h - 1 + 2);
    });
  });

  describe("exhumation : Cityscape Leveler", () => {
    it("lancé : détruit un permanent non-terrain, son contrôleur crée un Powerstone engagé ; exhumé, revient avec la célérité puis est exilé", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 8), hand: ["Cityscape Leveler"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Cityscape Leveler"), (req, _p, cur) =>
        picking(idsOf(cur, "p2", "battlefield", "Bear Cub"))(req),
      );
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      const stone = tokens(s, "p2", "Powerstone")[0] ?? "";
      expect(s.objects[stone]?.tapped).toBe(true);
      let u = scenario({ p1: { battlefield: lands("Wastes", 8), graveyard: ["Cityscape Leveler"] } });
      const card0 = u.players.p1?.graveyard[0] ?? "";
      const opt = legalActions(u, "p1").find((a) => a.type === "activate" && a.source === card0);
      expect(opt).toBeDefined();
      u = settle(act(u, "p1", { type: "activate", source: card0, ability: (opt as { ability: number }).ability } as never));
      const lev = idOf(u, "p1", "battlefield", "Cityscape Leveler");
      expect(chars(u, lev).keywords).toContain("haste");
      expect(u.objects[lev]?.exileIfLeaves).toBe(true);
      u = advanceUntil(u, (x) => x.turn.active === "p2" && x.pending?.kind === "priority", 600);
      expect(u.exile.map((id) => nameOf(u, id))).toContain("Cityscape Leveler");
    });
  });

  describe("créatures", () => {
    it("Exocrine : vorace X = 5, cinq marqueurs, pioche, et 5 blessures à chaque joueur et à chaque autre créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Exocrine"], library: ["Opt"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Exocrine", { x: 5 }));
      const exo = idOf(s, "p1", "battlefield", "Exocrine");
      expect(s.objects[exo]?.counters["+1/+1"]).toBe(5);
      expect(hand(s, "p1")).toBe(h - 1 + 1);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([15, 15]);
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
    });

    it("Fanatic of Mogis : blessures à chaque adversaire égales à la dévotion au rouge", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 4)], hand: ["Fanatic of Mogis"] },
      });
      s = settle(castIt(s, "p1", "Fanatic of Mogis"));
      // Shivan Dragon {R}{R} + Fanatic {R} : 3.
      expect([life(s, "p2"), life(s, "p3")]).toEqual([17, 17]);
    });

    it("Keen Duelist : chacun perd la valeur de mana de la carte de l'autre, puis prend la sienne", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Keen Duelist"], library: ["Shivan Dragon"] },
        p2: { library: ["Opt"] },
      });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s);
      expect(life(s, "p1")).toBe(19);
      expect(life(s, "p2")).toBe(14);
    });

    it("Sandstone Oracle : piochez la différence avec la plus grande main adverse", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Wastes", 7), hand: ["Sandstone Oracle"], library: Array(6).fill("Opt") },
        p2: { hand: Array(5).fill("Opt") },
        p3: { hand: ["Opt"] },
      });
      s = settle(castIt(s, "p1", "Sandstone Oracle"));
      expect(hand(s, "p1")).toBe(5);
    });

    it("Ancient Cellarspawn : sort de Démon {1} de moins ; sort lancé pour moins que sa valeur de mana, l'adversaire perd la différence", () => {
      let s = scenario({
        p1: { battlefield: ["Ancient Cellarspawn", ...lands("Swamp", 7)], hand: ["Razaketh, the Foulblooded"] },
      });
      s = settle(castIt(s, "p1", "Razaketh, the Foulblooded"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(onField(s, "p1", "Razaketh, the Foulblooded")).toBe(1);
      expect(life(s, "p2")).toBe(19);
    });

    it("Grim Servant : cherchez une carte de valeur de mana au plus égale à votre dévotion au noir ; vous perdez 3 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Grim Servant"], library: ["Gigantosaurus", "Opt"] } });
      s = settle(castIt(s, "p1", "Grim Servant"), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Opt") : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toContain("Opt");
      expect(life(s, "p1")).toBe(17);
    });
  });

  describe("sorts", () => {
    it("Valakut Awakening : mettez des cartes au-dessous, piochez-en autant plus une", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Valakut Awakening // Valakut Stoneforge", "Opt", "Opt"],
          library: Array(5).fill("Shock"),
        },
      });
      s = settle(castIt(s, "p1", "Valakut Awakening // Valakut Stoneforge"), (req) =>
        req.type === "pick" ? req.options : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Shock", "Shock", "Shock"]);
    });

    it("Shatterskull Smashing : X 6 ou plus, deux fois X blessures réparties", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Shatterskull Smashing // Shatterskull, the Hammer Pass"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      const g = idOf(s, "p2", "battlefield", "Gigantosaurus");
      s = settle(castIt(s, "p1", "Shatterskull Smashing // Shatterskull, the Hammer Pass", { x: 6, targets: { t: [g] } }));
      expect(onField(s, "p2", "Gigantosaurus")).toBe(0);
    });

    it("Agadeem's Awakening : des cartes de créature de valeurs de mana différentes", () => {
      const s = scenario({
        p1: {
          battlefield: lands("Swamp", 6),
          hand: ["Agadeem's Awakening // Agadeem, the Undercrypt"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Savannah Lions"],
        },
      });
      const [bear] = idsOf(s, "p1", "graveyard", "Bear Cub");
      const [elves] = idsOf(s, "p1", "graveyard", "Llanowar Elves");
      const [lions] = idsOf(s, "p1", "graveyard", "Savannah Lions");
      const card0 = idOf(s, "p1", "hand", "Agadeem's Awakening // Agadeem, the Undercrypt");
      // Llanowar Elves et Savannah Lions ont la même valeur de mana (1) : refusé.
      expect(() => act(s, "p1", { type: "cast", card: card0, x: 2, targets: { t: [elves, lions] } } as never)).toThrow();
      const ok = settle(act(s, "p1", { type: "cast", card: card0, x: 2, targets: { t: [bear, elves] } } as never));
      expect(onField(ok, "p1", "Bear Cub") + onField(ok, "p1", "Llanowar Elves")).toBe(2);
    });

    it("Rakdos Charm : chaque créature inflige 1 blessure à son contrôleur", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Rakdos Charm"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Rakdos Charm", { mode: 2 }));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([19, 18]);
    });

    it("Descent into Avernus : deux marqueurs, puis X Trésors et X blessures pour chaque joueur", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Descent into Avernus"] } });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([18, 18]);
      expect([tokens(s, "p1", "Treasure").length, tokens(s, "p2", "Treasure").length]).toEqual([2, 2]);
    });
  });

  describe("mana", () => {
    it("Rakdos Signet : {1}, {T} : {B}{R} ; Graven Cairns : {B/R}, {T} : deux mana noir ou rouge", () => {
      let s = scenario({ p1: { battlefield: ["Rakdos Signet", "Mountain"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Mountain"), ability: 0 } as never);
      const signet = idOf(s, "p1", "battlefield", "Rakdos Signet");
      const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === signet);
      s = act(s, "p1", { type: "activate", source: signet, ability: (o as { ability: number }).ability } as never);
      expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    });

    it("Cryptolith Fragment : se transforme à l'entretien si chaque joueur a 10 PV ou moins", () => {
      let s = scenario({
        active: "p2",
        p1: { life: 9, battlefield: ["Cryptolith Fragment // Aurora of Emrakul"] },
        p2: { life: 10 },
      });
      s = toTurnOf(s, "p1", "main1");
      expect(nameOf(s, s.battlefield.find((id) => s.objects[id]?.controller === "p1") ?? "")).toBeDefined();
      expect(chars(s, s.battlefield.find((id) => s.objects[id]?.controller === "p1") ?? "").name).toBe("Aurora of Emrakul");
    });
  });
});
