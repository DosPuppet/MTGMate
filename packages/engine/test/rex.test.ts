/** Jurassic World Collection (REX) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { canBlock } from "../src/turn";
import { act, advanceUntil, attack, idOf, idsOf, lands, nameOf, scenario, settle, throughCombat } from "./helpers";

type S = ReturnType<typeof scenario>;
const castIt = (s: S, name: string, extra: object = {}) =>
  act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

describe("Jurassic World Collection", () => {
  it("Don't Move : détruit les créatures engagées ; jusqu'à votre prochain tour, une créature engagée est détruite", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Don't Move"] },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Llanowar Elves", "Forest"] },
    });
    s = settle(castIt(s, "Don't Move"));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "pass" }));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(act(s, "p2", { type: "tapForMana", source: idOf(s, "p2", "battlefield", "Llanowar Elves"), ability: 0 }));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Spitting Dilophosaurus : les créatures adverses avec un marqueur −1/−1 ne bloquent pas", () => {
    let s = scenario({
      p1: { battlefield: ["Spitting Dilophosaurus", "Bear Cub"] },
      p2: { battlefield: [{ name: "Shivan Dragon", counters: { "-1/-1": 1 } }] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(canBlock(s, idOf(s, "p2", "battlefield", "Shivan Dragon"), cub)).toBe(false);
  });

  it("Life Finds a Way : une créature non-jeton de force 4 ou plus arrive, peuplez", () => {
    let s = scenario({
      p1: { battlefield: ["Life Finds a Way", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Dragon Fodder"] },
    });
    s = settle(castIt(s, "Dragon Fodder"));
    s = settle(castIt(s, "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(3);
  });

  it("Savage Order : sacrifiez une créature de force 4 ; un Dinosaure de la bibliothèque, indestructible", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Shivan Dragon"], hand: ["Savage Order"], library: ["Polyraptor", "Forest"] },
    });
    s = settle(castIt(s, "Savage Order", { sacrifice: [idOf(s, "p1", "battlefield", "Shivan Dragon")] }));
    const raptor = idOf(s, "p1", "battlefield", "Polyraptor");
    expect(raptor).toBeDefined();
    destroy(s, raptor);
    expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(1);
  });

  it("Compy Swarm : à votre étape de fin, si une créature est morte, un jeton copie engagé", () => {
    let s = scenario({ p1: { battlefield: ["Compy Swarm", "Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Compy Swarm")).toHaveLength(2);
  });

  it("Ravenous Tyrannosaurus : en attaquant, blessures égales à sa force ; l'excès au contrôleur", () => {
    let s = scenario({ p1: { battlefield: ["Ravenous Tyrannosaurus"] }, p2: { battlefield: ["Bear Cub"] } });
    const rex = idOf(s, "p1", "battlefield", "Ravenous Tyrannosaurus");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = throughCombat(attack(s, [rex]), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // 4 blessures en excès (6 − 2), puis 6 de combat.
    expect(s.players.p2?.life).toBe(10);
  });

  it("Permission Denied : contrecarre un sort non-créature ; les adversaires n'en lancent plus ce tour-ci", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Island"], hand: ["Permission Denied"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    s = settle(castIt(s, "Permission Denied", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.pending?.kind === "priority" && s.pending.player === "p2").toBe(true);
  });

  describe("G4e : sous-lot difficile", () => {
    it("Grim Giganotosaurus : monstruosité 10, moins chère par créature adverse de force 4 ; détruit les autres artefacts et créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Giganotosaurus", ...lands("Swamp", 6), ...lands("Forest", 5), "Bear Cub"] },
        p2: { battlefield: ["Shivan Dragon", "Mana Crypt"] },
      });
      const giga = idOf(s, "p1", "battlefield", "Grim Giganotosaurus");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === giga);
      s = settle(act(s, "p1", { type: "activate", source: giga, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect(s.objects[giga]?.counters["+1/+1"]).toBe(10);
      expect(
        s.battlefield.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land")).map((id) => nameOf(s, id)),
      ).toEqual(["Grim Giganotosaurus"]);
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === giga)).toBe(false);
    });

    it("Indoraptor : soif de sang, autant de marqueurs que de blessures infligées aux adversaires ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Swamp"], hand: ["Shock", "Indoraptor, the Perfect Hybrid"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indoraptor, the Perfect Hybrid") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Indoraptor, the Perfect Hybrid")]?.counters["+1/+1"]).toBe(2);
    });

    it("Henry Wu : vos Humains exploitent ; exploiter une créature non-Humain fait piocher (et un Trésor si force 3)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Henry Wu, InGen Geneticist", "Shivan Dragon", ...lands("Plains", 2)],
          hand: ["Soul Warden"],
          library: lands("Plains", 5),
        },
      });
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Soul Warden") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand.length).toBeGreaterThanOrEqual(1);
    });
  });
});
