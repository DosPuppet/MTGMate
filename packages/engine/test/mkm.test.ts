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
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, advanceUntil, customCard, idOf, idsOf, scenario } from "./helpers";

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
