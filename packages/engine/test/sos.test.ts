/**
 * Secrets of Strixhaven (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Préparation (Emeritus of Ideation), Opus (Colorstorm Stallion), Infusion (Moseo), Hardened
 * Academic, flashback (Practiced Offense, Daydream, Flashback), Witherbloom Charm, Professor Dellian Fel, Tablet of
 * Discovery, Dissection Practice et les terrains bicolores de l'extension.
 */

import { describe, expect, it } from "vitest";
import { INCREMENT, INFUSION, OPUS, opusInstead, REPARTEE } from "../../cards/src/sos/common";
import { fx, ref, spell, triggered } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { checkCondition } from "../src/triggers";
import type { AbilityDef, CardDef, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  passUntil,
  scenario,
  settle,
  untilCastNow,
} from "./helpers";

type S = GameState;
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

/** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
const activate = (
  s: S,
  player: string,
  source: string,
  label?: string,
  targets?: Record<string, string[]>,
  extra: object = {},
) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
  );
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
};
describe("Secrets of Strixhaven", () => {
  describe("Préparation : Emeritus of Ideation", () => {
    it("vol et parade {2} ; arrive préparée : Ancestral Recall se lance depuis l'exil (un joueur ciblé pioche trois cartes)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6)], hand: ["Emeritus of Ideation"], library: lands("Forest", 5) },
      });
      s = settle(cast(s, "p1", "Emeritus of Ideation"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(chars(s, emeritus).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      const recall = exiled(s, "Ancestral Recall");
      expect(recall).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBe(recall[0]);
      s = settle(act(s, "p1", { type: "cast", card: recall[0] as string, targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      expect(exiled(s, "Ancestral Recall")).toHaveLength(0);
    });

    it("en attaquant, exiler huit cartes du cimetière la rend préparée ; avec sept, rien", () => {
      const run = (graveyard: number) => {
        let s = scenario({ p1: { battlefield: ["Emeritus of Ideation"], graveyard: lands("Island", graveyard) } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: emeritus, defender: "p2" }] });
        s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.type === "pick" ? req.options.slice(0, 8) : undefined));
        return s;
      };
      const s = run(9);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(exiled(s, "Island")).toHaveLength(8);
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      const t = run(7);
      expect(t.players.p1?.graveyard).toHaveLength(7);
      expect(exiled(t, "Ancestral Recall")).toHaveLength(0);
    });
  });

  describe("Opus : Colorstorm Stallion", () => {
    it("chaque éphémère ou rituel lancé : +1/+1 jusqu'à la fin du tour ; cinq mana ou plus dépensés : un jeton copie", () => {
      let s = scenario({
        p1: {
          battlefield: ["Colorstorm Stallion", ...lands("Island", 3), ...lands("Mountain", 3)],
          hand: ["Opt", "Traumatic Critique"],
          library: lands("Forest", 5),
        },
      });
      const stallion = idOf(s, "p1", "battlefield", "Colorstorm Stallion");
      expect(chars(s, stallion).keywords).toEqual(expect.arrayContaining(["ward", "haste"]));
      s = settle(cast(s, "p1", "Opt"));
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([4, 4]);
      expect(idsOf(s, "p1", "battlefield", "Colorstorm Stallion")).toHaveLength(1);
      // X = 3 : {3}{U}{R}, cinq mana dépensés.
      s = settle(cast(s, "p1", "Traumatic Critique", { t: ["p2"] }, { x: 3 }));
      expect(s.players.p2?.life).toBe(17);
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([5, 5]);
      const copies = idsOf(s, "p1", "battlefield", "Colorstorm Stallion").filter((id) => id !== stallion);
      expect(copies).toHaveLength(1);
      expect(s.objects[copies[0] as string]?.isToken).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([3, 3]);
    });

    it("un sort de créature ne déclenche pas l'Opus", () => {
      let s = scenario({ p1: { battlefield: ["Colorstorm Stallion", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Bear Cub"));
      const stallion = idOf(s, "p1", "battlefield", "Colorstorm Stallion");
      expect(chars(s, stallion).power).toBe(3);
    });
  });

  describe("Infusion : Moseo, Vein's New Dean", () => {
    it("en arrivant : un Nuisible 1/1 noir et vert qui fait gagner 1 PV quand il attaque", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Moseo, Vein's New Dean"] } });
      s = settle(cast(s, "p1", "Moseo, Vein's New Dean"));
      const pest = idOf(s, "p1", "battlefield", "Pest");
      const c = chars(s, pest);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([1, 1, ["B", "G"]]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Moseo, Vein's New Dean")).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: pest, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(21);
    });

    it("à votre étape de fin, si vous avez gagné X PV : une carte de créature de VM X ou moins revient du cimetière", () => {
      const run = (life: "charm" | "practice" | "none") => {
        let s = scenario({
          p1: {
            battlefield: ["Moseo, Vein's New Dean", "Swamp", "Forest"],
            hand: ["Witherbloom Charm", "Dissection Practice"],
            graveyard: ["Serra Angel"],
          },
        });
        if (life === "charm") s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
        if (life === "practice") s = settle(cast(s, "p1", "Dissection Practice", { p: ["p2"], a: [], b: [] }));
        s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
        return s;
      };
      // 5 PV gagnés : l'Ange (VM 5) revient.
      expect(idsOf(run("charm"), "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // 1 PV gagné : VM 5 > 1, l'Ange reste au cimetière.
      expect(idsOf(run("practice"), "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(run("none"), "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Hardened Academic", () => {
    it("vol et célérité ; défaussez une carte : lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Hardened Academic"], hand: ["Opt"] } });
      const academic = idOf(s, "p1", "battlefield", "Hardened Academic");
      expect(chars(s, academic).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, academic).keywords).not.toContain("lifelink");
      s = settle(activate(s, "p1", academic, undefined, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(chars(s, academic).keywords).toContain("lifelink");
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, academic).keywords).not.toContain("lifelink");
    });

    it("des cartes quittent votre cimetière : un marqueur +1/+1 sur une créature ciblée que vous contrôlez ; le cimetière adverse, non", () => {
      const run = (whose: "p1" | "p2") => {
        let s = scenario({
          p1: {
            battlefield: ["Hardened Academic", "Bear Cub", ...lands("Forest", 2)],
            hand: ["Heritage Reclamation"],
            graveyard: whose === "p1" ? ["Opt"] : [],
            library: lands("Forest", 3),
          },
          p2: { graveyard: whose === "p2" ? ["Opt"] : [] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = s.players[whose]?.graveyard[0] as string;
        s = cast(s, "p1", "Heritage Reclamation", { g: [opt] }, { mode: 2 });
        s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
        expect(exiled(s, "Opt")).toHaveLength(1);
        return s.objects[bear]?.counters["+1/+1"] ?? 0;
      };
      expect(run("p1")).toBe(1);
      expect(run("p2")).toBe(0);
    });
  });

  describe("Flashback : Practiced Offense", () => {
    it("un marqueur +1/+1 sur chaque créature du joueur ciblé ; la créature ciblée gagne la double initiative ou le lien de vie", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Plains", 3)], hand: ["Practiced Offense"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const [bear, angel] = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Practiced Offense", { p: ["p1"], c: [bear] }, { mode: 0 }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, bear).keywords).not.toContain("lifelink");
      expect(idsOf(s, "p1", "graveyard", "Practiced Offense")).toHaveLength(1);
    });

    it("flashback {1}{W} depuis le cimetière (lien de vie), puis la carte est exilée", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], graveyard: ["Practiced Offense"] },
      });
      const card = idOf(s, "p1", "graveyard", "Practiced Offense");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { p: ["p1"], c: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
      expect(exiled(s, "Practiced Offense")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });
  });

  describe("Daydream", () => {
    it("exile une créature que vous contrôlez et la renvoie avec un marqueur +1/+1 (blessures effacées) ; flashback {2}{W}", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Serra Angel", damage: 3 }, ...lands("Plains", 4)], hand: ["Daydream"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Daydream", { t: [angel] }));
      const back = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(back).not.toBe(angel);
      expect(s.objects[back]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[back]?.damage).toBe(0);
      const card = idOf(s, "p1", "graveyard", "Daydream");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [back] } }));
      const again = idOf(s, "p1", "battlefield", "Serra Angel");
      // Nouvel objet : un seul marqueur.
      expect(s.objects[again]?.counters["+1/+1"]).toBe(1);
      expect(exiled(s, "Daydream")).toHaveLength(1);
    });

    it("une créature adverse n'est pas une cible légale", () => {
      const s = scenario({ p1: { battlefield: ["Plains"], hand: ["Daydream"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(() => cast(s, "p1", "Daydream", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    });
  });

  describe("Flashback (la carte)", () => {
    it("un éphémère de votre cimetière gagne le flashback jusqu'à la fin du tour, pour son coût de mana", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flashback"], graveyard: ["Lightning Strike"] } });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
      s = settle(cast(s, "p1", "Flashback", { t: [strike] }));
      expect(castOptions(s, "p1", strike)).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    });

    it("la permission cesse à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flashback"], graveyard: ["Lightning Strike"] } });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = settle(cast(s, "p1", "Flashback", { t: [strike] }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
    });

    it("une carte de créature n'est pas une cible légale", () => {
      const s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Flashback"], graveyard: ["Bear Cub"] } });
      expect(() => cast(s, "p1", "Flashback", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] })).toThrow();
    });
  });

  describe("Witherbloom Charm", () => {
    it("vous pouvez sacrifier un permanent : si vous le faites, piochez deux cartes", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Swamp", "Forest", "Bear Cub"], hand: ["Witherbloom Charm"], library: lands("Island", 3) },
        });
        s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 0 }), (req) => {
          if (req.type === "yesNo") return [sacrifice ? 1 : 0];
          if (req.type === "pick") {
            if (!sacrifice) return req.min === 0 ? [] : undefined;
            const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
            return bear ? [bear] : undefined;
          }
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(yes.players.p1?.hand).toHaveLength(2);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(no.players.p1?.hand).toHaveLength(0);
    });

    it("détruit un permanent non-terrain de VM 2 ou moins ; VM 3, non", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Witherbloom Charm"] },
        p2: { battlefield: ["Bear Cub", "Brazen Scourge"] },
      });
      expect(() =>
        cast(s, "p1", "Witherbloom Charm", { t: [idOf(s, "p2", "battlefield", "Brazen Scourge")] }, { mode: 2 }),
      ).toThrow();
      s = settle(cast(s, "p1", "Witherbloom Charm", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("vous gagnez 5 PV", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], hand: ["Witherbloom Charm"] } });
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Professor Dellian Fel", () => {
    it("+2 : 3 PV ; 0 : piochez et perdez 1 PV ; −3 : détruit une créature", () => {
      let s = scenario({
        p1: { battlefield: ["Professor Dellian Fel"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const pw = idOf(s, "p1", "battlefield", "Professor Dellian Fel");
      expect(s.objects[pw]?.counters.loyalty).toBe(5);
      s = settle(activate(s, "p1", pw, "Gagnez 3"));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[pw]?.counters.loyalty).toBe(7);
      // Une seule capacité de fidélité par tour.
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === pw)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", pw, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.players.p1?.life).toBe(22);
      expect(s.objects[pw]?.counters.loyalty).toBe(7);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", pw, "Détruit", { t: [angel] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[pw]?.counters.loyalty).toBe(4);
    });

    it("−6 : emblème « chaque fois que vous gagnez des PV, un adversaire ciblé perd autant de PV »", () => {
      let s = scenario({ p1: { battlefield: ["Professor Dellian Fel", "Swamp", "Forest"], hand: ["Witherbloom Charm"] } });
      const pw = idOf(s, "p1", "battlefield", "Professor Dellian Fel");
      (s.objects[pw] as { counters: Record<string, number> }).counters.loyalty = 6;
      s.version += 1;
      s = settle(activate(s, "p1", pw, "Emblème"));
      expect(s.objects[pw]).toBeUndefined();
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(s.players.p1?.life).toBe(25);
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("Tablet of Discovery", () => {
    it("en arrivant, meulez une carte : vous pouvez la jouer ce tour-ci (ici un éphémère, lancé depuis le cimetière)", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Tablet of Discovery"], library: ["Lightning Strike", "Forest"] },
      });
      s = settle(cast(s, "p1", "Tablet of Discovery"));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(s.players.p1?.library).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("la permission cesse à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Tablet of Discovery"], library: ["Lightning Strike", "Forest"] },
      });
      s = settle(cast(s, "p1", "Tablet of Discovery"));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
    });

    it("{T} : ajoutez {R}", () => {
      let s = scenario({ p1: { battlefield: ["Tablet of Discovery"], hand: ["Burst Lightning"] } });
      const tablet = idOf(s, "p1", "battlefield", "Tablet of Discovery");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === tablet && a.colors.includes("R"))).toBe(
        true,
      );
      s = settle(cast(s, "p1", "Burst Lightning", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[tablet]?.tapped).toBe(true);
    });
  });

  describe("Dissection Practice", () => {
    it("un adversaire perd 1 PV, vous en gagnez 1 ; jusqu'à une créature +1/+1, jusqu'à une autre −1/−1", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Dissection Practice"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dissection Practice", { p: ["p2"], a: [mine], b: [theirs] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      expect([chars(s, mine).power, chars(s, mine).toughness]).toEqual([3, 3]);
      expect([chars(s, theirs).power, chars(s, theirs).toughness]).toEqual([1, 1]);
    });
  });

  describe("Terrains bicolores (Sundown Pass, Shattered Sanctum, Stormcarved Coast, Deathcap Glade)", () => {
    it("arrivent engagés, sauf si vous contrôlez deux autres terrains ou plus", () => {
      const play = (name: string, others: number) => {
        let s = scenario({ p1: { battlefield: lands("Plains", others), hand: [name] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
        const id = idOf(s, "p1", "battlefield", name);
        const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        return { tapped: s.objects[id]?.tapped, colors: colors.sort() };
      };
      expect(play("Sundown Pass", 1).tapped).toBe(true);
      expect(play("Sundown Pass", 2)).toEqual({ tapped: false, colors: ["R", "W"] });
      expect(play("Shattered Sanctum", 2)).toEqual({ tapped: false, colors: ["B", "W"] });
      expect(play("Stormcarved Coast", 2)).toEqual({ tapped: false, colors: ["R", "U"] });
      expect(play("Deathcap Glade", 2)).toEqual({ tapped: false, colors: ["B", "G"] });
    });
  });
});

describe("Secrets of Strixhaven, socle : Increment, Repartee, Opus, Infusion", () => {
  const tester = (name: string, power: number, toughness: number, ...abilities: AbilityDef[]) =>
    customCard({ name, power, toughness, abilities });
  /** Rituel incolore de coût {N} : « piochez une carte ». */
  const sorcery = (n: number) =>
    customCard({
      name: `Rituel à ${n}`,
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: n, colored: {}, x: 0 },
      manaCostText: `{${n}}`,
      spell: spell([], [fx.draw(1)]),
    });

  it("Increment : un marqueur si le mana dépensé dépasse la force ou l'endurance (la plus petite des deux), pas sinon", () => {
    const pupil = tester("Élève d'essai", 1, 3, INCREMENT);
    let s = scenario({ p1: { battlefield: [pupil, ...lands("Island", 3)], hand: ["Opt", sorcery(2)] } });
    const id = idOf(s, "p1", "battlefield", pupil.name);
    // Opt : 1 mana, pas plus que la force 1.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
    // 2 mana > force 1 (mais pas > endurance 3).
    s = settle(cast(s, "p1", "Rituel à 2"));
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Repartee : un éphémère ou rituel qui cible une créature, pas un joueur ; pas un sort de créature", () => {
    const duelist = tester(
      "Duelliste d'essai",
      1,
      1,
      triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee : un marqueur +1/+1" }),
    );
    let s = scenario({
      p1: { battlefield: [duelist, ...lands("Mountain", 6)], hand: ["Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const id = idOf(s, "p1", "battlefield", duelist.name);
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] } }));
    expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Opus : à chaque éphémère ou rituel ; cinq mana ou plus dépensés : l'effet renforcé", () => {
    const soloist = tester(
      "Soliste d'essai",
      1,
      3,
      triggered(OPUS, opusInstead([fx.damage(1, ref.eachOpponent)], [fx.damage(3, ref.eachOpponent)]), {
        label: "Opus : 1 blessure (3 si cinq mana)",
      }),
    );
    let s = scenario({ p1: { battlefield: [soloist, ...lands("Island", 6)], hand: ["Opt", sorcery(5)] } });
    s = settle(cast(s, "p1", "Opt"));
    expect(s.players.p2?.life).toBe(19);
    s = settle(cast(s, "p1", "Rituel à 5"));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Infusion : vrai seulement si vous avez gagné des points de vie ce tour-ci", () => {
    const s = scenario({});
    expect(checkCondition(s, INFUSION, "p1")).toBe(false);
    const pl = s.players.p1;
    if (pl) pl.turnStats.lifeGained = 1;
    expect(checkCondition(s, INFUSION, "p1")).toBe(true);
  });
});

