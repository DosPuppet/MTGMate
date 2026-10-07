/** Jurassic World Collection (REX) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { destroy, drawCards } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { canBlock } from "../src/turn";
import { act, advanceUntil, attack, customCard, idOf, idsOf, lands, nameOf, scenario, settle, throughCombat } from "./helpers";

type S = ReturnType<typeof scenario>;
const castIt = (s: S, name: string, extra: object = {}) =>
  act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

describe("Jurassic World Collection", () => {
  it("Don't Move : détruit les créatures engagées ; jusqu'à votre prochain tour, une créature engagée est détruite", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Don't Move"] },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Llanowar Elves", "Forest"] },
    });
    s = settle(castIt(s, "Don't Move"));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "pass" }));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(act(s, "p2", { type: "tapForMana", source: idOf(s, "p2", "battlefield", "Llanowar Elves"), ability: 0 }));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Spitting Dilophosaurus : les créatures adverses avec un marqueur −1/−1 ne bloquent pas", () => {
    let s = scenario({
      p1: { battlefield: ["Spitting Dilophosaurus", "Bear Cub"] },
      p2: { battlefield: [{ name: "Shivan Dragon", counters: { "-1/-1": 1 } }] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(canBlock(s, idOf(s, "p2", "battlefield", "Shivan Dragon"), cub)).toBe(false);
  });

  it("Life Finds a Way : une créature non-jeton de force 4 ou plus arrive, peuplez", () => {
    let s = scenario({
      p1: { battlefield: ["Life Finds a Way", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Dragon Fodder"] },
    });
    s = settle(castIt(s, "Dragon Fodder"));
    s = settle(castIt(s, "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(3);
  });

  it("Savage Order : sacrifiez une créature de force 4 ; un Dinosaure de la bibliothèque, indestructible", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Shivan Dragon"], hand: ["Savage Order"], library: ["Polyraptor", "Forest"] },
    });
    s = settle(castIt(s, "Savage Order", { sacrifice: [idOf(s, "p1", "battlefield", "Shivan Dragon")] }));
    const raptor = idOf(s, "p1", "battlefield", "Polyraptor");
    expect(raptor).toBeDefined();
    destroy(s, raptor);
    expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(1);
  });

  it("Compy Swarm : à votre étape de fin, si une créature est morte, un jeton copie engagé", () => {
    let s = scenario({ p1: { battlefield: ["Compy Swarm", "Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Compy Swarm")).toHaveLength(2);
  });

  it("Ravenous Tyrannosaurus : en attaquant, blessures égales à sa force ; l'excès au contrôleur", () => {
    let s = scenario({ p1: { battlefield: ["Ravenous Tyrannosaurus"] }, p2: { battlefield: ["Bear Cub"] } });
    const rex = idOf(s, "p1", "battlefield", "Ravenous Tyrannosaurus");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = throughCombat(attack(s, [rex]), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // 4 blessures en excès (6 − 2), puis 6 de combat.
    expect(s.players.p2?.life).toBe(10);
  });

  it("Permission Denied : contrecarre un sort non-créature ; les adversaires n'en lancent plus ce tour-ci", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Island"], hand: ["Permission Denied"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    s = settle(castIt(s, "Permission Denied", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.pending?.kind === "priority" && s.pending.player === "p2").toBe(true);
  });

  describe("G4e : sous-lot difficile", () => {
    it("Grim Giganotosaurus : monstruosité 10, moins chère par créature adverse de force 4 ; détruit les autres artefacts et créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Giganotosaurus", ...lands("Swamp", 6), ...lands("Forest", 5), "Bear Cub"] },
        p2: { battlefield: ["Shivan Dragon", "Mana Crypt"] },
      });
      const giga = idOf(s, "p1", "battlefield", "Grim Giganotosaurus");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === giga);
      s = settle(act(s, "p1", { type: "activate", source: giga, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect(s.objects[giga]?.counters["+1/+1"]).toBe(10);
      expect(
        s.battlefield.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land")).map((id) => nameOf(s, id)),
      ).toEqual(["Grim Giganotosaurus"]);
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === giga)).toBe(false);
    });

    it("Indoraptor : soif de sang, autant de marqueurs que de blessures infligées aux adversaires ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Swamp"], hand: ["Shock", "Indoraptor, the Perfect Hybrid"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indoraptor, the Perfect Hybrid") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Indoraptor, the Perfect Hybrid")]?.counters["+1/+1"]).toBe(2);
    });

    it("Henry Wu : vos Humains exploitent ; exploiter une créature non-Humain fait piocher (et un Trésor si force 3)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Henry Wu, InGen Geneticist", "Shivan Dragon", ...lands("Plains", 2)],
          hand: ["Soul Warden"],
          library: lands("Plains", 5),
        },
      });
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Soul Warden") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand.length).toBeGreaterThanOrEqual(1);
    });
  });
  describe("G4e : combat", () => {
    it("Swooping Pteranodon : prend une créature adverse jusqu'à la fin du tour ; à l'étape de fin, un terrain lui inflige 3", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Swooping Pteranodon"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Swooping Pteranodon"), (req) =>
        req.type === "pick" && req.options.includes(cub) ? [cub] : undefined,
      );
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.objects[cub]?.tapped).toBe(false);
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Owen Grady et Blue : partenaires ; marqueur au choix sur un Dinosaure ; vos Dinosaures arrivent avec les marqueurs de Blue", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), "Forest", "Polyraptor"],
          hand: ["Owen Grady, Raptor Trainer"],
          library: ["Blue, Loyal Raptor", "Forest"],
        },
      });
      s = settle(castIt(s, "Owen Grady, Raptor Trainer"), (req) =>
        req.type === "pick" && req.options.includes("p1") ? ["p1"] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Blue, Loyal Raptor")).toHaveLength(1);
      const raptor = idOf(s, "p1", "battlefield", "Polyraptor");
      const owen = idOf(s, "p1", "battlefield", "Owen Grady, Raptor Trainer");
      // Owen vient d'arriver : comme s'il était là depuis le début du tour ({T} sans mal d'invocation).
      (s.objects[owen] as { controlledSince: number }).controlledSince = 0;
      s = settle(act(s, "p1", { type: "activate", source: owen, ability: 1, targets: { t: [raptor] } }), (req) =>
        req.type === "pick" && req.options.includes("2") ? ["2"] : undefined,
      );
      expect(s.objects[raptor]?.counters.trample).toBe(1);
      expect(chars(s, raptor).keywords).toContain("trample");

      const dino = customCard({ name: "Dino de test", types: ["Creature"], subtypes: ["Dinosaur"], power: 1, toughness: 1 });
      let t = scenario({
        p1: { battlefield: [{ name: "Blue, Loyal Raptor", counters: { flying: 1, "+1/+1": 2 } }], hand: [dino] },
      });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Dino de test") }));
      const d = idOf(t, "p1", "battlefield", "Dino de test");
      expect(t.objects[d]?.counters).toMatchObject({ flying: 1, "+1/+1": 1 });
    });
  });
  describe("G4e : lancer autrement", () => {
    it("Cresting Mosasaurus : émerger (sacrifice, coût réduit de sa VM) ; lancée, renvoie les non-Dinosaures", () => {
      let s = scenario({
        p1: { battlefield: ["Shivan Dragon", "Island"], hand: ["Cresting Mosasaurus"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Cresting Mosasaurus", { alternative: true }));
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Cresting Mosasaurus")).toHaveLength(1);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Hunting Velociraptor : maraude {2}{R} pour vos Dinosaures après des blessures de combat d'un Dinosaure", () => {
      let s = scenario({
        p1: { battlefield: ["Hunting Velociraptor", ...lands("Mountain", 3)], hand: ["Polyraptor"] },
      });
      const poly = idOf(s, "p1", "hand", "Polyraptor");
      const alt = () => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === poly);
      expect(alt()).toBeUndefined();
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Hunting Velociraptor")]));
      const o = alt();
      expect(o?.type === "cast" && o.altAvailable).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: poly, alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(1);
    });
  });
  describe("G4e : exil et copies", () => {
    it("Dino DNA : exile une carte de créature d'un cimetière ; {6} : une copie Dinosaure vert 6/6 avec le piétinement", () => {
      let s = scenario({ p1: { battlefield: ["Dino DNA", ...lands("Forest", 7)] }, p2: { graveyard: ["Bear Cub"] } });
      const dna = idOf(s, "p1", "battlefield", "Dino DNA");
      s = settle(
        act(s, "p1", { type: "activate", source: dna, ability: 0, targets: { t: [idOf(s, "p2", "graveyard", "Bear Cub")] } }),
      );
      const cub = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect(s.objects[dna]?.linked).toContain(cub);
      s = settle(act(s, "p1", { type: "activate", source: dna, ability: 1, targets: { t: [cub] } }));
      const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, token)).toMatchObject({ name: "Bear Cub", power: 6, toughness: 6, colors: ["G"], subtypes: ["Dinosaur"] });
      expect(chars(s, token).keywords).toContain("trample");
    });
  });
  describe("G4e : dernières cartes", () => {
    it("Ian Malcolm : la deuxième pioche exile la carte du dessus ; les autres joueurs peuvent la lancer pendant leur tour", () => {
      let s = scenario({
        p1: { battlefield: ["Ian Malcolm, Chaotician", "Mountain"], library: lands("Island", 3) },
        p2: { library: ["Forest", "Forest", "Shock"] },
      });
      drawCards(s, "p2", 2);
      s = settle(s);
      const shock = s.exile.find((id) => nameOf(s, id) === "Shock") as string;
      expect(shock).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Indominus Rex : défausse de créatures, un marqueur par capacité trouvée, et une carte piochée pour chacun", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), ...lands("Island", 2)],
          hand: ["Indominus Rex, Alpha", "Shivan Dragon", "Llanowar Elves"],
          library: lands("Forest", 3),
        },
      });
      const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indominus Rex, Alpha") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      const rex = idOf(s, "p1", "battlefield", "Indominus Rex, Alpha");
      expect(s.objects[rex]?.counters.flying).toBe(1);
      expect(chars(s, rex).keywords).toContain("flying");
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Llanowar Elves"]);
    });
  });
  describe("G4e : dernières cartes (2)", () => {
    it("Welcome to . . . // Jurassic Park : Mur 0/4, Dinosaure 3/3, puis les Murs sont détruits et la Saga revient en terrain", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3)], hand: ["Welcome to . . . // Jurassic Park"], library: lands("Forest", 5) },
        p2: { battlefield: ["Mana Crypt"] },
      });
      const crypt = idOf(s, "p2", "battlefield", "Mana Crypt");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Welcome to . . . // Jurassic Park") }), (req) =>
        req.type === "pick" && req.options.includes(crypt) ? [crypt] : undefined,
      );
      expect(chars(s, crypt)).toMatchObject({ power: 0, toughness: 4 });
      expect(chars(s, crypt).subtypes).toContain("Wall");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 5);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Dinosaur")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 7);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Mana Crypt")).toHaveLength(1);
      const park = s.battlefield.find((id) => chars(s, id).name === "Jurassic Park");
      expect(park).toBeDefined();
    });

    it("Welcome to . . . (chapitre I) : jusqu'à un artefact non-créature par adversaire, jamais deux du même", () => {
      const base = () =>
        scenario({
          players: 3,
          p1: { battlefield: lands("Forest", 3), hand: ["Welcome to . . . // Jurassic Park"] },
          p2: { battlefield: ["Mana Crypt", "Mana Crypt"] },
          p3: { battlefield: ["Mana Crypt"] },
        });
      let s = base();
      const [a2, b2] = idsOf(s, "p2", "battlefield", "Mana Crypt") as [string, string];
      const c3 = idOf(s, "p3", "battlefield", "Mana Crypt");
      const saga = "Welcome to . . . // Jurassic Park";
      let t = castIt(base(), saga);
      for (let i = 0; i < 10 && t.pending?.kind === "priority"; i++) t = act(t, t.pending.player, { type: "pass" });
      const p = t.pending;
      expect(p?.kind === "choice" && p.request.type === "pick" && p.request.max).toBe(2);
      expect(() => act(t, "p1", { type: "choose", values: [a2, b2] })).toThrow();
      s = settle(castIt(s, saga), (req) => (req.type === "pick" && req.options.includes(c3) ? [a2, c3] : undefined));
      for (const id of [a2, c3]) expect(chars(s, id)).toMatchObject({ power: 0, toughness: 4 });
      expect(chars(s, b2).types).not.toContain("Creature");
    });
  });
});

describe("Jurassic World Collection : adversaire choisi au hasard (PLAN-H H4)", () => {
  it("Indoraptor : rage, un seul adversaire tiré au hasard subit les blessures (aucune question)", () => {
    let s = scenario({
      players: 3,
      p1: {
        battlefield: [{ name: "Indoraptor, the Perfect Hybrid", counters: { "+1/+1": 2 } }, "Mountain"],
        hand: ["Shock"],
      },
    });
    const raptor = idOf(s, "p1", "battlefield", "Indoraptor, the Perfect Hybrid");
    let asked = 0;
    s = settle(castIt(s, "Shock", { targets: { t: [raptor] } }), (req) => {
      if (req.type === "pick" && req.options.includes("p2") && req.options.includes("p3")) asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    const power = chars(s, raptor).power;
    expect(power).toBe(5);
    const lost = [20 - (s.players.p2?.life ?? 0), 20 - (s.players.p3?.life ?? 0)].sort((a, b) => a - b);
    expect(lost).toEqual([0, power]);
  });
});
