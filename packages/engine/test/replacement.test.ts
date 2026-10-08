/** "Instead of going to the graveyard" replacements (614.1a) and their order (616.1): `replaceGraveyard`, replacement.ts. */
import { describe, expect, it } from "vitest";
import { moveObject } from "../src/state";
import type { GameState } from "../src/types";
import { idOf, scenario } from "./helpers";

const nameIn = (s: GameState, zone: "exile" | "graveyard" | "library", player: "p1" | "p2", name: string) => {
  const ids = zone === "exile" ? s.exile : (s.players[player]?.[zone] ?? []);
  return ids.some((id) => s.objects[id]?.owner === player && s.defs[s.objects[id]?.defId ?? ""]?.name === name);
};

describe('"Instead of going to the graveyard" replacements (614.1a, 616.1)', () => {
  it("616.1a: the self-replacement goes before the finality counter (Darksteel Colossus shuffled)", () => {
    const s = scenario({ p1: { battlefield: ["Darksteel Colossus"], library: ["Forest", "Forest"] } });
    const colossus = idOf(s, "p1", "battlefield", "Darksteel Colossus");
    (s.objects[colossus] as { counters: Record<string, number> }).counters.finality = 1;
    moveObject(s, colossus, "graveyard");
    expect(nameIn(s, "library", "p1", "Darksteel Colossus")).toBe(true);
    expect(nameIn(s, "exile", "p1", "Darksteel Colossus")).toBe(false);
  });

  it("The Darkness Crystal alone: the opposing creature is exiled, linked, and its controller gains 2 life", () => {
    const s = scenario({ p1: { battlefield: ["The Darkness Crystal"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const uid = s.objects[bear]?.uid;
    moveObject(s, bear, "graveyard");
    expect(nameIn(s, "exile", "p2", "Bear Cub")).toBe(true);
    expect(s.players.p1?.life).toBe(22);
    expect(s.objects[idOf(s, "p1", "battlefield", "The Darkness Crystal")]?.linkedUids).toContain(uid);
  });

  it("616.1e: with Rest in Peace, the affected player sets aside the replacement that benefits the opponent", () => {
    const s = scenario({
      p1: { battlefield: ["The Darkness Crystal"] },
      p2: { battlefield: ["Bear Cub", "Rest in Peace"] },
    });
    moveObject(s, idOf(s, "p2", "battlefield", "Bear Cub"), "graveyard");
    expect(nameIn(s, "exile", "p2", "Bear Cub")).toBe(true);
    // Only one replacement applies (616.1f): Rest in Peace, not the Crystal (no life).
    expect(s.players.p1?.life).toBe(20);
  });

  it("Leyline of the Void: a card discarded by an opponent is exiled, not yours", () => {
    const s = scenario({
      p1: { battlefield: ["Leyline of the Void"], hand: ["Forest"] },
      p2: { hand: ["Forest"] },
    });
    moveObject(s, idOf(s, "p2", "hand", "Forest"), "graveyard");
    moveObject(s, idOf(s, "p1", "hand", "Forest"), "graveyard");
    expect(nameIn(s, "exile", "p2", "Forest")).toBe(true);
    expect(nameIn(s, "graveyard", "p1", "Forest")).toBe(true);
  });

  it("Dryad Militant: only instants and sorceries are exiled", () => {
    const s = scenario({ p1: { battlefield: ["Dryad Militant"], hand: ["Opt", "Forest"] } });
    moveObject(s, idOf(s, "p1", "hand", "Opt"), "graveyard");
    moveObject(s, idOf(s, "p1", "hand", "Forest"), "graveyard");
    expect(nameIn(s, "exile", "p1", "Opt")).toBe(true);
    expect(nameIn(s, "graveyard", "p1", "Forest")).toBe(true);
  });

  it("Valgavoth: the exiled opposing card is linked to Valgavoth", () => {
    const s = scenario({ p1: { battlefield: ["Valgavoth, Terror Eater"] }, p2: { hand: ["Opt"] } });
    const opt = moveObject(s, idOf(s, "p2", "hand", "Opt"), "graveyard") as string;
    expect(s.objects[opt]?.zone).toBe("exile");
    expect(s.objects[idOf(s, "p1", "battlefield", "Valgavoth, Terror Eater")]?.linked).toContain(opt);
  });

  it("Garruk, Veiled Butcher: only opposing creatures that die", () => {
    const s = scenario({
      p1: { battlefield: ["Garruk, Veiled Butcher", "Bear Cub"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    moveObject(s, idOf(s, "p2", "battlefield", "Bear Cub"), "graveyard");
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "graveyard");
    expect(nameIn(s, "exile", "p2", "Bear Cub")).toBe(true);
    expect(nameIn(s, "graveyard", "p1", "Bear Cub")).toBe(true);
  });
});
