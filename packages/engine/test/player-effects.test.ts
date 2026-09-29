/** Effets sur les joueurs créés par des résolutions (`s.playerEffects`, statics.ts). */
import { describe, expect, it } from "vitest";
import { gainLife } from "../src/actions";
import { landsAllowed } from "../src/stack";
import { addPlayerEffect, consumePlayerEffect, playerStatic, playerStaticTotal } from "../src/statics";
import { act, advanceUntil, idOf, passBoth, scenario } from "./helpers";

describe("effets sur les joueurs", () => {
  it("ce tour-ci : cumulés, puis expirés au tour suivant (terrains supplémentaires)", () => {
    const s = scenario({ p1: {} });
    addPlayerEffect(s, "p1", { extraLands: 1 }, s.turn.number);
    addPlayerEffect(s, "p1", { extraLands: 1 }, s.turn.number);
    expect(landsAllowed(s, "p1")).toBe(3);
    expect(landsAllowed(s, "p2")).toBe(1);
    const next = advanceUntil(s, (x) => x.turn.number > s.turn.number && x.turn.step === "main1");
    expect(landsAllowed(next, "p1")).toBe(1);
    expect(next.playerEffects).toEqual([]);
  });

  it("toute la partie : Screaming Nemesis (ne peut plus gagner de points de vie)", () => {
    const s = scenario({ p1: {} });
    addPlayerEffect(s, "p2", { cantGainLife: true }, null);
    gainLife(s, "p2", 3);
    gainLife(s, "p1", 3);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 20]);
    const later = advanceUntil(s, (x) => x.turn.number > s.turn.number + 2);
    expect(playerStatic(later, "p2", "cantGainLife")).toBe(true);
  });

  it("usage unique : Theorist's Proxy, le prochain sort seulement ne peut pas être contrecarré", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Llanowar Elves", "Llanowar Elves"] } });
    addPlayerEffect(s, "p1", { nextSpellUncounterable: true }, s.turn.number, true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(s.stack[s.stack.length - 1]?.uncounterable).toBe(true);
    s = passBoth(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(s.stack[s.stack.length - 1]?.uncounterable).toBeFalsy();
    expect(consumePlayerEffect(s, "p1", "nextSpellUncounterable")).toBe(false);
  });

  it("un booléen compte pour 1 dans un total (blessures doublées, cumulables)", () => {
    const s = scenario({ p1: {} });
    addPlayerEffect(s, "p2", { damageTakenDoubled: true }, s.turn.number + 1);
    addPlayerEffect(s, "p2", { damageTakenDoubled: true }, s.turn.number + 1);
    expect(playerStaticTotal(s, "p2", "damageTakenDoubled")).toBe(2);
  });
});
