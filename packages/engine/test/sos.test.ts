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
import type { AbilityDef, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import {
  act,
  advanceUntil,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  passAccepting,
  passUntil,
  scenario,
  untilCastNow,
} from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

/** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
    else break;
  }
  return cur;
};
const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Répond `ids` à la première demande « pick » qui les propose tous. */
  const pickIds =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
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
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
