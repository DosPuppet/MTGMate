/**
 * Objets payés en coût choisis par le joueur (docs/plans/PLAN-C.md, lots C7 et C8) : `legalActions` propose les choix
 * (`picks`), le moteur applique ceux du joueur ou, à défaut, sa suggestion, et refuse un choix invalide.
 */
import { describe, expect, it } from "vitest";
import { fx, ref, spell, target } from "../src/dsl";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import type { ActionOption, GameState } from "../src/types";
import { act, customCard, idOf, lands, scenario, settle } from "./helpers";

const activation = (s: GameState, source: string, label: string) =>
  legalActions(s, "p1").find(
    (a): a is Extract<ActionOption, { type: "activate" }> =>
      a.type === "activate" && a.source === source && !!a.label?.includes(label),
  );
const bear = (name: string, power = 2, toughness = 2) => customCard({ name, power, toughness });

describe("objets payés en coût, au choix du joueur", () => {
  it("flétrir en coût : la créature choisie reçoit le marqueur, sinon la suggestion du moteur", () => {
    const base = { battlefield: ["Dawnhand Dissident", bear("Petit", 2, 2), bear("Gros", 4, 4)] };
    let s = scenario({ p1: base });
    const dissident = idOf(s, "p1", "battlefield", "Dawnhand Dissident");
    const [petit, gros] = [idOf(s, "p1", "battlefield", "Petit"), idOf(s, "p1", "battlefield", "Gros")];
    const option = activation(s, dissident, "surveillance");
    const pick = option?.picks?.find((p) => p.slot === "blight");
    expect(pick?.options).toEqual(expect.arrayContaining([petit, gros]));
    // Suggestion : une créature qui survit (la plus résistante).
    expect(pick?.suggested).toEqual([gros]);
    s = act(s, "p1", {
      type: "activate",
      source: dissident,
      ability: option?.ability ?? -1,
      targets: {},
      picks: { blight: [petit] },
    });
    expect(s.objects[petit]?.counters["-1/-1"]).toBe(1);
    expect(s.objects[gros]?.counters["-1/-1"]).toBeUndefined();
    // Sans choix : la suggestion.
    let t = scenario({ p1: base });
    const d2 = idOf(t, "p1", "battlefield", "Dawnhand Dissident");
    t = act(t, "p1", { type: "activate", source: d2, ability: activation(t, d2, "surveillance")?.ability ?? -1, targets: {} });
    expect(t.objects[idOf(t, "p1", "battlefield", "Gros")]?.counters["-1/-1"]).toBe(1);
  });

  it("un choix invalide est refusé (objet hors des options, mauvais nombre)", () => {
    const s = scenario({
      p1: { battlefield: ["Dawnhand Dissident", bear("Petit", 1, 1)] },
      p2: { battlefield: [bear("Ennemi")] },
    });
    const dissident = idOf(s, "p1", "battlefield", "Dawnhand Dissident");
    const ability = activation(s, dissident, "surveillance")?.ability ?? -1;
    const enemy = idOf(s, "p2", "battlefield", "Ennemi");
    const petit = idOf(s, "p1", "battlefield", "Petit");
    expect(() => act(s, "p1", { type: "activate", source: dissident, ability, targets: {}, picks: { blight: [enemy] } })).toThrow(
      RulesError,
    );
    expect(() =>
      act(s, "p1", { type: "activate", source: dissident, ability, targets: {}, picks: { blight: [petit, dissident] } }),
    ).toThrow(RulesError);
  });

  it("réunir des preuves : les cartes choisies, de valeur de mana totale suffisante (Polygraph Orb)", () => {
    let s = scenario({
      p1: { battlefield: ["Polygraph Orb", ...lands("Island", 2)], graveyard: ["Opt", "Opt", "Opt", "Lightning Strike"] },
    });
    const orb = idOf(s, "p1", "battlefield", "Polygraph Orb");
    const option = activation(s, orb, "perd 3 PV");
    const pick = option?.picks?.find((p) => p.slot === "evidence");
    expect(pick?.minTotal?.n).toBe(3);
    const opts = s.players.p1?.graveyard.filter((id) => s.objects[id]?.defId === "opt") ?? [];
    // Trois Opt (valeur 1 chacune) plutôt que Lightning Strike (valeur 2… insuffisante seule).
    expect(() =>
      act(s, "p1", {
        type: "activate",
        source: orb,
        ability: option?.ability ?? -1,
        targets: {},
        picks: { evidence: opts.slice(0, 2) },
      }),
    ).toThrow(RulesError);
    s = act(s, "p1", { type: "activate", source: orb, ability: option?.ability ?? -1, targets: {}, picks: { evidence: opts } });
    expect(s.players.p1?.graveyard.map((id) => s.objects[id]?.defId)).toEqual(["lightning-strike"]);
  });

  it("convocation : les créatures choisies paient (et toutes doivent servir), les autres restent dégagées", () => {
    const reds = ["Rouge A", "Rouge B", "Rouge C"].map((n) => customCard({ name: n, power: 1, toughness: 1, colors: ["R"] }));
    const base = { battlefield: [...lands("Mountain", 3), ...reds], hand: ["Collective Inferno"] };
    let s = scenario({ p1: base });
    const inferno = idOf(s, "p1", "hand", "Collective Inferno");
    const option = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === inferno,
    );
    const pick = option?.picks?.find((p) => p.slot === "convoke");
    expect(pick?.atMost).toBe(true);
    const [a, b, c] = ["Rouge A", "Rouge B", "Rouge C"].map((n) => idOf(s, "p1", "battlefield", n));
    // {3}{R}{R} : trois Montagnes et deux créatures choisies.
    s = act(s, "p1", { type: "cast", card: inferno, picks: { convoke: [a as string, c as string] } });
    expect([a, b, c].map((id) => s.objects[id as string]?.tapped)).toEqual([true, false, true]);
    // Trop de créatures choisies pour le coût : refusé.
    const t = scenario({ p1: { ...base, battlefield: [...lands("Mountain", 4), ...reds] } });
    const all = ["Rouge A", "Rouge B", "Rouge C"].map((n) => idOf(t, "p1", "battlefield", n));
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Collective Inferno"), picks: { convoke: all } }),
    ).not.toThrow();
    expect(() =>
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Collective Inferno"),
        picks: { convoke: [...all, idOf(t, "p1", "battlefield", "Mountain")] },
      }),
    ).toThrow(RulesError);
  });
});

