/**
 * Multi-face cards (Standard branch, lots 0.3 to 0.6): adventures and omens.
 */
import { type RawCard, type RawFace, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { cardRef } from "../src/choices";
import { fx, ref, spell, target, triggered, when } from "../src/dsl";
import { legalActions } from "../src/legal";
import { manaValue, parseManaCost } from "../src/mana";
import { chars } from "../src/state";
import { msg } from "../src/text";
import type { CardDef, GameState } from "../src/types";
import { act, customCard, idOf, passBoth, scenario } from "./helpers";

/** Test adventure: "Dreamy Cub" 2/2 {1}{G} // "Picnic" sorcery {G}: draw a card. */
const creatureFace = customCard({
  name: "Dreamy Cub",
  manaCost: parseManaCost("{1}{G}"),
  manaCostText: "{1}{G}",
  colors: ["G"],
  power: 2,
  toughness: 2,
});
const adventureFace = customCard({
  name: "Picnic",
  typeLine: "Sorcery — Adventure",
  types: ["Sorcery"],
  subtypes: ["Adventure"],
  manaCost: parseManaCost("{G}"),
  manaCostText: "{G}",
  colors: ["G"],
  spell: spell([], [fx.draw(1)]),
});
const ADVENTURER: CardDef = {
  ...creatureFace,
  id: "test-ourson-reveur-pique-nique",
  name: "Dreamy Cub // Picnic",
  layout: "adventure",
  faceDefs: [
    { ...creatureFace, id: "test-ourson__0" },
    { ...adventureFace, id: "test-ourson__1" },
  ],
};

/** Test omen: "Omen" sorcery {1}: 1 damage to any target, then shuffled into the library. */
const OMEN = customCard({
  name: "Omen",
  typeLine: "Sorcery — Omen",
  types: ["Sorcery"],
  subtypes: ["Omen"],
  manaCost: parseManaCost("{1}"),
  manaCostText: "{1}",
  spell: spell([target.any()], [fx.damage(1, ref.target())]),
});

const castOptions = (s: GameState, card: string) => legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === card);

