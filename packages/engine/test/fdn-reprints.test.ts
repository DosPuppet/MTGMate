/**
 * Foundations, reprints: mechanics added for cards no. 282 and up
 * (poison, "must be blocked", additional combat, Crew, retargeting, mana with an effect...).
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars, onBattlefield } from "../src/state";
import type { ActionOption, GameState } from "../src/types";
import { act, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const castOption = (s: S, p: string, card: string) =>
  legalActions(s, p).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activation = (s: S, p: string, source: string, label?: string) =>
  legalActions(s, p).find(
    (a): a is Extract<ActionOption, { type: "activate" }> =>
      a.type === "activate" && a.source === source && (!label || !!a.label?.startsWith(label)),
  );
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
/** Advances (passes, suggestions, no attack or block) until `until` is true. */
function advance(s: S, until: (x: S) => boolean): S {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur) && !cur.over; i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}
/** Declares these attackers (against p2) from the beginning of combat. */
function attackWith(s: S, names: string[]): S {
  let cur = advance(s, (x) => x.pending?.kind === "declareAttackers");
  const ids = names.map((n) => idOf(cur, "p1", "battlefield", n));
  cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  return cur;
}

describe("Reprints: combat", () => {
  it("Fynn: two poison counters; ten counters, the player loses", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Fynn, the Fangbearer"] } });
    s.players.p2!.counters = { poison: 8 };
    s = attackWith(s, ["Fynn, the Fangbearer"]);
    s = advance(s, (x) => x.over || x.turn.step === "main2");
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("Joraga Invocation: the attackers must be blocked if able", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 6)], hand: ["Joraga Invocation"] },
      p2: { battlefield: ["Prideful Parent"] },
    });
    s = cast(s, "p1", "Joraga Invocation");
    s = passBoth(s);
    s = attackWith(s, ["Llanowar Elves"]);
    s = advance(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow(/must be blocked/);
    const blocker = idOf(s, "p2", "battlefield", "Prideful Parent");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker, attacker: idOf(s, "p1", "battlefield", "Llanowar Elves") }],
    });
    expect(s.combat?.attackers[0]?.blocked).toBe(true);
  });

  it("Aurelia: an additional combat phase", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Aurelia, the Warleader"] } });
    s = attackWith(s, ["Aurelia, the Warleader"]);
    s = advance(s, (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && x.players.p2!.life < 20));
    expect(s.pending?.kind).toBe("declareAttackers"); // second combat
    expect(s.players.p2?.life).toBe(17);
  });

  it("Crew: Cultivator's Caravan becomes a creature by tapping enough to make 3 power", () => {
    let s = scenario({ p1: { battlefield: ["Cultivator's Caravan", "Shivan Dragon"] } });
    const caravan = idOf(s, "p1", "battlefield", "Cultivator's Caravan");
    const crew = activation(s, "p1", caravan, "Crew");
    expect(crew).toBeDefined();
    s = act(s, "p1", { type: "activate", source: caravan, ability: crew!.ability });
    s = passBoth(s);
    expect(chars(s, caravan).types).toContain("Creature");
    expect(s.objects[idOf(s, "p1", "battlefield", "Shivan Dragon")]?.tapped).toBe(true);
  });

  it("Crew: the player chooses the tapped creatures (total power sufficient)", () => {
    let s = scenario({
      p1: { battlefield: ["Cultivator's Caravan", "Shivan Dragon", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves"] },
    });
    const caravan = idOf(s, "p1", "battlefield", "Cultivator's Caravan");
    const crew = activation(s, "p1", caravan, "Crew");
    const spec = crew?.type === "activate" ? crew.additional?.tap : undefined;
    // The option exposes the required power, the powers and the default choice (the weakest first: three Elves).
    expect(spec?.minPower).toBe(3);
    expect(spec?.options).toHaveLength(4);
    expect(spec?.suggested).toHaveLength(3);
    const elves = idsOf(s, "p1", "battlefield", "Llanowar Elves");
    // Two Elves (power 2): insufficient.
    expect(() => act(s, "p1", { type: "activate", source: caravan, ability: crew!.ability, tap: elves.slice(0, 2) })).toThrow(
      /Not enough total power/,
    );
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "activate", source: caravan, ability: crew!.ability, tap: [dragon] });
    s = passBoth(s);
    expect(chars(s, caravan).types).toContain("Creature");
    expect(s.objects[dragon]?.tapped).toBe(true);
    expect(elves.every((id) => !s.objects[id]?.tapped)).toBe(true);
  });
});

