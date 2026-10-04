/**
 * Edge of Eternities, lot A : distorsion, vide, Drones, « deuxième sort », sacrifice, blessures de combat groupées,
 * terrains choc.
 */
import { card, TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { addEffect } from "../src/effects";
import { GameHost } from "../src/host";
import { legalActions } from "../src/legal";
import { changeCounters, chars, decider, moveObject } from "../src/state";
import { canBlock, declareBlockers } from "../src/turn";
import type { ChoiceRequest, ChoiceValue, GameState, PlayerId, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  castable,
  castNowOf,
  counterFrom,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
} from "./helpers";

type S = GameState;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("distorsion (702.185)", () => {
  it("lancée pour son coût de distorsion, exilée à l'étape de fin, relancée depuis l'exil un tour suivant", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Red Tiger Mechan"] } });
    const opts = legalActions(s, "p1").filter((a) => a.type === "cast");
    expect(opts.map((a) => (a.type === "cast" ? !!a.warp : null))).toEqual([false, true]);
    s = cast(s, "p1", "Red Tiger Mechan", { warp: true });
    s = passBoth(s);
    const tiger = idOf(s, "p1", "battlefield", "Red Tiger Mechan");
    expect(s.objects[tiger]?.cast?.via).toBe("warp");
    expect(s.players.p1?.manaPool.R).toBe(0);
    expect(s.objects[idsOf(s, "p1", "battlefield", "Mountain")[1] as string]?.tapped).toBe(true); // {1}{R}
    // Étape de fin : exilée ; pas relançable ce tour-ci.
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    const exiled = s.exile.find((id) => s.objects[id]?.defId === card("Red Tiger Mechan").id) as string;
    expect(exiled).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === exiled)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === exiled && !a.warp)).toBe(true);
  });

  it("vide : un sort lancé avec la distorsion ce tour-ci (Plasma Bolt inflige 3 au lieu de 2)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Red Tiger Mechan", "Plasma Bolt"] } });
    s = cast(s, "p1", "Plasma Bolt", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
    let t = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Red Tiger Mechan", "Plasma Bolt"] } });
    t = cast(t, "p1", "Red Tiger Mechan", { warp: true });
    t = passBoth(t);
    t = cast(t, "p1", "Plasma Bolt", { targets: { t: ["p2"] } });
    t = passBoth(t);
    expect(t.players.p2?.life).toBe(17);
  });

  it("Timeline Culler : lançable depuis le cimetière, seulement avec la distorsion (et 2 PV)", () => {
    const s = scenario({ p1: { battlefield: ["Swamp"], graveyard: ["Timeline Culler"] } });
    const id = idOf(s, "p1", "graveyard", "Timeline Culler");
    const opts = legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === id);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.type === "cast" && opts[0].warp).toBe(true);
    const t = act(s, "p1", { type: "cast", card: id, warp: true });
    expect(t.players.p1?.life).toBe(18);
  });
});

const DRONE = TOKEN_SPECS.Drone as TokenSpec;
const LANDER_SPEC = TOKEN_SPECS.Lander as TokenSpec;

describe("mécaniques d'Edge of Eternities", () => {
  it("Drone : ne peut bloquer que des créatures avec le vol ; « bloquée par une seule créature au plus »", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Station Monitor", "Bear Cub", "Llanowar Elves"] },
      step: "declareAttackers",
    });
    const drone = createTokens(s, "p2", DRONE, 1)[0] as string;
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s.combat?.attackers.push(
      { id: bear, defender: "p2", blockers: [], blocked: false },
      { id: angel, defender: "p2", blockers: [], blocked: false },
    );
    expect(canBlock(s, drone, bear)).toBe(false);
    expect(canBlock(s, drone, angel)).toBe(true);
    // « Ne peut pas être bloquée par plus d'une créature » (Meltstrider's Resolve).
    s.effects.push({
      id: "e",
      timestamp: 999,
      affected: [bear],
      duration: "endOfTurn",
      addBlockRules: [{ maxBlockers: 1, label: "Bloquée par une seule créature au plus" }],
    });
    s.version += 1;
    const blockers = idsOf(s, "p2", "battlefield", "Bear Cub").concat(idsOf(s, "p2", "battlefield", "Llanowar Elves"));
    expect(() =>
      declareBlockers(
        s,
        "p2",
        blockers.map((b) => ({ blocker: b, attacker: bear })),
      ),
    ).toThrow();
  });

  it("« votre deuxième sort de chaque tour » (Illvoi Operative) et « si vous avez lancé deux sorts » (Brightspear Zealot)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 4), "Illvoi Operative", "Brightspear Zealot"], hand: ["Opt", "Opt"] },
    });
    const operative = idOf(s, "p1", "battlefield", "Illvoi Operative");
    const zealot = idOf(s, "p1", "battlefield", "Brightspear Zealot");
    s = cast(s, "p1", "Opt");
    s = passBoth(s);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [] });
    expect(chars(s, zealot).power).toBe(2);
    s = cast(s, "p1", "Opt");
    expect(chars(s, zealot).power).toBe(4);
    s = passBoth(s); // déclencheur de l'Opérative
    expect(s.objects[operative]?.counters["+1/+1"]).toBe(1);
  });

  it("« chaque fois que vous sacrifiez » (Lightless Evangel) et le coût de sacrifice", () => {
    let s = scenario({
      p1: { battlefield: ["Lightless Evangel", "Umbral Collar Zealot", "Bear Cub"], library: lands("Swamp", 5) },
    });
    const zealot = idOf(s, "p1", "battlefield", "Umbral Collar Zealot");
    s = act(s, "p1", { type: "activate", source: zealot, ability: 0, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = passBoth(s);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [] });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Lightless Evangel")]?.counters["+1/+1"]).toBe(1);
  });

  it("terrain choc : payer 2 PV (dégagé) ou non (engagé)", () => {
    const s = scenario({ p1: { hand: ["Stomping Ground"] } });
    const card0 = idOf(s, "p1", "hand", "Stomping Ground");
    const opts = legalActions(s, "p1").filter((a) => a.type === "playLand");
    expect(opts).toHaveLength(2);
    const paid = act(s, "p1", { type: "playLand", card: card0, payLife: true });
    expect(paid.players.p1?.life).toBe(18);
    expect(paid.objects[idOf(paid, "p1", "battlefield", "Stomping Ground")]?.tapped).toBe(false);
    const unpaid = act(s, "p1", { type: "playLand", card: card0 });
    expect(unpaid.players.p1?.life).toBe(20);
    expect(unpaid.objects[idOf(unpaid, "p1", "battlefield", "Stomping Ground")]?.tapped).toBe(true);
  });
});

describe("station (702.184)", () => {
  const stationIndex = (s: S, id: string) =>
    chars(s, id).abilities.findIndex((a) => a.kind === "activated" && a.label === "Station");

  it("engager une autre créature (choisie) : des marqueurs de charge égaux à sa force ; créature et mots-clés au seuil", () => {
    let s = scenario({ p1: { battlefield: ["Galvanizing Sawship", "Serra Angel", "Bear Cub"] } });
    const ship = idOf(s, "p1", "battlefield", "Galvanizing Sawship");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(chars(s, ship).types).toEqual(["Artifact"]);
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ship);
    expect(opt?.type === "activate" && opt.additional?.tap?.options.length).toBe(2);
    s = act(s, "p1", { type: "activate", source: ship, ability: stationIndex(s, ship), tap: [angel] });
    expect(s.objects[angel]?.tapped).toBe(true);
    s = passBoth(s);
    expect(s.objects[ship]?.counters.charge).toBe(4);
    expect(chars(s, ship).types).toContain("Creature");
    expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
  });

  it("Tapestry Warden : station selon l'endurance si elle dépasse la force", () => {
    let s = scenario({ p1: { battlefield: ["Galvanizing Sawship", "Tapestry Warden", "Gleaming Barrier"] } });
    const ship = idOf(s, "p1", "battlefield", "Galvanizing Sawship");
    const wall = idOf(s, "p1", "battlefield", "Gleaming Barrier");
    s = act(s, "p1", { type: "activate", source: ship, ability: stationIndex(s, ship), tap: [wall] });
    s = passBoth(s);
    expect(s.objects[ship]?.counters.charge).toBe(chars(s, wall).toughness);
  });

  it("capacités de palier : seulement à partir de N marqueurs (Lumen-Class Frigate, 2+)", () => {
    let s = scenario({ p1: { battlefield: ["Lumen-Class Frigate", "Llanowar Elves", "Bear Cub"] } });
    const frigate = idOf(s, "p1", "battlefield", "Lumen-Class Frigate");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    s = act(s, "p1", {
      type: "activate",
      source: frigate,
      ability: stationIndex(s, frigate),
      tap: [idOf(s, "p1", "battlefield", "Llanowar Elves")],
    });
    s = passBoth(s);
    expect(chars(s, bear).power).toBe(2); // 1 marqueur
    s.objects[frigate]!.counters.charge = 2;
    s.version += 1;
    expect(chars(s, bear).power).toBe(3);
  });

  it("The Eternity Elevator : autant de mana que de marqueurs de charge (palier 20+)", () => {
    let s = scenario({ p1: { battlefield: ["The Eternity Elevator"] } });
    const elevator = idOf(s, "p1", "battlefield", "The Eternity Elevator");
    s.objects[elevator]!.counters.charge = 20;
    s.version += 1;
    const opts = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === elevator);
    const any = opts.find((a) => a.type === "tapForMana" && a.colors.includes("G"));
    s = act(s, "p1", { type: "tapForMana", source: elevator, ability: any?.type === "tapForMana" ? any.ability : 0, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(20);
  });
});

describe("Edge of Eternities, lot C", () => {
  it("Unravel : piochez seulement si le mana dépensé est inférieur à la valeur de mana (distorsion)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Red Tiger Mechan"] },
        p2: { battlefield: lands("Island", 3), hand: ["Unravel"] },
      });
    const counterIt = (s: S) => {
      let t = act(s, "p1", { type: "pass" });
      const spell = t.stack[0]?.id as string;
      t = cast(t, "p2", "Unravel", { targets: { t: [spell] } });
      return passBoth(t);
    };
    const warped = counterIt(cast(setup(), "p1", "Red Tiger Mechan", { warp: true }));
    expect(warped.players.p2?.hand).toHaveLength(1);
    const full = counterIt(cast(setup(), "p1", "Red Tiger Mechan"));
    expect(full.players.p2?.hand).toHaveLength(0);
    expect(full.battlefield.some((id) => full.objects[id]?.defId === card("Red Tiger Mechan").id)).toBe(false);
  });

  it("Memorial Vault : exile 1 + la valeur de mana de l'artefact sacrifié, jouables ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Memorial Vault", "Thaumaton Torpedo"] } });
    const vault = idOf(s, "p1", "battlefield", "Memorial Vault");
    s = act(s, "p1", {
      type: "activate",
      source: vault,
      ability: 0,
      sacrifice: [idOf(s, "p1", "battlefield", "Thaumaton Torpedo")],
    });
    s = passBoth(s);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p1")).toHaveLength(2);
    expect(legalActions(s, "p1").filter((a) => a.type === "playLand")).not.toHaveLength(0);
  });

  it("Thaumaton Torpedo : coûte {3} de moins si vous avez attaqué avec un Vaisseau", () => {
    const s = scenario({
      p1: { battlefield: ["Thaumaton Torpedo", ...lands("Plains", 3)] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const torpedo = idOf(s, "p1", "battlefield", "Thaumaton Torpedo");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === torpedo)).toBe(false);
    // Une attaque avec un Vaisseau ce tour-ci (journal du tour).
    s.turnLog.push({ e: "attack", player: "p1", defender: "p2", types: ["Artifact"], subtypes: ["Spacecraft"] });
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === torpedo)).toBe(true);
  });

  it("Gene Pollinator : engage en plus un autre permanent, de préférence sans capacité de mana", () => {
    let s = scenario({ p1: { battlefield: ["Gene Pollinator", "Bear Cub", "Forest"] } });
    const gp = idOf(s, "p1", "battlefield", "Gene Pollinator");
    s = act(s, "p1", { type: "tapForMana", source: gp, ability: 0, color: "U" });
    expect(s.players.p1?.manaPool.U).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(false);
  });

  it("Terrapact Intimidator : l'adversaire refuse les Landers, la créature reçoit deux marqueurs", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Terrapact Intimidator"] } });
    s = cast(s, "p1", "Terrapact Intimidator");
    s = passBoth(s);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [0] });
    expect(s.objects[idOf(s, "p1", "battlefield", "Terrapact Intimidator")]?.counters["+1/+1"]).toBe(2);
  });

  it("Hardlight Containment : exile une créature adverse et donne la garde {1} à l'artefact enchanté", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Thaumaton Torpedo"], hand: ["Hardlight Containment"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const torpedo = idOf(s, "p1", "battlefield", "Thaumaton Torpedo");
    s = cast(s, "p1", "Hardlight Containment", { targets: { enchant: [torpedo] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && !x.battlefield.some((id) => x.objects[id]?.controller === "p2"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(chars(s, torpedo).abilities.some((a) => a.kind === "triggered" && a.label === "Garde")).toBe(true);
  });

  it("Syr Vondam, Sunstar Exemplar : grandit quand une autre créature meurt ; détruit en mourant avec 4 de force", () => {
    let s = scenario({
      p1: { battlefield: ["Syr Vondam, Sunstar Exemplar", "Bear Cub", ...lands("Swamp", 10)], hand: ["Vote Out", "Vote Out"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const vondam = idOf(s, "p1", "battlefield", "Syr Vondam, Sunstar Exemplar");
    s.objects[vondam]!.counters["+1/+1"] = 1;
    s.version += 1;
    s = cast(s, "p1", "Vote Out", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.players.p1?.life === 21);
    expect(s.objects[vondam]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, vondam).power).toBe(4);
    s = cast(s, "p1", "Vote Out", { targets: { t: [vondam] } });
    s = passAccepting(s, (x) => idsOf(x, "p2", "battlefield", "Llanowar Elves").length === 0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Blade of the Swarm : cible une carte exilée avec la distorsion (pas une autre carte exilée)", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Blade of the Swarm"] },
      p2: { graveyard: ["Red Tiger Mechan", "Bear Cub"] },
    });
    for (const id of [...(s.players.p2?.graveyard ?? [])]) {
      s.players.p2!.graveyard = s.players.p2!.graveyard.filter((x) => x !== id);
      s.objects[id]!.zone = "exile";
      s.exile.push(id);
    }
    const tiger = s.exile.find((id) => s.objects[id]?.defId === card("Red Tiger Mechan").id) as string;
    s = cast(s, "p1", "Blade of the Swarm");
    s = passBoth(s);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" && req.intent).toBe("triggerMode");
    s = act(s, "p1", { type: "choose", values: ["1"] });
    // Seule cible légale (Bear Cub, sans distorsion, ne l'est pas) : choisie automatiquement.
    s = passBoth(s);
    expect(s.exile).not.toContain(tiger);
    const lib = s.players.p2?.library ?? [];
    expect(s.objects[lib[lib.length - 1] as string]?.defId).toBe(card("Red Tiger Mechan").id);
  });

  it("Kav Landseeker : le Lander est sacrifié à l'étape de fin de votre prochain tour", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Kav Landseeker"] } });
    s = cast(s, "p1", "Kav Landseeker");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Lander").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Lander")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(idsOf(s, "p1", "battlefield", "Lander")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "cleanup");
    expect(idsOf(s, "p1", "battlefield", "Lander")).toHaveLength(0);
  });

  it("Weftwalking : le premier sort de chaque joueur pendant son tour peut être lancé sans payer", () => {
    const s = scenario({ p1: { battlefield: ["Weftwalking"], hand: ["Serra Angel", "Bear Cub"] } });
    const casts = legalActions(s, "p1").filter((a) => a.type === "cast");
    expect(casts.length).toBeGreaterThanOrEqual(2);
    const t = cast(s, "p1", "Serra Angel", { free: true });
    expect(t.stack).toHaveLength(1);
    expect(legalActions(passBoth(t), "p1").some((a) => a.type === "cast")).toBe(false);
  });

  it("Astelli Reclaimer : VM au plus égale au mana dépensé (distorsion : 3)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Astelli Reclaimer"], graveyard: ["Memorial Vault", "Thaumaton Torpedo"] },
      });
    const returned = (s: S) => {
      const t = passAccepting(passBoth(s), (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      return ["Memorial Vault", "Thaumaton Torpedo"].filter((n) => idsOf(t, "p1", "battlefield", n).length > 0);
    };
    expect(returned(cast(setup(), "p1", "Astelli Reclaimer", { warp: true }))).toEqual(["Thaumaton Torpedo"]);
    expect(returned(cast(setup(), "p1", "Astelli Reclaimer"))).toHaveLength(1);
  });
});