describe("Secrets of Strixhaven, lot A — blanc", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes blanches : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (plan R, lot R7) : préparation (sorts préparés lancés depuis l'exil, « devient préparée »), Repartee,
   * flashback, retour depuis le cimetière, exil temporaire.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Répond `ids` à la première demande « pick » qui les propose tous. */
  const pickIds =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  /** Lance le sort préparé (la copie exilée) de la carte. */
  const castPrepared = (s: S, player: string, spellName: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "cast", card: exiled(s, spellName)[0] as string, targets });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };

  describe("Sorts", () => {
    it("Ajani's Response : coûte {3} de moins contre une créature engagée ; détruit la créature ciblée", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Ajani's Response"] },
          p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
        });
      let s = setup();
      s = settle(cast(s, "p1", "Ajani's Response", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      // Une créature dégagée : {4}{W}, impossible avec deux terrains.
      const t = setup();
      expect(() => cast(t, "p1", "Ajani's Response", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] })).toThrow();
    });

    it("Antiquities on the Loose : deux Esprits 2/2 ; en flashback, un marqueur +1/+1 sur chaque Esprit, puis exilée", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 9), hand: ["Antiquities on the Loose"] } });
      s = settle(cast(s, "p1", "Antiquities on the Loose"));
      const spirits = idsOf(s, "p1", "battlefield", "Spirit");
      expect(spirits).toHaveLength(2);
      const c = chars(s, spirits[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([2, 2, ["R", "W"]]);
      expect(spirits.map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
      const card = idOf(s, "p1", "graveyard", "Antiquities on the Loose");
      s = settle(act(s, "p1", { type: "cast", card }));
      const all = idsOf(s, "p1", "battlefield", "Spirit");
      expect(all).toHaveLength(4);
      expect(all.map((id) => s.objects[id]?.counters["+1/+1"])).toEqual([1, 1, 1, 1]);
      expect(exiled(s, "Antiquities on the Loose")).toHaveLength(1);
    });

    it("Dig Site Inventory : un marqueur +1/+1 et la vigilance jusqu'à la fin du tour ; flashback {W}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], hand: ["Dig Site Inventory"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dig Site Inventory", { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("vigilance");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Dig Site Inventory"), targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(exiled(s, "Dig Site Inventory")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("vigilance");
    });

    it("Harsh Annotation : détruit la créature ; son contrôleur crée un Inkling 1/1 blanc et noir volant", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Harsh Annotation", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      const inkling = idOf(s, "p2", "battlefield", "Inkling");
      const c = chars(s, inkling);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([1, 1, ["B", "W"], ["flying"]]);
      expect(idsOf(s, "p1", "battlefield", "Inkling")).toHaveLength(0);
    });

    it("Interjection : +2/+2 et l'initiative jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Interjection"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Interjection", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Rapier Wit : engage la créature et pioche ; un marqueur d'étourdissement seulement pendant votre tour", () => {
      const run = (active: "p1" | "p2") => {
        let s = scenario({
          active,
          p1: { battlefield: lands("Plains", 2), hand: ["Rapier Wit"], library: lands("Plains", 3) },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        if (active === "p2") s = act(s, "p2", { type: "pass" });
        s = settle(cast(s, "p1", "Rapier Wit", { t: [bear] }));
        return { tapped: s.objects[bear]?.tapped, stun: s.objects[bear]?.counters.stun ?? 0, hand: s.players.p1?.hand.length };
      };
      expect(run("p1")).toEqual({ tapped: true, stun: 1, hand: 1 });
      expect(run("p2")).toEqual({ tapped: true, stun: 0, hand: 1 });
    });

    it("Restoration Seminar : une carte de permanent non-terrain revient de votre cimetière ; le sort est exilé (Paradigme)", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Restoration Seminar"], graveyard: ["Serra Angel", "Plains"] },
      });
      const plains = idOf(s, "p1", "graveyard", "Plains");
      expect(() => cast(s, "p1", "Restoration Seminar", { t: [plains] })).toThrow();
      s = settle(cast(s, "p1", "Restoration Seminar", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Restoration Seminar")).toHaveLength(1);
    });

    it("Stand Up for Yourself : seulement une créature de force 3 ou plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Stand Up for Yourself"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Stand Up for Yourself", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      s = settle(cast(s, "p1", "Stand Up for Yourself", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Créatures préparées", () => {
    it("Elite Interceptor : arrive préparée ; Rejoinder engage une créature dégagée et fait piocher, puis elle est dé-préparée", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Elite Interceptor"], library: lands("Plains", 3) },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Elite Interceptor"));
      const interceptor = idOf(s, "p1", "battlefield", "Elite Interceptor");
      expect(s.objects[interceptor]?.preparedCopy).toBe(exiled(s, "Rejoinder")[0]);
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", "Rejoinder", { t: [bear] }), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[interceptor]?.preparedCopy).toBeUndefined();
    });

    it("Elite Interceptor : Rejoinder peut dégager une créature engagée", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Serra Angel", tapped: true }, ...lands("Plains", 3)],
          hand: ["Elite Interceptor"],
          library: lands("Plains", 3),
        },
      });
      s = settle(cast(s, "p1", "Elite Interceptor"));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(castPrepared(s, "p1", "Rejoinder", { t: [angel] }), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Emeritus of Truce : le joueur ciblé crée un Inkling ; préparée si un adversaire a plus de créatures ; Swords to Plowshares", () => {
      const run = (who: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Emeritus of Truce"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Emeritus of Truce"), pickIds(who));
        return s;
      };
      // L'Inkling chez l'adversaire : deux créatures contre une, l'Émérite devient préparée.
      let s = run("p2");
      expect(idsOf(s, "p2", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(s, "Swords to Plowshares")).toHaveLength(1);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castPrepared(s, "p1", "Swords to Plowshares", { t: [angel] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(24);
      expect(s.players.p1?.life).toBe(20);
      // L'Inkling chez vous : deux contre une, pas de préparation.
      const t = run("p1");
      expect(idsOf(t, "p1", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(t, "Swords to Plowshares")).toHaveLength(0);
    });

    it("Honorbound Page et Quill-Blade Laureate : Forum's Favor (+1/+0, vol) et Twofold Intent (+1/+0, double initiative)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 9)], hand: ["Honorbound Page", "Quill-Blade Laureate"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Honorbound Page"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Honorbound Page")).keywords).toContain("firstStrike");
      s = settle(castPrepared(s, "p1", "Forum's Favor", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("flying");
      s = settle(cast(s, "p1", "Quill-Blade Laureate"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Quill-Blade Laureate")).keywords).toContain("doubleStrike");
      s = settle(castPrepared(s, "p1", "Twofold Intent", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
    });

    it("Joined Researchers : à chaque étape de fin, préparée si un adversaire a plus de cartes en main ; Secret Rendezvous", () => {
      const run = (oppHand: number) =>
        advanceUntil(
          scenario({
            p1: { battlefield: ["Joined Researchers", ...lands("Plains", 3)], library: lands("Plains", 10) },
            p2: { hand: lands("Island", oppHand), library: lands("Island", 10) },
          }),
          (x) => x.turn.active === "p2",
        );
      expect(exiled(run(0), "Secret Rendezvous")).toHaveLength(0);
      let s = run(3);
      expect(exiled(s, "Secret Rendezvous")).toHaveLength(1);
      // Au tour suivant de p1, le sort préparé se lance (rituel) : chacun pioche trois cartes.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
      const [h1, h2] = [s.players.p1?.hand.length ?? 0, s.players.p2?.hand.length ?? 0];
      s = settle(castPrepared(s, "p1", "Secret Rendezvous", { t: ["p2"] }));
      expect(s.players.p1?.hand.length).toBe(h1 + 3);
      expect(s.players.p2?.hand.length).toBe(h2 + 3);
    });

    it("Spiritcall Enthusiast : des jetons arrivent sous votre contrôle → préparée ; Scrollboost : +2/+2 à une ou deux créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Spiritcall Enthusiast", "Bear Cub", ...lands("Plains", 6)], hand: ["Eager Glyphmage"] },
      });
      const enthusiast = idOf(s, "p1", "battlefield", "Spiritcall Enthusiast");
      expect(exiled(s, "Scrollboost")).toHaveLength(0);
      s = settle(cast(s, "p1", "Eager Glyphmage"));
      expect(exiled(s, "Scrollboost")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", "Scrollboost", { t: [bear, enthusiast] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(pt(s, enthusiast)).toEqual([5, 5]);
    });

    it("Spiritcall Enthusiast : un jeton adverse ne la prépare pas", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Spiritcall Enthusiast", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Harsh Annotation", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(s, "Scrollboost")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Spiritcall Enthusiast", ...lands("Plains", 2)], hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Harsh Annotation", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(exiled(t, "Scrollboost")).toHaveLength(0);
    });
  });

  describe("Repartee", () => {
    const strikeSetup = (permanent: string) =>
      scenario({
        p1: { battlefield: [permanent, "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    const strikes = (s: S) => idsOf(s, "p1", "hand", "Lightning Strike");

    it("Graduation Day : un sort qui cible une créature met un marqueur +1/+1 sur une créature ciblée que vous contrôlez", () => {
      let s = strikeSetup("Graduation Day");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: ["p2"] } }));
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: [angel] } }), pickIds(bear));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Informed Inkwright : un Inkling 1/1 volant", () => {
      let s = strikeSetup("Informed Inkwright");
      expect(chars(s, idOf(s, "p1", "battlefield", "Informed Inkwright")).keywords).toContain("vigilance");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Inkling")).toHaveLength(1);
    });

    it("Inkshape Demonstrator : garde {2} ; +1/+0 et le lien de vie jusqu'à la fin du tour", () => {
      let s = strikeSetup("Inkshape Demonstrator");
      const demo = idOf(s, "p1", "battlefield", "Inkshape Demonstrator");
      expect(chars(s, demo).keywords).toContain("ward");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(pt(s, demo)).toEqual([4, 4]);
      expect(chars(s, demo).keywords).toContain("lifelink");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, demo)).toEqual([3, 4]);
      expect(chars(s, demo).keywords).not.toContain("lifelink");
    });

    it("Rehearsed Debater : +1/+1 jusqu'à la fin du tour", () => {
      let s = strikeSetup("Rehearsed Debater");
      const debater = idOf(s, "p1", "battlefield", "Rehearsed Debater");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(pt(s, debater)).toEqual([4, 4]);
    });

    it("Stirring Hopesinger : un marqueur +1/+1 sur chaque créature que vous contrôlez, pas sur celles de l'adversaire", () => {
      let s = strikeSetup("Stirring Hopesinger");
      const hope = idOf(s, "p1", "battlefield", "Stirring Hopesinger");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: [angel] } }));
      expect(s.objects[hope]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      // Un sort qui ne cible qu'un joueur ne déclenche pas Repartee.
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: ["p2"] } }));
      expect(s.objects[hope]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Autres permanents", () => {
    it("Ascendant Dustspeaker : un marqueur +1/+1 sur une autre créature ; au début de votre combat, exile une carte d'un cimetière", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Ascendant Dustspeaker"] },
        p2: { graveyard: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ascendant Dustspeaker"));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ascendant Dustspeaker")]?.counters["+1/+1"] ?? 0).toBe(0);
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = advanceUntil(
        act(s, "p1", { type: "pass" }),
        (x) => x.pending?.kind === "choice" && x.pending.request.type === "pick" && x.pending.request.options.includes(angel),
      );
      s = settle(s, pickIds(angel));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });

    it("Eager Glyphmage : un Inkling 1/1 volant en arrivant", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Eager Glyphmage"] } });
      s = settle(cast(s, "p1", "Eager Glyphmage"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Inkling")).keywords).toContain("flying");
    });

    it("Ennis, Debate Moderator : exile une autre créature jusqu'à l'étape de fin ; un marqueur +1/+1 si des cartes ont été exilées", () => {
      const run = (exile: boolean) => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], hand: ["Ennis, Debate Moderator"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Ennis, Debate Moderator"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? (exile ? [bear] : []) : undefined,
        );
        const ennis = idOf(s, "p1", "battlefield", "Ennis, Debate Moderator");
        const mid = { bear: idsOf(s, "p1", "battlefield", "Bear Cub").length, exiled: exiled(s, "Bear Cub").length };
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return {
          mid,
          bear: idsOf(s, "p1", "battlefield", "Bear Cub").length,
          counters: s.objects[ennis]?.counters["+1/+1"] ?? 0,
        };
      };
      expect(run(true)).toEqual({ mid: { bear: 0, exiled: 1 }, bear: 1, counters: 1 });
      expect(run(false)).toEqual({ mid: { bear: 1, exiled: 0 }, bear: 1, counters: 0 });
    });

    it("Owlin Historian et Stone Docent : surveillance 1 ; exiler le Docent du cimetière (2 PV, surveillance 1) donne +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Owlin Historian"],
          graveyard: ["Stone Docent"],
          library: lands("Plains", 5),
        },
      });
      s = settle(cast(s, "p1", "Owlin Historian"), (req) => (req.type === "pick" ? [] : undefined));
      const owl = idOf(s, "p1", "battlefield", "Owlin Historian");
      expect(pt(s, owl)).toEqual([2, 3]);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Stone Docent")), (req) => (req.type === "pick" ? [] : undefined));
      expect(exiled(s, "Stone Docent")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
      expect(pt(s, owl)).toEqual([3, 4]);
    });

    it("Stone Docent : seulement en rituel", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], graveyard: ["Stone Docent"] } });
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      const docent = idOf(s, "p1", "graveyard", "Stone Docent");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === docent)).toBe(false);
    });

    it("Primary Research : renvoie une carte de permanent de VM 3 ou moins ; à votre étape de fin, piochez si une carte a quitté votre cimetière", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: lands("Plains", 5),
            hand: ["Primary Research"],
            graveyard: ["Bear Cub", "Serra Angel"],
            library: lands("Plains", 5),
          },
        });
      let s = setup();
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      // L'Ange (VM 5) n'est pas une cible possible : l'Ourson est la seule.
      s = settle(cast(s, "p1", "Primary Research"), (req) => {
        if (req.type === "pick") expect(req.options).not.toContain(angel);
        return undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Primary Research : sans carte sortie du cimetière, pas de pioche", () => {
      let s = scenario({ p1: { battlefield: ["Primary Research"], library: lands("Plains", 5) } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("Shattered Acolyte : lien de vie ; {1}, sacrifiez-la : détruit un artefact ou un enchantement", () => {
      let s = scenario({
        p1: { battlefield: ["Shattered Acolyte", "Plains"] },
        p2: { battlefield: ["Fishing Pole", "Graduation Day"] },
      });
      const acolyte = idOf(s, "p1", "battlefield", "Shattered Acolyte");
      expect(chars(s, acolyte).keywords).toContain("lifelink");
      s = settle(activate(s, "p1", acolyte, { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] }));
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Shattered Acolyte")).toHaveLength(1);
    });

    it("Summoned Dromedary : {1}{W} : revient du cimetière dans votre main", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 2), graveyard: ["Summoned Dromedary"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Summoned Dromedary")));
      expect(idsOf(s, "p1", "hand", "Summoned Dromedary")).toHaveLength(1);
    });
  });
});

describe("Secrets of Strixhaven, lot A — bleu", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes bleues : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (plan R, lot R7). Préparation (Campus Composer, Encouraging Aviator, Harmonized Trio, Jadzi, Skycoach
   * Conductor…), Opus (Deluge Virtuoso, Exhibition Tidecaller, Muse Seeker), Increment (Pensive Professor, Tester of the
   * Tangential, Textbook Tabulator), marqueurs d'étourdissement, réductions de coût et sorts à X.
   */
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const castExiled = (s: S, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, "p1", { type: "cast", card: exiled(s, name)[0] as string, targets, ...extra });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const setCounters = (s: S, id: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters["+1/+1"] = n;
  };

  it("Banishing Betrayal : renvoie un permanent non-terrain dans la main de son propriétaire, puis surveillance 1", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Banishing Betrayal"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Serra Angel", "Plains"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Banishing Betrayal", { t: [idOf(s, "p2", "battlefield", "Plains")] })).toThrow();
    s = settle(cast(s, "p1", "Banishing Betrayal", { t: [angel] }), (req, _p, cur) =>
      req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Opt") : undefined,
    );
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
  });

  it("Campus Composer : parade {2} ; arrive préparée, Aqueous Aria crée un Élémental 3/3 bleu et rouge volant", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 9), hand: ["Campus Composer"] } });
    s = settle(cast(s, "p1", "Campus Composer"));
    const composer = idOf(s, "p1", "battlefield", "Campus Composer");
    expect(chars(s, composer).keywords).toContain("ward");
    expect(exiled(s, "Aqueous Aria")).toHaveLength(1);
    s = settle(castExiled(s, "Aqueous Aria"));
    const elemental = idOf(s, "p1", "battlefield", "Elemental");
    expect(pt(s, elemental)).toEqual([3, 3]);
    expect([...chars(s, elemental).colors].sort()).toEqual(["R", "U"]);
    expect(chars(s, elemental).keywords).toContain("flying");
    expect(s.objects[composer]?.preparedCopy).toBeUndefined();
  });

  it("Chase Inspiration : une créature que vous contrôlez gagne +0/+3 et la défense talismanique jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Island"], hand: ["Chase Inspiration"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Chase Inspiration", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Chase Inspiration", { t: [bear] }));
    expect(pt(s, bear)).toEqual([2, 5]);
    expect(chars(s, bear).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  describe("Deluge Virtuoso", () => {
    it("en arrivant : engage une créature adverse et y met un marqueur d'étourdissement", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Deluge Virtuoso"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Deluge Virtuoso"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun).toBe(1);
      // Le marqueur d'étourdissement remplace le dégagement suivant.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun ?? 0).toBe(0);
    });

    it("Opus : +1/+1 ; cinq mana ou plus dépensés : +2/+2 à la place", () => {
      let s = scenario({
        p1: {
          battlefield: ["Deluge Virtuoso", ...lands("Island", 7)],
          hand: ["Opt", "Homesickness"],
          library: lands("Forest", 6),
        },
      });
      const v = idOf(s, "p1", "battlefield", "Deluge Virtuoso");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, v)).toEqual([3, 3]);
      s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [] }));
      expect(pt(s, v)).toEqual([5, 5]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, v)).toEqual([2, 2]);
    });
  });

  it("Divergent Equation : renvoie X cartes d'éphémère et de rituel du cimetière en main, puis s'exile", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Divergent Equation"], graveyard: ["Opt", "Boltwave", "Bear Cub"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    const bolt = idOf(s, "p1", "graveyard", "Boltwave");
    expect(() => cast(s, "p1", "Divergent Equation", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }, { x: 1 })).toThrow();
    s = settle(cast(s, "p1", "Divergent Equation", { t: [opt, bolt] }, { x: 2 }));
    expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Boltwave")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(exiled(s, "Divergent Equation")).toHaveLength(1);
  });

  it("Echocasting Symposium : le joueur ciblé crée un jeton copie d'une créature que vous contrôlez ; Paradigme", () => {
    let s = scenario({ p1: { battlefield: ["Serra Angel", ...lands("Island", 6)], hand: ["Echocasting Symposium"] } });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Echocasting Symposium", { p: ["p1"], c: [angel] }));
    const copies = idsOf(s, "p1", "battlefield", "Serra Angel").filter((id) => id !== angel);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(exiled(s, "Echocasting Symposium")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Serra Angel", ...lands("Island", 6)], hand: ["Echocasting Symposium"] } });
    t = settle(cast(t, "p1", "Echocasting Symposium", { p: ["p2"], c: [idOf(t, "p1", "battlefield", "Serra Angel")] }));
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Encouraging Aviator : en attaquant, devient préparée ; Jump donne le vol à une créature jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Encouraging Aviator", "Bear Cub", "Island"] } });
    const aviator = idOf(s, "p1", "battlefield", "Encouraging Aviator");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(exiled(s, "Jump")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: aviator, defender: "p2" }] }));
    expect(exiled(s, "Jump")).toHaveLength(1);
    expect(chars(s, bear).keywords).not.toContain("flying");
    s = settle(castExiled(s, "Jump", { t: [bear] }));
    expect(chars(s, bear).keywords).toContain("flying");
  });

  it("Exhibition Tidecaller : Opus, le joueur ciblé meule trois cartes ; dix si cinq mana ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Exhibition Tidecaller", ...lands("Island", 7)], hand: ["Opt", "Homesickness"] },
      p2: { library: lands("Forest", 20) },
    });
    const toP2: Answer = (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined);
    s = settle(cast(s, "p1", "Opt"), toP2);
    expect(s.players.p2?.graveyard).toHaveLength(3);
    s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [] }), toP2);
    expect(s.players.p2?.graveyard).toHaveLength(13);
  });

  describe("Flow State", () => {
    it("regarde trois cartes : une en main, les autres au-dessous", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flow State"], library: ["Opt", "Bear Cub", "Serra Angel", "Forest"] },
      });
      s = settle(cast(s, "p1", "Flow State"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });

    it("avec un éphémère et un rituel au cimetière : deux cartes en main à la place", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 2),
          hand: ["Flow State"],
          graveyard: ["Opt", "Boltwave"],
          library: ["Opt", "Bear Cub", "Serra Angel", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Flow State"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });
  });

  it("Fractal Anomaly : une Fractale 0/0 avec un marqueur +1/+1 par carte piochée ce tour-ci (0 : elle meurt)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Fractal Anomaly", "Opt"], library: lands("Forest", 5) } });
    s = settle(cast(s, "p1", "Opt"));
    s = settle(cast(s, "p1", "Fractal Anomaly"));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    expect(pt(s, fractal)).toEqual([1, 1]);
    expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);

    let t = scenario({ p1: { battlefield: ["Island"], hand: ["Fractal Anomaly"] } });
    t = settle(cast(t, "p1", "Fractal Anomaly"));
    expect(idsOf(t, "p1", "battlefield", "Fractal")).toHaveLength(0);
  });

  it("Fractalize : jusqu'à la fin du tour, la créature devient une Fractale verte et bleue de F/E de base X+1", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Fractalize"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Fractalize", { t: [angel] }, { x: 3 }));
    const c = chars(s, angel);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect([...c.colors].sort()).toEqual(["G", "U"]);
    expect(c.subtypes).toEqual(["Fractal"]);
    expect(c.keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, angel)).toEqual([4, 4]);
    expect(chars(s, angel).subtypes).toEqual(["Angel"]);
    expect(chars(s, angel).colors).toEqual(["W"]);
  });

  it("Harmonized Trio : {T} et engager deux créatures, devient préparée ; Brainstorm pioche trois et en remet deux", () => {
    let s = scenario({
      p1: {
        battlefield: ["Harmonized Trio", "Bear Cub", "Serra Angel", "Island"],
        hand: ["Opt"],
        library: ["Forest", "Plains", "Swamp", "Mountain"],
      },
    });
    const trio = idOf(s, "p1", "battlefield", "Harmonized Trio");
    expect(exiled(s, "Brainstorm")).toHaveLength(0);
    s = settle(activate(s, "p1", trio));
    expect(s.objects[trio]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    expect(exiled(s, "Brainstorm")).toHaveLength(1);
    s = settle(castExiled(s, "Brainstorm"), (req, _p, cur) =>
      req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Opt")
        ? req.options.filter((id) => ["Opt", "Forest"].includes(nameOf(cur, id) ?? ""))
        : undefined,
    );
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id)).sort()).toEqual(["Plains", "Swamp"]);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(
      (s.players.p1?.library ?? [])
        .slice(0, 2)
        .map((id) => nameOf(s, id))
        .sort(),
    ).toEqual(["Forest", "Opt"]);
  });

  it("Homesickness : le joueur ciblé pioche deux cartes ; jusqu'à deux créatures engagées avec un marqueur d'étourdissement", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Homesickness"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [bear, angel] }));
    expect(s.players.p1?.hand).toHaveLength(2);
    for (const id of [bear, angel]) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Hydro-Channeler : son mana ne sert qu'aux éphémères et rituels ; {1}, {T} : un mana de n'importe quelle couleur", () => {
    const s = scenario({ p1: { battlefield: ["Hydro-Channeler", "Forest"], hand: ["Opt", "Boltwave"] } });
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Opt"))).not.toHaveLength(0);
    // Le Boltwave ({R}) : la seconde capacité, {1} payé par la Forêt, donne {R}.
    let r = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hydro-Channeler")), (req) =>
      req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
    );
    r = settle(cast(r, "p1", "Boltwave"));
    expect(r.players.p2?.life).toBe(17);
    // Son mana ne paie pas un sort de créature.
    const t = scenario({ p1: { battlefield: ["Hydro-Channeler", "Forest"], hand: ["Bear Cub"] } });
    expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toHaveLength(0);
  });

  describe("Jadzi, Steward of Fate", () => {
    it("en arrivant : piochez deux cartes, puis défaussez-en deux ; arrive préparée", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Jadzi, Steward of Fate"], library: lands("Forest", 4) },
      });
      s = settle(cast(s, "p1", "Jadzi, Steward of Fate"));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(exiled(s, "Oracle's Gift")).toHaveLength(1);
    });

    it("Oracle's Gift : X Fractales, puis X marqueurs +1/+1 sur chaque Fractale que vous contrôlez", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 10),
          hand: ["Opt", "Fractal Anomaly", "Jadzi, Steward of Fate"],
          library: lands("Forest", 6),
        },
      });
      // Une Fractale 1/1 déjà présente (une carte piochée par Opt).
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Fractal Anomaly"));
      const first = idOf(s, "p1", "battlefield", "Fractal");
      s = settle(cast(s, "p1", "Jadzi, Steward of Fate"));
      s = settle(castExiled(s, "Oracle's Gift", undefined, { x: 2 }));
      const fractals = idsOf(s, "p1", "battlefield", "Fractal");
      expect(fractals).toHaveLength(3);
      expect(pt(s, first)).toEqual([3, 3]);
      for (const id of fractals.filter((x) => x !== first)) expect(pt(s, id)).toEqual([2, 2]);
    });
  });

  it("Landscape Painter : arrive préparée ; Vibrant Idea pioche deux cartes", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Landscape Painter"], library: lands("Forest", 4) } });
    s = settle(cast(s, "p1", "Landscape Painter"));
    s = settle(castExiled(s, "Vibrant Idea"));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Mathemagics : le joueur ciblé pioche 2^X cartes", () => {
    const run = (x: number) => {
      let s = scenario({ p1: { battlefield: lands("Island", 8), hand: ["Mathemagics"], library: lands("Forest", 20) } });
      s = settle(cast(s, "p1", "Mathemagics", { p: ["p1"] }, { x }));
      return s.players.p1?.hand.length;
    };
    expect(run(0)).toBe(1);
    expect(run(1)).toBe(2);
    expect(run(3)).toBe(8);
  });

  /** Défausse une autre carte que Homesickness. */
  const keepHomesickness: Answer = (req, _p, cur) =>
    req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Homesickness")
      ? req.options.filter((id) => nameOf(cur, id) !== "Homesickness").slice(0, 1)
      : undefined;

  it("Muse Seeker : Opus, piochez puis défaussez ; pas de défausse si cinq mana ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Muse Seeker", ...lands("Island", 7)], hand: ["Opt", "Homesickness"], library: lands("Forest", 10) },
    });
    s = settle(cast(s, "p1", "Opt"), keepHomesickness);
    // Opt pioche une carte, Muse Seeker en pioche une et en défausse une : Homesickness + une carte.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    s = settle(cast(s, "p1", "Homesickness", { p: ["p2"], c: [] }));
    // Homesickness (six mana) : Muse Seeker pioche sans défausser.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Muse's Encouragement : un Élémental 3/3 volant, puis surveillance 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Muse's Encouragement"], library: ["Opt", "Opt", "Forest"] },
    });
    s = settle(cast(s, "p1", "Muse's Encouragement"), (req) => (req.type === "pick" ? req.options : undefined));
    expect(idsOf(s, "p1", "battlefield", "Elemental")).toHaveLength(1);
    expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(2);
  });

  it("Orysa, Tide Choreographer : coûte {3} de moins avec une endurance totale de 10 ou plus ; pioche deux cartes en arrivant", () => {
    const wall = customCard({ name: "Mur d'essai", power: 0, toughness: 10 });
    const s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Orysa, Tide Choreographer"] } });
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Orysa, Tide Choreographer"))).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: [wall, ...lands("Island", 2)], hand: ["Orysa, Tide Choreographer"], library: lands("Forest", 3) },
    });
    t = settle(cast(t, "p1", "Orysa, Tide Choreographer"));
    expect(idsOf(t, "p1", "battlefield", "Orysa, Tide Choreographer")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(2);
  });

  it("Pensive Professor : Increment, puis chaque marqueur +1/+1 mis sur elle fait piocher une carte", () => {
    let s = scenario({
      p1: { battlefield: ["Pensive Professor", ...lands("Island", 2)], hand: ["Opt", "Opt"], library: lands("Forest", 5) },
    });
    const prof = idOf(s, "p1", "battlefield", "Pensive Professor");
    s = settle(cast(s, "p1", "Opt"));
    // 1 mana > force 0 : un marqueur, et une carte piochée (plus celle d'Opt).
    expect(s.objects[prof]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(3);
    // 1 mana n'est supérieur ni à la force (1) ni à l'endurance (3) : rien.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[prof]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Procrastinate : engage la créature ciblée et y met deux fois X marqueurs d'étourdissement", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Procrastinate"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Procrastinate", { t: [angel] }, { x: 2 }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(4);
  });

  describe("Run Behind", () => {
    it("le propriétaire met la créature au-dessus ou au-dessous de sa bibliothèque", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Run Behind"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Run Behind", { t: [angel] }), (req, player) =>
        req.type === "pick" && player === "p2" ? ["top"] : undefined,
      );
      expect(nameOf(s, s.players.p2?.library[0] as string)).toBe("Serra Angel");
    });

    it("coûte {1} de moins s'il cible une créature attaquante", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Run Behind"] },
        p2: { battlefield: ["Serra Angel"] },
        active: "p2",
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Run Behind", { t: [angel] })).toThrow();
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Run Behind", { t: [angel] }), (req) => (req.type === "pick" ? ["bottom"] : undefined));
      expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe("Serra Angel");
    });
  });

  it("Skycoach Conductor : All Aboard exile une créature non-Pilote que vous contrôlez et la renvoie", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 4)], hand: ["Skycoach Conductor"] },
    });
    s = settle(cast(s, "p1", "Skycoach Conductor"));
    const conductor = idOf(s, "p1", "battlefield", "Skycoach Conductor");
    expect(chars(s, conductor).keywords).toEqual(expect.arrayContaining(["flash", "flying", "vigilance"]));
    expect(() => castExiled(s, "All Aboard", { t: [conductor] })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castExiled(s, "All Aboard", { t: [bear] }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(bear);
    expect(s.objects[back]?.tapped).toBe(false);
  });

  it("Spellbook Seeker : arrive préparée ; Careful Study pioche deux cartes puis en défausse deux", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Spellbook Seeker"], library: lands("Forest", 4) } });
    s = settle(cast(s, "p1", "Spellbook Seeker"));
    s = settle(castExiled(s, "Careful Study"));
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Tester of the Tangential : au début du combat, payez {X} pour déplacer X marqueurs +1/+1 sur une autre créature", () => {
    let s = scenario({ p1: { battlefield: ["Tester of the Tangential", "Bear Cub", ...lands("Island", 2)] } });
    const tester = idOf(s, "p1", "battlefield", "Tester of the Tangential");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    setCounters(s, tester, 3);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, (req) =>
      req.type === "number" ? [2] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
    );
    expect(s.objects[tester]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Textbook Tabulator : surveillance 2 en arrivant ; Increment selon le mana dépensé", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Textbook Tabulator", "Opt", "Homesickness"], library: lands("Forest", 6) },
    });
    s = settle(cast(s, "p1", "Textbook Tabulator"), (req) => (req.type === "pick" ? req.options : undefined));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    const tab = idOf(s, "p1", "battlefield", "Textbook Tabulator");
    // 1 mana > force 0 : un marqueur.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[tab]?.counters["+1/+1"]).toBe(1);
  });

  it("Wisdom of Ages : toutes les cartes d'éphémère et de rituel du cimetière reviennent en main ; plus de main maximale", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 7),
        hand: ["Wisdom of Ages", ...lands("Forest", 6)],
        graveyard: ["Opt", "Boltwave", "Lightning Strike", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Wisdom of Ages"));
    expect(s.players.p1?.hand).toHaveLength(9);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(exiled(s, "Wisdom of Ages")).toHaveLength(1);
    // Fin du tour : pas de défausse à sept cartes, ni ce tour-ci ni plus tard.
    s = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "discard");
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.players.p1?.hand).toHaveLength(9);
  });
});

