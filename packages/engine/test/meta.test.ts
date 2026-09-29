/**
 * Cartes du méta Standard (plan P4, phase 1), lot M1 : Harmonie (Winternight Stories), Marchandage choisi par le joueur
 * (Torch the Tower), contempler (Elven Passage), maîtrise de la terre (Ba Sing Se, Earthbender Ascension), « les
 * blessures ne peuvent pas être prévenues », « une ou deux cibles », Surrak, Sunderflock, Hydro-Man, Sandman…
 */

import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { playerStatic } from "../src/statics";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const activate = (s: S, source: string, targets?: Record<string, string[]>) => {
  const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
  return settle(act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets }));
};
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Méta, lot M1", () => {
  describe("Harmonie (Winternight Stories)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Island", "Fire Elemental"], graveyard: ["Winternight Stories"], library: lands("Forest", 5) },
      });

    it("lancée depuis le cimetière en engageant une créature : sa force réduit le coût, puis la carte est exilée", () => {
      let s = setup();
      const card = idOf(s, "p1", "graveyard", "Winternight Stories");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.additional?.tap?.options).toEqual([fire]);
      expect(opt?.type === "cast" && opt.additional?.tap?.suggested).toEqual([fire]);
      s = settle(act(s, "p1", { type: "cast", card, tap: [fire] }));
      expect(s.objects[fire]?.tapped).toBe(true);
      // Piochez trois cartes, puis défaussez-en deux (pas de carte de créature).
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Winternight Stories")).toBe(true);
    });

    it("sans créature engagée, le coût d'harmonie {4}{U} est payé en entier", () => {
      const s = setup();
      const card = idOf(s, "p1", "graveyard", "Winternight Stories");
      expect(() => act(s, "p1", { type: "cast", card, tap: [] })).toThrow(/Mana/);
      // Sans `tap`, le choix par défaut (la créature suggérée) s'applique.
      const after = settle(act(s, "p1", { type: "cast", card }));
      expect(after.objects[idOf(s, "p1", "battlefield", "Fire Elemental")]?.tapped).toBe(true);
    });

    it("une créature engagée ne peut pas réduire le coût d'un sort lancé depuis la main", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Fire Elemental"], hand: ["Winternight Stories"] },
      });
      const card = idOf(s, "p1", "hand", "Winternight Stories");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      expect(() => act(s, "p1", { type: "cast", card, tap: [fire] })).toThrow(/engager/);
    });
  });

  describe("Marchandage (Torch the Tower)", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Mountain", "Fishing Pole", "Adventuring Gear"],
          hand: ["Torch the Tower"],
          library: lands("Forest", 3),
        },
        p2: { battlefield: ["Fire Elemental", "Bear Cub"] },
      });

    it("le joueur choisit le permanent sacrifié ; 3 blessures et regard 1", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const gear = idOf(s, "p1", "battlefield", "Adventuring Gear");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.kickerAffordable).toBe(true);
      expect(opt?.type === "cast" && opt.kickerPermanents).toHaveLength(2);
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [fire] }, kicked: true, sacrifice: [gear] }));
      expect(idsOf(s, "p1", "graveyard", "Adventuring Gear")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Fishing Pole")).toHaveLength(1);
      expect(s.objects[fire]?.damage).toBe(3);
    });

    it("sans marchander : 2 blessures ; une créature qu'il tue est exilée", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [fire] } }));
      expect(s.objects[fire]?.damage).toBe(2);
      let t = setup();
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Torch the Tower"), targets: { t: [bear] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
      expect(t.exile.some((id) => t.objects[id]?.owner === "p2")).toBe(true);
    });

    it("un permanent qui ne peut pas payer le marchandage est refusé", () => {
      const s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [fire] }, kicked: true, sacrifice: [mountain] })).toThrow(
        /Permanent invalide/,
      );
    });
  });

  it("Elven Passage : le terrain cherché est dégagé si l'on contemple un Elfe (main ou champ de bataille)", () => {
    const run = (hand: string[]) => {
      let s = scenario({ p1: { battlefield: ["Elven Passage"], hand, library: ["Forest", "Island"] } });
      s = activate(s, idOf(s, "p1", "battlefield", "Elven Passage"));
      const forest = idOf(s, "p1", "battlefield", "Forest");
      return { tapped: s.objects[forest]?.tapped, life: s.players.p1?.life };
    };
    expect(run(["Llanowar Elves"])).toEqual({ tapped: false, life: 19 });
    expect(run(["Bear Cub"])).toEqual({ tapped: true, life: 19 });
  });

  describe("Maîtrise de la terre", () => {
    it("Ba Sing Se : le terrain devient une créature 2/2 avec la célérité, et revient engagé quand il meurt", () => {
      let s = scenario({
        p1: { battlefield: ["Ba Sing Se", ...lands("Forest", 3), "Mountain"], hand: ["Burst Lightning"] },
      });
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      const target = forests[2] as string;
      s = activate(s, idOf(s, "p1", "battlefield", "Ba Sing Se"), { t: [target] });
      const c = chars(s, target);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect([c.power, c.toughness]).toEqual([2, 2]);
      expect(c.keywords).toContain("haste");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [target] } }));
      const back = idsOf(s, "p1", "battlefield", "Forest");
      expect(back).toHaveLength(3);
      const returned = back.find((id) => !forests.includes(id)) as string;
      expect(s.objects[returned]?.tapped).toBe(true);
      expect(chars(s, returned).types).toEqual(["Land"]);
    });

    it("Ba Sing Se arrive engagé sauf si vous contrôlez un terrain de base", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Ba Sing Se"] } });
        const card = idOf(s, "p1", "hand", "Ba Sing Se");
        s = act(s, "p1", { type: "playLand", card });
        return s.objects[idOf(s, "p1", "battlefield", "Ba Sing Se")]?.tapped;
      };
      expect(play([])).toBe(true);
      expect(play(["Forest"])).toBe(false);
    });

    it("Earthbender Ascension : au quatrième marqueur de quête, +1/+1 et piétinement", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Bear Cub"],
          hand: ["Earthbender Ascension", "Forest"],
          library: lands("Forest", 5),
        },
      });
      const first = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Earthbender Ascension") }));
      // Arrivée : maîtrise de la terre 2, puis un terrain de base arrive (landfall : premier marqueur).
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      const asc = idOf(s, "p1", "battlefield", "Earthbender Ascension");
      expect(s.objects[asc]?.counters.quest).toBe(1);
      expect(chars(s, first).types).toContain("Creature");
      (s.objects[asc] as { counters: Record<string, number> }).counters.quest = 3;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(s.objects[asc]?.counters.quest).toBe(4);
      const pumped = [bear, first].filter((id) => chars(s, id).keywords.includes("trample"));
      expect(pumped).toHaveLength(1);
    });
  });

  it("Impractical Joke : les blessures ne peuvent pas être prévenues ce tour-ci, 3 blessures à la cible", () => {
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Impractical Joke"] }, p2: { battlefield: ["Fire Elemental"] } });
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Impractical Joke"), targets: { t: [fire] } }));
    expect(s.objects[fire]?.damage).toBe(3);
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(false);
  });

  it("Prismari Charm : « une ou deux cibles » (au moins une)", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Prismari Charm"] }, p2: { battlefield: ["Bear Cub"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Prismari Charm");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [] } })).toThrow(/Cible manquante/);
    const one = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: ["p2"] } }));
    expect(one.players.p2?.life).toBe(19);
    const two = settle(act(setup(), "p1", { type: "cast", card, mode: 1, targets: { t: ["p2", bear] } }));
    expect(two.players.p2?.life).toBe(19);
    expect(two.objects[bear]?.damage).toBe(1);
  });

  it("Surrak : piochez quand un adversaire cible un sort de créature que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: ["Surrak, Elusive Hunter", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      p2: { battlefield: ["Island"], hand: ["Spell Snare"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Spell Snare"), targets: { t: [spell] } });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Sunderflock : coûte moins avec un Élémental ; renvoie les créatures non-Élémentaux", () => {
    let s = scenario({
      p1: { battlefield: ["Fire Elemental", ...lands("Island", 3), "Llanowar Elves"], hand: ["Sunderflock"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sunderflock") }));
    expect(idsOf(s, "p1", "battlefield", "Sunderflock")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Hearth Elemental : {X} de moins par éphémère, rituel ou carte à Aventure du cimetière", () => {
    const s = scenario({
      p1: {
        battlefield: lands("Mountain", 2),
        hand: ["Hearth Elemental // Stoke Genius"],
        graveyard: ["Opt", "Burst Lightning", "Hearth Elemental // Stoke Genius", "Bear Cub"],
      },
    });
    const card = idOf(s, "p1", "hand", "Hearth Elemental // Stoke Genius");
    // {5}{R} − 3 = {2}{R} : pas payable avec deux Montagnes ; avec une de plus, oui.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card && a.face === undefined)).toBe(false);
    const t = scenario({
      p1: {
        battlefield: lands("Mountain", 3),
        hand: ["Hearth Elemental // Stoke Genius"],
        graveyard: ["Opt", "Burst Lightning", "Hearth Elemental // Stoke Genius", "Bear Cub"],
      },
    });
    const card2 = idOf(t, "p1", "hand", "Hearth Elemental // Stoke Genius");
    expect(legalActions(t, "p1").some((a) => a.type === "cast" && a.card === card2 && a.face === undefined)).toBe(true);
  });

  it("Hydro-Man : à votre étape de fin, devient un terrain (« {T} : ajoutez {U} ») jusqu'à votre prochain tour", () => {
    let s = scenario({ p1: { battlefield: ["Hydro-Man, Fluid Felon"] } });
    const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const land = chars(s, hydro);
    expect(land.types).toEqual(["Land"]);
    expect(land.abilities.some((a) => a.kind === "mana")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, hydro).types).toEqual(["Creature"]);
  });

  it("Sandman : F/E = terrains contrôlés ; revient du cimetière avec une carte de terrain", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 5),
        graveyard: ["Sandman, Shifting Scoundrel", "Island"],
      },
    });
    const sandman = idOf(s, "p1", "graveyard", "Sandman, Shifting Scoundrel");
    const island = idOf(s, "p1", "graveyard", "Island");
    s = activate(s, sandman, { t: [island] });
    const back = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
    expect(s.objects[back]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    expect(chars(s, back).power).toBe(6);
    expect(chars(s, back).keywords).toContain("cantBeBlockedByPowerLE2");
  });

  it("Leatherhead arrive avec un marqueur de défense talismanique", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Leatherhead, Swamp Stalker"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Leatherhead, Swamp Stalker") }));
    const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
    expect(s.objects[lh]?.counters.hexproof).toBe(1);
    expect(chars(s, lh).keywords).toEqual(expect.arrayContaining(["hexproof", "trample"]));
  });

  it("Great Hall of the Biblioplex : {5} en fait une créature Sorcier 2/4 qui grandit avec les éphémères", () => {
    let s = scenario({
      p1: { battlefield: ["Great Hall of the Biblioplex", ...lands("Island", 6)], hand: ["Opt"], library: lands("Island", 3) },
    });
    const hall = idOf(s, "p1", "battlefield", "Great Hall of the Biblioplex");
    const opts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === hall);
    const animate = opts.find((a) => a.type === "activate" && a.label?.includes("Sorcier"));
    s = settle(act(s, "p1", { type: "activate", source: hall, ability: animate?.type === "activate" ? animate.ability : -1 }));
    expect([chars(s, hall).power, chars(s, hall).toughness]).toEqual([2, 4]);
    expect(chars(s, hall).subtypes).toContain("Wizard");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }));
    expect(chars(s, hall).power).toBe(3);
  });

  it("Sapling Nursery : affinité pour les Forêts, un Sylvin 3/4 à chaque terrain", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Sapling Nursery", "Forest"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sapling Nursery") }));
    expect(idsOf(s, "p1", "battlefield", "Sapling Nursery")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const tree = idOf(s, "p1", "battlefield", "Treefolk");
    expect([chars(s, tree).power, chars(s, tree).toughness]).toEqual([3, 4]);
    expect(chars(s, tree).keywords).toContain("reach");
  });
});

