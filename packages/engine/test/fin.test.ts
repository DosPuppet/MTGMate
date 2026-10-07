/**
 * Final Fantasy, lot A : job select, tiered, « si au moins quatre mana ont été dépensés », Syncopate, Villes à aventure.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy } from "../src/actions";
import { activated, fx, ref, spell, target, triggered, when } from "../src/dsl";
import { addEffect, moveWithSpec } from "../src/effects";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { changeCounters, chars, moveObject } from "../src/state";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  cast,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  pickNamed,
  scenario,
  settle as settleAll,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

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

  it("Cristaux : gains de PV doublés (Wind), meule adverse +4 (Water)", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Wind Crystal", "The Water Crystal", "Dazzling Angel", ...lands("Plains", 3)],
        hand: ["Healer's Hawk"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Healer's Hawk") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    let t = scenario({
      p1: { battlefield: ["The Water Crystal", ...lands("Island", 6)], hand: ["Jidoor, Aristocratic Capital // Overture"] },
    });
    const lib = t.players.p2?.library.length ?? 0;
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Jidoor, Aristocratic Capital // Overture"),
      face: 1,
      targets: { t: ["p2"] },
    });
    t = settle(t);
    expect(t.players.p2?.graveyard.length).toBe(Math.floor(lib / 2) + 4);
  });

  it("Stuck in Summoner's Sanctum : les capacités activées ne peuvent plus être activées", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Stuck in Summoner's Sanctum"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stuck in Summoner's Sanctum"), targets: { enchant: [elves] } });
    s = settle(s);
    expect(s.objects[elves]?.tapped).toBe(true);
    s.objects[elves]!.tapped = false;
    expect(legalActions(s, "p2").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(false);
  });

  it("kicker sans mana : Vayne's Treachery sacrifie une créature (pas sa cible) et donne -6/-6", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], hand: ["Vayne's Treachery"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const card = idOf(s, "p1", "hand", "Vayne's Treachery");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && opt.kickerAffordable).toBe(true);
    s = act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [dragon] } });
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Zodiark : chaque joueur sacrifie la moitié de ses créatures non-Dieu, et Zodiark grandit", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Swamp", 5)], hand: ["Zodiark, Umbral God"] },
      p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Zodiark, Umbral God") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Zodiark, Umbral God")]?.counters["+1/+1"]).toBe(2);
  });

  it("The Wandering Minstrel et Quina : terrains dégagés, Grenouille en plus des jetons", () => {
    let s = scenario({ p1: { battlefield: ["The Wandering Minstrel", "Quina, Qu Gourmet"], hand: ["Baron, Airship Kingdom"] } });
    const town = idOf(s, "p1", "hand", "Baron, Airship Kingdom");
    s = act(s, "p1", { type: "playLand", card: town });
    expect(s.objects[idOf(s, "p1", "battlefield", "Baron, Airship Kingdom")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: ["Quina, Qu Gourmet", ...lands("Island", 3)], hand: ["Dragoon's Wyvern"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Dragoon's Wyvern") });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Hero")).toHaveLength(1);
    // Une seule Grenouille : le jeton ajouté ne déclenche pas le remplacement.
    expect(idsOf(t, "p1", "battlefield", "Frog")).toHaveLength(1);
  });

  it("Torgal : le premier sort de créature Humain arrive avec un marqueur par Chien ou Loup", () => {
    let t = scenario({ p1: { battlefield: ["Torgal, A Fine Hound", ...lands("Plains", 4)], hand: ["Adelbert Steiner"] } });
    const card = idOf(t, "p1", "hand", "Adelbert Steiner");
    t = act(t, "p1", { type: "cast", card });
    t = settle(t);
    // Adelbert Steiner est un Humain : un marqueur par Chien ou Loup (Torgal).
    expect(t.objects[idOf(t, "p1", "battlefield", "Adelbert Steiner")]?.counters["+1/+1"]).toBe(1);
  });

  it("Esper Origins : lancée en flashback, elle arrive transformée avec un marqueur de finalité", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Esper Origins // Summon: Esper Maduin"] } });
    const card = s.players.p1?.graveyard[0] as string;
    s = act(s, "p1", { type: "cast", card });
    s = settle(s);
    const [perm] = idsOf(s, "p1", "battlefield", "Esper Origins // Summon: Esper Maduin");
    expect(perm).toBeDefined();
    expect(chars(s, perm as string).name).toBe("Summon: Esper Maduin");
    expect(s.objects[perm as string]?.counters.finality).toBe(1);
    expect(s.objects[perm as string]?.counters.lore).toBe(1);
  });

  it("Trance Kuja : les blessures d'un Sorcier que vous contrôlez sont doublées", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kuja, Genome Sorcerer // Trance Kuja, Fate Defied", "Black Waltz No. 3", ...lands("Mountain", 1)],
        hand: ["Burst Lightning"],
      },
    });
    const kuja = idOf(s, "p1", "battlefield", "Kuja, Genome Sorcerer // Trance Kuja, Fate Defied");
    s.objects[kuja]!.faceDefId = s.defs[s.objects[kuja]!.defId]!.faceDefs![1]!.id;
    bump(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p2"] } });
    s = settle(s);
    // Black Waltz No. 3 (Sorcier) : 2 blessures doublées = 4 ; Burst Lightning (sort) : 2.
    expect(s.players.p2?.life).toBe(14);
  });

  it("The Darkness Crystal : la créature adverse est exilée (liée) au lieu de mourir, +2 PV, puis revient chez vous", () => {
    let s = scenario({
      p1: { battlefield: ["The Darkness Crystal", ...lands("Mountain", 1), ...lands("Swamp", 6)], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Burst Lightning"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    const exiled = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub") as string;
    expect(exiled).toBeDefined();
    const crystal = idOf(s, "p1", "battlefield", "The Darkness Crystal");
    const index = (s.defs[s.objects[crystal]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated");
    s = act(s, "p1", { type: "activate", source: crystal, ability: index, targets: { t: [exiled] } });
    s = passBoth(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });

  it("Ancient Adamantoise encaisse les blessures infligées à son contrôleur et à ses autres permanents", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Burst Lightning", "Burst Lightning"] },
      p2: { battlefield: ["Ancient Adamantoise", "Bear Cub"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Burst Lightning") as [string, string];
    s = act(s, "p1", { type: "cast", card: a, targets: { t: ["p2"] } });
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: b, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(20);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Ancient Adamantoise")]?.damage).toBe(4);
  });

  it("Absolute Virtue : son contrôleur ne peut pas être ciblé ni blessé par ses adversaires", () => {
    const s = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      p2: { battlefield: ["Absolute Virtue"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).not.toContain("p2");
  });

  it("Zidane : un Trésor quand un adversaire prend le contrôle d'un de vos permanents", () => {
    let s = scenario({
      p1: { battlefield: ["Stiltzkin, Moogle Merchant", "Zidane, Tantalus Thief", "Bear Cub", ...lands("Plains", 2)] },
    });
    const stiltzkin = idOf(s, "p1", "battlefield", "Stiltzkin, Moogle Merchant");
    const index = (s.defs[s.objects[stiltzkin]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated");
    s = act(s, "p1", {
      type: "activate",
      source: stiltzkin,
      ability: index,
      targets: { p: ["p2"], t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
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

describe("Final Fantasy, cartes du méta (PLAN-C, lot C13)", () => {
  it("Starting Town : dégagée pendant vos trois premiers tours, engagée ensuite ; {T}, 1 PV : un mana au choix", () => {
    const play = (turn: number) => {
      const s = scenario({ turn, p1: { hand: ["Starting Town"] } });
      const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Starting Town") });
      return { t, town: idOf(t, "p1", "battlefield", "Starting Town") };
    };
    // Tour 5 : troisième tour de p1 (1, 3, 5).
    const early = play(5);
    expect(early.t.objects[early.town]?.tapped).toBe(false);
    const late = play(7);
    expect(late.t.objects[late.town]?.tapped).toBe(true);
    let s = early.t;
    const colorless = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === early.town);
    expect(colorless?.type === "tapForMana" && colorless.colors).toEqual(["C"]);
    const any = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === early.town);
    s = act(s, "p1", { type: "activate", source: early.town, ability: any?.type === "activate" ? any.ability : -1 });
    s = passAccepting(s, (x) => x.pending?.kind !== "choice");
    expect(s.players.p1?.life).toBe(19);
    const pool: Record<string, number> = { ...s.players.p1?.manaPool };
    expect(Object.values(pool).reduce((n, v) => n + v, 0)).toBe(1);
    expect(pool.C ?? 0).toBe(0);
  });

  it("Sazh's Chocobo : un marqueur +1/+1 à chaque terrain qui arrive sous votre contrôle", () => {
    let s = scenario({ p1: { battlefield: ["Sazh's Chocobo"], hand: ["Forest"] } });
    const bird = idOf(s, "p1", "battlefield", "Sazh's Chocobo");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(s.objects[bird]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bird).power).toBe(1);
  });

  it("Buster Sword : +3/+2 ; blessures de combat à un joueur : piochez, puis lancez gratuitement un sort de VM ≤ blessures", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Buster Sword", ...lands("Plains", 2)], hand: ["Serra Angel", "Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const sword = idOf(s, "p1", "battlefield", "Buster Sword");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
    s = act(s, "p1", {
      type: "activate",
      source: sword,
      ability: equip?.type === "activate" ? equip.ability : -1,
      targets: { t: [bear] },
    });
    s = settle(s);
    expect(chars(s, bear).power).toBe(5);
    expect(chars(s, bear).toughness).toBe(4);
    s = attack(s, [bear]);
    s = untilCastNow(s);
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.hand).toHaveLength(3);
    // 5 blessures : Serra Angel (VM 5) est proposée, pas Shivan Dragon (VM 6).
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    expect(castNowOf(s)?.cards).toContain(angel);
    expect(castNowOf(s)?.cards).not.toContain(idOf(s, "p1", "hand", "Shivan Dragon"));
    s = settle(act(s, "p1", { type: "cast", card: angel }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // Lancée sans payer : les deux Plaines ont servi à l'équipement seulement.
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Cloud, Midgar Mercenary : cherche un Équipement ; équipé, les déclenchements de son Équipement ont lieu deux fois", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Cloud, Midgar Mercenary"], library: ["Forest", "Buster Sword", "Forest"] },
    });
    s = settle(cast(s, "p1", "Cloud, Midgar Mercenary"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Buster Sword"]);
    let t = scenario({ p1: { battlefield: ["Cloud, Midgar Mercenary", "Buster Sword"] } });
    const cloud = idOf(t, "p1", "battlefield", "Cloud, Midgar Mercenary");
    t.objects[idOf(t, "p1", "battlefield", "Buster Sword")]!.attachedTo = cloud;
    bump(t);
    t = attack(t, [cloud]);
    t = settleNoBlocks(t);
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(15);
    // Deux déclenchements de Buster Sword : deux cartes piochées.
    expect(t.players.p1?.hand).toHaveLength(2);
  });

  it("The Masamune : la mort d'une créature fait se déclencher une fois de plus les capacités de la créature équipée et de vos emblèmes", () => {
    // Deux créatures identiques, « quand cette créature meurt, vous gagnez 3 PV » ; seule la première est équipée.
    const mourner = customCard({
      name: "Pleureur",
      power: 2,
      toughness: 2,
      abilities: [triggered(when.dies({ self: true }), [fx.gainLife(3)], { label: "3 PV" })],
    });
    let s = scenario({ p1: { battlefield: ["The Masamune", mourner, mourner] } });
    const [equipped, bare] = idsOf(s, "p1", "battlefield", "Pleureur") as [string, string];
    s.objects[idOf(s, "p1", "battlefield", "The Masamune")]!.attachedTo = equipped;
    bump(s);
    destroy(s, equipped);
    s = settleAll(s);
    expect(s.players.p1?.life).toBe(26);
    s = structuredClone(s);
    destroy(s, bare);
    s = settleAll(s);
    expect(s.players.p1?.life).toBe(29);
    // Emblème : « chaque fois qu'une créature meurt, vous gagnez 1 PV », deux fois tant que The Masamune est en jeu.
    const giver = customCard({
      name: "Donneur d'emblème",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: spell(
        [],
        [
          fx.emblem("Deuil", "Whenever a creature dies, you gain 1 life.", [
            triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(1)], { label: "1 PV" }),
          ]),
        ],
      ),
    });
    let t = scenario({ p1: { battlefield: ["The Masamune", "Bear Cub"], hand: [giver] } });
    t = structuredClone(settleAll(cast(t, "p1", "Donneur d'emblème")));
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settleAll(t);
    expect(t.players.p1?.life).toBe(22);
  });

  it("Zack Fair : arrive avec un marqueur ; sacrifié, donne l'indestructible, ses marqueurs et un de ses Équipements", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Buster Sword", "Buster Sword", ...lands("Plains", 2)], hand: ["Zack Fair"] },
    });
    s = settle(cast(s, "p1", "Zack Fair"));
    const zack = idOf(s, "p1", "battlefield", "Zack Fair");
    expect(s.objects[zack]?.counters["+1/+1"]).toBe(1);
    const [other, sword] = idsOf(s, "p1", "battlefield", "Buster Sword") as [string, string];
    s.objects[sword]!.attachedTo = zack;
    s.objects[other]!.attachedTo = zack;
    bump(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === zack);
    s = act(s, "p1", {
      type: "activate",
      source: zack,
      ability: ab?.type === "activate" ? ab.ability : -1,
      targets: { t: [bear] },
    });
    expect(idsOf(s, "p1", "graveyard", "Zack Fair")).toHaveLength(1);
    // « Un Équipement qui était attaché à Zack » : vous choisissez lequel ; l'autre reste détaché.
    s = settleAll(s, (req) => (req.type === "pick" && req.options.includes(sword) ? [sword] : undefined));
    expect(chars(s, bear).keywords).toContain("indestructible");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[sword]?.attachedTo).toBe(bear);
    expect(s.objects[other]?.attachedTo).toBeUndefined();
    expect(chars(s, bear).power).toBe(6);
  });

  it("Cecil, Dark Knight : contact mortel ; ses blessures vous font perdre autant de PV, puis il se transforme à 10 PV ou moins", () => {
    const CECIL = "Cecil, Dark Knight // Cecil, Redeemed Paladin";
    let s = scenario({ p1: { battlefield: [CECIL] } });
    let cecil = idOf(s, "p1", "battlefield", CECIL);
    expect(chars(s, cecil).keywords).toContain("deathtouch");
    s = throughCombat(attack(s, [cecil]));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(18);
    expect(chars(s, cecil).name).not.toBe("Cecil, Redeemed Paladin");
    expect(s.objects[cecil]?.tapped).toBe(true);
    let t = scenario({ p1: { life: 12, battlefield: [CECIL] } });
    cecil = idOf(t, "p1", "battlefield", CECIL);
    t = throughCombat(attack(t, [cecil]));
    expect(t.players.p1?.life).toBe(10);
    expect(chars(t, cecil).name).toBe("Cecil, Redeemed Paladin");
    expect(t.objects[cecil]?.tapped).toBe(false);
    expect(chars(t, cecil).keywords).toContain("lifelink");
  });

  it("Cecil, Redeemed Paladin : quand il attaque, les autres attaquants deviennent indestructibles", () => {
    const CECIL = "Cecil, Dark Knight // Cecil, Redeemed Paladin";
    let s = scenario({ p1: { battlefield: [CECIL, "Bear Cub", "Llanowar Elves"] } });
    const cecil = idOf(s, "p1", "battlefield", CECIL);
    s.objects[cecil]!.faceDefId = s.defs[s.objects[cecil]!.defId]!.faceDefs![1]!.id;
    bump(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(attack(s, [cecil, bear]));
    expect(chars(s, bear).keywords).toContain("indestructible");
    expect(chars(s, cecil).keywords).not.toContain("indestructible");
    expect(chars(s, elves).keywords).not.toContain("indestructible");
  });

  it("Fire Magic : 1, 2 ou 3 blessures à chaque créature selon le palier", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 6), "Llanowar Elves", "Bear Cub"], hand: ["Fire Magic"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
    const fire = (mode: number) => {
      const s = setup();
      const card = idOf(s, "p1", "hand", "Fire Magic");
      return settle(act(s, "p1", { type: "cast", card, mode: castModes(s, card)[mode]?.index }));
    };
    let s = fire(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(1);
    s = fire(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    s = fire(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(6);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
  });

  it("The Fire Crystal : sorts rouges à {1} de moins, célérité, copie temporaire d'une de vos créatures", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Fire Crystal", { name: "Bear Cub", sick: true }, ...lands("Mountain", 5)],
        hand: ["Shivan Dragon"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toContain("haste");
    // Shivan Dragon ({4}{R}{R}) pour cinq Montagnes.
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).keywords).toContain("haste");
    let t = scenario({ p1: { battlefield: ["The Fire Crystal", "Bear Cub", ...lands("Mountain", 6)] } });
    const crystal = idOf(t, "p1", "battlefield", "The Fire Crystal");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === crystal);
    t = act(t, "p1", {
      type: "activate",
      source: crystal,
      ability: ab?.type === "activate" ? ab.ability : -1,
      targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] },
    });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Mana en n'importe quelle combinaison (lot K2)", () => {
  it("Vivi Ornitier : X mana en toute combinaison de {U} et {R} ; force 3, il paie seul {1}{U}{R}", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Vivi Ornitier", counters: { "+1/+1": 3 } }], hand: ["Broadside Barrage"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const barrage = idOf(s, "p1", "hand", "Broadside Barrage");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === barrage)).toBe(true);
    s = act(s, "p1", { type: "cast", card: barrage, targets: { t: [bear] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });
});

describe("Final Fantasy, lot K6 : choix rendus au joueur", () => {
  /** Joue (sans attaquer) en répondant aux choix jusqu'à `until`. */
  const runUntil = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 300 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else break;
    }
    return s;
  };

  const TERRA = "Terra, Magical Adept // Esper Terra";

  it("Esper Terra : « jusqu'à trois » marqueurs de savoir sur la copie de Saga, de zéro à trois", () => {
    for (const yes of [0, 1, 2, 3]) {
      const s0 = scenario({ p1: { battlefield: ["Summon: Shiva"], hand: [TERRA] } });
      const shiva = idOf(s0, "p1", "battlefield", "Summon: Shiva");
      moveWithSpec(s0, "p1", idOf(s0, "p1", "hand", TERRA), { to: "battlefield", transformed: true });
      let asked = 0;
      const copyOf = (s: S) => s.battlefield.find((id) => s.objects[id]?.isToken && nameOf(s, id) === "Summon: Shiva");
      const s = runUntil(
        s0,
        (req) => {
          if (req.type === "yesNo") return [asked++ < yes ? 1 : 0];
          return req.type === "pick" && req.options.includes(shiva) ? [shiva] : undefined;
        },
        (x) => !!copyOf(x) && !x.stack.some((i) => x.defs[i.sourceDefId]?.name === TERRA),
      );
      const copy = copyOf(s) as string;
      expect(copy).toBeDefined();
      // Le marqueur d'arrivée de la Saga (714.3a), plus les marqueurs choisis.
      expect(s.objects[copy]?.counters.lore).toBe(1 + yes);
      expect(asked).toBe(Math.min(yes + 1, 3));
      expect(chars(s, copy).keywords).toContain("haste");
    }
  });

  it("Beatrix, Loyal General : un nombre quelconque de vos Équipements, choisis un par un, sur la créature ciblée", () => {
    const s0 = scenario({ p1: { battlefield: ["Beatrix, Loyal General", "Bear Cub", "Black Mage's Rod", "Black Mage's Rod"] } });
    const bear = idOf(s0, "p1", "battlefield", "Bear Cub");
    const [rod1, rod2] = idsOf(s0, "p1", "battlefield", "Black Mage's Rod") as [string, string];
    let offered: string[] = [];
    const s = runUntil(
      s0,
      (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(bear)) return [bear];
        if (req.options.includes(rod1)) {
          offered = req.options;
          expect(req.min).toBe(0);
          return [rod2];
        }
        return undefined;
      },
      (x) => x.turn.step === "declareAttackers",
    );
    expect(offered.sort()).toEqual([rod1, rod2].sort());
    expect(s.objects[rod2]?.attachedTo).toBe(bear);
    expect(s.objects[rod1]?.attachedTo).toBeFalsy();

    // Aucun : rien n'est attaché.
    const none = runUntil(
      s0,
      (req) =>
        req.type === "pick" ? (req.options.includes(bear) ? [bear] : req.options.includes(rod1) ? [] : undefined) : undefined,
      (x) => x.turn.step === "declareAttackers",
    );
    expect(none.objects[rod1]?.attachedTo).toBeFalsy();
    expect(none.objects[rod2]?.attachedTo).toBeFalsy();
  });

  it("Zell Dincht : le terrain renvoyé n'est pas ciblé, il est choisi à la résolution", () => {
    const s0 = scenario({ p1: { battlefield: ["Zell Dincht", "Mountain", "Forest"] } });
    const forest = idOf(s0, "p1", "battlefield", "Forest");
    let onStack: S | undefined;
    const s = runUntil(
      s0,
      (req, _p, cur) => {
        if (req.type === "pick" && req.options.includes(forest)) {
          onStack = cur;
          expect(req.options).toHaveLength(2);
          return [forest];
        }
        return undefined;
      },
      (x) => x.turn.step === "end" && x.stack.length === 0 && !!onStack,
    );
    const item = onStack?.stack.find((i) => onStack?.defs[i.sourceDefId]?.name === "Zell Dincht");
    expect(item).toBeDefined();
    expect(Object.values(item?.targets ?? {}).flat()).toHaveLength(0);
    expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(1);
  });
});

/** Rituel gratuit de test : « transformez le permanent ciblé ». */
const TRANSMUTE = customCard({
  name: "Transmutation",
  typeLine: "Sorcery",
  types: ["Sorcery"],
  spell: spell([target.permanent("t", ["Creature", "Enchantment"])], [fx.transform(ref.target())]),
});