describe("Secrets of Strixhaven, lot A — noir", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes noires : chaque carte gérée est confrontée à son texte Oracle (plan R, lot R7).
   * Préparation (Adventurous Eater, Cheerful Osteomancer, Emeritus of Woe, Grave Researcher, Leech Collector, Scathing
   * Shadelock, Scheming Silvertongue), Repartee, Infusion, convergence et sorts de la couleur.
   */
  type S = GameState;
  /** Lance la copie du sort préparé de `source` (elle attend en exil). */
  const castPrepared = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const copy = s.objects[source]?.preparedCopy;
    if (!copy) throw new Error("créature non préparée");
    return act(s, player, { type: "cast", card: copy, targets });
  };
  const prepared = (s: S, id: string) => !!s.objects[id]?.preparedCopy;
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  /** Witherbloom Charm, mode « gagnez 5 PV » ({B}{G}) : de quoi remplir l'Infusion. */
  const gainFive = (s: S) => settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));

  describe("Préparation", () => {
    it("Adventurous Eater arrive préparée : Have a Bite met un marqueur +1/+1 et fait gagner 1 PV", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Adventurous Eater"] } });
      s = settle(cast(s, "p1", "Adventurous Eater"));
      const eater = idOf(s, "p1", "battlefield", "Adventurous Eater");
      expect(prepared(s, eater)).toBe(true);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", eater, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(21);
      expect(prepared(s, eater)).toBe(false);
    });

    it("Cheerful Osteomancer : Raise Dead renvoie une carte de créature de votre cimetière dans votre main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Cheerful Osteomancer"], graveyard: ["Bear Cub", "Opt"] },
      });
      s = settle(cast(s, "p1", "Cheerful Osteomancer"));
      const osteo = idOf(s, "p1", "battlefield", "Cheerful Osteomancer");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      expect(() => castPrepared(s, "p1", osteo, { t: [idOf(s, "p1", "graveyard", "Opt")] })).toThrow();
      s = settle(castPrepared(s, "p1", osteo, { t: [bear] }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });

    it("Emeritus of Woe : Demonic Tutor met une carte de la bibliothèque dans votre main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Emeritus of Woe"], library: [...lands("Forest", 4), "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Emeritus of Woe"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Woe");
      expect(exiled(s, "Demonic Tutor")).toHaveLength(1);
      s = settle(castPrepared(s, "p1", emeritus), (req) =>
        req.type === "pick" ? req.options.filter((o) => nameOf(s, String(o)) === "Serra Angel") : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(4);
      expect(prepared(s, emeritus)).toBe(false);
    });

    it("Emeritus of Woe redevient préparée à votre étape de fin si deux créatures sont mortes ce tour-ci, pas une seule", () => {
      const run = (bears: number) => {
        let s = scenario({
          p1: { battlefield: ["Emeritus of Woe", ...lands("Swamp", 3)], hand: ["Withering Curse"] },
          p2: { battlefield: lands("Bear Cub", bears) },
        });
        const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Woe");
        expect(prepared(s, emeritus)).toBe(false);
        s = settle(cast(s, "p1", "Withering Curse"));
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return prepared(s, emeritus);
      };
      expect(run(2)).toBe(true);
      expect(run(1)).toBe(false);
    });

    it("Grave Researcher : à votre entretien, surveillance 1, puis préparée avec trois cartes de créature au cimetière", () => {
      const run = (creatures: number) => {
        let s = scenario({
          active: "p2",
          step: "main2",
          p1: { battlefield: ["Grave Researcher"], graveyard: lands("Bear Cub", creatures), library: lands("Island", 5) },
        });
        const researcher = idOf(s, "p1", "battlefield", "Grave Researcher");
        // La surveillance met la carte du dessus (un terrain) au cimetière : elle ne compte pas.
        s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "surveilGraveyard", 300);
        s = settle(s, (req) => (req.type === "pick" ? req.options : undefined));
        return { s, researcher };
      };
      const { s, researcher } = run(3);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(prepared(s, researcher)).toBe(true);
      const t = run(2);
      expect(prepared(t.s, t.researcher)).toBe(false);
    });

    it("Grave Researcher : Reanimate met une créature d'un cimetière adverse sous votre contrôle, et vous perdez sa VM en PV", () => {
      let s = scenario({
        active: "p2",
        step: "main2",
        p1: { battlefield: ["Grave Researcher", "Swamp"], graveyard: lands("Bear Cub", 3), library: lands("Island", 5) },
        p2: { graveyard: ["Serra Angel"] },
      });
      const researcher = idOf(s, "p1", "battlefield", "Grave Researcher");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1", 300);
      expect(prepared(s, researcher)).toBe(true);
      const angel = s.players.p2?.graveyard[0] as string;
      s = settle(castPrepared(s, "p1", researcher, { t: [angel] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.players.p1?.life).toBe(15);
    });

    it("Leech Collector devient préparée la première fois que vous gagnez des PV ; Bloodletting : chaque adversaire perd 2 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Leech Collector", "Swamp", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
      });
      const leech = idOf(s, "p1", "battlefield", "Leech Collector");
      expect(prepared(s, leech)).toBe(false);
      s = gainFive(s);
      expect(prepared(s, leech)).toBe(true);
      s = settle(castPrepared(s, "p1", leech));
      expect(s.players.p2?.life).toBe(18);
      expect(prepared(s, leech)).toBe(false);
    });

    it("Scathing Shadelock devient préparée au début de votre première phase principale ; Venomous Words : +2/+0 et contact mortel", () => {
      let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Scathing Shadelock", "Swamp", "Bear Cub"] } });
      const shadelock = idOf(s, "p1", "battlefield", "Scathing Shadelock");
      expect(prepared(s, shadelock)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1", 300);
      s = settle(s);
      expect(prepared(s, shadelock)).toBe(true);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", shadelock, { t: [bear] }));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("deathtouch");
    });

    it("Scheming Silvertongue : préparée au début de votre seconde phase principale si vous avez gagné 2 PV ou plus ; Sign in Blood", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Scheming Silvertongue", ...lands("Swamp", 3), "Forest"],
            hand: ["Witherbloom Charm"],
            library: lands("Island", 5),
          },
        });
        if (gain) s = gainFive(s);
        s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority" && x.triggers.length === 0);
        s = settle(s);
        return { s, silver: idOf(s, "p1", "battlefield", "Scheming Silvertongue") };
      };
      const { s: base, silver } = run(true);
      const c = chars(base, silver);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(prepared(base, silver)).toBe(true);
      const s = settle(castPrepared(base, "p1", silver, { t: ["p1"] }));
      // Le Charme a quitté la main : les deux cartes piochées.
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(23);
      const t = run(false);
      expect(prepared(t.s, t.silver)).toBe(false);
    });
  });

  describe("Repartee", () => {
    it("Lecturing Scornmage : un marqueur +1/+1 si l'éphémère cible une créature, pas s'il cible un joueur", () => {
      let s = scenario({
        p1: { battlefield: ["Lecturing Scornmage", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mage = idOf(s, "p1", "battlefield", "Lecturing Scornmage");
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.objects[mage]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.objects[mage]?.counters["+1/+1"]).toBe(1);
    });

    it("Melancholic Poet : chaque adversaire perd 1 PV et vous gagnez 1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Melancholic Poet", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Forum Necroscribe : garde (défausser une carte) ; renvoie une carte de créature de votre cimetière sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forum Necroscribe", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          graveyard: ["Serra Angel"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forum Necroscribe")).keywords).toContain("ward");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(0);
    });
  });

  describe("Infusion", () => {
    it("Foolish Fate détruit la créature ; si vous avez gagné des PV, son contrôleur perd 3 PV", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Foolish Fate", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Foolish Fate", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        return s.players.p2?.life;
      };
      expect(run(false)).toBe(20);
      expect(run(true)).toBe(17);
    });

    it("Poisoner's Apprentice : -4/-4 sur une créature adverse en arrivant, seulement si vous avez gagné des PV", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Poisoner's Apprentice", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Poisoner's Apprentice"));
        return idsOf(s, "p2", "battlefield", "Serra Angel").length;
      };
      expect(run(false)).toBe(1);
      expect(run(true)).toBe(0);
    });

    it("Ulna Alley Shopkeep : menace ; +2/+0 tant que vous avez gagné des PV ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Ulna Alley Shopkeep", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
      });
      const shop = idOf(s, "p1", "battlefield", "Ulna Alley Shopkeep");
      expect(chars(s, shop).keywords).toContain("menace");
      expect([chars(s, shop).power, chars(s, shop).toughness]).toEqual([2, 3]);
      s = gainFive(s);
      expect([chars(s, shop).power, chars(s, shop).toughness]).toEqual([4, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, shop).power).toBe(2);
    });

    it("Tragedy Feaster : à votre étape de fin, sacrifiez un permanent, sauf si vous avez gagné des PV", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Tragedy Feaster", "Swamp", "Forest", "Bear Cub"], hand: ["Witherbloom Charm"] },
        });
        const feaster = idOf(s, "p1", "battlefield", "Tragedy Feaster");
        expect(chars(s, feaster).keywords).toEqual(expect.arrayContaining(["trample", "ward"]));
        if (gain) s = gainFive(s);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return s.battlefield.filter((id) => s.objects[id]?.controller === "p1").length;
      };
      expect(run(false)).toBe(3);
      expect(run(true)).toBe(4);
    });

    it("Withering Curse : -2/-2 à toutes les créatures ; avec l'Infusion, détruit toutes les créatures à la place", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Withering Curse", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Withering Curse"));
        return s;
      };
      const s = run(false);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
      const t = run(true);
      expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    });
  });

  describe("Autres cartes", () => {
    it("Arcane Omens (convergence) : le joueur ciblé défausse autant de cartes que de couleurs de mana dépensées", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Island", "Mountain"], hand: ["Arcane Omens"] },
        p2: { hand: lands("Plains", 5) },
      });
      s = settle(cast(s, "p1", "Arcane Omens", { t: ["p2"] }));
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.players.p2?.graveyard).toHaveLength(3);
    });

    it("Arnyn : une créature que vous contrôlez de force ou d'endurance 1 ou moins meurt : un adversaire perd 2 PV, vous gagnez 2 PV", () => {
      let s = scenario({
        p1: {
          battlefield: ["Arnyn, Deathbloom Botanist", "Burrog Banemaker", "Bear Cub", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Arnyn, Deathbloom Botanist")).keywords).toContain("deathtouch");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Burrog Banemaker")] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Burrog Banemaker : contact mortel ; {1}{B} : +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Burrog Banemaker", "Swamp", "Swamp"] } });
      const frog = idOf(s, "p1", "battlefield", "Burrog Banemaker");
      expect(chars(s, frog).keywords).toContain("deathtouch");
      s = settle(activate(s, "p1", frog));
      expect([chars(s, frog).power, chars(s, frog).toughness]).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, frog).power).toBe(1);
    });

    it("Cost of Brilliance : le joueur ciblé pioche deux cartes et perd 2 PV ; un marqueur +1/+1 sur jusqu'à une créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Cost of Brilliance"] },
        p2: { library: lands("Island", 5) },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cost of Brilliance", { p: ["p2"], c: [bear] }));
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("End of the Hunt : l'adversaire exile sa créature ou son planeswalker de plus grande valeur de mana", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["End of the Hunt"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "End of the Hunt", { t: ["p2"] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Eternal Student : {1}{B}, exilez-la de votre cimetière : deux Inklings 1/1 blancs et noirs volants", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Eternal Student"] } });
      const student = idOf(s, "p1", "graveyard", "Eternal Student");
      s = settle(activate(s, "p1", student));
      const inklings = idsOf(s, "p1", "battlefield", "Inkling");
      expect(inklings).toHaveLength(2);
      const c = chars(s, inklings[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([1, 1, ["B", "W"], ["flying"]]);
      expect(exiled(s, "Eternal Student")).toHaveLength(1);
    });

    it("Masterful Flourish : +1/+0 et indestructible jusqu'à la fin du tour, seulement sur votre créature", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Masterful Flourish"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(() => cast(s, "p1", "Masterful Flourish", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Masterful Flourish", { t: [bear] }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
    });

    it("Postmortem Professor : ne peut pas bloquer ; en attaquant, draine 1 ; revient du cimetière en exilant un éphémère ou un rituel", () => {
      let s = scenario({ p1: { battlefield: ["Postmortem Professor"] } });
      const prof = idOf(s, "p1", "battlefield", "Postmortem Professor");
      expect(chars(s, prof).keywords).toContain("cantBlock");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: prof, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);

      let t = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Postmortem Professor", "Bear Cub"] } });
      const card = idOf(t, "p1", "graveyard", "Postmortem Professor");
      expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === card)).toBe(false);
      t = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Postmortem Professor", "Opt"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "graveyard", "Postmortem Professor")));
      expect(idsOf(t, "p1", "battlefield", "Postmortem Professor")).toHaveLength(1);
      expect(exiled(t, "Opt")).toHaveLength(1);
    });

    it("Pull from the Grave : jusqu'à deux cartes de créature de votre cimetière en main, et vous gagnez 2 PV", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Pull from the Grave"], graveyard: ["Bear Cub", "Serra Angel", "Opt"] },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")];
      s = settle(cast(s, "p1", "Pull from the Grave", { t: targets }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Rabid Attack : vos créatures ciblées gagnent +1/+0 et « quand elle meurt, piochez une carte »", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Serra Angel", "Swamp", "Swamp", "Mountain", "Mountain"],
          hand: ["Rabid Attack", "Lightning Strike"],
          library: lands("Island", 5),
        },
      });
      const [bear, angel] = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Rabid Attack", { t: [bear, angel] }));
      expect([chars(s, bear).power, chars(s, angel).power]).toEqual([3, 5]);
      expect(chars(s, bear).toughness).toBe(2);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Send in the Pest : chaque adversaire défausse une carte, et vous créez un Nuisible", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Send in the Pest"] }, p2: { hand: ["Opt", "Opt"] } });
      s = settle(cast(s, "p1", "Send in the Pest"));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
    });

    it("Sneering Shadewriter : vol ; en arrivant, chaque adversaire perd 2 PV et vous gagnez 2 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Sneering Shadewriter"] } });
      s = settle(cast(s, "p1", "Sneering Shadewriter"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Sneering Shadewriter")).keywords).toContain("flying");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Wander Off exile la créature ciblée", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wander Off"] }, p2: { battlefield: ["Serra Angel"] } });
      s = settle(cast(s, "p1", "Wander Off", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });
  });
});

