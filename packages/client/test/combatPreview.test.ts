import type { GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { combatPreview } from "../src/board/combatPreview";

const creature = (id: string, controller: string, power: number, toughness: number, keywords: string[] = []) =>
  ({ id, controller, power, toughness, damage: 0, keywords }) as unknown as ObjectView;

const view = (...objs: ObjectView[]) => ({ battlefield: objs, players: { p1: {}, p2: {} } }) as unknown as GameView;

describe("aperçu des blessures de combat", () => {
  it("attaquant non bloqué : le défenseur perd sa force ; lien de vie : l'attaquant en gagne autant", () => {
    const v = view(creature("a", "p1", 3, 3, ["lifelink"]));
    expect(combatPreview(v, [{ id: "a", defender: "p2" }], {})).toEqual({ lifeLoss: { p2: 3, p1: -3 }, dies: [] });
  });

  it("blocage : chacun blesse l'autre ; le piétinement reporte l'excédent sur le joueur", () => {
    const v = view(creature("a", "p1", 5, 5, ["trample"]), creature("b", "p2", 2, 2));
    const p = combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" });
    expect(p?.lifeLoss).toEqual({ p2: 3 });
    expect(p?.dies).toEqual(["b"]);
  });

  it("initiative : un bloqueur tué d'abord ne blesse pas", () => {
    const v = view(creature("a", "p1", 2, 2, ["firstStrike"]), creature("b", "p2", 2, 2));
    expect(combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" })?.dies).toEqual(["b"]);
  });

  it("contact mortel : 1 blessure suffit, et le piétinement reporte le reste", () => {
    const v = view(creature("a", "p1", 4, 4, ["deathtouch", "trample"]), creature("b", "p2", 1, 6));
    const p = combatPreview(v, [{ id: "a", defender: "p2" }], { b: "a" });
    expect(p?.lifeLoss).toEqual({ p2: 3 });
    expect(p?.dies).toEqual(["b"]);
  });

  it("sans attaquant : pas d'aperçu", () => {
    expect(combatPreview(view(), [], {})).toBeNull();
  });
});
