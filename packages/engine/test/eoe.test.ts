/**
 * Edge of Eternities, lot A : distorsion, vide, Drones, « deuxième sort », sacrifice, blessures de combat groupées,
 * terrains choc.
 */
import { card, TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { canBlock, declareBlockers } from "../src/turn";
import type { GameState, TokenSpec } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passBoth, scenario } from "./helpers";

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
      addKeywords: ["cantBeBlockedByMoreThanOne"],
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
