import { describe, expect, it } from "vitest";
import { fx, ref, spell, target, triggered, when } from "../src/dsl";
import { act, customCard, idOf, idsOf, passAccepting, passBoth, passUntil, scenario } from "./helpers";

const KILL = customCard({
  name: "Meurtre",
  typeLine: "Instant",
  types: ["Instant"],
  spell: spell([target.creature()], [fx.destroy(ref.target())]),
});
/** « Chaque fois qu'une autre créature que vous contrôlez meurt, vous gagnez 1 point de vie. » */
const WATCHER = customCard({
  name: "Veilleur",
  power: 1,
  toughness: 1,
  abilities: [triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)])],
});
/** « Au début de chaque étape de fin, vous gagnez 1 point de vie. » */
const CLOCK = customCard({
  name: "Horloge",
  power: 0,
  toughness: 1,
  abilities: [triggered(when.eachEndStep, [fx.gainLife(1)])],
});

const cast = (s: ReturnType<typeof scenario>, p: string, name: string, targets?: Record<string, string[]>) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), targets });

describe("capacités déclenchées", () => {
  it("arrivée en jeu avec cible : Viashino Pyromancer (le contrôleur choisit le joueur)", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Viashino Pyromancer"] } });
    s = cast(s, "p1", "Viashino Pyromancer");
    s = passBoth(s);
    // La capacité cible « un joueur » : deux choix possibles, la question est posée (suggestion : l'adversaire).
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("triggerTarget");
    expect(p?.kind === "choice" && p.request.suggested).toEqual(["p2"]);
    s = act(s, "p1", { type: "choose", values: ["p2"] });
    expect(s.stack).toHaveLength(1);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
  });

  it("arrivée et mort : Pelakka Wurm fait gagner 7 puis piocher", () => {
    let s = scenario({
      p1: { battlefield: Array(7).fill("Forest"), hand: ["Pelakka Wurm"] },
      p2: { battlefield: ["Swamp", "Swamp"], hand: [KILL] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = passBoth(s); // le Wurm arrive, son déclenchement va sur la pile
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(27);
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Meurtre"), targets: { t: [wurm] } });
    s = passBoth(s); // Meurtre : le Wurm meurt, « piochez une carte » se déclenche
    expect(s.stack).toHaveLength(1);
    const hand = s.players.p1?.hand.length ?? 0;
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
  });

  it("regard en arrière : deux morts simultanées déclenchent le veilleur mort en même temps", () => {
    // Les blessures marquées sont mortelles : les deux créatures meurent par la même action basée sur l'état.
    let s = scenario({
      p1: {
        battlefield: [
          { name: WATCHER, damage: 1 },
          { name: "Bear Cub", damage: 2 },
        ],
      },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.players.p1?.life !== 20);
    expect(s.players.p1?.life).toBe(21);
  });

  it("raid : Gorehorn Raider ne se déclenche que si l'on a attaqué", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain"), hand: ["Gorehorn Raider"] } });
    s = cast(s, "p1", "Gorehorn Raider");
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    expect(s.pending?.kind).toBe("priority");

    let t = scenario({ step: "main2", p1: { battlefield: Array(5).fill("Mountain"), hand: ["Gorehorn Raider"] } });
    t = { ...t, turn: { ...t.turn, attacked: true } };
    t = cast(t, "p1", "Gorehorn Raider");
    t = passBoth(t);
    expect(t.pending?.kind).toBe("choice"); // cible de « 2 blessures à n'importe quelle cible »
    t = act(t, "p1", { type: "choose", values: ["p2"] });
    t = passBoth(t);
    expect(t.players.p2?.life).toBe(18);
  });

  it("sort lancé : Guttersnipe inflige 2 avant même la résolution du sort", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Guttersnipe"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { t: ["p2"] });
    // Le déclenchement se met sur la pile au-dessus de Burst Lightning.
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("landfall : Elfsworn Giant crée un jeton quand on joue un terrain", () => {
    let s = scenario({ p1: { battlefield: ["Elfsworn Giant"], hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Elf Warrior")).toHaveLength(1);
  });

  it("plusieurs déclenchements d'un joueur : il choisit leur ordre", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Forest", "Impact Tremors", "Impact Tremors"], hand: ["Bear Cub"] },
    });
    s = cast(s, "p1", "Bear Cub");
    s = passBoth(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("triggerOrder");
    expect(p?.kind === "choice" && p.request.autoOk).toBe(true);
    s = act(s, "p1", { type: "choose", values: p?.kind === "choice" ? [...p.request.suggested].reverse() : [] });
    expect(s.stack).toHaveLength(2);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(18);
  });

  it("APNAP : les déclenchements du joueur actif vont sur la pile en premier et se résolvent en dernier", () => {
    let s = scenario({ step: "main2", p1: { battlefield: [CLOCK] }, p2: { battlefield: [CLOCK] } });
    s = passUntil(s, (x) => x.turn.step === "end" && x.stack.length === 2);
    expect(s.stack.map((x) => x.controller)).toEqual(["p1", "p2"]);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(21);
    expect(s.players.p1?.life).toBe(20);
  });

  it("603.4 : une condition « si… » redevenue fausse à la résolution annule l'effet", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Llanowar Elves"], hand: ["Dwynen's Elite"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = cast(s, "p1", "Dwynen's Elite");
    s = passBoth(s); // l'Élite arrive ; on contrôle un autre elfe : le déclenchement va sur la pile
    expect(s.stack).toHaveLength(1);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [elves] } });
    s = passBoth(s); // les elfes meurent
    s = passBoth(s); // le déclenchement se résout : plus d'autre elfe, pas de jeton
    expect(idsOf(s, "p1", "battlefield", "Elf Warrior")).toHaveLength(0);
  });

  it("condition fausse au déclenchement : rien ne se déclenche (Searslicer sans attaque)", () => {
    let s = scenario({ step: "main2", p1: { battlefield: ["Searslicer Goblin"] } });
    s = passUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(0);
  });
});
