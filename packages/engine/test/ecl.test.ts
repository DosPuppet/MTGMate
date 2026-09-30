/**
 * Lorwyn Eclipsed (extension partielle : cartes du méta) : flétrir (Requiting Hex, Pyrrhic Strike), évocation et
 * mana dépensé (Emptiness, Deceit), Moonshadow et ses marqueurs −1/−1, Iron-Shield Elf, Firdoch Core, Sapling Nursery,
 * Spell Snare, Sear et les terrains choc.
 */

import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { simultaneously } from "../src/triggers";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
/** Répond aux choix en attente : choisit `want` quand il fait partie des options, sinon la suggestion. */
const chooseWanted = (s: S, want: string[]) => {
  let cur = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
    const p = cur.pending;
    const r = p.request;
    const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)) : [];
    cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
    cur = passAccepting(cur, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  }
  return settle(cur);
};

describe("Lorwyn Eclipsed", () => {
  describe("Moonshadow", () => {
    it("arrive avec six marqueurs −1/−1 (une 1/1 avec la menace)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Moonshadow"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Moonshadow") }));
      const moon = idOf(s, "p1", "battlefield", "Moonshadow");
      expect(s.objects[moon]?.counters["-1/-1"]).toBe(6);
      expect([chars(s, moon).power, chars(s, moon).toughness]).toEqual([1, 1]);
      expect(chars(s, moon).keywords).toContain("menace");
    });

    it("une carte de permanent défaussée retire un marqueur ; un éphémère défaussé, non", () => {
      const run = (discarded: string) => {
        let s = scenario({ p1: { battlefield: ["Moonshadow", "Iron-Shield Elf"], hand: [discarded] } });
        const moon = idOf(s, "p1", "battlefield", "Moonshadow");
        (s.objects[moon] as { counters: Record<string, number> }).counters["-1/-1"] = 6;
        s.version += 1;
        const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
        const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === elf);
        s = settle(
          act(s, "p1", {
            type: "activate",
            source: elf,
            ability: a?.type === "activate" ? a.ability : -1,
            discard: [idOf(s, "p1", "hand", discarded)],
          }),
        );
        return s.objects[moon]?.counters["-1/-1"];
      };
      expect(run("Forest")).toBe(5);
      expect(run("Opt")).toBe(6);
    });

    it("plusieurs cartes de permanent mises au cimetière en même temps : un seul marqueur retiré", () => {
      let s = scenario({ p1: { battlefield: ["Moonshadow", "Fire Elemental", "Fishing Pole"] } });
      const moon = idOf(s, "p1", "battlefield", "Moonshadow");
      (s.objects[moon] as { counters: Record<string, number> }).counters["-1/-1"] = 6;
      s.version += 1;
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      simultaneously(s, () => {
        destroy(s, fire);
        destroy(s, pole);
      });
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(s.objects[moon]?.counters["-1/-1"]).toBe(5);
    });
  });

  describe("Évocation et mana dépensé", () => {
    it("Emptiness évoquée avec {W}{W} : une créature de VM 3 ou moins revient du cimetière, puis Emptiness est sacrifiée", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Emptiness"], graveyard: ["Bear Cub", "Shivan Dragon"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Emptiness");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
      expect(castOption(s, card)?.type === "cast" && castOption(s, card)).toMatchObject({ altAvailable: true });
      s = act(s, "p1", { type: "cast", card, alternative: true });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      // Le dragon (VM 6) n'est pas une cible légale.
      if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
        expect(s.pending.request.options).not.toContain(dragon);
      }
      s = chooseWanted(s, [bear]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Emptiness")).toHaveLength(1);
      // {B}{B} n'a pas été dépensé : l'Ange n'a pas de marqueur.
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["-1/-1"] ?? 0).toBe(0);
    });

    it("Emptiness évoquée avec {B}{B} : trois marqueurs −1/−1 sur une créature, rien ne revient", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Emptiness"], graveyard: ["Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Emptiness"), alternative: true });
      s = chooseWanted(s, [angel]);
      expect(s.objects[angel]?.counters["-1/-1"]).toBe(3);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Emptiness")).toHaveLength(1);
    });

    it("Deceit lancée avec {B}{B} : l'adversaire se défausse de la carte non-terrain choisie ; Deceit reste en jeu", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Deceit"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Opt", "Serra Angel"] },
      });
      const angel = idOf(s, "p2", "hand", "Serra Angel");
      const forest = idOf(s, "p2", "hand", "Forest");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deceit") });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      let sawCardChoice = false;
      for (let i = 0; i < 10 && s.pending?.kind === "choice"; i++) {
        const p = s.pending;
        const r = p.request;
        if (r.type === "pick" && r.options.includes(angel)) {
          sawCardChoice = true;
          expect(p.player).toBe("p1");
          expect(r.options).not.toContain(forest);
        }
        const values = r.type === "pick" && r.options.includes(angel) ? [angel] : r.suggested;
        s = act(s, p.player, { type: "choose", values });
        s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      }
      s = settle(s);
      expect(sawCardChoice).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(2);
      // {U}{U} n'a pas été dépensé : l'Ourson reste en jeu.
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Deceit")).toHaveLength(1);
    });
  });

  describe("Flétrir", () => {
    it("Requiting Hex sans flétrir : détruit une créature de VM 2 ou moins, sans gain de PV ; VM 3 ou plus refusée", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Fire Elemental"], hand: ["Requiting Hex"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Requiting Hex");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[idOf(s, "p1", "battlefield", "Fire Elemental")]?.counters["-1/-1"] ?? 0).toBe(0);
    });

    it("Pyrrhic Strike sans flétrir : un seul mode ; la créature visée doit avoir une VM de 3 ou plus", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Pyrrhic Strike"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel", "Fishing Pole"] },
        });
      const s = setup();
      const card = idOf(s, "p1", "hand", "Pyrrhic Strike");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card, mode: 1, targets: { c: [bear] } })).toThrow();
      const t = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { c: [angel] } }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Fishing Pole")).toHaveLength(1);
      const u = setup();
      const v = settle(
        act(u, "p1", {
          type: "cast",
          card: idOf(u, "p1", "hand", "Pyrrhic Strike"),
          mode: 0,
          targets: { a: [idOf(u, "p2", "battlefield", "Fishing Pole")] },
        }),
      );
      expect(idsOf(v, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(v, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });

  it("Iron-Shield Elf : défausser une carte la rend indestructible jusqu'à la fin du tour et l'engage", () => {
    let s = scenario({
      p1: { battlefield: ["Iron-Shield Elf"], hand: ["Forest"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === elf);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: elf,
        ability: a?.type === "activate" ? a.ability : -1,
        discard: [idOf(s, "p1", "hand", "Forest")],
      }),
    );
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.objects[elf]?.tapped).toBe(true);
    expect(chars(s, elf).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, elf).keywords).not.toContain("indestructible");
  });

  it("Firdoch Core : mana de n'importe quelle couleur ; {4} en fait une créature-artefact 4/4 jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Firdoch Core", ...lands("Forest", 4)] } });
    const core = idOf(s, "p1", "battlefield", "Firdoch Core");
    const colors = legalActions(s, "p1")
      .filter((a) => a.type === "tapForMana" && a.source === core)
      .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
    expect(chars(s, core).types).not.toContain("Creature");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === core);
    s = settle(act(s, "p1", { type: "activate", source: core, ability: a?.type === "activate" ? a.ability : -1 }));
    const c = chars(s, core);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, core).types).not.toContain("Creature");
  });

  it("Sapling Nursery : exilée, vos Sylvins et vos Forêts deviennent indestructibles jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Sapling Nursery", ...lands("Forest", 2), "Bear Cub"], hand: ["Forest"] },
      p2: { battlefield: ["Forest"] },
    });
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const tree = idOf(s, "p1", "battlefield", "Treefolk");
    const nursery = idOf(s, "p1", "battlefield", "Sapling Nursery");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === nursery);
    s = settle(act(s, "p1", { type: "activate", source: nursery, ability: a?.type === "activate" ? a.ability : -1 }));
    expect(idsOf(s, "p1", "battlefield", "Sapling Nursery")).toHaveLength(0);
    expect(s.exile.some((id) => nameOf(s, id) === "Sapling Nursery")).toBe(true);
    expect(chars(s, tree).keywords).toContain("indestructible");
    for (const f of idsOf(s, "p1", "battlefield", "Forest")) expect(chars(s, f).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, tree).keywords).not.toContain("indestructible");
  });

  it("Spell Snare : contrecarre un sort de VM 2, pas un sort d'une autre valeur de mana", () => {
    const setup = (spell: string) => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Spell Snare"] },
        p2: { battlefield: lands("Forest", 5), hand: [spell] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", spell) });
      return act(s, "p2", { type: "pass" });
    };
    let s = setup("Bear Cub");
    const card = idOf(s, "p1", "hand", "Spell Snare");
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const t = setup("Llanowar Elves");
    // Sans sort de VM 2 sur la pile, Spell Snare n'a pas de cible : il n'est pas proposé.
    const opt = castOption(t, idOf(t, "p1", "hand", "Spell Snare"));
    expect(opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : []).not.toContain(t.stack[0]?.id);
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Spell Snare"), targets: { t: [t.stack[0]?.id as string] } }),
    ).toThrow();
  });

  it("Sear : 4 blessures à une créature ou un planeswalker, jamais à un joueur", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Sear"] }, p2: { battlefield: ["Serra Angel"] } });
    const card = idOf(s, "p1", "hand", "Sear");
    const opt = castOption(s, card);
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).not.toContain("p2");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } })).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Steam Vents : payer 2 PV pour qu'il arrive dégagé, sinon il arrive engagé ; produit {U} ou {R}", () => {
    const play = (payLife: boolean) => {
      let s = scenario({ p1: { hand: ["Steam Vents"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Steam Vents"), payLife });
      const vents = idOf(s, "p1", "battlefield", "Steam Vents");
      return { s, vents, tapped: s.objects[vents]?.tapped, life: s.players.p1?.life };
    };
    expect(play(false)).toMatchObject({ tapped: true, life: 20 });
    const paid = play(true);
    expect(paid).toMatchObject({ tapped: false, life: 18 });
    const colors = legalActions(paid.s, "p1")
      .filter((a) => a.type === "tapForMana" && a.source === paid.vents)
      .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["U", "R"]));
    expect(chars(paid.s, paid.vents).subtypes).toEqual(expect.arrayContaining(["Island", "Mountain"]));
  });
});
