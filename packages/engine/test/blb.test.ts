/**
 * Bloomburrow : Progéniture, Cadeau (cibles propres au cadeau, cadeau d'un permanent), Fourrager (effet, coût d'activation,
 * coût alternatif), Dépense, Vaillance, modes « patte », prouesse accordée, Mockingbird, Vren, Sunspine Lynx.
 */

import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { protection, protectionAbility } from "../src/dsl";
import { permissionActive } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { changeCounters, chars, moveObject } from "../src/state";
import type { GameObject, GameState, PlayerId, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castable,
  castNowOf,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  pickNamed,
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

  it("Cadeau à plusieurs adversaires : l'adversaire est choisi en lançant le sort, avant la priorité (702.174a)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Swamp", 3), hand: ["Nocturnal Hunger"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [dragon] } });
    // Le sort est sur la pile ; personne n'a encore la priorité : son contrôleur choisit l'adversaire.
    expect(s.pending?.kind).toBe("choice");
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" ? req.options : []).toEqual(["p2", "p3"]);
    expect(req?.suggested).toEqual(["p2"]);
    expect(() => act(s, "p1", { type: "choose", values: ["p1"] })).toThrow(RulesError);
    s = settle(act(s, "p1", { type: "choose", values: ["p3"] }));
    expect(idsOf(s, "p3", "battlefield", "Food")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Cadeau d'un permanent à plusieurs adversaires : l'adversaire choisi en le lançant pioche à l'arrivée (Scrapshooter)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] },
      p2: { battlefield: ["Anthem of Champions"], library: ["Forest", "Island"] },
      p3: { library: ["Forest", "Island"] },
    });
    const hand2 = s.players.p2?.hand.length ?? 0;
    const hand3 = s.players.p3?.hand.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true });
    s = settle(act(s, "p1", { type: "choose", values: ["p3"] }));
    expect(s.players.p3?.hand.length).toBe(hand3 + 1);
    expect(s.players.p2?.hand.length).toBe(hand2);
  });

  it("Cadeau en duel, ou à plusieurs sans cadeau promis : aucune question", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true });
    expect(s.pending?.kind).toBe("priority");
    let t = scenario({ players: 3, p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Scrapshooter") });
    expect(t.pending?.kind).toBe("priority");
  });

  it("Cadeau copié pendant le lancement (Teach by Example) : la copie garde l'adversaire choisi pour l'original (707.10)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 3)], hand: ["Teach by Example", "Nocturnal Hunger"] },
      p2: { battlefield: ["Shivan Dragon", "Shivan Dragon"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teach by Example") }));
    const [a, b] = idsOf(s, "p2", "battlefield", "Shivan Dragon") as [string, string];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [a] } });
    expect(s.stack).toHaveLength(2);
    // D'abord l'adversaire du cadeau de l'original (plus bas sur la pile), puis les nouvelles cibles de la copie.
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" ? req.options : []).toEqual(["p2", "p3"]);
    s = act(s, "p1", { type: "choose", values: ["p3"] });
    expect(s.stack.every((x) => x.cast?.giftTo === "p3")).toBe(true);
    const retarget = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(retarget?.type === "pick" ? retarget.options : []).toContain(b);
    s = settle(act(s, "p1", { type: "choose", values: [b] }));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(2);
    expect(idsOf(s, "p3", "battlefield", "Food")).toHaveLength(2);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Cadeau copié par l'adversaire en duel (Return the Favor) : le cadeau va toujours à l'adversaire promis (707.10)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Nocturnal Hunger"] },
      p2: { battlefield: [...lands("Mountain", 3), "Shivan Dragon"], hand: ["Return the Favor"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [dragon] } });
    const hunger = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    const favor = idOf(s, "p2", "hand", "Return the Favor");
    const opt = legalActions(s, "p2").find((x) => x.type === "cast" && x.card === favor);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Copiez un sort ou une capacité")?.index : undefined;
    s = act(s, "p2", { type: "cast", card: favor, mode, targets: { c: [hunger] } });
    s = passAccepting(s, (x) => x.stack.length === 2 && x.pending?.kind === "choice" && x.pending.player === "p2");
    // La copie, contrôlée par p2, vise les Llanowar Elves de p1.
    s = settle(act(s, "p2", { type: "choose", values: [elves] }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
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

  it("Alania : copie aussi le premier sort de Loutre du tour, la copie devient un jeton ; pas le deuxième", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Alania, Divergent Storm"], hand: ["Thieving Otter", "Thieving Otter"] },
      p2: { library: ["Forest", "Island"] },
    });
    const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
    s = resolve(cast(s, "p1", "Thieving Otter"), yes);
    const otters = idsOf(s, "p1", "battlefield", "Thieving Otter");
    expect(otters).toHaveLength(2);
    expect(otters.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = resolve(cast(s, "p1", "Thieving Otter"), yes);
    expect(idsOf(s, "p1", "battlefield", "Thieving Otter")).toHaveLength(3);
    expect(s.players.p2?.hand).toHaveLength(1);
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

    it("coût additionnel : sacrifier des permanents non-terrain le réduit de {1} chacun, au choix du joueur", () => {
      // Deux Marais seulement : quatre sacrifices sont nécessaires ({5}{B} - 4 = {1}{B}).
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), "Bear Cub", "Llanowar Elves", "Fountainport", "Vampire Neonate", "Savannah Lions"],
          hand: ["Rottenmouth Viper"],
        },
        p2: { hand: [] },
      });
      const { card, opt } = castOption(s, "Rottenmouth Viper");
      expect(opt).toBeDefined();
      const pick = opt?.picks?.find((p) => p.slot === "sacrificeToPay");
      expect(pick?.options).not.toContain(idOf(s, "p1", "battlefield", "Fountainport"));
      expect(pick?.options).toHaveLength(4);
      const chosen = ["Bear Cub", "Llanowar Elves", "Vampire Neonate", "Savannah Lions"].map((n) =>
        idOf(s, "p1", "battlefield", n),
      );
      s = act(s, "p1", { type: "cast", card, picks: { sacrificeToPay: chosen } });
      for (const n of ["Bear Cub", "Llanowar Elves", "Vampire Neonate", "Savannah Lions"])
        expect(idsOf(s, "p1", "graveyard", n)).toHaveLength(1);
      s = resolve(s);
      expect(idsOf(s, "p1", "battlefield", "Rottenmouth Viper")).toHaveLength(1);
    });

    it("sans choix, le paiement automatique ne sacrifie rien si le mana suffit, et le moins possible sinon", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 6), "Bear Cub"], hand: ["Rottenmouth Viper"] },
        p2: { hand: [] },
      });
      s = resolve(cast(s, "p1", "Rottenmouth Viper"));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub", "Savannah Lions"], hand: ["Rottenmouth Viper"] },
        p2: { hand: [] },
      });
      t = resolve(cast(t, "p1", "Rottenmouth Viper"));
      expect(idsOf(t, "p1", "graveyard", "Bear Cub").length + idsOf(t, "p1", "graveyard", "Savannah Lions").length).toBe(1);
      expect(idsOf(t, "p1", "battlefield", "Rottenmouth Viper")).toHaveLength(1);
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

describe("« Vous mettez des marqueurs » (lot K2)", () => {
  it("Stocking the Pantry : seuls les marqueurs +1/+1 que vous mettez sur vos créatures la déclenchent", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Stocking the Pantry"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Bear Cub")).triggered).toEqual(["Stocking the Pantry"]);
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual([]);
  });
});

