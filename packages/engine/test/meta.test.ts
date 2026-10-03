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
import { act, advanceUntil, idOf, idsOf, passAccepting, passUntil, scenario } from "./helpers";

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
    expect(chars(s, back).blockRules.map((r) => r.cantBeBlockedBy)).toContainEqual({ maxPower: 2 });
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

describe("Méta, lot M3", () => {
  it("Deceit évoqué avec {U}{U} : renvoie un permanent, puis il est sacrifié", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Deceit"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Deceit");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card, alternative: true });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    // Choix des cibles de la capacité ({U}{U} dépensé) : l'Ourson.
    for (let i = 0; i < 10 && s.pending?.kind === "choice"; i++) {
      const p = s.pending;
      const r = p.request;
      const values = r.type === "pick" && r.options.includes(bear) ? [bear] : r.suggested;
      s = act(s, p.player, { type: "choose", values });
    }
    s = settle(s);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Deceit")).toHaveLength(1);
  });

  it("Deceit évoqué : le joueur choisit la couleur du mana hybride ({U}{U} : renvoi seul ; {B}{B} : défausse seule)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Deceit"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Shivan Dragon"] },
      });
    const run = (s: GameState, hybridAs: "U" | "B" | "G") => {
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let t = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deceit"), alternative: true, hybridAs });
      t = passAccepting(t, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      for (let i = 0; i < 10 && t.pending?.kind === "choice"; i++) {
        const r = t.pending.request;
        t = act(t, t.pending.player, {
          type: "choose",
          values: r.type === "pick" && r.options.includes(bear) ? [bear] : r.suggested,
        });
      }
      return settle(t);
    };
    const s0 = setup();
    const opt = castOption(s0, idOf(s0, "p1", "hand", "Deceit"));
    expect(opt?.type === "cast" && opt.hybridColors).toEqual(["U", "B"]);
    const u = run(setup(), "U");
    expect(idsOf(u, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(u, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    const b = run(setup(), "B");
    expect(idsOf(b, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(b, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    // Une couleur que l'hybride ne permet pas est refusée.
    expect(() => run(setup(), "G")).toThrow(/hybride/);
  });

  it("Captain Marvel : la montée en puissance coûte {2} le tour de son arrivée, une seule fois", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Captain Marvel, Earth's Protector"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Captain Marvel, Earth's Protector") }));
    const cm = idOf(s, "p1", "battlefield", "Captain Marvel, Earth's Protector");
    s = activate(s, cm);
    expect(s.objects[cm]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[cm]?.counters.indestructible).toBe(1);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === cm)).toBe(false);
  });

  it("Voice of Victory : Mobilisation 2 ; vos adversaires ne lancent pas de sorts pendant votre tour", () => {
    let s = scenario({
      p1: { battlefield: ["Voice of Victory"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const voice = idOf(s, "p1", "battlefield", "Voice of Victory");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voice, defender: "p2" }] });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(0);
  });

  it("Petrified Hamlet : le nom choisi bloque les capacités non de mana et donne « {T} : {C} »", () => {
    let s = scenario({ p1: { hand: ["Petrified Hamlet"] }, p2: { battlefield: ["Rogue's Passage", ...lands("Forest", 4)] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Petrified Hamlet") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: ["Rogue's Passage"] }));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const passage = idOf(s, "p2", "battlefield", "Rogue's Passage");
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === passage)).toBe(false);
    expect(chars(s, passage).abilities.filter((a) => a.kind === "mana").length).toBe(2);
  });

  it("Superior Spider-Man : copie d'une carte de créature d'un cimetière, 4/4 et de son nom ; la carte est exilée", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Superior Spider-Man"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const angel = s.players.p2?.graveyard[0] as string;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Superior Spider-Man") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: [angel] }));
    const spidey = s.battlefield.find(
      (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
    ) as string;
    const c = chars(s, spidey);
    expect(c.name).toBe("Superior Spider-Man");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Angel", "Spider", "Hero"]));
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Deadly Cover-Up : preuves 6, détruit toutes les créatures, exile une carte et ses homonymes, pioche pour la main", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Deadly Cover-Up"], graveyard: ["Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Opt"], hand: ["Opt", "Forest"], library: ["Opt", "Island", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deadly Cover-Up"), kicked: true }));
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const names = (ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names(s.players.p2?.hand ?? [])).not.toContain("Opt");
    // Une carte de la main exilée : une carte piochée.
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(names(s.players.p2?.library ?? [])).not.toContain("Opt");
  });

  it("Erode : le contrôleur de la créature détruite cherche un terrain de base", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Erode"] },
      p2: { battlefield: ["Bear Cub"], library: ["Forest", "Opt"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Erode"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
  });
});

