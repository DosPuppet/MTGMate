/** Effets sur les joueurs créés par des résolutions (`s.playerEffects`, statics.ts). */
import { describe, expect, it } from "vitest";
import { dealDamage, gainLife, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { landsAllowed } from "../src/stack";
import { addPlayerEffect, consumePlayerEffect, playerStatic, playerStaticTotal } from "../src/statics";
import { attackableDefenders } from "../src/turn";
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

describe("interdictions et permissions du tour (effets sur les joueurs)", () => {
  it("Sandswirl Wanderglyph : ne peut pas attaquer ce joueur ce tour-ci, les autres oui", () => {
    const s = scenario({ players: 3, active: "p2", p1: {}, p2: {}, p3: {} });
    addPlayerEffect(s, "p2", { cantAttackPlayer: "p1" }, s.turn.number);
    expect(attackableDefenders(s, "p2")).toEqual(["p3"]);
    expect(attackableDefenders(s, "p3")).toContain("p1");
  });

  it("The Tomb of Aclazotz : un seul sort de créature depuis le cimetière, avec un marqueur de finalité", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], graveyard: ["Llanowar Elves", "Llanowar Elves"] } });
    const castable = () =>
      legalActions(s, "p1").filter((x) => x.type === "cast" && s.objects[x.card]?.zone === "graveyard").length;
    expect(castable()).toBe(0);
    addPlayerEffect(s, "p1", { castCreatureFromGraveyard: true }, s.turn.number, true);
    expect(castable()).toBe(2);
    s = passBoth(act(s, "p1", { type: "cast", card: s.players.p1?.graveyard[0] as string }));
    expect(castable()).toBe(0);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(s.objects[elves]?.counters.finality).toBe(1);
  });

  it("Summon: Alexander : blessures prévenues sur vos créatures, pas sur vous", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Shivan Dragon"] } });
    addPlayerEffect(s, "p1", { creaturesDamageImmune: true }, s.turn.number);
    const dragon = sourceFromObject(s, idOf(s, "p2", "battlefield", "Shivan Dragon"));
    dealDamage(s, dragon, idOf(s, "p1", "battlefield", "Bear Cub"), 3, false);
    dealDamage(s, dragon, "p1", 3, false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.damage).toBe(0);
    expect(s.players.p1?.life).toBe(17);
  });
});
