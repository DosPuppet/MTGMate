/**
 * Aetherdrift, lot A : Véhicules et Montures (pilotes, équipage à l'endurance, « équipe / monte »), cycle avec X,
 * défausse groupée, Verges, Roads, épuiser.
 */
import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { manaValue } from "../src/mana";
import { bump, chars, moveObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { stateBasedActions } from "../src/turn";
import type { CardDef, ChoiceRequest, GameState, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castable,
  counterFrom,
  customCard,
  exiled,
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
  settleNoBlocks,
  stepTrail,
  throughCombat,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const abilityIndex = (s: S, id: string, label: string) =>
  chars(s, id).abilities.findIndex((a) => a.kind === "activated" && a.label?.startsWith(label));

describe("Aetherdrift : Véhicules et Montures", () => {
  it("un pilote équipe comme si sa force était supérieure de 2 (Équipage 3 avec une créature 1/1)", () => {
    const s = scenario({ p1: { battlefield: ["Hulldrifter"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const crew = abilityIndex(s, hull, "Équipage");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === hull && a.ability === crew)).toBe(false);
    createTokens(s, "p1", TOKEN_SPECS.Pilot as TokenSpec, 1);
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === hull && a.ability === crew)).toBe(true);
  });

  it("Interface Ace équipe avec son endurance ; Reckless Velocitaur donne +2/+0 au Véhicule équipé", () => {
    let s = scenario({ p1: { battlefield: ["Hulldrifter", "Interface Ace"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = act(s, "p1", { type: "activate", source: hull, ability: abilityIndex(s, hull, "Équipage") });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(chars(s, hull).types).toContain("Creature");
    // « Chaque fois qu'elle devient engagée pendant votre tour, dégagez-la » : l'Ace s'est dégagée.
    expect(s.objects[idOf(s, "p1", "battlefield", "Interface Ace")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: ["Hulldrifter", "Reckless Velocitaur"] } });
    const h2 = idOf(t, "p1", "battlefield", "Hulldrifter");
    t = act(t, "p1", { type: "activate", source: h2, ability: abilityIndex(t, h2, "Équipage") });
    t = passAccepting(t, (x) => x.stack.length === 0);
    expect(chars(t, h2).power).toBe(5);
    expect(chars(t, h2).keywords).toContain("trample");
  });

  it("« attaque en étant montée » (Gilded Ghoda : Trésor) seulement si elle est montée", () => {
    let s = scenario({ p1: { battlefield: ["Gilded Ghoda", "Llanowar Elves"] }, step: "main1" });
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    s = act(s, "p1", { type: "activate", source: ghoda, ability: abilityIndex(s, ghoda, "Monture") });
    s = passBoth(s);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: ghoda, defender: "p2" }] });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Treasure").length > 0);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("cycle avec X : Valor's Flagship crée X Pilotes", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Valor's Flagship"] } });
    const ship = idOf(s, "p1", "hand", "Valor's Flagship");
    s = act(s, "p1", { type: "activate", source: ship, ability: abilityIndex(s, ship, "Cycle"), x: 3 });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(3);
  });

  it("défausse groupée : Marauding Mako reçoit un marqueur quand on cycle une carte", () => {
    let s = scenario({ p1: { battlefield: ["Marauding Mako", ...lands("Plains", 2)], hand: ["Lightshield Parry"] } });
    const mako = idOf(s, "p1", "battlefield", "Marauding Mako");
    const parry = idOf(s, "p1", "hand", "Lightshield Parry");
    s = act(s, "p1", { type: "activate", source: parry, ability: abilityIndex(s, parry, "Cycle") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[mako]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Verge : la deuxième couleur seulement avec le bon type de terrain ; Roads engagés sans Monture ni Véhicule", () => {
    const s = scenario({ p1: { battlefield: ["Sunbillow Verge"] } });
    const verge = idOf(s, "p1", "battlefield", "Sunbillow Verge");
    const colors = (x: S) =>
      legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === verge ? a.colors : []));
    expect(colors(s)).toEqual(["W"]);
    const t = scenario({ p1: { battlefield: ["Sunbillow Verge", "Mountain"] } });
    const v2 = idOf(t, "p1", "battlefield", "Sunbillow Verge");
    expect(legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === v2 ? a.colors : []))).toEqual([
      "W",
      "R",
    ]);
    let r = scenario({ p1: { hand: ["Rocky Roads"] } });
    r = act(r, "p1", { type: "playLand", card: idOf(r, "p1", "hand", "Rocky Roads") });
    expect(r.objects[idOf(r, "p1", "battlefield", "Rocky Roads")]?.tapped).toBe(true);
    let q = scenario({ p1: { battlefield: ["Hulldrifter"], hand: ["Rocky Roads"] } });
    q = act(q, "p1", { type: "playLand", card: idOf(q, "p1", "hand", "Rocky Roads") });
    expect(q.objects[idOf(q, "p1", "battlefield", "Rocky Roads")]?.tapped).toBe(false);
  });

  it("épuiser : Basri ne se dégage pas lors de la prochaine étape de dégagement", () => {
    let s = scenario({ p1: { battlefield: ["Basri, Tomorrow's Champion", "Plains"] } });
    const basri = idOf(s, "p1", "battlefield", "Basri, Tomorrow's Champion");
    s = act(s, "p1", { type: "activate", source: basri, ability: abilityIndex(s, basri, "Chat") });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(s.objects[basri]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(false);
  });
});

describe("Aetherdrift : vitesse (702.179) et exhaust (702.177)", () => {
  it("« Start your engines! » démarre la vitesse à 1 ; elle augmente une fois par tour quand un adversaire perd des PV", () => {
    let s = scenario({
      p1: { battlefield: ["Walking Sarcophagus", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    expect(s.players.p1?.speed).toBe(1); // actions basées sur l'état avant la priorité
    s = passBoth(s);
    expect(s.players.p1?.speed).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p1?.speed).toBe(2); // une seule fois par tour
  });

  it("vitesse maximale : Walking Sarcophagus +1/+2 ; Spikeshell Harrier fait baisser la vitesse du plus rapide", () => {
    const s = scenario({ p1: { battlefield: ["Walking Sarcophagus"] }, p2: { battlefield: ["Walking Sarcophagus"] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    const mine = idOf(s, "p1", "battlefield", "Walking Sarcophagus");
    expect(chars(s, mine).power).toBe(3);
    expect(chars(s, idOf(s, "p2", "battlefield", "Walking Sarcophagus")).power).toBe(2);
    let t = scenario({
      p1: { battlefield: ["Walking Sarcophagus"] },
      p2: { battlefield: [...lands("Island", 5)], hand: ["Spikeshell Harrier"] },
      active: "p2",
    });
    t.players.p1!.speed = 4;
    t.players.p2!.speed = 1;
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Spikeshell Harrier") });
    t = passAccepting(t, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.speed).toBe(3);
  });

  it("exhaust : une seule activation, déclencheurs « quand vous activez une capacité d'exhaust »", () => {
    let s = scenario({ p1: { battlefield: ["Prowcatcher Specialist", "Rangers' Refueler", ...lands("Mountain", 8)] } });
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: pro, ability: abilityIndex(s, pro, "Exhaust") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p1?.hand.length).toBe(hand + 1); // Rangers' Refueler
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === pro)).toBe(false);
  });

  it("Elvish Refueler : une capacité d'exhaust réactivable pendant votre tour tant qu'aucune n'a été activée", () => {
    let s = scenario({
      p1: { battlefield: ["Elvish Refueler", "Skystreak Engineer", ...lands("Island", 5), ...lands("Forest", 5)] },
    });
    const eng = idOf(s, "p1", "battlefield", "Skystreak Engineer");
    s.objects[eng]!.used = [abilityIndex(s, eng, "Exhaust")];
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === eng)).toBe(true);
    s = act(s, "p1", { type: "activate", source: eng, ability: abilityIndex(s, eng, "Exhaust") });
    s = passBoth(s);
    const ref = idOf(s, "p1", "battlefield", "Elvish Refueler");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ref)).toBe(true);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === eng)).toBe(false);
  });

  it("Samut : +X/+0 aux autres créatures (X = vitesse) ; Vnwxt à vitesse max pioche le double", () => {
    const s = scenario({ p1: { battlefield: ["Samut, the Driving Force", "Bear Cub"] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(5);
    let t = scenario({ p1: { battlefield: ["Vnwxt, Verbose Host", ...lands("Island", 3)], hand: ["Stock Up"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    const before = t.players.p1?.hand.length ?? 0;
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    // Pioche de l'étape de pioche : deux cartes.
    expect((t.players.p1?.hand.length ?? 0) - before).toBeGreaterThanOrEqual(2);
  });
});

describe("Aetherdrift, lot C", () => {
  it("Possession Engine : contrôle tant que vous contrôlez le Véhicule ; ni attaque ni blocage", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Possession Engine"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Possession Engine") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    // Le Véhicule part : l'Ange revient à son adversaire, sans restriction.
    const engine = idOf(s, "p1", "battlefield", "Possession Engine");
    moveObject(s, engine, "graveyard");
    stateBasedActions(s);
    const back = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, back).keywords).not.toContain("cantAttack");
  });

  it("Trade the Helm échange le contrôle ; Skyseer's Chariot taxe les capacités du nom choisi", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Trade the Helm"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Trade the Helm"),
      targets: { a: [idOf(s, "p1", "battlefield", "Bear Cub")], b: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Engine Rat", ...lands("Swamp", 6)] }, p2: { battlefield: ["Skyseer's Chariot"] } });
    const chariot = idOf(t, "p2", "battlefield", "Skyseer's Chariot");
    t.objects[chariot]!.chosen = { cardName: "Engine Rat" };
    t.version += 1;
    const rat = idOf(t, "p1", "battlefield", "Engine Rat");
    // {5}{B} + {2} = 8 mana : 6 Marais ne suffisent pas.
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === rat)).toBe(false);
  });

  it("Waxen Shapethief arrive comme copie ; Ancient Vendetta exile les cartes du nom choisi", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Serra Angel"], hand: ["Waxen Shapethief"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waxen Shapethief") });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "battlefield", "Serra Angel")] });
    const copies = s.battlefield.filter((id) => chars(s, id).name === "Serra Angel");
    expect(copies).toHaveLength(2);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] },
      p2: { hand: ["Opt", "Opt"], graveyard: ["Opt"], library: ["Opt", "Forest", "Opt", "Forest"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } });
    t = passBoth(t);
    t = act(t, "p1", { type: "choose", values: ["Opt"] });
    expect(t.exile.filter((id) => t.objects[id]?.owner === "p2")).toHaveLength(4);
  });

  it("Radiant Lotus : sacrifiez un ou plusieurs artefacts, trois mana par artefact", () => {
    let s = scenario({ p1: { battlefield: ["Radiant Lotus", "Nutrient Block", "Scrap Compactor"] } });
    const lotus = idOf(s, "p1", "battlefield", "Radiant Lotus");
    s = act(s, "p1", { type: "activate", source: lotus, ability: 0, x: 2 });
    // Le déclencheur de Nutrient Block (sacrifié) se résout d'abord.
    for (let i = 0; i < 6 && s.stack.length > 0; i++) {
      s = s.pending?.kind === "choice" ? act(s, "p1", { type: "choose", values: ["R"] }) : passBoth(s);
    }
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["R"] });
    expect(s.players.p1?.manaPool.R).toBe(6);
    expect(idsOf(s, "p1", "battlefield", "Radiant Lotus")).toHaveLength(1);
  });

  it("Ketramose : un seul déclenchement pour plusieurs cartes exilées en même temps", () => {
    let s = scenario({
      p1: { battlefield: ["Ketramose, the New Dawn", "Dauntless Scrapbot"], library: lands("Plains", 10) },
      p2: { graveyard: ["Opt", "Opt", "Opt"] },
    });
    const bot = idOf(s, "p1", "battlefield", "Dauntless Scrapbot");
    const ab = chars(s, bot).abilities.findIndex((a) => a.kind === "triggered");
    expect(ab).toBeGreaterThanOrEqual(0);
    // Le déclencheur d'arrivée du Scrapbot exile les trois cartes du cimetière adverse en même temps.
    moveObject(s, bot, "hand");
    const scrap = idOf(s, "p1", "hand", "Dauntless Scrapbot");
    s.players.p1!.hand = [scrap];
    moveObject(s, scrap, "battlefield");
    const hand = s.players.p1?.hand.length ?? 0;
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.graveyard).toHaveLength(0);
    // Un seul « piochez, perdez 1 PV » (plus les pioches éventuelles d'autres effets : aucun ici).
    expect(s.players.p1?.life).toBe(19);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(1);
  });

  it("The Aetherspark : attaché, il ne peut pas être attaqué", () => {
    let s = scenario({
      p1: { battlefield: ["The Aetherspark", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
      active: "p1",
    });
    const spark = idOf(s, "p1", "battlefield", "The Aetherspark");
    s.objects[spark]!.counters.loyalty = 4;
    const plus = chars(s, spark).abilities.findIndex((a) => a.kind === "activated" && a.label?.includes("Attachez"));
    s = act(s, "p1", {
      type: "activate",
      source: spark,
      ability: plus,
      targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = passBoth(s);
    expect(s.objects[spark]?.attachedTo).toBe(idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Aetherdrift : cartes des decks du méta (PLAN-C, lot C13)", () => {
  /** Répond « oui » aux questions et choisit les objets voulus. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));

  it("Riverpyre Verge : {R} toujours, {U} seulement avec une Île ou une Montagne", () => {
    const s = scenario({ p1: { battlefield: ["Riverpyre Verge", "Forest"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Riverpyre Verge"))).toEqual(["R"]);
    const t = scenario({ p1: { battlefield: ["Riverpyre Verge", "Island"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Riverpyre Verge"))).toEqual(["R", "U"]);
  });

  it("Bleachbone Verge : {B} toujours, {W} seulement avec une Plaine ou un Marais", () => {
    const s = scenario({ p1: { battlefield: ["Bleachbone Verge", "Island"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Bleachbone Verge"))).toEqual(["B"]);
    const t = scenario({ p1: { battlefield: ["Bleachbone Verge", "Swamp"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Bleachbone Verge"))).toEqual(["B", "W"]);
  });

  describe("Spell Pierce", () => {
    /** p1 lance Lightning Strike sur p2 ; p2 répond avec Spell Pierce. */
    const setup = (extra: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + extra), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island"], hand: ["Spell Pierce"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      return cast(s, "p2", "Spell Pierce", { targets: { t: [s.stack[0]?.id as string] } });
    };

    it("contrecarre le sort non-créature si son contrôleur ne paie pas {2}", () => {
      const s = settle(setup(0));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });

    it("le contrôleur paie {2} : le sort se résout", () => {
      const s = settle(setup(2), (req) => (req.intent === "unlessPay" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });

    it("ne cible pas un sort de créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        p2: { battlefield: ["Island"], hand: ["Spell Pierce"] },
      });
      s = cast(s, "p1", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    });
  });

  it("Greasewrench Goblin : exhaust — défaussez jusqu'à deux cartes, piochez autant, marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Greasewrench Goblin", ...lands("Mountain", 3)], hand: ["Opt", "Island"], library: lands("Plains", 5) },
    });
    const goblin = idOf(s, "p1", "battlefield", "Greasewrench Goblin");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", goblin, "Exhaust"), choosing(hand));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Opt", "Island"]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains", "Plains"]);
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", goblin)).toBe(false);
  });

  it("Perilous Snare : exile un permanent non-terrain adverse jusqu'à son départ ; vitesse max : marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Perilous Snare"] },
      p2: { battlefield: ["Serra Angel", "Island"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Perilous Snare"), choosing([angel]));
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    expect(s.players.p1?.speed).toBe(1);
    const snare = idOf(s, "p1", "battlefield", "Perilous Snare");
    destroy(s, snare);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Perilous Snare", "Bear Cub"] } });
    const trap = idOf(t, "p1", "battlefield", "Perilous Snare");
    expect(canActivate(t, "p1", trap)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(activate(t, "p1", trap, "Vitesse max", { targets: { t: [cub] } }));
    expect(t.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Bloodghast : ne bloque pas, célérité si un adversaire a 10 PV ou moins, revient du cimetière (atterrissage)", () => {
    const s = scenario({ p1: { battlefield: ["Bloodghast"] } });
    const ghast = idOf(s, "p1", "battlefield", "Bloodghast");
    expect(chars(s, ghast).keywords).toContain("cantBlock");
    expect(chars(s, ghast).keywords).not.toContain("haste");
    const low = scenario({ p1: { battlefield: ["Bloodghast"] }, p2: { life: 10 } });
    expect(chars(low, idOf(low, "p1", "battlefield", "Bloodghast")).keywords).toContain("haste");

    let t = scenario({ p1: { graveyard: ["Bloodghast"], hand: ["Swamp"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Swamp") });
    t = settle(t, choosing());
    expect(idsOf(t, "p1", "battlefield", "Bloodghast")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Bloodghast")).toHaveLength(0);
  });

  it("Oildeep Gearhulk : le joueur ciblé défausse la carte choisie, puis pioche", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Oildeep Gearhulk"] },
      p2: { hand: ["Shivan Dragon", "Opt"], library: lands("Mountain", 5) },
    });
    const dragon = idOf(s, "p2", "hand", "Shivan Dragon");
    s = settle(cast(s, "p1", "Oildeep Gearhulk"), choosing(["p2", dragon]));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Mountain", "Opt"]);
    const hulk = idOf(s, "p1", "battlefield", "Oildeep Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["lifelink", "ward"]));
  });

  it("Repurposing Bay : un artefact de valeur de mana égale à 1 plus celle de l'artefact sacrifié", () => {
    const gadget = (name: string, mv: number) =>
      customCard({
        name,
        typeLine: "Artifact",
        types: ["Artifact"],
        manaCost: { generic: mv, colored: {}, x: 0 },
        manaCostText: `{${mv}}`,
      });
    let s = scenario({
      p1: {
        battlefield: ["Repurposing Bay", gadget("Rouage", 1), ...lands("Island", 2)],
        library: [gadget("Engrenage", 3), gadget("Ressort", 2), "Island"],
      },
    });
    const bay = idOf(s, "p1", "battlefield", "Repurposing Bay");
    let offered: (string | undefined)[] = [];
    s = settle(activate(s, "p1", bay, "VM"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Ressort"]);
    expect(idsOf(s, "p1", "battlefield", "Ressort")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rouage")).toHaveLength(1);
  });

  it("Chandra, Spark Hunter : 0 crée un Véhicule 3/2 ; au début du combat il devient une créature avec la célérité", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Spark Hunter"] } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Spark Hunter");
    s = settle(activate(s, "p1", chandra, "0 :"));
    const vehicle = idOf(s, "p1", "battlefield", "Vehicle");
    expect(chars(s, vehicle).types).not.toContain("Creature");
    expect([chars(s, vehicle).power, chars(s, vehicle).toughness]).toEqual([3, 2]);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    s = settle(s, choosing([vehicle]));
    expect(chars(s, vehicle).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, vehicle).keywords).toContain("haste");
  });

  it("Chandra, Spark Hunter : +2 — défaussez une carte, puis piochez", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Spark Hunter"], hand: ["Opt"], library: lands("Mountain", 5) } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Spark Hunter");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(activate(s, "p1", chandra, "+2"), choosing([opt]));
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);
    expect(s.objects[chandra]?.counters.loyalty).toBe(6);
  });

  it("Monument to Endurance : à chaque défausse, un mode pas encore choisi ce tour-ci", () => {
    let s = scenario({
      p1: {
        battlefield: ["Monument to Endurance", ...lands("Swamp", 6)],
        hand: ["Intimidation Tactics", "Intimidation Tactics"],
        library: lands("Plains", 5),
      },
    });
    const modesSeen: string[][] = [];
    const cycle = (cur: S, pickLabel: string) => {
      const card = idsOf(cur, "p1", "hand", "Intimidation Tactics")[0] as string;
      return settle(activate(cur, "p1", card, "Cycle"), (req) => {
        if (req.type !== "pick" || !req.labels) return undefined;
        modesSeen.push(req.options.map((o) => req.labels?.[o] ?? String(o)));
        const want = req.options.find((o) => req.labels?.[o]?.includes(pickLabel));
        return want === undefined ? undefined : [want];
      });
    };
    s = cycle(s, "perd 3 PV");
    expect(s.players.p2?.life).toBe(17);
    s = cycle(s, "Trésor");
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(modesSeen[1]?.some((l) => l.includes("perd 3 PV"))).toBe(false);
  });

  it("Intimidation Tactics : exile une carte d'artefact ou de créature de la main de l'adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Intimidation Tactics"] },
      p2: { hand: ["Shivan Dragon", "Opt", "Forest"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Intimidation Tactics", { targets: { t: ["p2"] } }), (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Shivan Dragon"]);
    expect(namesIn(s, s.exile)).toContain("Shivan Dragon");
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Bounce Off : renvoie une créature (ou un Véhicule) dans la main de son propriétaire", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Bounce Off"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toContain(hull);
    s = settle(cast(s, "p1", "Bounce Off", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
  });

  it("Broadside Barrage : 5 blessures à une créature, puis piochez et défaussez", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Mountain", "Mountain"], hand: ["Broadside Barrage", "Opt"], library: lands("Plains", 5) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(
      cast(s, "p1", "Broadside Barrage", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
      choosing([opt]),
    );
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Lumbering Worldwagon : force égale au nombre de terrains ; en arrivant, un terrain de base engagé", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Lumbering Worldwagon"], library: ["Opt", "Plains"] } });
    s = settle(cast(s, "p1", "Lumbering Worldwagon"), choosing());
    const plains = idOf(s, "p1", "battlefield", "Plains");
    expect(s.objects[plains]?.tapped).toBe(true);
    const wagon = idOf(s, "p1", "battlefield", "Lumbering Worldwagon");
    expect(chars(s, wagon).power).toBe(4);
  });
});