describe("Méta, lot M4", () => {
  it("Multiversal Passage : une option par type de terrain de base ; il en a le type et le mana", () => {
    let s = scenario({ p1: { hand: ["Multiversal Passage"] } });
    const card = idOf(s, "p1", "hand", "Multiversal Passage");
    const opts = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card);
    expect(opts).toHaveLength(10);
    s = act(s, "p1", { type: "playLand", card, payLife: true, landType: "Island" });
    const p = idOf(s, "p1", "battlefield", "Multiversal Passage");
    expect(s.objects[p]?.tapped).toBe(false);
    expect(chars(s, p).subtypes).toContain("Island");
    expect(s.players.p1?.life).toBe(18);
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === p && a.colors.includes("U"))).toBe(true);
  });

  it("Together as One : X = couleurs de mana dépensées", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Island", "Swamp", ...lands("Mountain", 3)],
        hand: ["Together as One"],
        library: lands("Forest", 5),
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Together as One"), targets: { p: ["p1"], d: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
    expect(s.players.p1?.life).toBe(24);
    expect(s.players.p1?.hand).toHaveLength(4);
  });

  it("Clarion Conqueror : même les capacités de mana des créatures sont bloquées", () => {
    const s = scenario({ p1: { battlefield: ["Llanowar Elves"] }, p2: { battlefield: ["Clarion Conqueror"] } });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(false);
  });

  it("Thor : un sort non-créature inflige autant de blessures que sa valeur de mana", () => {
    let s = scenario({
      p1: { battlefield: ["Thor, God of Thunder", ...lands("Mountain", 3)], hand: ["Fiery Annihilation"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fiery Annihilation"), targets: { t: [bear] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["p2"] });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
  });

  it("The Mind Stone : exploitée, elle fait sortir et revenir un permanent à votre étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["The Mind Stone", ...lands("Plains", 6), { name: "Bear Cub", sick: false }] } });
    const stone = idOf(s, "p1", "battlefield", "The Mind Stone");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === stone);
    s = settle(act(s, "p1", { type: "activate", source: stone, ability: opt?.type === "activate" ? opt.ability : -1 }));
    expect(s.objects[stone]?.harnessed).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[bear]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Jeskai Revelation : renvoie un sort en main", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), ...lands("Mountain", 2), ...lands("Plains", 2)],
        hand: ["Jeskai Revelation"],
        library: lands("Island", 4),
      },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Jeskai Revelation"), targets: { b: [spell], d: ["p2"] } }),
    );
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Monk")).toHaveLength(2);
    expect(s.players.p2?.life).toBe(16);
  });

  it("The Legend of Roku : trois chapitres, puis Avatar Roku (maîtrise du feu 4)", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["The Legend of Roku // Avatar Roku"], library: lands("Mountain", 10) },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Legend of Roku // Avatar Roku") }));
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p1")).toHaveLength(3);
    for (let i = 0; i < 3; i++)
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > (i === 0 ? 3 : 3 + 2 * i));
    const roku = s.battlefield.find((id) => chars(s, id).name === "Avatar Roku");
    expect(roku).toBeDefined();
  });

  it("Magmatic Hellkite : détruit un terrain non de base ; son contrôleur reçoit un terrain de base engagé avec un marqueur d'étourdissement", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Magmatic Hellkite"] },
      p2: { battlefield: ["Hidden Lair"], library: ["Island", "Opt"] },
    });
    const lair = idOf(s, "p2", "battlefield", "Hidden Lair");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Magmatic Hellkite") }));
    expect(s.objects[lair]).toBeUndefined();
    const island = idOf(s, "p2", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    expect(s.objects[island]?.counters.stun).toBe(1);
  });
});