describe("Méta, lot M2", () => {
  it("Requiting Hex : flétrir 1 (créature choisie) en coût facultatif, puis 2 PV", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Bear Cub", "Fire Elemental"], hand: ["Requiting Hex"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Requiting Hex"),
        targets: { t: [elves] },
        kicked: true,
        sacrifice: [fire],
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[fire]?.counters["-1/-1"]).toBe(1);
    expect(s.players.p1?.life).toBe(22);
  });

  it("We Say Thee Nay! : Travail d'équipe 2 (créatures engagées) : il faut payer {4}", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island", "Bear Cub"], hand: ["We Say Thee Nay!"] },
      p2: { battlefield: [...lands("Mountain", 7)], hand: ["Fire Elemental"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Fire Elemental") });
    // Il reste deux Montagnes à p2 après l'Élémental : assez pour {2}, pas pour {4}.
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    const opt = castOption(s, idOf(s, "p1", "hand", "We Say Thee Nay!"));
    expect(opt?.type === "cast" && opt.kickerTap?.minPower).toBe(2);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "We Say Thee Nay!"),
      targets: { t: [spell] },
      kicked: true,
      tap: [bear],
    });
    expect(s.objects[bear]?.tapped).toBe(true);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
  });

  it("Azog : détruit une créature, son contrôleur amasse des Gobelins X (sa force)", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Azog, Moria's Ruin") }));
    const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
    expect(s.objects[army]?.controller).toBe("p2");
    expect(chars(s, army).subtypes).toContain("Goblin");
    expect(chars(s, army).power).toBe(5);
  });

  it("Wan Shi Tong : X marqueurs, X/2 cartes ; un adversaire qui cherche lui donne un marqueur et une carte", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Wan Shi Tong, Librarian"], library: lands("Island", 5) },
      p2: { battlefield: ["Evolving Wilds"], library: ["Forest", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Wan Shi Tong, Librarian"), x: 4 }));
    const wan = idOf(s, "p1", "battlefield", "Wan Shi Tong, Librarian");
    expect(s.objects[wan]?.counters["+1/+1"]).toBe(4);
    expect(s.players.p1?.hand).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const wilds = idOf(s, "p2", "battlefield", "Evolving Wilds");
    const a = legalActions(s, "p2").find((x) => x.type === "activate" && x.source === wilds);
    s = passAccepting(
      act(s, "p2", { type: "activate", source: wilds, ability: a?.type === "activate" ? a.ability : -1 }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    expect(s.objects[wan]?.counters["+1/+1"]).toBe(5);
  });

  it("Wolverine : de nouvelles blessures guérissent les précédentes", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Wolverine, Fierce Fighter", damage: 4 }, "Mountain"], hand: ["Burst Lightning"] },
    });
    const w = idOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [w] } }));
    expect(idsOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter")).toHaveLength(1);
    expect(s.objects[w]?.damage).toBe(2);
  });

  it("Day of Black Sun : les créatures de VM X ou moins perdent leurs capacités et sont détruites", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Day of Black Sun"] },
      p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Day of Black Sun"), x: 2 }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(1);
  });

  it("Mutagen Man : X Mutagènes, dont la capacité coûte {1} de moins ; The Ooze : un Mutagène par marqueur", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "The Ooze", "Bear Cub"], hand: ["Mutagen Man, Living Ooze"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mutagen Man, Living Ooze"), x: 2 }));
    const mutagens = idsOf(s, "p1", "battlefield", "Mutagen");
    expect(mutagens).toHaveLength(2);
    // Toutes les Forêts sont engagées : la capacité {1} ne coûte plus rien.
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === mutagens[0]);
    expect(a).toBeDefined();
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: mutagens[0] as string,
        ability: a?.type === "activate" ? a.ability : -1,
        targets: { t: [bear] },
      }),
    );
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Hidden Lair : {U} ou {B} seulement l'arrivée ce tour-ci ou avec un terrain de base", () => {
    const colors = (battlefield: string[]) => {
      const s = scenario({ p1: { battlefield } });
      const lair = idOf(s, "p1", "battlefield", "Hidden Lair");
      return legalActions(s, "p1")
        .filter((a) => a.type === "tapForMana" && a.source === lair)
        .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    };
    expect(colors(["Hidden Lair"])).toEqual(["C"]);
    expect(colors(["Hidden Lair", "Island"])).toEqual(expect.arrayContaining(["C", "U", "B"]));
  });

  it("Strategic Betrayal : l'adversaire exile une créature et son cimetière", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Strategic Betrayal"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Opt", "Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Strategic Betrayal"), targets: { t: ["p2"] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(3);
  });

  it("The Wondrous Wasp : la créature engagée perd ses capacités tant que la Guêpe reste", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["The Wondrous Wasp"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Wondrous Wasp") }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(chars(s, angel).keywords).not.toContain("flying");
  });
});
