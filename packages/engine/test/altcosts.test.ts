/** Coûts alternatifs qui font payer autre chose que du mana (PLAN-G G4e) : Force of Will, Daze, Force of Vigor. */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { act, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;
const opt = (s: S, name: string) =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
/** p2 lance un Shock sur p1, puis p1 a la priorité. */
const shockFirst = (s: S) => {
  const t = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
  return act(t, "p2", { type: "pass" });
};

describe("coûts alternatifs à payer autrement", () => {
  it("Force of Will : 1 PV et une carte bleue exilée de la main ; contrecarre", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Opt", "Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    const o = opt(s, "Force of Will");
    expect(o?.type === "cast" && o.altAvailable).toBe(true);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Will"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
      }),
    );
    expect(s.players.p1?.life).toBe(19);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Force of Will : sans autre carte bleue en main, pas de coût alternatif", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    expect(opt(s, "Force of Will")).toBeUndefined();
  });

  it("Daze : une Île renvoyée en main à la place du mana", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Island"], hand: ["Daze"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Daze"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
      }),
    );
    expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Force of Vigor : gratuite en exilant une carte verte, seulement pendant le tour d'un autre joueur", () => {
    const mine = scenario({ p1: { hand: ["Force of Vigor", "Bear Cub"] }, p2: { battlefield: ["Ghostly Prison"] } });
    expect(opt(mine, "Force of Vigor")).toBeUndefined();
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Vigor", "Bear Cub"] },
      p2: { battlefield: ["Ghostly Prison", ...lands("Mountain", 1)], hand: ["Shock"] },
    });
    s = shockFirst(s);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Vigor"),
        alternative: true,
        targets: { t: [idOf(s, "p2", "battlefield", "Ghostly Prison")] },
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Ghostly Prison")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });
});
