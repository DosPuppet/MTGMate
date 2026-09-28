/**
 * Bloomburrow : Progéniture, Cadeau (cibles propres au cadeau, cadeau d'un permanent), Fourrager (effet, coût d'activation,
 * coût alternatif), Dépense, Vaillance, modes « patte », prouesse accordée, Mockingbird, Vren, Sunspine Lynx.
 */
import { describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castOption = (s: S, name: string) => {
  const card = idOf(s, "p1", "hand", name);
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
  return { card, opt: opt?.type === "cast" ? opt : undefined };
};

describe("Bloomburrow", () => {
  it("Progéniture : payée, la créature crée un jeton 1/1 copie d'elle-même", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Intrepid Rabbit"] } });
    const { card, opt } = castOption(s, "Intrepid Rabbit");
    expect(opt?.kickerPrompt?.with).toBe("Progéniture {1}");
    s = act(s, "p1", { type: "cast", card, kicked: true });
    s = settle(s);
    const rabbits = idsOf(s, "p1", "battlefield", "Intrepid Rabbit");
    expect(rabbits).toHaveLength(2);
    const token = rabbits.find((id) => s.objects[id]?.isToken) as string;
    expect(s.defs[s.objects[token]?.defId ?? ""]?.name).toBe("Intrepid Rabbit");
    // Le jeton est 1/1 (plus l'éventuel +1/+1 de son propre déclencheur d'arrivée jusqu'à la fin du tour).
    expect(s.effects.some((e) => e.affected.includes(token) && e.setPower === 1 && e.setToughness === 1)).toBe(true);
  });

  it("Progéniture non payée : pas de jeton", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Intrepid Rabbit"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Intrepid Rabbit") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Intrepid Rabbit")).toHaveLength(1);
  });

  it("Cadeau d'une Nourriture : l'adversaire la reçoit, et « si le cadeau n'a pas été promis » s'inverse", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Jolly Gerbils"], hand: ["Nocturnal Hunger"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
    let s = setup();
    const { card, opt } = castOption(s, "Nocturnal Hunger");
    expect(opt?.kickerPrompt?.with).toBe("Offrir une Nourriture");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [dragon] } }));
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
    // Jolly Gerbils : « chaque fois que vous offrez un cadeau, piochez une carte ».
    expect(s.players.p1?.hand.length).toBe(hand);
    let t = setup();
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nocturnal Hunger"), targets: { t: [dragon] } }));
    expect(idsOf(t, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(t.players.p1?.life).toBe(18);
  });

  it("Cadeau : une autre cible si le cadeau est promis (Into the Flood Maw)", () => {
    const s = scenario({
      p1: { battlefield: ["Island"], hand: ["Into the Flood Maw"] },
      p2: { battlefield: ["Anthem of Champions"] },
    });
    const anthem = idOf(s, "p2", "battlefield", "Anthem of Champions");
    const { card, opt } = castOption(s, "Into the Flood Maw");
    expect(opt?.modes[0]?.targets[0]?.kickedLegal).toContain(anthem);
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [anthem] } })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [anthem] } }));
    expect(t.players.p2?.hand.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).toContain("Anthem of Champions");
    // Le Poisson du cadeau arrive engagé chez l'adversaire.
    const fish = idOf(t, "p2", "battlefield", "Fish");
    expect(t.objects[fish]?.tapped).toBe(true);
  });

  it("Cadeau d'un permanent : l'adversaire pioche quand il arrive (Scrapshooter)", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] },
      p2: { battlefield: ["Anthem of Champions"], library: ["Forest", "Island"] },
    });
    const hand2 = s.players.p2?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true }));
    expect(s.players.p2?.hand.length).toBe(hand2 + 1);
    expect(idsOf(s, "p2", "battlefield", "Anthem of Champions")).toHaveLength(0);
  });

  it("Fourrager : trois cartes du cimetière exilées, sinon une Nourriture sacrifiée", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Treetop Sentries"], graveyard: ["Opt", "Forest", "Stab"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Treetop Sentries") }));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p1?.hand.length).toBe(hand); // la créature est partie, une carte piochée
    let t = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bakersbane Duo"], hand: ["Treetop Sentries"] },
    });
    // Bakersbane Duo n'est pas une Nourriture : sans cimetière ni Nourriture, on ne peut pas fourrager.
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Treetop Sentries") }));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Feed the Cycle : fourrager plutôt que payer {B} (coût alternatif)", () => {
    const s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Feed the Cycle"], graveyard: ["Opt", "Forest", "Stab"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const { card, opt } = castOption(s, "Feed the Cycle");
    expect(opt?.normalAvailable).toBeFalsy();
    expect(opt?.altLabel).toBe("Fourrager — {1}{B}");
    const t = settle(
      act(s, "p1", { type: "cast", card, alternative: true, targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }),
    );
    expect(idsOf(t, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(t.players.p1?.graveyard.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).toEqual(["Feed the Cycle"]);
  });

  it("Dépense 4 : une seule fois, quand le quatrième mana est dépensé pour des sorts", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 6), "Teapot Slinger"], hand: ["Playful Shove", "Playful Shove", "Playful Shove"] },
    });
    const p2 = () => s.players.p2?.life ?? 0;
    const shove = () => idsOf(s, "p1", "hand", "Playful Shove")[0] as string;
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(p2()).toBe(19);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    // Quatrième mana : 1 blessure du sort, 2 de Teapot Slinger.
    expect(p2()).toBe(16);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(p2()).toBe(15);
  });

  it("Vaillance : la première fois de chaque tour, par un sort ou une capacité que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Heartfire Hero"], hand: ["Giant Growth", "Giant Growth"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"]).toBe(1);
    s = settle(act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"]).toBe(1);
  });

  it("Vaillance : un sort adverse ne la déclenche pas", () => {
    let s = scenario({
      p1: { battlefield: ["Heartfire Hero"] },
      p2: { battlefield: ["Forest"], hand: ["Giant Growth"] },
      active: "p2",
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Giant Growth"), targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Heartfire Hero : en mourant, des blessures égales à sa force", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Heartfire Hero", damage: 0 }, "Swamp", "Swamp"], hand: ["Fell"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fell"), targets: { t: [hero] } }));
    // Fell la cible : la Vaillance lui donne d'abord un marqueur +1/+1 (force 2 en mourant).
    expect(s.players.p2?.life).toBe(18);
  });

  it("Saisons : quinze combinaisons de modes, le même mode plusieurs fois", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Season of the Burrow"] } });
    const { card, opt } = castOption(s, "Season of the Burrow");
    expect(s.defs[s.objects[card]?.defId ?? ""]?.spell?.modes).toHaveLength(15);
    // Sans cible possible, seules les combinaisons du mode {P} sont proposées.
    expect(opt?.modes).toHaveLength(5);
    const five = opt?.modes.find((m) => m.label?.split(" + ").length === 5);
    s = settle(act(s, "p1", { type: "cast", card, mode: five?.index }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(5);
  });

  it("Saisons : deux exemplaires d'un mode ciblé ont chacun leur cible", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Season of the Burrow"] },
      p2: { battlefield: ["Shivan Dragon", "Anthem of Champions"], library: ["Forest", "Island", "Swamp"] },
    });
    const { card, opt } = castOption(s, "Season of the Burrow");
    const twice = opt?.modes.find((m) => m.targets.length === 2 && m.label?.split(" + ").length === 2);
    expect(twice).toBeDefined();
    const [a, b] = twice?.targets ?? [];
    s = settle(
      act(s, "p1", {
        type: "cast",
        card,
        mode: twice?.index,
        targets: {
          [a?.id as string]: [idOf(s, "p2", "battlefield", "Shivan Dragon")],
          [b?.id as string]: [idOf(s, "p2", "battlefield", "Anthem of Champions")],
        },
      }),
    );
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(0);
    expect(s.players.p2?.hand).toHaveLength(2);
  });

  it("Prouesse d'un jeton Loutre et prouesse accordée (Bria)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 4), "Bria, Riptide Rogue", "Llanowar Elves"], hand: ["Otterball Antics", "Opt"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Otterball Antics") }));
    const otter = idOf(s, "p1", "battlefield", "Otter");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = passAccepting(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }), (x) => x.stack.length === 0);
    expect(chars(s, otter).power).toBeGreaterThanOrEqual(2);
    // Llanowar Elves a la prouesse grâce à Bria (deux sorts non-créature lancés).
    expect(chars(s, elves).power).toBe(3);
  });

  it("Mockingbird : copie d'une créature adverse de VM ≤ mana dépensé, Oiseau volant en plus", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Mockingbird"] }, p2: { battlefield: ["Llanowar Elves"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mockingbird"), x: 1 });
    s = settle(s);
    const bird = s.battlefield.find(
      (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
    ) as string;
    const c = chars(s, bird);
    expect(c.name).toBe("Llanowar Elves");
    expect(c.subtypes).toContain("Bird");
    expect(c.keywords).toContain("flying");
  });

  it("Vren : les créatures adverses sont exilées ; un Rat par créature exilée à l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: ["Vren, the Relentless", "Swamp", "Swamp"], hand: ["Fell"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Fell"),
        targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
      }),
    );
    expect(s.players.p2?.graveyard).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || idsOf(x, "p1", "battlefield", "Rat").length > 0);
    expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
  });

  it("Sunspine Lynx : blessures selon les terrains non de base de chaque joueur", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Hidden Grotto"], hand: ["Sunspine Lynx"] },
      p2: { battlefield: ["Fabled Passage", "Three Tree City"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sunspine Lynx") }));
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Agate-Blade Assassin : le joueur défenseur perd 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Agate-Blade Assassin"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Agate-Blade Assassin"), defender: "p2" }],
    });
    s = settle(s);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Carrot Cake : un Lapin en arrivant et un autre quand on la sacrifie", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Carrot Cake"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Carrot Cake") }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(1);
    const cake = idOf(s, "p1", "battlefield", "Carrot Cake");
    const eat = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cake);
    s = settle(act(s, "p1", { type: "activate", source: cake, ability: eat?.type === "activate" ? eat.ability : -1 }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(2);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Starfall Invocation : avec le cadeau, une créature détruite ainsi revient", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Shivan Dragon"], hand: ["Starfall Invocation"] },
      p2: { battlefield: ["Llanowar Elves"], library: ["Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Starfall Invocation"), kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.players.p2?.hand).toHaveLength(1);
  });

  it("Cache Grab : une carte de permanent meulée en main, et une Nourriture pour un Écureuil", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Cache Grab"],
        library: ["Opt", "Bushy Bodyguard", "Stab", "Island"],
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cache Grab") }));
    const names = (zone: "hand" | "graveyard") => s.players.p1?.[zone].map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names("hand")).toHaveLength(1);
    expect(names("graveyard")).toContain("Cache Grab");
    // La carte suggérée est la première carte de permanent : Bushy Bodyguard (un Écureuil), d'où la Nourriture.
    expect(names("hand")).toEqual(["Bushy Bodyguard"]);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Cruelclaw's Heist : la carte exilée reste jouable avec le cadeau", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Cruelclaw's Heist"] },
      p2: { hand: ["Shivan Dragon", "Forest"], library: ["Island"] },
    });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cruelclaw's Heist"), kicked: true, targets: { t: ["p2"] } }),
    );
    const dragon = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon");
    expect(dragon).toBeDefined();
    expect(s.playPermissions?.some((p) => p.card === dragon && p.player === "p1")).toBe(true);
  });

  it("Osteomancer Adept : une créature lancée depuis le cimetière en fourrageant, avec un marqueur de finalité", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), "Osteomancer Adept"],
        graveyard: ["Llanowar Elves", "Opt", "Stab", "Forest"],
      },
    });
    const adept = idOf(s, "p1", "battlefield", "Osteomancer Adept");
    const tap = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === adept);
    s = settle(act(s, "p1", { type: "activate", source: adept, ability: tap?.type === "activate" ? tap.ability : -1 }));
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === elves)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: elves }));
    const onField = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(s.objects[onField]?.counters.finality).toBe(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Festival of Embers : un éphémère lancé depuis le cimetière pour 1 PV, puis exilé", () => {
    let s = scenario({
      p1: { battlefield: ["Festival of Embers", "Island"], graveyard: ["Opt"], library: ["Forest", "Forest"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Stormchaser's Talent : Loutre en arrivant, puis niveau 2 (récupère un éphémère)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Stormchaser's Talent"], graveyard: ["Opt"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stormchaser's Talent") }));
    expect(idsOf(s, "p1", "battlefield", "Otter")).toHaveLength(1);
    const cls = idOf(s, "p1", "battlefield", "Stormchaser's Talent");
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cls);
    s = settle(act(s, "p1", { type: "activate", source: cls, ability: up?.type === "activate" ? up.ability : -1 }));
    expect(s.objects[cls]?.classLevel).toBe(2);
    expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
  });

  it("Dour Port-Mage : une créature renvoyée (sans mourir) fait piocher", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Dour Port-Mage", "Llanowar Elves"], library: ["Forest", "Forest"] },
    });
    const mage = idOf(s, "p1", "battlefield", "Dour Port-Mage");
    const hand = s.players.p1?.hand.length ?? 0;
    const bounce = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === mage);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: mage,
        ability: bounce?.type === "activate" ? bounce.ability : -1,
        targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] },
      }),
    );
    expect(s.players.p1?.hand.length).toBe(hand + 2);
  });

  it("Valley Flamecaller : +1 blessure pour une Souris que vous contrôlez", () => {
    let s = scenario({ p1: { battlefield: ["Valley Flamecaller", "Kindlespark Duo"] } });
    const duo = idOf(s, "p1", "battlefield", "Kindlespark Duo");
    const ping = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === duo);
    // Kindlespark Duo est un Lézard Loutre : 1 + 1 blessures.
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: duo,
        ability: ping?.type === "activate" ? ping.ability : -1,
        targets: { t: ["p2"] },
      }),
    );
    expect(s.players.p2?.life).toBe(18);
  });

  it("Wishing Well : lance gratuitement un sort de VM égale aux marqueurs de pièce", () => {
    let s = scenario({ p1: { battlefield: ["Wishing Well"], graveyard: ["Opt", "Stab"], library: ["Forest", "Forest"] } });
    const well = idOf(s, "p1", "battlefield", "Wishing Well");
    const act0 = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === well);
    s = settle(act(s, "p1", { type: "activate", source: well, ability: act0?.type === "activate" ? act0.ability : -1 }));
    expect(s.objects[well]?.counters.coin).toBe(1);
    const opt = idOf(s, "p1", "graveyard", "Opt");
    // Opt (VM 1) est jouable gratuitement ; Stab (VM 1 aussi) n'a pas été ciblée.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === opt)).toBe(true);
  });

  it("Alania : copie le premier éphémère du tour (un adversaire pioche)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Alania, Divergent Storm"], hand: ["Playful Shove", "Playful Shove"] },
      p2: { library: ["Forest", "Island"] },
    });
    const shove = () => idsOf(s, "p1", "hand", "Playful Shove")[0] as string;
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    // Le sort et sa copie : 2 blessures ; l'adversaire a pioché une carte.
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });
});
