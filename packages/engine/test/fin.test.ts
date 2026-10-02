/**
 * Final Fantasy, lot A : job select, tiered, « si au moins quatre mana ont été dépensés », Syncopate, Villes à aventure.
 */
import { describe, expect, it } from "vitest";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  cast,
  castNowOf,
  idOf,
  idsOf,
  namesIn,
  passAccepting,
  passBoth,
  scenario,
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

  it("Zack Fair : arrive avec un marqueur ; sacrifié, donne l'indestructible, ses marqueurs et son Équipement", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Buster Sword", ...lands("Plains", 2)], hand: ["Zack Fair"] } });
    s = settle(cast(s, "p1", "Zack Fair"));
    const zack = idOf(s, "p1", "battlefield", "Zack Fair");
    expect(s.objects[zack]?.counters["+1/+1"]).toBe(1);
    const sword = idOf(s, "p1", "battlefield", "Buster Sword");
    s.objects[sword]!.attachedTo = zack;
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
    s = settle(s);
    expect(chars(s, bear).keywords).toContain("indestructible");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[sword]?.attachedTo).toBe(bear);
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