describe("Secrets of Strixhaven, lot A — rouge", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes rouges : chaque carte est confrontée à son texte Oracle (plan R, lot R7).
   * Préparation (Blazing Firesinger, Goblin Glasswright, Maelstrom Artisan, Pigment Wrangler, Strife Scholar, Emeritus of
   * Conflict), Opus (Expressive Firedancer, Molten-Core Maestro, Tackle Artist, Thunderdrum Soloist), convergence
   * (Archaic's Agony), Paradigme (Improvisation Capstone), cartes qui quittent le cimetière (Garrison Excavator, Living
   * History), copies (Mica), sorts de blessures et de pioche.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  /** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Lance le sort préparé de la créature (sa copie en exil). */
  const castPrepared = (s: S, spellName: string, targets?: Record<string, string[]>) => {
    const copy = exiled(s, spellName)[0];
    if (!copy) throw new Error(`${spellName} n'est pas en exil`);
    return act(s, "p1", { type: "cast", card: copy, targets });
  };

  describe("Ancestral Anger", () => {
    it("piétinement et +X/+0, X = 1 plus les Ancestral Anger de votre cimetière ; piochez une carte", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Mountain", "Mountain"],
          hand: ["Ancestral Anger", "Ancestral Anger"],
          graveyard: ["Ancestral Anger", "Ancestral Anger"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const [first, second] = idsOf(s, "p1", "hand", "Ancestral Anger") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: [bear] } }));
      // Deux exemplaires au cimetière pendant la résolution (le sort lui-même est sur la pile) : +3/+0.
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(act(s, "p1", { type: "cast", card: second, targets: { t: [bear] } }));
      // Trois au cimetière cette fois : +4/+0 de plus.
      expect(pt(s, bear)).toEqual([9, 2]);
    });
  });

  describe("Archaic's Agony", () => {
    it("convergence : X blessures (cinq couleurs) ; l'excès exile autant de cartes, jouables jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
          hand: ["Archaic's Agony"],
          library: ["Forest", "Island", "Swamp", "Plains"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Archaic's Agony", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      // 5 blessures à une 2/2 : 3 en excès, trois cartes exilées.
      expect(s.players.p1?.library).toHaveLength(1);
      expect(s.exile).toHaveLength(3);
      const forest = exiled(s, "Forest")[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(2);
      expect(exiled(s, "Forest")).toHaveLength(0);
    });

    it("une seule couleur dépensée : 1 blessure, aucun excès, rien n'est exilé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Archaic's Agony"], library: lands("Forest", 4) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Archaic's Agony", { t: [bear] }));
      expect(s.objects[bear]?.damage).toBe(1);
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(4);
    });
  });

  describe("Artistic Process", () => {
    const run = (mode: number, targets?: (s: S) => Record<string, string[]>) => {
      const s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 5)], hand: ["Artistic Process"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      return settle(cast(s, "p1", "Artistic Process", targets?.(s), { mode }));
    };

    it("6 blessures à une créature ciblée", () => {
      const s = run(0, (x: S) => ({ t: [idOf(x, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("2 blessures à chaque créature que vous ne contrôlez pas", () => {
      const s = run(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.damage).toBe(0);
    });

    it("un Élémental 3/3 bleu et rouge volant, avec la célérité jusqu'à la fin du tour", () => {
      let s = run(2);
      const token = idOf(s, "p1", "battlefield", "Elemental");
      const c = chars(s, token);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([3, 3, ["R", "U"]]);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, token).keywords).not.toContain("haste");
    });
  });

  describe("Préparation", () => {
    it("Blazing Firesinger : arrive préparée ; Seething Song ajoute {R}{R}{R}{R}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Blazing Firesinger", "Artistic Process"] } });
      s = settle(cast(s, "p1", "Blazing Firesinger"));
      const singer = idOf(s, "p1", "battlefield", "Blazing Firesinger");
      expect(s.objects[singer]?.preparedCopy).toBe(exiled(s, "Seething Song")[0]);
      s = settle(castPrepared(s, "Seething Song"));
      expect(s.players.p1?.manaPool.R).toBe(5);
      expect(s.objects[singer]?.preparedCopy).toBeUndefined();
      // Le mana sert à lancer un sort à cinq mana sans autre terrain.
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Elemental")).toHaveLength(1);
    });

    it("Goblin Glasswright : Craft with Pride crée un Trésor", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Goblin Glasswright"] } });
      s = settle(cast(s, "p1", "Goblin Glasswright"));
      s = settle(castPrepared(s, "Craft with Pride"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Maelstrom Artisan : célérité ; Rocket Volley détruit un terrain non-base, pas un terrain de base", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Maelstrom Artisan"] },
        p2: { battlefield: ["Sundown Pass", "Plains"] },
      });
      s = settle(cast(s, "p1", "Maelstrom Artisan"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Maelstrom Artisan")).keywords).toContain("haste");
      expect(() => castPrepared(s, "Rocket Volley", { t: [idOf(s, "p2", "battlefield", "Plains")] })).toThrow();
      s = settle(castPrepared(s, "Rocket Volley", { t: [idOf(s, "p2", "battlefield", "Sundown Pass")] }));
      expect(idsOf(s, "p2", "graveyard", "Sundown Pass")).toHaveLength(1);
    });

    it("Strife Scholar : garde ; Awaken the Ages crée deux Esprits 2/2 rouges et blancs", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 9), hand: ["Strife Scholar"] } });
      s = settle(cast(s, "p1", "Strife Scholar"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Strife Scholar")).keywords).toContain("ward");
      s = settle(castPrepared(s, "Awaken the Ages"));
      const spirits = idsOf(s, "p1", "battlefield", "Spirit");
      expect(spirits).toHaveLength(2);
      const c = chars(s, spirits[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([2, 2, ["R", "W"]]);
    });

    it("Pigment Wrangler : vol ; Striking Palette copie le prochain éphémère ou rituel lancé ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 10), hand: ["Pigment Wrangler", "Lightning Strike", "Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Pigment Wrangler"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Pigment Wrangler")).keywords).toContain("flying");
      s = settle(castPrepared(s, "Striking Palette"));
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      // Le sort et sa copie : 6 blessures.
      expect(s.players.p2?.life).toBe(14);
      // Une seule fois : le second Lightning Strike n'est pas copié.
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(11);
    });

    it("Emeritus of Conflict : initiative ; votre troisième sort du tour la prépare, Lightning Bolt inflige 3 blessures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Emeritus of Conflict", ...lands("Island", 3), "Mountain"],
          hand: ["Opt", "Opt", "Opt"],
          library: lands("Forest", 5),
        },
      });
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Conflict");
      expect(chars(s, emeritus).keywords).toContain("firstStrike");
      for (let i = 0; i < 2; i++) s = settle(cast(s, "p1", "Opt"));
      expect(exiled(s, "Lightning Bolt")).toHaveLength(0);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Lightning Bolt")[0]);
      s = settle(castPrepared(s, "Lightning Bolt", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
    });
  });

  describe("Opus", () => {
    it("Expressive Firedancer : +1/+1 ; cinq mana ou plus : la double initiative aussi", () => {
      let s = scenario({
        p1: {
          battlefield: ["Expressive Firedancer", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      const dancer = idOf(s, "p1", "battlefield", "Expressive Firedancer");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, dancer)).toEqual([3, 3]);
      expect(chars(s, dancer).keywords).not.toContain("doubleStrike");
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(pt(s, dancer)).toEqual([4, 4]);
      expect(chars(s, dancer).keywords).toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, dancer)).toEqual([2, 2]);
      expect(chars(s, dancer).keywords).not.toContain("doubleStrike");
    });

    it("Molten-Core Maestro : un marqueur +1/+1 ; cinq mana ou plus : autant de {R} que sa force", () => {
      let s = scenario({
        p1: {
          battlefield: ["Molten-Core Maestro", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      const maestro = idOf(s, "p1", "battlefield", "Molten-Core Maestro");
      expect(chars(s, maestro).keywords).toContain("menace");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[maestro]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.manaPool.R ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(s.objects[maestro]?.counters["+1/+1"]).toBe(2);
      // Force 4 après le second marqueur.
      expect(s.players.p1?.manaPool.R).toBe(4);
    });

    it("Tackle Artist : un marqueur +1/+1, deux si cinq mana ou plus ; un sort de créature ne compte pas", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tackle Artist", "Island", "Forest", ...lands("Mountain", 6)],
          hand: ["Opt", "Artistic Process", "Bear Cub"],
          library: lands("Forest", 3),
        },
      });
      const artist = idOf(s, "p1", "battlefield", "Tackle Artist");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(3);
    });

    it("Thunderdrum Soloist : 1 blessure à chaque adversaire, 3 à la place si cinq mana ou plus", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: ["Thunderdrum Soloist", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Thunderdrum Soloist")).keywords).toContain("reach");
      s = settle(cast(s, "p1", "Opt"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 16, 16]);
    });
  });

  describe("Cartes qui quittent votre cimetière", () => {
    it("Garrison Excavator : un Esprit 2/2 quand des cartes quittent votre cimetière (flashback de Duel Tactics)", () => {
      let s = scenario({
        p1: { battlefield: ["Garrison Excavator", ...lands("Mountain", 2)], graveyard: ["Duel Tactics"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Garrison Excavator")).keywords).toContain("menace");
      const tactics = idOf(s, "p1", "graveyard", "Duel Tactics");
      s = settle(act(s, "p1", { type: "cast", card: tactics, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
      expect(exiled(s, "Duel Tactics")).toHaveLength(1);
    });

    it("Living History : un Esprit en arrivant ; vous attaquez après qu'une carte a quitté votre cimetière : +2/+0 à un attaquant", () => {
      const run = (leave: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Mountain", 4)],
            hand: ["Living History"],
            graveyard: ["Duel Tactics"],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Living History"));
        expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
        if (leave) {
          const tactics = idOf(s, "p1", "graveyard", "Duel Tactics");
          s = settle(
            act(s, "p1", { type: "cast", card: tactics, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
          );
        }
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step === "declareAttackers");
        return pt(s, bear);
      };
      expect(run(true)).toEqual([4, 2]);
      expect(run(false)).toEqual([2, 2]);
    });

    it("Zealous Lorecaster : renvoie une carte d'éphémère ou de rituel de votre cimetière en main (pas une créature)", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Zealous Lorecaster"], graveyard: ["Lightning Strike", "Bear Cub"] },
      });
      s = cast(s, "p1", "Zealous Lorecaster");
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.triggers.length > 0 || x.stack.length === 0);
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        expect(req.options).not.toContain(idOf(s, "p1", "graveyard", "Bear Cub"));
        return [idOf(s, "p1", "graveyard", "Lightning Strike")];
      });
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Mica, Reader of Ruins", () => {
    it("garde ; vous pouvez sacrifier un artefact : si vous le faites, le sort d'éphémère ou de rituel est copié", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Mica, Reader of Ruins", "Tablet of Discovery", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Mica, Reader of Ruins")).keywords).toContain("ward");
        const tablet = idOf(s, "p1", "battlefield", "Tablet of Discovery");
        s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), (req) => {
          if (req.type === "yesNo") return [sacrifice ? 1 : 0];
          if (req.type === "pick" && req.options.includes(tablet)) return sacrifice ? [tablet] : [];
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      expect(yes.players.p2?.life).toBe(14);
      expect(idsOf(yes, "p1", "graveyard", "Tablet of Discovery")).toHaveLength(1);
      const no = run(false);
      expect(no.players.p2?.life).toBe(17);
      expect(idsOf(no, "p1", "battlefield", "Tablet of Discovery")).toHaveLength(1);
    });
  });

  describe("Rubble Rouser", () => {
    it("en arrivant, vous pouvez défausser une carte pour en piocher une", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Rubble Rouser", "Opt"], library: ["Island", "Forest"] },
      });
      s = settle(cast(s, "p1", "Rubble Rouser"), (req) =>
        req.type === "yesNo" ? [1] : req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("{T}, exilez une carte de votre cimetière : ajoutez {R}, puis 1 blessure à chaque adversaire", () => {
      let s = scenario({ p1: { battlefield: ["Rubble Rouser"], graveyard: ["Opt"] } });
      const rouser = idOf(s, "p1", "battlefield", "Rubble Rouser");
      s = activate(s, "p1", rouser, "Exilez");
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      s = settle(s);
      expect(s.players.p2?.life).toBe(19);
    });

    it("sans carte au cimetière, la capacité ne peut pas être activée", () => {
      const s = scenario({ p1: { battlefield: ["Rubble Rouser"] } });
      const rouser = idOf(s, "p1", "battlefield", "Rubble Rouser");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === rouser)).toBe(false);
    });
  });

  describe("Steal the Show", () => {
    it("le joueur ciblé défausse autant de cartes qu'il veut, puis en pioche autant", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Steal the Show"] },
        p2: { hand: ["Opt", "Opt", "Bear Cub"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "Steal the Show", { p: ["p2"] }, { mode: 0 }), (req, player) =>
        player === "p2" && req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
      );
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Island", "Island"]);
    });

    it("blessures égales au nombre de cartes d'éphémère et de rituel de votre cimetière ; les deux modes ensemble", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Steal the Show"],
          graveyard: ["Opt", "Lightning Strike", "Duel Tactics", "Bear Cub"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Steal the Show", { p: ["p1"], c: [angel] }, { mode: 2 }), (req) =>
        req.type === "pick" ? [] : undefined,
      );
      expect(s.objects[angel]?.damage).toBe(3);
    });
  });

  describe("Sorts de blessures", () => {
    it("Duel Tactics : 1 blessure et la créature ne peut pas bloquer ce tour-ci ; flashback {1}{R}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Duel Tactics"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Duel Tactics", { t: [angel] }));
      expect(s.objects[angel]?.damage).toBe(1);
      expect(chars(s, angel).keywords).toContain("cantBlock");
      const card = idOf(s, "p1", "graveyard", "Duel Tactics");
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(exiled(s, "Duel Tactics")).toHaveLength(1);
    });

    it("Heated Argument : 6 blessures ; une carte exilée du cimetière : 2 blessures au contrôleur de la créature", () => {
      const run = (exile: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Heated Argument"], graveyard: ["Opt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Heated Argument", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
          req.type === "pick" ? (exile ? req.options.slice(0, 1) : []) : undefined,
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        return s;
      };
      const yes = run(true);
      expect(yes.players.p2?.life).toBe(18);
      expect(exiled(yes, "Opt")).toHaveLength(1);
      const no = run(false);
      expect(no.players.p2?.life).toBe(20);
      expect(idsOf(no, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Tome Blast : 2 blessures à n'importe quelle cible ; flashback {4}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Tome Blast"] } });
      s = settle(cast(s, "p1", "Tome Blast", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      const card = idOf(s, "p1", "graveyard", "Tome Blast");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(exiled(s, "Tome Blast")).toHaveLength(1);
    });

    it("Unsubtle Mockery : 4 blessures à une créature, puis surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Unsubtle Mockery"], library: ["Island", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Unsubtle Mockery", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Unsubtle Mockery")).toHaveLength(1);
      expect(s.players.p1?.graveyard.length).toBe(2);
      expect(s.players.p1?.library).toHaveLength(1);
    });
  });

  describe("Charging Strifeknight", () => {
    it("célérité ; {T}, défaussez une carte : piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Charging Strifeknight"], hand: ["Opt"], library: ["Island"] } });
      const knight = idOf(s, "p1", "battlefield", "Charging Strifeknight");
      expect(chars(s, knight).keywords).toContain("haste");
      s = settle(activate(s, "p1", knight, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      expect(s.objects[knight]?.tapped).toBe(true);
    });
  });

  describe("Improvisation Capstone", () => {
    it("exile jusqu'à une valeur de mana totale de 4 ou plus ; les sorts exilés se lancent sans payer leur coût", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 7),
          hand: ["Improvisation Capstone"],
          library: ["Lightning Strike", "Forest", "Bear Cub", "Serra Angel", "Island"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Improvisation Capstone"));
      // Lightning Strike (2) + Forest (0) + Bear Cub (2) = 4 : trois cartes exilées, le terrain n'est pas proposé.
      expect(s.players.p1?.library).toHaveLength(2);
      const strike = exiled(s, "Lightning Strike")[0] as string;
      const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect([...(castNowOf(s)?.cards ?? [])].sort()).toEqual([strike, bear].sort());
      s = act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "cast", card: bear });
      s = settle(s);
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // Paradigme : le sort est exilé après sa résolution.
      expect(exiled(s, "Improvisation Capstone")).toHaveLength(1);
      // Mana : seuls les sept terrains ont servi pour la Capstone ; les sorts exilés étaient gratuits.
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(7);
    });
  });
});