describe("Mana en n'importe quelle combinaison (lot K2)", () => {
  it("Muerra, Trash Tactician : {R} ou {G} pour chaque Raton laveur, répartis par le joueur", () => {
    let s = scenario({ step: "draw", p1: { battlefield: ["Muerra, Trash Tactician", "Teapot Slinger"] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type === "divide" && p.request.among).toEqual(["R", "G"]);
    s = act(s, "p1", { type: "choose", values: [1, 1] });
    expect(s.players.p1?.manaPool.R).toBe(1);
    expect(s.players.p1?.manaPool.G).toBe(1);
  });
});

describe("Choix non ciblés rendus au joueur (lot K6)", () => {
  /** Une créature que les sorts de la couleur `c` ne peuvent pas cibler : seul un choix non ciblé la désigne. */
  const shielded = (name: string, c: "G" | "U") =>
    customCard({
      name,
      power: 2,
      toughness: 2,
      abilities: [protectionAbility(protection.from({ colors: [c] }, "Protection contre une couleur"))],
    });
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  it("Season of Gathering : la créature qui reçoit le marqueur est choisie à la résolution, sans la cibler", () => {
    const ward = shielded("Test Green Ward", "G");
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), ward, "Bear Cub"], hand: ["Season of Gathering"] } });
    const { card, opt } = castOption(s, "Season of Gathering");
    const one = opt?.modes.find((m) => m.label === "Marqueur +1/+1, vigilance et piétinement");
    expect(one?.targets).toEqual([]);
    const wardId = idOf(s, "p1", "battlefield", "Test Green Ward");
    let options: string[] = [];
    s = resolve(act(s, "p1", { type: "cast", card, mode: one?.index }), (req) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map(String);
      return [wardId];
    });
    expect(namesIn(s, options).sort()).toEqual(["Bear Cub", "Test Green Ward"]);
    // Protection contre le vert : la créature n'est pas ciblée, elle reçoit le marqueur, la vigilance et le piétinement.
    expect(counters(s, wardId)).toBe(1);
    expect(chars(s, wardId).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Season of Weaving : l'artefact ou la créature copié est choisi à la résolution, sans le cibler", () => {
    const ward = shielded("Test Blue Ward", "U");
    let s = scenario({ p1: { battlefield: [...lands("Island", 6), ward, "Bear Cub"], hand: ["Season of Weaving"] } });
    const { card, opt } = castOption(s, "Season of Weaving");
    const copy = opt?.modes.find((m) => m.label === "Copie d'un artefact ou d'une créature");
    expect(copy?.targets).toEqual([]);
    const wardId = idOf(s, "p1", "battlefield", "Test Blue Ward");
    s = resolve(act(s, "p1", { type: "cast", card, mode: copy?.index }), (req) => (req.type === "pick" ? [wardId] : undefined));
    expect(idsOf(s, "p1", "battlefield", "Test Blue Ward")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Wick, the Whorled Mind : le marqueur va sur un Escargot choisi à la résolution ; sans Escargot, un jeton", () => {
    const snail = customCard({ name: "Test Snail", subtypes: ["Snail"], power: 1, toughness: 1 });
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), snail, snail], hand: ["Wick, the Whorled Mind"] } });
    const [a, b] = idsOf(s, "p1", "battlefield", "Test Snail") as [string, string];
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Wick, the Whorled Mind"), (req) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map(String);
      return [b];
    });
    expect(options.sort()).toEqual([a, b].sort());
    expect([counters(s, a), counters(s, b)]).toEqual([0, 1]);
    expect(idsOf(s, "p1", "battlefield", "Snail")).toHaveLength(0);

    s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wick, the Whorled Mind"] } });
    s = resolve(cast(s, "p1", "Wick, the Whorled Mind"));
    const token = idOf(s, "p1", "battlefield", "Snail");
    expect(counters(s, token)).toBe(0);
  });

  describe("Mistbreath Elder", () => {
    const upkeep = (battlefield: string[]) => {
      const s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mistbreath Elder", ...battlefield] } });
      return passAccepting(s, (x) => x.pending?.kind === "choice" || (x.turn.active === "p1" && x.turn.step === "main1"));
    };

    it("l'autre créature renvoyée est choisie à la résolution (renvoi obligatoire) ; l'Aînée reçoit un marqueur", () => {
      let s = upkeep(["Bear Cub", "Llanowar Elves"]);
      const p = s.pending;
      expect(p?.kind === "choice" && p.request.type === "pick" && p.request.min).toBe(1);
      expect(p?.kind === "choice" && p.request.type === "pick" && namesIn(s, p.request.options.map(String)).sort()).toEqual([
        "Bear Cub",
        "Llanowar Elves",
      ]);
      s = resolve(act(s, "p1", { type: "choose", values: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      expect(namesIn(s, s.players.p1?.hand)).toContain("Llanowar Elves");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Mistbreath Elder"))).toBe(1);
    });

    it("sans autre créature, vous pouvez la renvoyer elle-même (refus : elle reste, sans marqueur)", () => {
      const ask = upkeep([]);
      expect(ask.pending?.kind === "choice" && ask.pending.request.type).toBe("yesNo");
      const no = resolve(act(ask, "p1", { type: "choose", values: [0] }));
      expect(counters(no, idOf(no, "p1", "battlefield", "Mistbreath Elder"))).toBe(0);
      const yes = resolve(act(ask, "p1", { type: "choose", values: [1] }));
      expect(idsOf(yes, "p1", "battlefield", "Mistbreath Elder")).toHaveLength(0);
      expect(namesIn(yes, yes.players.p1?.hand)).toContain("Mistbreath Elder");
    });
  });
});

describe("Pawpatch Recruit (lot K6)", () => {
  it("le marqueur va sur une créature autre que celle ciblée par l'adversaire", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Pawpatch Recruit", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const recruit = idOf(s, "p1", "battlefield", "Pawpatch Recruit");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [bear] } });
    let options: string[] = [];
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "triggerTarget") {
        options = p.request.options;
        expect(() => act(s, "p1", { type: "choose", values: [bear] })).toThrow();
        s = act(s, "p1", { type: "choose", values: [recruit] });
      } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else break;
    }
    expect(options).not.toContain(bear);
    expect(s.objects[recruit]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Season of the Bold (lot K7)", () => {
  it("{P}{P}{P} : l'emblème dure jusqu'à la fin de votre prochain tour (et non jusqu'à son début)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Season of the Bold"] } });
    const card = idOf(s, "p1", "hand", "Season of the Bold");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const three =
      opt?.type === "cast" ? opt.modes.find((m) => m.label === "Chaque sort : 2 blessures à une créature") : undefined;
    expect(three).toBeDefined();
    s = resolve(act(s, "p1", { type: "cast", card, mode: three?.index }));
    const emblems = (x: S) => (x.players.p1?.command ?? []).length;
    expect(emblems(s)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(emblems(s)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.number === 6 && x.pending?.kind === "priority");
    expect(emblems(s)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lot K8 : cartes mythiques, rares et peu communes qu'aucun test ne nommait.
// ---------------------------------------------------------------------------

/** Réponses aux choix : mode d'une capacité déclenchée (par libellé), oui ou non, objets voulus. */
const answer =
  (o: { mode?: string; yes?: boolean; pick?: string[] } = {}): Answer =>
  (req) => {
    if (req.type === "yesNo") return o.yes === undefined ? undefined : [o.yes ? 1 : 0];
    if (req.type !== "pick") return undefined;
    // Mode d'une capacité, ou option « au choix » (608.2d) : par libellé.
    if (req.intent === "triggerMode" || (o.mode && req.labels)) {
      const mode = o.mode?.toLowerCase();
      const hit = Object.entries(req.labels ?? {}).find(([, l]) => !!mode && l.toLowerCase().includes(mode));
      if (hit || req.intent === "triggerMode") return hit ? [hit[0]] : undefined;
    }
    const picked = (o.pick ?? []).filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };
/** Active la capacité de `source` dont le libellé contient `label`. */
const activateK8 = (s: S, player: PlayerId, source: string, label: string, extra: object = {}): S => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
  if (a?.type !== "activate") throw new Error(`capacité « ${label} » introuvable`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const canActivateK8 = (s: S, player: PlayerId, source: string, label: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && !!x.label?.includes(label));
const ptOf = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const plusOne = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const handOf = (s: S, p: PlayerId = "p1") => namesIn(s, s.players[p]?.hand);
const graveOf = (s: S, p: PlayerId = "p1") => namesIn(s, s.players[p]?.graveyard);
/** Passe et répond aux choix jusqu'à une priorité « lancer maintenant » (608.2g). */
const toCastNow = (s: S, ans: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300 && !castNowOf(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: ans(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
/** Une permission de jouer encore valable pour cette carte. */
const playable = (s: S, card: string) => (s.playPermissions ?? []).some((p) => p.card === card && permissionActive(s, p));
/** La combinaison de modes d'un sort à modes « patte » dont les libellés sont exactement `labels`. */
const pawMode = (s: S, name: string, labels: string[]) => {
  const { opt } = castOption(s, name);
  const m = opt?.modes.find((x) => x.label === labels.join(" + "));
  if (!m) throw new Error(`combinaison introuvable : ${labels.join(" + ")}`);
  return m.index;
};

describe("Bloomburrow, lot K8 : mythiques", () => {
  it("Byrke : vigilance ; en arrivant, un marqueur +1/+1 sur chacune de jusqu'à deux créatures ciblées", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), ...lands("Plains", 3), "Bear Cub"], hand: ["Byrke, Long Ear of the Law"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = resolve(cast(s, "p1", "Byrke, Long Ear of the Law"), answer({ pick: [cub, angel] }));
    const byrke = idOf(s, "p1", "battlefield", "Byrke, Long Ear of the Law");
    expect(chars(s, byrke).keywords).toContain("vigilance");
    expect([plusOne(s, cub), plusOne(s, angel), plusOne(s, elves), plusOne(s, byrke)]).toEqual([1, 1, 0, 0]);
  });

  it("Byrke : une créature que vous contrôlez avec un marqueur +1/+1 qui attaque double ses marqueurs ; sans marqueur, rien", () => {
    let s = scenario({
      p1: { battlefield: ["Byrke, Long Ear of the Law", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Savannah Lions"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    s = resolve(attack(s, [cub, lions]));
    expect(plusOne(s, cub)).toBe(4);
    expect(plusOne(s, lions)).toBe(0);
  });

  it("Dragonhawk : exile X cartes (X = vos créatures de force 4 ou plus), jouables jusqu'à votre prochaine étape de fin ; 2 blessures par carte restée en exil", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 5), "Shivan Dragon", "Bear Cub"],
        hand: ["Dragonhawk, Fate's Tempest"],
        library: ["Mountain", "Opt", "Forest", "Forest"],
      },
    });
    s = resolve(cast(s, "p1", "Dragonhawk, Fate's Tempest"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragonhawk, Fate's Tempest")).keywords).toContain("flying");
    // Shivan Dragon et Dragonhawk : deux cartes (Bear Cub n'a pas 4 de force).
    expect(namesIn(s, s.exile).sort()).toEqual(["Mountain", "Opt"]);
    const mountain = exiled(s, "Mountain")[0] as string;
    const opt = exiled(s, "Opt")[0] as string;
    expect(playable(s, opt)).toBe(true);
    s = act(s, "p1", { type: "playLand", card: mountain });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    // Opt est restée en exil : 2 blessures ; elle n'est plus jouable après votre étape de fin.
    expect(s.players.p2?.life).toBe(18);
    expect(s.exile).toContain(opt);
    expect(playable(s, opt)).toBe(false);
  });

  it("Eluge : F/E égales à vos Îles ; en arrivant, un marqueur d'inondation fait d'un terrain ciblé une Île tant qu'il a ce marqueur", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Forest"], hand: ["Eluge, the Shoreless Sea"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = resolve(cast(s, "p1", "Eluge, the Shoreless Sea"), answer({ pick: [forest] }));
    const eluge = idOf(s, "p1", "battlefield", "Eluge, the Shoreless Sea");
    expect(s.objects[forest]?.counters.flood).toBe(1);
    expect(chars(s, forest).subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
    expect(ptOf(s, eluge)).toEqual([5, 5]);
    // L'effet survit à Eluge, mais pas au marqueur d'inondation.
    moveObject(s, eluge, "graveyard");
    expect(chars(s, forest).subtypes).toContain("Island");
    changeCounters(s, s.objects[forest] as GameObject, "flood", -1);
    expect(chars(s, forest).subtypes).not.toContain("Island");
  });

  it("Eluge : le premier éphémère ou rituel de chaque tour coûte {1} de moins par terrain inondé, pas le deuxième", () => {
    let s = scenario({
      p1: {
        battlefield: ["Eluge, the Shoreless Sea", "Island", { name: "Forest", counters: { flood: 1 } }, ...lands("Mountain", 3)],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
    });
    const untapped = (x: S) => x.battlefield.filter((id) => chars(x, id).types.includes("Land") && !x.objects[id]?.tapped);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(untapped(s)).toHaveLength(4);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(untapped(s)).toHaveLength(2);
    expect(s.players.p2?.life).toBe(14);
  });

  it("Glarb : contact mortel ; terrains et sorts de VM 4 ou plus jouables depuis le dessus de la bibliothèque, pas les autres", () => {
    const setup = (top: string) =>
      scenario({ p1: { battlefield: ["Glarb, Calamity's Augur", ...lands("Mountain", 6)], library: [top, "Forest"] } });
    let s = setup("Forest");
    expect(chars(s, idOf(s, "p1", "battlefield", "Glarb, Calamity's Augur")).keywords).toContain("deathtouch");
    const land = s.players.p1?.library[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === land)).toBe(true);
    s = setup("Shivan Dragon");
    const dragon = s.players.p1?.library[0] as string;
    expect(castable(s, "p1", dragon)).toBe(true);
    s = resolve(act(s, "p1", { type: "cast", card: dragon }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    s = setup("Lightning Strike");
    expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
  });

  it("Glarb : {T} : surveillance 2", () => {
    let s = scenario({ p1: { battlefield: ["Glarb, Calamity's Augur"], library: ["Opt", "Stab", "Forest"] } });
    const glarb = idOf(s, "p1", "battlefield", "Glarb, Calamity's Augur");
    s = resolve(activateK8(s, "p1", glarb, "Surveillance 2"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s).sort()).toEqual(["Opt", "Stab"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
  });

  it("Helga : un sort de créature de VM 4 ou plus fait piocher, gagner 1 PV et met un marqueur sur elle ; pas un sort de VM 3", () => {
    let s = scenario({
      p1: { battlefield: ["Helga, Skittish Seer", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Goblin Smuggler"] },
    });
    const helga = idOf(s, "p1", "battlefield", "Helga, Skittish Seer");
    s = resolve(cast(s, "p1", "Goblin Smuggler"));
    expect([s.players.p1?.life, plusOne(s, helga), s.players.p1?.hand.length]).toEqual([20, 0, 1]);
    s = resolve(cast(s, "p1", "Shivan Dragon"));
    expect([s.players.p1?.life, plusOne(s, helga), s.players.p1?.hand.length]).toEqual([21, 1, 1]);
  });

  it("Helga : {T} : X mana d'une couleur (X = sa force), seulement pour les sorts de créature de VM 4 ou plus", () => {
    const s = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }, ...lands("Mountain", 2)],
        hand: ["Shivan Dragon", "Lightning Strike", "Goblin Smuggler"],
      },
    });
    // Force 4 : {R}{R}{R}{R} de Helga et deux Montagnes paient Shivan Dragon.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(true);
    const t = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }],
        hand: ["Lightning Strike", "Goblin Smuggler"],
      },
    });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Lightning Strike"))).toBe(false);
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Goblin Smuggler"))).toBe(false);
  });

  it("Helga : son mana paie aussi un sort de créature avec {X} dans son coût, quelle que soit sa valeur de mana", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }],
        hand: ["Wildwood Scourge", "Goblin Smuggler"],
      },
    });
    // Wildwood Scourge ({X}{G}) avec X = 1 : valeur de mana 2, payée par le seul mana de Helga.
    s = resolve(cast(s, "p1", "Wildwood Scourge", { x: 1 }));
    expect(idsOf(s, "p1", "battlefield", "Wildwood Scourge")).toHaveLength(1);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Goblin Smuggler"))).toBe(false);
  });

  it("Hugs : exile X cartes, jouables jusqu'à la fin de votre prochain tour ; un terrain supplémentaire à chacun de vos tours", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Forest", 3)],
        hand: ["Hugs, Grisly Guardian", "Plains"],
        library: ["Island", "Swamp", "Forest", "Forest"],
      },
    });
    s = resolve(cast(s, "p1", "Hugs, Grisly Guardian", { x: 2 }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Hugs, Grisly Guardian")).keywords).toContain("trample");
    expect(namesIn(s, s.exile).sort()).toEqual(["Island", "Swamp"]);
    const island = exiled(s, "Island")[0] as string;
    const swamp = exiled(s, "Swamp")[0] as string;
    s = act(s, "p1", { type: "playLand", card: island });
    s = act(s, "p1", { type: "playLand", card: swamp });
    // Deux terrains ce tour-ci, pas un troisième.
    const plains = idOf(s, "p1", "hand", "Plains");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === plains)).toBe(false);
  });

  it("Hugs : les cartes exilées restent jouables pendant votre prochain tour, plus après", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Forest", 3)],
        hand: ["Hugs, Grisly Guardian"],
        library: lands("Island", 6),
      },
    });
    s = resolve(cast(s, "p1", "Hugs, Grisly Guardian", { x: 1 }));
    const island = s.exile[0] as string;
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(playable(s, island)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.number === 6);
    expect(playable(s, island)).toBe(false);
  });

  it("Kitsa : vigilance et prouesse ; {T} : piochez puis défaussez", () => {
    let s = scenario({ p1: { battlefield: ["Kitsa, Otterball Elite"], hand: ["Stab"], library: ["Opt", "Forest"] } });
    const kitsa = idOf(s, "p1", "battlefield", "Kitsa, Otterball Elite");
    expect(chars(s, kitsa).keywords).toEqual(expect.arrayContaining(["vigilance", "prowess"]));
    s = resolve(activateK8(s, "p1", kitsa, "Piochez, puis défaussez"), (req, _p, cur) => pickNamed(cur, req, "Stab"));
    expect(handOf(s)).toEqual(["Opt"]);
    expect(graveOf(s)).toEqual(["Stab"]);
  });

  it("Kitsa : {2}, {T} : copie un éphémère ou un rituel que vous contrôlez, seulement si sa force est de 3 ou plus", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Kitsa, Otterball Elite", counters: { "+1/+1": 1 } }, ...lands("Mountain", 3)],
        hand: ["Shock"],
      },
    });
    const kitsa = idOf(s, "p1", "battlefield", "Kitsa, Otterball Elite");
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    const shock = s.stack[0]?.id as string;
    // Force 2 tant que la prouesse ne s'est pas résolue.
    expect(canActivateK8(s, "p1", kitsa, "Copie")).toBe(false);
    s = passBoth(s);
    expect(chars(s, kitsa).power).toBe(3);
    s = resolve(activateK8(s, "p1", kitsa, "Copie", { targets: { t: [shock] } }));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Lumra : portée et vigilance ; meule quatre cartes puis renvoie engagées toutes les cartes de terrain du cimetière ; F/E = vos terrains", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 6),
        hand: ["Lumra, Bellow of the Woods"],
        graveyard: ["Plains"],
        library: ["Island", "Opt", "Swamp", "Bear Cub", "Mountain"],
      },
    });
    s = resolve(cast(s, "p1", "Lumra, Bellow of the Woods"));
    const lumra = idOf(s, "p1", "battlefield", "Lumra, Bellow of the Woods");
    expect(chars(s, lumra).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Opt"]);
    for (const n of ["Plains", "Island", "Swamp"]) expect(s.objects[idOf(s, "p1", "battlefield", n)]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Mountain"]);
    expect(ptOf(s, lumra)).toEqual([9, 9]);
  });

  it("Maha : vol, piétinement et garde ; les créatures adverses ont une endurance de base de 1, pas les vôtres", () => {
    const s = scenario({
      p1: { battlefield: ["Maha, Its Feathers Night", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
    });
    const maha = idOf(s, "p1", "battlefield", "Maha, Its Feathers Night");
    expect(chars(s, maha).keywords).toEqual(expect.arrayContaining(["flying", "trample", "ward"]));
    expect(ptOf(s, maha)).toEqual([6, 5]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 1]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([3, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Ral : un sort non-créature lui donne un marqueur de loyauté ; +1 : une Loutre 1/1 bleu et rouge avec la prouesse", () => {
    let s = scenario({
      p1: {
        battlefield: ["Ral, Crackling Wit", "Island", "Forest"],
        hand: ["Opt", "Llanowar Elves"],
        library: lands("Plains", 3),
      },
    });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(cast(s, "p1", "Opt"));
    expect(s.objects[ral]?.counters.loyalty).toBe(5);
    s = resolve(cast(s, "p1", "Llanowar Elves"));
    expect(s.objects[ral]?.counters.loyalty).toBe(5);
    s = resolve(activateK8(s, "p1", ral, "Loutre"));
    expect(s.objects[ral]?.counters.loyalty).toBe(6);
    const otter = idOf(s, "p1", "battlefield", "Otter");
    expect(ptOf(s, otter)).toEqual([1, 1]);
    expect(chars(s, otter).colors.sort()).toEqual(["R", "U"]);
    expect(chars(s, otter).keywords).toContain("prowess");
  });

  it("Ral : −3 : piochez trois cartes, puis défaussez-en deux", () => {
    let s = scenario({ p1: { battlefield: ["Ral, Crackling Wit"], hand: ["Opt"], library: ["Plains", "Island", "Swamp"] } });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(activateK8(s, "p1", ral, "défaussez-en deux"));
    expect(s.objects[ral]?.counters.loyalty).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Ral : −10 : piochez trois cartes ; emblème — vos éphémères et rituels ont la réplique", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ral, Crackling Wit", counters: { loyalty: 10 } }, ...lands("Mountain", 2)],
        hand: ["Shock", "Shock"],
        library: lands("Plains", 4),
      },
    });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(activateK8(s, "p1", ral, "emblème"));
    expect(s.players.p1?.hand).toHaveLength(5);
    expect(s.players.p1?.command ?? []).toHaveLength(1);
    // Premier sort du tour : pas de copie ; deuxième : une copie.
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Ral : l'emblème compte aussi les sorts lancés par les adversaires avant le vôtre ce tour-ci", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ral, Crackling Wit", counters: { loyalty: 10 } }, "Mountain"],
        hand: ["Shock"],
        library: lands("Plains", 4),
      },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Ral, Crackling Wit"), "emblème"));
    s = act(s, "p1", { type: "pass" });
    s = resolve(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.life).toBe(18);
    expect(s.turn.active).toBe("p1");
    // Un sort (de l'adversaire) lancé avant : une copie.
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Season of Loss : {P} chaque joueur sacrifie une créature, puis {P}{P} piochez par créature morte sous votre contrôle ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Season of Loss"], library: lands("Plains", 3) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const mode = pawMode(s, "Season of Loss", [
      "Chaque joueur sacrifie une créature",
      "Piochez par créature morte sous votre contrôle",
    ]);
    s = resolve(cast(s, "p1", "Season of Loss", { mode }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Plains"]);
  });

  it("Season of Loss : {P}{P}{P} chaque adversaire perd X PV (X = cartes de créature de votre cimetière)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Season of Loss"], graveyard: ["Llanowar Elves", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const mode = pawMode(s, "Season of Loss", [
      "Chaque joueur sacrifie une créature",
      "Chaque adversaire perd X PV (créatures du cimetière)",
    ]);
    s = resolve(cast(s, "p1", "Season of Loss", { mode }));
    // Llanowar Elves et Bear Cub, sacrifié par le premier mode.
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Stormsplitter : célérité ; un éphémère ou un rituel crée une copie-jeton, exilée à la prochaine étape de fin ; pas un sort de créature", () => {
    let s = scenario({
      p1: { battlefield: ["Stormsplitter", ...lands("Mountain", 2)], hand: ["Shock", "Fanatical Firebrand"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Stormsplitter")).keywords).toContain("haste");
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(idsOf(s, "p1", "battlefield", "Stormsplitter")).toHaveLength(2);
    s = resolve(cast(s, "p1", "Fanatical Firebrand"));
    expect(idsOf(s, "p1", "battlefield", "Stormsplitter")).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const left = idsOf(s, "p1", "battlefield", "Stormsplitter");
    expect(left).toHaveLength(1);
    expect(s.objects[left[0] as string]?.isToken).toBeFalsy();
  });

  it("The Infamous Cruelclaw : menace ; blessures de combat à un joueur — exile jusqu'à une carte non-terrain, lancée en défaussant une carte", () => {
    let s = scenario({
      p1: { battlefield: ["The Infamous Cruelclaw"], hand: ["Opt"], library: ["Forest", "Serra Angel", "Island"] },
    });
    const claw = idOf(s, "p1", "battlefield", "The Infamous Cruelclaw");
    expect(chars(s, claw).keywords).toContain("menace");
    s = toCastNow(attack(s, [claw]), answer({ yes: true }));
    expect(graveOf(s)).toEqual(["Opt"]);
    const angel = exiled(s, "Serra Angel")[0] as string;
    expect(exiled(s, "Forest")).toHaveLength(1);
    s = resolve(act(s, "p1", { type: "cast", card: angel }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
  });

  it("Warren Warleader : chaque fois que vous attaquez, un Lapin 1/1 engagé et attaquant, ou vos attaquants +1/+1", () => {
    const setup = () => scenario({ p1: { battlefield: ["Warren Warleader", "Bear Cub", "Savannah Lions"] } });
    let s = setup();
    const ids = ["Warren Warleader", "Bear Cub"].map((n) => idOf(s, "p1", "battlefield", n));
    s = resolve(attack(s, ids), answer({ mode: "Lapin" }));
    const rabbit = idOf(s, "p1", "battlefield", "Rabbit");
    expect(s.objects[rabbit]?.tapped).toBe(true);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(rabbit);
    expect(ptOf(s, ids[1] as string)).toEqual([2, 2]);
    let t = setup();
    t = resolve(attack(t, ids), answer({ mode: "Attaquants" }));
    expect(ptOf(t, ids[0] as string)).toEqual([5, 5]);
    expect(ptOf(t, ids[1] as string)).toEqual([3, 3]);
    expect(ptOf(t, idOf(t, "p1", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    expect(idsOf(t, "p1", "battlefield", "Rabbit")).toHaveLength(0);
  });

  it("Warren Warleader : progéniture {2}", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Warren Warleader"] } });
    s = resolve(cast(s, "p1", "Warren Warleader", { kicked: true }));
    const all = idsOf(s, "p1", "battlefield", "Warren Warleader");
    expect(all).toHaveLength(2);
    expect(ptOf(s, all.find((id) => s.objects[id]?.isToken) as string)).toEqual([1, 1]);
  });

  it("Ygra : garde ; les autres créatures sont des Nourritures ; chaque Nourriture mise au cimetière depuis le champ de bataille lui donne deux marqueurs", () => {
    let s = scenario({
      p1: { battlefield: ["Ygra, Eater of All", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ygra = idOf(s, "p1", "battlefield", "Ygra, Eater of All");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, ygra).keywords).toContain("ward");
    expect(chars(s, ygra).subtypes).not.toContain("Food");
    for (const id of [cub, angel]) {
      expect(chars(s, id).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, id).subtypes).toContain("Food");
    }
    // La créature-Nourriture a « {2}, {T}, sacrifiez ce permanent : vous gagnez 3 PV ».
    s = resolve(activateK8(s, "p1", cub, "+3 PV"));
    expect(s.players.p1?.life).toBe(23);
    expect(plusOne(s, ygra)).toBe(2);
    destroy(s, angel);
    s = resolve(s);
    expect(plusOne(s, ygra)).toBe(4);
  });
});

describe("Bloomburrow, lot K8 : rares (1)", () => {
  const tokens = (s: S, name: keyof typeof TOKEN_SPECS, n: number) => {
    createTokens(s, "p1", TOKEN_SPECS[name] as TokenSpec, n);
    s.version += 1;
    return s;
  };

  it("Azure Beastbinder : vigilance ; imblocable par les créatures de force 2 ou plus ; en attaquant, une créature adverse perd ses capacités et devient 2/2 jusqu'à votre prochain tour", () => {
    let s = scenario({
      p1: { battlefield: ["Azure Beastbinder"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const binder = idOf(s, "p1", "battlefield", "Azure Beastbinder");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(chars(s, binder).keywords).toContain("vigilance");
    s = resolve(attack(s, [binder]), answer({ pick: [angel] }));
    expect(ptOf(s, angel)).toEqual([2, 2]);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: binder }] })).toThrow(RulesError);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: binder }] })).not.toThrow();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(ptOf(s, angel)).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(ptOf(s, angel)).toEqual([4, 4]);
    expect(chars(s, angel).keywords).toContain("flying");
  });

  it("Baylen : engagez quatre jetons — trois marqueurs +1/+1 et le piétinement ; engagez trois jetons — piochez ; deux — un mana", () => {
    let s = tokens(scenario({ p1: { battlefield: ["Baylen, the Haymaker"], library: lands("Plains", 3) } }), "Treasure", 4);
    const baylen = idOf(s, "p1", "battlefield", "Baylen, the Haymaker");
    expect(canActivateK8(s, "p1", baylen, "trois jetons")).toBe(true);
    s = resolve(activateK8(s, "p1", baylen, "quatre jetons"));
    expect(plusOne(s, baylen)).toBe(3);
    expect(chars(s, baylen).keywords).toContain("trample");
    expect(idsOf(s, "p1", "battlefield", "Treasure").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(canActivateK8(s, "p1", baylen, "deux jetons")).toBe(false);
    let t = tokens(scenario({ p1: { battlefield: ["Baylen, the Haymaker"], library: lands("Plains", 3) } }), "Treasure", 3);
    expect(canActivateK8(t, "p1", baylen, "quatre jetons")).toBe(false);
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Baylen, the Haymaker"), "trois jetons"));
    expect(handOf(t)).toEqual(["Plains"]);
  });

  it("Byway Barterer : menace ; dépense 4 — vous pouvez défausser votre main pour piocher deux cartes", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Byway Barterer", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike", "Opt"],
          library: lands("Plains", 3),
        },
      });
    const run = (yes: boolean) => {
      let s = setup();
      s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      return resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), answer({ yes }));
    };
    expect(chars(setup(), idOf(setup(), "p1", "battlefield", "Byway Barterer")).keywords).toContain("menace");
    const yes = run(true);
    expect(handOf(yes)).toEqual(["Plains", "Plains"]);
    expect(graveOf(yes)).toContain("Opt");
    expect(handOf(run(false))).toEqual(["Opt"]);
  });

  it("Camellia : menace pour elle et vos autres Écureuils ; sacrifier une Nourriture crée un Écureuil ; {2}, fourrager : un marqueur sur chaque autre Écureuil", () => {
    let s = scenario({
      p1: {
        battlefield: ["Camellia, the Seedmiser", "Bushy Bodyguard", "Bear Cub", ...lands("Forest", 4)],
        graveyard: ["Opt", "Stab", "Island"],
      },
      p2: { battlefield: ["Bushy Bodyguard"] },
    });
    s = tokens(s, "Food", 1);
    const camellia = idOf(s, "p1", "battlefield", "Camellia, the Seedmiser");
    const bushy = idOf(s, "p1", "battlefield", "Bushy Bodyguard");
    expect(chars(s, camellia).keywords).toContain("menace");
    expect(chars(s, bushy).keywords).toContain("menace");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
    expect(chars(s, idOf(s, "p2", "battlefield", "Bushy Bodyguard")).keywords).not.toContain("menace");
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Food"), "+3 PV"));
    const squirrel = idOf(s, "p1", "battlefield", "Squirrel");
    expect(ptOf(s, squirrel)).toEqual([1, 1]);
    s = resolve(activateK8(s, "p1", camellia, "Fourrager"));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect([plusOne(s, bushy), plusOne(s, squirrel), plusOne(s, camellia)]).toEqual([1, 1, 0]);
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Clement : vigilance ; vos Grenouilles ont « {T} : {G} ou {U}, seulement pour un sort de créature »", () => {
    const s = scenario({ p1: { battlefield: ["Clement, the Worrywort"], hand: ["Llanowar Elves", "Giant Growth"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Clement, the Worrywort")).keywords).toContain("vigilance");
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Giant Growth"))).toBe(false);
  });

  it("Clement : une créature qui arrive sous votre contrôle renvoie une de vos créatures de valeur de mana inférieure", () => {
    let s = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", ...lands("Plains", 5)], hand: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Serra Angel"), answer({ pick: [cub] }));
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Clement : seules vos créatures de valeur de mana inférieure peuvent être ciblées, et la cible est choisie au déclenchement", () => {
    let s = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", "Serra Angel", ...lands("Plains", 5)], hand: ["Llanowar Elves"] },
    });
    s = passUntil(cast(s, "p1", "Llanowar Elves"), (x) => x.pending?.kind === "choice");
    // Llanowar Elves (VM 1) : aucune créature de valeur de mana inférieure, rien n'est proposé.
    expect(s.pending?.kind === "choice" && s.pending.request.intent === "triggerTarget").toBe(false);
    s = resolve(s);
    expect(handOf(s)).toEqual([]);
    let t = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", "Serra Angel", ...lands("Plains", 5)], hand: ["Serra Angel"] },
    });
    t = passUntil(cast(t, "p1", "Serra Angel"), (x) => x.pending?.kind === "choice");
    const req = t.pending?.kind === "choice" ? t.pending.request : undefined;
    expect(req?.intent).toBe("triggerTarget");
    // Clement (VM 3) et Bear Cub (VM 2), pas l'autre Serra Angel (VM 5, pas inférieure).
    expect(namesIn(t, req?.type === "pick" ? req.options : []).sort()).toEqual(["Bear Cub", "Clement, the Worrywort"]);
  });

  it("Coiling Rebirth : une carte de créature revient du cimetière ; avec le cadeau, un jeton 1/1 copie en plus, sauf légendaire", () => {
    const setup = (creature: string) =>
      scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Coiling Rebirth"], graveyard: [creature] },
        p2: { library: lands("Island", 3) },
      });
    const run = (creature: string, kicked: boolean) => {
      const s = setup(creature);
      return resolve(cast(s, "p1", "Coiling Rebirth", { kicked, targets: { t: [idOf(s, "p1", "graveyard", creature)] } }));
    };
    const plain = run("Serra Angel", false);
    expect(idsOf(plain, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(plain.players.p2?.hand).toHaveLength(0);
    const gift = run("Serra Angel", true);
    const angels = idsOf(gift, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(2);
    const token = angels.find((id) => gift.objects[id]?.isToken) as string;
    expect(ptOf(gift, token)).toEqual([1, 1]);
    expect(chars(gift, token).keywords).toContain("flying");
    expect(gift.players.p2?.hand).toHaveLength(1);
    const legend = run("Byrke, Long Ear of the Law", true);
    expect(idsOf(legend, "p1", "battlefield", "Byrke, Long Ear of the Law")).toHaveLength(1);
  });

  it("Colossification : en arrivant, engage la créature enchantée ; +20/+20", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 7), "Bear Cub"], hand: ["Colossification"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Colossification", { targets: { enchant: [cub] } }));
    expect(s.objects[cub]?.tapped).toBe(true);
    expect(ptOf(s, cub)).toEqual([22, 22]);
  });

  it("Darkstar Augur : vol ; à votre entretien, la carte du dessus en main, et vous perdez sa valeur de mana", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Darkstar Augur"], library: ["Serra Angel", "Forest"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Darkstar Augur")).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Serra Angel à l'entretien (5 PV), puis la Forêt piochée.
    expect(handOf(s).sort()).toEqual(["Forest", "Serra Angel"]);
    expect(s.players.p1?.life).toBe(15);
  });

  it("Darkstar Augur : progéniture {B}", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Darkstar Augur"] } });
    s = resolve(cast(s, "p1", "Darkstar Augur", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Darkstar Augur")).toHaveLength(2);
  });

  it("Dreamdew Entrancer : portée ; engage jusqu'à une créature avec trois marqueurs d'étourdissement ; piochez deux cartes si vous la contrôlez", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2), "Bear Cub"],
          hand: ["Dreamdew Entrancer"],
          library: lands("Plains", 3),
        },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Dreamdew Entrancer"), answer({ pick: [angel] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Dreamdew Entrancer")).keywords).toContain("reach");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(3);
    expect(s.players.p1?.hand).toHaveLength(0);
    let t = setup();
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(cast(t, "p1", "Dreamdew Entrancer"), answer({ pick: [cub] }));
    expect(t.objects[cub]?.counters.stun).toBe(3);
    expect(handOf(t)).toEqual(["Plains", "Plains"]);
  });

  it("Fecund Greenshell : portée ; avec dix terrains ou plus, vos créatures ont +2/+2", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Fecund Greenshell", "Bear Cub", ...lands("Forest", n)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      return [ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub")), ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))];
    };
    expect(run(9)).toEqual([
      [2, 2],
      [2, 2],
    ]);
    expect(run(10)).toEqual([
      [4, 4],
      [2, 2],
    ]);
  });

  it("Fecund Greenshell : elle ou une créature d'endurance supérieure à sa force arrive — la carte du dessus : un terrain sur le champ de bataille engagé, sinon en main", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Fecund Greenshell"], library: ["Island", "Opt"] } });
    s = resolve(cast(s, "p1", "Fecund Greenshell"), answer({ yes: true }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Fecund Greenshell")).keywords).toContain("reach");
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    let t = scenario({
      p1: {
        battlefield: ["Fecund Greenshell", "Swamp", ...lands("Forest", 2)],
        hand: ["Bear Cub", "Vampire Neonate"],
        library: ["Opt", "Island"],
      },
    });
    // Vampire Neonate (0/3) : Opt n'est pas un terrain, elle va en main ; Bear Cub (2/2) ne déclenche rien.
    t = resolve(cast(t, "p1", "Vampire Neonate"));
    expect(handOf(t).sort()).toEqual(["Bear Cub", "Opt"]);
    t = resolve(cast(t, "p1", "Bear Cub"));
    expect(handOf(t)).toEqual(["Opt"]);
    expect(namesIn(t, t.players.p1?.library)).toEqual(["Island"]);
    // Un terrain refusé reste sur la bibliothèque (pas en main), et la carte suivante n'est pas regardée.
    let u = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Fecund Greenshell"], library: ["Island", "Opt"] } });
    u = resolve(cast(u, "p1", "Fecund Greenshell"), (req) => (req.intent === "lookAtTop" ? [] : undefined));
    expect(handOf(u)).toEqual([]);
    expect(namesIn(u, u.players.p1?.library)).toEqual(["Island", "Opt"]);
  });

  it("Finneas : portée et vigilance ; en attaquant, un marqueur sur chaque autre créature jeton ou Lapin ; piochez si la force totale atteint 10", () => {
    let s = scenario({
      p1: { battlefield: ["Finneas, Ace Archer", "Intrepid Rabbit", "Bear Cub"], library: lands("Plains", 3) },
    });
    s = tokens(s, "Cat", 1);
    const finneas = idOf(s, "p1", "battlefield", "Finneas, Ace Archer");
    const rabbit = idOf(s, "p1", "battlefield", "Intrepid Rabbit");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const cat = idOf(s, "p1", "battlefield", "Cat");
    expect(chars(s, finneas).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
    s = resolve(attack(s, [finneas]));
    expect([plusOne(s, rabbit), plusOne(s, cat), plusOne(s, cub), plusOne(s, finneas)]).toEqual([1, 1, 0, 0]);
    // 2 + 4 + 2 + 3 = 11 : une carte.
    expect(handOf(s)).toEqual(["Plains"]);
    let t = scenario({ p1: { battlefield: ["Finneas, Ace Archer", "Intrepid Rabbit"], library: lands("Plains", 3) } });
    t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Finneas, Ace Archer")]));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("For the Common Good : X copies d'un de vos jetons ; vos jetons indestructibles jusqu'à votre prochain tour ; 1 PV par jeton", () => {
    let s = tokens(scenario({ p1: { battlefield: lands("Forest", 5), hand: ["For the Common Good"] } }), "Food", 1);
    const food = idOf(s, "p1", "battlefield", "Food");
    s = resolve(cast(s, "p1", "For the Common Good", { x: 2, targets: { t: [food] } }));
    const foods = idsOf(s, "p1", "battlefield", "Food");
    expect(foods).toHaveLength(3);
    for (const id of foods) expect(chars(s, id).keywords).toContain("indestructible");
    expect(s.players.p1?.life).toBe(23);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, food).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, food).keywords).not.toContain("indestructible");
  });

  it("Gev : garde ; sans adversaire ayant perdu des PV, pas de marqueur ; un sort de Lézard inflige 1 blessure à un adversaire ciblé", () => {
    let s = scenario({
      p1: { battlefield: ["Gev, Scaled Scorch", ...lands("Forest", 2)], hand: ["Bear Cub", "Hired Claw", "Mountain"] },
    });
    const gev = idOf(s, "p1", "battlefield", "Gev, Scaled Scorch");
    expect(chars(s, gev).keywords).toContain("ward");
    // Personne n'a perdu de PV : pas de marqueur ; Bear Cub n'est pas un Lézard.
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    expect(s.players.p2?.life).toBe(20);
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") });
    s = resolve(cast(s, "p1", "Hired Claw"), answer({ pick: ["p2"] }));
    expect(s.players.p2?.life).toBe(19);
    // L'adversaire a perdu des PV avant la résolution : Hired Claw arrive avec un marqueur +1/+1.
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Hired Claw"))).toBe(1);
  });

  it("Gev : les créatures adverses n'arrivent pas avec des marqueurs", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Gev, Scaled Scorch"] },
      p2: { battlefield: [...lands("Mountain", 1), ...lands("Forest", 2)], hand: ["Shock", "Bear Cub"] },
    });
    s = resolve(cast(s, "p2", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = resolve(cast(s, "p2", "Bear Cub"));
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Hearthborn Battler : célérité ; le deuxième sort d'un joueur dans un tour inflige 2 blessures à un adversaire ciblé ; pas le premier ni le troisième", () => {
    let s = scenario({
      p1: { battlefield: ["Hearthborn Battler", ...lands("Mountain", 3)], hand: ["Shock", "Shock", "Shock"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Hearthborn Battler")).keywords).toContain("haste");
    const shock = (x: S) => resolve(cast(x, "p1", "Shock", { targets: { t: ["p2"] } }));
    s = shock(s);
    expect(s.players.p2?.life).toBe(18);
    s = shock(s);
    expect(s.players.p2?.life).toBe(14);
    s = shock(s);
    expect(s.players.p2?.life).toBe(12);
  });

  it("Innkeeper's Talent : au début du combat de votre tour, un marqueur +1/+1 sur une créature ciblée que vous contrôlez", () => {
    let s = scenario({ p1: { battlefield: ["Innkeeper's Talent", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(plusOne(s, cub)).toBe(1);
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
  });

  it("Innkeeper's Talent : niveau 2 — vos permanents avec des marqueurs ont la garde {1} ; niveau 3 — vos marqueurs sont doublés", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Innkeeper's Talent",
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Llanowar Elves",
          ...lands("Forest", 6),
        ],
        hand: ["Fleeting Flight", "Plains"],
      },
    });
    const talent = idOf(s, "p1", "battlefield", "Innkeeper's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, cub).keywords).not.toContain("ward");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    expect(chars(s, cub).keywords).toContain("ward");
    expect(chars(s, elves).keywords).not.toContain("ward");
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = resolve(cast(s, "p1", "Fleeting Flight", { targets: { t: [elves] } }));
    expect(plusOne(s, elves)).toBe(2);
    expect(chars(s, elves).keywords).toContain("ward");
  });

  it("Innkeeper's Talent : niveau 3 — seuls les marqueurs que vous mettez sont doublés, même sur une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Innkeeper's Talent", "Bear Cub", ...lands("Forest", 5), "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Serra Angel", "Plains"], hand: ["Fleeting Flight"] },
    });
    const talent = idOf(s, "p1", "battlefield", "Innkeeper's Talent");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Vous mettez un marqueur sur l'Ange adverse : deux.
    s = resolve(cast(s, "p1", "Fleeting Flight", { targets: { t: [angel] } }));
    expect(plusOne(s, angel)).toBe(2);
    // Un adversaire met un marqueur sur votre Ourson : un seul.
    let t = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Innkeeper's Talent" }, "Bear Cub"] },
      p2: { battlefield: ["Plains"], hand: ["Fleeting Flight"] },
    });
    const tal = idOf(t, "p1", "battlefield", "Innkeeper's Talent");
    (t.objects[tal] as { classLevel?: number }).classLevel = 3;
    t.version += 1;
    const cub2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(cast(t, "p2", "Fleeting Flight", { targets: { t: [cub2] } }));
    expect(plusOne(t, cub2)).toBe(1);
  });

  it("Jackdaw Savior : vol ; elle ou une autre de vos créatures volantes meurt — une autre carte de créature de valeur de mana inférieure revient du cimetière", () => {
    let s = scenario({
      p1: { battlefield: ["Jackdaw Savior", "Bear Cub"], graveyard: ["Llanowar Elves", "Serra Angel"] },
    });
    const jackdaw = idOf(s, "p1", "battlefield", "Jackdaw Savior");
    expect(chars(s, jackdaw).keywords).toContain("flying");
    destroy(s, jackdaw);
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Jackdaw Savior")).toHaveLength(0);
    // Une créature sans le vol qui meurt ne déclenche rien.
    let t = scenario({ p1: { battlefield: ["Jackdaw Savior", "Bear Cub"], graveyard: ["Llanowar Elves"] } });
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = resolve(t);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Jackdaw Savior : la carte de valeur de mana inférieure est ciblée au déclenchement ; partie du cimetière, rien ne revient", () => {
    let s = scenario({ p1: { battlefield: ["Jackdaw Savior"], graveyard: ["Llanowar Elves", "Bear Cub", "Serra Angel"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Jackdaw Savior"));
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.intent).toBe("triggerTarget");
    // Ni Serra Angel (VM 5), ni Jackdaw Savior elle-même (VM 3, pas inférieure).
    expect(namesIn(s, req?.type === "pick" ? req.options : []).sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    s = act(s, "p1", { type: "choose", values: [cub] });
    expect(s.stack.at(-1)?.targets.t).toEqual([cub]);
    moveObject(s, cub, "exile");
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(graveOf(s)).toContain("Llanowar Elves");
  });

  it("Kastral : des Oiseaux infligent des blessures de combat — un marqueur sur chaque Oiseau, ou piochez une carte", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Kastral, the Windcrested", "Healer's Hawk", "Bear Cub"], library: lands("Plains", 3) } });
    const go = (mode: string) => {
      const s = setup();
      const ids = ["Kastral, the Windcrested", "Healer's Hawk"].map((n) => idOf(s, "p1", "battlefield", n));
      return {
        s: resolve(
          passAccepting(attack(s, ids), (x) => x.turn.step === "combatDamage"),
          answer({ mode }),
        ),
        ids,
      };
    };
    const a = go("Marqueur");
    expect(a.ids.map((id) => plusOne(a.s, id))).toEqual([1, 1]);
    expect(plusOne(a.s, idOf(a.s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    // Un seul déclenchement pour deux Oiseaux.
    expect(a.s.players.p1?.hand).toHaveLength(0);
    const b = go("Piochez");
    expect(handOf(b.s)).toEqual(["Plains"]);
    expect(b.ids.map((id) => plusOne(b.s, id))).toEqual([0, 0]);
  });

  it("Kastral : ou un Oiseau de votre main mis sur le champ de bataille avec un marqueur de finalité", () => {
    let s = scenario({ p1: { battlefield: ["Kastral, the Windcrested"], hand: ["Healer's Hawk"] } });
    s = resolve(
      passAccepting(attack(s, [idOf(s, "p1", "battlefield", "Kastral, the Windcrested")]), (x) => x.turn.step === "combatDamage"),
      answer({ mode: "Oiseau" }),
    );
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    expect(s.objects[hawk]?.counters.finality).toBe(1);
  });

  it("Kitnap : vous contrôlez la créature enchantée, engagée ; sans cadeau, trois marqueurs d'étourdissement ; avec, l'adversaire pioche", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Kitnap"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Plains", 2) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      return { s: resolve(cast(s, "p1", "Kitnap", { kicked, targets: { enchant: [angel] } })), angel };
    };
    const a = run(false);
    expect(a.s.objects[a.angel]?.controller).toBe("p1");
    expect(a.s.objects[a.angel]?.tapped).toBe(true);
    expect(a.s.objects[a.angel]?.counters.stun).toBe(3);
    expect(a.s.players.p2?.hand).toHaveLength(0);
    const b = run(true);
    expect(b.s.objects[b.angel]?.controller).toBe("p1");
    expect(b.s.objects[b.angel]?.tapped).toBe(true);
    expect(b.s.objects[b.angel]?.counters.stun ?? 0).toBe(0);
    expect(b.s.players.p2?.hand).toHaveLength(1);
  });
});

/** Passe et répond aux choix jusqu'à la condition (les défenseurs ne bloquent pas). */
const driveUntil = (s: S, until: (x: S) => boolean, ans: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: ans(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};

describe("Bloomburrow, lot K8 : rares (2)", () => {
  it("Mabel : vos autres Souris +1/+1 ; en arrivant, Cragflame, Équipement légendaire incolore (+1/+1, vigilance, piétinement, célérité ; équiper {2})", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Plains", 2), "Flowerfoot Swordmaster", "Bear Cub"],
        hand: ["Mabel, Heir to Cragflame"],
      },
      p2: { battlefield: ["Flowerfoot Swordmaster"] },
    });
    s = resolve(cast(s, "p1", "Mabel, Heir to Cragflame"));
    const mabel = idOf(s, "p1", "battlefield", "Mabel, Heir to Cragflame");
    expect(ptOf(s, mabel)).toEqual([3, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster"))).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Flowerfoot Swordmaster"))).toEqual([1, 2]);
    const crag = idOf(s, "p1", "battlefield", "Cragflame");
    const c = chars(s, crag);
    expect(c.supertypes).toContain("Legendary");
    expect(c.colors).toEqual([]);
    expect(c.subtypes).toContain("Equipment");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", crag, "Équiper {2}", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "haste"]));
  });

  it("Manifold Mouse : au début du combat de votre tour, une Souris ciblée gagne la double initiative ou le piétinement, au choix", () => {
    const run = (mode: string) => {
      const s = scenario({ p1: { battlefield: ["Manifold Mouse", "Flowerfoot Swordmaster", "Bear Cub"] } });
      const sword = idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster");
      return { s: driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ mode, pick: [sword] })), sword };
    };
    const a = run("Double initiative");
    expect(chars(a.s, a.sword).keywords).toContain("doubleStrike");
    expect(chars(a.s, a.sword).keywords).not.toContain("trample");
    const b = run("Piétinement");
    expect(chars(b.s, b.sword).keywords).toContain("trample");
    // Seules vos Souris sont des cibles légales : Bear Cub ne gagne rien.
    let s = scenario({ p1: { battlefield: ["Manifold Mouse", "Bear Cub"] } });
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ mode: "Piétinement" }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
    expect(chars(s, idOf(s, "p1", "battlefield", "Manifold Mouse")).keywords).toContain("trample");
  });

  it("Manifold Mouse : progéniture {2}", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Manifold Mouse"] } });
    s = resolve(cast(s, "p1", "Manifold Mouse", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Manifold Mouse")).toHaveLength(2);
  });

  it("Mind Spring : piochez X cartes", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Mind Spring"], library: lands("Plains", 5) } });
    s = resolve(cast(s, "p1", "Mind Spring", { x: 3 }));
    expect(handOf(s)).toEqual(["Plains", "Plains", "Plains"]);
  });

  it("Portent of Calamity : quatre types exilés — un sort lancé gratuitement, le reste en main ; les cartes non exilées au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Portent of Calamity"],
        library: ["Forest", "Serra Angel", "Opt", "Duress", "Opt", "Plains"],
      },
    });
    s = toCastNow(cast(s, "p1", "Portent of Calamity", { x: 5 }));
    const angel = exiled(s, "Serra Angel")[0] as string;
    expect(castNowOf(s)?.cards).toContain(angel);
    s = resolve(act(s, "p1", { type: "cast", card: angel }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(handOf(s).sort()).toEqual(["Duress", "Forest", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Opt", "Portent of Calamity"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Plains"]);
  });

  it("Portent of Calamity : moins de quatre cartes exilées — pas de sort gratuit, elles vont en main", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Portent of Calamity"], library: ["Forest", "Serra Angel", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Portent of Calamity", { x: 2 }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handOf(s).sort()).toEqual(["Forest", "Serra Angel"]);
  });

  it("Salvation Swan : flash et vol ; elle ou un autre Oiseau arrive — une de vos créatures sans le vol est exilée et revient à l'étape de fin avec un marqueur de vol", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Salvation Swan"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Salvation Swan"), answer({ pick: [cub] }));
    const swan = idOf(s, "p1", "battlefield", "Salvation Swan");
    expect(chars(s, swan).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[back]?.counters.flying).toBe(1);
    expect(chars(s, back).keywords).toContain("flying");
  });

  it("Scavenger's Talent : une Nourriture quand une ou plusieurs de vos créatures meurent, une fois par tour", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenger's Talent", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Scavenger's Talent : niveau 2 — sacrifier un permanent fait meuler deux cartes à un joueur ciblé ; niveau 3 — à votre étape de fin, sacrifier trois permanents réanime une créature avec un marqueur de finalité", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenger's Talent", ...lands("Swamp", 7)], graveyard: ["Serra Angel"] },
      p2: { library: lands("Island", 5) },
    });
    s.version += 1;
    createTokens(s, "p1", TOKEN_SPECS.Food as TokenSpec, 4);
    const talent = idOf(s, "p1", "battlefield", "Scavenger's Talent");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", idsOf(s, "p1", "battlefield", "Food")[0] as string, "+3 PV"), answer({ pick: ["p2"] }));
    expect(s.players.p2?.graveyard).toHaveLength(2);
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    s = driveUntil(
      s,
      (x) => x.turn.active === "p2",
      (req) =>
        req.type === "yesNo"
          ? [1]
          : req.type === "pick" && req.intent === "sacrifice"
            ? req.options.slice(0, 3)
            : req.type === "pick" && req.options.includes("p2")
              ? ["p2"]
              : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters.finality).toBe(1);
    // Trois sacrifices au niveau 2 : six cartes meulées de plus (la bibliothèque n'en avait que trois).
    expect(s.players.p2?.library).toHaveLength(0);
  });

  it("Serra Redeemer : vol ; une autre créature de force 2 ou moins arrive sous votre contrôle — deux marqueurs +1/+1 ; pas une créature plus forte ni adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Redeemer", ...lands("Plains", 7)], hand: ["Savannah Lions", "Serra Angel"] },
      p2: { battlefield: ["Plains"], hand: ["Savannah Lions"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Serra Redeemer")).keywords).toContain("flying");
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(2);
    s = resolve(cast(s, "p1", "Serra Angel"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(cast(s, "p2", "Savannah Lions"));
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toBe(0);
  });

  it("Tender Wildguide : {T} : un mana de n'importe quelle couleur ; {T} : un marqueur +1/+1 sur elle ; progéniture {2}", () => {
    let s = scenario({ p1: { battlefield: ["Tender Wildguide"] } });
    const guide = idOf(s, "p1", "battlefield", "Tender Wildguide");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === guide ? a.colors : []));
    expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    s = resolve(activateK8(s, "p1", guide, "Marqueur"));
    expect(plusOne(s, guide)).toBe(1);
    expect(s.objects[guide]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Tender Wildguide"] } });
    t = resolve(cast(t, "p1", "Tender Wildguide", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Tender Wildguide")).toHaveLength(2);
  });

  it("Thornvault Forager : {T}, fourrager : deux mana ; {3}{G}, {T} : cherche une carte d'Écureuil", () => {
    let s = scenario({ p1: { battlefield: ["Thornvault Forager"], graveyard: ["Opt", "Stab", "Island"] } });
    const forager = idOf(s, "p1", "battlefield", "Thornvault Forager");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === forager && a.colors.includes("G"))).toBe(
      true,
    );
    s = resolve(activateK8(s, "p1", forager, "Fourrager"));
    const pool = s.players.p1?.manaPool ?? {};
    expect(Object.values(pool).reduce((n: number, v) => n + (typeof v === "number" ? v : 0), 0)).toBe(2);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: ["Thornvault Forager", ...lands("Forest", 4)], library: ["Forest", "Bushy Bodyguard", "Opt"] },
    });
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Thornvault Forager"), "Écureuil"));
    expect(handOf(t)).toEqual(["Bushy Bodyguard"]);
  });

  it("Thundertrap Trainer : regarde quatre cartes, une carte non-créature non-terrain en main, le reste dessous ; progéniture {4}", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Thundertrap Trainer"],
        library: ["Bear Cub", "Forest", "Opt", "Island", "Plains"],
      },
    });
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Thundertrap Trainer"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(options).toEqual(["Opt"]);
    expect(handOf(s)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Plains");
    let t = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Thundertrap Trainer"] } });
    t = resolve(cast(t, "p1", "Thundertrap Trainer", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Thundertrap Trainer")).toHaveLength(2);
  });

  it("Valley Floodcaller : flash ; vos sorts non-créature ont le flash ; chacun donne +1/+1 à vos Oiseaux, Grenouilles, Loutres et Rats et les dégage", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Valley Floodcaller", tapped: true },
          { name: "Healer's Hawk", tapped: true },
          { name: "Bear Cub", tapped: true },
          "Island",
          "Swamp",
        ],
        hand: ["Opt", "Duress"],
        library: lands("Plains", 3),
      },
    });
    const caller = idOf(s, "p1", "battlefield", "Valley Floodcaller");
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, caller).keywords).toContain("flash");
    s = cast(s, "p1", "Opt");
    // Un rituel alors que la pile n'est pas vide.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Duress"))).toBe(true);
    s = resolve(s);
    expect([s.objects[caller]?.tapped, s.objects[hawk]?.tapped, s.objects[cub]?.tapped]).toEqual([false, false, true]);
    expect(ptOf(s, caller)).toEqual([3, 3]);
    expect(ptOf(s, hawk)).toEqual([2, 2]);
    expect(ptOf(s, cub)).toEqual([2, 2]);
  });

  it("Valley Mightcaller : piétinement ; une autre Grenouille, Lapin, Raton laveur ou Écureuil arrive sous votre contrôle — un marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Valley Mightcaller", ...lands("Forest", 4)], hand: ["Bushy Bodyguard", "Bear Cub"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bushy Bodyguard"] },
    });
    const caller = idOf(s, "p1", "battlefield", "Valley Mightcaller");
    expect(chars(s, caller).keywords).toContain("trample");
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, caller)).toBe(1);
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, caller)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(cast(s, "p2", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, caller)).toBe(1);
  });

  it("Valley Questcaller : vos autres Lapins, Chauves-souris, Oiseaux et Souris +1/+1 ; leur arrivée (une ou plusieurs) fait regarder une carte", () => {
    let s = scenario({
      p1: { battlefield: ["Valley Questcaller", "Healer's Hawk", "Bear Cub", ...lands("Plains", 3)], hand: ["Hop to It"] },
      p2: { battlefield: ["Healer's Hawk"] },
    });
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Valley Questcaller"))).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Healer's Hawk"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Healer's Hawk"))).toEqual([1, 1]);
    let scries = 0;
    s = resolve(cast(s, "p1", "Hop to It"), (req) => {
      if (req.intent === "scryBottom") scries += 1;
      return undefined;
    });
    expect(scries).toBe(1);
    for (const id of idsOf(s, "p1", "battlefield", "Rabbit")) expect(ptOf(s, id)).toEqual([2, 2]);
  });

  it("Valley Rotcaller : menace ; en attaquant, chaque adversaire perd X PV et vous en gagnez X (vos autres Écureuils, Chauves-souris, Lézards et Rats)", () => {
    let s = scenario({ p1: { battlefield: ["Valley Rotcaller", "Bushy Bodyguard", "Hired Claw", "Bear Cub"] } });
    const rot = idOf(s, "p1", "battlefield", "Valley Rotcaller");
    expect(chars(s, rot).keywords).toContain("menace");
    s = resolve(attack(s, [rot]));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Whiskervale Forerunner : vaillance — regarde cinq cartes ; hors de votre tour, une créature de VM 3 ou moins va en main", () => {
    let s = scenario({
      active: "p2",
      p1: {
        battlefield: ["Whiskervale Forerunner", "Forest"],
        hand: ["Giant Growth"],
        library: ["Serra Angel", "Bear Cub", "Forest", "Opt", "Island", "Plains"],
      },
    });
    const fore = idOf(s, "p1", "battlefield", "Whiskervale Forerunner");
    s = act(s, "p2", { type: "pass" });
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [fore] } }), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(options).toEqual(["Bear Cub"]);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Plains");
  });

  it("Whiskervale Forerunner : pendant votre tour, la créature peut aller sur le champ de bataille", () => {
    let s = scenario({
      p1: { battlefield: ["Whiskervale Forerunner", "Forest"], hand: ["Giant Growth"], library: ["Bear Cub", "Forest"] },
    });
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Whiskervale Forerunner")] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Whiskervale Forerunner : pendant votre tour, vous pouvez aussi la garder en main (« si vous ne la mettez pas sur le champ de bataille »)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Whiskervale Forerunner", "Forest"],
        hand: ["Giant Growth"],
        library: ["Bear Cub", "Forest", "Opt", "Island", "Plains", "Swamp"],
      },
    });
    let asked = false;
    s = resolve(
      cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Whiskervale Forerunner")] } }),
      (req) => {
        if (req.type !== "yesNo") return undefined;
        asked = true;
        return [0];
      },
    );
    expect(asked).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Swamp");
  });

  it("Zoraline : vol et vigilance ; en arrivant, payez {W}{B} et 2 PV pour réanimer un permanent non-terrain de VM 3 ou moins avec un marqueur de finalité", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Swamp", 2)],
          hand: ["Zoraline, Cosmos Caller"],
          graveyard: ["Bear Cub", "Serra Angel", "Forest", "Banishing Light"],
        },
      });
    let s = setup();
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Zoraline, Cosmos Caller"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerTarget") {
        options = namesIn(cur, req.options) as string[];
        return [idOf(cur, "p1", "graveyard", "Bear Cub")];
      }
      return undefined;
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Zoraline, Cosmos Caller")).keywords).toEqual(
      expect.arrayContaining(["flying", "vigilance"]),
    );
    expect(options.sort()).toEqual(["Banishing Light", "Bear Cub"]);
    expect(s.players.p1?.life).toBe(18);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.finality).toBe(1);
    const no = resolve(cast(setup(), "p1", "Zoraline, Cosmos Caller"), answer({ yes: false }));
    expect(no.players.p1?.life).toBe(20);
    expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Zoraline : chaque Chauve-souris que vous contrôlez qui attaque fait gagner 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Zoraline, Cosmos Caller", "Starscape Cleric", "Bear Cub"] } });
    const ids = ["Zoraline, Cosmos Caller", "Starscape Cleric", "Bear Cub"].map((n) => idOf(s, "p1", "battlefield", n));
    s = resolve(attack(s, ids), answer({ yes: false }));
    // Deux Chauves-souris (Starscape Cleric fait aussi perdre 1 PV par gain de PV).
    expect(s.players.p1?.life).toBe(22);
  });
});