describe("Edge of Eternities, lot D", () => {
  it("The Dominion Bracelet : vous contrôlez l'adversaire pendant son prochain tour (722)", () => {
    let s = scenario({
      p1: { battlefield: ["The Dominion Bracelet", "Serra Angel", ...lands("Plains", 15)] },
      p2: { hand: ["Bear Cub"], battlefield: lands("Forest", 2) },
    });
    const bracelet = idOf(s, "p1", "battlefield", "The Dominion Bracelet");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s.objects[bracelet]!.attachedTo = angel;
    s.version += 1;
    const ab = chars(s, bracelet).abilities.findIndex((a) => a.kind === "activated" && a.label?.startsWith("Contrôlez"));
    s = act(s, "p1", { type: "activate", source: bracelet, ability: ab, targets: { t: ["p2"] } });
    // {15} − 5 (force de l'Ange équipé) = {10}.
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(10);
    s = passBoth(s);
    expect(s.turnControl).toEqual({ player: "p2", by: "p1" });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.turnControl?.turn).toBe(s.turn.number);
    expect(s.pending?.player).toBe("p2");
    expect(decider(s)).toBe("p1");
    // La vue du contrôleur : la décision est la sienne, avec la main et les options du joueur contrôlé.
    const view = projectView(s, "p1");
    expect(view.pending?.player).toBe("p1");
    expect(view.controlling).toBe("p2");
    expect(view.hand.map((o) => o.name)).toContain("Bear Cub");
    expect(projectView(s, "p2").pending?.player).toBe("p1");
    // Le contrôle cesse au tour suivant.
    const later = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(later.turnControl).toBeUndefined();
    expect(decider(later)).toBe(later.pending?.player);
    // Le joueur contrôlé ne peut pas décider ; le contrôleur lance le sort du joueur contrôlé.
    const host = new GameHost(s);
    return host.submitHuman("p2", { type: "pass" }).then(async (err) => {
      expect(err).toBeTruthy();
      const cub = idOf(s, "p2", "hand", "Bear Cub");
      expect(await host.submitHuman("p1", { type: "cast", card: cub })).toBeNull();
      const st = host.state;
      const onStack = st.stack.some((x) => x.controller === "p2");
      expect(onStack || idsOf(st, "p2", "battlefield", "Bear Cub").length === 1).toBe(true);
    });
  });

  it("Famished Worldsire : dévorer 3 (terrains sacrifiés en arrivant)", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 8), hand: ["Famished Worldsire"], library: lands("Forest", 10) },
    });
    s = cast(s, "p1", "Famished Worldsire");
    s = passBoth(s);
    expect(s.pending?.kind === "choice" && s.pending.request.type === "pick" && s.pending.request.prompt).toMatch(/dévorer/);
    s = act(s, "p1", { type: "choose", values: idsOf(s, "p1", "battlefield", "Forest").slice(0, 2) });
    const w = idOf(s, "p1", "battlefield", "Famished Worldsire");
    expect(s.objects[w]?.counters["+1/+1"]).toBe(6);
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(6);
  });

  it("Loading Zone : marqueurs doublés sur vos créatures, pas sur vos autres permanents", () => {
    const s = scenario({ p1: { battlefield: ["Loading Zone", "Bear Cub", "Thaumaton Torpedo"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]!;
    const torpedo = s.objects[idOf(s, "p1", "battlefield", "Thaumaton Torpedo")]!;
    changeCounters(s, bear, "+1/+1", 1);
    changeCounters(s, torpedo, "charge", 1);
    expect(bear.counters["+1/+1"]).toBe(2);
    expect(torpedo.counters.charge).toBe(1);
  });

  it("Zero Point Ballad : détruit selon X, et renvoie une créature détruite si X ≥ 6", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 7), hand: ["Zero Point Ballad"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    s = cast(s, "p1", "Zero Point Ballad", { x: 6 });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p1?.life).toBe(14);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(
      s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature")),
    ).toHaveLength(1);
  });

  it("Mutinous Massacre : parité de la valeur de mana, puis contrôle de toutes les créatures", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 3)], hand: ["Mutinous Massacre"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Llanowar Elves"] },
    });
    s = cast(s, "p1", "Mutinous Massacre", { mode: 0 }); // impaire : Serra Angel (5), Llanowar Elves (1)
    s = passBoth(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(chars(s, bear).keywords).toContain("haste");
  });

  it("Moonlit Meditation : le premier jeton du tour est une copie du permanent enchanté", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Island", "Island", "Serra Angel"], hand: ["Moonlit Meditation"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Moonlit Meditation", { targets: { enchant: [angel] } });
    s = passBoth(s);
    createTokens(s, "p1", DRONE, 1);
    createTokens(s, "p1", DRONE, 1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Drone")).toHaveLength(1);
  });

  it("Pinnacle Starcage : exile les VM ≤ 2, puis les met au cimetière contre des Robots", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 11)], hand: ["Pinnacle Starcage"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    s = cast(s, "p1", "Pinnacle Starcage");
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    const cage = idOf(s, "p1", "battlefield", "Pinnacle Starcage");
    s = act(s, "p1", { type: "activate", source: cage, ability: 1 });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(2);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Scout for Survivors : valeur de mana totale 3 au plus", () => {
    const s = scenario({
      p1: {
        battlefield: lands("Plains", 3),
        hand: ["Scout for Survivors"],
        graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel"],
      },
    });
    const gy = (n: string) => idOf(s, "p1", "graveyard", n);
    expect(() => cast(s, "p1", "Scout for Survivors", { targets: { t: [gy("Bear Cub"), gy("Serra Angel")] } })).toThrow();
    let t = cast(s, "p1", "Scout for Survivors", { targets: { t: [gy("Bear Cub"), gy("Llanowar Elves")] } });
    t = passBoth(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Dyadrine : autant de marqueurs que de mana dépensé ; Bioengineered Future : un par terrain arrivé", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), ...lands("Plains", 2)], hand: ["Dyadrine, Synthesis Amalgam"] },
    });
    s = cast(s, "p1", "Dyadrine, Synthesis Amalgam", { x: 3 });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Dyadrine, Synthesis Amalgam")]?.counters["+1/+1"]).toBe(5);
    let t = scenario({ p1: { battlefield: ["Bioengineered Future", ...lands("Forest", 2)], hand: ["Forest", "Bear Cub"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") });
    t = cast(t, "p1", "Bear Cub");
    t = passBoth(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Terminal Velocity : le permanent a la célérité et inflige sa VM à chaque créature en partant", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 6), hand: ["Terminal Velocity", "Serra Angel"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = cast(s, "p1", "Terminal Velocity");
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "Serra Angel")] });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(chars(s, angel).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
  });
});

describe("cartes jouables hors de la main (vue)", () => {
  it("Icetill Explorer : les terrains du cimetière sont présentés au bout de la main, et se jouent", () => {
    let s = scenario({ p1: { battlefield: ["Icetill Explorer"], graveyard: ["Forest", "Bear Cub", "Bulk Up"] } });
    const forest = idOf(s, "p1", "graveyard", "Forest");
    const names = projectView(s, "p1").playableElsewhere.map((c) => [c.name, c.zone]);
    // Le terrain (Icetill Explorer) et le sort à flashback ; pas la créature sans permission.
    expect(names).toEqual(
      expect.arrayContaining([
        ["Forest", "graveyard"],
        ["Bulk Up", "graveyard"],
      ]),
    );
    expect(names.some(([n]) => n === "Bear Cub")).toBe(false);
    // L'adversaire ne voit pas ces cartes comme jouables pour lui.
    expect(projectView(s, "p2").playableElsewhere).toHaveLength(0);
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });
});

describe("coût modifié affiché sur les cartes de la main (vue)", () => {
  it("surcoût, coût normal et flashback : seul un coût différent du coût imprimé est donné", () => {
    const goblin = "Mudbutton Cursetosser";
    let s = scenario({ p1: { hand: [goblin, "Bear Cub"], graveyard: ["Bulk Up"] } });
    let v = projectView(s, "p1");
    // « Contemplez un Gobelin ou payez {2} » : rien à contempler, {2}{B} (+2).
    expect(v.hand.find((c) => c.name === goblin)?.castCost).toEqual({ text: "{2}{B}", delta: 2 });
    expect(v.hand.find((c) => c.name === "Bear Cub")?.castCost).toBeUndefined();
    expect(v.playableElsewhere.find((c) => c.name === "Bulk Up")?.castCost).toEqual({ text: "{4}{R}{R}", delta: 4 });
    // Avec un autre Gobelin en main, le coût imprimé.
    s = scenario({ p1: { hand: [goblin, goblin] } });
    v = projectView(s, "p1");
    expect(v.hand.every((c) => c.castCost === undefined)).toBe(true);
  });
});

