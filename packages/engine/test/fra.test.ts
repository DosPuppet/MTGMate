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

describe("Reality Fracture, lot B", () => {
  const activate = (s: S, p: string, source: string, ability = 0, extra: Record<string, unknown> = {}) =>
    act(s, p, { type: "activate", source, ability, ...extra });
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

  it("cycle de terrain de base : depuis la main, défausse la carte et cherche un terrain de base", () => {
    let s = scenario({
      p1: { hand: ["Apex Witchstalker"], battlefield: lands("Swamp", 2), library: ["Plains", "Swamp", "Swamp"] },
    });
    const witch = idOf(s, "p1", "hand", "Apex Witchstalker");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === witch);
    expect(opt).toBeDefined();
    s = activate(s, "p1", witch, (opt as { ability: number }).ability);
    expect(s.players.p1?.graveyard.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Apex Witchstalker");
    s = passBoth(s);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: s.pending.request.suggested });
    expect(handNames(s, "p1")).toContain("Plains");
  });

  it("Proft, Sinister Mastermind : ne se lance qu'avec le seuil ; « défaussez cette carte » depuis la main", () => {
    const s = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3) },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const proft = idOf(s, "p1", "hand", "Proft, Sinister Mastermind");
    const acts = legalActions(s, "p1");
    expect(acts.some((a) => a.type === "cast" && a.card === proft)).toBe(false);
    expect(acts.some((a) => a.type === "activate" && a.source === proft)).toBe(true);
    const t = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3), graveyard: lands("Swamp", 7) },
    });
    expect(
      legalActions(t, "p1").some((a) => a.type === "cast" && a.card === idOf(t, "p1", "hand", "Proft, Sinister Mastermind")),
    ).toBe(true);
  });

  it("Samut : un éphémère sur la pile a le second partagé — l'adversaire ne peut que passer ou produire du mana", () => {
    let s = scenario({
      p1: { hand: ["Last Gasp"], battlefield: ["Samut, Tyrant of Naktamun", ...lands("Swamp", 2)] },
      p2: { hand: ["Unsummon"], battlefield: ["Island", "Serra Angel"] },
    });
    s = cast(s, "p1", "Last Gasp", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(legalActions(s, "p2").every((a) => a.type === "pass" || a.type === "tapForMana")).toBe(true);
  });

  it("convocation : Winter se paie en engageant des créatures", () => {
    const s = scenario({
      p1: {
        hand: ["Winter, Team Player"],
        battlefield: ["Mountain", "Mountain", "Savannah Lions", "Savannah Lions", "Serra Angel"],
      },
    });
    const winter = idOf(s, "p1", "hand", "Winter, Team Player");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === winter)).toBe(true);
    const t = act(s, "p1", { type: "cast", card: winter });
    const tapped = t.battlefield.filter((id) => t.objects[id]?.tapped).length;
    expect(tapped).toBe(5); // 2 terrains + 3 créatures pour {4}{R}
  });

  it("exhaust : Liliana the Repentant ne s'active qu'une seule fois", () => {
    let s = scenario({
      p1: { battlefield: ["Liliana the Repentant", ...lands("Swamp", 12)], graveyard: ["Serra Angel", "Savannah Lions"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana the Repentant");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === lili);
    expect(can(s)).toBe(true);
    s = activate(s, "p1", lili, 1, { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = passBoth(s);
    expect(can(s)).toBe(false);
  });

  it("domaine et recherche de noms différents : Fblthp, Knows the Way", () => {
    const s = scenario({ p1: { battlefield: ["Fblthp, Knows the Way", "Plains", "Island", "Island"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Fblthp, Knows the Way")).power).toBe(2);
  });

  it("Titanbones : « quand vous défaussez cette carte », vous gagnez 3 PV", () => {
    // Titanbones est défaussée par l'effet de Rank Rat adverse.
    let s = scenario({
      p1: { hand: ["Titanbones, Towering Heart"] },
      p2: { hand: ["Rank Rat"], battlefield: lands("Swamp", 2) },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Rank Rat") });
    for (let i = 0; i < 6 && s.players.p1?.life === 20; i++) {
      if (s.pending?.kind === "discard")
        s = act(s, s.pending.player, { type: "discard", cards: s.players.p1?.hand.slice(0, 1) ?? [] });
      else if (s.pending?.kind === "choice")
        s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
      else s = passBoth(s);
    }
    expect(s.players.p1?.life).toBe(23);
  });
});