describe("Reprints: stack and mana", () => {
  it("Bolt Bend: changes the target of a single-target spell", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Mountain", 1), "Shivan Dragon", "Llanowar Elves"], hand: ["Bolt Bend"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = cast(s, "p2", "Burst Lightning", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } });
    s = act(s, "p2", { type: "pass" });
    s = cast(s, "p1", "Bolt Bend", { targets: { t: [s.stack[0]!.id] } }); // costs {R} thanks to the Dragon (ferocious)
    s = passBoth(s);
    s = choose(s, ["p2"]);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(18);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Carnelian Orb: a Dragon paid for with its mana has haste", () => {
    let s = scenario({ p1: { battlefield: ["Carnelian Orb of Dragonkind", ...lands("Mountain", 5)], hand: ["Shivan Dragon"] } });
    s = cast(s, "p1", "Shivan Dragon");
    s = passBoth(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).keywords).toContain("haste");
  });

  it("Pyromancer's Goggles: a red instant paid for with its mana is copied", () => {
    let s = scenario({ p1: { battlefield: ["Pyromancer's Goggles"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    expect(s.stack).toHaveLength(2);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Teach by Example: the next instant or sorcery is copied", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Teach by Example", "Burst Lightning"] } });
    s = cast(s, "p1", "Teach by Example");
    s = passBoth(s);
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Savage Ventmaw: the mana stays until end of turn", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Savage Ventmaw"] } });
    s = attackWith(s, ["Savage Ventmaw"]);
    s = advance(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(3);
    expect(s.players.p1?.manaPool.G).toBe(3);
  });

  it("Harbinger of the Tides: flash for an additional {2}", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Harbinger of the Tides"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const p = advance(s, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    expect(castOption(p, "p1", idOf(p, "p1", "hand", "Harbinger of the Tides"))).toBeUndefined(); // 3 lands: it takes 4
    const t = scenario({ active: "p2", p1: { battlefield: lands("Island", 4), hand: ["Harbinger of the Tides"] } });
    const q = advance(t, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    expect(castOption(q, "p1", idOf(q, "p1", "hand", "Harbinger of the Tides"))).toBeDefined();
  });

  it("Vizier of the Menagerie: cast the creature on top of the library", () => {
    const s = scenario({
      p1: { battlefield: ["Vizier of the Menagerie", ...lands("Swamp", 6)], library: ["Shivan Dragon", "Forest"] },
    });
    const top = s.players.p1?.library[0] as string;
    expect(castOption(s, "p1", top)).toBeDefined(); // mana of any type
  });
});

describe("Reprints: life, control, replacements", () => {
  it("Angel of Vitality adds 1 to each gain; Giant Cindermaw prevents gains", () => {
    let s = scenario({ p1: { battlefield: ["Angel of Vitality", "Plains"], hand: ["Moment of Triumph"] } });
    s = cast(s, "p1", "Moment of Triumph", { targets: { t: [idOf(s, "p1", "battlefield", "Angel of Vitality")] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(23);
    let t = scenario({ p1: { battlefield: ["Giant Cindermaw", "Plains"], hand: ["Moment of Triumph"] } });
    t = cast(t, "p1", "Moment of Triumph", { targets: { t: [idOf(t, "p1", "battlefield", "Giant Cindermaw")] } });
    t = passBoth(t);
    expect(t.players.p1?.life).toBe(20);
  });

  it("Confiscate: you control the enchanted permanent, which returns when the Aura leaves", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Confiscate"] }, p2: { battlefield: ["Shivan Dragon"] } });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Confiscate", { targets: { enchant: [dragon] } });
    s = passBoth(s);
    expect(s.objects[dragon]?.controller).toBe("p1");
    destroy(s, idOf(s, "p1", "battlefield", "Confiscate"));
    s = act(s, "p1", { type: "pass" });
    expect(s.objects[dragon]?.controller).toBe("p2");
  });

  it("Dryad Militant: instants and sorceries go to exile instead of the graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Dryad Militant", "Mountain"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Burst Lightning");
  });

  it("Knight of Grace: hexproof from black", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Knight of Grace"] },
      p2: { battlefield: ["Swamp"], hand: ["Stab"] },
    });
    expect(castOption(s, "p2", idOf(s, "p2", "hand", "Stab"))).toBeUndefined();
  });

  it("Gratuitous Violence doubles the damage of your creatures", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Gratuitous Violence", "Llanowar Elves"] } });
    s = attackWith(s, ["Llanowar Elves"]);
    s = advance(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(18);
  });

  it("Fog Bank: the combat damage it deals and receives is prevented", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Shivan Dragon"] }, p2: { battlefield: ["Fog Bank"] } });
    s = attackWith(s, ["Shivan Dragon"]);
    s = advance(s, (x) => x.pending?.kind === "declareBlockers");
    const bank = idOf(s, "p2", "battlefield", "Fog Bank");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: bank, attacker: idOf(s, "p1", "battlefield", "Shivan Dragon") }],
    });
    s = advance(s, (x) => x.turn.step === "main2");
    expect(onBattlefield(s, bank)).toBe(true);
    expect(s.objects[bank]?.damage).toBe(0);
  });
});

