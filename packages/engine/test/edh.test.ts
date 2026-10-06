/**
 * Commander (pseudo-ensemble EDH, PLAN-E) : tests de règles des cartes des decks Commander. E6 : cartes qui citent le
 * commandant (mana de son identité, « si vous contrôlez un commandant », éminence) ou les adversaires (mana de leurs
 * terrains, « deux adversaires ou plus »).
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, ObjectId, PlayerId } from "../src/types";
import { act, attack, idOf, idsOf, lands, nameOf, passAccepting, scenario, settle, throughCombat } from "./helpers";

/** Fait d'un objet un commandant (déjà sur le champ de bataille). */
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
  describe("mana de l'identité du commandant (903.4)", () => {
    it("Command Tower et Arcane Signet : les couleurs de l'identité du commandant", () => {
      const s = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Command Tower", "Arcane Signet"] } });
      expect(produced(s, idOf(s, "p1", "battlefield", "Command Tower"))).toEqual(["W", "B", "R"]);
      expect(produced(s, idOf(s, "p1", "battlefield", "Arcane Signet"))).toEqual(["W", "B", "R"]);
    });

    it("sans commandant, aucun mana (903.4f) ; le commandant d'un adversaire ne compte pas", () => {
      const s = scenario({ p1: { battlefield: ["Command Tower"] }, p2: { command: ["Edgar Markov"] } });
      expect(produced(s, idOf(s, "p1", "battlefield", "Command Tower"))).toEqual([]);
      // Rien à engager pour du mana.
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana")).toBe(false);
    });

    it("Path of Ancestry arrive engagé et produit l'identité du commandant", () => {
      let s = scenario({ p1: { command: ["Arahbo, the First Fang"], hand: ["Path of Ancestry"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Path of Ancestry") });
      const path = idOf(s, "p1", "battlefield", "Path of Ancestry");
      expect(s.objects[path]?.tapped).toBe(true);
      expect(produced(s, path)).toEqual(["W"]);
    });

    /** Lance la carte de la main de p1 et résout tout ; dit si un regard a eu lieu. */
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

    it("Path of Ancestry : regard 1 si son mana lance une créature qui partage un type avec le commandant", () => {
      const s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Vampire of the Dire Moon"] },
      });
      const r = castScrying(s, "Vampire of the Dire Moon");
      expect(r.scried).toBe(true);
      expect(idsOf(r.s, "p1", "battlefield", "Vampire of the Dire Moon")).toHaveLength(1);
    });

    it("Path of Ancestry : mana engagé à la main d'abord (réserve marquée), le regard a lieu aussi", () => {
      const s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Vampire of the Dire Moon"] },
      });
      expect(castScrying(s, "Vampire of the Dire Moon", "Path of Ancestry").scried).toBe(true);
    });

    it("Path of Ancestry : pas de regard pour une créature sans type commun, ni avec le mana d'un autre terrain", () => {
      const lions = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry"], hand: ["Savannah Lions"] } });
      expect(castScrying(lions, "Savannah Lions").scried).toBe(false);
      const swamp = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Path of Ancestry", "Swamp"], hand: ["Vampire of the Dire Moon"] },
      });
      expect(castScrying(swamp, "Vampire of the Dire Moon", "Swamp").scried).toBe(false);
    });

    it("Path of Ancestry : le commandant compte où qu'il soit (sur le champ de bataille aussi) ; sans commandant, rien", () => {
      const s = scenario({
        p1: { battlefield: ["Edgar Markov", "Path of Ancestry", "Swamp"], hand: ["Vampire of the Dire Moon"] },
      });
      // Sans commandant, Path of Ancestry ne produit rien (903.4f) : le Marais paie, pas de regard.
      expect(castScrying(structuredClone(s), "Vampire of the Dire Moon").scried).toBe(false);
      makeCommander(s, idOf(s, "p1", "battlefield", "Edgar Markov"));
      expect(castScrying(s, "Vampire of the Dire Moon", "Path of Ancestry").scried).toBe(true);
    });
  });

  describe("mana des terrains adverses : Exotic Orchard, Fellwar Stone", () => {
    it("les couleurs que pourraient produire les terrains des adversaires, pas les siens ni l'incolore", () => {
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

  describe("« deux adversaires ou plus » : Luxury Suite, Vault of Champions", () => {
    it("en duel, arrive engagé ; à trois joueurs, dégagé", () => {
      let duel = scenario({ p1: { hand: ["Luxury Suite"] } });
      duel = act(duel, "p1", { type: "playLand", card: idOf(duel, "p1", "hand", "Luxury Suite") });
      expect(duel.objects[idOf(duel, "p1", "battlefield", "Luxury Suite")]?.tapped).toBe(true);
      let multi = scenario({ players: 3, p1: { hand: ["Vault of Champions"] } });
      multi = act(multi, "p1", { type: "playLand", card: idOf(multi, "p1", "hand", "Vault of Champions") });
      expect(multi.objects[idOf(multi, "p1", "battlefield", "Vault of Champions")]?.tapped).toBe(false);
    });
  });

  describe("« si vous contrôlez un commandant, vous pouvez lancer ce sort sans payer son coût de mana »", () => {
    it("Fierce Guardianship : gratuit en contrôlant son commandant, sinon {2}{U} ; contrecarre un sort non-créature", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Arahbo, the First Fang"], hand: ["Fierce Guardianship"] },
        p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
      });
      const fg = idOf(s, "p1", "hand", "Fierce Guardianship");
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      // Pas de commandant, pas d'île : rien à lancer.
      expect(s.pending).toMatchObject({ kind: "priority", player: "p1" });
      expect(castOption(s, "p1", fg)).toEqual([]);
      makeCommander(s, idOf(s, "p1", "battlefield", "Arahbo, the First Fang"));
      expect(castOption(s, "p1", fg).some((a) => a.type === "cast" && a.altAvailable)).toBe(true);
      s = act(s, "p1", { type: "cast", card: fg, alternative: true, targets: { t: [s.stack[0]?.id as string] } });
      s = passAccepting(s, (x) => x.stack.length === 0);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    });

    it("le commandant d'un adversaire ne compte pas ; un commandant dans la zone de commandement non plus", () => {
      const s = scenario({
        p1: { command: ["Arahbo, the First Fang"], hand: ["Deadly Rollick"] },
        p2: { battlefield: ["Edgar Markov"] },
      });
      makeCommander(s, idOf(s, "p2", "battlefield", "Edgar Markov"));
      expect(castOption(s, "p1", idOf(s, "p1", "hand", "Deadly Rollick"))).toEqual([]);
    });

    it("Deadly Rollick exile ; Flawless Maneuver rend vos créatures indestructibles jusqu'à la fin du tour", () => {
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

  describe("éminence (113.6) : Edgar Markov", () => {
    it("depuis la zone de commandement, chaque autre sort de Vampire lancé crée un Vampire 1/1 noir", () => {
      let s = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["Swamp"], hand: ["Vampire of the Dire Moon"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      s = settle(s);
      expect(tokens(s, "p1", "Vampire")).toHaveLength(1);
      expect(s.objects[tokens(s, "p1", "Vampire")[0] ?? ""]?.defId).toBeDefined();
    });

    it("pas depuis la main (la capacité ne fonctionne que dans la zone de commandement ou sur le champ de bataille)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Edgar Markov", "Vampire of the Dire Moon"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      s = settle(s);
      expect(tokens(s, "p1", "Vampire")).toEqual([]);
    });

    it("sur le champ de bataille : éminence, et en attaquant, un marqueur +1/+1 sur chaque Vampire", () => {
      let s = scenario({ p1: { battlefield: ["Edgar Markov", "Vampire of the Dire Moon"] } });
      const edgar = idOf(s, "p1", "battlefield", "Edgar Markov");
      s = throughCombat(attack(s, [edgar]));
      expect(s.objects[edgar]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Vampire of the Dire Moon")]?.counters["+1/+1"]).toBe(1);
      expect(card("Edgar Markov").keywords).toEqual(expect.arrayContaining(["firstStrike", "haste"]));
    });
  });
});

describe("Exotic Orchard chez deux joueurs", () => {
  it("deux sources « comme les terrains adverses » ne se consultent pas l'une l'autre (pas de récursion infinie)", () => {
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
