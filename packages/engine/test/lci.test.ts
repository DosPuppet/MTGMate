/**
 * The Lost Caverns of Ixalan : jetons Carte, Descente (4 et 8, descente profonde, « descendu ce tour-ci »),
 * Découverte, mana des Cavernes, terrains « Restless », transformation (Treasure Map), exil au lieu de mourir.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

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
    expect(s.players.p1?.turnStats.descended).toBe(1);
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
      expect(s.players.p1?.turnStats.redNoncombatDamage).toBe(4);
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
});