describe("Edge of Eternities, cartes du méta (PLAN-C, lot C13)", () => {
  it("terrains choc (Sacred Foundry, Watery Grave, Godless Shrine, Breeding Pool) : 2 PV ou engagé, deux couleurs", () => {
    const shocks: [string, string[]][] = [
      ["Sacred Foundry", ["R", "W"]],
      ["Watery Grave", ["B", "U"]],
      ["Godless Shrine", ["B", "W"]],
      ["Breeding Pool", ["G", "U"]],
    ];
    for (const [name, colors] of shocks) {
      const s = scenario({ p1: { hand: [name] } });
      const land = idOf(s, "p1", "hand", name);
      const paid = act(s, "p1", { type: "playLand", card: land, payLife: true });
      expect(paid.players.p1?.life).toBe(18);
      const id = idOf(paid, "p1", "battlefield", name);
      expect(paid.objects[id]?.tapped).toBe(false);
      const produced = legalActions(paid, "p1")
        .flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []))
        .sort();
      expect(produced).toEqual(colors);
      const unpaid = act(s, "p1", { type: "playLand", card: land });
      expect(unpaid.players.p1?.life).toBe(20);
      expect(unpaid.objects[idOf(unpaid, "p1", "battlefield", name)]?.tapped).toBe(true);
    }
  });

  it("Seam Rip : exile un permanent non-terrain adverse de VM 2 ou moins jusqu'à son départ", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Seam Rip"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel", "Forest"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = cast(s, "p1", "Seam Rip");
    s = settle(s, picking([bear]));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    // Serra Angel (VM 5) et la Forêt (terrain) restent.
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Seam Rip"));
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Nova Hellkite : vol et célérité ; à l'arrivée, 1 blessure à une créature adverse (lancé avec la distorsion)", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Nova Hellkite"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "p1", "Nova Hellkite", { warp: true });
    s = settle(s);
    const kite = idOf(s, "p1", "battlefield", "Nova Hellkite");
    expect(chars(s, kite).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Mightform Harmonizer : chaque terrain arrivé double la force d'une créature ciblée jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Mightform Harmonizer", "Bear Cub"], hand: ["Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(s, picking([bear]));
    expect(chars(s, bear).power).toBe(4);
    expect(chars(s, bear).toughness).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).power).toBe(2);
  });

  it("Consult the Star Charts : regarde X cartes (X = terrains), en prend une (deux avec le kicker), le reste dessous", () => {
    const library = ["Opt", "Bear Cub", "Serra Angel", "Llanowar Elves", "Plains", "Island"];
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Consult the Star Charts"], library } });
    s = cast(s, "p1", "Consult the Star Charts");
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(["Opt", "Bear Cub", "Serra Angel"]).toContain(nameOf(s, s.players.p1?.hand[0] ?? ""));
    // Les deux autres cartes vues sont passées dessous : Llanowar Elves est sur le dessus.
    expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Llanowar Elves");
    expect(s.players.p1?.library).toHaveLength(5);
    let k = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Consult the Star Charts"], library } });
    k = cast(k, "p1", "Consult the Star Charts", { kicked: true });
    k = settle(k);
    expect(k.players.p1?.hand).toHaveLength(2);
    expect(nameOf(k, k.players.p1?.library[0] ?? "")).toBe("Plains");
  });

  it("Quantum Riddler : pioche à l'arrivée, une carte de plus avec une main d'une carte ou moins", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Quantum Riddler"] } });
    s = cast(s, "p1", "Quantum Riddler", { warp: true });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Quantum Riddler")).keywords).toContain("flying");
    expect(s.players.p1?.hand).toHaveLength(2);
    let t = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Quantum Riddler", "Opt", "Opt"] } });
    t = cast(t, "p1", "Quantum Riddler", { warp: true });
    t = settle(t);
    expect(t.players.p1?.hand).toHaveLength(3);
  });

  it("Starfield Shepherd : cherche une Plaine de base ou une créature de VM 1 ou moins", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Starfield Shepherd"],
        library: ["Forest", "Bear Cub", "Llanowar Elves", "Plains"],
      },
    });
    s = cast(s, "p1", "Starfield Shepherd", { warp: true });
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return pickNamed(cur, req, "Llanowar Elves");
    });
    expect(offered.sort()).toEqual(["Llanowar Elves", "Plains"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Llanowar Elves"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Starfield Shepherd")).keywords).toContain("flying");
  });

  it("Cryogen Relic : pioche en arrivant et en partant ; sacrifié, un marqueur d'étourdissement sur une créature engagée", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Cryogen Relic"] },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
    });
    s = cast(s, "p1", "Cryogen Relic");
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    const relic = idOf(s, "p1", "battlefield", "Cryogen Relic");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "activate", source: relic, ability: 2, targets: { t: [bear] } });
    s = settle(s);
    expect(s.objects[bear]?.counters.stun).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Biotech Specialist : crée un Lander ; sacrifier un artefact inflige 2 blessures à un adversaire", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Biotech Specialist"] } });
    s = cast(s, "p1", "Biotech Specialist");
    s = settle(s);
    const lander = idOf(s, "p1", "battlefield", "Lander");
    s = act(s, "p1", { type: "activate", source: lander, ability: 0 });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Lander")).toHaveLength(0);
    expect(s.players.p2?.life).toBe(18);
    // Le Lander a mis un terrain de base engagé.
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(3);
  });

  it("Sunset Saboteur : en attaquant, un marqueur +1/+1 sur une créature adverse ; menace", () => {
    let s = scenario({ p1: { battlefield: ["Sunset Saboteur"] }, p2: { battlefield: ["Bear Cub"] } });
    const sab = idOf(s, "p1", "battlefield", "Sunset Saboteur");
    expect(chars(s, sab).keywords).toContain("menace");
    s = attack(s, [sab]);
    s = settle(s);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Sunset Saboteur : garde (défaussez une carte) ; sans carte à défausser, le sort adverse est contrecarré", () => {
    let s = scenario({
      p1: { battlefield: ["Sunset Saboteur"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    const sab = idOf(s, "p1", "battlefield", "Sunset Saboteur");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Burst Lightning", { targets: { t: [sab] } });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Sunset Saboteur")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
    // Avec une carte à défausser, l'adversaire paie la garde : le sort se résout.
    let t = scenario({
      p1: { battlefield: ["Sunset Saboteur"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning", "Forest"] },
    });
    t = act(t, "p1", { type: "pass" });
    t = cast(t, "p2", "Burst Lightning", { targets: { t: [idOf(t, "p1", "battlefield", "Sunset Saboteur")] } });
    t = settle(t, (req) => (req.intent === "unlessPay" ? [1] : undefined));
    expect(idsOf(t, "p1", "battlefield", "Sunset Saboteur")).toHaveLength(0);
    expect(namesIn(t, t.players.p2?.graveyard).sort()).toEqual(["Burst Lightning", "Forest"]);
  });

  it("Annul : contrecarre un sort d'artefact ou d'enchantement, pas un sort de créature", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Cryogen Relic"] },
      p2: { battlefield: ["Island"], hand: ["Annul"] },
    });
    s = cast(s, "p1", "Cryogen Relic");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Annul", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    expect(idsOf(s, "p1", "graveyard", "Cryogen Relic")).toHaveLength(1);
    let c = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      p2: { battlefield: ["Island"], hand: ["Annul"] },
    });
    c = cast(c, "p1", "Bear Cub");
    c = act(c, "p1", { type: "pass" });
    expect(castable(c, "p2", idOf(c, "p2", "hand", "Annul"))).toBe(false);
  });

  it("Haliya, Guided by Light : +1 PV par créature ou artefact arrivé ; pioche à l'étape de fin après 3 PV gagnés", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), ...lands("Island", 2), "Forest"],
        hand: ["Haliya, Guided by Light", "Cryogen Relic", "Llanowar Elves"],
      },
    });
    s = settle(cast(s, "p1", "Haliya, Guided by Light"));
    expect(s.players.p1?.life).toBe(21);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    s = settle(cast(s, "p1", "Cryogen Relic"));
    expect(s.players.p1?.life).toBe(23);
    const before = s.players.p1?.hand.length ?? 0; // la carte piochée par la Relique
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(before + 1);
    // Un seul PV gagné : pas de pioche.
    let t = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Haliya, Guided by Light", "Llanowar Elves"] } });
    t = settle(cast(t, "p1", "Haliya, Guided by Light"));
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.players.p1?.life).toBe(21);
    expect(t.players.p1?.hand).toHaveLength(1);
  });

  it("Meltstrider's Gear : s'attache à l'arrivée à une créature, qui gagne +2/+1 et la portée", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Meltstrider's Gear"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Meltstrider's Gear"), picking([bear]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Meltstrider's Gear")]?.attachedTo).toBe(bear);
    expect(chars(s, bear).power).toBe(4);
    expect(chars(s, bear).toughness).toBe(3);
    expect(chars(s, bear).keywords).toContain("reach");
  });

  it("Elegy Acolyte : lien de vie ; blessures de combat à un joueur : piochez et perdez 1 PV (une fois par lot)", () => {
    let s = scenario({ p1: { battlefield: ["Elegy Acolyte", "Bear Cub"] } });
    const acolyte = idOf(s, "p1", "battlefield", "Elegy Acolyte");
    s = attack(s, [acolyte, idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(14);
    // +4 (lien de vie) − 1.
    expect(s.players.p1?.life).toBe(23);
    expect(s.players.p1?.hand).toHaveLength(1);
    // Rien n'a quitté le champ de bataille : pas de Robot.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(0);
  });

  it("Elegy Acolyte : vide, un Robot 2/2 à votre étape de fin si un permanent non-terrain a quitté le champ de bataille", () => {
    let s = scenario({
      p1: { battlefield: ["Elegy Acolyte", "Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const [robot] = idsOf(s, "p1", "battlefield", "Robot");
    expect(robot).toBeDefined();
    expect(chars(s, robot as string).power).toBe(2);
    expect(chars(s, robot as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Meltstrider's Resolve : la créature enchantée se bat, gagne +0/+2 et n'est bloquée que par une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Meltstrider's Resolve"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = cast(s, "p1", "Meltstrider's Resolve", { targets: { enchant: [bear] } });
    s = settle(s, picking([idOf(s, "p2", "battlefield", "Llanowar Elves")]));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[bear]?.damage).toBe(1);
    expect(chars(s, bear).toughness).toBe(4);
    expect(chars(s, bear).blockRules.some((r) => r.maxBlockers === 1)).toBe(true);
  });
});

describe("« Vous mettez des marqueurs » (lot K2)", () => {
  it("Terrasymbiosis : seuls les marqueurs +1/+1 que vous mettez sur vos créatures la déclenchent", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Terrasymbiosis"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Bear Cub")).triggered).toEqual(["Terrasymbiosis"]);
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lot K8 (docs/audits/2026-10-03-cartes.md) : cartes mythiques, rares et peu communes sans test de règles.
// ---------------------------------------------------------------------------

/** Active la capacité de `source` dont le libellé contient `label`. */
const activateNamed = (s: S, source: string, label: string, extra: object = {}, player: PlayerId = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
  if (a?.type !== "activate") throw new Error(`capacité « ${label} » introuvable`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const hasActivation = (s: S, source: string, label: string, player: PlayerId = "p1") =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
/** Répond oui/non aux questions et choisit les objets voulus. */
const answering =
  (opts: { yes?: boolean; pick?: string[]; mode?: number }) =>
  (req: ChoiceRequest): ChoiceValue[] | undefined => {
    if (req.type === "yesNo" && opts.yes !== undefined) return [opts.yes ? 1 : 0];
    if (req.type === "pick" && req.intent === "triggerMode" && opts.mode !== undefined) return [String(opts.mode)];
    return opts.pick ? picking(opts.pick)(req) : undefined;
  };
const tokensOf = (s: S, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.isToken && nameOf(s, id) === name);
/** Vide : un permanent non-terrain de p2 (Llanowar Elves) quitte le champ de bataille. */
const withVoid = (s: S) => {
  destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
  return s;
};
const lifeOf = (s: S, p: PlayerId) => s.players[p]?.life;
const handSize = (s: S, p: PlayerId) => s.players[p]?.hand.length ?? 0;

describe("Edge of Eternities, lot K8 : mythiques", () => {
  it("Adagia, Windswept Bastion : arrive engagée ; à 12+, {3}{W}, {T} : copie légendaire d'un de vos artefacts (rituel)", () => {
    let p = scenario({ p1: { hand: ["Adagia, Windswept Bastion"] } });
    p = act(p, "p1", { type: "playLand", card: idOf(p, "p1", "hand", "Adagia, Windswept Bastion") });
    expect(p.objects[idOf(p, "p1", "battlefield", "Adagia, Windswept Bastion")]?.tapped).toBe(true);
    const setup = (charge: number) =>
      scenario({
        p1: {
          battlefield: [{ name: "Adagia, Windswept Bastion", counters: { charge } }, "Thaumaton Torpedo", ...lands("Plains", 4)],
        },
        p2: { battlefield: ["Memorial Vault"] },
      });
    const low = setup(11);
    expect(hasActivation(low, idOf(low, "p1", "battlefield", "Adagia, Windswept Bastion"), "Copie")).toBe(false);
    let s = setup(12);
    const adagia = idOf(s, "p1", "battlefield", "Adagia, Windswept Bastion");
    const torpedo = idOf(s, "p1", "battlefield", "Thaumaton Torpedo");
    // L'artefact adverse n'est pas une cible légale.
    expect(() =>
      activateNamed(s, adagia, "Copie", { targets: { t: [idOf(s, "p2", "battlefield", "Memorial Vault")] } }),
    ).toThrow();
    s = settle(activateNamed(s, adagia, "Copie", { targets: { t: [torpedo] } }));
    const copies = tokensOf(s, "p1", "Thaumaton Torpedo");
    expect(copies).toHaveLength(1);
    expect(chars(s, copies[0] as string).supertypes).toContain("Legendary");
    expect(chars(s, torpedo).supertypes).not.toContain("Legendary");
    // Seulement comme un rituel : pas tant qu'un sort est sur la pile.
    let busy = scenario({
      p1: {
        battlefield: [
          { name: "Adagia, Windswept Bastion", counters: { charge: 12 } },
          "Thaumaton Torpedo",
          ...lands("Plains", 4),
          "Island",
        ],
        hand: ["Opt"],
      },
    });
    expect(hasActivation(busy, idOf(busy, "p1", "battlefield", "Adagia, Windswept Bastion"), "Copie")).toBe(true);
    busy = cast(busy, "p1", "Opt");
    expect(hasActivation(busy, idOf(busy, "p1", "battlefield", "Adagia, Windswept Bastion"), "Copie")).toBe(false);
  });

  it("Alpharael, Stonechosen : vide, en attaquant, le défenseur perd la moitié de ses PV arrondie au supérieur ; sinon rien", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Alpharael, Stonechosen"] }, p2: { life: 15, battlefield: ["Llanowar Elves"] } });
    let s = withVoid(setup());
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Alpharael, Stonechosen")]));
    expect(lifeOf(s, "p2")).toBe(7); // 15 − 8
    let t = setup();
    t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Alpharael, Stonechosen")]));
    expect(lifeOf(t, "p2")).toBe(15);
  });

  it("Alpharael, Stonechosen : garde — défausser une carte au hasard, sinon le sort adverse est contrecarré", () => {
    let s = scenario({
      p1: { battlefield: ["Alpharael, Stonechosen"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock", "Forest"] },
    });
    const alpha = idOf(s, "p1", "battlefield", "Alpharael, Stonechosen");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Shock", { targets: { t: [alpha] } });
    s = settle(s, (req) => (req.intent === "unlessPay" ? [1] : undefined));
    expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Forest", "Shock"]);
    expect(s.objects[alpha]?.damage).toBe(2);
  });

  it("Cosmogrand Zenith : au deuxième sort du tour, deux Soldats 1/1 ou un marqueur sur chacune de vos créatures", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Cosmogrand Zenith", "Bear Cub", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    let s = settle(cast(setup(), "p1", "Opt"));
    expect(s.stack).toHaveLength(0);
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(0);
    s = settle(cast(s, "p1", "Opt"), answering({ mode: 0 }));
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(2);
    let t = settle(cast(setup(), "p1", "Opt"));
    t = settle(cast(t, "p1", "Opt"), answering({ mode: 1 }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Cosmogrand Zenith")]?.counters["+1/+1"]).toBe(1);
    expect(tokensOf(t, "p1", "Human Soldier")).toHaveLength(0);
  });

  // Une capacité déclenchée de palier se déclenche même sans capacité déclenchée imprimée (lot K8).
  it("Dawnsire, Sunstar Dreadnought : à 10+, quand vous attaquez, 100 blessures à jusqu'à une créature", () => {
    const setup = (charge: number) =>
      scenario({
        p1: { battlefield: [{ name: "Dawnsire, Sunstar Dreadnought", counters: { charge } }, "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup(10);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), picking([angel]));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    let t = setup(9);
    t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]), picking([angel]));
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Dawnsire, Sunstar Dreadnought : pas une créature avant 20 marqueurs ; à 20+, créature 20/20 volante", () => {
    const setup = (charge: number) =>
      scenario({ p1: { battlefield: [{ name: "Dawnsire, Sunstar Dreadnought", counters: { charge } }] } });
    const low = setup(19);
    expect(chars(low, idOf(low, "p1", "battlefield", "Dawnsire, Sunstar Dreadnought")).types).not.toContain("Creature");
    const big = setup(20);
    const ship = idOf(big, "p1", "battlefield", "Dawnsire, Sunstar Dreadnought");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toContain("flying");
    expect(chars(big, ship).power).toBe(20);
  });

  it("Devastating Onslaught : X copies d'un de vos artefacts ou créatures, avec la célérité, sacrifiées à l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 5)], hand: ["Devastating Onslaught"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() =>
      cast(s, "p1", "Devastating Onslaught", { x: 2, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    ).toThrow();
    s = settle(cast(s, "p1", "Devastating Onslaught", { x: 2, targets: { t: [cub] } }));
    const copies = tokensOf(s, "p1", "Bear Cub");
    expect(copies).toHaveLength(2);
    for (const c of copies) expect(chars(s, c).keywords).toContain("haste");
    expect(chars(s, cub).keywords).not.toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Evendo, Waking Haven : à 12+, {G}, {T} : {G} par créature que vous contrôlez", () => {
    const setup = (charge: number) =>
      scenario({
        p1: { battlefield: [{ name: "Evendo, Waking Haven", counters: { charge } }, "Forest", "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    expect(hasActivation(setup(11), idOf(setup(11), "p1", "battlefield", "Evendo, Waking Haven"), "{G} par")).toBe(false);
    let s = setup(12);
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Evendo, Waking Haven"), "{G} par"));
    expect(s.players.p1?.manaPool.G).toBe(2);
  });

  it("Exalted Sunborn : vol, lien de vie ; vos jetons sont créés en double, pas ceux de l'adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Exalted Sunborn", ...lands("Plains", 2)], hand: ["Honored Knight-Captain"] },
      p2: { battlefield: ["Exalted Sunborn"] },
    });
    s.objects[idOf(s, "p2", "battlefield", "Exalted Sunborn")]!.zone = "exile";
    s.battlefield = s.battlefield.filter((id) => id !== idOf(s, "p2", "battlefield", "Exalted Sunborn"));
    s.version += 1;
    expect(chars(s, idOf(s, "p1", "battlefield", "Exalted Sunborn")).keywords).toEqual(
      expect.arrayContaining(["flying", "lifelink"]),
    );
    s = settle(cast(s, "p1", "Honored Knight-Captain"));
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(2);
    createTokens(s, "p2", DRONE, 1);
    expect(tokensOf(s, "p2", "Drone")).toHaveLength(1);
  });

  it("Kavaron, Memorial World : à 12+, {1}{R}, {T}, sacrifiez un terrain : Robot 2/2, puis vos créatures +1/+0 et la célérité", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Kavaron, Memorial World", counters: { charge: 12 } }, "Bear Cub", ...lands("Mountain", 3)] },
    });
    const kav = idOf(s, "p1", "battlefield", "Kavaron, Memorial World");
    s = settle(activateNamed(s, kav, "Robot"), (req, _p, cur) => pickNamed(cur, req, "Mountain"));
    expect(idsOf(s, "p1", "battlefield", "Mountain").length).toBeLessThan(3);
    const [robot] = tokensOf(s, "p1", "Robot");
    expect(chars(s, robot as string).power).toBe(3);
    expect(chars(s, robot as string).keywords).toContain("haste");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub).power).toBe(3);
    expect(chars(s, cub).toughness).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).power).toBe(2);
  });

  it("Ouroboroid : au début de votre combat, X marqueurs sur chacune de vos créatures (X = sa force)", () => {
    let s = scenario({ p1: { battlefield: ["Ouroboroid", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const ouro = idOf(s, "p1", "battlefield", "Ouroboroid");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = passAccepting(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
    expect(s.objects[ouro]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["+1/+1"] ?? 0).toBe(0);
    // Au combat suivant, X = 2.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "declareAttackers" && x.turn.number > 3);
    expect(s.objects[ouro]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(3);
  });

  it("Sami, Wildcat Captain : double initiative, vigilance ; vos sorts coûtent {1} de moins par artefact", () => {
    const setup = (withSami: boolean) =>
      scenario({
        p1: {
          battlefield: [
            ...(withSami ? ["Sami, Wildcat Captain"] : []),
            "Thaumaton Torpedo",
            "Memorial Vault",
            ...lands("Plains", 3),
          ],
          hand: ["Serra Angel"],
        },
      });
    const s = setup(true);
    expect(chars(s, idOf(s, "p1", "battlefield", "Sami, Wildcat Captain")).keywords).toEqual(
      expect.arrayContaining(["doubleStrike", "vigilance"]),
    );
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Serra Angel"))).toBe(true);
    const t = setup(false);
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Serra Angel"))).toBe(false);
  });

  it("Sothera, the Supervoid : une de vos créatures meurt, chaque adversaire exile une de ses créatures", () => {
    let s = scenario({
      p1: { battlefield: ["Sothera, the Supervoid", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Llanowar Elves"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    let chooser: PlayerId | undefined;
    s = settle(s, (req, player, cur) => {
      chooser = player;
      return pickNamed(cur, req, "Serra Angel");
    });
    // L'adversaire choisit la créature qu'il exile.
    expect(chooser).toBe("p2");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    // Une créature qui meurt chez l'adversaire ne déclenche rien.
    destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
    s = settle(s);
    expect(s.exile).toHaveLength(1);
    // Chacun contrôle encore une créature : Sothera reste.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Sothera, the Supervoid")).toHaveLength(1);
  });

  it("Sothera, the Supervoid : un joueur sans créature, sacrifiez-la et prenez une créature exilée avec deux marqueurs", () => {
    let s = scenario({
      p1: { battlefield: ["Sothera, the Supervoid", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s, (req, _p, cur) => pickNamed(cur, req, "Serra Angel"));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Sothera, the Supervoid")).toHaveLength(0);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[angel]?.owner).toBe("p2");
  });

  it("Susur Secundi, Void Altar : à 12+, {1}{B}, {T}, 2 PV, sacrifiez une créature : piochez autant que sa force", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Susur Secundi, Void Altar", counters: { charge: 12 } }, "Serra Angel", ...lands("Swamp", 2)],
      },
    });
    const altar = idOf(s, "p1", "battlefield", "Susur Secundi, Void Altar");
    s = settle(activateNamed(s, altar, "Piochez"), (req, _p, cur) => pickNamed(cur, req, "Serra Angel"));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(lifeOf(s, "p1")).toBe(18);
    expect(handSize(s, "p1")).toBe(4);
  });

  it("Tannuk, Steadfast Second : vos autres créatures ont la célérité ; distorsion {2}{R} pour les artefacts et créatures rouges", () => {
    const s = scenario({
      p1: {
        battlefield: ["Tannuk, Steadfast Second", { name: "Bear Cub", sick: true }, ...lands("Mountain", 3)],
        hand: ["Extinguisher Battleship", "Territorial Bruntar", "Serra Angel"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    expect(chars(s, idOf(s, "p1", "battlefield", "Tannuk, Steadfast Second")).keywords).not.toContain("haste");
    const warpable = (name: string) =>
      legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name) && !!a.warp);
    expect(warpable("Extinguisher Battleship")).toBe(true);
    expect(warpable("Territorial Bruntar")).toBe(true);
    expect(warpable("Serra Angel")).toBe(false);
    const t = settle(cast(s, "p1", "Territorial Bruntar", { warp: true }));
    expect(idsOf(t, "p1", "battlefield", "Territorial Bruntar")).toHaveLength(1);
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(3);
  });

  it("Tezzeret, Cruel Captain : un loyauté par artefact arrivé ; 0 : dégage, un marqueur seulement sur une créature-artefact", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Tezzeret, Cruel Captain",
          { name: "Rust Harvester", tapped: true },
          { name: "Bear Cub", tapped: true },
          "Plains",
        ],
        hand: ["Thaumaton Torpedo"],
      },
    });
    const tez = idOf(s, "p1", "battlefield", "Tezzeret, Cruel Captain");
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    expect(s.objects[tez]?.counters.loyalty).toBe(5);
    const harvester = idOf(s, "p1", "battlefield", "Rust Harvester");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const t = settle(activateNamed(s, tez, "Dégagez", { targets: { t: [cub] } }));
    expect(t.objects[cub]?.tapped).toBe(false);
    expect(t.objects[cub]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(t.objects[tez]?.counters.loyalty).toBe(5);
    const u = settle(activateNamed(s, tez, "Dégagez", { targets: { t: [harvester] } }));
    expect(u.objects[harvester]?.tapped).toBe(false);
    expect(u.objects[harvester]?.counters["+1/+1"]).toBe(1);
  });

  it("Tezzeret, Cruel Captain : −3 cherche un artefact de VM 1 ou moins ; −7 : emblème, trois marqueurs et un Robot 0/0", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Tezzeret, Cruel Captain", counters: { loyalty: 4 } }],
        library: ["Memorial Vault", "Rust Harvester", ...lands("Plains", 5)],
      },
    });
    const tez = idOf(s, "p1", "battlefield", "Tezzeret, Cruel Captain");
    let offered: string[] = [];
    s = settle(activateNamed(s, tez, "Cherchez"), (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return undefined;
    });
    expect(offered).toEqual(["Rust Harvester"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Rust Harvester"]);
    let e = scenario({
      p1: { battlefield: [{ name: "Tezzeret, Cruel Captain", counters: { loyalty: 7 } }, "Thaumaton Torpedo"] },
    });
    e = settle(activateNamed(e, idOf(e, "p1", "battlefield", "Tezzeret, Cruel Captain"), "Emblème"));
    expect(idsOf(e, "p1", "battlefield", "Tezzeret, Cruel Captain")).toHaveLength(0);
    const torpedo = idOf(e, "p1", "battlefield", "Thaumaton Torpedo");
    // Le combat de ce tour-ci.
    e = advanceUntil(e, (x) => x.turn.step === "declareAttackers");
    expect(e.objects[torpedo]?.counters["+1/+1"]).toBe(3);
    expect(chars(e, torpedo).types).toContain("Creature");
    expect(chars(e, torpedo).subtypes).toContain("Robot");
    expect(chars(e, torpedo).power).toBe(3);
  });

  it("The Endstone : piochez en jouant un terrain ou en lançant un sort ; à votre étape de fin, vos PV deviennent 10", () => {
    let s = scenario({ p1: { life: 4, battlefield: ["The Endstone", "Island"], hand: ["Forest", "Opt"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(s);
    expect(handSize(s, "p1")).toBe(2); // Opt + la carte piochée
    s = settle(cast(s, "p1", "Opt"));
    expect(handSize(s, "p1")).toBe(3); // + Endstone + Opt
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p1")).toBe(10);
    let t = scenario({ p1: { life: 17, battlefield: ["The Endstone"] } });
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(lifeOf(t, "p1")).toBe(10);
  });

  it("Uthros, Titanic Godcore : à 12+, {U}, {T} : {U} par artefact que vous contrôlez", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Uthros, Titanic Godcore", counters: { charge: 12 } },
          "Island",
          "Thaumaton Torpedo",
          "Memorial Vault",
          "Rust Harvester",
        ],
      },
    });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Uthros, Titanic Godcore"), "{U} par"));
    expect(s.players.p1?.manaPool.U).toBe(3);
  });
});

/** Met une carte du cimetière en exil (préparation d'un test). */
const graveyardToExile = (s: S, id: string) => {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  const p = s.players[o.owner];
  if (p) p.graveyard = p.graveyard.filter((x) => x !== id);
  o.zone = "exile";
  s.exile.push(id);
  s.version += 1;
};

describe("Edge of Eternities, lot K8 : rares (1)", () => {
  it("Anticausal Vestige : en partant, piochez, puis vous pouvez mettre engagé un permanent de VM ≤ vos terrains", () => {
    let s = scenario({
      p1: {
        battlefield: ["Anticausal Vestige", ...lands("Forest", 3)],
        hand: ["Serra Angel", "Bear Cub", "Shock"],
        library: ["Opt", ...lands("Forest", 5)],
      },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Anticausal Vestige"));
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return pickNamed(cur, req, "Bear Cub");
    });
    expect(offered.sort()).toEqual(["Bear Cub"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Opt", "Serra Angel", "Shock"]);
  });

  it("Archenemy's Charm : exile une créature ; reprend une ou deux cartes de créature ; deux marqueurs et le lien de vie", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Archenemy's Charm"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Archenemy's Charm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    const r = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Archenemy's Charm"], graveyard: ["Bear Cub", "Serra Angel", "Shock"] },
    });
    // Une ou deux cibles : zéro n'est pas permis, un éphémère non plus.
    expect(() => cast(r, "p1", "Archenemy's Charm", { mode: 1, targets: { t: [] } })).toThrow();
    expect(() =>
      cast(r, "p1", "Archenemy's Charm", { mode: 1, targets: { t: [idOf(r, "p1", "graveyard", "Shock")] } }),
    ).toThrow();
    const back = settle(
      cast(r, "p1", "Archenemy's Charm", {
        mode: 1,
        targets: { t: [idOf(r, "p1", "graveyard", "Bear Cub"), idOf(r, "p1", "graveyard", "Serra Angel")] },
      }),
    );
    expect(namesIn(back, back.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    let c = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Archenemy's Charm"] } });
    const cub = idOf(c, "p1", "battlefield", "Bear Cub");
    c = settle(cast(c, "p1", "Archenemy's Charm", { mode: 2, targets: { t: [cub] } }));
    expect(c.objects[cub]?.counters["+1/+1"]).toBe(2);
    expect(chars(c, cub).keywords).toContain("lifelink");
    c = advanceUntil(c, (x) => x.turn.active === "p2");
    expect(chars(c, cub).keywords).not.toContain("lifelink");
  });

  it("Beyond the Quiet : exile toutes les créatures et tous les Vaisseaux, pas les autres permanents", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Galvanizing Sawship"], hand: ["Beyond the Quiet"] },
      p2: { battlefield: ["Serra Angel", "Thaumaton Torpedo"] },
    });
    s = settle(cast(s, "p1", "Beyond the Quiet"));
    expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Galvanizing Sawship", "Serra Angel"]);
    expect(idsOf(s, "p2", "battlefield", "Thaumaton Torpedo")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(5);
  });

  it("Chorale of the Void : la créature enchantée attaque, une créature du cimetière adverse arrive engagée et attaquante", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Chorale of the Void"], graveyard: ["Llanowar Elves"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Chorale of the Void", { targets: { enchant: [cub] } }));
    s = attack(s, [cub]);
    let offered: string[] = [];
    s = settleNoBlocks(s, (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return undefined;
    });
    // Seule la carte du cimetière adverse est une cible.
    expect(offered).not.toContain("Llanowar Elves");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.combat?.attackers.some((a) => a.id === angel)).toBe(true);
    s = throughCombat(s);
    expect(lifeOf(s, "p2")).toBe(14);
  });

  it("Chorale of the Void : vide — sacrifiée à votre étape de fin sauf si un permanent non-terrain est parti", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Chorale of the Void"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
    let s = setup();
    s = settle(cast(s, "p1", "Chorale of the Void", { targets: { enchant: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "graveyard", "Chorale of the Void")).toHaveLength(1);
    let t = setup();
    t = settle(cast(t, "p1", "Chorale of the Void", { targets: { enchant: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
    t = advanceUntil(withVoid(t), (x) => x.turn.active === "p2");
    expect(idsOf(t, "p1", "battlefield", "Chorale of the Void")).toHaveLength(1);
  });

  it("Cosmogoyf : force égale au nombre de cartes que vous possédez en exil, endurance + 1", () => {
    const s = scenario({
      p1: { battlefield: ["Cosmogoyf"], graveyard: ["Bear Cub", "Shock"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const goyf = idOf(s, "p1", "battlefield", "Cosmogoyf");
    expect([chars(s, goyf).power, chars(s, goyf).toughness]).toEqual([0, 1]);
    for (const id of [...(s.players.p1?.graveyard ?? []), ...(s.players.p2?.graveyard ?? [])]) graveyardToExile(s, id);
    expect([chars(s, goyf).power, chars(s, goyf).toughness]).toEqual([2, 3]);
  });

  it("Emissary Escort : +X/+0, X étant la plus grande VM parmi vos autres artefacts", () => {
    const s = scenario({
      p1: { battlefield: ["Emissary Escort", "Thaumaton Torpedo", "Memorial Vault"] },
      p2: { battlefield: ["Extinguisher Battleship"] },
    });
    const escort = idOf(s, "p1", "battlefield", "Emissary Escort");
    expect([chars(s, escort).power, chars(s, escort).toughness]).toEqual([4, 4]);
    const t = scenario({ p1: { battlefield: ["Emissary Escort"] } });
    expect(chars(t, idOf(t, "p1", "battlefield", "Emissary Escort")).power).toBe(0);
  });

  it("Entropic Battlecruiser : à 1+, un adversaire qui défausse perd 3 PV ; à 8+, en attaquant, chaque adversaire défausse (ou perd 3 PV)", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Entropic Battlecruiser", counters: { charge: 1 } }, "Swamp", "Swamp"],
        hand: ["Virus Beetle"],
      },
      p2: { hand: ["Forest"] },
    });
    s = settle(cast(s, "p1", "Virus Beetle"));
    expect(lifeOf(s, "p2")).toBe(17);
    let a = scenario({ p1: { battlefield: [{ name: "Entropic Battlecruiser", counters: { charge: 8 } }] }, p2: { hand: [] } });
    a = settleNoBlocks(attack(a, [idOf(a, "p1", "battlefield", "Entropic Battlecruiser")]));
    expect(lifeOf(a, "p2")).toBe(17);
  });

  it("Entropic Battlecruiser : créature à 8 marqueurs, avec le vol et le contact mortel", () => {
    const low = scenario({ p1: { battlefield: [{ name: "Entropic Battlecruiser", counters: { charge: 7 } }] } });
    expect(chars(low, idOf(low, "p1", "battlefield", "Entropic Battlecruiser")).types).not.toContain("Creature");
    const s = scenario({ p1: { battlefield: [{ name: "Entropic Battlecruiser", counters: { charge: 8 } }] } });
    const ship = idOf(s, "p1", "battlefield", "Entropic Battlecruiser");
    expect(chars(s, ship).types).toContain("Creature");
    expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
  });

  it("Extinguisher Battleship : détruit un permanent non-créature, puis 4 blessures à chaque créature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 8), "Bear Cub"], hand: ["Extinguisher Battleship"] },
      p2: { battlefield: ["Memorial Vault", "Serra Angel", { name: "Emissary Escort" }] },
    });
    s = cast(s, "p1", "Extinguisher Battleship");
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return pickNamed(cur, req, "Memorial Vault");
    });
    expect(offered).not.toContain("Serra Angel");
    expect(offered).not.toContain("Bear Cub");
    expect(idsOf(s, "p2", "battlefield", "Memorial Vault")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    // Pas encore une créature : le Vaisseau n'est pas blessé.
    expect(idsOf(s, "p1", "battlefield", "Extinguisher Battleship")).toHaveLength(1);
    // L'Escorte (0/4 + 0, plus d'autre artefact) meurt aussi.
    expect(idsOf(s, "p2", "battlefield", "Emissary Escort")).toHaveLength(0);
    const big = scenario({ p1: { battlefield: [{ name: "Extinguisher Battleship", counters: { charge: 5 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Extinguisher Battleship");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
  });

  it("Frenzied Baloth : piétinement, célérité ; ni lui ni vos sorts de créature ne peuvent être contrecarrés", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Frenzied Baloth", "Bear Cub"] },
      p2: { battlefield: lands("Island", 6), hand: ["Unravel", "Unravel"] },
    });
    s = cast(s, "p1", "Frenzied Baloth");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Unravel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    const baloth = idOf(s, "p1", "battlefield", "Frenzied Baloth");
    expect(chars(s, baloth).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    s = cast(s, "p1", "Bear Cub");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Unravel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Unravel")).toHaveLength(2);
  });

  it("Genemorph Imago : vol ; landfall, une créature ciblée a une F/E de base 3/3 (6/6 avec six terrains) jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Genemorph Imago", "Llanowar Elves", ...lands("Forest", 4)], hand: ["Forest", "Island"] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, idOf(s, "p1", "battlefield", "Genemorph Imago")).keywords).toContain("flying");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), picking([elves]));
    expect([chars(s, elves).power, chars(s, elves).toughness]).toEqual([3, 3]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, elves).power).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), picking([elves]));
    expect([chars(s, elves).power, chars(s, elves).toughness]).toEqual([6, 6]);
  });

  it("Infinite Guideline Station : un Robot engagé par permanent multicolore ; à 12+, en attaquant, une carte par permanent multicolore", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Island", "Swamp", "Mountain", "Forest", "Station Monitor", "Bear Cub"],
        hand: ["Infinite Guideline Station"],
      },
    });
    s = settle(cast(s, "p1", "Infinite Guideline Station"));
    const robots = tokensOf(s, "p1", "Robot");
    expect(robots).toHaveLength(2); // la Station elle-même et Station Monitor
    expect(robots.every((id) => s.objects[id]?.tapped)).toBe(true);
    let a = scenario({
      p1: { battlefield: [{ name: "Infinite Guideline Station", counters: { charge: 12 } }, "Station Monitor", "Bear Cub"] },
    });
    const ship = idOf(a, "p1", "battlefield", "Infinite Guideline Station");
    expect(chars(a, ship).keywords).toContain("flying");
    a = settleNoBlocks(attack(a, [ship]));
    expect(handSize(a, "p1")).toBe(2);
  });

  it("Lightstall Inquisitor : chaque adversaire exile une carte de sa main, jouable en coûtant {1} de plus (terrain engagé)", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Lightstall Inquisitor"] },
      p2: { battlefield: lands("Forest", 3), hand: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Lightstall Inquisitor"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Lightstall Inquisitor")).keywords).toContain("vigilance");
    const cub = exiled(s, "Bear Cub")[0] as string;
    expect(cub).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castable(s, "p2", cub)).toBe(true);
    s = act(s, "p2", { type: "cast", card: cub });
    // {1}{G} + {1} : trois Forêts engagées.
    expect(idsOf(s, "p2", "battlefield", "Forest").filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    let l = scenario({ p1: { battlefield: ["Plains"], hand: ["Lightstall Inquisitor"] }, p2: { hand: ["Forest"] } });
    l = settle(cast(l, "p1", "Lightstall Inquisitor"));
    const forest = exiled(l, "Forest")[0] as string;
    l = advanceUntil(l, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    l = act(l, "p2", { type: "playLand", card: forest });
    expect(l.objects[idOf(l, "p2", "battlefield", "Forest")]?.tapped).toBe(true);
  });

  it("Mm'menon, the Right Hand : sorts d'artefact du dessus de la bibliothèque ; {U} de vos artefacts pour un sort hors de la main", () => {
    const s = scenario({
      p1: {
        battlefield: ["Mm'menon, the Right Hand", "Memorial Vault"],
        hand: ["Opt"],
        library: ["Thaumaton Torpedo", "Bear Cub", ...lands("Island", 3)],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Mm'menon, the Right Hand")).keywords).toContain("flying");
    const top = s.players.p1?.library[0] as string;
    // L'artefact du dessus se lance avec le mana de Memorial Vault ; Opt (de la main) non.
    expect(castable(s, "p1", top)).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
    let t = act(s, "p1", { type: "cast", card: top });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Thaumaton Torpedo")).toHaveLength(1);
    // Bear Cub (pas un artefact) au-dessus : pas lançable.
    expect(castable(t, "p1", t.players.p1?.library[0] as string)).toBe(false);
  });

  it("Pain for All : en arrivant, la créature enchantée inflige sa force à une autre cible ; blessée, autant à chaque adversaire", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Serra Angel"], hand: ["Pain for All"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Pain for All", { targets: { enchant: [angel] } });
    let offered: string[] = [];
    s = settle(s, (req) => {
      if (req.type === "pick") offered = req.options.map(String);
      return req.type === "pick" ? ["p2"] : undefined;
    });
    expect(offered).not.toContain(angel);
    expect(lifeOf(s, "p2")).toBe(16);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: [angel] } }));
    expect(lifeOf(s, "p2")).toBe(14);
  });

  it("Pinnacle Emissary : un Drone 1/1 volant à chaque sort d'artefact que vous lancez", () => {
    let s = scenario({ p1: { battlefield: ["Pinnacle Emissary", ...lands("Island", 2)], hand: ["Thaumaton Torpedo", "Opt"] } });
    s = settle(cast(s, "p1", "Opt"));
    expect(tokensOf(s, "p1", "Drone")).toHaveLength(0);
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    const drones = tokensOf(s, "p1", "Drone");
    expect(drones).toHaveLength(1);
    expect(chars(s, drones[0] as string).keywords).toContain("flying");
  });

  it("Possibility Technician : un Kavu arrive, exilez la carte du dessus, jouable tant que vous contrôlez un Kavu", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 8),
        hand: ["Possibility Technician", "Memorial Team Leader", "Rust Harvester"],
        library: ["Shock", "Opt", "Island", ...lands("Mountain", 3)],
      },
    });
    s = settle(cast(s, "p1", "Possibility Technician"));
    const shock = exiled(s, "Shock")[0] as string;
    expect(shock).toBeDefined();
    expect(castable(s, "p1", shock)).toBe(true);
    s = settle(cast(s, "p1", "Memorial Team Leader"));
    expect(exiled(s, "Opt")).toHaveLength(1);
    // Une créature non-Kavu ne déclenche rien.
    s = settle(cast(s, "p1", "Rust Harvester"));
    expect(exiled(s, "Island")).toHaveLength(0);
    destroy(s, idOf(s, "p1", "battlefield", "Possibility Technician"));
    destroy(s, idOf(s, "p1", "battlefield", "Memorial Team Leader"));
    s = settle(s);
    expect(castable(s, "p1", shock)).toBe(false);
  });
});

