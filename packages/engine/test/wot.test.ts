/** Enchanting Tales (WOT) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, drawCards, gainLife } from "../src/actions";
import { target } from "../src/dsl";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { changeCounters, chars } from "../src/state";
import { legalTargets } from "../src/targets";
import { stateBasedActions } from "../src/turn";
import { act, advanceUntil, castable, idOf, idsOf, lands, scenario, settle } from "./helpers";

describe("Enchanting Tales", () => {
  describe("Blind Obedience", () => {
    it("extorsion : à chaque sort lancé, payer {W/B} fait perdre 1 PV à chaque adversaire et vous en fait gagner autant", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2), "Plains"], hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([22, 19, 19]);
    });

    it("les artefacts et créatures de vos adversaires arrivent engagés ; pas les vôtres", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Blind Obedience"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      let t = scenario({ p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bear Cub") }), () => [0]);
      expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });
  });

  describe("G5 : Enchanting Tales", () => {
    type S = ReturnType<typeof scenario>;
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: S, source: string, extra: object = {}) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Intangible Virtue : vos jetons de créature gagnent +1/+1 et la vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Intangible Virtue", ...lands("Mountain", 2)], hand: ["Dragon Fodder"] } });
      s = settle(castIt(s, "Dragon Fodder"));
      const gob = idOf(s, "p1", "battlefield", "Goblin");
      expect([chars(s, gob).power, chars(s, gob).keywords.includes("vigilance")]).toEqual([2, true]);
    });

    it("Griffin Aerie : un Griffon à votre étape de fin si vous avez gagné 3 PV ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Griffin Aerie"] } });
      gainLife(s, "p1", 3);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Griffin")).toHaveLength(1);
    });

    it("Land Tax : à l'entretien, si un adversaire a plus de terrains, jusqu'à trois terrains de base en main", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Land Tax", "Plains"], library: lands("Plains", 6) },
        p2: { battlefield: lands("Forest", 2) },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "hand", "Plains").length).toBeGreaterThanOrEqual(3);
      let t = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Land Tax", "Plains", "Plains"], library: lands("Plains", 6) },
        p2: { battlefield: lands("Forest", 2) },
      });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(idsOf(t, "p1", "hand", "Plains")).toHaveLength(1);
    });

    it("Smothering Tithe : un adversaire pioche ; sans payer {2}, un Trésor", () => {
      let s = scenario({ p1: { battlefield: ["Smothering Tithe"] }, p2: { library: lands("Forest", 3) } });
      drawCards(s, "p2", 1);
      s = settle(s, () => [0]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Copy Enchantment : arrive comme copie d'un enchantement", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Copy Enchantment"] },
        p2: { battlefield: ["Intangible Virtue"] },
      });
      s = settle(castIt(s, "Copy Enchantment"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      const copy = s.battlefield.find(
        (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Enchantment"),
      ) as string;
      expect(chars(s, copy).name).toBe("Intangible Virtue");
    });

    it("Forced Fruition et Oppression : un adversaire lance un sort, il pioche sept cartes ; il défausse une carte", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Forced Fruition", "Oppression"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"], library: lands("Forest", 10) },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p2?.hand).toHaveLength(6);
    });

    it("Hatching Plans : mis au cimetière depuis le champ de bataille, piochez trois cartes", () => {
      let s = scenario({ p1: { battlefield: ["Hatching Plans"], library: lands("Island", 5) } });
      destroy(s, idOf(s, "p1", "battlefield", "Hatching Plans"));
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Leyline of Anticipation : vos sorts comme s'ils avaient le flash", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Leyline of Anticipation", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Spreading Seas : le terrain enchanté est une Île", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Spreading Seas"] },
        p2: { battlefield: ["Ancient Tomb"] },
      });
      const tomb = idOf(s, "p2", "battlefield", "Ancient Tomb");
      s = settle(castIt(s, "Spreading Seas", { targets: { [enchantSpec(s, "Spreading Seas")]: [tomb] } }));
      expect(chars(s, tomb).subtypes).toEqual(["Island"]);
      expect(manaAbilitiesOf(s, tomb).map((a) => a.produce)).toEqual([["U"]]);
    });

    it("Dark Tutelage : la carte du dessus en main, perte de PV égale à sa valeur de mana", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Dark Tutelage"], library: ["Shivan Dragon", "Forest", "Forest"] },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.players.p1?.life).toBe(14);
    });

    it("Grave Pact : une de vos créatures meurt, chaque adversaire sacrifie une créature", () => {
      let s = scenario({ p1: { battlefield: ["Grave Pact", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Sanguine Bond : vous gagnez des PV, l'adversaire ciblé en perd autant", () => {
      let s = scenario({ p1: { battlefield: ["Sanguine Bond"] } });
      gainLife(s, "p1", 4);
      s = settle(s);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Blood Moon et Prismatic Omen : les terrains non-base sont des Montagnes ; vos terrains ont tous les types de base", () => {
      const s = scenario({
        p1: { battlefield: ["Blood Moon", "Ancient Tomb"] },
        p2: { battlefield: ["Prismatic Omen", "Forest"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Ancient Tomb")).subtypes).toEqual(["Mountain"]);
      expect(manaAbilitiesOf(s, idOf(s, "p2", "battlefield", "Forest")).map((a) => a.produce[0])).toEqual([
        "G",
        "W",
        "U",
        "B",
        "R",
      ]);
    });

    it("Fiery Emancipation : vos sources infligent le triple des blessures", () => {
      let s = scenario({ p1: { battlefield: ["Fiery Emancipation", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "Shock", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Goblin Bombardment : sacrifiez une créature, 1 blessure", () => {
      let s = scenario({ p1: { battlefield: ["Goblin Bombardment", "Bear Cub"] } });
      s = settle(
        activate(s, idOf(s, "p1", "battlefield", "Goblin Bombardment"), {
          targets: { t: ["p2"] },
          sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
        }),
      );
      expect(s.players.p2?.life).toBe(19);
    });

    it("Mana Flare : un terrain engagé pour du mana en produit un de plus", () => {
      let s = scenario({ p1: { battlefield: ["Mana Flare", "Forest"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Repercussion : une créature blessée, autant de blessures à son contrôleur", () => {
      let s = scenario({
        p1: { battlefield: ["Repercussion", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      s = settle(castIt(s, "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Sneak Attack : une créature de la main avec la célérité, sacrifiée à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Sneak Attack", "Mountain"], hand: ["Shivan Dragon"] } });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Sneak Attack")), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(chars(s, dragon).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hardened Scales, Parallel Lives et Primal Vigor : marqueurs et jetons", () => {
      let s = scenario({
        p1: { battlefield: ["Hardened Scales", "Parallel Lives", ...lands("Mountain", 2), "Bear Cub"], hand: ["Dragon Fodder"] },
      });
      s = settle(castIt(s, "Dragon Fodder"));
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      changeCounters(s, s.objects[cub] as never, "+1/+1", 1);
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    });

    it("Unnatural Growth : au début du combat, la force et l'endurance de vos créatures doublent", () => {
      let s = scenario({ p1: { battlefield: ["Unnatural Growth", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, cub).power).toBe(4);
    });

    it("Utopia Sprawl : la Forêt enchantée produit un mana de plus de la couleur choisie", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Utopia Sprawl"] } });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(castIt(s, "Utopia Sprawl", { targets: { [enchantSpec(s, "Utopia Sprawl")]: [forest] } }), (req) =>
        req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
      );
      (s.objects[forest] as { tapped: boolean }).tapped = false;
      s = act(s, "p1", { type: "tapForMana", source: forest, ability: 0 });
      expect([s.players.p1?.manaPool.G, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    });
  });
  describe("G4e : règles de joueur", () => {
    it("Phyrexian Unlife : pas de défaite à 0 PV ; à 0 PV ou moins, les blessures donnent des marqueurs poison", () => {
      const s = scenario({ p1: { life: 2, battlefield: ["Phyrexian Unlife"] } });
      const src = { defId: "test", controller: "p2", keywords: [] };
      dealDamage(s, src, "p1", 3, false);
      stateBasedActions(s);
      expect(s.players.p1?.life).toBe(-1);
      expect(s.players.p1?.lost).toBe(false);
      dealDamage(s, src, "p1", 4, false);
      expect(s.players.p1?.life).toBe(-1);
      expect(s.players.p1?.poison).toBe(4);
    });

    it("Ground Seal : arrivée, piochez ; les cartes des cimetières ne peuvent être ciblées par personne", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Ground Seal"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ground Seal") }));
      expect(s.players.p1?.hand).toHaveLength(1);
      const spec = target.cardInGraveyard("t", {}, "any");
      expect(legalTargets(s, "p1", spec)).toEqual([]);
      expect(legalTargets(s, "p2", spec)).toEqual([]);
    });
  });
});

/** Identifiant de la cible d'enchantement d'une Aura. */
function enchantSpec(s: ReturnType<typeof scenario>, name: string): string {
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
  return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
}
