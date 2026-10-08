/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « Counter Blitz » (Final Fantasy X). Marqueurs
 * déplacés et proliférés, multikicker, prévention changée en marqueurs, Sagas créatures, serments, retour volant.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  type Answer,
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

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);

describe("Counter Blitz (EDH)", () => {
  describe("commandant", () => {
    it("Tidus : au début du combat, un marqueur passe d'une de vos créatures à une autre", () => {
      let s = scenario({
        p1: { battlefield: ["Tidus, Yuna's Guardian", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      // La créature avec un marqueur est la seule source possible ; on choisit la destination.
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : picking([lions])(req)));
      expect([plusOne(s, bear), plusOne(s, lions)]).toEqual([1, 1]);
    });

    it("Tidus, encouragement : vos créatures avec des marqueurs blessent un joueur : piochez et proliférez, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tidus, Yuna's Guardian", { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          library: lands("Island", 5),
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const h = hand(s, "p1");
      // Au début du combat, le marqueur n'est pas déplacé.
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice", 50);
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      s = throughCombat(attack(s, [bear]), (req) =>
        req.type === "yesNo" ? [1] : req.type === "pick" && req.intent === "proliferate" ? req.options : undefined,
      );
      expect(hand(s, "p1")).toBe(h + 1);
      expect(plusOne(s, bear)).toBe(2);
    });
  });

  describe("marqueurs", () => {
    it("Everflowing Chalice : multikicker payé deux fois, deux marqueurs de charge, {C}{C}", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Everflowing Chalice"] } });
      s = settle(castIt(s, "p1", "Everflowing Chalice", { x: 2 }));
      const chalice = idOf(s, "p1", "battlefield", "Everflowing Chalice");
      expect(s.objects[chalice]?.counters.charge).toBe(2);
    });

    it("Gatta and Luzzu : les blessures à la créature choisie deviennent des marqueurs +1/+1 ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Mountain", "Bear Cub"], hand: ["Gatta and Luzzu", "Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Gatta and Luzzu"), picking([bear]));
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [bear] } }));
      expect([s.objects[bear]?.damage, plusOne(s, bear)]).toEqual([0, 2]);
    });

    it("Fathom Mage : évolution, puis un marqueur +1/+1 fait piocher", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Fathom Mage"], hand: ["Bear Cub"], library: lands("Island", 3) },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Bear Cub"), yes);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Fathom Mage"))).toBe(1);
      expect(hand(s, "p1")).toBe(h - 1 + 1);
    });

    it("Gyre Sage : {G} par marqueur +1/+1", () => {
      const s = scenario({ p1: { battlefield: [{ name: "Gyre Sage", counters: { "+1/+1": 3 } }] } });
      const sage = idOf(s, "p1", "battlefield", "Gyre Sage");
      const ab = chars(s, sage).abilities.find((a) => a.kind === "mana");
      expect(ab?.kind === "mana" ? ab.amountCounters : undefined).toBe("+1/+1");
    });

    it("Bane of Progress : détruit artefacts et enchantements, un marqueur par permanent détruit", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 6), hand: ["Bane of Progress"] },
        p2: { battlefield: ["Sol Ring", "Arcane Signet", "Propaganda"] },
      });
      s = settle(castIt(s, "p1", "Bane of Progress"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bane of Progress"))).toBe(3);
      expect(onField(s, "p2", "Sol Ring")).toBe(0);
    });

    it("Damning Verdict : seules les créatures sans marqueur sont détruites", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), { name: "Bear Cub", counters: { "+1/+1": 1 } }], hand: ["Damning Verdict"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Damning Verdict"));
      expect([onField(s, "p1", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([1, 0]);
    });

    it("Sin : ses marqueurs vont sur une de vos créatures quand elle meurt, puis elle rejoint la bibliothèque", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 2),
            "Swamp",
            { name: "Sin, Unending Cataclysm", counters: { "+1/+1": 4 } },
            "Bear Cub",
          ],
          hand: ["Vindicate"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const sin = idOf(s, "p1", "battlefield", "Sin, Unending Cataclysm");
      s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [sin] } }), picking([bear]));
      expect(plusOne(s, bear)).toBe(4);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Sin, Unending Cataclysm");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Sin, Unending Cataclysm");
    });
  });

  describe("« en arrivant » (PLAN-H H9)", () => {
    /** Passe jusqu'à ce que la carte nommée soit sur le champ de bataille (avant toute capacité déclenchée). */
    const untilOnField = (s: GameState, name: string, answer: Answer = () => undefined) => {
      let cur = s;
      for (let i = 0; i < 50 && onField(cur, "p1", name) === 0; i++) {
        const p = cur.pending;
        if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
        else if (p?.kind === "choice")
          cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
        else break;
      }
      return cur;
    };

    it("Sin : retire tous les marqueurs des permanents choisis (des deux camps) et arrive avec deux fois plus de marqueurs +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Forest", 5),
            ...lands("Island", 2),
            { name: "Bear Cub", counters: { "+1/+1": 2 } },
            { name: "Savannah Lions", counters: { "+1/+1": 1 } },
          ],
          hand: ["Sin, Unending Cataclysm"],
        },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1, stun: 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = castIt(s, "p1", "Sin, Unending Cataclysm");
      s = untilOnField(s, "Sin, Unending Cataclysm", picking([bear, angel]));
      // En arrivant : 2 + 1 + 1 marqueurs retirés, huit marqueurs +1/+1, déjà là quand il arrive.
      const sin = idOf(s, "p1", "battlefield", "Sin, Unending Cataclysm");
      expect(plusOne(s, sin)).toBe(8);
      expect([plusOne(s, bear), plusOne(s, angel), s.objects[angel]?.counters.stun ?? 0, plusOne(s, lions)]).toEqual([
        0, 0, 0, 1,
      ]);
    });

    it("Altered Ego : arrive en copie avec X marqueurs +1/+1 de plus ; remis en jeu par un effet, X vaut 0", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), ...lands("Island", 2)], hand: ["Altered Ego"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = castIt(s, "p1", "Altered Ego", { x: 2 });
      s = untilOnField(s, "Altered Ego", picking([angel]));
      const ego = idOf(s, "p1", "battlefield", "Altered Ego");
      expect(chars(s, ego).name).toBe("Serra Angel");
      expect(plusOne(s, ego)).toBe(2);
      let z = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Altered Ego"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel2 = idOf(z, "p2", "battlefield", "Serra Angel");
      z = settle(castIt(z, "p1", "Zombify", { targets: { t: [idOf(z, "p1", "graveyard", "Altered Ego")] } }), picking([angel2]));
      const back = idOf(z, "p1", "battlefield", "Altered Ego");
      expect(chars(z, back).name).toBe("Serra Angel");
      expect(plusOne(z, back)).toBe(0);
    });
  });

  describe("créatures et invocations", () => {
    it("Luminous Broodmoth : une de vos créatures sans le vol meurt et revient avec un marqueur de vol", () => {
      let s = scenario({ p1: { battlefield: ["Luminous Broodmoth", "Bear Cub", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Kimahri : un marqueur, engage une créature adverse et peut en devenir une copie (nom gardé)", () => {
      let s = scenario({ p1: { battlefield: ["Kimahri, Valiant Guardian"] }, p2: { battlefield: ["Serra Angel"] } });
      const k = idOf(s, "p1", "battlefield", "Kimahri, Valiant Guardian");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : picking([angel])(req)));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(chars(s, k).name).toBe("Kimahri, Valiant Guardian");
      expect([chars(s, k).power, chars(s, k).keywords.includes("flying"), chars(s, k).keywords.includes("vigilance")]).toEqual([
        5,
        true,
        true,
      ]);
    });

    it("Summon: Valefor, chapitre I : chaque adversaire renvoie en main une créature de plus grande valeur de mana", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Summon: Valefor"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Summon: Valefor"));
      expect([onField(s, "p2", "Serra Angel"), onField(s, "p2", "Bear Cub")]).toEqual([0, 1]);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
    });

    it("Wakka : à votre étape de fin, si Wakka a reçu un marqueur ce tour-ci, vos autres créatures en reçoivent un", () => {
      let s = scenario({ p1: { battlefield: ["Wakka, Devoted Guardian", "Bear Cub"] } });
      const wakka = idOf(s, "p1", "battlefield", "Wakka, Devoted Guardian");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = throughCombat(attack(s, [wakka]));
      expect(plusOne(s, wakka)).toBe(1);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 100);
      expect(plusOne(s, bear)).toBe(1);
    });
  });

  describe("sorts", () => {
    it("Collective Effort : escalade, deux modes pour {1} de plus", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Collective Effort"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Collective Effort");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      const modes = opt?.type === "cast" ? opt.modes : [];
      const both = modes.find((m) => m.label?.includes("power 4") && m.label.includes("target player"));
      expect(both).toBeDefined();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Collective Effort", { mode: both?.index, targets: { c: [angel], p: ["p1"] } }));
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Promise of Loyalty : chaque joueur garde une créature, avec un marqueur de serment, et sacrifie les autres", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Promise of Loyalty"] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Promise of Loyalty"), (req, p) =>
        p === "p2" && req.type === "pick" ? [idOf(s, "p2", "battlefield", "Savannah Lions")] : undefined,
      );
      expect([onField(s, "p2", "Serra Angel"), onField(s, "p2", "Savannah Lions")]).toEqual([1, 0]);
      expect(s.objects[angel]?.counters.vow).toBe(1);
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      // Les créatures avec un marqueur de serment ne peuvent pas attaquer le lanceur (ni ses planeswalkers).
      expect(chars(s, angel).blockRules.map((r) => r.cantAttackPlayer)).toEqual(["p1"]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2");
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] })).toThrow();
    });

    it("Yuna's Whistle : la première créature révélée va en main ; X marqueurs, X sa valeur de mana", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Bear Cub"],
          hand: ["Yuna's Whistle"],
          library: ["Island", "Serra Angel", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Yuna's Whistle"), picking([bear]));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
      expect(plusOne(s, bear)).toBe(5);
    });

    it("Temple of the False God : {C}{C} seulement avec cinq terrains ou plus", () => {
      const few = scenario({ p1: { battlefield: ["Temple of the False God", ...lands("Plains", 3)], hand: ["Serra Angel"] } });
      expect(castable(few, "p1", idOf(few, "p1", "hand", "Serra Angel"))).toBe(false);
      const many = scenario({ p1: { battlefield: ["Temple of the False God", ...lands("Plains", 4)], hand: ["Serra Angel"] } });
      expect(castable(many, "p1", idOf(many, "p1", "hand", "Serra Angel"))).toBe(true);
    });
  });
});