describe("Edge of Eternities, lot K8 : rares (2)", () => {
  it("Ragost, Deft Gastronaut : vos artefacts sont des Nourritures ; sacrifiez-en une : 3 blessures ; dégagé après un gain de PV", () => {
    let s = scenario({
      p1: { battlefield: ["Ragost, Deft Gastronaut", "Thaumaton Torpedo", "Memorial Vault", ...lands("Plains", 3)] },
    });
    const ragost = idOf(s, "p1", "battlefield", "Ragost, Deft Gastronaut");
    const torpedo = idOf(s, "p1", "battlefield", "Thaumaton Torpedo");
    expect(chars(s, torpedo).subtypes).toContain("Food");
    s = settle(activateNamed(s, torpedo, "+3 PV"));
    expect(lifeOf(s, "p1")).toBe(23);
    s = settle(activateNamed(s, ragost, "3 blessures", { sacrifice: [idOf(s, "p1", "battlefield", "Memorial Vault")] }));
    expect(lifeOf(s, "p2")).toBe(17);
    expect(s.objects[ragost]?.tapped).toBe(true);
    // Vous avez gagné des PV ce tour-ci : dégagé à l'étape de fin.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[ragost]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: ["Ragost, Deft Gastronaut", "Memorial Vault", "Plains"] } });
    const r2 = idOf(t, "p1", "battlefield", "Ragost, Deft Gastronaut");
    t = settle(activateNamed(t, r2, "3 blessures", { sacrifice: [idOf(t, "p1", "battlefield", "Memorial Vault")] }));
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(t.objects[r2]?.tapped).toBe(true);
  });

  it("Requiem Monolith : la créature ciblée, blessée, fait piocher et perdre autant à son contrôleur ; 1 blessure s'il le veut", () => {
    let s = scenario({
      p1: { battlefield: ["Requiem Monolith", "Serra Angel"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(
      activateNamed(s, idOf(s, "p1", "battlefield", "Requiem Monolith"), "Blessures", { targets: { t: [angel] } }),
      answering({ yes: true }),
    );
    expect(s.objects[angel]?.damage).toBe(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p1")).toBe(19);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: [angel] } }));
    expect(handSize(s, "p1")).toBe(3);
    expect(lifeOf(s, "p1")).toBe(17);
    // Sur une créature adverse : son contrôleur choisit, et refuse.
    let o = scenario({ p1: { battlefield: ["Requiem Monolith"] }, p2: { battlefield: ["Serra Angel"] } });
    let asked: PlayerId | undefined;
    o = settle(
      activateNamed(o, idOf(o, "p1", "battlefield", "Requiem Monolith"), "Blessures", {
        targets: { t: [idOf(o, "p2", "battlefield", "Serra Angel")] },
      }),
      (req, player) => {
        if (req.type === "yesNo") asked = player;
        return req.type === "yesNo" ? [0] : undefined;
      },
    );
    expect(asked).toBe("p2");
    expect(o.objects[idOf(o, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(handSize(o, "p2")).toBe(0);
  });

  it("Rust Harvester : menace ; {2}, {T}, exilez un artefact du cimetière : marqueur +1/+1, puis blessures égales à sa force", () => {
    let s = scenario({
      p1: { battlefield: ["Rust Harvester", ...lands("Mountain", 2)], graveyard: ["Thaumaton Torpedo", "Bear Cub"] },
    });
    const rust = idOf(s, "p1", "battlefield", "Rust Harvester");
    expect(chars(s, rust).keywords).toContain("menace");
    s = settle(activateNamed(s, rust, "Marqueur", { targets: { t: ["p2"] } }));
    expect(s.objects[rust]?.counters["+1/+1"]).toBe(1);
    expect(lifeOf(s, "p2")).toBe(18);
    expect(exiled(s, "Thaumaton Torpedo")).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Rust Harvester", ...lands("Mountain", 2)], graveyard: ["Bear Cub"] } });
    expect(hasActivation(t, idOf(t, "p1", "battlefield", "Rust Harvester"), "Marqueur")).toBe(false);
  });

  it("Singularity Rupture : détruit toutes les créatures, puis les joueurs ciblés meulent la moitié de leur bibliothèque (arrondie à l'inférieur)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Island", ...lands("Swamp", 6), "Bear Cub"],
        hand: ["Singularity Rupture"],
        library: lands("Swamp", 6),
      },
      p2: { battlefield: ["Serra Angel"], library: lands("Forest", 7) },
    });
    s = settle(cast(s, "p1", "Singularity Rupture", { targets: { t: ["p2"] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(s.players.p2?.library).toHaveLength(4);
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Sledge-Class Seedship : à 7+, en attaquant, vous pouvez mettre une créature de votre main sur le champ de bataille", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Sledge-Class Seedship", counters: { charge: 7 } }], hand: ["Serra Angel", "Shock"] },
    });
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Sledge-Class Seedship")]), (req, _p, cur) =>
      pickNamed(cur, req, "Serra Angel"),
    );
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Sledge-Class Seedship : créature volante à partir de 7 marqueurs", () => {
    const low = scenario({ p1: { battlefield: [{ name: "Sledge-Class Seedship", counters: { charge: 6 } }] } });
    expect(chars(low, idOf(low, "p1", "battlefield", "Sledge-Class Seedship")).types).not.toContain("Creature");
    const s = scenario({ p1: { battlefield: [{ name: "Sledge-Class Seedship", counters: { charge: 7 } }] } });
    const ship = idOf(s, "p1", "battlefield", "Sledge-Class Seedship");
    expect(chars(s, ship).types).toContain("Creature");
    expect(chars(s, ship).keywords).toContain("flying");
  });

  it("Space-Time Anomaly : le joueur ciblé meule autant de cartes que vos points de vie", () => {
    let s = scenario({
      p1: { life: 5, battlefield: ["Plains", "Island", "Plains", "Island"], hand: ["Space-Time Anomaly"] },
      p2: { library: lands("Forest", 9) },
    });
    s = settle(cast(s, "p1", "Space-Time Anomaly", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(5);
    expect(s.players.p2?.library).toHaveLength(4);
  });

  it("Starfield Vocalist : une capacité déclenchée par l'arrivée d'un permanent se déclenche une fois de plus, pas les autres", () => {
    let s = scenario({
      p1: {
        battlefield: ["Starfield Vocalist", "Weftstalker Ardent", "Pinnacle Emissary", ...lands("Mountain", 3)],
        hand: ["Rust Harvester", "Shock"],
      },
    });
    // Rust Harvester : un sort d'artefact (Emissary, pas doublé) puis une arrivée (Ardent, doublé).
    s = settle(cast(s, "p1", "Rust Harvester"));
    expect(lifeOf(s, "p2")).toBe(16); // Rust Harvester ×2, Drone ×2
    expect(tokensOf(s, "p1", "Drone")).toHaveLength(1);
  });

  it("Starwinder : une de vos créatures inflige des blessures de combat à un joueur, vous pouvez piocher autant de cartes", () => {
    const setup = () => scenario({ p1: { battlefield: ["Starwinder", "Serra Angel"] } });
    let s = setup();
    s = attack(s, [idOf(s, "p1", "battlefield", "Serra Angel")]);
    s = throughCombat(s, answering({ yes: true }));
    expect(handSize(s, "p1")).toBe(4);
    let t = setup();
    t = attack(t, [idOf(t, "p1", "battlefield", "Serra Angel")]);
    t = throughCombat(t, answering({ yes: false }));
    expect(handSize(t, "p1")).toBe(0);
  });

  it("Sunstar Chaplain : à votre étape de fin, avec deux créatures engagées, un marqueur sur une de vos créatures", () => {
    const setup = (tapped: number) =>
      scenario({
        p1: {
          battlefield: [
            "Sunstar Chaplain",
            { name: "Bear Cub", tapped: tapped >= 1 },
            { name: "Llanowar Elves", tapped: tapped >= 2 },
          ],
        },
      });
    let s = setup(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.battlefield.reduce((n, id) => n + (s.objects[id]?.counters["+1/+1"] ?? 0), 0)).toBe(1);
    let t = setup(1);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.battlefield.reduce((n, id) => n + (t.objects[id]?.counters["+1/+1"] ?? 0), 0)).toBe(0);
  });

  it("Sunstar Chaplain : {2}, retirez un marqueur +1/+1 d'une de vos créatures : engagez un artefact ou une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Sunstar Chaplain", { name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Plains", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Sunstar Chaplain"), "Engagez", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    const none = scenario({
      p1: { battlefield: ["Sunstar Chaplain", "Bear Cub", ...lands("Plains", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(hasActivation(none, idOf(none, "p1", "battlefield", "Sunstar Chaplain"), "Engagez")).toBe(false);
  });

  it("Synthesizer Labship : à 2+, au début de votre combat, un autre de vos artefacts devient une créature 2/2 volante", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Synthesizer Labship", counters: { charge: 2 } }, "Thaumaton Torpedo"] } });
    const torpedo = idOf(s, "p1", "battlefield", "Thaumaton Torpedo");
    s = passAccepting(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
    expect(chars(s, torpedo).types).toContain("Creature");
    expect([chars(s, torpedo).power, chars(s, torpedo).toughness]).toEqual([2, 2]);
    expect(chars(s, torpedo).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, torpedo).types).not.toContain("Creature");
  });

  it("Synthesizer Labship : créature avec le vol et la vigilance à partir de 9 marqueurs", () => {
    const low = scenario({ p1: { battlefield: [{ name: "Synthesizer Labship", counters: { charge: 8 } }] } });
    expect(chars(low, idOf(low, "p1", "battlefield", "Synthesizer Labship")).types).not.toContain("Creature");
    const s = scenario({ p1: { battlefield: [{ name: "Synthesizer Labship", counters: { charge: 9 } }] } });
    const ship = idOf(s, "p1", "battlefield", "Synthesizer Labship");
    expect(chars(s, ship).types).toContain("Creature");
    expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
  });

  it("The Seriema : cherche une créature légendaire ; à 7+, vos autres créatures légendaires engagées sont indestructibles", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 3),
        hand: ["The Seriema"],
        library: ["Bear Cub", "Tannuk, Steadfast Second", ...lands("Plains", 3)],
      },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "The Seriema"), (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return undefined;
    });
    expect(offered).toEqual(["Tannuk, Steadfast Second"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Tannuk, Steadfast Second"]);
    const setup = (charge: number) =>
      scenario({
        p1: {
          battlefield: [
            { name: "The Seriema", counters: { charge } },
            { name: "Tannuk, Steadfast Second", tapped: true },
            "Sami, Wildcat Captain",
            { name: "Bear Cub", tapped: true },
          ],
        },
      });
    const t = setup(7);
    expect(chars(t, idOf(t, "p1", "battlefield", "The Seriema")).keywords).toContain("flying");
    expect(chars(t, idOf(t, "p1", "battlefield", "Tannuk, Steadfast Second")).keywords).toContain("indestructible");
    expect(chars(t, idOf(t, "p1", "battlefield", "Sami, Wildcat Captain")).keywords).not.toContain("indestructible");
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
    const u = setup(6);
    expect(chars(u, idOf(u, "p1", "battlefield", "Tannuk, Steadfast Second")).keywords).not.toContain("indestructible");
  });

  it("Thrumming Hivepool : affinité pour les Slivers ; vos Slivers ont la double initiative et la célérité ; deux Slivers à l'entretien", () => {
    let s = scenario({ p1: { battlefield: ["Thrumming Hivepool"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const slivers = tokensOf(s, "p1", "Sliver");
    expect(slivers).toHaveLength(2);
    expect(chars(s, slivers[0] as string).keywords).toEqual(expect.arrayContaining(["doubleStrike", "haste"]));
    const h = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Thrumming Hivepool"] } });
    expect(castable(h, "p1", idOf(h, "p1", "hand", "Thrumming Hivepool"))).toBe(false);
    const two = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Thrumming Hivepool"] } });
    createTokens(two, "p1", { name: "Sliver", colors: [], types: ["Creature"], subtypes: ["Sliver"], power: 1, toughness: 1 }, 2);
    two.version += 1;
    expect(castable(two, "p1", idOf(two, "p1", "hand", "Thrumming Hivepool"))).toBe(true);
  });

  it("Warmaker Gunship : en arrivant, blessures égales à vos artefacts à une créature adverse ; créature volante à 6+", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Thaumaton Torpedo"], hand: ["Warmaker Gunship"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Warmaker Gunship"), (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Thaumaton Torpedo"], hand: ["Warmaker Gunship"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Warmaker Gunship"));
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    const big = scenario({ p1: { battlefield: [{ name: "Warmaker Gunship", counters: { charge: 6 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Warmaker Gunship");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toContain("flying");
  });

  it("Weapons Manufacturing : un artefact non-jeton arrive, un jeton Munitions (2 blessures en partant)", () => {
    let s = scenario({ p1: { battlefield: ["Weapons Manufacturing", "Plains"], hand: ["Thaumaton Torpedo"] } });
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    const [mun] = tokensOf(s, "p1", "Munitions");
    expect(mun).toBeDefined();
    // Un jeton d'artefact (les Munitions elles-mêmes) ne déclenche rien.
    expect(tokensOf(s, "p1", "Munitions")).toHaveLength(1);
    destroy(s, mun as string);
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
    expect(lifeOf(s, "p2")).toBe(18);
  });

  it("Xu-Ifit, Osteoharmonist : {T} : une créature de votre cimetière revient, Squelette sans capacité (rituel)", () => {
    let s = scenario({
      p1: { battlefield: ["Xu-Ifit, Osteoharmonist"], graveyard: ["Serra Angel"] },
      p2: { graveyard: ["Bear Cub"] },
    });
    const xu = idOf(s, "p1", "battlefield", "Xu-Ifit, Osteoharmonist");
    expect(() => activateNamed(s, xu, "Renvoyez", { targets: { t: [idOf(s, "p2", "graveyard", "Bear Cub")] } })).toThrow();
    s = settle(activateNamed(s, xu, "Renvoyez", { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(chars(s, angel).subtypes).toEqual(expect.arrayContaining(["Angel", "Skeleton"]));
    expect(chars(s, angel).keywords).not.toContain("flying");
    expect(chars(s, angel).keywords).not.toContain("vigilance");
  });
});

describe("Edge of Eternities, lot K8 : peu communes (1)", () => {
  it("All-Fates Scroll : mana de n'importe quelle couleur ; {7}, {T}, sacrifice : une carte par nom de terrain différent", () => {
    let s = scenario({
      p1: { battlefield: ["All-Fates Scroll", ...lands("Plains", 4), ...lands("Island", 2), ...lands("Forest", 2)] },
    });
    const scroll = idOf(s, "p1", "battlefield", "All-Fates Scroll");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === scroll ? a.colors : []));
    expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    s = settle(activateNamed(s, scroll, "Une carte"));
    expect(handSize(s, "p1")).toBe(3);
    expect(idsOf(s, "p1", "battlefield", "All-Fates Scroll")).toHaveLength(0);
  });

  it("All-Fates Stalker : exile jusqu'à une créature non-Assassin jusqu'à son départ (distorsion : retour à l'étape de fin)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["All-Fates Stalker"] },
      p2: { battlefield: ["Serra Angel", "All-Fates Stalker"] },
    });
    s = cast(s, "p1", "All-Fates Stalker", { warp: true });
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return pickNamed(cur, req, "Serra Angel");
    });
    expect(offered).not.toContain("All-Fates Stalker");
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Alpharael, Dreaming Acolyte : piochez deux cartes, puis défaussez-en deux, ou une seule carte d'artefact", () => {
    const setup = (library: string[]) =>
      scenario({ p1: { battlefield: ["Island", "Swamp", "Plains"], hand: ["Alpharael, Dreaming Acolyte", "Forest"], library } });
    const s = settle(
      cast(setup(["Thaumaton Torpedo", "Bear Cub", ...lands("Island", 3)]), "p1", "Alpharael, Dreaming Acolyte"),
      (req, _p, cur) => pickNamed(cur, req, "Thaumaton Torpedo"),
    );
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Thaumaton Torpedo"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Forest"]);
    let t = settle(cast(setup(["Opt", "Bear Cub", ...lands("Island", 3)]), "p1", "Alpharael, Dreaming Acolyte"));
    expect(t.players.p1?.graveyard).toHaveLength(2);
    expect(handSize(t, "p1")).toBe(1);
    // Contact mortel pendant votre tour seulement.
    const alpha = idOf(t, "p1", "battlefield", "Alpharael, Dreaming Acolyte");
    expect(chars(t, alpha).keywords).toContain("deathtouch");
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, alpha).keywords).not.toContain("deathtouch");
  });

  it("Atmospheric Greenhouse : un marqueur +1/+1 sur chacune de vos créatures ; créature volante et piétinement à 8+", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 5), "Bear Cub", "Llanowar Elves"], hand: ["Atmospheric Greenhouse"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Atmospheric Greenhouse"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["+1/+1"] ?? 0).toBe(0);
    const big = scenario({ p1: { battlefield: [{ name: "Atmospheric Greenhouse", counters: { charge: 8 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Atmospheric Greenhouse");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
  });

  it("Atomic Microsizer : +1/+0 ; la créature équipée attaque, une créature ciblée devient 1/1 de base et imblocable", () => {
    let s = scenario({
      p1: { battlefield: ["Atomic Microsizer", "Serra Angel", ...lands("Island", 2)] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Atomic Microsizer"), "Équip", { targets: { t: [angel] } }));
    expect(chars(s, angel).power).toBe(5);
    s = attack(s, [angel]);
    s = settle(s, picking([angel]));
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 1]);
    expect(chars(s, angel).keywords).toContain("unblockable");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([5, 4]);
  });

  it("Biomechan Engineer : un Lander en arrivant ; {8} : piochez deux cartes et un Robot 2/2", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 9), "Forest"], hand: ["Biomechan Engineer"] } });
    s = settle(cast(s, "p1", "Biomechan Engineer"));
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Biomechan Engineer"), "Piochez"));
    expect(handSize(s, "p1")).toBe(2);
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(1);
  });

  it("Broodguard Elite : arrive avec X marqueurs ; en partant, ses marqueurs vont sur une de vos créatures (distorsion {X}{G})", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Broodguard Elite"] } });
    s = settle(cast(s, "p1", "Broodguard Elite", { x: 2 }));
    const elite = idOf(s, "p1", "battlefield", "Broodguard Elite");
    expect(s.objects[elite]?.counters["+1/+1"]).toBe(2);
    destroy(s, elite);
    s = settle(s, picking([idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
    let w = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Broodguard Elite"] } });
    w = settle(cast(w, "p1", "Broodguard Elite", { x: 3, warp: true }));
    expect(w.objects[idOf(w, "p1", "battlefield", "Broodguard Elite")]?.counters["+1/+1"]).toBe(3);
    w = advanceUntil(w, (x) => x.turn.active === "p2");
    expect(w.objects[idOf(w, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(3);
  });

  it("Bygone Colossus : 9/9 lancé pour sa distorsion {3}", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Bygone Colossus"] } });
    s = settle(cast(s, "p1", "Bygone Colossus", { warp: true }));
    const c = idOf(s, "p1", "battlefield", "Bygone Colossus");
    expect([chars(s, c).power, chars(s, c).toughness]).toEqual([9, 9]);
    expect(s.objects[c]?.cast?.via).toBe("warp");
  });

  it("Cerebral Download : surveillance X (vos artefacts), puis piochez trois cartes", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Thaumaton Torpedo", "Memorial Vault"], hand: ["Cerebral Download"] },
    });
    let seen = 0;
    s = settle(cast(s, "p1", "Cerebral Download"), (req) => {
      if (req.type === "pick" && req.intent !== "triggerTarget") {
        seen = req.options.length;
        return req.options.slice();
      }
      return undefined;
    });
    expect(seen).toBe(2);
    expect(s.players.p1?.graveyard).toHaveLength(3); // deux cartes surveillées et le sort
    expect(handSize(s, "p1")).toBe(3);
  });

  it("Close Encounter : coût additionnel, une créature que vous contrôlez ou une carte de créature distordue que vous possédez en exil", () => {
    const s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), "Bear Cub", "Serra Angel"],
        hand: ["Close Encounter", "Shivan Dragon"],
        graveyard: ["Starwinder", "Bygone Colossus"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const card = idOf(s, "p1", "hand", "Close Encounter");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Starwinder exilée par la distorsion ; Bygone Colossus exilée autrement (pas distordue).
    const warped = moveObject(s, idOf(s, "p1", "graveyard", "Starwinder"), "exile") as string;
    (s.objects[warped] as { warpExiledTurn?: number }).warpExiledTurn = s.turn.number - 1;
    moveObject(s, idOf(s, "p1", "graveyard", "Bygone Colossus"), "exile");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "behold") : undefined;
    // Ni la carte de la main, ni la carte exilée sans distorsion ; la créature choisie n'est pas une cible.
    expect(namesIn(s, pick?.options).sort()).toEqual(["Bear Cub", "Serra Angel", "Starwinder"]);
    expect(opt?.type === "cast" ? opt.modes[0]?.targets.map((x) => x.id) : []).toEqual(["t"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const t = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] }, picks: { behold: [bear] } }));
    expect(t.objects[angel]?.damage).toBe(2);
    const u = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] }, picks: { behold: [warped] } }));
    expect(idsOf(u, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // La carte choisie reste en exil.
    expect(u.objects[warped]?.zone).toBe("exile");
  });

  it("Codecracker Hound : regardez les deux cartes du dessus, une en main, l'autre au cimetière", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Codecracker Hound"], library: ["Opt", "Bear Cub", "Forest"] },
    });
    s = settle(cast(s, "p1", "Codecracker Hound"), (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
  });

  it("Cut Propulsion : la créature s'inflige sa force ; deux fois plus si elle a le vol", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 6), hand: ["Cut Propulsion", "Cut Propulsion"] },
      p2: { battlefield: ["Eumidian Terrabotanist", "Mm'menon, Uthros Exile"] },
    });
    const bot = idOf(s, "p2", "battlefield", "Eumidian Terrabotanist");
    const flier = idOf(s, "p2", "battlefield", "Mm'menon, Uthros Exile");
    s = settle(cast(s, "p1", "Cut Propulsion", { targets: { t: [bot] } }));
    expect(s.objects[bot]?.damage).toBe(2);
    s = settle(cast(s, "p1", "Cut Propulsion", { targets: { t: [flier] } }));
    expect(s.objects[flier]?.damage).toBe(2);
  });

  it("Dawnstrike Vanguard : lien de vie ; avec deux créatures engagées, un marqueur sur chacune de vos autres créatures", () => {
    const setup = (tapped: boolean) =>
      scenario({
        p1: {
          battlefield: ["Dawnstrike Vanguard", { name: "Bear Cub", tapped }, { name: "Llanowar Elves", tapped: true }],
        },
      });
    let s = setup(true);
    const van = idOf(s, "p1", "battlefield", "Dawnstrike Vanguard");
    expect(chars(s, van).keywords).toContain("lifelink");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[van]?.counters["+1/+1"] ?? 0).toBe(0);
    let t = setup(false);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Debris Field Crusher : 3 blessures à n'importe quelle cible ; à 8+, créature volante et {1}{R} : +2/+0", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Debris Field Crusher"] } });
    s = settle(cast(s, "p1", "Debris Field Crusher"), (req) =>
      req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
    );
    expect(lifeOf(s, "p2")).toBe(17);
    const low = scenario({
      p1: { battlefield: [{ name: "Debris Field Crusher", counters: { charge: 7 } }, ...lands("Mountain", 2)] },
    });
    expect(hasActivation(low, idOf(low, "p1", "battlefield", "Debris Field Crusher"), "+2/+0")).toBe(false);
    let big = scenario({
      p1: { battlefield: [{ name: "Debris Field Crusher", counters: { charge: 8 } }, ...lands("Mountain", 2)] },
    });
    const ship = idOf(big, "p1", "battlefield", "Debris Field Crusher");
    expect(chars(big, ship).keywords).toContain("flying");
    big = settle(activateNamed(big, ship, "+2/+0"));
    expect(chars(big, ship).power).toBe(3);
  });

  it("Desculpting Blast : renvoie un permanent non-terrain ; s'il attaquait, un Drone 1/1", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: lands("Island", 4), hand: ["Desculpting Blast", "Desculpting Blast"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Desculpting Blast", { targets: { t: [cub] } }));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(tokensOf(s, "p2", "Drone")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: lands("Island", 2), hand: ["Desculpting Blast"] },
    });
    t = act(t, "p1", { type: "pass" });
    t = settle(cast(t, "p2", "Desculpting Blast", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(tokensOf(t, "p2", "Drone")).toHaveLength(0);
  });

  it("Dual-Sun Adepts : double initiative ; {5} : vos créatures +1/+1 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Dual-Sun Adepts", "Bear Cub", ...lands("Plains", 5)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const adepts = idOf(s, "p1", "battlefield", "Dual-Sun Adepts");
    expect(chars(s, adepts).keywords).toContain("doubleStrike");
    s = settle(activateNamed(s, adepts, "Vos créatures"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(3);
    expect(chars(s, adepts).toughness).toBe(3);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(4);
  });

  it("Dual-Sun Technique : double initiative ; piochez si la créature a un marqueur +1/+1", () => {
    const setup = (counters: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Plains", 2), { name: "Bear Cub", counters: { "+1/+1": counters } }],
          hand: ["Dual-Sun Technique"],
        },
      });
    let s = setup(1);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Dual-Sun Technique", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("doubleStrike");
    expect(handSize(s, "p1")).toBe(1);
    let t = setup(0);
    t = settle(cast(t, "p1", "Dual-Sun Technique", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
    expect(handSize(t, "p1")).toBe(0);
  });

  it("Dubious Delicacy : flash, -3/-3 à jusqu'à une créature ; {2}, {T}, sacrifice : +3 PV ou un adversaire perd 3 PV", () => {
    // Flash : lancée pendant le tour adverse.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Swamp", 5), hand: ["Dubious Delicacy"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = act(t, "p2", { type: "pass" });
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = settle(cast(t, "p1", "Dubious Delicacy"), picking([angel]));
    expect(chars(t, angel).power).toBe(1);
    const food = idOf(t, "p1", "battlefield", "Dubious Delicacy");
    t = act(t, "p2", { type: "pass" });
    const gain = settle(activateNamed(t, food, "+3 PV"));
    expect(lifeOf(gain, "p1")).toBe(23);
    const drain = settle(activateNamed(t, food, "Un adversaire", { targets: { t: ["p2"] } }));
    expect(lifeOf(drain, "p2")).toBe(17);
    expect(lifeOf(drain, "p1")).toBe(20);
  });
});

