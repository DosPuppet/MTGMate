/**
 * Commander (903, PLAN-E, E2): setup (40 life, commander in the command zone), casting from the command zone
 * and tax (903.8), no activated ability in that zone (113.6), return to the command zone
 * from the graveyard or exile (903.9a) and instead of the library (903.9b), 21 combat damage from a single
 * commander (903.10a, 704.6c), view and record.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { outcomeHash } from "../src/fingerprint";
import { createGame } from "../src/game";
import { legalActions } from "../src/legal";
import { createRecordedGame, recordDecision, replayGame } from "../src/record";
import { castTerms } from "../src/stack";
import { chars, moveObject } from "../src/state";
import { advance } from "../src/turn";
import type { Decision, GameState, ObjectId, PlayerId } from "../src/types";
import { projectView } from "../src/view";
import { act, attack, idOf, passAccepting, passBoth, scenario, throughCombat } from "./helpers";

const ARAHBO = "Arahbo, the First Fang"; // {2}{W}, "other Cats you control get +1/+1"
const LIONS = "Savannah Lions"; // Chat 2/1

/** The commander's object of `player` (wherever it is). */
function commanderId(s: GameState, player: PlayerId): ObjectId {
  const entry = Object.entries(s.commander?.cards ?? {}).find(([, c]) => c.owner === player);
  const o = Object.values(s.objects).find((x) => x.uid === entry?.[0] && !x.isToken);
  if (!o) throw new Error(`commandant de ${player} introuvable`);
  return o.id;
}
const rec = (s: GameState, player: PlayerId) =>
  Object.values(s.commander?.cards ?? {}).find((c) => c.owner === player) as NonNullable<GameState["commander"]>["cards"][string];

/** Makes the object a commander (commander already on the battlefield, in a graveyard...). */
function makeCommander(s: GameState, id: ObjectId): GameState {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  return s;
}

/** State-based actions checked again (after a move made directly by the test). */
function recheck(s: GameState): GameState {
  s.pending = null;
  s.flow = "priority";
  s.priority = { holder: s.turn.active, passes: 0 };
  advance(s);
  return s;
}

const answer = (s: GameState, yes: boolean) => act(s, s.pending?.player as PlayerId, { type: "choose", values: [yes ? 1 : 0] });

describe("Commander : mise en place (903.6, 903.7)", () => {
  const deck = [card(ARAHBO), ...Array.from({ length: 99 }, () => card("Plains"))];

  it("40 life; the commander starts in the command zone, the other 99 cards in the library", () => {
    const { state } = createGame({
      seed: 7,
      variant: "commander",
      players: [
        { id: "p1", name: "A", deck, commanders: [0] },
        { id: "p2", name: "B", deck, commanders: [0] },
      ],
    });
    for (const p of ["p1", "p2"]) {
      const pl = state.players[p];
      expect(pl?.life).toBe(40);
      expect(pl?.startingLife).toBe(40);
      expect(pl?.command.map((id) => state.objects[id]?.defId)).toEqual([card(ARAHBO).id]);
      expect((pl?.library.length ?? 0) + (pl?.hand.length ?? 0)).toBe(99);
    }
    expect(Object.values(state.commander?.cards ?? {}).map((c) => c.owner)).toEqual(["p1", "p2"]);
  });

  it("outside Commander, nothing changes: 20 life, no Commander state, all cards in the library", () => {
    const { state } = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", deck },
        { id: "p2", name: "B", deck },
      ],
    });
    expect(state.players.p1?.life).toBe(20);
    expect(state.commander).toBeUndefined();
    expect(state.players.p1?.command).toEqual([]);
  });

  it("the record keeps the variant and the commanders; the replay gives back the same state", () => {
    const opts = {
      seed: 11,
      variant: "commander" as const,
      players: [
        { id: "p1", name: "A", deck, commanders: [0] },
        { id: "p2", name: "B", deck, commanders: [0] },
      ],
    };
    let { state, record } = createRecordedGame(opts);
    expect(record.variant).toBe("commander");
    expect(record.players[0]?.commanders).toEqual([0]);
    for (let i = 0; i < 6 && state.pending; i++) {
      const p = state.pending.player;
      const d: Decision = state.pending.kind === "mulligan" ? { type: "keep" } : { type: "pass" };
      state = act(state, p, d);
      recordDecision(record, p, d, state);
    }
    const replayed = replayGame(record, (name) => card(name)).state;
    expect(outcomeHash(replayed)).toBe(outcomeHash(state));
  });
});

describe("Commander : lancer depuis la zone de commandement (903.8)", () => {
  const base = () => scenario({ p1: { command: [ARAHBO], battlefield: ["Plains", "Plains", "Plains", LIONS], hand: [] } });

  it("the commander is cast from the command zone; there is no activated ability (113.6)", () => {
    let s = base();
    const lions = idOf(s, "p1", "battlefield", LIONS);
    // Arahbo in the command zone: the Cats gain nothing.
    expect(chars(s, lions).power).toBe(2);
    const id = commanderId(s, "p1");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === id)).toBe(true);
    // An opponent cannot cast it.
    expect(castTerms(s, "p2", id)).toBeNull();
    s = act(s, "p1", { type: "cast", card: id });
    expect(rec(s, "p1").casts).toBe(1);
    s = passBoth(s);
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    expect(s.objects[arahbo]?.zone).toBe("battlefield");
    // On the battlefield, its static ability applies.
    expect(chars(s, lions).power).toBe(3);
  });

  it("tax: {2} more per previous cast from the command zone, shown by the view", () => {
    let s = base();
    rec(s, "p1").casts = 1;
    const id = commanderId(s, "p1");
    expect(castTerms(s, "p1", id)?.extraCost).toBe(2);
    // Three Plains for a cost of {4}{W}: impossible.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === id)).toBe(false);
    const shown = projectView(s, "p1").playableElsewhere.find((o) => o.id === id);
    expect(shown?.castCost?.text).toBe("{4}{W}");
    expect(projectView(s, "p2").players.p1?.commanders).toEqual([{ defId: card(ARAHBO).id, zone: "command", id, tax: 2 }]);
    s = scenario({ p1: { command: [ARAHBO], battlefield: Array(5).fill("Plains") } });
    rec(s, "p1").casts = 1;
    s = act(s, "p1", { type: "cast", card: commanderId(s, "p1") });
    expect(s.battlefield.filter((x) => s.objects[x]?.tapped)).toHaveLength(5);
    expect(rec(s, "p1").casts).toBe(2);
  });
});

