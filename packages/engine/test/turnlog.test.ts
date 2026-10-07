/** Journal des événements du tour (`turnlog.ts`) : enregistrement par le moteur et requêtes des cartes. */
import { describe, expect, it } from "vitest";
import { dealDamage, sacrifice, sourceFromObject } from "../src/actions";
import { moveObject } from "../src/state";
import { matchesObjectFilter } from "../src/targets";
import { countTurnEvents } from "../src/turnlog";
import type { TurnLogQuery } from "../src/types";
import { act, advanceUntil, idOf, scenario } from "./helpers";

describe("journal du tour", () => {
  it("filtre : un champ propre à l'objet dans `not` ou `anyOf` est évalué (« une créature qui n'a pas attaqué ce tour-ci »)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Savannah Lions"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    s.turnLog.push({ e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: ["Bear"], id: cub });
    const notAttacked = { types: ["Creature" as const], not: { attackedThisTurn: true } };
    expect(matchesObjectFilter(s, "p1", cub, notAttacked)).toBe(false);
    expect(matchesObjectFilter(s, "p1", lions, notAttacked)).toBe(true);
    const attackedOrLions = { anyOf: [{ attackedThisTurn: true }, { subtype: "Cat" }] };
    expect(matchesObjectFilter(s, "p1", cub, attackedOrLions)).toBe(true);
    expect(matchesObjectFilter(s, "p1", lions, attackedOrLions)).toBe(true);
  });

  it("créatures adverses exilées depuis le champ de bataille (Vren)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Bear Cub", "Forest"] } });
    moveObject(s, idOf(s, "p2", "battlefield", "Bear Cub"), "exile");
    moveObject(s, idOf(s, "p2", "battlefield", "Forest"), "exile");
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "exile");
    const q: TurnLogQuery = { event: "zone", from: "battlefield", to: "exile", types: ["Creature"], who: "opponent" };
    expect(countTurnEvents(s, q, "p1")).toBe(1);
    expect(countTurnEvents(s, q, "p2")).toBe(1);
  });

  it("Nourriture sacrifiée, sort lancé depuis la main", () => {
    let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Llanowar Elves"] } });
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p1")).toBe(0);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p1")).toBe(1);
    expect(countTurnEvents(s, { event: "cast", who: "you", fromZone: "hand" }, "p2")).toBe(0);
    const t = scenario({ p1: { battlefield: ["Forest"] } });
    sacrifice(t, idOf(t, "p1", "battlefield", "Forest"));
    expect(countTurnEvents(t, { event: "sacrifice", who: "you" }, "p1")).toBe(1);
    expect(countTurnEvents(t, { event: "sacrifice", who: "you", subtype: "Food" }, "p1")).toBe(0);
  });

  it("blessures de combat par joueur (le plus grand total) et sources", () => {
    const s = scenario({ p1: { battlefield: ["Shivan Dragon", "Bear Cub"] } });
    const dragon = sourceFromObject(s, idOf(s, "p1", "battlefield", "Shivan Dragon"));
    const cub = sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    dealDamage(s, dragon, "p2", 5, true);
    dealDamage(s, cub, "p2", 2, true);
    dealDamage(s, cub, "p1", 3, false);
    const combat: TurnLogQuery = { event: "damage", toPlayer: true, combat: true, sum: true, perPlayer: true };
    expect(countTurnEvents(s, combat, "p1")).toBe(7);
    expect(countTurnEvents(s, { event: "damage", sum: true, source: { colors: ["R"], controller: "you" } }, "p1")).toBe(5);
    expect(countTurnEvents(s, { event: "damage", combat: false, who: "you", sum: true }, "p1")).toBe(3);
  });

  it("le journal repart de zéro au tour suivant", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "graveyard");
    expect(s.turnLog.length).toBeGreaterThan(0);
    const turn = s.turn.number;
    s = advanceUntil(s, (x) => x.turn.number === turn + 1 && x.turn.step === "upkeep");
    // La pioche du nouveau tour n'y figure pas (bibliothèque → main : information cachée).
    expect(s.turnLog).toEqual([]);
  });
});