/** Crée `n` jetons `name` (TOKEN_SPECS) pour `player`. */
const addTokens = (s: S, name: string, n: number, player: PlayerId = "p1"): S => {
  createTokens(s, player, TOKEN_SPECS[name] as TokenSpec, n);
  s.version += 1;
  return s;
};

describe("Bloomburrow, lot K8 : peu communes (1)", () => {
  it("Bandit's Talent : chaque adversaire défausse deux cartes, sauf s'il défausse une carte non-terrain", () => {
    const run = (hand: string[], pick?: string) => {
      const s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Bandit's Talent"] }, p2: { hand } });
      return resolve(cast(s, "p1", "Bandit's Talent"), (req, _p, cur) => (pick ? pickNamed(cur, req, pick) : undefined));
    };
    const a = run(["Forest", "Island", "Opt"], "Opt");
    expect(handOf(a, "p2").sort()).toEqual(["Forest", "Island"]);
    const b = run(["Forest", "Island", "Plains"]);
    expect(b.players.p2?.hand).toHaveLength(1);
  });

  it("Bandit's Talent : niveau 2 — à l'entretien d'un adversaire qui a une carte en main ou moins, il perd 2 PV ; niveau 3 — une pioche de plus par tel adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Bandit's Talent", ...lands("Swamp", 5)], library: lands("Plains", 5) },
      p2: { hand: ["Opt", "Opt"], library: lands("Island", 5) },
    });
    const talent = idOf(s, "p1", "battlefield", "Bandit's Talent");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    // Deux cartes à son entretien : rien.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p2?.life).toBe(20);
    // p1 pioche deux cartes à son étape de pioche (p2 en a trois).
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(1);
    let t = scenario({
      active: "p1",
      step: "end",
      p1: { battlefield: [{ name: "Bandit's Talent" }], library: lands("Plains", 5) },
      p2: { hand: ["Opt"], library: lands("Island", 5) },
    });
    t.objects[idOf(t, "p1", "battlefield", "Bandit's Talent")]!.classLevel = 3;
    t.version += 1;
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "draw");
    expect(t.players.p2?.life).toBe(18);
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Deux cartes en main pour p2 après sa pioche : pas de pioche supplémentaire.
    expect(t.players.p1?.hand).toHaveLength(1);
    let u = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: [{ name: "Bandit's Talent" }], library: lands("Plains", 5) },
      p2: { hand: [], library: lands("Island", 5) },
    });
    u.objects[idOf(u, "p1", "battlefield", "Bandit's Talent")]!.classLevel = 3;
    u.version += 1;
    u = advanceUntil(u, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(u.players.p1?.hand).toHaveLength(2);
  });

  it("Blacksmith's Talent : une Épée (+1/+1, équiper {2}) ; niveau 2 — au début du combat, attache un Équipement ; niveau 3 — double initiative et célérité pendant votre tour", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 8), "Bear Cub"], hand: ["Blacksmith's Talent"] } });
    s = resolve(cast(s, "p1", "Blacksmith's Talent"));
    const sword = idOf(s, "p1", "battlefield", "Sword");
    expect(chars(s, sword).subtypes).toContain("Equipment");
    expect(chars(s, sword).colors).toEqual([]);
    const talent = idOf(s, "p1", "battlefield", "Blacksmith's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ pick: [sword, cub] }));
    expect(s.objects[sword]?.attachedTo).toBe(cub);
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["doubleStrike", "haste"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, cub).keywords).not.toContain("doubleStrike");
  });

  it("Blooming Blast : 2 blessures à une créature ; avec le cadeau (un Trésor), 3 blessures de plus à son contrôleur", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Blooming Blast"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      return resolve(cast(s, "p1", "Blooming Blast", { kicked, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    };
    const a = run(false);
    expect(a.objects[idOf(a, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(a.players.p2?.life).toBe(20);
    expect(idsOf(a, "p2", "battlefield", "Treasure")).toHaveLength(0);
    const b = run(true);
    expect(b.players.p2?.life).toBe(17);
    expect(idsOf(b, "p2", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Builder's Talent : un Mur 0/4 blanc avec le défenseur ; niveau 2 — un permanent non-créature non-terrain qui arrive met un marqueur ; niveau 3 — renvoie une telle carte du cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 11)],
        hand: ["Builder's Talent", "Banishing Light"],
        graveyard: ["Short Bow", "Bear Cub"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = resolve(cast(s, "p1", "Builder's Talent"));
    const wall = idOf(s, "p1", "battlefield", "Wall");
    expect(ptOf(s, wall)).toEqual([0, 4]);
    expect(chars(s, wall).colors).toEqual(["W"]);
    expect(chars(s, wall).keywords).toContain("defender");
    const talent = idOf(s, "p1", "battlefield", "Builder's Talent");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(cast(s, "p1", "Banishing Light"), answer({ pick: [idOf(s, "p2", "battlefield", "Serra Angel"), wall] }));
    expect(plusOne(s, wall)).toBe(1);
    let options: string[] = [];
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(idsOf(s, "p1", "battlefield", "Short Bow")).toHaveLength(1);
    expect(options.every((n) => n !== "Bear Cub")).toBe(true);
    // Short Bow est arrivé : un autre marqueur (niveau 2).
    expect(plusOne(s, wall)).toBe(2);
  });

  it("Consumed by Greed : l'adversaire ciblé sacrifie sa créature de plus grande force ; avec le cadeau, une carte de créature revient en main", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Consumed by Greed"], graveyard: ["Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"], library: lands("Island", 2) },
      });
      return resolve(
        cast(s, "p1", "Consumed by Greed", {
          kicked,
          targets: { p: ["p2"], t: kicked ? [idOf(s, "p1", "graveyard", "Llanowar Elves")] : [] },
        }),
      );
    };
    const a = run(false);
    expect(idsOf(a, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(a, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(a.players.p1?.hand).toHaveLength(0);
    const b = run(true);
    expect(handOf(b)).toEqual(["Llanowar Elves"]);
    expect(b.players.p2?.hand).toHaveLength(1);
  });

  it("Coruscation Mage : chaque sort non-créature que vous lancez inflige 1 blessure à chaque adversaire ; progéniture {2}", () => {
    let s = scenario({
      p1: { battlefield: ["Coruscation Mage", "Island", "Forest"], hand: ["Opt", "Llanowar Elves"], library: lands("Plains", 2) },
    });
    s = resolve(cast(s, "p1", "Opt"));
    expect(s.players.p2?.life).toBe(19);
    s = resolve(cast(s, "p1", "Llanowar Elves"));
    expect(s.players.p2?.life).toBe(19);
    let t = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Coruscation Mage"] } });
    t = resolve(cast(t, "p1", "Coruscation Mage", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Coruscation Mage")).toHaveLength(2);
  });

  it("Dewdrop Cure : jusqu'à deux cartes de créature de VM 2 ou moins reviennent du cimetière ; trois avec le cadeau", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Plains", 3),
          hand: ["Dewdrop Cure"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Savannah Lions", "Serra Angel"],
        },
        p2: { library: lands("Island", 2) },
      });
    let s = setup();
    const { opt } = castOption(s, "Dewdrop Cure");
    expect(namesIn(s, opt?.modes[0]?.targets[0]?.legal).sort()).toEqual(["Bear Cub", "Llanowar Elves", "Savannah Lions"]);
    const three = ["Bear Cub", "Llanowar Elves", "Savannah Lions"].map((n) => idOf(s, "p1", "graveyard", n));
    expect(() => cast(s, "p1", "Dewdrop Cure", { targets: { t: three } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Dewdrop Cure", { targets: { t: three.slice(0, 2) } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    let t = setup();
    t = resolve(cast(t, "p1", "Dewdrop Cure", { kicked: true, targets: { t: three } }));
    expect(graveOf(t).sort()).toEqual(["Dewdrop Cure", "Serra Angel"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Downwind Ambusher : flash ; -1/-1 à une créature adverse, ou détruit une créature adverse blessée ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Mountain"], hand: ["Downwind Ambusher", "Shock"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    expect(castOption(s, "Downwind Ambusher").opt).toBeDefined();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Shock", { targets: { t: [angel] } }));
    s = resolve(cast(s, "p1", "Downwind Ambusher"), answer({ mode: "Détruit", pick: [angel] }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Downwind Ambusher"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    t = resolve(cast(t, "p1", "Downwind Ambusher"), answer({ mode: "-1/-1" }));
    expect(idsOf(t, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(chars(t, idOf(t, "p1", "battlefield", "Downwind Ambusher")).keywords).toContain("flash");
  });

  it("Feather of Flight : flash ; en arrivant, piochez une carte ; +1/+0 et le vol", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Feather of Flight"], library: lands("Island", 2) },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Feather of Flight", { targets: { enchant: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("flying");
    expect(handOf(s)).toEqual(["Island"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Feather of Flight")).keywords).toContain("flash");
  });

  it("Flamecache Gecko : en arrivant, {B}{R} si un adversaire a perdu des PV ce tour-ci ; {1}{R}, défaussez une carte : piochez", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Shock", "Flamecache Gecko"] } });
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    s = resolve(cast(s, "p1", "Flamecache Gecko"));
    expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Flamecache Gecko", "Opt"], library: lands("Plains", 2) },
    });
    t = resolve(cast(t, "p1", "Flamecache Gecko"));
    expect(t.players.p1?.manaPool.B ?? 0).toBe(0);
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Flamecache Gecko"), "Défaussez"));
    expect(graveOf(t)).toEqual(["Opt"]);
    expect(handOf(t)).toEqual(["Plains"]);
  });

  it("Flowerfoot Swordmaster : vaillance — vos Souris +1/+0 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Flowerfoot Swordmaster", "Seedglaive Mentor", "Bear Cub", "Forest"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Flowerfoot Swordmaster"] },
    });
    const sword = idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [sword] } }));
    expect(ptOf(s, sword)).toEqual([5, 5]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Seedglaive Mentor"))).toEqual([4, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Flowerfoot Swordmaster"))).toEqual([1, 2]);
  });

  it("Gossip's Talent : une créature arrive sous votre contrôle — surveillance 1", () => {
    let s = scenario({
      p1: { battlefield: ["Gossip's Talent", ...lands("Forest", 2)], hand: ["Bear Cub"], library: ["Opt", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Bear Cub"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s)).toEqual(["Opt"]);
  });

  it("Gossip's Talent : niveau 2 — en attaquant, une attaquante de force 3 ou moins ne peut pas être bloquée ; niveau 3 — après des blessures de combat, exilée puis renvoyée", () => {
    let s = scenario({
      p1: { battlefield: ["Gossip's Talent", "Bear Cub", ...lands("Island", 6)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const talent = idOf(s, "p1", "battlefield", "Gossip's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    s = resolve(attack(s, [cub]));
    expect(chars(s, cub).keywords).toContain("unblockable");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: cub }] })).toThrow(RulesError);
    s = driveUntil(s, (x) => x.turn.step === "main2", answer({ yes: true }));
    expect(s.players.p2?.life).toBe(18);
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(cub);
    expect(s.objects[back]?.tapped).toBe(false);
  });

  it("Hazel's Nocturne : jusqu'à deux cartes de créature du cimetière en main ; chaque adversaire perd 2 PV, vous en gagnez 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Hazel's Nocturne"], graveyard: ["Bear Cub", "Serra Angel", "Opt"] },
    });
    const ids = ["Bear Cub", "Serra Angel"].map((n) => idOf(s, "p1", "graveyard", n));
    s = resolve(cast(s, "p1", "Hazel's Nocturne", { targets: { t: ids } }));
    expect(handOf(s).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
  });

  it("Hivespine Wolverine : un marqueur +1/+1 sur une de vos créatures, ou se bat contre un jeton de créature, ou détruit un artefact ou un enchantement", () => {
    const setup = () =>
      addTokens(
        scenario({
          p1: { battlefield: [...lands("Forest", 5), "Bear Cub"], hand: ["Hivespine Wolverine"] },
          p2: { battlefield: ["Banishing Light", "Serra Angel"] },
        }),
        "Cat",
        1,
        "p2",
      );
    let s = setup();
    const cat = idOf(s, "p2", "battlefield", "Cat");
    s = resolve(cast(s, "p1", "Hivespine Wolverine"), answer({ mode: "Se bat", pick: [cat] }));
    expect(idsOf(s, "p2", "battlefield", "Cat")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hivespine Wolverine")]?.damage).toBe(1);
    let t = setup();
    t = resolve(
      cast(t, "p1", "Hivespine Wolverine"),
      answer({ mode: "Détruit", pick: [idOf(t, "p2", "battlefield", "Banishing Light")] }),
    );
    expect(idsOf(t, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let u = setup();
    const cub = idOf(u, "p1", "battlefield", "Bear Cub");
    u = resolve(cast(u, "p1", "Hivespine Wolverine"), answer({ mode: "Marqueur", pick: [cub] }));
    expect(plusOne(u, cub)).toBe(1);
  });

  it("Hivespine Wolverine : le combat ne vise qu'un jeton de créature", () => {
    const s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Hivespine Wolverine"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const t = resolve(cast(s, "p1", "Hivespine Wolverine"), answer({ mode: "Se bat" }));
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Hoarder's Overflow : un marqueur de réserve en arrivant et à chaque dépense 4 ; {1}{R}, sacrifiez-le : défaussez votre main, piochez une carte par marqueur", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 6),
        hand: ["Hoarder's Overflow", "Lightning Strike", "Opt"],
        library: lands("Plains", 4),
      },
    });
    s = resolve(cast(s, "p1", "Hoarder's Overflow"));
    const hoard = idOf(s, "p1", "battlefield", "Hoarder's Overflow");
    expect(s.objects[hoard]?.counters.stash).toBe(1);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.objects[hoard]?.counters.stash).toBe(2);
    s = resolve(activateK8(s, "p1", hoard, "Défaussez votre main"));
    expect(graveOf(s)).toEqual(expect.arrayContaining(["Opt", "Hoarder's Overflow"]));
    expect(handOf(s)).toEqual(["Plains", "Plains"]);
  });

  it("Honored Dreyleader : piétinement ; arrive avec un marqueur par autre Écureuil et Nourriture ; un autre Écureuil ou Nourriture qui arrive en ajoute un", () => {
    let s = addTokens(
      scenario({
        p1: {
          battlefield: [...lands("Forest", 7), "Bushy Bodyguard", "Bear Cub"],
          hand: ["Honored Dreyleader", "Bushy Bodyguard", "Bear Cub"],
        },
      }),
      "Food",
      1,
    );
    s = resolve(cast(s, "p1", "Honored Dreyleader"));
    const drey = idOf(s, "p1", "battlefield", "Honored Dreyleader");
    expect(chars(s, drey).keywords).toContain("trample");
    expect(plusOne(s, drey)).toBe(2);
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, drey)).toBe(3);
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, drey)).toBe(3);
  });

  it("Hunter's Talent : en arrivant, une de vos créatures inflige des blessures égales à sa force à une créature que vous ne contrôlez pas", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), "Serra Angel"], hand: ["Hunter's Talent"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = resolve(
      cast(s, "p1", "Hunter's Talent"),
      answer({ pick: [idOf(s, "p1", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")] }),
    );
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Hunter's Talent : niveau 2 — en attaquant, une attaquante +1/+0 et piétinement ; niveau 3 — piochez à votre étape de fin si vous contrôlez une créature de force 4 ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Hunter's Talent", "Bear Cub", ...lands("Forest", 6)], library: lands("Plains", 3) },
    });
    const talent = idOf(s, "p1", "battlefield", "Hunter's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Niveau 2"));
    s = resolve(activateK8(s, "p1", talent, "Niveau 3"));
    s = resolve(attack(s, [cub]));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("trample");
    // Force 3 seulement : pas de pioche à l'étape de fin.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(0);
    let t = scenario({
      active: "p1",
      step: "main2",
      p1: { battlefield: ["Hunter's Talent", "Serra Angel"], library: lands("Plains", 3) },
    });
    t.objects[idOf(t, "p1", "battlefield", "Hunter's Talent")]!.classLevel = 3;
    t.version += 1;
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(handOf(t)).toEqual(["Plains"]);
  });
});

