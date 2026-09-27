/**
 * Sagas (714), Classes (716) et Affaires (719) : cartes construites comme à l'import (toCardDef).
 */
import { type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { chapter, cond, fx, ref, triggered, when } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passBoth, scenario } from "./helpers";

const raw = (name: string, layout: string, typeLine: string, manaCost: string, oracleText: string): RawCard => ({
  name,
  number: "1",
  rarity: "common",
  manaCost,
  cmc: 0,
  typeLine,
  oracleText,
  colors: ["W"],
  keywords: [],
  image: "",
  artCrop: "",
  legalities: { standard: "legal" },
  layout,
});

const SAGA = toCardDef(
  raw(
    "Chronique de test",
    "saga",
    "Enchantment — Saga",
    "{1}{W}",
    "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — You gain 2 life.\nIII — Draw a card.",
  ),
  { abilities: [chapter([1, 2], [fx.gainLife(2)]), chapter([3], [fx.draw(1)])] },
  "TST",
);

const CLASS = toCardDef(
  raw(
    "Talent de test",
    "class",
    "Enchantment — Class",
    "{W}",
    "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, you gain 1 life.\n{W}: Level 2\nWhen this Class becomes level 2, draw a card.\n{1}{W}: Level 3\nCreatures you control get +1/+1.",
  ),
  {
    abilities: [triggered(when.entersSelf, [fx.gainLife(1)])],
    classLevels: [
      [triggered(when.classLevel(2), [fx.draw(1)])],
      [{ kind: "static", affects: { types: ["Creature"], controller: "you" }, mods: { power: 1, toughness: 1 } }],
    ],
  },
  "TST",
);

const CASE = toCardDef(
  raw(
    "Affaire de test",
    "case",
    "Enchantment — Case",
    "{1}{W}",
    "To solve — You have 25 or more life.\nSolved — Creatures you control get +1/+0.",
  ),
  {
    caseToSolve: cond.lifeAtLeast(25),
    caseSolved: [{ kind: "static", affects: { types: ["Creature"], controller: "you" }, mods: { power: 1 } }],
  },
  "TST",
);

const nextMain1 = (s: GameState) => advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");

describe("Sagas (714)", () => {
  it("un marqueur de savoir à l'arrivée puis à chaque première phase principale ; sacrifiée après le dernier chapitre", () => {
    expect(SAGA.saga).toEqual({ chapters: 3 });
    let s = scenario({ p1: { battlefield: ["Plains", "Plains"], hand: [SAGA] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", SAGA.name) });
    s = passBoth(s); // la Saga arrive (chapitre I)
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(22);
    const saga = idOf(s, "p1", "battlefield", SAGA.name);
    expect(s.objects[saga]?.counters.lore).toBe(1);
    // Tour suivant de p1 : chapitre II, puis encore un tour : chapitre III et sacrifice.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    s = nextMain1(s);
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(24);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    s = nextMain1(s);
    const hand = s.players.p1?.hand.length ?? 0;
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    expect(idsOf(s, "p1", "battlefield", SAGA.name)).toHaveLength(0);
    expect(idOf(s, "p1", "graveyard", SAGA.name)).toBeDefined();
  });
});

describe("Classes (716)", () => {
  it("« Niveau N » en rituel depuis le niveau N−1 ; les capacités de niveau s'ajoutent", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains", "Savannah Lions", { name: CLASS }] } });
    const cls = idOf(s, "p1", "battlefield", CLASS.name);
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const levelUps = () => legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === cls);
    expect(levelUps().map((a) => (a.type === "activate" ? a.label : ""))).toEqual(["Niveau 2"]);
    const hand = s.players.p1?.hand.length ?? 0;
    const up2 = levelUps()[0];
    s = act(s, "p1", { type: "activate", source: cls, ability: up2?.type === "activate" ? up2.ability : -1 });
    s = passBoth(s); // niveau 2
    s = passBoth(s); // « quand cette Classe atteint le niveau 2 »
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    expect(chars(s, lions).power).toBe(2);
    const up3 = levelUps()[0];
    expect(up3?.type === "activate" && up3.label).toBe("Niveau 3");
    s = act(s, "p1", { type: "activate", source: cls, ability: up3?.type === "activate" ? up3.ability : -1 });
    s = passBoth(s);
    expect(chars(s, lions).power).toBe(3);
    expect(levelUps()).toHaveLength(0);
  });
});

describe("Affaires (719)", () => {
  it("résolue à l'étape de fin si la condition est remplie ; ses capacités « Résolue » s'appliquent", () => {
    let s = scenario({ p1: { life: 25, battlefield: ["Savannah Lions", { name: CASE }] } });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(chars(s, lions).power).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", CASE.name)]?.solved).toBe(true);
    expect(chars(s, lions).power).toBe(3);
  });

  it("reste non résolue si la condition n'est pas remplie", () => {
    let s = scenario({ p1: { life: 20, battlefield: [{ name: CASE }] } });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[idOf(s, "p1", "battlefield", CASE.name)]?.solved).toBeFalsy();
  });
});

void ref;
