/**
 * Murders at Karlov Manor (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son
 * texte Oracle (plan R, lot R7).
 */

import type { RawCard } from "@mtgx/cards";
import { toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { CLUE, SPIRIT_WB, SUSPECTED } from "../../cards/src/mkm/common";
import { createTokens, destroy } from "../src/actions";
import * as dsl from "../src/dsl";
import { evalAmount, putFaceDown } from "../src/effects";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars, FACE_DOWN_ID, moveObject } from "../src/state";
import { matchesObjectFilter } from "../src/targets";
import { canBlock, requiredBlocks } from "../src/turn";
import type { ChoiceRequest, Decision, GameState } from "../src/types";
import { projectView } from "../src/view";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  passBoth,
  scenario,
  settle,
  untilCastNow,
} from "./helpers";

type S = GameState;
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

describe("Murders at Karlov Manor, socle : suspect (701.60)", () => {
  /** Créature de test : « en arrivant, suspectez jusqu'à une créature ciblée » ; {1} : « elle n'est plus suspecte ». */
  const SUSPECTER = customCard({
    name: "Enquêteur d'essai",
    power: 1,
    toughness: 1,
    abilities: [
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.suspect(dsl.ref.target())], {
        targets: [dsl.target.upTo(1, dsl.target.creature())],
        label: "Suspectez une créature",
      }),
      dsl.activated({
        mana: "{1}",
        targets: [dsl.target.creature()],
        effects: [dsl.fx.suspect(dsl.ref.target(), false)],
        label: "Plus suspecte",
      }),
    ],
  });

  it("une créature suspecte a la menace et ne peut pas bloquer ; la vue le montre ; plus suspecte, elle peut bloquer", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Island"], hand: [SUSPECTER] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", SUSPECTER.name), (req) =>
      req.type === "pick" && req.options.includes(theirs) ? [theirs] : undefined,
    );
    expect(s.objects[theirs]?.suspected).toBe(true);
    expect(chars(s, theirs).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
    expect(projectView(s, "p1").battlefield.find((o) => o.id === theirs)?.suspected).toBe(true);
    // Elle ne peut pas bloquer notre Ours qui attaque.
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: [{ id: mine, defender: "p2" }] });
    expect(canBlock(c, theirs, mine)).toBe(false);
    // « Elle n'est plus suspecte » : elle bloque de nouveau, sans la menace.
    const source = idOf(s, "p1", "battlefield", SUSPECTER.name);
    const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
    s = settle(
      act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : -1, targets: { t: [theirs] } }),
    );
    expect(s.objects[theirs]?.suspected).toBeUndefined();
    expect(chars(s, theirs).keywords).not.toContain("menace");
    c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: [{ id: mine, defender: "p2" }] });
    expect(canBlock(c, theirs, mine)).toBe(true);
  });

  it("le filtre « créature suspecte » ; la désignation se perd en quittant le champ de bataille", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const o = s.objects[bear];
    if (o) o.suspected = true;
    expect(matchesObjectFilter(s, "p1", bear, SUSPECTED)).toBe(true);
    expect(matchesObjectFilter(s, "p1", elves, SUSPECTED)).toBe(false);
    const back = moveObject(s, bear, "hand") as string;
    const again = moveObject(s, back, "battlefield") as string;
    expect(s.objects[again]?.suspected).toBeUndefined();
  });
});

