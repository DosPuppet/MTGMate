/**
 * Edge of Eternities, lot A : distorsion, vide, Drones, « deuxième sort », sacrifice, blessures de combat groupées,
 * terrains choc.
 */
import { card, TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { GameHost } from "../src/host";
import { legalActions } from "../src/legal";
import { changeCounters, chars, decider } from "../src/state";
import { canBlock, declareBlockers } from "../src/turn";
import type { GameState, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  castable,
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
    expect(s.objects[tiger]?.warped).toBe(true);
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