describe("Edge of Eternities, lot K8 : peu communes (2)", () => {
  it("Edge Rover : portée ; en mourant, chaque joueur crée un Lander", () => {
    let s = scenario({ p1: { battlefield: ["Edge Rover"] } });
    const rover = idOf(s, "p1", "battlefield", "Edge Rover");
    expect(chars(s, rover).keywords).toContain("reach");
    destroy(s, rover);
    s = settle(s);
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
    expect(tokensOf(s, "p2", "Lander")).toHaveLength(1);
  });

  it("Emergency Eject : détruit un permanent non-terrain ; son contrôleur crée un Lander", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Emergency Eject"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    expect(() => cast(s, "p1", "Emergency Eject", { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = settle(cast(s, "p1", "Emergency Eject", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(tokensOf(s, "p2", "Lander")).toHaveLength(1);
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(0);
  });

  it("Eumidian Terrabotanist : chaque terrain qui arrive sous votre contrôle, +1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Eumidian Terrabotanist"], hand: ["Forest"] } });
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(lifeOf(s, "p1")).toBe(21);
  });

  it("Eusocial Engineering : landfall, un Robot 2/2 ; distorsion {1}{G}", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Eusocial Engineering", "Forest"] } });
    s = settle(cast(s, "p1", "Eusocial Engineering", { warp: true }));
    expect(idsOf(s, "p1", "battlefield", "Eusocial Engineering")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Eusocial Engineering")).toHaveLength(0);
  });

  it("Faller's Faithful : détruit jusqu'à une autre créature ; son contrôleur pioche deux cartes si elle n'a pas été blessée", () => {
    const setup = (damage: number) =>
      scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Faller's Faithful"] },
        p2: { battlefield: [{ name: "Serra Angel", damage }] },
      });
    let s = settle(cast(setup(0), "p1", "Faller's Faithful"), (req, _p, cur) => pickNamed(cur, req, "Serra Angel"));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handSize(s, "p2")).toBe(2);
    expect(handSize(s, "p1")).toBe(0);
    s = settle(cast(setup(1), "p1", "Faller's Faithful"), (req, _p, cur) => pickNamed(cur, req, "Serra Angel"));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handSize(s, "p2")).toBe(0);
  });

  it("Fell Gravship : meulez trois cartes, puis reprenez une carte de créature ou de Vaisseau ; à 8+, vol et lien de vie", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 3),
        hand: ["Fell Gravship"],
        graveyard: ["Galvanizing Sawship", "Shock"],
        library: ["Forest", "Bear Cub", "Opt", "Island"],
      },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Fell Gravship"), (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return pickNamed(cur, req, "Bear Cub");
    });
    // Les cartes meulées comptent ; ni l'éphémère ni le terrain.
    expect(offered.sort()).toEqual(["Bear Cub", "Galvanizing Sawship"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Galvanizing Sawship", "Opt", "Shock"]);
    const big = scenario({ p1: { battlefield: [{ name: "Fell Gravship", counters: { charge: 8 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Fell Gravship");
    expect(chars(big, ship).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
  });

  it("Full Bore : +3/+2 ; le piétinement et la célérité en plus si la créature a été lancée pour sa distorsion", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Memorial Team Leader", "Full Bore", "Full Bore"] },
    });
    s = settle(cast(s, "p1", "Memorial Team Leader", { warp: true }));
    const leader = idOf(s, "p1", "battlefield", "Memorial Team Leader");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Full Bore", { targets: { t: [leader] } }));
    expect([chars(s, leader).power, chars(s, leader).toughness]).toEqual([7, 5]);
    expect(chars(s, leader).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    s = settle(cast(s, "p1", "Full Bore", { targets: { t: [cub] } }));
    // +3/+2, et +1/+0 du Memorial Team Leader pendant votre tour.
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([6, 4]);
    expect(chars(s, cub).keywords).not.toContain("trample");
  });

  it("Gigastorm Titan : coûte {3} de moins si vous avez lancé un autre sort ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Gigastorm Titan", "Opt"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gigastorm Titan"))).toBe(false);
    s = settle(cast(s, "p1", "Opt"));
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gigastorm Titan"))).toBe(true);
  });

  it("Glacier Godmaw : piétinement, un Lander ; landfall, vos créatures +1/+1, vigilance et célérité", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 7), { name: "Bear Cub", sick: true }], hand: ["Glacier Godmaw", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Glacier Godmaw"));
    const maw = idOf(s, "p1", "battlefield", "Glacier Godmaw");
    expect(chars(s, maw).keywords).toContain("trample");
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["vigilance", "haste"]));
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(4);
  });

  it("Haliya, Ascendant Cadet : un marqueur en arrivant ou en attaquant ; une pioche par lot de blessures de combat", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Forest", "Plains", "Bear Cub"], hand: ["Haliya, Ascendant Cadet"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Haliya, Ascendant Cadet"), picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    const haliya = idOf(s, "p1", "battlefield", "Haliya, Ascendant Cadet");
    s.objects[haliya]!.controlledSince = 0;
    s = attack(s, [haliya, cub]);
    s = throughCombat(s, picking([haliya]));
    expect(s.objects[haliya]?.counters["+1/+1"]).toBe(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p2")).toBe(13);
  });

  it("Harmonious Grovestrider : F/E égales au nombre de vos terrains ; garde {2}", () => {
    const s = scenario({
      p1: { battlefield: ["Harmonious Grovestrider", ...lands("Forest", 4)] },
      p2: { battlefield: lands("Forest", 6) },
    });
    const g = idOf(s, "p1", "battlefield", "Harmonious Grovestrider");
    expect([chars(s, g).power, chars(s, g).toughness]).toEqual([4, 4]);
    expect(chars(s, g).abilities.some((a) => a.kind === "triggered" && a.label?.startsWith("Garde"))).toBe(true);
  });

  it("Hemosymbic Mite : engagée, une autre de vos créatures ciblée gagne +X/+X (X = sa force)", () => {
    let s = scenario({ p1: { battlefield: ["Hemosymbic Mite", "Bear Cub"] } });
    const mite = idOf(s, "p1", "battlefield", "Hemosymbic Mite");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(attack(s, [mite]), picking([cub]));
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 3]);
  });

  it("Honored Knight-Captain : un Soldat 1/1 ; {4}{W}{W}, sacrifice : un Équipement de la bibliothèque sur le champ de bataille", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 8),
        hand: ["Honored Knight-Captain"],
        library: ["Bear Cub", "Atomic Microsizer", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "Honored Knight-Captain"));
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(1);
    let offered: string[] = [];
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Honored Knight-Captain"), "Cherchez"), (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return undefined;
    });
    expect(offered).toEqual(["Atomic Microsizer"]);
    expect(idsOf(s, "p1", "battlefield", "Atomic Microsizer")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Honored Knight-Captain")).toHaveLength(0);
  });

  it("Hylderblade : +3/+1 ; vide, à votre étape de fin, il s'attache à une de vos créatures", () => {
    const setup = () => scenario({ p1: { battlefield: ["Hylderblade", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
    let s = withVoid(setup());
    const blade = idOf(s, "p1", "battlefield", "Hylderblade");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[blade]?.attachedTo).toBe(cub);
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([5, 3]);
    let t = setup();
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.objects[idOf(t, "p1", "battlefield", "Hylderblade")]?.attachedTo).toBeFalsy();
  });

  it("Hymn of the Faller : surveillance 1, piochez, perdez 1 PV ; vide : une carte de plus", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Hymn of the Faller"] }, p2: { battlefield: ["Llanowar Elves"] } });
    let s = settle(cast(setup(), "p1", "Hymn of the Faller"));
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p1")).toBe(19);
    s = settle(cast(withVoid(setup()), "p1", "Hymn of the Faller"));
    expect(handSize(s, "p1")).toBe(2);
    expect(lifeOf(s, "p1")).toBe(19);
  });

  it("Illvoi Infiltrator : imblocable si vous avez lancé deux sorts ce tour-ci ; pioche en blessant un joueur", () => {
    let s = scenario({ p1: { battlefield: ["Illvoi Infiltrator", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const inf = idOf(s, "p1", "battlefield", "Illvoi Infiltrator");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, inf).keywords).not.toContain("unblockable");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, inf).keywords).toContain("unblockable");
    const before = handSize(s, "p1");
    s = throughCombat(attack(s, [inf]));
    expect(lifeOf(s, "p2")).toBe(19);
    expect(handSize(s, "p1")).toBe(before + 1);
  });

  it("Interceptor Mechan : vol ; reprend une carte d'artefact ou de créature ; vide : un marqueur à votre étape de fin", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Interceptor Mechan"],
          graveyard: ["Thaumaton Torpedo", "Opt"],
        },
        p2: { battlefield: ["Llanowar Elves"] },
      });
    let s = settle(cast(setup(), "p1", "Interceptor Mechan"));
    const mech = idOf(s, "p1", "battlefield", "Interceptor Mechan");
    expect(chars(s, mech).keywords).toContain("flying");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Thaumaton Torpedo"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[mech]?.counters["+1/+1"] ?? 0).toBe(0);
    let t = settle(cast(withVoid(setup()), "p1", "Interceptor Mechan"));
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.objects[idOf(t, "p1", "battlefield", "Interceptor Mechan")]?.counters["+1/+1"]).toBe(1);
  });

  it("Invasive Maneuvers : 3 blessures, 5 si vous contrôlez un Vaisseau", () => {
    const setup = (ship: boolean) =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...(ship ? ["Galvanizing Sawship"] : [])], hand: ["Invasive Maneuvers"] },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
      });
    let s = setup(false);
    s = settle(cast(s, "p1", "Invasive Maneuvers", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    let t = setup(true);
    t = settle(cast(t, "p1", "Invasive Maneuvers", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
  });
});