describe("aventures (715)", () => {
  it("two options: the creature and the adventure; the adventure has its own characteristics on the stack", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: [ADVENTURER] } });
    const card = idOf(s, "p1", "hand", ADVENTURER.name);
    const opts = castOptions(s, card);
    expect(opts.map((o) => (o.type === "cast" ? (o.faceName ?? "front") : ""))).toEqual(["front", "Picnic"]);
    s = act(s, "p1", { type: "cast", card, face: 1 });
    const onStack = s.stack[0]?.sourceId as string;
    expect(chars(s, onStack).types).toEqual(["Sorcery"]);
    expect(chars(s, onStack).name).toBe("Picnic");
  });

  it('the resolved adventure goes to exile "on an adventure"; only the creature can then be cast from exile', () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Forest"], hand: [ADVENTURER] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ADVENTURER.name), face: 1 });
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand); // the card left, one card drawn
    const exiled = s.exile.find((id) => s.objects[id]?.defId === ADVENTURER.id) as string;
    expect(s.objects[exiled]?.onAdventure).toBe(true);
    const opts = castOptions(s, exiled);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.type === "cast" && opts[0].face).toBeUndefined();
    s = act(s, "p1", { type: "cast", card: exiled });
    s = passBoth(s);
    expect(idOf(s, "p1", "battlefield", ADVENTURER.name)).toBeDefined();
    expect(() => act(s, "p1", { type: "cast", card: exiled, face: 1 })).toThrow();
  });

  it("a countered adventure goes to the graveyard (not exile)", () => {
    let s = scenario({
      p1: { battlefield: ["Forest"], hand: [ADVENTURER] },
      p2: { battlefield: ["Island", "Island", "Island"], hand: ["Cancel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ADVENTURER.name), face: 1 });
    const spellId = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Cancel"), targets: { t: [spellId] } });
    s = passBoth(s);
    expect(idOf(s, "p1", "graveyard", ADVENTURER.name)).toBeDefined();
    expect(s.exile.some((id) => s.objects[id]?.defId === ADVENTURER.id)).toBe(false);
  });
});

describe("omens (Tarkir: Dragonstorm)", () => {
  it("a resolved omen is shuffled into its owner's library", () => {
    let s = scenario({ p1: { battlefield: ["Forest"], hand: [OMEN] } });
    const library = s.players.p1?.library.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Omen"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.library.length).toBe(library + 1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });
});

describe('two-faced omen ("adventure" layout on Scryfall)', () => {
  it("the omen face cast is shuffled into the library, not exiled on an adventure", () => {
    const omenFace = { ...OMEN, id: "test-dragon__1", name: "Dragon Omen" };
    const dragon: CardDef = {
      ...creatureFace,
      id: "test-dragon",
      name: "Dragon // Dragon Omen",
      layout: "adventure",
      faceDefs: [{ ...creatureFace, id: "test-dragon__0" }, omenFace],
    };
    let s = scenario({ p1: { battlefield: ["Forest"], hand: [dragon] } });
    const library = s.players.p1?.library.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", dragon.name), face: 1, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p1?.library.length).toBe(library + 1);
    expect(s.exile).toHaveLength(0);
  });
});

/** Test transforming card: "Shy Werewolf" 1/1 {1}{R} // "Furious Werewolf" 4/4 trample. */
const shy = customCard({
  name: "Shy Werewolf",
  manaCost: parseManaCost("{1}{R}"),
  manaCostText: "{1}{R}",
  power: 1,
  toughness: 1,
});
const fierce = customCard({
  name: "Furious Werewolf",
  manaCost: parseManaCost("{1}{R}"), // 712.8e : valeur de mana du recto
  manaCostText: "",
  power: 4,
  toughness: 4,
  keywords: ["trample"],
});
const WEREWOLF: CardDef = {
  ...shy,
  id: "test-loup-garou",
  name: "Shy Werewolf // Furious Werewolf",
  layout: "transform",
  faceDefs: [
    { ...shy, id: "test-loup-garou__0" },
    { ...fierce, id: "test-loup-garou__1" },
  ],
};

describe("transforming cards (712)", () => {
  it("transform effect and entering transformed", async () => {
    const { runEffect } = await import("../src/effects");
    const { moveWithSpec } = await import("../src/effects");
    const s = scenario({ p1: { battlefield: [WEREWOLF], graveyard: [WEREWOLF] } });
    const id = idOf(s, "p1", "battlefield", WEREWOLF.name);
    const res = {
      item: { id: "x", controller: "p1", sourceId: id, sourceDefId: WEREWOLF.id, targets: {} },
      controller: "p1",
      targets: {},
      vars: {},
      pc: 0,
    };
    runEffect(s, res as never, { op: "transform", what: { kind: "self" } });
    expect(chars(s, id).power).toBe(4);
    runEffect(s, res as never, { op: "transform", what: { kind: "self" } });
    expect(chars(s, id).power).toBe(1);
    const inYard = idOf(s, "p1", "graveyard", WEREWOLF.name);
    const back = moveWithSpec(s, "p1", inYard, { to: "battlefield", transformed: true }) as string;
    expect(chars(s, back).name).toBe("Furious Werewolf");
  });
});

/** Test modal card: "Scholar" 1/1 {U} // "Hero" 3/3 {2}{U}. */
const scholar = customCard({ name: "Scholar", manaCost: parseManaCost("{U}"), manaCostText: "{U}", power: 1, toughness: 1 });
const hero = customCard({ name: "Hero", manaCost: parseManaCost("{2}{U}"), manaCostText: "{2}{U}", power: 3, toughness: 3 });
const MDFC: CardDef = {
  ...scholar,
  id: "test-scholar",
  name: "Scholar // Hero",
  layout: "modal_dfc",
  faceDefs: [
    { ...scholar, id: "test-scholar__0" },
    { ...hero, id: "test-scholar__1" },
  ],
};

describe("modal double-faced cards (712.12)", () => {
  it("the back face is cast with its own cost and enters with that face", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island", "Island"], hand: [MDFC] } });
    const card = idOf(s, "p1", "hand", MDFC.name);
    expect(castOptions(s, card)).toHaveLength(2);
    s = act(s, "p1", { type: "cast", card, face: 1 });
    s = passBoth(s);
    const id = idOf(s, "p1", "battlefield", MDFC.name);
    expect(chars(s, id).name).toBe("Hero");
    expect(chars(s, id).power).toBe(3);
  });
});

/** Test meld: "Left" and "Right" meld into "Colossus" 9/9; "Left" carries the effect. */
const colossus = customCard({ name: "Colossus", power: 9, toughness: 9, meldResult: true, manaCost: null, manaCostText: "" });
const right = customCard({ name: "Right", power: 1, toughness: 1, meld: { parts: ["Left", "Right"], result: "Colossus" } });
const left: CardDef = customCard({
  name: "Left",
  power: 1,
  toughness: 1,
  meld: { parts: ["Left", "Right"], result: "Colossus" },
  meldResultDef: colossus,
});

describe("assemblage (701.42)", () => {
  it("the two cards become a single permanent, which becomes two cards again when it dies", async () => {
    const { runEffect } = await import("../src/effects");
    const { destroy } = await import("../src/actions");
    const s = scenario({ p1: { battlefield: [left, right] } });
    const id = idOf(s, "p1", "battlefield", "Left");
    const res = {
      item: { id: "x", controller: "p1", sourceId: id, sourceDefId: left.id, targets: {} },
      controller: "p1",
      targets: {},
      vars: {},
      pc: 0,
    };
    runEffect(s, res as never, { op: "meld", with: "Right" });
    const melded = idOf(s, "p1", "battlefield", "Colossus");
    expect(s.battlefield).toHaveLength(1);
    expect(chars(s, melded).power).toBe(9);
    expect(s.exile).toHaveLength(0);
    destroy(s, melded);
    expect(s.players.p1?.graveyard.map((g) => s.objects[g]?.defId).sort()).toEqual([left.id, right.id].sort());
  });
});

// ---------------------------------------------------------------------------
// Split cards and Rooms (709): built as at import (toCardDef).
// ---------------------------------------------------------------------------

const rawSplit = (name: string, faces: RawFace[], typeLine: string): RawCard => ({
  name,
  number: "1",
  rarity: "common",
  manaCost: faces[0]?.manaCost ?? "",
  cmc: 0,
  typeLine,
  oracleText: "",
  colors: [],
  keywords: [],
  image: "",
  artCrop: "",
  legalities: { standard: "legal" },
  layout: "split",
  faces,
});
const face = (name: string, manaCost: string, typeLine: string): RawFace => ({ name, manaCost, typeLine, oracleText: "" });

const FIRE_ICE = toCardDef(
  rawSplit("Hot // Cold", [face("Hot", "{R}", "Instant"), face("Cold", "{1}{U}", "Instant")], "Instant // Instant"),
  undefined,
  "TST",
  {
    Hot: { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
    Cold: { spell: spell([], [fx.draw(1)]) },
  },
);

const ROOM = toCardDef(
  rawSplit(
    "Red Room // Blue Room",
    [face("Red Room", "{R}", "Enchantment — Room"), face("Blue Room", "{2}{U}", "Enchantment — Room")],
    "Enchantment — Room // Enchantment — Room",
  ),
  undefined,
  "TST",
  {
    "Red Room": { abilities: [triggered(when.unlockThisDoor, [fx.damage(1, ref.eachOpponent)], { label: "1 damage" })] },
    "Blue Room": { abilities: [triggered(when.unlockThisDoor, [fx.draw(1)], { label: "draw" })] },
  },
);

describe("split cards (709)", () => {
  it("each half is cast separately; off the stack, the card has both halves", () => {
    expect(FIRE_ICE.implemented).toBe(true);
    expect(manaValue(FIRE_ICE.manaCost)).toBe(3);
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: [FIRE_ICE] } });
    const card = idOf(s, "p1", "hand", FIRE_ICE.name);
    expect(castOptions(s, card).map((o) => (o.type === "cast" ? o.faceName : ""))).toEqual(["Hot"]); // Cold: not enough mana
    s = act(s, "p1", { type: "cast", card, face: 0, targets: { t: ["p2"] } });
    expect(chars(s, s.stack[0]?.sourceId as string).name).toBe("Hot");
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
    expect(idOf(s, "p1", "graveyard", FIRE_ICE.name)).toBeDefined();
  });
});

describe("Salles (709.5)", () => {
  it("the door cast is unlocked on entering and triggers; the other unlocks as a sorcery, without the stack", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Island", "Island", "Island"], hand: [ROOM] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ROOM.name), face: 0 });
    s = passBoth(s); // the Room enters, red door unlocked
    s = passBoth(s); // "when you unlock this door": 1 damage
    expect(s.players.p2?.life).toBe(19);
    const room = idOf(s, "p1", "battlefield", ROOM.name);
    expect(chars(s, room).name).toBe("Red Room");
    expect(chars(s, room).colors).toEqual(["R"]);
    // Unlock the blue door: special action (nothing on the stack), then its trigger.
    const unlock = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === room);
    const door = cardRef(ROOM.faceDefs?.[1]?.id ?? "");
    expect(unlock?.type === "activate" && unlock.label).toBe(msg("Unlock {door}", { door }));
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: room, ability: unlock?.type === "activate" ? unlock.ability : -1 });
    expect(s.stack.map((x) => x.kind)).toEqual(["ability"]); // the trigger, not the action
    s = passBoth(s);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    expect(chars(s, room).name).toBe("Red Room // Blue Room");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === room)).toBe(false);
  });
});