describe("Méta, lot M5", () => {
  it("Storied : trois artefacts ou légendaires donnent un récit durable ; Thorin Oakenshield donne la garde {1}", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Skateboard", "Fishing Pole"],
        hand: ["Thorin Oakenshield"],
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thorin Oakenshield") }));
    expect(playerStatic(s, "p1", "enduringStory")).toBe(true);
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    expect(chars(s, pole).abilities.some((a) => a.kind === "triggered" && a.trigger.on === "becomesTarget")).toBe(true);
  });

  it("Faufilement : The Last Ronin's Technique, un attaquant non bloqué rentre ; trois Esprits engagés et attaquants", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["The Last Ronin's Technique"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1");
    const card = idOf(s, "p1", "hand", "The Last Ronin's Technique");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card, alternative: true });
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    s = passAccepting(s, (x) => x.stack.length === 0);
    const spirits = idsOf(s, "p1", "battlefield", "Ninja Turtle Spirit");
    expect(spirits).toHaveLength(3);
    expect(spirits.every((id) => s.combat?.attackers.some((a) => a.id === id))).toBe(true);
  });

  it("Chaos : Carnage défaussée ce tour-ci se lance depuis le cimetière pour {B}{R}", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Mountain", "Iron-Shield Elf"], hand: ["Carnage, Crimson Chaos"] } });
    const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
    s = activate(s, elf);
    if (s.pending?.kind === "choice")
      s = settle(act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "Carnage, Crimson Chaos")] }));
    const carnage = idOf(s, "p1", "graveyard", "Carnage, Crimson Chaos");
    expect(castOption(s, carnage)).toBeDefined();
  });

  it("Paradigme : Decorum Dissertation est exilée ; un emblème en lance une copie à votre phase principale suivante", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Decorum Dissertation"], library: lands("Swamp", 10) } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Decorum Dissertation"), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Decorum Dissertation")).toBe(true);
    // Au début de votre phase principale suivante, l'emblème propose de lancer une copie : on la lance.
    s = advanceUntil(s, (x) => (x.pending?.kind === "priority" && !!x.pending.castNow) || x.turn.number > 5);
    const now = s.pending?.kind === "priority" ? s.pending.castNow : undefined;
    expect(now).toBeDefined();
    s = act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Pyrrhic Strike : « les deux » exige de flétrir 2", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 3), "Fire Elemental"], hand: ["Pyrrhic Strike"] },
        p2: { battlefield: ["Fishing Pole", "Shivan Dragon"] },
      });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Pyrrhic Strike");
    const targets = { a: [idOf(s, "p2", "battlefield", "Fishing Pole")], c: [idOf(s, "p2", "battlefield", "Shivan Dragon")] };
    expect(() => act(s, "p1", { type: "cast", card, mode: 2, targets })).toThrow(/coût additionnel/);
    const t = settle(act(setup(), "p1", { type: "cast", card, mode: 2, targets, kicked: true }));
    expect(idsOf(t, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Fire Elemental")]?.counters["-1/-1"]).toBe(2);
  });

  it("Dragonfire Blade : Équiper {4} coûte {1} de moins par couleur ; défense contre le monocolore", () => {
    let s = scenario({ p1: { battlefield: ["Dragonfire Blade", "Swiftblade Vindicator", "Plains", "Mountain"] } });
    const blade = idOf(s, "p1", "battlefield", "Dragonfire Blade");
    const vind = idOf(s, "p1", "battlefield", "Swiftblade Vindicator");
    s = activate(s, blade, { t: [vind] });
    expect(s.objects[blade]?.attachedTo).toBe(vind);
    expect(chars(s, vind).protections.map((p) => p.from)).toContainEqual({ colorCount: 1 });
  });

  it("Bilbo's Gambit avec le cadeau : plus aucun sort ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Bilbo's Gambit", "Opt"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bilbo's Gambit"), targets: { t: [spell] }, kicked: true });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
  });

  it("Case of the Uneaten Feast résolue : les créatures du cimetière se lancent ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 2)], graveyard: ["Bear Cub"] } });
    const caseId = idOf(s, "p1", "battlefield", "Case of the Uneaten Feast");
    (s.objects[caseId] as { solved?: boolean }).solved = true;
    s.version += 1;
    s = activate(s, caseId);
    expect(castOption(s, idOf(s, "p1", "graveyard", "Bear Cub"))).toBeDefined();
  });

  it("Belladonna Took : 1 PV, puis une carte, puis des marqueurs, au fil des jetons du tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Belladonna Took", ...lands("Mountain", 6)],
        hand: ["Dragon Fodder", "Dragon Fodder"],
        library: lands("Forest", 4),
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Fodder") }));
    expect(s.players.p1?.life).toBe(21);
    expect(s.players.p1?.hand).toHaveLength(2);
  });
});