describe("Bloomburrow, lot K8 : peu communes (2)", () => {
  it("Huskburster Swarm : coûte {1} de moins par carte de créature que vous possédez en exil et dans votre cimetière ; menace et contact mortel", () => {
    const setup = (n: number, exiledOne: boolean) => {
      const s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Huskburster Swarm"], graveyard: Array(n).fill("Bear Cub") } });
      if (exiledOne) moveObject(s, s.players.p1?.graveyard[0] as string, "exile");
      return s;
    };
    const castableSwarm = (s: S) => castable(s, "p1", idOf(s, "p1", "hand", "Huskburster Swarm"));
    expect(castableSwarm(setup(6, false))).toBe(false);
    expect(castableSwarm(setup(7, false))).toBe(true);
    // Une des sept cartes de créature exilée : elle compte toujours.
    expect(castableSwarm(setup(7, true))).toBe(true);
    let s = setup(7, false);
    s = resolve(cast(s, "p1", "Huskburster Swarm"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Huskburster Swarm")).keywords).toEqual(
      expect.arrayContaining(["menace", "deathtouch"]),
    );
  });

  it("Knightfisher : vol ; un autre Oiseau non-jeton arrive sous votre contrôle — un Poisson 1/1 bleu ; pas une autre créature", () => {
    let s = scenario({ p1: { battlefield: ["Knightfisher", ...lands("Plains", 3)], hand: ["Healer's Hawk", "Savannah Lions"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Knightfisher")).keywords).toContain("flying");
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(0);
    s = resolve(cast(s, "p1", "Healer's Hawk"));
    const fish = idOf(s, "p1", "battlefield", "Fish");
    expect(ptOf(s, fish)).toEqual([1, 1]);
    expect(chars(s, fish).colors).toEqual(["U"]);
  });

  it("Lilypad Village : {T} : {U} seulement pour un sort de créature ; {U}, {T} : surveillance 2 si un Oiseau, une Grenouille, une Loutre ou un Rat est arrivé ce tour-ci", () => {
    const a = scenario({ p1: { battlefield: ["Lilypad Village", "Mountain"], hand: ["Opt", "Plumecreed Escort"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Plumecreed Escort"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Opt"))).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Lilypad Village", "Island", "Plains"], hand: ["Healer's Hawk"], library: ["Opt", "Stab", "Forest"] },
    });
    const village = idOf(s, "p1", "battlefield", "Lilypad Village");
    expect(canActivateK8(s, "p1", village, "Surveillance 2")).toBe(false);
    s = resolve(cast(s, "p1", "Healer's Hawk"));
    s = resolve(activateK8(s, "p1", village, "Surveillance 2"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s).sort()).toEqual(["Opt", "Stab"]);
  });

  it("Lilysplash Mentor : portée ; {1}{G}{U} : exile une autre de vos créatures, qui revient avec un marqueur +1/+1 (rituel)", () => {
    let s = scenario({ p1: { battlefield: ["Lilysplash Mentor", "Bear Cub", ...lands("Forest", 2), "Island"] } });
    const mentor = idOf(s, "p1", "battlefield", "Lilysplash Mentor");
    expect(chars(s, mentor).keywords).toContain("reach");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", mentor, "Exile", { targets: { t: [cub] } }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(cub);
    expect(plusOne(s, back)).toBe(1);
    const t = scenario({ active: "p2", p1: { battlefield: ["Lilysplash Mentor", "Bear Cub", ...lands("Forest", 2), "Island"] } });
    expect(canActivateK8(act(t, "p2", { type: "pass" }), "p1", idOf(t, "p1", "battlefield", "Lilysplash Mentor"), "Exile")).toBe(
      false,
    );
  });

  it("Long River Lurker : garde {1}, et vos autres Grenouilles aussi ; en arrivant, une de vos créatures est imblocable, et peut être exilée puis renvoyée après ses blessures de combat", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub", "Lilysplash Mentor"], hand: ["Long River Lurker"] },
      p2: { battlefield: ["Serra Angel", "Clement, the Worrywort"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Long River Lurker"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Long River Lurker")).keywords).toContain("ward");
    expect(chars(s, idOf(s, "p1", "battlefield", "Lilysplash Mentor")).keywords).toContain("ward");
    expect(chars(s, idOf(s, "p2", "battlefield", "Clement, the Worrywort")).keywords).not.toContain("ward");
    expect(chars(s, cub).keywords).not.toContain("ward");
    expect(chars(s, cub).keywords).toContain("unblockable");
    s = attack(s, [cub]);
    s = driveUntil(s, (x) => x.turn.step === "main2", answer({ yes: true }));
    expect(s.players.p2?.life).toBe(18);
    expect(idOf(s, "p1", "battlefield", "Bear Cub")).not.toBe(cub);
  });

  it("Long River's Pull : contrecarre un sort de créature ; avec le cadeau, n'importe quel sort", () => {
    const setup = (spell: string) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Long River's Pull"] },
        p2: { battlefield: ["Mountain", "Forest"], hand: [spell, "Bear Cub"], library: lands("Plains", 2) },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", spell),
        ...(spell === "Shock" ? { targets: { t: ["p1"] } } : {}),
      });
      return act(s, "p2", { type: "pass" });
    };
    let s = setup("Shock");
    const shock = s.stack[0]?.id as string;
    expect(() => cast(s, "p1", "Long River's Pull", { targets: { t: [shock] } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Long River's Pull", { kicked: true, targets: { t: [shock] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(handOf(s, "p2")).toEqual(["Bear Cub", "Plains"]);
    let t = setup("Bear Cub");
    t = resolve(cast(t, "p1", "Long River's Pull", { targets: { t: [t.stack[0]?.id as string] } }));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(graveOf(t, "p2")).toEqual(["Bear Cub"]);
  });

  it("Lupinflower Village : {T} : {W} seulement pour un sort de créature ; {1}{W}, {T}, sacrifiez-le : une Chauve-souris, un Oiseau, une Souris ou un Lapin parmi six cartes", () => {
    const a = scenario({ p1: { battlefield: ["Lupinflower Village"], hand: ["Fleeting Flight", "Savannah Lions"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Savannah Lions"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Fleeting Flight"))).toBe(false);
    let s = scenario({
      p1: {
        battlefield: ["Lupinflower Village", ...lands("Plains", 2)],
        library: ["Bear Cub", "Savannah Lions", "Healer's Hawk", "Forest", "Opt", "Island", "Swamp"],
      },
    });
    let options: string[] = [];
    s = resolve(
      activateK8(s, "p1", idOf(s, "p1", "battlefield", "Lupinflower Village"), "Regarde six cartes"),
      (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
        return undefined;
      },
    );
    expect(options).toEqual(["Healer's Hawk"]);
    expect(handOf(s)).toEqual(["Healer's Hawk"]);
    expect(graveOf(s)).toEqual(["Lupinflower Village"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Swamp");
  });

  it("Mabel's Mettle : +2/+2 à une créature ciblée, +1/+1 à jusqu'à une autre", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub", "Savannah Lions"], hand: ["Mabel's Mettle"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(() => cast(s, "p1", "Mabel's Mettle", { targets: { t: [cub], u: [cub] } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Mabel's Mettle", { targets: { t: [cub], u: [lions] } }));
    expect(ptOf(s, cub)).toEqual([4, 4]);
    expect(ptOf(s, lions)).toEqual([3, 2]);
  });

  it("Mindwhisker : surveillance 1 à votre entretien ; seuil — les créatures adverses ont -1/-0", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Mindwhisker"], graveyard: Array(n).fill("Opt") },
        p2: { battlefield: ["Bear Cub"] },
      });
      return ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    };
    expect(run(6)).toEqual([2, 2]);
    expect(run(7)).toEqual([1, 2]);
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mindwhisker"], library: ["Opt", "Forest"] } });
    s = driveUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => (req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined),
    );
    expect(graveOf(s)).toEqual(["Opt"]);
    expect(handOf(s)).toEqual(["Forest"]);
  });

  it("Moonstone Harbinger : vol et contact mortel ; gagner ou perdre des PV pendant votre tour donne +1/+0 et le contact mortel à vos Chauves-souris, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Moonstone Harbinger", "Starscape Cleric", "Vampire Neonate", "Bear Cub", ...lands("Swamp", 2), "Mountain"],
        hand: ["Shock"],
      },
    });
    const harb = idOf(s, "p1", "battlefield", "Moonstone Harbinger");
    const cleric = idOf(s, "p1", "battlefield", "Starscape Cleric");
    expect(chars(s, harb).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
    expect(ptOf(s, cleric)).toEqual([3, 1]);
    expect(chars(s, cleric).keywords).toContain("deathtouch");
    expect(ptOf(s, harb)).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p1"] } }));
    expect(ptOf(s, cleric)).toEqual([3, 1]);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Moonstone Harbinger"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    t = resolve(cast(t, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(ptOf(t, idOf(t, "p1", "battlefield", "Moonstone Harbinger"))).toEqual([1, 3]);
  });

  it("Mouse Trapper : flash ; vaillance — engage une créature adverse ciblée", () => {
    let s = scenario({
      p1: { battlefield: ["Mouse Trapper", "Forest"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const trapper = idOf(s, "p1", "battlefield", "Mouse Trapper");
    expect(chars(s, trapper).keywords).toContain("flash");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [trapper] } }));
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
  });

  it("Mudflat Village : {1}{B}, {T}, sacrifiez-le : une carte de Chauve-souris, Lézard, Rat ou Écureuil revient en main", () => {
    let s = scenario({ p1: { battlefield: ["Mudflat Village", ...lands("Swamp", 2)], graveyard: ["Bear Cub", "Hired Claw"] } });
    const village = idOf(s, "p1", "battlefield", "Mudflat Village");
    const claw = idOf(s, "p1", "graveyard", "Hired Claw");
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    expect(() => activateK8(s, "p1", village, "Récupère", { targets: { t: [cub] } })).toThrow(RulesError);
    s = resolve(activateK8(s, "p1", village, "Récupère", { targets: { t: [claw] } }));
    expect(handOf(s)).toEqual(["Hired Claw"]);
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Mudflat Village"]);
  });

  it("Oakhollow Village : {G}, {T} : un marqueur sur chacune de vos Grenouilles, Lapins, Ratons laveurs et Écureuils arrivés ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Bushy Bodyguard", ...lands("Forest", 5)], hand: ["Bushy Bodyguard", "Bear Cub", "Oakhollow Village"] },
    });
    const old = idOf(s, "p1", "battlefield", "Bushy Bodyguard");
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    s = resolve(cast(s, "p1", "Bear Cub"));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Oakhollow Village") });
    const fresh = idsOf(s, "p1", "battlefield", "Bushy Bodyguard").find((id) => id !== old) as string;
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Oakhollow Village"), "nouveaux venus"));
    expect(plusOne(s, fresh)).toBe(1);
    expect(plusOne(s, old)).toBe(0);
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Overprotect : +3/+3, piétinement, défense talismanique et indestructible jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Overprotect"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Overprotect", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([5, 5]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["trample", "hexproof", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(ptOf(s, cub)).toEqual([2, 2]);
  });

  it("Parting Gust : exile une créature non-jeton ; sans cadeau, elle revient à l'étape de fin avec un marqueur +1/+1 ; avec, un Poisson engagé pour l'adversaire", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Parting Gust"] }, p2: { battlefield: ["Serra Angel"] } });
    let s = setup();
    s = resolve(cast(s, "p1", "Parting Gust", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const back = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(plusOne(s, back)).toBe(1);
    let t = setup();
    t = resolve(cast(t, "p1", "Parting Gust", { kicked: true, targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(t.objects[idOf(t, "p2", "battlefield", "Fish")]?.tapped).toBe(true);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(exiled(t, "Serra Angel")).toHaveLength(1);
    // Un jeton n'est pas une cible légale.
    const u = addTokens(setup(), "Cat", 1, "p2");
    const { opt } = castOption(u, "Parting Gust");
    expect(opt?.modes[0]?.targets[0]?.legal).not.toContain(idOf(u, "p2", "battlefield", "Cat"));
  });

  it("Patchwork Banner : vos créatures du type choisi +1/+1 ; {T} : un mana de n'importe quelle couleur", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub", "Llanowar Elves"], hand: ["Patchwork Banner"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = resolve(cast(s, "p1", "Patchwork Banner"), answer({ pick: ["Bear"] }));
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    const banner = idOf(s, "p1", "battlefield", "Patchwork Banner");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === banner ? a.colors : []));
    expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
  });

  it("Pawpatch Formation : détruit une créature avec le vol, ou un enchantement, ou piochez une carte et créez une Nourriture", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Pawpatch Formation"], library: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel", "Bear Cub", "Banishing Light"] },
      });
    const modeOf = (s: S, label: string) => castOption(s, "Pawpatch Formation").opt?.modes.find((m) => m.label?.includes(label));
    let s = setup();
    const fly = modeOf(s, "vol");
    expect(fly?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
    s = resolve(
      cast(s, "p1", "Pawpatch Formation", { mode: fly?.index, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    );
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    let t = setup();
    const ench = modeOf(t, "enchantement");
    t = resolve(
      cast(t, "p1", "Pawpatch Formation", {
        mode: ench?.index,
        targets: { t: [idOf(t, "p2", "battlefield", "Banishing Light")] },
      }),
    );
    expect(idsOf(t, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let u = setup();
    u = resolve(cast(u, "p1", "Pawpatch Formation", { mode: modeOf(u, "Nourriture")?.index }));
    expect(handOf(u)).toEqual(["Plains"]);
    expect(idsOf(u, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Peerless Recycling : une carte de permanent du cimetière en main ; deux avec le cadeau", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Peerless Recycling"], graveyard: ["Bear Cub", "Forest", "Opt"] },
        p2: { library: lands("Island", 2) },
      });
    let s = setup();
    const ids = ["Bear Cub", "Forest"].map((n) => idOf(s, "p1", "graveyard", n));
    expect(castOption(s, "Peerless Recycling").opt?.modes[0]?.targets[0]?.legal).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
    expect(() => cast(s, "p1", "Peerless Recycling", { targets: { t: ids } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Peerless Recycling", { targets: { t: ids.slice(0, 1) } }));
    expect(handOf(s)).toEqual(["Bear Cub"]);
    let t = setup();
    t = resolve(cast(t, "p1", "Peerless Recycling", { kicked: true, targets: { t: ids } }));
    expect(handOf(t).sort()).toEqual(["Bear Cub", "Forest"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Persistent Marshstalker : +1/+0 par autre Rat ; seuil — quand vous attaquez avec des Rats, {2}{B} la renvoie du cimetière engagée et attaquante", () => {
    const s0 = scenario({ p1: { battlefield: ["Persistent Marshstalker", "Shoreline Looter", "Bear Cub"] } });
    expect(ptOf(s0, idOf(s0, "p1", "battlefield", "Persistent Marshstalker"))).toEqual([4, 1]);
    const setup = (others: number) =>
      scenario({
        p1: {
          battlefield: ["Shoreline Looter", ...lands("Swamp", 3)],
          graveyard: ["Persistent Marshstalker", ...Array(others).fill("Opt")],
        },
      });
    let s = setup(6);
    s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Shoreline Looter")]), answer({ yes: true }));
    const stalker = idOf(s, "p1", "battlefield", "Persistent Marshstalker");
    expect(s.objects[stalker]?.tapped).toBe(true);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(stalker);
    let t = setup(5);
    t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Shoreline Looter")]), answer({ yes: true }));
    expect(idsOf(t, "p1", "battlefield", "Persistent Marshstalker")).toHaveLength(0);
  });
});

describe("Bloomburrow, lot K8 : peu communes (3)", () => {
  it("Plumecreed Escort : flash et vol ; en arrivant, une de vos créatures gagne la défense talismanique jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Plumecreed Escort"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const { opt } = castOption(s, "Plumecreed Escort");
    expect(opt).toBeDefined();
    s = resolve(cast(s, "p1", "Plumecreed Escort"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Plumecreed Escort")).keywords).toEqual(
      expect.arrayContaining(["flash", "flying"]),
    );
    expect(chars(s, cub).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("hexproof");
  });

  it("Plumecreed Mentor : elle ou une autre de vos créatures volantes arrive — un marqueur sur une de vos créatures sans le vol ; pas pour une créature sans le vol", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Plains", 3), "Bear Cub"],
        hand: ["Plumecreed Mentor", "Healer's Hawk", "Savannah Lions"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Plumecreed Mentor"));
    expect(plusOne(s, cub)).toBe(1);
    s = resolve(cast(s, "p1", "Healer's Hawk"), answer({ pick: [cub] }));
    expect(plusOne(s, cub)).toBe(2);
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(plusOne(s, cub) + plusOne(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(2);
  });

  it("Quaketusk Boar : portée, piétinement et célérité ; Shrike Force : vol, double initiative et vigilance ; Brightblade Stoat : initiative et lien de vie ; Galewind Moose : flash, portée, vigilance et piétinement", () => {
    const s = scenario({ p1: { battlefield: ["Quaketusk Boar", "Shrike Force", "Brightblade Stoat", "Galewind Moose"] } });
    const kw = (n: string) => chars(s, idOf(s, "p1", "battlefield", n)).keywords;
    expect(kw("Quaketusk Boar")).toEqual(expect.arrayContaining(["reach", "trample", "haste"]));
    expect(kw("Shrike Force")).toEqual(expect.arrayContaining(["flying", "doubleStrike", "vigilance"]));
    expect(kw("Brightblade Stoat")).toEqual(expect.arrayContaining(["firstStrike", "lifelink"]));
    expect(kw("Galewind Moose")).toEqual(expect.arrayContaining(["flash", "reach", "vigilance", "trample"]));
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Galewind Moose"))).toEqual([6, 6]);
  });

  it("Brightblade Stoat : en combat, ses blessures d'initiative font gagner des PV", () => {
    let s = scenario({ p1: { battlefield: ["Brightblade Stoat"] } });
    s = driveUntil(attack(s, [idOf(s, "p1", "battlefield", "Brightblade Stoat")]), (x) => x.turn.step === "main2");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
  });

  it("Rabid Gnaw : votre créature gagne +1/+0, puis inflige des blessures égales à sa force à une créature que vous ne contrôlez pas", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Rabid Gnaw"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Rabid Gnaw", { targets: { t: [cub], u: [angel] } }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(s.objects[angel]?.damage).toBe(3);
    expect(s.objects[cub]?.damage).toBe(0);
  });

  it("Repel Calamity : détruit une créature de force ou d'endurance 4 ou plus", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Repel Calamity"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", { name: "Vampire Neonate", counters: { "+1/+1": 1 } }] },
    });
    const { opt } = castOption(s, "Repel Calamity");
    expect(namesIn(s, opt?.modes[0]?.targets[0]?.legal).sort()).toEqual(["Serra Angel", "Vampire Neonate"]);
    s = resolve(cast(s, "p1", "Repel Calamity", { targets: { t: [idOf(s, "p2", "battlefield", "Vampire Neonate")] } }));
    expect(idsOf(s, "p2", "battlefield", "Vampire Neonate")).toHaveLength(0);
  });

  it("Reptilian Recruiter : piétinement ; prend jusqu'à la fin du tour une créature de force 2 ou moins (dégagée, célérité), ou n'importe laquelle avec un autre Lézard", () => {
    const setup = (lizard: boolean) =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 5), ...(lizard ? ["Hired Claw"] : [])], hand: ["Reptilian Recruiter"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Serra Angel"] },
      });
    let s = setup(false);
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Reptilian Recruiter"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Reptilian Recruiter")).keywords).toContain("trample");
    expect(s.objects[cub]?.controller).toBe("p1");
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(chars(s, cub).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[cub]?.controller).toBe("p2");
    let t = setup(false);
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = resolve(cast(t, "p1", "Reptilian Recruiter"), answer({ pick: [angel] }));
    expect(t.objects[angel]?.controller).toBe("p2");
    let u = setup(true);
    u = resolve(cast(u, "p1", "Reptilian Recruiter"), answer({ pick: [angel] }));
    expect(u.objects[angel]?.controller).toBe("p1");
  });

  it("Rockface Village : {T} : {R} seulement pour un sort de créature ; {R}, {T} : un Lézard, une Souris, une Loutre ou un Raton laveur gagne +1/+0 et la célérité (rituel)", () => {
    const a = scenario({ p1: { battlefield: ["Rockface Village"], hand: ["Shock", "Fanatical Firebrand"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Fanatical Firebrand"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Shock"))).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Rockface Village", "Mountain", { name: "Hired Claw", sick: true }, { name: "Bear Cub", sick: true }] },
    });
    const village = idOf(s, "p1", "battlefield", "Rockface Village");
    const claw = idOf(s, "p1", "battlefield", "Hired Claw");
    expect(() =>
      activateK8(s, "p1", village, "célérité", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
    ).toThrow(RulesError);
    s = resolve(activateK8(s, "p1", village, "célérité", { targets: { t: [claw] } }));
    expect(ptOf(s, claw)).toEqual([2, 2]);
    expect(chars(s, claw).keywords).toContain("haste");
  });

  it("Ruthless Negotiation : l'adversaire ciblé exile une carte de sa main ; lancé depuis le cimetière (flashback {4}{B}), piochez une carte", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Ruthless Negotiation"], library: lands("Plains", 2) },
      p2: { hand: ["Opt", "Forest"] },
    });
    s = resolve(cast(s, "p1", "Ruthless Negotiation", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);
    const card = idOf(s, "p1", "graveyard", "Ruthless Negotiation");
    s = resolve(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
    expect(s.players.p2?.hand).toHaveLength(0);
    expect(handOf(s)).toEqual(["Plains"]);
    expect(exiled(s, "Ruthless Negotiation")).toHaveLength(1);
  });

  it("Seasoned Warrenguard : +2/+0 quand elle attaque pendant que vous contrôlez un jeton", () => {
    let s = scenario({ p1: { battlefield: ["Seasoned Warrenguard"] } });
    const guard = idOf(s, "p1", "battlefield", "Seasoned Warrenguard");
    s = resolve(attack(s, [guard]));
    expect(ptOf(s, guard)).toEqual([1, 2]);
    let t = addTokens(scenario({ p1: { battlefield: ["Seasoned Warrenguard"] } }), "Food", 1);
    t = resolve(attack(t, [guard]));
    expect(ptOf(t, guard)).toEqual([3, 2]);
  });

  it("Seedglaive Mentor : vigilance et célérité ; vaillance — un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Seedglaive Mentor", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] } });
    const mentor = idOf(s, "p1", "battlefield", "Seedglaive Mentor");
    expect(chars(s, mentor).keywords).toEqual(expect.arrayContaining(["vigilance", "haste"]));
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [mentor] } }));
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [mentor] } }));
    expect(plusOne(s, mentor)).toBe(1);
  });

  it("Shoreline Looter : imblocable ; blessures de combat à un joueur — piochez, puis défaussez sauf avec sept cartes au cimetière", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Shoreline Looter"], hand: ["Opt"], graveyard: Array(n).fill("Stab"), library: lands("Plains", 2) },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Shoreline Looter")).keywords).toContain("unblockable");
      return driveUntil(attack(s, [idOf(s, "p1", "battlefield", "Shoreline Looter")]), (x) => x.turn.step === "main2");
    };
    const a = run(6);
    expect(a.players.p1?.hand).toHaveLength(1);
    expect(a.players.p1?.graveyard).toHaveLength(7);
    const b = run(7);
    expect(handOf(b).sort()).toEqual(["Opt", "Plains"]);
  });

  it("Short Bow : la créature équipée a +1/+1, la portée et la vigilance ; équiper {1}", () => {
    let s = scenario({ p1: { battlefield: ["Short Bow", "Bear Cub", "Forest"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Short Bow"), "Équiper {1}", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
  });

  it("Sinister Monolith : au début du combat de votre tour, chaque adversaire perd 1 PV et vous en gagnez 1 ; {T}, 2 PV, sacrifiez-le : piochez deux cartes (rituel)", () => {
    let s = scenario({ p1: { battlefield: ["Sinister Monolith"], library: lands("Plains", 3) } });
    const mono = idOf(s, "p1", "battlefield", "Sinister Monolith");
    s = resolve(activateK8(s, "p1", mono, "Piochez deux cartes"));
    expect(s.players.p1?.life).toBe(18);
    expect(handOf(s)).toEqual(["Plains", "Plains"]);
    expect(graveOf(s)).toEqual(["Sinister Monolith"]);
    let t = scenario({ p1: { battlefield: ["Sinister Monolith"] } });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
  });

  it("Spellgyre : contrecarre un sort, ou surveillance 2 puis piochez deux cartes", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 4), hand: ["Spellgyre"], library: ["Opt", "Stab", "Plains", "Island"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = act(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }), "p2", { type: "pass" });
    const modes = castOption(s, "Spellgyre").opt?.modes ?? [];
    const counter = modes.find((m) => m.label?.includes("Contrecarrez"));
    const t = s;
    s = resolve(cast(s, "p1", "Spellgyre", { mode: counter?.index, targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p1?.life).toBe(20);
    const draw = modes.find((m) => m.label?.includes("Surveillance"));
    const u = resolve(cast(t, "p1", "Spellgyre", { mode: draw?.index }), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(u).sort()).toEqual(["Opt", "Spellgyre", "Stab"]);
    expect(handOf(u)).toEqual(["Plains", "Island"]);
  });

  it("Splash Lasher : engage jusqu'à une créature ciblée et met un marqueur d'étourdissement ; progéniture {1}{U}", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Splash Lasher"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const picks = [angel, cub];
    s = resolve(cast(s, "p1", "Splash Lasher", { kicked: true }), (req) =>
      req.type === "pick" && req.intent === "triggerTarget" ? [picks.shift() as string] : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Splash Lasher")).toHaveLength(2);
    for (const id of [angel, cub]) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Splash Portal : exile une de vos créatures puis la renvoie ; piochez si c'est un Oiseau, une Grenouille, une Loutre ou un Rat", () => {
    const run = (name: string) => {
      const s = scenario({ p1: { battlefield: ["Island", name], hand: ["Splash Portal"], library: lands("Plains", 2) } });
      const id = idOf(s, "p1", "battlefield", name);
      const t = resolve(cast(s, "p1", "Splash Portal", { targets: { t: [id] } }));
      expect(idOf(t, "p1", "battlefield", name)).not.toBe(id);
      return t.players.p1?.hand.length;
    };
    expect(run("Healer's Hawk")).toBe(1);
    expect(run("Bear Cub")).toBe(0);
  });

  it("Star Charter : vol ; à votre étape de fin, si vous avez gagné ou perdu des PV, une créature de force 3 ou moins parmi quatre cartes en main", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Star Charter", "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Serra Angel", "Bear Cub", "Forest", "Opt", "Plains"],
        },
      });
      if (gain) s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      return advanceUntil(s, (x) => x.turn.active === "p2");
    };
    const a = run(true);
    expect(handOf(a)).toEqual(["Bear Cub"]);
    expect(namesIn(a, a.players.p1?.library)[0]).toBe("Plains");
    const b = run(false);
    expect(b.players.p1?.hand).toHaveLength(0);
    expect(chars(b, idOf(b, "p1", "battlefield", "Star Charter")).keywords).toContain("flying");
  });
});

