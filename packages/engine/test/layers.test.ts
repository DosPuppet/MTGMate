import { CARDS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { cond, fx, ref, spell, staticAbility, target, triggered, when } from "../src/dsl";
import { chars, obj, tapObject, untapObject } from "../src/state";
import type { LayerMods } from "../src/types";
import { act, customCard, idOf, idsOf, passBoth, passUntil, scenario } from "./helpers";

/** "Target creature becomes 0/1 and loses all abilities until end of turn." */
const HEX = customCard({
  name: "Hex",
  typeLine: "Instant",
  types: ["Instant"],
  spell: spell([target.creature()], [fx.modify(ref.target(), { setPower: 0, setToughness: 1, loseAllAbilities: true })]),
});

describe("couches (613)", () => {
  it("lord: the other Elves get +1/+1, not the lord itself", () => {
    const s = scenario({ p1: { battlefield: ["Imperious Perfect", "Llanowar Elves", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Imperious Perfect")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("effects follow the lord: it leaves the battlefield, the bonus goes away", () => {
    let s = scenario({
      p1: { battlefield: ["Imperious Perfect", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      active: "p2",
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Burst Lightning"),
      targets: { t: [idOf(s, "p1", "battlefield", "Imperious Perfect")] },
    });
    s = passBoth(s);
    expect(chars(s, elves).power).toBe(1);
  });

  it("7b then 7c: 'becomes 0/1' applies before the counters and the lord", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Imperious Perfect", "Llanowar Elves"], hand: [HEX] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = {
      ...s,
      objects: { ...s.objects, [elves]: { ...s.objects[elves]!, counters: { "+1/+1": 1 } } },
      version: s.version + 1,
    };
    expect(chars(s, elves).power).toBe(3); // 1 + 1 counter + 1 lord
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hex"), targets: { t: [elves] } });
    s = passBoth(s);
    // 0/1 (7b) + counter (7c) + lord (7c) = 2/3; the mana ability is lost (layer 6).
    expect(chars(s, elves)).toMatchObject({ power: 2, toughness: 3, abilities: [] });
  });

  it("conditional ability: Kargan has flying only with a Dragon", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain").concat("Kargan Dragonrider"), hand: ["Dragon Trainer"] } });
    const kargan = idOf(s, "p1", "battlefield", "Kargan Dragonrider");
    expect(chars(s, kargan).keywords).not.toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Trainer") });
    s = passBoth(s); // the Trainer enters
    s = passBoth(s); // its trigger creates the Dragon
    expect(chars(s, kargan).keywords).toContain("flying");
  });

  it("'attacking creatures': Goblin Oriflamme only counts while attacking", () => {
    let s = scenario({ p1: { battlefield: ["Goblin Oriflamme", "Swab Goblin"] } });
    const g = idOf(s, "p1", "battlefield", "Swab Goblin");
    expect(chars(s, g).power).toBe(2);
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] });
    expect(chars(s, g).power).toBe(3);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(chars(s, g).power).toBe(2);
  });

  it("granting an ability to others: Aggressive Mammoth grants trample", () => {
    const s = scenario({ p1: { battlefield: ["Aggressive Mammoth", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
  });
});

describe("replacements and prevention (614–615)", () => {
  it("'exile it instead': Obliterating Bolt exiles the creature that dies", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Obliterating Bolt"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    // Pelakka Wurm is 7/7: damage it first so that 4 damage is enough.
    s = { ...s, objects: { ...s.objects, [wurm]: { ...s.objects[wurm]!, damage: 3 } } };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Obliterating Bolt"), targets: { t: [wurm] } });
    s = passBoth(s);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    // Exiled, it has not "died": no Pelakka Wurm draw.
    expect(s.stack).toHaveLength(0);
  });

  it("enters with counters (raid) and 'doubles its counters' (landfall)", () => {
    let s = scenario({ step: "main2", p1: { battlefield: Array(3).fill("Mountain"), hand: ["Goblin Boarders"] } });
    // Raid: an attack this turn (turn log).
    s = {
      ...s,
      turnLog: [...s.turnLog, { e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: [] }],
      version: s.version + 1,
    };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Goblin Boarders") });
    s = passBoth(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Goblin Boarders")).power).toBe(4);

    let t = scenario({ p1: { battlefield: Array(3).fill("Forest"), hand: ["Mossborn Hydra", "Forest"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Mossborn Hydra") });
    t = passBoth(t);
    const hydra = idOf(t, "p1", "battlefield", "Mossborn Hydra");
    expect(chars(t, hydra).power).toBe(1);
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") });
    t = passBoth(t);
    expect(chars(t, hydra).power).toBe(2);
  });

  it("enters tapped: Diregraf Ghoul", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Diregraf Ghoul"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Diregraf Ghoul") });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Diregraf Ghoul")]?.tapped).toBe(true);
  });

  it("prevention: Fleeting Flight prevents the combat damage dealt to the creature", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: fire, defender: "p1" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: fire }] });
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fleeting Flight"), targets: { t: [bear] } });
    s = passBoth(s);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[bear]).toBeDefined();
    expect(s.objects[bear]?.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Synthetic interactions: made-up cards, continuous effects set directly, controlled timestamps.
// ---------------------------------------------------------------------------

type State = ReturnType<typeof scenario>;

/** Continuous effect from a resolution (locked-in set, 611.2c), with the chosen timestamp. */
function withEffect(s: State, affected: string[], mods: LayerMods, timestamp = s.timestamp + 1): State {
  return {
    ...s,
    timestamp: Math.max(s.timestamp, timestamp),
    version: s.version + 1,
    effects: [...s.effects, { id: `e${timestamp}`, timestamp, affected, duration: "permanent", ...mods }],
  };
}

const ARTIFACT = customCard({ name: "Gear", typeLine: "Artifact", types: ["Artifact"] });
/** "Artifacts you control are 2/2 artifact creatures." (layers 4 and 7b) */
const ANIMATOR = customCard({
  name: "Animator",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [
    staticAbility({ types: ["Artifact"], controller: "you" }, { addTypes: ["Creature"], setPower: 2, setToughness: 2 }),
  ],
});
/** "Creatures you control get +1/+1 and have flying." (layers 6 and 7c) */
const ANTHEM = customCard({
  name: "Anthem",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1, addKeywords: ["flying"] })],
});
/** "Red creatures have haste." (layer 6, color filter) */
const RED_HASTE = customCard({
  name: "Red Banner",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [staticAbility({ types: ["Creature"], colors: ["R"] }, { addKeywords: ["haste"] })],
});

describe("layers: synthetic interactions", () => {
  it("a type added in layer 4 makes the object subject to the later layers (6, 7b, 7c)", () => {
    const s = scenario({ p1: { battlefield: [ARTIFACT, ANIMATOR, ANTHEM] } });
    // Artifact → 2/2 creature (4, 7b), then +1/+1 and flying from the Anthem, whose set is fixed at its layers (613.6).
    expect(chars(s, idOf(s, "p1", "battlefield", "Gear"))).toMatchObject({
      types: ["Artifact", "Creature"],
      power: 3,
      toughness: 3,
      keywords: ["flying"],
    });
  });

  it("a color changed in layer 5 counts for a color filter in layer 6", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", RED_HASTE] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).not.toContain("haste");
    s = withEffect(s, [bear], { setColors: ["R"] });
    expect(chars(s, bear).keywords).toContain("haste");
  });

  it("611.2c: the set of a resolution effect is locked in, a newcomer does not benefit", () => {
    // "Creatures you control get +2/+0" resolved when only the Bear was there; the Elves arrive afterwards.
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { power: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(1);
    expect(chars(s, bear).power).toBe(4);
  });

  it("loss of all abilities: timestamp order decides (613.7)", () => {
    const base = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(base, "p1", "battlefield", "Bear Cub");
    const t = base.timestamp;
    // Flying then loss: no more flying.
    const lostLast = withEffect(
      withEffect(base, [bear], { addKeywords: ["flying"] }, t + 1),
      [bear],
      { loseAllAbilities: true },
      t + 2,
    );
    expect(chars(lostLast, bear).keywords).not.toContain("flying");
    // Loss then flying: flying stays.
    const gainedLast = withEffect(
      withEffect(base, [bear], { loseAllAbilities: true }, t + 1),
      [bear],
      { addKeywords: ["flying"] },
      t + 2,
    );
    expect(chars(gainedLast, bear).keywords).toContain("flying");
  });

  it("a source that loses its abilities no longer applies its static abilities", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ANTHEM] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(3);
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Anthem")], { loseAllAbilities: true });
    expect(chars(s, bear)).toMatchObject({ power: 2, keywords: [] });
  });

  it("7b, 7c then 7d: fixed P/T, modification, counter, then switch", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { switchPT: true }); // the oldest, but layer 7d comes last
    s = withEffect(s, [bear], { setPower: 1, setToughness: 4 });
    s = withEffect(s, [bear], { power: 2 });
    s = { ...s, objects: { ...s.objects, [bear]: { ...s.objects[bear]!, counters: { "+1/+1": 1 } } }, version: s.version + 1 };
    // 1/4 → +2/+0 → +1/+1 = 4/5 → switch = 5/4.
    expect(chars(s, bear)).toMatchObject({ power: 5, toughness: 4, basePower: 1 });
  });

  it("copy (layer 1) then modification: the copiable values, then the bonus", () => {
    let s = scenario({ p1: { battlefield: ["Llanowar Elves", "Bear Cub"] } });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const bearDef = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]!.defId;
    s = withEffect(s, [elves], { power: 1 });
    s = withEffect(s, [elves], { copyOf: bearDef });
    // The copy (newer) does not sweep away the bonus: layers apply in order, not by timestamp.
    expect(chars(s, elves)).toMatchObject({ name: "Bear Cub", power: 3, toughness: 2 });
  });

  it("a static ability granted by an effect applies (Roar of the Fifth People, chapter II)", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ARTIFACT] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const grant = staticAbility({ types: ["Creature"], controller: "you" }, { addKeywords: ["vigilance"] });
    expect(chars(s, bear).keywords).not.toContain("vigilance");
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Gear")], { addAbilities: [grant] });
    expect(chars(s, bear).keywords).toContain("vigilance");
  });

  it("603.4: a granted triggered ability with 'if…' rechecks its condition on resolution", () => {
    const run = (removeInResponse: boolean) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ARTIFACT, "Island"], hand: ["Opt"] } });
      const grant = triggered(when.castSpell("you"), [fx.gainLife(3)], { condition: cond.controls({ types: ["Artifact"] }) });
      s = withEffect(s, [idOf(s, "p1", "battlefield", "Bear Cub")], { addAbilities: [grant] });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
      s = passUntil(s, (x) => x.stack.length === 2);
      expect(s.stack.length).toBe(2);
      if (removeInResponse) destroy(s, idOf(s, "p1", "battlefield", "Gear"));
      s = passUntil(s, (x) => x.stack.length === 1);
      return s.players.p1?.life;
    };
    expect(run(false)).toBe(23);
    expect(run(true)).toBe(20);
  });

  it("613.8: a static ability's condition sees the types added by an effect", () => {
    // Kargan has flying "as long as you control a Dragon": a Bear turned into a Dragon by an effect is enough.
    let s = scenario({ p1: { battlefield: ["Kargan Dragonrider", "Bear Cub"] } });
    const kargan = idOf(s, "p1", "battlefield", "Kargan Dragonrider");
    expect(chars(s, kargan).keywords).not.toContain("flying");
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Bear Cub")], { addSubtypes: ["Dragon"] });
    expect(chars(s, kargan).keywords).toContain("flying");
  });

  it("last known information: a pumped creature that dies keeps its modified power", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      active: "p2",
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { power: 3 });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [bear] } });
    s = passBoth(s);
    expect(s.objects[bear]).toBeUndefined();
    expect(s.lki[bear]).toMatchObject({ power: 5, toughness: 2 });
  });
});