describe("Commander: return to the command zone (903.9)", () => {
  /** p1 has their commander on the battlefield. */
  const onBattlefield = () => {
    const s = scenario({ p1: { battlefield: [ARAHBO] } });
    return makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
  };

  it('903.9a: in the graveyard, its owner chooses to put it back in the command zone; "dies" triggers see it die', () => {
    // Vengeful Bloodwitch: "whenever this creature or another creature you control dies, target opponent
    // loses 1 life and you gain 1 life".
    let s = scenario({ p1: { battlefield: [ARAHBO, "Vengeful Bloodwitch"] } });
    makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "graveyard");
    s = recheck(s);
    expect(s.pending?.kind).toBe("choice");
    if (s.pending?.kind !== "choice") return;
    expect(s.pending.player).toBe("p1");
    expect(s.pending.request.intent).toBe("commanderZone");
    s = answer(s, true);
    expect(s.players.p1?.command.map((x) => s.objects[x]?.defId)).toEqual([card(ARAHBO).id]);
    expect(s.players.p1?.graveyard).toEqual([]);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.life).toBe(19);
  });

  it("903.9a: a refusal leaves it in the graveyard, with no new question; a new zone (exile) asks the question again", () => {
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "graveyard");
    s = answer(recheck(s), false);
    expect(s.pending?.kind).toBe("priority");
    const inGraveyard = idOf(s, "p1", "graveyard", ARAHBO);
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.kind).not.toBe("choice");
    moveObject(s, inGraveyard, "exile");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
    s = answer(s, true);
    expect(s.exile).toEqual([]);
    expect(s.players.p1?.command).toHaveLength(1);
  });

  it("903.9b: to the library or the hand, the owner chooses; a refusal leaves it where it is", () => {
    // To the library: the question is asked; yes, it goes to the command zone.
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "library");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
    expect(s.pending?.kind === "choice" && s.pending.request.autoOk).toBeFalsy();
    s = answer(s, true);
    expect(s.players.p1?.command.map((x) => s.objects[x]?.defId)).toEqual([card(ARAHBO).id]);
    expect(s.players.p1?.library.some((x) => s.objects[x]?.defId === card(ARAHBO).id)).toBe(false);
    // To the hand: no, it stays in hand and is cast again without tax.
    let s2 = onBattlefield();
    moveObject(s2, idOf(s2, "p1", "battlefield", ARAHBO), "hand");
    s2 = answer(recheck(s2), false);
    const inHand = idOf(s2, "p1", "hand", ARAHBO);
    expect(s2.pending?.kind).toBe("priority");
    expect(castTerms(s2, "p1", inHand)).toMatchObject({ source: "hand" });
    expect(castTerms(s2, "p1", inHand)?.extraCost).toBeUndefined();
    // To the hand: yes, it goes to the command zone.
    let s3 = onBattlefield();
    moveObject(s3, idOf(s3, "p1", "battlefield", ARAHBO), "hand");
    s3 = answer(recheck(s3), true);
    expect(s3.players.p1?.hand).toEqual([]);
    expect(s3.players.p1?.command).toHaveLength(1);
  });

  it("903.9b: left in the library then drawn, the question is asked again (to the hand)", () => {
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "library", { position: "top" });
    s = answer(recheck(s), false);
    moveObject(s, s.players.p1?.library[0] as string, "hand");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
  });
});

describe("Commander : blessures de commandant (903.10a, 704.6c)", () => {
  it("21 combat damage from a single commander over the game: the player loses, even with life", () => {
    let s = scenario({ p1: { battlefield: [ARAHBO] }, p2: { life: 40 } });
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    makeCommander(s, arahbo);
    rec(s, "p1").damage.p2 = 19;
    s = throughCombat(attack(s, [arahbo]));
    expect(s.players.p2?.life).toBe(38);
    expect(s.players.p2?.lost).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("damage accumulates per player; the view shows it; that of another creature does not count", () => {
    let s = scenario({ players: 3, p1: { battlefield: [ARAHBO, LIONS] } });
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    makeCommander(s, arahbo);
    s = throughCombat(attack(s, [arahbo, idOf(s, "p1", "battlefield", LIONS)]));
    // Arahbo (2/2) and the Lions (2/1 +1/+1) attack p2: only Arahbo's damage counts.
    expect(rec(s, "p1").damage).toEqual({ p2: 2 });
    expect(projectView(s, "p3").players.p2?.commanderDamage).toEqual([{ defId: card(ARAHBO).id, owner: "p1", amount: 2 }]);
  });
});