describe("joueur attaqué en multijoueur (PLAN-H, lot H5)", () => {
  /** p1 attaque : chaque créature nommée vers le défenseur donné (joueur, ou « walker » : l'Ajani de p2). */
  const attackWith = (s: GameState, attackers: [string, string][]) => {
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", {
      type: "declareAttackers",
      attackers: attackers.map(([name, d]) => ({
        id: idOf(s, "p1", "battlefield", name),
        defender: d === "walker" ? walker : d,
      })),
    });
  };

  it("Lulu, Stern Guardian : « un adversaire vous attaque » — pas vos planeswalkers ; la cible est une créature qui vous attaque", () => {
    const base = () =>
      scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Lulu, Stern Guardian", "Ajani Resolute"] },
      });
    let s = base();
    s = settle(attackWith(s, [["Bear Cub", "walker"]]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.stun ?? 0).toBe(0);

    s = base();
    const offered: string[][] = [];
    s = settle(
      attackWith(s, [
        ["Bear Cub", "p3"],
        ["Llanowar Elves", "p2"],
      ]),
      (req, _p, cur) => {
        if (req.type === "pick") offered.push(req.options.map((o) => nameOf(cur, String(o)) ?? String(o)));
        return undefined;
      },
    );
    // Une seule cible possible : choisie sans question ; la créature qui attaque p3 n'est jamais proposée.
    expect(offered.flat()).not.toContain("Bear Cub");
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters.stun).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.stun ?? 0).toBe(0);
  });
});