describe("known engine limits, kept by a test", () => {
  it("no static ability grants a static ability (dependency not handled by the layers)", () => {
    const offenders: string[] = [];
    const walk = (v: unknown, name: string): void => {
      if (Array.isArray(v)) for (const x of v) walk(x, name);
      else if (v && typeof v === "object") {
        const ab = v as { kind?: string; mods?: LayerMods };
        if (ab.kind === "static" && ab.mods?.addAbilities?.some((a) => a.kind === "static")) offenders.push(name);
        for (const x of Object.values(v)) walk(x, name);
      }
    };
    for (const def of Object.values(CARDS)) walk(def, def.name);
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("layer cache: targeted invalidation (PLAN-C, lot C15)", () => {
  const tappedAnthem = customCard({
    name: "Tapped Anthem",
    typeLine: "Enchantment",
    types: ["Enchantment"],
    abilities: [staticAbility({ types: ["Creature"], controller: "you", tapped: true }, { power: 1, toughness: 1 })],
  });
  const poolLord = customCard({
    name: "Pool Lord",
    power: 1,
    toughness: 1,
    abilities: [staticAbility("self", { power: 5, toughness: 0 }, { condition: cond.manaPoolAtLeast(2) })],
  });

  it("tapping or untapping a creature updates a static ability that reads the tapped state", () => {
    const s = scenario({ p1: { battlefield: [tappedAnthem, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    tapObject(s, obj(s, bear));
    expect(chars(s, bear).power).toBe(3);
    untapObject(s, obj(s, bear));
    expect(chars(s, bear).power).toBe(2);
  });

  it("without a static ability reading it, tapping does not recompute the characteristics", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    chars(s, bear);
    const v = s.version;
    tapObject(s, obj(s, bear));
    expect(s.version).toBe(v);
  });

  it("producing mana updates a static ability that reads the mana pool", () => {
    let s = scenario({ p1: { battlefield: [poolLord, "Forest", "Forest"] } });
    const lord = idOf(s, "p1", "battlefield", "Pool Lord");
    expect(chars(s, lord).power).toBe(1);
    for (const land of idsOf(s, "p1", "battlefield", "Forest"))
      s = act(s, "p1", { type: "tapForMana", source: land, ability: 0 });
    expect(chars(s, lord).power).toBe(6);
  });
});