describe("Edge of Eternities, lot K8 : peu communes (3)", () => {
  it("Kavaron Harrier : en attaquant, payez {2} pour un Robot engagé et attaquant, sacrifié à la fin du combat", () => {
    const setup = () => scenario({ p1: { battlefield: ["Kavaron Harrier", ...lands("Mountain", 2)] } });
    let s = setup();
    s = attack(s, [idOf(s, "p1", "battlefield", "Kavaron Harrier")]);
    s = settle(s, answering({ yes: true }));
    const [robot] = tokensOf(s, "p1", "Robot");
    expect(robot).toBeDefined();
    expect(s.objects[robot as string]?.tapped).toBe(true);
    expect(s.combat?.attackers.some((a) => a.id === robot)).toBe(true);
    s = throughCombat(s);
    expect(lifeOf(s, "p2")).toBe(16);
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(0);
    let t = setup();
    t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Kavaron Harrier")]), answering({ yes: false }));
    expect(lifeOf(t, "p2")).toBe(18);
  });

  it("Larval Scoutlander : sacrifiez un terrain ou un Lander pour deux terrains de base engagés ; sinon rien", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Larval Scoutlander"], library: [...lands("Forest", 3), "Bear Cub"] },
      });
    const s = settle(cast(setup(), "p1", "Larval Scoutlander"), (req, _p, cur) => {
      if (req.type === "pick" && req.options.some((id) => cur.objects[String(id)]?.zone === "battlefield"))
        return pickNamed(cur, req, "Forest");
      return undefined;
    });
    const forests = idsOf(s, "p1", "battlefield", "Forest");
    expect(forests).toHaveLength(5);
    expect(s.players.p1?.library).toHaveLength(2);
    const t = settle(cast(setup(), "p1", "Larval Scoutlander"), (req) =>
      req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined,
    );
    expect(idsOf(t, "p1", "battlefield", "Forest")).toHaveLength(4);
    expect(t.players.p1?.library).toHaveLength(4);
    const big = scenario({ p1: { battlefield: [{ name: "Larval Scoutlander", counters: { charge: 7 } }] } });
    expect(chars(big, idOf(big, "p1", "battlefield", "Larval Scoutlander")).keywords).toContain("flying");
  });

  it("Lashwhip Predator : coûte {2} de moins si vos adversaires contrôlent trois créatures ou plus ; portée", () => {
    const setup = (n: number) =>
      scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Lashwhip Predator"] },
        p2: { battlefield: Array(n).fill("Bear Cub") },
      });
    expect(castable(setup(2), "p1", idOf(setup(2), "p1", "hand", "Lashwhip Predator"))).toBe(false);
    const s = setup(3);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lashwhip Predator"))).toBe(true);
    const t = settle(cast(s, "p1", "Lashwhip Predator"));
    expect(chars(t, idOf(t, "p1", "battlefield", "Lashwhip Predator")).keywords).toContain("reach");
  });

  it("Lithobraking : un Lander ; si vous sacrifiez un artefact, 2 blessures à chaque créature", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Lithobraking"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    const s = settle(cast(setup(), "p1", "Lithobraking"), (req, _p, cur) => pickNamed(cur, req, "Lander"));
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    const t = settle(cast(setup(), "p1", "Lithobraking"), (req) =>
      req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined,
    );
    expect(tokensOf(t, "p1", "Lander")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Mechan Assembler : un autre artefact arrive, un Robot 2/2, une seule fois par tour", () => {
    let s = scenario({
      p1: { battlefield: ["Mechan Assembler", ...lands("Island", 2)], hand: ["Thaumaton Torpedo", "Thaumaton Torpedo"] },
    });
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(1);
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(1);
  });

  it("Mechan Navigator : chaque fois qu'il devient engagé, piochez puis défaussez une carte", () => {
    let s = scenario({ p1: { battlefield: ["Mechan Navigator"], hand: ["Forest"], library: ["Opt", ...lands("Island", 3)] } });
    s = settle(attack(s, [idOf(s, "p1", "battlefield", "Mechan Navigator")]), (req, _p, cur) => pickNamed(cur, req, "Forest"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
  });

  it("Meltstrider Eulogist : une de vos créatures avec un marqueur +1/+1 meurt, piochez", () => {
    let s = scenario({
      p1: { battlefield: ["Meltstrider Eulogist", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(s);
    expect(handSize(s, "p1")).toBe(0);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Memorial Team Leader : pendant votre tour, vos autres créatures +1/+0", () => {
    let s = scenario({ p1: { battlefield: ["Memorial Team Leader", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Memorial Team Leader")).power).toBe(4);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(4);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).power).toBe(2);
  });

  it("Mm'menon, Uthros Exile : vol ; un de vos artefacts arrive, un marqueur sur une créature ciblée", () => {
    let s = scenario({
      p1: { battlefield: ["Mm'menon, Uthros Exile", "Bear Cub", "Plains"], hand: ["Thaumaton Torpedo"] },
      p2: { battlefield: ["Plains"], hand: ["Thaumaton Torpedo"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, idOf(s, "p1", "battlefield", "Mm'menon, Uthros Exile")).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Thaumaton Torpedo"), picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(cast(s, "p2", "Thaumaton Torpedo"), picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Molecular Modifier : au début de votre combat, une de vos créatures +1/+0 et l'initiative", () => {
    let s = scenario({ p1: { battlefield: ["Molecular Modifier", "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    expect(chars(s, cub).power + chars(s, idOf(s, "p1", "battlefield", "Molecular Modifier")).power).toBe(5);
    let t = scenario({ p1: { battlefield: ["Molecular Modifier", "Bear Cub"] } });
    t = advanceUntil(t, (x) => x.pending?.kind === "choice");
    t = act(t, "p1", { type: "choose", values: [idOf(t, "p1", "battlefield", "Bear Cub")] });
    t = passAccepting(t, (x) => x.pending?.kind === "declareAttackers");
    expect(chars(t, cub).power).toBe(3);
    expect(chars(t, cub).keywords).toContain("firstStrike");
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, cub).keywords).not.toContain("firstStrike");
  });

  it("Monoist Circuit-Feeder : vol ; +X/+0 à une de vos créatures et -0/-X à une créature adverse (X = vos artefacts)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 6), "Bear Cub", "Thaumaton Torpedo"], hand: ["Monoist Circuit-Feeder"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Monoist Circuit-Feeder"), picking([cub, angel]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Monoist Circuit-Feeder")).keywords).toContain("flying");
    expect(chars(s, cub).power).toBe(4);
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([4, 2]);
  });

  it("Monoist Sentry : 4/1 avec le défenseur, ne peut pas attaquer", () => {
    const s = scenario({ p1: { battlefield: ["Monoist Sentry"] } });
    const sentry = idOf(s, "p1", "battlefield", "Monoist Sentry");
    expect(chars(s, sentry).keywords).toContain("defender");
    const t = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(t, "p1", { type: "declareAttackers", attackers: [{ id: sentry, defender: "p2" }] })).toThrow();
  });

  it("Mouth of the Storm : vol, garde {2} ; les créatures adverses -3/-0 jusqu'à votre prochain tour", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Mouth of the Storm"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Mouth of the Storm"));
    const mouth = idOf(s, "p1", "battlefield", "Mouth of the Storm");
    expect(chars(s, mouth).keywords).toContain("flying");
    expect(chars(s, mouth).abilities.some((a) => a.kind === "triggered" && a.label?.startsWith("Garde"))).toBe(true);
    expect(chars(s, angel).power).toBe(1);
    expect(chars(s, mouth).power).toBe(6);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).power).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1");
    expect(chars(s, angel).power).toBe(4);
  });

  it("Pull Through the Weft : jusqu'à deux permanents non-terrains en main, jusqu'à deux terrains sur le champ de bataille engagés", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 5),
        hand: ["Pull Through the Weft"],
        graveyard: ["Bear Cub", "Shock", "Thaumaton Torpedo", "Forest", "Island"],
      },
    });
    const gy = (n: string) => idOf(s, "p1", "graveyard", n);
    expect(() => cast(s, "p1", "Pull Through the Weft", { targets: { a: [gy("Shock")], b: [] } })).toThrow();
    s = settle(
      cast(s, "p1", "Pull Through the Weft", {
        targets: { a: [gy("Bear Cub"), gy("Thaumaton Torpedo")], b: [gy("Forest"), gy("Island")] },
      }),
    );
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Thaumaton Torpedo"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(6);
  });

  it("Pulsar Squadron Ace : un Vaisseau des cinq cartes du dessus en main ; sinon un marqueur +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Pulsar Squadron Ace"],
        library: ["Bear Cub", "Galvanizing Sawship", ...lands("Plains", 5)],
      },
    });
    s = settle(cast(s, "p1", "Pulsar Squadron Ace"), (req, _p, cur) => pickNamed(cur, req, "Galvanizing Sawship"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Galvanizing Sawship"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Pulsar Squadron Ace")]?.counters["+1/+1"] ?? 0).toBe(0);
    let t = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Pulsar Squadron Ace"],
        library: ["Bear Cub", ...lands("Plains", 5), "Galvanizing Sawship"],
      },
    });
    t = settle(cast(t, "p1", "Pulsar Squadron Ace"));
    expect(handSize(t, "p1")).toBe(0);
    expect(t.objects[idOf(t, "p1", "battlefield", "Pulsar Squadron Ace")]?.counters["+1/+1"]).toBe(1);
  });

  it("Rayblade Trooper : un marqueur en arrivant ; une de vos créatures non-jetons avec un marqueur meurt, un Soldat 1/1", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Llanowar Elves"], hand: ["Rayblade Trooper"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Rayblade Trooper"), picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = settle(s);
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(0);
    destroy(s, cub);
    s = settle(s);
    const [soldier] = tokensOf(s, "p1", "Human Soldier");
    expect(soldier).toBeDefined();
    // Un jeton avec un marqueur ne compte pas.
    changeCounters(s, s.objects[soldier as string]!, "+1/+1", 1);
    destroy(s, soldier as string);
    s = settle(s);
    expect(tokensOf(s, "p1", "Human Soldier")).toHaveLength(0);
  });

  it("Remnant Elemental : portée ; landfall, +2/+0 jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Remnant Elemental"], hand: ["Mountain"] } });
    const el = idOf(s, "p1", "battlefield", "Remnant Elemental");
    expect(chars(s, el).keywords).toContain("reach");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }));
    expect([chars(s, el).power, chars(s, el).toughness]).toEqual([2, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, el).power).toBe(0);
  });

  it("Reroute Systems : un artefact ou une créature indestructible, ou 2 blessures à une créature engagée", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Reroute Systems"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Reroute Systems", { mode: 0, targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("indestructible");
    const t = scenario({
      p1: { battlefield: ["Plains"], hand: ["Reroute Systems"] },
      p2: { battlefield: ["Bear Cub", { name: "Llanowar Elves", tapped: true }] },
    });
    expect(() =>
      cast(t, "p1", "Reroute Systems", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }),
    ).toThrow();
    const u = settle(
      cast(t, "p1", "Reroute Systems", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Llanowar Elves")] } }),
    );
    expect(idsOf(u, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });
});

