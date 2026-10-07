/**
 * Commander (pseudo-ensemble EDH, PLAN-E, E12) : tests de règles du deck de Y'shtola, Night's Blessed (drain et
 * contrôle). Pertes de PV des adversaires, sorts non-créature, taxes, entretien cumulatif, rebond.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { cumulativeUpkeepAbility } from "../src/dsl";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const handSize = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const life = (s: GameState, p: PlayerId) => s.players[p]?.life ?? 0;
const tokens = (s: GameState, player: PlayerId, name?: string) =>
  s.battlefield.filter(
    (id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && (!name || nameOf(s, id) === name),
  );
/** Lance une carte de la main avec ses cibles. */
const castIt = (s: GameState, p: PlayerId, name: string, targets?: Record<string, string[]>) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...(targets ? { targets } : {}) });
/** Avance jusqu'au tour suivant (les déclenchements de l'étape de fin sont résolus). */
const toNextTurn = (s: GameState) => {
  const turn = s.turn.number;
  return advanceUntil(s, (x) => x.turn.number > turn && x.pending?.kind === "priority");
};
/** Passe (en ciblant `pick` quand il est proposé) jusqu'à une priorité « lancer maintenant ». */
const untilCastNowPicking = (s: GameState, pick: string) => {
  let cur = s;
  for (let i = 0; i < 100 && !castNowOf(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, {
        type: "choose",
        values: p.request.type === "pick" && p.request.options.includes(pick) ? [pick] : p.request.suggested,
      });
    else break;
  }
  return cur;
};
/** Réponse : « oui » à toute question « vous pouvez », la réponse suggérée sinon. */
const yes = (req: { intent?: string }) => (req.intent === "may" ? [1] : undefined);
/** Réponse : refuse de payer (« à moins que … ne paie »), « oui » aux « vous pouvez ». */
const refuse = (req: { intent?: string }) => (req.intent === "unlessPay" ? [0] : req.intent === "may" ? [1] : undefined);