describe("Secrets of Strixhaven, lot A — vert", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes vertes : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (plan R, lot R7) : Opus et Increment chiffrés, Fractales, Infusion, préparation (Regrowth, Stream of Life,
   * Rampant Growth, Bind to Life), convergence, marqueurs d'étourdissement d'arrivée.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Lance le sort préparé de `creature` (sa copie en exil). */
  const castPrepared = (s: S, creature: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const copy = s.objects[creature]?.preparedCopy;
    if (!copy) throw new Error("créature non préparée");
    return act(s, s.objects[creature]?.controller ?? "p1", { type: "cast", card: copy, targets, ...extra });
  };
  /** Déclare `attacker` attaquant le joueur p2. */
  const attackWith = (s: S, name: string) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const id = idOf(cur, "p1", "battlefield", name);
    cur = act(cur, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
    return cur;
  };

  it("Aberrant Manawurm : piétinement ; chaque éphémère ou rituel lancé lui donne +X/+0, X = mana dépensé", () => {
    let s = scenario({
      p1: { battlefield: ["Aberrant Manawurm", "Island", ...lands("Mountain", 2)], hand: ["Opt", "Lightning Strike"] },
    });
    const wurm = idOf(s, "p1", "battlefield", "Aberrant Manawurm");
    expect(chars(s, wurm).keywords).toContain("trample");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, wurm)).toEqual([3, 5]);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(pt(s, wurm)).toEqual([5, 5]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, wurm)).toEqual([2, 5]);
  });

  it("Additive Evolution : une Fractale 0/0 verte et bleue avec trois marqueurs ; au début du combat, un marqueur et la vigilance", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Additive Evolution"] } });
    s = settle(cast(s, "p1", "Additive Evolution"));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    expect(s.objects[fractal]?.isToken).toBe(true);
    expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);
    expect(pt(s, fractal)).toEqual([3, 3]);
    expect(chars(s, fractal).keywords).not.toContain("vigilance");
    // La Fractale vient d'arriver : pas d'attaque, le combat de ce tour passe jusqu'à la seconde phase principale.
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[fractal]?.counters["+1/+1"]).toBe(4);
    expect(chars(s, fractal).keywords).toContain("vigilance");
  });

  describe("Ambitious Augmenter", () => {
    it("Increment, puis en mourant avec des marqueurs : une Fractale qui reçoit ses marqueurs", () => {
      let s = scenario({ p1: { battlefield: ["Ambitious Augmenter", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const augmenter = idOf(s, "p1", "battlefield", "Ambitious Augmenter");
      // Lightning Strike : 2 mana > force 1 → un marqueur (résolu avant le sort), puis 3 blessures le tuent.
      s = settle(cast(s, "p1", "Lightning Strike", { t: [augmenter] }));
      expect(idsOf(s, "p1", "graveyard", "Ambitious Augmenter")).toHaveLength(1);
      const fractal = idOf(s, "p1", "battlefield", "Fractal");
      expect(s.objects[fractal]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, fractal)).toEqual([1, 1]);
    });

    it("sans marqueur en mourant : pas de Fractale", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Ambitious Augmenter"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p2", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Ambitious Augmenter")] }));
      expect(idsOf(s, "p1", "graveyard", "Ambitious Augmenter")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Fractal")).toHaveLength(0);
    });
  });

  it("Burrog Barrage : +1/+0 seulement après un autre éphémère ou rituel, puis blessures égales à sa force", () => {
    const run = (optFirst: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", ...lands("Forest", 2)], hand: ["Opt", "Burrog Barrage"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      if (optFirst) s = settle(cast(s, "p1", "Opt"));
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Burrog Barrage", { a: [idOf(s, "p1", "battlefield", "Bear Cub")], b: [angel] }));
      return s.objects[angel]?.damage;
    };
    expect(run(false)).toBe(2);
    expect(run(true)).toBe(3);
  });

  it("Chelonian Tackle : +0/+10, puis elle se bat contre une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Chelonian Tackle"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Chelonian Tackle", { a: [bear], b: [angel] }));
    expect(pt(s, bear)).toEqual([2, 12]);
    expect(s.objects[bear]?.damage).toBe(4);
    expect(s.objects[angel]?.damage).toBe(2);
  });

  it("Comforting Counsel : un marqueur de croissance par gain de PV ; à cinq, vos créatures ont +3/+3", () => {
    let s = scenario({
      p1: {
        battlefield: ["Comforting Counsel", "Bear Cub", ...lands("Forest", 2)],
        hand: ["Oracle's Restoration", "Oracle's Restoration"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    const counsel = idOf(s, "p1", "battlefield", "Comforting Counsel");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(s.objects[counsel]?.counters.growth).toBe(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    // Trois gains de plus (mis en place directement), puis le cinquième par un sort.
    (s.objects[counsel] as { counters: Record<string, number> }).counters.growth = 4;
    s.version += 1;
    expect(pt(s, bear)).toEqual([3, 3]);
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(s.objects[counsel]?.counters.growth).toBe(5);
    expect(pt(s, bear)).toEqual([2 + 2 + 3, 2 + 2 + 3]);
    expect(pt(s, theirs)).toEqual([2, 2]);
  });

  it("Efflorescence : deux marqueurs +1/+1 ; Infusion : piétinement et indestructible jusqu'à la fin du tour", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4)], hand: ["Oracle's Restoration", "Efflorescence"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
      s = settle(cast(s, "p1", "Efflorescence", { t: [bear] }));
      return { counters: s.objects[bear]?.counters["+1/+1"], keywords: chars(s, bear).keywords };
    };
    const plain = run(false);
    expect(plain.counters).toBe(2);
    expect(plain.keywords).not.toContain("trample");
    const infused = run(true);
    expect(infused.counters).toBe(2);
    expect(infused.keywords).toEqual(expect.arrayContaining(["trample", "indestructible"]));
  });

  describe("Emeritus of Abundance", () => {
    it("vigilance ; arrive préparée : Regrowth renvoie une carte de votre cimetière dans votre main", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Emeritus of Abundance"], graveyard: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Emeritus of Abundance"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Abundance");
      expect(chars(s, emeritus).keywords).toContain("vigilance");
      expect(exiled(s, "Regrowth")).toHaveLength(1);
      s = settle(castPrepared(s, emeritus, { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
    });

    it("en attaquant avec huit terrains ou plus, elle devient préparée ; avec sept, non", () => {
      const run = (n: number) => {
        const s = settle(
          attackWith(
            scenario({ p1: { battlefield: ["Emeritus of Abundance", ...lands("Forest", n)] } }),
            "Emeritus of Abundance",
          ),
        );
        return exiled(s, "Regrowth").length;
      };
      expect(run(8)).toBe(1);
      expect(run(7)).toBe(0);
    });
  });

  it("Emil, Vastlands Roamer : piétinement aux créatures à marqueurs +1/+1 ; Fractale avec X marqueurs (noms de terrains)", () => {
    let s = scenario({
      p1: { battlefield: ["Emil, Vastlands Roamer", ...lands("Forest", 3), "Island", "Swamp"] },
    });
    const emil = idOf(s, "p1", "battlefield", "Emil, Vastlands Roamer");
    expect(chars(s, emil).keywords).not.toContain("trample");
    s = settle(activate(s, "p1", emil));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    // Forest, Island, Swamp : trois noms différents.
    expect(s.objects[fractal]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, fractal).keywords).toContain("trample");
    expect(s.objects[emil]?.tapped).toBe(true);
  });

  it("Environmental Scientist : en arrivant, vous pouvez chercher une carte de terrain de base et la mettre en main", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Environmental Scientist"], library: ["Bear Cub", "Island", "Opt"] },
    });
    s = settle(cast(s, "p1", "Environmental Scientist"), (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Follow the Lumarets : une créature ou un terrain parmi quatre ; Infusion : jusqu'à deux ; le reste dessous", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 3)],
          hand: ["Oracle's Restoration", "Follow the Lumarets"],
          library: ["Swamp", "Bear Cub", "Opt", "Island", "Serra Angel", "Lightning Strike"],
        },
      });
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      let max = 0;
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Follow the Lumarets"), (req) => {
        if (req.type !== "pick") return undefined;
        max = req.max;
        // Opt n'est ni une créature ni un terrain.
        expect(req.options.map((id) => nameOf(s, id))).not.toContain("Opt");
        return req.options.slice(0, req.max);
      });
      return { max, gained: (s.players.p1?.hand.length ?? 0) - (before - 1), lib: s.players.p1?.library.length };
    };
    expect(run(false)).toEqual({ max: 1, gained: 1, lib: 5 });
    // Avec Oracle's Restoration (une carte piochée avant) : deux cartes prises.
    expect(run(true)).toEqual({ max: 2, gained: 2, lib: 3 });
  });

  it("Germination Practicum : deux marqueurs +1/+1 sur chacune de vos créatures ; Paradigme (exilé)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Forest", 5)], hand: ["Germination Practicum"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Germination Practicum"));
    for (const id of idsOf(s, "p1", "battlefield", "Bear Cub")) expect(s.objects[id]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(exiled(s, "Germination Practicum")).toHaveLength(1);
  });

  describe("Glorious Decay", () => {
    it("4 blessures à une créature avec le vol (une créature sans le vol n'est pas une cible légale)", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Glorious Decay"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      expect(() => cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 1 })).toThrow();
      s = settle(cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }, { mode: 1 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("exile une carte d'un cimetière et vous piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Glorious Decay"] },
        p2: { graveyard: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "graveyard", "Serra Angel")] }, { mode: 2 }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  it("Infirmary Healer : arrive préparée ; Stream of Life fait gagner X PV au joueur ciblé", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Infirmary Healer"] } });
    s = settle(cast(s, "p1", "Infirmary Healer"));
    const healer = idOf(s, "p1", "battlefield", "Infirmary Healer");
    s = settle(castPrepared(s, healer, { t: ["p1"] }, { x: 3 }));
    expect(s.players.p1?.life).toBe(23);
    expect(exiled(s, "Stream of Life")).toHaveLength(0);
  });

  it("Lumaret's Favor : +2/+4 ; Infusion : le sort est copié en le lançant", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Oracle's Restoration", "Lumaret's Favor"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
      s = settle(cast(s, "p1", "Lumaret's Favor", { t: [bear] }));
      return pt(s, bear);
    };
    expect(run(false)).toEqual([4, 6]);
    expect(run(true)).toEqual([2 + 1 + 4, 2 + 1 + 8]);
  });

  it("Mindful Biomancer : 1 PV en arrivant ; {2}{G} : +2/+2, une seule fois par tour", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 8), hand: ["Mindful Biomancer"] } });
    s = settle(cast(s, "p1", "Mindful Biomancer"));
    expect(s.players.p1?.life).toBe(21);
    const biomancer = idOf(s, "p1", "battlefield", "Mindful Biomancer");
    s = settle(activate(s, "p1", biomancer));
    expect(pt(s, biomancer)).toEqual([4, 4]);
    expect(canActivate(s, "p1", biomancer)).toBe(false);
  });

  it("Noxious Newt : contact mortel ; {T} : ajoutez {G}", () => {
    const s = scenario({ p1: { battlefield: ["Noxious Newt"] } });
    const newt = idOf(s, "p1", "battlefield", "Noxious Newt");
    expect(chars(s, newt).keywords).toContain("deathtouch");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === newt && a.colors.includes("G"))).toBe(true);
  });

  it("Oracle's Restoration : +1/+1 sur votre créature, vous piochez une carte et gagnez 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"], hand: ["Oracle's Restoration"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Pestbrood Sloth : en mourant, deux Nuisibles 1/1 noirs et verts", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Pestbrood Sloth", damage: 1 }, ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Pestbrood Sloth")] }));
    const pests = idsOf(s, "p1", "battlefield", "Pest");
    expect(pests).toHaveLength(2);
    expect([...chars(s, pests[0] as string).colors].sort()).toEqual(["B", "G"]);
  });

  it("Planar Engineering : sacrifiez deux terrains, puis quatre terrains de base arrivent engagés", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Planar Engineering"],
        library: [...lands("Island", 2), ...lands("Swamp", 2), "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Planar Engineering"));
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
    const fetched = [...idsOf(s, "p1", "battlefield", "Island"), ...idsOf(s, "p1", "battlefield", "Swamp")];
    expect(fetched).toHaveLength(4);
    expect(fetched.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Shopkeeper's Bane : piétinement ; en attaquant, vous gagnez 2 PV", () => {
    let s = scenario({ p1: { battlefield: ["Shopkeeper's Bane"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Shopkeeper's Bane")).keywords).toContain("trample");
    s = settle(attackWith(s, "Shopkeeper's Bane"));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Slumbering Trudge : arrive avec 3 − X marqueurs d'étourdissement, engagée si X ≤ 2", () => {
    const run = (x: number) => {
      let s = scenario({ p1: { battlefield: lands("Forest", x + 1), hand: ["Slumbering Trudge"] } });
      s = settle(cast(s, "p1", "Slumbering Trudge", undefined, { x }));
      const o = s.objects[idOf(s, "p1", "battlefield", "Slumbering Trudge")];
      return [o?.counters.stun ?? 0, o?.tapped];
    };
    expect(run(0)).toEqual([3, true]);
    expect(run(1)).toEqual([2, true]);
    expect(run(2)).toEqual([1, true]);
    expect(run(3)).toEqual([0, false]);
  });

  it("Snarl Song : convergence, deux Fractales avec X marqueurs et X PV (X = couleurs dépensées)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 5), "Island"], hand: ["Snarl Song"] } });
    s = settle(cast(s, "p1", "Snarl Song"));
    const fractals = idsOf(s, "p1", "battlefield", "Fractal");
    expect(fractals).toHaveLength(2);
    for (const id of fractals) expect(pt(s, id)).toEqual([2, 2]);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Studious First-Year : arrive préparée ; Rampant Growth met un terrain de base engagé sur le champ de bataille", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Studious First-Year"], library: ["Bear Cub", "Island"] } });
    s = settle(cast(s, "p1", "Studious First-Year"));
    const student = idOf(s, "p1", "battlefield", "Studious First-Year");
    s = settle(castPrepared(s, student));
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    expect(s.objects[student]?.preparedCopy).toBeUndefined();
  });

  describe("Tenured Concocter", () => {
    it("ciblée par un sort adverse : vous pouvez piocher une carte", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Tenured Concocter"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const concocter = idOf(s, "p1", "battlefield", "Tenured Concocter");
      expect(chars(s, concocter).keywords).toContain("vigilance");
      s = settle(cast(s, "p2", "Lightning Strike", { t: [concocter] }), (req, p) =>
        req.type === "yesNo" && p === "p1" ? [1] : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[concocter]?.damage).toBe(3);
    });

    it("Infusion : +2/+0 tant que vous avez gagné des PV ce tour-ci ; vos propres sorts ne font pas piocher", () => {
      let s = scenario({ p1: { battlefield: ["Tenured Concocter", "Forest"], hand: ["Oracle's Restoration"] } });
      const concocter = idOf(s, "p1", "battlefield", "Tenured Concocter");
      expect(pt(s, concocter)).toEqual([4, 5]);
      s = settle(cast(s, "p1", "Oracle's Restoration", { t: [concocter] }));
      expect(pt(s, concocter)).toEqual([7, 6]);
      // Seule la pioche de Restoration.
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, concocter)).toEqual([4, 5]);
    });
  });

  it("Thornfist Striker : garde {1} ; Infusion : vos créatures ont +1/+0 et le piétinement", () => {
    let s = scenario({
      p1: { battlefield: ["Thornfist Striker", "Bear Cub", "Forest"], hand: ["Oracle's Restoration"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const striker = idOf(s, "p1", "battlefield", "Thornfist Striker");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, striker).keywords).toContain("ward");
    expect(chars(s, bear).keywords).not.toContain("trample");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [striker] }));
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toContain("trample");
    expect(pt(s, striker)).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Topiary Lecturer : Increment ; {T} : autant de {G} que sa force", () => {
    let s = scenario({ p1: { battlefield: ["Topiary Lecturer", ...lands("Forest", 2)], hand: ["Bear Cub", "Bear Cub"] } });
    const lecturer = idOf(s, "p1", "battlefield", "Topiary Lecturer");
    const [a, b] = idsOf(s, "p1", "hand", "Bear Cub");
    // 2 mana > force 1 : un marqueur.
    s = settle(act(s, "p1", { type: "cast", card: a as string }));
    expect(pt(s, lecturer)).toEqual([2, 3]);
    // Forêts engagées : le Professeur produit {G}{G} à lui seul ; 2 mana n'excède ni sa force ni son endurance.
    s = settle(act(s, "p1", { type: "cast", card: b as string }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(s.objects[lecturer]?.tapped).toBe(true);
    expect(pt(s, lecturer)).toEqual([2, 3]);
  });

  it("Vastlands Scavenger : contact mortel ; Bind to Life meule sept cartes et une créature meulée arrive", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 8),
        hand: ["Vastlands Scavenger"],
        library: [...lands("Island", 3), "Serra Angel", ...lands("Island", 3), "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Vastlands Scavenger"));
    const scavenger = idOf(s, "p1", "battlefield", "Vastlands Scavenger");
    expect(chars(s, scavenger).keywords).toContain("deathtouch");
    s = settle(castPrepared(s, scavenger));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // Sept cartes meulées, dont l'Ange reparti sur le champ de bataille.
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Wild Hypothesis : une Fractale avec X marqueurs, puis surveillance 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Wild Hypothesis"], library: ["Opt", "Island", "Bear Cub"] },
    });
    let surveilled = 0;
    s = settle(cast(s, "p1", "Wild Hypothesis", undefined, { x: 2 }), (req) => {
      if (req.type !== "pick") return undefined;
      surveilled = req.options.length;
      return req.options;
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Fractal"))).toEqual([2, 2]);
    expect(surveilled).toBe(2);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Zimone's Experiment : jusqu'à deux créatures ou terrains parmi cinq : terrains engagés en jeu, créatures en main", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Zimone's Experiment"],
        library: ["Bear Cub", "Opt", "Island", "Serra Angel", "Lightning Strike", "Swamp"],
      },
    });
    s = settle(cast(s, "p1", "Zimone's Experiment"), (req) =>
      req.type === "pick" ? req.options.filter((id) => ["Bear Cub", "Island"].includes(nameOf(s, id) ?? "")) : undefined,
    );
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib[0]).toBe("Swamp");
    expect([...lib.slice(1)].sort()).toEqual(["Lightning Strike", "Opt", "Serra Angel"]);
  });
});