describe("614.12 : « en arrivant, choisissez… » demandé au joueur (PLAN-C, lot C9)", () => {
  it("Cavern of Souls jouée : le type choisi en la jouant, sinon le choix par défaut ; un choix hors des options est refusé", () => {
    let s = scenario({ p1: { hand: ["Cavern of Souls"] } });
    const cavern = idOf(s, "p1", "hand", "Cavern of Souls");
    const option = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "playLand" }> => a.type === "playLand" && a.card === cavern,
    );
    expect(option?.choose?.type).toBe("pick");
    expect(() => act(s, "p1", { type: "playLand", card: cavern, chosen: "Pas un type" })).toThrow(RulesError);
    s = act(s, "p1", { type: "playLand", card: cavern, chosen: "Elf" });
    expect(s.objects[idOf(s, "p1", "battlefield", "Cavern of Souls")]?.chosen).toEqual({ creatureType: "Elf" });
    // Sans choix : le choix par défaut, comme avant.
    let t = scenario({ p1: { hand: ["Cavern of Souls"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Cavern of Souls") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Cavern of Souls")]?.chosen?.creatureType).toBeDefined();
  });

  it("un permanent mis en jeu par un effet : la question est posée à son nouveau contrôleur", () => {
    const raise = customCard({
      name: "Rappel de test",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell([target.cardInGraveyard("t", { types: ["Land"] })], [fx.toBattlefield(ref.target())]),
    });
    let s = scenario({ p1: { hand: [raise], graveyard: ["Cavern of Souls"] } });
    const cavern = idOf(s, "p1", "graveyard", "Cavern of Souls");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rappel de test"), targets: { t: [cavern] } });
    let asked = false;
    s = settle(s, (req) => {
      if (req.intent !== "chooseOnEnter") return undefined;
      asked = true;
      return ["Goblin"];
    });
    expect(asked).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Cavern of Souls")]?.chosen).toEqual({ creatureType: "Goblin" });
  });
});

describe("Coûts additionnels d'un sort choisis par le joueur (lot K6)", () => {
  const castOpt = (s: GameState, name: string) =>
    legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  it("Fear of Isolation : le joueur choisit le permanent renvoyé ; sans choix, la suggestion du moteur", () => {
    const setup = () =>
      scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub", "Serra Angel"], hand: ["Fear of Isolation"] } });
    let s = setup();
    const opt = castOpt(s, "Fear of Isolation");
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "costBounce") : undefined;
    expect(pick?.count).toBe(1);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(pick?.options).toContain(angel);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Isolation"), picks: { costBounce: [angel] } }));
    expect(idOf(s, "p1", "hand", "Serra Angel")).toBeDefined();
    expect(idOf(s, "p1", "battlefield", "Bear Cub")).toBeDefined();
    // Un objet hors des options est refusé.
    const t = setup();
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Fear of Isolation"), picks: { costBounce: ["inconnu"] } }),
    ).toThrow(RulesError);
  });

  it("Abhorrent Oculus : le joueur choisit les six cartes exilées du cimetière", () => {
    const gy = ["Bear Cub", "Serra Angel", "Opt", "Shock", "Island", "Forest", "Swamp"];
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Abhorrent Oculus"], graveyard: gy } });
    const keep = idOf(s, "p1", "graveyard", "Serra Angel");
    const six = (s.players.p1?.graveyard ?? []).filter((id) => id !== keep);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Abhorrent Oculus"), picks: { costGraveyard: six } }));
    expect(s.players.p1?.graveyard).toEqual([keep]);
    expect(idOf(s, "p1", "battlefield", "Abhorrent Oculus")).toBeDefined();
  });
});