describe("Murders at Karlov Manor, lot A — blanc", () => {
  /**
   * Murders at Karlov Manor, lot A — cartes blanches : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (plan R, lot R7).
   */
  type S = GameState;
  /** Répond aux choix de cibles en désignant ces objets. */
  const picking =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  /** Active la capacité de la source dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`Aucune capacité « ${label ?? ""} » pour ${nameOf(s, source)}`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  const pt = (s: S, id: string) => {
    const c = chars(s, id);
    return [c.power, c.toughness];
  };
  const count = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name).length;
  const faceDownIds = (s: S) => s.battlefield.filter((x) => s.objects[x]?.defId === FACE_DOWN_ID);
  /** Lance la carte face cachée pour {3}, puis la retourne face visible (action spéciale). */
  const castDisguisedThenTurnUp = (s: S, name: string): { s: S; id: string } => {
    let cur = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), faceDown: true }));
    const id = faceDownIds(cur)[0] as string;
    cur = activate(cur, "p1", id, "Retourner face visible");
    expect(nameOf(cur, id)).toBe(name);
    return { s: cur, id };
  };
  /** Détective d'essai avec le déguisement (« quand un Détective est retourné face visible »). */
  const DISGUISED_DETECTIVE = toCardDef(
    {
      name: "Détective déguisé",
      number: "1",
      rarity: "common",
      manaCost: "{3}{W}",
      cmc: 4,
      typeLine: "Creature — Human Detective",
      oracleText: "Disguise {W}",
      power: "3",
      toughness: "3",
      colors: ["W"],
      keywords: ["Disguise"],
      image: "",
      artCrop: "",
      legalities: { standard: "legal" },
    } satisfies RawCard,
    {},
    "TST",
  );
  /** Avance jusqu'à la déclaration des attaquants de p1 et attaque p2 avec ces créatures. */
  const attackWith = (s: S, ids: string[]) => {
    const c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Absolving Lammasu", () => {
    it("en arrivant, plus aucune créature n'est suspecte ; en mourant, 3 PV et une créature adverse suspectée", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 5), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Absolving Lammasu", "Lightning Strike"],
        },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      for (const id of [mine, theirs]) (s.objects[id] as { suspected?: boolean }).suspected = true;
      s = settle(cast(s, "p1", "Absolving Lammasu"));
      expect(s.objects[mine]?.suspected).toBeFalsy();
      expect(s.objects[theirs]?.suspected).toBeFalsy();
      const lammasu = idOf(s, "p1", "battlefield", "Absolving Lammasu");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [lammasu] }), picking(elves));
      expect(idsOf(s, "p1", "graveyard", "Absolving Lammasu")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[elves]?.suspected).toBe(true);
      expect(s.objects[theirs]?.suspected).toBeFalsy();
    });
  });

  describe("Assemble the Players", () => {
    it("une fois par tour, une créature de force 2 ou moins se lance du dessus de la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: ["Assemble the Players", ...lands("Forest", 4)], library: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(count(s, "p1", "Bear Cub")).toBe(1);
      // Les Elfes sont maintenant sur le dessus, mais la permission a servi ce tour-ci.
      const next = s.players.p1?.library[0] as string;
      expect(nameOf(s, next)).toBe("Llanowar Elves");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === next)).toBe(false);
    });

    it("pas une créature de force 3 ou plus", () => {
      const s = scenario({
        p1: { battlefield: ["Assemble the Players", ...lands("Mountain", 5)], library: ["Fire Elemental", "Forest"] },
      });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(false);
    });
  });

  describe("Auspicious Arrival", () => {
    it("+2/+2 jusqu'à la fin du tour et un Indice", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Auspicious Arrival"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Auspicious Arrival", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(count(s, "p1", "Clue")).toBe(1);
    });
  });

  describe("Call a Surprise Witness", () => {
    it("renvoie une créature de valeur de mana 3 ou moins avec un marqueur de vol ; c'est aussi un Esprit", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Call a Surprise Witness"], graveyard: ["Bear Cub", "Fire Elemental"] },
      });
      const fire = idOf(s, "p1", "graveyard", "Fire Elemental");
      expect(() => cast(s, "p1", "Call a Surprise Witness", { t: [fire] })).toThrow();
      s = settle(cast(s, "p1", "Call a Surprise Witness", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spirit"]));
    });
  });

  describe("Case of the Pilfered Proof", () => {
    it("un Détective qui arrive sous votre contrôle reçoit un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Pilfered Proof", "Plains"], hand: ["Novice Inspector"] } });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Novice Inspector")]?.counters["+1/+1"]).toBe(1);
    });

    it("un Détective retourné face visible reçoit un marqueur +1/+1 (face cachée, il n'en recevait pas)", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Pilfered Proof", ...lands("Plains", 4)], hand: [DISGUISED_DETECTIVE] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED_DETECTIVE.name), faceDown: true }));
      const id = faceDownIds(s)[0] as string;
      expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(activate(s, "p1", id, "Retourner face visible"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, id)).toEqual([4, 4]);
    });

    it("résolue avec trois Détectives ; vos jetons sont alors créés avec un Indice en plus", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Case of the Pilfered Proof",
            "Novice Inspector",
            "Novice Inspector",
            "Novice Inspector",
            ...lands("Plains", 2),
          ],
          hand: ["Auspicious Arrival"],
        },
      });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Pilfered Proof");
      const solved = (x: S) => (x.objects[caseId] as { solved?: boolean }).solved ?? false;
      s = advanceUntil(s, (x) => solved(x) && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
      expect(solved(s)).toBe(true);
      expect(s.turn.step).toBe("end");
      // Enquêter : l'Indice, plus un Indice.
      s = settle(cast(s, "p1", "Auspicious Arrival", { t: [idOf(s, "p1", "battlefield", "Novice Inspector")] }));
      expect(count(s, "p1", "Clue")).toBe(2);
    });

    it("non résolue avec deux Détectives", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Pilfered Proof", "Novice Inspector", "Novice Inspector"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Pilfered Proof");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
    });
  });

  describe("Delney, Streetwise Lookout", () => {
    it("vos créatures de force 2 ou moins ne peuvent pas être bloquées par des créatures de force 3 ou plus", () => {
      let s = scenario({
        p1: { battlefield: ["Delney, Streetwise Lookout", "Bear Cub", "Fire Elemental"] },
        p2: { battlefield: ["Fire Elemental", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const myFire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const theirFire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = attackWith(s, [bear, myFire]);
      expect(canBlock(s, theirFire, bear)).toBe(false);
      expect(canBlock(s, elves, bear)).toBe(true);
      expect(canBlock(s, theirFire, myFire)).toBe(true);
    });

    it("les capacités déclenchées de vos créatures de force 2 ou moins se déclenchent une fois de plus", () => {
      let s = scenario({
        p1: {
          battlefield: ["Delney, Streetwise Lookout", ...lands("Plains", 6)],
          hand: ["Novice Inspector", "Haazda Vigilante"],
        },
      });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Clue")).toBe(2);
      // Haazda Vigilante (force 4) : un seul déclenchement, donc un seul marqueur.
      const inspector = idOf(s, "p1", "battlefield", "Novice Inspector");
      s = settle(cast(s, "p1", "Haazda Vigilante"), picking(inspector));
      expect(s.objects[inspector]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Doorkeeper Thrull", () => {
    it("l'arrivée d'une créature ne déclenche rien, de part et d'autre", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Novice Inspector"] },
        p2: { battlefield: ["Doorkeeper Thrull"] },
      });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Novice Inspector")).toBe(1);
      expect(count(s, "p1", "Clue")).toBe(0);
    });
  });

  describe("Due Diligence", () => {
    it("la créature enchantée a +2/+2 et la vigilance ; une autre de vos créatures aussi jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Llanowar Elves"], hand: ["Due Diligence"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      let asked: string[] = [];
      s = settle(cast(s, "p1", "Due Diligence", { enchant: [bear] }), (req) => {
        if (req.type !== "pick") return undefined;
        asked = req.options.map(String);
        return [elves];
      });
      expect(asked).not.toContain(bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("vigilance");
      expect(pt(s, elves)).toEqual([3, 3]);
      expect(chars(s, elves).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, elves)).toEqual([1, 1]);
      expect(pt(s, bear)).toEqual([4, 4]);
    });
  });

  describe("Essence of Antiquity", () => {
    it("retournée face visible : vos créatures gagnent la défense talismanique et se dégagent", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 6), { name: "Bear Cub", tapped: true }],
          hand: ["Essence of Antiquity"],
        },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Essence of Antiquity");
      s = settle(turned.s);
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(chars(s, bear).keywords).toContain("hexproof");
      expect(chars(s, turned.id).keywords).toContain("hexproof");
      expect(s.objects[theirs]?.tapped).toBe(true);
      expect(chars(s, theirs).keywords).not.toContain("hexproof");
      expect(pt(s, turned.id)).toEqual([1, 10]);
    });
  });

  describe("Forum Familiar", () => {
    it("retournée face visible : un autre de vos permanents revient en main, et elle reçoit un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Forum Familiar"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Forum Familiar");
      s = settle(turned.s, picking(bear));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.objects[turned.id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, turned.id)).toEqual([2, 2]);
    });
  });

  describe("Griffnaut Tracker", () => {
    it("exile jusqu'à deux cartes d'un même cimetière", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Griffnaut Tracker"], graveyard: ["Opt"] },
        p2: { graveyard: ["Bear Cub", "Lightning Strike"] },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const [a, b] = s.players.p2?.graveyard ?? [];
      s = settle(cast(s, "p1", "Griffnaut Tracker"), (req) => {
        if (req.type !== "pick" || !req.options.includes(a as string)) return undefined;
        // Deux cimetières différents : refusé par le moteur ; on désigne donc deux cartes du même.
        expect(req.options).toContain(opt);
        return [a as string, b as string];
      });
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(s.exile).toHaveLength(2);
    });

    it("refuse des cartes de deux cimetières différents", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Griffnaut Tracker"], graveyard: ["Opt"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const bear = s.players.p2?.graveyard[0] as string;
      s = cast(s, "p1", "Griffnaut Tracker");
      const ask = (x: S): S | undefined => {
        for (let i = 0; i < 20; i++) {
          const p = x.pending;
          if (p?.kind === "choice" && p.request.type === "pick" && p.request.options.includes(bear)) return x;
          if (p?.kind !== "priority") return undefined;
          x = act(x, p.player, { type: "pass" });
        }
        return undefined;
      };
      const at = ask(s);
      expect(at).toBeDefined();
      const p = at?.pending;
      if (p?.kind !== "choice") return;
      expect(() => act(at as S, p.player, { type: "choose", values: [opt, bear] })).toThrow();
    });
  });

  describe("Haazda Vigilante", () => {
    it("en arrivant et en attaquant, un marqueur +1/+1 sur une de vos créatures de force 2 ou moins", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Fire Elemental"], hand: ["Haazda Vigilante"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Haazda Vigilante"), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(options).not.toContain(fire);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      // En attaquant (scénario où elle est déjà en jeu) : de nouveau un marqueur.
      let t = scenario({ p1: { battlefield: ["Haazda Vigilante", "Llanowar Elves"] } });
      const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
      t = settle(attackWith(t, [idOf(t, "p1", "battlefield", "Haazda Vigilante")]), picking(elves));
      expect(t.objects[elves]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Inside Source", () => {
    it("crée un Détective 2/2 ; {3}, {T} : un Détective gagne +2/+0 et la vigilance, en rituel", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Inside Source"] } });
      s = settle(cast(s, "p1", "Inside Source"));
      const detective = idOf(s, "p1", "battlefield", "Detective");
      expect(chars(s, detective).subtypes).toEqual(["Detective"]);
      expect(chars(s, detective).colors).toEqual(["W", "U"]);
      // L'Informatrice vient d'arriver (mal d'invocation) : on l'essaie au tour suivant.
      let t = scenario({ p1: { battlefield: [...lands("Plains", 3), "Inside Source", "Novice Inspector"] } });
      const source = idOf(t, "p1", "battlefield", "Inside Source");
      const inspector = idOf(t, "p1", "battlefield", "Novice Inspector");
      t = settle(activate(t, "p1", source, undefined, { t: [inspector] }));
      expect(pt(t, inspector)).toEqual([3, 2]);
      expect(chars(t, inspector).keywords).toContain("vigilance");
    });
  });

  describe("Krovod Haunch", () => {
    it("équipée : +2/+0 ; {2}, {T}, sacrifiez-le : 3 PV", () => {
      let s = scenario({ p1: { battlefield: ["Krovod Haunch", "Bear Cub", ...lands("Plains", 4)] } });
      const haunch = idOf(s, "p1", "battlefield", "Krovod Haunch");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", haunch, "Équiper", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(activate(s, "p1", haunch, "3 PV"), (req) => (req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p1?.life).toBe(23);
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("mis au cimetière depuis le champ de bataille : payez {1}{W} pour deux Chiens 1/1 blancs", () => {
      let s = scenario({ p1: { battlefield: ["Krovod Haunch", ...lands("Plains", 4)], hand: ["Disenchant"] } });
      s = settle(cast(s, "p1", "Disenchant", { t: [idOf(s, "p1", "battlefield", "Krovod Haunch")] }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const dogs = idsOf(s, "p1", "battlefield", "Dog");
      expect(dogs).toHaveLength(2);
      expect(pt(s, dogs[0] as string)).toEqual([1, 1]);
      expect(chars(s, dogs[0] as string).colors).toEqual(["W"]);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(4);
    });
  });

  describe("Makeshift Binding", () => {
    it("exile une créature adverse tant qu'il reste en jeu, et 2 PV", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Makeshift Binding"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Makeshift Binding"), picking(bear));
      expect(count(s, "p2", "Bear Cub")).toBe(0);
      expect(s.players.p1?.life).toBe(22);
      destroy(s, idOf(s, "p1", "battlefield", "Makeshift Binding"));
      s = settle(s);
      expect(count(s, "p2", "Bear Cub")).toBe(1);
    });
  });

  describe("Marketwatch Phantom", () => {
    it("gagne le vol quand une autre de vos créatures de force 2 ou moins arrive", () => {
      let s = scenario({
        p1: {
          battlefield: ["Marketwatch Phantom", ...lands("Forest", 4), ...lands("Mountain", 5)],
          hand: ["Fire Elemental", "Bear Cub"],
        },
      });
      const phantom = idOf(s, "p1", "battlefield", "Marketwatch Phantom");
      s = settle(cast(s, "p1", "Fire Elemental"));
      expect(chars(s, phantom).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(chars(s, phantom).keywords).toContain("flying");
    });
  });

  describe("Museum Nightwatch", () => {
    it("en mourant, crée un Détective 2/2", () => {
      let s = scenario({ p1: { battlefield: ["Museum Nightwatch", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Museum Nightwatch")] }));
      expect(count(s, "p1", "Detective")).toBe(1);
    });
  });

  describe("Neighborhood Guardian", () => {
    it("une autre de vos créatures de force 2 ou moins arrive : une créature ciblée gagne +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Neighborhood Guardian", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const guardian = idOf(s, "p1", "battlefield", "Neighborhood Guardian");
      s = settle(cast(s, "p1", "Bear Cub"), picking(guardian));
      expect(pt(s, guardian)).toEqual([3, 3]);
    });
  });

  describe("Not on My Watch", () => {
    it("exile une créature attaquante", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Not on My Watch"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(() => cast(s, "p1", "Not on My Watch", { t: [elves] })).toThrow();
      s = settle(cast(s, "p1", "Not on My Watch", { t: [bear] }));
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    });
  });

  describe("Novice Inspector et On the Job", () => {
    it("Novice Inspector enquête en arrivant", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Novice Inspector"] } });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Clue")).toBe(1);
    });

    it("On the Job : vos créatures gagnent +2/+1, puis enquêtez", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["On the Job"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "On the Job"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(count(s, "p1", "Clue")).toBe(1);
    });
  });

  describe("Perimeter Enforcer", () => {
    it("un autre Détective arrive sous votre contrôle : +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Perimeter Enforcer", "Plains", ...lands("Forest", 2)], hand: ["Novice Inspector", "Bear Cub"] },
      });
      const enforcer = idOf(s, "p1", "battlefield", "Perimeter Enforcer");
      expect(chars(s, enforcer).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
    });

    it("un Détective que vous contrôlez est retourné face visible : +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Perimeter Enforcer", ...lands("Plains", 4)], hand: [DISGUISED_DETECTIVE] } });
      const enforcer = idOf(s, "p1", "battlefield", "Perimeter Enforcer");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED_DETECTIVE.name), faceDown: true }));
      // Face cachée, ce n'est pas un Détective : rien.
      expect(pt(s, enforcer)).toEqual([1, 1]);
      s = settle(activate(s, "p1", faceDownIds(s)[0] as string, "Retourner face visible"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
    });
  });

  describe("Sanctuary Wall", () => {
    it("engage une créature ; marqueurs d'étourdissement sur elle et sur le Mur si vous le voulez", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { battlefield: ["Sanctuary Wall", ...lands("Plains", 3)] }, p2: { battlefield: ["Bear Cub"] } });
        const wall = idOf(s, "p1", "battlefield", "Sanctuary Wall");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", wall, undefined, { t: [bear] }), (req) =>
          req.type === "yesNo" ? [yes ? 1 : 0] : undefined,
        );
        return { s, wall, bear };
      };
      const a = run(true);
      expect(a.s.objects[a.bear]?.tapped).toBe(true);
      expect(a.s.objects[a.bear]?.counters.stun).toBe(1);
      expect(a.s.objects[a.wall]?.counters.stun).toBe(1);
      const b = run(false);
      expect(b.s.objects[b.bear]?.tapped).toBe(true);
      expect(b.s.objects[b.bear]?.counters.stun ?? 0).toBe(0);
      expect(b.s.objects[b.wall]?.counters.stun ?? 0).toBe(0);
    });
  });

  describe("Seasoned Consultant", () => {
    it("+2/+0 quand vous attaquez avec trois créatures ou plus", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Seasoned Consultant", "Bear Cub", "Llanowar Elves"] } });
        const consultant = idOf(s, "p1", "battlefield", "Seasoned Consultant");
        const all = s.battlefield.filter((id) => chars(s, id).types.includes("Creature"));
        s = settle(attackWith(s, all.slice(0, n)));
        return pt(s, consultant);
      };
      expect(run(3)).toEqual([3, 3]);
      expect(run(2)).toEqual([1, 3]);
    });
  });

  describe("Unyielding Gatekeeper", () => {
    it("retourné : un permanent adverse est exilé et son contrôleur crée un Détective", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Unyielding Gatekeeper"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Unyielding Gatekeeper");
      s = settle(turned.s, picking(bear));
      expect(count(s, "p2", "Bear Cub")).toBe(0);
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(count(s, "p2", "Detective")).toBe(1);
      expect(count(s, "p1", "Detective")).toBe(0);
    });

    it("retourné : un de vos permanents revient engagé, sans Détective", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Unyielding Gatekeeper"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Unyielding Gatekeeper");
      s = settle(turned.s, picking(bear));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).not.toBe(bear);
      expect(s.objects[back]?.tapped).toBe(true);
      expect(count(s, "p1", "Detective")).toBe(0);
      expect(count(s, "p2", "Detective")).toBe(0);
    });
  });

  describe("Wrench", () => {
    it("équipée : +1/+1, vigilance et « {3}, {T} : engagez une créature » ; {2}, sacrifiez-la : piochez", () => {
      let s = scenario({
        p1: { battlefield: ["Wrench", "Bear Cub", ...lands("Plains", 7)], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const wrench = idOf(s, "p1", "battlefield", "Wrench");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(chars(s, wrench).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", wrench, "Équiper", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("vigilance");
      s = settle(activate(s, "p1", bear, "Engagez", { t: [elves] }));
      expect(s.objects[elves]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      s = settle(activate(s, "p1", wrench, "Piochez"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Wrench")).toHaveLength(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — bleu", () => {
  /**
   * Murders at Karlov Manor, lot A : cartes bleues, confrontées à leur texte Oracle (plan R, lot R7).
   */
  type S = GameState;
  /**
   * Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente ; une
   * défausse demandée défausse les dernières cartes de la main (les dernières piochées).
   */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "discard")
        cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(-p.count) });
      else break;
    }
    return cur;
  };
  /** Capacité activée de la source dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`Capacité « ${label} » introuvable`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };

  const clues = (s: S, player: string) => idsOf(s, player, "battlefield", "Clue").length;
  const faceDownOf = (s: S) => s.battlefield.find((id) => s.objects[id]?.defId === FACE_DOWN_ID) as string;
  /** Lance la carte face cachée pour {3}, puis la retourne pour son coût de déguisement. */
  const castDisguisedThenFlip = (s: S, name: string, answer: Answer = () => undefined): S => {
    let cur = settle(cast(s, "p1", name, undefined, { faceDown: true }));
    const id = faceDownOf(cur);
    cur = activate(cur, "p1", id, "Retourner face visible");
    return settle(cur, answer);
  };
  /** Avance jusqu'à la déclaration des attaquants de p1, puis attaque p2 avec ces créatures. */
  const attackWith = (s: S, ...ids: string[]): S => {
    const c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p1");
    return act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const pickIf =
    (wanted: string[]): Answer =>
    (req) =>
      req.type === "pick" && wanted.every((id) => req.options.includes(id)) ? wanted : undefined;

  /** L'Affaire est résolue, la pile est vide et p1 a la priorité. */
  const solved = (s: S, id: string) =>
    !!(s.objects[id] as { solved?: boolean } | undefined)?.solved &&
    s.stack.length === 0 &&
    s.pending?.kind === "priority" &&
    s.pending.player === "p1";

  const DETECTIVE_CARD = customCard({ name: "Test Detective", subtypes: ["Detective"], power: 2, toughness: 2 });

  describe("Agency Outfitter", () => {
    it("met sur le champ de bataille la Magnifying Glass du cimetière et le Thinking Cap de la bibliothèque", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 6),
          hand: ["Agency Outfitter"],
          graveyard: ["Magnifying Glass"],
          library: ["Forest", "Thinking Cap", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Agency Outfitter"));
      expect(idsOf(s, "p1", "battlefield", "Magnifying Glass")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Thinking Cap")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });

  describe("Behind the Mask", () => {
    it("la cible devient une créature-artefact 4/3 de base jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Behind the Mask"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Behind the Mask", { t: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 3 });
      expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear)).toMatchObject({ power: 2, toughness: 2 });
      expect(chars(s, bear).types).not.toContain("Artifact");
    });

    it("avec des preuves réunies (6), 1/1 de base à la place", () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Behind the Mask"], graveyard: ["Pelakka Wurm"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Behind the Mask", { t: [bear] }, { kicked: true }));
      expect(chars(s, bear)).toMatchObject({ power: 1, toughness: 1 });
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Behind the Mask"]);
    });
  });

  describe("Benthic Criminologists", () => {
    const run = (yes: boolean) => {
      const s = scenario({ p1: { battlefield: [...lands("Island", 5), "Candlestick"], hand: ["Benthic Criminologists"] } });
      return settle(cast(s, "p1", "Benthic Criminologists"), (req) =>
        req.intent === "sacrifice" && req.type === "pick" ? (yes ? req.options : []) : undefined,
      );
    };

    it("en arrivant, vous pouvez sacrifier un artefact pour piocher une carte", () => {
      const s = run(true);
      expect(idsOf(s, "p1", "graveyard", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("sans sacrifice, pas de pioche", () => {
      const s = run(false);
      expect(idsOf(s, "p1", "battlefield", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Bubble Smuggler", () => {
    it("retournée face visible pour {5}{U} : quatre marqueurs +1/+1, 6/5", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 9), hand: ["Bubble Smuggler"] } });
      s = castDisguisedThenFlip(s, "Bubble Smuggler");
      const id = idOf(s, "p1", "battlefield", "Bubble Smuggler");
      expect(s.objects[id]?.counters["+1/+1"]).toBe(4);
      expect(chars(s, id)).toMatchObject({ power: 6, toughness: 5 });
    });
  });

  describe("Burden of Proof", () => {
    it("sur un Détective que vous contrôlez : +2/+2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), DETECTIVE_CARD], hand: ["Burden of Proof"] } });
      const det = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      s = settle(cast(s, "p1", "Burden of Proof", { enchant: [det] }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Burden of Proof")]?.attachedTo).toBe(det);
      expect(chars(s, det)).toMatchObject({ power: 4, toughness: 4 });
    });

    it("sinon : 1/1 de base, et elle ne peut pas bloquer les Détectives", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), DETECTIVE_CARD, "Bear Cub"], hand: ["Burden of Proof"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Burden of Proof", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 1, toughness: 1 });
      const det = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      // Seule la créature enchantée est touchée.
      expect(chars(s, det)).toMatchObject({ power: 2, toughness: 2 });
      expect(chars(s, mine)).toMatchObject({ power: 2, toughness: 2 });
      const c = attackWith(s, det, mine);
      expect(canBlock(c, bear, det)).toBe(false);
      expect(canBlock(c, bear, mine)).toBe(true);
    });
  });

  describe("Candlestick", () => {
    it("la créature équipée a +1/+1 et surveille 2 en attaquant", () => {
      let s = scenario({
        p1: { battlefield: ["Candlestick", "Bear Cub", ...lands("Island", 2)], library: ["Opt", "Opt", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Équiper", { targets: { t: [bear] } }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
      let asked = 0;
      s = settle(attackWith(s, bear), (req) => {
        if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
        asked = req.options.length;
        return req.options;
      });
      expect(asked).toBe(2);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt", "Opt"]);
    });

    it("{2}, sacrifiez-la : piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Candlestick", ...lands("Island", 2)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Piochez"));
      expect(idsOf(s, "p1", "graveyard", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Case of the Filched Falcon", () => {
    it("enquête en arrivant ; résolue avec trois artefacts ; l'artefact devient un Oiseau 4/4 volant", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Candlestick"], hand: ["Case of the Filched Falcon"] } });
      s = settle(cast(s, "p1", "Case of the Filched Falcon"));
      expect(clues(s, "p1")).toBe(1);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Filched Falcon");
      // Deux artefacts seulement : pas résolue.
      const two = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((two.objects[caseId] as { solved?: boolean }).solved).toBeFalsy();
      // Un troisième artefact (un second Indice) : résolue au début de l'étape de fin.
      let t = scenario({
        p1: { battlefield: [...lands("Island", 4), "Candlestick", "Magnifying Glass"], hand: ["Case of the Filched Falcon"] },
      });
      t = settle(cast(t, "p1", "Case of the Filched Falcon"));
      const id = idOf(t, "p1", "battlefield", "Case of the Filched Falcon");
      t = advanceUntil(t, (x) => solved(x, id));
      expect(t.turn.step).toBe("end");
      const clue = idOf(t, "p1", "battlefield", "Clue");
      t = settle(activate(t, "p1", id, "Oiseau", { targets: { t: [clue] } }));
      expect(idsOf(t, "p1", "graveyard", "Case of the Filched Falcon")).toHaveLength(1);
      expect(chars(t, clue)).toMatchObject({ power: 4, toughness: 4 });
      expect(chars(t, clue).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(t, clue).subtypes).toEqual(expect.arrayContaining(["Clue", "Bird"]));
      expect(chars(t, clue).keywords).toContain("flying");
    });
  });

  describe("Case of the Ransacked Lab", () => {
    it("vos éphémères et rituels coûtent {1} de moins", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Ransacked Lab", "Mountain"], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("résolue après quatre éphémères ce tour-ci ; ensuite chaque éphémère fait piocher une carte", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Ransacked Lab", ...lands("Island", 5)], hand: Array(5).fill("Opt") },
      });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Ransacked Lab");
      for (let i = 0; i < 4; i++) s = settle(cast(s, "p1", "Opt"));
      s = advanceUntil(s, (x) => solved(x, caseId));
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Opt"));
      // Opt part de la main, puis deux cartes piochées (Opt et l'Affaire).
      expect(s.players.p1?.hand.length).toBe(before + 1);
    });
  });

  describe("Cold Case Cracker", () => {
    it("quand elle meurt, son contrôleur enquête", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Cold Case Cracker"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Cold Case Cracker")] }));
      expect(idsOf(s, "p2", "graveyard", "Cold Case Cracker")).toHaveLength(1);
      expect(clues(s, "p2")).toBe(1);
    });
  });

  describe("Coveted Falcon", () => {
    it("retourné : un adversaire gagne le contrôle des permanents ciblés, vous piochez autant ; en attaquant, il les reprend", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Coveted Falcon"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = castDisguisedThenFlip(s, "Coveted Falcon", pickIf([bear]));
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.players.p1?.hand).toHaveLength(1);
      const falcon = idOf(s, "p1", "battlefield", "Coveted Falcon");
      const n = s.turn.number;
      s = advanceUntil(s, (x) => x.turn.number > n && x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: falcon, defender: "p2" }] });
      s = settle(s, pickIf([bear]));
      expect(s.objects[bear]?.controller).toBe("p1");
    });
  });

  describe("Crimestopper Sprite", () => {
    it("engage une créature en arrivant ; un marqueur d'étourdissement si des preuves ont été réunies", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Crimestopper Sprite"], graveyard: ["Pelakka Wurm"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Crimestopper Sprite", undefined, { kicked }), pickIf([bear]));
        return { s, bear };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.bear]?.tapped).toBe(true);
      expect(plain.s.objects[plain.bear]?.counters.stun ?? 0).toBe(0);
      const kicked = run(true);
      expect(kicked.s.objects[kicked.bear]?.tapped).toBe(true);
      expect(kicked.s.objects[kicked.bear]?.counters.stun).toBe(1);
      expect(kicked.s.exile.some((id) => nameOf(kicked.s, id) === "Pelakka Wurm")).toBe(true);
    });
  });

  describe("Curious Inquiry", () => {
    it("+1/+1 ; des blessures de combat à un joueur font enquêter", () => {
      let s = scenario({ p1: { battlefield: ["Island", "Bear Cub"], hand: ["Curious Inquiry"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Curious Inquiry", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
      s = advanceUntil(attackWith(s, bear), (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(17);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Deduce", () => {
    it("piochez une carte et enquêtez", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Deduce"] } });
      s = settle(cast(s, "p1", "Deduce"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Dramatic Accusation", () => {
    it("engage la créature enchantée, qui ne se dégage plus ; {U}{U} : mélangée dans la bibliothèque de son propriétaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Dramatic Accusation"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dramatic Accusation", { enchant: [bear] }));
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority" && x.pending.player === "p1",
      );
      expect(s.objects[bear]?.tapped).toBe(true);
      const aura = idOf(s, "p1", "battlefield", "Dramatic Accusation");
      const library = s.players.p2?.library.length ?? 0;
      s = settle(activate(s, "p1", aura, "Mélangez"));
      expect(s.battlefield).not.toContain(bear);
      expect(s.players.p2?.library).toHaveLength(library + 1);
      expect(s.players.p2?.library.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Dramatic Accusation")).toHaveLength(1);
    });
  });

  describe("Eliminate the Impossible", () => {
    it("enquêtez ; les créatures adverses ont −2/−0 et ne sont plus suspectes", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Eliminate the Impossible"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const o = s.objects[theirs];
      if (o) o.suspected = true;
      s = settle(cast(s, "p1", "Eliminate the Impossible"));
      expect(clues(s, "p1")).toBe(1);
      expect(chars(s, theirs).power).toBe(0);
      expect(chars(s, idOf(s, "p2", "battlefield", "Fire Elemental")).power).toBe(3);
      expect(chars(s, mine).power).toBe(2);
      expect(s.objects[theirs]?.suspected).toBeFalsy();
      expect(chars(s, theirs).keywords).not.toContain("menace");
    });
  });

  describe("Exit Specialist", () => {
    it("ne peut pas être bloquée par les créatures de force 3 ou plus", () => {
      const s = scenario({ p1: { battlefield: ["Exit Specialist"] }, p2: { battlefield: ["Fire Elemental", "Bear Cub"] } });
      const spec = idOf(s, "p1", "battlefield", "Exit Specialist");
      const c = attackWith(s, spec);
      expect(canBlock(c, idOf(s, "p2", "battlefield", "Fire Elemental"), spec)).toBe(false);
      expect(canBlock(c, idOf(s, "p2", "battlefield", "Bear Cub"), spec)).toBe(true);
    });

    it("retournée face visible : renvoie une autre créature dans la main de son propriétaire", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Exit Specialist"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = castDisguisedThenFlip(s, "Exit Specialist", pickIf([bear]));
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Exit Specialist")).toHaveLength(1);
    });
  });

  describe("Fae Flight", () => {
    it("+1/+0 et le vol ; la défense talismanique jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Fae Flight"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Fae Flight", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 2 });
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).keywords).not.toContain("hexproof");
    });
  });

  describe("Forensic Gadgeteer", () => {
    it("un sort d'artefact fait enquêter ; les capacités de vos artefacts coûtent {1} de moins", () => {
      let s = scenario({ p1: { battlefield: ["Forensic Gadgeteer", ...lands("Island", 2)], hand: ["Candlestick"] } });
      s = settle(cast(s, "p1", "Candlestick"));
      expect(clues(s, "p1")).toBe(1);
      // L'Indice coûte {1} au lieu de {2} : une seule Île suffit.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Clue"), "Piochez"));
      expect(clues(s, "p1")).toBe(0);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
    });
  });

  describe("Furtive Courier", () => {
    it("imblocable si vous avez sacrifié un artefact ce tour-ci ; en attaquant, piochez puis défaussez", () => {
      let s = scenario({ p1: { battlefield: ["Furtive Courier", "Candlestick", ...lands("Island", 2)], hand: ["Forest"] } });
      const courier = idOf(s, "p1", "battlefield", "Furtive Courier");
      expect(chars(s, courier).keywords).not.toContain("unblockable");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Piochez"));
      expect(chars(s, courier).keywords).toContain("unblockable");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(attackWith(s, courier));
      expect(s.players.p1?.hand).toHaveLength(hand);
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });
  });

  describe("Hotshot Investigators", () => {
    it("renvoie une de vos créatures : enquêtez ; une créature adverse : pas d'Indice", () => {
      const run = (owner: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 6), ...(owner === "p1" ? ["Bear Cub"] : [])], hand: ["Hotshot Investigators"] },
          p2: { battlefield: owner === "p2" ? ["Bear Cub"] : [] },
        });
        const bear = idOf(s, owner, "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Hotshot Investigators"), pickIf([bear]));
        expect(idsOf(s, owner, "hand", "Bear Cub")).toHaveLength(1);
        return clues(s, "p1");
      };
      expect(run("p1")).toBe(1);
      expect(run("p2")).toBe(0);
    });
  });

  describe("Jaded Analyst", () => {
    it("à votre deuxième carte piochée du tour, perd le défenseur et gagne la vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Jaded Analyst", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const analyst = idOf(s, "p1", "battlefield", "Jaded Analyst");
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, analyst).keywords).toContain("defender");
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, analyst).keywords).not.toContain("defender");
      expect(chars(s, analyst).keywords).toContain("vigilance");
    });
  });

  describe("Living Conundrum", () => {
    it("bibliothèque vide : 10/10 avec le vol et la vigilance, et la pioche est passée", () => {
      let s = scenario({ p1: { battlefield: ["Living Conundrum", "Island"], hand: ["Opt"], library: [] } });
      const id = idOf(s, "p1", "battlefield", "Living Conundrum");
      expect(chars(s, id)).toMatchObject({ power: 10, toughness: 10 });
      expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["hexproof", "flying", "vigilance"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.drewFromEmptyLibrary).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.lost).toBeFalsy();
    });

    it("avec des cartes dans la bibliothèque : 2/5 sans le vol", () => {
      const s = scenario({ p1: { battlefield: ["Living Conundrum"], library: ["Forest"] } });
      const id = idOf(s, "p1", "battlefield", "Living Conundrum");
      expect(chars(s, id)).toMatchObject({ power: 2, toughness: 5 });
      expect(chars(s, id).keywords).not.toContain("flying");
    });
  });

  describe("Lost in the Maze", () => {
    it("engage X créatures, étourdit celles des adversaires ; vos créatures engagées ont la défense talismanique", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Bear Cub"], hand: ["Lost in the Maze"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Lost in the Maze", undefined, { x: 2 }), pickIf([mine, theirs]));
      expect(s.objects[mine]?.tapped).toBe(true);
      expect(s.objects[theirs]?.tapped).toBe(true);
      expect(s.objects[elemental]?.tapped).toBe(false);
      expect(s.objects[mine]?.counters.stun ?? 0).toBe(0);
      expect(s.objects[theirs]?.counters.stun).toBe(1);
      expect(chars(s, mine).keywords).toContain("hexproof");
      expect(chars(s, theirs).keywords).not.toContain("hexproof");
    });
  });

  describe("Mistway Spy", () => {
    it("retourné face visible : ce tour-ci, vos créatures qui blessent un joueur en combat font enquêter", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub", "Llanowar Elves"], hand: ["Mistway Spy"] } });
      s = castDisguisedThenFlip(s, "Mistway Spy");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = advanceUntil(attackWith(s, bear, elves), (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(17);
      expect(clues(s, "p1")).toBe(2);
    });
  });

  describe("Out Cold", () => {
    it("ne peut pas être contrecarré ; engage et étourdit jusqu'à deux créatures, puis enquêtez", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Out Cold"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental", "Plains", "Island"], hand: ["No More Lies"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = cast(s, "p1", "Out Cold", { t: [bear, elemental] });
      const outCold = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "No More Lies", { t: [outCold] }));
      expect(s.objects[bear]?.counters.stun).toBe(1);
      expect(s.objects[elemental]?.counters.stun).toBe(1);
      expect(s.objects[bear]?.tapped && s.objects[elemental]?.tapped).toBe(true);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Proft's Eidetic Memory", () => {
    it("pioche en arrivant ; au combat, X marqueurs +1/+1 où X est le nombre de cartes piochées moins une", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Proft's Eidetic Memory", "Opt"] },
      });
      s = settle(cast(s, "p1", "Proft's Eidetic Memory"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Opt"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      // Deux cartes piochées ce tour-ci : un marqueur.
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("une seule carte piochée : pas de marqueur ; pas de taille de main maximale", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Proft's Eidetic Memory"] } });
      s = settle(cast(s, "p1", "Proft's Eidetic Memory"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      const t = scenario({ p1: { battlefield: ["Proft's Eidetic Memory"], hand: Array(9).fill("Forest") } });
      const end = advanceUntil(t, (x) => x.turn.active === "p2");
      expect(end.players.p1?.hand).toHaveLength(9);
    });
  });

  describe("Projektor Inspector", () => {
    it("elle-même ou un autre Détective arrive : vous pouvez piocher, puis défausser", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Projektor Inspector", DETECTIVE_CARD], library: lands("Island", 5) },
      });
      const det = idOf(s, "p1", "hand", DETECTIVE_CARD.name);
      let asked = 0;
      const yes: Answer = (req) => {
        // Défausse : jamais le Détective encore en main.
        if (req.type === "pick" && req.options.includes(det)) return req.options.filter((id) => id !== det).slice(0, 1);
        if (req.type !== "yesNo") return undefined;
        asked++;
        return [1];
      };
      s = settle(cast(s, "p1", "Projektor Inspector"), yes);
      expect(asked).toBe(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      s = settle(cast(s, "p1", DETECTIVE_CARD.name), yes);
      expect(asked).toBe(2);
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });

    it("un Détective retourné face visible déclenche aussi", () => {
      let s = scenario({ p1: { battlefield: ["Projektor Inspector", ...lands("Island", 5)], hand: ["Exit Specialist"] } });
      let asked = 0;
      s = castDisguisedThenFlip(s, "Exit Specialist", (req) => {
        if (req.type !== "yesNo") return undefined;
        asked++;
        return [0];
      });
      expect(asked).toBe(1);
    });
  });

  describe("Reasonable Doubt", () => {
    it("contrecarre un sort sauf si son contrôleur paie {2} ; suspecte jusqu'à une créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Reasonable Doubt"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Reasonable Doubt", { s: [strike], c: [bear] }));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(s.objects[bear]?.suspected).toBe(true);
    });
  });

  describe("Reenact the Crime", () => {
    it("exile une carte mise dans un cimetière ce tour-ci et lance sa copie sans payer", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Island", 4)], hand: ["Lightning Strike", "Reenact the Crime"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = untilCastNow(cast(s, "p1", "Reenact the Crime", { t: [strike] }));
      const copy = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
      expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    });

    it("une carte déjà au cimetière avant ce tour n'est pas une cible légale", () => {
      const s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Reenact the Crime"], graveyard: ["Lightning Strike"] },
      });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const o = s.objects[strike];
      if (o) o.controlledSince = s.turn.number - 1;
      expect(() => cast(s, "p1", "Reenact the Crime", { t: [strike] })).toThrow();
    });
  });

  describe("Sudden Setback", () => {
    it("le propriétaire du permanent le met au-dessus ou au-dessous de sa bibliothèque", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Sudden Setback"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let chooser = "";
      s = settle(cast(s, "p1", "Sudden Setback", { t: [bear] }), (req, player) => {
        if (req.intent !== "topOrBottom") return undefined;
        chooser = player;
        return ["top"];
      });
      expect(chooser).toBe("p2");
      expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Bear Cub");
    });
  });

  describe("Unauthorized Exit", () => {
    it("renvoie un permanent non-terrain dans la main de son propriétaire, puis surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Unauthorized Exit"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Unauthorized Exit", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — noir", () => {
  /**
   * Murders at Karlov Manor, lot A : cartes noires, confrontées à leur texte Oracle (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id));

  /** Capacité activée de la source dont le libellé contient `label`. */
  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Capacité « ${label} » introuvable`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  /** Choisit la cible voulue dans la première demande qui la propose. */
  const pickIt =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;

  /**
   * Combat du joueur actif : avance jusqu'à la déclaration des attaquants, attaque l'adversaire avec `attackers`, applique
   * les blocages donnés, puis va jusqu'à la seconde phase principale.
   */
  const fight = (
    s: S,
    attackers: string[],
    blocks: { blocker: string; attacker: string }[] = [],
    answer: Answer = () => undefined,
  ): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks });
      else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };

  describe("Agency Coroner", () => {
    const run = (suspected: boolean) => {
      const s0 = scenario({
        p1: { battlefield: ["Agency Coroner", "Bear Cub", ...lands("Swamp", 3)], library: lands("Swamp", 5) },
      });
      const bear = idOf(s0, "p1", "battlefield", "Bear Cub");
      const o = s0.objects[bear];
      if (o && suspected) o.suspected = true;
      const coroner = idOf(s0, "p1", "battlefield", "Agency Coroner");
      const s = settle(activate(s0, "p1", coroner, "Piochez", { sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      return s.players.p1?.hand.length;
    };
    it("sacrifier une autre créature : piochez une carte", () => expect(run(false)).toBe(1));
    it("si la créature sacrifiée était suspecte, piochez deux cartes à la place", () => expect(run(true)).toBe(2));
  });

  describe("Alley Assailant", () => {
    it("lancée face visible, arrive engagée", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Alley Assailant"] } });
      s = settle(cast(s, "p1", "Alley Assailant"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Alley Assailant")]?.tapped).toBe(true);
    });

    it("déguisée puis retournée : l'adversaire perd 3 PV et vous en gagnez 3", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 9), hand: ["Alley Assailant"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Alley Assailant"), faceDown: true }));
      const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
      expect(chars(s, id).power).toBe(2);
      s = settle(activate(s, "p1", id, "Retourner face visible"));
      expect(chars(s, id).name).toBe("Alley Assailant");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });
  });

  describe("Barbed Servitor", () => {
    it("arrive suspecte, indestructible ; ses blessures font perdre autant de PV à un adversaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Barbed Servitor"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Barbed Servitor"));
      const servitor = idOf(s, "p1", "battlefield", "Barbed Servitor");
      expect(s.objects[servitor]?.suspected).toBe(true);
      expect(chars(s, servitor).keywords).toEqual(expect.arrayContaining(["indestructible", "menace", "cantBlock"]));
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Lightning Strike", { t: [servitor] }));
      expect(s.battlefield).toContain(servitor);
      expect(s.players.p2?.life).toBe(17);
    });

    it("blessures de combat à un joueur : vous piochez une carte et perdez 1 PV", () => {
      const s0 = scenario({ p1: { battlefield: ["Barbed Servitor"], library: lands("Swamp", 3) } });
      const s = fight(s0, [idOf(s0, "p1", "battlefield", "Barbed Servitor")]);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  it("Basilica Stalker : blessures de combat à un joueur, vous gagnez 1 PV et surveillez 1", () => {
    const s0 = scenario({ p1: { battlefield: ["Basilica Stalker"], library: ["Opt", "Swamp"] } });
    const s = fight(s0, [idOf(s0, "p1", "battlefield", "Basilica Stalker")], [], (req) =>
      req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
    );
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.life).toBe(21);
    expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  describe("Case of the Gorgon's Kiss", () => {
    it("en arrivant, détruit jusqu'à une créature qui a subi des blessures ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Lightning Strike", "Case of the Gorgon's Kiss"],
        },
        p2: { battlefield: ["Fire Elemental", "Serra Angel"] },
      });
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [fire] }));
      expect(s.battlefield).toContain(fire);
      let options: string[] = [];
      s = settle(cast(s, "p1", "Case of the Gorgon's Kiss"), (req) => {
        if (req.type !== "pick" || !req.options.includes(fire)) return undefined;
        options = req.options.map(String);
        return [fire];
      });
      expect(options).not.toContain(angel);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    const solveWith = (bears: number) => {
      let s = scenario({
        p1: { battlefield: ["Case of the Gorgon's Kiss", ...lands("Swamp", 5)], hand: ["Deadly Cover-Up"] },
        p2: { battlefield: lands("Bear Cub", bears) },
      });
      s = settle(cast(s, "p1", "Deadly Cover-Up"));
      const id = idOf(s, "p1", "battlefield", "Case of the Gorgon's Kiss");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      return { s, id };
    };

    it("résolue si trois cartes de créature ont été mises au cimetière : Gorgone 4/4, contact mortel, lien de vie", () => {
      const { s, id } = solveWith(3);
      expect(s.objects[id]?.solved).toBe(true);
      const c = chars(s, id);
      expect(c.types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
      expect(c.subtypes).toContain("Gorgon");
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    });

    it("deux cartes de créature ne suffisent pas", () => {
      const { s, id } = solveWith(2);
      expect(s.objects[id]?.solved).toBeFalsy();
      expect(chars(s, id).types).not.toContain("Creature");
    });
  });

  describe("Case of the Stashed Skeleton", () => {
    it("crée un Squelette 2/1 suspect ; non résolue tant que vous contrôlez un Squelette suspect", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Case of the Stashed Skeleton"] } });
      s = settle(cast(s, "p1", "Case of the Stashed Skeleton"));
      const skeleton = s.battlefield.find((id) => nameOf(s, id) === "Skeleton") as string;
      expect(s.objects[skeleton]?.suspected).toBe(true);
      expect([chars(s, skeleton).power, chars(s, skeleton).toughness]).toEqual([2, 1]);
      const id = idOf(s, "p1", "battlefield", "Case of the Stashed Skeleton");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.objects[id]?.solved).toBeFalsy();
    });

    it("résolue sans Squelette suspect : {1}{B}, sacrifiez-la, cherchez une carte (en rituel)", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Stashed Skeleton", ...lands("Swamp", 2)], library: ["Swamp", "Murder", "Swamp"] },
      });
      const id = idOf(s, "p1", "battlefield", "Case of the Stashed Skeleton");
      expect(activation(s, "p1", id, "Cherchez")).toBeUndefined();
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.objects[id]?.solved).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const murder = s.players.p1?.library.find((x) => nameOf(s, x) === "Murder") as string;
      s = settle(activate(s, "p1", id, "Cherchez"), pickIt(murder));
      expect(names(s, s.players.p1?.hand)).toContain("Murder");
      expect(idsOf(s, "p1", "graveyard", "Case of the Stashed Skeleton")).toHaveLength(1);
    });
  });

  describe("Cerebral Confiscation", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Cerebral Confiscation"] },
        p2: { hand: ["Forest", "Opt", "Bear Cub"] },
      });

    it("premier mode : l'adversaire ciblé défausse deux cartes", () => {
      let s = setup();
      s = settle(cast(s, "p1", "Cerebral Confiscation", { t: ["p2"] }, { mode: 0 }));
      if (s.pending?.kind === "discard") {
        const hand = s.players.p2?.hand ?? [];
        s = settle(act(s, "p2", { type: "discard", cards: hand.slice(0, 2) }));
      }
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("second mode : vous choisissez une carte non-terrain de sa main, qu'il défausse", () => {
      const s0 = setup();
      let s = s0;
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Cerebral Confiscation", { t: ["p2"] }, { mode: 1 }), (req, player) => {
        if (req.type !== "pick" || player !== "p1") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(names(s0, options).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Bear Cub"]);
      expect(s.players.p2?.hand).toHaveLength(2);
    });
  });

  it("Clandestine Meddler : suspecte une autre créature ; une créature suspecte attaque, surveillance 1", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Clandestine Meddler"], library: ["Opt", "Swamp"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Clandestine Meddler"), pickIt(bear));
    expect(s.objects[bear]?.suspected).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Clandestine Meddler")]?.suspected).toBeUndefined();
    let surveilled = false;
    s = fight(s, [bear], [], (req) => {
      if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
      surveilled = true;
      return req.options;
    });
    expect(surveilled).toBe(true);
    expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  describe("Extract a Confession", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Extract a Confession"], graveyard: ["Fire Elemental", "Opt"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });

    it("sans preuves : chaque adversaire sacrifie la créature de son choix", () => {
      let s = setup();
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Extract a Confession"), (req, player) =>
        player === "p2" && req.type === "pick" && req.options.includes(elves) ? [elves] : undefined,
      );
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Llanowar Elves"]);
      expect(s.players.p1?.graveyard).toHaveLength(3);
    });

    it("preuves réunies (6) : il sacrifie sa créature de plus grande force", () => {
      let s = setup();
      s = settle(cast(s, "p1", "Extract a Confession", undefined, { kicked: true }));
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Extract a Confession"]);
    });
  });

  it("Festerleech : +2/+2 une seule fois par tour ; blessures de combat, meulez deux cartes", () => {
    let s = scenario({ p1: { battlefield: ["Festerleech", ...lands("Swamp", 4)], library: lands("Swamp", 4) } });
    const leech = idOf(s, "p1", "battlefield", "Festerleech");
    s = settle(activate(s, "p1", leech, "+2/+2"));
    expect([chars(s, leech).power, chars(s, leech).toughness]).toEqual([3, 3]);
    expect(activation(s, "p1", leech, "+2/+2")).toBeUndefined();
    s = fight(s, [leech]);
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Homicide Investigator : une de vos créatures non-jetons meurt, enquêtez, une seule fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Homicide Investigator", "Bear Cub", "Llanowar Elves", ...lands("Swamp", 6)],
        hand: ["Murder", "Murder"],
      },
    });
    const clues = (x: S) => x.battlefield.filter((id) => nameOf(x, id) === "Clue").length;
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(clues(s)).toBe(1);
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
    expect(clues(s)).toBe(1);
  });

  it("Hunted Bonebrute : l'adversaire ciblé crée deux Chiens 1/1 blancs ; quand elle meurt, chaque adversaire perd 3 PV", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Hunted Bonebrute", "Murder"] } });
    s = settle(cast(s, "p1", "Hunted Bonebrute"));
    const dogs = s.battlefield.filter((id) => nameOf(s, id) === "Dog");
    expect(dogs).toHaveLength(2);
    expect(dogs.every((id) => s.objects[id]?.controller === "p2" && chars(s, id).colors.join() === "W")).toBe(true);
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Hunted Bonebrute")] }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Illicit Masquerade : marqueurs imposteur ; une telle créature meurt, exilée, et une autre revient du cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Swamp", 7)],
        hand: ["Illicit Masquerade", "Murder"],
        graveyard: ["Serra Angel"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Illicit Masquerade"));
    expect(s.objects[bear]?.counters.impostor).toBe(1);
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    s = settle(cast(s, "p1", "Murder", { t: [bear] }), pickIt(angel));
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // La Serra Angel revenue n'a pas de marqueur imposteur.
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters.impostor).toBeUndefined();
  });

  it("It Doesn't Add Up : la carte de créature revient sur le champ de bataille, suspecte", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["It Doesn't Add Up"], graveyard: ["Serra Angel"] } });
    s = settle(cast(s, "p1", "It Doesn't Add Up", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.suspected).toBe(true);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
  });

  it("Lead Pipe : +2/+0 ; la créature équipée meurt, chaque adversaire perd 1 PV ; {2}, sacrifice : piochez", () => {
    let s = scenario({
      p1: { battlefield: ["Lead Pipe", "Bear Cub", ...lands("Swamp", 7)], hand: ["Murder"], library: lands("Swamp", 3) },
    });
    const pipe = idOf(s, "p1", "battlefield", "Lead Pipe");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, pipe).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
    s = settle(activate(s, "p1", pipe, "Équiper", { targets: { t: [bear] } }));
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 2]);
    s = settle(cast(s, "p1", "Murder", { t: [bear] }));
    expect(s.players.p2?.life).toBe(19);
    s = settle(activate(s, "p1", pipe, "Piochez"));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Lead Pipe")).toHaveLength(1);
  });

  it("Leering Onlooker : depuis le cimetière, exilée, deux Chauves-souris 1/1 volantes engagées", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), graveyard: ["Leering Onlooker"] } });
    const card = idOf(s, "p1", "graveyard", "Leering Onlooker");
    s = settle(activate(s, "p1", card, "Chauves-souris"));
    const bats = s.battlefield.filter((id) => nameOf(s, id) === "Bat");
    expect(bats).toHaveLength(2);
    expect(bats.every((id) => s.objects[id]?.tapped && chars(s, id).keywords.includes("flying"))).toBe(true);
    expect([chars(s, bats[0] as string).power, chars(s, bats[0] as string).toughness]).toEqual([1, 1]);
    expect(s.exile.some((id) => nameOf(s, id) === "Leering Onlooker")).toBe(true);
  });

  it("Long Goodbye : seulement une créature ou un planeswalker de valeur de mana 3 ou moins", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Long Goodbye"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Long Goodbye", { t: [angel] })).toThrow();
    s = settle(cast(s, "p1", "Long Goodbye", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.defs[s.objects[idOf(s, "p1", "graveyard", "Long Goodbye")]?.defId ?? ""]?.cantBeCountered).toBe(true);
  });

  it("Macabre Reconstruction : {2} de moins si une carte de créature est allée dans votre cimetière ce tour-ci", () => {
    const plain = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Macabre Reconstruction"], graveyard: ["Serra Angel"] },
    });
    expect(() => cast(plain, "p1", "Macabre Reconstruction", { t: [idOf(plain, "p1", "graveyard", "Serra Angel")] })).toThrow();
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Mountain", 2), ...lands("Swamp", 2)],
        hand: ["Macabre Reconstruction", "Lightning Strike"],
        graveyard: ["Serra Angel"],
      },
    });
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    // Il ne reste que deux Marais : {1}{B}.
    s = settle(cast(s, "p1", "Macabre Reconstruction", { t: [angel, bear] }));
    expect(names(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  describe("Massacre Girl, Known Killer", () => {
    it("vos créatures ont l'infection ; une créature adverse meurt avec une endurance inférieure à 1 : piochez", () => {
      const s0 = scenario({
        p1: { battlefield: ["Massacre Girl, Known Killer", "Bear Cub"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s0, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s0, "p2", "battlefield", "Bear Cub");
      expect(chars(s0, mine).keywords).toContain("wither");
      expect(chars(s0, theirs).keywords).not.toContain("wither");
      const s = fight(s0, [mine], [{ blocker: theirs, attacker: mine }]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("une créature adverse détruite avec son endurance intacte ne fait rien piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Massacre Girl, Known Killer", ...lands("Swamp", 3)], hand: ["Murder"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("Outrageous Robbery : l'adversaire exile X cartes ; vous pouvez les jouer avec du mana de n'importe quel type", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Outrageous Robbery"] },
      p2: { library: ["Opt", "Forest", "Island"] },
    });
    s = settle(cast(s, "p1", "Outrageous Robbery", { t: ["p2"] }, { x: 2 }));
    expect(names(s, s.exile).sort()).toEqual(["Forest", "Opt"]);
    const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    const actions = legalActions(s, "p1");
    expect(actions.some((a) => a.type === "cast" && a.card === opt)).toBe(true);
    expect(actions.some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Persuasive Interrogators : enquêtez ; vous sacrifiez un Indice, l'adversaire reçoit deux marqueurs poison", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Persuasive Interrogators"] } });
    s = settle(cast(s, "p1", "Persuasive Interrogators"));
    const clue = s.battlefield.find((id) => nameOf(s, id) === "Clue") as string;
    expect(clue).toBeDefined();
    s = settle(activate(s, "p1", clue, ""));
    expect(s.players.p2?.poison).toBe(2);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Presumed Dead : +2/+0 ; quand elle meurt ce tour-ci, elle revient sous le contrôle de son propriétaire, suspecte", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Presumed Dead", "Murder"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Presumed Dead", { t: [bear] }));
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 2]);
    s = settle(cast(s, "p1", "Murder", { t: [bear] }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(bear);
    expect(s.objects[back]?.suspected).toBe(true);
    expect(chars(s, back).power).toBe(2);
  });

  it("Repeat Offender : la première activation la suspecte, la suivante lui donne un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Repeat Offender", ...lands("Swamp", 6)] } });
    const id = idOf(s, "p1", "battlefield", "Repeat Offender");
    s = settle(activate(s, "p1", id, "Marqueur"));
    expect(s.objects[id]?.suspected).toBe(true);
    expect(s.objects[id]?.counters["+1/+1"]).toBeUndefined();
    s = settle(activate(s, "p1", id, "Marqueur"));
    expect(s.objects[id]?.suspected).toBe(true);
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Rot Farm Mortipede et Soul Enervation : une carte de créature quitte votre cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: ["Rot Farm Mortipede", "Soul Enervation", ...lands("Swamp", 5)],
        hand: ["It Doesn't Add Up"],
        graveyard: ["Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "It Doesn't Add Up", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
    const pede = idOf(s, "p1", "battlefield", "Rot Farm Mortipede");
    expect(chars(s, pede).power).toBe(4);
    expect(chars(s, pede).keywords).toEqual(expect.arrayContaining(["menace", "lifelink"]));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
  });

  it("Soul Enervation : flash, la créature ciblée prend -4/-4", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Angel"] },
      p2: { battlefield: lands("Swamp", 4), hand: ["Soul Enervation"] },
    });
    s = act(s, "p1", { type: "pass" });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p2", "Soul Enervation"), pickIt(angel));
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Slice from the Shadows : la créature ciblée prend -X/-X", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Slice from the Shadows"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Slice from the Shadows", { t: [angel] }, { x: 3 });
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "pass" });
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
  });

  it("Slimy Dualleech : au début de votre combat, +1/+0 et contact mortel à une créature de force 2 ou moins", () => {
    let s = scenario({ p1: { battlefield: ["Slimy Dualleech", "Bear Cub", "Serra Angel"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    let options: string[] = [];
    s = act(s, "p1", { type: "pass" });
    s = settle(s, (req) => {
      if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
      options = req.options.map(String);
      return [bear];
    });
    expect(options).not.toContain(angel);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toContain("deathtouch");
  });

  it("Snarling Gorehound : une autre de vos créatures de force 2 ou moins arrive, surveillance 1", () => {
    const run = (creature: string, mana: string[]) => {
      let s = scenario({ p1: { battlefield: ["Snarling Gorehound", ...mana], hand: [creature], library: ["Opt", "Swamp"] } });
      s = settle(cast(s, "p1", creature), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      return s.players.p1?.graveyard.length;
    };
    expect(run("Bear Cub", lands("Forest", 2))).toBe(1);
    expect(run("Serra Angel", lands("Plains", 5))).toBe(0);
  });

  it("Toxin Analysis : contact mortel et lien de vie jusqu'à la fin du tour, puis enquêtez", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp"], hand: ["Toxin Analysis"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Toxin Analysis", { t: [bear] }));
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Clue")).toHaveLength(1);
  });

  describe("Undercity Eliminator", () => {
    it("vous sacrifiez un artefact ou une créature : exilez une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Undercity Eliminator"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Undercity Eliminator"), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) return [bear];
        if (req.type === "pick" && req.options.includes(angel)) return [angel];
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
    });

    it("sans sacrifice, rien n'est exilé", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Undercity Eliminator"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Undercity Eliminator"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  it("Unscrupulous Agent : l'adversaire ciblé exile une carte de sa main", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Unscrupulous Agent"] }, p2: { hand: ["Opt", "Forest"] } });
    const opt = idOf(s, "p2", "hand", "Opt");
    s = settle(cast(s, "p1", "Unscrupulous Agent"), (req, player) =>
      player === "p2" && req.type === "pick" ? [opt] : undefined,
    );
    expect(names(s, s.players.p2?.hand)).toEqual(["Forest"]);
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
  });

  it("Nightdrinker Moroii : en arrivant, vous perdez 3 PV", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Nightdrinker Moroii"] } });
    s = settle(cast(s, "p1", "Nightdrinker Moroii"));
    expect(s.players.p1?.life).toBe(17);
  });
});

describe("Murders at Karlov Manor, lot A — rouge", () => {
  /**
   * Murders at Karlov Manor, lot A : cartes rouges, confrontées à leur texte Oracle (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id));

  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Capacité « ${label} » introuvable`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  const pickIt =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);

  /** Déclare les attaquants du joueur actif contre p2, puis résout les déclenchements d'attaque. */
  const attack = (s: S, attackers: string[], answer: Answer = () => undefined): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  /** Artefact non-créature sans capacité. */
  const TRINKET = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
  /** Éphémère d'essai : 2 blessures à n'importe quelle cible. */
  const ZAP = customCard({
    name: "Décharge d'essai",
    typeLine: "Instant",
    types: ["Instant"],
    spell: dsl.spell([dsl.target.any()], [dsl.fx.damage(2, dsl.ref.target())]),
  });
  /** Le permanent face cachée de p1. */
  const faceDownOf = (s: S) => s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;

  describe("Anzrag's Rampage", () => {
    it("détruit les artefacts adverses, exile X cartes (X = artefacts mis au cimetière ce tour-ci), une créature revient avec la célérité puis en main", () => {
      let s = scenario({
        p1: {
          battlefield: [TRINKET, ...lands("Mountain", 5)],
          hand: ["Anzrag's Rampage"],
          library: ["Forest", "Bear Cub", "Forest", "Forest"],
        },
        p2: { battlefield: [TRINKET, "Esoteric Duplicator"] },
      });
      s = settle(cast(s, "p1", "Anzrag's Rampage"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, String(id)) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", TRINKET.name)).toHaveLength(1);
      expect(names(s, s.players.p2?.graveyard).sort()).toEqual([TRINKET.name, "Esoteric Duplicator"].sort());
      // Deux artefacts mis au cimetière : deux cartes exilées ; l'Ours sur le champ de bataille, la Forêt en exil.
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toContain("haste");
      expect(names(s, s.exile)).toEqual(["Forest"]);
      expect(s.players.p1?.library).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Bolrac-Clan Basher", () => {
    it("double initiative, piétinement et déguisement lus dans le texte", () => {
      const s = scenario({ p1: { battlefield: ["Bolrac-Clan Basher"] } });
      const id = idOf(s, "p1", "battlefield", "Bolrac-Clan Basher");
      expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
      expect(s.defs[s.objects[id]?.defId ?? ""]?.disguise).toBeDefined();
    });
  });

  describe("Case of the Crimson Pulse", () => {
    it("en arrivant : défaussez une carte, puis piochez-en deux ; résolue sans carte en main ; résolue : à l'entretien, défaussez votre main et piochez deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Case of the Crimson Pulse", "Opt"], library: lands("Island", 10) },
      });
      s = settle(cast(s, "p1", "Case of the Crimson Pulse"));
      if (s.pending?.kind === "discard") s = settle(act(s, "p1", { type: "discard", cards: idsOf(s, "p1", "hand", "Opt") }));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(names(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Crimson Pulse");
      // Deux cartes en main à l'étape de fin : non résolue.
      let t = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((t.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
      // Sans carte en main : résolue, puis à l'entretien suivant, main défaussée et deux cartes piochées.
      const o = s.players.p1;
      if (o) {
        for (const id of o.hand) {
          const card = s.objects[id];
          if (card) card.zone = "graveyard";
        }
        o.graveyard.push(...o.hand);
        o.hand = [];
      }
      t = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((t.objects[caseId] as { solved?: boolean }).solved).toBe(true);
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.stack.length > 0);
      // À l'entretien, avant l'étape de pioche : main vide, rien à défausser, puis deux cartes piochées.
      expect(t.players.p1?.hand).toHaveLength(0);
      const before = t.players.p1?.graveyard.length ?? 0;
      t = settle(t);
      expect(t.players.p1?.hand).toHaveLength(2);
      expect(t.players.p1?.graveyard.length).toBe(before);
    });
  });

  describe("Caught Red-Handed", () => {
    it("ne peut pas être contrecarré ; gagne le contrôle, dégage, célérité, et suspecte la créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Caught Red-Handed"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(s.defs[s.objects[idOf(s, "p1", "hand", "Caught Red-Handed")]?.defId ?? ""]?.cantBeCountered).toBe(true);
      s = settle(cast(s, "p1", "Caught Red-Handed", { t: [bear] }));
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(s.objects[bear]?.suspected).toBe(true);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["haste", "menace", "cantBlock"]));
      // Jusqu'à la fin du tour seulement.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.controller).toBe("p2");
    });
  });

  describe("The Chase Is On", () => {
    it("+3/+0 et l'initiative jusqu'à la fin du tour, et enquêtez", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["The Chase Is On"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "The Chase Is On", { t: [bear] }));
      expect(chars(s, bear).power).toBe(5);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });
  });

  describe("Concealed Weapon", () => {
    it("lancée face cachée, retournée pour {2}{R} : elle s'attache à une créature ciblée que vous contrôlez, +3/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Concealed Weapon"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Concealed Weapon"), faceDown: true }));
      const id = faceDownOf(s);
      expect([chars(s, id).power, chars(s, id).toughness]).toEqual([2, 2]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", id, "Retourner face visible"), pickIt(bear));
      expect(chars(s, id).types).not.toContain("Creature");
      expect(s.objects[id]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(5);
      // Équiper {1}{R} : lu dans le texte.
      const labels = chars(s, id).abilities.map((a) => (a.kind === "activated" ? a.label : undefined));
      expect(labels).toContain("Équiper {1}{R}");
    });
  });

  describe("Connecting the Dots", () => {
    it("chaque attaquant exile la carte du dessus ; {1}{R}, défausser sa main, sacrifier : les cartes exilées vont en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Connecting the Dots", "Bear Cub", "Llanowar Elves", ...lands("Mountain", 2)],
          hand: ["Opt"],
          library: ["Island", "Swamp", "Forest", "Forest"],
        },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")]);
      expect(names(s, s.exile).sort()).toEqual(["Island", "Swamp"]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      const dots = idOf(s, "p1", "battlefield", "Connecting the Dots");
      s = settle(activate(s, "p1", dots, "Défaussez votre main"));
      if (s.pending?.kind === "discard") s = settle(act(s, "p1", { type: "discard", cards: [...(s.players.p1?.hand ?? [])] }));
      expect(names(s, s.players.p1?.hand).sort()).toEqual(["Island", "Swamp"]);
      expect(names(s, s.players.p1?.graveyard).sort()).toEqual(["Connecting the Dots", "Opt"]);
      expect(s.exile).toHaveLength(0);
    });
  });

  describe("Convenient Target", () => {
    it("en arrivant, suspecte la créature enchantée, qui a +1/+1 ; {2}{R} : revient du cimetière en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Convenient Target"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Convenient Target", { enchant: [bear] }));
      expect(s.objects[bear]?.suspected).toBe(true);
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
      // Dans le cimetière : la capacité la renvoie en main.
      const aura = idOf(s, "p1", "battlefield", "Convenient Target");
      s.battlefield = s.battlefield.filter((x) => x !== aura);
      const o = s.objects[aura];
      if (o) {
        o.zone = "graveyard";
        o.attachedTo = undefined;
      }
      s.players.p1?.graveyard.push(aura);
      s = settle(activate(s, "p1", aura, "Revient du cimetière"));
      expect(idsOf(s, "p1", "hand", "Convenient Target")).toHaveLength(1);
    });
  });

  describe("Cornered Crook", () => {
    it("en arrivant, vous pouvez sacrifier un artefact : 3 blessures à n'importe quelle cible", () => {
      const setup = () => scenario({ p1: { battlefield: [TRINKET, ...lands("Mountain", 5)], hand: ["Cornered Crook"] } });
      let s = setup();
      const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
      s = settle(cast(s, "p1", "Cornered Crook"), (req) => {
        if (req.type === "pick" && req.options.includes(trinket)) return [trinket];
        if (req.type === "pick" && req.options.includes("p2")) return ["p2"];
        return undefined;
      });
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "graveyard", TRINKET.name)).toHaveLength(1);
      // Sans sacrifice, pas de blessures.
      let t = setup();
      t = settle(cast(t, "p1", "Cornered Crook"), (req) => (req.type === "pick" && req.min === 0 ? [] : undefined));
      expect(t.players.p2?.life).toBe(20);
      expect(idsOf(t, "p1", "battlefield", TRINKET.name)).toHaveLength(1);
    });
  });

  describe("Crime Novelist", () => {
    it("chaque fois que vous sacrifiez un artefact : un marqueur +1/+1 et {R}", () => {
      let s = scenario({
        p1: { battlefield: ["Crime Novelist", "Esoteric Duplicator", ...lands("Island", 2)], library: lands("Swamp", 3) },
      });
      const novelist = idOf(s, "p1", "battlefield", "Crime Novelist");
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, no);
      expect(s.objects[novelist]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });
  });

  describe("Expedited Inheritance", () => {
    it("une créature blessée : son contrôleur peut exiler autant de cartes du dessus, jouables jusqu'à la fin de son prochain tour", () => {
      let s = scenario({
        p1: { battlefield: ["Expedited Inheritance", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Fire Elemental"], library: ["Bear Cub", "Forest", "Opt", "Island"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      let asked = "";
      s = settle(cast(s, "p1", "Lightning Strike", { t: [elemental] }), (req, player) => {
        if (req.type !== "yesNo") return undefined;
        asked = player;
        return [1];
      });
      expect(asked).toBe("p2");
      expect(names(s, s.exile).sort()).toEqual(["Bear Cub", "Forest", "Opt"]);
      const perms = (s.playPermissions ?? []).filter((p) => s.exile.includes(p.card));
      expect(perms).toHaveLength(3);
      expect(perms.every((p) => p.player === "p2" && p.until > s.turn.number)).toBe(true);
    });

    it("le joueur peut refuser", () => {
      let s = scenario({
        p1: { battlefield: ["Expedited Inheritance", ...lands("Mountain", 2), "Bear Cub"], hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [bear] }), no);
      expect(s.exile).toHaveLength(0);
    });
  });

  describe("Felonious Rage", () => {
    it("+2/+0 et la célérité ; quand cette créature meurt ce tour-ci, créez un Détective 2/2", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Bear Cub", "Llanowar Elves"],
          hand: ["Felonious Rage", "Lightning Strike", ZAP],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Felonious Rage", { t: [bear] }));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("haste");
      // Une autre créature qui meurt ne déclenche rien.
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(0);
      // L'Ours meurt : le Détective arrive.
      s = settle(cast(s, "p1", ZAP.name, { t: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const det = idOf(s, "p1", "battlefield", "Detective");
      expect([chars(s, det).power, chars(s, det).toughness, chars(s, det).colors]).toEqual([2, 2, ["W", "U"]]);
    });
  });

  describe("Frantic Scapegoat", () => {
    it("en arrivant, elle se suspecte ; quand une autre créature arrive, elle peut lui passer la suspicion", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", ...lands("Forest", 2)], hand: ["Frantic Scapegoat", "Bear Cub"] } });
      s = settle(cast(s, "p1", "Frantic Scapegoat"));
      const goat = idOf(s, "p1", "battlefield", "Frantic Scapegoat");
      expect(s.objects[goat]?.suspected).toBe(true);
      expect(chars(s, goat).keywords).toEqual(expect.arrayContaining(["haste", "menace", "cantBlock"]));
      s = settle(cast(s, "p1", "Bear Cub"), yes);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.suspected).toBe(true);
      expect(s.objects[goat]?.suspected).toBeFalsy();
    });

    it("si elle n'est pas suspecte, rien ne se passe ; on peut aussi refuser", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Frantic Scapegoat"], hand: ["Bear Cub", "Llanowar Elves"] },
      });
      const goat = idOf(s, "p1", "battlefield", "Frantic Scapegoat");
      let asked = false;
      s = settle(cast(s, "p1", "Bear Cub"), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      const o = s.objects[goat];
      if (o) o.suspected = true;
      s = settle(cast(s, "p1", "Llanowar Elves"), no);
      expect(s.objects[goat]?.suspected).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.suspected).toBeFalsy();
    });
  });

  describe("Galvanize", () => {
    it("3 blessures, ou 5 si vous avez pioché au moins deux cartes ce tour-ci", () => {
      const run = (drawn: number) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Galvanize"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const p1 = s.players.p1;
        if (p1) p1.turnStats.cardsDrawn = drawn;
        const el = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(cast(s, "p1", "Galvanize", { t: [el] }));
        return s.objects[el]?.zone === "battlefield" ? s.objects[el]?.damage : "mort";
      };
      expect(run(1)).toBe(3);
      expect(run(2)).toBe("mort");
    });
  });

  describe("Gearbane Orangutan", () => {
    it("mode 1 : détruit jusqu'à un artefact ciblé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Gearbane Orangutan"] },
        p2: { battlefield: [TRINKET] },
      });
      const trinket = idOf(s, "p2", "battlefield", TRINKET.name);
      s = settle(cast(s, "p1", "Gearbane Orangutan"), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.type === "pick" && req.options.includes(trinket) ? [trinket] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", TRINKET.name)).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Gearbane Orangutan")).keywords).toContain("reach");
    });

    it("mode 2 : sacrifiez un artefact ; si vous le faites, deux marqueurs +1/+1", () => {
      const run = (withArtifact: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 3), ...(withArtifact ? [TRINKET] : [])], hand: ["Gearbane Orangutan"] },
        });
        s = settle(cast(s, "p1", "Gearbane Orangutan"), (req) => (req.intent === "triggerMode" ? ["1"] : undefined));
        return s.objects[idOf(s, "p1", "battlefield", "Gearbane Orangutan")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(2);
      expect(run(false)).toBe(0);
    });
  });

  describe("Harried Dronesmith", () => {
    it("au début du combat : un Thopter 1/1 volant avec la célérité, sacrifié au début de votre étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Harried Dronesmith"] } });
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      s = settle(s);
      const thopter = idOf(s, "p1", "battlefield", "Thopter");
      expect(chars(s, thopter)).toMatchObject({ power: 1, toughness: 1, colors: [] });
      expect(chars(s, thopter).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, thopter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(0);
    });
  });

  describe("Innocent Bystander", () => {
    it("quand elle subit 3 blessures ou plus, enquêtez ; pas pour 2", () => {
      const run = (spell: string | typeof ZAP) => {
        const name = typeof spell === "string" ? spell : spell.name;
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Innocent Bystander"], hand: [spell] } });
        s = settle(cast(s, "p1", name, { t: [idOf(s, "p1", "battlefield", "Innocent Bystander")] }));
        expect(idsOf(s, "p1", "graveyard", "Innocent Bystander")).toHaveLength(1);
        return idsOf(s, "p1", "battlefield", "Clue").length;
      };
      expect(run("Lightning Strike")).toBe(1);
      expect(run(ZAP)).toBe(0);
    });
  });

  describe("Knife", () => {
    it("pendant votre tour, la créature équipée a +1/+0 et l'initiative ; {2}, sacrifice : piochez", () => {
      let s = scenario({ p1: { battlefield: ["Knife", "Bear Cub", ...lands("Mountain", 4)], library: lands("Island", 3) } });
      const knife = idOf(s, "p1", "battlefield", "Knife");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, knife).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", knife, "Équiper", { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(3);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      const theirs = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(theirs, bear).power).toBe(2);
      expect(chars(theirs, bear).keywords).not.toContain("firstStrike");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", knife, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(idsOf(s, "p1", "graveyard", "Knife")).toHaveLength(1);
    });
  });

  describe("Krenko, Baron of Tin Street", () => {
    it("{T}, sacrifiez un artefact : un marqueur +1/+1 sur chaque Gobelin que vous contrôlez ; l'artefact au cimetière : payez {R} pour un Gobelin avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: ["Krenko, Baron of Tin Street", TRINKET, "Mountain", "Bear Cub"] },
        p2: { battlefield: ["Krenko, Baron of Tin Street"] },
      });
      const krenko = idOf(s, "p1", "battlefield", "Krenko, Baron of Tin Street");
      const theirs = idOf(s, "p2", "battlefield", "Krenko, Baron of Tin Street");
      s = settle(activate(s, "p1", krenko, "marqueur"), (req, player) =>
        req.type === "yesNo" ? [player === "p1" ? 1 : 0] : undefined,
      );
      expect(s.objects[krenko]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[theirs]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      // Les deux Krenko se déclenchent ; seul p1 paie {R}.
      const goblins = idsOf(s, "p1", "battlefield", "Goblin");
      expect(goblins).toHaveLength(1);
      expect(chars(s, goblins[0] as string).keywords).toContain("haste");
      expect(idsOf(s, "p2", "battlefield", "Goblin")).toHaveLength(0);
    });
  });

  describe("Krenko's Buzzcrusher", () => {
    it("détruit jusqu'à un terrain non-base par joueur ; son contrôleur peut chercher un terrain de base, arrivé engagé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Krenko's Buzzcrusher"] },
        p2: { battlefield: ["Thundering Falls"], library: ["Island", "Opt"] },
      });
      const falls = idOf(s, "p2", "battlefield", "Thundering Falls");
      s = settle(cast(s, "p1", "Krenko's Buzzcrusher"), (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(falls)) return [falls];
        const island = req.options.find((id) => nameOf(s, String(id)) === "Island");
        return island ? [island] : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Thundering Falls")).toHaveLength(1);
      const island = idOf(s, "p2", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Krenko's Buzzcrusher")).keywords).toEqual(
        expect.arrayContaining(["flying", "trample"]),
      );
    });
  });

  describe("Offender at Large", () => {
    it("en arrivant face visible : jusqu'à une créature ciblée gagne +2/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Offender at Large"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Offender at Large"), pickIt(bear));
      expect(chars(s, bear).power).toBe(4);
    });

    it("face cachée : rien en arrivant ; retournée face visible : +2/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 8), "Bear Cub"], hand: ["Offender at Large"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Offender at Large"), faceDown: true }), pickIt(bear));
      expect(chars(s, bear).power).toBe(2);
      const id = faceDownOf(s);
      s = settle(activate(s, "p1", id, "Retourner face visible"), pickIt(bear));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, id).power).toBe(5);
    });
  });

  describe("Person of Interest", () => {
    it("en arrivant, elle se suspecte et crée un Détective 2/2", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Person of Interest"] } });
      s = settle(cast(s, "p1", "Person of Interest"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Person of Interest")]?.suspected).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(1);
    });
  });

  describe("Pyrotechnic Performer", () => {
    it("retournée face visible, elle inflige autant de blessures que sa force à chaque adversaire ; de même pour une autre de vos créatures", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Mountain", 9), "Pyrotechnic Performer"], hand: ["Pyrotechnic Performer"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyrotechnic Performer"), faceDown: true }));
      const id = faceDownOf(s);
      // Deux Performers : celle qui est retournée et celle déjà face visible se déclenchent chacune.
      s = settle(activate(s, "p1", id, "Retourner face visible"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 14, 14]);
    });

    it("une autre créature retournée face visible inflige ses blessures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 8), "Pyrotechnic Performer"], hand: ["Offender at Large"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Offender at Large"), faceDown: true }));
      s = settle(activate(s, "p1", faceDownOf(s), "Retourner face visible"));
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("Reckless Detective", () => {
    it("en attaquant, sacrifiez un artefact ou défaussez une carte : piochez une carte et +2/+0", () => {
      let s = scenario({ p1: { battlefield: ["Reckless Detective", TRINKET], library: lands("Island", 3) } });
      const det = idOf(s, "p1", "battlefield", "Reckless Detective");
      const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
      s = attack(s, [det], pickIt(trinket));
      expect(idsOf(s, "p1", "graveyard", TRINKET.name)).toHaveLength(1);
      expect(chars(s, det).power).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("sans artefact, en défaussant une carte ; sans rien, aucun effet", () => {
      let s = scenario({ p1: { battlefield: ["Reckless Detective"], hand: ["Opt"], library: lands("Island", 3) } });
      const det = idOf(s, "p1", "battlefield", "Reckless Detective");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = attack(s, [det], pickIt(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(chars(s, det).power).toBe(2);
      expect(names(s, s.players.p1?.hand)).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: ["Reckless Detective"], library: lands("Island", 3) } });
      const d2 = idOf(t, "p1", "battlefield", "Reckless Detective");
      t = attack(t, [d2]);
      expect(chars(t, d2).power).toBe(0);
      expect(t.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Red Herring", () => {
    it("célérité, attaque à chaque combat si possible ; {2}, sacrifice : piochez", () => {
      let s = scenario({ p1: { battlefield: ["Red Herring", ...lands("Mountain", 2)], library: lands("Island", 3) } });
      const fish = idOf(s, "p1", "battlefield", "Red Herring");
      expect(chars(s, fish).keywords).toEqual(expect.arrayContaining(["haste", "mustAttack"]));
      expect(chars(s, fish).subtypes).toEqual(expect.arrayContaining(["Clue", "Fish"]));
      s = settle(activate(s, "p1", fish, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Red Herring")).toHaveLength(1);
    });
  });

  describe("Rubblebelt Braggart", () => {
    it("en attaquant, si elle n'est pas suspecte, vous pouvez la suspecter", () => {
      let s = scenario({ p1: { battlefield: ["Rubblebelt Braggart"] } });
      const id = idOf(s, "p1", "battlefield", "Rubblebelt Braggart");
      const t = attack(s, [id], no);
      expect(t.objects[id]?.suspected).toBeFalsy();
      s = attack(s, [id], yes);
      expect(s.objects[id]?.suspected).toBe(true);
      expect(chars(s, id).keywords).toContain("menace");
    });
  });

  describe("Suspicious Detonation", () => {
    it("4 blessures à une créature ; coûte {3} de moins si vous avez sacrifié un artefact ce tour-ci ; ne peut pas être contrecarré", () => {
      let s = scenario({
        p1: {
          battlefield: ["Esoteric Duplicator", ...lands("Mountain", 4)],
          hand: ["Suspicious Detonation"],
          library: lands("Island", 3),
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const el = idOf(s, "p2", "battlefield", "Fire Elemental");
      const card = idOf(s, "p1", "hand", "Suspicious Detonation");
      expect(s.defs[s.objects[card]?.defId ?? ""]?.cantBeCountered).toBe(true);
      // Quatre terrains : pas assez pour {4}{R}.
      expect(() => cast(s, "p1", "Suspicious Detonation", { t: [el] })).toThrow();
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = settle(act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 }), no);
      // Deux terrains restants suffisent pour {1}{R}.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(2);
      s = settle(cast(s, "p1", "Suspicious Detonation", { t: [el] }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Torch the Witness", () => {
    it("inflige deux fois X blessures ; s'il y a des blessures en excès, enquêtez", () => {
      const run = (x: number, target: string) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Torch the Witness"] },
          p2: { battlefield: [target] },
        });
        const t = idOf(s, "p2", "battlefield", target);
        s = settle(cast(s, "p1", "Torch the Witness", { t: [t] }, { x }));
        return { dead: idsOf(s, "p2", "graveyard", target).length, clues: idsOf(s, "p1", "battlefield", "Clue").length };
      };
      // Bear Cub 2/2 : X = 1 → 2 blessures, aucune en excès ; X = 2 → 4 blessures, 2 en excès.
      expect(run(1, "Bear Cub")).toEqual({ dead: 1, clues: 0 });
      expect(run(2, "Bear Cub")).toEqual({ dead: 1, clues: 1 });
      // Fire Elemental 5/4 : X = 2 → 4 blessures, mortelles sans excès.
      expect(run(2, "Fire Elemental")).toEqual({ dead: 1, clues: 0 });
    });
  });
});

describe("Murders at Karlov Manor, lot A — vert", () => {
  /**
   * Murders at Karlov Manor, lot A — cartes vertes : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: readonly string[] = []) => ids.map((id) => nameOf(s, id)).sort();
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const onBattlefield = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name);

  /** Active la capacité de `source` dont le libellé contient `label` (la première si absent). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`Capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  /** Choisit, dans une demande « pick », les options dont le nom est donné. */
  const pickNamed =
    (s: () => S, ...wanted: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const ids = req.options.filter((id) => wanted.includes(nameOf(s(), String(id)) ?? ""));
      return ids.length > 0 ? ids.slice(0, req.max) : undefined;
    };
  /** Lance la carte face cachée pour {3}, puis la retourne face visible pour son coût de déguisement. */
  const castDisguisedThenTurnUp = (s: S, name: string): { s: S; id: string } => {
    let cur = passBoth(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), faceDown: true }));
    const id = cur.battlefield.find((x) => cur.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(cur, id)).toMatchObject({ name: "", power: 2, toughness: 2 });
    cur = activate(cur, "p1", id, "Retourner face visible");
    expect(nameOf(cur, id)).toBe(name);
    return { s: cur, id };
  };

  describe("Aftermath Analyst", () => {
    it("en arrivant, meulez trois cartes ; {3}{G}, sacrifice : les cartes de terrain du cimetière reviennent engagées", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 6),
          hand: ["Aftermath Analyst"],
          library: ["Island", "Opt", "Mountain", "Forest"],
          graveyard: ["Plains", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Aftermath Analyst"));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Bear Cub", "Island", "Mountain", "Opt", "Plains"]);
      const analyst = idOf(s, "p1", "battlefield", "Aftermath Analyst");
      s = settle(activate(s, "p1", analyst));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Aftermath Analyst", "Bear Cub", "Opt"]);
      for (const land of ["Island", "Mountain", "Plains"]) {
        const id = idOf(s, "p1", "battlefield", land);
        expect(s.objects[id]?.tapped).toBe(true);
      }
    });
  });

  describe("Analyze the Pollen", () => {
    it("sans preuves : seulement une carte de terrain de base", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Analyze the Pollen"], library: ["Bear Cub", "Forest"] } });
      s = settle(cast(s, "p1", "Analyze the Pollen"));
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
    });

    it("preuves 8 réunies : une carte de créature ou de terrain, au choix", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest"],
          hand: ["Analyze the Pollen"],
          library: ["Forest", "Bear Cub"],
          graveyard: ["Pelakka Wurm", "Bear Cub"],
        },
      });
      s = settle(
        cast(s, "p1", "Analyze the Pollen", undefined, { kicked: true }),
        pickNamed(() => s, "Bear Cub"),
      );
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      // Les preuves sont exilées.
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Analyze the Pollen"]);
    });
  });

  describe("Archdruid's Charm", () => {
    it("mode 1 : une carte de terrain trouvée arrive engagée ; une carte de créature va en main", () => {
      const run = (wanted: string) => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Archdruid's Charm"], library: ["Island", "Bear Cub"] },
        });
        s = settle(
          cast(s, "p1", "Archdruid's Charm", undefined, { mode: 0 }),
          pickNamed(() => s, wanted),
        );
        return s;
      };
      const land = run("Island");
      const island = idOf(land, "p1", "battlefield", "Island");
      expect(land.objects[island]?.tapped).toBe(true);
      expect(land.players.p1?.hand).toHaveLength(0);
      const creature = run("Bear Cub");
      expect(names(creature, creature.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(onBattlefield(creature, "p1", "Bear Cub")).toHaveLength(0);
    });

    it("mode 2 : un marqueur +1/+1 sur votre créature, qui inflige des blessures égales à sa force", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Archdruid's Charm"] },
        p2: { battlefield: ["Pelakka Wurm"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Archdruid's Charm", { a: [bear], b: [wurm] }, { mode: 1 }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.objects[wurm]?.damage).toBe(3);
    });

    it("mode 3 : exilez un artefact ou un enchantement", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Archdruid's Charm"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const dup = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      s = settle(cast(s, "p1", "Archdruid's Charm", { t: [dup] }, { mode: 2 }));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Esoteric Duplicator"]);
    });
  });

  describe("Audience with Trostani", () => {
    it("crée une Plante 0/1, puis pioche une carte par nom différent parmi vos jetons de créature", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Audience with Trostani", "Audience with Trostani"] } });
      s = settle(cast(s, "p1", "Audience with Trostani"));
      const plants = onBattlefield(s, "p1", "Plant");
      expect(plants).toHaveLength(1);
      expect(pt(s, plants[0] as string)).toEqual([0, 1]);
      expect(s.players.p1?.hand).toHaveLength(2);
      // Deux Plantes : un seul nom, une seule carte.
      s = settle(cast(s, "p1", "Audience with Trostani"));
      expect(onBattlefield(s, "p1", "Plant")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("Bite Down on Crime", () => {
    it("coûte {2} de moins si des preuves ont été réunies ; +2/+0, puis blessures égales à la force", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Bite Down on Crime"], graveyard: ["Pelakka Wurm"] },
          p2: { battlefield: ["Pelakka Wurm"] },
        });
      let s = setup();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      expect(() => cast(s, "p1", "Bite Down on Crime", { a: [bear], b: [wurm] })).toThrow();
      s = settle(cast(s, "p1", "Bite Down on Crime", { a: [bear], b: [wurm] }, { kicked: true }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(s.objects[wurm]?.damage).toBe(4);
    });
  });

  describe("Case of the Locked Hothouse", () => {
    it("un terrain supplémentaire par tour", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Locked Hothouse"], hand: ["Forest", "Forest", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(() => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") })).toThrow();
    });

    it("résolue avec sept terrains : terrains et sorts de créature du dessus de la bibliothèque", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Case of the Locked Hothouse", ...lands("Forest", n)] } });
        const id = idOf(s, "p1", "battlefield", "Case of the Locked Hothouse");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return (s.objects[id] as { solved?: boolean }).solved ?? false;
      };
      expect(run(6)).toBe(false);
      expect(run(7)).toBe(true);
      let s = scenario({
        p1: { battlefield: ["Case of the Locked Hothouse", ...lands("Forest", 2)], library: ["Bear Cub", "Island"] },
      });
      const hothouse = s.objects[idOf(s, "p1", "battlefield", "Case of the Locked Hothouse")] as { solved?: boolean };
      hothouse.solved = true;
      bump(s);
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(onBattlefield(s, "p1", "Bear Cub")).toHaveLength(1);
      const island = s.players.p1?.library[0] as string;
      s = act(s, "p1", { type: "playLand", card: island });
      expect(onBattlefield(s, "p1", "Island")).toHaveLength(1);
    });
  });

  describe("Case of the Trampled Garden", () => {
    it("en arrivant, deux marqueurs +1/+1 répartis ; résolue (force totale 8), un attaquant reçoit un marqueur et le piétinement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Pelakka Wurm"], hand: ["Case of the Trampled Garden"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Case of the Trampled Garden"), (req) =>
        req.type === "pick" && req.options.includes(wurm) ? [wurm] : undefined,
      );
      expect(s.objects[wurm]?.counters["+1/+1"]).toBe(2);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Trampled Garden");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved).toBe(true);
      // Au tour suivant de p1 : attaque avec le Wurm.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wurm, defender: "p2" }] });
      s = settle(s);
      expect(s.objects[wurm]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, wurm).keywords).toContain("trample");
    });

    it("non résolue si la force totale de vos créatures est inférieure à 8", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Trampled Garden", "Bear Cub"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Trampled Garden");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
    });
  });

  describe("Chalk Outline", () => {
    it("une carte de créature quitte votre cimetière : un Détective 2/2 et un Indice", () => {
      let s = scenario({
        p1: { battlefield: ["Chalk Outline", "Bear Cub", "Forest"], graveyard: ["Rubblebelt Maverick", "Opt"] },
      });
      const maverick = idOf(s, "p1", "graveyard", "Rubblebelt Maverick");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", maverick, undefined, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(onBattlefield(s, "p1", "Detective")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Flourishing Bloom-Kin", () => {
    it("+1/+1 par Forêt ; retournée face visible : une Forêt arrive engagée, l'autre va en main", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 6), "Island", "Island"],
          hand: ["Flourishing Bloom-Kin"],
          library: ["Forest", "Island", "Forest", "Bear Cub"],
        },
      });
      const r = castDisguisedThenTurnUp(s, "Flourishing Bloom-Kin");
      s = settle(r.s);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(7);
      const fresh = idsOf(s, "p1", "battlefield", "Forest").filter(
        (id) => s.objects[id]?.tapped && s.objects[id]?.controlledSince,
      );
      expect(fresh.length).toBeGreaterThan(0);
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(pt(s, r.id)).toEqual([7, 7]);
    });
  });

  describe("Get a Leg Up", () => {
    it("+1/+1 par créature que vous contrôlez, et la portée", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub", "Bear Cub", "Llanowar Elves"], hand: ["Get a Leg Up"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Get a Leg Up", { t: [bear] }));
      expect(pt(s, bear)).toEqual([5, 5]);
      expect(chars(s, bear).keywords).toContain("reach");
    });
  });

  describe("Glint Weaver", () => {
    it("trois marqueurs +1/+1 répartis, puis des PV égaux à la plus grande endurance parmi vos créatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 7), "Bear Cub"], hand: ["Glint Weaver"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glint Weaver"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, idOf(s, "p1", "battlefield", "Glint Weaver")).keywords).toContain("reach");
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Greenbelt Radical", () => {
    it("retournée face visible : un marqueur +1/+1 sur chacune de vos créatures, qui gagnent le piétinement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 10), "Bear Cub"], hand: ["Greenbelt Radical"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const r = castDisguisedThenTurnUp(s, "Greenbelt Radical");
      s = settle(r.s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(pt(s, r.id)).toEqual([5, 5]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, theirs)).toEqual([2, 2]);
    });
  });

  describe("Hard-Hitting Question", () => {
    it("votre créature inflige des blessures égales à sa force à une créature ou un planeswalker adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Pelakka Wurm"], hand: ["Hard-Hitting Question"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Hard-Hitting Question", { a: [wurm], b: [bear] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[wurm]?.damage).toBe(0);
    });
  });

  describe("Hide in Plain Sight", () => {
    it("regarde cinq cartes, en enveloppe deux d'une cape (2/2 face cachée, garde {2}), le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Hide in Plain Sight"],
          library: ["Bear Cub", "Opt", "Pelakka Wurm", "Island", "Forest", "Mountain"],
        },
      });
      s = settle(
        cast(s, "p1", "Hide in Plain Sight"),
        pickNamed(() => s, "Bear Cub", "Pelakka Wurm"),
      );
      const down = s.battlefield.filter((id) => s.objects[id]?.defId === FACE_DOWN_ID);
      expect(down).toHaveLength(2);
      for (const id of down) {
        expect(chars(s, id)).toMatchObject({ power: 2, toughness: 2 });
        expect(chars(s, id).keywords).toContain("ward");
      }
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
      expect(names(s, s.players.p1?.library.slice(1))).toEqual(["Forest", "Island", "Opt"]);
    });
  });

  describe("Loxodon Eavesdropper", () => {
    it("en arrivant, enquêtez ; votre deuxième carte piochée du tour lui donne +1/+1 et la vigilance", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 8), "Rope"], hand: ["Loxodon Eavesdropper"] } });
      s = settle(cast(s, "p1", "Loxodon Eavesdropper"));
      const elephant = idOf(s, "p1", "battlefield", "Loxodon Eavesdropper");
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(activate(s, "p1", clue));
      expect(pt(s, elephant)).toEqual([3, 3]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Rope"), "Piochez"));
      expect(pt(s, elephant)).toEqual([4, 4]);
      expect(chars(s, elephant).keywords).toContain("vigilance");
    });
  });

  describe("Nervous Gardener", () => {
    it("retourné face visible : cherche une carte de terrain avec un type de terrain de base", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Nervous Gardener"], library: ["Opt", "Thundering Falls"] },
      });
      const r = castDisguisedThenTurnUp(s, "Nervous Gardener");
      s = settle(r.s);
      expect(names(s, s.players.p1?.hand)).toEqual(["Thundering Falls"]);
    });
  });

  describe("Pick Your Poison", () => {
    it("chaque adversaire sacrifie une créature avec le vol", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Forest"], hand: ["Pick Your Poison"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Pick Your Poison", undefined, { mode: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(onBattlefield(s, "p2", "Bear Cub")).toHaveLength(1);
      expect(onBattlefield(s, "p3", "Bear Cub")).toHaveLength(1);
    });

    it("chaque adversaire sacrifie un artefact", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Rope"], hand: ["Pick Your Poison"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      s = settle(cast(s, "p1", "Pick Your Poison", undefined, { mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Rope")).toHaveLength(1);
    });
  });

  describe("Pompous Gadabout", () => {
    it("défense talismanique pendant votre tour seulement", () => {
      const mine = scenario({ p1: { battlefield: ["Pompous Gadabout"] } });
      expect(chars(mine, idOf(mine, "p1", "battlefield", "Pompous Gadabout")).keywords).toContain("hexproof");
      const theirs = scenario({ active: "p2", p1: { battlefield: ["Pompous Gadabout"] } });
      expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Pompous Gadabout")).keywords).not.toContain("hexproof");
    });

    it("ne peut pas être bloquée par une créature face cachée (sans nom)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Pompous Gadabout"] },
        p2: { battlefield: lands("Forest", 3), hand: ["Nervous Gardener"] },
      });
      s = passBoth(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Nervous Gardener"), faceDown: true }));
      const faceDown = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      const gadabout = idOf(s, "p1", "battlefield", "Pompous Gadabout");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: gadabout, defender: "p2" }] });
      expect(canBlock(s, faceDown, gadabout)).toBe(false);
    });
  });

  describe("The Pride of Hull Clade", () => {
    it("coûte {X} de moins, X étant l'endurance totale de vos créatures", () => {
      const s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Pelakka Wurm"], hand: ["The Pride of Hull Clade"] } });
      // {10}{G} − 7 = {3}{G} : quatre terrains manquent d'un.
      expect(() => cast(s, "p1", "The Pride of Hull Clade")).toThrow();
      const t = scenario({ p1: { battlefield: [...lands("Forest", 4), "Pelakka Wurm"], hand: ["The Pride of Hull Clade"] } });
      const after = settle(cast(t, "p1", "The Pride of Hull Clade"));
      const pride = idOf(after, "p1", "battlefield", "The Pride of Hull Clade");
      expect(chars(after, pride).keywords).toContain("defender");
    });

    it("{2}{U}{U} : +1/+0, attaque malgré le défenseur, et pioche autant que son endurance en blessant un joueur", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "The Pride of Hull Clade"], library: lands("Forest", 20) },
      });
      const pride = idOf(s, "p1", "battlefield", "The Pride of Hull Clade");
      s = settle(activate(s, "p1", pride, undefined, { t: [pride] }));
      expect(pt(s, pride)).toEqual([3, 15]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: pride, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "end" || (x.players.p2?.life ?? 20) < 20);
      s = settle(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.hand).toHaveLength(15);
    });
  });

  describe("Rope", () => {
    it("la créature équipée a +1/+2, la portée et ne peut être bloquée que par une seule créature ; {2}, sacrifice : piochez", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 5), "Rope", "Bear Cub"] } });
      const rope = idOf(s, "p1", "battlefield", "Rope");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, rope).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", rope, "Équip", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 4]);
      expect(chars(s, bear).keywords).toContain("reach");
      expect(chars(s, bear).blockRules.some((r) => r.maxBlockers === 1)).toBe(true);
      s = settle(activate(s, "p1", rope, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Rope")).toHaveLength(1);
    });
  });

  describe("Rubblebelt Maverick", () => {
    it("en arrivant, surveillance 2", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Rubblebelt Maverick"], library: ["Opt", "Island", "Forest"] } });
      s = settle(cast(s, "p1", "Rubblebelt Maverick"), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Island", "Opt"]);
    });

    it("{G}, exilez-la de votre cimetière : un marqueur +1/+1, en rituel seulement", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], graveyard: ["Rubblebelt Maverick"] } });
      const maverick = idOf(s, "p1", "graveyard", "Rubblebelt Maverick");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", maverick, undefined, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Rubblebelt Maverick"]);
      const opp = scenario({ active: "p2", p1: { battlefield: ["Forest", "Bear Cub"], graveyard: ["Rubblebelt Maverick"] } });
      const card = idOf(opp, "p1", "graveyard", "Rubblebelt Maverick");
      const p1Turn = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(legalActions(p1Turn, "p1").some((a) => a.type === "activate" && a.source === card)).toBe(false);
    });
  });

  describe("Sharp-Eyed Rookie", () => {
    it("une créature plus forte ou plus endurante arrive : un marqueur +1/+1 et un Indice ; sinon rien", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 9), "Sharp-Eyed Rookie"], hand: ["Llanowar Elves", "Pelakka Wurm"] },
      });
      const rookie = idOf(s, "p1", "battlefield", "Sharp-Eyed Rookie");
      expect(chars(s, rookie).keywords).toContain("vigilance");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[rookie]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(0);
      s = settle(cast(s, "p1", "Pelakka Wurm"));
      expect(s.objects[rookie]?.counters["+1/+1"]).toBe(1);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Slime Against Humanity", () => {
    it("un Limon 0/0 avec le piétinement et 2 + X marqueurs (Limons et homonymes au cimetière et en exil)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Slime Against Humanity"],
          graveyard: ["Slime Against Humanity", "Slime Against Humanity", "Bear Cub"],
        },
        p2: { graveyard: ["Slime Against Humanity"] },
      });
      s = settle(cast(s, "p1", "Slime Against Humanity"));
      const ooze = idOf(s, "p1", "battlefield", "Ooze");
      expect(s.objects[ooze]?.counters["+1/+1"]).toBe(4);
      expect(pt(s, ooze)).toEqual([4, 4]);
      expect(chars(s, ooze).keywords).toContain("trample");
    });
  });

  describe("They Went This Way", () => {
    it("une carte de terrain de base arrive engagée, puis enquêtez", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["They Went This Way"], library: ["Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "They Went This Way"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Undergrowth Recon", () => {
    it("au début de votre entretien, une carte de terrain de votre cimetière revient engagée", () => {
      let s = scenario({ p1: { battlefield: ["Undergrowth Recon"], graveyard: ["Island", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    });
  });

  describe("Vengeful Creeper", () => {
    it("retournée face visible : détruit un artefact ou un enchantement adverse", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 9), "Rope"], hand: ["Vengeful Creeper"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const r = castDisguisedThenTurnUp(s, "Vengeful Creeper");
      s = settle(r.s);
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Rope")).toHaveLength(1);
      expect(pt(s, r.id)).toEqual([5, 5]);
    });
  });

  describe("Vitu-Ghazi Inspector", () => {
    it("preuves 6 réunies : un marqueur +1/+1 sur une créature ciblée et 2 PV ; sinon rien", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub"],
          hand: ["Vitu-Ghazi Inspector", "Vitu-Ghazi Inspector"],
          graveyard: ["Pelakka Wurm"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Vitu-Ghazi Inspector"));
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Vitu-Ghazi Inspector", undefined, { kicked: true }), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — multicolores", () => {
  /**
   * Murders at Karlov Manor, lot A — cartes multicolores : chaque carte est confrontée à son texte Oracle (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const exiled = (s: S, name: string) => s.exile.some((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const cast = (s: S, player: string, name: string, extra: Partial<Extract<Decision, { type: "cast" }>> = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de la source dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label = "", extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string, label = "") =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
  /** Choisit cette option dans un choix de type « pick » qui la propose. */
  const pick =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.some((id) => req.options.includes(id))
        ? ids.filter((id) => req.options.includes(id))
        : undefined;
  /** Attaque avec ces créatures (p1 contre p2), puis résout les déclenchements. */
  const attack = (s: S, ids: string[], answer?: Answer) => {
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return c.stack.length > 0 || c.triggers.length > 0 || c.pending?.kind === "choice" ? settle(c, answer) : c;
  };
  /** Lance la carte face cachée pour {3} et la résout ; renvoie l'état et l'identifiant du permanent face cachée. */
  const castFaceDown = (s: S, name: string): [S, string] => {
    const t = settle(cast(s, "p1", name, { faceDown: true }));
    return [t, t.battlefield.find((x) => t.objects[x]?.defId === FACE_DOWN_ID) as string];
  };
  const clues = (s: S, player = "p1") => idsOf(s, player, "battlefield", "Clue");

  describe("Agrus Kos, Spirit of Justice", () => {
    it("en arrivant, suspecte la créature ciblée ; en attaquant, exile la créature déjà suspecte", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Mountain", 2)], hand: ["Agrus Kos, Spirit of Justice"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Agrus Kos, Spirit of Justice"), pick(bear));
      expect(s.objects[bear]?.suspected).toBe(true);
      expect(s.battlefield).toContain(bear);

      let t = scenario({ p1: { battlefield: ["Agrus Kos, Spirit of Justice"] }, p2: { battlefield: ["Bear Cub"] } });
      const theirs = idOf(t, "p2", "battlefield", "Bear Cub");
      const o = t.objects[theirs];
      if (o) o.suspected = true;
      t = attack(t, [idOf(t, "p1", "battlefield", "Agrus Kos, Spirit of Justice")], pick(theirs));
      expect(exiled(t, "Bear Cub")).toBe(true);
    });
  });

  describe("Alquist Proft, Master Sleuth", () => {
    it("en arrivant, enquête", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Island", "Island"], hand: ["Alquist Proft, Master Sleuth"] } });
      s = settle(cast(s, "p1", "Alquist Proft, Master Sleuth"));
      expect(clues(s)).toHaveLength(1);
    });

    it("{X}{W}{U}{U}, {T}, sacrifiez un Indice : piochez X cartes et gagnez X PV", () => {
      let s = scenario({
        p1: { battlefield: ["Alquist Proft, Master Sleuth", "Plains", ...lands("Island", 4)], library: lands("Forest", 5) },
      });
      createTokens(s, "p1", CLUE, 1);
      const alquist = idOf(s, "p1", "battlefield", "Alquist Proft, Master Sleuth");
      s = settle(activate(s, "p1", alquist, "X cartes", { x: 2 }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(22);
      expect(clues(s)).toHaveLength(0);
      expect(s.objects[alquist]?.tapped).toBe(true);
    });
  });

  describe("Anzrag, the Quake-Mole", () => {
    it("bloquée : vos créatures se dégagent et une phase de combat supplémentaire suit", () => {
      const s = scenario({
        p1: { battlefield: ["Anzrag, the Quake-Mole", "Bear Cub"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const anzrag = idOf(s, "p1", "battlefield", "Anzrag, the Quake-Mole");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      c = act(c, "p1", { type: "declareAttackers", attackers: [anzrag, bear].map((id) => ({ id, defender: "p2" })) });
      c = advanceUntil(c, (x) => x.pending?.kind === "declareBlockers");
      const blocker = idOf(c, "p2", "battlefield", "Fire Elemental");
      c = act(c, "p2", { type: "declareBlockers", blocks: [{ blocker, attacker: anzrag }] });
      c = settle(c);
      expect(c.objects[anzrag]?.tapped).toBe(false);
      expect(c.objects[bear]?.tapped).toBe(false);
      expect(c.turn.extraCombats).toBe(1);
    });

    it("{3}{R}{R}{G}{G} : doit être bloquée ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Anzrag, the Quake-Mole", ...lands("Mountain", 3), ...lands("Forest", 4)] } });
      const anzrag = idOf(s, "p1", "battlefield", "Anzrag, the Quake-Mole");
      s = settle(activate(s, "p1", anzrag));
      expect(chars(s, anzrag).keywords).toContain("mustBeBlocked");
    });
  });

  describe("Assassin's Trophy", () => {
    it("détruit le permanent adverse ; son contrôleur cherche un terrain de base et le met sur le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Assassin's Trophy"] },
        p2: { battlefield: ["Fire Elemental"], library: ["Plains", "Opt"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Assassin's Trophy", { targets: { t: [elemental] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Plains")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Plains")]?.tapped).toBe(false);
    });

    it("ne peut pas cibler un permanent que vous contrôlez", () => {
      const s = scenario({ p1: { battlefield: ["Swamp", "Forest", "Bear Cub"], hand: ["Assassin's Trophy"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Assassin's Trophy", { targets: { t: [bear] } })).toThrow();
    });
  });

  describe("Blood Spatter Analysis", () => {
    it("en arrivant, 3 blessures à une créature adverse ; chaque mort : meule une carte et un marqueur de sang", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain"], hand: ["Blood Spatter Analysis"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Blood Spatter Analysis"), pick(bear));
      const analysis = idOf(s, "p1", "battlefield", "Blood Spatter Analysis");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[analysis]?.counters.bloodstain).toBe(1);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("au cinquième marqueur, il est sacrifié et une carte de créature de votre cimetière revient en main", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Blood Spatter Analysis", counters: { bloodstain: 4 } }, ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          graveyard: ["Pelakka Wurm"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p1", "graveyard", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }), pick(wurm));
      expect(idsOf(s, "p1", "graveyard", "Blood Spatter Analysis")).toHaveLength(1);
      expect(names(s, s.players.p1?.hand)).toContain("Pelakka Wurm");
    });
  });

  describe("Break Out", () => {
    it("une créature de valeur de mana 2 ou moins peut arriver avec la célérité ; le reste va dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Forest"],
          hand: ["Break Out"],
          library: ["Forest", "Bear Cub", "Opt", "Island", "Swamp", "Plains", "Mountain"],
        },
      });
      const bear = s.players.p1?.library[1] as string;
      s = settle(cast(s, "p1", "Break Out"), (req) => (req.type === "pick" ? [bear] : req.type === "yesNo" ? [1] : undefined));
      const onField = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, onField).keywords).toContain("haste");
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Mountain");
      expect(s.players.p1?.library).toHaveLength(6);
    });

    it("une créature plus chère va dans la main", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Forest"], hand: ["Break Out"], library: ["Fire Elemental", "Opt", "Forest"] },
      });
      const elemental = s.players.p1?.library[0] as string;
      s = settle(cast(s, "p1", "Break Out"), pick(elemental));
      expect(names(s, s.players.p1?.hand)).toEqual(["Fire Elemental"]);
      expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(0);
    });
  });

  describe("Coerced to Kill", () => {
    it("vous contrôlez la créature enchantée, 1/1 de base avec le contact mortel, Assassin en plus", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), ...lands("Swamp", 2)], hand: ["Coerced to Kill"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Coerced to Kill", { targets: { enchant: [elemental] } }));
      const aura = idOf(s, "p1", "battlefield", "Coerced to Kill");
      expect(s.objects[aura]?.attachedTo).toBe(elemental);
      expect(s.objects[elemental]?.controller).toBe("p1");
      const c = chars(s, elemental);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.keywords).toContain("deathtouch");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Elemental", "Assassin"]));
    });
  });

  describe("Crowd-Control Warden", () => {
    it("arrive avec un marqueur +1/+1 par autre créature que vous contrôlez", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 3), ...lands("Plains", 2)],
          hand: ["Crowd-Control Warden"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      s = settle(cast(s, "p1", "Crowd-Control Warden"));
      const warden = idOf(s, "p1", "battlefield", "Crowd-Control Warden");
      expect(s.objects[warden]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, warden)).toEqual([6, 6]);
    });

    it("face cachée : une 2/2 sans marqueur ; retournée face visible, elle reçoit ses marqueurs", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4), ...lands("Plains", 4)], hand: ["Crowd-Control Warden"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Crowd-Control Warden");
      expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(activate(s, "p1", id, "Retourner"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, id)).toEqual([5, 5]);
    });
  });

  describe("Curious Cadaver", () => {
    it("quand vous sacrifiez un Indice, elle revient de votre cimetière dans votre main", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), graveyard: ["Curious Cadaver"] } });
      const [clue] = createTokens(s, "p1", CLUE, 1);
      s = settle(activate(s, "p1", clue as string));
      expect(names(s, s.players.p1?.hand)).toContain("Curious Cadaver");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Curious Cadaver");
    });
  });

  describe("Deadly Complication", () => {
    it("les deux modes : détruit une créature, marqueur +1/+1 sur votre créature suspecte qui n'est plus suspecte", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", "Mountain", "Mountain"], hand: ["Deadly Complication"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const o = s.objects[bear];
      if (o) o.suspected = true;
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Deadly Complication", { mode: 2, targets: { d: [elemental], s: [bear] } }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.suspected).toBeUndefined();
    });

    it("le second mode ne cible qu'une créature suspecte que vous contrôlez", () => {
      const s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", "Mountain", "Mountain"], hand: ["Deadly Complication"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Deadly Complication", { mode: 1, targets: { s: [bear] } })).toThrow();
    });
  });

  describe("Detective's Satchel", () => {
    it("enquête deux fois ; {T} : un Thopter, seulement si vous avez sacrifié un artefact ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), ...lands("Mountain", 2)], hand: ["Detective's Satchel"] } });
      s = settle(cast(s, "p1", "Detective's Satchel"));
      expect(clues(s)).toHaveLength(2);
      const satchel = idOf(s, "p1", "battlefield", "Detective's Satchel");
      expect(canActivate(s, "p1", satchel, "Thopter")).toBe(false);
      s = settle(activate(s, "p1", clues(s)[0] as string));
      expect(canActivate(s, "p1", satchel, "Thopter")).toBe(true);
      s = settle(activate(s, "p1", satchel, "Thopter"));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
    });
  });

  describe("Dog Walker", () => {
    it("retournée face visible : crée deux Chiens 1/1 blancs engagés", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Dog Walker"] } });
      let id = "";
      [s, id] = castFaceDown(s, "Dog Walker");
      s = settle(activate(s, "p1", id, "Retourner"));
      const dogs = idsOf(s, "p1", "battlefield", "Dog");
      expect(dogs).toHaveLength(2);
      expect(dogs.every((d) => s.objects[d]?.tapped)).toBe(true);
      expect(chars(s, dogs[0] as string).colors).toEqual(["W"]);
    });
  });

  describe("Doppelgang", () => {
    it("pour chacune des X cibles, X jetons copies", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4), ...lands("Island", 4)], hand: ["Doppelgang"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Doppelgang", { x: 2, targets: { t: [bear, elves] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });
  });

  describe("Drag the Canal", () => {
    it("un Détective 2/2 ; si une créature est morte ce tour-ci, 2 PV, surveillance 2 et un Indice", () => {
      let s = scenario({ p1: { battlefield: ["Island", "Swamp"], hand: ["Drag the Canal"] } });
      s = settle(cast(s, "p1", "Drag the Canal"));
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(1);
      expect(clues(s)).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);

      let t = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Island", "Swamp"], hand: ["Drag the Canal", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      t = settle(cast(t, "p1", "Drag the Canal"));
      expect(idsOf(t, "p1", "battlefield", "Detective")).toHaveLength(1);
      expect(clues(t)).toHaveLength(1);
      expect(t.players.p1?.life).toBe(22);
    });
  });

  describe("Ezrim, Agency Chief", () => {
    it("enquête deux fois ; {1}, sacrifiez un artefact : le lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 3)], hand: ["Ezrim, Agency Chief"] } });
      s = settle(cast(s, "p1", "Ezrim, Agency Chief"));
      expect(clues(s)).toHaveLength(2);
      const ezrim = idOf(s, "p1", "battlefield", "Ezrim, Agency Chief");
      s = settle(activate(s, "p1", ezrim, "lien de vie", { sacrifice: [clues(s)[0] as string] }));
      expect(clues(s)).toHaveLength(1);
      expect(chars(s, ezrim).keywords).toContain("lifelink");
      expect(chars(s, ezrim).keywords).not.toContain("hexproof");
    });
  });

  describe("Faerie Snoop", () => {
    it("retournée face visible : une des deux cartes du dessus en main, l'autre au cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
          hand: ["Faerie Snoop"],
          library: ["Opt", "Bear Cub", "Forest"],
        },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Faerie Snoop");
      const bear = s.players.p1?.library[1] as string;
      s = settle(activate(s, "p1", id, "Retourner"), pick(bear));
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });
  });

  describe("Gadget Technician", () => {
    it("un Thopter en arrivant, et un autre quand elle est retournée face visible", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Mountain", 2)], hand: ["Gadget Technician"] } });
      s = settle(cast(s, "p1", "Gadget Technician"));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: [...lands("Island", 3), ...lands("Mountain", 2)], hand: ["Gadget Technician"] } });
      let id = "";
      [t, id] = castFaceDown(t, "Gadget Technician");
      expect(idsOf(t, "p1", "battlefield", "Thopter")).toHaveLength(0);
      t = settle(activate(t, "p1", id, "Retourner"));
      const thopters = idsOf(t, "p1", "battlefield", "Thopter");
      expect(thopters).toHaveLength(1);
      expect(chars(t, thopters[0] as string).keywords).toContain("flying");
    });
  });

  describe("Gleaming Geardrake", () => {
    it("enquête en arrivant ; chaque artefact sacrifié lui donne un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Mountain"], hand: ["Gleaming Geardrake"] } });
      s = settle(cast(s, "p1", "Gleaming Geardrake"));
      const drake = idOf(s, "p1", "battlefield", "Gleaming Geardrake");
      s = settle(activate(s, "p1", clues(s)[0] as string));
      expect(s.objects[drake]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Granite Witness", () => {
    it("retournée face visible : engage ou dégage la créature ciblée, au choix", () => {
      for (const [mode, tappedBefore] of [
        ["0", false],
        ["1", true],
      ] as const) {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Granite Witness"] },
          p2: { battlefield: [{ name: "Fire Elemental", tapped: tappedBefore }] },
        });
        let id = "";
        [s, id] = castFaceDown(s, "Granite Witness");
        const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(activate(s, "p1", id, "Retourner"), (req) =>
          req.intent === "triggerMode"
            ? [mode]
            : req.type === "pick" && req.options.includes(elemental)
              ? [elemental]
              : undefined,
        );
        expect(s.objects[elemental]?.tapped).toBe(!tappedBefore);
      }
    });
  });

  describe("Insidious Roots", () => {
    it("vos jetons de créature produisent du mana de n'importe quelle couleur", () => {
      const s = scenario({ p1: { battlefield: ["Insidious Roots", "Bear Cub"] } });
      const [dog] = createTokens(
        s,
        "p1",
        { name: "Dog", colors: ["W"], types: ["Creature"], subtypes: ["Dog"], power: 1, toughness: 1 },
        1,
      );
      // Pas de mal d'invocation : le jeton est sous votre contrôle depuis le début du tour.
      const token = s.objects[dog as string];
      if (token) token.controlledSince = 0;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === dog ? a.colors : []));
      expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === bear)).toBe(false);
    });

    it("des cartes de créature quittent votre cimetière : une Plante 0/1, puis un marqueur +1/+1 sur chaque Plante", () => {
      let s = scenario({
        p1: {
          battlefield: ["Insidious Roots", ...lands("Plains", 4), ...lands("Mountain", 2)],
          hand: ["Push // Pull"],
          graveyard: ["Bear Cub", "Llanowar Elves"],
        },
      });
      const gy = s.players.p1?.graveyard ?? [];
      s = settle(cast(s, "p1", "Push // Pull", { face: 1, targets: { t: [...gy] } }));
      const plants = idsOf(s, "p1", "battlefield", "Plant");
      expect(plants).toHaveLength(1);
      expect(pt(s, plants[0] as string)).toEqual([1, 2]);
    });
  });

  describe("Kellan, Inquisitive Prodigy // Tail the Suspect", () => {
    it("Kellan attaque : détruit un artefact ; si c'était le vôtre, piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: ["Kellan, Inquisitive Prodigy // Tail the Suspect"], library: lands("Forest", 3) },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const kellan = idOf(s, "p1", "battlefield", "Kellan, Inquisitive Prodigy // Tail the Suspect");
      const [mine] = createTokens(s, "p1", CLUE, 1);
      const theirs = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      const t = attack(s, [kellan], pick(theirs));
      expect(idsOf(t, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(0);
      s = attack(s, [kellan], pick(mine as string));
      expect(clues(s)).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Tail the Suspect : enquête, et un terrain de plus ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Island"], hand: ["Kellan, Inquisitive Prodigy // Tail the Suspect", "Forest", "Island"] },
      });
      s = settle(cast(s, "p1", "Kellan, Inquisitive Prodigy // Tail the Suspect", { face: 1 }));
      expect(clues(s)).toHaveLength(1);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Kraul Whipcracker", () => {
    it("en arrivant, détruit un jeton adverse (pas une carte)", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Kraul Whipcracker"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const [clue] = createTokens(s, "p2", CLUE, 1);
      s = settle(cast(s, "p1", "Kraul Whipcracker"), pick(clue as string));
      expect(clues(s, "p2")).toHaveLength(0);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Leyline of the Guildpact", () => {
    it("vos permanents non-terrains sont de toutes les couleurs ; vos terrains ont tous les types de base", () => {
      const s = scenario({
        p1: { battlefield: ["Leyline of the Guildpact", "Bear Cub", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(s.defs[s.objects[idOf(s, "p1", "battlefield", "Leyline of the Guildpact")]?.defId ?? ""]?.leyline).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).colors).toHaveLength(5);
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).colors).toEqual(["G"]);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(chars(s, forest).colors).toHaveLength(0);
      const produced = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === forest ? a.colors : []));
      expect(produced.sort()).toEqual(["B", "G", "R", "U", "W"]);
    });
  });

  describe("Lightning Helix", () => {
    it("3 blessures à n'importe quelle cible et 3 PV", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Lightning Helix"] } });
      s = settle(cast(s, "p1", "Lightning Helix", { targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });
  });

  describe("Meddling Youths", () => {
    it("enquête quand vous attaquez avec trois créatures ou plus, pas avec deux", () => {
      const s = scenario({ p1: { battlefield: ["Meddling Youths", "Bear Cub", "Llanowar Elves"] } });
      const all = idsOf(s, "p1", "battlefield", "Meddling Youths").concat(
        idsOf(s, "p1", "battlefield", "Bear Cub"),
        idsOf(s, "p1", "battlefield", "Llanowar Elves"),
      );
      expect(clues(attack(s, all))).toHaveLength(1);
      expect(clues(attack(s, all.slice(0, 2)))).toHaveLength(0);
    });
  });

  describe("Private Eye", () => {
    it("les autres Détectives gagnent +1/+1 ; deuxième carte piochée : le Détective ciblé ne peut pas être bloqué", () => {
      let s = scenario({
        p1: { battlefield: ["Private Eye", "Undercover Crocodelf", "Bear Cub", ...lands("Island", 3)], hand: ["Opt"] },
      });
      const croc = idOf(s, "p1", "battlefield", "Undercover Crocodelf");
      const eye = idOf(s, "p1", "battlefield", "Private Eye");
      expect(pt(s, croc)).toEqual([6, 6]);
      expect(pt(s, eye)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      // Le joueur a pioché sa première carte du tour (scénario : aucune) ; Opt fait piocher la première, la seconde déclenche.
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, croc).keywords).not.toContain("unblockable");
      const [clue] = createTokens(s, "p1", CLUE, 1);
      s = settle(activate(s, "p1", clue as string), pick(croc));
      expect(chars(s, croc).keywords).toContain("unblockable");
    });
  });

  describe("Rakdos, Patron of Chaos", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Rakdos, Patron of Chaos"], library: lands("Swamp", 5) },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
    /** Jusqu'à la capacité de Rakdos sur la pile à l'étape de fin, puis l'adversaire répond. */
    const toEnd = (s: S, sacrifice: boolean) => {
      const c = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      return settle(c, (req) => (req.type === "yesNo" ? [sacrifice ? 1 : 0] : undefined));
    };

    it("si l'adversaire ciblé ne sacrifie pas deux permanents non-terrains, vous piochez deux cartes", () => {
      const s = toEnd(setup(), false);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("s'il les sacrifie, vous ne piochez pas", () => {
      const s = toEnd(setup(), true);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });
  });

  describe("Relive the Past", () => {
    it("un artefact et un enchantement non-Aura reviennent en Élémentaux 5/5 en plus de leurs types", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), ...lands("Plains", 2)],
          hand: ["Relive the Past"],
          graveyard: ["Esoteric Duplicator", "Leyline of the Guildpact", "Forest"],
        },
      });
      const a = idOf(s, "p1", "graveyard", "Esoteric Duplicator");
      const e = idOf(s, "p1", "graveyard", "Leyline of the Guildpact");
      const l = idOf(s, "p1", "graveyard", "Forest");
      const uids = [a, l, e].map((x) => s.objects[x]?.uid);
      s = settle(cast(s, "p1", "Relive the Past", { targets: { a: [a], l: [l], e: [e] } }));
      for (const id of uids.map((u) => s.battlefield.find((b) => s.objects[b]?.uid === u) ?? "")) {
        const c = chars(s, id);
        expect(c.types).toContain("Creature");
        expect(c.subtypes).toContain("Elemental");
        expect([c.power, c.toughness]).toEqual([5, 5]);
      }
      expect(chars(s, idOf(s, "p1", "battlefield", "Esoteric Duplicator")).types).toContain("Artifact");
    });
  });

  describe("Repulsive Mutation", () => {
    it("X marqueurs +1/+1, puis contrecarre le sort sauf si son contrôleur paie la plus grande force parmi vos créatures", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Bear Cub", "Forest", "Island", "Forest"], hand: ["Repulsive Mutation"] },
        p2: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p1", "Repulsive Mutation", { x: 1, targets: { c: [bear], s: [strike] } });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      // Force 3 : les deux Montagnes restantes ne suffisent pas.
      expect(asked).toBe(false);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Rune-Brand Juggler", () => {
    it("suspecte une de vos créatures ; {3}{B}{R}, sacrifiez une créature suspecte : -5/-5", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4), ...lands("Mountain", 3)], hand: ["Rune-Brand Juggler"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rune-Brand Juggler"), pick(bear));
      expect(s.objects[bear]?.suspected).toBe(true);
      const juggler = idOf(s, "p1", "battlefield", "Rune-Brand Juggler");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(activate(s, "p1", juggler, "-5/-5", { targets: { t: [elemental] }, sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Sanguine Savior, Shady Informant", () => {
    it("Sanguine Savior retournée face visible : une autre de vos créatures gagne le lien de vie", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 3), ...lands("Swamp", 2)], hand: ["Sanguine Savior"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Sanguine Savior");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", id, "Retourner"), pick(bear));
      expect(chars(s, bear).keywords).toContain("lifelink");
    });

    it("Shady Informant meurt : 2 blessures à n'importe quelle cible", () => {
      let s = scenario({
        p1: { battlefield: ["Shady Informant", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      s = settle(
        cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Shady Informant")] } }),
        (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined),
      );
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Soul Search", () => {
    it("exile la carte non-terrain choisie dans la main adverse ; valeur de mana 1 ou moins : un Esprit", () => {
      const run = (card: string) => {
        let s = scenario({
          p1: { battlefield: ["Plains", "Swamp"], hand: ["Soul Search"] },
          p2: { hand: [card, "Forest"] },
        });
        s = settle(cast(s, "p1", "Soul Search", { targets: { t: ["p2"] } }));
        return s;
      };
      const cheap = run("Opt");
      expect(exiled(cheap, "Opt")).toBe(true);
      expect(names(cheap, cheap.players.p2?.hand)).toEqual(["Forest"]);
      expect(idsOf(cheap, "p1", "battlefield", "Spirit")).toHaveLength(1);
      const big = run("Fire Elemental");
      expect(exiled(big, "Fire Elemental")).toBe(true);
      expect(idsOf(big, "p1", "battlefield", "Spirit")).toHaveLength(0);
    });
  });

  describe("Sumala Sentry", () => {
    it("un permanent face cachée que vous contrôlez est retourné : un marqueur +1/+1 sur lui et sur Sumala Sentry", () => {
      let s = scenario({
        p1: { battlefield: ["Sumala Sentry", ...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Dog Walker"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Dog Walker");
      s = settle(activate(s, "p1", id, "Retourner"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Sumala Sentry")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Teysa, Opulent Oligarch", () => {
    it("à votre étape de fin, enquête pour chaque adversaire qui a perdu des PV ; un Indice au cimetière : un Esprit, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Teysa, Opulent Oligarch", ...lands("Mountain", 6)],
          hand: ["Lightning Strike"],
        },
      });
      const [c1, c2] = createTokens(s, "p1", CLUE, 2);
      s = settle(activate(s, "p1", c1 as string));
      s = settle(activate(s, "p1", c2 as string));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(clues(s)).toHaveLength(1);
    });
  });

  describe("Trostani, Three Whispers", () => {
    it("trois capacités : contact mortel, vigilance, double initiative à la créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: ["Trostani, Three Whispers", "Bear Cub", ...lands("Forest", 3), ...lands("Plains", 3)] },
      });
      const trostani = idOf(s, "p1", "battlefield", "Trostani, Three Whispers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", trostani, "contact mortel", { targets: { t: [bear] } }));
      s = settle(activate(s, "p1", trostani, "vigilance", { targets: { t: [bear] } }));
      s = settle(activate(s, "p1", trostani, "double initiative", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "vigilance", "doubleStrike"]));
    });
  });

  describe("Undercover Crocodelf", () => {
    it("blessures de combat à un joueur : enquête", () => {
      let s = scenario({ p1: { battlefield: ["Undercover Crocodelf"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Undercover Crocodelf")]);
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" || x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(15);
      expect(clues(s)).toHaveLength(1);
    });
  });

  describe("Wispdrinker Vampire", () => {
    it("une autre créature de force 2 ou moins arrive sous votre contrôle : chaque adversaire perd 1 PV, vous en gagnez 1", () => {
      let s = scenario({
        p1: { battlefield: ["Wispdrinker Vampire", ...lands("Forest", 7)], hand: ["Bear Cub", "Pelakka Wurm"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      const t = settle(
        cast(
          scenario({ p1: { battlefield: ["Wispdrinker Vampire", ...lands("Forest", 7)], hand: ["Pelakka Wurm"] } }),
          "p1",
          "Pelakka Wurm",
        ),
      );
      expect(t.players.p2?.life).toBe(20);
    });

    it("{5}{W}{B} : vos créatures de force 2 ou moins gagnent le contact mortel et le lien de vie", () => {
      let s = scenario({
        p1: { battlefield: ["Wispdrinker Vampire", "Bear Cub", "Fire Elemental", ...lands("Plains", 4), ...lands("Swamp", 3)] },
      });
      const vampire = idOf(s, "p1", "battlefield", "Wispdrinker Vampire");
      s = settle(activate(s, "p1", vampire));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toEqual(
        expect.arrayContaining(["deathtouch", "lifelink"]),
      );
      expect(chars(s, idOf(s, "p1", "battlefield", "Fire Elemental")).keywords).not.toContain("lifelink");
    });
  });

  describe("Worldsoul's Rage", () => {
    it("X blessures, puis jusqu'à X cartes de terrain de votre main et de votre cimetière, engagées", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)],
          hand: ["Worldsoul's Rage", "Island", "Plains"],
          graveyard: ["Swamp", "Forest"],
        },
      });
      const island = idOf(s, "p1", "hand", "Island");
      const swamp = idOf(s, "p1", "graveyard", "Swamp");
      s = settle(cast(s, "p1", "Worldsoul's Rage", { x: 2, targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.options.includes(island)
          ? [island]
          : req.type === "pick" && req.options.includes(swamp)
            ? [swamp]
            : undefined,
      );
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Swamp")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Swamp")]?.tapped).toBe(true);
      expect(names(s, s.players.p1?.hand)).toEqual(["Plains"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Forest", "Worldsoul's Rage"]));
    });
  });

  describe("cartes scindées", () => {
    it("Cease : exile jusqu'à deux cartes d'un même cimetière ; le joueur ciblé gagne 2 PV et pioche", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Cease // Desist"] },
        p2: { graveyard: ["Opt", "Bear Cub"] },
      });
      const gy = s.players.p2?.graveyard ?? [];
      s = settle(cast(s, "p1", "Cease // Desist", { face: 0, targets: { c: [...gy], p: ["p1"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(exiled(s, "Opt") && exiled(s, "Bear Cub")).toBe(true);
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Desist : détruit tous les artefacts et enchantements", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), ...lands("Plains", 2), "Insidious Roots"], hand: ["Cease // Desist"] },
        p2: { battlefield: ["Esoteric Duplicator", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Cease // Desist", { face: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Insidious Roots")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Fuss : un marqueur +1/+1 sur chaque créature attaquante que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Mountain", 3)], hand: ["Fuss // Bother"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = attack(s, [bear]);
      s = settle(cast(s, "p1", "Fuss // Bother", { face: 0 }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Bother : trois Thopters 1/1 volants, puis surveillance 2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 3)], hand: ["Fuss // Bother"] } });
      s = settle(cast(s, "p1", "Fuss // Bother", { face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(3);
    });

    it("Push détruit une créature engagée seulement ; Pull : jusqu'à deux créatures d'un cimetière, sacrifiées à la fin du tour", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Plains", 2)], hand: ["Push // Pull"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Fire Elemental"] },
      });
      expect(() =>
        cast(s, "p1", "Push // Pull", { face: 0, targets: { t: [idOf(s, "p2", "battlefield", "Fire Elemental")] } }),
      ).toThrow();
      const pushed = settle(
        cast(s, "p1", "Push // Pull", { face: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      );
      expect(idsOf(pushed, "p2", "graveyard", "Bear Cub")).toHaveLength(1);

      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2)], hand: ["Push // Pull"] },
        p2: { graveyard: ["Fire Elemental", "Bear Cub"] },
      });
      const gy = t.players.p2?.graveyard ?? [];
      t = settle(cast(t, "p1", "Push // Pull", { face: 1, targets: { t: [...gy] } }));
      const elemental = idOf(t, "p1", "battlefield", "Fire Elemental");
      expect(chars(t, elemental).keywords).toContain("haste");
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      t = advanceUntil(t, (x) => x.turn.active !== "p1");
      expect(idsOf(t, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Pull : les cibles doivent venir d'un seul cimetière", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2)], hand: ["Push // Pull"], graveyard: ["Bear Cub"] },
        p2: { graveyard: ["Fire Elemental"] },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p2", "graveyard", "Fire Elemental")];
      expect(() => cast(s, "p1", "Push // Pull", { face: 1, targets: { t: targets } })).toThrow();
    });
  });
});

describe("Murders at Karlov Manor, lot A — incolores et terrains", () => {
  /**
   * Murders at Karlov Manor, lot A : cartes incolores et terrains, confrontées à leur texte Oracle (plan R, lot R7).
   */
  type S = GameState;
  /** Capacité activée de la source dont le libellé contient `label` (indice et option proposée). */
  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Capacité « ${label} » introuvable`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  /** Couleurs proposées par les capacités de mana d'une source. */
  const manaColors = (s: S, player: string, source: string) =>
    [...new Set(legalActions(s, player).flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : [])))].sort();

  const DETECTIVE_CARD = customCard({ name: "Test Detective", subtypes: ["Detective"], power: 2, toughness: 2 });
  const PRISM = customCard({ name: "Test Prism", colors: ["W", "U", "B", "R", "G"], power: 1, toughness: 1 });

  describe("terrains à surveillance", () => {
    it("Commercial District arrive engagé, puis surveillance 1", () => {
      let s = scenario({ p1: { hand: ["Commercial District"], library: ["Opt", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Commercial District") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Commercial District")]?.tapped).toBe(true);
      s = settle(s, (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });

    it("leurs types de terrain de base donnent leurs deux couleurs", () => {
      const names = [
        "Commercial District",
        "Elegant Parlor",
        "Hedge Maze",
        "Lush Portico",
        "Raucous Theater",
        "Shadowy Backstreet",
        "Undercity Sewers",
      ];
      const s = scenario({ p1: { battlefield: names } });
      const got = names.map((n) => manaColors(s, "p1", idOf(s, "p1", "battlefield", n)).join(""));
      expect(got).toEqual(["GR", "RW", "GU", "GW", "BR", "BW", "BU"]);
    });
  });

  describe("Public Thoroughfare", () => {
    const play = (battlefield: string[], answer: Answer = () => undefined) => {
      let s = scenario({ p1: { battlefield, hand: ["Public Thoroughfare"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Public Thoroughfare") });
      return settle(s, answer);
    };

    it("arrive engagé ; en engageant un terrain dégagé, on le garde", () => {
      const s = play(["Forest"]);
      const pt = idOf(s, "p1", "battlefield", "Public Thoroughfare");
      expect(s.objects[pt]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
    });

    it("sacrifié si l'on n'engage rien, ou faute d'artefact ou de terrain dégagé (une créature ne suffit pas)", () => {
      const refused = play(["Forest"], (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(refused, "p1", "battlefield", "Public Thoroughfare")).toHaveLength(0);
      expect(idsOf(refused, "p1", "graveyard", "Public Thoroughfare")).toHaveLength(1);
      const none = play(["Bear Cub"]);
      expect(idsOf(none, "p1", "graveyard", "Public Thoroughfare")).toHaveLength(1);
      expect(none.objects[idOf(none, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });

    it("un artefact dégagé convient aussi ; le terrain produit un mana de n'importe quelle couleur", () => {
      const s = play(["Magnifying Glass"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Magnifying Glass")]?.tapped).toBe(true);
      const t = scenario({ p1: { battlefield: ["Public Thoroughfare"] } });
      expect(manaColors(t, "p1", idOf(t, "p1", "battlefield", "Public Thoroughfare"))).toEqual(["B", "G", "R", "U", "W"]);
    });
  });

  describe("Scene of the Crime", () => {
    it("terrain-artefact Indice qui arrive engagé", () => {
      let s = scenario({ p1: { hand: ["Scene of the Crime"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Scene of the Crime") });
      const id = idOf(s, "p1", "battlefield", "Scene of the Crime");
      expect(s.objects[id]?.tapped).toBe(true);
      expect(chars(s, id).types).toEqual(expect.arrayContaining(["Artifact", "Land"]));
      expect(chars(s, id).subtypes).toEqual(["Clue"]);
    });

    it("{C} seul ; n'importe quelle couleur en engageant une créature dégagée", () => {
      const alone = scenario({ p1: { battlefield: ["Scene of the Crime"] } });
      expect(manaColors(alone, "p1", idOf(alone, "p1", "battlefield", "Scene of the Crime"))).toEqual(["C"]);
      let s = scenario({ p1: { battlefield: ["Scene of the Crime", "Bear Cub"] } });
      const scene = idOf(s, "p1", "battlefield", "Scene of the Crime");
      expect(manaColors(s, "p1", scene)).toEqual(["B", "C", "G", "R", "U", "W"]);
      const option = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === scene && a.colors.includes("R"));
      s = act(s, "p1", {
        type: "tapForMana",
        source: scene,
        ability: option?.type === "tapForMana" ? option.ability : -1,
        color: "R",
      });
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("{2}, sacrifiez-le : piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Scene of the Crime", ...lands("Forest", 2)], library: ["Opt"] } });
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Scene of the Crime"), "Piochez");
      s = settle(s);
      expect(idsOf(s, "p1", "graveyard", "Scene of the Crime")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });
  });

  describe("Magnifying Glass", () => {
    it("{T} : {C} ; {4}, {T} : enquêtez", () => {
      let s = scenario({ p1: { battlefield: ["Magnifying Glass", ...lands("Forest", 4)] } });
      const glass = idOf(s, "p1", "battlefield", "Magnifying Glass");
      expect(manaColors(s, "p1", glass)).toEqual(["C"]);
      s = settle(activate(s, "p1", glass, "Enquêtez"));
      expect(s.objects[glass]?.tapped).toBe(true);
      const clues = s.battlefield.filter((id) => chars(s, id).subtypes.includes("Clue"));
      expect(clues).toHaveLength(1);
      expect(chars(s, clues[0] as string).types).toEqual(["Artifact"]);
    });
  });

  describe("Sanitation Automaton", () => {
    it("en arrivant, surveillance 1", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Sanitation Automaton"], library: ["Opt"] } });
      s = cast(s, "p1", "Sanitation Automaton");
      s = settle(s, (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined));
      expect(idsOf(s, "p1", "battlefield", "Sanitation Automaton")).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });
  });

  describe("Thinking Cap", () => {
    it("Équiper Détective {1} ne vise qu'un Détective ; la créature équipée gagne +1/+2", () => {
      let s = scenario({ p1: { battlefield: ["Thinking Cap", DETECTIVE_CARD, "Bear Cub", "Plains"] } });
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      const detective = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const option = activation(s, "p1", cap, "Détective");
      expect(option?.targets[0]?.id).toBeDefined();
      expect(() => activate(s, "p1", cap, "Détective", { targets: { t: [cub] } })).toThrow(RulesError);
      s = settle(activate(s, "p1", cap, "Détective", { targets: { t: [detective] } }));
      expect(s.objects[cap]?.attachedTo).toBe(detective);
      expect([chars(s, detective).power, chars(s, detective).toughness]).toEqual([3, 4]);
    });

    it("Équiper {3} sur n'importe quelle créature que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Thinking Cap", "Bear Cub", ...lands("Plains", 3)] } });
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", cap, "Équiper {3}", { targets: { t: [cub] } }));
      expect(s.objects[cap]?.attachedTo).toBe(cub);
      expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 4]);
    });
  });

  describe("Magnetic Snuffler", () => {
    it("en arrivant, renvoie un Équipement de votre cimetière attaché à elle", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Magnetic Snuffler"], graveyard: ["Thinking Cap"] },
      });
      s = settle(cast(s, "p1", "Magnetic Snuffler"));
      const snuffler = idOf(s, "p1", "battlefield", "Magnetic Snuffler");
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      expect(s.objects[cap]?.attachedTo).toBe(snuffler);
      expect([chars(s, snuffler).power, chars(s, snuffler).toughness]).toEqual([5, 6]);
    });

    it("chaque fois que vous sacrifiez un artefact, un marqueur +1/+1 ; pas quand un adversaire le fait", () => {
      let s = scenario({
        p1: { battlefield: ["Magnetic Snuffler", "Scene of the Crime", ...lands("Forest", 2)] },
        p2: { battlefield: ["Magnetic Snuffler"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Scene of the Crime"), "Piochez"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Magnetic Snuffler")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Magnetic Snuffler")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Gravestone Strider", () => {
    it("{1} : un mana de n'importe quelle couleur, une seule fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Gravestone Strider", ...lands("Forest", 2)] } });
      const strider = idOf(s, "p1", "battlefield", "Gravestone Strider");
      s = activate(s, "p1", strider, "une fois par tour");
      s = settle(s, (req) => (req.intent === "manaColor" ? ["U"] : undefined));
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(activation(s, "p1", strider, "une fois par tour")).toBeUndefined();
    });

    it("{2}, exilez-la de votre cimetière : exilez une carte ciblée d'un cimetière", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), graveyard: ["Gravestone Strider"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const strider = idOf(s, "p1", "graveyard", "Gravestone Strider");
      const cub = idOf(s, "p2", "graveyard", "Bear Cub");
      s = settle(activate(s, "p1", strider, "Exilez", { targets: { t: [cub] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Gravestone Strider"]);
    });
  });

  describe("Lumbering Laundry", () => {
    it("{2} : jusqu'à la fin du tour, vous voyez les créatures face cachée adverses", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Lumbering Laundry", ...lands("Forest", 2)] },
        p2: { battlefield: lands("Forest", 3), hand: ["Lumbering Laundry"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lumbering Laundry"), faceDown: true });
      s = settle(s);
      const hidden = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
      expect(hidden).toBeDefined();
      const seen = (x: S) => projectView(x, "p1").battlefield.find((o) => o.id === hidden)?.faceDownCard;
      expect(seen(s)).toBeUndefined();
      // p2 garde la priorité après la résolution : il passe, p1 active.
      if (s.pending?.kind === "priority" && s.pending.player === "p2") s = act(s, "p2", { type: "pass" });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Lumbering Laundry"), "face cachée"));
      expect(seen(s)?.name).toBe("Lumbering Laundry");
      s = advanceUntil(s, (x) => x.turn.active === "p1");
      expect(seen(s)).toBeUndefined();
    });
  });

  describe("Case of the Shattered Pact", () => {
    it("en arrivant, cherche une carte de terrain de base et la met en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Case of the Shattered Pact"], library: ["Opt", "Plains"] },
      });
      s = settle(cast(s, "p1", "Case of the Shattered Pact"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("résolue à votre étape de fin s'il y a cinq couleurs parmi vos permanents", () => {
      const run = (battlefield: (string | typeof PRISM)[]) => {
        let s = scenario({ p1: { battlefield: ["Case of the Shattered Pact", ...battlefield] } });
        const id = idOf(s, "p1", "battlefield", "Case of the Shattered Pact");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return s.objects[id]?.solved ?? false;
      };
      expect(run([PRISM])).toBe(true);
      expect(run(["Bear Cub"])).toBe(false);
    });

    it("résolue : au début du combat, une créature ciblée gagne le vol, la double initiative et la vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Shattered Pact", "Bear Cub"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Shattered Pact");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const solved = s.objects[caseId];
      if (solved) solved.solved = true;
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.turn.active !== "p1");
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "vigilance"]));
    });
  });
});

describe("Murders at Karlov Manor, lot B1 : réunir des preuves (701.59)", () => {
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateFirst = (s: S, source: string, label: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
    return a?.type === "activate" ? act(s, "p1", { type: "activate", source, ability: a.ability, targets }) : undefined;
  };

  it("Surveillance Monitor : en arrivant, vous pouvez réunir des preuves 4 ; chaque fois que vous le faites, un Thopter", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Surveillance Monitor"], graveyard: ["Shivan Dragon", "Opt"] },
    });
    s = settle(cast(s, "p1", "Surveillance Monitor"), yes);
    // Shivan Dragon (VM 6) suffit : Opt reste au cimetière.
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
  });

  it("Forensic Researcher : {T}, réunissez des preuves 3 en coût ; impossible sans preuves suffisantes", () => {
    let s = scenario({
      p1: { battlefield: ["Forensic Researcher"], graveyard: ["Opt", "Bear Cub"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const researcher = idOf(s, "p1", "battlefield", "Forensic Researcher");
    // Opt (1) + Bear Cub (2) = 3.
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activateFirst(s, researcher, "engagez", { t: [bear] }) as S);
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    const t = scenario({ p1: { battlefield: ["Forensic Researcher"], graveyard: ["Opt"] }, p2: { battlefield: ["Bear Cub"] } });
    const r2 = idOf(t, "p1", "battlefield", "Forensic Researcher");
    expect(activateFirst(t, r2, "engagez", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] })).toBeUndefined();
  });

  it("Incinerator of the Guilty : blessures de combat à un joueur, réunissez des preuves X : X blessures à ses créatures", () => {
    let s = scenario({
      p1: { battlefield: ["Incinerator of the Guilty"], graveyard: ["Bear Cub", "Opt"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    const dragon = idOf(s, "p1", "battlefield", "Incinerator of the Guilty");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: dragon, defender: "p2" }] });
    // Jusqu'à la fin du combat : X = 2.
    for (let i = 0; i < 60 && s.turn.step !== "endCombat" && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "number" ? [2] : p.request.suggested });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else break;
    }
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    // X = 2 : Bear Cub (VM 2) exilé, Opt reste.
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Lamplight Phoenix : en mourant, exilez-le et réunissez des preuves 4 (sans lui) : il revient engagé", () => {
    let s = scenario({
      p1: {
        battlefield: ["Lamplight Phoenix", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        graveyard: ["Shivan Dragon"],
      },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Lamplight Phoenix")] }), yes);
    const phoenix = idOf(s, "p1", "battlefield", "Lamplight Phoenix");
    expect(s.objects[phoenix]?.tapped).toBe(true);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    // Sans preuves suffisantes (le Phénix ne compte pas) : il reste au cimetière.
    let t = scenario({ p1: { battlefield: ["Lamplight Phoenix", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    t = settle(cast(t, "p1", "Lightning Strike", { t: [idOf(t, "p1", "battlefield", "Lamplight Phoenix")] }), yes);
    expect(idsOf(t, "p1", "graveyard", "Lamplight Phoenix")).toHaveLength(1);
  });

  it("Axebane Ferox : garde — réunissez des preuves 4 (payée par l'adversaire qui la cible)", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Axebane Ferox"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], graveyard },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", "Lightning Strike"),
        targets: { t: [idOf(s, "p1", "battlefield", "Axebane Ferox")] },
      });
      return settle(s, yes);
    };
    // Sans preuves : le sort est contrecarré.
    expect(idsOf(run([]), "p1", "battlefield", "Axebane Ferox")).toHaveLength(1);
    // Avec Shivan Dragon : l'adversaire paie, 3 blessures (4/4 : elle survit).
    const s = run(["Shivan Dragon"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Axebane Ferox")]?.damage).toBe(3);
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
  });

  it("Vein Ripper : garde — sacrifiez une créature ; chaque créature qui meurt draine 2", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Vein Ripper"] },
      p2: { battlefield: [...lands("Mountain", 2), "Llanowar Elves"], hand: ["Lightning Strike"] },
    });
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Vein Ripper")] },
    });
    s = settle(s, yes);
    // Les Elfes sont sacrifiés pour payer la garde, et leur mort draine 2 au profit de Vein Ripper.
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Cryptex : {T}, réunissez des preuves 3 : un mana et un marqueur de déverrouillage ; à cinq, sacrifiez-le pour surveiller et piocher", () => {
    let s = scenario({ p1: { battlefield: ["Cryptex"], graveyard: ["Shivan Dragon"], library: lands("Island", 8) } });
    const cryptex = idOf(s, "p1", "battlefield", "Cryptex");
    const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === cryptex);
    expect(mana).toBeDefined();
    s = act(s, "p1", {
      type: "tapForMana",
      source: cryptex,
      ability: mana?.type === "tapForMana" ? mana.ability : 0,
      color: "R",
    });
    expect(s.objects[cryptex]?.counters.unlock).toBe(1);
    expect(s.players.p1?.manaPool.R).toBe(1);
    expect(s.exile).toHaveLength(1);
    const c = s.objects[cryptex];
    if (c) c.counters.unlock = 5;
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activateFirst(s, cryptex, "Sacrifiez") as S);
    expect(s.players.p1?.hand).toHaveLength(hand + 3);
  });

  it("Tenth District Hero : Détective 4/4 avec la vigilance, puis Mileva, the Stalwart (5/5, vos autres créatures indestructibles)", () => {
    let s = scenario({
      p1: { battlefield: ["Tenth District Hero", "Bear Cub", ...lands("Plains", 5)], graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Tenth District Hero");
    s = settle(activateFirst(s, hero, "preuves 2") as S);
    expect(chars(s, hero).subtypes).toEqual(expect.arrayContaining(["Human", "Detective"]));
    expect([chars(s, hero).power, chars(s, hero).toughness]).toEqual([4, 4]);
    s = settle(activateFirst(s, hero, "preuves 4") as S);
    expect(chars(s, hero).name).toBe("Mileva, the Stalwart");
    expect(chars(s, hero).supertypes).toContain("Legendary");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
  });
});

describe("Murders at Karlov Manor, lot B2 : déguisement", () => {
  const faceDown = (s: S, player: string, name: string) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), faceDown: true });
  const faceUpAction = (s: S, player: string, id: string) =>
    legalActions(s, player).find((a) => a.type === "activate" && a.source === id && a.label === "Retourner face visible");
  const downId = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && s.objects[id]?.faceDown) as string;

  it("Aurelia's Vindicator : déguisement {X}{3}{W} ; retournée, exile jusqu'à X autres créatures (retour en main quand elle part)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 8), hand: ["Aurelia's Vindicator"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Llanowar Elves"] },
    });
    s = settle(faceDown(s, "p1", "Aurelia's Vindicator"));
    const angel = downId(s, "p1");
    const a = faceUpAction(s, "p1", angel);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "graveyard", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: angel, ability: a?.type === "activate" ? a.ability : -1, x: 1 });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    // X = 1 : une seule cible ; les Elfes restent au cimetière.
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toEqual([elves]);
    destroy(s, idOf(s, "p1", "battlefield", "Aurelia's Vindicator"));
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Fugitive Codebreaker : coût de déguisement réduit de {1} par éphémère ou rituel au cimetière ; retournée, défaussez votre main et piochez trois cartes", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 7),
        hand: ["Fugitive Codebreaker", "Opt", "Opt"],
        graveyard: ["Lightning Strike", "Opt"],
        library: lands("Island", 5),
      },
    });
    s = settle(faceDown(s, "p1", "Fugitive Codebreaker"));
    const goblin = downId(s, "p1");
    const a = faceUpAction(s, "p1", goblin);
    s = settle(act(s, "p1", { type: "activate", source: goblin, ability: a?.type === "activate" ? a.ability : -1 }));
    // {3} pour le lancer face cachée, puis {5}{R} − 2 = {3}{R} : sept Montagnes engagées.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(7);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(3);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island", "Island"]);
  });

  it("Goblin Maskmaker : en attaquant, vos sorts face cachée coûtent {1} de moins ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Goblin Maskmaker", ...lands("Mountain", 2)], hand: ["Fugitive Codebreaker"] } });
    const card = idOf(s, "p1", "hand", "Fugitive Codebreaker");
    const faceDownOption = (x: S) => legalActions(x, "p1").some((a) => a.type === "cast" && a.card === card && a.faceDown);
    expect(faceDownOption(s)).toBe(false);
    const maskmaker = idOf(s, "p1", "battlefield", "Goblin Maskmaker");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: maskmaker, defender: "p2" }] });
    s = settle(s);
    expect(faceDownOption(s)).toBe(false); // rituel : pas pendant le combat
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    expect(faceDownOption(s)).toBe(true);
  });

  it("Karlov Watchdog : pendant votre tour, les permanents adverses ne peuvent pas être retournés face visible", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Karlov Watchdog"] },
      p2: { battlefield: lands("Mountain", 9), hand: ["Fugitive Codebreaker"] },
    });
    s = settle(faceDown(s, "p2", "Fugitive Codebreaker"));
    const goblin = downId(s, "p2");
    // Pendant le tour de l'adversaire (p2), il peut la retourner.
    expect(faceUpAction(s, "p2", goblin)).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.player === "p1");
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(faceUpAction(s, "p2", goblin)).toBeUndefined();
  });

  it("Branch of Vitu-Ghazi : un terrain lancé face cachée ; retourné, deux mana d'une couleur gardés jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Branch of Vitu-Ghazi"] } });
    s = settle(faceDown(s, "p1", "Branch of Vitu-Ghazi"));
    const branch = downId(s, "p1");
    expect(chars(s, branch).power).toBe(2);
    const a = faceUpAction(s, "p1", branch);
    s = act(s, "p1", { type: "activate", source: branch, ability: a?.type === "activate" ? a.ability : -1 });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
    expect(chars(s, branch).types).toContain("Land");
    expect(s.players.p1?.manaPool.G).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat");
    expect(s.players.p1?.manaPool.G).toBe(2);
  });

  it("Tunnel Tipster : à votre étape de fin, si une créature face cachée est arrivée sous votre contrôle ce tour-ci, un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Tunnel Tipster", ...lands("Mountain", 3)], hand: ["Fugitive Codebreaker"] } });
    const mole = idOf(s, "p1", "battlefield", "Tunnel Tipster");
    s = settle(faceDown(s, "p1", "Fugitive Codebreaker"));
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[mole]?.counters["+1/+1"]).toBe(1);
    // Tour suivant de p1 sans créature face cachée : pas de marqueur de plus.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[mole]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Murders at Karlov Manor, lot B3 : cape (701.58)", () => {
  /** Met face cachée (cape) une carte de la main du joueur. */
  const cloakFromHand = (s: S, player: string, name: string) =>
    putFaceDown(s, player, idOf(s, player, "hand", name), true) as string;
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Cryptic Coat : la carte du dessus enveloppée d'une cape, équipée (+1/+0, ne peut pas être bloquée) ; {1}{U} : en main", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Cryptic Coat"], library: ["Bear Cub", "Island"] } });
    s = settle(cast(s, "p1", "Cryptic Coat"));
    const cloaked = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(cloaked).toBeDefined();
    expect(chars(s, cloaked).power).toBe(3);
    expect(chars(s, cloaked).keywords).toEqual(expect.arrayContaining(["unblockable", "ward"]));
    const coat = idOf(s, "p1", "battlefield", "Cryptic Coat");
    expect(s.objects[coat]?.attachedTo).toBe(cloaked);
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === coat);
    s = settle(act(s, "p1", { type: "activate", source: coat, ability: a?.type === "activate" ? a.ability : -1 }));
    expect(idsOf(s, "p1", "hand", "Cryptic Coat")).toHaveLength(1);
  });

  it("Expose the Culprit : retourne une créature face cachée ; exile vos créatures à déguisement et les enveloppe d'une cape", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Fugitive Codebreaker"], hand: ["Expose the Culprit", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Expose the Culprit");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Exilez vos créatures")) : undefined;
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index }));
    expect(idsOf(s, "p1", "battlefield", "Fugitive Codebreaker")).toHaveLength(0);
    const down = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(s.defs[s.objects[down]?.faceDown?.card ?? ""]?.name).toBe("Fugitive Codebreaker");
    // Mode 1 : retourner une créature face cachée (une Ours enveloppée d'une cape).
    let t = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Expose the Culprit", "Bear Cub"] } });
    const bear = cloakFromHand(t, "p1", "Bear Cub");
    const card2 = idOf(t, "p1", "hand", "Expose the Culprit");
    const opt2 = legalActions(t, "p1").find((x) => x.type === "cast" && x.card === card2);
    const mode2 =
      opt2?.type === "cast" ? opt2.modes.find((m) => m.label === "Retournez face visible une créature face cachée") : undefined;
    t = settle(act(t, "p1", { type: "cast", card: card2, mode: mode2?.index, targets: { a: [bear] } }));
    expect(t.objects[bear]?.faceDown).toBeUndefined();
    expect(chars(t, bear).name).toBe("Bear Cub");
  });

  it("Yarus : une créature face cachée qui meurt revient face cachée sous le contrôle de son propriétaire, puis est retournée face visible", () => {
    let s = scenario({
      p1: { battlefield: ["Yarus, Roar of the Old Gods", ...lands("Mountain", 2)], hand: ["Bear Cub", "Lightning Strike"] },
    });
    const down = cloakFromHand(s, "p1", "Bear Cub");
    s = settle(cast(s, "p1", "Lightning Strike", { t: [down] }));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.faceDown).toBeUndefined();
    expect(chars(s, bear).name).toBe("Bear Cub");
  });

  it("Etrata : vos créatures face cachée ont « {2}{U}{B} : retournez-la ; si vous ne pouvez pas, exilez-la et lancez-la gratuitement »", () => {
    let s = scenario({
      p1: {
        battlefield: ["Etrata, Deadly Fugitive", ...lands("Island", 2), ...lands("Swamp", 2)],
        hand: ["Opt"],
        library: lands("Island", 3),
      },
    });
    const down = cloakFromHand(s, "p1", "Opt");
    const a = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === down && (x.label ?? "").startsWith("Retournez-la"),
    );
    expect(a).toBeDefined();
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: down, ability: a?.type === "activate" ? a.ability : -1 });
    for (let i = 0; i < 40 && (s.stack.length || s.triggers.length || s.pending?.kind === "choice"); i++) {
      const p = s.pending;
      if (p?.kind === "priority" && p.castNow) s = act(s, p.player, { type: "cast", card: p.castNow.cards[0] as string });
      else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
    }
    // Opt (éphémère) ne peut pas être retourné : exilé, lancé gratuitement (regard 1, piochez une carte).
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Vannifar : au début de votre combat, enveloppez d'une cape une carte de votre main", () => {
    let s = scenario({ p1: { battlefield: ["Vannifar, Evolved Enigma"], hand: ["Shivan Dragon"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const p = s.pending;
    if (p?.kind === "choice")
      s = act(s, "p1", { type: "choose", values: [p.request.type === "pick" ? (p.request.options[0] as string) : 0] });
    s = settle(s);
    const down = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(s.defs[s.objects[down]?.faceDown?.card ?? ""]?.name).toBe("Shivan Dragon");
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Lazav : en attaquant, exile une carte d'un cimetière et enquête ; un Indice sacrifié : il peut devenir une copie d'une créature exilée avec lui", () => {
    let s = scenario({
      p1: { battlefield: ["Lazav, Wearer of Faces", ...lands("Island", 2)] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const lazav = idOf(s, "p1", "battlefield", "Lazav, Wearer of Faces");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: lazav, defender: "p2" }] });
    s = settle(s);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === clue);
    s = settle(act(s, "p1", { type: "activate", source: clue, ability: a?.type === "activate" ? a.ability : -1 }), yes);
    expect(chars(s, lazav).name).toBe("Shivan Dragon");
  });
});

describe("Murders at Karlov Manor, lot B4 : suspect et Affaires", () => {
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  it("Airtight Alibi : dégage la créature, défense talismanique, plus suspecte ; +2/+2 et ne peut plus devenir suspecte", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3), ...lands("Mountain", 3)],
        hand: ["Airtight Alibi", "Convenient Target"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const b = s.objects[bear];
    if (b) b.suspected = true;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Airtight Alibi"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.tapped).toBe(false);
    expect(s.objects[bear]?.suspected).toBeUndefined();
    expect(chars(s, bear).keywords).toContain("hexproof");
    expect(chars(s, bear).power).toBe(4);
    // Convenient Target : « suspectez la créature enchantée » ne fait rien.
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Convenient Target"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.suspected).toBeUndefined();
  });

  it("Case File Auditor : en arrivant, un enchantement parmi six cartes ; mana de n'importe quelle couleur pour les sorts d'Affaire", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 5),
        hand: ["Case File Auditor"],
        library: ["Opt", "Case of the Gateway Express", "Bear Cub", "Opt", "Opt", "Opt", "Island"],
      },
    });
    // {2}{W} payé avec des Îles : impossible, ce n'est pas une Affaire.
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Case File Auditor"))).toHaveLength(0);
    s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), "Plains"],
        hand: ["Case File Auditor"],
        library: ["Opt", "Case of the Gateway Express", "Bear Cub", "Opt", "Opt", "Opt", "Island"],
      },
    });
    s = settle(cast(s, "p1", "Case File Auditor"));
    const casePick = idOf(s, "p1", "hand", "Case of the Gateway Express");
    expect(casePick).toBeDefined();
    // {1}{W} avec deux Îles : l'Affaire se lance.
    expect(castOptions(s, "p1", casePick)).not.toHaveLength(0);
  });

  it("Case of the Gateway Express : chacune de vos créatures inflige 1 blessure ; résolue après trois attaquants, vos créatures +1/+0", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves", ...lands("Plains", 2)],
        hand: ["Case of the Gateway Express"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Case of the Gateway Express", { t: [angel] }));
    expect(s.objects[angel]?.damage).toBe(3);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    s = act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    const theCase = idOf(s, "p1", "battlefield", "Case of the Gateway Express");
    expect(s.objects[theCase]?.solved).toBe(true);
    expect(chars(s, attackers[0] as string).power).toBe(3);
  });

  it("Case of the Burning Masks : 3 blessures en arrivant ; résolue si trois de vos sources ont infligé des blessures ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 7)], hand: ["Case of the Burning Masks", "Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Case of the Burning Masks", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] } }));
    s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: ["p2"] } }));
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Case of the Burning Masks")]?.solved).toBe(true);
  });
});

describe("Murders at Karlov Manor, lot C1 : exigences de blocage (509.1c)", () => {
  const toBlockers = (s: S, attackers: string[]) => {
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(c, (x) => x.pending?.kind === "declareBlockers");
  };

  it("Culvert Ambusher : la créature ciblée bloque ce tour-ci si possible", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 5)], hand: ["Culvert Ambusher"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Culvert Ambusher", undefined), (req) =>
      req.type === "pick" && req.options.includes(elves) ? [elves] : undefined,
    );
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const b = toBlockers(s, [bear]);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [] })).toThrow(RulesError);
    expect(requiredBlocks(b, "p2")).toEqual([{ blocker: elves, attacker: bear }]);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: bear }] })).not.toThrow();
  });

  it("Hustle : la créature ciblée attaque ou bloque ce tour-ci si possible", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Island"], hand: ["Hustle // Bustle"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const card = idOf(s, "p1", "hand", "Hustle // Bustle");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Hustle");
    s = settle(act(s, "p1", { type: "cast", card, face: opt?.type === "cast" ? opt.face : undefined, targets: { t: [bear] } }));
    expect(chars(s, bear).keywords).toContain("mustAttack");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(RulesError);
  });

  it("Tolsimir : Voja Fenstalker en arrivant ; un Loup qui attaque avec Tolsimir doit être bloqué par la créature ciblée si possible", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3).concat(lands("Forest", 2)), hand: ["Tolsimir, Midnight's Light"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Tolsimir, Midnight's Light"));
    const voja = idOf(s, "p1", "battlefield", "Voja Fenstalker");
    expect(chars(s, voja).supertypes).toContain("Legendary");
    const tolsimir = idOf(s, "p1", "battlefield", "Tolsimir, Midnight's Light");
    // Mal d'invocation : le tour suivant de p1.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const b = toBlockers(s, [tolsimir, voja]);
    // Bloquer Tolsimir plutôt que le Loup n'obéit pas à l'exigence.
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: tolsimir }] })).toThrow(RulesError);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: voja }] })).not.toThrow();
  });
});

describe("Murders at Karlov Manor, lot C2 : montants et coûts", () => {
  const clues = (s: S, p: string) => idsOf(s, p, "battlefield", "Clue").length;

  it("No Witnesses : chaque joueur qui contrôle le plus de créatures enquête, puis toutes les créatures sont détruites", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["No Witnesses"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "No Witnesses"));
    expect(clues(s, "p2")).toBe(1);
    expect(clues(s, "p1")).toBe(0);
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
  });

  it("Wojek Investigator : à votre entretien, un Indice par adversaire qui a plus de cartes en main que vous", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: { battlefield: ["Wojek Investigator"], hand: [] },
      p2: { hand: ["Opt", "Opt", "Opt"] },
    });
    s = advanceUntil(s, (x) => x.turn.number === 3 && x.turn.step === "draw");
    expect(clues(s, "p1")).toBe(1);
  });

  it("Ill-Timed Explosion : piochez deux cartes, défaussez-en deux : X blessures à chaque créature (X : plus grande VM défaussée)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Mountain", 2), "Serra Angel"],
        hand: ["Ill-Timed Explosion"],
        library: ["Shivan Dragon", "Opt"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Ill-Timed Explosion"), (req) =>
      req.type === "pick" && req.intent === "discard" ? req.options.slice(0, 2) : undefined,
    );
    // Shivan Dragon (VM 6) défaussé : 6 blessures, l'Ange (4/4) et l'Ours meurent.
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Officious Interrogation : {W}{U} de plus par cible au-delà de la première ; un Indice par créature des joueurs ciblés", () => {
    const base = {
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Island", 2)], hand: ["Officious Interrogation"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    };
    let s = scenario(base);
    s = settle(cast(s, "p1", "Officious Interrogation", { p: ["p1", "p2"] }));
    expect(clues(s, "p1")).toBe(3);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    // Deux cibles avec seulement {W}{U} : impossible.
    const t = scenario({ ...base, p1: { ...base.p1, battlefield: ["Bear Cub", "Plains", "Island"] } });
    expect(() => cast(t, "p1", "Officious Interrogation", { p: ["p1", "p2"] })).toThrow(RulesError);
  });

  it("Demand Answers : en coût additionnel, sacrifiez un artefact ou défaussez une carte ; piochez deux cartes", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Demand Answers"], library: lands("Mountain", 3) },
    });
    // Sans carte en main ni artefact : impossible (l'Ours n'est pas un artefact).
    expect(() => cast(s, "p1", "Demand Answers")).toThrow(RulesError);
    s = scenario({
      p1: { battlefield: [...lands("Mountain", 2)], hand: ["Demand Answers", "Opt"], library: lands("Mountain", 3) },
    });
    s = settle(cast(s, "p1", "Demand Answers", undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Treacherous Greed : sacrifiez une créature qui a infligé des blessures ce tour-ci ; piochez trois cartes, drain 3", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2), "Swamp"],
        hand: ["Treacherous Greed"],
        library: lands("Plains", 4),
      },
    });
    const card = idOf(s, "p1", "hand", "Treacherous Greed");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card)).toBe(false);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    s = settle(act(s, "p1", { type: "cast", card, sacrifice: [bear] }));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Urgent Necropsy : réunissez des preuves X (VM totale des cibles) ; détruit jusqu'à un artefact, une créature, un enchantement, un planeswalker", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Urgent Necropsy"], graveyard: ["Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Urgent Necropsy", { a: [], c: [angel], e: [], w: [] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    // VM 5 sans preuves suffisantes : impossible.
    const t = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Urgent Necropsy"], graveyard: ["Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() =>
      cast(t, "p1", "Urgent Necropsy", { a: [], c: [idOf(t, "p2", "battlefield", "Serra Angel")], e: [], w: [] }),
    ).toThrow(RulesError);
  });

  it("Niv-Mizzet, Guildpact : X = paires de couleurs différentes parmi vos permanents exactement bicolores", () => {
    const t = scenario({ p1: { battlefield: ["Tin Street Gossip", "Agrus Kos, Spirit of Justice", "Bear Cub"] } });
    const ctx = {
      controller: "p1",
      sourceId: "",
      sourceDefId: "",
      sourceSnapshot: { keywords: [], power: 0 },
      targets: {},
      x: 0,
      kicked: false,
    };
    // R/G (Tin Street Gossip) et R/W (Agrus Kos) : deux paires.
    expect(evalAmount(t, ctx as never, dsl.amount.colorPairsAmong({ permanent: true, controller: "you" }))).toBe(2);
  });

  it("Aurelia, the Law Above : un joueur (même un adversaire) attaque avec trois créatures ou plus : vous piochez", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: { battlefield: ["Aurelia, the Law Above"], library: lands("Plains", 3) },
      p2: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p2");
    s = act(s, "p2", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p1" })) });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Tin Street Gossip : {R}{G} seulement pour lancer des sorts face cachée", () => {
    let s = scenario({ p1: { battlefield: ["Tin Street Gossip", "Mountain"], hand: ["Fugitive Codebreaker", "Bear Cub"] } });
    const gossip = idOf(s, "p1", "battlefield", "Tin Street Gossip");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === gossip);
    s = settle(act(s, "p1", { type: "activate", source: gossip, ability: a?.type === "activate" ? a.ability : -1 }));
    // Bear Cub ({1}{G}) : non (mana restreint) ; Fugitive Codebreaker face cachée ({3}) : oui.
    expect(legalActions(s, "p1").some((x) => x.type === "cast" && x.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    expect(
      legalActions(s, "p1").some(
        (x) => x.type === "cast" && x.card === idOf(s, "p1", "hand", "Fugitive Codebreaker") && x.faceDown,
      ),
    ).toBe(true);
  });
});

describe("Murders at Karlov Manor, lot C3 : cartes uniques", () => {
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateLabel = (s: S, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
    return act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Joue la résolution en lançant chaque carte proposée par un « lancer maintenant ». */
  const castAll = (s: S, targets?: Record<string, string[]>) => {
    let cur = s;
    for (let i = 0; i < 60 && (cur.stack.length || cur.triggers.length || cur.pending?.kind === "choice"); i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && p.castNow)
        cur = act(cur, p.player, { type: "cast", card: p.castNow.cards[0] as string, ...(targets ? { targets } : {}) });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else break;
    }
    return cur;
  };

  it("Conspiracy Unraveler : réunir des preuves 10 plutôt que payer le coût de mana de vos sorts", () => {
    let s = scenario({
      p1: { battlefield: ["Conspiracy Unraveler"], hand: ["Bear Cub"], graveyard: ["Shivan Dragon", "Serra Angel"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub"), alternative: true }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Intrude on the Mind : deux piles révélées ; un Thopter 0/0 avec un marqueur par carte mise au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 5),
        hand: ["Intrude on the Mind"],
        library: ["Opt", "Opt", "Bear Cub", "Island", "Shivan Dragon"],
      },
    });
    s = settle(cast(s, "p1", "Intrude on the Mind"), (req) =>
      req.type === "pick" && req.intent === "piles" && req.options.length === 5 ? req.options.slice(0, 2) : undefined,
    );
    const thopter = idOf(s, "p1", "battlefield", "Thopter");
    const toGraveyard = s.players.p1?.graveyard.filter((id) => nameOf(s, id) !== "Intrude on the Mind").length ?? 0;
    expect(toGraveyard).toBeGreaterThan(0);
    expect(s.objects[thopter]?.counters["+1/+1"]).toBe(toGraveyard);
  });

  it("Hedge Whisperer : un terrain devient un Sanglier 5/5 tant qu'elle reste engagée ; elle peut rester engagée", () => {
    let s = scenario({ p1: { battlefield: ["Hedge Whisperer", ...lands("Forest", 5)], graveyard: ["Shivan Dragon"] } });
    const whisperer = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    const land = idOf(s, "p1", "battlefield", "Forest");
    s = settle(activateLabel(s, whisperer, "Sanglier", { targets: { t: [land] } }));
    expect(chars(s, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(s, land).power).toBe(5);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(s.objects[whisperer]?.tapped).toBe(true);
    expect(chars(s, land).power).toBe(5);
  });

  it("A Killer Among Us : trois jetons, un type choisi en secret ; sacrifiée, un jeton attaquant du type choisi grandit", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["A Killer Among Us"] } });
    s = settle(cast(s, "p1", "A Killer Among Us"), (req) =>
      req.type === "pick" && req.options.includes("Goblin") ? ["Goblin"] : undefined,
    );
    const killer = idOf(s, "p1", "battlefield", "A Killer Among Us");
    expect(s.objects[killer]?.chosen?.creatureType).toBe("Goblin");
    // Choix secret : l'adversaire ne le voit pas.
    expect(projectView(s, "p2").battlefield.find((o) => o.id === killer)?.chosen).toBeNull();
    expect(projectView(s, "p1").battlefield.find((o) => o.id === killer)?.chosen?.creatureType).toBe("Goblin");
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.pending?.kind === "declareAttackers");
    const goblin = idOf(s, "p1", "battlefield", "Goblin");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: goblin, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" && x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(activateLabel(s, killer, "Sacrifiez", { targets: { t: [goblin] } }));
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, goblin).keywords).toContain("deathtouch");
  });

  it("Kylox's Voltstrider : réunissez des preuves 6 (liées à lui) ; en attaquant, lancez un éphémère parmi elles, puis au-dessous de la bibliothèque", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kylox's Voltstrider", ...lands("Mountain", 2)],
        graveyard: ["Lightning Strike", "Lightning Strike", "Lightning Strike"],
      },
    });
    const vehicle = idOf(s, "p1", "battlefield", "Kylox's Voltstrider");
    s = settle(activateLabel(s, vehicle, "Réunissez des preuves 6"));
    expect(chars(s, vehicle).types).toContain("Creature");
    expect(s.objects[vehicle]?.linked).toHaveLength(3);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: vehicle, defender: "p2" }] });
    s = castAll(s, { t: ["p2"] });
    expect(s.players.p2?.life).toBe(17);
    expect(nameOf(s, s.players.p1?.library.at(-1) as string)).toBe("Lightning Strike");
  });

  it("Judith : un éphémère lancé gagne le contact mortel et le lien de vie (mode choisi)", () => {
    let s = scenario({
      p1: { battlefield: ["Judith, Carnage Connoisseur", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [req.options[0] as string] : undefined,
    );
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Kaya, Spirits' Justice : une de vos créatures exilée : un jeton que vous contrôlez en devient une copie, avec le vol", () => {
    let s = scenario({ p1: { battlefield: ["Kaya, Spirits' Justice", "Bear Cub"] } });
    createTokens(s, "p1", SPIRIT_WB, 1);
    const kaya = idOf(s, "p1", "battlefield", "Kaya, Spirits' Justice");
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateLabel(s, kaya, "Exilez une de vos créatures", { targets: { a: [bear], b: [] } }), yes);
    expect(chars(s, spirit).name).toBe("Bear Cub");
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Kylox, Visionary Inventor : sacrifiez d'autres créatures, exilez X cartes (leur force totale), lancez-en les éphémères gratuitement", () => {
    let s = scenario({
      p1: { battlefield: ["Kylox, Visionary Inventor", "Bear Cub"], library: ["Lightning Strike", "Island", "Opt"] },
    });
    const kylox = idOf(s, "p1", "battlefield", "Kylox, Visionary Inventor");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: kylox, defender: "p2" }] });
    s = castAll(s, { t: ["p2"] });
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    // Force 2 : Lightning Strike et Island exilées ; Strike lancée gratuitement.
    expect(s.players.p2?.life).toBe(17);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
  });

  it("Flotsam // Jetsam : meulez trois cartes et enquêtez ; chaque adversaire meule trois cartes, lancez-en un sort gratuitement (exilé ensuite)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Island", "Island", "Island"] },
    });
    s = settle(cast(s, "p1", "Flotsam // Jetsam", undefined, { face: 0 }));
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(4);
    let t = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Island", "Island", "Island"] },
    });
    const hand = (t.players.p1?.hand.length ?? 0) - 1;
    t = castAll(cast(t, "p1", "Flotsam // Jetsam", undefined, { face: 1 }));
    // Opt de l'adversaire lancé gratuitement (vous piochez), puis exilé.
    expect(t.exile.some((id) => nameOf(t, id) === "Opt")).toBe(true);
    expect(t.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Buried in the Garden : exile un permanent adverse jusqu'à son départ ; le terrain enchanté produit un mana de plus", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3).concat(lands("Plains", 1)), hand: ["Buried in the Garden"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Buried in the Garden"), targets: { enchant: [forest] } }),
      (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined),
    );
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    // Un sort plus tard : le terrain enchanté (dégagé au tour suivant) produit deux mana.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const forestNow = s.battlefield.find(
      (id) => nameOf(s, id) === "Forest" && s.battlefield.some((a) => s.objects[a]?.attachedTo === id),
    ) as string;
    const m = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === forestNow);
    s = act(s, "p1", { type: "tapForMana", source: forestNow, ability: m?.type === "tapForMana" ? m.ability : 0, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(2);
    destroy(s, idOf(s, "p1", "battlefield", "Buried in the Garden"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Murders at Karlov Manor : promotions légales en Standard (PLAN-C, lot C19)", () => {
  it("Melek, Reforged Researcher : F/E égales à deux fois les éphémères et rituels du cimetière ; le premier du tour coûte {3} de moins", () => {
    let s = scenario({
      p1: {
        battlefield: ["Melek, Reforged Researcher", "Island"],
        graveyard: ["Opt", "Lightning Strike", "Bear Cub"],
        hand: ["Quick Study", "Quick Study"],
        library: ["Opt", "Opt", "Opt", "Opt"],
      },
    });
    const melek = idOf(s, "p1", "battlefield", "Melek, Reforged Researcher");
    expect([chars(s, melek).power, chars(s, melek).toughness]).toEqual([4, 4]);
    // Quick Study ({2}{U}) : {3} de moins (le générique seulement), il coûte {U}.
    const [first, second] = idsOf(s, "p1", "hand", "Quick Study") as [string, string];
    expect(castable(s, "p1", first)).toBe(true);
    s = settle(cast(s, "p1", "Quick Study"));
    expect([chars(s, melek).power, chars(s, melek).toughness]).toEqual([6, 6]);
    // Le deuxième du tour paie son coût entier : impossible sans autre terrain.
    expect(castable(s, "p1", second)).toBe(false);
  });

  it("Tomik, Wielder of Law : affinité pour les planeswalkers ; un adversaire qui vous attaque avec deux créatures perd 3 PV et vous piochez", () => {
    let s = scenario({
      p1: { battlefield: ["Chandra, Flameshaper", "Plains", "Swamp"], hand: ["Tomik, Wielder of Law"], library: ["Opt"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Tomik, Wielder of Law"))).toBe(true);
    s = settle(cast(s, "p1", "Tomik, Wielder of Law"));
    const tomik = idOf(s, "p1", "battlefield", "Tomik, Wielder of Law");
    expect(chars(s, tomik).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));

    const attack = (attackers: string[]) => {
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Tomik, Wielder of Law"], library: ["Opt", "Opt"] },
        p2: { battlefield: attackers },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p2");
      t = act(t, "p2", {
        type: "declareAttackers",
        attackers: idsOf(t, "p2", "battlefield", attackers[0] as string).map((id) => ({ id, defender: "p1" })),
      });
      return settle(t);
    };
    const two = attack(["Bear Cub", "Bear Cub"]);
    expect(two.players.p2?.life).toBe(17);
    expect(two.players.p1?.hand).toHaveLength(1);
    const one = attack(["Bear Cub"]);
    expect(one.players.p2?.life).toBe(20);
    expect(one.players.p1?.hand).toHaveLength(0);
  });

  it("Voja, Jaws of the Conclave : en attaquant, autant de marqueurs +1/+1 que d'Elfes sur chacune de vos créatures, une carte par Loup", () => {
    let s = scenario({
      p1: { battlefield: ["Voja, Jaws of the Conclave", "Llanowar Elves", "Llanowar Elves"], library: ["Opt", "Opt", "Opt"] },
    });
    const voja = idOf(s, "p1", "battlefield", "Voja, Jaws of the Conclave");
    expect(chars(s, voja).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "ward"]));
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voja, defender: "p2" }] });
    s = settle(s);
    expect(s.objects[voja]?.counters["+1/+1"]).toBe(2);
    for (const elf of idsOf(s, "p1", "battlefield", "Llanowar Elves")) expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
    // Voja est le seul Loup : une carte.
    expect(s.players.p1?.hand).toHaveLength(1);
  });
});