describe("Secrets of Strixhaven, lot A — multicolores", () => {
  /**
   * Secrets of Strixhaven, lot A : cartes multicolores confrontées à leur texte Oracle (plan R, lot R7). Préparation
   * (Abigale, Kirol, Lluwen, Sanar, Tam), Repartee, Opus, Increment, Infusion, cartes qui quittent le cimetière,
   * charmes des collèges et légendaires.
   */
  type S = GameState;
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;

  /** Réponse : choisir ces objets quand ils sont proposés ; « oui » aux questions. */
  const pickIds =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const hit = ids.filter((id) => req.options.includes(id));
      return hit.length ? hit.slice(0, req.max) : undefined;
    };
  /** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
  const activate = (
    s: S,
    player: string,
    source: string,
    label?: string,
    targets?: Record<string, string[]>,
    extra: object = {},
  ) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  /** Passe la priorité jusqu'à la première phase principale (déclenchements résolus). */
  const passUntilMain = (s: S): S => {
    let cur = s;
    for (let i = 0; i < 20 && !(cur.turn.step === "main1" && cur.stack.length === 0 && cur.triggers.length === 0); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Enchantement (non-Aura) sans capacité. */
  const ENCHANTMENT = customCard({ name: "Enchantement d'essai", types: ["Enchantment"], typeLine: "Enchantment" });
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
  /** Rituel incolore de coût {N} : « piochez une carte » n'est pas nécessaire ici, il ne fait rien. */
  const sorcery = (n: number): CardDef =>
    customCard({
      name: `Rituel à ${n}`,
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: n, colored: {}, x: 0 },
      manaCostText: `{${n}}`,
      spell: { modes: [{ targets: [], effects: [] }] },
    });

  describe("Silverquill (blanc et noir)", () => {
    it("Abigale : un sort de créature la rend préparée ; Heroic Stanza met un marqueur +1/+1 sur une créature", () => {
      let s = scenario({
        p1: { battlefield: ["Abigale, Poet Laureate", "Plains", "Swamp", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      const abigale = idOf(s, "p1", "battlefield", "Abigale, Poet Laureate");
      expect(chars(s, abigale).keywords).toContain("flying");
      expect(s.objects[abigale]?.preparedCopy).toBeUndefined();
      s = settle(cast(s, "p1", "Bear Cub"));
      const stanza = exiled(s, "Heroic Stanza");
      expect(stanza).toHaveLength(1);
      expect(s.objects[abigale]?.preparedCopy).toBe(stanza[0]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: stanza[0] as string, targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(s.objects[abigale]?.preparedCopy).toBeUndefined();
    });

    it("Conciliator's Duelist : en arrivant, piochez et chaque joueur perd 1 PV ; Repartee exile une créature jusqu'à l'étape de fin", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Conciliator's Duelist", "Lightning Strike"],
          library: lands("Island", 3),
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Conciliator's Duelist"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 19]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [angel] }), pickIds(bear));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[angel]?.damage).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Bear Cub")).toHaveLength(0);
    });

    it("Fix What's Broken : payez X PV ; chaque carte d'artefact et de créature de VM X revient de votre cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)],
          hand: ["Fix What's Broken"],
          graveyard: ["Bear Cub", "Swiftfoot Boots", "Llanowar Elves", "Juggernaut", "Opt"],
        },
      });
      s = settle(cast(s, "p1", "Fix What's Broken", undefined, { x: 2 }));
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Swiftfoot Boots")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Juggernaut")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Inkling Mascot : Repartee — vol jusqu'à la fin du tour et surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: ["Inkling Mascot", ...lands("Mountain", 2)], hand: ["Lightning Strike"], library: lands("Island", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const mascot = idOf(s, "p1", "battlefield", "Inkling Mascot");
      expect(chars(s, mascot).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, 1) : undefined,
      );
      expect(chars(s, mascot).keywords).toContain("flying");
      // Surveillance 1 : la carte du dessus va au cimetière.
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, mascot).keywords).not.toContain("flying");
    });

    it("Killian's Confidence : +1/+1 et piochez ; depuis le cimetière, des blessures de combat à un joueur permettent de payer {W/B} pour la reprendre", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Plains", "Swamp", "Plains"],
          hand: ["Killian's Confidence"],
          library: lands("Island", 3),
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Killian's Confidence", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Killian's Confidence")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" || x.turn.step === "end");
      expect(s.pending?.kind).toBe("choice");
      s = settle(s, () => [1]);
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "hand", "Killian's Confidence")).toHaveLength(1);
    });

    it("Moment of Reckoning : le même mode peut être choisi plusieurs fois (deux destructions et un retour)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)],
          hand: ["Moment of Reckoning"],
          graveyard: ["Serra Angel"],
        },
        p2: { battlefield: ["Bear Cub", "Swiftfoot Boots", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Moment of Reckoning");
      const modes = castOptions(s, "p1", card);
      const first = modes[0];
      expect(first?.type === "cast" && first.modes.length).toBe(14);
      // Modes générés : deux destructions et un retour (index 9).
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const boots = idOf(s, "p2", "battlefield", "Swiftfoot Boots");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card, mode: 9, targets: { d0: [bear], d1: [boots], g0: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // Un terrain n'est pas un permanent non-terrain.
      const t = scenario({
        p1: { battlefield: lands("Swamp", 7), hand: ["Moment of Reckoning"] },
        p2: { battlefield: ["Forest"] },
      });
      const forest = idOf(t, "p2", "battlefield", "Forest");
      expect(() => cast(t, "p1", "Moment of Reckoning", { d0: [forest] }, { mode: 4 })).toThrow();
    });

    it("Render Speechless : vous choisissez une carte non-terrain de la main adverse ; deux marqueurs +1/+1 sur jusqu'à une créature", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Render Speechless"] },
        p2: { hand: ["Forest", "Opt", "Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "hand", "Serra Angel");
      const forest = idOf(s, "p2", "hand", "Forest");
      let asked: string[] = [];
      s = settle(cast(s, "p1", "Render Speechless", { p: ["p2"], c: [bear] }), (req, player) => {
        if (req.type !== "pick" || player !== "p1") return undefined;
        asked = req.options;
        return [angel];
      });
      expect(asked).toHaveLength(2);
      expect(asked).not.toContain(forest);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(counters(s, bear)).toBe(2);
    });

    it("Scolding Administrator : Repartee, un marqueur +1/+1 ; en mourant, ses marqueurs vont sur jusqu'à une créature ciblée", () => {
      let s = scenario({
        p1: {
          battlefield: ["Scolding Administrator", "Bear Cub", "Serra Angel", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const admin = idOf(s, "p1", "battlefield", "Scolding Administrator");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(chars(s, admin).keywords).toContain("menace");
      const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: [bear] } }));
      expect(counters(s, admin)).toBe(1);
      expect(pt(s, admin)).toEqual([3, 3]);
      // Une blessure déjà marquée : le second Strike (après un deuxième marqueur, 4/4) la tue.
      (s.objects[admin] as { damage: number }).damage = 1;
      s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: [admin] } }), pickIds(angel));
      expect(idsOf(s, "p1", "graveyard", "Scolding Administrator")).toHaveLength(1);
      expect(counters(s, angel)).toBe(2);
    });

    it("Silverquill Charm : exile une créature de force 2 ou moins (pas 3) ; ou drain de 3", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Plains", "Swamp"], hand: ["Silverquill Charm", "Silverquill Charm"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const [a, b] = idsOf(s, "p1", "hand", "Silverquill Charm");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card: a as string, mode: 1, targets: { t: [angel] } })).toThrow();
      s = settle(
        act(s, "p1", { type: "cast", card: a as string, mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      );
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: b as string, mode: 2 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });

    it("Silverquill, the Disputant : sacrifier une créature de force 1 ou plus copie l'éphémère lancé", () => {
      let s = scenario({
        p1: { battlefield: ["Silverquill, the Disputant", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), pickIds(bear));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(14);
    });

    it("Snooping Page : Repartee la rend imblocable ce tour-ci ; blessures de combat à un joueur : piochez, perdez 1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Snooping Page", ...lands("Mountain", 2)], hand: ["Lightning Strike"], library: lands("Island", 3) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const page = idOf(s, "p1", "battlefield", "Snooping Page");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(chars(s, page).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: page, defender: "p2" }] });
      // L'Ange ne peut pas la bloquer : l'étape des bloqueurs ne demande rien.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(s.turn.step).toBe("end");
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Social Snub : lancé en contrôlant une créature, il peut être copié ; chaque joueur sacrifie une créature, drain de 1 (deux fois)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2), "Swamp"], hand: ["Social Snub"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Social Snub"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      // Sans créature : pas de copie.
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Swamp"], hand: ["Social Snub"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Social Snub"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toHaveLength(1);
    });
  });

  describe("Lorehold (rouge et blanc)", () => {
    it("Ark of Hunger : {T} meule une carte jouable ce tour-ci ; quand elle quitte le cimetière, 1 blessure à chaque adversaire et +1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Ark of Hunger", ...lands("Mountain", 2)], library: ["Lightning Strike", "Forest"] },
      });
      const ark = idOf(s, "p1", "battlefield", "Ark of Hunger");
      s = settle(activate(s, "p1", ark));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 16]);
    });

    it("Aziza : engager trois créatures copie l'éphémère lancé ; sans trois créatures dégagées, pas de copie", () => {
      const run = (creatures: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Aziza, Mage Tower Captain", ...creatures, ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
        return s;
      };
      const s = run(["Bear Cub", "Llanowar Elves"]);
      expect(s.players.p2?.life).toBe(14);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature") && s.objects[id]?.tapped)).toHaveLength(3);
      expect(run(["Bear Cub"]).players.p2?.life).toBe(17);
    });

    it("Borrowed Knowledge : défaussez votre main, puis piochez autant que la main adverse, ou autant que de cartes défaussées", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)],
            hand: ["Borrowed Knowledge", "Opt", "Opt"],
            library: lands("Island", 6),
          },
          p2: { hand: ["Forest", "Forest", "Forest", "Forest"] },
        });
      let s = settle(cast(setup(), "p1", "Borrowed Knowledge", { p: ["p2"] }, { mode: 0 }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(4);
      s = settle(cast(setup(), "p1", "Borrowed Knowledge", undefined, { mode: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Colossus of the Blood Age : en arrivant, 3 blessures à chaque adversaire et +3 PV ; en mourant, défaussez autant que voulu et piochez autant plus une", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), ...lands("Plains", 2), "Swamp", ...lands("Forest", 2)],
          hand: ["Colossus of the Blood Age", "Grapple with Death", "Opt", "Opt"],
          library: lands("Island", 6),
        },
      });
      s = settle(cast(s, "p1", "Colossus of the Blood Age"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
      const colossus = idOf(s, "p1", "battlefield", "Colossus of the Blood Age");
      const opts = idsOf(s, "p1", "hand", "Opt");
      // Grapple with Death détruit le Colosse (et fait gagner 1 PV) ; deux cartes défaussées, trois piochées.
      s = settle(cast(s, "p1", "Grapple with Death", { t: [colossus] }), pickIds(...opts));
      expect(s.players.p1?.life).toBe(24);
      expect(idsOf(s, "p1", "graveyard", "Colossus of the Blood Age")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Kirol et Spirit Mascot : une carte quitte votre cimetière — Kirol devient préparé, le Mascotte prend un marqueur ; Pack a Punch", () => {
      let s = scenario({
        p1: {
          battlefield: ["Kirol, History Buff", "Spirit Mascot", "Bear Cub", "Swamp", "Forest", "Mountain", "Plains", "Plains"],
          graveyard: ["Teacher's Pest"],
          library: lands("Island", 3),
        },
      });
      const kirol = idOf(s, "p1", "battlefield", "Kirol, History Buff");
      const mascot = idOf(s, "p1", "battlefield", "Spirit Mascot");
      expect(exiled(s, "Pack a Punch")).toHaveLength(0);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      expect(idsOf(s, "p1", "battlefield", "Teacher's Pest")).toHaveLength(1);
      expect(counters(s, mascot)).toBe(1);
      const punch = exiled(s, "Pack a Punch");
      expect(punch).toHaveLength(1);
      expect(s.objects[kirol]?.preparedCopy).toBe(punch[0]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: punch[0] as string, targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(2);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(s.objects[kirol]?.preparedCopy).toBeUndefined();
    });

    it("Lorehold Charm : sacrifice d'un artefact non-jeton adverse ; retour d'un artefact ou d'une créature de VM 2 ou moins ; +1/+1 et piétinement", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 3), ...lands("Plains", 3)],
          hand: ["Lorehold Charm", "Lorehold Charm", "Lorehold Charm"],
          graveyard: ["Llanowar Elves", "Serra Angel"],
        },
        p2: { battlefield: ["Swiftfoot Boots", "Bear Cub"] },
      });
      const [a, b, c] = idsOf(s, "p1", "hand", "Lorehold Charm");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card: b as string, mode: 1, targets: { t: [angel] } })).toThrow();
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: b as string,
          mode: 1,
          targets: { t: [idOf(s, "p1", "graveyard", "Llanowar Elves")] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: c as string, mode: 2 }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Practiced Scrollsmith : exile une carte non-créature et non-terrain de votre cimetière, lançable jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 1), "Island"],
          hand: ["Practiced Scrollsmith"],
          graveyard: ["Opt", "Bear Cub"],
          library: lands("Island", 5),
        },
      });
      const bearCard = idOf(s, "p1", "graveyard", "Bear Cub");
      s = cast(s, "p1", "Practiced Scrollsmith");
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bearCard) ? undefined : undefined));
      const scroll = idOf(s, "p1", "battlefield", "Practiced Scrollsmith");
      expect(chars(s, scroll).keywords).toContain("firstStrike");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const opt = exiled(s, "Opt")[0] as string;
      expect(opt).toBeDefined();
      // Toujours lançable au tour adverse suivant (jusqu'à la fin de votre prochain tour).
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.pending?.kind === "priority");
      s = act(s, "p2", { type: "pass" });
      expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: opt }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Pursue the Past : +2 PV, défausser une carte pour en piocher deux ; flashback {2}{R}{W}", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), ...lands("Plains", 3)],
          hand: ["Pursue the Past", "Opt"],
          library: lands("Island", 6),
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Pursue the Past"), pickIds(opt));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
      const card = idOf(s, "p1", "graveyard", "Pursue the Past");
      // Flashback, sans défausser : seulement les PV.
      s = settle(act(s, "p1", { type: "cast", card }), (req) => (req.type === "pick" && req.min === 0 ? [] : undefined));
      expect(s.players.p1?.life).toBe(24);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(exiled(s, "Pursue the Past")).toHaveLength(1);
    });

    it("Startled Relic Sloth : au début de votre combat, exile jusqu'à une carte d'un cimetière", () => {
      let s = scenario({ p1: { battlefield: ["Startled Relic Sloth"] }, p2: { graveyard: ["Opt"] } });
      const sloth = idOf(s, "p1", "battlefield", "Startled Relic Sloth");
      expect(chars(s, sloth).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      expect(s.turn.step).toBe("beginCombat");
      s = settle(s, pickIds(opt));
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Wilt in the Heat : coûte {2} de moins si une carte a quitté votre cimetière ce tour-ci ; la créature est exilée au lieu de mourir", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Swamp", "Forest"], hand: ["Wilt in the Heat"], graveyard: ["Teacher's Pest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const wilt = idOf(s, "p1", "hand", "Wilt in the Heat");
      // {2}{R}{W} : quatre terrains suffisent, mais on garde Marais et Forêt pour Teacher's Pest.
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      expect(castOptions(s, "p1", wilt)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: wilt, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
      // Sans carte sortie du cimetière : {2}{R}{W} avec deux terrains, impossible.
      const t = scenario({
        p1: { battlefield: ["Mountain", "Plains"], hand: ["Wilt in the Heat"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Wilt in the Heat"))).toHaveLength(0);
    });
  });

  describe("Prismari (bleu et rouge)", () => {
    it("Abstract Paintmage : au début de votre première phase principale, {U}{R} réservés aux éphémères et rituels", () => {
      let s = scenario({
        step: "draw",
        p1: { battlefield: ["Abstract Paintmage"], hand: ["Lightning Strike", "Fanatical Firebrand"] },
      });
      s = passUntilMain(s);
      expect(s.turn.step).toBe("main1");
      expect(s.players.p1?.restrictedMana).toHaveLength(2);
      expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Fanatical Firebrand"))).toHaveLength(0);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("Elemental Mascot : Opus +1/+0 ; cinq mana ou plus, la carte du dessus est exilée et jouable", () => {
      let s = scenario({
        p1: {
          battlefield: ["Elemental Mascot", ...lands("Island", 4), ...lands("Mountain", 4)],
          hand: ["Opt", sorcery(5)],
          library: ["Forest", "Lightning Strike", "Forest"],
        },
      });
      const mascot = idOf(s, "p1", "battlefield", "Elemental Mascot");
      expect(chars(s, mascot).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, mascot)).toEqual([2, 4]);
      expect(exiled(s, "Lightning Strike")).toHaveLength(0);
      s = settle(cast(s, "p1", "Rituel à 5"));
      expect(pt(s, mascot)).toEqual([3, 4]);
      const strike = exiled(s, "Lightning Strike")[0] as string;
      expect(strike).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("Prismari, the Inspiration : les éphémères et rituels ont la tempête (une copie par sort lancé avant ce tour-ci)", () => {
      let s = scenario({
        p1: { battlefield: ["Prismari, the Inspiration", "Island", ...lands("Mountain", 2)], hand: ["Opt", "Lightning Strike"] },
      });
      const prismari = idOf(s, "p1", "battlefield", "Prismari, the Inspiration");
      expect(chars(s, prismari).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Rapturous Moment : piochez trois cartes, défaussez-en deux, ajoutez {U}{U}{R}{R}{R}", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Mountain", 3)],
          hand: ["Rapturous Moment"],
          library: lands("Forest", 5),
        },
      });
      s = settle(cast(s, "p1", "Rapturous Moment"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(s.players.p1?.manaPool).toMatchObject({ U: 2, R: 3 });
    });

    it("Resonating Lute : vos terrains produisent deux mana d'une couleur pour les éphémères et rituels ; {T} : piochez avec sept cartes en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Resonating Lute", "Island"],
          hand: ["Lightning Strike", ...lands("Forest", 5)],
          library: lands("Island", 3),
        },
      });
      const lute = idOf(s, "p1", "battlefield", "Resonating Lute");
      expect(canActivate(s, "p1", lute)).toBe(false);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      const t = scenario({ p1: { battlefield: ["Resonating Lute"], hand: lands("Forest", 7), library: lands("Island", 3) } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Resonating Lute"))).toBe(true);
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Resonating Lute")));
      expect(u.players.p1?.hand).toHaveLength(8);
    });

    it("Sanar : arrive préparé (Wild Idea cherche un éphémère ou un rituel) ; {T} : un Trésor si vous avez lancé un éphémère ou un rituel", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 4), ...lands("Mountain", 3)],
          hand: ["Sanar, Unfinished Genius", "Opt"],
          library: ["Forest", "Lightning Strike", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Sanar, Unfinished Genius"));
      const sanar = idOf(s, "p1", "battlefield", "Sanar, Unfinished Genius");
      const idea = exiled(s, "Wild Idea");
      expect(idea).toHaveLength(1);
      (s.objects[sanar] as { controlledSince: number }).controlledSince = 0;
      expect(canActivate(s, "p1", sanar)).toBe(false);
      s = settle(cast(s, "p1", "Opt"));
      s = settle(activate(s, "p1", sanar));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: idea[0] as string }));
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
    });

    it("Spectacular Skywhale : Opus +3/+0 ; cinq mana ou plus, trois marqueurs +1/+1 à la place", () => {
      let s = scenario({ p1: { battlefield: ["Spectacular Skywhale", ...lands("Island", 6)], hand: ["Opt", sorcery(5)] } });
      const whale = idOf(s, "p1", "battlefield", "Spectacular Skywhale");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, whale)).toEqual([4, 4]);
      s = settle(cast(s, "p1", "Rituel à 5"));
      expect(counters(s, whale)).toBe(3);
      expect(pt(s, whale)).toEqual([7, 7]);
    });

    it("Splatter Technique : 4 blessures à chaque créature ; ou piochez quatre cartes", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Island", 6), ...lands("Mountain", 6)],
          hand: ["Splatter Technique", "Splatter Technique"],
          library: lands("Forest", 5),
        },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const [a, b] = idsOf(s, "p1", "hand", "Splatter Technique");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: b as string, mode: 0 }));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Stadium Tidalmage : en arrivant (et en attaquant), vous pouvez piocher puis défausser", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 2)],
          hand: ["Stadium Tidalmage", "Opt"],
          library: lands("Forest", 3),
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Stadium Tidalmage"), pickIds(opt));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    });

    it("Stress Dream : 5 blessures à jusqu'à une créature ; regardez deux cartes, une en main, l'autre dessous", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 3)],
          hand: ["Stress Dream"],
          library: ["Opt", "Lightning Strike", "Forest"],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Stress Dream", { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      const lib = s.players.p1?.library ?? [];
      expect(lib).toHaveLength(2);
      expect(nameOf(s, lib[0] as string)).toBe("Forest");
    });

    it("Visionary's Dance : deux Élémentaux 3/3 volants ; {2}, défaussez-la : une des deux cartes du dessus en main, l'autre au cimetière", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), ...lands("Mountain", 3)], hand: ["Visionary's Dance"] },
      });
      s = settle(cast(s, "p1", "Visionary's Dance"));
      const els = idsOf(s, "p1", "battlefield", "Elemental");
      expect(els).toHaveLength(2);
      const c = chars(s, els[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([3, 3, ["R", "U"], ["flying"]]);
      let t = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Visionary's Dance"], library: ["Opt", "Forest", "Island"] },
      });
      const dance = idOf(t, "p1", "hand", "Visionary's Dance");
      t = settle(activate(t, "p1", dance));
      expect(idsOf(t, "p1", "graveyard", "Visionary's Dance")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(t.players.p1?.graveyard).toHaveLength(2);
      expect(t.players.p1?.library).toHaveLength(1);
    });
  });

  describe("Quandrix (vert et bleu)", () => {
    it("Applied Geometry : un jeton copie d'un permanent non-Aura que vous contrôlez, créature Fractale 0/0 avec six marqueurs +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swiftfoot Boots", ...lands("Plains", 2), ...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Applied Geometry", "Pacifism"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Pacifism", { enchant: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      const pacifism = idOf(s, "p1", "battlefield", "Pacifism");
      expect(() => cast(s, "p1", "Applied Geometry", { t: [pacifism] })).toThrow();
      s = settle(cast(s, "p1", "Applied Geometry", { t: [idOf(s, "p1", "battlefield", "Swiftfoot Boots")] }));
      const boots = idsOf(s, "p1", "battlefield", "Swiftfoot Boots");
      expect(boots).toHaveLength(2);
      const token = boots.find((id) => s.objects[id]?.isToken) as string;
      const c = chars(s, token);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Fractal"]));
      expect([c.power, c.toughness]).toEqual([6, 6]);
      expect(counters(s, token)).toBe(6);
    });

    it("Berta : Increment, et chaque marqueur +1/+1 mis sur elle ajoute un mana ; {X}, {T} : une Fractale avec X marqueurs", () => {
      let s = scenario({
        p1: { battlefield: ["Berta, Wise Extrapolator", ...lands("Island", 7)], hand: [sorcery(2)] },
      });
      const berta = idOf(s, "p1", "battlefield", "Berta, Wise Extrapolator");
      s = settle(cast(s, "p1", "Rituel à 2"), (req) => (req.type === "pick" && req.options.includes("U") ? ["U"] : undefined));
      expect(counters(s, berta)).toBe(1);
      expect(s.players.p1?.manaPool.U).toBe(1);
      s = settle(activate(s, "p1", berta, undefined, undefined, { x: 3 }));
      const fractal = idOf(s, "p1", "battlefield", "Fractal");
      expect(counters(s, fractal)).toBe(3);
      expect(pt(s, fractal)).toEqual([3, 3]);
      expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);
    });

    it("Cuboid Colony : Increment (un sort à deux mana dépasse 1/1, un sort à un mana non)", () => {
      let s = scenario({ p1: { battlefield: ["Cuboid Colony", ...lands("Island", 3)], hand: ["Opt", sorcery(2)] } });
      const colony = idOf(s, "p1", "battlefield", "Cuboid Colony");
      expect(chars(s, colony).keywords).toEqual(expect.arrayContaining(["flash", "flying", "trample"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(counters(s, colony)).toBe(0);
      s = settle(cast(s, "p1", "Rituel à 2"));
      expect(counters(s, colony)).toBe(1);
    });

    it("Embrace the Paradox : piochez trois cartes et mettez un terrain de votre main sur le champ de bataille engagé", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 3)],
          hand: ["Embrace the Paradox"],
          library: ["Opt", "Mountain", "Opt"],
        },
      });
      // Seule la Montagne piochée est proposée.
      s = settle(cast(s, "p1", "Embrace the Paradox"));
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Fractal Mascot : en arrivant, engage une créature adverse et y met un marqueur d'étourdissement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), ...lands("Island", 3)], hand: ["Fractal Mascot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Fractal Mascot"), pickIds(angel));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(1);
      // À son étape de dégagement, le marqueur est retiré au lieu de la dégager.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(0);
    });

    it("Growth Curve : un marqueur +1/+1, puis le nombre de marqueurs est doublé", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Forest", "Island"], hand: ["Growth Curve"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
      s.version += 1;
      s = settle(cast(s, "p1", "Growth Curve", { t: [bear] }));
      expect(counters(s, bear)).toBe(4);
    });

    it("Mind into Matter : piochez X cartes, puis une carte de permanent de VM X ou moins arrive engagée", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Mind into Matter"],
          library: ["Serra Angel", "Bear Cub", "Forest"],
        },
      });
      let offered = 0;
      s = settle(cast(s, "p1", "Mind into Matter", undefined, { x: 2 }), (req) => {
        if (req.type === "pick") offered = req.options.length;
        return undefined;
      });
      // L'Ange (VM 5) n'est pas proposé : seul l'Ourson (VM 2).
      expect(offered).toBe(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    });

    it("Proctor's Gaze : renvoie jusqu'à un permanent non-terrain ; un terrain de base arrive engagé", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), ...lands("Island", 2)], hand: ["Proctor's Gaze"], library: ["Opt", "Plains"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Proctor's Gaze", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
    });

    it("Pterafractyl : arrive avec X marqueurs +1/+1 ; vous gagnez 2 PV", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 2), ...lands("Island", 3)], hand: ["Pterafractyl"] } });
      s = settle(cast(s, "p1", "Pterafractyl", undefined, { x: 3 }));
      const ptera = idOf(s, "p1", "battlefield", "Pterafractyl");
      expect(pt(s, ptera)).toEqual([4, 3]);
      expect(chars(s, ptera).keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(22);
    });

    it("Quandrix Charm : force et endurance de base 5/5 jusqu'à la fin du tour ; détruit un enchantement ; contresort à moins de {2}", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 3), ...lands("Island", 3)],
          hand: ["Quandrix Charm", "Quandrix Charm"],
        },
        p2: { battlefield: [ENCHANTMENT] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
      s.version += 1;
      const [a, b] = idsOf(s, "p1", "hand", "Quandrix Charm");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 2, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([6, 6]);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: b as string,
          mode: 1,
          targets: { t: [idOf(s, "p2", "battlefield", ENCHANTMENT.name)] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", ENCHANTMENT.name)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([3, 3]);
      // Mode contresort : l'adversaire, sans mana, ne peut pas payer {2}.
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Forest", "Island"], hand: ["Quandrix Charm"] },
        p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      });
      t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      const spell = t.stack[0]?.id as string;
      t = act(t, "p2", { type: "pass" });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Quandrix Charm"), mode: 0, targets: { t: [spell] } }));
      expect(t.players.p1?.life).toBe(20);
      expect(idsOf(t, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    });

    it("Tam : Atterrissage — devient préparé ; Deep Sight fait piocher une carte et gagner 1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Tam, Observant Sequencer", "Forest", "Island"], hand: ["Forest"], library: lands("Island", 3) },
      });
      const tam = idOf(s, "p1", "battlefield", "Tam, Observant Sequencer");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const sight = exiled(s, "Deep Sight");
      expect(sight).toHaveLength(1);
      expect(s.objects[tam]?.preparedCopy).toBe(sight[0]);
      s = settle(act(s, "p1", { type: "cast", card: sight[0] as string }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(21);
    });
  });

  describe("Witherbloom (noir et vert)", () => {
    it("Blech : chaque gain de PV met un marqueur sur chacun de vos Nuisibles, Chauves-souris, Insectes, Serpents et Araignées", () => {
      const bat = customCard({ name: "Chauve-souris d'essai", subtypes: ["Bat"], power: 1, toughness: 1 });
      let s = scenario({
        p1: { battlefield: ["Blech, Loafing Pest", bat, "Bear Cub", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
        p2: { battlefield: [customCard({ name: "Insecte adverse", subtypes: ["Insect"], power: 1, toughness: 1 })] },
      });
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Blech, Loafing Pest"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", bat.name))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Insecte adverse"))).toBe(0);
    });

    it("Bogwater Lumaret et Pest Mascot : chaque créature qui arrive sous votre contrôle fait gagner 1 PV ; chaque gain, un marqueur", () => {
      let s = scenario({
        p1: { battlefield: ["Pest Mascot", ...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Bogwater Lumaret", "Bear Cub"] },
      });
      const mascot = idOf(s, "p1", "battlefield", "Pest Mascot");
      s = settle(cast(s, "p1", "Bogwater Lumaret"));
      expect(s.players.p1?.life).toBe(21);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(22);
      expect(counters(s, mascot)).toBe(2);
    });

    it("Cauldron of Essence : une de vos créatures meurt, drain de 1 ; {1}{B}{G}, {T}, sacrifiez une créature : une carte de créature revient", () => {
      let s = scenario({
        p1: { battlefield: ["Cauldron of Essence", "Bear Cub", "Swamp", "Forest", "Forest"], graveyard: ["Serra Angel"] },
      });
      const cauldron = idOf(s, "p1", "battlefield", "Cauldron of Essence");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        activate(s, "p1", cauldron, undefined, { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }, { sacrifice: [bear] }),
      );
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    });

    it("Dina's Guidance : une carte de créature de la bibliothèque, dans votre main ou dans votre cimetière", () => {
      const run = (toGraveyard: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Swamp", "Forest", "Forest"],
            hand: ["Dina's Guidance"],
            library: ["Forest", "Serra Angel", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Dina's Guidance"), (req) => (req.type === "yesNo" ? [toGraveyard ? 1 : 0] : undefined));
        return s;
      };
      expect(idsOf(run(false), "p1", "hand", "Serra Angel")).toHaveLength(1);
      const g = run(true);
      expect(idsOf(g, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(g.players.p1?.hand).toHaveLength(0);
    });

    it("Essenceknit Scholar : un Nuisible en arrivant ; à votre étape de fin, si une de vos créatures est morte, piochez", () => {
      const run = (kill: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Swamp", 3), ...lands("Forest", 3)],
            hand: ["Essenceknit Scholar", "Grapple with Death"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Essenceknit Scholar"));
        expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
        if (kill) s = settle(cast(s, "p1", "Grapple with Death", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return s.players.p1?.library.length ?? 0;
      };
      expect(run(true)).toBe(4);
      expect(run(false)).toBe(5);
    });

    it("Grapple with Death : détruit un artefact ou une créature, +1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: ["Grapple with Death"] },
        p2: { battlefield: ["Swiftfoot Boots"] },
      });
      s = settle(cast(s, "p1", "Grapple with Death", { t: [idOf(s, "p2", "battlefield", "Swiftfoot Boots")] }));
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Lluwen : arrive préparée (Pest Friend crée un Nuisible) ; exiler une carte de créature du cimetière la prépare de nouveau, en rituel", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
          hand: ["Lluwen, Exchange Student"],
          graveyard: ["Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Lluwen, Exchange Student"));
      const lluwen = idOf(s, "p1", "battlefield", "Lluwen, Exchange Student");
      const friend = exiled(s, "Pest Friend");
      expect(friend).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: friend[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
      expect(s.objects[lluwen]?.preparedCopy).toBeUndefined();
      s = settle(activate(s, "p1", lluwen, undefined, undefined, { exile: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Pest Friend")).toHaveLength(1);
    });

    it("Mind Roots : le joueur ciblé défausse deux cartes ; un terrain défaussé arrive engagé sous votre contrôle", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: ["Mind Roots"] },
        p2: { hand: ["Mountain", "Opt"] },
      });
      s = settle(cast(s, "p1", "Mind Roots", { p: ["p2"] }), (req) =>
        req.type === "pick" ? req.options.slice(0, req.max) : undefined,
      );
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.objects[mountain]?.owner).toBe("p2");
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Old-Growth Educator : Infusion — deux marqueurs +1/+1 s'il arrive après un gain de PV", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)], hand: ["Old-Growth Educator", "Witherbloom Charm"] },
        });
        if (gain) s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
        s = settle(cast(s, "p1", "Old-Growth Educator"));
        const id = idOf(s, "p1", "battlefield", "Old-Growth Educator");
        expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
        return pt(s, id);
      };
      expect(run(true)).toEqual([6, 6]);
      expect(run(false)).toEqual([4, 4]);
    });

    it("Root Manipulation : vos créatures gagnent +2/+2, la menace et « quand elle attaque, gagnez 1 PV » jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2), ...lands("Forest", 3)], hand: ["Root Manipulation"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Root Manipulation"));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("menace");
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Teacher's Pest : menace ; quand il attaque, +1 PV ; {B}{G} : revient du cimetière engagé", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], graveyard: ["Teacher's Pest"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      const pest = idOf(s, "p1", "battlefield", "Teacher's Pest");
      expect(s.objects[pest]?.tapped).toBe(true);
      expect(chars(s, pest).keywords).toContain("menace");
    });

    it("Witherbloom, the Balancer : affinité pour les créatures, et vos éphémères et rituels l'ont aussi", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Llanowar Elves", "Bear Cub", "Swamp", "Forest", "Forest", "Forest", "Mountain"],
          hand: ["Witherbloom, the Balancer", "Lightning Strike"],
        },
      });
      // {6}{B}{G} moins 3 : cinq terrains suffisent.
      s = settle(cast(s, "p1", "Witherbloom, the Balancer"));
      const w = idOf(s, "p1", "battlefield", "Witherbloom, the Balancer");
      expect(chars(s, w).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
      // Plus aucun terrain dégagé : Lightning Strike ({1}{R}) coûte {R} de moins… il reste {R} à payer.
      const strike = idOf(s, "p1", "hand", "Lightning Strike");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
      const t = scenario({
        p1: { battlefield: ["Witherbloom, the Balancer", "Mountain"], hand: ["Lightning Strike"] },
      });
      const u = settle(cast(t, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(u.players.p2?.life).toBe(17);
    });
  });

  describe("Silverquill et autres : capacités d'arrivée", () => {
    it("Imperious Inkmage (surveillance 2) et Stirring Honormancer (X = vos créatures : une en main, le reste au cimetière)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Plains", 4), ...lands("Swamp", 4)],
          hand: ["Imperious Inkmage", "Stirring Honormancer"],
          library: ["Opt", "Forest", "Island", "Mountain", "Plains", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Imperious Inkmage"), (req) => (req.type === "pick" ? req.options.slice(0, 2) : undefined));
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Imperious Inkmage")).keywords).toContain("vigilance");
      // Ourson, Inkmage et Honormancer : trois cartes regardées.
      s = settle(cast(s, "p1", "Stirring Honormancer"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(4);
      expect(s.players.p1?.library).toHaveLength(1);
    });
    it("Molten Note : blessures égales au mana dépensé, dégage vos créatures ; flashback {6}{R}{W}", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Mountain", 6), ...lands("Plains", 6)],
          hand: ["Molten Note"],
        },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // X = 2 : quatre mana dépensés.
      s = settle(cast(s, "p1", "Molten Note", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }, { x: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[bear]?.tapped).toBe(false);
      const note = idOf(s, "p1", "graveyard", "Molten Note");
      expect(castOptions(s, "p1", note)).not.toHaveLength(0);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: note, targets: { t: [dragon] } }));
      // Huit mana dépensés : le Dragon (5/5) meurt ; la carte est exilée.
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Molten Note")).toHaveLength(1);
    });

    it("Nita, Forum Conciliator : {2}, sacrifiez une autre créature : un éphémère adverse exilé se lance ce tour-ci, puis est exilé ; un marqueur sur vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Nita, Forum Conciliator", "Bear Cub", ...lands("Island", 4)] },
        p2: { graveyard: ["Lightning Strike"] },
      });
      const nita = idOf(s, "p1", "battlefield", "Nita, Forum Conciliator");
      const strike = idOf(s, "p2", "graveyard", "Lightning Strike");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === nita);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: nita,
          ability: ab?.type === "activate" ? ab.ability : -1,
          targets: { t: [strike] },
          sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
        }),
      );
      const card = exiled(s, "Lightning Strike")[0] as string;
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      const before = s.objects[nita]?.counters["+1/+1"] ?? 0;
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[nita]?.counters["+1/+1"]).toBe(before + 1);
      // « puis exilez-la » : la carte reste en exil, et ne se relance plus.
      const again = exiled(s, "Lightning Strike")[0] as string;
      expect(again).toBeDefined();
      expect(castOptions(s, "p1", again)).toHaveLength(0);
    });
  });
});

