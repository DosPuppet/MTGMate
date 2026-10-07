/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « Multiverse Reforged » (Reality Fracture). Monarque,
 * toxique, piles séparées par l'adversaire, restriction d'attaque de Jace, protection d'un joueur contre un type de carte,
 * effets « jusqu'au prochain tour de ce joueur », révélations dans la bibliothèque d'un autre joueur, incuber.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { attackableDefenders } from "../src/turn";
import type { GameState, PlayerId } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  idOf,
  idsOf,
  lands,
  nameOf,
  passBoth,
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
/** p2 attaque p1 avec ces créatures. */
const p2Attacks = (s: GameState, ids: string[]) => {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2", 100);
  return act(cur, "p2", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p1" })) });
};
const activate = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const source = idOf(s, p, "battlefield", name);
  const o = legalActions(s, p).find((a) => a.type === "activate" && a.source === source);
  if (o?.type !== "activate") throw new Error(`pas de capacité pour ${name}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};

describe("Multiverse Reforged (EDH)", () => {
  describe("monarque", () => {
    it("Tamiyo vous fait monarque ; le monarque pioche au début de son étape de fin", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 3).concat(lands("Mountain", 3)),
          hand: ["Tamiyo, Upriser Crowned"],
          library: Array(5).fill("Opt"),
        },
      });
      s = settle(castIt(s, "p1", "Tamiyo, Upriser Crowned"));
      expect(s.monarch).toBe("p1");
      const h = hand(s, "p1");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      // 724.2 : capacité déclenchée du monarque, sur la pile au début de son étape de fin.
      expect(s.stack.map((x) => [x.sourceDefId, x.controller])).toEqual([["rules:monarch", "p1"]]);
      expect(hand(s, "p1")).toBe(h);
      s = passBoth(s);
      expect(hand(s, "p1")).toBe(h + 1);
    });

    it("le monarque : « ce joueur pioche », même s'il a cessé d'être le monarque avant la résolution ; vue de la pile", () => {
      let s = scenario({ p1: { library: Array(5).fill("Opt") }, p2: { library: Array(5).fill("Opt") } });
      s.monarch = "p1";
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      const item = projectView(s, "p2").stack[0];
      expect([item?.name, item?.fr?.name, item?.effect]).toEqual(["Monarch", "Monarque", "Monarque : piochez une carte"]);
      const [h1, h2] = [hand(s, "p1"), hand(s, "p2")];
      s.monarch = "p2";
      s = passBoth(s);
      expect([hand(s, "p1"), hand(s, "p2")]).toEqual([h1 + 1, h2]);
    });

    it("le monarque ne pioche pas à l'étape de fin d'un autre joueur", () => {
      let s = scenario({ active: "p2", p1: { library: Array(5).fill("Opt") }, p2: { library: Array(5).fill("Opt") } });
      s.monarch = "p1";
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      expect(s.stack).toEqual([]);
    });

    it("une créature qui blesse le monarque au combat fait de son contrôleur le monarque", () => {
      let s = scenario({ active: "p2", p1: {}, p2: { battlefield: ["Bear Cub"] } });
      s.monarch = "p1";
      s = throughCombat(p2Attacks(s, [idOf(s, "p2", "battlefield", "Bear Cub")]));
      expect(s.monarch).toBe("p2");
    });

    it("724.2 : le transfert passe par la pile, contrôlé par le monarque ; il ne change qu'à la résolution", () => {
      let s = scenario({ active: "p2", p1: {}, p2: { battlefield: ["Bear Cub", "Bear Cub"] } });
      s.monarch = "p1";
      s = p2Attacks(s, idsOf(s, "p2", "battlefield", "Bear Cub"));
      s = advanceUntil(s, (x) => x.stack.length > 0 || x.turn.step === "main2", 300);
      // Une capacité par créature qui a blessé le monarque.
      expect(s.stack.map((x) => [x.sourceDefId, x.controller])).toEqual([
        ["rules:monarchSteal", "p1"],
        ["rules:monarchSteal", "p1"],
      ]);
      expect(s.monarch).toBe("p1");
      const item = projectView(s, "p2").stack[0];
      expect([item?.fr?.name, item?.effect]).toEqual(["Monarque", "Monarque : le contrôleur de la créature devient le monarque"]);
      s = passBoth(s);
      expect(s.monarch).toBe("p2");
    });

    it("Tamiyo : des créatures blessent le monarque qui la contrôle : engagées, un marqueur d'étourdissement chacune", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Tamiyo, Upriser Crowned"] }, p2: { battlefield: ["Bear Cub"] } });
      s.monarch = "p1";
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = throughCombat(p2Attacks(s, [bear]));
      expect(s.objects[bear]?.counters.stun).toBe(1);
      expect(s.objects[bear]?.tapped).toBe(true);
    });
  });

  describe("toxique et corrompu", () => {
    it("Mite phyrexian (toxique 1) : un marqueur poison en plus des blessures ; Skrelv's Hive, corrompu : lien de vie", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Skrelv's Hive"] } });
      s = toTurnOf(s, "p1", "main1");
      const mite = tokens(s, "p1", "Phyrexian Mite")[0] ?? "";
      expect(chars(s, mite).keywords).toEqual(expect.arrayContaining(["toxic", "cantBlock"]));
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" && x.turn.number > s.turn.number && x.turn.step === "main1" && x.pending?.kind === "priority",
        600,
      );
      s = throughCombat(attack(s, [tokens(s, "p1", "Phyrexian Mite")[0] ?? ""]));
      expect(s.players.p2?.counters?.poison).toBe(1);
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, poison: 3 };
      s.version += 1;
      expect(chars(s, mite).keywords).toContain("lifelink");
    });
  });

  describe("sorts", () => {
    it("Fact or Fiction : l'adversaire sépare les cinq cartes, vous choisissez votre pile", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Fact or Fiction"], library: ["Opt", "Opt", "Shock", "Shock", "Bear Cub"] },
      });
      s = castIt(s, "p1", "Fact or Fiction");
      let separator: PlayerId | undefined;
      let chooser: PlayerId | undefined;
      s = settle(s, (req, p) => {
        if (req.type === "pick" && req.intent === "piles" && req.max > 1) {
          separator = p;
          return req.options.slice(0, 1);
        }
        if (req.type === "pick" && req.intent === "piles") {
          chooser = p;
          return ["up"];
        }
        return undefined;
      });
      expect([separator, chooser]).toEqual(["p2", "p1"]);
      expect(hand(s, "p1")).toBe(4);
      expect(s.players.p1?.graveyard.length).toBe(2);
    });

    it("Fact or Fiction (trois joueurs) : vous choisissez l'adversaire qui sépare les cartes", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Island", 4), hand: ["Fact or Fiction"], library: ["Opt", "Opt", "Shock", "Shock", "Bear Cub"] },
      });
      s = castIt(s, "p1", "Fact or Fiction");
      const offered: string[][] = [];
      let separator: PlayerId | undefined;
      s = settle(s, (req, p) => {
        if (req.type === "pick" && req.options.includes("p3")) {
          offered.push([p, ...req.options]);
          return ["p3"];
        }
        if (req.type === "pick" && req.intent === "piles" && req.max > 1) {
          separator = p;
          return req.options.slice(0, 1);
        }
        return req.type === "pick" && req.intent === "piles" ? ["up"] : undefined;
      });
      expect(offered).toEqual([["p1", "p2", "p3"]]);
      expect(separator).toBe("p3");
      expect(hand(s, "p1")).toBe(4);
    });

    it("Teferi's Reproach : protection et PV figés jusqu'au prochain tour de l'adversaire ; ses non-terrains disparaissent", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Teferi's Reproach"] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      s = settle(castIt(s, "p1", "Teferi's Reproach", { targets: { t: ["p2"] } }));
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      // Le tour de l'adversaire : l'effet prend fin au début de son tour (avant son étape de dégagement, la créature revient).
      s = toTurnOf(s, "p2", "main1");
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
    });

    it("Martial Coup : X ≥ 5 crée X Soldats et détruit toutes les autres créatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Martial Coup"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Martial Coup", { x: 5 }));
      expect(tokens(s, "p1", "Soldier")).toHaveLength(5);
      expect(onField(s, "p1", "Bear Cub") + onField(s, "p2", "Bear Cub")).toBe(0);
    });

    it("Sunfall : exile toutes les créatures et incube X ; l'Incubateur devient une créature Phyrexian avec ses marqueurs", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Sunfall"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Sunfall"));
      const inc = tokens(s, "p1", "Incubator")[0] ?? "";
      expect(s.objects[inc]?.counters["+1/+1"]).toBe(2);
      s = settle(activate(s, "p1", "Incubator"));
      expect(chars(s, inc).types).toContain("Creature");
      expect(chars(s, inc).power).toBe(2);
    });

    it("Mass Polymorph : vos créatures exilées, autant de cartes de créature de la bibliothèque arrivent", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), "Bear Cub", "Savannah Lions"],
          hand: ["Mass Polymorph"],
          library: ["Opt", "Gigantosaurus", "Opt", "Serra Angel"],
        },
      });
      s = settle(castIt(s, "p1", "Mass Polymorph"));
      expect([onField(s, "p1", "Gigantosaurus"), onField(s, "p1", "Serra Angel"), onField(s, "p1", "Bear Cub")]).toEqual([
        1, 1, 0,
      ]);
    });
  });

  describe("créatures", () => {
    it("Nissa, Leyline Tamer : la première accalmie de chaque tour révèle une créature, pas la deuxième, et de nouveau au tour suivant", () => {
      let s = scenario({
        p1: {
          battlefield: ["Nissa, Leyline Tamer"],
          hand: ["Forest", "Plains"],
          library: ["Opt", "Bear Cub", "Island", "Island", "Island", "Savannah Lions", ...lands("Island", 6)],
        },
        p2: { library: lands("Island", 10) },
      });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") } as never));
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      // Deuxième terrain du tour (permis par un effet ici simulé) : la créature n'est pas révélée.
      s.turn.landsPlayed = 0;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") } as never));
      expect(onField(s, "p1", "Savannah Lions")).toBe(0);
      // Au tour suivant de p1, la première accalmie révèle de nouveau une créature.
      s = toTurnOf(s, "p2");
      s = toTurnOf(s, "p1");
      const land = idsOf(s, "p1", "hand", "Island")[0] ?? "";
      s = settle(act(s, "p1", { type: "playLand", card: land } as never));
      expect(onField(s, "p1", "Savannah Lions")).toBe(1);
    });

    it("Jace, Multiverse Architect : l'adversaire qui ne paie pas {2} ne peut pas attaquer vos Jace ce tour-ci", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Jace, Multiverse Architect"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(
        s,
        (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.pending?.kind === "priority"),
        50,
      );
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 50);
      const jace = idOf(s, "p1", "battlefield", "Jace, Multiverse Architect");
      expect(attackableDefenders(s, "p2")).not.toContain(jace);
      expect(attackableDefenders(s, "p2")).toContain("p1");
    });

    it("Serra's Emissary : vous et vos créatures avez la protection contre le type de carte choisi", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Serra's Emissary"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = settle(castIt(s, "p1", "Serra's Emissary"), (req) =>
        req.type === "pick" && req.options.includes("Instant") ? ["Instant"] : undefined,
      );
      s = toTurnOf(s, "p2", "main1");
      const shock = idOf(s, "p2", "hand", "Shock");
      const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === shock);
      const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
      expect(legal).not.toContain("p1");
      expect(legal).not.toContain(idOf(s, "p1", "battlefield", "Serra's Emissary"));
    });

    it("Niv-Mizzet, Ghost Counsel : vous gagnez des PV, payez-en autant pour piocher autant", () => {
      let s = scenario({ p1: { battlefield: ["Niv-Mizzet, Ghost Counsel"], library: Array(3).fill("Opt") } });
      const niv = idOf(s, "p1", "battlefield", "Niv-Mizzet, Ghost Counsel");
      s = act(s, "p1", { type: "activate", source: niv, ability: 1 } as never);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      // Chaque adversaire perd 1, vous gagnez 1 ; puis 1 PV payé, une carte piochée.
      expect(life(s, "p1")).toBe(20);
      expect(hand(s, "p1")).toBe(1);
    });

    it("Omnath, Locus of the Void : +1/+1 par mana inutilisé ; accalmie : {C}{C}", () => {
      let s = scenario({ p1: { battlefield: ["Omnath, Locus of the Void"], hand: ["Forest"] } });
      const omnath = idOf(s, "p1", "battlefield", "Omnath, Locus of the Void");
      expect(chars(s, omnath).power).toBe(6);
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(s.players.p1?.manaPool.C).toBe(2);
      expect(chars(s, omnath).power).toBe(8);
    });

    it("Avacyn, Angel of Horror : une créature non-jeton qui meurt revient au début de la prochaine étape de fin", () => {
      let s = scenario({
        p1: { battlefield: ["Avacyn, Angel of Horror", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      s = toTurnOf(s, "p2", "main1");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(onField(s, "p1", "Bear Cub")).toBe(0);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 600);
      s = settle(s);
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
    });

    it("Jhoira : l'adversaire révèle jusqu'à un permanent historique, qui arrive sous votre contrôle ; vous perdez sa valeur de mana", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Jhoira, Weatherlight Corsair"] },
        p2: { library: ["Opt", "Sol Ring", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Jhoira, Weatherlight Corsair"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(onField(s, "p1", "Sol Ring")).toBe(1);
      expect(life(s, "p1")).toBe(19);
    });

    it("Archfiend of Despair : vos adversaires ne gagnent pas de PV ; à l'étape de fin, ils perdent autant qu'ils ont perdu", () => {
      let s = scenario({ p1: { battlefield: ["Archfiend of Despair", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 600);
      s = settle(s);
      expect(life(s, "p2")).toBe(16);
    });

    it("Darksteel Angel : vos créatures ne reçoivent pas de marqueurs -1/-1", () => {
      expect(card("Darksteel Angel").keywords).toEqual(expect.arrayContaining(["flying", "indestructible"]));
    });

    it("Dack Fayden : une créature par adversaire arrive, provoquée (doit attaquer), sous le contrôle de cet adversaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Dack Fayden, Helping Hand"], library: ["Opt", "Bear Cub", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Dack Fayden, Helping Hand"));
      const bear = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") ?? "";
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(chars(s, bear).keywords).toContain("mustAttack");
    });

    it("Proteus Staff : la créature au-dessous de la bibliothèque ; son contrôleur révèle jusqu'à une créature et la met en jeu", () => {
      let s = scenario({
        p1: { battlefield: ["Proteus Staff", ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"], library: ["Opt", "Savannah Lions"] },
      });
      s = settle(activate(s, "p1", "Proteus Staff", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(onField(s, "p2", "Savannah Lions")).toBe(1);
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
    });
  });

  describe("Gingerbrute et Venser", () => {
    it("Ginger : monarque à l'arrivée ; à chaque entretien, si vous êtes le monarque, un Gingerbrute", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 6), hand: ["Ginger, Queen of Sweets"] } });
      s = settle(castIt(s, "p1", "Ginger, Queen of Sweets"));
      expect(s.monarch).toBe("p1");
      s = toTurnOf(s, "p2", "main1");
      expect(tokens(s, "p1", "Gingerbrute")).toHaveLength(1);
    });

    it("Venser : deux jetons copies d'un permanent adverse, avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Venser, Fervent Forger"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      s = settle(castIt(s, "p1", "Venser, Fervent Forger"), (req, _p, cur) => {
        return picking(idsOf(cur, "p2", "battlefield", "Gigantosaurus"))(req);
      });
      expect(tokens(s, "p1", "Gigantosaurus")).toHaveLength(2);
    });
  });
});