describe("Reprints: cards with memory", () => {
  it("Demonic Pact: each mode only once", () => {
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Demonic Pact"], library: lands("Swamp", 10) } });
    s = advance(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toEqual(["0", "1", "2", "3"]);
    s = choose(s, ["2"]); // draw two cards
    s = advance(s, (x) => x.turn.number === 6 && x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const req2 = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req2?.type === "pick" && req2.options).not.toContain("2");
  });

  it("Myojin of Night's Reach: divinity counter only if cast from hand", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Myojin of Night's Reach"] } });
    s = cast(s, "p1", "Myojin of Night's Reach");
    s = passBoth(s);
    const myojin = idOf(s, "p1", "battlefield", "Myojin of Night's Reach");
    expect(s.objects[myojin]?.counters.divinity).toBe(1);
    expect(chars(s, myojin).keywords).toContain("indestructible");
  });

  it("Tribute to Hunger: you gain the toughness of the sacrificed creature", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Tribute to Hunger"] }, p2: { battlefield: ["Fog Bank"] } });
    s = cast(s, "p1", "Tribute to Hunger", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Ayli: life equal to the toughness of the creature sacrificed for the cost", () => {
    let s = scenario({ p1: { battlefield: ["Ayli, Eternal Pilgrim", "Fog Bank", "Plains"] } });
    const ayli = idOf(s, "p1", "battlefield", "Ayli, Eternal Pilgrim");
    s = act(s, "p1", { type: "activate", source: ayli, ability: 0, sacrifice: [idOf(s, "p1", "battlefield", "Fog Bank")] });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Hoarding Dragon: the exiled artifact returns to hand when it dies", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["Hoarding Dragon"], library: ["Forest", "Gilded Lotus", "Forest"] },
    });
    s = cast(s, "p1", "Hoarding Dragon");
    s = advance(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Gilded Lotus"]);
    destroy(s, idOf(s, "p1", "battlefield", "Hoarding Dragon"));
    s = advance(s, (x) => idsOf(x, "p1", "hand", "Gilded Lotus").length === 1 || x.turn.active === "p2");
    expect(idsOf(s, "p1", "hand", "Gilded Lotus")).toHaveLength(1);
  });

  it("Maze's End: ten Gates with different names, the game is won", () => {
    const gates = ["Azorius", "Boros", "Dimir", "Golgari", "Gruul", "Izzet", "Orzhov", "Rakdos", "Selesnya"].map(
      (g) => `${g} Guildgate`,
    );
    let s = scenario({
      p1: { battlefield: ["Maze's End", ...gates, ...lands("Forest", 3)], library: ["Simic Guildgate", "Forest"] },
    });
    const maze = idOf(s, "p1", "battlefield", "Maze's End");
    s = act(s, "p1", { type: "activate", source: maze, ability: activation(s, "p1", maze, "Search")!.ability });
    s = advance(s, (x) => x.over || x.stack.length === 0);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("Sorcerous Spyglass: abilities of the chosen name can no longer be activated", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Sorcerous Spyglass"] },
      p2: { battlefield: ["Arcanis the Omnipotent"] },
    });
    s = cast(s, "p1", "Sorcerous Spyglass");
    s = passBoth(s);
    s = choose(s, ["Arcanis the Omnipotent"]);
    const arcanis = idOf(s, "p2", "battlefield", "Arcanis the Omnipotent");
    s = advance(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(activation(s, "p2", arcanis)).toBeUndefined();
  });

  it("Crusader of Odric and Enigma Drake: variable P/T", () => {
    const s = scenario({
      p1: { battlefield: ["Crusader of Odric", "Llanowar Elves", "Enigma Drake"], graveyard: ["Opt", "Stab", "Forest"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Crusader of Odric")).power).toBe(3);
    const drake = chars(s, idOf(s, "p1", "battlefield", "Enigma Drake"));
    expect([drake.power, drake.toughness]).toEqual([2, 4]);
  });

  it("Wildborn Preserver: pay X for X counters", () => {
    let s = scenario({ p1: { battlefield: ["Wildborn Preserver", ...lands("Forest", 4)], hand: ["Llanowar Elves"] } });
    s = cast(s, "p1", "Llanowar Elves");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "payX");
    s = choose(s, [2]);
    const pres = idOf(s, "p1", "battlefield", "Wildborn Preserver");
    expect(s.objects[pres]?.counters["+1/+1"]).toBe(2);
  });

  it("Steel Hellkite: destroys permanents with mana value X of the player dealt combat damage", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Steel Hellkite", ...lands("Plains", 2)] },
      p2: { battlefield: ["Llanowar Elves", "Prideful Parent"] },
    });
    s = attackWith(s, ["Steel Hellkite"]);
    s = advance(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    const hk = idOf(s, "p1", "battlefield", "Steel Hellkite");
    s = act(s, "p1", { type: "activate", source: hk, ability: activation(s, "p1", hk, "Destroy")!.ability, x: 1 });
    s = passBoth(s);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Prideful Parent")).toHaveLength(1);
  });
});
