/**
 * The Lost Caverns of Ixalan : jetons Carte, Descente (4 et 8, descente profonde, « descendu ce tour-ci »),
 * Découverte, mana des Cavernes, terrains « Restless », transformation (Treasure Map), exil au lieu de mourir.
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy, drawCards, gainLife } from "../src/actions";
import { amount, fx, triggered, when } from "../src/dsl";
import { addPump, moveWithSpec } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { bump, chars, untapObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { countTurnEvents } from "../src/turnlog";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  pickNamed,
  settle as resolve,
  scenario,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const cast = (s: S, name: string, targets?: Record<string, string[]>) =>
  settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), targets }));
const activate = (s: S, source: string, index = 0) => {
  const opts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === source);
  const a = opts[index];
  return settle(act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1 }));
};
/** Cinq cartes de permanent (et deux non-permanents) pour la Descente. */
const GRAVEYARD_5 = ["Forest", "Llanowar Elves", "Helpful Hunter", "Opt", "Island", "Stab", "Nutrient Block"];

describe("The Lost Caverns of Ixalan", () => {
  it("Get Lost : la créature est détruite, son contrôleur crée deux Cartes", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Get Lost"] }, p2: { battlefield: ["Shivan Dragon"] } });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "Get Lost", { t: [dragon] });
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Map")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Map")).toHaveLength(0);
  });

  it("Descente 4 : Join the Dead donne −10/−10 avec quatre cartes de permanent au cimetière", () => {
    const run = (graveyard: string[]) => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Join the Dead"], graveyard },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      // Un dragon 9/9 : il survit à −5/−5, pas à −10/−10.
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      (s.objects[dragon] as { counters: Record<string, number> }).counters["+1/+1"] = 4;
      return cast(s, "Join the Dead", { t: [dragon] });
    };
    expect(idsOf(run(["Opt", "Stab", "Forest"]), "p2", "graveyard", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(run(GRAVEYARD_5), "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Descente profonde : Song of Stupefaction donne −X/−0 (cartes de permanent de votre cimetière)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Song of Stupefaction"], graveyard: GRAVEYARD_5, library: lands("Opt", 5) },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "Song of Stupefaction", { enchant: [dragon] });
    // Le meulage facultatif ajoute deux éphémères (non-permanents) : X reste 5.
    expect(chars(s, dragon).power).toBe(0);
  });

  it("Terror Tide : toutes les créatures −X/−X", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Terror Tide"], graveyard: GRAVEYARD_5 },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = cast(s, "Terror Tide");
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Malicious Eclipse : les créatures adverses qui meurent sont exilées", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Malicious Eclipse"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "Malicious Eclipse");
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(0);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(1);
  });

  it("Restless Reef : devient une créature 4/4 avec le contact mortel jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2), "Restless Reef"] } });
    const reef = idOf(s, "p1", "battlefield", "Restless Reef");
    s = activate(s, reef);
    const c = chars(s, reef);
    expect(c.types).toContain("Creature");
    expect(c.types).toContain("Land");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toContain("deathtouch");
  });

  it("Treasure Map : au troisième marqueur de repère, elle se transforme et crée trois Trésors", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Treasure Map // Treasure Cove"], library: lands("Plains", 3) },
    });
    const map = idOf(s, "p1", "battlefield", "Treasure Map // Treasure Cove");
    (s.objects[map] as { counters: Record<string, number> }).counters.landmark = 2;
    s = activate(s, map);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(3);
    const cove = s.battlefield.find((id) => chars(s, id).name === "Treasure Cove");
    expect(cove).toBeDefined();
    expect(s.objects[cove as string]?.counters.landmark ?? 0).toBe(0);
  });

  describe("Découverte", () => {
    const LIBRARY = ["Forest", "Island", "Shivan Dragon", "Llanowar Elves", "Plains", "Swamp"];
    /** Lance Walk with the Ancestors (découverte 4) et répond à la question « lancer ou en main ». */
    const discover = (castIt: boolean, extra: string[] = []) => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), ...extra], hand: ["Walk with the Ancestors"], library: LIBRARY },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Walk with the Ancestors"), targets: { t: [] } });
      for (let i = 0; i < 50 && s.stack.length + (s.pending?.kind === "choice" ? 1 : 0) > 0; i++) {
        const p = s.pending;
        if (p?.kind === "priority" && p.castNow) {
          const card = p.castNow.cards[0] as string;
          s = act(s, p.player, castIt ? { type: "cast", card } : { type: "pass" });
        } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      }
      return s;
    };
    const names = (s: S, ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

    it("exile jusqu'à une carte non-terrain de VM ≤ 4, le reste va dessous", () => {
      const s = discover(false);
      expect(names(s, s.players.p1?.hand ?? [])).toContain("Llanowar Elves");
      const lib = names(s, s.players.p1?.library ?? []);
      expect(lib.slice(0, 2)).toEqual(["Plains", "Swamp"]);
      expect([...lib.slice(2)].sort()).toEqual(["Forest", "Island", "Shivan Dragon"]);
    });

    it("la carte découverte se lance pendant la résolution, sans payer son coût de mana (608.2g)", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Walk with the Ancestors"], library: LIBRARY },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Walk with the Ancestors"), targets: { t: [] } });
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      const p = s.pending;
      if (p?.kind !== "priority" || !p.castNow) throw new Error("lancer maintenant attendu");
      const elves = p.castNow.cards[0] as string;
      expect(names(s, [elves])).toEqual(["Llanowar Elves"]);
      // Seule la carte découverte peut être lancée ; rien d'autre (terrain, capacités).
      expect(
        legalActions(s, "p1")
          .map((a) => a.type)
          .sort(),
      ).toEqual(["cast", "pass"]);
      s = act(s, "p1", { type: "cast", card: elves });
      // Walk with the Ancestors a fini de se résoudre ; les Elfes sont sur la pile, sans mana dépensé.
      expect(s.stack.map((x) => s.defs[x.sourceDefId]?.name)).toEqual(["Llanowar Elves"]);
      expect(s.players.p1?.graveyard.map((id) => names(s, [id])[0])).toContain("Walk with the Ancestors");
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      // Aucune permission ne subsiste.
      expect(s.playPermissions ?? []).toHaveLength(0);
    });

    it("Curator of Sun's Creation : découvrez de nouveau, une fois par tour", () => {
      const s = discover(false, ["Curator of Sun's Creation"]);
      // Première découverte : Llanowar Elves ; la seconde (même valeur) : Shivan Dragon est trop cher, rien d'autre.
      expect(names(s, s.players.p1?.hand ?? [])).toContain("Llanowar Elves");
      expect(s.players.p1?.library.length).toBe(5);
    });

    it("Hit the Mother Lode : des Trésors engagés pour la différence avec 10", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Hit the Mother Lode"], library: LIBRARY } });
      s = cast(s, "Hit the Mother Lode");
      const treasures = idsOf(s, "p1", "battlefield", "Treasure");
      // Shivan Dragon (VM 6) est découvert : 4 Trésors.
      expect(treasures).toHaveLength(4);
      expect(treasures.every((id) => s.objects[id]?.tapped)).toBe(true);
    });
  });

  it("Descente : une carte de permanent mise au cimetière déclenche Deep Goblin Skulltaker", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 2), "Deep Goblin Skulltaker"],
        hand: ["Deathcap Marionette"],
        library: ["Forest", "Opt", "Plains", "Swamp"],
      },
    });
    s = cast(s, "Deathcap Marionette");
    // Journal du tour : une carte de permanent mise dans votre cimetière (Descente).
    const descent = amount.descendedThisTurn;
    expect(typeof descent === "object" && descent.kind === "turnEvents" && countTurnEvents(s, descent.query, "p1")).toBe(1);
    const goblin = idOf(s, "p1", "battlefield", "Deep Goblin Skulltaker");
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number > 3);
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(1);
  });

  it("Bat Colony : une Chauve-souris par mana de Caverne dépensé", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Promising Vein", "Volatile Fault"], hand: ["Bat Colony"] } });
    s = cast(s, "Bat Colony");
    expect(idsOf(s, "p1", "battlefield", "Bat")).toHaveLength(2);
  });

  describe("Fabrication", () => {
    const craftOption = (s: S, source: string) =>
      legalActions(s, "p1").find(
        (a) =>
          a.type === "activate" &&
          a.source === source &&
          s.defs[s.objects[source]?.defId ?? ""]?.abilities[a.ability]?.kind === "activated",
      );
    const doCraft = (s: S, source: string) => {
      const a = craftOption(s, source);
      if (a?.type !== "activate") throw new Error("fabrication indisponible");
      return settle(act(s, "p1", { type: "activate", source, ability: a.ability }));
    };
    const byName = (s: S, name: string) => s.battlefield.find((id) => chars(s, id).name === name);

    it("Clay-Fired Bricks : exile un artefact du cimetière et revient en Cosmium Kiln", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"], graveyard: ["Nutrient Block"] },
      });
      const bricks = idOf(s, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln");
      s = doCraft(s, bricks);
      const kiln = byName(s, "Cosmium Kiln") as string;
      expect(kiln).toBeDefined();
      expect(idsOf(s, "p1", "graveyard", "Nutrient Block")).toHaveLength(0);
      expect(s.objects[kiln]?.linked?.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Nutrient Block"]);
      const gnomes = idsOf(s, "p1", "battlefield", "Gnome");
      expect(gnomes).toHaveLength(2);
      expect(chars(s, gnomes[0] as string).power).toBe(2);
    });

    it("Cryptex qui paie la fabrication ne prend pas un matériau choisi comme preuve", () => {
      const visage = "Visage of Dread // Dread Osseosaur";
      const setup = (graveyard: string[]) =>
        scenario({ p1: { battlefield: [...lands("Swamp", 5), "Cryptex", visage, "Bear Cub"], graveyard } });
      // Le Dragon est un matériau (cimetière d'abord) et la seule preuve possible : la fabrication n'est pas payable.
      const t = setup(["Shivan Dragon"]);
      const source = idOf(t, "p1", "battlefield", visage);
      expect(craftOption(t, source)).toBeUndefined();
      expect(() => act(t, "p1", { type: "activate", source, ability: 1 })).toThrow(RulesError);
      // Avec une autre preuve, Cryptex l'exile et les deux matériaux sont liés au verso.
      let s = setup(["Shivan Dragon", "Day of Judgment"]);
      s = doCraft(s, idOf(s, "p1", "battlefield", visage));
      expect(byName(s, "Dread Osseosaur")).toBeDefined();
      const exiled = s.exile.map((id) => nameOf(s, id));
      expect(exiled).toEqual(expect.arrayContaining(["Shivan Dragon", "Bear Cub", "Day of Judgment"]));
    });

    it("sans matériau, ou hors du rituel, la fabrication n'est pas proposée", () => {
      const s = scenario({ p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"] } });
      expect(craftOption(s, idOf(s, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln"))).toBeUndefined();
      const t = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"], graveyard: ["Nutrient Block"] },
        step: "upkeep",
      });
      expect(craftOption(t, idOf(t, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln"))).toBeUndefined();
    });

    it("Market Gnome exilé pour une fabrication : +1 PV et une carte", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), "Oteclan Landmark // Oteclan Levitator", "Market Gnome"],
          library: lands("Plains", 3),
        },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      s = doCraft(s, idOf(s, "p1", "battlefield", "Oteclan Landmark // Oteclan Levitator"));
      expect(byName(s, "Oteclan Levitator")).toBeDefined();
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Mastercraft Raptor : force égale à la force totale des Dinosaures exilés", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Saheeli's Lattice // Mastercraft Raptor"],
          graveyard: ["Earthshaker Dreadmaw", "Cavern Stomper", "Llanowar Elves"],
        },
      });
      s = doCraft(s, idOf(s, "p1", "battlefield", "Saheeli's Lattice // Mastercraft Raptor"));
      const raptor = byName(s, "Mastercraft Raptor") as string;
      expect(chars(s, raptor).power).toBe(13);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Mastercraft Raptor : le joueur choisit ses matériaux (un seul Dinosaure)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Saheeli's Lattice // Mastercraft Raptor"],
          graveyard: ["Earthshaker Dreadmaw", "Cavern Stomper", "Llanowar Elves"],
        },
      });
      const lattice = idOf(s, "p1", "battlefield", "Saheeli's Lattice // Mastercraft Raptor");
      const a = craftOption(s, lattice);
      if (a?.type !== "activate") throw new Error("fabrication indisponible");
      const spec = a.additional?.materials;
      // « Un ou plusieurs Dinosaures » : 1 à 2 matériaux ; par défaut, tout le cimetière correspondant.
      expect([spec?.min, spec?.max, spec?.suggested.length]).toEqual([1, 2, 2]);
      const stomper = idOf(s, "p1", "graveyard", "Cavern Stomper");
      const stomperPower = s.defs[s.objects[stomper]?.defId ?? ""]?.power;
      const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      expect(() => act(s, "p1", { type: "activate", source: lattice, ability: a.ability, materials: [elves] })).toThrow(
        /Matériaux de fabrication invalides/,
      );
      s = settle(act(s, "p1", { type: "activate", source: lattice, ability: a.ability, materials: [stomper] }));
      const raptor = byName(s, "Mastercraft Raptor") as string;
      // Force du Raptor : celle du seul Dinosaure exilé.
      expect(chars(s, raptor).power).toBe(stomperPower);
      expect(idsOf(s, "p1", "graveyard", "Earthshaker Dreadmaw")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Cavern Stomper")).toHaveLength(0);
    });
  });

  describe("Blessures en excès (120.4a) : Magmatic Galleon", () => {
    const shoot = (victim: string) => {
      let s = scenario({
        p1: { battlefield: ["Magmatic Galleon", ...lands("Mountain", 1)], hand: ["Burst Lightning"] },
        p2: { battlefield: [victim] },
      });
      s = cast(s, "Burst Lightning", { t: [idOf(s, "p2", "battlefield", victim)] });
      return s;
    };
    it("2 blessures à une créature 1/1 : 1 en excès, un Trésor", () => {
      const s = shoot("Llanowar Elves");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });
    it("2 blessures à une créature 2/2 : pas d'excès, pas de Trésor", () => {
      const s = shoot("Bear Cub");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });
  });

  describe("Légendaires et cartes uniques", () => {
    it("Ojer Taq : trois fois plus de jetons de créature", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), "Ojer Taq, Deepest Foundation // Temple of Civilization"],
          hand: ["Dragon Fodder"],
        },
      });
      s = cast(s, "Dragon Fodder");
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(6);
    });

    it("Ojer Axonil : une source rouge inflige au moins sa force à un adversaire", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 1), "Ojer Axonil, Deepest Might // Temple of Power"],
          hand: ["Burst Lightning"],
        },
      });
      s = cast(s, "Burst Lightning", { t: ["p2"] });
      expect(s.players.p2?.life).toBe(16);
      // Journal du tour : 4 blessures non de combat d'une source rouge (condition de Temple of Power).
      expect(
        countTurnEvents(s, { event: "damage", combat: false, sourceYours: true, sourceColors: ["R"], sum: true }, "p1"),
      ).toBe(4);
    });

    it("Bloodletter of Aclazotz : pendant votre tour, l'adversaire perd le double", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 1), "Bloodletter of Aclazotz"], hand: ["Burst Lightning"] } });
      s = cast(s, "Burst Lightning", { t: ["p2"] });
      expect(s.players.p2?.life).toBe(16);
    });

    it("Bitter Triumph : défaussez une carte ou payez 3 points de vie", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Bitter Triumph", "Opt"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
      let s = setup();
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bitter Triumph"), targets: { t: [dragon] }, discard: [] }),
      );
      expect(s.players.p1?.life).toBe(17);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      let t = setup();
      const opt = idOf(t, "p1", "hand", "Opt");
      t = settle(
        act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bitter Triumph"), targets: { t: [dragon] }, discard: [opt] }),
      );
      expect(t.players.p1?.life).toBe(20);
      expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Souls of the Lost : un permanent sacrifié à la place d'une défausse ; F/E selon les cartes de permanent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Llanowar Elves"], hand: ["Souls of the Lost"], graveyard: ["Forest", "Opt"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Souls of the Lost"), discard: [elves] }));
      const souls = idOf(s, "p1", "battlefield", "Souls of the Lost");
      // Forêt et Llanowar Elves (sacrifiés) : deux cartes de permanent.
      expect([chars(s, souls).power, chars(s, souls).toughness]).toEqual([2, 3]);
    });

    it("Ojer Pakpatiq : un éphémère lancé depuis la main gagne le rebond (relancé pendant votre prochain entretien)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 1), "Ojer Pakpatiq, Deepest Epoch // Temple of Cyclical Time"],
          hand: ["Opt"],
          library: lands("Island", 5),
        },
      });
      s = cast(s, "Opt");
      const opt = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt");
      expect(opt).toBeDefined();
      expect(s.delayed.some((d) => d.at === "yourNextUpkeep")).toBe(true);
      // Pas lançable avant le prochain entretien.
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === opt)).toBe(false);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && !!x.pending.castNow);
      expect(s.turn.step).toBe("upkeep");
      expect(s.turn.active).toBe("p1");
      const p = s.pending;
      expect(p?.kind === "priority" && p.castNow?.cards).toEqual([opt]);
      s = act(s, "p1", { type: "cast", card: opt as string });
      // Relancé depuis l'exil (et non depuis la main) : il va au cimetière en se résolvant.
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      expect(s.players.p1?.graveyard.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt")).toBe(true);
    });

    it("Kutzil : les adversaires ne peuvent pas lancer de sorts pendant votre tour", () => {
      const s = scenario({
        p1: { battlefield: ["Kutzil, Malamet Exemplar"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      });
      expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    });

    it("Cavern of Souls : un sort de créature du type choisi ne peut pas être contrecarré", () => {
      let s = scenario({ p1: { battlefield: ["Cavern of Souls"], hand: ["Llanowar Elves"] } });
      const cavern = idOf(s, "p1", "battlefield", "Cavern of Souls");
      (s.objects[cavern] as { chosen?: { creatureType?: string } }).chosen = { creatureType: "Elf" };
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
      expect(s.stack[s.stack.length - 1]?.uncounterable).toBe(true);
    });

    it("Kitesail Larcenist : la créature adverse devient un Trésor tant que la Larcenist reste", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Kitesail Larcenist"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kitesail Larcenist") });
      for (let i = 0; i < 20 && !(s.pending?.kind === "choice" && s.pending.request.intent === "triggerTarget"); i++) {
        if (s.pending?.kind === "priority") s = act(s, s.pending.player, { type: "pass" });
        else break;
      }
      if (s.pending?.kind === "choice") s = act(s, s.pending.player, { type: "choose", values: [dragon] });
      s = settle(s);
      expect(chars(s, dragon).types).toEqual(["Artifact"]);
      expect(chars(s, dragon).subtypes).toEqual(["Treasure"]);
      const larcenist = idOf(s, "p1", "battlefield", "Kitesail Larcenist");
      (s.objects[larcenist] as { damage: number }).damage = 10;
      s = settle(act(s, "p1", { type: "pass" }));
      expect(chars(s, dragon).types).toContain("Creature");
    });

    it("Deep-Cavern Bat : la carte exilée revient dans la main quand la Chauve-souris part", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Deep-Cavern Bat", "Stab"] },
        p2: { hand: ["Shivan Dragon"] },
      });
      s = cast(s, "Deep-Cavern Bat", { t: ["p2"] });
      expect(s.players.p2?.hand).toHaveLength(0);
      const bat = idOf(s, "p1", "battlefield", "Deep-Cavern Bat");
      s = cast(s, "Stab", { t: [bat] });
      expect(s.players.p2?.hand).toHaveLength(1);
    });

    it("Unstable Glyphbridge : une créature de force 2 ou moins épargnée par joueur", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Llanowar Elves"], hand: ["Unstable Glyphbridge // Sandswirl Wanderglyph"] },
        p2: { battlefield: ["Llanowar Elves", "Shivan Dragon"] },
      });
      s = cast(s, "Unstable Glyphbridge // Sandswirl Wanderglyph");
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("The Mycotyrant : F/E égales au nombre de Champignons et Saprolings", () => {
      const s = scenario({ p1: { battlefield: ["The Mycotyrant", "Deathcap Marionette", "Llanowar Elves"] } });
      const myco = idOf(s, "p1", "battlefield", "The Mycotyrant");
      expect(chars(s, myco).power).toBe(2);
    });
  });
  describe("Aclazotz, Deepest Betrayal (correctif du lot A de TDM)", () => {
    it("un adversaire défausse une carte de terrain : une Chauve-souris ; une carte non-terrain : rien", () => {
      const run = (hand: string[]) => {
        let s = scenario({ p1: { battlefield: ["Aclazotz, Deepest Betrayal // Temple of the Dead"] }, p2: { hand } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const a = idOf(s, "p1", "battlefield", "Aclazotz, Deepest Betrayal // Temple of the Dead");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: a, defender: "p2" }] }));
        return idsOf(s, "p1", "battlefield", "Bat").length;
      };
      expect(run(["Forest"])).toBe(1);
      expect(run(["Opt"])).toBe(0);
    });
  });
});

