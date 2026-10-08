/**
 * `checkInvariants` (fuzz et fumée) : chaque contrôle détecte bien l'incohérence qu'il vise.
 */
import { chars, type GameState } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { idOf, scenario } from "../../engine/test/helpers";
import { checkInvariants } from "../src/selfplay";

/** Nombre de cartes de chaque joueur, pour que seul le défaut introduit soit signalé. */
const sizes = (s: GameState) =>
  Object.fromEntries(s.playerOrder.map((p) => [p, Object.values(s.objects).filter((o) => o.owner === p && !o.isToken).length]));

describe("checkInvariants", () => {
  const base = () => scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });

  it("un état cohérent ne signale rien", () => {
    const s = base();
    expect(checkInvariants(s, sizes(s))).toEqual([]);
  });

  it("une valeur non sérialisable en JSON est signalée avec son chemin", () => {
    const s = base();
    const n = sizes(s);
    (s.players.p1 as unknown as Record<string, unknown>).x = [1, new Map()];
    expect(checkInvariants(s, n)).toEqual(["state not serializable to JSON: state.players.p1.x[1]: instance of Map"]);
    (s.players.p1 as unknown as Record<string, unknown>).x = undefined;
    s.players.p1!.life = Number.NaN;
    expect(checkInvariants(s, n).join("\n")).toContain("state.players.p1.life = NaN");
  });

  it("un cache des caractéristiques périmé (bump oublié) est signalé, champ par champ", () => {
    const s = base();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    chars(s, bear);
    s.objects[bear]!.counters["+1/+1"] = 2;
    expect(checkInvariants(s, sizes(s))).toEqual([expect.stringMatching(/stale characteristics cache \(power, toughness\)/)]);
  });

  it("un contrôle périmé (aucun effet ne justifie le contrôleur actuel) est signalé", () => {
    const s = base();
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s.objects[bear]!.baseController = "p2";
    s.objects[bear]!.controller = "p1";
    expect(checkInvariants(s, sizes(s)).join("\n")).toContain("stale control, p1 instead of p2");
  });
});