describe("Bloomburrow, lot K8 : peu communes (4)", () => {
  /** Lance deux Lightning Strike sur p2 : le quatrième mana dépensé pour des sorts ce tour-ci (dépense 4). */
  const expend4 = (s: S, ans: Answer = () => undefined) => {
    const a = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), ans);
    return resolve(cast(a, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), ans);
  };
  const strikes = { hand: ["Lightning Strike", "Lightning Strike"] };

  it("Bark-Knuckle Boxer : dépense 4 — indestructible jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Bark-Knuckle Boxer", ...lands("Mountain", 4)], ...strikes } });
    const boxer = idOf(s, "p1", "battlefield", "Bark-Knuckle Boxer");
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(chars(s, boxer).keywords).not.toContain("indestructible");
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(chars(s, boxer).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, boxer).keywords).not.toContain("indestructible");
  });

  it("Bonecache Overseer : {T}, 1 PV : piochez, seulement si trois cartes ont quitté votre cimetière ou si vous avez sacrifié une Nourriture ce tour-ci", () => {
    let s = addTokens(
      scenario({ p1: { battlefield: ["Bonecache Overseer", ...lands("Forest", 2)], library: lands("Plains", 2) } }),
      "Food",
      1,
    );
    const over = idOf(s, "p1", "battlefield", "Bonecache Overseer");
    expect(canActivateK8(s, "p1", over, "Piochez")).toBe(false);
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Food"), "+3 PV"));
    s = resolve(activateK8(s, "p1", over, "Piochez"));
    expect(handOf(s)).toEqual(["Plains"]);
    expect(s.players.p1?.life).toBe(22);
    let t = scenario({
      p1: {
        battlefield: ["Bonecache Overseer", ...lands("Forest", 2)],
        hand: ["Bushy Bodyguard"],
        graveyard: ["Opt", "Stab", "Island"],
      },
    });
    t = resolve(cast(t, "p1", "Bushy Bodyguard"), answer({ yes: true }));
    expect(t.players.p1?.graveyard).toHaveLength(0);
    expect(canActivateK8(t, "p1", idOf(t, "p1", "battlefield", "Bonecache Overseer"), "Piochez")).toBe(true);
  });

  it("Brambleguard Captain : au début du combat de votre tour, une de vos créatures gagne +X/+0 (X = la force du Capitaine)", () => {
    let s = scenario({ p1: { battlefield: ["Brambleguard Captain", "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ pick: [cub] }));
    expect(ptOf(s, cub)).toEqual([4, 2]);
  });

  it("Brambleguard Veteran : dépense 4 — vos Ratons laveurs +1/+1 et vigilance jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Brambleguard Veteran", "Bark-Knuckle Boxer", "Bear Cub", ...lands("Mountain", 4)], ...strikes },
    });
    s = expend4(s);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Brambleguard Veteran"))).toEqual([4, 5]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bark-Knuckle Boxer")).keywords).toContain("vigilance");
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Brazen Collector : initiative ; en attaquant, ajoute {R}, qui reste jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Brazen Collector"] } });
    const col = idOf(s, "p1", "battlefield", "Brazen Collector");
    expect(chars(s, col).keywords).toContain("firstStrike");
    s = driveUntil(attack(s, [col]), (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.manaPool.R ?? 0).toBe(0);
  });

  it("Burrowguard Mentor : piétinement ; F/E égales au nombre de créatures que vous contrôlez", () => {
    const s = scenario({
      p1: { battlefield: ["Burrowguard Mentor", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const m = idOf(s, "p1", "battlefield", "Burrowguard Mentor");
    expect(ptOf(s, m)).toEqual([3, 3]);
    expect(chars(s, m).keywords).toContain("trample");
  });

  it("Calamitous Tide : jusqu'à deux créatures renvoyées dans la main de leur propriétaire ; piochez deux cartes, puis défaussez-en une", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Calamitous Tide"], library: ["Opt", "Plains"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ids = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
    s = resolve(cast(s, "p1", "Calamitous Tide", { targets: { t: ids } }), (req, _p, cur) => pickNamed(cur, req, "Plains"));
    expect(handOf(s, "p2")).toEqual(["Serra Angel"]);
    expect(handOf(s).sort()).toEqual(["Bear Cub", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Calamitous Tide", "Plains"]);
  });

  it("Clifftop Lookout : portée ; révèle jusqu'à un terrain, mis sur le champ de bataille engagé, le reste dessous", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Clifftop Lookout"], library: ["Opt", "Bear Cub", "Island", "Swamp"] },
    });
    s = resolve(cast(s, "p1", "Clifftop Lookout"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Clifftop Lookout")).keywords).toContain("reach");
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Swamp");
    expect(lib.slice(1).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Curious Forager : en arrivant, vous pouvez fourrager ; si vous le faites, une carte de permanent revient du cimetière en main", () => {
    const setup = () =>
      addTokens(
        scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Curious Forager"], graveyard: ["Bear Cub", "Opt"] } }),
        "Food",
        1,
      );
    let s = setup();
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Curious Forager"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(options.includes("Opt")).toBe(false);
    const t = resolve(cast(setup(), "p1", "Curious Forager"), answer({ yes: false }));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Daring Waverider : en arrivant, lance gratuitement un éphémère ou un rituel de VM 4 ou moins de votre cimetière, exilé ensuite", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Daring Waverider"], graveyard: ["Lightning Strike", "Opt"] },
    });
    s = toCastNow(cast(s, "p1", "Daring Waverider"), answer({ pick: [idOf(s, "p1", "graveyard", "Lightning Strike")] }));
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    expect(castNowOf(s)?.cards).toEqual([strike]);
    s = resolve(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    expect(graveOf(s)).toEqual(["Opt"]);
  });

  it("Harnesser of Storms : un sort non-créature ou de Loutre — vous pouvez exiler la carte du dessus, jouable ce tour-ci ; une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Harnesser of Storms", ...lands("Island", 2)],
        hand: ["Opt", "Opt"],
        library: ["Forest", "Island", "Plains", "Swamp"],
      },
    });
    s = resolve(cast(s, "p1", "Opt"), answer({ yes: true }));
    const forest = exiled(s, "Forest")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = resolve(cast(s, "p1", "Opt"), answer({ yes: true }));
    expect(s.exile).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Harnesser of Storms", "Island", "Mountain"], hand: ["Stormcatch Mentor"] } });
    const t0 = t.exile.length;
    t = resolve(cast(t, "p1", "Stormcatch Mentor"), answer({ yes: true }));
    expect(t.exile.length).toBe(t0 + 1);
  });

  it("Harvestrite Host : elle ou un autre Lapin arrive — une de vos créatures +1/+0 ; piochez à la deuxième résolution du tour, pas à la troisième", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 7), "Bear Cub"],
        hand: ["Harvestrite Host", "Intrepid Rabbit", "Savannah Lions"],
        library: lands("Island", 3),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Harvestrite Host"), answer({ pick: [cub] }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(s.players.p1?.hand).toHaveLength(2);
    s = resolve(cast(s, "p1", "Intrepid Rabbit"), answer({ pick: [cub] }));
    expect(handOf(s).sort()).toEqual(["Island", "Savannah Lions"]);
    s = resolve(cast(s, "p1", "Savannah Lions"), answer({ pick: [cub] }));
    expect(handOf(s)).toEqual(["Island"]);
  });

  it("Hazardroot Herbalist : chaque fois que vous attaquez, une de vos créatures +1/+0 ; un jeton gagne aussi le contact mortel", () => {
    let s = addTokens(scenario({ p1: { battlefield: ["Hazardroot Herbalist", "Bear Cub"] } }), "Cat", 1);
    const cat = idOf(s, "p1", "battlefield", "Cat");
    s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), answer({ pick: [cat] }));
    expect(ptOf(s, cat)).toEqual([2, 1]);
    expect(chars(s, cat).keywords).toContain("deathtouch");
    let t = scenario({ p1: { battlefield: ["Hazardroot Herbalist", "Bear Cub"] } });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(attack(t, [cub]), answer({ pick: [cub] }));
    expect(ptOf(t, cub)).toEqual([3, 2]);
    expect(chars(t, cub).keywords).not.toContain("deathtouch");
  });

  it("Heirloom Epic : {4}, {T} : piochez une carte (rituel)", () => {
    let s = scenario({ p1: { battlefield: ["Heirloom Epic", ...lands("Plains", 4)], library: lands("Island", 2) } });
    const epic = idOf(s, "p1", "battlefield", "Heirloom Epic");
    s = resolve(activateK8(s, "p1", epic, "Piochez"));
    expect(handOf(s)).toEqual(["Island"]);
    const t = scenario({ active: "p2", p1: { battlefield: ["Heirloom Epic", ...lands("Plains", 4)] } });
    expect(canActivateK8(act(t, "p2", { type: "pass" }), "p1", epic, "Piochez")).toBe(false);
  });

  it("Starforged Sword : avec le cadeau (un Poisson engagé), s'attache en arrivant ; +3/+3 et perd le vol ; équiper {3}", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Healer's Hawk"], hand: ["Starforged Sword"] } });
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    s = resolve(cast(s, "p1", "Starforged Sword", { kicked: true }), answer({ pick: [hawk] }));
    expect(s.objects[idOf(s, "p2", "battlefield", "Fish")]?.tapped).toBe(true);
    expect(ptOf(s, hawk)).toEqual([4, 4]);
    expect(chars(s, hawk).keywords).not.toContain("flying");
    let t = scenario({ p1: { battlefield: [...lands("Plains", 7), "Healer's Hawk"], hand: ["Starforged Sword"] } });
    t = resolve(cast(t, "p1", "Starforged Sword"));
    const sword = idOf(t, "p1", "battlefield", "Starforged Sword");
    expect(t.objects[sword]?.attachedTo).toBeFalsy();
    t = resolve(activateK8(t, "p1", sword, "Équiper {3}", { targets: { t: [idOf(t, "p1", "battlefield", "Healer's Hawk")] } }));
    expect(t.objects[sword]?.attachedTo).toBe(idOf(t, "p1", "battlefield", "Healer's Hawk"));
  });

  it("Stargaze : regardez deux fois X cartes, X en main et le reste au cimetière ; vous perdez X PV", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Stargaze"], library: ["Opt", "Stab", "Forest", "Island", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Stargaze", { x: 2 }), (req, _p, cur) =>
      req.type === "pick" && req.intent === "lookAtTop"
        ? req.options.filter((id) => ["Opt", "Island"].includes(nameOf(cur, id) ?? ""))
        : undefined,
    );
    expect(handOf(s).sort()).toEqual(["Island", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Forest", "Stab", "Stargaze"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Plains"]);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Starseer Mentor : vol et vigilance ; à votre étape de fin, si vous avez gagné ou perdu des PV, l'adversaire perd 3 PV sauf sacrifice ou défausse", () => {
    const run = (gain: boolean, p2: { battlefield?: string[]; hand?: string[] } = {}) => {
      let s = scenario({
        p1: { battlefield: ["Starseer Mentor", "Vampire Neonate", ...lands("Swamp", 2)] },
        p2: { hand: [], ...p2 },
      });
      if (gain) s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      return advanceUntil(s, (x) => x.turn.active === "p2");
    };
    expect(chars(run(false), idOf(run(false), "p1", "battlefield", "Starseer Mentor")).keywords).toEqual(
      expect.arrayContaining(["flying", "vigilance"]),
    );
    expect(run(false).players.p2?.life).toBe(20);
    // Neonate : 1 PV, puis 3 PV faute de permanent ou de carte.
    expect(run(true).players.p2?.life).toBe(16);
    const c = run(true, { hand: ["Opt"] });
    // Avec une carte en main, l'adversaire peut la défausser plutôt que perdre 3 PV.
    expect([c.players.p2?.life, c.players.p2?.graveyard.length]).toEqual(c.players.p2?.graveyard.length ? [19, 1] : [16, 0]);
  });
});