describe("Secrets of Strixhaven, lot A — incolores et terrains", () => {
  /**
   * Secrets of Strixhaven, lot A — cartes incolores et terrains : chaque carte est confrontée à son texte Oracle (plan R,
   * lot R7). Avatars à convergence (The Dawning Archaic, Rancorous, Sundering et Transcendent Archaic), préparation
   * (Biblioplex Tomekeeper, Skycoach Waypoint), Diary of Dreams, Mage Tower Referee, Page, Loose Leaf, Potioner's Trove,
   * Strixhaven Skycoach et les terrains.
   */
  type S = GameState;
  const FIVE_COLORS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Rituel incolore à {0} : « rien ». */
  const FREE_SORCERY = customCard({
    name: "Rituel gratuit",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: spell([], []),
  });

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority" && p.castNow) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.intent === "may" ? [1] : undefined);
  const no: Answer = (req) => (req.intent === "may" ? [0] : undefined);
  const canCast = (s: S, player: string, name: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === idOf(s, player, "hand", name));
  const activation = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
  /** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
  const activate = (
    s: S,
    player: string,
    source: string,
    label?: string,
    targets?: Record<string, string[]>,
    extra: object = {},
  ) => {
    const a = activation(s, player, source, label);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const attackWith = (s: S, id: string) => {
    const t = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(t, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
  };

  describe("The Dawning Archaic", () => {
    it("coûte {1} de moins par carte d'éphémère ou de rituel de votre cimetière ; portée", () => {
      const run = (landCount: number) =>
        scenario({
          p1: {
            battlefield: lands("Mountain", landCount),
            hand: ["The Dawning Archaic"],
            graveyard: ["Lightning Strike", "Opt", "Opt", "Bear Cub"],
          },
        });
      expect(canCast(run(6), "p1", "The Dawning Archaic")).toBe(false);
      let s = run(7);
      expect(canCast(s, "p1", "The Dawning Archaic")).toBe(true);
      s = settle(cast(s, "p1", "The Dawning Archaic"));
      const archaic = idOf(s, "p1", "battlefield", "The Dawning Archaic");
      expect(chars(s, archaic).keywords).toContain("reach");
      expect(pt(s, archaic)).toEqual([7, 7]);
    });

    it("en attaquant : lance gratuitement un éphémère du cimetière, qui est exilé au lieu d'y retourner", () => {
      let s = scenario({ p1: { battlefield: ["The Dawning Archaic"], graveyard: ["Lightning Strike"] } });
      const archaic = idOf(s, "p1", "battlefield", "The Dawning Archaic");
      s = settle(attackWith(s, archaic));
      const offer = castNowOf(s);
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(offer?.cards).toContain(strike);
      s = settle(act(s, "p1", { type: "cast", card: strike, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(10);
    });
  });

  describe("Convergence : Rancorous Archaic", () => {
    it("un marqueur +1/+1 par couleur de mana dépensée ; portée et piétinement", () => {
      const run = (manaLands: string[]) => {
        const s = settle(
          cast(scenario({ p1: { battlefield: manaLands, hand: ["Rancorous Archaic"] } }), "p1", "Rancorous Archaic"),
        );
        return { s, id: idOf(s, "p1", "battlefield", "Rancorous Archaic") };
      };
      const five = run(FIVE_COLORS);
      expect(pt(five.s, five.id)).toEqual([7, 7]);
      expect(five.s.objects[five.id]?.counters["+1/+1"]).toBe(5);
      expect(chars(five.s, five.id).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
      const one = run(lands("Forest", 5));
      expect(pt(one.s, one.id)).toEqual([3, 3]);
    });
  });

  describe("Convergence : Sundering Archaic", () => {
    const board = (manaLands: string[]) =>
      scenario({
        p1: { battlefield: manaLands, hand: ["Sundering Archaic"] },
        p2: { battlefield: ["Serra Angel", "Forest"], graveyard: ["Opt"] },
      });

    it("exile un permanent non-terrain adverse de valeur de mana au plus le nombre de couleurs dépensées", () => {
      let s = board([...FIVE_COLORS, "Forest"]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Sundering Archaic"), (req) =>
        req.intent === "triggerTarget" && req.type === "pick" ? [angel] : undefined,
      );
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("avec trois couleurs dépensées, un permanent de valeur de mana 5 reste en jeu", () => {
      let s = board(["Island", "Mountain", ...lands("Forest", 4)]);
      s = settle(cast(s, "p1", "Sundering Archaic"));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Serra Angel")).toHaveLength(0);
    });

    it("{2} : met une carte d'un cimetière au-dessous de la bibliothèque de son propriétaire", () => {
      let s = scenario({
        p1: { battlefield: ["Sundering Archaic", ...lands("Forest", 2)] },
        p2: { graveyard: ["Opt"], library: lands("Island", 3) },
      });
      const archaic = idOf(s, "p1", "battlefield", "Sundering Archaic");
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = settle(activate(s, "p1", archaic, "au-dessous", { t: [opt] }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      // Une carte qui change de zone devient un nouvel objet (400.7) : on la reconnaît à son nom.
      expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe("Opt");
      expect(s.players.p2?.library).toHaveLength(4);
    });
  });

  describe("Convergence : Transcendent Archaic", () => {
    it("vous pouvez piocher X cartes (X = couleurs dépensées), puis vous défaussez deux cartes", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Island", "Mountain", ...lands("Forest", 5)], hand: ["Transcendent Archaic"] },
        });
      let s = settle(cast(start(), "p1", "Transcendent Archaic"), yes);
      expect(chars(s, idOf(s, "p1", "battlefield", "Transcendent Archaic")).keywords).toContain("vigilance");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      s = settle(cast(start(), "p1", "Transcendent Archaic"), no);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });
  });

  describe("Préparation : Biblioplex Tomekeeper et Skycoach Waypoint", () => {
    it("Biblioplex Tomekeeper : une créature ciblée devient préparée", () => {
      let s = scenario({ p1: { battlefield: ["Emeritus of Ideation", ...lands("Plains", 4)], hand: ["Biblioplex Tomekeeper"] } });
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      s = settle(cast(s, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.intent === "triggerTarget" ? [emeritus] : undefined,
      );
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Ancestral Recall")[0]);
    });

    it("Biblioplex Tomekeeper : une créature ciblée cesse d'être préparée (ou aucune cible)", () => {
      const start = () =>
        scenario({
          p1: {
            battlefield: [...lands("Island", 5), ...lands("Plains", 4)],
            hand: ["Emeritus of Ideation", "Biblioplex Tomekeeper"],
          },
        });
      let s = settle(cast(start(), "p1", "Emeritus of Ideation"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      s = settle(cast(s, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.intent === "triggerTarget" ? [emeritus] : undefined,
      );
      expect(exiled(s, "Ancestral Recall")).toHaveLength(0);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      // « Jusqu'à un » : aucune cible choisie, la créature reste préparée.
      let t = settle(cast(start(), "p1", "Emeritus of Ideation"));
      t = settle(cast(t, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.intent === "triggerTarget" ? [] : undefined,
      );
      expect(exiled(t, "Ancestral Recall")).toHaveLength(1);
    });

    it("Skycoach Waypoint : {T} pour {C} ; {3}, {T} : une créature ciblée devient préparée (sans effet sans sort préparé)", () => {
      let s = scenario({ p1: { battlefield: ["Skycoach Waypoint", "Emeritus of Ideation", "Bear Cub", ...lands("Plains", 3)] } });
      const waypoint = idOf(s, "p1", "battlefield", "Skycoach Waypoint");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === waypoint ? a.colors : []));
      expect(colors).toEqual(["C"]);
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      s = settle(activate(s, "p1", waypoint, "préparée", { t: [emeritus] }));
      expect(s.objects[waypoint]?.tapped).toBe(true);
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Ancestral Recall")[0]);
      let t = scenario({ p1: { battlefield: ["Skycoach Waypoint", "Bear Cub", ...lands("Plains", 3)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Skycoach Waypoint"), "préparée", { t: [bear] }));
      expect(t.objects[bear]?.preparedCopy).toBeUndefined();
      expect(t.exile).toHaveLength(0);
    });
  });

  describe("Diary of Dreams", () => {
    it("un marqueur page par éphémère ou rituel lancé ; la pioche coûte {1} de moins par marqueur page", () => {
      let s = scenario({
        p1: { battlefield: ["Diary of Dreams", ...lands("Island", 2)], hand: [FREE_SORCERY, FREE_SORCERY, FREE_SORCERY] },
      });
      const diary = idOf(s, "p1", "battlefield", "Diary of Dreams");
      expect(activation(s, "p1", diary, "Piochez")).toBeUndefined();
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      expect(s.objects[diary]?.counters.page).toBe(2);
      // Deux terrains : {5} − 2 = {3}, trop cher.
      expect(activation(s, "p1", diary, "Piochez")).toBeUndefined();
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      expect(s.objects[diary]?.counters.page).toBe(3);
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", diary, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.objects[diary]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(s.objects[diary]?.counters.page).toBe(3);
    });

    it("un sort de créature n'ajoute pas de marqueur page", () => {
      let s = scenario({ p1: { battlefield: ["Diary of Dreams", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Diary of Dreams")]?.counters.page ?? 0).toBe(0);
    });
  });

  describe("Mage Tower Referee", () => {
    it("chaque sort multicolore lancé : un marqueur +1/+1 ; pas pour un sort monocolore", () => {
      let s = scenario({
        p1: { battlefield: ["Mage Tower Referee", ...lands("Island", 2), "Mountain"], hand: ["Prismari Charm", "Opt"] },
      });
      const referee = idOf(s, "p1", "battlefield", "Mage Tower Referee");
      expect(pt(s, referee)).toEqual([2, 1]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, referee)).toEqual([2, 1]);
      s = settle(cast(s, "p1", "Prismari Charm", undefined, { mode: 0 }));
      expect(pt(s, referee)).toEqual([3, 2]);
    });
  });

  describe("Page, Loose Leaf", () => {
    it("{T} : ajoutez {C} ; Grandeur : défaussez une autre Page pour révéler jusqu'à un éphémère ou un rituel", () => {
      let s = scenario({
        p1: {
          battlefield: ["Page, Loose Leaf"],
          hand: ["Page, Loose Leaf", "Bear Cub"],
          library: ["Forest", "Bear Cub", "Opt", "Island", "Swamp"],
        },
      });
      const page = idOf(s, "p1", "battlefield", "Page, Loose Leaf");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === page ? a.colors : []));
      expect(colors).toEqual(["C"]);
      // Défausser une carte qui ne s'appelle pas Page, Loose Leaf est refusé.
      expect(() => activate(s, "p1", page, "Grandeur", undefined, { discard: [idOf(s, "p1", "hand", "Bear Cub")] })).toThrow();
      s = settle(activate(s, "p1", page, "Grandeur", undefined, { discard: [idOf(s, "p1", "hand", "Page, Loose Leaf")] }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Page, Loose Leaf"]);
      const library = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
      expect(library.slice(0, 2)).toEqual(["Island", "Swamp"]);
      expect(library.slice(2).sort()).toEqual(["Bear Cub", "Forest"]);
    });
  });

  describe("Potioner's Trove", () => {
    it("{T} : un mana de n'importe quelle couleur ; {T} : 2 PV, seulement après un éphémère ou un rituel ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Potioner's Trove", "Island"], hand: ["Opt"] } });
      const trove = idOf(s, "p1", "battlefield", "Potioner's Trove");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === trove ? a.colors : []));
      expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(activation(s, "p1", trove, "PV")).toBeUndefined();
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[trove]?.tapped).toBe(false);
      s = settle(activate(s, "p1", trove, "PV"));
      expect(s.players.p1?.life).toBe(22);
    });
  });

  describe("Strixhaven Skycoach", () => {
    it("en arrivant, vous pouvez chercher une carte de terrain de base pour votre main ; vol et Équipage 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Strixhaven Skycoach"], library: ["Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Strixhaven Skycoach"), (req) =>
        req.intent === "may"
          ? [1]
          : req.intent === "search" && req.type === "pick"
            ? req.options.filter((id) => nameOf(s, String(id)) === "Island")
            : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const coach = idOf(s, "p1", "battlefield", "Strixhaven Skycoach");
      expect(chars(s, coach).keywords).toContain("flying");
      expect(chars(s, coach).types).not.toContain("Creature");
      expect(activation(s, "p1", coach, "Équipage")).toBeUndefined();
      let t = scenario({ p1: { battlefield: ["Strixhaven Skycoach", "Bear Cub"] } });
      const c2 = idOf(t, "p1", "battlefield", "Strixhaven Skycoach");
      t = settle(activate(t, "p1", c2, "Équipage"));
      expect(chars(t, c2).types).toContain("Creature");
      expect(pt(t, c2)).toEqual([3, 2]);
    });
  });

  describe("Terrains", () => {
    it("terrains à surveillance : arrivent engagés ; deux couleurs ; {2}{X}{Y}, {T} : surveillance 1", () => {
      const expected: Record<string, string[]> = {
        "Fields of Strife": ["R", "W"],
        "Forum of Amity": ["B", "W"],
        "Paradox Gardens": ["G", "U"],
        "Spectacle Summit": ["R", "U"],
        "Titan's Grave": ["B", "G"],
      };
      for (const [name, pair] of Object.entries(expected)) {
        let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: [name] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
        expect(s.objects[idOf(s, "p1", "battlefield", name)]?.tapped).toBe(true);
        const t = scenario({ p1: { battlefield: [name] } });
        const id = idOf(t, "p1", "battlefield", name);
        const colors = legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        expect(colors.sort()).toEqual(pair);
      }
      // Surveillance 1 : la carte du dessus va au cimetière si vous le voulez.
      let s = scenario({
        p1: { battlefield: ["Fields of Strife", "Mountain", "Plains", ...lands("Plains", 2)], library: ["Opt", "Island"] },
      });
      const fields = idOf(s, "p1", "battlefield", "Fields of Strife");
      const top = s.players.p1?.library[0] as string;
      s = settle(activate(s, "p1", fields, "Surveillance"), (req) =>
        req.type === "pick" && req.options.includes(top) ? [top] : undefined,
      );
      expect(s.objects[fields]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("Dreamroot Cascade : arrive engagé sauf si vous contrôlez deux autres terrains ou plus ; {G} ou {U}", () => {
      const play = (others: number) => {
        let s = scenario({ p1: { battlefield: lands("Plains", others), hand: ["Dreamroot Cascade"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dreamroot Cascade") });
        const id = idOf(s, "p1", "battlefield", "Dreamroot Cascade");
        const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        return { tapped: s.objects[id]?.tapped, colors: colors.sort() };
      };
      expect(play(1).tapped).toBe(true);
      expect(play(2)).toEqual({ tapped: false, colors: ["G", "U"] });
    });

    it("Terramorphic Expanse : {T}, sacrifiez-le : un terrain de base de la bibliothèque arrive engagé", () => {
      let s = scenario({ p1: { battlefield: ["Terramorphic Expanse"], library: ["Bear Cub", "Mountain", "Opt"] } });
      const expanse = idOf(s, "p1", "battlefield", "Terramorphic Expanse");
      s = settle(activate(s, "p1", expanse));
      expect(idsOf(s, "p1", "battlefield", "Terramorphic Expanse")).toHaveLength(0);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Terramorphic Expanse"]);
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

describe("Secrets of Strixhaven, lot B1 : sorts avec {X} dans leur coût", () => {
  /** Rituel {X}{U} : « piochez une carte ». */
  const XSPELL = customCard({
    name: "Équation d'essai",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    colors: ["U"],
    manaCost: { generic: 0, colored: { U: 1 }, x: 1 },
    manaCostText: "{X}{U}",
    spell: spell([], [fx.draw(1)]),
  });

  it("Matterbending Mage : renvoie une autre créature ; un sort avec {X} la rend imblocable ce tour-ci, pas un autre", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Matterbending Mage", XSPELL, "Opt"], library: lands("Island", 5) },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Matterbending Mage"));
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    const mage = idOf(s, "p1", "battlefield", "Matterbending Mage");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, mage).keywords).not.toContain("unblockable");
    s = settle(cast(s, "p1", XSPELL.name, undefined, { x: 1 }));
    expect(chars(s, mage).keywords).toContain("unblockable");
  });

  it("Geometer's Arthropod : un sort avec {X} : les X cartes du dessus, une en main, les autres au-dessous", () => {
    let s = scenario({
      p1: {
        battlefield: ["Geometer's Arthropod", ...lands("Island", 4)],
        hand: [XSPELL],
        library: ["Opt", "Bear Cub", "Serra Angel", "Shivan Dragon", "Forest"],
      },
    });
    s = settle(cast(s, "p1", XSPELL.name, undefined, { x: 3 }), (req) => {
      if (req.type !== "pick") return undefined;
      const angel = req.options.find((id) => nameOf(s, id) === "Serra Angel");
      // Seules les trois cartes du dessus sont proposées.
      expect(req.options.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(false);
      return angel ? [angel] : undefined;
    });
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    // La pioche du rituel a pris « Opt » ou le Dragon selon l'ordre : le Dragon est désormais au-dessus des deux autres.
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib.slice(-2).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Paradox Surveyor : cinq cartes, un terrain ou une carte avec {X} en main ; pas une autre carte", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), "Island"],
        hand: ["Paradox Surveyor"],
        library: ["Bear Cub", XSPELL, "Opt", "Serra Angel", "Island", "Shivan Dragon"],
      },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Paradox Surveyor"), (req) => {
      if (req.type !== "pick") return undefined;
      offered = req.options.map((id) => nameOf(s, id) ?? "");
      return [req.options.find((id) => nameOf(s, id) === XSPELL.name) as string];
    });
    expect(offered.sort()).toEqual(["Island", XSPELL.name].sort());
    expect(idsOf(s, "p1", "hand", XSPELL.name)).toHaveLength(1);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))[0]).toBe("Shivan Dragon");
  });
});