describe("Edge of Eternities, lot K8 : peu communes (4)", () => {
  it("Rescue Skiff : renvoie une carte de créature ou d'enchantement de votre cimetière ; créature volante à 10+", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Rescue Skiff"], graveyard: ["Serra Angel", "Shock"] } });
    s = settle(cast(s, "p1", "Rescue Skiff"));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shock"]);
    const big = scenario({ p1: { battlefield: [{ name: "Rescue Skiff", counters: { charge: 10 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Rescue Skiff");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toContain("flying");
  });

  it("Roving Actuator : vide, exile un éphémère ou rituel de VM 2 ou moins de votre cimetière et en lance une copie gratuite", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Roving Actuator"], graveyard: ["Shock", "Bombard"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
    let s = cast(withVoid(setup()), "p1", "Roving Actuator");
    let offered: string[] = [];
    s = passAccepting(s, (x) => {
      const p = x.pending;
      if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "triggerTarget")
        offered = p.request.options.map((id) => nameOf(x, String(id)) ?? "");
      return !!castNowOf(x);
    });
    const now = castNowOf(s);
    expect(now?.cards).toHaveLength(1);
    s = act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } });
    s = settle(s);
    expect(offered).toEqual(["Shock"]);
    expect(exiled(s, "Shock")).toHaveLength(1);
    expect(lifeOf(s, "p2")).toBe(18);
    // Sans vide : rien.
    const t = settle(cast(setup(), "p1", "Roving Actuator"));
    expect(namesIn(t, t.players.p1?.graveyard).sort()).toEqual(["Bombard", "Shock"]);
    expect(lifeOf(t, "p2")).toBe(20);
  });

  it("Ruinous Rampage : 3 blessures à chaque adversaire, ou exil des artefacts de VM 3 ou moins", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Ruinous Rampage"] } });
    s = settle(cast(s, "p1", "Ruinous Rampage", { mode: 0 }));
    expect(lifeOf(s, "p2")).toBe(17);
    expect(lifeOf(s, "p1")).toBe(20);
    let t = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Thaumaton Torpedo"], hand: ["Ruinous Rampage"] },
      p2: { battlefield: ["Memorial Vault", "Rust Harvester", "Bear Cub"] },
    });
    t = settle(cast(t, "p1", "Ruinous Rampage", { mode: 1 }));
    expect(namesIn(t, t.exile).sort()).toEqual(["Rust Harvester", "Thaumaton Torpedo"]);
    expect(idsOf(t, "p2", "battlefield", "Memorial Vault")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Sami, Ship's Engineer : à votre étape de fin, avec deux créatures engagées, un Robot 2/2 engagé", () => {
    const setup = (tapped: boolean) =>
      scenario({
        p1: { battlefield: ["Sami, Ship's Engineer", { name: "Bear Cub", tapped }, { name: "Llanowar Elves", tapped: true }] },
      });
    let s = advanceUntil(setup(true), (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    const robots = tokensOf(s, "p1", "Robot");
    expect(robots).toHaveLength(1);
    expect(s.objects[robots[0] as string]?.tapped).toBe(true);
    s = advanceUntil(setup(false), (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(0);
  });

  it("Scour for Scrap : cherchez un artefact, reprenez un artefact du cimetière, ou les deux", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 4),
        hand: ["Scour for Scrap"],
        graveyard: ["Memorial Vault", "Bear Cub"],
        library: ["Bear Cub", "Thaumaton Torpedo", ...lands("Island", 3)],
      },
    });
    expect(() =>
      cast(s, "p1", "Scour for Scrap", { mode: 1, targets: { g: [idOf(s, "p1", "graveyard", "Bear Cub")] } }),
    ).toThrow();
    s = settle(cast(s, "p1", "Scour for Scrap", { mode: 2, targets: { g: [idOf(s, "p1", "graveyard", "Memorial Vault")] } }));
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Memorial Vault", "Thaumaton Torpedo"]);
  });

  it("Scrounge for Eternity : sacrifiez un artefact ou une créature ; une créature ou un Vaisseau de VM 5 ou moins revient, puis un Lander", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), "Bear Cub"],
        hand: ["Scrounge for Eternity"],
        graveyard: ["Serra Angel", "Extinguisher Battleship"],
      },
    });
    expect(() =>
      cast(s, "p1", "Scrounge for Eternity", {
        targets: { t: [idOf(s, "p1", "graveyard", "Extinguisher Battleship")] },
        sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
      }),
    ).toThrow();
    s = settle(
      cast(s, "p1", "Scrounge for Eternity", {
        targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] },
        sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
      }),
    );
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
  });

  it("Seedship Agrarian : engagé, un Lander ; landfall, un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Seedship Agrarian"], hand: ["Forest"] } });
    const ag = idOf(s, "p1", "battlefield", "Seedship Agrarian");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(s.objects[ag]?.counters["+1/+1"]).toBe(1);
    s = settleNoBlocks(attack(s, [ag]));
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
  });

  it("Seedship Broodtender : meulez trois cartes ; {3}{B}{G}, sacrifice : une créature ou un Vaisseau du cimetière revient (rituel)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 4)],
        hand: ["Seedship Broodtender"],
        library: ["Serra Angel", "Opt", "Island", "Forest"],
      },
    });
    s = settle(cast(s, "p1", "Seedship Broodtender"));
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Serra Angel"]);
    const brood = idOf(s, "p1", "battlefield", "Seedship Broodtender");
    expect(() => activateNamed(s, brood, "Renvoyez", { targets: { t: [idOf(s, "p1", "graveyard", "Opt")] } })).toThrow();
    s = settle(activateNamed(s, brood, "Renvoyez", { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Seedship Broodtender")).toHaveLength(0);
  });

  it("Seedship Impact : détruit un artefact ou un enchantement ; un Lander si sa VM était de 2 ou moins", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Seedship Impact"] },
        p2: { battlefield: ["Thaumaton Torpedo", "Memorial Vault"] },
      });
    let s = setup();
    s = settle(cast(s, "p1", "Seedship Impact", { targets: { t: [idOf(s, "p2", "battlefield", "Thaumaton Torpedo")] } }));
    expect(idsOf(s, "p2", "battlefield", "Thaumaton Torpedo")).toHaveLength(0);
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
    let t = setup();
    t = settle(cast(t, "p1", "Seedship Impact", { targets: { t: [idOf(t, "p2", "battlefield", "Memorial Vault")] } }));
    expect(idsOf(t, "p2", "battlefield", "Memorial Vault")).toHaveLength(0);
    expect(tokensOf(t, "p1", "Lander")).toHaveLength(0);
  });

  it("Specimen Freighter : renvoie jusqu'à deux créatures non-Vaisseaux ; à 9+, en attaquant, le défenseur meule quatre cartes", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Specimen Freighter"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", { name: "Galvanizing Sawship", counters: { charge: 3 } }] },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Specimen Freighter"), (req, _p, cur) => {
      if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
      return req.type === "pick"
        ? req.options.filter((id) => nameOf(cur, String(id)) !== "Galvanizing Sawship").slice(0, 2)
        : undefined;
    });
    expect(offered).not.toContain("Galvanizing Sawship");
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    let a = scenario({ p1: { battlefield: [{ name: "Specimen Freighter", counters: { charge: 9 } }] } });
    const ship = idOf(a, "p1", "battlefield", "Specimen Freighter");
    expect(chars(a, ship).keywords).toContain("flying");
    a = settleNoBlocks(attack(a, [ship]));
    expect(a.players.p2?.graveyard).toHaveLength(4);
  });

  it("Steelswarm Operator : vol ; {U} pour un sort d'artefact, {U}{U} pour une capacité d'une source artefact", () => {
    const s = scenario({ p1: { battlefield: ["Steelswarm Operator"], hand: ["Thaumaton Torpedo", "Opt"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Steelswarm Operator")).keywords).toContain("flying");
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Thaumaton Torpedo"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
    const t = scenario({ p1: { battlefield: ["Steelswarm Operator", "Memorial Vault"] } });
    createTokens(t, "p1", LANDER_SPEC, 1);
    t.version += 1;
    expect(hasActivation(t, tokensOf(t, "p1", "Lander")[0] as string, "Terrain")).toBe(true);
  });

  it("Sunstar Expansionist : un Lander si un adversaire a plus de terrains ; landfall, +1/+0", () => {
    const setup = (opp: number) =>
      scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Sunstar Expansionist", "Plains"] },
        p2: { battlefield: lands("Forest", opp) },
      });
    let s = settle(cast(setup(3), "p1", "Sunstar Expansionist"));
    expect(tokensOf(s, "p1", "Lander")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Sunstar Expansionist")).power).toBe(3);
    const t = settle(cast(setup(2), "p1", "Sunstar Expansionist"));
    expect(tokensOf(t, "p1", "Lander")).toHaveLength(0);
    // À trois (PLAN-D, D8) : « un adversaire » en a plus, pas tous les adversaires ensemble.
    const three = (opp: number) =>
      scenario({
        players: 3,
        p1: { battlefield: lands("Plains", 2), hand: ["Sunstar Expansionist"] },
        p2: { battlefield: lands("Forest", 2) },
        p3: { battlefield: lands("Forest", opp) },
      });
    expect(tokensOf(settle(cast(three(2), "p1", "Sunstar Expansionist")), "p1", "Lander")).toHaveLength(0);
    expect(tokensOf(settle(cast(three(3), "p1", "Sunstar Expansionist")), "p1", "Lander")).toHaveLength(1);
  });

  it("Sunstar Lightsmith : à votre deuxième sort du tour, un marqueur +1/+1 et une pioche", () => {
    let s = scenario({ p1: { battlefield: ["Sunstar Lightsmith", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const smith = idOf(s, "p1", "battlefield", "Sunstar Lightsmith");
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[smith]?.counters["+1/+1"] ?? 0).toBe(0);
    const before = handSize(s, "p1");
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[smith]?.counters["+1/+1"]).toBe(1);
    expect(handSize(s, "p1")).toBe(before - 1 + 2);
  });

  it("Survey Mechan : vol, défense talismanique ; {10} moins un par nom de terrain : 3 blessures, un joueur pioche trois et gagne 3 PV", () => {
    const five = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Plains"];
    let s = scenario({ p1: { battlefield: ["Survey Mechan", ...five] } });
    const mech = idOf(s, "p1", "battlefield", "Survey Mechan");
    expect(chars(s, mech).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
    s = settle(activateNamed(s, mech, "3 blessures", { targets: { a: ["p2"], p: ["p1"] } }));
    expect(lifeOf(s, "p2")).toBe(17);
    expect(lifeOf(s, "p1")).toBe(23);
    expect(handSize(s, "p1")).toBe(3);
    const t = scenario({ p1: { battlefield: ["Survey Mechan", ...lands("Plains", 8)] } });
    expect(hasActivation(t, idOf(t, "p1", "battlefield", "Survey Mechan"), "3 blessures")).toBe(false);
  });

  it("Susurian Dirgecraft : chaque adversaire sacrifie une créature non-jeton ; créature volante à 7+", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Susurian Dirgecraft"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    createTokens(s, "p2", DRONE, 1);
    s = settle(cast(s, "p1", "Susurian Dirgecraft"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(tokensOf(s, "p2", "Drone")).toHaveLength(1);
    const big = scenario({ p1: { battlefield: [{ name: "Susurian Dirgecraft", counters: { charge: 7 } }] } });
    expect(chars(big, idOf(big, "p1", "battlefield", "Susurian Dirgecraft")).keywords).toContain("flying");
  });

  it("Susurian Voidborn : elle ou une autre de vos créatures ou artefacts meurt, un adversaire perd 1 PV et vous en gagnez 1", () => {
    let s = scenario({
      p1: { battlefield: ["Susurian Voidborn", "Thaumaton Torpedo", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Thaumaton Torpedo"));
    s = settle(s);
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([21, 19]);
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(s);
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([21, 19]);
    destroy(s, idOf(s, "p1", "battlefield", "Susurian Voidborn"));
    s = settle(s);
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
  });

  it("Syr Vondam, the Lucent : contact mortel, lien de vie ; en arrivant ou en attaquant, vos autres créatures +1/+0 et le contact mortel", () => {
    let s = scenario({ p1: { battlefield: ["Plains", ...lands("Swamp", 4), "Bear Cub"], hand: ["Syr Vondam, the Lucent"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Syr Vondam, the Lucent"));
    const vondam = idOf(s, "p1", "battlefield", "Syr Vondam, the Lucent");
    expect(chars(s, vondam).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    expect(chars(s, cub).power).toBe(3);
    expect(chars(s, cub).keywords).toContain("deathtouch");
    expect(chars(s, vondam).power).toBe(4);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(chars(s, cub).keywords).not.toContain("deathtouch");
    s = settleNoBlocks(attack(s, [vondam]));
    expect(chars(s, cub).power).toBe(3);
    expect(chars(s, cub).keywords).toContain("deathtouch");
  });

  it("Systems Override : contrôle d'un artefact ou d'une créature jusqu'à la fin du tour, dégagé, avec la célérité", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Systems Override"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Systems Override", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(false);
    expect(chars(s, angel).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[angel]?.controller).toBe("p2");
  });

  it("Systems Override : un Vaisseau reçoit dix marqueurs de charge, retirés à l'étape de fin suivante", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Systems Override"] },
      p2: { battlefield: ["Galvanizing Sawship"] },
    });
    const ship = idOf(s, "p2", "battlefield", "Galvanizing Sawship");
    s = settle(cast(s, "p1", "Systems Override", { targets: { t: [ship] } }));
    expect(s.objects[ship]?.counters.charge).toBe(10);
    expect(chars(s, ship).types).toContain("Creature");
    expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[ship]?.counters.charge ?? 0).toBe(0);
    expect(s.objects[ship]?.controller).toBe("p2");
  });
});

describe("Edge of Eternities, lot K8 : peu communes (5)", () => {
  it("Tannuk, Memorial Ensign : landfall, 1 blessure à chaque adversaire ; à la deuxième résolution du tour, piochez", () => {
    let s = scenario({
      p1: { battlefield: ["Tannuk, Memorial Ensign", ...lands("Mountain", 2)], hand: ["Forest"], library: lands("Forest", 5) },
    });
    createTokens(s, "p1", LANDER_SPEC, 1);
    s.version += 1;
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(lifeOf(s, "p2")).toBe(19);
    expect(handSize(s, "p1")).toBe(0);
    s = settle(activateNamed(s, tokensOf(s, "p1", "Lander")[0] as string, "Terrain"));
    expect(lifeOf(s, "p2")).toBe(18);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Territorial Bruntar : portée ; landfall, exilez jusqu'à une carte non-terrain, lançable ce tour-ci seulement", () => {
    let s = scenario({
      p1: {
        battlefield: ["Territorial Bruntar", "Forest"],
        hand: ["Forest"],
        library: ["Island", "Bear Cub", ...lands("Forest", 4)],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Territorial Bruntar")).keywords).toContain("reach");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const cub = exiled(s, "Bear Cub")[0] as string;
    expect(cub).toBeDefined();
    expect(exiled(s, "Island")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(4);
    expect(castable(s, "p1", cub)).toBe(true);
    const later = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(castable(later, "p1", cub)).toBe(false);
  });

  it("Tractor Beam : engage la créature enchantée, vous la contrôlez, elle ne se dégage pas", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Tractor Beam"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Tractor Beam", { targets: { enchant: [angel] } }));
    expect(s.objects[angel]?.controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(s.objects[angel]?.controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(true);
  });

  it("Tragic Trajectory : -2/-2 ; vide : -10/-10", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Swamp"], hand: ["Tragic Trajectory"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Tragic Trajectory", { targets: { t: [angel] } }));
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    let t = withVoid(setup());
    t = settle(cast(t, "p1", "Tragic Trajectory", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Uthros Psionicist : le deuxième sort de chaque tour coûte {2} de moins", () => {
    let s = scenario({ p1: { battlefield: ["Uthros Psionicist", ...lands("Island", 4)], hand: ["Opt", "Cerebral Download"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Cerebral Download"))).toBe(false);
    s = settle(cast(s, "p1", "Opt"));
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Cerebral Download"))).toBe(true);
  });

  it("Uthros Scanship : piochez deux cartes, puis défaussez-en une ; créature volante à 8+", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Uthros Scanship"], library: ["Opt", "Forest", "Island"] },
    });
    s = settle(cast(s, "p1", "Uthros Scanship"), (req, _p, cur) => pickNamed(cur, req, "Forest"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    const big = scenario({ p1: { battlefield: [{ name: "Uthros Scanship", counters: { charge: 8 } }] } });
    expect(chars(big, idOf(big, "p1", "battlefield", "Uthros Scanship")).keywords).toContain("flying");
  });

  it("Vaultguard Trooper : avec deux créatures engagées, vous pouvez défausser votre main pour piocher deux cartes", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Vaultguard Trooper", { name: "Bear Cub", tapped: true }, { name: "Llanowar Elves", tapped: true }],
          hand: ["Opt", "Shock", "Forest"],
          library: lands("Island", 5),
        },
      });
    let s = advanceUntil(setup(), (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    s = act(s, "p1", { type: "choose", values: [1] });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
    expect(s.players.p1?.graveyard).toHaveLength(3);
    let t = advanceUntil(setup(), (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    t = act(t, "p1", { type: "choose", values: [0] });
    t = settle(t);
    expect(handSize(t, "p1")).toBe(3);
    expect(t.players.p1?.graveyard).toHaveLength(0);
  });

  it("Virulent Silencer : vos créatures-artefacts non-jetons qui blessent un joueur lui donnent deux marqueurs poison", () => {
    let s = scenario({ p1: { battlefield: ["Virulent Silencer", "Rust Harvester", "Bear Cub"] } });
    createTokens(
      s,
      "p1",
      { name: "Robot", colors: [], types: ["Artifact", "Creature"], subtypes: ["Robot"], power: 2, toughness: 2 },
      1,
    );
    const robot = tokensOf(s, "p1", "Robot")[0] as string;
    s.objects[robot]!.controlledSince = 0;
    s.version += 1;
    s = attack(s, [idOf(s, "p1", "battlefield", "Rust Harvester"), idOf(s, "p1", "battlefield", "Bear Cub"), robot]);
    s = throughCombat(s);
    expect(s.players.p2?.poison).toBe(2);
    expect(lifeOf(s, "p2")).toBe(15);
  });

  it("Voidforged Titan : vide, à votre étape de fin, piochez et perdez 1 PV", () => {
    const setup = () => scenario({ p1: { battlefield: ["Voidforged Titan"] }, p2: { battlefield: ["Llanowar Elves"] } });
    const s = advanceUntil(withVoid(setup()), (x) => x.turn.active === "p2");
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p1")).toBe(19);
    const t = advanceUntil(setup(), (x) => x.turn.active === "p2");
    expect(handSize(t, "p1")).toBe(0);
    expect(lifeOf(t, "p1")).toBe(20);
  });

  it("Wedgelight Rammer : un Robot 2/2 en arrivant ; créature avec le vol et l'initiative à 9+", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Wedgelight Rammer"] } });
    s = settle(cast(s, "p1", "Wedgelight Rammer"));
    expect(tokensOf(s, "p1", "Robot")).toHaveLength(1);
    const big = scenario({ p1: { battlefield: [{ name: "Wedgelight Rammer", counters: { charge: 9 } }] } });
    const ship = idOf(big, "p1", "battlefield", "Wedgelight Rammer");
    expect(chars(big, ship).types).toContain("Creature");
    expect(chars(big, ship).keywords).toEqual(expect.arrayContaining(["flying", "firstStrike"]));
  });

  it("Weftstalker Ardent : une autre de vos créatures ou un de vos artefacts arrive, 1 blessure à chaque adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Weftstalker Ardent", "Plains", "Forest"], hand: ["Thaumaton Torpedo", "Llanowar Elves", "Forest"] },
    });
    // Un terrain ne déclenche rien.
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(s.stack).toHaveLength(0);
    expect(s.triggers).toHaveLength(0);
    s = settle(cast(s, "p1", "Thaumaton Torpedo"));
    expect(lifeOf(s, "p2")).toBe(19);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(lifeOf(s, "p2")).toBe(18);
    // Une créature adverse qui arrive ne compte pas.
    createTokens(s, "p2", DRONE, 1);
    s = settle(s);
    expect(lifeOf(s, "p2")).toBe(18);
  });
});

describe("Broodguard Elite (lot K8)", () => {
  it("en quittant le champ de bataille, met tous ses marqueurs (toutes sortes) sur une créature ciblée que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Broodguard Elite", counters: { "+1/+1": 2, stun: 1 } }, "Bear Cub"] },
      p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      active: "p2",
    });
    const elite = idOf(s, "p1", "battlefield", "Broodguard Elite");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [elite] } });
    s = settle(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters.stun).toBe(1);
  });
});

