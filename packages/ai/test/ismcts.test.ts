/**
 * ISMCTS (high level): reproducible, blind to hidden information, and able to find an obvious play.
 */
import { card } from "@mtgx/cards";
import { cloneState, createObject, type GameState, registerDef } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { scenario } from "../../engine/test/helpers";
import { aiAgent, mulberry32 } from "../src";
import { determinize, forAgent, ismctsPriority } from "../src/ismcts";
import { MEDIUM_PROFILE } from "../src/profile";

/** An early-game position with several options: creature, damage spell, or wait. */
function position(): GameState {
  return scenario({
    p1: {
      battlefield: ["Mountain", "Mountain", "Forest", "Bear Cub"],
      hand: ["Burst Lightning", "Gnarlback Rhino", "Giant Growth"],
      library: ["Forest", "Mountain", "Swab Goblin", "Forest", "Mountain", "Forest"],
    },
    p2: {
      battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      hand: ["Scorching Dragonfire", "Mountain", "Goblin Boarders"],
      library: ["Mountain", "Raging Redcap", "Mountain", "Mountain", "Brazen Scourge", "Mountain"],
    },
  });
}

const PROFILE = { ...MEDIUM_PROFILE, attack: "search" as const, block: "search" as const, exposure: true };

describe("ISMCTS", () => {
  it("is reproducible with equal seed and budget", () => {
    const s = position();
    const a = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(7), iterations: 60 });
    const b = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(7), iterations: 60 });
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("doesn't read hidden information: opposing hand and library order", () => {
    const s = position();
    // Same position seen by p1, but another distribution of p2's hidden cards between hand and library,
    // and other library orders: the decision must be identical.
    const t = cloneState(s);
    const p2 = t.players.p2;
    const p1 = t.players.p1;
    if (!p2 || !p1) throw new Error("players");
    const pool = [...p2.hand, ...p2.library].reverse();
    p2.hand = pool.slice(0, p2.hand.length);
    p2.library = pool.slice(p2.hand.length);
    for (const id of p2.hand) (t.objects[id] as { zone: string }).zone = "hand";
    for (const id of p2.library) (t.objects[id] as { zone: string }).zone = "library";
    p1.library.reverse();
    expect(p2.hand.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).not.toEqual(
      s.players.p2?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name),
    );
    const a = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(3), iterations: 60 });
    const b = ismctsPriority(t, "p1", PROFILE, { rand: mulberry32(3), iterations: 60 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("fair medium and beginner levels don't read hidden information either (forAgent, PLAN-L L1)", () => {
    // Without `fair`, medium casts Harmonize only when it sees the Dragons on top of its library.
    const at = (top: string[]) =>
      scenario({
        p1: { battlefield: Array(8).fill("Forest"), hand: ["Harmonize"], library: [...top, ...Array(8).fill("Forest")] },
        p2: { battlefield: ["Swab Goblin"] },
      });
    const dragons = at(["Shivan Dragon", "Shivan Dragon", "Gigantosaurus"]);
    const forests = at(["Forest", "Forest", "Forest"]);
    const name = (s: GameState, d: ReturnType<ReturnType<typeof aiAgent>>) =>
      d.type === "cast" ? s.defs[s.objects[d.card]?.defId ?? ""]?.name : d.type;
    expect(name(dragons, aiAgent("medium", { seed: 1 })(dragons, "p1"))).toBe("Harmonize");
    expect(name(forests, aiAgent("medium", { seed: 1 })(forests, "p1"))).toBe("pass");
    for (const level of ["medium", "beginner"] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const a = aiAgent(level, { seed, fair: true });
        const b = aiAgent(level, { seed, fair: true });
        expect(name(dragons, a(dragons, "p1"))).toBe(name(forests, b(forests, "p1")));
      }
  });

  it("forAgent keeps the cards the pending question shows", () => {
    const s = position();
    const hand = [...(s.players.p2?.hand ?? [])];
    const shown = hand.slice(0, 2);
    s.pending = {
      kind: "choice",
      player: "p1",
      request: { type: "pick", intent: "discard", prompt: "", options: shown, min: 1, max: 1, suggested: [shown[0] as string] },
    } as GameState["pending"];
    const name = (x: GameState, id: string) => x.defs[x.objects[id]?.defId ?? ""]?.name;
    for (let seed = 1; seed <= 10; seed++) {
      const d = forAgent(s, "p1", mulberry32(seed));
      for (const id of shown) expect(name(d, id)).toBe(name(s, id));
    }
    // Without the question, the same cards are redrawn.
    s.pending = null;
    const redrawn = Array.from({ length: 10 }, (_, seed) => forAgent(s, "p1", mulberry32(seed + 1))).some((d) =>
      shown.some((id) => name(d, id) !== name(s, id)),
    );
    expect(redrawn).toBe(true);
  });

  it("finds the lethal spell", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain", "Forest"], hand: ["Burst Lightning", "Bear Cub"] },
      p2: { life: 2, battlefield: ["Swab Goblin"] },
    });
    const d = aiAgent("expert", { seed: 5, budget: { iterations: 40 }, players: 2 })(s, "p1");
    expect(d.type).toBe("cast");
    expect(d.type === "cast" && Object.values(d.targets ?? {}).flat()).toEqual(["p2"]);
  });

  it("without enough time (slow machine), hands control back to the heuristic", () => {
    expect(ismctsPriority(position(), "p1", PROFILE, { rand: mulberry32(1), ms: 0, minIterations: 24 })).toBeNull();
  });

  it("determinization: hidden cards drawn only from the cards seen, known cards untouched", () => {
    const s = position();
    const d = determinize(s, "p1", mulberry32(9));
    const names = (st: GameState, ids: string[]) => ids.map((id) => st.defs[st.objects[id]?.defId ?? ""]?.name);
    const hidden = (st: GameState) => [...(st.players.p2?.hand ?? []), ...(st.players.p2?.library ?? [])];
    // Only what has been seen of p2 (Swab Goblin) and basic lands of its colors (Mountain).
    for (const n of names(d, hidden(d))) expect(["Swab Goblin", "Mountain"]).toContain(n);
    expect(d.players.p2?.hand.length).toBe(s.players.p2?.hand.length);
    expect(d.players.p2?.library.length).toBe(s.players.p2?.library.length);
    // What p1 knows stays untouched: their hand, the battlefield.
    expect(d.players.p1?.hand).toEqual(s.players.p1?.hand);
    expect(d.battlefield).toEqual(s.battlefield);
    // No dependence on the real hidden cards: changing them changes nothing in the draw.
    const other = position();
    const hand = other.players.p2?.hand ?? [];
    const lib = other.players.p2?.library ?? [];
    [hand[0], lib[1]] = [lib[1] as string, hand[0] as string];
    for (const id of hand) (other.objects[id] as { zone: string }).zone = "hand";
    for (const id of lib) (other.objects[id] as { zone: string }).zone = "library";
    const d2 = determinize(other, "p1", mulberry32(9));
    expect(names(d2, hidden(d2))).toEqual(names(d, hidden(d)));
  });
});

describe("ISMCTS: face-down cards (PLAN-C, lot C6)", () => {
  it("determinization also draws the opponent's face-down permanents and face-down exiled cards", () => {
    const s = cloneState(scenario({ p1: { battlefield: ["Forest"] }, p2: { battlefield: ["Bear Cub"], graveyard: ["Opt"] } }));
    const bear = s.battlefield.find((id) => s.objects[id]?.controller === "p2") as string;
    const hiddenDef = card("Doomsday Excruciator");
    registerDef(s, hiddenDef);
    // A face-down permanent of p2, and a face-down exiled card that only they can look at.
    const o = s.objects[bear];
    if (o) o.faceDown = { card: hiddenDef.id, ward: false, upCosts: [] };
    const exObj = createObject(s, hiddenDef.id, "p2", "exile");
    exObj.exiledFaceDown = ["p2"];
    const ex = exObj.id;
    for (let seed = 1; seed <= 20; seed++) {
      const d = determinize(s, "p1", mulberry32(seed));
      expect(d.objects[bear]?.faceDown?.card).not.toBe(hiddenDef.id);
      expect(d.objects[ex]?.defId).not.toBe(hiddenDef.id);
    }
  });
});
