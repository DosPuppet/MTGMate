/** Effets sur les joueurs créés par des résolutions (`s.playerEffects`, statics.ts). */
import { describe, expect, it } from "vitest";
import { dealDamage, gainLife, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { landsAllowed } from "../src/stack";
import { addPlayerEffect, consumePlayerEffect, playerStatic, playerStaticTotal } from "../src/statics";
import { attackableDefenders } from "../src/turn";
import { act, advanceUntil, customCard, idOf, lands, passBoth, scenario } from "./helpers";

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
    addPlayerEffect(s, "p1", { nextSpell: { uncounterable: true } }, s.turn.number, true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(s.stack[s.stack.length - 1]?.uncounterable).toBe(true);
    s = passBoth(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    expect(s.stack[s.stack.length - 1]?.uncounterable).toBeFalsy();
    expect(consumePlayerEffect(s, "p1", "nextSpell")).toBe(false);
  });

  it("un booléen compte pour 1 dans un total (cumulable)", () => {
    const s = scenario({ p1: {} });
    addPlayerEffect(s, "p2", { landsEnterUntapped: true }, s.turn.number + 1);
    addPlayerEffect(s, "p2", { landsEnterUntapped: true }, s.turn.number + 1);
    expect(playerStaticTotal(s, "p2", "landsEnterUntapped")).toBe(2);
  });

  it("deux effets « blessures doublées » se cumulent (remplacements, R1)", () => {
    const s = scenario({ p1: { battlefield: ["Shivan Dragon"] } });
    const doubled = { replacement: { event: "damage" as const, to: "yourSide" as const, modify: { times: 2 } } };
    addPlayerEffect(s, "p2", doubled, s.turn.number + 1);
    addPlayerEffect(s, "p2", doubled, s.turn.number + 1);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Shivan Dragon")), "p2", 3, false);
    expect(s.players.p2?.life).toBe(20 - 12);
  });
});

describe("interdictions et permissions du tour (effets sur les joueurs)", () => {
  it("Sandswirl Wanderglyph : ne peut pas attaquer ce joueur ce tour-ci, les autres oui", () => {
    const s = scenario({ players: 3, active: "p2", p1: {}, p2: {}, p3: {} });
    addPlayerEffect(s, "p2", { cantAttack: { of: "p1" } }, s.turn.number);
    expect(attackableDefenders(s, "p2")).toEqual(["p3"]);
    expect(attackableDefenders(s, "p3")).toContain("p1");
  });

  it("« ne peut pas attaquer vos Jace » (`cantAttack` avec un sous-type) : ces planeswalkers seulement ; le joueur et ses autres planeswalkers restent attaquables", () => {
    const walker = (name: string, subtype: string) =>
      customCard({ name, types: ["Planeswalker"], typeLine: "Planeswalker", subtypes: [subtype], loyalty: 3 });
    const s = scenario({
      active: "p2",
      p1: { battlefield: [walker("Jace d'essai", "Jace"), walker("Chandra d'essai", "Chandra")] },
    });
    const jace = idOf(s, "p1", "battlefield", "Jace d'essai");
    const chandra = idOf(s, "p1", "battlefield", "Chandra d'essai");
    expect(attackableDefenders(s, "p2")).toEqual(["p1", jace, chandra]);
    addPlayerEffect(s, "p2", { cantAttack: { of: "p1", subtype: "Jace" } }, s.turn.number);
    expect(attackableDefenders(s, "p2")).toEqual(["p1", chandra]);
    // Sans sous-type : le joueur et tous ses planeswalkers (Sandswirl Wanderglyph).
    addPlayerEffect(s, "p2", { cantAttack: { of: "p1" } }, s.turn.number);
    expect(attackableDefenders(s, "p2")).toEqual([]);
  });

  it("passer (`skips`) : l'étape de pioche et les tours supplémentaires sont deux choses distinctes", () => {
    let s = scenario({ p1: { library: lands("Forest", 5) }, p2: { library: lands("Forest", 5) } });
    addPlayerEffect(s, "p1", { skips: "drawStep" }, null);
    s.extraTurns = ["p1"];
    const hand = s.players.p1?.hand.length ?? 0;
    // Le tour supplémentaire de p1 a lieu ; son étape de pioche n'a pas lieu.
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.step === "main1");
    expect([s.turn.active, s.players.p1?.hand.length]).toEqual(["p1", hand]);
    addPlayerEffect(s, "p1", { skips: "extraTurns" }, null);
    s.extraTurns = ["p1"];
    s = advanceUntil(s, (x) => x.turn.number > 4 && x.turn.step === "main1");
    expect(s.turn.active).toBe("p2");
  });

  it("The Tomb of Aclazotz : un seul sort de créature depuis le cimetière, avec un marqueur de finalité", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], graveyard: ["Llanowar Elves", "Llanowar Elves"] } });
    const castable = () =>
      legalActions(s, "p1").filter((x) => x.type === "cast" && s.objects[x.card]?.zone === "graveyard").length;
    expect(castable()).toBe(0);
    addPlayerEffect(
      s,
      "p1",
      {
        playFrom: {
          zone: "graveyard",
          filter: { types: ["Creature"] },
          what: "spells",
          finality: true,
          addSubtypes: ["Vampire"],
        },
      },
      s.turn.number,
      true,
    );
    expect(castable()).toBe(2);
    s = passBoth(act(s, "p1", { type: "cast", card: s.players.p1?.graveyard[0] as string }));
    expect(castable()).toBe(0);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(s.objects[elves]?.counters.finality).toBe(1);
  });

  it("Summon: Alexander : blessures prévenues sur vos créatures, pas sur vous", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Shivan Dragon"] } });
    addPlayerEffect(
      s,
      "p1",
      { replacement: { event: "damage", to: "yourSide", toFilter: { types: ["Creature"] }, modify: { prevent: true } } },
      s.turn.number,
    );
    const dragon = sourceFromObject(s, idOf(s, "p2", "battlefield", "Shivan Dragon"));
    dealDamage(s, dragon, idOf(s, "p1", "battlefield", "Bear Cub"), 3, false);
    dealDamage(s, dragon, "p1", 3, false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.damage).toBe(0);
    expect(s.players.p1?.life).toBe(17);
  });
});
