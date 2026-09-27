/**
 * Final Fantasy, lot A : job select, tiered, « si au moins quatre mana ont été dépensés », Syncopate, Villes à aventure.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castModes = (s: S, card: string) => {
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
  return opt?.type === "cast" ? opt.modes : [];
};

describe("Final Fantasy", () => {
  it("job select : l'Équipement crée un Héros 1/1 et s'y attache", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Black Mage's Rod"] } });
    const rod = idOf(s, "p1", "hand", "Black Mage's Rod");
    s = act(s, "p1", { type: "cast", card: rod });
    s = settle(s);
    const [hero] = idsOf(s, "p1", "battlefield", "Hero");
    expect(hero).toBeDefined();
    expect(s.objects[idOf(s, "p1", "battlefield", "Black Mage's Rod")]?.attachedTo).toBe(hero);
    const c = chars(s, hero as string);
    expect(c.power).toBe(2);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Hero", "Wizard"]));
  });

  it("tiered : les coûts supplémentaires des paliers ; un palier trop cher n'est pas proposé", () => {
    const s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Thunder Magic"] }, p2: { battlefield: ["Bear Cub"] } });
    const magic = idOf(s, "p1", "hand", "Thunder Magic");
    const labels = castModes(s, magic).map((m) => m.label);
    expect(labels).toHaveLength(1);
    const t = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Thunder Magic"] }, p2: { battlefield: ["Bear Cub"] } });
    expect(castModes(t, idOf(t, "p1", "hand", "Thunder Magic"))).toHaveLength(2);
  });

  it("« si au moins quatre mana ont été dépensés » : Sahagin se déclenche pour un sort à 4 mana, pas à 1", () => {
    let s = scenario({
      p1: { battlefield: ["Sahagin", ...lands("Mountain", 5)], hand: ["Thunder Magic", "Thunder Magic"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const sahagin = idOf(s, "p1", "battlefield", "Sahagin");
    const wurm = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const [a, b] = idsOf(s, "p1", "hand", "Thunder Magic") as [string, string];
    // Palier {0} : 1 mana dépensé, pas de déclenchement.
    s = act(s, "p1", { type: "cast", card: a, mode: castModes(s, a)[0]?.index, targets: { t: [wurm] } });
    s = settle(s);
    expect(s.objects[sahagin]?.counters["+1/+1"] ?? 0).toBe(0);
    // Palier {3} : 4 mana dépensés.
    const mode = castModes(s, b).find((m) => m.label?.includes("4 blessures"));
    s = act(s, "p1", { type: "cast", card: b, mode: mode?.index, targets: { t: [wurm] } });
    s = settle(s);
    expect(s.objects[sahagin]?.counters["+1/+1"]).toBe(1);
  });

  it("Syncopate : contrecarré faute de payer {X}, le sort est exilé", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      p2: { battlefield: lands("Island", 3), hand: ["Syncopate"] },
    });
    const shock = idOf(s, "p1", "hand", "Burst Lightning");
    s = act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } });
    s = act(s, "p1", { type: "pass" });
    const sync = idOf(s, "p2", "hand", "Syncopate");
    s = act(s, "p2", { type: "cast", card: sync, x: 2, targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Burst Lightning");
    expect(s.objects[shock]).toBeUndefined();
    expect(s.players.p2?.life).toBe(20);
  });

  it("Summon : créature-Saga, chapitre I à l'arrivée, sacrifiée après le dernier chapitre", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Summon: Shiva"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Summon: Shiva") });
    s = settle(s);
    const shiva = idOf(s, "p1", "battlefield", "Summon: Shiva");
    expect(s.objects[shiva]?.counters.lore).toBe(1);
    expect(chars(s, shiva).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);
    s = advanceUntil(s, (x) => !x.battlefield.includes(shiva));
    expect(idsOf(s, "p1", "graveyard", "Summon: Shiva")).toHaveLength(1);
  });

  it("Excalibur II : un marqueur de charge par gain de PV, +1/+1 par marqueur", () => {
    let s = scenario({
      p1: { battlefield: ["Excalibur II", "Bear Cub", "Dazzling Angel", ...lands("Plains", 4)], hand: ["Healer's Hawk"] },
    });
    const sword = idOf(s, "p1", "battlefield", "Excalibur II");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const equip = (s.defs[s.objects[sword]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Équiper"),
    );
    s = act(s, "p1", { type: "activate", source: sword, ability: equip, targets: { t: [bear] } });
    s = passBoth(s);
    expect(chars(s, bear).power).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Healer's Hawk") });
    s = settle(s);
    // Dazzling Angel : +1 PV à l'arrivée du Faucon, donc un marqueur de charge.
    expect(s.objects[sword]?.counters.charge).toBe(1);
    expect(chars(s, bear).power).toBe(3);
  });

  it("transformation vers une Saga : marqueur de savoir, chapitres, puis retour au recto (Jill // Shiva)", () => {
    let s = scenario({
      p1: { battlefield: ["Jill, Shiva's Dominant // Shiva, Warden of Ice", ...lands("Island", 5)] },
      p2: { battlefield: ["Bear Cub", "Forest"] },
    });
    const jill = idOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    const index = (s.defs[s.objects[jill]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Exilez-la"),
    );
    s = act(s, "p1", { type: "activate", source: jill, ability: index });
    s = settle(s);
    const shiva = idOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    expect(chars(s, shiva).name).toBe("Shiva, Warden of Ice");
    expect(s.objects[shiva]?.counters.lore).toBe(1);
    // Chapitre III : les terrains adverses sont engagés, puis Shiva revient sur son recto (sans être sacrifiée).
    s = advanceUntil(s, (x) => !x.battlefield.includes(shiva) && x.stack.length === 0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Forest")]?.tapped).toBe(true);
    const back = idsOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    expect(back).toHaveLength(1);
    expect(chars(s, back[0] as string).name).not.toBe("Shiva, Warden of Ice");
    expect(s.objects[back[0] as string]?.counters.lore).toBeUndefined();
  });

  it("assemblage : Vanille et Fang deviennent Ragnarok en payant {3}{B}{G}", () => {
    let s = scenario({
      turn: 2,
      p1: {
        battlefield: ["Vanille, Cheerful l'Cie", "Fang, Fearless l'Cie", "Swamp", "Forest", ...lands("Plains", 3)],
      },
    });
    s = advanceUntil(s, (x) =>
      x.battlefield.some((id) => x.defs[x.objects[id]?.defId ?? ""]?.name === "Ragnarok, Divine Deliverance"),
    );
    expect(idsOf(s, "p1", "battlefield", "Ragnarok, Divine Deliverance")).toHaveLength(1);
  });

  it("PuPu UFO : seule la force de base devient le nombre de Villes", () => {
    let s = scenario({ p1: { battlefield: ["PuPu UFO", "Adventurer's Inn", "Capital City", ...lands("Island", 3)] } });
    const ufo = idOf(s, "p1", "battlefield", "PuPu UFO");
    const index = (s.defs[s.objects[ufo]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Force de base"),
    );
    s = act(s, "p1", { type: "activate", source: ufo, ability: index });
    s = passBoth(s);
    expect(chars(s, ufo).power).toBe(2);
    expect(chars(s, ufo).toughness).toBe(4);
  });

  it("Ville à aventure : l'Aventure se lance, puis le terrain se joue depuis l'exil", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Lindblum, Industrial Regency // Mage Siege"] } });
    const card = idOf(s, "p1", "hand", "Lindblum, Industrial Regency // Mage Siege");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && opt.face).toBe(1);
    s = act(s, "p1", { type: "cast", card, face: 1 });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Wizard")).toHaveLength(1);
    const exiled = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
    expect(exiled).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === exiled)).toBe(true);
    s = act(s, "p1", { type: "playLand", card: exiled });
    expect(idsOf(s, "p1", "battlefield", "Lindblum, Industrial Regency // Mage Siege")).toHaveLength(1);
  });
});