describe("Secrets of Strixhaven, lot B2 : couleurs dépensées pour le sort déclencheur", () => {
  it("Magmablood Archaic : convergence en arrivant ; un éphémère : vos créatures +1/+0 par couleur dépensée pour lui", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Forest", "Island", "Plains", "Swamp", "Bear Cub"],
        hand: ["Magmablood Archaic", "Lightning Strike"],
      },
    });
    s = settle(cast(s, "p1", "Magmablood Archaic"));
    const archaic = idOf(s, "p1", "battlefield", "Magmablood Archaic");
    // {2/R}{2/R}{2/R} payé avec cinq terrains de cinq couleurs : cinq marqueurs.
    expect(s.objects[archaic]?.counters["+1/+1"]).toBe(5);
    let t = scenario({
      p1: { battlefield: ["Magmablood Archaic", "Bear Cub", "Mountain", "Forest"], hand: ["Lightning Strike"] },
    });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Lightning Strike", { t: ["p2"] }));
    // {1}{R} payé avec une Montagne et une Forêt : deux couleurs.
    expect(chars(t, bear).power).toBe(4);
    expect(chars(t, bear).toughness).toBe(2);
  });

  it("Wildgrowth Archaic : un sort de créature arrive avec un marqueur +1/+1 par couleur dépensée pour lui", () => {
    // 0/0 : deux marqueurs pour qu'il survive.
    let s = scenario({
      p1: { battlefield: [{ name: "Wildgrowth Archaic", counters: { "+1/+1": 2 } }, "Forest", "Island"], hand: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });
});

describe("Secrets of Strixhaven, lot B3 : coûts", () => {
  it("Group Project : un Esprit 2/2 ; flashback en engageant trois créatures dégagées (sans mana), puis exil", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves", "Plains", "Plains"], hand: ["Group Project"] },
    });
    s = settle(cast(s, "p1", "Group Project"));
    expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
    const card = idOf(s, "p1", "graveyard", "Group Project");
    // Quatre créatures dégagées (l'Esprit compris) : le flashback est possible sans mana.
    for (const id of s.battlefield) {
      const o = s.objects[id];
      if (o && nameOf(s, id) === "Plains") o.tapped = true;
    }
    expect(castOptions(s, "p1", card)).not.toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card }));
    expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(2);
    expect(exiled(s, "Group Project")).toHaveLength(1);
    const tappedCreatures = s.battlefield.filter((id) => chars(s, id).types.includes("Creature") && s.objects[id]?.tapped);
    expect(tappedCreatures).toHaveLength(3);
    // Deux créatures dégagées seulement : pas de flashback.
    const t = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub"], graveyard: ["Group Project"] } });
    expect(castOptions(t, "p1", idOf(t, "p1", "graveyard", "Group Project"))).toHaveLength(0);
  });

  it("Soaring Stoneglider : exilez deux cartes de votre cimetière ou payez {1}{W} en plus", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Soaring Stoneglider"], graveyard: ["Opt", "Bear Cub"] } });
    const card = idOf(s, "p1", "hand", "Soaring Stoneglider");
    s = settle(act(s, "p1", { type: "cast", card, kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Soaring Stoneglider")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(2);
    // Sans exiler : {2}{W} + {1}{W}.
    let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Soaring Stoneglider"], graveyard: ["Opt"] } });
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Soaring Stoneglider") }));
    expect(idsOf(t, "p1", "battlefield", "Soaring Stoneglider")).toHaveLength(1);
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(5);
    // Un seul terrain de trop peu, une seule carte au cimetière : impossible.
    const u = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Soaring Stoneglider"], graveyard: ["Opt"] } });
    expect(castOptions(u, "p1", idOf(u, "p1", "hand", "Soaring Stoneglider"))).toHaveLength(0);
  });

  it("Brush Off : {1}{U} de moins s'il cible un sort d'éphémère ou de rituel ; prix plein pour un sort de créature", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Brush Off"] },
      p2: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike", "Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = passUntil(s, (x) => x.pending?.player === "p1");
    const strike = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Brush Off"), targets: { t: [strike] } });
    s = settle(s);
    expect(s.players.p1?.life).toBe(20);
    expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    // Un sort de créature : {2}{U}{U}, impayable avec deux Îles.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Brush Off"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
    t = passUntil(t, (x) => x.pending?.player === "p1");
    const bear = t.stack[0]?.id as string;
    expect(() => act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Brush Off"), targets: { t: [bear] } })).toThrow();
  });
});

describe("Secrets of Strixhaven, lot C1 : moitiés par joueur, exil jouable, marqueurs mis, prochaine phase principale", () => {
  it("Pox Plague : chaque joueur perd la moitié de ses PV, défausse la moitié de sa main, sacrifie la moitié de ses permanents (à l'inférieur)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Pox Plague", "Opt", "Opt", "Opt", "Opt"] },
      p2: { life: 15, battlefield: ["Bear Cub", "Forest", "Forest"], hand: ["Opt", "Opt", "Opt"] },
    });
    s = settle(cast(s, "p1", "Pox Plague"));
    expect(s.players.p1?.life).toBe(10);
    expect(s.players.p2?.life).toBe(8);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1")).toHaveLength(3);
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(2);
  });

  it("Suspend Aggression : un permanent non-terrain et votre carte du dessus exilés, jouables par leur propriétaire jusqu'à la fin de son prochain tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Plains", "Island", "Island"],
        hand: ["Suspend Aggression"],
        library: ["Opt", ...lands("Island", 8)],
      },
      p2: { battlefield: ["Bear Cub", "Forest", "Forest"], library: lands("Forest", 8) },
    });
    s = settle(cast(s, "p1", "Suspend Aggression", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    const bear = exiled(s, "Bear Cub")[0] as string;
    const opt = exiled(s, "Opt")[0] as string;
    expect(bear && opt).toBeTruthy();
    expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
    // Tour de l'adversaire (4) : il peut lancer son Ours.
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(castOptions(s, "p2", bear)).not.toHaveLength(0);
    // Votre prochain tour (5) : Opt reste jouable ; l'Ours ne l'est plus pour l'adversaire au tour 6.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.number === 6 && x.turn.step === "main1");
    expect(castOptions(s, "p2", bear)).toHaveLength(0);
  });

  it("Fractal Tender : à chaque étape de fin, si vous avez mis un marqueur sur elle ce tour-ci, une Fractale avec trois marqueurs", () => {
    const big = customCard({
      name: "Rituel à quatre",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 4, colored: {}, x: 0 },
      manaCostText: "{4}",
      spell: spell([], [fx.draw(1)]),
    });
    let s = scenario({
      p1: { battlefield: ["Fractal Tender", ...lands("Island", 4)], hand: [big], library: lands("Island", 5) },
    });
    const tender = idOf(s, "p1", "battlefield", "Fractal Tender");
    s = settle(cast(s, "p1", big.name));
    // Increment : 4 mana > 3.
    expect(s.objects[tender]?.counters["+1/+1"]).toBe(1);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.turn.number === 3);
    s = settle(s);
    const fractals = idsOf(s, "p1", "battlefield", "Fractal");
    expect(fractals).toHaveLength(1);
    expect(s.objects[fractals[0] as string]?.counters["+1/+1"]).toBe(3);
    // Tour suivant (adversaire) : aucun marqueur mis, pas de Fractale.
    s = advanceUntil(s, (x) => x.turn.number === 5);
    expect(idsOf(s, "p1", "battlefield", "Fractal")).toHaveLength(1);
  });

  it("Mana Sculpt : contrecarre ; avec un Sorcier, {C} égal au mana dépensé pour ce sort au début de votre prochaine phase principale", () => {
    let s = scenario({
      active: "p2",
      turn: 4,
      p1: { battlefield: ["Pensive Professor", ...lands("Island", 3)], hand: ["Mana Sculpt"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = passUntil(s, (x) => x.pending?.player === "p1");
    const strike = s.stack[0]?.id as string;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mana Sculpt"), targets: { t: [strike] } }));
    expect(s.players.p1?.life).toBe(20);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.manaPool.C).toBe(2);
  });
});

describe("Secrets of Strixhaven, lot C2 : sort gratuit une fois par tour, copies", () => {
  it("Zaffai and the Tempests : une fois pendant chacun de vos tours, un éphémère ou un rituel de votre main sans payer", () => {
    let s = scenario({
      p1: { battlefield: ["Zaffai and the Tempests"], hand: ["Lightning Strike", "Lightning Strike", "Bear Cub"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] }, free: true }));
    expect(s.players.p2?.life).toBe(17);
    // La permission est utilisée pour ce tour.
    expect(castOptions(s, "p1", b as string)).toHaveLength(0);
    // Pendant le tour de l'adversaire : pas de sort gratuit.
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1" && x.pending?.player === "p1");
    expect(castOptions(s, "p1", b as string)).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(castOptions(s, "p1", b as string)).not.toHaveLength(0);
  });

  it("Choreographed Sparks : copie un éphémère que vous contrôlez ; ne peut pas lui-même être copié", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike", "Choreographed Sparks"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    const strike = s.stack[0]?.id as string;
    const card = idOf(s, "p1", "hand", "Choreographed Sparks");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Copiez un sort d'éphémère")) : undefined;
    expect(mode).toBeDefined();
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { a: [strike] } }));
    expect(s.players.p2?.life).toBe(14);
    expect(Object.values(s.defs).find((d) => d.name === "Choreographed Sparks")?.cantBeCopied).toBe(true);
  });

  it("Choreographed Sparks : la copie d'un sort de créature a la célérité et est sacrifiée au début de l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), ...lands("Forest", 2)], hand: ["Bear Cub", "Choreographed Sparks"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const bearSpell = s.stack[0]?.id as string;
    const card = idOf(s, "p1", "hand", "Choreographed Sparks");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Copiez un sort de créature")) : undefined;
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { b: [bearSpell] } }));
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    const token = bears.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Secrets of Strixhaven, lot C3 : cascade et miracle", () => {
  /** Joue la résolution en lançant (ou non) la carte proposée par un « lancer maintenant ». */
  const resolveAll = (s: S, castIt: boolean, max = 80) => {
    let cur = s;
    for (let i = 0; i < max && cur.stack.length + cur.triggers.length + (cur.pending?.kind === "choice" ? 1 : 0) > 0; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && p.castNow) {
        const card = p.castNow.cards[0] as string;
        cur = act(cur, p.player, castIt ? { type: "cast", card, targets: { t: ["p2"] } } : { type: "pass" });
      } else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else break;
    }
    return cur;
  };

  it("Quandrix, the Proof : cascade (une carte non-terrain de VM inférieure, lancée gratuitement ; le reste dessous)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), ...lands("Island", 3)],
        hand: ["Quandrix, the Proof"],
        library: ["Island", "Shivan Dragon", "Lightning Strike", "Forest", "Plains"],
      },
    });
    s = resolveAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Quandrix, the Proof") }), true);
    expect(idsOf(s, "p1", "battlefield", "Quandrix, the Proof")).toHaveLength(1);
    // Shivan Dragon (VM 6) n'est pas de VM inférieure à 6 : Lightning Strike est lancée gratuitement.
    expect(s.players.p2?.life).toBe(17);
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib.slice(0, 2)).toEqual(["Forest", "Plains"]);
    expect(lib.slice(2).sort()).toEqual(["Island", "Shivan Dragon"]);
  });

  it("Quandrix, the Proof : vos éphémères et rituels lancés depuis la main ont la cascade ; refusé, la carte va dessous", () => {
    let s = scenario({
      p1: {
        battlefield: ["Quandrix, the Proof", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        library: ["Forest", "Opt", "Plains"],
      },
    });
    s = resolveAll(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }),
      false,
    );
    expect(s.players.p2?.life).toBe(17);
    // Opt (VM 1 < 2) proposé et refusé : il va au-dessous, Plains reste au-dessus.
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib[0]).toBe("Plains");
    expect(lib.slice(1).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Lorehold, the Historian : la première carte piochée du tour, un éphémère ou un rituel, peut être lancée pour {2}", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: {
        battlefield: ["Lorehold, the Historian", ...lands("Plains", 2)],
        library: ["Lightning Strike", "Lightning Strike", ...lands("Plains", 5)],
      },
    });
    // Tour 3 de p1 : la pioche de l'étape de pioche est la première du tour.
    s = advanceUntil(s, (x) => x.turn.number === 3 && !!castNowOf(x));
    const offer = castNowOf(s);
    expect(offer).toBeDefined();
    s = resolveAll(s, true);
    expect(s.players.p2?.life).toBe(17);
    // Deux Plaines engagées : le coût de miracle {2} (et non {1}{R}).
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Lorehold, the Historian : à l'entretien adverse, vous pouvez défausser une carte pour en piocher une", () => {
    let s = scenario({
      active: "p1",
      p1: { battlefield: ["Lorehold, the Historian"], hand: ["Opt"], library: lands("Plains", 5) },
    });
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.pending?.kind === "choice" && x.pending.request.intent === "discard");
    const p = s.pending;
    if (p?.kind === "choice") s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "Opt")] });
    s = settle(s);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Plains"]);
  });
});