describe("Commander (EDH) : deck de Y'shtola", () => {
  describe("Y'shtola, Night's Blessed", () => {
    it("sort non-créature de VM 3 ou plus : 2 blessures à chaque adversaire, 2 PV ; pas un sort de VM 1 ni une créature", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: ["Y'shtola, Night's Blessed", ...lands("Island", 3), "Mountain", ...lands("Plains", 5)],
          hand: ["Pearl of Wisdom", "Shock", "Serra Angel"],
        },
      });
      s = settle(castIt(s, "p1", "Pearl of Wisdom"));
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([22, 18, 18]);
      s = settle(castIt(s, "p1", "Shock", { t: ["p2"] }));
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([22, 16, 18]);
      s = settle(castIt(s, "p1", "Serra Angel"));
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([22, 16, 18]);
      expect(card("Y'shtola, Night's Blessed").keywords).toContain("vigilance");
    });

    it("étape de fin : piochez si un joueur a perdu 4 PV ou plus ce tour-ci (pas 3)", () => {
      let s = scenario({ p1: { battlefield: ["Y'shtola, Night's Blessed", ...lands("Mountain", 2)], hand: ["Lightning Bolt"] } });
      s = settle(castIt(s, "p1", "Lightning Bolt", { t: ["p2"] }));
      s = toNextTurn(s);
      expect(handSize(s, "p1")).toBe(0);

      let t = scenario({
        p1: { battlefield: ["Y'shtola, Night's Blessed", ...lands("Mountain", 2)], hand: ["Lightning Bolt", "Shock"] },
      });
      t = settle(castIt(t, "p1", "Lightning Bolt", { t: ["p2"] }));
      t = settle(castIt(t, "p1", "Shock", { t: ["p2"] }));
      t = toNextTurn(t);
      expect(handSize(t, "p1")).toBe(1);
    });

    it("à l'étape de fin de chaque joueur, et quel que soit le joueur qui a perdu les PV (vous compris)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Y'shtola, Night's Blessed"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Bolt", "Shock"] },
      });
      s = settle(castIt(s, "p2", "Lightning Bolt", { t: ["p1"] }));
      s = settle(castIt(s, "p2", "Shock", { t: ["p1"] }));
      s = toNextTurn(s);
      // p1 a pioché une carte à l'étape de fin de p2 (on est à son entretien, avant sa pioche).
      expect([s.turn.active, s.turn.step]).toEqual(["p1", "upkeep"]);
      expect(handSize(s, "p1")).toBe(1);
    });
  });

  describe("Emet-Selch of the Third Seat", () => {
    it("un adversaire perd des PV : lancez un éphémère ou un rituel de votre cimetière ({2} de moins), exilé ensuite", () => {
      let s = scenario({
        p1: {
          battlefield: ["Emet-Selch of the Third Seat", ...lands("Mountain", 2), ...lands("Island", 2)],
          hand: ["Lightning Bolt", "Shock"],
          graveyard: ["Chart a Course"],
        },
      });
      const chart = idOf(s, "p1", "graveyard", "Chart a Course");
      s = untilCastNowPicking(castIt(s, "p1", "Lightning Bolt", { t: ["p2"] }), chart);
      // Seule la carte ciblée est proposée, et pas gratuite : elle se paie, {2} de moins.
      expect(castNowOf(s)?.cards).toEqual([chart]);
      expect(legalActions(s, "p1").find((a) => a.type === "cast" && a.card === chart)).toMatchObject({ free: undefined });
      // Refus : la limite « une fois par tour » n'est pas consommée, une autre perte de PV le propose de nouveau.
      s = act(s, "p1", { type: "pass" });
      expect(s.pending).toMatchObject({ kind: "priority", player: "p1" });
      expect(s.players.p1?.graveyard).toContain(chart);
      s = untilCastNowPicking(castIt(s, "p1", "Shock", { t: ["p2"] }), chart);
      expect(castNowOf(s)?.cards).toEqual([chart]);
    });

    it("le sort lancé est exilé au lieu d'aller au cimetière ; une seule fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Emet-Selch of the Third Seat", ...lands("Mountain", 2), ...lands("Island", 2)],
          hand: ["Lightning Bolt", "Shock"],
          graveyard: ["Chart a Course"],
        },
      });
      const chart = idOf(s, "p1", "graveyard", "Chart a Course");
      s = untilCastNowPicking(castIt(s, "p1", "Lightning Bolt", { t: ["p2"] }), chart);
      expect(castNowOf(s)?.cards).toEqual([chart]);
      s = act(s, "p1", { type: "cast", card: chart });
      // « Puis défaussez une carte » : une carte piochée, pas le Shock.
      s = settle(s, (req, _p, cur) =>
        req.type === "pick" ? [req.options.find((id) => nameOf(cur, id) !== "Shock") as string] : undefined,
      );
      // Un seul Island engagé : la réduction de {2} s'applique au sort lancé depuis le cimetière.
      expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Chart a Course");
      expect(namesInGraveyard(s, "p1")).not.toContain("Chart a Course");
      // Deuxième perte de PV ce tour-ci : plus rien.
      s = castIt(s, "p1", "Shock", { t: ["p2"] });
      s = settle(s);
      expect(castNowOf(s)).toBeUndefined();
      expect(namesInGraveyard(s, "p1")).toEqual(expect.arrayContaining(["Lightning Bolt", "Shock"]));
    });
  });

  describe("Esper Sentinel", () => {
    it("premier sort non-créature d'un adversaire : piochez à moins qu'il ne paie {X} (X = force) ; pas au deuxième", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Esper Sentinel"] },
        p2: { battlefield: lands("Mountain", 4), hand: ["Shock", "Lightning Bolt"] },
      });
      // p2 paie {1} (réponse suggérée).
      s = settle(castIt(s, "p2", "Shock", { t: ["p1"] }));
      expect(handSize(s, "p1")).toBe(0);
      expect(idsOf(s, "p2", "battlefield", "Mountain").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
      s = settle(castIt(s, "p2", "Lightning Bolt", { t: ["p1"] }), refuse);
      expect(handSize(s, "p1")).toBe(0);
    });

    it("refus de payer : piochez ; X suit la force de la Sentinelle", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [{ name: "Esper Sentinel", counters: { "+1/+1": 2 } }] },
        p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
      });
      // Force 3 : p2 n'a plus que deux terrains, il ne peut pas payer.
      s = settle(castIt(s, "p2", "Shock", { t: ["p1"] }));
      expect(handSize(s, "p1")).toBe(1);
    });
  });

  it("Kambal, Consul of Allocation : un adversaire lance un sort non-créature, il perd 2 PV et vous en gagnez 2", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Kambal, Consul of Allocation"] },
      p2: { battlefield: ["Mountain", "Plains"], hand: ["Shock", "Savannah Lions"] },
    });
    s = settle(castIt(s, "p2", "Shock", { t: ["p1"] }));
    expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 18]);
    s = settle(castIt(s, "p2", "Savannah Lions"));
    expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 18]);
  });

  it("Lotho, Corrupt Shirriff : le deuxième sort d'un joueur ce tour-ci, vous perdez 1 PV et créez un Trésor", () => {
    let s = scenario({
      p1: { battlefield: ["Lotho, Corrupt Shirriff", ...lands("Mountain", 2)], hand: ["Shock", "Lightning Bolt"] },
      p2: { battlefield: lands("Island", 2), hand: ["Opt", "Brainstorm"] },
    });
    s = settle(castIt(s, "p1", "Shock", { t: ["p2"] }));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
    s = settle(castIt(s, "p1", "Lightning Bolt", { t: ["p2"] }));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    expect(life(s, "p1")).toBe(19);
    // Les sorts de p2 pendant le tour de p1 : son deuxième aussi.
    s = act(s, "p1", { type: "pass" });
    s = settle(castIt(s, "p2", "Opt"));
    s = act(s, "p1", { type: "pass" });
    s = settle(castIt(s, "p2", "Brainstorm"));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(2);
    expect(life(s, "p1")).toBe(18);
  });

  it("Lyse Hext : sorts non-créature {1} de moins, prouesse, double initiative après deux sorts non-créature", () => {
    let s = scenario({
      p1: { battlefield: ["Lyse Hext", ...lands("Island", 3)], hand: ["Pearl of Wisdom", "Opt"] },
    });
    const lyse = idOf(s, "p1", "battlefield", "Lyse Hext");
    // {2}{U} − {1} : deux Îles.
    s = settle(castIt(s, "p1", "Pearl of Wisdom"));
    expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
    expect(chars(s, lyse).keywords).not.toContain("doubleStrike");
    expect(chars(s, lyse).power).toBe(3);
    // Opt coûte {U} (la réduction ne touche que le générique) : la dernière Île.
    s = settle(castIt(s, "p1", "Opt"));
    expect(chars(s, lyse).keywords).toContain("doubleStrike");
    expect(chars(s, lyse).power).toBe(4);
  });

  describe("Orcish Bowmasters", () => {
    it("à l'arrivée : 1 blessure à n'importe quelle cible, puis amassez des Orques 1", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Orcish Bowmasters"] } });
      s = settle(castIt(s, "p1", "Orcish Bowmasters"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(life(s, "p2")).toBe(19);
      const army = tokens(s, "p1");
      expect(army).toHaveLength(1);
      expect(chars(s, army[0] as string).subtypes).toEqual(expect.arrayContaining(["Orc", "Army"]));
      expect(s.objects[army[0] as string]?.counters["+1/+1"]).toBe(1);
      expect(card("Orcish Bowmasters").keywords).toContain("flash");
    });

    it("un adversaire pioche, sauf la première carte de son étape de pioche ; pas vos pioches", () => {
      let s = scenario({
        active: "p2",
        step: "upkeep",
        p1: { battlefield: ["Orcish Bowmasters", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      // Pendant l'entretien de p2, p1 pioche (Opt) : rien.
      s = act(s, "p2", { type: "pass" });
      s = settle(castIt(s, "p1", "Opt"));
      expect(s.turn.step).toBe("upkeep");
      expect(tokens(s, "p1")).toHaveLength(0);
      const toP2 = (req: { type: string; options?: string[] }) =>
        req.type === "pick" && req.options?.includes("p2") ? ["p2"] : undefined;
      s = advanceUntil(s, (x) => x.turn.step === "main1");
      expect(life(s, "p2")).toBe(20);
      expect(tokens(s, "p1")).toHaveLength(0);
      s = settle(castIt(s, "p2", "Opt"), toP2);
      expect(life(s, "p2")).toBe(19);
      const army = tokens(s, "p1");
      expect(s.objects[army[0] as string]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Papalymo Totolymo", () => {
    it("sort non-créature : 1 blessure à chaque adversaire, gagnez 1 PV", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Papalymo Totolymo", "Island"], hand: ["Opt"] },
      });
      s = settle(castIt(s, "p1", "Opt"));
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([21, 19, 19]);
    });

    it("{4}, {T}, sacrifice : chaque adversaire qui a perdu des PV ce tour-ci sacrifie sa créature de plus grande force", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Papalymo Totolymo", "Savannah Lions", ...lands("Plains", 4)] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        p3: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Savannah Lions")], "p2");
      s = throughCombat(s);
      expect(life(s, "p2")).toBe(18);
      const papalymo = idOf(s, "p1", "battlefield", "Papalymo Totolymo");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === papalymo);
      expect(opt).toBeDefined();
      s = act(s, "p1", { type: "activate", source: papalymo, ability: opt?.type === "activate" ? opt.ability : 0 });
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Papalymo Totolymo")).toHaveLength(1);
    });
  });

  it("Sheoldred, the Apocalypse : vous piochez, +2 PV ; un adversaire pioche (même à son étape de pioche), −2 PV", () => {
    let s = scenario({
      active: "p2",
      step: "upkeep",
      p1: { battlefield: ["Sheoldred, the Apocalypse", "Island"], hand: ["Opt"] },
    });
    s = advanceUntil(s, (x) => x.turn.step === "main1");
    expect(life(s, "p2")).toBe(18);
    s = act(s, "p2", { type: "pass" });
    s = settle(castIt(s, "p1", "Opt"));
    expect(life(s, "p1")).toBe(22);
    expect(card("Sheoldred, the Apocalypse").keywords).toContain("deathtouch");
  });

  describe("Tataru Taru", () => {
    it("à l'arrivée, vous piochez et l'adversaire ciblé peut piocher ; il pioche hors de son tour : un Trésor engagé, une fois par tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Tataru Taru"] },
        p2: { battlefield: lands("Island", 2), hand: ["Opt"] },
      });
      s = settle(castIt(s, "p1", "Tataru Taru"), yes);
      expect(handSize(s, "p1")).toBe(1);
      expect(handSize(s, "p2")).toBe(2);
      const treasures = tokens(s, "p1", "Treasure");
      expect(treasures).toHaveLength(1);
      expect(s.objects[treasures[0] as string]?.tapped).toBe(true);
      // Deuxième pioche de p2 ce tour-ci : la capacité ne se déclenche qu'une fois par tour.
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Opt"));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("l'adversaire peut refuser de piocher ; sa pioche pendant son propre tour ne donne rien", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Tataru Taru"] } });
      s = settle(castIt(s, "p1", "Tataru Taru"), (req) => (req.intent === "may" ? [0] : undefined));
      expect(handSize(s, "p2")).toBe(0);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(handSize(s, "p2")).toBe(1);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
    });
  });

  describe("copies non légendaires", () => {
    it("Irenicus's Vile Duplication : copie d'une créature que vous contrôlez, avec le vol, non légendaire", () => {
      let s = scenario({
        p1: { battlefield: ["Kambal, Consul of Allocation", ...lands("Island", 4)], hand: ["Irenicus's Vile Duplication"] },
      });
      const kambal = idOf(s, "p1", "battlefield", "Kambal, Consul of Allocation");
      s = settle(castIt(s, "p1", "Irenicus's Vile Duplication", { t: [kambal] }));
      const copy = tokens(s, "p1", "Kambal, Consul of Allocation");
      expect(copy).toHaveLength(1);
      expect(chars(s, copy[0] as string).keywords).toContain("flying");
      expect(chars(s, copy[0] as string).supertypes).not.toContain("Legendary");
      expect(s.battlefield).toContain(kambal);
    });

    it("Quantum Misalignment : copie non légendaire ; rebond (exilé, relancé gratuitement à votre prochain entretien)", () => {
      let s = scenario({
        p1: { battlefield: ["Kambal, Consul of Allocation", ...lands("Island", 5)], hand: ["Quantum Misalignment"] },
      });
      const kambal = idOf(s, "p1", "battlefield", "Kambal, Consul of Allocation");
      s = settle(castIt(s, "p1", "Quantum Misalignment", { t: [kambal] }));
      expect(tokens(s, "p1", "Kambal, Consul of Allocation")).toHaveLength(1);
      expect(chars(s, tokens(s, "p1")[0] as string).supertypes).not.toContain("Legendary");
      const exiled = s.exile.find((id) => nameOf(s, id) === "Quantum Misalignment") as string;
      expect(exiled).toBeDefined();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && !!castNowOf(x));
      expect(castNowOf(s)?.cards).toEqual([exiled]);
      s = act(s, "p1", { type: "cast", card: exiled, targets: { t: [kambal] } });
      s = settle(s);
      expect(tokens(s, "p1", "Kambal, Consul of Allocation")).toHaveLength(2);
      // Lancé depuis l'exil : pas de nouveau rebond.
      expect(namesInGraveyard(s, "p1")).toContain("Quantum Misalignment");
    });
  });

  describe("Mindcrank et Bloodchief Ascension", () => {
    it("Mindcrank : un adversaire perd des PV, il meule autant de cartes ; pas vous", () => {
      let s = scenario({
        p1: { battlefield: ["Mindcrank", ...lands("Mountain", 2)], hand: ["Shock", "Lightning Bolt"] },
      });
      s = settle(castIt(s, "p1", "Shock", { t: ["p2"] }));
      expect(s.players.p2?.library).toHaveLength(8);
      expect(s.players.p2?.graveyard).toHaveLength(2);
      s = settle(castIt(s, "p1", "Lightning Bolt", { t: ["p1"] }));
      expect(s.players.p1?.library).toHaveLength(10);
    });

    it("Bloodchief Ascension : marqueur de quête à l'étape de fin si un adversaire a perdu 2 PV ou plus ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Bloodchief Ascension", "Mountain"], hand: ["Shock"] } });
      const asc = idOf(s, "p1", "battlefield", "Bloodchief Ascension");
      s = toNextTurn(s);
      expect(s.objects[asc]?.counters.quest ?? 0).toBe(0);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(castIt(s, "p1", "Shock", { t: ["p2"] }));
      s = toNextTurn(s);
      expect(s.objects[asc]?.counters.quest).toBe(1);
    });

    it("Bloodchief Ascension à trois marqueurs : une carte mise dans le cimetière d'un adversaire, il perd 2 PV, vous en gagnez 2", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bloodchief Ascension", counters: { quest: 3 } }, "Swamp"], hand: ["Duress"] },
        p2: { hand: ["Shock"] },
      });
      s = settle(castIt(s, "p1", "Duress", { t: ["p2"] }), yes);
      // Shock défaussée par p2 : un déclenchement ; Duress dans le cimetière de p1 : aucun.
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
    });

    it("Mindcrank + Bloodchief Ascension : chaque carte meulée fait perdre 2 PV, qui font meuler 2 cartes… jusqu'à la défaite", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mindcrank", { name: "Bloodchief Ascension", counters: { quest: 3 } }, "Mountain"],
          hand: ["Shock"],
        },
        p2: { life: 8, library: lands("Island", 20) },
      });
      s = settle(castIt(s, "p1", "Shock", { t: ["p2"] }), yes);
      expect(s.players.p2?.lost).toBe(true);
      expect(life(s, "p2")).toBeLessThanOrEqual(0);
      // Shock (2) puis trois pertes de 2 : six cartes meulées au moins.
      expect(s.players.p2?.graveyard.length ?? 0).toBeGreaterThanOrEqual(6);
      expect(life(s, "p1")).toBeGreaterThanOrEqual(26);
    });
  });

  describe("Auras", () => {
    it("Helm of the Ghastlord : créature bleue +1/+1 et pioche en blessant un adversaire ; noire : +1/+1 et défausse", () => {
      let s = scenario({
        p1: { battlefield: ["Aegis Turtle", ...lands("Island", 4)], hand: ["Helm of the Ghastlord"] },
        p2: { hand: ["Shock"] },
      });
      const turtle = idOf(s, "p1", "battlefield", "Aegis Turtle");
      s = settle(castIt(s, "p1", "Helm of the Ghastlord", { enchant: [turtle] }));
      expect([chars(s, turtle).power, chars(s, turtle).toughness]).toEqual([1, 6]);
      s = throughCombat(attack(s, [turtle]));
      expect(life(s, "p2")).toBe(19);
      expect(handSize(s, "p1")).toBe(1);
      // Créature bleue : pas de défausse.
      expect(handSize(s, "p2")).toBe(1);

      let t = scenario({
        p1: { battlefield: ["Vampire of the Dire Moon", ...lands("Swamp", 4)], hand: ["Helm of the Ghastlord"] },
        p2: { hand: ["Shock"] },
      });
      const vampire = idOf(t, "p1", "battlefield", "Vampire of the Dire Moon");
      t = settle(castIt(t, "p1", "Helm of the Ghastlord", { enchant: [vampire] }));
      expect(chars(t, vampire).power).toBe(2);
      t = throughCombat(attack(t, [vampire]));
      expect(handSize(t, "p2")).toBe(0);
      expect(handSize(t, "p1")).toBe(0);
    });

    it("Ophidian Eye (flash) : la créature enchantée blesse un adversaire, vous pouvez piocher", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Savannah Lions", ...lands("Island", 3)], hand: ["Ophidian Eye"] },
      });
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = act(s, "p2", { type: "pass" });
      // Pendant le tour de p2 : le flash.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Ophidian Eye"))).toBe(true);
      s = settle(castIt(s, "p1", "Ophidian Eye", { enchant: [lions] }));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const before = handSize(s, "p1");
      s = throughCombat(attack(s, [lions]), yes);
      expect(life(s, "p2")).toBe(18);
      expect(handSize(s, "p1")).toBe(before + 1);
    });
  });

  describe("taxes et restrictions", () => {
    it("Propaganda : attaquer son contrôleur coûte {2} par créature ; attaquer un autre joueur, rien", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Savannah Lions", "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Propaganda"] },
      });
      const attackers = [idOf(s, "p1", "battlefield", "Savannah Lions"), idOf(s, "p1", "battlefield", "Bear Cub")];
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      // {4} pour deux créatures : trois Plaines ne suffisent pas.
      expect(() =>
        act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) }),
      ).toThrow();
      const one = act(s, "p1", { type: "declareAttackers", attackers: [{ id: attackers[0] as string, defender: "p2" }] });
      expect(idsOf(one, "p1", "battlefield", "Plains").filter((id) => one.objects[id]?.tapped)).toHaveLength(2);
      const free = act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p3" })) });
      expect(idsOf(free, "p1", "battlefield", "Plains").filter((id) => free.objects[id]?.tapped)).toHaveLength(0);
    });

    it("Teferi, Time Raveler : les adversaires ne lancent des sorts qu'au moment d'un rituel", () => {
      let s = scenario({
        p1: { battlefield: ["Teferi, Time Raveler"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const shock = idOf(s, "p2", "hand", "Shock");
      s = act(s, "p1", { type: "pass" });
      expect(s.pending).toMatchObject({ kind: "priority", player: "p2" });
      expect(castable(s, "p2", shock)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(castable(s, "p2", shock)).toBe(true);
    });

    it("Teferi +1 : jusqu'à votre prochain tour, vos rituels ont le flash ; −3 : renvoie un permanent et pioche", () => {
      let s = scenario({
        p1: { battlefield: ["Teferi, Time Raveler", ...lands("Island", 2)], hand: ["Chart a Course"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const teferi = idOf(s, "p1", "battlefield", "Teferi, Time Raveler");
      const abilities = () => legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === teferi);
      const plus = abilities()[0];
      if (plus?.type !== "activate") throw new Error("+1 introuvable");
      s = settle(act(s, "p1", { type: "activate", source: teferi, ability: plus.ability }));
      expect(s.objects[teferi]?.counters.loyalty).toBe(5);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Chart a Course"))).toBe(true);
      // À son tour suivant, l'effet a pris fin.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.pending?.kind === "priority");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Chart a Course"))).toBe(false);

      let t = scenario({
        p1: { battlefield: ["Teferi, Time Raveler"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const teferi2 = idOf(t, "p1", "battlefield", "Teferi, Time Raveler");
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      const minus = legalActions(t, "p1").filter((a) => a.type === "activate" && a.source === teferi2)[1];
      if (minus?.type !== "activate") throw new Error("−3 introuvable");
      t = settle(act(t, "p1", { type: "activate", source: teferi2, ability: minus.ability, targets: { t: [angel] } }));
      expect(namesIn(t, t.players.p2?.hand)).toEqual(["Serra Angel"]);
      expect(handSize(t, "p1")).toBe(1);
      expect(t.objects[teferi2]?.counters.loyalty).toBe(1);
    });
  });

  describe("Mystic Remora", () => {
    it("entretien cumulatif {1} : un marqueur d'âge à chaque entretien, payez {1} par marqueur ou sacrifiez-la", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Mystic Remora", "Island"] },
      });
      const remora = idOf(s, "p1", "battlefield", "Mystic Remora");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(s.objects[remora]?.counters.age).toBe(1);
      expect(s.battlefield).toContain(remora);
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      // Deuxième entretien : {2}, une seule Île : sacrifiée.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 4 && x.turn.step === "draw");
      expect(s.battlefield).not.toContain(remora);
      expect(namesInGraveyard(s, "p1")).toContain("Mystic Remora");
    });

    it("un adversaire lance un sort non-créature : vous pouvez piocher, à moins qu'il ne paie {4}", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Mystic Remora"] },
        p2: { battlefield: ["Mountain", "Plains"], hand: ["Shock", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p2", "Shock", { t: ["p1"] }), yes);
      expect(handSize(s, "p1")).toBe(1);
      s = settle(castIt(s, "p2", "Savannah Lions"), yes);
      expect(handSize(s, "p1")).toBe(1);
      // Avec {4} disponibles, il paie (réponse suggérée) : pas de pioche.
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Mystic Remora"] },
        p2: { battlefield: lands("Mountain", 5), hand: ["Shock"] },
      });
      t = settle(castIt(t, "p2", "Shock", { t: ["p1"] }), yes);
      expect(handSize(t, "p1")).toBe(0);
      expect(idsOf(t, "p2", "battlefield", "Mountain").every((id) => t.objects[id]?.tapped)).toBe(true);
    });

    it("entretien cumulatif en PV (« Cumulative upkeep—Pay N life ») : le coût multiplié par les marqueurs d'âge", () => {
      const relic = customCard({
        name: "Relique d'essai",
        typeLine: "Enchantment",
        types: ["Enchantment"],
        abilities: [cumulativeUpkeepAbility({ life: 2 }, "Entretien cumulatif — 2 PV")],
      });
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: [relic] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(life(s, "p1")).toBe(18);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 4 && x.turn.step === "draw");
      expect(life(s, "p1")).toBe(14);
      expect(s.objects[idOf(s, "p1", "battlefield", "Relique d'essai")]?.counters.age).toBe(2);
    });
  });
});

const namesInGraveyard = (s: GameState, p: PlayerId) => (s.players[p]?.graveyard ?? []).map((id) => nameOf(s, id));
const namesIn = (s: GameState, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

describe("taxe d'attaque et planeswalkers (PLAN-H, lot H5)", () => {
  it("Propaganda : attaquer un planeswalker de son contrôleur ne coûte rien", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)] },
      p2: { battlefield: ["Propaganda", "Ajani Resolute"] },
    });
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: walker }],
    });
    expect(idsOf(s, "p1", "battlefield", "Plains").filter((id) => s.objects[id]?.tapped)).toHaveLength(0);
    expect(s.combat?.attackers.map((a) => a.defender)).toEqual([walker]);
  });
});