describe("Aetherdrift, lot K8 : mythiques", () => {
  /** L'option « activer » de `source` dont le libellé contient `label`. */
  const option = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    return a?.type === "activate" ? a : undefined;
  };
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = option(s, player, source, label);
    if (!a) throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  it("Brightglass Gearhulk : jusqu'à deux cartes d'artefact, de créature ou d'enchantement de VM 1 ou moins", () => {
    const relic = customCard({ name: "Relique", typeLine: "Artifact", types: ["Artifact"] });
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
          hand: ["Brightglass Gearhulk"],
          library: ["Llanowar Elves", relic, "Opt", "Bear Cub", "Island", "Llanowar Elves"],
        },
      });
    let offered: (string | undefined)[] = [];
    const s = settle(cast(setup(), "p1", "Brightglass Gearhulk"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return req.options.slice(0, 2);
    });
    // Ni éphémère (Opt), ni VM 2 (Bear Cub), ni terrain.
    expect([...new Set(offered)].sort()).toEqual(["Llanowar Elves", "Relique"]);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.library).toHaveLength(4);
    const hulk = idOf(s, "p1", "battlefield", "Brightglass Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample"]));
    // « Vous pouvez » : refuser ne cherche rien.
    const no = settle(cast(setup(), "p1", "Brightglass Gearhulk"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(no.players.p1?.hand).toHaveLength(0);
    expect(no.players.p1?.library).toHaveLength(6);
  });

  it("Coalstoke Gearhulk : une créature de VM 4 ou moins d'un cimetière, sous votre contrôle avec un marqueur de finalité, menace, contact mortel et célérité, exilée à votre étape de fin", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 2), ...lands("Mountain", 3)],
        hand: ["Coalstoke Gearhulk"],
        graveyard: ["Llanowar Elves"],
      },
      p2: { graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Coalstoke Gearhulk"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return req.options.filter((o) => namesIn(cur, [String(o)])[0] === "Bear Cub");
    });
    // N'importe quel cimetière, mais pas la créature de VM 6.
    expect([...offered].sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[cub]?.counters.finality).toBe(1);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["menace", "deathtouch", "haste"]));
    const hulk = idOf(s, "p1", "battlefield", "Coalstoke Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["menace", "deathtouch"]));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
  });

  it("Hazoret, Godseeker : n'attaque ni ne bloque sans vitesse maximale ; {1}, {T} : une créature de force 2 ou moins ne peut pas être bloquée", () => {
    let s = scenario({ p1: { battlefield: ["Hazoret, Godseeker", "Bear Cub", "Serra Angel", "Mountain"] } });
    const hazoret = idOf(s, "p1", "battlefield", "Hazoret, Godseeker");
    expect(s.players.p1?.speed).toBe(1);
    expect(chars(s, hazoret).keywords).toEqual(expect.arrayContaining(["indestructible", "haste", "cantAttack", "cantBlock"]));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const legal = option(s, "p1", hazoret, "Imblocable")?.targets[0]?.legal ?? [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(angel);
    s = settle(activate(s, "p1", hazoret, "Imblocable", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("unblockable");
    expect(s.objects[hazoret]?.tapped).toBe(true);
    const max = scenario({ p1: { battlefield: ["Hazoret, Godseeker"] } });
    max.players.p1!.speed = 4;
    max.version += 1;
    expect(chars(max, idOf(max, "p1", "battlefield", "Hazoret, Godseeker")).keywords).not.toContain("cantAttack");
  });

  it("Loot, the Pathfinder : trois capacités d'exhaust ({U} : piochez trois cartes, {R} : 3 blessures), chacune une seule fois", () => {
    let s = scenario({ p1: { battlefield: ["Loot, the Pathfinder", ...lands("Island", 2), "Mountain"] } });
    const loot = idOf(s, "p1", "battlefield", "Loot, the Pathfinder");
    expect(chars(s, loot).keywords).toEqual(expect.arrayContaining(["doubleStrike", "vigilance", "haste"]));
    s = settle(activate(s, "p1", loot, "piochez trois"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.objects[loot]?.tapped).toBe(true);
    s.objects[loot]!.tapped = false;
    s.version += 1;
    expect(option(s, "p1", loot, "piochez trois")).toBeUndefined();
    s = settle(activate(s, "p1", loot, "3 blessures", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Loot, the Pathfinder : exhaust — {G}, {T} : trois mana d'une même couleur", () => {
    let s = scenario({ p1: { battlefield: ["Loot, the Pathfinder", "Forest"] } });
    const loot = idOf(s, "p1", "battlefield", "Loot, the Pathfinder");
    s = settle(activate(s, "p1", loot, "trois mana"), (req) => (req.type === "pick" ? ["R"] : undefined));
    expect(s.players.p1?.manaPool.R).toBe(3);
  });

  it("March of the World Ooze : vos créatures ont une F/E de base 6/6 et sont des Limons ; Éléphant 3/3 quand un adversaire lance un sort hors de son tour", () => {
    let s = scenario({
      p1: { battlefield: ["March of the World Ooze", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      p2: { battlefield: ["Bear Cub", "Island", "Island"], hand: ["Opt", "Opt"] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, mine)).toEqual([7, 7]);
    expect(chars(s, mine).subtypes).toEqual(expect.arrayContaining(["Bear", "Ooze"]));
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Opt"));
    const elephants = idsOf(s, "p1", "battlefield", "Elephant");
    expect(elephants).toHaveLength(1);
    expect(pt(s, elephants[0] as string)).toEqual([6, 6]);
    // Pendant son propre tour, l'adversaire ne déclenche rien.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["March of the World Ooze"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    t = settle(cast(t, "p2", "Opt"));
    expect(idsOf(t, "p1", "battlefield", "Elephant")).toHaveLength(0);
  });

  it("Mimeoplasm, Revered One : exile jusqu'à X cartes de créature de votre cimetière, trois marqueurs par carte ; {2} : copie d'une carte exilée avec elle, 0/0 et garde cette capacité", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 2), ...lands("Island", 4)],
        hand: ["Mimeoplasm, Revered One"],
        graveyard: ["Serra Angel", "Bear Cub", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Mimeoplasm, Revered One", { x: 2 }), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return [angel, dragon];
    });
    expect([...offered].sort()).toEqual(["Bear Cub", "Serra Angel", "Shivan Dragon"]);
    const mimeo = idOf(s, "p1", "battlefield", "Mimeoplasm, Revered One");
    expect(s.objects[mimeo]?.counters["+1/+1"]).toBe(6);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    const exAngel = exiled(s, "Serra Angel")[0] as string;
    const exDragon = exiled(s, "Shivan Dragon")[0] as string;
    expect(option(s, "p1", mimeo, "copie")?.targets[0]?.legal.sort()).toEqual([exAngel, exDragon].sort());
    s = settle(activate(s, "p1", mimeo, "copie", { targets: { t: [exAngel] } }));
    const c = chars(s, mimeo);
    expect(c.name).toBe("Serra Angel");
    expect([c.power, c.toughness]).toEqual([6, 6]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    // La copie garde la capacité : elle peut devenir le Dragon.
    expect(option(s, "p1", mimeo, "copie")?.targets[0]?.legal).toContain(exDragon);
  });

  it("Mu Yanling, Wind Rider : Véhicule 3/2 incolore avec équipage 1 ; vos Véhicules volent", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Mu Yanling, Wind Rider"] },
      p2: { battlefield: ["Salvation Engine"] },
    });
    s = settle(cast(s, "p1", "Mu Yanling, Wind Rider"));
    const v = idOf(s, "p1", "battlefield", "Vehicle");
    const c = chars(s, v);
    expect([c.power, c.toughness, c.colors]).toEqual([3, 2, []]);
    expect(c.subtypes).toContain("Vehicle");
    expect(c.types).not.toContain("Creature");
    expect(c.keywords).toContain("flying");
    expect(c.abilities.some((a) => a.kind === "activated" && a.label?.includes("Équipage 1"))).toBe(true);
    // Un Véhicule adverse ne vole pas.
    expect(chars(s, idOf(s, "p2", "battlefield", "Salvation Engine")).keywords).not.toContain("flying");
  });

  it("Mu Yanling, Wind Rider : une seule pioche quand plusieurs créatures volantes blessent un joueur ; rien pour une créature sans vol", () => {
    let s = scenario({
      p1: { battlefield: ["Mu Yanling, Wind Rider", "Serra Angel", "Serra Angel", "Bear Cub"], library: lands("Plains", 5) },
    });
    const angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    s = attack(s, [...angels]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(12);
    expect(s.players.p1?.hand).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Mu Yanling, Wind Rider", "Bear Cub"] } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(18);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Pyrewood Gearhulk : les autres créatures que vous contrôlez gagnent +2/+2, vigilance et menace jusqu'à la fin du tour ; les blessures ne peuvent pas être prévenues ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), ...lands("Forest", 3), "Bear Cub"], hand: ["Pyrewood Gearhulk"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Pyrewood Gearhulk"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const hulk = idOf(s, "p1", "battlefield", "Pyrewood Gearhulk");
    expect(pt(s, cub)).toEqual([4, 4]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["vigilance", "menace"]));
    expect(pt(s, hulk)).toEqual([7, 7]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
    expect(chars(s, cub).keywords).not.toContain("menace");
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(false);
  });

  it("Riptide Gearhulk : jusqu'à un permanent non-terrain par adversaire, mis en troisième position depuis le dessus de la bibliothèque de son propriétaire", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Plains", 2), ...lands("Island", 3), "Bear Cub"], hand: ["Riptide Gearhulk"] },
      p2: { battlefield: ["Serra Angel", "Island"], library: lands("Forest", 4) },
      p3: { battlefield: ["Llanowar Elves"], library: lands("Plains", 4) },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elf = idOf(s, "p3", "battlefield", "Llanowar Elves");
    const offered: string[][] = [];
    s = settle(cast(s, "p1", "Riptide Gearhulk"), (req) => {
      if (req.type !== "pick") return undefined;
      offered.push(req.options.map(String));
      return req.options.filter((o) => o === angel || o === elf);
    });
    const all = offered.flat();
    expect(all).not.toContain(idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(all).not.toContain(idOf(s, "p2", "battlefield", "Island"));
    expect(namesIn(s, s.players.p2?.library?.slice(0, 3))).toEqual(["Forest", "Forest", "Serra Angel"]);
    expect(namesIn(s, s.players.p3?.library?.slice(0, 3))).toEqual(["Plains", "Plains", "Llanowar Elves"]);
    const hulk = idOf(s, "p1", "battlefield", "Riptide Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
  });

  it("Riptide Gearhulk : prouesse, +1/+1 quand vous lancez un sort non-créature", () => {
    let s = scenario({ p1: { battlefield: ["Riptide Gearhulk", "Island"], hand: ["Opt"] } });
    const hulk = idOf(s, "p1", "battlefield", "Riptide Gearhulk");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, hulk)).toEqual([3, 6]);
  });

  it("Sab-Sunen, Luxa Embodied : marqueur au début de votre première phase principale, deux cartes si le nombre est impair ; n'attaque que avec un nombre pair", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Sab-Sunen, Luxa Embodied"], library: lands("Island", 10) },
    });
    const sab = idOf(s, "p1", "battlefield", "Sab-Sunen, Luxa Embodied");
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    s = advanceUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
    );
    s = settle(s);
    expect(s.objects[sab]?.counters["+1/+1"]).toBe(1);
    // Une carte à l'étape de pioche, deux de Sab-Sunen.
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(chars(s, sab).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    s = settle(s);
    expect(s.objects[sab]?.counters["+1/+1"]).toBe(2);
    // Nombre pair : pas de pioche supplémentaire (une seule carte de l'étape de pioche).
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    expect(chars(s, sab).keywords).toEqual(expect.arrayContaining(["reach", "trample", "indestructible"]));
  });

  it("Salvation Engine : les autres créatures-artefacts que vous contrôlez ont +2/+2 ; en attaquant, renvoie jusqu'à une carte d'artefact de votre cimetière", () => {
    const relic = customCard({ name: "Relique", typeLine: "Artifact", types: ["Artifact"] });
    const s = scenario({
      p1: { battlefield: ["Salvation Engine", "Walking Sarcophagus", "Bear Cub"] },
      p2: { battlefield: ["Walking Sarcophagus"] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Walking Sarcophagus"))).toEqual([4, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Walking Sarcophagus"))).toEqual([2, 1]);
    let t = scenario({
      p1: { battlefield: ["Salvation Engine", "Serra Angel", "Bear Cub"], graveyard: [relic, "Opt"] },
    });
    const engine = idOf(t, "p1", "battlefield", "Salvation Engine");
    t = settle(activate(t, "p1", engine, "Équipage 6"));
    expect(chars(t, engine).types).toContain("Creature");
    t = attack(t, [engine]);
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Relique")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("The Last Ride : 13/13 moins vos PV ; {2}{B}, payez 2 PV : piochez une carte (impossible avec moins de 2 PV)", () => {
    let s = scenario({ p1: { life: 5, battlefield: ["The Last Ride", ...lands("Swamp", 3)] } });
    const ride = idOf(s, "p1", "battlefield", "The Last Ride");
    expect(pt(s, ride)).toEqual([8, 8]);
    s = settle(activate(s, "p1", ride, "Piochez"));
    expect(s.players.p1?.life).toBe(3);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(pt(s, ride)).toEqual([10, 10]);
    const low = scenario({ p1: { life: 1, battlefield: ["The Last Ride", ...lands("Swamp", 3)] } });
    // Aucune créature pour l'équipage : seule la pioche pourrait s'activer, mais 1 PV ne paie pas 2 PV.
    expect(canActivate(low, "p1", idOf(low, "p1", "battlefield", "The Last Ride"))).toBe(false);
  });

  it("The Speed Demon : à votre étape de fin, piochez X cartes et perdez X PV (X = votre vitesse) ; rien à l'étape de fin adverse", () => {
    let s = scenario({ p1: { battlefield: ["The Speed Demon"], library: lands("Swamp", 10) } });
    s.players.p1!.speed = 3;
    s.version += 1;
    const demon = idOf(s, "p1", "battlefield", "The Speed Demon");
    expect(chars(s, demon).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.turn.active === "p1",
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.life).toBe(17);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    expect(s.players.p1?.life).toBe(17);
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Thunderous Velocipede : vos autres créatures et Véhicules arrivent avec un marqueur +1/+1 (VM 4 ou moins) ou trois (VM 5 ou plus)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Thunderous Velocipede", ...lands("Plains", 5), ...lands("Island", 5), ...lands("Forest", 2)],
        hand: ["Bear Cub", "Serra Angel", "Hulldrifter"],
      },
      p2: { battlefield: [...lands("Forest", 2)], hand: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    s = settle(cast(s, "p1", "Serra Angel"));
    s = settle(cast(s, "p1", "Hulldrifter"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[idOf(s, "p1", "battlefield", "Thunderous Velocipede")]?.counters["+1/+1"] ?? 0).toBe(0);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Thunderous Velocipede"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(t.objects[idOf(t, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Aetherdrift, lot K8 : rares (1)", () => {
  /** Répond « oui » aux questions et choisit les objets voulus. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Active la capacité de `source` dont le libellé commence par `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const artifact = (name: string, mv: number): CardDef =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });
  const creature = (name: string, subtypes: string[], power = 1, toughness = 1): CardDef =>
    customCard({ name, typeLine: `Creature — ${subtypes.join(" ")}`, subtypes, power, toughness });
  /** Monte la Monture `mount` (Monture N) avec les autres créatures disponibles. */
  const saddle = (s: S, mount: string) => settle(activate(s, "p1", mount, "Monture"));
  /** Équipage 2 : une créature de force 1 ne suffit pas, une de force 2 anime le Véhicule. */
  const expectCrew2 = (vehicle: string) => {
    const weak = scenario({ p1: { battlefield: [vehicle, "Llanowar Elves"] } });
    const w = idOf(weak, "p1", "battlefield", vehicle);
    const crew = abilityIndex(weak, w, "Équipage");
    expect(crew).toBeGreaterThanOrEqual(0);
    expect(legalActions(weak, "p1").some((a) => a.type === "activate" && a.source === w && a.ability === crew)).toBe(false);
    let s = scenario({ p1: { battlefield: [vehicle, "Bear Cub"] } });
    const v = idOf(s, "p1", "battlefield", vehicle);
    expect(chars(s, v).types).not.toContain("Creature");
    s = settle(activate(s, "p1", v, "Équipage"));
    expect(chars(s, v).types).toContain("Creature");
  };

  it("Aatchik : en arrivant, un Insecte 1/1 vert par carte d'artefact ou de créature de votre cimetière seulement", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)],
        hand: ["Aatchik, Emerald Radian"],
        graveyard: ["Bear Cub", artifact("Rouage", 1), "Opt", "Forest"],
      },
      p2: { graveyard: ["Serra Angel", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Aatchik, Emerald Radian"));
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(2);
    const c = chars(s, insects[0] as string);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([1, 1, ["G"], ["Insect"]]);
  });

  it("Aatchik : quand un autre Insecte que vous contrôlez meurt, marqueur +1/+1 et chaque adversaire perd 1 PV (ni un non-Insecte, ni un Insecte adverse)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Aatchik, Emerald Radian", creature("Scarabée", ["Insect"]), "Bear Cub"] },
      p2: { battlefield: [creature("Cafard", ["Insect"])] },
    });
    const aatchik = idOf(s, "p1", "battlefield", "Aatchik, Emerald Radian");
    destroy(s, idOf(s, "p1", "battlefield", "Scarabée"));
    s = settle(s);
    expect(s.objects[aatchik]?.counters["+1/+1"]).toBe(1);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    destroy(s, idOf(s, "p2", "battlefield", "Cafard"));
    s = settle(s);
    expect(s.objects[aatchik]?.counters["+1/+1"]).toBe(1);
    expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
  });

  it("Afterburner Expert : exhaust {2}{G}{G}, deux marqueurs +1/+1, une seule fois", () => {
    let s = scenario({ p1: { battlefield: ["Afterburner Expert", ...lands("Forest", 8)] } });
    const expert = idOf(s, "p1", "battlefield", "Afterburner Expert");
    s = settle(activate(s, "p1", expert, "Exhaust"));
    expect(s.objects[expert]?.counters["+1/+1"]).toBe(2);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(4);
    expect(canActivate(s, "p1", expert)).toBe(false);
  });

  it("Afterburner Expert : revient de votre cimetière quand vous activez une capacité d'exhaust ; celui de l'adversaire reste au cimetière", () => {
    let s = scenario({
      p1: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)], graveyard: ["Afterburner Expert"] },
      p2: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)], graveyard: ["Afterburner Expert"] },
    });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    expect(idsOf(s, "p1", "battlefield", "Afterburner Expert")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Afterburner Expert")).toHaveLength(1);
  });

  it("Agonasaur Rex : piétinement ; cycle {2}{G} — piochez, puis deux marqueurs +1/+1, piétinement et indestructible sur jusqu'à une créature ou un Véhicule", () => {
    let s = scenario({
      p1: { battlefield: ["Debris Beetle", ...lands("Forest", 3)], hand: ["Agonasaur Rex"], library: lands("Plains", 3) },
    });
    const rex = idOf(s, "p1", "hand", "Agonasaur Rex");
    expect(chars(s, rex).keywords).toContain("trample");
    const beetle = idOf(s, "p1", "battlefield", "Debris Beetle");
    s = settle(activate(s, "p1", rex, "Cycle"), choosing([beetle]));
    expect(idsOf(s, "p1", "graveyard", "Agonasaur Rex")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    // Le Véhicule (non animé) reçoit les marqueurs et les capacités.
    expect(s.objects[beetle]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, beetle).keywords).toEqual(expect.arrayContaining(["trample", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, beetle).keywords).not.toContain("indestructible");
  });

  it("Boommobile : en arrivant, quatre mana d'une couleur qui ne paient que des capacités ; exhaust — X blessures à n'importe quelle cible et un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Boommobile", "Shock"] } });
    s = settle(cast(s, "p1", "Boommobile"), (req) => (req.type === "pick" && req.options.includes("R") ? ["R"] : undefined));
    const boom = idOf(s, "p1", "battlefield", "Boommobile");
    // Plus aucun terrain dégagé : le mana de la Boommobile ne paie pas un sort.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    const ex = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === boom && a.label?.includes("blessures"));
    expect(ex?.type === "activate" && ex.xMax).toBe(1);
    s = settle(activate(s, "p1", boom, "Exhaust", { x: 1, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(19);
    expect(s.objects[boom]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", boom)).toBe(false);
    expectCrew2("Boommobile");
  });

  it("Bulwark Ox : quand elle attaque en étant montée, un marqueur +1/+1 sur une créature ciblée ; rien si elle n'est pas montée", () => {
    let s = scenario({ p1: { battlefield: ["Bulwark Ox", "Bear Cub"] } });
    const ox = idOf(s, "p1", "battlefield", "Bulwark Ox");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = saddle(s, ox);
    s = settleNoBlocks(attack(s, [ox]), choosing([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    let t = scenario({ p1: { battlefield: ["Bulwark Ox", "Bear Cub"] } });
    const ox2 = idOf(t, "p1", "battlefield", "Bulwark Ox");
    t = settleNoBlocks(attack(t, [ox2]));
    expect(t.battlefield.some((id) => (t.objects[id]?.counters["+1/+1"] ?? 0) > 0)).toBe(false);
  });

  it("Bulwark Ox : sacrifiez-la, vos créatures avec des marqueurs gagnent défense talismanique et indestructible jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Bulwark Ox", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
    });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Bulwark Ox"), "Vos créatures"));
    expect(idsOf(s, "p1", "graveyard", "Bulwark Ox")).toHaveLength(1);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("indestructible");
  });

  it("Burnout Bashtronaut : menace ; {2} : +1/+0 jusqu'à la fin du tour ; double initiative seulement à vitesse maximale", () => {
    let s = scenario({ p1: { battlefield: ["Burnout Bashtronaut", ...lands("Mountain", 2)] } });
    const bash = idOf(s, "p1", "battlefield", "Burnout Bashtronaut");
    expect(chars(s, bash).keywords).toContain("menace");
    expect(s.players.p1?.speed).toBe(1);
    s.players.p1!.speed = 3;
    s.version += 1;
    expect(chars(s, bash).keywords).not.toContain("doubleStrike");
    s = settle(activate(s, "p1", bash, "+1/+0"));
    expect([chars(s, bash).power, chars(s, bash).toughness]).toEqual([2, 1]);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(chars(s, bash).keywords).toContain("doubleStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bash).power).toBe(1);
  });

  it("Captain Howler : garde — {2} et 2 PV", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Captain Howler, Sea Scourge"] },
      p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
    });
    const howler = idOf(s, "p1", "battlefield", "Captain Howler, Sea Scourge");
    s = settle(cast(s, "p2", "Shock", { targets: { t: [howler] } }), (req) => (req.intent === "unlessPay" ? [1] : undefined));
    expect(s.players.p2?.life).toBe(18);
    expect(s.objects[howler]?.damage).toBe(2);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Captain Howler, Sea Scourge"] },
      p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
    });
    const h2 = idOf(t, "p1", "battlefield", "Captain Howler, Sea Scourge");
    t = settle(cast(t, "p2", "Shock", { targets: { t: [h2] } }), (req) => (req.intent === "unlessPay" ? [0] : undefined));
    expect(t.objects[h2]?.damage).toBe(0);
    expect(idsOf(t, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Captain Howler : défausser deux cartes donne +4/+0 à la créature ciblée, et vous piochez quand elle blesse un joueur au combat ce tour-ci", () => {
    let s = scenario({
      p1: {
        battlefield: ["Captain Howler, Sea Scourge", "Greasewrench Goblin", "Bear Cub", ...lands("Mountain", 3)],
        hand: ["Opt", "Island"],
        library: lands("Plains", 6),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Greasewrench Goblin"), "Exhaust"), choosing([...hand, cub]));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([6, 2]);
    const before = s.players.p1?.hand.length ?? 0;
    s = settleNoBlocks(attack(s, [cub]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.hand.length).toBe(before + 1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).power).toBe(2);
  });

  it("Caradora : en arrivant, vous pouvez chercher une carte de Monture ou de Véhicule", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
        hand: ["Caradora, Heart of Alacria"],
        library: ["Bear Cub", "Bulwark Ox", "Debris Beetle", "Forest"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Caradora, Heart of Alacria"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "search") {
        offered = namesIn(cur, req.options);
        return req.options.filter((o) => nameOf(cur, o) === "Debris Beetle");
      }
      return undefined;
    });
    expect(offered.sort()).toEqual(["Bulwark Ox", "Debris Beetle"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Debris Beetle"]);
    let t = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
        hand: ["Caradora, Heart of Alacria"],
        library: ["Bulwark Ox"],
      },
    });
    t = settle(cast(t, "p1", "Caradora, Heart of Alacria"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Caradora : un marqueur +1/+1 de plus sur vos créatures, pas sur celles de l'adversaire", () => {
    const s = scenario({
      p1: {
        battlefield: ["Caradora, Heart of Alacria", "Bear Cub", ...lands("Plains", 2)],
        hand: ["Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let cur = counterFrom(s, "p1", cub).s;
    expect(cur.objects[cub]?.counters["+1/+1"]).toBe(2);
    cur = counterFrom(cur, "p1", angel).s;
    expect(cur.objects[angel]?.counters["+1/+1"]).toBe(1);
  });

  it("Count on Luck : à votre entretien, exilez la carte du dessus ; elle est jouable ce tour-ci seulement", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Count on Luck"], library: ["Mountain", ...lands("Forest", 9)] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    expect(mountain).toBeDefined();
    expect(s.exile).toHaveLength(1);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // Pas à l'entretien de l'adversaire ; au tour suivant, la Montagne n'est plus jouable.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.exile).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.exile).toHaveLength(2);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  it("Cryptcaller Chariot : menace et équipage 2 ; défausser deux cartes crée deux Zombies 2/2 noirs engagés", () => {
    let s = scenario({
      p1: {
        battlefield: ["Cryptcaller Chariot", "Greasewrench Goblin", ...lands("Mountain", 3)],
        hand: ["Opt", "Island"],
        library: lands("Plains", 4),
      },
    });
    const chariot = idOf(s, "p1", "battlefield", "Cryptcaller Chariot");
    expect(chars(s, chariot).keywords).toContain("menace");
    expectCrew2("Cryptcaller Chariot");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Greasewrench Goblin"), "Exhaust"), choosing(hand));
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(2);
    const z = chars(s, zombies[0] as string);
    expect([z.power, z.toughness, z.colors]).toEqual([2, 2, ["B"]]);
    expect(zombies.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Cursecloth Wrappings : vos Zombies ont +1/+1, pas ceux de l'adversaire", () => {
    const s = scenario({
      p1: { battlefield: ["Cursecloth Wrappings", creature("Goule", ["Zombie"], 2, 2), "Bear Cub"] },
      p2: { battlefield: [creature("Mort-vivant", ["Zombie"], 2, 2)] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Goule")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
    expect(chars(s, idOf(s, "p2", "battlefield", "Mort-vivant")).power).toBe(2);
  });

  it("Cursecloth Wrappings : {T} — embaumement d'une carte de créature de votre cimetière : la carte est exilée, le jeton copie est un Zombie", () => {
    let s = scenario({
      p1: { battlefield: ["Cursecloth Wrappings", ...lands("Forest", 2)], graveyard: ["Bear Cub", "Opt"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const wraps = idOf(s, "p1", "battlefield", "Cursecloth Wrappings");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === wraps);
    expect(opt?.type === "activate" && namesIn(s, opt.targets[0]?.legal)).toEqual(["Bear Cub"]);
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    s = settle(activate(s, "p1", wraps, "Embaumement", { targets: { t: [cub] } }), choosing());
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Bear Cub");
    const token = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Bear", "Zombie"]));
    // 2/2, +1/+1 des Bandelettes (c'est un Zombie que vous contrôlez).
    expect(chars(s, token).power).toBe(3);
  });

  it("Daretti : force égale à la plus grande valeur de mana parmi vos artefacts", () => {
    const s = scenario({
      p1: { battlefield: ["Daretti, Rocketeer Engineer", artifact("Rouage", 1), artifact("Engrenage", 4)] },
      p2: { battlefield: [artifact("Colosse", 9)] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Daretti, Rocketeer Engineer")).power).toBe(4);
    const t = scenario({ p1: { battlefield: ["Daretti, Rocketeer Engineer"] } });
    expect(chars(t, idOf(t, "p1", "battlefield", "Daretti, Rocketeer Engineer")).power).toBe(0);
  });

  it("Daretti : en arrivant ou en attaquant, si vous sacrifiez un artefact, la carte d'artefact ciblée de votre cimetière revient", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), artifact("Rouage", 1)],
          hand: ["Daretti, Rocketeer Engineer"],
          graveyard: [artifact("Engrenage", 4)],
        },
      });
    let s = setup();
    const gear = idOf(s, "p1", "graveyard", "Engrenage");
    const cog = idOf(s, "p1", "battlefield", "Rouage");
    s = settle(cast(s, "p1", "Daretti, Rocketeer Engineer"), choosing([gear, cog]));
    expect(idsOf(s, "p1", "battlefield", "Engrenage")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rouage")).toHaveLength(1);
    // Sans sacrifice, rien ne revient.
    let t = setup();
    t = settle(cast(t, "p1", "Daretti, Rocketeer Engineer"), (req) =>
      req.type === "yesNo" ? [0] : req.type === "pick" && req.intent === "sacrifice" ? [] : undefined,
    );
    expect(idsOf(t, "p1", "battlefield", "Rouage")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Engrenage")).toHaveLength(1);
    // En attaquant.
    let u = scenario({
      p1: { battlefield: ["Daretti, Rocketeer Engineer", artifact("Rouage", 1)], graveyard: [artifact("Engrenage", 4)] },
    });
    const g2 = idOf(u, "p1", "graveyard", "Engrenage");
    const c2 = idOf(u, "p1", "battlefield", "Rouage");
    u = settleNoBlocks(attack(u, [idOf(u, "p1", "battlefield", "Daretti, Rocketeer Engineer")]), choosing([g2, c2]));
    expect(idsOf(u, "p1", "battlefield", "Engrenage")).toHaveLength(1);
  });

  it("Debris Beetle : piétinement, équipage 2 ; en arrivant, chaque adversaire perd 3 PV et vous en gagnez 3", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Debris Beetle"] },
    });
    s = settle(cast(s, "p1", "Debris Beetle"));
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 17, 17]);
    const beetle = idOf(s, "p1", "battlefield", "Debris Beetle");
    expect(chars(s, beetle).keywords).toContain("trample");
    expectCrew2("Debris Beetle");
  });

  it("Demonic Junker : affinité pour les artefacts", () => {
    const mk = (n: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Swamp", n), artifact("Rouage", 1), artifact("Engrenage", 1), artifact("Ressort", 1)],
          hand: ["Demonic Junker"],
        },
      });
    const ok = mk(4);
    expect(castable(ok, "p1", idOf(ok, "p1", "hand", "Demonic Junker"))).toBe(true);
    const short = mk(3);
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Demonic Junker"))).toBe(false);
  });

  it("Demonic Junker : détruit jusqu'à une créature par joueur ; deux marqueurs +1/+1 seulement si une de vos créatures est détruite", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 7), "Bear Cub"], hand: ["Demonic Junker"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Demonic Junker"), choosing([cub, angel]));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"]).toBe(2);
    let t = setup();
    t = settle(cast(t, "p1", "Demonic Junker"), choosing([idOf(t, "p2", "battlefield", "Serra Angel")]));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Demonic Junker : pas de marqueurs si votre créature ciblée n'est pas détruite (indestructible)", () => {
    const golem = customCard({
      name: "Golem",
      typeLine: "Creature — Golem",
      subtypes: ["Golem"],
      power: 2,
      toughness: 2,
      keywords: ["indestructible"],
    });
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 7), golem], hand: ["Demonic Junker"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const g = idOf(s, "p1", "battlefield", "Golem");
    s = settle(cast(s, "p1", "Demonic Junker"), choosing([g, idOf(s, "p2", "battlefield", "Serra Angel")]));
    expect(idsOf(s, "p1", "battlefield", "Golem")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("District Mascot : arrive avec un marqueur +1/+1 ; {1}{G} et deux marqueurs retirés : détruisez un artefact ciblé", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["District Mascot"] } });
    s = settle(cast(s, "p1", "District Mascot"));
    const mascot = idOf(s, "p1", "battlefield", "District Mascot");
    expect(s.objects[mascot]?.counters["+1/+1"]).toBe(1);
    expect([chars(s, mascot).power, chars(s, mascot).toughness]).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: [{ name: "District Mascot", counters: { "+1/+1": 2 } }, ...lands("Forest", 2)] },
      p2: { battlefield: [artifact("Rouage", 1), "Serra Angel"] },
    });
    const m2 = idOf(t, "p1", "battlefield", "District Mascot");
    const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === m2);
    expect(opt?.type === "activate" && namesIn(t, opt.targets[0]?.legal)).toEqual(["Rouage"]);
    t = settle(activate(t, "p1", m2, "Détruisez", { targets: { t: [idOf(t, "p2", "battlefield", "Rouage")] } }));
    expect(idsOf(t, "p2", "graveyard", "Rouage")).toHaveLength(1);
    // Plus de marqueurs : la Mascotte 0/0 meurt.
    expect(idsOf(t, "p1", "graveyard", "District Mascot")).toHaveLength(1);
    // Un seul marqueur : capacité indisponible.
    expect(canActivate(s, "p1", mascot)).toBe(false);
  });

  it("District Mascot : quand elle attaque en étant montée, un marqueur +1/+1 sur elle", () => {
    let s = scenario({ p1: { battlefield: [{ name: "District Mascot", counters: { "+1/+1": 1 } }, "Bear Cub"] } });
    const mascot = idOf(s, "p1", "battlefield", "District Mascot");
    s = saddle(s, mascot);
    s = settleNoBlocks(attack(s, [mascot]));
    expect(s.objects[mascot]?.counters["+1/+1"]).toBe(2);
  });
});

