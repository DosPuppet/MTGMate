/**
 * Secrets of Strixhaven (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Préparation (Emeritus of Ideation), Opus (Colorstorm Stallion), Infusion (Moseo), Hardened
 * Academic, flashback (Practiced Offense, Daydream, Flashback), Witherbloom Charm, Professor Dellian Fel, Tablet of
 * Discovery, Dissection Practice et les terrains bicolores de l'extension.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passUntil, scenario } from "./helpers";

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
