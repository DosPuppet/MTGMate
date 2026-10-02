/**
 * Outlaws of Thunder Junction, lot A : plot (702.170), spree (702.172), crimes (700.13), marqueurs de capacité (122.1b),
 * terrains rapides.
 */
import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { declareAttackers } from "../src/turn";
import type { GameState, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  canActivate,
  castable,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  picking,
  pickNamed,
  scenario,
  settle,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const abilityIndex = (s: S, id: string, label: string) =>
  (s.defs[s.objects[id]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated" && a.label?.startsWith(label));

describe("Outlaws of Thunder Junction", () => {
  it("plot : action spéciale depuis la main, puis lancement gratuit à un tour ultérieur, au moment d'un rituel", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Djinn of Fool's Fall"] } });
    const djinn = idOf(s, "p1", "hand", "Djinn of Fool's Fall");
    s = act(s, "p1", { type: "activate", source: djinn, ability: abilityIndex(s, djinn, "Complot") });
    // Action spéciale : pas de pile, la carte est exilée et complotée.
    expect(s.stack).toHaveLength(0);
    const plotted = s.exile.find((id) => s.objects[id]?.plottedTurn !== undefined) as string;
    expect(plotted).toBeDefined();
    // Pas ce tour-ci.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === plotted)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const cast = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === plotted);
    expect(cast?.type === "cast" && cast.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: plotted });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Djinn of Fool's Fall")).toHaveLength(1);
    expect(s.players.p1?.manaPool.U ?? 0).toBe(0);
  });

  it("spree : les coûts des modes choisis s'ajoutent ; un mode trop cher n'est pas proposé", () => {
    const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Trash the Town"] }, p2: { battlefield: ["Bear Cub"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const labels = opt?.type === "cast" ? opt.modes.map((m) => m.label) : [];
    // {G} + {2} + {1} = 4 mana pour deux modes, 5 pour les trois : seulement 3 Forêts.
    expect(labels).toContain("Deux marqueurs +1/+1");
    expect(labels).toContain("Piétinement + Blessures de combat : piochez deux cartes");
    expect(labels).not.toContain("Deux marqueurs +1/+1 + Piétinement + Blessures de combat : piochez deux cartes");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Deux marqueurs +1/+1") : undefined;
    let t = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Trash the Town"),
      mode: mode?.index,
      targets: { a: [bear] },
    });
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(3);
    t = passBoth(t);
    expect(t.objects[bear]?.counters["+1/+1"]).toBe(2);
  });

  it("crime : cibler un adversaire ou ce qu'il contrôle déclenche « chaque fois que vous commettez un crime »", () => {
    let s = scenario({
      p1: { battlefield: ["Blood Hustler", ...lands("Mountain", 2)], hand: ["Scorching Shot"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const hustler = idOf(s, "p1", "battlefield", "Blood Hustler");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Scorching Shot"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    expect(s.players.p1?.turnStats.crimes).toBe(1);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[hustler]?.counters["+1/+1"]).toBe(1);
    // Cibler sa propre créature n'est pas un crime.
    let t = scenario({ p1: { battlefield: ["Omenport Vigilante", ...lands("Mountain", 2)], hand: ["Scorching Shot"] } });
    const vig = idOf(t, "p1", "battlefield", "Omenport Vigilante");
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Scorching Shot"), targets: { t: [vig] } });
    expect(t.players.p1?.turnStats.crimes ?? 0).toBe(0);
    expect(chars(t, vig).keywords).not.toContain("doubleStrike");
  });

  it("marqueurs de capacité : un marqueur contact mortel donne le contact mortel (Vraska Joins Up)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 1), ...lands("Forest", 1)], hand: ["Vraska Joins Up"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vraska Joins Up") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("deathtouch");
  });

  it("terrains rapides : dégagés avec deux autres terrains ou moins, engagés au-delà", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Blooming Marsh"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Blooming Marsh") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Blooming Marsh"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Blooming Marsh") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(true);
  });

  it("« quand cette carte devient complotée » se déclenche depuis l'exil (Longhorn Sharpshooter)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Longhorn Sharpshooter"] } });
    const card = idOf(s, "p1", "hand", "Longhorn Sharpshooter");
    s = act(s, "p1", { type: "activate", source: card, ability: abilityIndex(s, card, "Complot") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.life).toBe(18);
  });

  it("Archangel of Tithes : attaquer coûte {1} par créature", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => declareAttackers(s, "p1", [{ id: bear, defender: "p2" }])).toThrow();
    const t = scenario({
      p1: { battlefield: ["Bear Cub", "Plains"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    declareAttackers(t, "p1", [{ id: idOf(t, "p1", "battlefield", "Bear Cub"), defender: "p2" }]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("High Noon : un seul sort par joueur et par tour", () => {
    let s = scenario({
      p1: { battlefield: ["High Noon", ...lands("Mountain", 4)], hand: ["Scorching Shot", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "cast")).toBe(false);
  });

  it("Double Down : la copie d'un sort de créature hors-la-loi devient un jeton", () => {
    let s = scenario({ p1: { battlefield: ["Double Down", ...lands("Swamp", 3)], hand: ["Vault Plunderer"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vault Plunderer") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Vault Plunderer")).toHaveLength(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
  });

  it("Terror of the Peaks : un sort adverse qui la cible coûte 3 PV de plus", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Terror of the Peaks"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Terror of the Peaks")] },
    });
    expect(s.players.p1?.life).toBe(17);
  });

  it("Step Between Worlds est exilé en se résolvant ; Magebane Lizard blesse le lanceur", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Step Between Worlds"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Step Between Worlds") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Step Between Worlds")).toBe(true);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Magebane Lizard"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    t = passAccepting(t, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.life).toBe(19);
  });

  it("The Big Score : Rest in Peace, Grand Abolisher, Torpor Orb, Worldwalker Helm", () => {
    let s = scenario({
      p1: { battlefield: ["Rest in Peace", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = passBoth(s);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    // Grand Abolisher : pendant le tour de p1, p2 ne lance rien.
    const t = scenario({
      p1: { battlefield: ["Grand Abolisher"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    expect(legalActions(t, "p2").some((a) => a.type === "cast")).toBe(false);
    // Torpor Orb : l'arrivée d'une créature ne déclenche rien.
    let u = scenario({ p1: { battlefield: ["Torpor Orb", ...lands("Plains", 3)], hand: ["Holy Cow"] } });
    u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Holy Cow") });
    u = passBoth(u);
    expect(u.players.p1?.life).toBe(20);
    // Worldwalker Helm : un Trésor s'accompagne d'une Carte.
    let v = scenario({ p1: { battlefield: ["Worldwalker Helm", "Treasure Dredger", ...lands("Swamp", 1)] } });
    const dredger = idOf(v, "p1", "battlefield", "Treasure Dredger");
    v = act(v, "p1", { type: "activate", source: dredger, ability: 0 });
    v = passBoth(v);
    expect(idsOf(v, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(idsOf(v, "p1", "battlefield", "Map")).toHaveLength(1);
  });
});

describe("Outlaws of Thunder Junction : montants à l'arrivée", () => {
  it("Sheriff of Safe Passage : un marqueur +1/+1 plus un par autre créature que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", "Plains", "Plains", "Plains"], hand: ["Sheriff of Safe Passage"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sheriff of Safe Passage") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const sheriff = idOf(s, "p1", "battlefield", "Sheriff of Safe Passage");
    expect(s.objects[sheriff]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, sheriff).power).toBe(3);
  });
});

describe("Outlaws of Thunder Junction : cartes du méta confrontées à leur texte Oracle (PLAN-C, lot C13)", () => {
  /** Index du mode (ou de la combinaison de modes d'un sort à spree) dont le libellé est `label`. */
  const modeOf = (s: S, name: string, label: string) => {
    const card = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === label) : undefined;
    if (!mode) throw new Error(`mode « ${label} » introuvable pour ${name}`);
    return mode.index;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Inspiring Vantage, Spirebluff Canal, Concealed Courtyard : dégagés avec deux autres terrains ou moins ; deux couleurs", () => {
    const fast: [string, string[]][] = [
      ["Inspiring Vantage", ["R", "W"]],
      ["Spirebluff Canal", ["U", "R"]],
      ["Concealed Courtyard", ["W", "B"]],
    ];
    for (const [name, colors] of fast) {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [name] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
      const land = idOf(s, "p1", "battlefield", name);
      expect(s.objects[land]?.tapped, name).toBe(false);
      const produced = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === land ? a.colors : []));
      expect([...produced].sort(), name).toEqual([...colors].sort());
      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [name] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", name) });
      expect(t.objects[idOf(t, "p1", "battlefield", name)]?.tapped, name).toBe(true);
    }
  });

  it("Shoot the Sheriff : détruit une créature qui n'est pas hors-la-loi", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Shoot the Sheriff"] },
      p2: { battlefield: ["Bear Cub", "Forsaken Miner"] },
    });
    // Forsaken Miner est un Rogue : un hors-la-loi, pas une cible.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Shoot the Sheriff"),
        targets: { t: [idOf(s, "p2", "battlefield", "Forsaken Miner")] },
      }),
    ).toThrow();
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shoot the Sheriff"), targets: { t: [cub] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Three Steps Ahead : contrecarre un sort ; jeton copie d'une créature à vous ; piochez deux puis défaussez une", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Three Steps Ahead"], library: lands("Forest", 3) },
    });
    const mode = modeOf(s, "Three Steps Ahead", "Jeton copie + Piochez deux, défaussez une");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Three Steps Ahead"),
      mode,
      targets: { c: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(cubs).toHaveLength(2);
    expect(cubs.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    // Mode « contrecarrez » sur un sort adverse.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Three Steps Ahead"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    const spell = t.stack[0]?.id as string;
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Three Steps Ahead"),
      mode: modeOf(t, "Three Steps Ahead", "Contrecarrez un sort"),
      targets: { s: [spell] },
    });
    t = settle(t);
    expect(t.players.p1?.life).toBe(20);
    expect(idsOf(t, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
  });

  it("Doc Aurlock, Grizzled Genius : sorts depuis le cimetière ou l'exil et complot coûtent {2} de moins", () => {
    // Think Twice : flashback {2}{U}, donc {U} avec Doc Aurlock.
    const withDoc = scenario({ p1: { battlefield: ["Doc Aurlock, Grizzled Genius", "Island"], graveyard: ["Think Twice"] } });
    expect(castable(withDoc, "p1", idOf(withDoc, "p1", "graveyard", "Think Twice"))).toBe(true);
    const without = scenario({ p1: { battlefield: ["Island"], graveyard: ["Think Twice"] } });
    expect(castable(without, "p1", idOf(without, "p1", "graveyard", "Think Twice"))).toBe(false);
    // Longhorn Sharpshooter : complot {3}{R}, donc {1}{R}.
    let s = scenario({
      p1: { battlefield: ["Doc Aurlock, Grizzled Genius", ...lands("Mountain", 2)], hand: ["Longhorn Sharpshooter"] },
    });
    const card = idOf(s, "p1", "hand", "Longhorn Sharpshooter");
    const plot = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
    expect(plot).toBeDefined();
    s = act(s, "p1", { type: "activate", source: card, ability: plot?.type === "activate" ? plot.ability : -1 });
    expect(s.exile.some((id) => nameOf(s, id) === "Longhorn Sharpshooter" && s.objects[id]?.plottedTurn !== undefined)).toBe(
      true,
    );
    const noDoc = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Longhorn Sharpshooter"] } });
    expect(canActivate(noDoc, "p1", idOf(noDoc, "p1", "hand", "Longhorn Sharpshooter"))).toBe(false);
  });

  it("Requisition Raid : détruit un artefact et met un marqueur +1/+1 sur chaque créature d'un joueur ciblé", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 3)], hand: ["Requisition Raid"] },
      p2: { battlefield: ["Ghost Vacuum", "Shivan Dragon"] },
    });
    const vacuum = idOf(s, "p2", "battlefield", "Ghost Vacuum");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Requisition Raid"),
      mode: modeOf(s, "Requisition Raid", "Détruisez un artefact + Marqueur +1/+1 sur les créatures d'un joueur"),
      targets: { a: [vacuum], p: ["p1"] },
    });
    s = settle(s);
    expect(s.objects[vacuum]).toBeUndefined();
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Lively Dirge : une carte de la bibliothèque au cimetière ; jusqu'à deux créatures de VM totale 4 ou moins reviennent", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: lands("Swamp", 5),
          hand: ["Lively Dirge"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"],
          library: ["Forest", "Serra Angel", "Forest"],
        },
      });
    let s = start();
    const both = modeOf(
      s,
      "Lively Dirge",
      "Une carte de la bibliothèque au cimetière + Jusqu'à deux créatures (VM totale 4 ou moins)",
    );
    // Bear Cub (2) et Shivan Dragon (6) : plus de 4 au total.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Lively Dirge"),
        mode: both,
        targets: { c: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Shivan Dragon")] },
      }),
    ).toThrow();
    s = start();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lively Dirge"),
      mode: both,
      targets: { c: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Llanowar Elves")] },
    });
    s = settle(s, (req, _p, x) => pickNamed(x, req, "Serra Angel"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Lively Dirge", "Serra Angel", "Shivan Dragon"]);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Forsaken Miner : ne peut pas bloquer ; quand vous commettez un crime, payez {B} pour le renvoyer du cimetière", () => {
    const board = scenario({ p1: { battlefield: ["Forsaken Miner"] } });
    expect(chars(board, idOf(board, "p1", "battlefield", "Forsaken Miner")).keywords).toContain("cantBlock");
    let s = scenario({ p1: { battlefield: ["Mountain", "Swamp"], hand: ["Burst Lightning"], graveyard: ["Forsaken Miner"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p2"] } });
    s = settle(s, yes);
    expect(idsOf(s, "p1", "battlefield", "Forsaken Miner")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(18);
    // Sans crime (cible : vous-même), rien.
    let t = scenario({ p1: { battlefield: ["Mountain", "Swamp"], hand: ["Burst Lightning"], graveyard: ["Forsaken Miner"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
    t = settle(t, yes);
    expect(idsOf(t, "p1", "graveyard", "Forsaken Miner")).toHaveLength(1);
  });

  it("Nurturing Pixie : renvoie un permanent non-Faerie à vous et prend un marqueur +1/+1 ; sans renvoi, pas de marqueur", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Nurturing Pixie"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nurturing Pixie") });
    s = settle(s, picking([cub]));
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    const pixie = idOf(s, "p1", "battlefield", "Nurturing Pixie");
    expect(chars(s, pixie)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, pixie).keywords).toContain("flying");
    let t = scenario({ p1: { battlefield: ["Plains"], hand: ["Nurturing Pixie"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nurturing Pixie") });
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Nurturing Pixie")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Bovine Intervention : détruit un artefact ou une créature ; son contrôleur crée un Bœuf 2/2 blanc", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Bovine Intervention"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bovine Intervention"), targets: { t: [dragon] } });
    s = settle(s);
    expect(s.objects[dragon]).toBeUndefined();
    const ox = idOf(s, "p2", "battlefield", "Ox");
    expect(chars(s, ox)).toMatchObject({ power: 2, toughness: 2, colors: ["W"] });
    expect(idsOf(s, "p1", "battlefield", "Ox")).toHaveLength(0);
  });

  it("Return the Favor : copie un sort (nouvelles cibles possibles) ; change la cible d'un sort à cible unique", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Lightning Strike", "Return the Favor"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    const strike = s.stack[0]?.id as string;
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Return the Favor"),
      mode: modeOf(s, "Return the Favor", "Copiez un sort ou une capacité"),
      targets: { c: [strike] },
    });
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
    // Le sort adverse qui vous vise est renvoyé vers son lanceur.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Mountain", 3), hand: ["Return the Favor"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    const theirs = t.stack[0]?.id as string;
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Return the Favor"),
      mode: modeOf(t, "Return the Favor", "Changez la cible"),
      targets: { b: [theirs] },
    });
    t = settle(t, picking(["p2"]));
    expect(t.players.p1?.life).toBe(20);
    expect(t.players.p2?.life).toBe(17);
  });

  it("Aven Interrupter : exile un sort qui devient comploté ; les sorts adverses depuis l'exil coûtent {2} de plus", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Aven Interrupter"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "hand", "Shivan Dragon");
    s = act(s, "p2", { type: "cast", card: dragon });
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Aven Interrupter") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Aven Interrupter")).toHaveLength(1);
    const plotted = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect(plotted).toBeDefined();
    expect(s.objects[plotted]?.plottedTurn).toBeDefined();
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    // Au tour suivant de p2 : lancé sans payer son coût de mana, mais {2} de plus.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.number > 3 && x.turn.step === "main1" && x.stack.length === 0);
    s = act(s, "p2", { type: "cast", card: plotted });
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.tapped)).toHaveLength(2);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Magda, the Hoardmaster : un Trésor engagé au premier crime du tour ; trois Trésors sacrifiés pour un Dragon Scorpion 4/4", () => {
    let s = scenario({
      p1: { battlefield: ["Magda, the Hoardmaster", ...lands("Mountain", 2)], hand: ["Burst Lightning", "Burst Lightning"] },
    });
    for (const card of idsOf(s, "p1", "hand", "Burst Lightning")) {
      s = act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } });
      s = settle(s);
    }
    const treasures = idsOf(s, "p1", "battlefield", "Treasure");
    expect(treasures).toHaveLength(1);
    expect(s.objects[treasures[0] as string]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Magda, the Hoardmaster"] } });
    createTokens(t, "p1", TOKEN_SPECS.Treasure as TokenSpec, 3);
    const magda = idOf(t, "p1", "battlefield", "Magda, the Hoardmaster");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === magda);
    t = act(t, "p1", { type: "activate", source: magda, ability: ab?.type === "activate" ? ab.ability : -1 });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    const dragon = t.battlefield.find((id) => t.objects[id]?.isToken && chars(t, id).subtypes.includes("Dragon")) as string;
    expect(chars(t, dragon)).toMatchObject({ power: 4, toughness: 4, colors: ["R"] });
    expect(chars(t, dragon).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
  });
});
