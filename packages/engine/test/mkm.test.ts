/**
 * Murders at Karlov Manor (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son
 * texte Oracle (plan R, lot R7).
 */

import type { RawCard } from "@mtgx/cards";
import { toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { SUSPECTED } from "../../cards/src/mkm/common";
import { destroy } from "../src/actions";
import * as dsl from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars, FACE_DOWN_ID, moveObject } from "../src/state";
import { matchesObjectFilter } from "../src/targets";
import { canBlock } from "../src/turn";
import type { ChoiceRequest, ChoiceValue, Decision, GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, advanceUntil, castNowOf, customCard, idOf, idsOf, scenario, untilCastNow } from "./helpers";

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
  /** Répond aux choix de cibles en désignant ces objets. */
  const picking =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
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
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;

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
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else if (p?.kind === "discard")
        cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(-p.count) });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });

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
