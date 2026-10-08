/**
 * Commander (PLAN-E, E4): the AI casts its commander from the command zone, puts it back in the command zone
 * (903.9a), counts commander damage in its effective life and finishes a player with it; determinization
 * leaves commanders intact (they are public); full Commander games stay invariant-clean.
 */
import { card } from "@mtgx/cards";
import { cloneState, type GameState } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { randomCommanderDeck } from "../../../tools/random-deck";
import { moveObject } from "../../engine/src/state";
import { advanceUntil, idOf, scenario } from "../../engine/test/helpers";
import { determinize, effectiveLife, heuristicAgent, mulberry32, playGame, randomAgent } from "../src";

const ARAHBO = "Arahbo, the First Fang";

const commanderId = (s: GameState, player: string) => {
  const uid = Object.entries(s.commander?.cards ?? {}).find(([, c]) => c.owner === player)?.[0];
  return Object.values(s.objects).find((o) => o.uid === uid && !o.isToken)?.id as string;
};
const makeCommander = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  return s;
};

describe("IA et Commander", () => {
  it("casts its commander from the command zone", () => {
    const s = scenario({ p1: { command: [ARAHBO], battlefield: ["Plains", "Plains", "Plains"], hand: [] } });
    const d = heuristicAgent()(s, "p1");
    expect(d).toMatchObject({ type: "cast", card: commanderId(s, "p1") });
  });

  it("903.9a: puts its commander back in the command zone rather than leaving it in the graveyard", () => {
    let s = scenario({ p1: { battlefield: [ARAHBO] } });
    makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "graveyard");
    s = advanceUntil(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
    expect(heuristicAgent()(s, "p1")).toEqual({ type: "choose", values: [1] });
  });

  it("effective life: the distance to 21 damage from a single commander counts", () => {
    const s = scenario({ p1: { battlefield: [ARAHBO] }, p2: { life: 30 } });
    makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
    expect(effectiveLife(s, "p2")).toBe(30);
    s.commander!.cards[Object.keys(s.commander!.cards)[0]!]!.damage.p2 = 15;
    // 30 life and 15 damage from a commander: 30 × 6 / 21.
    expect(effectiveLife(s, "p2")).toBeCloseTo(30 * (6 / 21));
  });

  it("in multiplayer, attacks the player its commander can finish with commander damage", () => {
    let s = scenario({ players: 3, p1: { battlefield: [ARAHBO] }, p2: { life: 40 }, p3: { life: 10 } });
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    makeCommander(s, arahbo);
    s.commander!.cards[s.objects[arahbo]!.uid]!.damage.p2 = 19;
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const d = heuristicAgent()(s, "p1");
    expect(d.type).toBe("declareAttackers");
    if (d.type === "declareAttackers") expect(d.attackers.find((a) => a.id === arahbo)?.defender).toBe("p2");
  });

  it("determinization: a commander in an opponent's hand stays what it is", () => {
    const s = scenario({ p2: { hand: [ARAHBO, "Forest"] } });
    makeCommander(s, idOf(s, "p2", "hand", ARAHBO));
    const d = determinize(cloneState(s), "p1", mulberry32(5));
    const commander = Object.values(d.objects).find((o) => o.uid === Object.keys(s.commander!.cards)[0]);
    expect(commander?.defId).toBe(card(ARAHBO).id);
  });

  it("Commander games with 2 and 4 players (medium and random AI): invariants hold, games finish", () => {
    for (const players of [2, 4]) {
      const decks = Array.from({ length: players }, (_, i) => randomCommanderDeck(900 + players * 10 + i));
      const r = playGame({
        seed: 77 + players,
        decks: decks.map((d) => d.deck),
        variant: "commander",
        commanders: decks.map((d) => d.commanders),
        agents: decks.map((_, i) => (i === 0 ? heuristicAgent() : randomAgent(i))),
        maxDecisions: 15000 * players,
        check: true,
      });
      expect(r.state.over, `${players} players`).toBe(true);
      expect(r.state.players.p1?.startingLife).toBe(40);
    }
  }, 120_000);
});