describe("Méta, lot M6", () => {
  it("Maîtrise de l'air : Aang exile une créature, que son propriétaire peut relancer pour {2}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Island"], hand: ["Aang, Swift Savior // Aang and La, Ocean's Fury"] },
      p2: { battlefield: ["Serra Angel", ...lands("Forest", 2)] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Aang, Swift Savior // Aang and La, Ocean's Fury") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    for (let i = 0; i < 5 && s.pending?.kind === "choice"; i++) {
      const r = s.pending.request;
      s = act(s, "p1", { type: "choose", values: r.type === "pick" && r.options.includes(angel) ? [angel] : r.suggested });
    }
    s = settle(s);
    const exiled = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel") as string;
    expect(exiled).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === exiled);
    expect(opt).toBeDefined();
    s = settle(act(s, "p2", { type: "cast", card: exiled }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Springleaf Drum : engage une créature pour du mana de n'importe quelle couleur", () => {
    const s = scenario({ p1: { battlefield: ["Springleaf Drum", "Bear Cub"] } });
    const drum = idOf(s, "p1", "battlefield", "Springleaf Drum");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === drum)).toBe(true);
    const t = scenario({ p1: { battlefield: ["Springleaf Drum", "Fishing Pole"] } });
    const drum2 = idOf(t, "p1", "battlefield", "Springleaf Drum");
    expect(legalActions(t, "p1").some((a) => a.type === "tapForMana" && a.source === drum2)).toBe(false);
  });

  it("Head of the Hunt : une créature adverse qui meurt est exilée, et vous créez un Loup", () => {
    let s = scenario({
      p1: { battlefield: ["Head of the Hunt", "Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Burst Lightning"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Wolf")).toHaveLength(1);
  });

  it("The End : exile la cible et ses homonymes ; son contrôleur pioche pour ceux de sa main", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["The End"] },
      p2: {
        battlefield: ["Bear Cub"],
        hand: ["Bear Cub", "Opt"],
        graveyard: ["Bear Cub"],
        library: ["Bear Cub", "Island", "Island"],
      },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "The End"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    const bears = s.exile.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub");
    expect(bears).toHaveLength(4);
    expect(s.players.p2?.hand).toHaveLength(2);
  });

  it("Vicious Rivalry : X se paie en points de vie ; détruit les artefacts et créatures de VM X ou moins", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Vicious Rivalry"] },
      p2: { battlefield: ["Bear Cub", "Fishing Pole", "Serra Angel"] },
    });
    const opt = castOption(s, idOf(s, "p1", "hand", "Vicious Rivalry"));
    expect(opt?.type === "cast" && opt.xMax).toBe(20);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vicious Rivalry"), x: 2 }));
    expect(s.players.p1?.life).toBe(18);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Michelangelo's Technique : deux créatures de valeur de mana totale 6 ou moins", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Michelangelo's Technique"],
          library: ["Shivan Dragon", "Llanowar Elves", "Serra Angel", ...lands("Forest", 5)],
        },
      });
    let s = setup();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Michelangelo's Technique") });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const lib = s.players.p1?.library ?? [];
    const dragon = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon") as string;
    const angel = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel") as string;
    const elves = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Llanowar Elves") as string;
    expect(() => act(s, "p1", { type: "choose", values: [dragon, angel] })).toThrow(/totale/);
    s = settle(act(s, "p1", { type: "choose", values: [angel, elves] }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Gollum : chaque sort adverse de la parité choisie donne un mode pas encore choisi", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Gollum, Riddle Master"], library: lands("Swamp", 5) },
      p2: { battlefield: lands("Forest", 4), hand: ["Bear Cub", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Gollum, Riddle Master") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: ["even"] }));
    const gollum = idOf(s, "p1", "battlefield", "Gollum, Riddle Master");
    expect(s.objects[gollum]?.chosen?.parity).toBe("even");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    for (let i = 0; i < 2; i++) {
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p2");
    }
    // Deux modes différents parmi les trois : jamais deux fois le même.
    const effects = [
      (s.objects[gollum]?.counters["+1/+1"] ?? 0) > 0,
      (s.players.p2?.life ?? 20) < 20,
      (s.players.p1?.hand.length ?? 0) > 0,
    ];
    expect(effects.filter(Boolean)).toHaveLength(2);
  });

  it("Ral Zarek −7 : l'adversaire passe autant de tours que de piles obtenues", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Ral Zarek, Guest Lecturer" }] } });
    const ral = idOf(s, "p1", "battlefield", "Ral Zarek, Guest Lecturer");
    (s.objects[ral] as { counters: Record<string, number> }).counters.loyalty = 7;
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ral && a.label?.includes("Cinq"));
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: ral,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: ["p2"] },
      }),
    );
    const skips = s.playerEffects.filter((e) => e.player === "p2" && e.ability.skipTurn).length;
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.step === "main1");
    expect(s.turn.active).toBe(skips > 0 ? "p1" : "p2");
  });

  it("Jennifer Walters se transforme en The Sensational She-Hulk", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), ...lands("Plains", 4), "Jennifer Walters // The Sensational She-Hulk"] },
    });
    const jen = idOf(s, "p1", "battlefield", "Jennifer Walters // The Sensational She-Hulk");
    s = activate(s, jen);
    expect(chars(s, jen).name).toBe("The Sensational She-Hulk");
    expect(chars(s, jen).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
  });

  it("Spider-Sense : contrecarre une capacité déclenchée", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Spider-Sense"] },
      p2: { battlefield: [...lands("Swamp", 1)], hand: ["Dream Beavers"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Dream Beavers") });
    s = passUntil(
      s,
      (x) =>
        x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
    const trig = s.stack[0]?.id as string;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Spider-Sense"), targets: { t: [trig] } }));
    expect(s.players.p1?.life).toBe(20);
  });
});