describe("Bloomburrow, lot K8 : peu communes (5)", () => {
  it("Fireglass Mentor : au début de votre seconde phase principale, si un adversaire a perdu des PV, exile deux cartes ; l'une est jouable ce tour-ci", () => {
    const run = (shock: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Fireglass Mentor", "Mountain"], hand: ["Shock"], library: ["Forest", "Opt", "Plains"] },
      });
      if (shock) s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      return driveUntil(
        s,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority",
        (req, _p, cur) => pickNamed(cur, req, "Forest"),
      );
    };
    const s = run(true);
    expect(namesIn(s, s.exile).sort()).toEqual(["Forest", "Opt"]);
    const forest = exiled(s, "Forest")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    expect(playable(s, exiled(s, "Opt")[0] as string)).toBe(false);
    expect(run(false).exile).toHaveLength(0);
  });

  it("Stormcatch Mentor : célérité et prouesse ; vos éphémères et rituels coûtent {1} de moins", () => {
    const s = scenario({ p1: { battlefield: ["Stormcatch Mentor", "Mountain"], hand: ["Lightning Strike", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Stormcatch Mentor")).keywords).toEqual(
      expect.arrayContaining(["haste", "prowess"]),
    );
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Strike"))).toBe(true);
    const t = scenario({ p1: { battlefield: ["Stormcatch Mentor", "Forest"], hand: ["Bear Cub"] } });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
  });

  it("Sugar Coat : flash ; la créature enchantée devient une Nourriture artefact incolore, sans ses autres types ni capacités", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Sugar Coat"] },
      p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(castOption(s, "Sugar Coat").opt).toBeDefined();
    s = resolve(cast(s, "p1", "Sugar Coat", { targets: { enchant: [angel] } }));
    const c = chars(s, angel);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Food"]);
    expect(c.colors).toEqual([]);
    expect(c.keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(activateK8(s, "p2", angel, "+3 PV"));
    expect(s.players.p2?.life).toBe(23);
  });

  it("Tangle Tumbler : vigilance ; {3}, {T} : un marqueur +1/+1 sur une créature ciblée ; engagez deux jetons : il devient une créature-artefact", () => {
    let s = addTokens(scenario({ p1: { battlefield: ["Tangle Tumbler", "Bear Cub", ...lands("Forest", 3)] } }), "Food", 2);
    const tumbler = idOf(s, "p1", "battlefield", "Tangle Tumbler");
    expect(chars(s, tumbler).types).not.toContain("Creature");
    s = resolve(activateK8(s, "p1", tumbler, "Engagez deux jetons"));
    expect(chars(s, tumbler).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, tumbler).keywords).toContain("vigilance");
    expect(ptOf(s, tumbler)).toEqual([6, 6]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", tumbler, "Marqueur", { targets: { t: [cub] } }));
    expect(plusOne(s, cub)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, tumbler).types).not.toContain("Creature");
  });

  it("Thought-Stalker Warlock : menace ; si l'adversaire ciblé a perdu des PV ce tour-ci, vous choisissez une carte non-terrain de sa main ; sinon il défausse une carte", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Mountain"], hand: ["Shock", "Thought-Stalker Warlock"] },
      p2: { hand: ["Forest", "Opt", "Stab"] },
    });
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    let chooser: string | undefined;
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Thought-Stalker Warlock"), (req, p, cur) => {
      if (req.type !== "pick" || req.intent !== "discard") return undefined;
      chooser = p;
      options = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Stab");
    });
    expect(chooser).toBe("p1");
    expect(options.sort()).toEqual(["Opt", "Stab"]);
    expect(graveOf(s, "p2")).toEqual(["Stab"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Thought-Stalker Warlock")).keywords).toContain("menace");
    let t = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Thought-Stalker Warlock"] },
      p2: { hand: ["Forest", "Opt"] },
    });
    t = resolve(cast(t, "p1", "Thought-Stalker Warlock"));
    expect(t.players.p2?.hand).toHaveLength(1);
    expect(t.players.p2?.graveyard).toHaveLength(1);
  });

  it("Three Tree Scribe : elle ou une autre de vos créatures quitte le champ de bataille sans mourir — un marqueur sur une de vos créatures ; pas en mourant", () => {
    let s = scenario({
      p1: { battlefield: ["Three Tree Scribe", "Bear Cub", "Llanowar Elves", "Island"], hand: ["Splash Portal"] },
    });
    const scribe = idOf(s, "p1", "battlefield", "Three Tree Scribe");
    s = resolve(
      cast(s, "p1", "Splash Portal", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      answer({ pick: [scribe] }),
    );
    expect(plusOne(s, scribe)).toBe(1);
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = resolve(s, answer({ pick: [scribe] }));
    expect(plusOne(s, scribe)).toBe(1);
  });

  it("Tidecaller Mentor : menace ; seuil — en arrivant, renvoie jusqu'à un permanent non-terrain dans la main de son propriétaire", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Swamp"], hand: ["Tidecaller Mentor"], graveyard: Array(n).fill("Opt") },
        p2: { battlefield: ["Serra Angel"] },
      });
      return resolve(cast(s, "p1", "Tidecaller Mentor"), answer({ pick: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    };
    const a = run(7);
    expect(handOf(a, "p2")).toEqual(["Serra Angel"]);
    expect(chars(a, idOf(a, "p1", "battlefield", "Tidecaller Mentor")).keywords).toContain("menace");
    expect(idsOf(run(6), "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Valley Rally : vos créatures +2/+0 ; avec le cadeau (une Nourriture), une de vos créatures gagne l'initiative", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub", "Llanowar Elves"], hand: ["Valley Rally"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      return { s: resolve(cast(s, "p1", "Valley Rally", { kicked, targets: { t: kicked ? [cub] : [] } })), cub };
    };
    const a = run(false);
    expect(ptOf(a.s, a.cub)).toEqual([4, 2]);
    expect(ptOf(a.s, idOf(a.s, "p1", "battlefield", "Llanowar Elves"))).toEqual([3, 1]);
    expect(ptOf(a.s, idOf(a.s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(chars(a.s, a.cub).keywords).not.toContain("firstStrike");
    const b = run(true);
    expect(chars(b.s, b.cub).keywords).toContain("firstStrike");
    expect(idsOf(b.s, "p2", "battlefield", "Food")).toHaveLength(1);
  });

  it("Vinereap Mentor : une Nourriture en arrivant et une en mourant", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], hand: ["Vinereap Mentor"] } });
    s = resolve(cast(s, "p1", "Vinereap Mentor"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Vinereap Mentor"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(2);
  });

  it("Wandertale Mentor : dépense 4 — un marqueur +1/+1 ; {T} : {R} ou {G}", () => {
    let s = scenario({
      p1: { battlefield: ["Wandertale Mentor", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    const m = idOf(s, "p1", "battlefield", "Wandertale Mentor");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === m ? a.colors : []));
    expect(colors.sort()).toEqual(["G", "R"]);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(plusOne(s, m)).toBe(0);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(plusOne(s, m)).toBe(1);
  });

  it("Wear Down : détruit un artefact ou un enchantement ; deux avec le cadeau", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Wear Down"] },
        p2: { battlefield: ["Banishing Light", "Patchwork Banner", "Serra Angel"], library: lands("Plains", 2) },
      });
    let s = setup();
    const ids = ["Banishing Light", "Patchwork Banner"].map((n) => idOf(s, "p2", "battlefield", n));
    expect(castOption(s, "Wear Down").opt?.modes[0]?.targets[0]?.legal).not.toContain(
      idOf(s, "p2", "battlefield", "Serra Angel"),
    );
    expect(() => cast(s, "p1", "Wear Down", { targets: { t: ids } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Wear Down", { targets: { t: ids.slice(0, 1) } }));
    expect(idsOf(s, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let t = setup();
    t = resolve(cast(t, "p1", "Wear Down", { kicked: true, targets: { t: ids } }));
    expect(graveOf(t, "p2").sort()).toEqual(["Banishing Light", "Patchwork Banner"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Wick's Patrol : en arrivant, meule trois cartes ; une créature adverse ciblée a -X/-X (X = la plus grande VM de votre cimetière)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 6),
        hand: ["Wick's Patrol"],
        graveyard: ["Bear Cub"],
        library: ["Opt", "Serra Angel", "Forest", "Island"],
      },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Wick's Patrol"), answer({ pick: [angel] }));
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Forest", "Opt", "Serra Angel"]);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Wildfire Howl : 2 blessures à chaque créature ; avec le cadeau, aussi 1 blessure à n'importe quelle cible", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Wildfire Howl"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Plains", 2) },
      });
      return resolve(cast(s, "p1", "Wildfire Howl", { kicked, targets: { t: kicked ? ["p2"] : [] } }));
    };
    const a = run(false);
    expect(idsOf(a, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(a.objects[idOf(a, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(a.players.p2?.life).toBe(20);
    const b = run(true);
    expect(b.players.p2?.life).toBe(19);
    expect(b.players.p2?.hand).toHaveLength(1);
  });
});
