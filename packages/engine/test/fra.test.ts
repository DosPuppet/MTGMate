/**
 * Reality Fracture, lot A : primitives ajoutées au moteur (terrains lents, regard ou surveillance,
 * marqueur de finalité, créatures mortes ce tour, blessures non de combat, cartes piochées, filtres
 * légendaire / endurance, montants négatifs).
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { act, idOf, passBoth, scenario } from "./helpers";

type S = GameState;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Reality Fracture, lot A", () => {
  it("terrains lents : engagés avec moins de deux autres terrains, dégagés sinon", () => {
    let s = scenario({ p1: { hand: ["Deserted Beach", "Haunted Ridge"], battlefield: ["Plains"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Deserted Beach") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Deserted Beach")]?.tapped).toBe(true);
    let t = scenario({ p1: { hand: ["Haunted Ridge"], battlefield: ["Plains", "Island"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Haunted Ridge") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Haunted Ridge")]?.tapped).toBe(false);
  });

  it("« chaque fois que vous regardez ou surveillez » et « si vous avez surveillé ce tour-ci »", () => {
    let s = scenario({
      p1: { battlefield: ["Denzilore Fatehold", "Surveillance Phantasm", ...lands("Island", 4)], library: lands("Island", 10) },
    });
    const phantasm = idOf(s, "p1", "battlefield", "Surveillance Phantasm");
    expect(chars(s, phantasm).keywords).toContain("defender");
    s = act(s, "p1", { type: "activate", source: phantasm, ability: 1 });
    s = passBoth(s); // surveillance 1 se résout
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [] });
    s = passBoth(s); // déclencheur de Denzilore
    expect(chars(s, phantasm).keywords).not.toContain("defender");
    expect(s.objects[phantasm]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Denzilore Fatehold")]?.counters["+1/+1"]).toBe(1);
  });

  it("marqueur de finalité : la créature est exilée au lieu de mourir", () => {
    let s = scenario({ p1: { graveyard: ["Proctor of Potential"], battlefield: ["Plains", "Island"] } });
    // Condition d'activation : avoir regardé ou surveillé ce tour-ci.
    const proctor = idOf(s, "p1", "graveyard", "Proctor of Potential");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === proctor)).toBe(false);
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, turnStats: { ...s.players.p1!.turnStats, scried: 1 } } } };
    s = act(s, "p1", { type: "activate", source: proctor, ability: 1 });
    s = passBoth(s);
    const onField = idOf(s, "p1", "battlefield", "Proctor of Potential");
    expect(s.objects[onField]?.counters.finality).toBe(1);
    destroy(s, onField);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Proctor of Potential")).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Darklight Phoenix : revient si deux créatures sont mortes ce tour-ci", () => {
    let s = scenario({
      step: "main1",
      p1: { graveyard: ["Darklight Phoenix"], battlefield: ["Savannah Lions", "Llanowar Elves"] },
    });
    for (const n of ["Savannah Lions", "Llanowar Elves"]) destroy(s, idOf(s, "p1", "battlefield", n));
    expect(s.turn.creaturesDied).toBe(2);
    s = passBoth(s); // passage au début du combat : le déclencheur depuis le cimetière
    s = passBoth(s);
    expect(s.battlefield.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Darklight Phoenix")).toBe(true);
  });

  it("Grim Repriser : activable seulement si un adversaire a subi des blessures non de combat", () => {
    const s = scenario({ p1: { graveyard: ["Grim Repriser"], battlefield: ["Swamp", "Mountain"] } });
    const g = idOf(s, "p1", "graveyard", "Grim Repriser");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === g);
    expect(can(s)).toBe(false);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Mountain")), "p2", 1, false);
    expect(can(s)).toBe(true);
  });

  it("filtres légendaire et montants négatifs (Yuriko : -X/-0)", () => {
    let s = scenario({
      p1: { hand: ["Yuriko, Hope from the Shadows"], battlefield: ["Island"], graveyard: lands("Island", 4) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Yuriko, Hope from the Shadows");
    s = passBoth(s); // Yuriko arrive, le déclencheur modal demande un mode
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["0"] });
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [angel] });
    s = passBoth(s);
    expect(chars(s, angel).power).toBe(0); // 4 - 4 cartes au cimetière
  });
});
