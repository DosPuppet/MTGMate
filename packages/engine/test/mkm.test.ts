/**
 * Murders at Karlov Manor (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son
 * texte Oracle (plan R, lot R7).
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, scenario } from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;

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

describe("Murders at Karlov Manor", () => {
  describe("terrains à surveillance (Thundering Falls, Meticulous Archive, Underground Mortuary)", () => {
    it("arrivent engagés, puis surveillance 1 : la carte du dessus peut aller au cimetière", () => {
      let s = scenario({ p1: { hand: ["Thundering Falls"], library: ["Opt", "Forest", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Thundering Falls") });
      const falls = idOf(s, "p1", "battlefield", "Thundering Falls");
      expect(s.objects[falls]?.tapped).toBe(true);
      let asked: ChoiceRequest | undefined;
      s = settle(s, (req) => {
        if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
        asked = req;
        return req.options;
      });
      expect(asked).toBeDefined();
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("on peut garder la carte sur le dessus", () => {
      let s = scenario({ p1: { hand: ["Meticulous Archive"], library: ["Opt", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Meticulous Archive") });
      s = settle(s, (req) => (req.intent === "surveilGraveyard" ? [] : undefined));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Opt");
    });

    it("leurs types de terrain de base donnent leurs deux couleurs de mana", () => {
      const s = scenario({ p1: { battlefield: ["Thundering Falls", "Meticulous Archive", "Underground Mortuary"] } });
      const colors = (name: string) => {
        const id = idOf(s, "p1", "battlefield", name);
        expect(chars(s, id).subtypes).toHaveLength(2);
        return legalActions(s, "p1")
          .flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []))
          .sort();
      };
      expect(colors("Thundering Falls")).toEqual(["R", "U"]);
      expect(colors("Meticulous Archive")).toEqual(["U", "W"]);
      expect(colors("Underground Mortuary")).toEqual(["B", "G"]);
    });
  });

  describe("Vengeful Tracker", () => {
    it("un adversaire qui sacrifie un artefact subit 2 blessures", () => {
      let s = scenario({
        p1: { battlefield: ["Vengeful Tracker"] },
        p2: { battlefield: ["Esoteric Duplicator", ...lands("Island", 2)] },
      });
      s = act(s, "p1", { type: "pass" });
      const dup = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p2").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p2", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, (req) => (req.intent === "may" || req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(20);
    });

    it("sacrifier son propre artefact ne déclenche rien", () => {
      let s = scenario({ p1: { battlefield: ["Vengeful Tracker", "Esoteric Duplicator", ...lands("Island", 2)] } });
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(20);
    });
  });

  describe("No More Lies", () => {
    const setup = (mountains: number) =>
      scenario({
        p1: { battlefield: lands("Mountain", mountains), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Plains", "Island"], hand: ["No More Lies"] },
      });

    it("si le contrôleur ne peut pas payer {3}, le sort est contrecarré et exilé", () => {
      let s = setup(2);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "No More Lies", { t: [strike] });
      s = settle(s);
      expect(s.players.p2?.life).toBe(20);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    });

    it("s'il paie {3}, le sort se résout", () => {
      let s = setup(5);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "No More Lies", { t: [strike] });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(17);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(5);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Deadly Cover-Up", () => {
    it("sans réunir de preuves : toutes les créatures sont détruites, aucun cimetière n'est touché", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Deadly Cover-Up"] },
        p2: { battlefield: ["Fire Elemental"], graveyard: ["Opt"] },
      });
      s = settle(cast(s, "p1", "Deadly Cover-Up"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    it("réunir des preuves 6 exige une valeur de mana totale d'au moins 6 dans son cimetière", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Deadly Cover-Up"], graveyard: ["Bear Cub", "Opt"] },
      });
      expect(() => cast(s, "p1", "Deadly Cover-Up", undefined, { kicked: true })).toThrow();
    });
  });

  describe("Case of the Uneaten Feast", () => {
    it("chaque créature qui arrive sous votre contrôle rapporte 1 PV, pas celles de l'adversaire", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(21);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Case of the Uneaten Feast"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      t = settle(cast(t, "p2", "Bear Cub"));
      expect(t.players.p1?.life).toBe(20);
    });

    it("résolue au début de votre étape de fin si vous avez gagné au moins 5 PV ce tour-ci", () => {
      const run = (hand: string) => {
        let s = scenario({ p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 7)], hand: [hand] } });
        s = settle(cast(s, "p1", hand));
        const caseId = idOf(s, "p1", "battlefield", "Case of the Uneaten Feast");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return (s.objects[caseId] as { solved?: boolean }).solved ?? false;
      };
      // Pelakka Wurm : 7 PV, plus 1 par l'Affaire.
      expect(run("Pelakka Wurm")).toBe(true);
      expect(run("Bear Cub")).toBe(false);
    });
  });

  describe("Warleader's Call", () => {
    it("vos créatures ont +1/+1, pas celles des adversaires", () => {
      const s = scenario({ p1: { battlefield: ["Warleader's Call", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const mine = chars(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const theirs = chars(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      expect([mine.power, mine.toughness]).toEqual([3, 3]);
      expect([theirs.power, theirs.toughness]).toEqual([2, 2]);
    });

    it("une créature qui arrive sous votre contrôle inflige 1 blessure à chaque adversaire", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Warleader's Call", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
    });
  });

  describe("Steamcore Scholar", () => {
    it("vol et vigilance", () => {
      const s = scenario({ p1: { battlefield: ["Steamcore Scholar"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Steamcore Scholar")).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance"]),
      );
    });

    it("piochez deux cartes, puis défaussez-en deux, ou un seul éphémère", () => {
      const run = (library: string[], pickInstant: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Steamcore Scholar"], library } });
        s = settle(cast(s, "p1", "Steamcore Scholar"), (req) => {
          if (req.type !== "pick" || !pickInstant) return undefined;
          const opt = req.options.find((id) => nameOf(s, id) === "Opt");
          return opt ? [opt] : undefined;
        });
        if (s.pending?.kind === "discard") {
          const hand = s.players.p1?.hand ?? [];
          const opt = hand.find((id) => nameOf(s, id) === "Opt");
          s = settle(act(s, "p1", { type: "discard", cards: pickInstant && opt ? [opt] : hand.slice(0, 2) }));
        }
        return s;
      };
      const kept = run(["Opt", "Forest", "Forest"], true);
      expect(kept.players.p1?.hand.map((id) => nameOf(kept, id))).toEqual(["Forest"]);
      expect(kept.players.p1?.graveyard.map((id) => nameOf(kept, id))).toEqual(["Opt"]);
      const both = run(["Forest", "Forest", "Forest"], false);
      expect(both.players.p1?.hand).toHaveLength(0);
      expect(both.players.p1?.graveyard).toHaveLength(2);
    });
  });
});
