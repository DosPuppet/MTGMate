/** Mana phyrexian (107.4f, PLAN-G G4e) : chaque {C/P} se paie avec un mana de cette couleur ou 2 points de vie. */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { costToText, manaValue, parseManaCost } from "../src/mana";
import { chars } from "../src/state";
import { act, idOf, idsOf, lands, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;
const castable = (s: S, name: string) =>
  legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

describe("mana phyrexian", () => {
  it("se lit, s'écrit et compte dans la valeur de mana", () => {
    const c = parseManaCost("{1}{B/P}{B/P}");
    expect([manaValue(c), costToText(c), c.phyrexian]).toEqual([3, "{1}{B/P}{B/P}", ["B", "B"]]);
  });

  it("Dismember : avec un seul terrain, les deux {B/P} se paient avec 4 PV", () => {
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Dismember"] }, p2: { battlefield: ["Shivan Dragon"] } });
    expect(castable(s, "Dismember")).toBe(true);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dismember"), targets: { t: [dragon] } }));
    expect([s.players.p1?.life, idsOf(s, "p2", "graveyard", "Shivan Dragon").length]).toEqual([16, 1]);
  });

  it("Dismember : avec des Marais, le mana d'abord (aucun PV payé)", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Dismember"] }, p2: { battlefield: ["Bear Cub"] } });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Dismember"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(s.players.p1?.life).toBe(20);
  });

  it("pas assez de PV : le sort n'est pas proposé", () => {
    const s = scenario({ p1: { life: 1, hand: ["Noxious Revival"], graveyard: ["Bear Cub"] } });
    expect(castable(s, "Noxious Revival")).toBe(false);
  });

  it("K'rrik : chaque {B} de vos coûts se paie aussi avec 2 PV ; un sort noir lui donne un marqueur", () => {
    let s = scenario({
      p1: { battlefield: ["K'rrik, Son of Yawgmoth", "Island"], hand: ["Tragic Slip"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(castable(s, "Tragic Slip")).toBe(true);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Tragic Slip"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(s.players.p1?.life).toBe(18);
    expect(s.objects[idOf(s, "p1", "battlefield", "K'rrik, Son of Yawgmoth")]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).power).toBe(1);
  });
});