describe("Edge of Eternities : approximations levées (lot A1)", () => {
  it("Emissary Escort : « +X/+0 » s'ajoute à une force de base fixée par un effet", () => {
    const s = scenario({ p1: { battlefield: ["Emissary Escort", "Thaumaton Torpedo", "Memorial Vault"] } });
    const escort = idOf(s, "p1", "battlefield", "Emissary Escort");
    expect([chars(s, escort).power, chars(s, escort).toughness]).toEqual([4, 4]);
    // F/E de base 1/1 (couche 7b) : le bonus (couche 7c) s'y ajoute.
    addEffect(s, [escort], { setPower: 1, setToughness: 1 }, "endOfTurn");
    expect([chars(s, escort).power, chars(s, escort).toughness]).toEqual([5, 1]);
  });

  it("Dyadrine : en attaquant, le joueur choisit les deux créatures dont il retire un marqueur +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Dyadrine, Synthesis Amalgam", counters: { "+1/+1": 3 } },
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          { name: "Llanowar Elves", counters: { "+1/+1": 2 } },
        ],
        library: ["Island", "Island"],
      },
    });
    const dyadrine = idOf(s, "p1", "battlefield", "Dyadrine, Synthesis Amalgam");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const offered: string[][] = [];
    s = attack(s, [dyadrine]);
    s = settle(s, (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      offered.push(req.options.map(String));
      return req.options.includes(cub) ? [cub] : [elves];
    });
    expect(offered[0]?.sort()).toEqual([dyadrine, cub, elves].sort());
    expect(offered[1]?.sort()).toEqual([dyadrine, elves].sort());
    expect(s.objects[dyadrine]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[cub]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
  });

  it("Terrasymbiosis : un refus de piocher ne compte pas pour « une seule fois par tour »", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), "Bear Cub", "Terrasymbiosis"],
        hand: ["Fleeting Flight", "Fleeting Flight", "Fleeting Flight"],
        library: lands("Island", 5),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    let r = counterFrom(s, "p1", cub);
    expect(r.triggered).toEqual(["Terrasymbiosis"]);
    s = settle(r.s, (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(2);
    // Deuxième fois : elle se déclenche encore, et l'on pioche.
    r = counterFrom(s, "p1", cub);
    expect(r.triggered).toEqual(["Terrasymbiosis"]);
    s = settle(r.s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(s.players.p1?.hand).toHaveLength(2);
    // C'est fait : plus de déclenchement ce tour-ci.
    expect(counterFrom(s, "p1", cub).triggered).toEqual([]);
  });
});
