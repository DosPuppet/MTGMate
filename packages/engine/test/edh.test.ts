/**
 * Commander (EDH pseudo-set, PLAN-E): rules tests for the cards of the Commander decks. E6: cards that reference the
 * commander (mana of its identity, "if you control a commander", eminence) or the opponents (mana of their
 * lands, "two or more opponents").
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, ObjectId, PlayerId } from "../src/types";
import { act, attack, idOf, idsOf, lands, nameOf, passAccepting, scenario, settle, throughCombat } from "./helpers";

/** Makes an object a commander (already on the battlefield). */
function makeCommander(s: GameState, id: ObjectId): GameState {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  bump(s);
  return s;
}
const produced = (s: GameState, id: ObjectId) => manaAbilitiesOf(s, id).flatMap((m) => m.produce);
const castOption = (s: GameState, player: PlayerId, cardId: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === cardId);
const tokens = (s: GameState, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && nameOf(s, id) === name);

describe("Commander (EDH)", () => {
  describe("mana of the commander's identity (903.4)", () => {
    it("Command Tower and Arcane Signet: the colors of the commander's identity", () => {
      const s = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Command Tower", "Arcane Signet"] } });
      expect(produced(s, idOf(s, "p1", "battlefield", "Command Tower"))).toEqual(["W", "B", "R"]);
      expect(produced(s, idOf(s, "p1", "battlefield", "Arcane Signet"))).toEqual(["W", "B", "R"]);
    });

    it("without a commander, no mana (903.4f); an opponent's commander does not count", () => {
      const s = scenario({ p1: { battlefield: ["Command Tower"] }, p2: { command: ["Edgar Markov"] } });
      expect(produced(s, idOf(s, "p1", "battlefield", "Command Tower"))).toEqual([]);
      // Nothing to tap for mana.
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana")).toBe(false);
    });

    it("Path of Ancestry enters tapped and produces the commander's identity", () => {
      let s = scenario({ p1: { command: ["Arahbo, the First Fang"], hand: ["Path of Ancestry"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Path of Ancestry") });
      const path = idOf(s, "p1", "battlefield", "Path of Ancestry");
      expect(s.objects[path]?.tapped).toBe(true);
      expect(produced(s, path)).toEqual(["W"]);
    });

    /** Casts the card from p1's hand and resolves everything; tells whether a scry happened. */
    const castScrying = (s: GameState, name: string, tapFirst?: string): { s: GameState; scried: boolean } => {
      if (tapFirst)
        s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", tapFirst), ability: 0, color: "B" });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) });
      let scried = false;
      s = settle(s, (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      return { s, scried };
    };

    it("Path of Ancestry: scry 1 if its mana casts a creature that shares a type with the commander", () => {
      const s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Vampire of the Dire Moon"] },
      });
      const r = castScrying(s, "Vampire of the Dire Moon");
      expect(r.scried).toBe(true);
      expect(idsOf(r.s, "p1", "battlefield", "Vampire of the Dire Moon")).toHaveLength(1);
    });

    it("Path of Ancestry: mana tapped by hand first (pool marked), the scry happens too", () => {
      const s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Vampire of the Dire Moon"] },
      });
      expect(castScrying(s, "Vampire of the Dire Moon", "Path of Ancestry").scried).toBe(true);
    });

    it("Path of Ancestry: no scry for a creature with no shared type, nor with another land's mana", () => {
      const lions = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Savannah Lions"] } });
      expect(castScrying(lions, "Savannah Lions").scried).toBe(false);
      const swamp = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry", "Swamp"], hand: ["Vampire of the Dire Moon"] },
      });
      expect(castScrying(swamp, "Vampire of the Dire Moon", "Swamp").scried).toBe(false);
    });

    it("Path of Ancestry: the commander counts wherever it is (on the battlefield too); without a commander, nothing", () => {
      const s = scenario({
        p1: { battlefield: ["Edgar Markov", "Path of Ancestry", "Swamp"], hand: ["Vampire of the Dire Moon"] },
      });
      // Without a commander, Path of Ancestry produces nothing (903.4f): the Swamp pays, no scry.
      expect(castScrying(structuredClone(s), "Vampire of the Dire Moon").scried).toBe(false);
      makeCommander(s, idOf(s, "p1", "battlefield", "Edgar Markov"));
      expect(castScrying(s, "Vampire of the Dire Moon", "Path of Ancestry").scried).toBe(true);
    });
  });

  describe("mana of opposing lands: Exotic Orchard, Fellwar Stone", () => {
    it("the colors that opponents' lands could produce, not one's own nor colorless", () => {
      const s = scenario({
        players: 3,
        p1: { battlefield: ["Exotic Orchard", "Fellwar Stone", "Forest"] },
        p2: { battlefield: ["Island", "Command Tower"] },
        p3: { battlefield: ["Mountain"] },
      });
      expect(produced(s, idOf(s, "p1", "battlefield", "Exotic Orchard"))).toEqual(["U", "R"]);
      expect(produced(s, idOf(s, "p1", "battlefield", "Fellwar Stone"))).toEqual(["U", "R"]);
    });
  });

  describe('"two or more opponents": Luxury Suite, Vault of Champions', () => {
    it("in a duel, enters tapped; with three players, untapped", () => {
      let duel = scenario({ p1: { hand: ["Luxury Suite"] } });
      duel = act(duel, "p1", { type: "playLand", card: idOf(duel, "p1", "hand", "Luxury Suite") });
      expect(duel.objects[idOf(duel, "p1", "battlefield", "Luxury Suite")]?.tapped).toBe(true);
      let multi = scenario({ players: 3, p1: { hand: ["Vault of Champions"] } });
      multi = act(multi, "p1", { type: "playLand", card: idOf(multi, "p1", "hand", "Vault of Champions") });
      expect(multi.objects[idOf(multi, "p1", "battlefield", "Vault of Champions")]?.tapped).toBe(false);
    });
  });

  describe('"if you control a commander, you may cast this spell without paying its mana cost"', () => {
    it("Fierce Guardianship: free while controlling one's commander, otherwise {2}{U}; counters a noncreature spell", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Arahbo, the First Fang"], hand: ["Fierce Guardianship"] },
        p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
      });
      const fg = idOf(s, "p1", "hand", "Fierce Guardianship");
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      // No commander, no Island: nothing to cast.
      expect(s.pending).toMatchObject({ kind: "priority", player: "p1" });
      expect(castOption(s, "p1", fg)).toEqual([]);
      makeCommander(s, idOf(s, "p1", "battlefield", "Arahbo, the First Fang"));
      expect(castOption(s, "p1", fg).some((a) => a.type === "cast" && a.altAvailable)).toBe(true);
      s = act(s, "p1", { type: "cast", card: fg, alternative: true, targets: { t: [s.stack[0]?.id as string] } });
      s = passAccepting(s, (x) => x.stack.length === 0);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    });

    it("an opponent's commander does not count; neither does a commander in the command zone", () => {
      const s = scenario({
        p1: { command: ["Arahbo, the First Fang"], hand: ["Deadly Rollick"] },
        p2: { battlefield: ["Edgar Markov"] },
      });
      makeCommander(s, idOf(s, "p2", "battlefield", "Edgar Markov"));
      expect(castOption(s, "p1", idOf(s, "p1", "hand", "Deadly Rollick"))).toEqual([]);
    });

    it("Deadly Rollick exiles; Flawless Maneuver makes your creatures indestructible until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Arahbo, the First Fang", "Savannah Lions"], hand: ["Deadly Rollick", "Flawless Maneuver"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      makeCommander(s, idOf(s, "p1", "battlefield", "Arahbo, the First Fang"));
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Deadly Rollick"),
        alternative: true,
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      });
      s = settle(s);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flawless Maneuver"), alternative: true });
      s = settle(s);
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(s.effects.some((e) => e.affected.includes(lions) && e.addKeywords?.includes("indestructible"))).toBe(true);
    });
  });

  describe("eminence (113.6): Edgar Markov", () => {
    it("from the command zone, each other Vampire spell cast creates a 1/1 black Vampire", () => {
      let s = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Swamp"], hand: ["Vampire of the Dire Moon"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      s = settle(s);
      expect(tokens(s, "p1", "Vampire")).toHaveLength(1);
      expect(s.objects[tokens(s, "p1", "Vampire")[0] ?? ""]?.defId).toBeDefined();
    });

    it("not from the hand (the ability only works in the command zone or on the battlefield)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Edgar Markov", "Vampire of the Dire Moon"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      s = settle(s);
      expect(tokens(s, "p1", "Vampire")).toEqual([]);
    });

    it("on the battlefield: eminence, and when attacking, a +1/+1 counter on each Vampire", () => {
      let s = scenario({ p1: { battlefield: ["Edgar Markov", "Vampire of the Dire Moon"] } });
      const edgar = idOf(s, "p1", "battlefield", "Edgar Markov");
      s = throughCombat(attack(s, [edgar]));
      expect(s.objects[edgar]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Vampire of the Dire Moon")]?.counters["+1/+1"]).toBe(1);
      expect(card("Edgar Markov").keywords).toEqual(expect.arrayContaining(["firstStrike", "haste"]));
    });
  });
});

describe("Exotic Orchard with two players", () => {
  it('two "like opposing lands" sources do not consult each other (no infinite recursion)', () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Exotic Orchard"] },
      p2: { battlefield: ["Exotic Orchard", "Island"] },
      p3: { battlefield: ["Fellwar Stone", "Mountain"] },
    });
    expect(produced(s, idOf(s, "p1", "battlefield", "Exotic Orchard"))).toEqual(["U", "R"]);
    expect(produced(s, idOf(s, "p2", "battlefield", "Exotic Orchard"))).toEqual(["R"]);
  });
});
