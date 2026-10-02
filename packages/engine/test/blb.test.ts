/**
 * Bloomburrow : Progéniture, Cadeau (cibles propres au cadeau, cadeau d'un permanent), Fourrager (effet, coût d'activation,
 * coût alternatif), Dépense, Vaillance, modes « patte », prouesse accordée, Mockingbird, Vren, Sunspine Lynx.
 */

import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castNowOf,
  idOf,
  idsOf,
  namesIn,
  passAccepting,
  settle as resolve,
  scenario,
  untilCastNow,
} from "./helpers";

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

  it("Wishing Well : lance gratuitement, pendant la résolution, un sort de VM égale aux marqueurs de pièce", () => {
    let s = scenario({ p1: { battlefield: ["Wishing Well"], graveyard: ["Opt", "Stab"], library: ["Forest", "Forest"] } });
    const well = idOf(s, "p1", "battlefield", "Wishing Well");
    const act0 = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === well);
    s = untilCastNow(act(s, "p1", { type: "activate", source: well, ability: act0?.type === "activate" ? act0.ability : -1 }));
    expect(s.objects[well]?.counters.coin).toBe(1);
    const opt = idOf(s, "p1", "graveyard", "Opt");
    // Opt (VM 1), ciblée par la capacité réflexive, est la seule carte proposée.
    expect(castNowOf(s)?.cards).toEqual([opt]);
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    // Opt s'est résolue (pioche) puis a été exilée au lieu d'aller au cimetière.
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt")).toBe(true);
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

describe("Bloomburrow : cartes des decks du méta (PLAN-C, lot C13)", () => {
  /** Répond « oui » aux questions et choisit les objets voulus. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Joue jusqu'au tour suivant (étape de fin comprise). */
  const toNextTurn = (s: S) => advanceUntil(s, (x) => x.turn.number > s.turn.number);

  it("Fountainport : un Poisson 1/1 bleu pour {3} et 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 3)] } });
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Poisson"));
    const fish = idOf(s, "p1", "battlefield", "Fish");
    expect(pt(s, fish)).toEqual([1, 1]);
    expect(chars(s, fish).colors).toEqual(["U"]);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Fountainport : {2}, {T}, sacrifiez un jeton : piochez une carte", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 2)], library: lands("Plains", 5) } });
    createTokens(s, "p1", TOKEN_SPECS.Treasure as TokenSpec, 1);
    s.version += 1;
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Sacrifiez un jeton"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
  });

  it("Fountainport : {4}, {T} : un Trésor", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 4)] } });
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Trésor"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  describe("Dawn's Truce", () => {
    const setup = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Dawn's Truce"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], library: lands("Mountain", 5) },
      });
      return resolve(cast(s, "p1", "Dawn's Truce", { kicked }));
    };
    const strikeTargets = (s: S) => {
      const opt = legalActions(s, "p2").find((a) => a.type === "cast");
      return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    };

    it("vous et vos permanents avez la défense talismanique jusqu'à la fin du tour", () => {
      let s = setup(false);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, cub).keywords).toContain("hexproof");
      expect(chars(s, cub).keywords).not.toContain("indestructible");
      expect(s.players.p2?.hand).toHaveLength(1);
      s = act(s, "p1", { type: "pass" });
      const legal = strikeTargets(s);
      expect(legal).toContain("p2");
      expect(legal).not.toContain("p1");
      expect(legal).not.toContain(cub);
    });

    it("cadeau promis : l'adversaire pioche, vos permanents sont aussi indestructibles", () => {
      const s = setup(true);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toEqual(
        expect.arrayContaining(["hexproof", "indestructible"]),
      );
    });
  });

  it("Hired Claw : 1 blessure quand vous attaquez avec un Lézard ; {1}{R} une fois, si un adversaire a perdu des PV", () => {
    let s = scenario({ p1: { battlefield: ["Hired Claw", ...lands("Mountain", 4)] } });
    const claw = idOf(s, "p1", "battlefield", "Hired Claw");
    expect(canActivate(s, "p1", claw)).toBe(false);
    s = resolve(attack(s, [claw]));
    expect(s.players.p2?.life).toBe(19);
    s = resolve(activate(s, "p1", claw, "Marqueur"));
    expect(s.objects[claw]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", claw)).toBe(false);
  });

  it("Emberheart Challenger : vaillance — la carte du dessus est exilée et jouable ce tour-ci ; prouesse", () => {
    let s = scenario({
      p1: { battlefield: ["Emberheart Challenger", "Forest"], hand: ["Giant Growth"], library: lands("Mountain", 5) },
    });
    const hero = idOf(s, "p1", "battlefield", "Emberheart Challenger");
    expect(chars(s, hero).keywords).toContain("haste");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [hero] } }));
    expect(namesIn(s, s.exile)).toEqual(["Mountain"]);
    const mountain = s.exile[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    expect(chars(s, hero).power).toBe(6); // 2 + 3 (Giant Growth) + 1 (prouesse)
  });

  describe("Eddymurk Crab", () => {
    it("coûte {1} de moins par carte d'éphémère ou de rituel au cimetière ; engage jusqu'à deux créatures", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Eddymurk Crab"], graveyard: ["Opt", "Opt", "Opt", "Hop to It", "Opt"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const targets = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
      s = resolve(cast(s, "p1", "Eddymurk Crab"), choosing(targets));
      for (const id of targets) expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Eddymurk Crab")]?.tapped).toBe(false);
    });

    it("arrive engagé si ce n'est pas votre tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 7), hand: ["Eddymurk Crab"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      s = resolve(cast(s, "p1", "Eddymurk Crab"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Eddymurk Crab")]?.tapped).toBe(true);
    });
  });

  describe("Lunar Convocation", () => {
    it("vous avez gagné des PV : chaque adversaire perd 1 PV à votre étape de fin, sans Chauve-souris", () => {
      let s = scenario({ p1: { battlefield: ["Lunar Convocation", "Vampire Neonate", ...lands("Swamp", 2)] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(s.players.p2?.life).toBe(19);
      s = toNextTurn(s);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bat")).toHaveLength(0);
    });

    it("gagné et perdu des PV : une Chauve-souris volante ; {1}{B}, 2 PV : piochez", () => {
      let s = scenario({
        p1: { battlefield: ["Lunar Convocation", "Vampire Neonate", ...lands("Swamp", 4)], library: lands("Plains", 5) },
      });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Lunar Convocation"), "Piochez"));
      expect(s.players.p1?.life).toBe(19);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
      s = toNextTurn(s);
      const bat = idOf(s, "p1", "battlefield", "Bat");
      expect(chars(s, bat).keywords).toContain("flying");
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Essence Channeler", () => {
    it("vol et vigilance si vous avez perdu des PV ce tour-ci ; un marqueur +1/+1 quand vous gagnez des PV", () => {
      let s = scenario({
        p1: { battlefield: ["Essence Channeler", "Vampire Neonate", ...lands("Swamp", 2)] },
        p2: { battlefield: ["Vampire Neonate", ...lands("Swamp", 2)] },
      });
      const channeler = idOf(s, "p1", "battlefield", "Essence Channeler");
      expect(chars(s, channeler).keywords).not.toContain("flying");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(s.objects[channeler]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, channeler).keywords).not.toContain("flying");
      s = act(s, "p1", { type: "pass" });
      s = resolve(activate(s, "p2", idOf(s, "p2", "battlefield", "Vampire Neonate"), ""));
      expect(s.players.p1?.life).toBe(20);
      expect(chars(s, channeler).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    });

    it("en mourant, met ses marqueurs sur une créature que vous contrôlez", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Essence Channeler", counters: { "+1/+1": 2 } }, "Bear Cub", ...lands("Swamp", 2)],
          hand: ["Stab"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const channeler = idOf(s, "p1", "battlefield", "Essence Channeler");
      destroy(s, channeler);
      s = resolve(s, choosing([cub]));
      expect(idsOf(s, "p1", "graveyard", "Essence Channeler")).toHaveLength(1);
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Iridescent Vinelasher", () => {
    it("atterrissage : 1 blessure à un adversaire", () => {
      let s = scenario({ p1: { battlefield: ["Iridescent Vinelasher"], hand: ["Swamp"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Swamp") }));
      expect(s.players.p2?.life).toBe(19);
    });

    it("progéniture : un jeton 1/1 copie, et deux déclenchements d'atterrissage", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Iridescent Vinelasher", "Swamp"] } });
      s = resolve(cast(s, "p1", "Iridescent Vinelasher", { kicked: true }));
      const all = idsOf(s, "p1", "battlefield", "Iridescent Vinelasher");
      expect(all).toHaveLength(2);
      const token = all.find((id) => s.objects[id]?.isToken) as string;
      expect(pt(s, token)).toEqual([1, 1]);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Swamp") }));
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Beza, the Bounding Spring", () => {
    it("rattrapage : Trésor, 4 PV, deux Poissons et une carte quand l'adversaire a plus de chaque", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Beza, the Bounding Spring"], life: 10, library: lands("Plains", 5) },
        p2: { battlefield: [...lands("Forest", 5), "Bear Cub", "Bear Cub"], hand: ["Opt", "Opt"] },
      });
      s = resolve(cast(s, "p1", "Beza, the Bounding Spring"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    });

    it("rien quand l'adversaire n'a pas plus (égalité comprise)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Beza, the Bounding Spring"] },
        p2: { battlefield: [...lands("Forest", 4), "Bear Cub", "Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Beza, the Bounding Spring"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("Hop to It : trois jetons Lapin 1/1 blancs", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Hop to It"] } });
    s = resolve(cast(s, "p1", "Hop to It"));
    const rabbits = idsOf(s, "p1", "battlefield", "Rabbit");
    expect(rabbits).toHaveLength(3);
    for (const r of rabbits) {
      expect(pt(s, r)).toEqual([1, 1]);
      expect(chars(s, r).colors).toEqual(["W"]);
    }
  });

  it("Caretaker's Talent : une pioche par tour pour des jetons ; niveau 2 copie un jeton ; niveau 3 +2/+2", () => {
    let s = scenario({
      p1: { battlefield: ["Caretaker's Talent", ...lands("Plains", 8)], hand: ["Hop to It"], library: lands("Island", 5) },
    });
    const talent = idOf(s, "p1", "battlefield", "Caretaker's Talent");
    s = resolve(cast(s, "p1", "Hop to It"));
    expect(s.players.p1?.hand).toHaveLength(1); // un seul déclenchement pour trois jetons
    const rabbit = idOf(s, "p1", "battlefield", "Rabbit");
    s = resolve(activate(s, "p1", talent, "Niveau 2"), choosing([rabbit]));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(4);
    expect(s.players.p1?.hand).toHaveLength(1); // une seule fois par tour
    expect(pt(s, rabbit)).toEqual([1, 1]);
    s = resolve(activate(s, "p1", talent, "Niveau 3"));
    for (const r of idsOf(s, "p1", "battlefield", "Rabbit")) expect(pt(s, r)).toEqual([3, 3]);
  });

  describe("Rottenmouth Viper", () => {
    it("en arrivant : un marqueur de fléau ; l'adversaire sans permanent ni carte perd 4 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Rottenmouth Viper"] }, p2: { hand: [] } });
      s = resolve(cast(s, "p1", "Rottenmouth Viper"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Rottenmouth Viper")]?.counters.blight).toBe(1);
      expect(s.players.p2?.life).toBe(16);
    });

    it("en attaquant : un marqueur de plus, puis 4 PV par marqueur (ou une défausse à la place)", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Rottenmouth Viper", counters: { blight: 1 } }] },
        p2: { hand: ["Opt"] },
      });
      const viper = idOf(s, "p1", "battlefield", "Rottenmouth Viper");
      s = resolve(attack(s, [viper]));
      expect(s.objects[viper]?.counters.blight).toBe(2);
      // L'adversaire défausse sa seule carte une fois, puis perd 4 PV la seconde.
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(16);
    });
  });

  it("Starscape Cleric : vol, ne bloque pas ; chaque fois que vous gagnez des PV, chaque adversaire perd 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Starscape Cleric", "Vampire Neonate", ...lands("Swamp", 2)] } });
    const cleric = idOf(s, "p1", "battlefield", "Starscape Cleric");
    expect(chars(s, cleric).keywords).toEqual(expect.arrayContaining(["flying", "cantBlock"]));
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
    expect(s.players.p2?.life).toBe(18);
  });

  it("Keen-Eyed Curator : {1} exile une carte d'un cimetière ; +4/+4 et piétinement avec quatre types parmi les cartes exilées", () => {
    let s = scenario({
      p1: { battlefield: ["Keen-Eyed Curator", ...lands("Forest", 4)] },
      p2: { graveyard: ["Forest", "Opt", "Bear Cub", "Hop to It"] },
    });
    const curator = idOf(s, "p1", "battlefield", "Keen-Eyed Curator");
    for (const name of ["Forest", "Opt", "Bear Cub"]) {
      s = resolve(activate(s, "p1", curator, "Exile", { targets: { t: [idOf(s, "p2", "graveyard", name)] } }));
    }
    expect(s.players.p2?.graveyard).toHaveLength(1);
    expect(pt(s, curator)).toEqual([3, 3]);
    s = resolve(activate(s, "p1", curator, "Exile", { targets: { t: [idOf(s, "p2", "graveyard", "Hop to It")] } }));
    expect(pt(s, curator)).toEqual([7, 7]);
    expect(chars(s, curator).keywords).toContain("trample");
  });
});
