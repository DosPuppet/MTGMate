/**
 * Aetherdrift, lot A : Véhicules et Montures (pilotes, équipage à l'endurance, « équipe / monte »), cycle avec X,
 * défausse groupée, Verges, Roads, épuiser.
 */
import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState, TokenSpec } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

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
