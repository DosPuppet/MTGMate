import { describe, expect, it } from "vitest";
import { fx, ref, spell, target, triggered, when } from "../src/dsl";
import { act, customCard, idOf, idsOf, passAccepting, passBoth, passUntil, scenario } from "./helpers";

const KILL = customCard({
  name: "Test Murder",
  typeLine: "Instant",
  types: ["Instant"],
  spell: spell([target.creature()], [fx.destroy(ref.target())]),
});
/** "Whenever another creature you control dies, you gain 1 life." */
const WATCHER = customCard({
  name: "Watcher",
  power: 1,
  toughness: 1,
  abilities: [triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)])],
});
/** "At the beginning of each end step, you gain 1 life." */
const CLOCK = customCard({
  name: "Clock",
  power: 0,
  toughness: 1,
  abilities: [triggered(when.eachEndStep, [fx.gainLife(1)])],
});

/** "Whenever another creature you control dies, you may gain 1 life. Do this only once each turn." */
const ONCE_WATCHER = customCard({
  name: "Sober Watcher",
  power: 1,
  toughness: 1,
  abilities: [
    triggered(
      when.dies({ types: ["Creature"], controller: "you", other: true }),
      [...fx.may("Gagner 1 PV ?", fx.gainLife(1), fx.doneOncePerTurn)],
      { oncePerTurn: "ifDone" },
    ),
  ],
});

const cast = (s: ReturnType<typeof scenario>, p: string, name: string, targets?: Record<string, string[]>) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), targets });

describe("triggered abilities", () => {
  it("enters with a target: Viashino Pyromancer (the controller chooses the player)", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Viashino Pyromancer"] } });
    s = cast(s, "p1", "Viashino Pyromancer");
    s = passBoth(s);
    // The ability targets "a player": two possible choices, the question is asked (suggestion: the opponent).
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("triggerTarget");
    expect(p?.kind === "choice" && p.request.suggested).toEqual(["p2"]);
    s = act(s, "p1", { type: "choose", values: ["p2"] });
    expect(s.stack).toHaveLength(1);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
  });

  it("enters and dies: Pelakka Wurm gains 7 then draws", () => {
    let s = scenario({
      p1: { battlefield: Array(7).fill("Forest"), hand: ["Pelakka Wurm"] },
      p2: { battlefield: ["Swamp", "Swamp"], hand: [KILL] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = passBoth(s); // the Wurm enters, its trigger goes on the stack
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(27);
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Murder"), targets: { t: [wurm] } });
    s = passBoth(s); // Test Murder: the Wurm dies, "draw a card" triggers
    expect(s.stack).toHaveLength(1);
    const hand = s.players.p1?.hand.length ?? 0;
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
  });

  it("leaves-the-battlefield look back: two simultaneous deaths trigger the dead watcher at the same time", () => {
    // The marked damage is lethal: both creatures die from the same state-based action.
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

  it('"do this only once each turn": two triggers on the stack, the second does nothing once the effect is done', () => {
    let s = scenario({
      p1: {
        battlefield: [ONCE_WATCHER, { name: "Bear Cub", damage: 2 }, { name: "Llanowar Elves", damage: 1 }],
      },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.players.p1?.life !== 20);
    expect(s.players.p1?.life).toBe(21);
  });

  it("raid: Gorehorn Raider only triggers if you attacked", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain"), hand: ["Gorehorn Raider"] } });
    s = cast(s, "p1", "Gorehorn Raider");
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    expect(s.pending?.kind).toBe("priority");

    let t = scenario({ step: "main2", p1: { battlefield: Array(5).fill("Mountain"), hand: ["Gorehorn Raider"] } });
    // Raid: an attack this turn (turn log).
    t = {
      ...t,
      turnLog: [...t.turnLog, { e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: [] }],
      version: t.version + 1,
    };
    t = cast(t, "p1", "Gorehorn Raider");
    t = passBoth(t);
    expect(t.pending?.kind).toBe("choice"); // target of "2 damage to any target"
    t = act(t, "p1", { type: "choose", values: ["p2"] });
    t = passBoth(t);
    expect(t.players.p2?.life).toBe(18);
  });

  it("spell cast: Guttersnipe deals 2 before the spell even resolves", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Guttersnipe"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { t: ["p2"] });
    // The trigger goes on the stack above Burst Lightning.
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("landfall: Elfsworn Giant creates a token when a land is played", () => {
    let s = scenario({ p1: { battlefield: ["Elfsworn Giant"], hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Elf Warrior")).toHaveLength(1);
  });

  it("several triggers for one player: they choose their order", () => {
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

  it("APNAP: the active player's triggers go on the stack first and resolve last", () => {
    let s = scenario({ step: "main2", p1: { battlefield: [CLOCK] }, p2: { battlefield: [CLOCK] } });
    s = passUntil(s, (x) => x.turn.step === "end" && x.stack.length === 2);
    expect(s.stack.map((x) => x.controller)).toEqual(["p1", "p2"]);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(21);
    expect(s.players.p1?.life).toBe(20);
  });

  it('603.4: an "if" condition that becomes false on resolution cancels the effect', () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Llanowar Elves"], hand: ["Dwynen's Elite"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = cast(s, "p1", "Dwynen's Elite");
    s = passBoth(s); // the Elite enters; you control another elf: the trigger goes on the stack
    expect(s.stack).toHaveLength(1);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [elves] } });
    s = passBoth(s); // the elves die
    s = passBoth(s); // the trigger resolves: no other elf left, no token
    expect(idsOf(s, "p1", "battlefield", "Elf Warrior")).toHaveLength(0);
  });

  it("false condition on trigger: nothing triggers (Searslicer without an attack)", () => {
    let s = scenario({ step: "main2", p1: { battlefield: ["Searslicer Goblin"] } });
    s = passUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(0);
  });
});