describe("The Lost Caverns of Ixalan : cartes des decks du méta (PLAN-C, lot C13)", () => {
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
  const activateLabel = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const castCard = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  it("Spyglass Siren : vol ; en arrivant, une Carte, qui fait explorer une créature", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Spyglass Siren"], library: ["Opt", "Forest"] } });
    s = resolve(castCard(s, "p1", "Spyglass Siren"));
    const siren = idOf(s, "p1", "battlefield", "Spyglass Siren");
    expect(chars(s, siren).keywords).toContain("flying");
    const map = idOf(s, "p1", "battlefield", "Map");
    s = resolve(activateLabel(s, "p1", map, "explore", { targets: { t: [siren] } }));
    expect(idsOf(s, "p1", "battlefield", "Map")).toHaveLength(0);
    // Carte révélée non-terrain : un marqueur +1/+1.
    expect(s.objects[siren]?.counters["+1/+1"]).toBe(1);
  });

  it("Greedy Freebooter : en mourant, regard 1 et un Trésor", () => {
    let s = scenario({ p1: { battlefield: ["Greedy Freebooter"], library: ["Opt", "Forest"] } });
    let scried = false;
    destroy(s, idOf(s, "p1", "battlefield", "Greedy Freebooter"));
    s = resolve(s, (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  describe("Amalia Benavides Aguirre", () => {
    it("quand vous gagnez des PV, elle explore (un terrain révélé va en main) ; garde — payer 3 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Amalia Benavides Aguirre", "Vampire Neonate", ...lands("Swamp", 2)], library: ["Forest", "Opt"] },
      });
      const amalia = idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre");
      expect(chars(s, amalia).keywords).toContain("ward");
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.objects[amalia]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("force exactement 20 après l'exploration : toutes les autres créatures sont détruites", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Amalia Benavides Aguirre", counters: { "+1/+1": 17 } }, "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Opt", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const amalia = idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre");
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(chars(s, amalia).power).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Vampire Neonate")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Amalia Benavides Aguirre")).toHaveLength(1);
    });

    it("force différente de 20 : rien n'est détruit", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Amalia Benavides Aguirre", counters: { "+1/+1": 18 } }, "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Opt", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(chars(s, idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre")).power).toBe(21);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });

  it("Corpses of the Lost : Squelette Pirate 3/2 avec la célérité ; descente : 1 PV pour la reprendre en main", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Corpses of the Lost"] },
    });
    s = resolve(castCard(s, "p1", "Corpses of the Lost"));
    const skeleton = idOf(s, "p1", "battlefield", "Skeleton Pirate");
    expect(pt(s, skeleton)).toEqual([3, 2]);
    expect(chars(s, skeleton).keywords).toContain("haste");
    // Une carte de permanent va au cimetière : vous êtes descendu ce tour-ci.
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.number > 3, 600);
    expect(idsOf(s, "p1", "hand", "Corpses of the Lost")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Corpses of the Lost : sans descente, elle reste en jeu", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Corpses of the Lost"] } });
    s = resolve(castCard(s, "p1", "Corpses of the Lost"));
    s = advanceUntil(s, (x) => x.turn.number > 3, 600);
    expect(idsOf(s, "p1", "battlefield", "Corpses of the Lost")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Restless Anchorage : arrive engagé ; devient une Oiseau 2/3 volante ; en attaquant, une Carte", () => {
    let s = scenario({ p1: { hand: ["Restless Anchorage"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Restless Anchorage") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Restless Anchorage")]?.tapped).toBe(true);

    let t = scenario({ p1: { battlefield: ["Restless Anchorage", "Plains", "Island", "Island"] } });
    const anchorage = idOf(t, "p1", "battlefield", "Restless Anchorage");
    t = resolve(activateLabel(t, "p1", anchorage, "créature"));
    expect(pt(t, anchorage)).toEqual([2, 3]);
    expect(chars(t, anchorage).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(t, anchorage).keywords).toContain("flying");
    t = resolve(attack(t, [anchorage]));
    expect(idsOf(t, "p1", "battlefield", "Map")).toHaveLength(1);
  });

  it("Tishana's Tidebinder : contrecarre une capacité activée ; la créature perd ses capacités tant qu'il reste", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Tishana's Tidebinder"] },
      p2: { battlefield: ["Vampire Neonate", ...lands("Swamp", 4)] },
      active: "p2",
    });
    const neonate = idOf(s, "p2", "battlefield", "Vampire Neonate");
    s = activateLabel(s, "p2", neonate, "");
    const ability = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = resolve(castCard(s, "p1", "Tishana's Tidebinder"), choosing([ability]));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(20);
    expect(chars(s, neonate).abilities.filter((a) => a.kind === "activated")).toHaveLength(0);
    destroy(s, idOf(s, "p1", "battlefield", "Tishana's Tidebinder"));
    s = resolve(s);
    expect(chars(s, neonate).abilities.some((a) => a.kind === "activated")).toBe(true);
  });

  it("Braided Net : trois marqueurs de filet ; engage un permanent non-terrain dont les capacités activées sont bloquées", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Braided Net // Braided Quipu"] },
      p2: { battlefield: ["Keen-Eyed Curator", ...lands("Forest", 2)], graveyard: ["Opt"] },
    });
    s = resolve(castCard(s, "p1", "Braided Net // Braided Quipu"));
    const net = idOf(s, "p1", "battlefield", "Braided Net // Braided Quipu");
    expect(s.objects[net]?.counters.net).toBe(3);
    const curator = idOf(s, "p2", "battlefield", "Keen-Eyed Curator");
    s = act(s, "p1", { type: "pass" });
    expect(canActivate(s, "p2", curator)).toBe(true);
    s = act(s, "p2", { type: "pass" });
    s = resolve(activateLabel(s, "p1", net, "Engagez", { targets: { t: [curator] } }));
    expect(s.objects[net]?.counters.net).toBe(2);
    expect(s.objects[curator]?.tapped).toBe(true);
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(canActivate(s, "p2", curator)).toBe(false);
    // « tant qu'il reste engagé » : dégagé, il retrouve ses capacités activées (lot K7).
    untapObject(s, s.objects[curator] as never);
    expect(canActivate(s, "p2", curator)).toBe(true);
  });

  it("Dusk Rose Reliquary : sacrifice en coût additionnel ; exile un artefact ou une créature adverse jusqu'à son départ", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Dusk Rose Reliquary"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(castCard(s, "p1", "Dusk Rose Reliquary", { sacrifice: [cub] }), choosing([angel]));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    const reliquary = idOf(s, "p1", "battlefield", "Dusk Rose Reliquary");
    expect(chars(s, reliquary).keywords).toContain("ward");
    destroy(s, reliquary);
    s = resolve(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Inti : en attaquant, défaussez pour un marqueur +1/+1 et le piétinement ; la défausse exile la carte du dessus, jouable", () => {
    let s = scenario({
      p1: { battlefield: ["Inti, Seneschal of the Sun", "Bear Cub"], hand: ["Opt"], library: lands("Mountain", 5) },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = resolve(attack(s, [cub]), choosing([opt, cub]));
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, cub).keywords).toContain("trample");
    expect(namesIn(s, s.exile)).toEqual(["Mountain"]);
    const mountain = s.exile[0] as string;
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
  });

  describe("Glimpse the Core", () => {
    it("mode 1 : une Forêt de base engagée depuis la bibliothèque", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Glimpse the Core"], library: ["Plains", "Forest"] } });
      s = resolve(castCard(s, "p1", "Glimpse the Core", { mode: 0 }));
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(3);
      expect(forests.filter((id) => s.objects[id]?.tapped)).toHaveLength(3); // deux payées, une arrivée engagée
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("mode 2 : une carte de Caverne du cimetière revient engagée", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Glimpse the Core"], graveyard: ["Hidden Nursery"] } });
      const cave = idOf(s, "p1", "graveyard", "Hidden Nursery");
      s = resolve(castCard(s, "p1", "Glimpse the Core", { mode: 1, targets: { t: [cave] } }));
      const back = idOf(s, "p1", "battlefield", "Hidden Nursery");
      expect(s.objects[back]?.tapped).toBe(true);
    });
  });

  it("Spring-Loaded Sawblades : 5 blessures à une créature engagée adverse", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Spring-Loaded Sawblades // Bladewheel Chariot"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
    });
    // Seule cible légale : l'Ange engagé (le Bear Cub est dégagé).
    s = resolve(castCard(s, "p1", "Spring-Loaded Sawblades // Bladewheel Chariot"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("« Engagez N artefacts et/ou créatures dégagés », la source comprise (302.6, lot K2)", () => {
  it("Adaptive Gemguard : elle et un artefact, même avec le mal d'invocation ; seule, non", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Adaptive Gemguard", sick: true }, "Nutrient Block"] } });
    const gem = idOf(s, "p1", "battlefield", "Adaptive Gemguard");
    s = activate(s, gem);
    expect(s.objects[gem]?.tapped).toBe(true);
    expect(s.objects[gem]?.counters["+1/+1"]).toBe(1);
    const alone = scenario({ p1: { battlefield: ["Adaptive Gemguard"] } });
    expect(legalActions(alone, "p1").some((a) => a.type === "activate")).toBe(false);
  });

  it("Sunshot Militia, Warden of the Inner Sky, Goldfury Strider : la source compte parmi les permanents engagés", () => {
    let s = scenario({ p1: { battlefield: ["Sunshot Militia", "Bear Cub"] } });
    s = activate(s, idOf(s, "p1", "battlefield", "Sunshot Militia"));
    expect(s.players.p2?.life).toBe(19);
    let w = scenario({ p1: { battlefield: ["Warden of the Inner Sky", "Bear Cub", "Nutrient Block"] } });
    const warden = idOf(w, "p1", "battlefield", "Warden of the Inner Sky");
    w = activate(w, warden);
    expect(w.objects[warden]?.counters["+1/+1"]).toBe(1);
    const g = scenario({ p1: { battlefield: ["Goldfury Strider", "Bear Cub"] } });
    expect(legalActions(g, "p1").some((a) => a.type === "activate")).toBe(true);
  });

  it("Warden of the Inner Sky : vol et vigilance avec trois marqueurs ou plus, de toutes sortes", () => {
    const w = scenario({
      p1: { battlefield: [{ name: "Warden of the Inner Sky", counters: { "+1/+1": 1, shield: 1, stun: 1 } }, "Bear Cub"] },
    });
    const warden = idOf(w, "p1", "battlefield", "Warden of the Inner Sky");
    expect(chars(w, warden).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    const two = scenario({ p1: { battlefield: [{ name: "Warden of the Inner Sky", counters: { "+1/+1": 1, shield: 1 } }] } });
    expect(chars(two, idOf(two, "p1", "battlefield", "Warden of the Inner Sky")).keywords).not.toContain("flying");
  });
});

describe("Lost Caverns of Ixalan, lot K8 : cartes mythiques, rares et peu communes", () => {
  /** Répond « oui » aux questions et choisit les objets ou joueurs voulus quand ils sont proposés. */
  const choosing =
    (want: string[] = [], yes = true): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  const activateLabel = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const castCard = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const libraryNames = (s: S, p = "p1") => namesIn(s, s.players[p]?.library);
  /** Met le verso d'une carte transformable sur le champ de bataille (face active : le verso). */
  const flip = (s: S, id: string) => {
    const o = s.objects[id] as { defId: string; faceDefId?: string };
    o.faceDefId = s.defs[o.defId]?.faceDefs?.[1]?.id;
    bump(s);
  };
  /** Avance jusqu'à la phase principale 1 de p1 (tour suivant), pile vide. */
  const toMyMain = (s: S) =>
    advanceUntil(
      s,
      (x) =>
        x.turn.active === "p1" &&
        x.turn.step === "main1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0 &&
        x.pending?.kind === "priority",
    );
  const tokens = (s: S, p: string, name: string) => idsOf(s, p, "battlefield", name).filter((id) => s.objects[id]?.isToken);
  /** Résout les déclenchements en attente après une action directe (`destroy`…), sans passer si rien n'attend. */
  const flush = (s: S) => (s.triggers.length > 0 || s.stack.length > 0 ? resolve(s) : s);

  describe("mythiques", () => {
    it("Bonehoard Dracosaur : à l'entretien, exile deux cartes jouables ce tour-ci ; terrain → Dinosaure 3/1, non-terrain → Trésor", () => {
      const run = (library: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Bonehoard Dracosaur", "Island"], library },
          active: "p2",
          step: "end",
          turn: 2,
        });
        return toMyMain(s);
      };
      const s = run(["Forest", "Opt", "Island", "Island"]);
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(tokens(s, "p1", "Dinosaur")).toHaveLength(1);
      expect(pt(s, tokens(s, "p1", "Dinosaur")[0] as string)).toEqual([3, 1]);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const acts = legalActions(s, "p1");
      expect(acts.some((a) => a.type === "playLand" && a.card === exiled(s, "Forest")[0])).toBe(true);
      expect(acts.some((a) => a.type === "cast" && a.card === exiled(s, "Opt")[0])).toBe(true);
      // Deux terrains : un Dinosaure, pas de Trésor.
      const lands2 = run(["Forest", "Swamp", "Island"]);
      expect(tokens(lands2, "p1", "Dinosaur")).toHaveLength(1);
      expect(tokens(lands2, "p1", "Treasure")).toHaveLength(0);
    });

    it("Ghalta, Stampede Tyrant : met sur le champ de bataille les cartes de créature choisies de la main, et elles seules", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 8), hand: ["Ghalta, Stampede Tyrant", "Bear Cub", "Llanowar Elves", "Opt"] },
      });
      const bear = idOf(s, "p1", "hand", "Bear Cub");
      let options: (string | undefined)[] = [];
      s = resolve(castCard(s, "p1", "Ghalta, Stampede Tyrant"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = namesIn(cur, req.options);
        return [bear];
      });
      expect(options.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Llanowar Elves", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ghalta, Stampede Tyrant")).keywords).toContain("trample");
    });

    it("Gishath, Sun's Avatar : révèle autant de cartes que les blessures ; les Dinosaures vont sur le champ de bataille, le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Gishath, Sun's Avatar", sick: true }],
          library: ["Hulking Raptor", "Opt", "Colossadactyl", "Forest", "Bear Cub", "Forest", "Island", "Swamp"],
        },
      });
      const gishath = idOf(s, "p1", "battlefield", "Gishath, Sun's Avatar");
      expect(chars(s, gishath).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "haste"]));
      s = attack(s, [gishath]);
      expect(s.objects[gishath]?.tapped).toBe(false);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(13);
      expect(idsOf(s, "p1", "battlefield", "Hulking Raptor")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Colossadactyl")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      const lib = libraryNames(s);
      expect(lib[0]).toBe("Swamp");
      expect([...lib.slice(1)].sort()).toEqual(["Bear Cub", "Forest", "Forest", "Island", "Opt"]);
    });

    it("Huatli, Poet of Unity : un terrain de base en main ; exilée et renvoyée transformée, le chapitre I crée deux Dinosaures 3/3", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Huatli, Poet of Unity // Roar of the Fifth People"],
          library: ["Opt", "Mountain", "Opt"],
        },
      });
      s = resolve(castCard(s, "p1", "Huatli, Poet of Unity // Roar of the Fifth People"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);

      let t = scenario({ p1: { battlefield: ["Huatli, Poet of Unity // Roar of the Fifth People", ...lands("Mountain", 5)] } });
      t = resolve(
        activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Huatli, Poet of Unity // Roar of the Fifth People"), "transformée"),
      );
      const saga = t.battlefield.find((id) => chars(t, id).name === "Roar of the Fifth People") as string;
      expect(saga).toBeDefined();
      expect(t.objects[saga]?.counters.lore).toBe(1);
      expect(tokens(t, "p1", "Dinosaur").map((id) => pt(t, id))).toEqual([
        [3, 3],
        [3, 3],
      ]);
    });

    it("Roar of the Fifth People : chapitre II, vos créatures produisent {R}, {G} ou {W} ; chapitre IV, double initiative et piétinement aux seuls Dinosaures", () => {
      const run = (lore: number) => {
        const s = scenario({
          p1: {
            battlefield: [
              { name: "Huatli, Poet of Unity // Roar of the Fifth People", counters: { lore } },
              "Bear Cub",
              "Hulking Raptor",
            ],
            library: lands("Forest", 5),
          },
          active: "p2",
          step: "end",
          turn: 2,
        });
        flip(s, idOf(s, "p1", "battlefield", "Huatli, Poet of Unity // Roar of the Fifth People"));
        return toMyMain(s);
      };
      const two = run(1);
      const bear = idOf(two, "p1", "battlefield", "Bear Cub");
      expect(legalActions(two, "p1").some((a) => a.type === "tapForMana" && a.source === bear)).toBe(true);
      const four = run(3);
      const raptor = idOf(four, "p1", "battlefield", "Hulking Raptor");
      expect(chars(four, raptor).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
      expect(chars(four, idOf(four, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");
    });

    it("Ojer Kaslem : une créature et un terrain révélés vont sur le champ de bataille ; en mourant, il revient engagé en Temple of Cultivation", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ojer Kaslem, Deepest Growth // Temple of Cultivation"],
          library: ["Bear Cub", "Opt", "Forest", "Hulking Raptor", "Island", "Opt", "Swamp"],
        },
      });
      const ojer = idOf(s, "p1", "battlefield", "Ojer Kaslem, Deepest Growth // Temple of Cultivation");
      const lib = s.players.p1?.library ?? [];
      const bear = lib[0] as string;
      const forest = lib[2] as string;
      s = throughCombat(attack(s, [ojer]), choosing([bear, forest]));
      expect(s.players.p2?.life).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(libraryNames(s)[0]).toBe("Swamp");
      expect(libraryNames(s)).toHaveLength(5);

      destroy(s, ojer);
      s = resolve(s);
      const temple = s.battlefield.find((id) => chars(s, id).name === "Temple of Cultivation") as string;
      expect(temple).toBeDefined();
      expect(s.objects[temple]?.tapped).toBe(true);
    });

    it("Temple of Cultivation : se transforme seulement si vous contrôlez dix permanents ou plus", () => {
      const run = (forests: number) => {
        const s = scenario({
          p1: { battlefield: ["Ojer Kaslem, Deepest Growth // Temple of Cultivation", ...lands("Forest", forests)] },
        });
        const temple = idOf(s, "p1", "battlefield", "Ojer Kaslem, Deepest Growth // Temple of Cultivation");
        flip(s, temple);
        return legalActions(s, "p1").some((a) => a.type === "activate" && a.source === temple);
      };
      expect(run(9)).toBe(true);
      expect(run(8)).toBe(false);
    });

    it("Quintorius Kand : +1 crée un Esprit 3/2 ; −3 découverte 4, et le sort lancé depuis l'exil inflige 2 blessures et vous fait gagner 2 PV", () => {
      let s = scenario({ p1: { battlefield: ["Quintorius Kand"], library: ["Forest", "Llanowar Elves", "Island"] } });
      const q = idOf(s, "p1", "battlefield", "Quintorius Kand");
      let t = resolve(activateLabel(s, "p1", q, "Esprit"));
      const spirit = tokens(t, "p1", "Spirit")[0] as string;
      expect(pt(t, spirit)).toEqual([3, 2]);
      expect(chars(t, spirit).colors.sort()).toEqual(["R", "W"]);
      expect(t.objects[q]?.counters.loyalty).toBe(5);

      s = untilCastNow(activateLabel(s, "p1", q, "Découverte"));
      const elves = castNowOf(s)?.cards[0] as string;
      s = resolve(act(s, "p1", { type: "cast", card: elves }));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);

      // Un sort lancé depuis la main ne déclenche rien.
      t = scenario({ p1: { battlefield: ["Quintorius Kand", "Forest"], hand: ["Llanowar Elves"] } });
      t = resolve(castCard(t, "p1", "Llanowar Elves"));
      expect(t.players.p2?.life).toBe(20);
    });

    it("Quintorius Kand −6 : exile des cartes de votre cimetière, {R} par carte, et elles sont jouables ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Quintorius Kand", counters: { loyalty: 6 } }], graveyard: ["Forest", "Triumphant Chomp"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const q = idOf(s, "p1", "battlefield", "Quintorius Kand");
      const cards = [...(s.players.p1?.graveyard ?? [])];
      s = resolve(activateLabel(s, "p1", q, "Exilez", { targets: { t: cards } }));
      expect(s.players.p1?.manaPool.R).toBe(2);
      const forest = exiled(s, "Forest")[0];
      const chomp = exiled(s, "Triumphant Chomp")[0];
      const acts = legalActions(s, "p1");
      expect(acts.some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      expect(acts.some((a) => a.type === "cast" && a.card === chomp)).toBe(true);
    });

    it("Resplendent Angel : +2/+2 et lien de vie ; 5 PV gagnés ce tour-ci → un Ange 4/4 volant et vigilant à l'étape de fin, 4 PV → rien", () => {
      let s = scenario({ p1: { battlefield: ["Resplendent Angel", ...lands("Plains", 6)] } });
      const angel = idOf(s, "p1", "battlefield", "Resplendent Angel");
      s = resolve(activateLabel(s, "p1", angel, "lien de vie"));
      expect(pt(s, angel)).toEqual([5, 5]);
      s = throughCombat(attack(s, [angel]));
      expect(s.players.p1?.life).toBe(25);
      s = advanceUntil(s, (x) => x.turn.number > 3);
      const token = tokens(s, "p1", "Angel")[0] as string;
      expect(pt(s, token)).toEqual([4, 4]);
      expect(chars(s, token).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));

      let t = scenario({ p1: { battlefield: ["Resplendent Angel"] } });
      gainLife(t, "p1", 4);
      t = advanceUntil(t, (x) => x.turn.number > 3);
      expect(tokens(t, "p1", "Angel")).toHaveLength(0);
    });

    it("Saheeli, the Sun's Brilliance : copie-jeton d'une autre créature, artefact en plus, avec la célérité, sacrifiée à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Saheeli, the Sun's Brilliance", "Bear Cub", "Island", "Mountain"] } });
      const saheeli = idOf(s, "p1", "battlefield", "Saheeli, the Sun's Brilliance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // « autre » : Saheeli ne peut pas se cibler.
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === saheeli);
      expect(opt?.type === "activate" && opt.targets?.[0]?.legal).not.toContain(saheeli);
      s = resolve(activateLabel(s, "p1", saheeli, "Copie", { targets: { t: [bear] } }));
      const copy = idsOf(s, "p1", "battlefield", "Bear Cub").find((id) => id !== bear) as string;
      expect(chars(s, copy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, copy).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
    });

    it("Sovereign Okinec Ahau : en attaquant, chaque créature dont la force dépasse sa force de base reçoit l'écart en marqueurs +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Sovereign Okinec Ahau", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Llanowar Elves"] },
      });
      const sov = idOf(s, "p1", "battlefield", "Sovereign Okinec Ahau");
      expect(chars(s, sov).keywords).toContain("ward");
      s = resolve(attack(s, [sov]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(4);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[sov]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("The Ancient One : ne peut ni attaquer ni bloquer sans huit cartes de permanent au cimetière ; pillage, puis un joueur meule la VM de la carte défaussée", () => {
      const yard8 = ["Forest", "Forest", "Bear Cub", "Island", "Swamp", "Plains", "Mountain", "Llanowar Elves"];
      const blocked = scenario({ p1: { battlefield: ["The Ancient One"], graveyard: yard8.slice(1) } });
      const one = idOf(blocked, "p1", "battlefield", "The Ancient One");
      expect(chars(blocked, one).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const free = scenario({ p1: { battlefield: ["The Ancient One"], graveyard: yard8 } });
      expect(chars(free, idOf(free, "p1", "battlefield", "The Ancient One")).keywords).not.toContain("cantAttack");

      let s = scenario({
        p1: { battlefield: ["The Ancient One", "Island", "Island", "Swamp", "Swamp"], hand: ["Shivan Dragon"], library: ["Opt"] },
        p2: { library: lands("Forest", 8) },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "The Ancient One"), "Pillage"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes("p2")) return ["p2"];
        return pickNamed(cur, req, "Shivan Dragon");
      });
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      // Shivan Dragon : valeur de mana 6.
      expect(s.players.p2?.graveyard).toHaveLength(6);
    });

    it("The Enigma Jewel : arrive engagé ; son mana ne sert qu'à activer des capacités", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["The Enigma Jewel // Locus of Enlightenment"] } });
      s = resolve(castCard(s, "p1", "The Enigma Jewel // Locus of Enlightenment"));
      expect(s.objects[idOf(s, "p1", "battlefield", "The Enigma Jewel // Locus of Enlightenment")]?.tapped).toBe(true);

      const t = scenario({
        p1: {
          battlefield: ["The Enigma Jewel // Locus of Enlightenment", "Hoverstone Pilgrim"],
          hand: ["Digsite Conservator"],
          graveyard: ["Opt"],
        },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Digsite Conservator"))).toBe(false);
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Hoverstone Pilgrim"))).toBe(true);
    });

    it("The Millennium Calendar : un marqueur de temps par permanent dégagé ; {2}, {T} les double ; à 1 000, sacrifice et chaque adversaire perd 1 000 PV", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Millennium Calendar", { name: "Forest", tapped: true }, { name: "Forest", tapped: true }, "Island"],
        },
        active: "p2",
        step: "end",
        turn: 2,
      });
      s = toMyMain(s);
      const cal = idOf(s, "p1", "battlefield", "The Millennium Calendar");
      expect(s.objects[cal]?.counters.time).toBe(2);
      s = resolve(activateLabel(s, "p1", cal, "Doublez"));
      expect(s.objects[cal]?.counters.time).toBe(4);
      expect(s.players.p2?.life).toBe(20);

      let t = scenario({
        p1: { battlefield: [{ name: "The Millennium Calendar", counters: { time: 500 } }, "Forest", "Forest"] },
      });
      t = resolve(activateLabel(t, "p1", idOf(t, "p1", "battlefield", "The Millennium Calendar"), "Doublez"));
      expect(idsOf(t, "p1", "battlefield", "The Millennium Calendar")).toHaveLength(0);
      expect(t.players.p2?.life).toBe(-980);
    });

    it("The Skullspore Nexus : coûte X de moins (la plus grande force) ; une créature non-jeton qui meurt donne un Champignon Dinosaure de sa force ; {2}, {T} double la force", () => {
      const big = scenario({ p1: { battlefield: ["Hulking Raptor", ...lands("Forest", 3)], hand: ["The Skullspore Nexus"] } });
      expect(castable(big, "p1", idOf(big, "p1", "hand", "The Skullspore Nexus"))).toBe(true);
      const small = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["The Skullspore Nexus"] } });
      expect(castable(small, "p1", idOf(small, "p1", "hand", "The Skullspore Nexus"))).toBe(false);

      let s = scenario({ p1: { battlefield: ["The Skullspore Nexus", "Hulking Raptor", "Bear Cub", "Forest", "Forest"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Hulking Raptor"));
      s = resolve(s);
      const fungus = tokens(s, "p1", "Fungus Dinosaur")[0] as string;
      expect(pt(s, fungus)).toEqual([5, 5]);
      // Un jeton qui meurt ne déclenche rien.
      destroy(s, fungus);
      s = flush(s);
      expect(tokens(s, "p1", "Fungus Dinosaur")).toHaveLength(0);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "The Skullspore Nexus"), "Doublez", { targets: { t: [bear] } }),
      );
      expect(pt(s, bear)).toEqual([4, 2]);
    });

    it("The Skullspore Nexus : plusieurs créatures non-jetons qui meurent ensemble donnent un seul jeton, de leur force totale (dernières informations)", () => {
      let s = scenario({ p1: { battlefield: ["The Skullspore Nexus", "Hulking Raptor", "Bear Cub", "Llanowar Elves"] } });
      const raptor = idOf(s, "p1", "battlefield", "Hulking Raptor");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // La force au moment de mourir : Bear Cub a +2/+0.
      addPump(s, [bear], 2, 0);
      // Deux destructions du même lot d'événements.
      destroy(s, raptor);
      destroy(s, bear);
      expect(s.triggers).toHaveLength(1);
      s = resolve(s);
      const fungus = tokens(s, "p1", "Fungus Dinosaur");
      expect(fungus).toHaveLength(1);
      expect(pt(s, fungus[0] as string)).toEqual([9, 9]);
    });

    it("Vito, Fanatic of Aclazotz : premier sacrifice +2 PV, deuxième −2 PV à chaque adversaire, troisième un Vampire Démon 4/3 volant (Bartolomé del Presidio)", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Vito, Fanatic of Aclazotz",
            "Bartolomé del Presidio",
            "Treasure Map // Treasure Cove",
            "Bear Cub",
            "Llanowar Elves",
          ],
        },
      });
      const bart = idOf(s, "p1", "battlefield", "Bartolomé del Presidio");
      const sac = (cur: S, victim: string) => resolve(activateLabel(cur, "p1", bart, "Marqueur", { sacrifice: [victim] }));
      s = sac(s, idOf(s, "p1", "battlefield", "Treasure Map // Treasure Cove"));
      expect(s.objects[bart]?.counters["+1/+1"]).toBe(1);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 20]);
      s = sac(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      s = sac(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      const demon = tokens(s, "p1", "Vampire Demon")[0] as string;
      expect(pt(s, demon)).toEqual([4, 3]);
      expect(chars(s, demon).keywords).toContain("flying");
      expect(s.objects[bart]?.counters["+1/+1"]).toBe(3);
    });
  });

  describe("rares", () => {
    it("Abuelo, Ancestral Echo : vol et garde {2} ; exile une autre de vos créatures, qui revient au début de la prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Abuelo, Ancestral Echo", "Bear Cub", "Plains", "Island", "Island"] } });
      const abuelo = idOf(s, "p1", "battlefield", "Abuelo, Ancestral Echo");
      expect(chars(s, abuelo).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === abuelo);
      expect(opt?.type === "activate" && opt.targets?.[0]?.legal).not.toContain(abuelo);
      s = resolve(activateLabel(s, "p1", abuelo, "Exilez", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && exiled(x, "Bear Cub").length === 0,
      );
      expect(s.turn.number).toBe(3);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Abuelo's Awakening : un artefact revient avec X marqueurs +1/+1 en créature Esprit 1/1 volante ; pas d'Aura", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block", "Dead Weight"] },
      });
      const card = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Abuelo's Awakening");
      const legal = card?.type === "cast" ? card.modes?.[0]?.targets[0]?.legal : [];
      expect(namesIn(s, legal)).toEqual(["Nutrient Block"]);
      s = resolve(
        castCard(s, "p1", "Abuelo's Awakening", { x: 2, targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] } }),
      );
      const block = idOf(s, "p1", "battlefield", "Nutrient Block");
      const c = chars(s, block);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toContain("Spirit");
      expect(c.keywords).toContain("flying");
      expect(pt(s, block)).toEqual([3, 3]);
    });

    it("Akal Pakal : à chaque étape de fin, si un artefact est arrivé sous votre contrôle ce tour-ci, une carte en main et l'autre au cimetière", () => {
      const run = (withArtifact: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Akal Pakal, First Among Equals", "Island"],
            hand: ["Nutrient Block"],
            library: ["Opt", "Bear Cub", "Forest"],
          },
        });
        if (withArtifact) s = resolve(castCard(s, "p1", "Nutrient Block"));
        return advanceUntil(s, (x) => x.turn.number > 3);
      };
      const yes = run(true);
      expect(yes.players.p1?.hand).toHaveLength(1);
      expect(yes.players.p1?.graveyard).toHaveLength(1);
      expect(yes.players.p1?.library).toHaveLength(1);
      const no = run(false);
      expect(namesIn(no, no.players.p1?.hand)).toEqual(["Nutrient Block"]);
      expect(no.players.p1?.library).toHaveLength(3);
    });

    it("Anim Pakal : vous attaquez avec une non-Gnome → un marqueur +1/+1, puis autant de Gnomes 1/1 engagés et attaquants que de marqueurs", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Anim Pakal, Thousandth Moon", counters: { "+1/+1": 1 } }, "Bear Cub"] } });
      const anim = idOf(s, "p1", "battlefield", "Anim Pakal, Thousandth Moon");
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.objects[anim]?.counters["+1/+1"]).toBe(2);
      const gnomes = tokens(s, "p1", "Gnome");
      expect(gnomes).toHaveLength(2);
      expect(gnomes.every((id) => s.objects[id]?.tapped && s.combat?.attackers.some((a) => a.id === id))).toBe(true);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Bedrock Tortoise : vos créatures ont la défense talismanique pendant votre tour seulement ; endurance > force → blessures de combat égales à l'endurance", () => {
      let s = scenario({ p1: { battlefield: ["Bedrock Tortoise", "Hermitic Nautilus"] } });
      const nautilus = idOf(s, "p1", "battlefield", "Hermitic Nautilus");
      expect(chars(s, nautilus).keywords).toContain("hexproof");
      s = throughCombat(attack(s, [nautilus]));
      expect(s.players.p2?.life).toBe(16);
      const theirs = scenario({ p1: { battlefield: ["Bedrock Tortoise", "Hermitic Nautilus"] }, active: "p2" });
      expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Hermitic Nautilus")).keywords).not.toContain("hexproof");
    });

    it("Brass's Tunnel-Grinder : défaussez des cartes, piochez-en autant plus une ; descente à l'étape de fin → marqueur de forage, au troisième elle se transforme", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Brass's Tunnel-Grinder // Tecutlan, the Searing Rift", "Opt", "Forest"],
          library: lands("Island", 5),
        },
      });
      const hand = (s.players.p1?.hand ?? []).filter(
        (id) => nameOf(s, id) !== "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift",
      );
      s = resolve(castCard(s, "p1", "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift"), choosing(hand));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island", "Island"]);

      const run = (descended: boolean) => {
        let t = scenario({
          p1: {
            battlefield: [{ name: "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift", counters: { bore: 2 } }, "Bear Cub"],
          },
        });
        if (descended) destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
        t = advanceUntil(t, (x) => x.turn.number > 3);
        return t;
      };
      const yes = run(true);
      const grinder = yes.battlefield.find((id) => chars(yes, id).name === "Tecutlan, the Searing Rift");
      expect(grinder).toBeDefined();
      expect(yes.objects[grinder as string]?.counters.bore ?? 0).toBe(0);
      const no = run(false);
      expect(
        no.objects[idOf(no, "p1", "battlefield", "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift")]?.counters.bore,
      ).toBe(2);
    });

    it("Tecutlan, the Searing Rift : un sort de permanent payé avec son mana → découverte X (sa valeur de mana)", () => {
      const run = (land: string) => {
        let s = scenario({
          p1: {
            battlefield: [land],
            hand: ["Dire Flail // Dire Blunderbuss"],
            library: ["Forest", "Llanowar Elves", "Bear Cub"],
          },
        });
        if (land !== "Mountain") flip(s, idOf(s, "p1", "battlefield", land));
        s = castCard(s, "p1", "Dire Flail // Dire Blunderbuss");
        return passAccepting(s, (x) => !!castNowOf(x) || (x.stack.length === 0 && x.pending?.kind === "priority"));
      };
      const s = run("Brass's Tunnel-Grinder // Tecutlan, the Searing Rift");
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Llanowar Elves"]);
      const m = run("Mountain");
      expect(castNowOf(m)).toBeUndefined();
      expect(m.players.p1?.library).toHaveLength(3);
    });

    it("Breeches, Eager Pillager : chaque Pirate qui attaque fait choisir un mode pas encore choisi ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Breeches, Eager Pillager", "Enterprising Scallywag"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Breeches, Eager Pillager")).keywords).toContain("firstStrike");
      const offered: string[][] = [];
      s = attack(s, [
        idOf(s, "p1", "battlefield", "Breeches, Eager Pillager"),
        idOf(s, "p1", "battlefield", "Enterprising Scallywag"),
      ]);
      s = resolve(s, (req) => {
        if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
        offered.push(req.options);
        return [req.options.includes("0") ? "0" : "2"];
      });
      expect(offered).toEqual([
        ["0", "1", "2"],
        ["1", "2"],
      ]);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Bringer of the Last Gift : lancé, chaque joueur sacrifie ses autres créatures, puis les cartes de créature déjà au cimetière reviennent", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 8), "Bear Cub"],
          hand: ["Bringer of the Last Gift"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: ["Serra Angel"], graveyard: ["Shivan Dragon"] },
      });
      s = resolve(castCard(s, "p1", "Bringer of the Last Gift"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bringer of the Last Gift")).toHaveLength(1);
      // Mis sur le champ de bataille sans être lancé : rien.
      let t = scenario({ p1: { battlefield: ["Bear Cub"], hand: ["Bringer of the Last Gift"] } });
      moveWithSpec(t, "p1", idOf(t, "p1", "hand", "Bringer of the Last Gift"), { to: "battlefield" });
      t = flush(t);
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Cosmium Confluence : trois modes au choix (le même plusieurs fois) — Caverne engagée, Caverne 0/0 avec trois marqueurs et la célérité, enchantement détruit", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), "Cavernous Maw"],
          hand: ["Cosmium Confluence"],
          library: ["Hidden Nursery", "Opt"],
        },
        p2: { battlefield: ["Deeproot Pilgrimage"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Cosmium Confluence");
      const modes = opt?.type === "cast" ? (opt.modes ?? []) : [];
      const all3 = modes.find((m) => m.label?.split(" + ").length === 3 && new Set(m.label.split(" + ")).size === 3);
      const maw = idOf(s, "p1", "battlefield", "Cavernous Maw");
      const weight = idOf(s, "p2", "battlefield", "Deeproot Pilgrimage");
      // La Caverne qui reçoit les marqueurs est choisie à la résolution, après la recherche (ordre des modes).
      let offered: (string | undefined)[] = [];
      s = resolve(
        castCard(s, "p1", "Cosmium Confluence", {
          mode: all3?.index,
          targets: Object.fromEntries((all3?.targets ?? []).map((t) => [t.id, [weight]])),
        }),
        (req, _p, cur) => {
          if (req.type !== "pick" || !req.options.includes(maw)) return undefined;
          offered = namesIn(cur, req.options);
          return [maw];
        },
      );
      expect(offered.sort()).toEqual(["Cavernous Maw", "Hidden Nursery"]);
      const nursery = idOf(s, "p1", "battlefield", "Hidden Nursery");
      expect(s.objects[nursery]?.tapped).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Deeproot Pilgrimage")).toHaveLength(1);
      const c = chars(s, maw);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
      expect(c.keywords).toContain("haste");
      expect(pt(s, maw)).toEqual([3, 3]);
      // Le même mode trois fois, sur la même Caverne : neuf marqueurs.
      const thrice = modes.find(
        (m) =>
          m.label === "Caverne 0/0 avec trois marqueurs + Caverne 0/0 avec trois marqueurs + Caverne 0/0 avec trois marqueurs",
      );
      let t = scenario({ p1: { battlefield: [...lands("Forest", 5), "Cavernous Maw"], hand: ["Cosmium Confluence"] } });
      t = resolve(castCard(t, "p1", "Cosmium Confluence", { mode: thrice?.index }));
      expect(pt(t, idOf(t, "p1", "battlefield", "Cavernous Maw"))).toEqual([9, 9]);
    });

    it("Deepfathom Echo : au début du combat, il explore, puis peut devenir une copie d'une autre de vos créatures jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Deepfathom Echo", "Shivan Dragon"], library: ["Opt", "Forest"] } });
      const echo = idOf(s, "p1", "battlefield", "Deepfathom Echo");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      s = resolve(s, choosing([dragon]));
      expect(s.objects[echo]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, echo).name).toBe("Shivan Dragon");
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(chars(s, echo).name).toBe("Deepfathom Echo");
    });

    it("Deepfathom Echo : la créature à copier est choisie à la résolution, après l'exploration, sans cibler", () => {
      let s = scenario({ p1: { battlefield: ["Deepfathom Echo", "Shivan Dragon", "Bear Cub"], library: ["Opt", "Forest"] } });
      const echo = idOf(s, "p1", "battlefield", "Deepfathom Echo");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      expect(s.stack.at(-1)?.targets.t).toBeUndefined();
      // Le Dragon part avant la résolution : la capacité se résout quand même, et la copie porte sur Bear Cub.
      destroy(s, dragon);
      s = resolve(s, choosing([cub]));
      expect(s.objects[echo]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, echo).name).toBe("Bear Cub");
    });

    it("Deeproot Pilgrimage : des Ondins non-jetons que vous contrôlez s'engagent → un seul Ondin 1/1 avec la défense talismanique", () => {
      let s = scenario({ p1: { battlefield: ["Deeproot Pilgrimage", "Cenote Scout", "Merfolk Cave-Diver", "Bear Cub"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Cenote Scout"), idOf(s, "p1", "battlefield", "Merfolk Cave-Diver")]));
      const merfolk = tokens(s, "p1", "Merfolk");
      expect(merfolk).toHaveLength(1);
      expect(pt(s, merfolk[0] as string)).toEqual([1, 1]);
      expect(chars(s, merfolk[0] as string).keywords).toContain("hexproof");
      let t = scenario({ p1: { battlefield: ["Deeproot Pilgrimage", "Bear Cub"] } });
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(tokens(t, "p1", "Merfolk")).toHaveLength(0);
    });

    it("Dire Flail : +2/+0, Équiper {1} ; Dire Blunderbuss : +3/+0, en attaquant, sacrifiez un autre artefact pour infliger sa force à une créature", () => {
      let s = scenario({ p1: { battlefield: ["Dire Flail // Dire Blunderbuss", "Bear Cub", "Mountain"] } });
      const flail = idOf(s, "p1", "battlefield", "Dire Flail // Dire Blunderbuss");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", flail, "Équiper", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);

      let t = scenario({
        p1: { battlefield: ["Dire Flail // Dire Blunderbuss", "Bear Cub", "Nutrient Block", "Mountain"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const gun = idOf(t, "p1", "battlefield", "Dire Flail // Dire Blunderbuss");
      flip(t, gun);
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", gun, "Équiper", { targets: { t: [cub] } }));
      expect(pt(t, cub)).toEqual([5, 2]);
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = resolve(attack(t, [cub]), choosing([idOf(t, "p1", "battlefield", "Nutrient Block"), angel]));
      expect(idsOf(t, "p1", "graveyard", "Nutrient Block")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Echoing Deeps : peut arriver engagé en copie d'une carte de terrain d'un cimetière, Caverne en plus", () => {
      let s = scenario({ p1: { hand: ["Echoing Deeps"] }, p2: { graveyard: ["Restless Vents"] } });
      const vents = idOf(s, "p2", "graveyard", "Restless Vents");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Echoing Deeps") }), choosing([vents]));
      const deeps = s.battlefield.find((id) => s.objects[id]?.controller === "p1") as string;
      expect(chars(s, deeps).name).toBe("Restless Vents");
      expect(chars(s, deeps).subtypes).toContain("Cave");
      expect(s.objects[deeps]?.tapped).toBe(true);
    });

    it("Fabrication Foundry : exilez d'autres artefacts de valeur de mana totale X pour renvoyer un artefact de VM X ou moins de votre cimetière (rituel)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Fabrication Foundry", "Digsite Conservator", ...lands("Plains", 3)],
          graveyard: ["Dire Flail // Dire Blunderbuss"],
        },
      });
      const foundry = idOf(s, "p1", "battlefield", "Fabrication Foundry");
      const flail = idOf(s, "p1", "graveyard", "Dire Flail // Dire Blunderbuss");
      s = resolve(activateLabel(s, "p1", foundry, "Exilez", { targets: { t: [flail] } }));
      expect(exiled(s, "Digsite Conservator")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Dire Flail // Dire Blunderbuss")).toHaveLength(1);
      const theirs = scenario({
        p1: {
          battlefield: ["Fabrication Foundry", "Digsite Conservator", ...lands("Plains", 3)],
          graveyard: ["Dire Flail // Dire Blunderbuss"],
        },
        active: "p2",
      });
      expect(canActivate(theirs, "p1", idOf(theirs, "p1", "battlefield", "Fabrication Foundry"))).toBe(false);
    });

    it("Growing Rites of Itlimoc : une créature parmi les quatre cartes du dessus en main ; quatre créatures à votre étape de fin → Itlimoc, un {G} par créature", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"],
          library: ["Opt", "Bear Cub", "Forest", "Island", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(libraryNames(s)[0]).toBe("Swamp");

      const run = (creatures: number) => {
        const t = scenario({
          p1: { battlefield: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun", ...Array(creatures).fill("Bear Cub")] },
        });
        return advanceUntil(t, (x) => x.turn.number > 3);
      };
      const four = run(4);
      const itlimoc = idOf(four, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun");
      expect(chars(four, itlimoc).name).toBe("Itlimoc, Cradle of the Sun");
      const three = run(3);
      expect(
        chars(three, idOf(three, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun")).name,
      ).not.toBe("Itlimoc, Cradle of the Sun");
      // Itlimoc : {T} : un {G} par créature que vous contrôlez.
      let m = scenario({
        p1: { battlefield: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun", "Bear Cub", "Bear Cub", "Bear Cub"] },
      });
      const land = idOf(m, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun");
      flip(m, land);
      const abilities = legalActions(m, "p1").filter((a) => a.type === "tapForMana" && a.source === land);
      expect(abilities).toHaveLength(2);
      const last = abilities[1];
      m = act(m, "p1", { type: "tapForMana", source: land, ability: last?.type === "tapForMana" ? last.ability : -1 });
      expect(m.players.p1?.manaPool.G).toBe(3);
    });

    it("Hulking Raptor : garde {2} ; au début de votre première phase principale, ajoutez {G}{G}", () => {
      let s = scenario({ p1: { battlefield: ["Hulking Raptor"] }, active: "p2", step: "end", turn: 2 });
      expect(chars(s, idOf(s, "p1", "battlefield", "Hulking Raptor")).keywords).toContain("ward");
      s = toMyMain(s);
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Intrepid Paleontologist : {2} exile une carte d'un cimetière ; un Dinosaure que vous possédez ainsi exilé se lance et arrive avec un marqueur de finalité", () => {
      let s = scenario({
        p1: { battlefield: ["Intrepid Paleontologist", ...lands("Forest", 10)], graveyard: ["Hulking Raptor", "Bear Cub"] },
        p2: { graveyard: ["Colossadactyl"] },
      });
      const paleo = idOf(s, "p1", "battlefield", "Intrepid Paleontologist");
      for (const [p, name] of [
        ["p1", "Hulking Raptor"],
        ["p1", "Bear Cub"],
        ["p2", "Colossadactyl"],
      ] as const)
        s = resolve(activateLabel(s, "p1", paleo, "Exilez", { targets: { t: [idOf(s, p, "graveyard", name)] } }));
      const raptor = exiled(s, "Hulking Raptor")[0] as string;
      expect(castable(s, "p1", raptor)).toBe(true);
      // Pas un Dinosaure ; ou une carte d'un adversaire (« que vous possédez ») : non.
      expect(castable(s, "p1", exiled(s, "Bear Cub")[0] as string)).toBe(false);
      expect(castable(s, "p1", exiled(s, "Colossadactyl")[0] as string)).toBe(false);
      s = resolve(act(s, "p1", { type: "cast", card: raptor }));
      const onField = idOf(s, "p1", "battlefield", "Hulking Raptor");
      expect(s.objects[onField]?.counters.finality).toBe(1);
    });

    it("Jadelight Spelunker : explore X fois", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Jadelight Spelunker"], library: ["Forest", "Opt", "Island"] },
      });
      s = resolve(castCard(s, "p1", "Jadelight Spelunker", { x: 2 }));
      const jade = idOf(s, "p1", "battlefield", "Jadelight Spelunker");
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.objects[jade]?.counters["+1/+1"]).toBe(1);
    });

    it("Kellan, Daring Traveler : en attaquant, une carte de créature de VM 3 ou moins révélée va en main ; Journey On : une Carte, plus une si un adversaire contrôle un artefact", () => {
      let s = scenario({ p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Bear Cub", "Forest"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      let big = scenario({
        p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Shivan Dragon", "Forest"] },
      });
      big = resolve(attack(big, [idOf(big, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]));
      expect(big.players.p1?.hand).toHaveLength(0);

      const journey = (artifact: boolean) => {
        const t = scenario({
          p1: { battlefield: ["Forest"], hand: ["Kellan, Daring Traveler // Journey On"] },
          p2: { battlefield: artifact ? ["Nutrient Block"] : [] },
        });
        return resolve(castCard(t, "p1", "Kellan, Daring Traveler // Journey On", { face: 1 }));
      };
      expect(tokens(journey(false), "p1", "Map")).toHaveLength(1);
      expect(tokens(journey(true), "p1", "Map")).toHaveLength(2);
    });

    it("Kellan, Daring Traveler : une carte révélée qui n'est pas une créature de VM 3 ou moins peut aller au cimetière, sinon elle reste", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Shivan Dragon", "Forest"] },
        });
        return resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]), choosing([], yes));
      };
      const binned = run(true);
      expect(namesIn(binned, binned.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
      expect(namesIn(binned, binned.players.p1?.library)).toEqual(["Forest"]);
      const kept = run(false);
      expect(namesIn(kept, kept.players.p1?.library)).toEqual(["Shivan Dragon", "Forest"]);
      // Une créature de VM 3 ou moins va forcément en main (pas de refus possible).
      let mins: number[] = [];
      let s = scenario({ p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Bear Cub", "Forest"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]), (req) => {
        if (req.type === "pick" && req.intent === "lookAtTop") mins = [...mins, req.min ?? 0];
        return undefined;
      });
      expect(mins).toEqual([1]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual([]);
    });

    it("Journey On : une Carte, plus une par adversaire qui contrôle un artefact", () => {
      let t = scenario({
        players: 3,
        p1: { battlefield: ["Forest"], hand: ["Kellan, Daring Traveler // Journey On"] },
        p2: { battlefield: ["Nutrient Block"] },
        p3: { battlefield: ["Nutrient Block"] },
      });
      t = resolve(castCard(t, "p1", "Kellan, Daring Traveler // Journey On", { face: 1 }));
      expect(tokens(t, "p1", "Map")).toHaveLength(3);
    });

    it("In the Presence of Ages : une carte de créature et/ou une carte de terrain en main, pas deux créatures ; le reste au cimetière", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: lands("Forest", 3),
            hand: ["In the Presence of Ages"],
            library: ["Bear Cub", "Llanowar Elves", "Forest", "Opt"],
          },
        });
      let s = setup();
      const cub = s.players.p1?.library[0] as string;
      const elves = s.players.p1?.library[1] as string;
      const forest = s.players.p1?.library[2] as string;
      s = castCard(s, "p1", "In the Presence of Ages");
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      expect(() => act(s, "p1", { type: "choose", values: [cub, elves] })).toThrow(RulesError);
      s = resolve(act(s, "p1", { type: "choose", values: [cub, forest] }));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["In the Presence of Ages", "Llanowar Elves", "Opt"]);
    });

    it("Kutzil's Flanker : un marqueur par créature partie ce tour-ci ; ou +2 PV et regard 2 ; ou exil du cimetière d'un joueur", () => {
      const run = (modeIndex: string, extra: (s: S) => S = (s) => s) => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Llanowar Elves"], hand: ["Kutzil's Flanker"] },
          p2: { graveyard: ["Forest", "Opt"] },
        });
        s = extra(s);
        return resolve(castCard(s, "p1", "Kutzil's Flanker"), (req) =>
          req.type === "pick" && req.intent === "triggerMode"
            ? [modeIndex]
            : req.type === "pick" && req.options.includes("p2")
              ? ["p2"]
              : undefined,
        );
      };
      const counters = run("0", (s) => {
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        return s;
      });
      expect(counters.objects[idOf(counters, "p1", "battlefield", "Kutzil's Flanker")]?.counters["+1/+1"]).toBe(2);
      const life = run("1");
      expect(life.players.p1?.life).toBe(22);
      const yard = run("2");
      expect(yard.players.p2?.graveyard).toHaveLength(0);
      expect(exiled(yard, "Opt")).toHaveLength(1);
    });

    it("Malcolm, Alluring Scoundrel : blessures de combat → marqueur de chœur, pillage ; au quatrième marqueur, la carte défaussée se lance gratuitement", () => {
      const run = (chorus: number) => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Malcolm, Alluring Scoundrel", counters: { chorus } }],
            hand: ["Nutrient Block"],
            library: ["Forest"],
          },
        });
        const malcolm = idOf(s, "p1", "battlefield", "Malcolm, Alluring Scoundrel");
        s = attack(s, [malcolm]);
        s = passAccepting(s, (x) => !!castNowOf(x) || x.turn.step === "main2");
        return { s, malcolm };
      };
      const four = run(3);
      expect(four.s.objects[four.malcolm]?.counters.chorus).toBe(4);
      expect(namesIn(four.s, castNowOf(four.s)?.cards)).toEqual(["Nutrient Block"]);
      const one = run(0);
      expect(one.s.objects[one.malcolm]?.counters.chorus).toBe(1);
      expect(castNowOf(one.s)).toBeUndefined();
      expect(one.s.players.p1?.graveyard).toHaveLength(1);
      expect(one.s.players.p1?.hand).toHaveLength(1);
    });

    it("Matzalantli, the Great Door : pillage ; se transforme seulement avec quatre types de permanent au cimetière ; The Core : X mana d'une couleur", () => {
      const can = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: [{ name: "Matzalantli, the Great Door // The Core" }, ...lands("Island", 4)], graveyard },
        });
        const door = idOf(s, "p1", "battlefield", "Matzalantli, the Great Door // The Core");
        return legalActions(s, "p1").some(
          (a) => a.type === "activate" && a.source === door && a.label?.includes("Transformation"),
        );
      };
      expect(can(["Forest", "Bear Cub", "Nutrient Block", "Dead Weight"])).toBe(true);
      expect(can(["Forest", "Bear Cub", "Nutrient Block", "Opt"])).toBe(false);
      let s = scenario({
        p1: { battlefield: ["Matzalantli, the Great Door // The Core"], graveyard: ["Forest", "Bear Cub", "Opt"] },
      });
      const core = idOf(s, "p1", "battlefield", "Matzalantli, the Great Door // The Core");
      flip(s, core);
      const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === core);
      s = act(s, "p1", { type: "tapForMana", source: core, ability: a?.type === "tapForMana" ? a.ability : -1, color: "B" });
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Molten Collapse : un mode ; les deux si vous êtes descendu ce tour-ci", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Molten Collapse"] },
          p2: { battlefield: ["Serra Angel", "Dire Flail // Dire Blunderbuss"] },
        });
      const modesOf = (s: S) => {
        const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Molten Collapse");
        return o?.type === "cast" ? (o.modes ?? []).map((m) => m.index) : [];
      };
      expect(modesOf(setup())).toEqual([0, 1]);
      let s = setup();
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(modesOf(s)).toEqual([0, 1, 2]);
      s = resolve(
        castCard(s, "p1", "Molten Collapse", {
          mode: 2,
          targets: {
            a: [idOf(s, "p2", "battlefield", "Serra Angel")],
            b: [idOf(s, "p2", "battlefield", "Dire Flail // Dire Blunderbuss")],
          },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Dire Flail // Dire Blunderbuss")).toHaveLength(1);
    });

    it("Palani's Hatcher : deux Œufs de Dinosaure 0/1 (célérité : autres Dinosaures) ; au début du combat, un Œuf sacrifié donne un Dinosaure 3/3", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), ...lands("Forest", 2)], hand: ["Palani's Hatcher"] } });
      s = resolve(castCard(s, "p1", "Palani's Hatcher"));
      const eggs = tokens(s, "p1", "Dinosaur Egg");
      expect(eggs.map((id) => pt(s, id))).toEqual([
        [0, 1],
        [0, 1],
      ]);
      expect(chars(s, eggs[0] as string).keywords).toContain("haste");
      expect(chars(s, idOf(s, "p1", "battlefield", "Palani's Hatcher")).keywords).not.toContain("haste");
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      expect(tokens(s, "p1", "Dinosaur Egg")).toHaveLength(1);
      const dino = tokens(s, "p1", "Dinosaur")[0] as string;
      expect(pt(s, dino)).toEqual([3, 3]);
      expect(chars(s, dino).keywords).toContain("haste");
      // Sans Œuf, rien.
      let t = scenario({ p1: { battlefield: ["Palani's Hatcher"] } });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      expect(tokens(t, "p1", "Dinosaur")).toHaveLength(0);
    });

    it("Poetic Ingenuity : autant de Trésors que de Dinosaures attaquants ; un sort d'artefact → un Dinosaure 3/1, une fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Poetic Ingenuity", "Hulking Raptor", "Colossadactyl", "Bear Cub"] } });
      s = resolve(
        attack(s, [
          idOf(s, "p1", "battlefield", "Hulking Raptor"),
          idOf(s, "p1", "battlefield", "Colossadactyl"),
          idOf(s, "p1", "battlefield", "Bear Cub"),
        ]),
      );
      expect(tokens(s, "p1", "Treasure")).toHaveLength(2);
      let t = scenario({
        p1: { battlefield: ["Poetic Ingenuity", "Plains", "Plains"], hand: ["Nutrient Block", "Nutrient Block"] },
      });
      t = resolve(castCard(t, "p1", "Nutrient Block"));
      t = resolve(castCard(t, "p1", "Nutrient Block"));
      const dinos = tokens(t, "p1", "Dinosaur");
      expect(dinos).toHaveLength(1);
      expect(pt(t, dinos[0] as string)).toEqual([3, 1]);
    });

    it("Preacher of the Schism : attaquer le joueur qui a le plus de PV → Vampire 1/1 avec le lien de vie ; attaquer en ayant le plus de PV → piochez et perdez 1 PV", () => {
      const run = (mine: number, theirs: number) => {
        let s = scenario({
          p1: { battlefield: ["Preacher of the Schism"], life: mine, library: lands("Swamp", 3) },
          p2: { life: theirs },
        });
        s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Preacher of the Schism")]));
        return { vampires: tokens(s, "p1", "Vampire").length, hand: s.players.p1?.hand.length, life: s.players.p1?.life };
      };
      expect(run(20, 20)).toEqual({ vampires: 1, hand: 1, life: 19 });
      expect(run(10, 20)).toEqual({ vampires: 1, hand: 0, life: 10 });
      expect(run(20, 10)).toEqual({ vampires: 0, hand: 1, life: 19 });
      const s = scenario({ p1: { battlefield: ["Preacher of the Schism"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Preacher of the Schism")).keywords).toContain("deathtouch");
    });

    it("Pugnacious Hammerskull : attaque sans autre Dinosaure → marqueur d'étourdissement ; avec un autre Dinosaure, non", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Pugnacious Hammerskull", other] } });
        const h = idOf(s, "p1", "battlefield", "Pugnacious Hammerskull");
        s = resolve(attack(s, [h]));
        return s.objects[h]?.counters.stun ?? 0;
      };
      expect(run("Bear Cub")).toBe(1);
      expect(run("Colossadactyl")).toBe(0);
    });

    it("Queen's Bay Paladin : en arrivant, un Vampire de votre cimetière revient avec un marqueur de finalité ; vous perdez sa valeur de mana", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Queen's Bay Paladin"], graveyard: ["Bartolomé del Presidio", "Bear Cub"] },
      });
      const card = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Queen's Bay Paladin");
      expect(card).toBeDefined();
      s = resolve(castCard(s, "p1", "Queen's Bay Paladin"), choosing([idOf(s, "p1", "graveyard", "Bartolomé del Presidio")]));
      const bart = idOf(s, "p1", "battlefield", "Bartolomé del Presidio");
      expect(s.objects[bart]?.counters.finality).toBe(1);
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Restless Prairie : Lama 3/3 vert et blanc ; en attaquant, vos autres créatures +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Restless Prairie", "Bear Cub", "Forest", "Forest", "Plains", "Plains"] } });
      const prairie = idOf(s, "p1", "battlefield", "Restless Prairie");
      s = resolve(activateLabel(s, "p1", prairie, "créature"));
      expect(pt(s, prairie)).toEqual([3, 3]);
      expect(chars(s, prairie).subtypes).toContain("Llama");
      expect([...chars(s, prairie).colors].sort()).toEqual(["G", "W"]);
      s = resolve(attack(s, [prairie]));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, prairie)).toEqual([3, 3]);
    });

    it("Restless Ridgeline : Dinosaure 3/4 ; en attaquant, une autre créature attaquante ciblée +2/+0 et dégagée", () => {
      let s = scenario({ p1: { battlefield: ["Restless Ridgeline", "Bear Cub", "Forest", "Forest", "Mountain", "Mountain"] } });
      const ridge = idOf(s, "p1", "battlefield", "Restless Ridgeline");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", ridge, "créature"));
      expect(pt(s, ridge)).toEqual([3, 4]);
      expect(chars(s, ridge).subtypes).toContain("Dinosaur");
      s = resolve(attack(s, [ridge, bear]), choosing([bear]));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Restless Vents : Insecte 2/3 avec la menace ; en attaquant, défaussez une carte pour en piocher une", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Vents", "Swamp", "Mountain", "Mountain"], hand: ["Opt"], library: ["Forest"] },
      });
      const vents = idOf(s, "p1", "battlefield", "Restless Vents");
      s = resolve(activateLabel(s, "p1", vents, "créature"));
      expect(pt(s, vents)).toEqual([2, 3]);
      expect(chars(s, vents).keywords).toContain("menace");
      s = resolve(attack(s, [vents]), choosing([idOf(s, "p1", "hand", "Opt")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Roaming Throne : garde {2}, du type de créature choisi ; les déclencheurs de vos autres créatures de ce type se déclenchent une fois de plus", () => {
      let s = scenario({ p1: { battlefield: ["Roaming Throne", "Sentinel of the Nameless City", "Sanguine Evangelist"] } });
      const throne = idOf(s, "p1", "battlefield", "Roaming Throne");
      (s.objects[throne] as { chosen?: { creatureType?: string } }).chosen = { creatureType: "Merfolk" };
      bump(s);
      expect(chars(s, throne).subtypes).toContain("Merfolk");
      expect(chars(s, throne).keywords).toContain("ward");
      s = resolve(
        attack(s, [
          idOf(s, "p1", "battlefield", "Sentinel of the Nameless City"),
          idOf(s, "p1", "battlefield", "Sanguine Evangelist"),
        ]),
      );
      // Sentinelle (Ondin) : deux Cartes ; Evangelist (Vampire) : une seule fois +1/+0 (cri de guerre).
      expect(tokens(s, "p1", "Map")).toHaveLength(2);
      expect(pt(s, idOf(s, "p1", "battlefield", "Sentinel of the Nameless City"))).toEqual([4, 4]);
    });

    it("Sanguine Evangelist : cri de guerre ; une Chauve-souris 1/1 volante en arrivant et en mourant", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Sanguine Evangelist"] } });
      s = resolve(castCard(s, "p1", "Sanguine Evangelist"));
      const bats = tokens(s, "p1", "Bat");
      expect(bats).toHaveLength(1);
      expect(chars(s, bats[0] as string).keywords).toContain("flying");
      let t = scenario({ p1: { battlefield: ["Sanguine Evangelist", "Bear Cub"] } });
      const evangelist = idOf(t, "p1", "battlefield", "Sanguine Evangelist");
      t = resolve(attack(t, [evangelist, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([3, 2]);
      expect(pt(t, evangelist)).toEqual([2, 1]);
      destroy(t, evangelist);
      t = flush(t);
      expect(tokens(t, "p1", "Bat")).toHaveLength(1);
    });

    it("Sentinel of the Nameless City : vigilance ; une Carte en arrivant et en attaquant", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Sentinel of the Nameless City"] } });
      s = resolve(castCard(s, "p1", "Sentinel of the Nameless City"));
      expect(tokens(s, "p1", "Map")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sentinel of the Nameless City"] } });
      const sentinel = idOf(t, "p1", "battlefield", "Sentinel of the Nameless City");
      t = resolve(attack(t, [sentinel]));
      expect(tokens(t, "p1", "Map")).toHaveLength(1);
      expect(t.objects[sentinel]?.tapped).toBe(false);
    });

    it("Squirming Emergence : une carte de permanent non-terrain de VM ≤ cartes de permanent du cimetière revient sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", "Swamp", "Forest"],
          hand: ["Squirming Emergence"],
          graveyard: ["Forest", "Swamp", "Bear Cub"],
        },
      });
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Squirming Emergence");
      const legal = o?.type === "cast" ? (o.modes?.[0]?.targets[0]?.legal ?? []) : [];
      expect(namesIn(s, legal)).toEqual(["Bear Cub"]);
      s = resolve(castCard(s, "p1", "Squirming Emergence", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Stalactite Stalker : descente → marqueur +1/+1 à votre étape de fin ; {2}{B}, sacrifice : −X/−X, X étant sa force", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Stalactite Stalker", "Bear Cub"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Stalactite Stalker")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
      let s = scenario({
        p1: { battlefield: [{ name: "Stalactite Stalker", counters: { "+1/+1": 2 } }, "Swamp", "Swamp", "Swamp"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(chars(s, idOf(s, "p1", "battlefield", "Stalactite Stalker")).keywords).toContain("menace");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Stalactite Stalker"), "−X/−X", { targets: { t: [angel] } }),
      );
      expect(idsOf(s, "p1", "graveyard", "Stalactite Stalker")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Starving Revenant : surveillance 2, puis une carte et 3 PV perdus par carte laissée dessus ; descente 8 : chaque pioche draine 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Starving Revenant"], library: ["Opt", "Forest", "Island"] },
      });
      const opt = s.players.p1?.library[0] as string;
      s = resolve(castCard(s, "p1", "Starving Revenant"), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.players.p1?.life).toBe(17);

      const drain = (graveyard: string[]) => {
        let t = scenario({ p1: { battlefield: ["Starving Revenant"], graveyard } });
        drawCards(t, "p1", 1);
        t = flush(t);
        return [t.players.p1?.life, t.players.p2?.life];
      };
      expect(drain(lands("Forest", 8))).toEqual([21, 19]);
      expect(drain(lands("Forest", 7))).toEqual([20, 20]);
    });

    it("Subterranean Schooner : la créature qui l'a piloté explore quand il attaque", () => {
      let s = scenario({ p1: { battlefield: ["Subterranean Schooner", "Bear Cub"], library: ["Opt", "Forest"] } });
      const boat = idOf(s, "p1", "battlefield", "Subterranean Schooner");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", boat, "Équipage", { tap: [bear] }));
      s = resolve(attack(s, [boat]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Subterranean Schooner : la créature qui l'a piloté est ciblée ; partie avant la résolution, rien n'explore", () => {
      let s = scenario({
        p1: { battlefield: ["Subterranean Schooner", "Bear Cub", "Llanowar Elves"], library: ["Opt", "Forest"] },
      });
      const boat = idOf(s, "p1", "battlefield", "Subterranean Schooner");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", boat, "Équipage", { tap: [bear] }));
      s = passAccepting(attack(s, [boat]), (x) => x.stack.length > 0);
      expect(s.stack.at(-1)?.targets.t).toEqual([bear]);
      destroy(s, bear);
      s = resolve(s);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt", "Forest"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBeUndefined();
    });

    it("Sunken Citadel : arrive engagée, couleur choisie ; un mana de cette couleur, ou deux pour les seules capacités de terrains", () => {
      let s = scenario({ p1: { hand: ["Sunken Citadel"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Sunken Citadel"), chosen: "G" });
      const citadel = idOf(s, "p1", "battlefield", "Sunken Citadel");
      expect(s.objects[citadel]?.tapped).toBe(true);
      (s.objects[citadel] as { tapped: boolean }).tapped = false;
      const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === citadel);
      s = act(s, "p1", { type: "tapForMana", source: citadel, ability: a?.type === "tapForMana" ? a.ability : -1 });
      expect(s.players.p1?.manaPool.G).toBe(1);
      // Rouge : les deux mana paient l'animation de Restless Ridgeline ({2}{R}{G}), pas Calamitous Cave-In ({3}{R}).
      const t = scenario({
        p1: {
          battlefield: ["Sunken Citadel", "Forest", "Plains", { name: "Restless Ridgeline", tapped: true }],
          hand: ["Calamitous Cave-In"],
        },
      });
      const c = idOf(t, "p1", "battlefield", "Sunken Citadel");
      (t.objects[c] as { chosen?: { color?: string } }).chosen = { color: "R" };
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Restless Ridgeline"))).toBe(true);
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Calamitous Cave-In"))).toBe(false);
    });

    it("Tarrian's Journal : {T}, sacrifiez un autre artefact ou une créature : piochez (rituel) ; {2}, {T}, défaussez votre main : transformation", () => {
      let s = scenario({ p1: { battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Bear Cub"], library: ["Opt"] } });
      const journal = idOf(s, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      s = resolve(activateLabel(s, "p1", journal, "Piochez", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = scenario({
        p1: { battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Swamp", "Swamp"], hand: ["Opt", "Forest"] },
      });
      const j = idOf(t, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      t = resolve(activateLabel(t, "p1", j, "transformation"));
      expect(t.players.p1?.hand).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(2);
      expect(chars(t, j).name).toBe("The Tomb of Aclazotz");
    });

    it("The Tomb of Aclazotz : {T} : un sort de créature de votre cimetière ce tour-ci, qui arrive avec un marqueur de finalité, Vampire en plus", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Forest", "Forest"],
          graveyard: ["Bear Cub", "Llanowar Elves"],
        },
      });
      const tomb = idOf(s, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      flip(s, tomb);
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      expect(castable(s, "p1", bear)).toBe(false);
      s = resolve(activateLabel(s, "p1", tomb, "cimetière"));
      expect(castable(s, "p1", bear)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: bear }));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[cub]?.counters.finality).toBe(1);
      expect(chars(s, cub).subtypes).toContain("Vampire");
    });

    it("Tarrian's Soulcleaver : vigilance ; un autre artefact ou une créature mis au cimetière depuis le champ de bataille → marqueur +1/+1 sur la créature équipée", () => {
      let s = scenario({
        p1: { battlefield: ["Tarrian's Soulcleaver", "Bear Cub", "Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Nutrient Block"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Tarrian's Soulcleaver"), "Équiper", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toContain("vigilance");
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = flush(s);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("The Belligerent : équipage 3 ; en attaquant, un Trésor, et vous jouez la carte du dessus de votre bibliothèque ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["The Belligerent", "Serra Angel"], library: ["Forest", "Island"] } });
      const ship = idOf(s, "p1", "battlefield", "The Belligerent");
      s = resolve(activateLabel(s, "p1", ship, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
      s = throughCombat(attack(s, [ship]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
    });

    it("The Everflowing Well : meulez deux cartes, piochez-en deux ; descente 8 à l'entretien → The Myriad Pools", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["The Everflowing Well // The Myriad Pools"],
          library: ["Forest", "Bear Cub", "Opt", "Island"],
        },
      });
      s = resolve(castCard(s, "p1", "The Everflowing Well // The Myriad Pools"));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Opt"]);
      const run = (n: number) => {
        let t = scenario({
          p1: { battlefield: ["The Everflowing Well // The Myriad Pools"], graveyard: lands("Forest", n) },
          active: "p2",
          step: "end",
          turn: 2,
        });
        t = toMyMain(t);
        return chars(t, idOf(t, "p1", "battlefield", "The Everflowing Well // The Myriad Pools")).name;
      };
      expect(run(8)).toBe("The Myriad Pools");
      expect(run(7)).not.toBe("The Myriad Pools");
    });

    it("The Myriad Pools : un sort de permanent payé avec son mana → un autre de vos permanents devient une copie du sort jusqu'à la fin du tour", () => {
      const run = (poolsTapped: boolean) => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "The Everflowing Well // The Myriad Pools", tapped: poolsTapped },
              "Island",
              "Island",
              "Nutrient Block",
            ],
            hand: ["Hermitic Nautilus"],
          },
        });
        flip(s, idOf(s, "p1", "battlefield", "The Everflowing Well // The Myriad Pools"));
        const block = idOf(s, "p1", "battlefield", "Nutrient Block");
        s = resolve(castCard(s, "p1", "Hermitic Nautilus"), choosing([block]));
        return { s, block };
      };
      const used = run(false);
      // Paiement automatique : Pools et une Île.
      expect(chars(used.s, used.block).name).toBe("Hermitic Nautilus");
      const after = advanceUntil(used.s, (x) => x.turn.number > 3);
      expect(chars(after, used.block).name).toBe("Nutrient Block");
      const other = run(true);
      expect(chars(other.s, other.block).name).toBe("Nutrient Block");
    });

    it("Thousand Moons Smithy : Gnome Soldat (F/E : vos artefacts et créatures) ; à votre première phase principale, engagez cinq artefacts et/ou créatures pour la transformer", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Thousand Moons Smithy // Barracks of the Thousand"] } });
      s = resolve(castCard(s, "p1", "Thousand Moons Smithy // Barracks of the Thousand"));
      const gnome = tokens(s, "p1", "Gnome Soldier")[0] as string;
      expect(pt(s, gnome)).toEqual([2, 2]);
      let t = scenario({
        p1: { battlefield: ["Thousand Moons Smithy // Barracks of the Thousand", ...Array(5).fill("Bear Cub")] },
        active: "p2",
        step: "end",
        turn: 2,
      });
      t = toMyMain(t);
      const smithy = idOf(t, "p1", "battlefield", "Thousand Moons Smithy // Barracks of the Thousand");
      expect(chars(t, smithy).name).toBe("Barracks of the Thousand");
      expect(idsOf(t, "p1", "battlefield", "Bear Cub").every((id) => t.objects[id]?.tapped)).toBe(true);
    });

    it("Barracks of the Thousand : un sort d'artefact ou de créature payé avec son mana → un Gnome Soldat", () => {
      let s = scenario({ p1: { battlefield: ["Thousand Moons Smithy // Barracks of the Thousand"], hand: ["Ruin-Lurker Bat"] } });
      flip(s, idOf(s, "p1", "battlefield", "Thousand Moons Smithy // Barracks of the Thousand"));
      s = resolve(castCard(s, "p1", "Ruin-Lurker Bat"));
      expect(tokens(s, "p1", "Gnome Soldier")).toHaveLength(1);
    });

    it("Threefold Thunderhulk : arrive avec trois marqueurs +1/+1 ; en arrivant et en attaquant, autant de Gnomes que sa force ; {2}, sacrifiez un autre artefact : marqueur", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Threefold Thunderhulk"] } });
      s = resolve(castCard(s, "p1", "Threefold Thunderhulk"));
      const hulk = idOf(s, "p1", "battlefield", "Threefold Thunderhulk");
      expect(pt(s, hulk)).toEqual([3, 3]);
      expect(tokens(s, "p1", "Gnome")).toHaveLength(3);
      let t = scenario({
        p1: { battlefield: [{ name: "Threefold Thunderhulk", counters: { "+1/+1": 3 } }, "Nutrient Block", "Plains", "Plains"] },
      });
      const h = idOf(t, "p1", "battlefield", "Threefold Thunderhulk");
      t = resolve(activateLabel(t, "p1", h, "Marqueur", { sacrifice: [idOf(t, "p1", "battlefield", "Nutrient Block")] }));
      expect(pt(t, h)).toEqual([4, 4]);
      t = resolve(attack(t, [h]));
      expect(tokens(t, "p1", "Gnome")).toHaveLength(4);
    });

    it("Throne of the Grim Captain : {T} : meulez deux cartes ; The Grim Captain : menace, piétinement, lien de vie, défense talismanique ; en attaquant, chaque adversaire sacrifie un permanent non-terrain", () => {
      let s = scenario({
        p1: { battlefield: ["Throne of the Grim Captain // The Grim Captain"], library: ["Forest", "Opt", "Island"] },
      });
      s = act(s, "p1", {
        type: "activate",
        source: idOf(s, "p1", "battlefield", "Throne of the Grim Captain // The Grim Captain"),
        ability: 0,
      });
      s = resolve(s);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      let t = scenario({
        p1: { battlefield: ["Throne of the Grim Captain // The Grim Captain"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const cap = idOf(t, "p1", "battlefield", "Throne of the Grim Captain // The Grim Captain");
      flip(t, cap);
      expect(chars(t, cap).keywords).toEqual(expect.arrayContaining(["menace", "trample", "lifelink", "hexproof"]));
      t = resolve(attack(t, [cap]));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Trumpeting Carnosaur : découverte 5 en arrivant ; {2}{R}, défaussez-la : 3 blessures à une créature ou un planeswalker", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 6),
          hand: ["Trumpeting Carnosaur"],
          library: ["Forest", "Shivan Dragon", "Bear Cub"],
        },
      });
      s = untilCastNow(castCard(s, "p1", "Trumpeting Carnosaur"));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Trumpeting Carnosaur"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = resolve(
        activateLabel(t, "p1", idOf(t, "p1", "hand", "Trumpeting Carnosaur"), "3 blessures", { targets: { t: [angel] } }),
      );
      expect(idsOf(t, "p1", "graveyard", "Trumpeting Carnosaur")).toHaveLength(1);
      expect(t.objects[angel]?.damage).toBe(3);
    });

    it("Wail of the Forgotten : un mode ; un ou plusieurs avec huit cartes de permanent au cimetière (renvoi, défausse, une carte parmi trois)", () => {
      const setup = (graveyard: string[]) =>
        scenario({
          p1: {
            battlefield: ["Island", "Swamp"],
            hand: ["Wail of the Forgotten"],
            graveyard,
            library: ["Opt", "Forest", "Bear Cub"],
          },
          p2: { battlefield: ["Serra Angel"], hand: ["Shivan Dragon"] },
        });
      const modes = (s: S) => {
        const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Wail of the Forgotten");
        return o?.type === "cast" ? (o.modes ?? []) : [];
      };
      expect(modes(setup([]))).toHaveLength(3);
      let s = setup(lands("Swamp", 8));
      const all = modes(s).find((m) => m.label?.split(" + ").length === 3);
      expect(modes(s)).toHaveLength(7);
      s = resolve(
        castCard(s, "p1", "Wail of the Forgotten", {
          mode: all?.index,
          targets: { a: [idOf(s, "p2", "battlefield", "Serra Angel")], b: ["p2"] },
        }),
      );
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(8 + 3);
    });
  });

  describe("peu communes", () => {
    it("Abyssal Gorestalker : chaque joueur sacrifie deux créatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 6), "Bear Cub", "Llanowar Elves", "Colossadactyl"], hand: ["Abyssal Gorestalker"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      s = resolve(castCard(s, "p1", "Abyssal Gorestalker"), choosing([]));
      expect(
        s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature")),
      ).toHaveLength(2);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("Akawalli, the Seething Tower : descente 4, +2/+2 et piétinement ; descente 8, encore +2/+2 et un seul bloqueur", () => {
      const at = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Akawalli, the Seething Tower"], graveyard: lands("Forest", n) } });
        const id = idOf(s, "p1", "battlefield", "Akawalli, the Seething Tower");
        return { pt: pt(s, id), kw: chars(s, id).keywords };
      };
      expect(at(3).pt).toEqual([3, 3]);
      expect(at(3).kw).not.toContain("trample");
      expect(at(4).pt).toEqual([5, 5]);
      expect(at(4).kw).toContain("trample");
      expect(at(8).pt).toEqual([7, 7]);
      // Descente 8 : pas plus d'un bloqueur.
      let s = scenario({
        p1: { battlefield: ["Akawalli, the Seething Tower"], graveyard: lands("Forest", 8) },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      const aka = idOf(s, "p1", "battlefield", "Akawalli, the Seething Tower");
      s = passAccepting(attack(s, [aka]), (x) => x.pending?.kind === "declareBlockers");
      const bears = idsOf(s, "p2", "battlefield", "Bear Cub");
      expect(() =>
        act(s, "p2", { type: "declareBlockers", blocks: bears.map((b) => ({ blocker: b, attacker: aka })) }),
      ).toThrow();
      expect(() =>
        act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bears[0] as string, attacker: aka }] }),
      ).not.toThrow();
    });

    it("Belligerent Yearling : piétinement ; un autre Dinosaure arrive → sa force de base peut devenir celle de ce Dinosaure jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Belligerent Yearling", ...lands("Forest", 4)], hand: ["Hulking Raptor"] } });
      const y = idOf(s, "p1", "battlefield", "Belligerent Yearling");
      expect(chars(s, y).keywords).toContain("trample");
      s = resolve(castCard(s, "p1", "Hulking Raptor"));
      expect(pt(s, y)).toEqual([5, 2]);
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(pt(s, y)).toEqual([3, 2]);
    });

    it("Bloodthorn Flail : +2/+1 ; Équiper en payant {3} ou en défaussant une carte", () => {
      let s = scenario({ p1: { battlefield: ["Bloodthorn Flail", "Bear Cub"], hand: ["Opt"] } });
      const flail = idOf(s, "p1", "battlefield", "Bloodthorn Flail");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Sans mana : seul l'Équiper par défausse est possible.
      expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === flail)).toHaveLength(1);
      s = resolve(
        activateLabel(s, "p1", flail, "défaussez", { targets: { t: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }),
      );
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Calamitous Cave-In : X blessures à chaque créature et planeswalker, X = vos Cavernes plus les cartes de Caverne de votre cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Cavernous Maw"],
          hand: ["Calamitous Cave-In"],
          graveyard: ["Hidden Volcano", "Forest"],
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = cast(s, "Calamitous Cave-In");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    it("Canonized in Blood : descente → un marqueur +1/+1 sur une de vos créatures à votre étape de fin ; {5}{B}{B}, sacrifice : Vampire Démon 4/3 volant", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Canonized in Blood", "Bear Cub", "Llanowar Elves"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
      let s = scenario({ p1: { battlefield: ["Canonized in Blood", ...lands("Swamp", 7)] } });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Canonized in Blood"), "Vampire"));
      expect(idsOf(s, "p1", "graveyard", "Canonized in Blood")).toHaveLength(1);
      expect(pt(s, tokens(s, "p1", "Vampire Demon")[0] as string)).toEqual([4, 3]);
    });

    it("Caparocti Sunborn : en attaquant, engagez deux artefacts et/ou créatures dégagés pour découvrir 3", () => {
      const run = (yes: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Caparocti Sunborn", "Bear Cub", "Nutrient Block"],
            library: ["Forest", "Llanowar Elves", "Island"],
          },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Caparocti Sunborn")]);
        return passAccepting(
          s,
          (x) =>
            !!castNowOf(x) ||
            (x.pending?.kind === "choice" && x.pending.request.type === "yesNo" && !yes) ||
            x.turn.step === "main2",
        );
      };
      const s = run(true);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Llanowar Elves"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Nutrient Block")]?.tapped).toBe(true);
      let no = run(false);
      no = resolve(no, choosing([], false));
      expect(no.players.p1?.library).toHaveLength(3);
      expect(no.objects[idOf(no, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });

    it("Captain Storm, Cosmium Raider : un artefact arrive sous votre contrôle → un marqueur +1/+1 sur un Pirate ciblé que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Captain Storm, Cosmium Raider", "Bear Cub", "Plains"], hand: ["Nutrient Block"] },
      });
      const storm = idOf(s, "p1", "battlefield", "Captain Storm, Cosmium Raider");
      s = resolve(castCard(s, "p1", "Nutrient Block"));
      expect(s.objects[storm]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Careening Mine Cart : équipage 1 ; un Trésor en attaquant", () => {
      let s = scenario({ p1: { battlefield: ["Careening Mine Cart", "Llanowar Elves"] } });
      const cart = idOf(s, "p1", "battlefield", "Careening Mine Cart");
      s = resolve(activateLabel(s, "p1", cart, "Équipage", { tap: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      s = resolve(attack(s, [cart]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Cavernous Maw : {2} : créature 3/3 seulement avec trois autres Cavernes (en jeu ou au cimetière)", () => {
      const can = (battlefield: string[], graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: ["Cavernous Maw", "Forest", "Forest", ...battlefield], graveyard } });
        return canActivate(s, "p1", idOf(s, "p1", "battlefield", "Cavernous Maw"));
      };
      expect(can(["Hidden Volcano"], ["Hidden Nursery", "Hidden Courtyard"])).toBe(true);
      expect(can(["Hidden Volcano"], ["Hidden Nursery"])).toBe(false);
      let s = scenario({
        p1: {
          battlefield: ["Cavernous Maw", "Forest", "Forest"],
          graveyard: ["Hidden Nursery", "Hidden Courtyard", "Hidden Volcano"],
        },
      });
      const maw = idOf(s, "p1", "battlefield", "Cavernous Maw");
      s = resolve(activateLabel(s, "p1", maw, "3/3"));
      expect(pt(s, maw)).toEqual([3, 3]);
      expect(chars(s, maw).subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
    });

    it("Cenote Scout et Kinjalli's Dawnrunner : ils explorent en arrivant (Dawnrunner : double initiative)", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Cenote Scout"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Cenote Scout"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Cenote Scout")]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Kinjalli's Dawnrunner"], library: ["Forest"] } });
      t = resolve(castCard(t, "p1", "Kinjalli's Dawnrunner"));
      const dawn = idOf(t, "p1", "battlefield", "Kinjalli's Dawnrunner");
      expect(chars(t, dawn).keywords).toContain("doubleStrike");
      expect(namesIn(t, t.players.p1?.hand)).toEqual(["Forest"]);
    });

    it("Chupacabra Echo : une créature adverse ciblée −X/−X, X = cartes de permanent de votre cimetière", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Chupacabra Echo"], graveyard: ["Forest", "Bear Cub", "Opt", "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Chupacabra Echo"));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Coati Scavenger : descente 4 → une carte de permanent de votre cimetière revient en main ; sinon rien", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Coati Scavenger"], graveyard } });
        return resolve(castCard(s, "p1", "Coati Scavenger"));
      };
      const yes = run(["Forest", "Island", "Swamp", "Bear Cub", "Opt"]);
      expect(yes.players.p1?.hand).toHaveLength(1);
      expect(namesIn(yes, yes.players.p1?.hand)[0]).not.toBe("Opt");
      const no = run(["Forest", "Island", "Bear Cub", "Opt"]);
      expect(no.players.p1?.hand).toHaveLength(0);
    });

    it("Colossadactyl : portée et piétinement", () => {
      const s = scenario({ p1: { battlefield: ["Colossadactyl"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Colossadactyl")).keywords).toEqual(
        expect.arrayContaining(["reach", "trample"]),
      );
    });

    it("Confounding Riddle : une carte parmi les quatre du dessus, le reste au cimetière ; ou contresort à moins de payer {4}", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Confounding Riddle"],
          library: ["Opt", "Forest", "Island", "Swamp", "Plains"],
        },
      });
      s = resolve(castCard(s, "p1", "Confounding Riddle", { mode: 0 }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(4);
      expect(libraryNames(s)).toEqual(["Plains"]);

      const counter = (p2Lands: number) => {
        let t = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confounding Riddle"] },
          p2: { battlefield: lands("Forest", p2Lands), hand: ["Bear Cub"] },
          active: "p2",
        });
        t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
        t = act(t, "p2", { type: "pass" });
        const spell = t.stack[0]?.id as string;
        t = resolve(castCard(t, "p1", "Confounding Riddle", { mode: 1, targets: { t: [spell] } }));
        return t;
      };
      expect(idsOf(counter(2), "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(counter(6), "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Contested Game Ball : {2}, {T} : piochez et un marqueur de point ; au cinquième, sacrifice et un Trésor", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Contested Game Ball", counters: { point: 4 } }, "Plains", "Plains"],
          library: ["Opt", "Forest"],
        },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Contested Game Ball"), "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Contested Game Ball")).toHaveLength(0);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Contested Game Ball : vous subissez des blessures de combat → le joueur attaquant en prend le contrôle et la dégage", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub"] },
        p2: { battlefield: [{ name: "Contested Game Ball", tapped: true }] },
      });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const ball = s.battlefield.find((id) => nameOf(s, id) === "Contested Game Ball") as string;
      expect(s.objects[ball]?.controller).toBe("p1");
      expect(s.objects[ball]?.tapped).toBe(false);
    });

    it("Contested Game Ball : seulement quand son contrôleur subit des blessures de combat (pas un autre joueur)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub"] },
        p3: { battlefield: [{ name: "Contested Game Ball", tapped: true }] },
      });
      // Bear Cub attaque p2 : p3, qui contrôle la balle, n'est pas blessé.
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(18);
      const ball = s.battlefield.find((id) => nameOf(s, id) === "Contested Game Ball") as string;
      expect(s.objects[ball]?.controller).toBe("p3");
      expect(s.objects[ball]?.tapped).toBe(true);
    });

    it("Council of Echoes : vol ; descente 4 → renvoie jusqu'à un autre permanent non-terrain dans la main de son propriétaire", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: lands("Island", 6), hand: ["Council of Echoes"], graveyard },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(castCard(s, "p1", "Council of Echoes"), choosing([idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      const yes = run(lands("Forest", 4));
      expect(namesIn(yes, yes.players.p2?.hand)).toEqual(["Serra Angel"]);
      expect(chars(yes, idOf(yes, "p1", "battlefield", "Council of Echoes")).keywords).toContain("flying");
      const no = run(lands("Forest", 3));
      expect(idsOf(no, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Dauntless Dismantler : les artefacts adverses arrivent engagés ; {X}{X}{W}, sacrifice : détruit chaque artefact de valeur de mana X", () => {
      let s = scenario({
        p1: { battlefield: ["Dauntless Dismantler"] },
        p2: { battlefield: ["Plains"], hand: ["Nutrient Block"] },
        active: "p2",
      });
      s = resolve(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Nutrient Block") }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Nutrient Block")]?.tapped).toBe(true);
      let t = scenario({
        p1: { battlefield: ["Dauntless Dismantler", ...lands("Plains", 5), "Digsite Conservator"] },
        p2: { battlefield: ["Treasure Map // Treasure Cove", "Hoverstone Pilgrim"] },
      });
      // X = 2 : Treasure Map et Digsite Conservator (VM 2, le vôtre aussi) ; Hoverstone Pilgrim (VM 5) reste.
      t = resolve(activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Dauntless Dismantler"), "Détruisez", { x: 2 }));
      expect(idsOf(t, "p2", "graveyard", "Treasure Map // Treasure Cove")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Hoverstone Pilgrim")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Digsite Conservator")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Dauntless Dismantler")).toHaveLength(1);
    });

    it("Defossilize : une créature revient du cimetière, puis explore deux fois", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 5),
          hand: ["Defossilize"],
          graveyard: ["Bear Cub"],
          library: ["Opt", "Forest", "Island"],
        },
      });
      s = resolve(castCard(s, "p1", "Defossilize", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Opt révélé : un marqueur (laissé dessus ou non) ; puis un terrain ou de nouveau Opt.
      expect((s.objects[bear]?.counters["+1/+1"] ?? 0) + (s.players.p1?.hand.length ?? 0)).toBe(2);
    });

    it("Diamond Pick-Axe : indestructible ; +1/+1 et un Trésor quand la créature équipée attaque", () => {
      let s = scenario({ p1: { battlefield: ["Diamond Pick-Axe", "Bear Cub", "Mountain", "Mountain"] } });
      const axe = idOf(s, "p1", "battlefield", "Diamond Pick-Axe");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, axe).keywords).toContain("indestructible");
      s = resolve(activateLabel(s, "p1", axe, "Équiper", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = resolve(attack(s, [bear]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Digsite Conservator : sacrifice, rituel : exile jusqu'à quatre cartes d'un même cimetière ; en mourant, {4} pour découvrir 4", () => {
      let s = scenario({
        p1: { battlefield: ["Digsite Conservator", ...lands("Forest", 4)], library: ["Island", "Bear Cub"] },
        p2: { graveyard: ["Opt", "Forest"] },
      });
      const dig = idOf(s, "p1", "battlefield", "Digsite Conservator");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === dig);
      expect(opt?.type === "activate" && opt.targets?.[0]?.count).toBe(4);
      s = act(s, "p1", {
        type: "activate",
        source: dig,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: [...(s.players.p2?.graveyard ?? [])] },
      });
      // Le sacrifice est un coût : la découverte (en mourant) se résout avant l'exil.
      s = untilCastNow(s);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      s = resolve(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Dowsing Device : un artefact arrive → une de vos créatures +1/+0 et célérité, puis transformation avec quatre artefacts ; Geode Grotto : +X/+0 et célérité", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dowsing Device // Geode Grotto", "Bear Cub", "Nutrient Block", "Plains", "Plains"],
          hand: ["Nutrient Block", "Nutrient Block"],
        },
      });
      const device = idOf(s, "p1", "battlefield", "Dowsing Device // Geode Grotto");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(castCard(s, "p1", "Nutrient Block"), choosing([bear]));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("haste");
      expect(chars(s, device).name).not.toBe("Geode Grotto");
      s = resolve(castCard(s, "p1", "Nutrient Block"), choosing([bear]));
      expect(chars(s, device).name).toBe("Geode Grotto");

      let t = scenario({
        p1: { battlefield: ["Dowsing Device // Geode Grotto", "Bear Cub", "Nutrient Block", ...lands("Mountain", 3)] },
      });
      const grotto = idOf(t, "p1", "battlefield", "Dowsing Device // Geode Grotto");
      flip(t, grotto);
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", grotto, "+X/+0", { targets: { t: [cub] } }));
      expect(pt(t, cub)).toEqual([3, 2]);
      expect(chars(t, cub).keywords).toContain("haste");
    });

    it("Dreadmaw's Ire : une créature attaquante ciblée +2/+2 et piétinement ; une créature qui n'attaque pas n'est pas une cible légale", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Mountain"], hand: ["Dreadmaw's Ire"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bear]);
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Dreadmaw's Ire");
      expect(o?.type === "cast" && o.modes?.[0]?.targets[0]?.legal).toEqual([bear]);
      s = resolve(castCard(s, "p1", "Dreadmaw's Ire", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
    });

    it("Enterprising Scallywag : descente → un Trésor à votre étape de fin", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Enterprising Scallywag", "Bear Cub"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return tokens(s, "p1", "Treasure").length;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
    });

    it("Explorer's Cache : arrive avec deux marqueurs ; une de vos créatures avec un marqueur +1/+1 meurt → un marqueur ; {T} : déplace un marqueur (rituel)", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Explorer's Cache"] } });
      s = resolve(castCard(s, "p1", "Explorer's Cache"));
      const cache = idOf(s, "p1", "battlefield", "Explorer's Cache");
      expect(s.objects[cache]?.counters["+1/+1"]).toBe(2);
      let t = scenario({
        p1: {
          battlefield: [
            { name: "Explorer's Cache", counters: { "+1/+1": 2 } },
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            "Llanowar Elves",
          ],
        },
      });
      const c = idOf(t, "p1", "battlefield", "Explorer's Cache");
      destroy(t, idOf(t, "p1", "battlefield", "Llanowar Elves"));
      t = flush(t);
      expect(t.objects[c]?.counters["+1/+1"]).toBe(2);
      destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
      t = flush(t);
      expect(t.objects[c]?.counters["+1/+1"]).toBe(3);
      let m = scenario({ p1: { battlefield: [{ name: "Explorer's Cache", counters: { "+1/+1": 2 } }, "Bear Cub"] } });
      const bear = idOf(m, "p1", "battlefield", "Bear Cub");
      m = resolve(
        activateLabel(m, "p1", idOf(m, "p1", "battlefield", "Explorer's Cache"), "Déplacez", { targets: { t: [bear] } }),
      );
      expect(m.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(m.objects[idOf(m, "p1", "battlefield", "Explorer's Cache")]?.counters["+1/+1"]).toBe(1);
    });

    it("Forgotten Monument : vos autres Cavernes ont « {T}, payez 1 PV : un mana de n'importe quelle couleur »", () => {
      let s = scenario({ p1: { battlefield: ["Forgotten Monument", "Hidden Volcano"] } });
      const volcano = idOf(s, "p1", "battlefield", "Hidden Volcano");
      const monument = idOf(s, "p1", "battlefield", "Forgotten Monument");
      const volcanoMana = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === volcano);
      expect(volcanoMana).toHaveLength(2);
      expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === monument)).toHaveLength(1);
      const any = volcanoMana[1];
      s = act(s, "p1", {
        type: "tapForMana",
        source: volcano,
        ability: any?.type === "tapForMana" ? any.ability : -1,
        color: "U",
      });
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Gargantuan Leech : lien de vie ; coûte {1} de moins par Caverne contrôlée et par carte de Caverne du cimetière", () => {
      const can = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Hidden Necropolis", "Hidden Volcano"], hand: ["Gargantuan Leech"], graveyard },
        });
        return castable(s, "p1", idOf(s, "p1", "hand", "Gargantuan Leech"));
      };
      expect(can(["Hidden Nursery", "Hidden Courtyard", "Hidden Cataract", "Cavernous Maw"])).toBe(true);
      expect(can(["Hidden Nursery", "Hidden Courtyard", "Hidden Cataract", "Forest"])).toBe(false);
      const s = scenario({ p1: { battlefield: ["Gargantuan Leech"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Gargantuan Leech")).keywords).toContain("lifelink");
    });

    it("Geological Appraiser : découverte 3 seulement s'il a été lancé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Geological Appraiser"], library: ["Forest", "Bear Cub"] },
      });
      s = untilCastNow(castCard(s, "p1", "Geological Appraiser"));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      let t = scenario({ p1: { hand: ["Geological Appraiser"], library: ["Forest", "Bear Cub"] } });
      moveWithSpec(t, "p1", idOf(t, "p1", "hand", "Geological Appraiser"), { to: "battlefield" });
      t = flush(t);
      expect(t.players.p1?.library).toHaveLength(2);
    });

    it("Glowcap Lantern : la créature équipée explore quand elle attaque ; son contrôleur regarde la carte du dessus", () => {
      let s = scenario({ p1: { battlefield: ["Glowcap Lantern", "Bear Cub", "Forest", "Forest"], library: ["Opt", "Island"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Non attachée, la Lanterne ne donne rien (PLAN-D, D8) ; attachée, la créature équipée a « vous pouvez regarder ».
      expect(playerStatic(s, "p1", "lookAtTopCard")).toBe(false);
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Glowcap Lantern"), "Équiper", { targets: { t: [bear] } }));
      expect(playerStatic(s, "p1", "lookAtTopCard")).toBe(true);
      s = resolve(attack(s, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Grasping Shadows : une créature qui attaque seule gagne contact mortel et lien de vie, marqueur d'effroi ; au troisième, Shadows' Lair", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Grasping Shadows // Shadows' Lair", counters: { dread: 2 } }, "Bear Cub", "Llanowar Elves"],
        },
      });
      const shadows = idOf(s, "p1", "battlefield", "Grasping Shadows // Shadows' Lair");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(attack(s, [bear]));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      expect(chars(s, shadows).name).toBe("Shadows' Lair");
      let two = scenario({ p1: { battlefield: ["Grasping Shadows // Shadows' Lair", "Bear Cub", "Llanowar Elves"] } });
      two = resolve(attack(two, [idOf(two, "p1", "battlefield", "Bear Cub"), idOf(two, "p1", "battlefield", "Llanowar Elves")]));
      expect(two.objects[idOf(two, "p1", "battlefield", "Grasping Shadows // Shadows' Lair")]?.counters.dread ?? 0).toBe(0);
    });

    it("Shadows' Lair : {B}, {T}, retirez un marqueur d'effroi : piochez une carte et perdez 1 PV", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Grasping Shadows // Shadows' Lair", counters: { dread: 1 } }, "Swamp"], library: ["Opt"] },
      });
      const lair = idOf(s, "p1", "battlefield", "Grasping Shadows // Shadows' Lair");
      flip(s, lair);
      s = resolve(activateLabel(s, "p1", lair, "Piochez"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
      expect(canActivate(s, "p1", lair)).toBe(false);
    });

    it("Guardian of the Great Door : coût additionnel, engagez quatre artefacts, créatures et/ou terrains dégagés ; vol", () => {
      const can = (forests: number) => {
        const s = scenario({
          p1: { battlefield: [...lands("Forest", forests), ...lands("Plains", 2)], hand: ["Guardian of the Great Door"] },
        });
        return castable(s, "p1", idOf(s, "p1", "hand", "Guardian of the Great Door"));
      };
      expect(can(4)).toBe(true);
      expect(can(3)).toBe(false);
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Forest", 4)], hand: ["Guardian of the Great Door"] },
      });
      s = resolve(
        castCard(s, "p1", "Guardian of the Great Door", { picks: { costTap: idsOf(s, "p1", "battlefield", "Forest") } }),
      );
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(6);
      expect(chars(s, idOf(s, "p1", "battlefield", "Guardian of the Great Door")).keywords).toContain("flying");
      // Sans choix explicite (PLAN-D, D7) : les permanents engagés par défaut gardent de quoi payer {W}{W}, quel que soit
      // l'ordre des terrains.
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Forest", 4)], hand: ["Guardian of the Great Door"] },
      });
      const guardian = idOf(t, "p1", "hand", "Guardian of the Great Door");
      expect(castable(t, "p1", guardian)).toBe(true);
      t = resolve(castCard(t, "p1", "Guardian of the Great Door"));
      expect(idsOf(t, "p1", "battlefield", "Guardian of the Great Door")).toHaveLength(1);
    });

    it("Helping Hand : une carte de créature de VM 3 ou moins revient engagée", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Helping Hand"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Helping Hand");
      expect(namesIn(s, o?.type === "cast" ? o.modes?.[0]?.targets[0]?.legal : [])).toEqual(["Bear Cub"]);
      s = resolve(castCard(s, "p1", "Helping Hand", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Hermitic Nautilus : vigilance ; {1}{U} : +3/−3", () => {
      let s = scenario({ p1: { battlefield: ["Hermitic Nautilus", "Island", "Island"] } });
      const n = idOf(s, "p1", "battlefield", "Hermitic Nautilus");
      expect(chars(s, n).keywords).toContain("vigilance");
      s = resolve(activateLabel(s, "p1", n, "+3"));
      expect(pt(s, n)).toEqual([4, 1]);
    });

    it("Hoverstone Pilgrim : vol, garde {2} ; {2} : une carte d'un cimetière sous la bibliothèque de son propriétaire", () => {
      let s = scenario({
        p1: { battlefield: ["Hoverstone Pilgrim", "Plains", "Plains"] },
        p2: { graveyard: ["Shivan Dragon"], library: ["Forest"] },
      });
      const pilgrim = idOf(s, "p1", "battlefield", "Hoverstone Pilgrim");
      expect(chars(s, pilgrim).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      s = resolve(activateLabel(s, "p1", pilgrim, "sous", { targets: { t: [idOf(s, "p2", "graveyard", "Shivan Dragon")] } }));
      expect(libraryNames(s, "p2")).toEqual(["Forest", "Shivan Dragon"]);
    });

    it("Hurl into History : contrecarre un sort d'artefact ou de créature, puis découverte X (sa valeur de mana)", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Hurl into History"], library: ["Forest", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shivan Dragon") });
      s = act(s, "p2", { type: "pass" });
      const dragon = s.stack[0]?.id as string;
      s = untilCastNow(castCard(s, "p1", "Hurl into History", { targets: { t: [dragon] } }));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Serra Angel"]);
      // Le sort est déjà contrecarré quand la découverte a lieu.
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      s = resolve(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Itzquinth, Firstborn of Gishath : célérité ; en arrivant, {2} : un de vos Dinosaures inflige sa force à une autre créature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hulking Raptor", "Mountain", "Forest", "Forest", "Forest"],
          hand: ["Itzquinth, Firstborn of Gishath"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const raptor = idOf(s, "p1", "battlefield", "Hulking Raptor");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Itzquinth, Firstborn of Gishath"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        if (req.type !== "pick") return undefined;
        if (req.options.includes(angel) && !req.options.includes(raptor)) return [angel];
        if (
          req.options.includes(raptor) &&
          cur.pending?.kind === "choice" &&
          cur.pending.purpose.kind === "triggerTarget" &&
          cur.pending.purpose.spec === "a"
        )
          return [raptor];
        return req.options.includes(angel) ? [angel] : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Itzquinth, Firstborn of Gishath")).keywords).toContain("haste");
    });

    it("Ixalli's Lorekeeper : son mana ne sert qu'aux sorts de Dinosaure (et capacités de Dinosaures)", () => {
      const s = scenario({ p1: { battlefield: ["Ixalli's Lorekeeper", "Forest"], hand: ["Belligerent Yearling", "Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Belligerent Yearling"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Jade Seedstones : trois marqueurs +1/+1 répartis entre une à trois de vos créatures ; Jadeheart Attendant : PV égaux à la VM de la carte exilée", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"],
          hand: ["Jade Seedstones // Jadeheart Attendant"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = resolve(castCard(s, "p1", "Jade Seedstones // Jadeheart Attendant"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear, elves] : req.type === "divide" ? undefined : undefined,
      );
      const total = (s.objects[bear]?.counters["+1/+1"] ?? 0) + (s.objects[elves]?.counters["+1/+1"] ?? 0);
      expect(total).toBe(3);
      expect(s.objects[bear]?.counters["+1/+1"]).toBeGreaterThan(0);
      expect(s.objects[elves]?.counters["+1/+1"]).toBeGreaterThan(0);

      let t = scenario({
        p1: { battlefield: [...lands("Forest", 7), "Jade Seedstones // Jadeheart Attendant"], graveyard: ["Shivan Dragon"] },
      });
      const stones = idOf(t, "p1", "battlefield", "Jade Seedstones // Jadeheart Attendant");
      t = resolve(activateLabel(t, "p1", stones, "Fabrication", { materials: [idOf(t, "p1", "graveyard", "Shivan Dragon")] }));
      const attendant = t.battlefield.find((id) => chars(t, id).name === "Jadeheart Attendant") as string;
      expect(pt(t, attendant)).toEqual([7, 7]);
      expect(t.players.p1?.life).toBe(26);
    });

    it("Lodestone Needle : flash ; engage un artefact ou une créature et y met deux marqueurs d'étourdissement ; Guidestone Compass : {1}, {T} : une de vos créatures explore", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Island"], hand: ["Lodestone Needle // Guidestone Compass"] },
        p2: { battlefield: ["Serra Angel"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Lodestone Needle // Guidestone Compass"), choosing([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(2);

      let t = scenario({
        p1: { battlefield: ["Lodestone Needle // Guidestone Compass", "Bear Cub", "Island"], library: ["Opt"] },
      });
      const compass = idOf(t, "p1", "battlefield", "Lodestone Needle // Guidestone Compass");
      flip(t, compass);
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", compass, "explore", { targets: { t: [bear] } }));
      expect(t.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Malamet Battle Glyph : marqueur +1/+1 sur votre créature arrivée ce tour-ci, puis combat", () => {
      const run = (sick: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Forest", { name: "Bear Cub", sick }], hand: ["Malamet Battle Glyph"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = resolve(castCard(s, "p1", "Malamet Battle Glyph", { targets: { a: [bear], b: [angel] } }));
        return s.objects[angel]?.damage;
      };
      expect(run(true)).toBe(3);
      // Créature arrivée plus tôt : pas de marqueur, l'Ours inflige 2.
      expect(run(false)).toBe(2);
    });

    it("Malamet War Scribe : en arrivant, vos créatures +2/+1 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Malamet War Scribe"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = resolve(castCard(s, "p1", "Malamet War Scribe"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Malamet War Scribe"))).toEqual([6, 4]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    });

    it("Master's Guide-Mural : un Golem 4/4 blanc et bleu en arrivant ; Master's Manufactory : {T} : un Golem si un artefact est arrivé ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 2)],
          hand: ["Master's Guide-Mural // Master's Manufactory"],
        },
      });
      s = resolve(castCard(s, "p1", "Master's Guide-Mural // Master's Manufactory"));
      const golem = tokens(s, "p1", "Golem")[0] as string;
      expect(pt(s, golem)).toEqual([4, 4]);
      expect(chars(s, golem).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      const t = scenario({
        p1: { battlefield: ["Master's Guide-Mural // Master's Manufactory", "Plains"], hand: ["Nutrient Block"] },
      });
      const factory = idOf(t, "p1", "battlefield", "Master's Guide-Mural // Master's Manufactory");
      flip(t, factory);
      expect(canActivate(t, "p1", factory)).toBe(false);
      const u = resolve(castCard(t, "p1", "Nutrient Block"));
      expect(canActivate(u, "p1", factory)).toBe(true);
    });

    it("Merfolk Cave-Diver : une de vos créatures explore → +1/+0 et imblocable ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Merfolk Cave-Diver", "Forest"], hand: ["Cenote Scout"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Cenote Scout"));
      const diver = idOf(s, "p1", "battlefield", "Merfolk Cave-Diver");
      expect(pt(s, diver)).toEqual([3, 4]);
      expect(chars(s, diver).keywords).toContain("unblockable");
    });

    it("Might of the Ancestors : au début du combat de votre tour, une de vos créatures +2/+0 et vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Might of the Ancestors", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("vigilance");
    });

    it("Nicanzil, Current Conductor : exploration d'un terrain → un terrain de la main engagé ; d'un non-terrain → un marqueur sur Nicanzil", () => {
      const run = (top: string) => {
        let s = scenario({
          p1: { battlefield: ["Nicanzil, Current Conductor", "Forest"], hand: ["Cenote Scout", "Island"], library: [top] },
        });
        s = resolve(castCard(s, "p1", "Cenote Scout"), choosing([idOf(s, "p1", "hand", "Island")]));
        return s;
      };
      const land = run("Swamp");
      expect(land.objects[idOf(land, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(land.objects[idOf(land, "p1", "battlefield", "Nicanzil, Current Conductor")]?.counters["+1/+1"] ?? 0).toBe(0);
      const spell = run("Opt");
      expect(spell.objects[idOf(spell, "p1", "battlefield", "Nicanzil, Current Conductor")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(spell, "p1", "battlefield", "Island")).toHaveLength(0);
    });

    it("Rampaging Ceratops : ne peut être bloqué que par trois créatures ou plus", () => {
      const block = (n: number) => {
        let s = scenario({
          p1: { battlefield: ["Rampaging Ceratops"] },
          p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub"] },
        });
        const cera = idOf(s, "p1", "battlefield", "Rampaging Ceratops");
        s = attack(s, [cera]);
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        const blockers = idsOf(s, "p2", "battlefield", "Bear Cub").slice(0, n);
        return () => act(s, "p2", { type: "declareBlockers", blocks: blockers.map((b) => ({ blocker: b, attacker: cera })) });
      };
      expect(block(2)).toThrow();
      expect(block(3)).not.toThrow();
    });

    it("Ruin-Lurker Bat : vol, lien de vie ; descente → regard 1 à votre étape de fin", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Ruin-Lurker Bat", "Bear Cub"], library: ["Opt", "Forest"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        let scried = false;
        s = advanceUntil(s, (x) => {
          if (x.pending?.kind === "choice" && x.pending.request.intent === "scryBottom") scried = true;
          return x.turn.number > 3;
        });
        return scried;
      };
      expect(run(true)).toBe(true);
      expect(run(false)).toBe(false);
      const s = scenario({ p1: { battlefield: ["Ruin-Lurker Bat"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Ruin-Lurker Bat")).keywords).toEqual(
        expect.arrayContaining(["flying", "lifelink"]),
      );
    });

    it("Scampering Surveyor : un terrain de base ou une carte de Caverne de la bibliothèque, engagé", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Scampering Surveyor"], library: ["Opt", "Hidden Volcano"] },
      });
      s = resolve(castCard(s, "p1", "Scampering Surveyor"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Hidden Volcano")]?.tapped).toBe(true);
    });

    it("Scytheclaw Raptor : un joueur qui lance un sort hors de son tour subit 4 blessures", () => {
      let s = scenario({
        p1: { battlefield: ["Scytheclaw Raptor", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      s = resolve(castCard(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(20);
      s = act(s, "p1", { type: "pass" });
      s = resolve(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Opt") }));
      expect(s.players.p2?.life).toBe(16);
    });

    it("Sinuous Benthisaur : regarde X cartes (Cavernes contrôlées et au cimetière), deux en main, le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), "Hidden Cataract"],
          hand: ["Sinuous Benthisaur"],
          graveyard: ["Hidden Volcano", "Hidden Nursery"],
          library: ["Opt", "Forest", "Bear Cub", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Sinuous Benthisaur"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(libraryNames(s)[0]).toBe("Swamp");
      expect(libraryNames(s)).toHaveLength(2);
    });

    it("Soulcoil Viper : {B}, {T}, sacrifice (rituel) : une carte de créature de votre cimetière revient avec un marqueur de finalité", () => {
      let s = scenario({ p1: { battlefield: ["Soulcoil Viper", "Swamp"], graveyard: ["Shivan Dragon"] } });
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Soulcoil Viper"), "finalité", {
          targets: { t: [idOf(s, "p1", "graveyard", "Shivan Dragon")] },
        }),
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Shivan Dragon")]?.counters.finality).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Soulcoil Viper")).toHaveLength(1);
    });

    it("Spelunking : piochez, puis un terrain de la main sur le champ de bataille (Caverne : +4 PV) ; vos terrains arrivent dégagés", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Spelunking", "Hidden Volcano"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Spelunking"), choosing([idOf(s, "p1", "hand", "Hidden Volcano")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Hidden Volcano")]?.tapped).toBe(false);
      expect(s.players.p1?.life).toBe(24);
      let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Spelunking", "Forest"], library: ["Opt"] } });
      t = resolve(castCard(t, "p1", "Spelunking"), choosing([idOf(t, "p1", "hand", "Forest")]));
      expect(t.players.p1?.life).toBe(20);
    });

    it("Staunch Crewmate : une carte d'artefact ou de Pirate parmi les quatre du dessus en main, le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Island"],
          hand: ["Staunch Crewmate"],
          library: ["Opt", "Enterprising Scallywag", "Bear Cub", "Forest", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Staunch Crewmate"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Enterprising Scallywag"]);
      expect(libraryNames(s)[0]).toBe("Swamp");
    });

    it("Stinging Cave Crawler : contact mortel ; descente 4, en attaquant, piochez et perdez 1 PV", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Stinging Cave Crawler"], graveyard: lands("Forest", n), library: ["Opt"] } });
        s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Stinging Cave Crawler")]));
        return [s.players.p1?.hand.length, s.players.p1?.life];
      };
      expect(run(4)).toEqual([1, 19]);
      expect(run(3)).toEqual([0, 20]);
    });

    it("Sunbird Standard : fabrication avec une ou plusieurs cartes ; Sunbird Effigy : F/E et mana selon les couleurs des cartes exilées", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 5), "Sunbird Standard // Sunbird Effigy"],
          graveyard: ["Bear Cub", "Opt", "Forest"],
        },
      });
      const std = idOf(s, "p1", "battlefield", "Sunbird Standard // Sunbird Effigy");
      s = resolve(
        activateLabel(s, "p1", std, "Fabrication", {
          materials: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Opt")],
        }),
      );
      const effigy = s.battlefield.find((id) => chars(s, id).name === "Sunbird Effigy") as string;
      expect(pt(s, effigy)).toEqual([2, 2]);
      expect(chars(s, effigy).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "haste"]));
      s = resolve(activateLabel(s, "p1", effigy, "mana"));
      expect([s.players.p1?.manaPool.G, s.players.p1?.manaPool.U]).toEqual([1, 1]);
    });

    it("Swashbuckler's Whip : la créature équipée a la portée et « {2}, {T} : engagez un artefact ou une créature »", () => {
      let s = scenario({
        p1: { battlefield: ["Swashbuckler's Whip", "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Swashbuckler's Whip"), "Équiper", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toContain("reach");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activateLabel(s, "p1", bear, "Engagez", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Synapse Necromage : en mourant, deux Champignons 1/1 qui ne peuvent pas bloquer", () => {
      let s = scenario({ p1: { battlefield: ["Synapse Necromage"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Synapse Necromage"));
      s = flush(s);
      const fungi = tokens(s, "p1", "Fungus");
      expect(fungi).toHaveLength(2);
      expect(chars(s, fungi[0] as string).keywords).toContain("cantBlock");
    });

    it("Tendril of the Mycotyrant : sept marqueurs sur un terrain non-créature, qui devient un Champignon 0/0 avec la célérité", () => {
      let s = scenario({ p1: { battlefield: ["Tendril of the Mycotyrant", ...lands("Forest", 8)] } });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Tendril of the Mycotyrant"), "Champignon", {
          targets: { t: [forest] },
        }),
      );
      expect(pt(s, forest)).toEqual([7, 7]);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(chars(s, forest).keywords).toContain("haste");
    });

    it("Triumphant Chomp : blessures égales à 2 ou à la plus grande force parmi vos Dinosaures", () => {
      const run = (mine: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Mountain", ...mine], hand: ["Triumphant Chomp"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = resolve(castCard(s, "p1", "Triumphant Chomp", { targets: { t: [angel] } }));
        return idsOf(s, "p2", "battlefield", "Serra Angel").length ? s.objects[angel]?.damage : "morte";
      };
      expect(run([])).toBe(2);
      expect(run(["Bear Cub"])).toBe(2);
      expect(run(["Hulking Raptor"])).toBe("morte");
    });

    it("Twists and Turns : en arrivant, une de vos créatures explore, précédé d'un regard 1 ; un terrain arrive avec sept terrains → Mycoid Maze", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Twists and Turns // Mycoid Maze"], library: ["Opt", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = resolve(castCard(s, "p1", "Twists and Turns // Mycoid Maze"), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return req.type === "pick" && req.options.includes(bear) ? [bear] : undefined;
      });
      expect(scried).toBe(true);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: ["Twists and Turns // Mycoid Maze", ...lands("Forest", 6)], hand: ["Forest"] } });
      t = resolve(act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") }));
      expect(chars(t, idOf(t, "p1", "battlefield", "Twists and Turns // Mycoid Maze")).name).toBe("Mycoid Maze");
    });

    it("Mycoid Maze : {3}{G}, {T} : une carte de créature parmi les quatre du dessus en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Twists and Turns // Mycoid Maze", ...lands("Forest", 4)],
          library: ["Opt", "Forest", "Bear Cub", "Island", "Swamp"],
        },
      });
      const maze = idOf(s, "p1", "battlefield", "Twists and Turns // Mycoid Maze");
      flip(s, maze);
      s = resolve(activateLabel(s, "p1", maze, "créature"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(libraryNames(s)[0]).toBe("Swamp");
    });

    it("Uchbenbak, the Great Mistake : vigilance, menace ; descente 8, revient du cimetière avec un marqueur de finalité (rituel)", () => {
      const can = (n: number) => {
        const s = scenario({
          p1: {
            battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
            graveyard: ["Uchbenbak, the Great Mistake", ...lands("Forest", n)],
          },
        });
        return canActivate(s, "p1", idOf(s, "p1", "graveyard", "Uchbenbak, the Great Mistake"));
      };
      expect(can(7)).toBe(true);
      expect(can(6)).toBe(false);
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
          graveyard: ["Uchbenbak, the Great Mistake", ...lands("Forest", 7)],
        },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "graveyard", "Uchbenbak, the Great Mistake"), "revient"));
      const u = idOf(s, "p1", "battlefield", "Uchbenbak, the Great Mistake");
      expect(s.objects[u]?.counters.finality).toBe(1);
      expect(chars(s, u).keywords).toEqual(expect.arrayContaining(["vigilance", "menace"]));
    });

    it("Vanguard of the Rose : {1}, sacrifiez une autre créature ou un artefact : indestructible jusqu'à la fin du tour, et engagez-la", () => {
      let s = scenario({ p1: { battlefield: ["Vanguard of the Rose", "Bear Cub", "Plains"] } });
      const v = idOf(s, "p1", "battlefield", "Vanguard of the Rose");
      s = resolve(activateLabel(s, "p1", v, "Indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(chars(s, v).keywords).toContain("indestructible");
      expect(s.objects[v]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Visage of Dread : l'adversaire ciblé révèle sa main, vous choisissez une carte d'artefact ou de créature qu'il défausse ; Dread Osseosaur : menace, meule 2 en arrivant ou en attaquant", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Swamp"], hand: ["Visage of Dread // Dread Osseosaur"] },
        p2: { hand: ["Shivan Dragon", "Bear Cub", "Opt"] },
      });
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: (string | undefined)[] = [];
      let chooser = "";
      s = resolve(castCard(s, "p1", "Visage of Dread // Dread Osseosaur"), (req, player, cur) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        options = namesIn(cur, req.options);
        chooser = player;
        return [bear];
      });
      expect(chooser).toBe("p1");
      expect(options.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);

      let t = scenario({ p1: { battlefield: ["Visage of Dread // Dread Osseosaur"], library: ["Opt", "Forest", "Island"] } });
      const osseo = idOf(t, "p1", "battlefield", "Visage of Dread // Dread Osseosaur");
      flip(t, osseo);
      expect(chars(t, osseo).keywords).toContain("menace");
      t = resolve(attack(t, [osseo]), choosing([], true));
      expect(t.players.p1?.graveyard).toHaveLength(2);
    });

    it("Waterlogged Hulk : {T} : meulez une carte ; Watertight Gondola : vigilance, imblocable avec descente 8", () => {
      let s = scenario({ p1: { battlefield: ["Waterlogged Hulk // Watertight Gondola"], library: ["Opt", "Forest"] } });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Waterlogged Hulk // Watertight Gondola"), "Meulez"));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      const at = (n: number) => {
        const t = scenario({ p1: { battlefield: ["Waterlogged Hulk // Watertight Gondola"], graveyard: lands("Forest", n) } });
        const g = idOf(t, "p1", "battlefield", "Waterlogged Hulk // Watertight Gondola");
        flip(t, g);
        return chars(t, g).keywords;
      };
      expect(at(8)).toEqual(expect.arrayContaining(["unblockable", "vigilance"]));
      expect(at(7)).not.toContain("unblockable");
    });

    it("Zoetic Glyph : l'artefact enchanté est un Golem 5/4 ; mis au cimetière depuis le champ de bataille → découverte 3", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Nutrient Block"], hand: ["Zoetic Glyph"], library: ["Forest", "Bear Cub"] },
      });
      const block = idOf(s, "p1", "battlefield", "Nutrient Block");
      s = resolve(castCard(s, "p1", "Zoetic Glyph", { targets: { enchant: [block] } }));
      expect(pt(s, block)).toEqual([5, 4]);
      expect(chars(s, block).subtypes).toContain("Golem");
      destroy(s, idOf(s, "p1", "battlefield", "Zoetic Glyph"));
      s = untilCastNow(s);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
    });

    it("Zoyowa Lava-Tongue : contact mortel ; descente → chaque adversaire défausse ou sacrifie, sinon 3 blessures", () => {
      const run = (hand: string[], descended = true) => {
        let s = scenario({ p1: { battlefield: ["Zoyowa Lava-Tongue", "Bear Cub"] }, p2: { hand } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3 || x.turn.step === "cleanup");
        return s;
      };
      expect(run([]).players.p2?.life).toBe(17);
      // L'adversaire défausse (réponse suggérée) : pas de blessures.
      const paid = run(["Opt"]);
      expect([paid.players.p2?.life, namesIn(paid, paid.players.p2?.graveyard)]).toEqual([20, ["Opt"]]);
      expect(run([], false).players.p2?.life).toBe(20);
    });

    it("Zoyowa's Justice : le propriétaire mélange l'artefact ou la créature de VM 1 ou plus dans sa bibliothèque, puis découvre X", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain"], hand: ["Zoyowa's Justice"] },
        p2: { battlefield: ["Serra Angel"], library: ["Forest", "Bear Cub", "Island"] },
      });
      s = resolve(castCard(s, "p1", "Zoyowa's Justice", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      // La découverte (VM 5) trouve Bear Cub ou l'Ange mélangé ; refusée, la carte va en main.
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(3);
    });

    it("Zoyowa's Justice : une créature volée retourne chez son propriétaire, et c'est lui qui découvre", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain"], hand: ["Zoyowa's Justice"], library: ["Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel"], library: ["Forest", "Bear Cub", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      steal(s, angel, "p1");
      s = resolve(castCard(s, "p1", "Zoyowa's Justice", { targets: { t: [angel] } }));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(3);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

describe("Sunfire Torch (lot K8)", () => {
  it("la créature équipée attaque : en sacrifiant la Torche, elle inflige 2 blessures à n'importe quelle cible", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Sunfire Torch"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const torch = idOf(s, "p1", "battlefield", "Sunfire Torch");
    (s.objects[torch] as { attachedTo?: string }).attachedTo = bear;
    s.version += 1;
    s = attack(s, [bear]);
    for (let i = 0; i < 30 && !(s.turn.step === "main2"); i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values:
            p.request.type === "yesNo"
              ? [1]
              : p.request.type === "pick" && p.request.options.includes("p2")
                ? ["p2"]
                : p.request.suggested,
        });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    expect(idsOf(s, "p1", "graveyard", "Sunfire Torch")).toHaveLength(1);
    // 2 blessures de la capacité réflexive, puis 2 de combat (la Torche partie, l'Ours n'a plus +1/+0).
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("Blessures à chaque créature et chaque planeswalker (lot K8)", () => {
  it("Calamitous Cave-In : X blessures (Cavernes) à chaque créature et à chaque planeswalker", () => {
    const walker = customCard({
      name: "Arpenteur d'essai",
      typeLine: "Legendary Planeswalker — Test",
      types: ["Planeswalker"],
      supertypes: ["Legendary"],
      loyalty: 5,
    });
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Captivating Cave", "Cavernous Maw"], hand: ["Calamitous Cave-In"] },
      p2: { battlefield: ["Serra Angel", walker] },
    });
    const wId = idOf(s, "p2", "battlefield", walker.name);
    s = cast(s, "Calamitous Cave-In");
    // Deux Cavernes : 2 blessures ; le planeswalker perd 2 marqueurs de loyauté.
    expect(s.objects[wId]?.counters.loyalty).toBe(3);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
  });
});

describe("Iceberg Titan (lot D1)", () => {
  it("en attaquant : vous pouvez engager ou dégager l'artefact ou la créature ciblée (choisi à la résolution)", () => {
    const run = (yes: boolean) => {
      // Le verso de Inverted Iceberg, posé tel quel sur le champ de bataille.
      const titan = card("Inverted Iceberg // Iceberg Titan").faceDefs?.[1];
      if (!titan) throw new Error("verso introuvable");
      let s = scenario({ p1: { battlefield: [titan] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, [idOf(s, "p1", "battlefield", titan.name)]);
      let modes = 0;
      for (let i = 0; i < 20 && s.turn.step === "declareAttackers"; i++) {
        const p = s.pending;
        if (p?.kind === "choice") {
          if (p.request.type === "pick" && p.request.intent === "triggerMode") modes++;
          const values =
            p.request.type === "yesNo"
              ? [yes ? 1 : 0]
              : p.request.type === "pick" && p.request.options.includes(angel)
                ? [angel]
                : p.request.suggested;
          s = act(s, p.player, { type: "choose", values });
        } else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else break;
      }
      return { tapped: s.objects[angel]?.tapped, modes };
    };
    expect(run(true)).toEqual({ tapped: true, modes: 0 });
    expect(run(false).tapped).toBe(false);
  });
});

describe("PLAN-A A3 : « avec X marqueurs +1/+1 supplémentaires » posés à l'arrivée (614.1c)", () => {
  /** Témoin : « chaque fois qu'un permanent arrive avec un marqueur +1/+1, vous gagnez 1 PV ». */
  const WATCHER = customCard({
    name: "Témoin des marqueurs",
    typeLine: "Enchantment",
    types: ["Enchantment"],
    abilities: [triggered(when.enters({ withCounter: "+1/+1" }), [fx.gainLife(1)], { label: "Arrive avec un marqueur : 1 PV" })],
  });

  it("Abuelo's Awakening : le permanent arrive avec ses X marqueurs (déclenche « arrive avec un marqueur »)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), WATCHER], hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block"] },
    });
    s = resolve(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Abuelo's Awakening"),
        x: 2,
        targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] },
      }),
    );
    const block = idOf(s, "p1", "battlefield", "Nutrient Block");
    expect(s.objects[block]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p1?.life).toBe(21);
  });
});
