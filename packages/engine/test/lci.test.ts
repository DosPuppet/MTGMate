/**
 * The Lost Caverns of Ixalan : jetons Carte, Descente (4 et 8, descente profonde, « descendu ce tour-ci »),
 * Découverte, mana des Cavernes, terrains « Restless », transformation (Treasure Map), exil au lieu de mourir.
 */

import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { amount } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars, untapObject } from "../src/state";
import { countTurnEvents } from "../src/turnlog";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  settle as resolve,
  scenario,
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
});