describe("Final Fantasy, lot K8 : cartes mythiques, rares et peu communes", () => {
  /** Joue en répondant aux choix (réponse suggérée par défaut) jusqu'à `until` ; n'attaque ni ne bloque. */
  const play = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 400 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = s.players[p.player]?.hand ?? [];
        s = act(s, p.player, { type: "discard", cards: hand.slice(0, p.count) });
      } else break;
    }
    return s;
  };
  /** Réponse : « oui » (ou « non ») aux questions, `want` quand il fait partie des options d'un choix. */
  const answering =
    (yes: boolean, want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        if (picked.length > 0) return picked.slice(0, req.max);
      }
      return undefined;
    };
  /** Résout la pile en répondant aux choix. */
  const resolve = (s: S, answer: Answer = () => undefined) => settleAll(s, answer);
  /** Active la capacité de `source` dont le libellé commence par `label` (la première, sans libellé). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const opt = legalActions(s, player).find(
      (a) => a.type === "activate" && a.source === source && (!label || a.label?.startsWith(label)),
    );
    if (opt?.type !== "activate") throw new Error(`capacité « ${label ?? "?"} » introuvable`);
    return act(s, player, { type: "activate", source, ability: opt.ability, ...extra });
  };
  const canUse = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source && (!label || a.label?.startsWith(label)));
  /** Montre le verso d'une carte transformable. */
  const flip = (s: S, id: string) => {
    s.objects[id]!.faceDefId = s.defs[s.objects[id]!.defId]!.faceDefs![1]!.id;
    bump(s);
  };
  const life = (s: S, p: string) => s.players[p]?.life;
  const hand = (s: S, p: string) => s.players[p]?.hand.length ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;
  /** Jusqu'à la phase principale 1 du prochain tour de `p`. */
  const toMain = (s: S, p: string, answer: Answer = () => undefined) =>
    play(
      s,
      answer,
      (x) =>
        x.turn.active === p &&
        x.turn.step === "main1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0 &&
        x.pending?.kind === "priority" &&
        x.turn.number > s.turn.number,
    );

  describe("mythiques", () => {
    it("Aettir and Priwen : F/E de base égales à vos PV (marqueurs en plus), suit vos PV ; Équiper {5}", () => {
      let s = scenario({
        p1: {
          life: 13,
          battlefield: ["Aettir and Priwen", { name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Plains", 5)],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const gear = idOf(s, "p1", "battlefield", "Aettir and Priwen");
      s = resolve(activate(s, "p1", gear, "Équiper", { targets: { t: [bear] } }));
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
      expect(pt(s, bear)).toEqual([14, 14]);
      s.players.p1!.life = 6;
      bump(s);
      expect(pt(s, bear)).toEqual([7, 7]);
    });

    it("Clive, Ifrit's Dominant : à l'arrivée, vous pouvez défausser votre main puis piocher selon votre dévotion au rouge", () => {
      const CLIVE = "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno";
      const run = (yes: boolean) => {
        const s = scenario({ p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 6)], hand: [CLIVE, "Opt", "Bear Cub"] } });
        return resolve(cast(s, "p1", CLIVE), answering(yes));
      };
      const yes = run(true);
      // Dévotion : {R}{R} de Clive et {R}{R} du Dragon.
      expect(hand(yes, "p1")).toBe(4);
      expect(namesIn(yes, yes.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
      const no = run(false);
      expect(namesIn(no, no.players.p1?.hand).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Ifrit, Warden of Inferno : I combat une autre créature ciblée ; III : revient sur son recto (pas à II)", () => {
      const CLIVE = "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno";
      let s = scenario({ p1: { battlefield: [CLIVE, ...lands("Mountain", 6)] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", CLIVE)), answering(true, [angel]));
      const ifrit = idOf(s, "p1", "battlefield", CLIVE);
      expect(chars(s, ifrit).name).toBe("Ifrit, Warden of Inferno");
      expect(pt(s, ifrit)).toEqual([9, 9]);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[ifrit]?.damage).toBe(4);
      // Chapitre II : deux marqueurs, il reste Ifrit.
      s = play(
        s,
        () => undefined,
        (x) => (x.objects[ifrit]?.counters.lore ?? 0) >= 2 && x.stack.length === 0,
      );
      expect(chars(s, ifrit).name).toBe("Ifrit, Warden of Inferno");
      // Chapitre III : exilé puis renvoyé sur son recto.
      s = play(
        s,
        () => undefined,
        (x) => !x.battlefield.includes(ifrit) && x.stack.length === 0,
      );
      const back = idOf(s, "p1", "battlefield", CLIVE);
      expect(chars(s, back).name).not.toBe("Ifrit, Warden of Inferno");
      expect(pt(s, back)).toEqual([5, 5]);
      expect(s.objects[back]?.counters.lore).toBeUndefined();
    });

    it("Cloud, Planet's Champion : équipé, double initiative et indestructible pendant votre tour seulement ; Équiper le ciblant coûte {2} de moins", () => {
      let s = scenario({ p1: { battlefield: ["Cloud, Planet's Champion", "Buster Sword", "Bear Cub"] } });
      const cloud = idOf(s, "p1", "battlefield", "Cloud, Planet's Champion");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      expect(chars(s, cloud).keywords).not.toContain("doubleStrike");
      // Sans terrain : Équiper {2} ne vise que Cloud.
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toEqual([cloud]);
      s = resolve(activate(s, "p1", sword, "Équiper", { targets: { t: [cloud] } }));
      expect(s.objects[sword]?.attachedTo).toBe(cloud);
      expect(chars(s, cloud).keywords).toEqual(expect.arrayContaining(["doubleStrike", "indestructible"]));
      const t = scenario({ active: "p2", p1: { battlefield: ["Cloud, Planet's Champion", "Buster Sword"] } });
      const c2 = idOf(t, "p1", "battlefield", "Cloud, Planet's Champion");
      t.objects[idOf(t, "p1", "battlefield", "Buster Sword")]!.attachedTo = c2;
      bump(t);
      expect(chars(t, c2).keywords).not.toContain("doubleStrike");
      expect(chars(t, c2).keywords).not.toContain("indestructible");
    });

    it("Dark Confidant : à votre entretien, la carte du dessus va en main et vous perdez sa valeur de mana en PV", () => {
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: ["Dark Confidant"], library: ["Shivan Dragon", "Forest", "Forest"] },
      });
      s = toMain(s, "p1");
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Shivan Dragon"]);
      expect(life(s, "p1")).toBe(14);
    });

    it("Emet-Selch : pille à l'arrivée ; se transforme à l'entretien avec quatorze cartes au cimetière, pas avec treize", () => {
      const EMET = "Emet-Selch, Unsundered // Hades, Sorcerer of Eld";
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Swamp"], hand: [EMET, "Opt"], library: ["Bear Cub", "Forest"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = resolve(cast(s, "p1", EMET), answering(true, [opt]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", EMET)).keywords).toContain("vigilance");
      const upkeep = (n: number) => {
        const t = scenario({ active: "p2", turn: 4, p1: { battlefield: [EMET], graveyard: lands("Forest", n) } });
        const emet = idOf(t, "p1", "battlefield", EMET);
        return chars(toMain(t, "p1", answering(true)), emet).name;
      };
      expect(upkeep(14)).toBe("Hades, Sorcerer of Eld");
      expect(upkeep(13)).not.toBe("Hades, Sorcerer of Eld");
    });

    it("Hades, Sorcerer of Eld : pendant votre tour, vous jouez depuis votre cimetière ; ce qui irait au cimetière est exilé", () => {
      const EMET = "Emet-Selch, Unsundered // Hades, Sorcerer of Eld";
      let s = scenario({ p1: { battlefield: [EMET, "Island"], graveyard: ["Opt", "Forest"] } });
      flip(s, idOf(s, "p1", "battlefield", EMET));
      const opt = idOf(s, "p1", "graveyard", "Opt");
      expect(castable(s, "p1", opt)).toBe(true);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === idOf(s, "p1", "graveyard", "Forest"))).toBe(
        true,
      );
      s = resolve(act(s, "p1", { type: "cast", card: opt }));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(exiled(s, "Opt")).toHaveLength(1);
      // Pendant le tour adverse : pas de sort depuis le cimetière.
      const t = scenario({ active: "p2", p1: { battlefield: [EMET, "Island"], graveyard: ["Opt"] } });
      flip(t, idOf(t, "p1", "battlefield", EMET));
      const u = act(t, "p2", { type: "pass" });
      expect(castable(u, "p1", idOf(u, "p1", "graveyard", "Opt"))).toBe(false);
    });

    it("Gogo, Master of Mimicry : copie X fois une capacité que vous contrôlez ; X ne peut pas être 0", () => {
      const healer = customCard({
        name: "Guérisseur",
        power: 1,
        toughness: 1,
        abilities: [activated({ tap: true, effects: [fx.gainLife(2)], label: "2 PV" })],
      });
      let s = scenario({ p1: { battlefield: ["Gogo, Master of Mimicry", healer, ...lands("Island", 4)] } });
      const gogo = idOf(s, "p1", "battlefield", "Gogo, Master of Mimicry");
      expect(canUse(s, "p1", gogo)).toBe(false);
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Guérisseur"), "2 PV");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === gogo);
      expect(opt?.type === "activate" && opt.xMin).toBe(1);
      s = act(s, "p1", {
        type: "activate",
        source: gogo,
        ability: opt?.type === "activate" ? opt.ability : -1,
        x: 2,
        targets: { t: [s.stack[0]?.id as string] },
      });
      s = resolve(s);
      expect(life(s, "p1")).toBe(26);
    });

    it("Kefka, Court Mage : chaque joueur défausse ; vous piochez une carte par type de carte défaussé", () => {
      const KEFKA = "Kefka, Court Mage // Kefka, Ruler of Ruin";
      const run = (mine: string, theirs: string) => {
        const s = scenario({
          p1: { battlefield: ["Island", "Swamp", "Mountain", ...lands("Plains", 2)], hand: [KEFKA, mine] },
          p2: { hand: [theirs] },
        });
        return resolve(cast(s, "p1", KEFKA));
      };
      const two = run("Bear Cub", "Opt");
      expect(hand(two, "p1")).toBe(2);
      expect(two.players.p2?.hand).toHaveLength(0);
      expect(hand(run("Forest", "Forest"), "p1")).toBe(1);
    });

    it("Kefka : {8} chaque adversaire sacrifie un permanent et Kefka se transforme ; Ruler of Ruin pioche les PV perdus pendant votre tour", () => {
      const KEFKA = "Kefka, Court Mage // Kefka, Ruler of Ruin";
      let s = scenario({
        p1: { battlefield: [KEFKA, ...lands("Mountain", 8)], hand: ["Burst Lightning"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const kefka = idOf(s, "p1", "battlefield", KEFKA);
      s = resolve(activate(s, "p1", kefka));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(chars(s, kefka).name).toBe("Kefka, Ruler of Ruin");
      expect(chars(s, kefka).keywords).toContain("flying");
      // Burst Lightning : 2 PV perdus, deux cartes.
      let t = scenario({ p1: { battlefield: [KEFKA, "Mountain"], hand: ["Burst Lightning"] } });
      flip(t, idOf(t, "p1", "battlefield", KEFKA));
      t = resolve(cast(t, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(hand(t, "p1")).toBe(2);
      // Pendant le tour adverse : rien.
      let u = scenario({
        active: "p2",
        p1: { battlefield: [KEFKA] },
        p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      });
      flip(u, idOf(u, "p1", "battlefield", KEFKA));
      u = resolve(cast(u, "p2", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(life(u, "p2")).toBe(18);
      expect(hand(u, "p1")).toBe(0);
    });

    it("Lightning, Army of One : après des blessures de combat à un joueur, les blessures à ce joueur et à ses permanents sont doublées", () => {
      let s = scenario({
        p1: { battlefield: ["Lightning, Army of One", ...lands("Mountain", 2)], hand: ["Burst Lightning", "Burst Lightning"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const light = idOf(s, "p1", "battlefield", "Lightning, Army of One");
      expect(chars(s, light).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample", "lifelink"]));
      s = throughCombat(attack(s, [light]));
      expect(life(s, "p2")).toBe(17);
      expect(life(s, "p1")).toBe(23);
      const [a, b] = idsOf(s, "p1", "hand", "Burst Lightning") as [string, string];
      s = resolve(act(s, "p1", { type: "cast", card: a, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(13);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(act(s, "p1", { type: "cast", card: b, targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Nibelheim Aflame : votre créature blesse chaque autre créature selon sa force ; en flashback, défaussez votre main et piochez quatre cartes", () => {
      const setup = (where: "hand" | "graveyard") =>
        scenario({
          p1: {
            battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Mountain", 7)],
            hand: where === "hand" ? ["Nibelheim Aflame", "Opt"] : ["Opt"],
            graveyard: where === "graveyard" ? ["Nibelheim Aflame"] : [],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup("hand");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = resolve(cast(s, "p1", "Nibelheim Aflame", { targets: { t: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[dragon]?.damage).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = setup("graveyard");
      const d2 = idOf(t, "p1", "battlefield", "Shivan Dragon");
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "Nibelheim Aflame"), targets: { t: [d2] } }));
      expect(hand(t, "p1")).toBe(4);
      expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(exiled(t, "Nibelheim Aflame")).toHaveLength(1);
    });

    it("Sephiroth, Fabled SOLDIER : sacrifice optionnel pour piocher ; chaque autre mort draine 1 ; à la quatrième fois, il se transforme et donne l'emblème", () => {
      const SEPH = "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: [SEPH] } });
      s = resolve(cast(s, "p1", SEPH), (req, _p, cur) => pickNamed(cur, req, "Bear Cub") ?? answering(true)(req, _p, cur));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(1);
      expect(life(s, "p2")).toBe(19);
      expect(life(s, "p1")).toBe(21);
      let t = scenario({ p1: { battlefield: [SEPH] }, p2: { battlefield: lands("Bear Cub", 5) } });
      const seph = idOf(t, "p1", "battlefield", SEPH);
      const kill = (x: S) => {
        const y = structuredClone(x);
        destroy(y, idsOf(y, "p2", "battlefield", "Bear Cub")[0] as string);
        return resolve(y);
      };
      for (let i = 0; i < 3; i++) t = kill(t);
      expect(life(t, "p2")).toBe(17);
      expect(chars(t, seph).name).not.toBe("Sephiroth, One-Winged Angel");
      t = kill(t);
      expect(life(t, "p2")).toBe(16);
      expect(chars(t, seph).name).toBe("Sephiroth, One-Winged Angel");
      // Cinquième mort : seul l'emblème draine.
      t = kill(t);
      expect(life(t, "p2")).toBe(15);
      expect(life(t, "p1")).toBe(25);
    });

    it("Sephiroth, One-Winged Angel : en attaquant, sacrifiez autant d'autres créatures que voulu et piochez autant", () => {
      const SEPH = "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel";
      let s = scenario({ p1: { battlefield: [SEPH, "Bear Cub", "Bear Cub", "Llanowar Elves"] } });
      const seph = idOf(s, "p1", "battlefield", SEPH);
      flip(s, seph);
      expect(chars(s, seph).keywords).toContain("flying");
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(attack(s, [seph]), answering(true, bears));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(2);
    });

    it("Sephiroth, Planet's Heir : créatures adverses -2/-2 jusqu'à la fin du tour ; un marqueur par créature adverse qui meurt", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", ...lands("Swamp", 5)], hand: ["Sephiroth, Planet's Heir"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Sephiroth, Planet's Heir"));
      const seph = idOf(s, "p1", "battlefield", "Sephiroth, Planet's Heir");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(counters(s, seph)).toBe(1);
      expect(chars(s, seph).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, angel)).toEqual([4, 4]);
    });

    it("Summon: Bahamut : I détruit jusqu'à un permanent non-terrain ; IV inflige la VM totale de vos autres permanents à chaque adversaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 9), hand: ["Summon: Bahamut"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const forest = idOf(s, "p2", "battlefield", "Forest");
      let seen: string[] = [];
      s = resolve(cast(s, "p1", "Summon: Bahamut"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) {
          seen = req.options;
          return [angel];
        }
        return undefined;
      });
      expect(seen).not.toContain(forest);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Bahamut", counters: { lore: 3 } }, "Shivan Dragon", "Bear Cub", "Plains"] },
      });
      t = toMain(t, "p1");
      // Shivan Dragon (6) + Bear Cub (2), le terrain compte pour 0.
      expect(life(t, "p2")).toBe(12);
      expect(idsOf(t, "p1", "graveyard", "Summon: Bahamut")).toHaveLength(1);
    });

    it("Summon: Knights of Round : trois Chevaliers 2/2 par chapitre ; V : +2/+2 et un marqueur d'indestructible à chacune de vos autres créatures", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), hand: ["Summon: Knights of Round"] } });
      s = resolve(cast(s, "p1", "Summon: Knights of Round"));
      expect(idsOf(s, "p1", "battlefield", "Knight")).toHaveLength(3);
      const kor = idOf(s, "p1", "battlefield", "Summon: Knights of Round");
      expect(chars(s, kor).keywords).toContain("indestructible");
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Knights of Round", counters: { lore: 4 } }, "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const k2 = idOf(t, "p1", "battlefield", "Summon: Knights of Round");
      t = toMain(t, "p1");
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(pt(t, bear)).toEqual([4, 4]);
      expect(counters(t, bear, "indestructible")).toBe(1);
      expect(counters(t, idOf(t, "p2", "battlefield", "Serra Angel"), "indestructible")).toBe(0);
      expect(t.battlefield).not.toContain(k2);
    });

    it("Traveling Chocobo : terrains et sorts d'Oiseau depuis le dessus de la bibliothèque ; les déclencheurs d'arrivée d'un terrain ont lieu deux fois", () => {
      const s = scenario({ p1: { battlefield: ["Traveling Chocobo", "Sazh's Chocobo"], library: ["Forest", "Bear Cub"] } });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
      const t = resolve(act(s, "p1", { type: "playLand", card: top }));
      expect(counters(t, idOf(t, "p1", "battlefield", "Sazh's Chocobo"))).toBe(2);
      // Une créature non-Oiseau au-dessus ne se lance pas.
      const u = scenario({ p1: { battlefield: ["Traveling Chocobo", ...lands("Forest", 2)], library: ["Bear Cub"] } });
      expect(castable(u, "p1", u.players.p1?.library[0] as string)).toBe(false);
    });

    it("Y'shtola Rhul : à votre étape de fin, une de vos créatures est exilée puis revient, et il y a une étape de fin supplémentaire (une seule)", () => {
      let s = scenario({ p1: { battlefield: ["Y'shtola Rhul", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      const seen = new Set<string>();
      const pickBear: Answer = (req, _p, cur) => pickNamed(cur, req, "Bear Cub");
      s = play(s, pickBear, (x) => {
        for (const id of idsOf(x, "p1", "battlefield", "Bear Cub")) seen.add(id);
        return x.turn.active === "p2";
      });
      // Le Bébé ours d'origine et deux retours.
      expect(seen.size).toBe(3);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Yuna, Hope of Spira : pendant votre tour, elle et vos créatures-enchantements ont piétinement, lien de vie et garde ; un enchantement revient du cimetière avec un marqueur de finalité", () => {
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      let s = scenario({ p1: { battlefield: ["Yuna, Hope of Spira", "Bear Cub"], graveyard: [charm] } });
      const yuna = idOf(s, "p1", "battlefield", "Yuna, Hope of Spira");
      expect(chars(s, yuna).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
      s = play(s, answering(true, idsOf(s, "p1", "graveyard", "Charme")), (x) => x.turn.active === "p2");
      const back = idOf(s, "p1", "battlefield", "Charme");
      expect(counters(s, back, "finality")).toBe(1);
      expect(chars(s, yuna).keywords).not.toContain("trample");
    });
  });

  describe("rares (1)", () => {
    it("A Realm Reborn : vos autres permanents ont « {T} : un mana de n'importe quelle couleur », pas ceux de l'adversaire", () => {
      const s = scenario({ p1: { battlefield: ["A Realm Reborn", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const manaOf = (p: string, src: string) => legalActions(s, p).find((a) => a.type === "tapForMana" && a.source === src);
      const mine = manaOf("p1", idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(mine?.type === "tapForMana" && [...mine.colors].sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(manaOf("p1", idOf(s, "p1", "battlefield", "A Realm Reborn"))).toBeUndefined();
      expect(manaOf("p2", idOf(s, "p2", "battlefield", "Bear Cub"))).toBeUndefined();
    });

    it("Aerith Gainsborough : un marqueur à chaque gain de PV ; à sa mort, ses marqueurs vont sur chacune de vos créatures légendaires", () => {
      let s = scenario({ p1: { battlefield: ["Aerith Gainsborough"] } });
      const aerith = idOf(s, "p1", "battlefield", "Aerith Gainsborough");
      expect(chars(s, aerith).keywords).toContain("lifelink");
      s = throughCombat(attack(s, [aerith]));
      expect(life(s, "p1")).toBe(22);
      expect(counters(s, aerith)).toBe(1);
      let t = scenario({
        p1: { battlefield: [{ name: "Aerith Gainsborough", counters: { "+1/+1": 2 } }, "Cloud, Planet's Champion", "Bear Cub"] },
      });
      destroy(t, idOf(t, "p1", "battlefield", "Aerith Gainsborough"));
      t = resolve(t);
      expect(counters(t, idOf(t, "p1", "battlefield", "Cloud, Planet's Champion"))).toBe(2);
      expect(counters(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Ardyn, the Usurper : au début du combat, une carte de créature d'un cimetière devient un jeton Démon noir 5/5 avec menace, lien de vie et célérité", () => {
      let s = scenario({ p1: { battlefield: ["Ardyn, the Usurper"] }, p2: { graveyard: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = play(s, answering(true, [angel]), (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      const token = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[token]?.isToken).toBe(true);
      expect(pt(s, token)).toEqual([5, 5]);
      expect(chars(s, token).colors).toEqual(["B"]);
      expect(chars(s, token).subtypes).toEqual(["Demon"]);
      expect(chars(s, token).keywords).toEqual(expect.arrayContaining(["flying", "menace", "lifelink", "haste"]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ardyn, the Usurper")).keywords).not.toContain("menace");
    });

    it("Astrologian's Planisphere : la créature équipée est un Sorcier ; un marqueur par sort non-créature et à la troisième carte piochée", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Astrologian's Planisphere", "Opt", "Bear Cub", "Quick Study"] },
      });
      s = resolve(cast(s, "p1", "Astrologian's Planisphere"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(chars(s, hero).subtypes).toEqual(expect.arrayContaining(["Hero", "Wizard"]));
      // Opt : sort non-créature (1), première carte piochée.
      s = resolve(cast(s, "p1", "Opt"));
      expect(counters(s, hero)).toBe(1);
      // Un sort de créature : rien (Bear Cub ne se lance pas faute de {G} : on passe directement à Quick Study).
      s = resolve(cast(s, "p1", "Quick Study"));
      // Quick Study (2) et la troisième carte piochée (3).
      expect(counters(s, hero)).toBe(3);
    });

    it("Balamb Garden : arrive engagé ; la transformation coûte {1} de moins par autre Ville ; le Véhicule pioche en attaquant", () => {
      const BALAMB = "Balamb Garden, SeeD Academy // Balamb Garden, Airborne";
      const s = scenario({ p1: { hand: [BALAMB] } });
      const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", BALAMB) });
      expect(t.objects[idOf(t, "p1", "battlefield", BALAMB)]?.tapped).toBe(true);
      // Deux autres Villes : {3}{G}{U} pour cinq sources de mana.
      let u = scenario({ p1: { battlefield: [BALAMB, "Adventurer's Inn", "Capital City", "Forest", "Island", "Forest"] } });
      const garden = idOf(u, "p1", "battlefield", BALAMB);
      expect(canUse(u, "p1", garden, "Transformez")).toBe(true);
      const v = scenario({ p1: { battlefield: [BALAMB, "Forest", "Island", "Forest", "Forest", "Forest"] } });
      expect(canUse(v, "p1", idOf(v, "p1", "battlefield", BALAMB), "Transformez")).toBe(false);
      u = resolve(activate(u, "p1", garden, "Transformez"));
      expect(chars(u, garden).name).toBe("Balamb Garden, Airborne");
      expect(chars(u, garden).keywords).toContain("flying");
      let w = scenario({ p1: { battlefield: [BALAMB, "Bear Cub"] } });
      const g2 = idOf(w, "p1", "battlefield", BALAMB);
      flip(w, g2);
      w = resolve(activate(w, "p1", g2, "Équipage", { tap: [idOf(w, "p1", "battlefield", "Bear Cub")] }));
      w = resolve(attack(w, [g2]));
      expect(hand(w, "p1")).toBe(1);
    });

    it("Balthier and Fran : vos Véhicules +1/+1, portée et vigilance ; un Véhicule qu'ils ont piloté attaque : payez {1}{R}{G} pour un combat supplémentaire", () => {
      let s = scenario({
        p1: { battlefield: ["Balthier and Fran", "The Regalia", "Mountain", "Forest", "Forest"] },
        p2: { battlefield: ["The Regalia"] },
      });
      const regalia = idOf(s, "p1", "battlefield", "The Regalia");
      expect(pt(s, regalia)).toEqual([5, 5]);
      expect(chars(s, regalia).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
      expect(chars(s, idOf(s, "p2", "battlefield", "The Regalia")).keywords).not.toContain("reach");
      const bf = idOf(s, "p1", "battlefield", "Balthier and Fran");
      s = resolve(activate(s, "p1", regalia, "Équipage", { tap: [bf] }));
      s = attack(s, [regalia]);
      s = play(
        s,
        answering(true),
        (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && (x.players.p2?.life ?? 20) < 20),
      );
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(life(s, "p2")).toBe(15);
      expect(s.objects[regalia]?.tapped).toBe(false);
    });

    it("Bartz and Boko : affinité pour les Oiseaux ; chacun de vos autres Oiseaux inflige sa force à une créature adverse ciblée", () => {
      const wall = customCard({ name: "Mur", power: 0, toughness: 20 });
      let s = scenario({
        p1: {
          battlefield: [{ name: "Sazh's Chocobo", counters: { "+1/+1": 3 } }, "Healer's Hawk", "Bear Cub", ...lands("Forest", 3)],
          hand: ["Bartz and Boko"],
        },
        p2: { battlefield: [wall, "Bear Cub"] },
      });
      const target = idOf(s, "p2", "battlefield", "Mur");
      // {3}{G}{G} moins deux Oiseaux : trois Forêts suffisent.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bartz and Boko"))).toBe(true);
      s = resolve(cast(s, "p1", "Bartz and Boko"), answering(true, [target]));
      // Chocobo de Sazh (3) et Faucon (1) ; ni Bartz and Boko (4) ni le Bébé ours.
      expect(s.objects[target]?.damage).toBe(4);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(0);
    });

    it("Choco, Seeker of Paradise : les Oiseaux attaquants font regarder autant de cartes, une en main, les terrains en jeu engagés ; terrain : +1/+0", () => {
      let s = scenario({
        p1: {
          battlefield: ["Choco, Seeker of Paradise", "Healer's Hawk", "Healer's Hawk"],
          library: ["Forest", "Bear Cub", "Shock", "Opt"],
        },
      });
      const choco = idOf(s, "p1", "battlefield", "Choco, Seeker of Paradise");
      const birds = idsOf(s, "p1", "battlefield", "Healer's Hawk");
      s = attack(s, [choco, ...birds]);
      // Trois Oiseaux : les trois cartes du dessus sont regardées (pas meulées : elles restent dans la bibliothèque le
      // temps des choix) ; une en main, puis les terrains parmi les autres sur le champ de bataille, le reste au cimetière.
      const offered: number[] = [];
      s = resolve(s, (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return req.max === 1 && offered.length === 1 ? pickNamed(cur, req, "Bear Cub") : req.options;
      });
      expect(offered).toEqual([3, 1]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(s.objects[forest]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shock"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt"]);
      expect(chars(s, choco).power).toBe(4);
    });

    it("Choco, Seeker of Paradise : « autant de cartes » que d'Oiseaux qui ont attaqué, même s'ils ont quitté le champ de bataille avant la résolution", () => {
      let s = scenario({
        p1: {
          battlefield: ["Choco, Seeker of Paradise", "Healer's Hawk", "Healer's Hawk"],
          library: ["Forest", "Bear Cub", "Shock", "Opt"],
        },
      });
      const choco = idOf(s, "p1", "battlefield", "Choco, Seeker of Paradise");
      const birds = idsOf(s, "p1", "battlefield", "Healer's Hawk");
      s = structuredClone(attack(s, [choco, ...birds]));
      expect(s.stack.some((i) => i.kind === "ability" && s.defs[i.sourceDefId]?.name === "Choco, Seeker of Paradise")).toBe(true);
      // Les deux Faucons et Choco lui-même meurent, capacité sur la pile : trois cartes restent regardées.
      for (const id of [...birds, choco]) destroy(s, id);
      const offered: number[] = [];
      s = resolve(s, (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return req.max === 1 && offered.length === 1 ? pickNamed(cur, req, "Bear Cub") : req.options;
      });
      expect(offered).toEqual([3, 1]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt"]);
    });

    it("Clive's Hideaway : cachette 4 ; {2}, {T} : la carte exilée se joue gratuitement avec quatre créatures légendaires, pas avec trois", () => {
      const legend = (n: number) =>
        customCard({ name: `Légende ${n}`, supertypes: ["Legendary"], typeLine: "Legendary Creature", power: 1, toughness: 1 });
      const run = (count: number) => {
        let s = scenario({
          p1: {
            battlefield: [...[1, 2, 3, 4].slice(0, count).map(legend), "Forest", "Forest"],
            hand: ["Clive's Hideaway"],
            library: ["Shivan Dragon", "Forest", "Forest", "Forest", "Opt"],
          },
        });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Clive's Hideaway") });
        s = resolve(s, (req, _p, cur) => pickNamed(cur, req, "Shivan Dragon"));
        expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.library)[0]).toBe("Opt");
        s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Clive's Hideaway"), "Jouez"));
        return { s, dragon: exiled(s, "Shivan Dragon")[0] as string };
      };
      const four = run(4);
      expect(castable(four.s, "p1", four.dragon)).toBe(true);
      const done = resolve(act(four.s, "p1", { type: "cast", card: four.dragon }));
      expect(idsOf(done, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      const three = run(3);
      expect(castable(three.s, "p1", three.dragon)).toBe(false);
    });

    it("Deadly Embrace : détruit une créature adverse, puis pioche une carte par créature morte ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Deadly Embrace"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Deadly Embrace");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(2);
    });

    it("Dion, Bahamut's Dominant : un Chevalier 2/2 à l'arrivée ; Dion et vos autres Chevaliers volent pendant votre tour", () => {
      const DION = "Dion, Bahamut's Dominant // Bahamut, Warden of Light";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: [DION] } });
      s = resolve(cast(s, "p1", DION));
      const dion = idOf(s, "p1", "battlefield", DION);
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([2, 2]);
      expect(chars(s, dion).keywords).toContain("flying");
      expect(chars(s, knight).keywords).toContain("flying");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      // Hors de votre tour, ni Dion ni le Chevalier ne volent (PLAN-D, D8 : le vol du verso n'est plus lu sur le recto).
      expect(chars(s, knight).keywords).not.toContain("flying");
      expect(chars(s, dion).keywords).not.toContain("flying");
    });

    it("Bahamut, Warden of Light : I un marqueur et le vol à chacune de vos autres créatures ; III détruit un permanent ciblé et revient sur son recto", () => {
      const DION = "Dion, Bahamut's Dominant // Bahamut, Warden of Light";
      let s = scenario({
        p1: { battlefield: [DION, "Bear Cub", ...lands("Plains", 6)] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", DION)));
      const bahamut = idOf(s, "p1", "battlefield", DION);
      expect(chars(s, bahamut).name).toBe("Bahamut, Warden of Light");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(counters(s, bahamut)).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
      const forest = idOf(s, "p2", "battlefield", "Forest");
      s = play(s, answering(true, [forest]), (x) => !x.battlefield.includes(bahamut) && x.stack.length === 0);
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", DION)).name).not.toBe("Bahamut, Warden of Light");
    });

    it("Edgar, King of Figaro : à l'arrivée, une carte par artefact que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Buster Sword", "Aettir and Priwen", ...lands("Island", 6)], hand: ["Edgar, King of Figaro"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      s = resolve(cast(s, "p1", "Edgar, King of Figaro"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Firion, Wild Rose Warrior : vos créatures équipées ont la célérité ; un Équipement non-jeton arrive : une copie (Équiper {2} de moins), sacrifiée au prochain entretien", () => {
      let s = scenario({
        p1: {
          battlefield: ["Firion, Wild Rose Warrior", { name: "Bear Cub", sick: true }, ...lands("Mountain", 3)],
          hand: ["Buster Sword"],
        },
      });
      s = resolve(cast(s, "p1", "Buster Sword"));
      const swords = idsOf(s, "p1", "battlefield", "Buster Sword");
      expect(swords).toHaveLength(2);
      const token = swords.find((id) => s.objects[id]?.isToken) as string;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).not.toContain("haste");
      // Équiper {2} - {2} : gratuit.
      s = resolve(activate(s, "p1", token, "Équiper", { targets: { t: [bear] } }));
      expect(s.objects[token]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("haste");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "draw",
      );
      expect(idsOf(s, "p1", "battlefield", "Buster Sword")).toHaveLength(1);
    });

    it("From Father to Son : cherche un Véhicule pour la main ; lancée depuis le cimetière, il arrive sur le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["From Father to Son"], library: ["Forest", "The Regalia", "Forest"] },
      });
      s = resolve(cast(s, "p1", "From Father to Son"), (req, _p, cur) => pickNamed(cur, req, "The Regalia"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["The Regalia"]);
      let t = scenario({
        p1: { battlefield: lands("Plains", 7), graveyard: ["From Father to Son"], library: ["Forest", "The Regalia"] },
      });
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "From Father to Son") }), (req, _p, cur) =>
        pickNamed(cur, req, "The Regalia"),
      );
      expect(idsOf(t, "p1", "battlefield", "The Regalia")).toHaveLength(1);
      expect(exiled(t, "From Father to Son")).toHaveLength(1);
    });

    it("Genji Glove : double initiative ; au premier combat, la créature équipée se dégage et une phase de combat s'ajoute", () => {
      let s = scenario({ p1: { battlefield: ["Genji Glove", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Genji Glove")]!.attachedTo = bear;
      bump(s);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = attack(s, [bear]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && (x.players.p2?.life ?? 20) < 20),
      );
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(life(s, "p2")).toBe(16);
      expect(s.objects[bear]?.tapped).toBe(false);
      // Second combat : pas de troisième.
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" || x.pending?.kind === "declareAttackers",
      );
      expect(s.turn.step).toBe("main2");
      expect(life(s, "p2")).toBe(12);
    });

    it("Gilgamesh, Master-at-Arms : les Équipements parmi les six du dessus arrivent en jeu ; l'un peut s'attacher à un Samouraï", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 6),
          hand: ["Gilgamesh, Master-at-Arms"],
          library: ["Buster Sword", "Forest", "Genji Glove", "Opt", "Forest", "Forest", "Aettir and Priwen"],
        },
      });
      let sword = "";
      s = resolve(cast(s, "p1", "Gilgamesh, Master-at-Arms"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        const named = pickNamed(cur, req, "Buster Sword");
        if (named?.length) sword = named[0] as string;
        return req.type === "pick" && req.max > 1 ? req.options : named?.length ? named : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Buster Sword")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Genji Glove")).toHaveLength(1);
      // Le septième (Aettir and Priwen) n'était pas regardé.
      expect(idsOf(s, "p1", "battlefield", "Aettir and Priwen")).toHaveLength(0);
      const gil = idOf(s, "p1", "battlefield", "Gilgamesh, Master-at-Arms");
      const attached = s.battlefield.filter((id) => s.objects[id]?.attachedTo === gil);
      expect(attached).toHaveLength(1);
      expect(sword).not.toBe("");
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Aettir and Priwen");
    });
  });

  describe("rares (2)", () => {
    const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });

    it("Golbez, Crystal Collector : surveillance 1 à l'arrivée d'un de vos artefacts", () => {
      let s = scenario({ p1: { battlefield: ["Golbez, Crystal Collector"], hand: [trinket], library: ["Forest", "Opt"] } });
      const top = s.players.p1?.library[0] as string;
      let asked = false;
      s = resolve(cast(s, "p1", "Babiole"), (req) => {
        if (req.type === "pick" && req.options.includes(top)) {
          asked = true;
          return [top];
        }
        return undefined;
      });
      expect(asked).toBe(true);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Golbez : à votre étape de fin, avec quatre artefacts une créature revient en main ; avec huit, chaque adversaire perd sa force ; avec trois, rien", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Golbez, Crystal Collector", ...Array(n).fill(trinket)], graveyard: ["Shivan Dragon"] },
        });
        return play(
          s,
          () => undefined,
          (x) => x.turn.active === "p2",
        );
      };
      const four = run(4);
      expect(idsOf(four, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(life(four, "p2")).toBe(20);
      const eight = run(8);
      expect(idsOf(eight, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(life(eight, "p2")).toBe(15);
      expect(idsOf(run(3), "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hope Estheim : à votre étape de fin, chaque adversaire meule autant de cartes que vous avez gagné de PV ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Hope Estheim"] } });
      const hope = idOf(s, "p1", "battlefield", "Hope Estheim");
      expect(chars(s, hope).keywords).toContain("lifelink");
      s = attack(s, [hope]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(s.players.p2?.graveyard).toHaveLength(2);
      const t = play(
        scenario({ p1: { battlefield: ["Hope Estheim"] } }),
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(t.players.p2?.graveyard).toHaveLength(0);
    });

    it("Ishgard / Faith & Grief : jusqu'à deux cartes d'artefact ou d'enchantement du cimetière en main, puis le terrain (engagé) depuis l'exil", () => {
      const ISHGARD = "Ishgard, the Holy See // Faith & Grief";
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: [ISHGARD], graveyard: ["Buster Sword", charm, "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", ISHGARD);
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.face === 1);
      const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
      expect(legal).toHaveLength(2);
      expect(legal).not.toContain(idOf(s, "p1", "graveyard", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "cast", card, face: 1, targets: { t: legal } }));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Buster Sword", "Charme"]);
      const town = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
      s = act(s, "p1", { type: "playLand", card: town });
      expect(s.objects[idOf(s, "p1", "battlefield", ISHGARD)]?.tapped).toBe(true);
    });

    it("Jecht, Reluctant Guardian : menace ; blessures de combat à un joueur : vous pouvez le transformer en Braska's Final Aeon (I : défausse adverse, vous piochez)", () => {
      const JECHT = "Jecht, Reluctant Guardian // Braska's Final Aeon";
      let s = scenario({ p1: { battlefield: [JECHT] }, p2: { hand: ["Opt"] } });
      const jecht = idOf(s, "p1", "battlefield", JECHT);
      expect(chars(s, jecht).keywords).toContain("menace");
      s = resolve(throughCombat(attack(s, [jecht]), answering(true)));
      const aeon = idOf(s, "p1", "battlefield", JECHT);
      expect(chars(s, aeon).name).toBe("Braska's Final Aeon");
      expect(life(s, "p2")).toBe(16);
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(hand(s, "p1")).toBe(1);
      // Refusé : il reste Jecht.
      let t = scenario({ p1: { battlefield: [JECHT] } });
      t = resolve(throughCombat(attack(t, [idOf(t, "p1", "battlefield", JECHT)]), answering(false)));
      expect(chars(t, idOf(t, "p1", "battlefield", JECHT)).name).not.toBe("Braska's Final Aeon");
    });

    it("Braska's Final Aeon : III chaque adversaire sacrifie deux créatures", () => {
      const JECHT = "Jecht, Reluctant Guardian // Braska's Final Aeon";
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JECHT, counters: { lore: 2 } }] },
        p2: { battlefield: lands("Bear Cub", 3) },
      });
      flip(s, idOf(s, "p1", "battlefield", JECHT));
      s = toMain(s, "p1");
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", JECHT)).toHaveLength(1);
    });

    it("Jenova, Ancient Calamity : au combat, autant de marqueurs que sa force sur une autre créature, qui devient un Mutant ; un Mutant meurt pendant votre tour : piochez sa force", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Jenova, Ancient Calamity", counters: { "+1/+1": 2 } }, "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = play(s, answering(true, [bear]), (x) => x.pending?.kind === "declareAttackers");
      expect(counters(s, bear)).toBe(3);
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Mutant"]));
      destroy(s, bear);
      s = resolve(act(s, "p1", { type: "declareAttackers", attackers: [] }));
      expect(hand(s, "p1")).toBe(5);
      // Pendant le tour adverse : rien.
      const mutant = customCard({ name: "Mutant", subtypes: ["Mutant"], power: 3, toughness: 3 });
      let u = scenario({ active: "p2", p1: { battlefield: ["Jenova, Ancient Calamity", mutant] } });
      destroy(u, idOf(u, "p1", "battlefield", "Mutant"));
      u = resolve(act(u, "p2", { type: "pass" }));
      expect(hand(u, "p1")).toBe(0);
    });

    it("Joshua, Phoenix's Dominant : défaussez jusqu'à deux cartes, piochez-en autant", () => {
      const JOSHUA = "Joshua, Phoenix's Dominant // Phoenix, Warden of Fire";
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains", "Plains"], hand: [JOSHUA, "Opt", "Forest", "Bear Cub"] } });
      const two = [idOf(s, "p1", "hand", "Opt"), idOf(s, "p1", "hand", "Forest")];
      s = resolve(cast(s, "p1", JOSHUA), answering(true, two));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      expect(hand(s, "p1")).toBe(3);
    });

    it("Phoenix, Warden of Fire : I et II infligent 2 blessures à chaque adversaire (lien de vie) ; III ramène des créatures de VM totale 6 au plus, puis revient sur son recto", () => {
      const JOSHUA = "Joshua, Phoenix's Dominant // Phoenix, Warden of Fire";
      let s = scenario({ p1: { battlefield: [JOSHUA, ...lands("Mountain", 3), "Plains", "Plains"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", JOSHUA)));
      const phoenix = idOf(s, "p1", "battlefield", JOSHUA);
      expect(chars(s, phoenix).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(22);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JOSHUA, counters: { lore: 2 } }], graveyard: ["Shivan Dragon", "Bear Cub"] },
      });
      flip(t, idOf(t, "p1", "battlefield", JOSHUA));
      const dragon = idOf(t, "p1", "graveyard", "Shivan Dragon");
      const bear = idOf(t, "p1", "graveyard", "Bear Cub");
      let offered: number | undefined;
      t = toMain(t, "p1", (req) => {
        if (req.type === "pick" && req.options.includes(dragon)) {
          offered = req.max;
          return [dragon];
        }
        return undefined;
      });
      expect(offered).toBeGreaterThanOrEqual(1);
      expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toEqual([bear]);
      expect(chars(t, idOf(t, "p1", "battlefield", JOSHUA)).name).not.toBe("Phoenix, Warden of Fire");
      // Les deux ensemble (VM 8) : refusé.
      let u = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JOSHUA, counters: { lore: 2 } }], graveyard: ["Shivan Dragon", "Bear Cub"] },
      });
      flip(u, idOf(u, "p1", "battlefield", JOSHUA));
      const both = [...(u.players.p1?.graveyard ?? [])];
      let refused = false;
      u = toMain(u, "p1", (req, player, cur) => {
        if (req.type === "pick" && both.every((id) => req.options.includes(id)) && !refused) {
          refused = true;
          expect(() => act(cur, player, { type: "choose", values: both })).toThrow();
          return [both[1] as string];
        }
        return undefined;
      });
      expect(refused).toBe(true);
    });

    it("Judgment Bolt : 5 blessures à la créature ciblée et X à son contrôleur, X étant le nombre de vos Équipements", () => {
      let s = scenario({
        p1: { battlefield: ["Buster Sword", "Genji Glove", ...lands("Mountain", 4)], hand: ["Judgment Bolt"] },
        p2: { battlefield: ["Shivan Dragon", "Buster Sword"] },
      });
      s = resolve(cast(s, "p1", "Judgment Bolt", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(life(s, "p2")).toBe(18);
    });

    it("Jumbo Cactuar : en attaquant, +9999/+0", () => {
      let s = scenario({ p1: { battlefield: ["Jumbo Cactuar"] } });
      const cactuar = idOf(s, "p1", "battlefield", "Jumbo Cactuar");
      s = resolve(attack(s, [cactuar]));
      expect(pt(s, cactuar)).toEqual([10000, 7]);
    });

    it("Kain, Traitorous Dragoon : vole pendant votre tour ; blessures de combat à un joueur : il prend Kain, vous piochez, créez des Trésors engagés et perdez autant", () => {
      let s = scenario({ p1: { battlefield: ["Kain, Traitorous Dragoon"] } });
      const kain = idOf(s, "p1", "battlefield", "Kain, Traitorous Dragoon");
      expect(chars(s, kain).keywords).toContain("flying");
      s = throughCombat(attack(s, [kain]));
      expect(s.objects[kain]?.controller).toBe("p2");
      expect(hand(s, "p1")).toBe(2);
      const treasures = idsOf(s, "p1", "battlefield", "Treasure");
      expect(treasures).toHaveLength(2);
      expect(treasures.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(life(s, "p1")).toBe(18);
      // Chez son nouveau contrôleur, pendant votre tour : pas de vol.
      expect(chars(s, kain).keywords).not.toContain("flying");
    });

    it("Lightning, Security Sergeant : blessures de combat à un joueur : la carte du dessus est exilée et jouable tant que vous la contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Lightning, Security Sergeant"], library: ["Forest", "Opt"] } });
      const light = idOf(s, "p1", "battlefield", "Lightning, Security Sergeant");
      expect(chars(s, light).keywords).toContain("menace");
      s = throughCombat(attack(s, [light]));
      const forest = exiled(s, "Forest")[0] as string;
      expect(forest).toBeDefined();
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      destroy(s, light);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
      // Lightning sortie puis revenue est un nouvel objet : la permission ne revient pas (PLAN-D, D8).
      let t = scenario({ p1: { battlefield: ["Lightning, Security Sergeant"], library: ["Forest", "Opt"] } });
      t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Lightning, Security Sergeant")]));
      const card = exiled(t, "Forest")[0] as string;
      expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(true);
      const away = moveObject(t, idOf(t, "p1", "battlefield", "Lightning, Security Sergeant"), "exile") as string;
      moveObject(t, away, "battlefield");
      expect(idsOf(t, "p1", "battlefield", "Lightning, Security Sergeant")).toHaveLength(1);
      expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(false);
    });

    it("Machinist's Arsenal : la créature équipée est un Artificier et gagne +2/+2 par artefact que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Machinist's Arsenal"] } });
      s = resolve(cast(s, "p1", "Machinist's Arsenal"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(chars(s, hero).subtypes).toContain("Artificer");
      expect(pt(s, hero)).toEqual([3, 3]);
      const t = scenario({ p1: { battlefield: ["Machinist's Arsenal", "Bear Cub", trinket] }, p2: { battlefield: [trinket] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t.objects[idOf(t, "p1", "battlefield", "Machinist's Arsenal")]!.attachedTo = bear;
      bump(t);
      expect(pt(t, bear)).toEqual([6, 6]);
    });

    it("Magitek Scythe : à l'arrivée, vous pouvez l'attacher : initiative et doit être bloquée ce tour-ci ; +2/+1", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Magitek Scythe"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Magitek Scythe"), answering(true, [bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Magitek Scythe")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Magitek Scythe"] } });
      t = resolve(cast(t, "p1", "Magitek Scythe"), answering(false));
      expect(t.objects[idOf(t, "p1", "battlefield", "Magitek Scythe")]?.attachedTo).toBeFalsy();
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("firstStrike");
    });

    it("Matoya, Archon Elder : vous piochez une carte chaque fois que vous regardez (regard ou surveillance)", () => {
      let s = scenario({ p1: { battlefield: ["Matoya, Archon Elder", "Island"], hand: ["Opt"] } });
      s = resolve(cast(s, "p1", "Opt"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Memories Returning : trois des cinq cartes du dessus en main, deux dessous ; flashback {7}{U}{U}", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 4),
          hand: ["Memories Returning"],
          library: ["Opt", "Bear Cub", "Forest", "Shivan Dragon", "Serra Angel", "Island"],
        },
      });
      s = resolve(cast(s, "p1", "Memories Returning"));
      expect(hand(s, "p1")).toBe(3);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Island");
      const t = scenario({ p1: { battlefield: lands("Island", 9), graveyard: ["Memories Returning"] } });
      expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Memories Returning"))).toBe(true);
    });

    it("Midgar / Reactor Raid : vous pouvez sacrifier un artefact ou une créature pour piocher deux cartes ; le terrain arrive engagé", () => {
      const MIDGAR = "Midgar, City of Mako // Reactor Raid";
      const run = (yes: boolean) => {
        const s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: [MIDGAR] } });
        return resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", MIDGAR), face: 1 }), (req, p, cur) =>
          yes
            ? pickNamed(cur, req, "Bear Cub")?.length
              ? pickNamed(cur, req, "Bear Cub")
              : answering(true)(req, p, cur)
            : answering(false)(req, p, cur),
        );
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(hand(yes, "p1")).toBe(2);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(hand(no, "p1")).toBe(0);
      const town = no.exile.find((id) => no.objects[id]?.onAdventure) as string;
      const land = act(no, "p1", { type: "playLand", card: town });
      expect(land.objects[idOf(land, "p1", "battlefield", MIDGAR)]?.tapped).toBe(true);
    });

    it("Minwu, White Mage : vigilance, lien de vie ; chaque gain de PV met un marqueur sur chacun de vos Clercs", () => {
      const cleric = customCard({ name: "Clerc", subtypes: ["Human", "Cleric"], power: 1, toughness: 1 });
      let s = scenario({ p1: { battlefield: ["Minwu, White Mage", cleric, "Bear Cub"] } });
      const minwu = idOf(s, "p1", "battlefield", "Minwu, White Mage");
      expect(chars(s, minwu).keywords).toEqual(expect.arrayContaining(["vigilance", "lifelink"]));
      s = throughCombat(attack(s, [minwu]));
      expect(life(s, "p1")).toBe(23);
      expect(counters(s, minwu)).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Clerc"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Moogles' Valor : un Moogle 1/2 avec lien de vie par créature que vous contrôlez, puis vos créatures deviennent indestructibles", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Moogles' Valor"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Moogles' Valor"));
      const moogles = idsOf(s, "p1", "battlefield", "Moogle");
      expect(moogles).toHaveLength(2);
      expect(pt(s, moogles[0] as string)).toEqual([1, 2]);
      expect(chars(s, moogles[0] as string).keywords).toEqual(expect.arrayContaining(["lifelink", "indestructible"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
    });
  });

  describe("rares (3)", () => {
    it("Ninja's Blades : +1/+1, Ninja ; blessures de combat à un joueur : piochez, défaussez, il perd la VM de la carte défaussée", () => {
      let s = scenario({ p1: { battlefield: ["Ninja's Blades", "Bear Cub"], hand: ["Shivan Dragon"], library: ["Forest"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Ninja's Blades")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).subtypes).toContain("Ninja");
      const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
      s = throughCombat(attack(s, [bear]), answering(true, [dragon]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(life(s, "p2")).toBe(11);
    });

    it("Noctis, Prince of Lucis : lien de vie ; vos sorts d'artefact se lancent depuis le cimetière pour 3 PV de plus, avec un marqueur de finalité", () => {
      let s = scenario({
        p1: { battlefield: ["Noctis, Prince of Lucis", ...lands("Plains", 3)], graveyard: ["Buster Sword", "Bear Cub"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Noctis, Prince of Lucis")).keywords).toContain("lifelink");
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Bear Cub"))).toBe(false);
      const sword = idOf(s, "p1", "graveyard", "Buster Sword");
      expect(castable(s, "p1", sword)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: sword }));
      expect(life(s, "p1")).toBe(17);
      expect(counters(s, idOf(s, "p1", "battlefield", "Buster Sword"), "finality")).toBe(1);
    });

    it("Raubahn, Bull of Ala Mhigo : en attaquant, attache un de vos Équipements à une créature attaquante ciblée ; garde : payez des PV égaux à sa force", () => {
      let s = scenario({ p1: { battlefield: ["Raubahn, Bull of Ala Mhigo", "Bear Cub", "Buster Sword"] } });
      const raubahn = idOf(s, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      s = resolve(attack(s, [raubahn, bear]), (req) =>
        req.type === "pick"
          ? req.options.includes(sword)
            ? [sword]
            : req.options.includes(bear)
              ? [bear]
              : undefined
          : undefined,
      );
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      // Garde : l'adversaire refuse de payer 2 PV, son sort est contrecarré.
      const ward = (pay: boolean) => {
        let t = scenario({
          active: "p2",
          p1: { battlefield: ["Raubahn, Bull of Ala Mhigo"] },
          p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
        });
        const r = idOf(t, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo");
        t = resolve(cast(t, "p2", "Burst Lightning", { targets: { t: [r] } }), answering(pay));
        return t;
      };
      const no = ward(false);
      expect(idsOf(no, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo")).toHaveLength(1);
      expect(life(no, "p2")).toBe(20);
      const yes = ward(true);
      expect(idsOf(yes, "p1", "graveyard", "Raubahn, Bull of Ala Mhigo")).toHaveLength(1);
      expect(life(yes, "p2")).toBe(18);
    });

    it("Rosa, Resolute White Mage : portée ; au début de votre combat, un marqueur +1/+1 et le lien de vie à une de vos créatures", () => {
      let s = scenario({ p1: { battlefield: ["Rosa, Resolute White Mage", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Rosa, Resolute White Mage")).keywords).toContain("reach");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let offered: string[] = [];
      s = play(
        s,
        (req) => {
          if (req.type === "pick" && req.options.includes(bear)) {
            offered = req.options;
            return [bear];
          }
          return undefined;
        },
        (x) => x.pending?.kind === "declareAttackers",
      );
      expect(offered).not.toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
    });

    it("Sazh Katzroy : cherche un Oiseau ou un terrain de base ; en attaquant, un marqueur sur une créature ciblée puis double ses marqueurs", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Sazh Katzroy"], library: ["Bear Cub", "Healer's Hawk", "Forest"] },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Sazh Katzroy"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Healer's Hawk");
      });
      expect(offered.sort()).toEqual(["Forest", "Healer's Hawk"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Healer's Hawk"]);
      let t = scenario({ p1: { battlefield: ["Sazh Katzroy", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Sazh Katzroy")]), answering(true, [bear]));
      expect(counters(t, bear)).toBe(4);
    });

    it("Seifer Almasy : une créature qui attaque seule a la double initiative ; ses blessures à un joueur font lancer gratuitement un éphémère ou rituel de VM 3 ou moins du cimetière, exilé ensuite", () => {
      let s = scenario({ p1: { battlefield: ["Seifer Almasy"], graveyard: ["Burst Lightning", "Shivan Dragon"] } });
      const seifer = idOf(s, "p1", "battlefield", "Seifer Almasy");
      s = resolve(attack(s, [seifer]));
      expect(chars(s, seifer).keywords).toContain("doubleStrike");
      s = untilCastNow(s);
      const burst = idOf(s, "p1", "graveyard", "Burst Lightning");
      expect(castNowOf(s)?.cards).toEqual([burst]);
      s = resolve(act(s, "p1", { type: "cast", card: burst, targets: { t: ["p2"] } }));
      s = throughCombat(s);
      expect(life(s, "p2")).toBe(12);
      expect(exiled(s, "Burst Lightning")).toHaveLength(1);
      // Deux attaquants : pas de double initiative.
      let t = scenario({ p1: { battlefield: ["Seifer Almasy", "Bear Cub"] } });
      const s2 = idOf(t, "p1", "battlefield", "Seifer Almasy");
      t = resolve(attack(t, [s2, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(chars(t, s2).keywords).not.toContain("doubleStrike");
    });

    it("Serah Farron : le premier sort de créature légendaire du tour coûte {2} de moins ; au combat, avec deux autres légendaires, elle peut devenir Crystallized Serah (+2/+2 aux légendaires)", () => {
      const SERAH = "Serah Farron // Crystallized Serah";
      let s = scenario({ p1: { battlefield: [SERAH, "Plains", "Plains"], hand: ["Aerith Gainsborough", "Minwu, White Mage"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Aerith Gainsborough"))).toBe(true);
      s = resolve(cast(s, "p1", "Aerith Gainsborough"));
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
      // Le deuxième ({3}{W}{W} → pas de réduction) ne se lance pas avec une Plaine.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Minwu, White Mage"))).toBe(false);
      const legend = (n: number) =>
        customCard({ name: `Légende ${n}`, supertypes: ["Legendary"], typeLine: "Legendary Creature", power: 1, toughness: 1 });
      let t = scenario({ p1: { battlefield: [SERAH, legend(1), legend(2), "Bear Cub"] } });
      const serah = idOf(t, "p1", "battlefield", SERAH);
      t = play(t, answering(true), (x) => x.pending?.kind === "declareAttackers");
      expect(chars(t, serah).name).toBe("Crystallized Serah");
      expect(chars(t, serah).types).toEqual(["Artifact"]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Légende 1"))).toEqual([3, 3]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      // Une seule autre légendaire : pas de transformation.
      let u = scenario({ p1: { battlefield: [SERAH, legend(1)] } });
      u = play(u, answering(true), (x) => x.pending?.kind === "declareAttackers");
      expect(chars(u, idOf(u, "p1", "battlefield", SERAH)).name).not.toBe("Crystallized Serah");
    });

    it("Seymour Flux : à votre entretien, vous pouvez payer 1 PV pour piocher et mettre un marqueur sur lui", () => {
      const run = (yes: boolean) => {
        const s = scenario({ active: "p2", turn: 4, p1: { battlefield: ["Seymour Flux"] } });
        return toMain(s, "p1", answering(yes));
      };
      const yes = run(true);
      expect(life(yes, "p1")).toBe(19);
      expect(hand(yes, "p1")).toBe(2);
      expect(counters(yes, idOf(yes, "p1", "battlefield", "Seymour Flux"))).toBe(1);
      const no = run(false);
      expect(life(no, "p1")).toBe(20);
      expect(hand(no, "p1")).toBe(1);
    });

    it("Sin, Spira's Punishment : une carte de permanent de votre cimetière exilée au hasard devient un jeton engagé ; un terrain fait recommencer", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", "Island", ...lands("Forest", 5)],
          hand: ["Sin, Spira's Punishment"],
          graveyard: ["Bear Cub", "Opt"],
        },
      });
      s = resolve(cast(s, "p1", "Sin, Spira's Punishment"));
      const token = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[token]?.isToken).toBe(true);
      expect(s.objects[token]?.tapped).toBe(true);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sin, Spira's Punishment"], graveyard: ["Plains", "Mountain"] } });
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Sin, Spira's Punishment")]));
      expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Mountain")).toHaveLength(1);
      expect(t.players.p1?.graveyard).toHaveLength(0);
    });

    it("Squall, SeeD Mercenary : attaque seule : double initiative ; blessures à un joueur : une carte de permanent de VM 3 ou moins revient du cimetière", () => {
      let s = scenario({ p1: { battlefield: ["Squall, SeeD Mercenary"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const squall = idOf(s, "p1", "battlefield", "Squall, SeeD Mercenary");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      let offered: string[] = [];
      s = throughCombat(attack(s, [squall]), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) {
          offered = req.options;
          return [bear];
        }
        return undefined;
      });
      expect(offered).not.toContain(idOf(s, "p1", "graveyard", "Shivan Dragon"));
      expect(life(s, "p2")).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Summon: Brynhildr : I exile la carte du dessus, jouable pendant chaque tour où la Saga reçoit un marqueur ; II : votre prochain sort de créature du tour a la célérité", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Mountain", "Mountain", "Forest", "Forest"],
          hand: ["Summon: Brynhildr", "Bear Cub"],
          library: ["Burst Lightning", "Forest", "Forest", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Summon: Brynhildr"));
      const burst = exiled(s, "Burst Lightning")[0] as string;
      expect(castable(s, "p1", burst)).toBe(true);
      // Tour adverse : pas de marqueur, pas jouable.
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "main1",
      );
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", burst)).toBe(false);
      // Votre tour suivant (chapitre II) : de nouveau jouable ; le Bébé ours lancé a la célérité.
      s = toMain(s, "p1");
      expect(castable(s, "p1", burst)).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    });

    it("Summon: G.F. Cerberus : II copie votre prochain éphémère ou rituel du tour, III le copie deux fois", () => {
      const run = (lore: number) => {
        let s = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: [{ name: "Summon: G.F. Cerberus", counters: { lore } }, "Mountain"], hand: ["Burst Lightning"] },
        });
        s = toMain(s, "p1");
        return resolve(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      };
      expect(life(run(1), "p2")).toBe(16);
      expect(life(run(2), "p2")).toBe(14);
    });

    it("Summon: Leviathan : I renvoie en main chaque créature qui n'est ni Kraken, Léviathan, Ondin, Poulpe ni Serpent ; garde {2}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Summon: Leviathan"] },
        p2: { battlefield: ["Serra Angel", "Summon: Leviathan"] },
      });
      s = resolve(cast(s, "p1", "Summon: Leviathan"));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Summon: Leviathan")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Summon: Leviathan")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Leviathan")).keywords).toContain("ward");
    });

    it("Summon: Leviathan : II jusqu'à la fin du tour, chaque créature marine qui attaque fait piocher", () => {
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Leviathan", counters: { lore: 1 } }, "Bear Cub"] },
      });
      s = toMain(s, "p1");
      const before = hand(s, "p1");
      const lev = idOf(s, "p1", "battlefield", "Summon: Leviathan");
      s = resolve(attack(s, [lev, idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(hand(s, "p1")).toBe(before + 1);
    });

    it("Summon: Primal Odin : I détruit une créature adverse ; II : ses blessures de combat font perdre la partie ; III : piochez deux cartes, chaque joueur perd 2 PV", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Summon: Primal Odin"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Summon: Primal Odin"), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({ active: "p2", turn: 4, p1: { battlefield: [{ name: "Summon: Primal Odin", counters: { lore: 1 } }] } });
      t = toMain(t, "p1");
      t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Summon: Primal Odin")]));
      expect(t.over).toBeTruthy();
      expect(t.players.p2?.lost).toBe(true);
      let u = scenario({ active: "p2", turn: 4, p1: { battlefield: [{ name: "Summon: Primal Odin", counters: { lore: 2 } }] } });
      u = toMain(u, "p1");
      expect(hand(u, "p1")).toBe(3);
      expect(life(u, "p1")).toBe(18);
      expect(life(u, "p2")).toBe(18);
    });

    it("Summon: Titan : I meule cinq cartes ; II les terrains du cimetière reviennent engagés ; III une autre créature gagne +X/+X (X = vos terrains) et le piétinement", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Summon: Titan"] } });
      s = resolve(cast(s, "p1", "Summon: Titan"));
      expect(s.players.p1?.graveyard).toHaveLength(5);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Titan")).keywords).toEqual(
        expect.arrayContaining(["reach", "trample"]),
      );
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Titan", counters: { lore: 1 } }], graveyard: ["Island", "Plains", "Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(t.objects[idOf(t, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      let u = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Titan", counters: { lore: 2 } }, "Bear Cub", ...lands("Forest", 3)] },
      });
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      u = toMain(u, "p1", answering(true, [bear]));
      expect(pt(u, bear)).toEqual([5, 5]);
      expect(chars(u, bear).keywords).toContain("trample");
    });

    it("Summoner's Grimoire : la créature équipée est un Chaman ; en attaquant, une créature de votre main arrive en jeu (une créature-enchantement, engagée et attaquante)", () => {
      const setup = (card: string) => {
        const s = scenario({ p1: { battlefield: ["Summoner's Grimoire", "Bear Cub"], hand: [card] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s.objects[idOf(s, "p1", "battlefield", "Summoner's Grimoire")]!.attachedTo = bear;
        bump(s);
        return { s, bear };
      };
      const a = setup("Shivan Dragon");
      expect(chars(a.s, a.bear).subtypes).toContain("Shaman");
      const s = resolve(attack(a.s, [a.bear]), (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(s.combat?.attackers.some((x) => x.id === dragon)).toBe(false);
      const b = setup("Summon: Shiva");
      const t = resolve(attack(b.s, [b.bear]), (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      const shiva = idOf(t, "p1", "battlefield", "Summon: Shiva");
      expect(t.objects[shiva]?.tapped).toBe(true);
      expect(t.combat?.attackers.some((x) => x.id === shiva)).toBe(true);
      // Un seul choix parmi toutes les cartes de créature de la main (enchantements compris), et facultatif.
      const both = (pick: (options: string[], s: S) => string[]) => {
        const c = scenario({
          p1: { battlefield: ["Summoner's Grimoire", "Bear Cub"], hand: ["Shivan Dragon", "Summon: Shiva"] },
        });
        const bear = idOf(c, "p1", "battlefield", "Bear Cub");
        c.objects[idOf(c, "p1", "battlefield", "Summoner's Grimoire")]!.attachedTo = bear;
        bump(c);
        const asked: string[][] = [];
        const end = resolve(attack(c, [bear]), (req, _p, cur) => {
          if (req.type !== "pick") return undefined;
          asked.push(req.options.map(String));
          return pick(req.options.map(String), cur);
        });
        return { end, asked };
      };
      const shivaFirst = both((options, cur) => options.filter((id) => nameOf(cur, id) === "Summon: Shiva"));
      expect(shivaFirst.asked).toHaveLength(1);
      expect(shivaFirst.asked[0]).toHaveLength(2);
      expect(idsOf(shivaFirst.end, "p1", "battlefield", "Summon: Shiva")).toHaveLength(1);
      expect(idsOf(shivaFirst.end, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      const none = both(() => []);
      expect(none.end.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("rares (4)", () => {
    const sorcery = (n: number) =>
      customCard({
        name: `Rituel à ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });
    const tapMana = (s: S, source: string, color: string) => {
      const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === source);
      return act(s, "p1", { type: "tapForMana", source, ability: opt?.type === "tapForMana" ? opt.ability : 0, color } as never);
    };

    it("Tellah, Great Sage : un Héros par sort non-créature ; quatre mana dépensés : piochez deux cartes ; huit : sacrifiez-le, il inflige autant de blessures à chaque adversaire", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Island", n)], hand: [sorcery(n)] } });
        return resolve(cast(s, "p1", `Rituel à ${n}`));
      };
      const one = run(1);
      expect(idsOf(one, "p1", "battlefield", "Hero")).toHaveLength(1);
      expect(hand(one, "p1")).toBe(0);
      const four = run(4);
      expect(idsOf(four, "p1", "battlefield", "Hero")).toHaveLength(1);
      expect(hand(four, "p1")).toBe(2);
      expect(idsOf(four, "p1", "battlefield", "Tellah, Great Sage")).toHaveLength(1);
      const eight = run(8);
      expect(hand(eight, "p1")).toBe(2);
      expect(idsOf(eight, "p1", "graveyard", "Tellah, Great Sage")).toHaveLength(1);
      expect(life(eight, "p2")).toBe(12);
      // Une seule capacité déclenchée (et non trois) au-dessus du sort.
      const cast8 = cast(
        scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Island", 8)], hand: [sorcery(8)] } }),
        "p1",
        "Rituel à 8",
      );
      const pending = passAccepting(cast8, (x) => x.triggers.length === 0 && x.pending?.kind === "priority");
      expect(pending.stack.filter((i) => i.kind === "ability")).toHaveLength(1);
      // Un sort de créature : rien.
      const c = resolve(
        cast(
          scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Forest", 2)], hand: ["Bear Cub"] } }),
          "p1",
          "Bear Cub",
        ),
      );
      expect(idsOf(c, "p1", "battlefield", "Hero")).toHaveLength(0);
    });

    it("The Earth Crystal : sorts verts à {1} de moins ; les marqueurs +1/+1 mis sur vos créatures sont doublés ; {4}{G}{G}, {T} : répartissez deux marqueurs", () => {
      let s = scenario({ p1: { battlefield: ["The Earth Crystal", "Sazh's Chocobo", "Forest"], hand: ["Bear Cub", "Forest"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Sazh's Chocobo"))).toBe(2);
      let t = scenario({
        p1: { battlefield: ["The Earth Crystal", "Bear Cub", ...lands("Forest", 6)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "The Earth Crystal"), "Répartissez", { targets: { t: [bear] } }),
      );
      expect(counters(t, bear)).toBe(4);
      // Les créatures adverses : pas doublé.
      let v = scenario({
        active: "p2",
        p1: { battlefield: ["The Earth Crystal"] },
        p2: { battlefield: ["Sazh's Chocobo"], hand: ["Forest"] },
      });
      v = resolve(act(v, "p2", { type: "playLand", card: idOf(v, "p2", "hand", "Forest") }));
      expect(counters(v, idOf(v, "p2", "battlefield", "Sazh's Chocobo"))).toBe(1);
    });

    it("The Lunar Whale : vol ; après avoir attaqué ce tour-ci, vous pouvez jouer la carte du dessus de votre bibliothèque", () => {
      let s = scenario({ p1: { battlefield: ["The Lunar Whale", "Bear Cub"], library: ["Forest", "Opt"] } });
      const whale = idOf(s, "p1", "battlefield", "The Lunar Whale");
      expect(chars(s, whale).keywords).toContain("flying");
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(false);
      s = resolve(activate(s, "p1", whale, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = throughCombat(attack(s, [whale]));
      expect(life(s, "p2")).toBe(17);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
    });

    it("The Regalia : célérité ; en attaquant, révèle jusqu'à un terrain, mis en jeu engagé, le reste dessous", () => {
      let s = scenario({ p1: { battlefield: ["The Regalia", "Bear Cub"], library: ["Opt", "Bear Cub", "Island", "Forest"] } });
      const regalia = idOf(s, "p1", "battlefield", "The Regalia");
      expect(chars(s, regalia).keywords).toContain("haste");
      s = resolve(activate(s, "p1", regalia, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = resolve(attack(s, [regalia]));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Forest");
      expect(namesIn(s, s.players.p1?.library.slice(1)).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Tifa Lockhart : piétinement ; à chaque terrain qui arrive sous votre contrôle, sa force double jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Tifa Lockhart", counters: { "+1/+1": 2 } }], hand: ["Forest"] } });
      const tifa = idOf(s, "p1", "battlefield", "Tifa Lockhart");
      expect(chars(s, tifa).keywords).toContain("trample");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(pt(s, tifa)).toEqual([6, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, tifa)).toEqual([3, 4]);
    });

    it("Triple Triad : à votre entretien, chaque joueur exile sa carte du dessus ; vous jouez gratuitement la vôtre et celles de VM inférieure", () => {
      const run = (mine: string, theirs: string) => {
        const s = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: ["Triple Triad"], library: [mine, "Forest"] },
          p2: { library: [theirs, "Forest"] },
        });
        return toMain(s, "p1");
      };
      let s = run("Shivan Dragon", "Bear Cub");
      const dragon = exiled(s, "Shivan Dragon")[0] as string;
      const bear = exiled(s, "Bear Cub")[0] as string;
      expect(castable(s, "p1", dragon)).toBe(true);
      expect(castable(s, "p1", bear)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      const t = run("Bear Cub", "Shivan Dragon");
      expect(castable(t, "p1", exiled(t, "Bear Cub")[0] as string)).toBe(true);
      expect(castable(t, "p1", exiled(t, "Shivan Dragon")[0] as string)).toBe(false);
    });

    it("Ultima : détruit tous les artefacts et créatures, puis termine le tour", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Buster Sword", ...lands("Plains", 5)], hand: ["Ultima"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      s = resolve(cast(s, "p1", "Ultima"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(exiled(s, "Ultima")).toHaveLength(1);
      expect(s.turn.active).toBe("p2");
    });

    it("Ultima Weapon : +7/+7 ; quand la créature équipée attaque, détruisez une créature adverse ciblée", () => {
      let s = scenario({ p1: { battlefield: ["Ultima Weapon", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Ultima Weapon")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([9, 9]);
      s = resolve(attack(s, [bear]), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Ultima, Origin of Oblivion : en attaquant, un marqueur de fléau : le terrain perd ses types et capacités et produit {C} ; vos terrains engagés pour {C} en ajoutent un de plus", () => {
      let s = scenario({ p1: { battlefield: ["Ultima, Origin of Oblivion", "Forest"] } });
      const ultima = idOf(s, "p1", "battlefield", "Ultima, Origin of Oblivion");
      expect(chars(s, ultima).keywords).toContain("flying");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = throughCombat(attack(s, [ultima]), answering(true, [forest]));
      expect(counters(s, forest, "blight")).toBe(1);
      expect(chars(s, forest).subtypes).toEqual([]);
      const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === forest);
      expect(opt?.type === "tapForMana" && opt.colors).toEqual(["C"]);
      expect(tapMana(s, forest, "C").players.p1?.manaPool.C).toBe(2);
      // « Tant que ce terrain a un marqueur de fléau » (PLAN-D, D8) : Ultima partie, l'effet reste ; sans le marqueur, il
      // cesse.
      destroy(s, ultima);
      expect(chars(s, forest).subtypes).toEqual([]);
      const colors = (x: S) =>
        legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === forest ? a.colors : []));
      expect(colors(s)).toEqual(["C"]);
      changeCounters(s, s.objects[forest]!, "blight", -1);
      expect(chars(s, forest).subtypes).toEqual(["Forest"]);
      expect(colors(s)).toEqual(["G"]);
      const t = scenario({ p1: { battlefield: ["Ultima, Origin of Oblivion", "Capital City"] } });
      const u = tapMana(t, idOf(t, "p1", "battlefield", "Capital City"), "C");
      expect(u.players.p1?.manaPool.C).toBe(2);
    });

    it("Ultimecia, Temporal Threat : à l'arrivée, engage les créatures adverses ; une de vos créatures blesse un joueur en combat : piochez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Ultimecia, Temporal Threat"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Ultimecia, Temporal Threat"));
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Vaan, Street Thief : ses blessures de combat exilent la carte du dessus du joueur : lancez-la ou créez un Trésor ; un sort d'un autre propriétaire : marqueur sur vos Éclaireurs", () => {
      let s = scenario({ p1: { battlefield: ["Vaan, Street Thief"] }, p2: { library: ["Opt", "Forest"] } });
      const vaan = idOf(s, "p1", "battlefield", "Vaan, Street Thief");
      s = untilCastNow(attack(s, [vaan]));
      expect(castNowOf(s)?.cards).toEqual(exiled(s, "Opt"));
      s = throughCombat(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Vaan, Street Thief", "Forest", "Forest"] },
        p2: { library: ["Bear Cub", "Forest"] },
      });
      const v2 = idOf(t, "p1", "battlefield", "Vaan, Street Thief");
      t = untilCastNow(attack(t, [v2]));
      t = throughCombat(act(t, "p1", { type: "cast", card: exiled(t, "Bear Cub")[0] as string }));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
      expect(counters(t, v2)).toBe(1);
    });

    it("Venat, Heart of Hydaelyn : un sort légendaire fait piocher, une fois par tour ; {7}, {T} : exile un permanent non-terrain et se transforme", () => {
      const VENAT = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal";
      let s = scenario({
        p1: { battlefield: [VENAT, ...lands("Plains", 7)], hand: ["Aerith Gainsborough", "Rosa, Resolute White Mage"] },
      });
      s = resolve(cast(s, "p1", "Aerith Gainsborough"));
      expect(hand(s, "p1")).toBe(2);
      s = resolve(cast(s, "p1", "Rosa, Resolute White Mage"));
      expect(hand(s, "p1")).toBe(1);
      let t = scenario({ p1: { battlefield: [VENAT, ...lands("Plains", 7)] }, p2: { battlefield: ["Serra Angel", "Forest"] } });
      const venat = idOf(t, "p1", "battlefield", VENAT);
      t = resolve(activate(t, "p1", venat, "Division", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
      expect(exiled(t, "Serra Angel")).toHaveLength(1);
      expect(chars(t, venat).name).toBe("Hydaelyn, the Mothercrystal");
      expect(chars(t, venat).keywords).toContain("indestructible");
    });

    it("Hydaelyn, the Mothercrystal : au début du combat, un marqueur et l'indestructible jusqu'à votre prochain tour à une autre créature ; légendaire : piochez", () => {
      const VENAT = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal";
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: [VENAT, other] } });
        flip(s, idOf(s, "p1", "battlefield", VENAT));
        const id = idOf(s, "p1", "battlefield", other);
        s = play(s, answering(true, [id]), (x) => x.pending?.kind === "declareAttackers");
        return { s, id };
      };
      const { s, id } = run("Bear Cub");
      expect(counters(s, id)).toBe(1);
      expect(chars(s, id).keywords).toContain("indestructible");
      expect(hand(s, "p1")).toBe(0);
      const t = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(t, id).keywords).toContain("indestructible");
      const legend = run("Aerith Gainsborough");
      expect(hand(legend.s, "p1")).toBe(1);
    });

    it("Vincent Valentine : une créature adverse meurt : autant de marqueurs que sa force ; Galian Beast (piétinement, lien de vie) revient engagée sur son recto en mourant", () => {
      const VINCENT = "Vincent Valentine // Galian Beast";
      let s = scenario({ p1: { battlefield: [VINCENT] }, p2: { battlefield: ["Serra Angel"] } });
      const vincent = idOf(s, "p1", "battlefield", VINCENT);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(counters(s, vincent)).toBe(4);
      s = resolve(attack(s, [vincent]), answering(true));
      expect(chars(s, vincent).name).toBe("Galian Beast");
      expect(chars(s, vincent).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      let t = scenario({ p1: { battlefield: [VINCENT] } });
      flip(t, idOf(t, "p1", "battlefield", VINCENT));
      destroy(t, idOf(t, "p1", "battlefield", VINCENT));
      t = resolve(act(t, "p1", { type: "pass" }));
      const back = idOf(t, "p1", "battlefield", VINCENT);
      expect(t.objects[back]?.tapped).toBe(true);
      expect(chars(t, back).name).not.toBe("Galian Beast");
    });

    it("Xande, Dark Mage : menace ; +1/+1 par carte non-créature non-terrain dans votre cimetière", () => {
      const s = scenario({ p1: { battlefield: ["Xande, Dark Mage"], graveyard: ["Opt", "Buster Sword", "Bear Cub", "Forest"] } });
      const xande = idOf(s, "p1", "battlefield", "Xande, Dark Mage");
      expect(chars(s, xande).keywords).toContain("menace");
      expect(pt(s, xande)).toEqual([5, 5]);
    });

    it("Zanarkand / Lasting Fayth : un Héros 1/1 avec un marqueur +1/+1 par terrain que vous contrôlez", () => {
      const ZANARKAND = "Zanarkand, Ancient Metropolis // Lasting Fayth";
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: [ZANARKAND] } });
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ZANARKAND), face: 1 }));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([7, 7]);
      const town = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
      s = act(s, "p1", { type: "playLand", card: town });
      expect(s.objects[idOf(s, "p1", "battlefield", ZANARKAND)]?.tapped).toBe(true);
    });

    it("Zenos yae Galvus : les créatures autres que lui et la créature choisie ont -2/-2 ; quand elle part, il devient Shinryu (vol, 8/8)", () => {
      const ZENOS = "Zenos yae Galvus // Shinryu, Transcendent Rival";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: [ZENOS] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", ZENOS), answering(true, [angel]));
      const zenos = idOf(s, "p1", "battlefield", ZENOS);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(pt(s, zenos)).toEqual([4, 4]);
      destroy(s, angel);
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(chars(s, zenos).name).toBe("Shinryu, Transcendent Rival");
      expect(pt(s, zenos)).toEqual([8, 8]);
      expect(chars(s, zenos).keywords).toContain("flying");
      // La créature est choisie sans être ciblée : sans créature adverse, les autres ont quand même -2/-2.
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: [ZENOS] } });
      t = resolve(cast(t, "p1", ZENOS));
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(chars(t, idOf(t, "p1", "battlefield", ZENOS)).name).not.toBe("Shinryu, Transcendent Rival");
    });
  });

  /** Index du mode (ou de la combinaison de modes) dont le libellé est `label`. */
  const modeOf = (s: S, card: string, label: string) => {
    const mode = castModes(s, card).find((m) => m.label === label);
    if (!mode)
      throw new Error(
        `mode « ${label} » introuvable (${castModes(s, card)
          .map((m) => m.label)
          .join(" | ")})`,
      );
    return mode.index;
  };
  /** Choisit le mode `index` d'une capacité déclenchée modale. */
  const triggerMode =
    (index: number, then: Answer = () => undefined): Answer =>
    (req, p, s) =>
      req.intent === "triggerMode" && req.type === "pick" ? [String(index)] : then(req, p, s);

  it("Louisoix's Sacrifice : en coût additionnel, sacrifiez une créature légendaire ou payez {2} ; contrecarre un sort non-créature ou une capacité", () => {
    const setup = (mine: (string | { name: string })[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: mine, hand: ["Louisoix's Sacrifice"] },
        p2: { battlefield: ["Mountain", "Forest", "Forest"], hand: ["Burst Lightning", "Bear Cub"] },
      });
      s = cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } });
      return act(s, "p2", { type: "pass" });
    };
    // {U} + {2}.
    let s = setup(lands("Island", 3));
    s = resolve(cast(s, "p1", "Louisoix's Sacrifice", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(life(s, "p1")).toBe(20);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped && s.objects[id]?.controller === "p1")).toHaveLength(3);
    // {U} et une créature légendaire sacrifiée.
    let t = setup(["Island", "Aerith Gainsborough"]);
    const aerith = idOf(t, "p1", "battlefield", "Aerith Gainsborough");
    t = resolve(cast(t, "p1", "Louisoix's Sacrifice", { sacrifice: [aerith], targets: { t: [t.stack[0]?.id as string] } }));
    expect(life(t, "p1")).toBe(20);
    expect(idsOf(t, "p1", "graveyard", "Aerith Gainsborough")).toHaveLength(1);
    // Un sort de créature n'est pas une cible.
    let u = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Louisoix's Sacrifice"] },
      p2: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
    });
    u = act(cast(u, "p2", "Bear Cub"), "p2", { type: "pass" });
    expect(castable(u, "p1", idOf(u, "p1", "hand", "Louisoix's Sacrifice"))).toBe(false);
  });

  describe("peu communes (1)", () => {
    it("Al Bhed Salvagers : elle ou une autre de vos créatures ou artefacts meurt : drain 1 ; pas pour une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Al Bhed Salvagers", "Bear Cub", "Buster Sword"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const kill = (id: string) => {
        destroy(s, id);
        s = resolve(act(s, "p1", { type: "pass" }));
      };
      kill(idOf(s, "p1", "battlefield", "Bear Cub"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
      s = toMain(s, "p1");
      kill(idOf(s, "p1", "battlefield", "Buster Sword"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
      kill(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
      kill(idOf(s, "p1", "battlefield", "Al Bhed Salvagers"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
    });

    it("Ambrosia Whiteheart : flash ; à l'arrivée, vous pouvez renvoyer un autre de vos permanents (choisi à la résolution) ; terrain : +1/+0", () => {
      const run = (yes: boolean) => {
        let s = scenario({ active: "p2", p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Ambrosia Whiteheart"] } });
        s = act(s, "p2", { type: "pass" });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = cast(s, "p1", "Ambrosia Whiteheart");
        expect(s.stack[0]?.targets ?? {}).toEqual({});
        return resolve(s, answering(yes, [bear]));
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "hand", "Bear Cub")).toHaveLength(1);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      let s = scenario({ p1: { battlefield: ["Ambrosia Whiteheart"], hand: ["Plains"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Ambrosia Whiteheart"))).toEqual([3, 2]);
    });

    it("Ashe, Princess of Dalmasca : en attaquant, un artefact parmi les cinq cartes du dessus va en main, le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ashe, Princess of Dalmasca"],
          library: ["Forest", "Buster Sword", "Opt", "Forest", "Bear Cub", "Island"],
        },
      });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Ashe, Princess of Dalmasca")]), (req, _p, cur) =>
        pickNamed(cur, req, "Buster Sword"),
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Buster Sword"]);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Island");
    });

    it("Auron's Inspiration : les créatures attaquantes gagnent +2/+0 jusqu'à la fin du tour ; flashback {2}{W}{W}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Plains", 3)], hand: ["Auron's Inspiration"] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s = attack(s, [a]);
      s = resolve(cast(s, "p1", "Auron's Inspiration"));
      expect(pt(s, a)).toEqual([4, 2]);
      expect(pt(s, b)).toEqual([2, 2]);
      const t = scenario({ p1: { battlefield: lands("Plains", 4), graveyard: ["Auron's Inspiration"] } });
      expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Auron's Inspiration"))).toBe(true);
    });

    it("Barret Wallace : portée ; en attaquant, il inflige au défenseur autant de blessures que vous avez de créatures équipées", () => {
      let s = scenario({ p1: { battlefield: ["Barret Wallace", "Bear Cub", "Bear Cub", "Buster Sword", "Genji Glove"] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s.objects[idOf(s, "p1", "battlefield", "Buster Sword")]!.attachedTo = a;
      s.objects[idOf(s, "p1", "battlefield", "Genji Glove")]!.attachedTo = b;
      bump(s);
      const barret = idOf(s, "p1", "battlefield", "Barret Wallace");
      expect(chars(s, barret).keywords).toContain("reach");
      s = resolve(attack(s, [barret]));
      expect(life(s, "p2")).toBe(18);
    });

    it("Battle Menu : un des quatre modes ; « Magie » ne vise qu'une créature de force 4 ou plus", () => {
      const s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Battle Menu"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Battle Menu");
      const magic = castModes(s, card).find((m) => m.label?.startsWith("Magie"));
      expect(magic?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      const knight = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Attaque : Chevalier 2/2") }));
      expect(idsOf(knight, "p1", "battlefield", "Knight")).toHaveLength(1);
      const item = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Objet : +4 PV") }));
      expect(life(item, "p1")).toBe(24);
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const ability = resolve(
        act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Capacité : +0/+4"), targets: { t: [bear] } }),
      );
      expect(pt(ability, bear)).toEqual([2, 6]);
    });

    it("Cactuar : piétinement ; à votre étape de fin, il retourne en main s'il n'est pas arrivé ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Cactuar"] } });
      s = resolve(cast(s, "p1", "Cactuar"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Cactuar")).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Cactuar")).toHaveLength(1);
      const t = advanceUntil(scenario({ p1: { battlefield: ["Cactuar"] } }), (x) => x.turn.active === "p2");
      expect(idsOf(t, "p1", "hand", "Cactuar")).toHaveLength(1);
    });

    it("Cargo Ship : vol, vigilance ; son {C} ne sert qu'aux sorts d'artefact et aux capacités d'artefacts", () => {
      const s = scenario({ p1: { battlefield: ["Cargo Ship", "Forest", "Forest"], hand: ["Buster Sword", "Shivan Dragon"] } });
      const ship = idOf(s, "p1", "battlefield", "Cargo Ship");
      expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Buster Sword"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Cargo Ship", "Forest"], hand: ["Bear Cub"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Choco-Comet : X blessures à n'importe quelle cible, et un Oiseau 2/2 qui gagne +1/+0 à chaque terrain", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Choco-Comet", "Forest"] } });
      s = resolve(cast(s, "p1", "Choco-Comet", { x: 3, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(17);
      const bird = idOf(s, "p1", "battlefield", "Bird");
      expect(pt(s, bird)).toEqual([2, 2]);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(pt(s, bird)).toEqual([3, 2]);
    });

    it("Chocobo Racetrack : à chaque terrain qui arrive sous votre contrôle, un Oiseau 2/2", () => {
      let s = scenario({ p1: { battlefield: ["Chocobo Racetrack"], hand: ["Forest"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const birds = idsOf(s, "p1", "battlefield", "Bird");
      expect(birds).toHaveLength(1);
      expect(chars(s, birds[0] as string).colors).toEqual(["G"]);
    });

    it("Cid, Timeless Artificer : vos créatures-artefacts et Héros gagnent +1/+1 par Artificier que vous contrôlez et par carte d'Artificier dans votre cimetière", () => {
      const s = scenario({
        p1: { battlefield: ["Cid, Timeless Artificer", "Demon Wall", "Bear Cub"], graveyard: ["Al Bhed Salvagers", "Bear Cub"] },
        p2: { battlefield: ["Demon Wall"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Demon Wall"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Cid, Timeless Artificer"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Demon Wall"))).toEqual([3, 3]);
    });

    it("Circle of Power : piochez deux cartes, perdez 2 PV, un Sorcier 0/1 qui blesse les adversaires à chaque sort non-créature ; vos Sorciers +1/+0 et lien de vie", () => {
      const mage = customCard({ name: "Mage", subtypes: ["Human", "Wizard"], power: 2, toughness: 1 });
      let s = scenario({ p1: { battlefield: [mage, ...lands("Swamp", 4), "Island"], hand: ["Circle of Power", "Opt"] } });
      s = resolve(cast(s, "p1", "Circle of Power"));
      expect(hand(s, "p1")).toBe(3);
      expect(life(s, "p1")).toBe(18);
      const wizard = idOf(s, "p1", "battlefield", "Wizard");
      expect(pt(s, wizard)).toEqual([1, 1]);
      expect(chars(s, wizard).keywords).toContain("lifelink");
      expect(pt(s, idOf(s, "p1", "battlefield", "Mage"))).toEqual([3, 1]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Mage")).keywords).toContain("lifelink");
      s = resolve(cast(s, "p1", "Opt"));
      expect(life(s, "p2")).toBe(19);
      expect(life(s, "p1")).toBe(19);
    });

    it("Clash of the Eikons : un ou plusieurs modes ; combat, ou un marqueur de savoir retiré ou ajouté sur votre Saga", () => {
      let s = scenario({
        p1: {
          battlefield: ["Shivan Dragon", { name: "Summon: Shiva", counters: { lore: 1 } }, "Forest"],
          hand: ["Clash of the Eikons"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Clash of the Eikons");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const shiva = idOf(s, "p1", "battlefield", "Summon: Shiva");
      s = resolve(
        act(s, "p1", {
          type: "cast",
          card,
          mode: modeOf(s, card, "Combat + Ajoutez un marqueur de savoir"),
          targets: { a: [dragon], b: [angel], l: [shiva] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[shiva]?.counters.lore).toBe(2);
      let t = scenario({
        p1: { battlefield: [{ name: "Summon: Shiva", counters: { lore: 2 } }, "Forest"], hand: ["Clash of the Eikons"] },
      });
      const c2 = idOf(t, "p1", "hand", "Clash of the Eikons");
      const s2 = idOf(t, "p1", "battlefield", "Summon: Shiva");
      t = resolve(
        act(t, "p1", { type: "cast", card: c2, mode: modeOf(t, c2, "Retirez un marqueur de savoir"), targets: { r: [s2] } }),
      );
      expect(t.objects[s2]?.counters.lore).toBe(1);
    });

    it("Cloud of Darkness : vol ; à l'arrivée, une créature adverse ciblée a -X/-X, X étant le nombre de cartes de permanent de votre cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", ...lands("Forest", 4)],
          hand: ["Cloud of Darkness"],
          graveyard: ["Forest", "Bear Cub", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Cloud of Darkness"), answering(true, [angel]));
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Cloud of Darkness")).keywords).toContain("flying");
    });

    it("Coliseum Behemoth : piétinement ; à l'arrivée, détruisez un artefact ou un enchantement, ou piochez une carte", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Forest", 7), hand: ["Coliseum Behemoth"] },
          p2: { battlefield: ["Buster Sword", "Bear Cub"] },
        });
      let s = setup();
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      s = resolve(cast(s, "p1", "Coliseum Behemoth"), triggerMode(0, answering(true, [sword])));
      expect(idsOf(s, "p2", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Coliseum Behemoth")).keywords).toContain("trample");
      const t = resolve(cast(setup(), "p1", "Coliseum Behemoth"), triggerMode(1));
      expect(hand(t, "p1")).toBe(1);
      expect(idsOf(t, "p2", "battlefield", "Buster Sword")).toHaveLength(1);
    });

    it("Coral Sword : flash ; à l'arrivée, s'attache à une de vos créatures qui gagne l'initiative ce tour-ci ; +1/+0", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Coral Sword"] } });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Coral Sword"), answering(true, [bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Coral Sword")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p1");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Crystal Fragments : +1/+1 ; devient Summon: Alexander : I prévient les blessures à vos créatures ce tour-ci ; III engage les créatures adverses", () => {
      const CF = "Crystal Fragments // Summon: Alexander";
      let s = scenario({ p1: { battlefield: [CF, "Bear Cub", ...lands("Plains", 7), "Mountain"], hand: ["Burst Lightning"] } });
      const frag = idOf(s, "p1", "battlefield", CF);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[frag]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      s = resolve(activate(s, "p1", frag, "Exilez-la"));
      const alex = idOf(s, "p1", "battlefield", CF);
      expect(chars(s, alex).name).toBe("Summon: Alexander");
      expect(chars(s, alex).keywords).toContain("flying");
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.damage ?? 0).toBe(0);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: CF, counters: { lore: 2 } }] },
        p2: { battlefield: ["Bear Cub"] },
      });
      flip(t, idOf(t, "p1", "battlefield", CF));
      t = toMain(t, "p1");
      expect(t.objects[idOf(t, "p2", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Dark Knight's Greatsword : +3/+0 et Chevalier ; Équiper en payant 3 PV, une fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Dark Knight's Greatsword"] } });
      s = resolve(cast(s, "p1", "Dark Knight's Greatsword"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([4, 1]);
      expect(chars(s, hero).subtypes).toContain("Knight");
      const sword = idOf(s, "p1", "battlefield", "Dark Knight's Greatsword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", sword, "Équiper", { targets: { t: [bear] } }));
      expect(life(s, "p1")).toBe(17);
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(canUse(s, "p1", sword, "Équiper")).toBe(false);
    });

    it("Delivery Moogle : vol ; cherche dans votre bibliothèque et/ou votre cimetière une carte d'artefact de VM 2 ou moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Delivery Moogle"], graveyard: ["Coral Sword", "Buster Sword"] },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Delivery Moogle"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Coral Sword");
      });
      expect(offered).toEqual(["Coral Sword"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Coral Sword"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Delivery Moogle")).keywords).toContain("flying");
      let t = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Delivery Moogle"], library: ["Buster Sword", "Cargo Ship", "Forest"] },
      });
      t = resolve(cast(t, "p1", "Delivery Moogle"), (req, _p, cur) => pickNamed(cur, req, "Cargo Ship"));
      expect(namesIn(t, t.players.p1?.hand)).toEqual(["Cargo Ship"]);
    });

    it("Demon Wall : défenseur et menace ; {5}{B} : deux marqueurs +1/+1, et avec un marqueur elle peut attaquer", () => {
      let s = scenario({ p1: { battlefield: ["Demon Wall", ...lands("Swamp", 6)] } });
      const wall = idOf(s, "p1", "battlefield", "Demon Wall");
      expect(chars(s, wall).keywords).toEqual(expect.arrayContaining(["defender", "menace"]));
      s = resolve(activate(s, "p1", wall, "Deux marqueurs"));
      expect(pt(s, wall)).toEqual([5, 5]);
      expect(chars(s, wall).keywords).not.toContain("defender");
      s = throughCombat(attack(s, [wall]));
      expect(life(s, "p2")).toBe(15);
      // « Un marqueur » : n'importe quel type de marqueur, pas seulement +1/+1.
      const t = scenario({ p1: { battlefield: [{ name: "Demon Wall", counters: { oil: 1 } }] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Demon Wall")).keywords).not.toContain("defender");
    });

    it("Diamond Weapon : coûte {1} de moins par carte de permanent de votre cimetière ; portée ; les blessures de combat qui lui seraient infligées sont prévenues", () => {
      // Trois cartes de permanent (l'éphémère ne compte pas) : {4}{G}{G}, pas avec cinq Forêts.
      const s = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Diamond Weapon"],
          graveyard: ["Forest", "Bear Cub", "Buster Sword", "Opt"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Diamond Weapon"))).toBe(false);
      const t = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Diamond Weapon"],
          graveyard: ["Forest", "Bear Cub", "Buster Sword", "Serra Angel"],
        },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Diamond Weapon"))).toBe(true);
      let u = scenario({ p1: { battlefield: ["Diamond Weapon"] }, p2: { battlefield: ["Shivan Dragon"] } });
      const weapon = idOf(u, "p1", "battlefield", "Diamond Weapon");
      expect(chars(u, weapon).keywords).toContain("reach");
      u = attack(u, [weapon]);
      u = passAccepting(u, (x) => x.pending?.kind === "declareBlockers");
      u = act(u, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(u, "p2", "battlefield", "Shivan Dragon"), attacker: weapon }],
      });
      u = throughCombat(u);
      expect(u.objects[weapon]?.damage ?? 0).toBe(0);
      expect(idsOf(u, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Dragoon's Lance : +1/+0 et Chevalier ; la créature équipée vole pendant votre tour", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Dragoon's Lance"] } });
      s = resolve(cast(s, "p1", "Dragoon's Lance"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([2, 1]);
      expect(chars(s, hero).subtypes).toContain("Knight");
      expect(chars(s, hero).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, hero).keywords).not.toContain("flying");
    });

    it("Eden, Seat of the Sanctum : {5}, {T} : meulez deux cartes ; vous pouvez la sacrifier pour renvoyer une autre carte de permanent du cimetière en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Eden, Seat of the Sanctum", ...lands("Plains", 5)],
          library: ["Shivan Dragon", "Bear Cub", "Forest"],
        },
      });
      const eden = idOf(s, "p1", "battlefield", "Eden, Seat of the Sanctum");
      let offered: string[] = [];
      s = resolve(activate(s, "p1", eden, "Meulez"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Shivan Dragon");
      });
      // Eden, sacrifiée, n'est pas une cible.
      expect(offered.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shivan Dragon"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Eden, Seat of the Sanctum"]);
    });

    it("Eject : ne peut pas être contrecarré ; renvoie un permanent non-terrain en main, piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Eject"] },
        p2: { battlefield: ["Serra Angel", ...lands("Island", 3)], hand: ["Louisoix's Sacrifice"] },
      });
      s = cast(s, "p1", "Eject", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
      s = act(s, "p1", { type: "pass" });
      s = resolve(cast(s, "p2", "Louisoix's Sacrifice", { targets: { t: [s.stack[0]?.id as string] } }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(1);
    });

    it("Elixir : arrive engagé ; {5}, {T}, exil : les cartes non-terrain du cimetière rejoignent la bibliothèque, vous gagnez autant de PV", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Elixir"] } });
      s = resolve(cast(s, "p1", "Elixir"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Elixir")]?.tapped).toBe(true);
      let t = scenario({
        p1: { battlefield: ["Elixir", ...lands("Plains", 5)], graveyard: ["Opt", "Bear Cub", "Forest"], library: [] },
      });
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Elixir")));
      expect(life(t, "p1")).toBe(22);
      expect(namesIn(t, t.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(exiled(t, "Elixir")).toHaveLength(1);
    });

    it("Ether : {T}, exil : {U}, et votre prochain éphémère ou rituel du tour est copié", () => {
      let s = scenario({ p1: { battlefield: ["Ether"], hand: ["Opt"] } });
      // Capacité de mana : elle se résout sans passer par la pile.
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Ether"));
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(exiled(s, "Ether")).toHaveLength(1);
      s = resolve(cast(s, "p1", "Opt"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Evil Reawakened : une carte de créature de votre cimetière revient avec deux marqueurs +1/+1 de plus", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Evil Reawakened"], graveyard: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", "Evil Reawakened", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 4]);
    });

    it("Exdeath, Void Warlock : +3 PV à l'arrivée ; à votre étape de fin, avec six cartes de permanent au cimetière, il devient Neo Exdeath (force = ces cartes, piétinement)", () => {
      const EX = "Exdeath, Void Warlock // Neo Exdeath, Dimension's End";
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: [EX] } });
      s = resolve(cast(s, "p1", EX));
      expect(life(s, "p1")).toBe(23);
      const run = (n: number) => {
        const t = scenario({ p1: { battlefield: [EX], graveyard: [...lands("Forest", n), "Opt"] } });
        const ex = idOf(t, "p1", "battlefield", EX);
        return { t: advanceUntil(t, (x) => x.turn.active === "p2"), ex };
      };
      const six = run(6);
      expect(chars(six.t, six.ex).name).toBe("Neo Exdeath, Dimension's End");
      expect(pt(six.t, six.ex)).toEqual([6, 3]);
      expect(chars(six.t, six.ex).keywords).toContain("trample");
      const five = run(5);
      expect(chars(five.t, five.ex).name).not.toBe("Neo Exdeath, Dimension's End");
    });
  });

  describe("peu communes (2)", () => {
    const sorceryOf = (n: number) =>
      customCard({
        name: `Rituel ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });

    it("Freya Crescent : vole pendant votre tour ; son {R} sert à un sort d'Équipement, pas à un autre sort", () => {
      const s = scenario({ p1: { battlefield: ["Freya Crescent", "Mountain", "Mountain"], hand: ["Buster Sword"] } });
      const freya = idOf(s, "p1", "battlefield", "Freya Crescent");
      expect(chars(s, freya).keywords).toContain("flying");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Buster Sword"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Freya Crescent", "Forest"], hand: ["Bear Cub"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
      const u = scenario({ active: "p2", p1: { battlefield: ["Freya Crescent"] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Freya Crescent")).keywords).not.toContain("flying");
    });

    it("Freya Crescent : son {R} paie « Équiper », pas une autre capacité d'un Équipement", () => {
      const s = scenario({ p1: { battlefield: ["Freya Crescent", "Shadowspear", "Bear Cub"] } });
      // Shadowspear : « {1} : … » ne se paie pas avec le mana de Freya (et Équiper {2} demande un mana de plus).
      const spear = idOf(s, "p1", "battlefield", "Shadowspear");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === spear)).toBe(false);
      let t = scenario({ p1: { battlefield: ["Freya Crescent", "Shadowspear", "Bear Cub", "Mountain"] } });
      const tSpear = idOf(t, "p1", "battlefield", "Shadowspear");
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      const options = legalActions(t, "p1").filter((a) => a.type === "activate" && a.source === tSpear);
      const equip = options.find((a) => a.type === "activate" && /Équiper/.test(a.label ?? ""));
      expect(equip?.type).toBe("activate");
      t = settle(
        act(t, "p1", {
          type: "activate",
          source: tSpear,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { t: [cub] },
        }),
      );
      expect(t.objects[tSpear]?.attachedTo).toBe(cub);
      expect(t.objects[idOf(t, "p1", "battlefield", "Freya Crescent")]?.tapped).toBe(true);
    });

    it("G'raha Tia : portée ; d'autres créatures ou artefacts à vous meurent : piochez, une fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["G'raha Tia", "Bear Cub", "Buster Sword"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "G'raha Tia")).keywords).toContain("reach");
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(0);
      s = structuredClone(s);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(1);
      s = structuredClone(s);
      destroy(s, idOf(s, "p1", "battlefield", "Buster Sword"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Gaius van Baelsar : chaque joueur sacrifie un jeton de créature, une créature non-jeton ou un enchantement, selon le mode", () => {
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      const setup = () => {
        const s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), charm], hand: ["Gaius van Baelsar"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel", charm] },
        });
        // Le Bébé ours adverse tient lieu de jeton de créature.
        s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]!.isToken = true;
        return s;
      };
      const a = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(1));
      expect(idsOf(a, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(a, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(a, "p1", "graveyard", "Gaius van Baelsar")).toHaveLength(1);
      const b = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(2));
      expect(idsOf(b, "p1", "graveyard", "Charme")).toHaveLength(1);
      expect(idsOf(b, "p2", "graveyard", "Charme")).toHaveLength(1);
      expect(idsOf(b, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      const c = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(0));
      expect(idsOf(c, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(idsOf(c, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(c, "p1", "battlefield", "Gaius van Baelsar")).toHaveLength(1);
    });

    it("Galuf's Final Act : +1/+0 jusqu'à la fin du tour, et à sa mort, autant de marqueurs que sa force sur jusqu'à une créature ciblée", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Serra Angel", "Forest", "Forest"], hand: ["Galuf's Final Act"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Galuf's Final Act", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      destroy(s, bear);
      s = resolve(act(s, "p1", { type: "pass" }), answering(true, [angel]));
      expect(counters(s, angel)).toBe(3);
    });

    it("Garland : surveillance 1 à chaque sort non-créature ; du cimetière, revient transformé en Chaos (vol), qui retourne au-dessous de la bibliothèque en mourant", () => {
      const GARLAND = "Garland, Knight of Cornelia // Chaos, the Endless";
      let s = scenario({ p1: { battlefield: [GARLAND, "Island"], hand: ["Opt"], library: ["Forest", "Island", "Bear Cub"] } });
      let surveils = 0;
      s = resolve(cast(s, "p1", "Opt"), (req) => {
        if (req.intent === "surveilGraveyard") surveils++;
        return undefined;
      });
      expect(surveils).toBe(1);
      let t = scenario({ p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 4)], graveyard: [GARLAND] } });
      const card = idOf(t, "p1", "graveyard", GARLAND);
      t = resolve(activate(t, "p1", card));
      const chaos = idOf(t, "p1", "battlefield", GARLAND);
      expect(chars(t, chaos).name).toBe("Chaos, the Endless");
      expect(chars(t, chaos).keywords).toContain("flying");
      destroy(t, chaos);
      t = resolve(act(t, "p1", { type: "pass" }));
      expect(namesIn(t, t.players.p1?.library).at(-1)).toBe(GARLAND);
    });

    it("Garnet, Princess of Alexandria : lien de vie ; en attaquant, retirez des marqueurs de savoir de vos Sagas pour autant de marqueurs +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Garnet, Princess of Alexandria", { name: "Summon: Shiva", counters: { lore: 2 } }] },
      });
      const garnet = idOf(s, "p1", "battlefield", "Garnet, Princess of Alexandria");
      expect(chars(s, garnet).keywords).toContain("lifelink");
      s = resolve(attack(s, [garnet]), answering(true));
      expect(counters(s, garnet)).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Summon: Shiva")]?.counters.lore).toBe(1);
    });

    it("Garnet : les Sagas sont choisies une à une (« de chacune d'un nombre quelconque »)", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Garnet, Princess of Alexandria",
            { name: "Summon: Shiva", counters: { lore: 2 } },
            { name: "Summon: Shiva", counters: { lore: 1 } },
          ],
        },
      });
      const garnet = idOf(s, "p1", "battlefield", "Garnet, Princess of Alexandria");
      const [a, b] = idsOf(s, "p1", "battlefield", "Summon: Shiva") as [string, string];
      let options: string[] = [];
      s = resolve(attack(s, [garnet]), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [a];
      });
      expect(options.sort()).toEqual([a, b].sort());
      expect(counters(s, garnet)).toBe(1);
      expect(s.objects[a]?.counters.lore).toBe(1);
      expect(s.objects[b]?.counters.lore).toBe(1);
    });

    it("Giott, King of the Dwarves : double initiative ; un Nain ou un Équipement arrive : vous pouvez défausser pour piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Giott, King of the Dwarves", "Mountain"], hand: ["Coral Sword", "Forest"], library: ["Opt"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Giott, King of the Dwarves")).keywords).toContain("doubleStrike");
      const forest = idOf(s, "p1", "hand", "Forest");
      s = resolve(
        cast(s, "p1", "Coral Sword"),
        answering(true, [forest, idOf(s, "p1", "battlefield", "Giott, King of the Dwarves")]),
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = scenario({ p1: { battlefield: ["Giott, King of the Dwarves", "Forest", "Forest"], hand: ["Bear Cub", "Forest"] } });
      let asked = false;
      t = resolve(cast(t, "p1", "Bear Cub"), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
    });

    it("Gladiolus Amicitia : cherche un terrain mis en jeu engagé ; à chaque terrain, une autre de vos créatures gagne +2/+2 et le piétinement", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 4), "Mountain", "Mountain"],
          hand: ["Gladiolus Amicitia"],
          library: ["Bear Cub", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Gladiolus Amicitia"), (req, p, cur) =>
        pickNamed(cur, req, "Island")?.length ? pickNamed(cur, req, "Island") : answering(true, [bear])(req, p, cur),
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, idOf(s, "p1", "battlefield", "Gladiolus Amicitia"))).toEqual([6, 6]);
    });

    it("Ignis Scientia : un terrain parmi les six du dessus en jeu engagé ; {1}{G}{U}, {T} : exilez une carte d'un cimetière, un Aliment si c'était une créature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Forest", "Island"],
          hand: ["Ignis Scientia"],
          library: ["Opt", "Bear Cub", "Island", "Forest", "Opt", "Opt", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Ignis Scientia"), (req, _p, cur) => pickNamed(cur, req, "Island"));
      // L'Île payée pour le sort et celle mise en jeu, engagée.
      expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Forest");
      let t = scenario({
        p1: { battlefield: ["Ignis Scientia", "Forest", "Forest", "Island"] },
        p2: { graveyard: ["Bear Cub", "Opt"] },
      });
      const ignis = idOf(t, "p1", "battlefield", "Ignis Scientia");
      t = resolve(activate(t, "p1", ignis, "Exilez", { targets: { t: [idOf(t, "p2", "graveyard", "Bear Cub")] } }));
      expect(exiled(t, "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
      let u = scenario({ p1: { battlefield: ["Ignis Scientia", "Forest", "Forest", "Island"] }, p2: { graveyard: ["Opt"] } });
      u = resolve(
        activate(u, "p1", idOf(u, "p1", "battlefield", "Ignis Scientia"), "Exilez", {
          targets: { t: [idOf(u, "p2", "graveyard", "Opt")] },
        }),
      );
      expect(idsOf(u, "p1", "battlefield", "Food")).toHaveLength(0);
    });

    it("Il Mheg Pixie : vol ; surveillance 1 en attaquant", () => {
      let s = scenario({ p1: { battlefield: ["Il Mheg Pixie"], library: ["Forest", "Opt"] } });
      const pixie = idOf(s, "p1", "battlefield", "Il Mheg Pixie");
      expect(chars(s, pixie).keywords).toContain("flying");
      const top = s.players.p1?.library[0] as string;
      s = resolve(attack(s, [pixie]), (req) => (req.type === "pick" && req.options.includes(top) ? [top] : undefined));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Judge Magister Gabranth : menace ; un marqueur à chaque mort d'une autre de vos créatures ou d'un de vos artefacts", () => {
      let s = scenario({
        p1: { battlefield: ["Judge Magister Gabranth", "Bear Cub", "Buster Sword"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const judge = idOf(s, "p1", "battlefield", "Judge Magister Gabranth");
      expect(chars(s, judge).keywords).toContain("menace");
      for (const [p, name] of [
        ["p1", "Bear Cub"],
        ["p1", "Buster Sword"],
        ["p2", "Bear Cub"],
      ] as const) {
        s = structuredClone(s);
        destroy(s, idOf(s, p, "battlefield", name));
        s = resolve(act(s, "p1", { type: "pass" }));
      }
      expect(counters(s, judge)).toBe(2);
    });

    it("Lion Heart : 2 blessures à n'importe quelle cible à l'arrivée ; +2/+1", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Lion Heart"] } });
      s = resolve(cast(s, "p1", "Lion Heart"), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(life(s, "p2")).toBe(18);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Lion Heart")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([4, 3]);
    });

    it("Locke Cole : contact mortel, lien de vie ; blessures de combat à un joueur : piochez, puis défaussez", () => {
      let s = scenario({ p1: { battlefield: ["Locke Cole"], hand: ["Forest"], library: ["Opt"] } });
      const locke = idOf(s, "p1", "battlefield", "Locke Cole");
      expect(chars(s, locke).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      const forest = idOf(s, "p1", "hand", "Forest");
      s = throughCombat(attack(s, [locke]), answering(true, [forest]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(life(s, "p1")).toBe(22);
    });

    it("Magitek Armor : un Héros 1/1 à l'arrivée ; Équipage 1", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Magitek Armor"] } });
      s = resolve(cast(s, "p1", "Magitek Armor"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      const armor = idOf(s, "p1", "battlefield", "Magitek Armor");
      s = resolve(activate(s, "p1", armor, "Équipage", { tap: [hero] }));
      expect(chars(s, armor).types).toContain("Creature");
    });

    it("Omega, Heartless Evolution : engage jusqu'à un permanent non-terrain par adversaire, X marqueurs d'étourdissement et X PV (X = vos terrains non-base)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Capital City", "Adventurer's Inn", ...lands("Forest", 4), "Island"],
          hand: ["Omega, Heartless Evolution"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Omega, Heartless Evolution"), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(2);
      expect(life(s, "p1")).toBe(22);
    });

    it("Opera Love Song : exile les deux cartes du dessus, jouables jusqu'à votre prochaine étape de fin ; ou une ou deux créatures +2/+0", () => {
      const s = scenario({
        p1: {
          battlefield: ["Mountain", "Mountain", "Bear Cub", "Bear Cub"],
          hand: ["Opera Love Song"],
          library: ["Forest", "Opt", "Island"],
        },
      });
      const card = idOf(s, "p1", "hand", "Opera Love Song");
      let a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Exilez les deux cartes du dessus, jouables") }));
      const forest = exiled(a, "Forest")[0] as string;
      expect(exiled(a, "Opt")).toHaveLength(1);
      expect(legalActions(a, "p1").some((x) => x.type === "playLand" && x.card === forest)).toBe(true);
      a = advanceUntil(a, (x) => x.turn.active === "p2");
      a = advanceUntil(a, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(legalActions(a, "p1").some((x) => x.type === "playLand" && x.card === forest)).toBe(false);
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      const b = resolve(
        act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Une ou deux créatures gagnent +2/+0"), targets: { t: bears } }),
      );
      expect(bears.map((id) => pt(b, id))).toEqual([
        [4, 2],
        [4, 2],
      ]);
    });

    it("Overkill : la créature ciblée a -0/-9999 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Overkill"] }, p2: { battlefield: ["Serra Angel"] } });
      s = resolve(cast(s, "p1", "Overkill", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Phantom Train : piétinement ; sacrifiez un autre artefact ou une autre créature : un marqueur, et il devient une créature-artefact Esprit jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Phantom Train", "Bear Cub"] } });
      const train = idOf(s, "p1", "battlefield", "Phantom Train");
      expect(chars(s, train).types).not.toContain("Creature");
      s = resolve(activate(s, "p1", train, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(chars(s, train).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, train).subtypes).toContain("Spirit");
      expect(chars(s, train).keywords).toContain("trample");
      expect(pt(s, train)).toEqual([5, 5]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, train).types).not.toContain("Creature");
    });

    it("Phoenix Down : {1}{W}, {T}, exil : une créature de VM 4 ou moins revient engagée, ou un Squelette, Esprit ou Zombie est exilé", () => {
      let s = scenario({ p1: { battlefield: ["Phoenix Down", "Plains", "Plains"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const down = idOf(s, "p1", "battlefield", "Phoenix Down");
      const opt = legalActions(s, "p1").find(
        (a) => a.type === "activate" && a.source === down && a.label?.startsWith("Renvoyez"),
      );
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Bear Cub")]);
      s = resolve(activate(s, "p1", down, "Renvoyez", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(exiled(s, "Phoenix Down")).toHaveLength(1);
      const zombie = customCard({ name: "Zombie", subtypes: ["Zombie"], power: 2, toughness: 2 });
      let t = scenario({ p1: { battlefield: ["Phoenix Down", "Plains", "Plains"] }, p2: { battlefield: [zombie, "Bear Cub"] } });
      const td = idOf(t, "p1", "battlefield", "Phoenix Down");
      const o2 = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === td && a.label?.startsWith("Exilez"));
      expect(o2?.type === "activate" && o2.targets[0]?.legal).toEqual([idOf(t, "p2", "battlefield", "Zombie")]);
      t = resolve(activate(t, "p1", td, "Exilez", { targets: { t: [idOf(t, "p2", "battlefield", "Zombie")] } }));
      expect(exiled(t, "Zombie")).toHaveLength(1);
    });

    it("Poison the Waters : toutes les créatures -1/-1 ; ou le joueur ciblé révèle sa main et défausse l'artefact ou la créature que vous choisissez", () => {
      const s = scenario({
        p1: { battlefield: ["Swamp", "Swamp", "Llanowar Elves"], hand: ["Poison the Waters"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Bear Cub", "Buster Sword"] },
      });
      const card = idOf(s, "p1", "hand", "Poison the Waters");
      const a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Toutes les créatures -1/-1") }));
      expect(idsOf(a, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(pt(a, idOf(a, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
      let chooser = "";
      let offered: string[] = [];
      const b = resolve(
        act(s, "p1", {
          type: "cast",
          card,
          mode: modeOf(s, card, "Défausse d'un artefact ou d'une créature"),
          targets: { t: ["p2"] },
        }),
        (req, p, cur) => {
          if (req.type !== "pick") return undefined;
          chooser = p;
          offered = namesIn(cur, req.options) as string[];
          return pickNamed(cur, req, "Buster Sword");
        },
      );
      expect(chooser).toBe("p1");
      expect(offered.sort()).toEqual(["Bear Cub", "Buster Sword"]);
      expect(namesIn(b, b.players.p2?.graveyard)).toEqual(["Buster Sword"]);
    });

    it("Prompto Argentum : célérité ; un Trésor pour chaque sort non-créature payé avec au moins quatre mana", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Prompto Argentum", ...lands("Mountain", n)], hand: [sorceryOf(n)] } });
        return resolve(cast(s, "p1", `Rituel ${n}`));
      };
      expect(idsOf(run(4), "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(idsOf(run(3), "p1", "battlefield", "Treasure")).toHaveLength(0);
      const s = scenario({ p1: { battlefield: ["Prompto Argentum"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Prompto Argentum")).keywords).toContain("haste");
    });

    it("Queen Brahne : prouesse ; en attaquant, un Sorcier 0/1 qui blesse les adversaires à chaque sort non-créature", () => {
      let s = scenario({ p1: { battlefield: ["Queen Brahne", "Mountain"], hand: ["Burst Lightning"] } });
      const queen = idOf(s, "p1", "battlefield", "Queen Brahne");
      s = resolve(attack(s, [queen]));
      expect(idsOf(s, "p1", "battlefield", "Wizard")).toHaveLength(1);
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(pt(s, queen)).toEqual([3, 2]);
      expect(life(s, "p2")).toBe(17);
    });

    it("Quistis Trepe : à l'arrivée, vous pouvez lancer un éphémère ou rituel d'un cimetière avec du mana de n'importe quel type ; il est exilé ensuite", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Quistis Trepe"] },
        p2: { graveyard: ["Burst Lightning"] },
      });
      s = untilCastNow(cast(s, "p1", "Quistis Trepe"));
      const burst = idOf(s, "p2", "graveyard", "Burst Lightning");
      expect(castNowOf(s)?.cards).toEqual([burst]);
      s = resolve(act(s, "p1", { type: "cast", card: burst, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(18);
      expect(exiled(s, "Burst Lightning")).toHaveLength(1);
    });

    it("Random Encounter : meulez quatre cartes, les créatures meulées arrivent avec la célérité et retournent en main à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Random Encounter"], library: lands("Bear Cub", 4) } });
      s = resolve(cast(s, "p1", "Random Encounter"));
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(bears).toHaveLength(4);
      expect(chars(s, bears[0] as string).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(4);
    });

    it("Reach the Horizon : jusqu'à deux terrains de base ou Villes de noms différents, mis en jeu engagés", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Reach the Horizon"],
          library: ["Forest", "Forest", "Capital City", "Shivan Dragon"],
        },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Reach the Horizon"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return [
          req.options.find((id) => nameOf(cur, id) === "Forest"),
          req.options.find((id) => nameOf(cur, id) === "Capital City"),
        ] as string[];
      });
      expect(offered).not.toContain("Shivan Dragon");
      expect(s.objects[idOf(s, "p1", "battlefield", "Capital City")]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(5);
    });

    it("Relentless X-ATM092 : ne peut être bloquée que par trois créatures ou plus ; {8} : revient du cimetière engagée avec un marqueur de finalité", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), graveyard: ["Relentless X-ATM092"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "graveyard", "Relentless X-ATM092")));
      const robot = idOf(s, "p1", "battlefield", "Relentless X-ATM092");
      expect(s.objects[robot]?.tapped).toBe(true);
      expect(counters(s, robot, "finality")).toBe(1);
      let t = scenario({ p1: { battlefield: ["Relentless X-ATM092"] }, p2: { battlefield: ["Bear Cub", "Bear Cub"] } });
      const r2 = idOf(t, "p1", "battlefield", "Relentless X-ATM092");
      t = attack(t, [r2]);
      t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
      const [b1, b2] = idsOf(t, "p2", "battlefield", "Bear Cub") as [string, string];
      expect(() =>
        act(t, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: r2 },
            { blocker: b2, attacker: r2 },
          ],
        }),
      ).toThrow();
    });

    it("Relm's Sketching : un jeton copie d'un artefact, d'une créature ou d'un terrain ciblé", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Relm's Sketching"] },
        p2: { battlefield: ["Serra Angel", "Capital City"] },
      });
      s = resolve(cast(s, "p1", "Relm's Sketching", { targets: { t: [idOf(s, "p2", "battlefield", "Capital City")] } }));
      const copy = idOf(s, "p1", "battlefield", "Capital City");
      expect(s.objects[copy]?.isToken).toBe(true);
    });

    it("Reno and Rude : menace ; blessures de combat : exile la carte du dessus du joueur ; en sacrifiant une autre créature ou un artefact, vous la jouez ce tour-ci avec n'importe quel mana", () => {
      const run = (yes: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Reno and Rude", "Llanowar Elves", "Swamp", "Swamp"] },
          p2: { library: ["Bear Cub", "Forest"] },
        });
        const reno = idOf(s, "p1", "battlefield", "Reno and Rude");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = throughCombat(attack(s, [reno]), answering(yes, yes ? [elves] : []));
        return s;
      };
      const yes = run(true);
      const bear = exiled(yes, "Bear Cub")[0] as string;
      expect(idsOf(yes, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(castable(yes, "p1", bear)).toBe(true);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(castable(no, "p1", exiled(no, "Bear Cub")[0] as string)).toBe(false);
      expect(chars(no, idOf(no, "p1", "battlefield", "Reno and Rude")).keywords).toContain("menace");
    });

    it("Restoration Magic : palier « Extra Soin » : un permanent gagne la défense talismanique et l'indestructible, vous gagnez 3 PV", () => {
      const s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Restoration Magic"] } });
      const card = idOf(s, "p1", "hand", "Restoration Magic");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const mode = castModes(s, card).find((m) => m.label?.includes("Extra Soin"));
      const t = resolve(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { t: [bear] } }));
      expect(chars(t, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
      expect(life(t, "p1")).toBe(23);
    });

    it("Ride the Shoopuf : à chaque terrain, un marqueur sur une de vos créatures ; {5}{G}{G} : devient une créature Bête 7/7", () => {
      let s = scenario({ p1: { battlefield: ["Ride the Shoopuf", "Bear Cub", ...lands("Forest", 7)], hand: ["Forest"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), answering(true, [bear]));
      expect(counters(s, bear)).toBe(1);
      const shoopuf = idOf(s, "p1", "battlefield", "Ride the Shoopuf");
      s = resolve(activate(s, "p1", shoopuf));
      expect(pt(s, shoopuf)).toEqual([7, 7]);
      expect(chars(s, shoopuf).subtypes).toContain("Beast");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, shoopuf).types).toContain("Creature");
    });
  });

  describe("peu communes (3)", () => {
    const sorceryOf = (n: number) =>
      customCard({
        name: `Rituel ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });
    const surveilOf: Answer = (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined);

    it("Ring of the Lucii : {T} : {C}{C} ; {2}, {T}, 1 PV : engagez un permanent non-terrain ciblé", () => {
      let s = scenario({
        p1: { battlefield: ["Ring of the Lucii", "Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const ring = idOf(s, "p1", "battlefield", "Ring of the Lucii");
      const mana = act(s, "p1", { type: "tapForMana", source: ring, ability: 0, color: "C" } as never);
      expect(mana.players.p1?.manaPool.C).toBe(2);
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ring);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
      s = resolve(activate(s, "p1", ring, "Engagez", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(life(s, "p1")).toBe(19);
    });

    it("Rinoa Heartilly : crée Angelo, Chien légendaire 1/1 ; en attaquant, une autre de vos créatures gagne +1/+1 par créature que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Forest", "Forest", "Forest", "Plains", "Plains"], hand: ["Rinoa Heartilly"] },
      });
      s = resolve(cast(s, "p1", "Rinoa Heartilly"));
      const angelo = idOf(s, "p1", "battlefield", "Angelo");
      expect(chars(s, angelo).supertypes).toContain("Legendary");
      expect(pt(s, angelo)).toEqual([1, 1]);
      let t = scenario({ p1: { battlefield: ["Rinoa Heartilly", "Bear Cub", "Llanowar Elves"] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Rinoa Heartilly")]), answering(true, [bear]));
      expect(pt(t, bear)).toEqual([5, 5]);
    });

    it("Rufus Shinra : en attaquant, crée Darkstar (Chien légendaire 2/2) si vous n'en contrôlez pas", () => {
      let s = scenario({ turn: 3, p1: { battlefield: ["Rufus Shinra"] } });
      const rufus = idOf(s, "p1", "battlefield", "Rufus Shinra");
      s = throughCombat(attack(s, [rufus]));
      expect(idsOf(s, "p1", "battlefield", "Darkstar")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = throughCombat(act(s, "p1", { type: "declareAttackers", attackers: [{ id: rufus, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Darkstar")).toHaveLength(1);
    });

    it("Rydia, Summoner of Mist : terrain : vous pouvez défausser pour piocher ; {X}, {T} : une Saga du cimetière revient avec un marqueur de finalité et la célérité", () => {
      let s = scenario({ p1: { battlefield: ["Rydia, Summoner of Mist"], hand: ["Forest", "Opt"], library: ["Bear Cub"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), answering(true, [opt]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: {
          battlefield: ["Rydia, Summoner of Mist", "Mountain", "Mountain"],
          graveyard: ["Summon: Brynhildr"],
          library: ["Forest", "Forest"],
        },
      });
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Rydia, Summoner of Mist"), "Invocation", {
          x: 2,
          targets: { t: [idOf(t, "p1", "graveyard", "Summon: Brynhildr")] },
        }),
      );
      const saga = idOf(t, "p1", "battlefield", "Summon: Brynhildr");
      expect(counters(t, saga, "finality")).toBe(1);
      expect(chars(t, saga).keywords).toContain("haste");
      // X différent de la valeur de mana (1 pour une Saga de VM 2) : rien ne revient.
      let u = scenario({
        p1: { battlefield: ["Rydia, Summoner of Mist", "Mountain", "Mountain"], graveyard: ["Summon: Brynhildr"] },
      });
      u = resolve(
        activate(u, "p1", idOf(u, "p1", "battlefield", "Rydia, Summoner of Mist"), "Invocation", {
          x: 1,
          targets: { t: [idOf(u, "p1", "graveyard", "Summon: Brynhildr")] },
        }),
      );
      expect(idsOf(u, "p1", "graveyard", "Summon: Brynhildr")).toHaveLength(1);
      // X plus grand que la valeur de mana : rien non plus (« de valeur de mana X »).
      let v = scenario({
        p1: { battlefield: ["Rydia, Summoner of Mist", ...lands("Mountain", 3)], graveyard: ["Summon: Brynhildr"] },
      });
      v = resolve(
        activate(v, "p1", idOf(v, "p1", "battlefield", "Rydia, Summoner of Mist"), "Invocation", {
          x: 3,
          targets: { t: [idOf(v, "p1", "graveyard", "Summon: Brynhildr")] },
        }),
      );
      expect(idsOf(v, "p1", "graveyard", "Summon: Brynhildr")).toHaveLength(1);
    });

    it("Rydia's Return : vos créatures +3/+3 ; ou jusqu'à deux cartes de permanent du cimetière en main", () => {
      const s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 5)],
          hand: ["Rydia's Return"],
          graveyard: ["Shivan Dragon", "Opt", "Forest"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Rydia's Return");
      const a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Vos créatures gagnent +3/+3") }));
      expect(pt(a, idOf(a, "p1", "battlefield", "Bear Cub"))).toEqual([5, 5]);
      expect(pt(a, idOf(a, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      const mode = castModes(s, card).find((m) => m.label === "Renvoyez jusqu'à deux cartes de permanent");
      expect(mode?.targets[0]?.legal).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
      const targets = [idOf(s, "p1", "graveyard", "Shivan Dragon"), idOf(s, "p1", "graveyard", "Forest")];
      const b = resolve(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { t: targets } }));
      expect(namesIn(b, b.players.p1?.hand).sort()).toEqual(["Forest", "Shivan Dragon"]);
    });

    it("Samurai's Katana : +2/+2, piétinement, célérité et Samouraï", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Samurai's Katana"] } });
      s = resolve(cast(s, "p1", "Samurai's Katana"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([3, 3]);
      expect(chars(s, hero).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
      expect(chars(s, hero).subtypes).toContain("Samurai");
    });

    it("Sandworm : célérité ; détruit un terrain ciblé, dont le contrôleur peut chercher un terrain de base mis en jeu engagé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Sandworm"] },
        p2: { battlefield: ["Capital City"], library: ["Bear Cub", "Island"] },
      });
      const city = idOf(s, "p2", "battlefield", "Capital City");
      let chooser = "";
      s = resolve(cast(s, "p1", "Sandworm"), (req, p, cur) => {
        if (req.type === "pick" && req.options.includes(city)) return [city];
        const island = pickNamed(cur, req, "Island");
        if (island?.length) chooser = p;
        return island?.length ? island : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Capital City")).toHaveLength(1);
      expect(chooser).toBe("p2");
      expect(s.objects[idOf(s, "p2", "battlefield", "Island")]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Sandworm")).keywords).toContain("haste");
    });

    it("Self-Destruct : votre créature inflige X blessures à une autre cible et X à elle-même (X = sa force)", () => {
      let s = scenario({ p1: { battlefield: ["Serra Angel", "Mountain", "Mountain"], hand: ["Self-Destruct"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Self-Destruct", { targets: { s: [angel], t: ["p2"] } }));
      expect(life(s, "p2")).toBe(16);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Shambling Cie'th : arrive engagée ; à chaque sort non-créature, vous pouvez payer {B} pour la renvoyer du cimetière en main", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Shambling Cie'th"] } });
      s = resolve(cast(s, "p1", "Shambling Cie'th"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Shambling Cie'th")]?.tapped).toBe(true);
      const run = (yes: boolean) => {
        const t = scenario({ p1: { battlefield: ["Island", "Swamp"], hand: ["Opt"], graveyard: ["Shambling Cie'th"] } });
        return resolve(cast(t, "p1", "Opt"), answering(yes));
      };
      expect(idsOf(run(true), "p1", "hand", "Shambling Cie'th")).toHaveLength(1);
      expect(idsOf(run(false), "p1", "graveyard", "Shambling Cie'th")).toHaveLength(1);
    });

    it("Shantotto, Tactician Magician : +X/+0 par sort non-créature (X = mana dépensé) ; X ≥ 4 : piochez", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Shantotto, Tactician Magician", ...lands("Island", n)], hand: [sorceryOf(n)] },
        });
        return resolve(cast(s, "p1", `Rituel ${n}`));
      };
      const four = run(4);
      expect(pt(four, idOf(four, "p1", "battlefield", "Shantotto, Tactician Magician"))).toEqual([4, 4]);
      expect(hand(four, "p1")).toBe(1);
      const two = run(2);
      expect(pt(two, idOf(two, "p1", "battlefield", "Shantotto, Tactician Magician"))).toEqual([2, 4]);
      expect(hand(two, "p1")).toBe(0);
    });

    it("Sidequest: Card Collection : piochez trois, défaussez deux ; à votre étape de fin, avec huit cartes au cimetière, devient Magicked Card (Véhicule volant)", () => {
      const SQ = "Sidequest: Card Collection // Magicked Card";
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [SQ] } });
      s = resolve(cast(s, "p1", SQ));
      expect(hand(s, "p1")).toBe(1);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      const run = (n: number) => {
        const t = scenario({ p1: { battlefield: [SQ], graveyard: lands("Forest", n) } });
        const id = idOf(t, "p1", "battlefield", SQ);
        return { t: advanceUntil(t, (x) => x.turn.active === "p2"), id };
      };
      const eight = run(8);
      expect(chars(eight.t, eight.id).name).toBe("Magicked Card");
      expect(chars(eight.t, eight.id).keywords).toContain("flying");
      const seven = run(7);
      expect(chars(seven.t, seven.id).name).not.toBe("Magicked Card");
    });

    it("Sidequest: Catch a Fish : à l'entretien, un artefact ou une créature au-dessus va en main : Aliment et transformation en Cooking Campsite", () => {
      const SQ = "Sidequest: Catch a Fish // Cooking Campsite";
      const run = (top: string) => {
        const s = scenario({ active: "p2", turn: 4, p1: { battlefield: [SQ], library: [top, "Island"] } });
        const id = idOf(s, "p1", "battlefield", SQ);
        return { s: toMain(s, "p1", answering(true, s.players.p1?.library.slice(0, 1) ?? [])), id };
      };
      const fish = run("Bear Cub");
      expect(idsOf(fish.s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(fish.s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(chars(fish.s, fish.id).name).toBe("Cooking Campsite");
      const none = run("Forest");
      expect(idsOf(none.s, "p1", "battlefield", "Food")).toHaveLength(0);
      expect(chars(none.s, none.id).name).not.toBe("Cooking Campsite");
    });

    it("Cooking Campsite : {T} : {W} ; {3}, {T}, sacrifiez un artefact : un marqueur +1/+1 sur chacune de vos créatures", () => {
      const SQ = "Sidequest: Catch a Fish // Cooking Campsite";
      let s = scenario({ p1: { battlefield: [SQ, "Bear Cub", "Buster Sword", ...lands("Plains", 3)] } });
      const camp = idOf(s, "p1", "battlefield", SQ);
      flip(s, camp);
      s = resolve(activate(s, "p1", camp, "Un marqueur", { sacrifice: [idOf(s, "p1", "battlefield", "Buster Sword")] }));
      expect(idsOf(s, "p1", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Sidequest: Hunt the Mark : détruit jusqu'à une créature ; à votre étape de fin, si une créature adverse est morte, un Trésor", () => {
      const SQ = "Sidequest: Hunt the Mark // Yiazmat, Ultimate Mark";
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: [SQ] }, p2: { battlefield: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", SQ), answering(true, [idOf(s, "p2", "battlefield", "Bear Cub")]));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const t = advanceUntil(scenario({ p1: { battlefield: [SQ] } }), (x) => x.turn.active === "p2");
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Yiazmat, Ultimate Mark : {1}{B}, sacrifiez une autre créature ou un artefact : indestructible jusqu'à la fin du tour, et engagez-la", () => {
      const SQ = "Sidequest: Hunt the Mark // Yiazmat, Ultimate Mark";
      let s = scenario({ p1: { battlefield: [SQ, "Bear Cub", "Swamp", "Swamp"] } });
      const y = idOf(s, "p1", "battlefield", SQ);
      flip(s, y);
      s = resolve(activate(s, "p1", y, "Indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(chars(s, y).keywords).toContain("indestructible");
      expect(s.objects[y]?.tapped).toBe(true);
    });

    it("Sidequest: Play Blitzball : +2/+0 au début du combat ; un joueur a subi 6 blessures de combat : devient World Champion (+2/+0, double initiative), attaché", () => {
      const SQ = "Sidequest: Play Blitzball // World Champion, Celestial Weapon";
      const run = (name: string) => {
        let s = scenario({ p1: { battlefield: [SQ, name] } });
        const c = idOf(s, "p1", "battlefield", name);
        s = play(s, answering(true, [c]), (x) => x.pending?.kind === "declareAttackers");
        expect(pt(s, c)[0]).toBe((name === "Bear Cub" ? 2 : 5) + 2);
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: c, defender: "p2" }] });
        s = play(s, answering(true, [c]), (x) => x.turn.step === "main2");
        return { s, c, sq: idOf(s, "p1", "battlefield", SQ) };
      };
      const big = run("Shivan Dragon");
      expect(life(big.s, "p2")).toBe(13);
      expect(chars(big.s, big.sq).name).toBe("World Champion, Celestial Weapon");
      expect(big.s.objects[big.sq]?.attachedTo).toBe(big.c);
      expect(chars(big.s, big.c).keywords).toContain("doubleStrike");
      const small = run("Bear Cub");
      expect(chars(small.s, small.sq).name).not.toBe("World Champion, Celestial Weapon");
    });

    it("Sidequest: Raise a Chocobo : un Oiseau 2/2 à l'arrivée ; avec quatre Oiseaux, devient Black Chocobo (terrain cherché ; terrain : vos Oiseaux +1/+0)", () => {
      const SQ = "Sidequest: Raise a Chocobo // Black Chocobo";
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: [SQ] } });
      s = resolve(cast(s, "p1", SQ));
      expect(idsOf(s, "p1", "battlefield", "Bird")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: {
          battlefield: [SQ, "Healer's Hawk", "Healer's Hawk", "Healer's Hawk", "Healer's Hawk"],
          library: ["Bear Cub", "Forest", "Island"],
        },
      });
      const id = idOf(t, "p1", "battlefield", SQ);
      t = toMain(t, "p1", (req, _p, cur) => pickNamed(cur, req, "Forest"));
      expect(chars(t, id).name).toBe("Black Chocobo");
      const hawk = idOf(t, "p1", "battlefield", "Healer's Hawk");
      // Le terrain cherché arrive : vos Oiseaux +1/+0 (Black Chocobo compris).
      expect(t.objects[idOf(t, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
      expect(pt(t, hawk)).toEqual([2, 1]);
      expect(pt(t, id)).toEqual([3, 2]);
      // « Quand ce permanent se transforme en Black Chocobo » : aussi quand un autre effet le transforme.
      let v = scenario({ p1: { battlefield: [SQ], hand: [TRANSMUTE], library: ["Bear Cub", "Forest"] } });
      v = resolve(
        act(v, "p1", {
          type: "cast",
          card: idOf(v, "p1", "hand", "Transmutation"),
          targets: { t: [idOf(v, "p1", "battlefield", SQ)] },
        }),
      );
      expect(chars(v, idOf(v, "p1", "battlefield", SQ)).name).toBe("Black Chocobo");
      expect(idsOf(v, "p1", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Sleep Magic : la créature enchantée est engagée et ne se dégage plus ; blessée, l'Aura est sacrifiée", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Mountain"], hand: ["Sleep Magic", "Burst Lightning"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Sleep Magic", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      const t = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(t.objects[angel]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Sleep Magic")).toHaveLength(1);
    });

    it("Snow Villiers : vigilance ; sa force est égale au nombre de créatures que vous contrôlez", () => {
      const s = scenario({ p1: { battlefield: ["Snow Villiers", "Bear Cub", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const snow = idOf(s, "p1", "battlefield", "Snow Villiers");
      expect(pt(s, snow)).toEqual([3, 3]);
      expect(chars(s, snow).keywords).toContain("vigilance");
    });

    it("Sorceress's Schemes : une carte d'éphémère ou de rituel du cimetière en main, et {R}", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Sorceress's Schemes"], graveyard: ["Opt", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Sorceress's Schemes");
      const legal = castModes(s, card)[0]?.targets[0]?.legal ?? [];
      expect(legal).toEqual([idOf(s, "p1", "graveyard", "Opt")]);
      s = resolve(act(s, "p1", { type: "cast", card, targets: { t: legal } }));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });

    it("Stolen Uniform : vous prenez le contrôle de l'Équipement ciblé et l'attachez à votre créature", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island"], hand: ["Stolen Uniform"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Stolen Uniform", { targets: { c: [bear], e: [sword] } }));
      expect(s.objects[sword]?.controller).toBe("p1");
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([5, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[sword]?.controller).toBe("p2");
    });

    it("Stolen Uniform : quand vous perdez le contrôle de l'Équipement (au nettoyage), il est détaché de votre créature, pas avant", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island"], hand: ["Stolen Uniform"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Stolen Uniform", { targets: { c: [bear], e: [sword] } }));
      // À l'étape de fin, l'Équipement est encore à vous et attaché.
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(s.objects[sword]?.controller).toBe("p1");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[sword]?.controller).toBe("p2");
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Summon: Anima : I à III, piochez et perdez 1 PV ; IV, chaque adversaire sacrifie une créature et perd 3 PV ; menace", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Summon: Anima"] } });
      s = resolve(cast(s, "p1", "Summon: Anima"));
      expect(hand(s, "p1")).toBe(1);
      expect(life(s, "p1")).toBe(19);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Anima")).keywords).toContain("menace");
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Anima", counters: { lore: 3 } }] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(life(t, "p2")).toBe(17);
    });

    it("Summon: Esper Ramuh : I inflige à une créature adverse autant que vos cartes non-créature non-terrain au cimetière ; II vos Sorciers +1/+0", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["Summon: Esper Ramuh"],
          graveyard: ["Opt", "Opt", "Buster Sword", "Bear Cub", "Forest"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Summon: Esper Ramuh"), answering(true, [angel]));
      expect(s.objects[angel]?.damage).toBe(3);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Esper Ramuh", counters: { lore: 1 } }, "Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(pt(t, idOf(t, "p1", "battlefield", "Summon: Esper Ramuh"))).toEqual([4, 3]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Summon: Fenrir : I terrain de base mis en jeu engagé ; II votre prochain sort de créature arrive avec un marqueur ; III piochez si vous avez la plus grande force", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Summon: Fenrir"], library: ["Bear Cub", "Island"] } });
      s = resolve(cast(s, "p1", "Summon: Fenrir"), (req, _p, cur) => pickNamed(cur, req, "Island"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Fenrir", counters: { lore: 1 } }, "Forest", "Forest"], hand: ["Bear Cub"] },
      });
      t = toMain(t, "p1");
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(counters(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(1);
      const third = (theirs: string) => {
        const u = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: [{ name: "Summon: Fenrir", counters: { lore: 2 } }] },
          p2: { battlefield: [theirs] },
        });
        return hand(toMain(u, "p1"), "p1");
      };
      // Fenrir 3/2 : à égalité avec un 3/x, il pioche ; face au Dragon, non (seulement la carte de l'étape de pioche).
      expect(third("Bear Cub")).toBe(2);
      expect(third("Shivan Dragon")).toBe(1);
    });

    it("Summon: Primal Garuda : I 4 blessures à une créature adverse engagée ; II une autre de vos créatures gagne +1/+0 et le vol", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Summon: Primal Garuda"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Summon: Primal Garuda"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) offered = req.options;
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(offered).not.toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Primal Garuda", counters: { lore: 1 } }, "Bear Cub"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = toMain(t, "p1", answering(true, [bear]));
      expect(pt(t, bear)).toEqual([3, 2]);
      expect(chars(t, bear).keywords).toContain("flying");
    });

    it("Swallowed by Leviathan : surveillance 2, puis le sort est contrecarré à moins que son contrôleur paie {1} par carte de votre cimetière", () => {
      const run = (lands2: number) => {
        let s = scenario({
          active: "p2",
          p1: {
            battlefield: lands("Island", 3),
            hand: ["Swallowed by Leviathan"],
            graveyard: ["Opt"],
            library: ["Forest", "Forest", "Forest"],
          },
          p2: { battlefield: lands("Mountain", lands2), hand: ["Burst Lightning"] },
        });
        s = act(cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } }), "p2", { type: "pass" });
        return resolve(
          cast(s, "p1", "Swallowed by Leviathan", { targets: { t: [s.stack[0]?.id as string] } }),
          (req, p, cur) => surveilOf(req, p, cur) ?? (req.type === "yesNo" ? [1] : undefined),
        );
      };
      // Trois cartes au cimetière après la surveillance : {3} à payer.
      const poor = run(3);
      expect(life(poor, "p1")).toBe(20);
      expect(poor.players.p1?.graveyard.length).toBeGreaterThanOrEqual(3);
      const rich = run(4);
      expect(life(rich, "p1")).toBe(18);
    });

    it("The Crystal's Chosen : quatre Héros 1/1, puis un marqueur +1/+1 sur chacune de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 7)], hand: ["The Crystal's Chosen"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "The Crystal's Chosen"));
      const heroes = idsOf(s, "p1", "battlefield", "Hero");
      expect(heroes).toHaveLength(4);
      expect(heroes.every((id) => counters(s, id) === 1)).toBe(true);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("The Emperor of Palamecia : son mana ne paie que des sorts non-créature ; un marqueur par sort non-créature à quatre mana, puis transformation à trois", () => {
      const EMP = "The Emperor of Palamecia // The Lord Master of Hell";
      const s = scenario({ p1: { battlefield: [EMP, "Forest"], hand: ["Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      let t = scenario({
        p1: { battlefield: [{ name: EMP, counters: { "+1/+1": 1 } }, ...lands("Island", 4)], hand: [sorceryOf(4), sorceryOf(3)] },
      });
      const emp = idOf(t, "p1", "battlefield", EMP);
      t = resolve(cast(t, "p1", "Rituel 3"));
      expect(counters(t, emp)).toBe(1);
      t = scenario({
        p1: { battlefield: [{ name: EMP, counters: { "+1/+1": 2 } }, ...lands("Island", 4)], hand: [sorceryOf(4)] },
      });
      const e2 = idOf(t, "p1", "battlefield", EMP);
      t = resolve(cast(t, "p1", "Rituel 4"));
      expect(counters(t, e2)).toBe(3);
      expect(chars(t, e2).name).toBe("The Lord Master of Hell");
    });

    it("The Lord Master of Hell : en attaquant, X blessures à chaque adversaire (X = cartes non-créature non-terrain de votre cimetière)", () => {
      const EMP = "The Emperor of Palamecia // The Lord Master of Hell";
      let s = scenario({ p1: { battlefield: [EMP], graveyard: ["Opt", "Buster Sword", "Bear Cub", "Forest"] } });
      const lord = idOf(s, "p1", "battlefield", EMP);
      flip(s, lord);
      s = resolve(attack(s, [lord]));
      expect(life(s, "p2")).toBe(18);
    });

    it("The Final Days : deux Horreurs 2/2 engagées ; en flashback, autant que de cartes de créature dans votre cimetière", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["The Final Days"] } });
      s = resolve(cast(s, "p1", "The Final Days"));
      const horrors = idsOf(s, "p1", "battlefield", "Horror");
      expect(horrors).toHaveLength(2);
      expect(horrors.every((id) => s.objects[id]?.tapped)).toBe(true);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 6), graveyard: ["The Final Days", "Bear Cub", "Bear Cub", "Shivan Dragon", "Opt"] },
      });
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "The Final Days") }));
      expect(idsOf(t, "p1", "battlefield", "Horror")).toHaveLength(3);
    });

    it("The Gold Saucer : {2}, {T} : pile ou face, un Trésor si vous gagnez (Edgar fait gagner) ; {3}, {T}, sacrifiez deux artefacts : piochez", () => {
      let s = scenario({ p1: { battlefield: ["The Gold Saucer", "Edgar, King of Figaro", "Plains", "Plains"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "The Gold Saucer"), "Pile ou face"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let t = scenario({ p1: { battlefield: ["The Gold Saucer", trinket, trinket, ...lands("Plains", 3)] } });
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "The Gold Saucer"), "Piochez", {
          sacrifice: idsOf(t, "p1", "battlefield", "Babiole"),
        }),
      );
      expect(hand(t, "p1")).toBe(1);
      expect(idsOf(t, "p1", "graveyard", "Babiole")).toHaveLength(2);
    });

    it("The Prima Vista : vol ; devient une créature-artefact quand vous lancez un sort non-créature à quatre mana ou plus", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["The Prima Vista", ...lands("Island", n)], hand: [sorceryOf(n)] } });
        const t = resolve(cast(s, "p1", `Rituel ${n}`));
        return chars(t, idOf(t, "p1", "battlefield", "The Prima Vista"));
      };
      expect(run(4).types).toContain("Creature");
      expect(run(4).keywords).toContain("flying");
      expect(run(3).types).not.toContain("Creature");
    });

    it("Thief's Knife : +1/+1 et Voleur ; la créature équipée pioche quand elle blesse un joueur en combat", () => {
      let s = scenario({ p1: { battlefield: ["Thief's Knife", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Thief's Knife")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).subtypes).toContain("Rogue");
      s = throughCombat(attack(s, [bear]));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Tidus, Blitzball Star : un marqueur à chaque artefact qui arrive sous votre contrôle ; en attaquant, engage une créature adverse", () => {
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let s = scenario({ p1: { battlefield: ["Tidus, Blitzball Star"], hand: [trinket] }, p2: { battlefield: ["Serra Angel"] } });
      const tidus = idOf(s, "p1", "battlefield", "Tidus, Blitzball Star");
      s = resolve(cast(s, "p1", "Babiole"));
      expect(counters(s, tidus)).toBe(1);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(attack(s, [tidus]), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Tifa's Limit Break : +2/+2 au premier palier, double la force et l'endurance au deuxième", () => {
      const s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Forest", 3)],
          hand: ["Tifa's Limit Break"],
        },
      });
      const card = idOf(s, "p1", "hand", "Tifa's Limit Break");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const tier = (label: string) => castModes(s, card).find((m) => m.label?.includes(label))?.index;
      const a = resolve(act(s, "p1", { type: "cast", card, mode: tier("Saut périlleux"), targets: { t: [bear] } }));
      expect(pt(a, bear)).toEqual([5, 5]);
      const b = resolve(act(s, "p1", { type: "cast", card, mode: tier("Frappe météore"), targets: { t: [bear] } }));
      expect(pt(b, bear)).toEqual([6, 6]);
    });

    it("Tonberry : arrive engagé avec un marqueur d'étourdissement ; initiative et contact mortel pendant votre tour", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Tonberry"] } });
      s = resolve(cast(s, "p1", "Tonberry"));
      const tonberry = idOf(s, "p1", "battlefield", "Tonberry");
      expect(s.objects[tonberry]?.tapped).toBe(true);
      expect(counters(s, tonberry, "stun")).toBe(1);
      expect(chars(s, tonberry).keywords).toEqual(expect.arrayContaining(["firstStrike", "deathtouch"]));
      const t = scenario({ active: "p2", p1: { battlefield: ["Tonberry"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Tonberry")).keywords).not.toContain("deathtouch");
    });

    it("Travel the Overworld : affinité pour les Villes ; piochez quatre cartes", () => {
      let s = scenario({
        p1: {
          battlefield: ["Capital City", "Adventurer's Inn", "Crossroads Village", "Island", "Island"],
          hand: ["Travel the Overworld"],
        },
      });
      const card = idOf(s, "p1", "hand", "Travel the Overworld");
      expect(castable(s, "p1", card)).toBe(true);
      s = resolve(cast(s, "p1", "Travel the Overworld"));
      expect(hand(s, "p1")).toBe(4);
      const t = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Travel the Overworld"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Travel the Overworld"))).toBe(false);
    });

    it("Ultimecia, Time Sorceress : surveillance 2 à l'arrivée ; à l'étape de fin, payez et exilez huit cartes : Ultimecia, Omnipotent (menace) et un tour supplémentaire", () => {
      const ULT = "Ultimecia, Time Sorceress // Ultimecia, Omnipotent";
      let s = scenario({
        p1: { battlefield: ["Island", "Island", "Swamp", "Swamp", "Swamp"], hand: [ULT], library: ["Forest", "Forest", "Opt"] },
      });
      s = resolve(cast(s, "p1", ULT), surveilOf);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      let t = scenario({
        p1: { battlefield: [ULT, ...lands("Island", 6), "Swamp", "Swamp"], graveyard: lands("Forest", 9) },
      });
      const u = idOf(t, "p1", "battlefield", ULT);
      t = play(t, answering(true), (x) => x.turn.number > 3 && x.turn.step === "main1");
      expect(chars(t, u).name).toBe("Ultimecia, Omnipotent");
      expect(chars(t, u).keywords).toContain("menace");
      expect(t.players.p1?.graveyard).toHaveLength(1);
      expect(t.turn.active).toBe("p1");
      // « Quand elle se transforme en Ultimecia, Omnipotent » : aussi quand un autre effet la transforme.
      let v = scenario({ p1: { battlefield: [ULT], hand: [TRANSMUTE] } });
      v = resolve(
        act(v, "p1", {
          type: "cast",
          card: idOf(v, "p1", "hand", "Transmutation"),
          targets: { t: [idOf(v, "p1", "battlefield", ULT)] },
        }),
      );
      expect(chars(v, idOf(v, "p1", "battlefield", ULT)).name).toBe("Ultimecia, Omnipotent");
      expect(v.extraTurns).toEqual(["p1"]);
    });

    it("Ultros, Obnoxious Octopus : sort non-créature à quatre mana : engage et étourdit une créature adverse ; à huit : huit marqueurs +1/+1", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Ultros, Obnoxious Octopus", ...lands("Island", n)], hand: [sorceryOf(n)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(cast(s, "p1", `Rituel ${n}`), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      const four = run(4);
      const angel = idOf(four, "p2", "battlefield", "Serra Angel");
      expect(four.objects[angel]?.tapped).toBe(true);
      expect(counters(four, angel, "stun")).toBe(1);
      expect(counters(four, idOf(four, "p1", "battlefield", "Ultros, Obnoxious Octopus"))).toBe(0);
      const eight = run(8);
      expect(counters(eight, idOf(eight, "p1", "battlefield", "Ultros, Obnoxious Octopus"))).toBe(8);
      const three = run(3);
      expect(three.objects[idOf(three, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(false);
    });

    it("Unexpected Request : vous contrôlez la créature ciblée jusqu'à la fin du tour, dégagée et avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Unexpected Request"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Unexpected Request", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Unexpected Request : l'Équipement est choisi à la résolution (« vous pouvez »), détaché à l'étape de fin (PLAN-D, D7)", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Buster Sword", ...lands("Mountain", 3)], hand: ["Unexpected Request"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = start();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      // Le sort ne cible que la créature.
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Unexpected Request"));
      expect(opt?.type === "cast" ? opt.modes[0]?.targets.map((t) => t.id) : []).toEqual(["t"]);
      const asked: string[] = [];
      s = resolve(cast(s, "p1", "Unexpected Request", { targets: { t: [angel] } }), (req) => {
        if (req.type === "pick" && req.options.includes(sword)) asked.push(...req.options);
        return undefined;
      });
      expect(asked).toEqual([sword]);
      expect(s.objects[sword]?.attachedTo).toBe(angel);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      // Refusé : rien n'est attaché.
      let t = start();
      t = resolve(cast(t, "p1", "Unexpected Request", { targets: { t: [angel] } }), (req) =>
        req.type === "pick" && req.options.includes(sword) ? [] : undefined,
      );
      expect(t.objects[sword]?.attachedTo).toBeUndefined();
    });

    it("Light of Judgment : 6 blessures ; jusqu'à un Équipement attaché à la créature, choisi à la résolution, est détruit (PLAN-D, D7)", () => {
      const start = () => {
        const s = scenario({
          p1: { battlefield: lands("Mountain", 6), hand: ["Light of Judgment"] },
          p2: { battlefield: ["Serra Angel", "Buster Sword", "Buster Sword"] },
        });
        const [a, b] = idsOf(s, "p2", "battlefield", "Buster Sword");
        s.objects[a as string]!.attachedTo = idOf(s, "p2", "battlefield", "Serra Angel");
        bump(s);
        return { s, attached: a as string, loose: b as string };
      };
      const { s: s0, attached, loose } = start();
      const angel = idOf(s0, "p2", "battlefield", "Serra Angel");
      const opt = legalActions(s0, "p1").find((a) => a.type === "cast" && a.card === idOf(s0, "p1", "hand", "Light of Judgment"));
      expect(opt?.type === "cast" ? opt.modes[0]?.targets.map((t) => t.id) : []).toEqual(["c"]);
      const offered: string[] = [];
      const s = resolve(cast(s0, "p1", "Light of Judgment", { targets: { c: [angel] } }), (req) => {
        if (req.type === "pick" && req.options.includes(attached)) offered.push(...req.options);
        return undefined;
      });
      expect(offered).toEqual([attached]);
      expect(s.battlefield).not.toContain(attached);
      expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Buster Sword", "Serra Angel"]);
      expect(s.battlefield).toContain(loose);
      expect(s.battlefield).not.toContain(angel);
      // « Jusqu'à un » : on peut n'en détruire aucun.
      const again = start();
      const t = resolve(cast(again.s, "p1", "Light of Judgment", { targets: { c: [angel] } }), (req) =>
        req.type === "pick" && req.options.includes(again.attached) ? [] : undefined,
      );
      expect(t.battlefield).toContain(again.attached);
    });

    it("Valkyrie Aerial Unit : affinité pour les artefacts ; vol ; surveillance 2 à l'arrivée", () => {
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let s = scenario({
        p1: {
          battlefield: [trinket, trinket, trinket, ...lands("Island", 4)],
          hand: ["Valkyrie Aerial Unit"],
          library: ["Forest", "Forest", "Opt"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Valkyrie Aerial Unit"))).toBe(true);
      s = resolve(cast(s, "p1", "Valkyrie Aerial Unit"), surveilOf);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Valkyrie Aerial Unit")).keywords).toContain("flying");
    });
  });
});

describe("Diamond Weapon : l'Immunité est une prévention de la créature (PLAN-H, H8b)", () => {
  it("seulement les blessures de combat ; si elle perd ses capacités, plus rien n'est prévenu", () => {
    const s = scenario({ p1: { battlefield: ["Diamond Weapon"] } });
    const dw = idOf(s, "p1", "battlefield", "Diamond Weapon");
    const src = { defId: "test", controller: "p2", keywords: [] };
    dealDamage(s, src, dw, 3, true);
    expect(s.objects[dw]?.damage).toBe(0);
    dealDamage(s, src, dw, 2, false);
    expect(s.objects[dw]?.damage).toBe(2);
    addEffect(s, [dw], { loseAllAbilities: true }, "endOfTurn");
    dealDamage(s, src, dw, 3, true);
    expect(s.objects[dw]?.damage).toBe(5);
  });
});