describe("Aetherdrift, lot K8 : rares (2)", () => {
  /** Active la capacité de `source` dont le libellé commence par `label`. */
  const activate = (s: S, source: string, label: string, extra: object = {}) =>
    act(s, "p1", { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  /** Répond « oui » aux questions et choisit les objets voulus. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      return picking(want)(req);
    };
  const handSize = (s: S) => s.players.p1?.hand.length ?? 0;

  it("Draconautics Engineer : exhaust {R} — célérité aux autres créatures et marqueur ; exhaust {3}{R} — Dinosaure Dragon 4/4 volant", () => {
    let s = scenario({
      p1: { battlefield: ["Draconautics Engineer", { name: "Bear Cub", sick: true }, ...lands("Mountain", 5)] },
      p2: { battlefield: [{ name: "Llanowar Elves", sick: true }] },
    });
    const eng = idOf(s, "p1", "battlefield", "Draconautics Engineer");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, eng, "Exhaust — célérité"));
    expect(chars(s, cub).keywords).toContain("haste");
    expect(chars(s, eng).keywords).not.toContain("haste");
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("haste");
    expect(s.objects[eng]?.counters["+1/+1"]).toBe(1);
    s = settle(activate(s, eng, "Exhaust — Dinosaure"));
    const token = idOf(s, "p1", "battlefield", "Dinosaur Dragon");
    expect(chars(s, token)).toMatchObject({ power: 4, toughness: 4, colors: ["R"] });
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Dinosaur", "Dragon"]));
    expect(chars(s, token).keywords).toContain("flying");
    // Chaque capacité d'exhaust ne s'active qu'une fois.
    expect(canActivate(s, "p1", eng)).toBe(false);
  });

  it("Explosive Getaway : exile jusqu'à un artefact ou une créature, revenu à l'étape de fin ; 4 blessures à chaque créature", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", ...lands("Mountain", 4), "Serra Angel", "Bear Cub"], hand: ["Explosive Getaway"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Explosive Getaway", { targets: { t: [angel] } }));
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.damage).toBe(4);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    s = advanceUntil(s, (x) => idsOf(x, "p1", "battlefield", "Serra Angel").length > 0, 100);
    expect(s.turn.step).toBe("end");
    expect(s.turn.active).toBe("p1");

    // « Jusqu'à une » : sans cible, seules les blessures.
    let t = scenario({
      p1: { battlefield: ["Plains", ...lands("Mountain", 4), "Serra Angel"], hand: ["Explosive Getaway"] },
    });
    t = settle(cast(t, "p1", "Explosive Getaway", { targets: { t: [] } }));
    expect(idsOf(t, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Far Fortune, End Boss : quand vous attaquez, 1 blessure à chaque adversaire", () => {
    let s = scenario({ p1: { battlefield: ["Far Fortune, End Boss", "Bear Cub"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(s.players.p2?.life).toBe(19);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(17);
    // Sans attaque, pas de blessure.
    let t = scenario({ p1: { battlefield: ["Far Fortune, End Boss", "Bear Cub"] } });
    t = throughCombat(advanceUntil(t, (x) => x.pending?.kind === "declareAttackers"));
    expect(t.players.p2?.life).toBe(20);
  });

  it("Far Fortune, End Boss : à vitesse max, vos sources infligent 1 blessure de plus aux adversaires et à leurs permanents", () => {
    const setup = (speed: number) => {
      const s = scenario({
        p1: {
          battlefield: ["Far Fortune, End Boss", "Bear Cub", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      return s;
    };
    let s = setup(4);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Vos propres permanents ne reçoivent pas de blessure supplémentaire.
    let own = setup(4);
    const cub = idOf(own, "p1", "battlefield", "Bear Cub");
    own.objects[cub]!.counters["+1/+1"] = 2;
    own.version += 1;
    own = settle(cast(own, "p1", "Lightning Strike", { targets: { t: [cub] } }));
    expect(own.objects[cub]?.damage).toBe(3);
    // Sous la vitesse max : 3 blessures seulement.
    let t = setup(3);
    t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(t.players.p2?.life).toBe(17);
  });

  it("Fearless Swashbuckler : vos Véhicules ont la célérité ; un Pirate et un Véhicule attaquent : piochez trois, défaussez deux", () => {
    let s = scenario({
      p1: {
        battlefield: ["Fearless Swashbuckler", { name: "Air Response Unit", sick: true }, "Bear Cub"],
        hand: ["Opt", "Island"],
        library: lands("Plains", 6),
      },
    });
    const ship = idOf(s, "p1", "battlefield", "Air Response Unit");
    const fish = idOf(s, "p1", "battlefield", "Fearless Swashbuckler");
    expect(chars(s, ship).keywords).toContain("haste");
    s = settle(activate(s, ship, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    s = attack(s, [fish, ship]);
    s = settleNoBlocks(s);
    expect(handSize(s)).toBe(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);

    // Le Pirate attaque seul : pas de pioche.
    let t = scenario({
      p1: { battlefield: ["Fearless Swashbuckler", "Air Response Unit"], hand: ["Opt"], library: lands("Plains", 6) },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Fearless Swashbuckler")]);
    t = settleNoBlocks(t);
    expect(handSize(t)).toBe(1);
  });

  it("Full Throttle : deux combats de plus ; au début de chaque combat, les créatures qui ont attaqué se dégagent", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 6), "Bear Cub", { name: "Llanowar Elves", tapped: true }],
        hand: ["Full Throttle"],
      },
    });
    s = settle(cast(s, "p1", "Full Throttle"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    // Les deux combats ajoutés suivent la phase principale, puis vient le combat normal : trois combats d'affilée.
    expect(s.turn.addedPhases).toEqual(["beginCombat", "beginCombat"]);
    for (let i = 0; i < 3; i++) {
      s = attack(s, [cub]);
      s = settleNoBlocks(s);
    }
    s = throughCombat(s);
    expect(s.turn.active).toBe("p1");
    expect(s.players.p2?.life).toBe(14);
    // Les Elfes n'ont pas attaqué : ils restent engagés.
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
  });

  it("Full Throttle : lancé en seconde phase principale, deux combats juste après elle, sans phase principale entre eux", () => {
    let s = scenario({
      step: "main2",
      p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Full Throttle"] },
    });
    s = settle(cast(s, "p1", "Full Throttle"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    // Le second combat ajouté suit le premier ; après lui, le tour passe directement à l'étape de fin.
    const first = stepTrail(s, (x) => x.pending?.kind === "declareAttackers");
    expect(first.steps).toEqual(["declareBlockers", "combatDamage", "endCombat", "beginCombat", "declareAttackers"]);
    const { s: end, steps } = stepTrail(attack(first.s, [cub]), (x) => x.turn.step === "end");
    expect(steps).toEqual(["declareBlockers", "combatDamage", "endCombat", "end"]);
    expect(end.players.p2?.life).toBe(16);
  });

  it("Gas Guzzler : arrive engagée ; à vitesse max, {B} et une autre créature ou un Véhicule sacrifié : piochez", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Gas Guzzler"] } });
    s = settle(cast(s, "p1", "Gas Guzzler"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Gas Guzzler")]?.tapped).toBe(true);

    let t = scenario({
      p1: { battlefield: ["Gas Guzzler", "Air Response Unit", "Swamp"], library: lands("Plains", 5) },
    });
    const guzzler = idOf(t, "p1", "battlefield", "Gas Guzzler");
    expect(canActivate(t, "p1", guzzler)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === guzzler);
    // Un Véhicule non-créature peut être sacrifié, mais pas la Guzzler elle-même.
    expect(opt?.type === "activate" && opt.additional?.sacrifice?.options).toEqual([
      idOf(t, "p1", "battlefield", "Air Response Unit"),
    ]);
    const hand = handSize(t);
    t = settle(activate(t, guzzler, "Vitesse max", { sacrifice: [idOf(t, "p1", "battlefield", "Air Response Unit")] }));
    expect(handSize(t)).toBe(hand + 1);
    expect(idsOf(t, "p1", "graveyard", "Air Response Unit")).toHaveLength(1);
  });

  it("Gastal Thrillroller : créature-artefact jusqu'à la fin du tour en arrivant ; revient du cimetière avec un marqueur de finalité", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Gastal Thrillroller"] } });
    s = settle(cast(s, "p1", "Gastal Thrillroller"));
    const car = idOf(s, "p1", "battlefield", "Gastal Thrillroller");
    expect(chars(s, car).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, car).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    s = attack(s, [car]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(16);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, car).types).not.toContain("Creature");

    // Depuis le cimetière : {2}{R} et défausser une carte (un coût : impossible main vide).
    const empty = scenario({ p1: { battlefield: lands("Mountain", 3), graveyard: ["Gastal Thrillroller"] } });
    expect(canActivate(empty, "p1", idOf(empty, "p1", "graveyard", "Gastal Thrillroller"))).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Mountain", 3), graveyard: ["Gastal Thrillroller"], hand: ["Opt"] } });
    const gy = idOf(t, "p1", "graveyard", "Gastal Thrillroller");
    t = settle(activate(t, gy, "Revenir", { discard: [idOf(t, "p1", "hand", "Opt")] }));
    const back = idOf(t, "p1", "battlefield", "Gastal Thrillroller");
    expect(t.objects[back]?.counters.finality).toBe(1);
    expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(chars(t, back).types).toContain("Creature");
  });

  it("Gonti, Night Minister : une créature blesse un adversaire, son contrôleur exile la carte du dessus et peut la jouer avec du mana de n'importe quel type ; un sort qu'on ne possède pas donne un Trésor", () => {
    let s = scenario({
      // Une Plaine seulement : le mana de n'importe quel type paie le {G} des Elfes.
      p1: { battlefield: ["Gonti, Night Minister", "Bear Cub", "Plains"] },
      p2: { library: ["Llanowar Elves", ...lands("Island", 5)] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(18);
    const elves = s.exile.find((id) => s.objects[id]?.owner === "p2") as string;
    expect(namesIn(s, [elves])).toEqual(["Llanowar Elves"]);
    expect(castable(s, "p1", elves)).toBe(true);
    // Jouable tant qu'elle reste en exil : encore au tour suivant.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(castable(s, "p1", elves)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: elves }));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Treasure")).toHaveLength(0);

    // Les blessures de combat infligées à vous (et non à un adversaire) ne déclenchent rien.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Gonti, Night Minister"], library: lands("Forest", 5) },
      p2: { battlefield: ["Bear Cub"] },
    });
    t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
    t = act(t, "p2", { type: "declareAttackers", attackers: [{ id: idOf(t, "p2", "battlefield", "Bear Cub"), defender: "p1" }] });
    t = settleNoBlocks(t);
    t = throughCombat(t);
    expect(t.players.p1?.life).toBe(18);
    expect(t.exile).toHaveLength(0);
  });

  it("Guardian Sunmare : montée, en attaquant elle cherche un permanent non-terrain de valeur de mana 3 ou moins", () => {
    const library = ["Shivan Dragon", "Forest", "Bear Cub", "Serra Angel", "Llanowar Elves"];
    let s = scenario({ p1: { battlefield: ["Guardian Sunmare", "Serra Angel"], library } });
    const mare = idOf(s, "p1", "battlefield", "Guardian Sunmare");
    expect(chars(s, mare).keywords).toContain("ward");
    s = settle(activate(s, mare, "Monture", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
    s = attack(s, [mare]);
    let offered: (string | undefined)[] = [];
    s = settleNoBlocks(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((o) => namesIn(cur, [o])[0] === "Bear Cub").slice(0, 1);
    });
    expect([...offered].sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);

    // Non montée : pas de recherche.
    let t = scenario({ p1: { battlefield: ["Guardian Sunmare"], library } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Guardian Sunmare")]);
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Howlsquad Heavy : vos autres Gobelins ont la célérité ; au début du combat, un Gobelin 1/1 qui doit attaquer", () => {
    let s = scenario({
      p1: {
        battlefield: ["Howlsquad Heavy", { name: "Swab Goblin", sick: true }, { name: "Bear Cub", sick: true }],
      },
    });
    const heavy = idOf(s, "p1", "battlefield", "Howlsquad Heavy");
    expect(chars(s, idOf(s, "p1", "battlefield", "Swab Goblin")).keywords).toContain("haste");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
    expect(chars(s, heavy).keywords).not.toContain("haste");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const goblin = idOf(s, "p1", "battlefield", "Goblin");
    expect(chars(s, goblin)).toMatchObject({ power: 1, toughness: 1, colors: ["R"] });
    expect(chars(s, goblin).keywords).toContain("haste");
    // Le jeton attaque s'il le peut : une déclaration sans lui est refusée.
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow();
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: goblin, defender: "p2" }] });
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(19);
  });

  it("Howlsquad Heavy : à vitesse max, {T} : {R} pour chaque Gobelin que vous contrôlez", () => {
    const s = scenario({ p1: { battlefield: ["Howlsquad Heavy", "Swab Goblin", "Bear Cub"] } });
    const heavy = idOf(s, "p1", "battlefield", "Howlsquad Heavy");
    const manaOpt = (x: S) => legalActions(x, "p1").find((a) => a.type === "tapForMana" && a.source === heavy);
    expect(manaOpt(s)).toBeUndefined();
    s.players.p1!.speed = 4;
    s.version += 1;
    const opt = manaOpt(s);
    if (opt?.type !== "tapForMana") throw new Error("capacité de mana absente");
    const t = act(s, "p1", { type: "tapForMana", source: heavy, ability: opt.ability });
    expect(t.players.p1?.manaPool.R).toBe(2);
  });

  it("Kolodin, Triumph Caster : vos Montures et Véhicules ont la célérité ; une Monture arrive montée, un Véhicule arrive créature", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kolodin, Triumph Caster", ...lands("Mountain", 2), ...lands("Plains", 2)],
        hand: ["Gilded Ghoda", "Spotcycle Scouter"],
      },
      p2: { battlefield: ["Hulldrifter"] },
    });
    s = settle(cast(s, "p1", "Gilded Ghoda"));
    s = settle(cast(s, "p1", "Spotcycle Scouter"));
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    const scouter = idOf(s, "p1", "battlefield", "Spotcycle Scouter");
    expect(chars(s, ghoda).keywords).toContain("haste");
    expect(chars(s, scouter).keywords).toContain("haste");
    expect(chars(s, scouter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(s.objects[ghoda]?.saddledTurn).toBe(s.turn.number);
    // Les Véhicules adverses n'ont pas la célérité.
    expect(chars(s, idOf(s, "p2", "battlefield", "Hulldrifter")).keywords).not.toContain("haste");
    // La Monture montée attaque tout de suite : Trésor.
    s = attack(s, [ghoda, scouter]);
    s = settleNoBlocks(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, scouter).types).not.toContain("Creature");
  });

  it("Lifecraft Engine : vos Véhicules créatures ont le type choisi ; vos créatures de ce type, sauf lui, ont +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), "Llanowar Elves", "Bear Cub", "Serra Angel", "Air Response Unit"],
        hand: ["Lifecraft Engine"],
      },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Lifecraft Engine"), (req) =>
      req.type === "pick" && req.options.includes("Elf") ? ["Elf"] : undefined,
    );
    const engine = idOf(s, "p1", "battlefield", "Lifecraft Engine");
    expect(s.objects[engine]?.chosen?.creatureType).toBe("Elf");
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 1, toughness: 1 });
    // Un Véhicule équipé devient un Elfe et reçoit +1/+1.
    const aru = idOf(s, "p1", "battlefield", "Air Response Unit");
    s = settle(activate(s, aru, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(chars(s, aru).subtypes).toContain("Elf");
    expect(chars(s, aru)).toMatchObject({ power: 4, toughness: 4 });
    // Le Lifecraft Engine équipé est un Elfe, sans +1/+1.
    s = settle(activate(s, engine, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
    expect(chars(s, engine).subtypes).toContain("Elf");
    expect(chars(s, engine)).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Marketback Walker : arrive avec X marqueurs ; {4} : un marqueur ; en mourant, une carte par marqueur", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 8), hand: ["Marketback Walker"], library: lands("Plains", 6) } });
    s = settle(cast(s, "p1", "Marketback Walker", { x: 2 }));
    const walker = idOf(s, "p1", "battlefield", "Marketback Walker");
    expect(chars(s, walker)).toMatchObject({ power: 2, toughness: 2 });
    s = settle(activate(s, walker, "Marqueur"));
    expect(s.objects[walker]?.counters["+1/+1"]).toBe(3);
    const hand = handSize(s);
    destroy(s, walker);
    s = settle(s);
    expect(handSize(s)).toBe(hand + 3);
  });

  it("Mendicant Core, Guidelight : force égale au nombre de vos artefacts ; à vitesse max, payez {1} pour copier un sort d'artefact", () => {
    const gadget = customCard({
      name: "Rouage",
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: 1, colored: {}, x: 0 },
      manaCostText: "{1}",
    });
    const setup = (speed: number) => {
      const s = scenario({
        p1: { battlefield: ["Mendicant Core, Guidelight", "Cultivator's Caravan", ...lands("Plains", 3)], hand: [gadget] },
        p2: { battlefield: ["Cultivator's Caravan"] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      return s;
    };
    let s = setup(4);
    const core = idOf(s, "p1", "battlefield", "Mendicant Core, Guidelight");
    expect(chars(s, core).power).toBe(2);
    s = settle(cast(s, "p1", "Rouage"), choosing());
    const gadgets = idsOf(s, "p1", "battlefield", "Rouage");
    expect(gadgets).toHaveLength(2);
    expect(gadgets.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(chars(s, core).power).toBe(4);
    // Refuser de payer : pas de copie.
    let no = setup(4);
    no = settle(cast(no, "p1", "Rouage"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(idsOf(no, "p1", "battlefield", "Rouage")).toHaveLength(1);
    // Sous la vitesse max : pas de déclenchement.
    let t = setup(3);
    t = settle(cast(t, "p1", "Rouage"), choosing());
    expect(idsOf(t, "p1", "battlefield", "Rouage")).toHaveLength(1);
  });

  it("Mindspring Merfolk : exhaust {X}{U}{U}, {T} — piochez X cartes, un marqueur +1/+1 sur chacun de vos Ondins", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mindspring Merfolk", "Brineborn Cutthroat", "Bear Cub", ...lands("Island", 4)],
        library: lands("Plains", 6),
      },
      p2: { battlefield: ["Brineborn Cutthroat"] },
    });
    const merfolk = idOf(s, "p1", "battlefield", "Mindspring Merfolk");
    const hand = handSize(s);
    s = settle(activate(s, merfolk, "Exhaust", { x: 2 }));
    expect(handSize(s)).toBe(hand + 2);
    expect(s.objects[merfolk]?.tapped).toBe(true);
    expect(s.objects[merfolk]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Brineborn Cutthroat")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBeUndefined();
    expect(s.objects[idOf(s, "p2", "battlefield", "Brineborn Cutthroat")]?.counters["+1/+1"]).toBeUndefined();
    // Une seule activation, même dégagée.
    s.objects[merfolk]!.tapped = false;
    s.version += 1;
    expect(canActivate(s, "p1", merfolk)).toBe(false);
  });
});

describe("Aetherdrift, lot K8 : rares (3)", () => {
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** La capacité de `source` dont le libellé contient `label` est-elle proposée ? */
  const offered = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Muraganda Raceway : {T} : {C} ; à vitesse maximale seulement, {T} : {C}{C}", () => {
    let s = scenario({ p1: { battlefield: ["Muraganda Raceway"] } });
    const raceway = idOf(s, "p1", "battlefield", "Muraganda Raceway");
    // « Start your engines! » : la vitesse démarre à 1.
    expect(s.players.p1?.speed).toBe(1);
    const abilities = (x: S) =>
      legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === raceway ? [a.ability] : []));
    expect(abilities(s)).toHaveLength(1);
    s.players.p1!.speed = 4;
    s.version += 1;
    const both = abilities(s);
    expect(both).toHaveLength(2);
    s = act(s, "p1", { type: "tapForMana", source: raceway, ability: both[1] as number });
    expect(s.players.p1?.manaPool.C).toBe(2);
  });

  it("Oviya : {G}, {T} — une carte de créature ou de Véhicule de la main ; deux marqueurs +1/+1 seulement si c'est un artefact", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Oviya, Automech Artisan", "Forest"], hand: ["Hulldrifter", "Bear Cub", "Shock"] } });
    let s = setup();
    const oviya = idOf(s, "p1", "battlefield", "Oviya, Automech Artisan");
    const hull = idOf(s, "p1", "hand", "Hulldrifter");
    let options: (string | undefined)[] = [];
    s = settle(activate(s, "p1", oviya, "Une créature"), (req, _p, cur) => {
      if (req.type === "pick") options = namesIn(cur, req.options as string[]);
      return picking([hull])(req);
    });
    expect(options.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(idsOf(s, "p1", "hand", "Hulldrifter")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[oviya]?.tapped).toBe(true);

    let t = setup();
    const cub = idOf(t, "p1", "hand", "Bear Cub");
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Oviya, Automech Artisan"), "Une créature"), picking([cub]));
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Oviya : les créatures qui attaquent un adversaire ont le piétinement, pas les autres", () => {
    let s = scenario({ p1: { battlefield: ["Oviya, Automech Artisan", "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const oviya = idOf(s, "p1", "battlefield", "Oviya, Automech Artisan");
    expect(chars(s, cub).keywords).not.toContain("trample");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cub, defender: "p2" }] });
    expect(chars(s, cub).keywords).toContain("trample");
    expect(chars(s, oviya).keywords).not.toContain("trample");
  });

  it("Quag Feast : meulez deux cartes, puis détruisez la cible si sa valeur de mana ne dépasse pas la taille de votre cimetière", () => {
    const setup = (graveyard: string[]) =>
      scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Quag Feast"], graveyard, library: lands("Forest", 5) },
        p2: { battlefield: ["Serra Angel", "Hulldrifter", "Island"] },
      });
    let s = setup([]);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toContain(idOf(s, "p2", "battlefield", "Hulldrifter"));
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Island"));
    // Valeur de mana 5, deux cartes au cimetière : l'Ange survit.
    s = settle(cast(s, "p1", "Quag Feast", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(s.players.p1?.library).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    // Trois cartes déjà au cimetière, plus deux meulées : cinq, l'Ange est détruit.
    let t = setup(["Opt", "Opt", "Opt"]);
    t = settle(cast(t, "p1", "Quag Feast", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Redshift : vigilance ; {T} : X mana d'une couleur (X = sa force), à dépenser seulement pour des capacités", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Redshift, Rocketeer Chief", counters: { "+1/+1": 1 } }, "Riverchurn Monument"],
        hand: ["Shock"],
      },
    });
    const red = idOf(s, "p1", "battlefield", "Redshift, Rocketeer Chief");
    expect(chars(s, red).keywords).toContain("vigilance");
    // Ni Shock (un sort) ; mais la capacité {1} du Monument, oui.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    expect(offered(s, "p1", idOf(s, "p1", "battlefield", "Riverchurn Monument"), "Les joueurs ciblés")).toBe(true);
    s = act(s, "p1", { type: "tapForMana", source: red, ability: 0, color: "R" });
    expect(s.players.p1?.restrictedMana?.filter((m) => m.type === "R")).toHaveLength(3);
    expect(s.players.p1?.manaPool.R).toBe(0);
  });

  it("Redshift : exhaust — mettez sur le champ de bataille autant de cartes de permanent de votre main que voulu", () => {
    let s = scenario({
      p1: {
        battlefield: ["Redshift, Rocketeer Chief", ...lands("Mountain", 6), ...lands("Forest", 6)],
        hand: ["Serra Angel", "Bear Cub", "Island", "Shock"],
      },
    });
    const red = idOf(s, "p1", "battlefield", "Redshift, Rocketeer Chief");
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    const island = idOf(s, "p1", "hand", "Island");
    let options: (string | undefined)[] = [];
    s = settle(activate(s, "p1", red, "Exhaust"), (req, _p, cur) => {
      if (req.type === "pick") options = namesIn(cur, req.options as string[]);
      return picking([angel, island])(req);
    });
    expect(options.sort()).toEqual(["Bear Cub", "Island", "Serra Angel"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Shock"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    expect(offered(s, "p1", red, "Exhaust")).toBe(false);
  });

  it("Regal Imperiosaur : les autres Dinosaures que vous contrôlez ont +1/+1", () => {
    const raptor = customCard({
      name: "Raptor",
      typeLine: "Creature — Dinosaur",
      subtypes: ["Dinosaur"],
      power: 2,
      toughness: 2,
    });
    const s = scenario({
      p1: { battlefield: ["Regal Imperiosaur", raptor, "Bear Cub"] },
      p2: { battlefield: [raptor] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Regal Imperiosaur"))).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Raptor"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Raptor"))).toEqual([2, 2]);
    // Deux Imperiosaures : chacun donne +1/+1 à l'autre.
    const t = scenario({ p1: { battlefield: ["Regal Imperiosaur", "Regal Imperiosaur"] } });
    for (const id of idsOf(t, "p1", "battlefield", "Regal Imperiosaur")) expect(pt(t, id)).toEqual([6, 5]);
  });

  it("Riverchurn Monument : {1}, {T} — chaque joueur ciblé meule deux cartes", () => {
    let s = scenario({ p1: { battlefield: ["Riverchurn Monument", "Island"] } });
    const monument = idOf(s, "p1", "battlefield", "Riverchurn Monument");
    s = settle(activate(s, "p1", monument, "Les joueurs ciblés", { targets: { t: ["p1", "p2"] } }));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    expect(s.objects[monument]?.tapped).toBe(true);
  });

  it("Riverchurn Monument : exhaust — chaque joueur ciblé meule autant de cartes que son cimetière en compte", () => {
    let s = scenario({
      p1: { battlefield: ["Riverchurn Monument", ...lands("Island", 4)], graveyard: ["Opt"] },
      p2: { graveyard: ["Opt", "Opt", "Opt"] },
    });
    const monument = idOf(s, "p1", "battlefield", "Riverchurn Monument");
    s = settle(activate(s, "p1", monument, "Exhaust", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(6);
    expect(s.players.p2?.library).toHaveLength(7);
    // Joueur non ciblé : rien.
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.objects[monument]?.tapped).toBe(true);
  });

  it("Sita Varma : exhaust — X marqueurs +1/+1, puis vous pouvez donner sa force comme F/E de base à vos autres créatures jusqu'à la fin du tour", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [
            "Sita Varma, Masked Racer",
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            ...lands("Forest", 3),
            ...lands("Island", 2),
          ],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const sita = idOf(s, "p1", "battlefield", "Sita Varma, Masked Racer");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", sita, "Exhaust", { x: 2 }), (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(pt(s, sita)).toEqual([4, 5]);
    // F/E de base 4/4, plus son marqueur.
    expect(pt(s, cub)).toEqual([5, 5]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
    expect(offered(s, "p1", sita, "Exhaust")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, cub)).toEqual([3, 3]);
    expect(pt(s, sita)).toEqual([4, 5]);

    let t = setup();
    const cub2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Sita Varma, Masked Racer"), "Exhaust", { x: 2 }), (req) =>
      req.type === "yesNo" ? [0] : undefined,
    );
    expect(pt(t, cub2)).toEqual([3, 3]);
  });

  it("Spectacular Pileup : les créatures et les Véhicules perdent l'indestructible, puis sont tous détruits", () => {
    const colossus = customCard({ name: "Colosse", keywords: ["indestructible"], power: 5, toughness: 5 });
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), colossus], hand: ["Spectacular Pileup"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter", "Riverchurn Monument"] },
    });
    s = settle(cast(s, "p1", "Spectacular Pileup"));
    expect(idsOf(s, "p1", "graveyard", "Colosse")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    // Un artefact qui n'est ni créature ni Véhicule, et les terrains, restent.
    expect(idsOf(s, "p2", "battlefield", "Riverchurn Monument")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(5);
  });

  it("Spectacular Pileup : cycle {2}, piochez une carte", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Spectacular Pileup"], library: lands("Island", 3) } });
    const pileup = idOf(s, "p1", "hand", "Spectacular Pileup");
    s = settle(activate(s, "p1", pileup, "Cycle"));
    expect(idsOf(s, "p1", "graveyard", "Spectacular Pileup")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Thopter Fabricator : un Thopter 1/1 volant quand vous piochez votre deuxième carte du tour, pas la première ni la troisième", () => {
    let s = scenario({
      p1: {
        battlefield: ["Thopter Fabricator", ...lands("Island", 3)],
        hand: ["Opt", "Opt", "Opt"],
        library: lands("Plains", 5),
      },
    });
    const fab = idOf(s, "p1", "battlefield", "Thopter Fabricator");
    expect(chars(s, fab).keywords).toContain("flying");
    expect(abilityIndex(s, fab, "Équipage")).toBeGreaterThanOrEqual(0);
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(0);
    s = settle(cast(s, "p1", "Opt"));
    const thopters = idsOf(s, "p1", "battlefield", "Thopter");
    expect(thopters).toHaveLength(1);
    const c = chars(s, thopters[0] as string);
    expect([c.power, c.toughness, c.colors]).toEqual([1, 1, []]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
  });

  it("Unstoppable Plan : à votre étape de fin, dégagez vos permanents non-terrain (pas les terrains, pas ceux de l'adversaire)", () => {
    let s = scenario({
      step: "main2",
      p1: {
        battlefield: [
          "Unstoppable Plan",
          { name: "Bear Cub", tapped: true },
          { name: "Hulldrifter", tapped: true },
          { name: "Forest", tapped: true },
        ],
      },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    s = settle(advanceUntil(s, (x) => x.turn.step === "end"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    // À l'étape de fin de l'adversaire : rien.
    let t = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Unstoppable Plan", { name: "Bear Cub", tapped: true }] },
    });
    t = settle(advanceUntil(t, (x) => x.turn.step === "end"));
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Voyager Glidecar : en arrivant, regard 1", () => {
    let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Voyager Glidecar"], library: ["Opt", "Island", "Forest"] } });
    let asked = false;
    s = settle(cast(s, "p1", "Voyager Glidecar"), (req) => {
      if (req.type !== "pick" || req.intent !== "scryBottom") return undefined;
      asked = true;
      expect(req.options).toHaveLength(1);
      return req.options;
    });
    expect(asked).toBe(true);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Forest", "Opt"]);
  });

  it("Voyager Glidecar : engagez trois autres créatures dégagées — créature-artefact volante jusqu'à la fin du tour, et un marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Voyager Glidecar", "Bear Cub", "Bear Cub", { name: "Llanowar Elves", tapped: true }] },
    });
    const car = idOf(s, "p1", "battlefield", "Voyager Glidecar");
    expect(abilityIndex(s, car, "Équipage")).toBeGreaterThanOrEqual(0);
    // Deux créatures dégagées seulement : impossible.
    expect(offered(s, "p1", car, "Devient")).toBe(false);
    s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]!.tapped = false;
    s.version += 1;
    s = settle(activate(s, "p1", car, "Devient"));
    expect(chars(s, car).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, car).keywords).toContain("flying");
    expect(s.objects[car]?.counters["+1/+1"]).toBe(1);
    expect(pt(s, car)).toEqual([3, 4]);
    expect(s.battlefield.filter((id) => nameOf(s, id) !== "Voyager Glidecar").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, car).types).not.toContain("Creature");
    expect(s.objects[car]?.counters["+1/+1"]).toBe(1);
  });

  it("Wastewood Verge : {G} toujours, {B} seulement avec un Marais ou une Forêt", () => {
    const s = scenario({ p1: { battlefield: ["Wastewood Verge", "Island"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G"]);
    const t = scenario({ p1: { battlefield: ["Wastewood Verge", "Swamp"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G", "B"]);
    const u = scenario({ p1: { battlefield: ["Wastewood Verge", "Forest"] } });
    expect(manaColors(u, idOf(u, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G", "B"]);
  });

  it("Willowrush Verge : {U} toujours, {G} seulement avec une Forêt ou une Île", () => {
    const s = scenario({ p1: { battlefield: ["Willowrush Verge", "Mountain"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U"]);
    const t = scenario({ p1: { battlefield: ["Willowrush Verge", "Forest"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U", "G"]);
    const u = scenario({ p1: { battlefield: ["Willowrush Verge", "Island"] } });
    expect(manaColors(u, idOf(u, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U", "G"]);
  });

  it("Webstrike Elite : portée ; cycle {X}{G}{G} — piochez, et détruisez jusqu'à un artefact ou enchantement de valeur de mana X", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Webstrike Elite"], library: lands("Island", 3) },
      p2: { battlefield: [artifact("Rouage", 3)] },
    });
    const elite = idOf(s, "p1", "hand", "Webstrike Elite");
    expect(chars(s, elite).keywords).toContain("reach");
    const cog = idOf(s, "p2", "battlefield", "Rouage");
    s = settle(activate(s, "p1", elite, "Cycle", { x: 3 }), picking([cog]));
    expect(idsOf(s, "p2", "graveyard", "Rouage")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    expect(idsOf(s, "p1", "graveyard", "Webstrike Elite")).toHaveLength(1);
  });

  it("Winter : garde (payer 2 PV) pour elle et pour vos artefacts, pas pour vos autres créatures", () => {
    const setup = () =>
      scenario({
        active: "p2",
        p1: { battlefield: ["Winter, Cursed Rider", "Walking Sarcophagus", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
    const shock = (target: string, pay: boolean) => {
      let s = setup();
      s = cast(s, "p2", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", target)] } });
      return settle(s, (req) => (req.intent === "unlessPay" ? [pay ? 1 : 0] : undefined));
    };
    // Sans payer : Shock est contrecarré.
    let s = shock("Winter, Cursed Rider", false);
    expect(idsOf(s, "p1", "battlefield", "Winter, Cursed Rider")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    s = shock("Walking Sarcophagus", false);
    expect(idsOf(s, "p1", "battlefield", "Walking Sarcophagus")).toHaveLength(1);
    // En payant 2 PV, le sort se résout.
    s = shock("Winter, Cursed Rider", true);
    expect(s.players.p2?.life).toBe(18);
    expect(idsOf(s, "p1", "graveyard", "Winter, Cursed Rider")).toHaveLength(1);
    // Une créature non-artefact n'a pas la garde.
    let asked = false;
    let t = setup();
    t = cast(t, "p2", "Shock", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } });
    t = settle(t, (req) => {
      if (req.intent === "unlessPay") asked = true;
      return undefined;
    });
    expect(asked).toBe(false);
    expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Winter : exhaust, {T}, exilez X cartes d'artefact de votre cimetière — les autres créatures non-artefacts ont -X/-X", () => {
    let s = scenario({
      p1: {
        battlefield: ["Winter, Cursed Rider", "Walking Sarcophagus", ...lands("Island", 2), ...lands("Swamp", 2)],
        graveyard: ["Hulldrifter", "Riverchurn Monument", "Opt"],
      },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const winter = idOf(s, "p1", "battlefield", "Winter, Cursed Rider");
    // Deux cartes d'artefact seulement : X = 3 est refusé.
    expect(() => activate(s, "p1", winter, "Exhaust", { x: 3 })).toThrow();
    s = settle(activate(s, "p1", winter, "Exhaust", { x: 2 }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([2, 2]);
    expect(pt(s, winter)).toEqual([3, 2]);
    expect(idsOf(s, "p1", "battlefield", "Walking Sarcophagus")).toHaveLength(1);
    expect(s.objects[winter]?.tapped).toBe(true);
  });

  it("Zahur : sacrifiez une autre créature — surveillance 1, une seule fois par tour", () => {
    let s = scenario({ p1: { battlefield: ["Zahur, Glory's Past", "Bear Cub", "Llanowar Elves"], library: ["Opt", "Forest"] } });
    const zahur = idOf(s, "p1", "battlefield", "Zahur, Glory's Past");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", zahur, "Surveillance", { sacrifice: [cub] }), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    expect(offered(s, "p1", zahur, "Surveillance")).toBe(false);
    // Vitesse 1 : pas de Zombie.
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
  });

  it("Zahur : vitesse max — un Zombie 2/2 noir engagé quand une de vos créatures non-jetons meurt, pas un jeton", () => {
    let s = scenario({ p1: { battlefield: ["Zahur, Glory's Past", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s);
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(1);
    const z = zombies[0] as string;
    expect(s.objects[z]?.tapped).toBe(true);
    expect([...pt(s, z), chars(s, z).colors]).toEqual([2, 2, ["B"]]);
    // Le Zombie (un jeton) meurt : rien ; une créature de l'adversaire : rien.
    destroy(s, z);
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
  });
});

describe("Aetherdrift, lot K8 : peu communes (1)", () => {
  /** Option d'activation de `source` dont le libellé commence par `label` (ou `undefined`). */
  const option = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && x.ability === abilityIndex(s, source, label),
    );
    return a?.type === "activate" ? a : undefined;
  };
  /** Active la capacité de `source` dont le libellé commence par `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  /** Avance jusqu'au début du combat de p1, au moment où un déclencheur attend (choix de cible ou pile). */
  const toBeginCombat = (s: S) =>
    advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0));

  it("Adrenaline Jockey : 4 blessures au joueur qui lance un sort pendant le tour d'un autre, pas pendant le sien", () => {
    let s = scenario({
      p1: { battlefield: ["Adrenaline Jockey", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Adrenaline Jockey : un marqueur +1/+1 chaque fois que vous activez une capacité d'exhaust", () => {
    let s = scenario({ p1: { battlefield: ["Adrenaline Jockey", "Prowcatcher Specialist", ...lands("Mountain", 4)] } });
    const jockey = idOf(s, "p1", "battlefield", "Adrenaline Jockey");
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    s = settle(activate(s, "p1", pro, "Exhaust"));
    expect(s.objects[jockey]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(2);
  });

  it("Aether Syphon : {2}, {T} : piochez ; à vitesse maximale seulement, chaque adversaire meule deux cartes par carte piochée", () => {
    const run = (speed: number) => {
      let s = scenario({ p1: { battlefield: ["Aether Syphon", ...lands("Island", 2)] } });
      s.players.p1!.speed = speed;
      s.version += 1;
      const syphon = idOf(s, "p1", "battlefield", "Aether Syphon");
      s = settle(activate(s, "p1", syphon, "Piochez"));
      expect(s.objects[syphon]?.tapped).toBe(true);
      return s;
    };
    const slow = run(3);
    expect(slow.players.p1?.hand).toHaveLength(1);
    expect(slow.players.p2?.library).toHaveLength(10);
    const max = run(4);
    expect(max.players.p1?.hand).toHaveLength(1);
    expect(max.players.p2?.library).toHaveLength(8);
    expect(max.players.p2?.graveyard).toHaveLength(2);
    // « Start your engines! » : la vitesse démarre à 1.
    expect(scenario({ p1: { battlefield: ["Aether Syphon"] } }).players.p1?.speed).toBe(1);
  });

  it("Air Response Unit : Équipage 1 en fait une créature-artefact 3/3 volante qui attaque sans s'engager (vigilance)", () => {
    let s = scenario({ p1: { battlefield: ["Air Response Unit", "Llanowar Elves"] } });
    const unit = idOf(s, "p1", "battlefield", "Air Response Unit");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, unit).types).not.toContain("Creature");
    s = settle(activate(s, "p1", unit, "Équipage", { tap: [elf] }));
    const c = chars(s, unit);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = attack(s, [unit]);
    expect(s.objects[unit]?.tapped).toBe(false);
  });

  it("Alacrian Armory : vos créatures ont +0/+1 et la vigilance, pas celles de l'adversaire", () => {
    const s = scenario({ p1: { battlefield: ["Alacrian Armory", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const mine = chars(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    expect([mine.power, mine.toughness, mine.keywords.includes("vigilance")]).toEqual([2, 3, true]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    expect([theirs.power, theirs.toughness, theirs.keywords.includes("vigilance")]).toEqual([2, 2, false]);
  });

  it("Alacrian Armory : au début de votre combat, le Véhicule ciblé devient une créature-artefact, la Monture ciblée est montée", () => {
    let s = scenario({ p1: { battlefield: ["Alacrian Armory", "Hulldrifter"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(toBeginCombat(s), picking([hull]));
    const c = chars(s, hull);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    let t = scenario({ p1: { battlefield: ["Alacrian Armory", "Gilded Ghoda"] } });
    const ghoda = idOf(t, "p1", "battlefield", "Gilded Ghoda");
    t = settle(toBeginCombat(t), picking([ghoda]));
    expect(t.objects[ghoda]?.saddledTurn).toBe(t.turn.number);
    // Montée, elle crée un Trésor en attaquant.
    t = act(
      advanceUntil(t, (x) => x.pending?.kind === "declareAttackers"),
      "p1",
      {
        type: "declareAttackers",
        attackers: [{ id: ghoda, defender: "p2" }],
      },
    );
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Amonkhet Raceway : {T} : {C} ; à vitesse maximale seulement, {T} : une créature gagne la célérité", () => {
    let s = scenario({ p1: { battlefield: ["Amonkhet Raceway", { name: "Bear Cub", sick: true }] } });
    const raceway = idOf(s, "p1", "battlefield", "Amonkhet Raceway");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === raceway && a.colors.includes("C"))).toBe(
      true,
    );
    expect(option(s, "p1", raceway, "Vitesse max")).toBeUndefined();
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", raceway, "Vitesse max", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("haste");
    s = attack(s, [cub]);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(cub);
  });

  it("Apocalypse Runner : {T} : votre créature de force 2 ou moins gagne le lien de vie et ne peut pas être bloquée ; Équipage 3", () => {
    let s = scenario({
      p1: { battlefield: ["Apocalypse Runner", "Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const runner = idOf(s, "p1", "battlefield", "Apocalypse Runner");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const legal = option(s, "p1", runner, "Lien de vie")?.targets[0]?.legal ?? [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(angel);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Llanowar Elves"));
    s = settle(activate(s, "p1", runner, "Lien de vie", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["lifelink", "unblockable"]));
    expect(s.objects[runner]?.tapped).toBe(true);
    // Équipage 3 : l'Ourson (force 2) ne suffit pas seul.
    const t = scenario({ p1: { battlefield: ["Apocalypse Runner", "Bear Cub"] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Apocalypse Runner"), "Équipage")).toBeUndefined();
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("lifelink");
  });

  it("Autarch Mammoth : un Éléphant 3/3 en arrivant, et quand il attaque en étant monté (pas sans être monté) ; Monture 5", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Autarch Mammoth"] } });
    s = settle(cast(s, "p1", "Autarch Mammoth"));
    const elephants = idsOf(s, "p1", "battlefield", "Elephant");
    expect(elephants).toHaveLength(1);
    const e = chars(s, elephants[0] as string);
    expect([e.power, e.toughness, e.colors]).toEqual([3, 3, ["G"]]);

    const ride = (saddle: boolean) => {
      let t = scenario({ p1: { battlefield: ["Autarch Mammoth", "Serra Angel", "Llanowar Elves"] } });
      const mammoth = idOf(t, "p1", "battlefield", "Autarch Mammoth");
      const riders = [idOf(t, "p1", "battlefield", "Serra Angel"), idOf(t, "p1", "battlefield", "Llanowar Elves")];
      if (saddle) t = settle(activate(t, "p1", mammoth, "Monture", { tap: riders }));
      return settleNoBlocks(attack(t, [mammoth]));
    };
    expect(idsOf(ride(true), "p1", "battlefield", "Elephant")).toHaveLength(1);
    expect(idsOf(ride(false), "p1", "battlefield", "Elephant")).toHaveLength(0);
    // Monture 5 : l'Ange (force 4) seul ne suffit pas.
    const u = scenario({ p1: { battlefield: ["Autarch Mammoth", "Serra Angel"] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Autarch Mammoth"), "Monture")).toBeUndefined();
  });

  it("Back on Track : renvoie une carte de créature ou de Véhicule de votre cimetière sur le champ de bataille et crée un Pilote", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Back on Track"], graveyard: ["Hulldrifter", "Opt"] },
      p2: { graveyard: ["Bear Cub"] },
    });
    const hull = idOf(s, "p1", "graveyard", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).toEqual([hull]);
    s = settle(cast(s, "p1", "Back on Track", { targets: { t: [hull] } }));
    expect(idsOf(s, "p1", "battlefield", "Hulldrifter")).toHaveLength(1);
    const pilots = idsOf(s, "p1", "battlefield", "Pilot");
    expect(pilots).toHaveLength(1);
    expect([chars(s, pilots[0] as string).power, chars(s, pilots[0] as string).toughness]).toEqual([1, 1]);
    // Le Pilote équipe comme si sa force était supérieure de 2 : Équipage 3 à lui seul.
    const h = idOf(s, "p1", "battlefield", "Hulldrifter");
    expect(option(s, "p1", h, "Équipage")).toBeDefined();
  });

  it("Boom Scholar : les capacités d'exhaust de vos autres permanents coûtent {2} de moins, pas la sienne", () => {
    const s = scenario({ p1: { battlefield: ["Boom Scholar", "Prowcatcher Specialist", ...lands("Mountain", 2)] } });
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    // {3}{R} − {2} = {1}{R}.
    expect(option(s, "p1", pro, "Exhaust")).toBeDefined();
    const t = scenario({ p1: { battlefield: ["Boom Scholar", ...lands("Mountain", 2), ...lands("Forest", 2)] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Boom Scholar"), "Exhaust")).toBeUndefined();
    const u = scenario({ p1: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 2)] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust")).toBeUndefined();
  });

  it("Boom Scholar : exhaust — vos créatures et Véhicules gagnent le piétinement, deux marqueurs +1/+1 sur lui", () => {
    let s = scenario({
      p1: { battlefield: ["Boom Scholar", "Bear Cub", "Hulldrifter", ...lands("Mountain", 3), ...lands("Forest", 3)] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const scholar = idOf(s, "p1", "battlefield", "Boom Scholar");
    s = settle(activate(s, "p1", scholar, "Exhaust"));
    expect(s.objects[scholar]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p1", "battlefield", "Hulldrifter")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
    expect(canActivate(s, "p1", scholar)).toBe(false);
  });

  it("Boosted Sloop : menace ; chaque fois que vous attaquez (même sans lui), piochez puis défaussez", () => {
    let s = scenario({
      p1: { battlefield: ["Boosted Sloop", "Bear Cub"], hand: ["Opt"], library: lands("Plains", 5) },
    });
    const sloop = idOf(s, "p1", "battlefield", "Boosted Sloop");
    expect(chars(s, sloop).keywords).toContain("menace");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), picking([opt]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    // Sans attaque, rien.
    let t = scenario({ p1: { battlefield: ["Boosted Sloop", "Bear Cub"], hand: ["Opt"] } });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Broodheart Engine : surveillance 1 au début de votre entretien", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Broodheart Engine"], library: ["Opt", ...lands("Forest", 5)] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent.startsWith("surveil"));
    expect(s.turn.active).toBe("p1");
    expect(s.turn.step).toBe("upkeep");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" ? namesIn(s, req.options) : []).toEqual(["Opt"]);
    s = act(s, "p1", { type: "choose", values: req?.type === "pick" ? req.options : [] });
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Broodheart Engine : {2}{B}{G}, {T}, sacrifice : renvoie une carte de créature ou de Véhicule de votre cimetière, en rituel", () => {
    let s = scenario({
      p1: {
        battlefield: ["Broodheart Engine", ...lands("Swamp", 2), ...lands("Forest", 2)],
        graveyard: ["Serra Angel", "Opt"],
      },
    });
    const engine = idOf(s, "p1", "battlefield", "Broodheart Engine");
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    expect(option(s, "p1", engine, "Renvoyez")?.targets[0]?.legal).toEqual([angel]);
    s = settle(activate(s, "p1", engine, "Renvoyez", { targets: { t: [angel] } }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Broodheart Engine")).toHaveLength(1);
    // Pas pendant le tour adverse.
    const t = scenario({
      active: "p2",
      p1: { battlefield: ["Broodheart Engine", ...lands("Swamp", 2), ...lands("Forest", 2)], graveyard: ["Serra Angel"] },
    });
    expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Broodheart Engine"))).toBe(false);
  });

  it("Caelorna, Coral Tyrant : créature légendaire 0/8 sans capacité", () => {
    const s = scenario({ p1: { battlefield: ["Caelorna, Coral Tyrant"] } });
    const c = chars(s, idOf(s, "p1", "battlefield", "Caelorna, Coral Tyrant"));
    expect([c.power, c.toughness]).toEqual([0, 8]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toContain("Octopus");
    expect(c.abilities).toHaveLength(0);
  });

  it("Canyon Vaulter : le Véhicule qu'elle équipe ou la Monture qu'elle monte pendant votre phase principale gagne le vol", () => {
    let s = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner"] } });
    const vaulter = idOf(s, "p1", "battlefield", "Canyon Vaulter");
    const runner = idOf(s, "p1", "battlefield", "Apocalypse Runner");
    s = settle(activate(s, "p1", runner, "Équipage", { tap: [vaulter] }));
    expect(chars(s, runner).keywords).toContain("flying");
    let t = scenario({ p1: { battlefield: ["Canyon Vaulter", "Gilded Ghoda"] } });
    const ghoda = idOf(t, "p1", "battlefield", "Gilded Ghoda");
    t = settle(activate(t, "p1", ghoda, "Monture", { tap: [idOf(t, "p1", "battlefield", "Canyon Vaulter")] }));
    expect(chars(t, ghoda).keywords).toContain("flying");
    // Hors de la phase principale (début du combat) : pas de vol.
    let u = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner"] }, step: "beginCombat" });
    const r2 = idOf(u, "p1", "battlefield", "Apocalypse Runner");
    u = settle(activate(u, "p1", r2, "Équipage", { tap: [idOf(u, "p1", "battlefield", "Canyon Vaulter")] }));
    expect(chars(u, r2).types).toContain("Creature");
    expect(chars(u, r2).keywords).not.toContain("flying");
    // Équipé par une autre créature : pas de vol.
    let w = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner", "Serra Angel"] } });
    const r3 = idOf(w, "p1", "battlefield", "Apocalypse Runner");
    w = settle(activate(w, "p1", r3, "Équipage", { tap: [idOf(w, "p1", "battlefield", "Serra Angel")] }));
    expect(chars(w, r3).keywords).not.toContain("flying");
  });

  it("Carrion Cruiser : en arrivant, meulez deux cartes puis reprenez une carte de créature ou de Véhicule de votre cimetière", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Carrion Cruiser"], library: ["Opt", "Bear Cub"], graveyard: ["Hulldrifter"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Carrion Cruiser"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => cur.defs[cur.objects[id]?.defId ?? ""]?.name === "Hulldrifter");
    });
    expect(offered.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Hulldrifter"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    const cruiser = idOf(s, "p1", "battlefield", "Carrion Cruiser");
    expect(abilityIndex(s, cruiser, "Équipage 1")).toBeGreaterThanOrEqual(0);
  });

  it("Cloudspire Captain : vos Montures et Véhicules ont +1/+1 ; il équipe et monte comme si sa force était supérieure de 2", () => {
    let s = scenario({
      p1: { battlefield: ["Cloudspire Captain", "Hulldrifter", "Gilded Ghoda"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const captain = idOf(s, "p1", "battlefield", "Cloudspire Captain");
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const ghoda = chars(s, idOf(s, "p1", "battlefield", "Gilded Ghoda"));
    expect([ghoda.power, ghoda.toughness]).toEqual([3, 3]);
    expect([chars(s, captain).power, chars(s, captain).toughness]).toEqual([2, 3]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Hulldrifter"));
    expect([theirs.power, theirs.toughness]).toEqual([3, 2]);
    // Force 2 + 2 : Équipage 3 à lui seul.
    s = settle(activate(s, "p1", hull, "Équipage", { tap: [captain] }));
    expect(chars(s, hull).types).toContain("Creature");
    expect([chars(s, hull).power, chars(s, hull).toughness]).toEqual([4, 3]);
    let t = scenario({ p1: { battlefield: ["Cloudspire Captain", "Dracosaur Auxiliary"] } });
    const draco = idOf(t, "p1", "battlefield", "Dracosaur Auxiliary");
    t = settle(activate(t, "p1", draco, "Monture", { tap: [idOf(t, "p1", "battlefield", "Cloudspire Captain")] }));
    expect(t.objects[draco]?.saddledTurn).toBe(t.turn.number);
  });

  it("Cloudspire Coordinator : regard 2 en arrivant", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Cloudspire Coordinator"] } });
    let seen = 0;
    s = settle(cast(s, "p1", "Cloudspire Coordinator"), (req) => {
      if (req.type === "pick" && req.intent === "scryBottom") seen = req.options.length;
      return undefined;
    });
    expect(seen).toBe(2);
  });

  it("Cloudspire Coordinator : {T} : un Pilote par Monture ou Véhicule arrivé sous votre contrôle ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Cloudspire Coordinator", "Gilded Ghoda"], hand: ["Hulldrifter", "Apocalypse Runner"] },
      p2: { hand: ["Air Response Unit"] },
    });
    const coord = idOf(s, "p1", "battlefield", "Cloudspire Coordinator");
    moveObject(s, idOf(s, "p1", "hand", "Hulldrifter"), "battlefield");
    moveObject(s, idOf(s, "p1", "hand", "Apocalypse Runner"), "battlefield");
    moveObject(s, idOf(s, "p2", "hand", "Air Response Unit"), "battlefield");
    // Le Véhicule reparti compte quand même : il est arrivé ce tour-ci.
    moveObject(s, idOf(s, "p1", "battlefield", "Apocalypse Runner"), "graveyard");
    s = settle(s);
    s = settle(activate(s, "p1", coord, "Un Pilote"));
    const pilots = idsOf(s, "p1", "battlefield", "Pilot");
    expect(pilots).toHaveLength(2);
    expect([chars(s, pilots[0] as string).power, chars(s, pilots[0] as string).colors]).toEqual([1, []]);
    // Les Pilotes équipent comme si leur force était supérieure de 2 : Équipage 3 à un seul.
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(activate(s, "p1", hull, "Équipage", { tap: [pilots[0] as string] }));
    expect(chars(s, hull).types).toContain("Creature");
  });

  it("Cloudspire Skycycle : en arrivant, répartit deux marqueurs +1/+1 entre une ou deux autres cibles à vous (créatures ou Véhicules)", () => {
    const run = (want: (s: S) => string[]) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Bear Cub", "Hulldrifter"],
          hand: ["Cloudspire Skycycle"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      let req: { options: string[]; min: number; max: number } | undefined;
      s = settle(cast(s, "p1", "Cloudspire Skycycle"), (r, _p, cur) => {
        if (r.type !== "pick" || r.intent !== "triggerTarget") return undefined;
        req = { options: namesIn(cur, r.options) as string[], min: r.min, max: r.max };
        return want(cur);
      });
      return { s, req };
    };
    const one = run((x) => [idOf(x, "p1", "battlefield", "Bear Cub")]);
    expect(one.req?.options.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect([one.req?.min, one.req?.max]).toEqual([1, 2]);
    expect(one.s.objects[idOf(one.s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
    const two = run((x) => [idOf(x, "p1", "battlefield", "Bear Cub"), idOf(x, "p1", "battlefield", "Hulldrifter")]);
    expect(two.s.objects[idOf(two.s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(two.s.objects[idOf(two.s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(1);
    const cycle = chars(two.s, idOf(two.s, "p1", "battlefield", "Cloudspire Skycycle"));
    expect(cycle.keywords).toContain("flying");
    expect(cycle.abilities.some((a) => a.kind === "activated" && a.label?.startsWith("Équipage 1"))).toBe(true);
  });

  it("Country Roads : arrive engagé sauf si vous contrôlez une Monture ou un Véhicule ; {T} : {W}", () => {
    let s = scenario({ p1: { hand: ["Country Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Country Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Country Roads")]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Country Roads"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Country Roads") });
    const roads = idOf(t, "p1", "battlefield", "Country Roads");
    expect(t.objects[roads]?.tapped).toBe(false);
    expect(legalActions(t, "p1").some((a) => a.type === "tapForMana" && a.source === roads && a.colors.includes("W"))).toBe(true);
  });

  it("Country Roads : {1}{W}, {T}, sacrifice : un Pilote 1/1, en rituel seulement", () => {
    let s = scenario({ p1: { battlefield: ["Country Roads", ...lands("Plains", 2)] } });
    const roads = idOf(s, "p1", "battlefield", "Country Roads");
    s = settle(activate(s, "p1", roads, "Pilote"));
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Country Roads")).toHaveLength(1);
    const t = scenario({ active: "p2", p1: { battlefield: ["Country Roads", ...lands("Plains", 2)] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Country Roads"), "Pilote")).toBeUndefined();
  });

  it("Defend the Rider : votre permanent ciblé gagne la défense talismanique et l'indestructible, ou un Pilote 1/1", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Defend the Rider"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(cast(s, "p1", "Defend the Rider", { mode: 0, targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    destroy(s, cub);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Forest"], hand: ["Defend the Rider"] } });
    t = settle(cast(t, "p1", "Defend the Rider", { mode: 1 }));
    expect(idsOf(t, "p1", "battlefield", "Pilot")).toHaveLength(1);
  });

  it("Detention Chariot : exile un artefact ou une créature adverse jusqu'à ce que le Véhicule quitte le champ de bataille", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Detention Chariot"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter", "Island"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Detention Chariot"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") offered = namesIn(cur, req.options);
      return picking([angel])(req);
    });
    expect(offered.sort()).toEqual(["Hulldrifter", "Serra Angel"]);
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    destroy(s, idOf(s, "p1", "battlefield", "Detention Chariot"));
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Detention Chariot : cycle {W} (défaussez-le, piochez une carte) ; Équipage 3", () => {
    let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Detention Chariot"], library: lands("Island", 3) } });
    const chariot = idOf(s, "p1", "hand", "Detention Chariot");
    s = settle(activate(s, "p1", chariot, "Cycle"));
    expect(idsOf(s, "p1", "graveyard", "Detention Chariot")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    const t = scenario({ p1: { battlefield: ["Detention Chariot", "Bear Cub", "Llanowar Elves"] } });
    const c = idOf(t, "p1", "battlefield", "Detention Chariot");
    expect(option(t, "p1", c, "Équipage 3")).toBeDefined();
    const u = scenario({ p1: { battlefield: ["Detention Chariot", "Bear Cub"] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Detention Chariot"), "Équipage 3")).toBeUndefined();
  });

  describe("Diversion Unit", () => {
    /** p1 lance Lightning Strike sur p2 ; p2 sacrifie Diversion Unit pour le contrecarrer. */
    const setup = (extra: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + extra), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Diversion Unit", "Island"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      const unit = idOf(s, "p2", "battlefield", "Diversion Unit");
      expect(chars(s, unit).keywords).toContain("flying");
      return activate(s, "p2", unit, "Contrecarrez", { targets: { t: [s.stack[0]?.id as string] } });
    };

    it("contrecarre l'éphémère ou le rituel si son contrôleur ne paie pas {3} ; l'Unité est sacrifiée", () => {
      const s = settle(setup(0));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Diversion Unit")).toHaveLength(1);
    });

    it("le contrôleur paie {3} : le sort se résout", () => {
      const s = settle(setup(3), (req) => (req.intent === "unlessPay" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });

    it("ne cible pas un sort de créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        p2: { battlefield: ["Diversion Unit", "Island"] },
      });
      s = cast(s, "p1", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      expect(canActivate(s, "p2", idOf(s, "p2", "battlefield", "Diversion Unit"))).toBe(false);
    });
  });

  it("Dracosaur Auxiliary : vol et célérité ; quand il attaque en étant monté, 2 blessures à n'importe quelle cible ; Monture 3", () => {
    const run = (saddle: boolean) => {
      let s = scenario({
        p1: { battlefield: [{ name: "Dracosaur Auxiliary", sick: true }, "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const draco = idOf(s, "p1", "battlefield", "Dracosaur Auxiliary");
      expect(chars(s, draco).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      if (saddle) s = settle(activate(s, "p1", draco, "Monture", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
      return settleNoBlocks(attack(s, [draco]), picking([idOf(s, "p2", "battlefield", "Bear Cub")]));
    };
    const ridden = run(true);
    expect(idsOf(ridden, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const alone = run(false);
    expect(idsOf(alone, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(alone.players.p2?.life).toBe(20);
    // Monture 3 : l'Ourson (force 2) ne suffit pas.
    const t = scenario({ p1: { battlefield: ["Dracosaur Auxiliary", "Bear Cub"] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Dracosaur Auxiliary"), "Monture")).toBeUndefined();
  });
});

describe("Aetherdrift, lot K8 : peu communes (2)", () => {
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Les noms proposés par les choix d'objets, et la réponse : l'objet nommé `want` (sinon la suggestion). */
  const recording = (seen: string[][], want?: string): Answer => {
    return (req: ChoiceRequest, _p, cur) => {
      if (req.type !== "pick" || !req.options.every((o) => typeof o === "string" && cur.objects[o])) return undefined;
      seen.push(namesIn(cur, req.options as string[]).map(String));
      return want === undefined ? undefined : pickNamed(cur, req, want);
    };
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Dredger's Insight : meule quatre cartes, vous pouvez reprendre une carte d'artefact, de créature ou de terrain meulée ; +1 PV quand une carte d'artefact ou de créature quitte votre cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Dredger's Insight"],
        library: ["Opt", "Bear Cub", "Shock", "Island", "Plains", "Plains"],
      },
      p2: { graveyard: ["Bear Cub"] },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Dredger's Insight"), recording(seen, "Bear Cub"));
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Island"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Shock"]);
    expect(s.players.p1?.library).toHaveLength(2);
    // La carte de créature reprise a quitté votre cimetière : +1 PV.
    expect(s.players.p1?.life).toBe(21);
    // Ni une carte d'éphémère ni une carte de terrain, ni une carte du cimetière adverse.
    moveObject(s, idOf(s, "p1", "graveyard", "Opt"), "exile");
    moveObject(s, idOf(s, "p1", "graveyard", "Island"), "exile");
    moveObject(s, idOf(s, "p2", "graveyard", "Bear Cub"), "exile");
    s = settle(act(s, "p1", { type: "pass" }));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Dune Drifter : renvoie une carte d'artefact ou de créature de VM X ou moins de votre cimetière ; Équipage 2", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)],
        hand: ["Dune Drifter"],
        graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Dune Drifter", { x: 2 }), recording(seen, "Bear Cub"));
    // VM 2 ou moins, de votre cimetière : ni l'Ange (VM 5), ni Opt, ni la carte adverse.
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    const drifter = idOf(s, "p1", "battlefield", "Dune Drifter");
    expect(chars(s, drifter).types).not.toContain("Creature");
    s = settle(act(s, "p1", { type: "activate", source: drifter, ability: abilityIndex(s, drifter, "Équipage"), tap: [cub] }));
    expect(chars(s, drifter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, drifter)).toEqual([3, 3]);
  });

  it("Earthrumbler : exiler une carte d'artefact ou de créature de votre cimetière l'anime jusqu'à la fin du tour ; pas avec une autre carte", () => {
    const blocked = scenario({ p1: { battlefield: ["Earthrumbler"], graveyard: ["Opt"] } });
    expect(canActivate(blocked, "p1", idOf(blocked, "p1", "battlefield", "Earthrumbler"))).toBe(false);
    let s = scenario({ p1: { battlefield: ["Earthrumbler"], graveyard: ["Opt", "Bear Cub"] } });
    const rumbler = idOf(s, "p1", "battlefield", "Earthrumbler");
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    expect(chars(s, rumbler).types).not.toContain("Creature");
    s = settle(activate(s, "p1", rumbler, "Devient", { picks: { graveyardExile: [cub] } }));
    expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    const c = chars(s, rumbler);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([7, 6]);
    expect(c.keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, rumbler).types).not.toContain("Creature");
  });

  it("Embalmed Ascendant : Zombie 2/2 noir en arrivant ; à vitesse max seulement, une créature à vous qui meurt draine 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Swamp"], hand: ["Embalmed Ascendant"] } });
    s = settle(cast(s, "p1", "Embalmed Ascendant"));
    const zombie = idOf(s, "p1", "battlefield", "Zombie");
    expect(pt(s, zombie)).toEqual([2, 2]);
    expect(chars(s, zombie).colors).toEqual(["B"]);
    expect(s.players.p1?.speed).toBe(1);
    destroy(s, zombie);
    s = settle(act(s, "p1", { type: "pass" }));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);

    let t = scenario({ p1: { battlefield: ["Embalmed Ascendant", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    destroy(t, idOf(t, "p2", "battlefield", "Llanowar Elves"));
    t = settle(act(t, "p1", { type: "pass" }));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settle(act(t, "p1", { type: "pass" }));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
  });

  it("Endrider Spikespitter : à vitesse max, à votre entretien, la carte du dessus est exilée et jouable ce tour-ci ; rien en dessous", () => {
    const run = (speed: number) => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Endrider Spikespitter"], library: ["Mountain", ...lands("Forest", 5)] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      return s;
    };
    const s = run(4);
    expect(chars(s, idOf(s, "p1", "battlefield", "Endrider Spikespitter")).keywords).toContain("reach");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain");
    expect(mountain).toBeDefined();
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    const t = run(3);
    expect(t.exile).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Mountain"]);
  });

  it("Fang Guardian : flash ; une autre créature ou un Véhicule que vous contrôlez gagne +2/+2 jusqu'à la fin du tour", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub", "Hulldrifter", ...lands("Forest", 4)], hand: ["Fang Guardian"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p2", { type: "pass" });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Fang Guardian"), recording(seen, "Bear Cub"));
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(pt(s, cub)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
  });

  it("Fang-Druid Summoner : une carte de créature sans capacité, de votre cimetière ou de votre bibliothèque", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Fang-Druid Summoner"],
        graveyard: ["Kalakscion, Hunger Tyrant", "Llanowar Elves"],
      },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Fang-Druid Summoner"), recording(seen, "Kalakscion, Hunger Tyrant"));
    expect(seen[0]).toEqual(["Kalakscion, Hunger Tyrant"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Kalakscion, Hunger Tyrant"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Fang-Druid Summoner")).keywords).toContain("reach");

    let t = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Fang-Druid Summoner"],
        library: ["Llanowar Elves", "Opt", "Bear Cub", "Forest"],
      },
    });
    const seen2: string[][] = [];
    t = settle(cast(t, "p1", "Fang-Druid Summoner"), recording(seen2, "Bear Cub"));
    expect(seen2.at(-1)).toEqual(["Bear Cub"]);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(t.players.p1?.library).toHaveLength(3);
  });

  it("Foul Roads : arrive engagée sans Monture ni Véhicule ; {T} : {B} ; {1}{B}, {T}, sacrifice : Pilote 1/1, en rituel seulement", () => {
    let s = scenario({ p1: { hand: ["Foul Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Foul Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Foul Roads")]?.tapped).toBe(true);
    let m = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Foul Roads"] } });
    m = act(m, "p1", { type: "playLand", card: idOf(m, "p1", "hand", "Foul Roads") });
    const roads = idOf(m, "p1", "battlefield", "Foul Roads");
    expect(m.objects[roads]?.tapped).toBe(false);
    expect(legalActions(m, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []))).toEqual(["B"]);

    let t = scenario({ p1: { battlefield: ["Foul Roads", "Swamp", "Swamp"] } });
    const road = idOf(t, "p1", "battlefield", "Foul Roads");
    t = settle(activate(t, "p1", road, "Pilote"));
    const pilot = idOf(t, "p1", "battlefield", "Pilot");
    expect(pt(t, pilot)).toEqual([1, 1]);
    expect(chars(t, pilot).colors).toEqual([]);
    expect(idsOf(t, "p1", "graveyard", "Foul Roads")).toHaveLength(1);
    // Pendant le tour adverse : pas d'activation.
    let o = scenario({ active: "p2", p1: { battlefield: ["Foul Roads", "Swamp", "Swamp"] } });
    o = act(o, "p2", { type: "pass" });
    expect(canActivate(o, "p1", idOf(o, "p1", "battlefield", "Foul Roads"))).toBe(false);
  });

  it("Fuel the Flames : 2 blessures à chaque créature, des deux camps ; cycle {2}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Fuel the Flames"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Fuel the Flames"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);

    let t = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Fuel the Flames"], library: lands("Island", 3) } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Fuel the Flames"), "Cycle"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
    expect(idsOf(t, "p1", "graveyard", "Fuel the Flames")).toHaveLength(1);
  });

  it("Gallant Strike : détruit une créature d'endurance 4 ou plus, pas une autre ; cycle {2}", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Bear Cub"], hand: ["Gallant Strike"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toEqual([angel]);
    s = settle(cast(s, "p1", "Gallant Strike", { targets: { t: [angel] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Gallant Strike"], library: lands("Island", 3) } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Gallant Strike"), "Cycle"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Gastal Raider : l'adversaire ciblé défausse l'éphémère ou le rituel que vous choisissez ; vitesse max : +1/+1 et la menace", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Gastal Raider"] },
      p2: { hand: ["Opt", "Shock", "Bear Cub"] },
    });
    const seen: string[][] = [];
    const chooser: string[] = [];
    s = settle(cast(s, "p1", "Gastal Raider"), (req, p, cur) => {
      if (req.type === "pick" && req.options.some((o) => cur.objects[o as string])) chooser.push(p);
      return recording(seen, "Shock")(req, p, cur);
    });
    // C'est vous qui choisissez, parmi les éphémères et rituels seulement.
    expect(chooser).toEqual(["p1"]);
    expect(seen.at(-1)?.sort()).toEqual(["Opt", "Shock"]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Shock"]);
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Bear Cub", "Opt"]);
    const raider = idOf(s, "p1", "battlefield", "Gastal Raider");
    expect(pt(s, raider)).toEqual([2, 1]);
    expect(chars(s, raider).keywords).not.toContain("menace");
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(pt(s, raider)).toEqual([3, 2]);
    expect(chars(s, raider).keywords).toContain("menace");
  });

  it("Gastal Thrillseeker : 1 blessure à l'adversaire ciblé et +1 PV en arrivant ; vitesse max : contact mortel et célérité", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Gastal Thrillseeker"] } });
    s = settle(cast(s, "p1", "Gastal Thrillseeker"));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    const lizard = idOf(s, "p1", "battlefield", "Gastal Thrillseeker");
    expect(chars(s, lizard).keywords).not.toContain("deathtouch");
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(chars(s, lizard).keywords).toEqual(expect.arrayContaining(["deathtouch", "haste"]));
  });

  it("Gloryheath Lynx : lien de vie ; attaque en étant montée : une carte de Plaine de base en main, pas sans être montée", () => {
    const run = (saddled: boolean) => {
      let s = scenario({ p1: { battlefield: ["Gloryheath Lynx", "Bear Cub"], library: ["Forest", "Plains", "Forest"] } });
      const lynx = idOf(s, "p1", "battlefield", "Gloryheath Lynx");
      if (saddled) {
        s = act(s, "p1", {
          type: "activate",
          source: lynx,
          ability: abilityIndex(s, lynx, "Monture"),
          tap: [idOf(s, "p1", "battlefield", "Bear Cub")],
        });
        s = passBoth(s);
      }
      return throughCombat(attack(s, [lynx]));
    };
    const s = run(true);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    const t = run(false);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(t.players.p1?.library).toHaveLength(3);
  });

  it("Greenbelt Guardian : {G} donne le piétinement à une créature ciblée ; exhaust {3}{G} : trois marqueurs +1/+1, une seule fois", () => {
    let s = scenario({
      p1: { battlefield: ["Greenbelt Guardian", ...lands("Forest", 9)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const guardian = idOf(s, "p1", "battlefield", "Greenbelt Guardian");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activate(s, "p1", guardian, "Piétinement", { targets: { t: [angel] } }));
    expect(chars(s, angel).keywords).toContain("trample");
    const exhaust = abilityIndex(s, guardian, "Exhaust");
    s = settle(act(s, "p1", { type: "activate", source: guardian, ability: exhaust }));
    expect(s.objects[guardian]?.counters["+1/+1"]).toBe(3);
    expect(pt(s, guardian)).toEqual([5, 5]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === guardian && a.ability === exhaust)).toBe(
      false,
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).keywords).not.toContain("trample");
  });

  it("Guidelight Pathmaker : la carte d'artefact cherchée arrive sur le champ de bataille si sa VM est 2 ou moins, sinon en main", () => {
    const run = (want: string) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 3)],
          hand: ["Guidelight Pathmaker"],
          library: [artifact("Rouage", 2), "Opt", artifact("Engrenage", 3), "Island"],
        },
      });
      const seen: string[][] = [];
      s = settle(cast(s, "p1", "Guidelight Pathmaker"), (req, p, cur) =>
        req.type === "yesNo" ? [1] : recording(seen, want)(req, p, cur),
      );
      expect(seen.at(-1)?.sort()).toEqual(["Engrenage", "Rouage"]);
      return s;
    };
    const s = run("Rouage");
    expect(idsOf(s, "p1", "battlefield", "Rouage")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Guidelight Pathmaker")).keywords).toContain("vigilance");
    const t = run("Engrenage");
    expect(idsOf(t, "p1", "battlefield", "Engrenage")).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Engrenage"]);
  });

  it("Guidelight Synergist : +1/+0 pour chaque artefact que vous contrôlez (elle comprise), pas ceux de l'adversaire", () => {
    const s = scenario({
      p1: { battlefield: ["Guidelight Synergist", "Hulldrifter"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const bot = idOf(s, "p1", "battlefield", "Guidelight Synergist");
    expect(pt(s, bot)).toEqual([2, 4]);
    expect(chars(s, bot).keywords).toContain("flying");
    const alone = scenario({ p1: { battlefield: ["Guidelight Synergist"] } });
    expect(pt(alone, idOf(alone, "p1", "battlefield", "Guidelight Synergist"))).toEqual([1, 4]);
  });

  it("Haunt the Network : deux Thopters 1/1 volants, puis l'adversaire ciblé perd X PV et vous en gagnez X (X : vos artefacts)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 3), "Hulldrifter"], hand: ["Haunt the Network"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    s = settle(cast(s, "p1", "Haunt the Network", { targets: { t: ["p2"] } }));
    const thopters = idsOf(s, "p1", "battlefield", "Thopter");
    expect(thopters).toHaveLength(2);
    const c = chars(s, thopters[0] as string);
    expect([c.power, c.toughness, c.colors]).toEqual([1, 1, []]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("flying");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
  });

  it("Haunted Hellride : quand vous attaquez, une créature que vous contrôlez gagne +1/+0 et le contact mortel, et se dégage ; Équipage 1", () => {
    let s = scenario({
      p1: { battlefield: ["Haunted Hellride", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const ride = idOf(s, "p1", "battlefield", "Haunted Hellride");
    s = settle(act(s, "p1", { type: "activate", source: ride, ability: abilityIndex(s, ride, "Équipage"), tap: [elves] }));
    expect(pt(s, ride)).toEqual([3, 3]);
    const seen: string[][] = [];
    s = settle(attack(s, [cub]), recording(seen, "Bear Cub"));
    // Vos créatures seulement (le Véhicule animé compris), pas l'Ange adverse.
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Haunted Hellride", "Llanowar Elves"]);
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(pt(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("deathtouch");
    expect(s.combat?.attackers.some((a) => a.id === cub)).toBe(true);
  });

  it("Hellish Sideswipe : sacrifiez un artefact ou une créature ; détruit une créature ou un Véhicule ; piochez si le sacrifié était un Véhicule", () => {
    const none = scenario({ p1: { battlefield: ["Swamp"], hand: ["Hellish Sideswipe"] }, p2: { battlefield: ["Serra Angel"] } });
    expect(castable(none, "p1", idOf(none, "p1", "hand", "Hellish Sideswipe"))).toBe(false);

    let s = scenario({
      p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Hellish Sideswipe"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(
      cast(s, "p1", "Hellish Sideswipe", { targets: { t: [angel] }, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
    );
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);

    let t = scenario({
      p1: { battlefield: ["Swamp", "Hulldrifter"], hand: ["Hellish Sideswipe"], library: lands("Island", 3) },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const theirs = idOf(t, "p2", "battlefield", "Hulldrifter");
    t = settle(
      cast(t, "p1", "Hellish Sideswipe", { targets: { t: [theirs] }, sacrifice: [idOf(t, "p1", "battlefield", "Hulldrifter")] }),
    );
    expect(idsOf(t, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Hour of Victory : Zombie 2/2 en arrivant ; vitesse max, {1}{B}, sacrifice : une carte de votre bibliothèque en main", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Hour of Victory"], library: ["Forest", "Opt", "Forest"] },
    });
    s = settle(cast(s, "p1", "Hour of Victory"));
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
    expect(s.players.p1?.speed).toBe(1);
    const hour = idOf(s, "p1", "battlefield", "Hour of Victory");
    expect(canActivate(s, "p1", hour)).toBe(false);
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", hour, "Vitesse max"), recording([], "Opt"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "graveyard", "Hour of Victory")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Kalakscion, Hunger Tyrant : créature légendaire 7/2 sans capacité ; règle des légendes", () => {
    let s = scenario({
      p1: { battlefield: ["Kalakscion, Hunger Tyrant", ...lands("Swamp", 3)], hand: ["Kalakscion, Hunger Tyrant"] },
    });
    const first = idOf(s, "p1", "battlefield", "Kalakscion, Hunger Tyrant");
    const c = chars(s, first);
    expect([c.power, c.toughness]).toEqual([7, 2]);
    expect(c.abilities).toHaveLength(0);
    expect(c.keywords).toHaveLength(0);
    expect(c.supertypes).toContain("Legendary");
    s = settle(cast(s, "p1", "Kalakscion, Hunger Tyrant"), picking([first]));
    expect(idsOf(s, "p1", "battlefield", "Kalakscion, Hunger Tyrant")).toEqual([first]);
    expect(idsOf(s, "p1", "graveyard", "Kalakscion, Hunger Tyrant")).toHaveLength(1);
  });

  it("Lagorin : attaque en étant montée, un marqueur +1/+1 sur chacune de jusqu'à deux Montures ou Véhicules ciblés ; rien sans être montée", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Lagorin, Soul of Alacria", "Bear Cub", "Gilded Ghoda"] },
        p2: { battlefield: ["Hulldrifter"] },
      });
    let s = setup();
    const lagorin = idOf(s, "p1", "battlefield", "Lagorin, Soul of Alacria");
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    expect(chars(s, lagorin).keywords).toContain("flying");
    s = act(s, "p1", {
      type: "activate",
      source: lagorin,
      ability: abilityIndex(s, lagorin, "Monture"),
      tap: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = passBoth(s);
    const seen: string[][] = [];
    s = settle(attack(s, [lagorin]), (req, p, cur) => {
      recording(seen)(req, p, cur);
      return req.type === "pick" ? [ghoda, hull] : undefined;
    });
    expect(seen[0]?.sort()).toEqual(["Gilded Ghoda", "Hulldrifter", "Lagorin, Soul of Alacria"]);
    expect(s.objects[ghoda]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[hull]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[lagorin]?.counters["+1/+1"] ?? 0).toBe(0);

    let t = setup();
    const lag2 = idOf(t, "p1", "battlefield", "Lagorin, Soul of Alacria");
    const none: string[][] = [];
    t = settle(attack(t, [lag2]), recording(none));
    expect(none).toHaveLength(0);
    expect(Object.values(t.objects).every((o) => !o.counters["+1/+1"])).toBe(true);
  });
});

describe("Aetherdrift, lot K8 : peu communes (3)", () => {
  /** Répond « oui » aux questions et choisit les objets voulus. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const hasAbility = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Cibles légales proposées pour le sort `card` (mode `mode`, cible `slot`). */
  const legalTargets = (s: S, card: string, slot = 0, mode = 0) => {
    const o = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    return o?.type === "cast" ? (o.modes.find((m) => m.index === mode)?.targets[slot]?.legal ?? []) : [];
  };
  const toEnd = (s: S) => advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);

  it("Locust Spray : la créature ciblée prend -1/-1 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Locust Spray"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Locust Spray", { targets: { t: [cub] } }));
    expect(pt(s, cub)).toEqual([1, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
  });

  it("Locust Spray : cycle {B} — défaussez-la, piochez une carte", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Locust Spray"], library: lands("Plains", 3) } });
    const spray = idOf(s, "p1", "hand", "Locust Spray");
    s = settle(activate(s, "p1", spray, "Cycle"));
    expect(idsOf(s, "p1", "graveyard", "Locust Spray")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
  });

  it("Marshals' Pathcruiser : un terrain de base en main en arrivant ; exhaust {W}{U}{B}{R}{G} : créature-artefact avec deux marqueurs", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Marshals' Pathcruiser"], library: ["Opt", "Island", "Opt"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Marshals' Pathcruiser"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Island"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);

    let t = scenario({
      p1: { battlefield: ["Marshals' Pathcruiser", "Plains", "Island", "Swamp", "Mountain", "Forest"] },
    });
    const cruiser = idOf(t, "p1", "battlefield", "Marshals' Pathcruiser");
    expect(chars(t, cruiser).types).not.toContain("Creature");
    t = settle(activate(t, "p1", cruiser, "Exhaust"));
    expect(chars(t, cruiser).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(t, cruiser)).toEqual([8, 7]);
    expect(hasAbility(t, "p1", cruiser, "Exhaust")).toBe(false);
    // Sans durée : il reste une créature les tours suivants (611.2a).
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(t, cruiser).types).toContain("Creature");
  });

  it("Rangers' Refueler : exhaust {4} — devient une créature-artefact pour de bon, avec un marqueur +1/+1 ; il pioche une carte", () => {
    let s = scenario({ p1: { battlefield: ["Rangers' Refueler", ...lands("Island", 4)] } });
    const refueler = idOf(s, "p1", "battlefield", "Rangers' Refueler");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", refueler, "Exhaust"));
    expect(chars(s, refueler).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, refueler)).toEqual([4, 4]);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, refueler).types).toContain("Creature");
  });

  it("Memory Guardian : coûte {1} de moins par artefact que vous contrôlez", () => {
    const gadget = (n: number) => customCard({ name: `Gadget ${n}`, typeLine: "Artifact", types: ["Artifact"] });
    const s = scenario({
      p1: { battlefield: [gadget(1), gadget(2), gadget(3), "Island", "Island"], hand: ["Memory Guardian"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Memory Guardian"))).toBe(true);
    const t = scenario({ p1: { battlefield: [gadget(1), gadget(2), "Island", "Island"], hand: ["Memory Guardian"] } });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Memory Guardian"))).toBe(false);
    const g = settle(cast(s, "p1", "Memory Guardian"));
    expect(chars(g, idOf(g, "p1", "battlefield", "Memory Guardian")).keywords).toContain("flying");
  });

  it("Molt Tender : {T} : meulez une carte ; {T}, exilez une carte du cimetière : un mana de n'importe quelle couleur", () => {
    let s = scenario({ p1: { battlefield: ["Molt Tender"], library: ["Opt", "Island"] } });
    const tender = idOf(s, "p1", "battlefield", "Molt Tender");
    // Cimetière vide : la capacité de mana ne peut pas être activée.
    expect(hasAbility(s, "p1", tender, "Un mana")).toBe(false);
    s = settle(activate(s, "p1", tender, "Meulez"));
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(1);
    expect(s.objects[tender]?.tapped).toBe(true);

    let t = scenario({ p1: { battlefield: ["Molt Tender"], graveyard: ["Opt"] } });
    const t2 = idOf(t, "p1", "battlefield", "Molt Tender");
    t = activate(t, "p1", t2, "Un mana");
    if (t.pending?.kind === "choice") t = act(t, "p1", { type: "choose", values: ["B"] });
    expect(t.players.p1?.manaPool.B).toBe(1);
    expect(t.players.p1?.graveyard).toHaveLength(0);
    expect(namesIn(t, t.exile)).toEqual(["Opt"]);
    expect(t.stack).toHaveLength(0); // capacité de mana : pas de pile
  });

  it("Momentum Breaker : chaque adversaire sacrifie une créature ou un Véhicule de son choix, sinon défausse une carte", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Momentum Breaker"] },
      p2: { battlefield: ["Bear Cub", "Hulldrifter"], hand: ["Opt"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    s = settle(cast(s, "p1", "Momentum Breaker"), choosing([hull]));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p1?.speed).toBe(1);

    let t = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Momentum Breaker"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    t = settle(cast(t, "p1", "Momentum Breaker"));
    expect(idsOf(t, "p2", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Island")).toHaveLength(1);
  });

  it("Momentum Breaker : {2}, sacrifiez-le : vous gagnez autant de PV que votre vitesse", () => {
    let s = scenario({ p1: { battlefield: ["Momentum Breaker", ...lands("Swamp", 2)] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Momentum Breaker"), "PV"));
    expect(s.players.p1?.life).toBe(23);
    expect(idsOf(s, "p1", "graveyard", "Momentum Breaker")).toHaveLength(1);
  });

  it("Nesting Bot : un Servo 1/1 quand il meurt ; vitesse max : +1/+0", () => {
    let s = scenario({
      p1: { battlefield: ["Nesting Bot"] },
      p2: { battlefield: ["Swamp"], hand: ["Locust Spray"] },
      active: "p2",
    });
    const bot = idOf(s, "p1", "battlefield", "Nesting Bot");
    expect(pt(s, bot)).toEqual([1, 1]);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(pt(s, bot)).toEqual([2, 1]);
    s = settle(cast(s, "p2", "Locust Spray", { targets: { t: [bot] } }));
    expect(idsOf(s, "p1", "graveyard", "Nesting Bot")).toHaveLength(1);
    const servo = idOf(s, "p1", "battlefield", "Servo");
    expect(pt(s, servo)).toEqual([1, 1]);
    expect(chars(s, servo).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Ooze Patrol : meulez deux cartes, puis un marqueur par carte d'artefact ou de créature du cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Ooze Patrol"],
        library: ["Bear Cub", "Island"],
        graveyard: ["Hulldrifter", "Opt"],
      },
    });
    s = settle(cast(s, "p1", "Ooze Patrol"));
    expect(s.players.p1?.library).toHaveLength(0);
    const ooze = idOf(s, "p1", "battlefield", "Ooze Patrol");
    // Bear Cub (créature) et Hulldrifter (artefact) ; ni Opt ni l'Île.
    expect(s.objects[ooze]?.counters["+1/+1"]).toBe(2);
    expect(pt(s, ooze)).toEqual([4, 4]);
  });

  it("Outpace Oblivion : 5 blessures à jusqu'à une créature ou un planeswalker ciblé", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Outpace Oblivion"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Outpace Oblivion"), choosing([angel]));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(20);
  });

  it("Outpace Oblivion : {2}, sacrifiez-le : 2 blessures à chaque joueur qui n'a pas la vitesse max", () => {
    let s = scenario({ p1: { battlefield: ["Outpace Oblivion", ...lands("Mountain", 2)] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Outpace Oblivion"), "2 blessures"));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
    let t = scenario({ p1: { battlefield: ["Outpace Oblivion", ...lands("Mountain", 2)] } });
    t.players.p1!.speed = 3;
    t.version += 1;
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Outpace Oblivion"), "2 blessures"));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([18, 18]);
  });

  it("Pacesetter Paragon : exhaust {2}{R} — un marqueur +1/+1 et la double initiative jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Pacesetter Paragon", ...lands("Mountain", 6)] } });
    const pal = idOf(s, "p1", "battlefield", "Pacesetter Paragon");
    s = settle(activate(s, "p1", pal, "Exhaust"));
    expect(pt(s, pal)).toEqual([3, 4]);
    expect(chars(s, pal).keywords).toContain("doubleStrike");
    expect(hasAbility(s, "p1", pal, "Exhaust")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, pal).keywords).not.toContain("doubleStrike");
    expect(pt(s, pal)).toEqual([3, 4]);
  });

  it("Pit Automaton : {C}{C} seulement pour activer des capacités ; défenseur", () => {
    const s = scenario({ p1: { battlefield: ["Pit Automaton", "Pit Automaton"], hand: ["Pit Automaton"] } });
    const [a, b] = idsOf(s, "p1", "battlefield", "Pit Automaton") as [string, string];
    expect(chars(s, a).keywords).toContain("defender");
    // Le mana des deux Automates ne paie pas un sort à {2}…
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Pit Automaton"))).toBe(false);
    // … mais il paie le {2} de la capacité de l'autre.
    expect(hasAbility(s, "p1", b, "Copiez")).toBe(true);
  });

  it("Pit Automaton : la prochaine capacité d'exhaust de ce tour est copiée", () => {
    let s = scenario({ p1: { battlefield: ["Pit Automaton", "Prowcatcher Specialist", ...lands("Mountain", 6)] } });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Pit Automaton"), "Copiez"));
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    s = settle(activate(s, "p1", pro, "Exhaust"));
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(4);
  });

  it("Plow Through : votre créature se bat contre une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Serra Angel"], hand: ["Plow Through"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const card = idOf(s, "p1", "hand", "Plow Through");
    expect(legalTargets(s, card, 0)).not.toContain(cub);
    expect(legalTargets(s, card, 1)).not.toContain(angel);
    s = settle(cast(s, "p1", "Plow Through", { mode: 0, targets: { a: [angel], b: [cub] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[angel]?.damage).toBe(2);
  });

  it("Plow Through : détruisez un Véhicule ciblé (pas une autre créature)", () => {
    let s = scenario({
      p1: { battlefield: ["Forest"], hand: ["Plow Through"] },
      p2: { battlefield: ["Hulldrifter", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Plow Through");
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    expect(legalTargets(s, card, 0, 1)).toEqual([hull]);
    s = settle(cast(s, "p1", "Plow Through", { mode: 1, targets: { t: [hull] } }));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
  });

  it("Point the Way : {3}{G}, sacrifiez-le : jusqu'à X terrains de base engagés, X étant votre vitesse", () => {
    let s = scenario({
      p1: { battlefield: ["Point the Way", ...lands("Forest", 4)], library: ["Plains", "Opt", "Island", "Swamp"] },
    });
    s.players.p1!.speed = 2;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Point the Way"), "terrains"));
    const fetched = s.battlefield.filter((id) => ["Plains", "Island", "Swamp"].includes(chars(s, id).name));
    expect(fetched).toHaveLength(2);
    expect(fetched.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Point the Way")).toHaveLength(1);
  });

  it("Pride of the Road : vitesse max — au début du combat, double initiative à une créature ou un Véhicule que vous contrôlez", () => {
    let s = scenario({ p1: { battlefield: ["Pride of the Road", "Bear Cub"] } });
    const pride = idOf(s, "p1", "battlefield", "Pride of the Road");
    expect(chars(s, pride).keywords).toContain("vigilance");
    s.players.p1!.speed = 3;
    s.version += 1;
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(chars(s, pride).keywords).not.toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");

    let t = scenario({ p1: { battlefield: ["Pride of the Road", "Bear Cub"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && (x.stack.length > 0 || x.pending?.kind === "choice"));
    t = settle(t, choosing([cub]));
    expect(chars(t, cub).keywords).toContain("doubleStrike");
    expect(chars(t, idOf(t, "p1", "battlefield", "Pride of the Road")).keywords).not.toContain("doubleStrike");
  });

  it("Push the Limit : Montures et Véhicules reviennent du cimetière, deviennent des créatures avec la célérité, puis sont sacrifiés", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 7),
        hand: ["Push the Limit"],
        graveyard: ["Hulldrifter", "Gilded Ghoda", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Push the Limit"));
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(chars(s, hull).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, hull).keywords).toContain("haste");
    expect(chars(s, ghoda).keywords).toContain("haste");
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && idsOf(x, "p1", "graveyard", "Hulldrifter").length > 0,
    );
    expect(idsOf(s, "p1", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Gilded Ghoda")).toHaveLength(1);
  });

  it("Racers' Scoreboard : piochez deux cartes puis défaussez-en une ; vitesse max : vos sorts coûtent {1} de moins", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Racers' Scoreboard", "Opt"], library: lands("Plains", 4) },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(cast(s, "p1", "Racers' Scoreboard"), choosing([opt]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains", "Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);

    const t = scenario({ p1: { battlefield: ["Racers' Scoreboard", "Forest"], hand: ["Bear Cub"] } });
    const cub = idOf(t, "p1", "hand", "Bear Cub");
    t.players.p1!.speed = 3;
    t.version += 1;
    expect(castable(t, "p1", cub)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    expect(castable(t, "p1", cub)).toBe(true);
  });

  it("Rangers' Aetherhive : un Thopter 1/1 volant chaque fois que vous activez une capacité d'exhaust", () => {
    let s = scenario({ p1: { battlefield: ["Rangers' Aetherhive", "Prowcatcher Specialist", ...lands("Mountain", 4)] } });
    const hive = idOf(s, "p1", "battlefield", "Rangers' Aetherhive");
    expect(chars(s, hive).keywords).toContain("vigilance");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    const thopter = idOf(s, "p1", "battlefield", "Thopter");
    expect(pt(s, thopter)).toEqual([1, 1]);
    expect(chars(s, thopter).keywords).toContain("flying");
    // L'exhaust d'un adversaire ne compte pas.
    let t = scenario({
      p1: { battlefield: ["Rangers' Aetherhive"] },
      p2: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)] },
      active: "p2",
    });
    t = settle(activate(t, "p2", idOf(t, "p2", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    expect(idsOf(t, "p1", "battlefield", "Thopter")).toHaveLength(0);
  });

  it("Reef Roads : {U} ; {1}{U}, {T}, sacrifiez-le : un Pilote 1/1, seulement en rituel", () => {
    let s = scenario({ p1: { battlefield: ["Reef Roads", "Island", "Island"] } });
    const roads = idOf(s, "p1", "battlefield", "Reef Roads");
    expect(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []))).toEqual(["U"]);
    s = settle(activate(s, "p1", roads, "Pilote"));
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Reef Roads")).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Reef Roads", "Island", "Island"] }, active: "p2" });
    expect(hasAbility(t, "p1", idOf(t, "p1", "battlefield", "Reef Roads"), "Pilote")).toBe(false);
  });

  it("Reef Roads : arrive engagé sauf si vous contrôlez une Monture ou un Véhicule", () => {
    let s = scenario({ p1: { hand: ["Reef Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Reef Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Reef Roads")]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Reef Roads"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Reef Roads") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Reef Roads")]?.tapped).toBe(false);
  });

  it("Rise from the Wreck : jusqu'à une carte de créature, une de Monture, une de Véhicule et une de créature sans capacité", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["Rise from the Wreck"],
        graveyard: ["Serra Angel", "Gilded Ghoda", "Hulldrifter", "Bear Cub", "Opt"],
      },
    });
    const g = (n: string) => idOf(s, "p1", "graveyard", n);
    const card = idOf(s, "p1", "hand", "Rise from the Wreck");
    expect(legalTargets(s, card, 1)).toEqual([g("Gilded Ghoda")]);
    expect(legalTargets(s, card, 2)).toEqual([g("Hulldrifter")]);
    expect(legalTargets(s, card, 3)).toEqual([g("Bear Cub")]);
    expect(legalTargets(s, card, 0)).not.toContain(g("Opt"));
    s = settle(
      cast(s, "p1", "Rise from the Wreck", {
        targets: { a: [g("Serra Angel")], b: [g("Gilded Ghoda")], c: [g("Hulldrifter")], d: [g("Bear Cub")] },
      }),
    );
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Gilded Ghoda", "Hulldrifter", "Serra Angel"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt", "Rise from the Wreck"]);
  });

  it("Risen Necroregent : vitesse max — un Zombie 2/2 au début de votre étape de fin, pas en dessous", () => {
    let s = scenario({ p1: { battlefield: ["Risen Necroregent"] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    s = toEnd(s);
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
    let t = scenario({ p1: { battlefield: ["Risen Necroregent"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    t = advanceUntil(t, (x) => idsOf(x, "p1", "battlefield", "Zombie").length > 0 || x.turn.active === "p2");
    const zombie = idOf(t, "p1", "battlefield", "Zombie");
    expect(t.turn.step).toBe("end");
    expect(pt(t, zombie)).toEqual([2, 2]);
    expect(chars(t, zombie).colors).toEqual(["B"]);
  });

  it("Road Rage : X blessures, X valant 2 plus le nombre de Montures et Véhicules que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Hulldrifter"], hand: ["Road Rage"] },
      p2: { battlefield: ["Serra Angel", "Gilded Ghoda"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Road Rage", { targets: { t: [angel] } }));
    // 2 + Hulldrifter ; la Monture adverse ne compte pas.
    expect(s.objects[angel]?.damage).toBe(3);
    let t = scenario({
      p1: { battlefield: ["Mountain", "Hulldrifter", "Gilded Ghoda"], hand: ["Road Rage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Road Rage", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Roadside Assistance : enchante un Véhicule ; Pilote 1/1 en arrivant ; +1/+1 et le lien de vie", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Hulldrifter"], hand: ["Roadside Assistance"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(cast(s, "p1", "Roadside Assistance", { targets: { enchant: [hull] } }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Roadside Assistance")]?.attachedTo).toBe(hull);
    expect(pt(s, hull)).toEqual([4, 3]);
    expect(chars(s, hull).keywords).toContain("lifelink");
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
  });

  it("Roadside Blowout : renvoie une créature ou un Véhicule adverse, piochez ; {2} de moins contre une valeur de mana 1", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Roadside Blowout"], library: lands("Plains", 3) },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Roadside Blowout", { targets: { t: [elves] } }));
    expect(idsOf(s, "p2", "hand", "Llanowar Elves")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    // Contre une valeur de mana 5, le coût plein est dû : une Île ne suffit pas.
    const t = scenario({
      p1: { battlefield: ["Island"], hand: ["Roadside Blowout"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() => cast(t, "p1", "Roadside Blowout", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } })).toThrow();
    const u = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Roadside Blowout"] },
      p2: { battlefield: ["Serra Angel", "Island"] },
    });
    const card = idOf(u, "p1", "hand", "Roadside Blowout");
    expect(legalTargets(u, card)).toEqual([idOf(u, "p2", "battlefield", "Serra Angel")]);
  });
});

describe("Aetherdrift, lot K8 : peu communes (4)", () => {
  /** Active la capacité de `source` dont le libellé commence par `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });
  /** Légende vanille : caractéristiques imprimées, aucune capacité. */
  const vanillaLegend = (name: string, power: number, toughness: number, mv: number, subtypes: string[]) => {
    const s = scenario({ p1: { battlefield: [name] } });
    const c = chars(s, idOf(s, "p1", "battlefield", name));
    expect([c.power, c.toughness]).toEqual([power, toughness]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(subtypes);
    expect(c.abilities).toHaveLength(0);
    expect(c.keywords).toHaveLength(0);
    expect(manaValue(s.defs[s.objects[idOf(s, "p1", "battlefield", name)]?.defId ?? ""]?.manaCost)).toBe(mv);
  };

  it("Rocketeer Boostbuggy : Équipage 1 ; chaque fois qu'il attaque, un Trésor", () => {
    let s = scenario({ p1: { battlefield: ["Rocketeer Boostbuggy", "Llanowar Elves"] } });
    const bug = idOf(s, "p1", "battlefield", "Rocketeer Boostbuggy");
    expect(chars(s, bug).types).not.toContain("Creature");
    s = settle(activate(s, "p1", bug, "Équipage"));
    expect(chars(s, bug).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, bug)).toEqual([3, 2]);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    s = settleNoBlocks(attack(s, [bug]));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    // Équipage : créature jusqu'à la fin du tour seulement.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bug).types).not.toContain("Creature");
  });

  it("Rocketeer Boostbuggy : exhaust {3} — devient une créature-artefact pour de bon, avec un marqueur +1/+1 ; une seule fois", () => {
    let s = scenario({ p1: { battlefield: ["Rocketeer Boostbuggy", ...lands("Mountain", 6)] } });
    const bug = idOf(s, "p1", "battlefield", "Rocketeer Boostbuggy");
    s = settle(activate(s, "p1", bug, "Exhaust"));
    expect(chars(s, bug).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, bug)).toEqual([4, 3]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === bug && a.label?.startsWith("Exhaust"))).toBe(
      false,
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bug).types).toContain("Creature");
  });

  it("Rover Blades : la créature équipée a la double initiative ; pilotée, elle devient une créature 2/2 à double initiative et se détache", () => {
    let s = scenario({ p1: { battlefield: ["Rover Blades", "Llanowar Elves", "Bear Cub", ...lands("Plains", 4)] } });
    const blades = idOf(s, "p1", "battlefield", "Rover Blades");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, blades).types).not.toContain("Creature");
    s = settle(activate(s, "p1", blades, "Équiper", { targets: { t: [elf] } }));
    expect(s.objects[blades]?.attachedTo).toBe(elf);
    expect(chars(s, elf).keywords).toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");
    // Équipage 2 avec l'Ourson (force 2) : une créature ne peut pas être attachée, l'Équipement se détache.
    s = settle(activate(s, "p1", blades, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(chars(s, blades).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, blades)).toEqual([2, 2]);
    expect(chars(s, blades).keywords).toContain("doubleStrike");
    expect(s.objects[blades]?.attachedTo).toBeFalsy();
    expect(chars(s, elf).keywords).not.toContain("doubleStrike");
  });

  it("Sabotage Strategist : les créatures qui vous attaquent ont -1/-0 jusqu'à la fin du tour, pas celles qui attaquent un autre joueur", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Angel", "Bear Cub", "Sabotage Strategist"] },
      p2: { battlefield: ["Sabotage Strategist"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const mine = chars(s, idOf(s, "p1", "battlefield", "Sabotage Strategist"));
    expect(mine.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = settle(attack(s, [angel, cub]));
    // Seul le Strategist de p2 (le joueur attaqué) se déclenche.
    expect(pt(s, angel)).toEqual([3, 4]);
    expect(pt(s, cub)).toEqual([1, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Sabotage Strategist : exhaust {5}{U}{U} — trois marqueurs +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Sabotage Strategist", ...lands("Island", 7)] } });
    const strat = idOf(s, "p1", "battlefield", "Sabotage Strategist");
    s = settle(activate(s, "p1", strat, "Exhaust"));
    expect(s.objects[strat]?.counters["+1/+1"]).toBe(3);
    expect(pt(s, strat)).toEqual([5, 5]);
    expect(canActivate(s, "p1", strat)).toBe(false);
  });

  it("Scrounging Skyray : autant de marqueurs +1/+1 que de cartes défaussées ensemble ; rien quand un adversaire se défausse", () => {
    let s = scenario({
      p1: { battlefield: ["Scrounging Skyray", "Mountain"], hand: ["Skycrash"] },
      p2: { battlefield: ["Mountain"], hand: ["Skycrash"] },
    });
    const ray2 = idOf(s, "p1", "battlefield", "Scrounging Skyray");
    expect(chars(s, ray2).keywords).toContain("flying");
    // Cycle : une carte défaussée, un marqueur.
    s = settle(activate(s, "p1", idOf(s, "p1", "hand", "Skycrash"), "Cycle"));
    expect(s.objects[ray2]?.counters["+1/+1"]).toBe(1);
    // L'adversaire cycle : pas de marqueur.
    s = act(s, "p1", { type: "pass" });
    s = settle(activate(s, "p2", idOf(s, "p2", "hand", "Skycrash"), "Cycle"));
    expect(s.objects[ray2]?.counters["+1/+1"]).toBe(1);
  });

  it("Scrounging Skyray : deux cartes défaussées en même temps (fin de tour, main de neuf cartes) donnent deux marqueurs", () => {
    let s = scenario({ step: "main2", p1: { battlefield: ["Scrounging Skyray"], hand: lands("Forest", 9) } });
    const ray = idOf(s, "p1", "battlefield", "Scrounging Skyray");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(7);
    s = settle(s);
    expect(s.objects[ray]?.counters["+1/+1"]).toBe(2);
  });

  it("Shefet Archfiend : en arrivant, toutes les autres créatures ont -2/-2 jusqu'à la fin du tour (pas celles qui arrivent après)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 7), ...lands("Forest", 2), "Llanowar Elves"],
        hand: ["Shefet Archfiend", "Bear Cub"],
      },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Shefet Archfiend"));
    const fiend = idOf(s, "p1", "battlefield", "Shefet Archfiend");
    expect(pt(s, fiend)).toEqual([5, 5]);
    expect(chars(s, fiend).keywords).toContain("flying");
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(pt(s, angel)).toEqual([2, 2]);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Skycrash : détruit un artefact ciblé (pas une créature non-artefact) ; cycle {R}", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Skycrash"] },
      p2: { battlefield: ["Hulldrifter", "Serra Angel"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toContain(hull);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(cast(s, "p1", "Skycrash", { targets: { t: [hull] } }));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Mountain"], hand: ["Skycrash"], library: ["Opt"] } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Skycrash"), "Cycle"));
    expect(idsOf(t, "p1", "graveyard", "Skycrash")).toHaveLength(1);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Skyserpent Seeker : exhaust {4} — révèle jusqu'à deux terrains, mis engagés sur le champ de bataille, le reste dessous ; marqueur +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: ["Skyserpent Seeker", ...lands("Forest", 4)],
        library: ["Opt", "Plains", "Shock", "Island", "Bear Cub", "Mountain"],
      },
    });
    const seeker = idOf(s, "p1", "battlefield", "Skyserpent Seeker");
    expect(chars(s, seeker).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
    s = settle(activate(s, "p1", seeker, "Exhaust"));
    const plains = idOf(s, "p1", "battlefield", "Plains");
    const island = idOf(s, "p1", "battlefield", "Island");
    expect([s.objects[plains]?.tapped, s.objects[island]?.tapped]).toEqual([true, true]);
    expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(0);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib.slice(0, 2)).toEqual(["Bear Cub", "Mountain"]);
    expect(lib.slice(2).sort()).toEqual(["Opt", "Shock"]);
    expect(s.objects[seeker]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", seeker)).toBe(false);
  });

  it("Slick Imitator : vitesse max — {1}, sacrifice : copie un sort que vous contrôlez ; pas avant la vitesse max ni sur un sort adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Slick Imitator", "Mountain", "Island"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const imitator = idOf(s, "p1", "battlefield", "Slick Imitator");
    s.players.p1!.speed = 3;
    s.version += 1;
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    expect(canActivate(s, "p1", imitator)).toBe(false);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(canActivate(s, "p1", imitator)).toBe(true);
    s = settle(activate(s, "p1", imitator, "Vitesse max", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p2?.life).toBe(16);
    expect(idsOf(s, "p1", "graveyard", "Slick Imitator")).toHaveLength(1);

    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Slick Imitator", "Island"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    t.players.p1!.speed = 4;
    t.version += 1;
    t = cast(t, "p2", "Shock", { targets: { t: ["p1"] } });
    t = act(t, "p2", { type: "pass" });
    expect(t.pending?.kind === "priority" && t.pending.player).toBe("p1");
    expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Slick Imitator"))).toBe(false);
  });

  it("Spire Mechcycle : célérité ; exhaust en engageant une autre Monture ou un autre Véhicule — créature-artefact, un marqueur par autre Monture ou Véhicule", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Spire Mechcycle", sick: true }, "Hulldrifter", "Gilded Ghoda", "Bear Cub"],
      },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const cycle = idOf(s, "p1", "battlefield", "Spire Mechcycle");
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(activate(s, "p1", cycle, "Exhaust", { tap: [hull] }));
    expect(s.objects[hull]?.tapped).toBe(true);
    expect(chars(s, cycle).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    // Hulldrifter et Gilded Ghoda : deux marqueurs (ni l'Ourson ni le Véhicule adverse).
    expect(s.objects[cycle]?.counters["+1/+1"]).toBe(2);
    expect(pt(s, cycle)).toEqual([7, 6]);
    // Célérité : il attaque le tour de son arrivée.
    s = attack(s, [cycle]);
    expect(s.combat?.attackers.some((a) => a.id === cycle)).toBe(true);

    // Aucune autre Monture ni aucun autre Véhicule dégagé : pas d'exhaust (l'équipage reste possible).
    const t = scenario({ p1: { battlefield: ["Spire Mechcycle", "Bear Cub", { name: "Hulldrifter", tapped: true }] } });
    const c2 = idOf(t, "p1", "battlefield", "Spire Mechcycle");
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === c2 && a.label?.startsWith("Exhaust"))).toBe(
      false,
    );
    // L'exhaust ne se termine pas avec le tour.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, cycle).types).toContain("Creature");
  });

  it("Sundial, Dawn Tyrant : créature-artefact légendaire 3/3 sans capacité", () => {
    vanillaLegend("Sundial, Dawn Tyrant", 3, 3, 2, ["Construct"]);
    const s = scenario({ p1: { battlefield: ["Sundial, Dawn Tyrant"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Sundial, Dawn Tyrant")).types).toEqual(
      expect.arrayContaining(["Artifact", "Creature"]),
    );
  });

  it("Terrian, World Tyrant : créature légendaire 9/7 sans capacité", () => {
    vanillaLegend("Terrian, World Tyrant", 9, 7, 5, ["Dinosaur", "Ooze"]);
  });

  it("Tyrox, Saurid Tyrant : créature légendaire 4/1 sans capacité", () => {
    vanillaLegend("Tyrox, Saurid Tyrant", 4, 1, 2, ["Dinosaur", "Warrior"]);
  });

  it("Thundering Broodwagon : en arrivant, détruit un permanent non-terrain adverse de valeur de mana 4 ou moins", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), ...lands("Forest", 2), "Llanowar Elves"], hand: ["Thundering Broodwagon"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Llanowar Elves", "Island"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Thundering Broodwagon"), (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options as string[]) as string[];
      return picking([cub])(req);
    });
    // Ni l'Ange (VM 5), ni l'Île, ni les Elfes de p1.
    expect(offered.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    const wagon = idOf(s, "p1", "battlefield", "Thundering Broodwagon");
    expect(chars(s, wagon).keywords).toEqual(expect.arrayContaining(["reach", "menace"]));
    expect(chars(s, wagon).types).not.toContain("Creature");
    expect(abilityIndex(s, wagon, "Équipage 3")).toBeGreaterThanOrEqual(0);
  });

  it("Transit Mage : vous pouvez chercher un artefact de valeur de mana 4 ou 5 ; refuser ne cherche rien", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Transit Mage"],
          library: [artifact("Rouage", 3), artifact("Engrenage", 4), artifact("Ressort", 5), artifact("Piston", 6)],
        },
      });
    let offered: string[] = [];
    let s = settle(cast(setup(), "p1", "Transit Mage"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(cur, req.options as string[]) as string[];
      return req.options.filter((o) => namesIn(cur, [o as string])[0] === "Ressort");
    });
    expect(offered.sort()).toEqual(["Engrenage", "Ressort"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Ressort"]);
    expect(s.players.p1?.library).toHaveLength(3);
    s = settle(cast(setup(), "p1", "Transit Mage"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(4);
  });

  it("Tune Up : renvoie une carte d'artefact de votre cimetière ; un Véhicule devient une créature-artefact pour de bon", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 8), hand: ["Tune Up", "Tune Up"], graveyard: ["Hulldrifter", artifact("Rouage", 3)] },
      p2: { graveyard: [artifact("Piston", 2)] },
    });
    const hull = idOf(s, "p1", "graveyard", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toHaveLength(2);
    expect(legal).not.toContain(s.players.p2?.graveyard[0]);
    s = settle(cast(s, "p1", "Tune Up", { targets: { t: [hull] } }));
    const back = idOf(s, "p1", "battlefield", "Hulldrifter");
    expect(chars(s, back).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    s = settle(cast(s, "p1", "Tune Up", { targets: { t: [idOf(s, "p1", "graveyard", "Rouage")] } }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Rouage")).types).toEqual(["Artifact"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, back).types).toContain("Creature");
  });

  it("Unswerving Sloth : s'il attaque en étant monté, indestructible jusqu'à la fin du tour et vos créatures se dégagent ; rien sinon", () => {
    let s = scenario({ p1: { battlefield: ["Unswerving Sloth", "Serra Angel", { name: "Bear Cub", tapped: true }] } });
    const sloth = idOf(s, "p1", "battlefield", "Unswerving Sloth");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", sloth, "Monture", { tap: [angel] }));
    expect(s.objects[angel]?.tapped).toBe(true);
    s = settleNoBlocks(attack(s, [sloth]));
    expect(chars(s, sloth).keywords).toContain("indestructible");
    expect([s.objects[angel]?.tapped, s.objects[cub]?.tapped, s.objects[sloth]?.tapped]).toEqual([false, false, false]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, sloth).keywords).not.toContain("indestructible");

    let t = scenario({ p1: { battlefield: ["Unswerving Sloth", { name: "Bear Cub", tapped: true }] } });
    const sloth2 = idOf(t, "p1", "battlefield", "Unswerving Sloth");
    t = settleNoBlocks(attack(t, [sloth2]));
    expect(chars(t, sloth2).keywords).not.toContain("indestructible");
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Veteran Beastrider : à votre étape de fin, vos créatures se dégagent (pas celles de l'adversaire) ; {2}{G}{W} : vos créatures +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: ["Veteran Beastrider", { name: "Bear Cub", tapped: true }, ...lands("Forest", 2), ...lands("Plains", 2)],
      },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Veteran Beastrider"), "Vos créatures"));
    expect(pt(s, mine)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Veteran Beastrider"))).toEqual([4, 5]);
    expect(pt(s, theirs)).toEqual([2, 2]);
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(s.turn.active).toBe("p1");
    expect(s.objects[mine]?.tapped).toBe(false);
    expect(s.objects[theirs]?.tapped).toBe(true);
  });

  it("Voyage Home : affinité pour les artefacts (les vôtres seulement) ; piochez trois cartes et gagnez 3 PV", () => {
    const setup = (artifacts: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Island", 2), ...Array(artifacts).fill(artifact("Rouage", 1))],
          hand: ["Voyage Home"],
        },
        p2: { battlefield: Array(3).fill(artifact("Piston", 1)) },
      });
    const few = setup(2);
    expect(castable(few, "p1", idOf(few, "p1", "hand", "Voyage Home"))).toBe(false);
    let s = setup(3);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Voyage Home"))).toBe(true);
    s = settle(cast(s, "p1", "Voyage Home"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Wickerfolk Indomitable : se lance depuis le cimetière en payant 2 PV et en sacrifiant un artefact ou une créature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], graveyard: ["Wickerfolk Indomitable"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const wicker = idOf(s, "p1", "graveyard", "Wickerfolk Indomitable");
    expect(castable(s, "p1", wicker)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: wicker, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "battlefield", "Wickerfolk Indomitable")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(18);
    expect(pt(s, idOf(s, "p1", "battlefield", "Wickerfolk Indomitable"))).toEqual([4, 3]);

    // Rien à sacrifier (la créature adverse ne compte pas) : pas de lancement depuis le cimetière.
    const t = scenario({
      p1: { battlefield: lands("Swamp", 4), graveyard: ["Wickerfolk Indomitable"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Wickerfolk Indomitable"))).toBe(false);
    // Depuis la main : aucun coût supplémentaire.
    let h = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wickerfolk Indomitable"] } });
    h = settle(cast(h, "p1", "Wickerfolk Indomitable"));
    expect(idsOf(h, "p1", "battlefield", "Wickerfolk Indomitable")).toHaveLength(1);
    expect(h.players.p1?.life).toBe(20);
  });

  it("Wild Roads : arrive engagé sauf avec une Monture ou un Véhicule ; {1}{G}, {T}, sacrifice : Pilote 1/1 incolore, en rituel seulement", () => {
    let s = scenario({ p1: { hand: ["Wild Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Wild Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Wild Roads")]?.tapped).toBe(true);
    let m = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Wild Roads"] } });
    m = act(m, "p1", { type: "playLand", card: idOf(m, "p1", "hand", "Wild Roads") });
    expect(m.objects[idOf(m, "p1", "battlefield", "Wild Roads")]?.tapped).toBe(false);

    let t = scenario({ p1: { battlefield: ["Wild Roads", "Forest", "Forest"] } });
    const roads = idOf(t, "p1", "battlefield", "Wild Roads");
    const manaColors = legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []));
    expect(manaColors).toEqual(["G"]);
    t = settle(activate(t, "p1", roads, "Pilote"));
    expect(idsOf(t, "p1", "graveyard", "Wild Roads")).toHaveLength(1);
    const pilot = idOf(t, "p1", "battlefield", "Pilot");
    expect(pt(t, pilot)).toEqual([1, 1]);
    expect(chars(t, pilot).colors).toEqual([]);

    // Au début du combat (priorité à p1, mais pas en rituel) : pas d'activation.
    const o = scenario({ step: "beginCombat", p1: { battlefield: ["Wild Roads", "Forest", "Forest"] } });
    expect(o.pending?.kind === "priority" && o.pending.player).toBe("p1");
    expect(canActivate(o, "p1", idOf(o, "p1", "battlefield", "Wild Roads"))).toBe(false);
  });

  it("Wretched Doll : {B}, {T} : surveillance 1", () => {
    let s = scenario({ p1: { battlefield: ["Wretched Doll", "Swamp", "Swamp"], library: ["Opt", "Island"] } });
    const doll = idOf(s, "p1", "battlefield", "Wretched Doll");
    expect(pt(s, doll)).toEqual([3, 1]);
    let seen: string[] = [];
    s = settle(activate(s, "p1", doll, "Surveillance"), (req, _p, cur) => {
      if (req.type !== "pick" || !req.intent.startsWith("surveil")) return undefined;
      seen = namesIn(cur, req.options as string[]) as string[];
      return req.options;
    });
    expect(seen).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[doll]?.tapped).toBe(true);
    expect(canActivate(s, "p1", doll)).toBe(false);
  });
});

describe("Wreck Remover (lot K8)", () => {
  it("en arrivant : exile jusqu'à une carte ciblée d'un cimetière, et vous gagnez 1 PV", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Wreck Remover"] }, p2: { graveyard: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "graveyard", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Wreck Remover") });
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values: p.request.type === "pick" && p.request.options.includes(angel) ? [angel] : p.request.suggested,
        });
      else break;
    }
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel")).toBe(true);
    expect(s.players.p1?.life).toBe(21);
  });
});

describe("Aetherdrift : approximations levées (lot A1)", () => {
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Webstrike Elite : seul un artefact ou enchantement de valeur de mana X peut être ciblé", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Webstrike Elite"], library: lands("Island", 3) },
      p2: { battlefield: [artifact("Rouage", 3), artifact("Engrenage", 2)] },
    });
    const elite = idOf(s, "p1", "hand", "Webstrike Elite");
    const cog = idOf(s, "p2", "battlefield", "Rouage");
    const gear = idOf(s, "p2", "battlefield", "Engrenage");
    let offered: string[] = [];
    s = settle(activate(s, "p1", elite, "Cycle", { x: 2 }), (req) => {
      if (req.type !== "pick" || !req.options.includes(gear)) return undefined;
      offered = req.options.map(String);
      return [gear];
    });
    expect(offered).toEqual([gear]);
    expect(offered).not.toContain(cog);
    expect(idsOf(s, "p2", "graveyard", "Engrenage")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Rouage")).toHaveLength(1);
  });

  it("Caradora : le marqueur +1/+1 de plus vaut pour vos créatures et vos Véhicules, pas pour vos autres permanents", async () => {
    const { changeCounters } = await import("../src/state");
    const s = scenario({ p1: { battlefield: ["Caradora, Heart of Alacria", "Spotcycle Scouter", artifact("Rouage", 1)] } });
    const vehicle = s.objects[idOf(s, "p1", "battlefield", "Spotcycle Scouter")];
    const cog = s.objects[idOf(s, "p1", "battlefield", "Rouage")];
    if (!vehicle || !cog) throw new Error("permanents introuvables");
    expect(chars(s, vehicle.id).types).not.toContain("Creature");
    changeCounters(s, vehicle, "+1/+1", 1);
    changeCounters(s, cog, "+1/+1", 1);
    expect(vehicle.counters["+1/+1"]).toBe(2);
    expect(cog.counters["+1/+1"]).toBe(1);
  });
});

describe("Aetherdrift : capacités retardées liées à un objet (PLAN-A, lot A4b)", () => {
  it("Grim Javelineer : +1/+0 à un attaquant ; quand il meurt ce tour-ci, surveillance 1, même s'il a perdu ses capacités", () => {
    let s = scenario({ p1: { battlefield: ["Grim Javelineer", "Bear Cub"], library: lands("Swamp", 3) } });
    const javelineer = idOf(s, "p1", "battlefield", "Grim Javelineer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [javelineer, bear]);
    s = settleNoBlocks(s, picking([bear]));
    expect(chars(s, bear).power).toBe(3);
    // La capacité retardée n'est pas une capacité de la créature : elle perd toutes ses capacités, puis meurt.
    s.effects.push({ id: "e-lose", timestamp: 999, affected: [bear], duration: "endOfTurn", loseAllAbilities: true });
    bump(s);
    expect(chars(s, bear).abilities).toHaveLength(0);
    destroy(s, bear);
    expect(s.triggers.map((t) => s.defs[t.sourceDefId]?.name)).toEqual(["Grim Javelineer"]);
    expect(s.triggers[0]?.controller).toBe("p1");
  });

  it("Grim Javelineer : la créature qui meurt au tour suivant ne déclenche rien", () => {
    let s = scenario({ p1: { battlefield: ["Grim Javelineer", "Bear Cub"], library: lands("Swamp", 3) } });
    const javelineer = idOf(s, "p1", "battlefield", "Grim Javelineer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [javelineer, bear]);
    s = settleNoBlocks(s, picking([bear]));
    expect(s.delayed).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.delayed).toHaveLength(0);
    destroy(s, bear);
    expect(s.triggers).toHaveLength(0);
  });
});
