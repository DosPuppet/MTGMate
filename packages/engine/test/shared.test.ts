/**
 * Mechanics shared by several Standard sets (lot 0.9): explore, connive, mount, Clue and Map tokens.
 */
import { type RawCard, TOKEN_SPECS, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { cond, fx, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { plainText } from "../src/text";
import { objectDidThisTurn } from "../src/turnlog";
import type { GameState } from "../src/types";
import { act, idOf, idsOf, passBoth, scenario } from "./helpers";

const resolution = (controller: string, sourceId = "none") => ({
  item: { id: "x", controller, sourceId, sourceDefId: "none", targets: {} },
  controller,
  targets: {},
  vars: {} as Record<string, unknown>,
  pc: 0,
});

describe("explorer (701.44)", () => {
  it("a revealed land goes to hand; otherwise a +1/+1 counter and the card may go to the graveyard", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"], library: ["Forest", "Giant Growth", "Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const hand = s.players.p1?.hand.length ?? 0;
    const r = resolution("p1");
    runEffect(s, r as never, fx.explore({ kind: "stored", name: "b" }));
    r.vars["$ids:b"] = [bear];
    runEffect(s, r as never, fx.explore({ kind: "stored", name: "b" }));
    expect(s.players.p1?.hand.length).toBe(hand + 1); // Forest en main
    const r2 = resolution("p1");
    r2.vars["$ids:b"] = [bear];
    const ask = runEffect(s, r2 as never, fx.explore({ kind: "stored", name: "b" }));
    expect(ask && "ask" in ask).toBe(true);
    r2.vars[`0:explore-${bear}-0`] = [1];
    runEffect(s, r2 as never, fx.explore({ kind: "stored", name: "b" }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(idsOf(s, "p1", "graveyard", "Giant Growth")).toHaveLength(1);
  });
});

describe("connivence (701.50)", () => {
  it("draw, discard; a discarded nonland card gives a +1/+1 counter", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"], hand: ["Giant Growth"], library: ["Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const r = resolution("p1");
    r.vars["$ids:b"] = [bear];
    runEffect(s, r as never, fx.connive({ kind: "stored", name: "b" }));
    r.vars[`0:connive-${bear}`] = [idOf(s, "p1", "hand", "Giant Growth")];
    runEffect(s, r as never, fx.connive({ kind: "stored", name: "b" }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
  });
});

describe("monture (702.171)", () => {
  const MOUNT = toCardDef(
    {
      name: "Test Mount",
      number: "1",
      rarity: "common",
      manaCost: "{1}{W}",
      cmc: 2,
      typeLine: "Creature — Horse Mount",
      oracleText:
        "Whenever this creature attacks while saddled, you gain 2 life.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)",
      power: "2",
      toughness: "2",
      colors: ["W"],
      keywords: ["Saddle"],
      image: "",
      artCrop: "",
      legalities: { standard: "legal" },
    } satisfies RawCard,
    { abilities: [triggered(when.attacksSelf, [fx.gainLife(2)], { condition: cond.saddled })] },
    "TST",
  );

  it('"Mount 2" taps other creatures with power 2 or more; the Mount is saddled this turn', () => {
    let s = scenario({ p1: { battlefield: [MOUNT, "Bear Cub"] } });
    const mount = idOf(s, "p1", "battlefield", MOUNT.name);
    const saddle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === mount);
    expect(saddle?.type === "activate" && plainText(saddle.label ?? "")).toBe("Saddle 2");
    s = act(s, "p1", { type: "activate", source: mount, ability: saddle?.type === "activate" ? saddle.ability : -1 });
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    s = passBoth(s);
    expect(objectDidThisTurn(s, mount, "saddled")).toBe(true);
  });
});

describe("Clue and Map tokens", () => {
  it("Clue: {2}, sacrifice it: draw; Map: {1}, {T}, sacrifice it: a creature explores", () => {
    let s: GameState = scenario({
      p1: { battlefield: ["Forest", "Forest", "Forest", "Bear Cub"], library: ["Forest", "Forest"] },
    });
    const [clue] = createTokens(s, "p1", TOKEN_SPECS.Clue!, 1);
    const [map] = createTokens(s, "p1", TOKEN_SPECS.Map!, 1);
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: clue as string, ability: 0 });
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "activate", source: map as string, ability: 0, targets: { t: [bear] } });
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 2); // Forest revealed: in hand
  });
});
