/**
 * Foundations cards: checks the primitives added for the main set
 * (graveyard targets, multiple targets, linked exile, resolution variables, costs…).
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { addEffect } from "../src/effects";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, counterCount, onBattlefield } from "../src/state";
import { plainText } from "../src/text";
import { canBlock } from "../src/turn";
import type { ChoiceRequest, GameEvent, GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  attackPlayer,
  canActivate,
  castable,
  combatTargetsOffered,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Foundations: graveyard", () => {
  it("Zombify returns the targeted creature from the graveyard to the battlefield", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Pelakka Wurm", "Opt"] } });
    const cast0 = legalActions(s, "p1").find((a) => a.type === "cast");
    const wurm = idOf(s, "p1", "graveyard", "Pelakka Wurm");
    // Only the creature card is a legal target.
    expect(cast0?.type === "cast" && cast0.modes[0]?.targets[0]?.legal).toEqual([wurm]);
    s = cast(s, "p1", "Zombify", { targets: { t: [wurm] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Pelakka Wurm").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });

  it("Macabre Waltz: up to two targets, then discard", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Macabre Waltz", "Forest"], graveyard: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const ids = [idOf(s, "p1", "graveyard", "Pelakka Wurm"), idOf(s, "p1", "graveyard", "Llanowar Elves")];
    s = cast(s, "p1", "Macabre Waltz", { targets: { t: ids } });
    s = passBoth(s);
    // Three cards in hand (Forest + two creatures): one must be discarded.
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("discard");
    s = choose(s, [idOf(s, "p1", "hand", "Forest")]);
    expect(s.players.p1?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name).sort()).toEqual([
      "Llanowar Elves",
      "Pelakka Wurm",
    ]);
  });

  it("Reassembling Skeleton activates from the graveyard", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Reassembling Skeleton"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "activate");
    expect(opt).toBeDefined();
    if (opt?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: opt.source, ability: opt.ability });
    s = passBoth(s);
    const skel = idOf(s, "p1", "battlefield", "Reassembling Skeleton");
    expect(s.objects[skel]?.tapped).toBe(true);
  });

  it("Scavenging Ooze: +1/+1 and 1 life only for a creature card", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenging Ooze", ...lands("Forest", 2)] },
      p2: { graveyard: ["Pelakka Wurm", "Opt"] },
    });
    const ooze = idOf(s, "p1", "battlefield", "Scavenging Ooze");
    s = act(s, "p1", { type: "activate", source: ooze, ability: 0, targets: { t: [idOf(s, "p2", "graveyard", "Opt")] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(20);
    s = act(s, "p1", {
      type: "activate",
      source: ooze,
      ability: 0,
      targets: { t: [idOf(s, "p2", "graveyard", "Pelakka Wurm")] },
    });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(21);
    expect(counterCount(s.objects[ooze] as never, "+1/+1")).toBe(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });
});

describe("Foundations: multiple targets and constraints", () => {
  it("Run Away Together requires two creatures of different players", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Island", 2)], hand: ["Run Away Together"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const mine = idsOf(s, "p1", "battlefield", "Llanowar Elves").concat(idsOf(s, "p1", "battlefield", "Prideful Parent"));
    expect(() => cast(s, "p1", "Run Away Together", { targets: { t: mine } })).toThrow();
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Run Away Together", { targets: { t: [mine[0] as string, dragon] } });
    s = passBoth(s);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Divine Resilience kicked accepts several targets, otherwise just one", () => {
    const base = () =>
      scenario({
        p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Plains", 4)], hand: ["Divine Resilience"] },
      });
    let s = base();
    const two = [idOf(s, "p1", "battlefield", "Llanowar Elves"), idOf(s, "p1", "battlefield", "Prideful Parent")];
    expect(() => cast(s, "p1", "Divine Resilience", { targets: { t: two } })).toThrow();
    s = cast(s, "p1", "Divine Resilience", { targets: { t: two }, kicked: true });
    s = passBoth(s);
    expect(s.effects.some((e) => e.addKeywords?.includes("indestructible") && e.affected.length === 2)).toBe(true);
  });
});

describe("Foundations: linked effects and variables", () => {
  it("Banishing Light: the card returns when the enchantment leaves", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Banishing Light"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = cast(s, "p1", "Banishing Light");
    s = passAccepting(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(s.exile).toHaveLength(1);
    // The enchantment leaving returns the creature (under its owner's control).
    const light = idOf(s, "p1", "battlefield", "Banishing Light");
    destroy(s, light);
    expect(s.exile).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Goblin Negotiation: one Goblin per excess damage", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Goblin Negotiation"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "p1", "Goblin Negotiation", { x: 5, targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
  });

  it("Exsanguinate: you gain the life lost by all opponents", () => {
    let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 5), hand: ["Exsanguinate"] } });
    s = cast(s, "p1", "Exsanguinate", { x: 3 });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p3?.life).toBe(17);
    expect(s.players.p1?.life).toBe(26);
  });

  it("Hare Apparent counts the other Hare Apparents", () => {
    let s = scenario({ p1: { battlefield: ["Hare Apparent", "Hare Apparent", ...lands("Plains", 2)], hand: ["Hare Apparent"] } });
    s = cast(s, "p1", "Hare Apparent");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Hare Apparent").length === 3);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(2);
  });

  it("Authority of the Consuls: opposing creatures enter tapped", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Authority of the Consuls"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = cast(s, "p2", "Llanowar Elves");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p2", "battlefield", "Llanowar Elves").length === 1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Sun-Blessed Healer only reanimates if it was kicked", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Sun-Blessed Healer"], graveyard: ["Llanowar Elves"] } });
    let s = cast(setup(), "p1", "Sun-Blessed Healer");
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    s = cast(setup(), "p1", "Sun-Blessed Healer", { kicked: true });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Llanowar Elves").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Pilfer: the caster chooses the nonland card discarded", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Pilfer"] },
      p2: { hand: ["Forest", "Opt", "Shivan Dragon"] },
    });
    s = cast(s, "p1", "Pilfer", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toHaveLength(2);
    s = choose(s, [idOf(s, "p2", "hand", "Shivan Dragon")]);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Painful Quandary: the opponent chooses between 5 life and a discard", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Painful Quandary"] },
      p2: { battlefield: ["Island"], hand: ["Opt", "Forest"] },
    });
    s = cast(s, "p2", "Opt");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "punisher");
    expect(s.pending?.player).toBe("p2");
    s = choose(s, ["life"]);
    expect(s.players.p2?.life).toBe(15);
  });
});

describe("Foundations: costs and mana", () => {
  it("Elvish Archdruid produces {G} for each Elf", () => {
    const s = scenario({ p1: { battlefield: ["Elvish Archdruid", "Llanowar Elves", "Llanowar Elves"] } });
    const archdruid = idOf(s, "p1", "battlefield", "Elvish Archdruid");
    const after = act(s, "p1", { type: "tapForMana", source: archdruid, ability: 0, color: "G" });
    expect(after.players.p1?.manaPool.G).toBe(3);
  });

  it("Hungry Ghoul sacrifices another creature for its cost", () => {
    let s = scenario({ p1: { battlefield: ["Hungry Ghoul", "Llanowar Elves", "Swamp"] } });
    const ghoul = idOf(s, "p1", "battlefield", "Hungry Ghoul");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: ghoul, ability: 0, sacrifice: [elf] });
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    s = passBoth(s);
    expect(counterCount(s.objects[ghoul] as never, "+1/+1")).toBe(1);
  });

  it("High Fae Trickster gives flash to your spells", () => {
    const s = scenario({
      active: "p2",
      step: "upkeep",
      p1: { battlefield: ["High Fae Trickster", ...lands("Forest", 4)], hand: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const p = passAccepting(s, (x) => x.pending?.player === "p1");
    expect(legalActions(p, "p1").some((a) => a.type === "cast")).toBe(true);
  });

  it("Mild-Mannered Librarian activates only once", () => {
    let s = scenario({ p1: { battlefield: ["Mild-Mannered Librarian", ...lands("Forest", 8)] } });
    const lib = idOf(s, "p1", "battlefield", "Mild-Mannered Librarian");
    s = act(s, "p1", { type: "activate", source: lib, ability: 0 });
    s = passBoth(s);
    expect(s.defs[s.objects[lib]?.defId ?? ""]).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lib)).toBe(false);
  });
});

describe("Foundations: the stack (counterspells and ward)", () => {
  /** p1 casts a spell; p2 gets priority with the spell on the stack. */
  const withSpellOnStack = (p1Hand: string, p2Hand: string[], p2Lands = lands("Island", 3), p1Lands = lands("Forest", 7)) => {
    let s = scenario({ p1: { battlefield: p1Lands, hand: [p1Hand] }, p2: { battlefield: p2Lands, hand: p2Hand } });
    s = cast(s, "p1", p1Hand);
    s = act(s, "p1", { type: "pass" });
    return s;
  };

  it("Essence Scatter counters a creature spell, not another spell", () => {
    let s = withSpellOnStack("Pelakka Wurm", ["Essence Scatter"]);
    const spell = s.stack[0]?.id as string;
    const opt = legalActions(s, "p2").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([spell]);
    s = cast(s, "p2", "Essence Scatter", { targets: { t: [spell] } });
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(0);

    const s2 = withSpellOnStack("Dragon Fodder", ["Essence Scatter"], lands("Island", 3), lands("Mountain", 3));
    expect(legalActions(s2, "p2").some((a) => a.type === "cast")).toBe(false);
  });

  it("An Offer You Can't Refuse: the caster of the countered spell gets two Treasures", () => {
    let s = withSpellOnStack("Overrun", ["An Offer You Can't Refuse"]);
    s = cast(s, "p2", "An Offer You Can't Refuse", { targets: { t: [s.stack[0]?.id as string] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
  });

  it("a spell cast with flashback and countered is exiled", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), graveyard: ["Think Twice"] },
      p2: { battlefield: lands("Island", 3), hand: ["Refute"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") });
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Refute", { targets: { t: [s.stack[0]?.id as string] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Think Twice");
  });

  it("Koma can't be countered", () => {
    let s = withSpellOnStack("Koma, World-Eater", ["Refute"], lands("Island", 3), [...lands("Forest", 4), ...lands("Island", 3)]);
    s = cast(s, "p2", "Refute", { targets: { t: [s.stack[0]?.id as string] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Koma, World-Eater").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Koma, World-Eater")).toHaveLength(1);
  });

  it("ward {2}: the opposing spell is countered if its controller doesn't pay", () => {
    const setup = (extraLands: number) =>
      scenario({
        p1: { battlefield: ["Cackling Prowler"] },
        p2: { battlefield: lands("Swamp", 1 + extraLands), hand: ["Stab"] },
        active: "p2",
      });
    // Without mana to pay: Stab is countered.
    let s = setup(0);
    const prowler = idOf(s, "p1", "battlefield", "Cackling Prowler");
    s = cast(s, "p2", "Stab", { targets: { t: [prowler] } });
    expect(s.stack).toHaveLength(2); // Stab + ward trigger
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p2", "graveyard", "Stab")).toHaveLength(1);
    expect(s.effects.some((e) => e.affected.includes(prowler))).toBe(false);
    // With enough to pay: the player pays {2} and Stab resolves.
    s = setup(2);
    s = cast(s, "p2", "Stab", { targets: { t: [prowler] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    expect(s.pending?.player).toBe("p2");
    s = choose(s, [1]);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.effects.some((e) => e.affected.includes(prowler) && e.power === -2)).toBe(true);
  });

  it("garde — payer 7 PV (Sire of Seven Deaths)", () => {
    let s = scenario({
      p1: { battlefield: ["Sire of Seven Deaths"] },
      p2: { battlefield: ["Swamp"], hand: ["Stab"] },
      active: "p2",
    });
    s = cast(s, "p2", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Sire of Seven Deaths")] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    s = choose(s, [1]);
    expect(s.players.p2?.life).toBe(13);
  });

  it("ward doesn't trigger for its controller's spells", () => {
    let s = scenario({ p1: { battlefield: ["Cackling Prowler", "Forest"], hand: ["Giant Growth"] } });
    s = cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Cackling Prowler")] } });
    expect(s.stack).toHaveLength(1);
  });

  it("Zul Ashur lets you cast a Zombie from the graveyard this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Zul Ashur, Lich Lord", ...lands("Swamp", 3)], graveyard: ["Diregraf Ghoul", "Pelakka Wurm"] },
    });
    const ghoul = idOf(s, "p1", "graveyard", "Diregraf Ghoul");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === ghoul)).toBe(false);
    s = act(s, "p1", {
      type: "activate",
      source: idOf(s, "p1", "battlefield", "Zul Ashur, Lich Lord"),
      ability: 0,
      targets: { t: [ghoul] },
    });
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === ghoul)).toBe(true);
    s = act(s, "p1", { type: "cast", card: ghoul });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Diregraf Ghoul")).toHaveLength(1);
  });
});

describe("Foundations: Auras and Equipment", () => {
  it("an Aura targets on cast and enters attached; it goes to the graveyard if the host leaves", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 3)], hand: ["Blanchwood Armor"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = cast(s, "p1", "Blanchwood Armor", { targets: { enchant: [elf] } });
    s = passBoth(s);
    const armor = idOf(s, "p1", "battlefield", "Blanchwood Armor");
    expect(s.objects[armor]?.attachedTo).toBe(elf);
    // +1/+1 per Forest (3): the 1/1 Elf becomes 4/4.
    expect(chars(s, elf).power).toBe(4);
    destroy(s, elf);
    s = act(s, "p1", { type: "pass" }); // state-based actions are checked
    expect(idsOf(s, "p1", "graveyard", "Blanchwood Armor")).toHaveLength(1);
  });

  it("Equip: at sorcery speed, attaches the Equipment; it stays in play when the creature leaves", () => {
    let s = scenario({ p1: { battlefield: ["Swiftfoot Boots", "Llanowar Elves", "Forest"] } });
    const boots = idOf(s, "p1", "battlefield", "Swiftfoot Boots");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === boots);
    expect(equip?.type === "activate" && plainText(equip.label ?? "")).toBe("Equip {1}");
    if (equip?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: boots, ability: equip.ability, targets: { t: [elf] } });
    s = passBoth(s);
    expect(s.objects[boots]?.attachedTo).toBe(elf);
    expect(chars(s, elf).keywords).toEqual(expect.arrayContaining(["hexproof", "haste"]));
    destroy(s, elf);
    s = act(s, "p1", { type: "pass" }); // state-based actions are checked
    expect(onBattlefield(s, boots)).toBe(true);
    expect(s.objects[boots]?.attachedTo).toBeUndefined();
  });

  it("Imprisoned in the Moon: the creature becomes a colorless land that produces {C}", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Imprisoned in the Moon"] },
      p2: { battlefield: ["Elvish Archdruid"] },
    });
    const druid = idOf(s, "p2", "battlefield", "Elvish Archdruid");
    s = cast(s, "p1", "Imprisoned in the Moon", { targets: { enchant: [druid] } });
    s = passBoth(s);
    const c = chars(s, druid);
    expect(c.types).toEqual(["Land"]);
    expect(c.colors).toEqual([]);
    expect(c.subtypes).toEqual([]);
    const mana = manaAbilitiesOf(s, druid);
    expect(mana.map((m) => m.produce)).toEqual([["C"]]);
  });

  it("Witness Protection: 1/1 Citizen without abilities named Legitimate Businessperson", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Witness Protection"] },
      p2: { battlefield: ["Shivan Dragon", "Anthem of Champions"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Witness Protection", { targets: { enchant: [dragon] } });
    s = passBoth(s);
    const c = chars(s, dragon);
    expect(c.name).toBe("Legitimate Businessperson");
    expect(c.keywords).toEqual([]);
    expect(c.subtypes).toEqual(["Citizen"]);
    // 1/1 de base, +1/+1 de l'Anthem adverse.
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(legalActions(s, "p2").some((a) => a.type === "activate")).toBe(false);
  });

  it("Fiery Annihilation exiles only an Equipment attached to the targeted creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Fiery Annihilation"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Goldvein Pick", "Swiftfoot Boots"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const pick = idOf(s, "p2", "battlefield", "Goldvein Pick");
    const boots = idOf(s, "p2", "battlefield", "Swiftfoot Boots");
    (s.objects[pick] as { attachedTo?: string }).attachedTo = dragon;
    (s.objects[boots] as { attachedTo?: string }).attachedTo = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(() => cast(s, "p1", "Fiery Annihilation", { targets: { t: [dragon], e: [boots] } })).toThrow();
    s = cast(s, "p1", "Fiery Annihilation", { targets: { t: [dragon], e: [pick] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name).sort()).toEqual(["Goldvein Pick", "Shivan Dragon"]);
  });

  it("Fishing Pole: bait by tapping the creature, Fish when it untaps", () => {
    let s = scenario({ p1: { battlefield: ["Fishing Pole", "Llanowar Elves", "Forest"] } });
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    (s.objects[pole] as { attachedTo?: string }).attachedTo = elf;
    s.version += 1;
    // "Equipped creature has "{1}, {T}, Tap Fishing Pole: …"": the ability is the Elf's, not the Equipment's.
    const bait = chars(s, elf).abilities.findIndex((a) => a.kind === "activated" && a.label?.startsWith("Tap Fishing"));
    expect(bait).toBeGreaterThanOrEqual(0);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === pole && a.ability === 0)).toBe(false);
    // Fishing Pole tapped: the cost "tap Fishing Pole" can't be paid.
    s.objects[pole]!.tapped = true;
    expect(() => act(s, "p1", { type: "activate", source: elf, ability: bait })).toThrow();
    s.objects[pole]!.tapped = false;
    s = act(s, "p1", { type: "activate", source: elf, ability: bait });
    expect(s.objects[pole]?.tapped).toBe(true);
    s = passBoth(s);
    expect(s.objects[pole]?.counters.bait).toBe(1);
    expect(s.objects[elf]?.tapped).toBe(true);
    // p1's next turn: the Elf untaps, a Fish is created.
    s = passAccepting(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(1);
    expect(s.objects[pole]?.counters.bait ?? 0).toBe(0);
  });

  it("Leyline Axe: offered at the start of the game from the opening hand", () => {
    const deck = (extra: string) => [extra, ...Array(59).fill("Forest")].map((n) => card(n));
    // A seed where the Axe is in p1's opening hand.
    let s!: S;
    for (let seed = 1; seed < 200; seed++) {
      s = createGame({
        seed,
        startingPlayer: "p1",
        players: [
          { id: "p1", name: "A", deck: deck("Leyline Axe") },
          { id: "p2", name: "B", deck: deck("Forest") },
        ],
      }).state;
      if (idsOf(s, "p1", "hand", "Leyline Axe").length) break;
    }
    for (let i = 0; i < 4 && s.pending?.kind === "mulligan"; i++) s = act(s, s.pending.player, { type: "keep" });
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("leyline");
    s = choose(s, idsOf(s, "p1", "hand", "Leyline Axe"));
    expect(idsOf(s, "p1", "battlefield", "Leyline Axe")).toHaveLength(1);
    expect(s.turn.number).toBe(1);
  });
});

describe("Foundations: planeswalkers", () => {
  const walker = (s: S, name: string, p = "p1") => idOf(s, p, "battlefield", name);
  const loyaltyOf = (s: S, id: string) => s.objects[id]?.counters.loyalty ?? 0;
  const activate = (s: S, source: string, label: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").startsWith(label),
    );
    if (a?.type !== "activate") throw new Error(`ability ${label} unavailable`);
    return act(s, "p1", { type: "activate", source, ability: a.ability, targets });
  };

  it("enters with its loyalty; one loyalty ability per turn; -N impossible without enough loyalty", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Llanowar Elves"], hand: ["Ajani, Caller of the Pride"] } });
    s = cast(s, "p1", "Ajani, Caller of the Pride");
    s = passBoth(s);
    const ajani = walker(s, "Ajani, Caller of the Pride");
    expect(loyaltyOf(s, ajani)).toBe(4);
    const labels = legalActions(s, "p1").flatMap((a) => (a.type === "activate" && a.source === ajani ? [a.label] : []));
    expect(labels.map((l) => plainText(l ?? "").split(":")[0])).toEqual(["+1", "−3"]); // -8: not enough loyalty
    s = activate(s, ajani, "+1", { t: [] });
    expect(loyaltyOf(s, ajani)).toBe(5);
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ajani)).toBe(false);
  });

  it("damage removes loyalty; at 0, the planeswalker goes to the graveyard", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Vivien Reid"] },
      p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
    });
    const vivien = walker(s, "Vivien Reid");
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 5;
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [vivien] } });
    s = passBoth(s);
    expect(loyaltyOf(s, vivien)).toBe(3);
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 0;
    s = act(s, s.pending?.player ?? "p2", { type: "pass" });
    expect(idsOf(s, "p1", "graveyard", "Vivien Reid")).toHaveLength(1);
  });

  it("attacking a planeswalker: blocked by its controller, otherwise damage to loyalty", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
      p2: { battlefield: ["Liliana, Dreadhorde General", "Prideful Parent"] },
    });
    const lili = walker(s, "Liliana, Dreadhorde General", "p2");
    (s.objects[lili] as { counters: Record<string, number> }).counters.loyalty = 6;
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    const view = legalActions; // (legalActions is only for priority)
    void view;
    const dragon = walker(s, "Shivan Dragon");
    const elf = walker(s, "Llanowar Elves");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: dragon, defender: lili },
        { id: elf, defender: lili },
      ],
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
    expect(s.pending?.player).toBe("p2");
    // The Cat blocks the Elf; the Dragon (5) hits Liliana.
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Prideful Parent"), attacker: elf }],
    });
    s = passAccepting(s, (x) => x.turn.step === "main2");
    expect(loyaltyOf(s, lili)).toBe(1);
    expect(s.players.p2?.life).toBe(20);
  });

  it("Kaito: counter when a creature damages a player; emblem that creates Ninjas", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Kaito, Cunning Infiltrator", "Llanowar Elves"] },
    });
    const kaito = walker(s, "Kaito, Cunning Infiltrator");
    (s.objects[kaito] as { counters: Record<string, number> }).counters.loyalty = 9;
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: walker(s, "Llanowar Elves"), defender: "p2" }] });
    s = passAccepting(s, (x) => x.turn.step === "main2");
    expect(loyaltyOf(s, kaito)).toBe(10);
    s = activate(s, kaito, "−9");
    s = passBoth(s);
    expect(s.players.p1?.command).toHaveLength(1);
    expect(onBattlefield(s, kaito)).toBe(true); // 10 − 9 = 1

    // The emblem: each spell cast, by any player, creates a 2/1 Ninja.
    let t = scenario({ p1: { battlefield: ["Kaito, Cunning Infiltrator", "Island"], hand: ["Opt"] } });
    const k = walker(t, "Kaito, Cunning Infiltrator");
    (t.objects[k] as { counters: Record<string, number> }).counters.loyalty = 9;
    t = activate(t, k, "−9");
    t = passBoth(t);
    t = cast(t, "p1", "Opt");
    t = passAccepting(t, (x) => x.stack.length === 0);
    expect(idsOf(t, "p1", "battlefield", "Ninja")).toHaveLength(1);
  });

  it("Vivien's emblem: +2/+2, vigilance, trample, indestructible", () => {
    let s = scenario({ p1: { battlefield: ["Vivien Reid", "Llanowar Elves"] } });
    const vivien = walker(s, "Vivien Reid");
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 8;
    s = activate(s, vivien, "−8");
    s = passBoth(s);
    const elf = walker(s, "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).toughness]).toEqual([3, 3]);
    expect(chars(s, elf).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "indestructible"]));
    expect(onBattlefield(s, vivien)).toBe(false); // 0 loyalty
  });

  it("Chandra +2: {R}{R}{R} and an exiled card playable this turn; -4: 8 damage divided", () => {
    let s = scenario({
      p1: {
        battlefield: ["Chandra, Flameshaper", ...lands("Mountain", 3)],
        library: ["Shivan Dragon", "Forest", "Opt", "Forest"],
      },
      p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const chandra = walker(s, "Chandra, Flameshaper");
    (s.objects[chandra] as { counters: Record<string, number> }).counters.loyalty = 6;
    s = activate(s, chandra, "+2");
    s = passBoth(s);
    expect(s.players.p1?.manaPool.R).toBe(3);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("impulse");
    const dragon = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon") as string;
    s = choose(s, [dragon]);
    const cast0 = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(cast0?.type === "cast" && cast0.fromExile).toBe(true);

    // -4 the other turn: 8 damage divided between two creatures.
    s = scenario({ p1: { battlefield: ["Chandra, Flameshaper"] }, p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] } });
    const ch = walker(s, "Chandra, Flameshaper");
    (s.objects[ch] as { counters: Record<string, number> }).counters.loyalty = 6;
    const wurm = walker(s, "Pelakka Wurm", "p2");
    const elf = walker(s, "Llanowar Elves", "p2");
    s = activate(s, ch, "−4", { t: [wurm, elf] });
    // The division is announced on activation (601.2d, 602.2b), before priority.
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    expect(() => choose(s, [8, 0])).toThrow(); // at least 1 per target
    s = choose(s, [7, 1]);
    expect(s.stack[0]?.division).toEqual({ t: [7, 1] });
    s = passBoth(s);
    expect(idsOf(s, "p2", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Liliana -9: the opponent keeps one permanent of each type", () => {
    let s = scenario({
      p1: { battlefield: ["Liliana, Dreadhorde General"] },
      p2: { battlefield: ["Forest", "Island", "Llanowar Elves", "Shivan Dragon", "Anthem of Champions"] },
    });
    const lili = walker(s, "Liliana, Dreadhorde General");
    (s.objects[lili] as { counters: Record<string, number> }).counters.loyalty = 9;
    s = activate(s, lili, "−9");
    s = passBoth(s);
    // Creature: keep the Dragon; land: keep the Island.
    for (let i = 0; i < 3 && s.pending?.kind === "choice"; i++) {
      const req = s.pending.request;
      if (req.type !== "pick") break;
      const want = req.options.find((id) => ["Shivan Dragon", "Island"].includes(s.defs[s.objects[id]?.defId ?? ""]?.name ?? ""));
      s = choose(s, [want ?? (req.options[0] as string)]);
    }
    const names = s.battlefield
      .filter((id) => s.objects[id]?.controller === "p2")
      .map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names.sort()).toEqual(["Anthem of Champions", "Island", "Shivan Dragon"]);
  });
});

describe("Foundations: actual destination of a creature that dies", () => {
  /** Casts a spell then lets everyone pass until it resolves; returns the events. */
  function castAndResolve(s: GameState, player: string, spell: string, target: string): { s: GameState; events: GameEvent[] } {
    const events: GameEvent[] = [];
    let r = submit(s, player, { type: "cast", card: idOf(s, player, "hand", spell), mode: 0, targets: { t: [target] } });
    events.push(...r.events);
    for (let i = 0; i < 10 && r.state.stack.length > 0 && r.state.pending?.kind === "priority"; i++) {
      r = submit(r.state, r.state.pending.player, { type: "pass" });
      events.push(...r.events);
    }
    return { s: r.state, events };
  }

  it("Scorching Dragonfire: the death event announces the exile", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Scorching Dragonfire"] },
    });
    const { s: after, events } = castAndResolve(s, "p2", "Scorching Dragonfire", idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(events.find((e) => e.type === "dies")).toMatchObject({ type: "dies", to: "exile" });
    expect(after.exile.some((id) => after.defs[after.objects[id]?.defId ?? ""]?.name === "Bear Cub")).toBe(true);
  });

  it("without a replacement, it goes to the graveyard", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const { events } = castAndResolve(s, "p1", "Burst Lightning", idOf(s, "p2", "battlefield", "Bear Cub"));
    expect(events.find((e) => e.type === "dies")).toMatchObject({ type: "dies", to: "graveyard" });
  });
});

// ---------------------------------------------------------------------------
// Cards of the Standard meta decks (PLAN-C in docs/history.md, lot C13): each card does what its Oracle text says.
// ---------------------------------------------------------------------------

describe("Foundations: Standard meta cards", () => {
  /** Activates the ability of `source` whose label starts with `label` (or the first, if no label). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || plainText(x.label ?? "").startsWith(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability ${label ?? ""} unavailable`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id)).sort();
  const yardNames = (s: S, p: string) => (s.players[p]?.graveyard ?? []).map((id) => nameOf(s, id)).sort();
  /** p1 casts `spell`; p2 gets priority with the spell on the stack. */
  const onStack = (spell: string, p1Lands: string[], p2Hand: string[]) => {
    let s = scenario({ p1: { battlefield: p1Lands, hand: [spell] }, p2: { battlefield: lands("Island", 2), hand: p2Hand } });
    s = cast(s, "p1", spell);
    return act(s, "p1", { type: "pass" });
  };
  const legalSpellTargets = (s: S, player: string, card: string) => {
    const opt = legalActions(s, player).find((a) => a.type === "cast" && a.card === card);
    return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
  };

  it("Duress: the opponent reveals their hand; you choose a noncreature, nonland card, which they discard", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Duress"] },
      p2: { hand: ["Forest", "Llanowar Elves", "Opt", "Giant Growth"] },
    });
    s = cast(s, "p1", "Duress", { targets: { t: ["p2"] } });
    s = passBoth(s);
    // The caster chooses, among noncreature nonland cards only.
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Giant Growth", "Opt"]);
    s = choose(s, [idOf(s, "p2", "hand", "Giant Growth")]);
    expect(yardNames(s, "p2")).toEqual(["Giant Growth"]);
    expect(handNames(s, "p2")).toEqual(["Forest", "Llanowar Elves", "Opt"]);
  });

  it("Duress: nothing to discard if the hand holds only creatures and lands", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Duress"] }, p2: { hand: ["Forest", "Llanowar Elves"] } });
    s = settle(cast(s, "p1", "Duress", { targets: { t: ["p2"] } }));
    expect(handNames(s, "p2")).toEqual(["Forest", "Llanowar Elves"]);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Flashfreeze counters a red or green spell, not a blue spell", () => {
    let s = onStack("Overrun", lands("Forest", 5), ["Flashfreeze"]);
    const spell = s.stack[0]?.id as string;
    expect(legalSpellTargets(s, "p2", idOf(s, "p2", "hand", "Flashfreeze"))).toEqual([spell]);
    s = settle(cast(s, "p2", "Flashfreeze", { targets: { t: [spell] } }));
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    // A blue spell is not a legal target.
    const blue = onStack("Opt", ["Island"], ["Flashfreeze"]);
    expect(castable(blue, "p2", idOf(blue, "p2", "hand", "Flashfreeze"))).toBe(false);
  });

  it("Negate counters a noncreature spell, not a creature spell", () => {
    let s = onStack("Overrun", lands("Forest", 5), ["Negate"]);
    s = settle(cast(s, "p2", "Negate", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    const creature = onStack("Llanowar Elves", ["Forest"], ["Negate"]);
    expect(castable(creature, "p2", idOf(creature, "p2", "hand", "Negate"))).toBe(false);
  });

  it("Day of Judgment destroys all creatures, on both sides, and nothing else", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Serra Angel", "Swiftfoot Boots"], hand: ["Day of Judgment"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Vivien Reid"] },
    });
    s = settle(cast(s, "p1", "Day of Judgment"));
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    expect(yardNames(s, "p1")).toEqual(["Day of Judgment", "Serra Angel"]);
    expect(yardNames(s, "p2")).toEqual(["Llanowar Elves", "Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Swiftfoot Boots")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Vivien Reid")).toHaveLength(1);
  });

  it("Demolition Field: {C}; {2}, {T}, sacrifice: destroys an opposing nonbasic land, each searches for a basic land", () => {
    let s = scenario({
      p1: { battlefield: ["Demolition Field", "Forest", "Forest"], library: ["Plains", "Opt", "Opt"] },
      p2: { battlefield: ["Breeding Pool", "Forest"], library: ["Island", "Opt", "Opt"] },
    });
    const field = idOf(s, "p1", "battlefield", "Demolition Field");
    expect(manaAbilitiesOf(s, field).map((m) => m.produce)).toEqual([["C"]]);
    // Only the opposing nonbasic land is a target.
    const pool = idOf(s, "p2", "battlefield", "Breeding Pool");
    expect(() => activate(s, "p1", field, "Destroy", { t: [idOf(s, "p2", "battlefield", "Forest")] })).toThrow();
    s = activate(s, "p1", field, "Destroy", { t: [pool] });
    expect(idsOf(s, "p1", "graveyard", "Demolition Field")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Breeding Pool")).toHaveLength(1);
    // The destroyed land's controller, then the activator, each put a basic land onto the battlefield.
    expect(idsOf(s, "p2", "battlefield", "Island")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
  });

  it("Soul-Guide Lantern: on entering, exiles a card from a graveyard; sacrifice: exiles opposing graveyards", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest"], hand: ["Soul-Guide Lantern"], graveyard: ["Opt"] },
      p2: { graveyard: ["Shivan Dragon", "Llanowar Elves", "Giant Growth"] },
    });
    const dragon = idOf(s, "p2", "graveyard", "Shivan Dragon");
    s = settle(cast(s, "p1", "Soul-Guide Lantern"), picking([dragon]));
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    const lantern = idOf(s, "p1", "battlefield", "Soul-Guide Lantern");
    s = settle(activate(s, "p1", lantern, "Exile"));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(3);
    // Your own graveyard is untouched; the sacrificed Lantern went there.
    expect(yardNames(s, "p1")).toEqual(["Opt", "Soul-Guide Lantern"]);
  });

  it("Soul-Guide Lantern: {1}, {T}, sacrifice: draw a card", () => {
    let s = scenario({ p1: { battlefield: ["Soul-Guide Lantern", "Forest"] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Soul-Guide Lantern"), "Draw"));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
    expect(idsOf(s, "p1", "graveyard", "Soul-Guide Lantern")).toHaveLength(1);
  });

  it("Hinterland Sanctifier: 1 life when another creature enters under your control (not itself, not the opponent)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Hinterland Sanctifier", "Savannah Lions"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Hinterland Sanctifier"));
    expect(s.players.p1?.life).toBe(20);
    s = settle(cast(s, "p1", "Savannah Lions"));
    expect(s.players.p1?.life).toBe(21);
    // An opposing creature doesn't count.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Cathar Commando: flash; {1}, sacrifice: destroys an artifact or an enchantment", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Cathar Commando"] },
      p2: { battlefield: ["Swiftfoot Boots", "Banishing Light", "Llanowar Elves"] },
    });
    s = act(s, "p2", { type: "pass" });
    // During the opponent's turn: flash.
    expect(s.pending?.player).toBe("p1");
    s = settle(cast(s, "p1", "Cathar Commando"));
    s = act(s, "p2", { type: "pass" });
    expect(s.pending?.player).toBe("p1");
    const commando = idOf(s, "p1", "battlefield", "Cathar Commando");
    const sac = { type: "activate", source: commando, ability: 0 } as const;
    // A creature is not a legal target.
    expect(() => act(s, "p1", { ...sac, targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow();
    s = act(s, "p1", { ...sac, targets: { t: [idOf(s, "p2", "battlefield", "Swiftfoot Boots")] } });
    expect(idsOf(s, "p1", "graveyard", "Cathar Commando")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
    // An enchantment is also a legal target.
    let t = scenario({ p1: { battlefield: ["Cathar Commando", "Plains"] }, p2: { battlefield: ["Banishing Light"] } });
    t = settle(
      activate(t, "p1", idOf(t, "p1", "battlefield", "Cathar Commando"), undefined, {
        t: [idOf(t, "p2", "battlefield", "Banishing Light")],
      }),
    );
    expect(idsOf(t, "p2", "graveyard", "Banishing Light")).toHaveLength(1);
  });

  describe("Boros Charm", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Mountain", "Plains", "Serra Angel", "Swiftfoot Boots"], hand: ["Boros Charm"] },
        p2: { battlefield: ["Vivien Reid"] },
      });

    it("mode 1: 4 damage to a player or planeswalker", () => {
      let s = settle(cast(setup(), "p1", "Boros Charm", { mode: 0, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      s = setup();
      const vivien = idOf(s, "p2", "battlefield", "Vivien Reid");
      s = settle(cast(s, "p1", "Boros Charm", { mode: 0, targets: { t: [vivien] } }));
      expect(s.objects[vivien]?.counters.loyalty).toBe(1); // 5 − 4
    });

    it("mode 2: your permanents gain indestructible until end of turn", () => {
      let s = settle(cast(setup(), "p1", "Boros Charm", { mode: 1 }));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(chars(s, angel).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Swiftfoot Boots")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Vivien Reid")).keywords).not.toContain("indestructible");
      destroy(s, angel);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, angel).keywords).not.toContain("indestructible");
    });

    it("mode 3: a creature gains double strike until end of turn", () => {
      let s = setup();
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Boros Charm", { mode: 2, targets: { t: [angel] } }));
      expect(chars(s, angel).keywords).toContain("doubleStrike");
    });
  });

  it("Deathmark destroys a green or white creature, not a red one", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Deathmark"] },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel", "Shivan Dragon"] },
    });
    const legal = legalSpellTargets(s, "p1", idOf(s, "p1", "hand", "Deathmark"))
      .map((id) => nameOf(s, id))
      .sort();
    expect(legal).toEqual(["Llanowar Elves", "Serra Angel"]);
    s = settle(cast(s, "p1", "Deathmark", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Temple of Deceit enters tapped, scry 1, and produces {U} or {B}", () => {
    let s = scenario({ p1: { hand: ["Temple of Deceit"], library: ["Shivan Dragon", "Opt", "Forest"] } });
    let asked = false;
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Temple of Deceit") });
    s = settle(s, (req) => {
      if (req.intent !== "scryBottom") return undefined;
      asked = true;
      return req.type === "pick" ? req.options.slice(0, 1) : undefined;
    });
    expect(asked).toBe(true);
    const temple = idOf(s, "p1", "battlefield", "Temple of Deceit");
    expect(s.objects[temple]?.tapped).toBe(true);
    // The Dragon went under the library.
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
    expect(
      manaAbilitiesOf(s, temple)
        .flatMap((m) => m.produce)
        .sort(),
    ).toEqual(["B", "U"]);
  });

  it("Maelstrom Pulse destroys the targeted permanent and all others with the same name, whoever controls them", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Forest", "Llanowar Elves"], hand: ["Maelstrom Pulse"] },
      p2: { battlefield: ["Llanowar Elves", "Llanowar Elves", "Pelakka Wurm", "Forest"] },
    });
    // A land is not a target.
    expect(() => cast(s, "p1", "Maelstrom Pulse", { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = settle(cast(s, "p1", "Maelstrom Pulse", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });

  describe("Slagstorm", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Slagstorm"] },
        p2: { battlefield: ["Pelakka Wurm", "Vivien Reid"] },
      });

    it("mode 1: 3 damage to each creature (not to planeswalkers or players)", () => {
      const s = settle(cast(setup(), "p1", "Slagstorm", { mode: 0 }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Pelakka Wurm")]?.damage).toBe(3);
      expect(s.objects[idOf(s, "p2", "battlefield", "Vivien Reid")]?.counters.loyalty).toBe(5);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
    });

    it("mode 2: 3 damage to each player", () => {
      const s = settle(cast(setup(), "p1", "Slagstorm", { mode: 1 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([17, 17]);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Pelakka Wurm")]?.damage).toBe(0);
    });
  });

  describe("Bushwhack", () => {
    it("mode 1: searches for a basic land card and puts it into hand", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Bushwhack"], library: ["Opt", "Shivan Dragon", "Mountain"] } });
      s = settle(cast(s, "p1", "Bushwhack", { mode: 0 }));
      expect(handNames(s, "p1")).toEqual(["Mountain"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("mode 2: your creature fights an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Pelakka Wurm"], hand: ["Bushwhack"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      // The first target must be yours, the second the opponent's.
      expect(() => cast(s, "p1", "Bushwhack", { mode: 1, targets: { a: [dragon], b: [wurm] } })).toThrow();
      s = settle(cast(s, "p1", "Bushwhack", { mode: 1, targets: { a: [wurm], b: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.objects[wurm]?.damage).toBe(5);
    });
  });
});

describe("Foundations, lot K8: mythiques", () => {
  const commandZone = (s: S, p: string) =>
    Object.values(s.objects)
      .filter((o) => o.zone === "command" && o.controller === p)
      .map((o) => o.defId);

  it("Angelic Destiny: +4/+4, flying, first strike and Angel type; returns to its owner's hand when the creature dies", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 4), hand: ["Angelic Destiny"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Angelic Destiny", { targets: { enchant: [elf] } }));
    const c = chars(s, elf);
    expect([c.power, c.toughness]).toEqual([5, 5]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Angel"]));
    destroy(s, elf);
    s = settle(act(s, "p1", { type: "pass" }));
    // The enchanted creature is the opponent's, but the Aura returns to its owner's hand.
    expect(idsOf(s, "p1", "hand", "Angelic Destiny")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(0);
  });

  it("Bloodthirsty Conqueror: you gain as much life as an opponent loses, not when you lose it", () => {
    let s = scenario({
      p1: { battlefield: ["Bloodthirsty Conqueror", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bloodthirsty Conqueror")).keywords).toEqual(
      expect.arrayContaining(["flying", "deathtouch"]),
    );
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Dragonmaster Outcast: 5/5 flying Dragon at your upkeep with six or more lands, nothing with five", () => {
    const run = (n: number) => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Dragonmaster Outcast", ...lands("Mountain", n)] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      return s;
    };
    const s = run(6);
    const dragons = idsOf(s, "p1", "battlefield", "Dragon");
    expect(dragons).toHaveLength(1);
    const d = chars(s, dragons[0] as string);
    expect([d.power, d.toughness, d.colors]).toEqual([5, 5, ["R"]]);
    expect(d.keywords).toContain("flying");
    expect(idsOf(run(5), "p1", "battlefield", "Dragon")).toHaveLength(0);
  });

  it("Finale of Revelation: X < 10, draw X cards; the spell is exiled", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Finale of Revelation"], graveyard: ["Opt"] } });
    s = settle(cast(s, "p1", "Finale of Revelation", { x: 2 }));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.library).toHaveLength(8);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Finale of Revelation");
    expect(commandZone(s, "p1")).toHaveLength(0);
  });

  it("Finale of Revelation: X ≥ 10, the graveyard is shuffled into the library, X cards drawn, five lands untapped, no maximum hand size", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 13), hand: ["Finale of Revelation"], graveyard: ["Opt", "Opt"] },
    });
    s = settle(cast(s, "p1", "Finale of Revelation", { x: 10 }));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(10);
    // Library: 10 Forests + 2 Opt, minus 10 cards drawn (a single draw of X).
    expect(s.players.p1?.library).toHaveLength(2);
    // 12 Islands tapped for the spell, 1 stayed untapped: up to five are untapped, so 6 in total.
    const untapped = idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped);
    expect(untapped).toHaveLength(6);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Finale of Revelation");
    expect(commandZone(s, "p1")).toHaveLength(1);
    // At end of turn, no discard down to seven cards.
    s = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "discard");
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.players.p1?.hand).toHaveLength(10);
  });

  it("Lyra Dawnbringer: the other Angels you control get +1/+1 and lifelink; not itself, nor other creatures, nor opposing Angels", () => {
    const s = scenario({
      p1: { battlefield: ["Lyra Dawnbringer", "Serra Angel", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const lyra = chars(s, idOf(s, "p1", "battlefield", "Lyra Dawnbringer"));
    expect([lyra.power, lyra.toughness]).toEqual([5, 5]);
    expect(lyra.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "lifelink"]));
    const mine = chars(s, idOf(s, "p1", "battlefield", "Serra Angel"));
    expect([mine.power, mine.toughness]).toEqual([5, 5]);
    expect(mine.keywords).toContain("lifelink");
    const elf = chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    expect([elf.power, elf.keywords.includes("lifelink")]).toEqual([1, false]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    expect([theirs.power, theirs.keywords.includes("lifelink")]).toEqual([4, false]);
  });

  it("Massacre Wurm: -2/-2 to opposing creatures until end of turn; each opposing creature that dies makes its controller lose 2 life", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 6), "Llanowar Elves"], hand: ["Massacre Wurm"] },
      p2: { battlefield: ["Llanowar Elves", "Llanowar Elves", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Massacre Wurm"));
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(16);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    // A creature of yours that dies makes nobody lose life.
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = settle(act(s, "p1", { type: "pass" }));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 16]);
    // The effect ends at end of turn.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([4, 4]);
  });

  it("Primeval Bounty: 3/3 Beast for a creature spell, three +1/+1 counters for another spell, 3 life per land that enters under your control", () => {
    let s = scenario({
      p1: {
        battlefield: ["Primeval Bounty", "Llanowar Elves", ...lands("Forest", 2)],
        hand: ["Llanowar Elves", "Giant Growth", "Forest"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(1);
    const beast = chars(s, idOf(s, "p1", "battlefield", "Beast"));
    expect([beast.power, beast.toughness, beast.colors]).toEqual([3, 3, ["G"]]);
    expect(s.players.p1?.life).toBe(20);
    s = cast(s, "p1", "Giant Growth", { targets: { t: [elf] } });
    // The trigger's target: a creature you control (not the opposing Angel).
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    }
    s = settle(s, picking([elf]));
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(3);
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(s.players.p1?.life).toBe(23);
  });

  it("Ramos, Dragon Engine: a +1/+1 counter per color of the spell cast; removing five counters gives {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ramos, Dragon Engine", counters: { "+1/+1": 3 } }, ...lands("Mountain", 3), ...lands("Forest", 2)],
        hand: ["Shock", "Halana and Alena, Partners"],
      },
    });
    const ramos = idOf(s, "p1", "battlefield", "Ramos, Dragon Engine");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(4);
    s = settle(cast(s, "p1", "Halana and Alena, Partners"));
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(6);
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ramos);
    expect(opt).toBeDefined();
    if (opt?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: ramos, ability: opt.ability });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(1);
    expect(s.players.p1?.manaPool).toMatchObject({ W: 2, U: 2, B: 2, R: 2, G: 2 });
    // Only once per turn, even with five counters again.
    s.objects[ramos]!.counters["+1/+1"] = 5;
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ramos)).toBe(false);
  });

  it("Rise of the Dark Realms: all creature cards in all graveyards enter under your control", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 9), hand: ["Rise of the Dark Realms"], graveyard: ["Bear Cub", "Opt"] },
      p2: { graveyard: ["Serra Angel", "Shock"] },
    });
    s = settle(cast(s, "p1", "Rise of the Dark Realms"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.owner).toBe("p2");
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Rite of the Dragoncaller: a 5/5 flying Dragon for each of your instants and sorceries, nothing for a creature or for opposing spells", () => {
    let s = scenario({
      p1: { battlefield: ["Rite of the Dragoncaller", ...lands("Island", 2), "Forest"], hand: ["Opt", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    const d = chars(s, idOf(s, "p1", "battlefield", "Dragon"));
    expect([d.power, d.toughness, d.colors, d.keywords.includes("flying")]).toEqual([5, 5, ["R"], true]);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Dragon")).toHaveLength(0);
  });

  it("Sphinx of the Final Word: can't be countered, has hexproof; your instants and sorceries can't be countered", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 8), hand: ["Sphinx of the Final Word", "Opt"] },
      p2: { battlefield: [...lands("Island", 6), "Mountain"], hand: ["Cancel", "Cancel", "Shock"] },
    });
    s = cast(s, "p1", "Sphinx of the Final Word");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    const sphinx = idOf(s, "p1", "battlefield", "Sphinx of the Final Word");
    expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
    // Hexproof: opposing Shock can't target it.
    s = cast(s, "p1", "Opt");
    s = act(s, "p1", { type: "pass" });
    const shock = legalActions(s, "p2").find((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
    expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal).not.toContain(sphinx);
    s = cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    // Opt resolved (a card drawn), Cancel countered nothing.
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Sphinx of the Final Word: your creature spells can still be countered", () => {
    let s = scenario({
      p1: { battlefield: ["Sphinx of the Final Word", "Forest"], hand: ["Llanowar Elves"] },
      p2: { battlefield: lands("Island", 3), hand: ["Cancel"] },
    });
    s = cast(s, "p1", "Llanowar Elves");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Valkyrie's Call: a nontoken non-Angel creature of yours that dies returns with a +1/+1 counter, flying and the Angel type", () => {
    let s = scenario({
      p1: { battlefield: ["Valkyrie's Call", "Llanowar Elves", "Serra Angel"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = settle(act(s, "p1", { type: "pass" }));
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(1);
    const c = chars(s, elf);
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.keywords).toContain("flying");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Angel"]));
    // An Angel doesn't return, nor does an opposing creature.
    destroy(s, idOf(s, "p1", "battlefield", "Serra Angel"));
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    // The Elf, now an Angel, no longer returns.
    destroy(s, elf);
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Valkyrie's Call: a creature token that dies doesn't return", () => {
    let s = scenario({
      p1: { battlefield: ["Valkyrie's Call", ...lands("Mountain", 3)], hand: ["Dragon Fodder"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const goblins = idsOf(s, "p1", "battlefield", "Goblin");
    expect(goblins).toHaveLength(2);
    destroy(s, goblins[0] as string);
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
  });

  it("Zimone, Paradox Sculptor: at the beginning of your combat, a +1/+1 counter on up to two creatures of yours", () => {
    let s = scenario({
      step: "main1",
      p1: { battlefield: ["Zimone, Paradox Sculptor", "Llanowar Elves", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "pass" });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length > 0);
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    }
    s = settle(s, picking([elf, cub]));
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(1);
    expect(counterCount(s.objects[cub] as never, "+1/+1")).toBe(1);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Zimone, Paradox Sculptor")] as never, "+1/+1")).toBe(0);
  });

  it("Zimone, Paradox Sculptor: {G}{U}, {T} doubles each kind of counter on up to two creatures or artifacts of yours", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Zimone, Paradox Sculptor",
          { name: "Llanowar Elves", counters: { "+1/+1": 2, flying: 1 } },
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          { name: "Fire Elemental", counters: { "+1/+1": 1 } },
          "Forest",
          "Island",
        ],
      },
    });
    const zimone = idOf(s, "p1", "battlefield", "Zimone, Paradox Sculptor");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    s = settle(act(s, "p1", { type: "activate", source: zimone, ability: 1, targets: { t: [elf, cub] } }));
    expect(s.objects[zimone]?.tapped).toBe(true);
    expect(s.objects[elf]?.counters).toMatchObject({ "+1/+1": 4, flying: 2 });
    expect(counterCount(s.objects[cub] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[fire] as never, "+1/+1")).toBe(1);
  });
});

describe("Foundations, lot K8: rares (1)", () => {
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Activates the first activated ability (non-mana) of `source`. */
  const activate = (s: S, source: string, extra: Record<string, unknown> = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error("ability not found");
    return act(s, "p1", { type: "activate", source, ability: a.ability, ...extra });
  };
  const pendingRequest = (s: S) => (s.pending?.kind === "choice" ? s.pending.request : undefined);
  const untilChoice = (s: S, intent: string) =>
    advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === intent);
  const hand = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  /** Plays until `until`: passes, neither attacks nor blocks, answers choices with `answer` (otherwise the suggestion). */
  const run = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined) => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateOption = (s: S, source: string) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    return a?.type === "activate" ? a : undefined;
  };
  const zombie = customCard({ name: "Zombie de test", subtypes: ["Zombie"], power: 2, toughness: 2 });
  const skeleton = customCard({ name: "Squelette de test", subtypes: ["Skeleton"], power: 1, toughness: 1 });

  it("Adaptive Automaton: has the chosen type and gives +1/+1 to other creatures of that type you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Llanowar Elves", "Bear Cub"], hand: ["Adaptive Automaton"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = passBoth(cast(s, "p1", "Adaptive Automaton"));
    expect(pendingRequest(s)?.intent).toBe("chooseOnEnter");
    s = settle(choose(s, ["Elf"]));
    const auto = idOf(s, "p1", "battlefield", "Adaptive Automaton");
    expect(chars(s, auto).subtypes).toEqual(expect.arrayContaining(["Construct", "Elf"]));
    expect(pt(s, auto)).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Alesha, Who Laughs at Fate: counter on attack; Raid: reanimates a creature with mana value ≤ its power", () => {
    let s = scenario({
      p1: { battlefield: ["Alesha, Who Laughs at Fate"], graveyard: ["Bear Cub", "Savannah Lions", "Shivan Dragon"] },
    });
    const alesha = idOf(s, "p1", "battlefield", "Alesha, Who Laughs at Fate");
    expect(chars(s, alesha).keywords).toContain("firstStrike");
    s = settleNoBlocks(attack(s, [alesha]));
    expect(counterCount(s.objects[alesha] as never, "+1/+1")).toBe(1);
    s = untilChoice(s, "triggerTarget");
    expect(s.players.p2?.life).toBe(17);
    const req = pendingRequest(s);
    // Power 3: Bear Cub (2) and Savannah Lions (1), not Shivan Dragon (6).
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Bear Cub")]));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    // Without an attack, nothing returns.
    s = scenario({ p1: { battlefield: ["Alesha, Who Laughs at Fate"], graveyard: ["Bear Cub"] } });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Ancestor Dragon: you gain 1 life per attacking creature", () => {
    let s = scenario({ p1: { battlefield: ["Ancestor Dragon", "Bear Cub", "Savannah Lions"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Ancestor Dragon")).keywords).toContain("flying");
    s = settle(attack(s, [idOf(s, "p1", "battlefield", "Ancestor Dragon"), idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Arahbo, the First Fang: other Cats +1/+1; a nontoken Cat that enters creates a 1/1 Cat", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 4), ...lands("Forest", 2), "Savannah Lions"],
        hand: ["Arahbo, the First Fang", "Savannah Lions", "Bear Cub"],
      },
      p2: { battlefield: ["Savannah Lions"] },
    });
    s = settle(cast(s, "p1", "Arahbo, the First Fang"));
    const arahbo = idOf(s, "p1", "battlefield", "Arahbo, the First Fang");
    // Arahbo itself creates a Cat; the token (2/2 with the bonus) triggers nothing.
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    expect(pt(s, idOf(s, "p1", "battlefield", "Cat"))).toEqual([2, 2]);
    expect(pt(s, arahbo)).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    s = settle(cast(s, "p1", "Savannah Lions"));
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(2);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(2);
  });

  it("Archmage of Runes: instants and sorceries cost {1} less and draw cards; not creatures", () => {
    let s = scenario({ p1: { battlefield: ["Archmage of Runes", ...lands("Island", 4)], hand: ["Quick Study", "Bear Cub"] } });
    s = settle(cast(s, "p1", "Quick Study"));
    // {2}{U} paid with two Islands; one card from the trigger and two from the spell.
    expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(2);
    expect(hand(s)).toBe(1 + 3);
    s = scenario({ p1: { battlefield: ["Archmage of Runes", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(hand(s)).toBe(0);
  });

  it("Ashroot Animist: on attack, another creature you control gets +X/+X (X = its power) and trample", () => {
    let s = scenario({ p1: { battlefield: ["Ashroot Animist", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const animist = idOf(s, "p1", "battlefield", "Ashroot Animist");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, animist).keywords).toContain("trample");
    s = attack(s, [animist]);
    s = settle(s);
    // Only legal target: Bear Cub (not the Animist, nor the opposing creature).
    expect(pt(s, bear)).toEqual([6, 6]);
    expect(chars(s, bear).keywords).toContain("trample");
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Ball Lightning: haste and trample, sacrificed at the beginning of the end step", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Ball Lightning"] } });
    s = settle(cast(s, "p1", "Ball Lightning"));
    const ball = idOf(s, "p1", "battlefield", "Ball Lightning");
    expect(chars(s, ball).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    s = settleNoBlocks(attack(s, [ball]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(onBattlefield(s, ball)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Ball Lightning")).toHaveLength(1);
    // Also at an opponent's end step.
    s = scenario({ active: "p2", p1: { battlefield: ["Ball Lightning"] } });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Ball Lightning")).toHaveLength(1);
  });

  it("Basilisk Collar: the equipped creature has deathtouch and lifelink; equip {2}", () => {
    let s = scenario({ p1: { battlefield: ["Basilisk Collar", "Bear Cub", ...lands("Plains", 2)] } });
    const collar = idOf(s, "p1", "battlefield", "Basilisk Collar");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, collar, { targets: { t: [bear] } }));
    expect(s.objects[collar]?.attachedTo).toBe(bear);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    s = settleNoBlocks(attack(s, [bear]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Brass's Bounty: a Treasure per land you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 7), "Bear Cub"], hand: ["Brass's Bounty"] },
      p2: { battlefield: ["Forest"] },
    });
    s = settle(cast(s, "p1", "Brass's Bounty"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(7);
  });

  it("Celestial Armor: attaches on entering (hexproof and indestructible until end of turn); +2/+0 and flying", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Savannah Lions"], hand: ["Celestial Armor"] },
    });
    // Flash: cast during the opponent's turn.
    s = cast(act(s, "p2", { type: "pass" }), "p1", "Celestial Armor");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(s, picking([bear]));
    const armor = idOf(s, "p1", "battlefield", "Celestial Armor");
    expect(s.objects[armor]?.attachedTo).toBe(bear);
    expect(pt(s, bear)).toEqual([4, 2]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof", "indestructible"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).not.toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(chars(s, bear).keywords).toContain("flying");
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    expect(chars(s, bear).keywords).not.toContain("indestructible");
  });

  it("Charming Prince: scry 2, 3 life, or exile another creature of yours until the next end step", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Charming Prince"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
    let s = passBoth(cast(setup(), "p1", "Charming Prince"));
    s = untilChoice(s, "triggerMode");
    const req = pendingRequest(s);
    expect(req?.type === "pick" && req.options).toEqual(["0", "1", "2"]);
    s = settle(choose(s, ["1"]));
    expect(s.players.p1?.life).toBe(23);

    s = untilChoice(passBoth(cast(setup(), "p1", "Charming Prince")), "triggerMode");
    s = choose(s, ["2"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Only target: Bear Cub (not the Prince, nor the opposing creature).
    s = settle(s);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Bear Cub");
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Bear Cub").length === 1,
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Corsair Captain: a Treasure on entering; other Pirates you control get +1/+1", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Swab Goblin", "Bear Cub"], hand: ["Corsair Captain"] } });
    s = settle(cast(s, "p1", "Corsair Captain"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(pt(s, idOf(s, "p1", "battlefield", "Swab Goblin"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Corsair Captain"))).toEqual([2, 2]);
  });

  it("Crawling Barrens: {4} puts two +1/+1 counters; it can become a 0/0 creature until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Crawling Barrens", ...lands("Wastes", 0), ...lands("Plains", 8)] } });
    const barrens = idOf(s, "p1", "battlefield", "Crawling Barrens");
    s = activate(s, barrens);
    s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(2);
    expect(chars(s, barrens).types).not.toContain("Creature");
    s = activate(s, barrens);
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(4);
    expect(chars(s, barrens).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(s, barrens).subtypes).toContain("Elemental");
    expect(pt(s, barrens)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(chars(s, barrens).types).not.toContain("Creature");
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(4);
  });

  it("Crossway Troublemakers: attacking Vampires have deathtouch and lifelink; a Vampire dies: 2 life to draw", () => {
    let s = scenario({
      p1: { battlefield: ["Crossway Troublemakers", "Highborn Vampire"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const troub = idOf(s, "p1", "battlefield", "Crossway Troublemakers");
    const vamp = idOf(s, "p1", "battlefield", "Highborn Vampire");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    expect(chars(s, vamp).keywords).not.toContain("deathtouch");
    s = attack(s, [vamp]);
    expect(chars(s, vamp).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    expect(chars(s, troub).keywords).not.toContain("deathtouch");
    s = run(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wurm, attacker: vamp }] });
    s = run(s, (x) => x.turn.step === "main2", yes);
    // Deathtouch: the Wurm dies; lifelink: +4; the Vampire dies: 2 life paid, a card drawn.
    expect(onBattlefield(s, wurm)).toBe(false);
    expect(onBattlefield(s, vamp)).toBe(false);
    expect(s.players.p1?.life).toBe(22);
    expect(hand(s)).toBe(1);
    // Declining to pay: no draw.
    s = scenario({ p1: { battlefield: ["Crossway Troublemakers", "Highborn Vampire"] }, p2: { battlefield: ["Pelakka Wurm"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Highborn Vampire")]);
    s = run(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [
        { blocker: idOf(s, "p2", "battlefield", "Pelakka Wurm"), attacker: idOf(s, "p1", "battlefield", "Highborn Vampire") },
      ],
    });
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "yesNo" ? [0] : undefined),
    );
    expect(s.players.p1?.life).toBe(24);
    expect(hand(s)).toBe(0);
  });

  it("Death Baron: your Skeletons and your other Zombies get +1/+1 and deathtouch", () => {
    const s = scenario({
      p1: { battlefield: ["Death Baron", skeleton, zombie, "Bear Cub"] },
      p2: { battlefield: [zombie] },
    });
    const baron = idOf(s, "p1", "battlefield", "Death Baron");
    const sk = idOf(s, "p1", "battlefield", "Squelette de test");
    const zb = idOf(s, "p1", "battlefield", "Zombie de test");
    expect(pt(s, baron)).toEqual([2, 2]);
    expect(chars(s, baron).keywords).not.toContain("deathtouch");
    expect(pt(s, sk)).toEqual([2, 2]);
    expect(chars(s, sk).keywords).toContain("deathtouch");
    expect(pt(s, zb)).toEqual([3, 3]);
    expect(chars(s, zb).keywords).toContain("deathtouch");
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Zombie de test"))).toEqual([2, 2]);
  });

  it("Desecration Demon: at the beginning of combat, an opponent may sacrifice a creature; if they do, the Demon becomes tapped and gets a counter", () => {
    const setup = () => scenario({ p1: { battlefield: ["Desecration Demon"] }, p2: { battlefield: ["Bear Cub"] } });
    let s = setup();
    const demon = idOf(s, "p1", "battlefield", "Desecration Demon");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = run(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    s = run(
      s,
      (x) => x.turn.step === "declareAttackers" || x.turn.step === "main2",
      (req) => (req.type === "pick" ? [bear] : req.type === "yesNo" ? [1] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[demon]?.tapped).toBe(true);
    expect(counterCount(s.objects[demon] as never, "+1/+1")).toBe(1);
    s = setup();
    s = run(
      s,
      (x) => x.turn.step === "declareAttackers" || x.turn.step === "main2",
      (req) => (req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(true);
    expect(s.objects[demon]?.tapped).toBe(false);
    expect(counterCount(s.objects[demon] as never, "+1/+1")).toBe(0);
  });

  it("Dictate of Kruphix: each player draws an extra card during their draw step", () => {
    let s = scenario({ p1: { battlefield: ["Dictate of Kruphix"] }, step: "upkeep" });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dictate of Kruphix")).keywords).toContain("flash");
    s = run(s, (x) => x.turn.step === "main1" && x.stack.length === 0);
    expect(hand(s)).toBe(2);
    s = run(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.stack.length === 0);
    expect(hand(s, "p2")).toBe(2);
  });

  it("Drake Hatcher: incubation counters equal to the combat damage dealt to a player; removing three creates a 2/2 flying Drake", () => {
    let s = scenario({
      p1: { battlefield: ["Drake Hatcher", ...lands("Island", 3)], hand: ["Quick Study"] },
    });
    const hatcher = idOf(s, "p1", "battlefield", "Drake Hatcher");
    expect(chars(s, hatcher).keywords).toEqual(expect.arrayContaining(["vigilance", "prowess"]));
    // Prowess: +1/+1 for a noncreature spell.
    s = settle(cast(s, "p1", "Quick Study"));
    expect(pt(s, hatcher)).toEqual([2, 4]);
    expect(activateOption(s, hatcher)).toBeUndefined();
    s = attack(s, [hatcher]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.objects[hatcher]?.tapped).toBe(false);
    expect(s.players.p2?.life).toBe(18);
    expect(counterCount(s.objects[hatcher] as never, "incubation")).toBe(2);
    (s.objects[hatcher] as { counters: Record<string, number> }).counters.incubation = 4;
    s.version += 1;
    s = settle(activate(s, hatcher));
    expect(counterCount(s.objects[hatcher] as never, "incubation")).toBe(1);
    const drake = idOf(s, "p1", "battlefield", "Drake");
    expect(pt(s, drake)).toEqual([2, 2]);
    expect(chars(s, drake).keywords).toContain("flying");
    expect(activateOption(s, hatcher)).toBeUndefined();
  });

  it("Drakuseth, Maw of Flames: on attack, 4 damage to a target and 3 to each of up to two other targets", () => {
    let s = scenario({
      p1: { battlefield: ["Drakuseth, Maw of Flames"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const drak = idOf(s, "p1", "battlefield", "Drakuseth, Maw of Flames");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [drak]);
    let otherOptions: string[] = [];
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req, _p, cur) => {
        if (req.intent !== "triggerTarget" || req.type !== "pick") return undefined;
        const spec =
          cur.pending?.kind === "choice" && cur.pending.purpose.kind === "triggerTarget" ? cur.pending.purpose.spec : "";
        if (spec === "a") return ["p2"];
        otherOptions = req.options;
        return [bear, angel];
      },
    );
    // The "other targets" exclude the first.
    expect(otherOptions).not.toContain("p2");
    expect(s.players.p2?.life).toBe(16);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Dread Summons: each player mills X cards; a tapped 2/2 Zombie per creature card milled", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Dread Summons"], library: ["Bear Cub", "Forest", "Savannah Lions"] },
      p2: { library: ["Shivan Dragon", "Pelakka Wurm", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Dread Summons", { x: 2 }));
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Dread Summons", "Forest"]);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(3);
    expect(zombies.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(pt(s, zombies[0] as string)).toEqual([2, 2]);
  });

  it("Drogskol Reaver: flying, double strike, lifelink; each life gain draws a card", () => {
    let s = scenario({ p1: { battlefield: ["Drogskol Reaver"] } });
    const reaver = idOf(s, "p1", "battlefield", "Drogskol Reaver");
    expect(chars(s, reaver).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "lifelink"]));
    s = attack(s, [reaver]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.life).toBe(26);
    // Two life gains (first-strike damage, then regular): two cards.
    expect(hand(s)).toBe(2);
  });

  it("Dropkick Bomber: other Goblins +1/+1; {R}: another Goblin gains flying and is sacrificed when it deals combat damage", () => {
    let s = scenario({ p1: { battlefield: ["Dropkick Bomber", "Swab Goblin", "Bear Cub", "Mountain"] } });
    const bomber = idOf(s, "p1", "battlefield", "Dropkick Bomber");
    const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
    expect(pt(s, bomber)).toEqual([2, 3]);
    expect(pt(s, goblin)).toEqual([3, 3]);
    expect(activateOption(s, bomber)?.targets[0]?.legal).toEqual([goblin]);
    s = settle(activate(s, bomber, { targets: { t: [goblin] } }));
    expect(chars(s, goblin).keywords).toContain("flying");
    s = attack(s, [goblin]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(onBattlefield(s, goblin)).toBe(false);
    expect(idsOf(s, "p1", "graveyard", "Swab Goblin")).toHaveLength(1);
  });

  it("Exemplar of Light: each life gain puts a +1/+1 counter; the following draw triggers only once per turn (and Drogskol Reaver doesn't draw for an opponent)", () => {
    let s = scenario({
      p1: { battlefield: ["Exemplar of Light", ...lands("Plains", 4)], hand: ["Charming Prince", "Charming Prince"] },
    });
    const ex = idOf(s, "p1", "battlefield", "Exemplar of Light");
    expect(chars(s, ex).keywords).toContain("flying");
    const gain3: Answer = (req) => (req.intent === "triggerMode" ? ["1"] : undefined);
    s = run(
      cast(s, "p1", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(s.players.p1?.life).toBe(23);
    expect(counterCount(s.objects[ex] as never, "+1/+1")).toBe(1);
    expect(hand(s)).toBe(2);
    s = run(
      cast(s, "p1", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(counterCount(s.objects[ex] as never, "+1/+1")).toBe(2);
    expect(hand(s)).toBe(1);
    // An opponent who gains life: nothing.
    s = scenario({
      active: "p2",
      p1: { battlefield: ["Exemplar of Light", "Drogskol Reaver"] },
      p2: { battlefield: lands("Plains", 2), hand: ["Charming Prince"] },
    });
    s = run(
      cast(s, "p2", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(s.players.p2?.life).toBe(23);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Exemplar of Light")] as never, "+1/+1")).toBe(0);
    expect(hand(s)).toBe(0);
  });

  it("Extravagant Replication: at your upkeep, a token copy of another nonland permanent you control", () => {
    let s = scenario({
      p1: { battlefield: ["Extravagant Replication", "Bear Cub", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
      active: "p2",
      step: "end",
    });
    s = run(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    expect(bears.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Extravagant Replication")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Felidar Retreat: when a land enters, a 2/2 Cat Beast or a +1/+1 counter and vigilance for your creatures", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Felidar Retreat", "Bear Cub"], hand: ["Plains"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
    let s = setup();
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req) => (req.intent === "triggerMode" ? ["0"] : undefined),
    );
    const cat = idOf(s, "p1", "battlefield", "Cat Beast");
    expect(pt(s, cat)).toEqual([2, 2]);
    expect(chars(s, cat).subtypes).toEqual(expect.arrayContaining(["Cat", "Beast"]));

    s = setup();
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req) => (req.intent === "triggerMode" ? ["1"] : undefined),
    );
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(chars(s, bear).keywords).toContain("vigilance");
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Cat Beast")).toHaveLength(0);
    s = run(s, (x) => x.turn.number === 4);
    expect(chars(s, bear).keywords).not.toContain("vigilance");
  });

  it("Fumigate: destroys all creatures; 1 life per creature destroyed", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Fumigate"] },
      p2: { battlefield: ["Savannah Lions", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Fumigate"));
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Genesis Wave: reveals X cards; permanents with mana value X or less may enter, the rest go to the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 6),
        hand: ["Genesis Wave"],
        library: ["Bear Cub", "Shivan Dragon", "Plains", "Quick Study", "Llanowar Elves"],
      },
    });
    let options: (string | undefined)[] = [];
    s = run(
      cast(s, "p1", "Genesis Wave", { x: 3 }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
      (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(cur, id));
        return req.options;
      },
    );
    // Shivan Dragon (6) exceeds X; the land (0) can enter.
    expect(options.sort()).toEqual(["Bear Cub", "Plains"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Genesis Wave", "Shivan Dragon"]);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Quick Study", "Llanowar Elves"]);
  });

  it("Halana and Alena, Partners: at the beginning of your combat, X counters (X = its power) and haste for another creature", () => {
    let s = scenario({
      p1: { battlefield: ["Halana and Alena, Partners", { name: "Bear Cub", sick: true }] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const ha = idOf(s, "p1", "battlefield", "Halana and Alena, Partners");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, ha).keywords).toEqual(expect.arrayContaining(["reach", "firstStrike"]));
    s = run(s, (x) => x.pending?.kind === "declareAttackers");
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[ha] as never, "+1/+1")).toBe(0);
    expect(chars(s, bear).keywords).toContain("haste");
    // Entered this turn, it can attack thanks to haste.
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
    // Not at an opponent's combat.
    s = scenario({ active: "p2", p1: { battlefield: ["Halana and Alena, Partners", "Bear Cub"] } });
    s = run(s, (x) => x.turn.step === "main2");
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")] as never, "+1/+1")).toBe(0);
  });

  it("Harmless Offering: the targeted opponent gains control of a permanent you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Harmless Offering"] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    expect(() => cast(s, "p1", "Harmless Offering", { targets: { a: ["p2"], b: [lions] } })).toThrow();
    expect(() => cast(s, "p1", "Harmless Offering", { targets: { a: ["p1"], b: [bear] } })).toThrow();
    s = settle(cast(s, "p1", "Harmless Offering", { targets: { a: ["p2"], b: [bear] } }));
    expect(s.objects[bear]?.controller).toBe("p2");
  });

  it("Heroes' Bane: enters with four +1/+1 counters; {2}{G}{G}: X counters, X being its power", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 9), hand: ["Heroes' Bane"] } });
    s = settle(cast(s, "p1", "Heroes' Bane"));
    const bane = idOf(s, "p1", "battlefield", "Heroes' Bane");
    expect(pt(s, bane)).toEqual([4, 4]);
    s = settle(activate(s, bane));
    expect(counterCount(s.objects[bane] as never, "+1/+1")).toBe(8);
    expect(pt(s, bane)).toEqual([8, 8]);
  });

  it("High-Society Hunter: on attack, sacrificing another creature gives a counter; another nontoken creature that dies makes you draw", () => {
    let s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const hunter = idOf(s, "p1", "battlefield", "High-Society Hunter");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, hunter).keywords).toContain("flying");
    s = attack(s, [hunter]);
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : req.type === "yesNo" ? [1] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(false);
    expect(counterCount(s.objects[hunter] as never, "+1/+1")).toBe(1);
    expect(hand(s)).toBe(1);
    expect(s.players.p2?.life).toBe(14);
    // An opposing nontoken creature that dies: a card; a token: nothing.
    destroy(s, idOf(s, "p2", "battlefield", "Savannah Lions"));
    s = settle(s);
    expect(hand(s)).toBe(2);
    // Declining the sacrifice: no counter.
    s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "High-Society Hunter")]);
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined),
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "High-Society Hunter")] as never, "+1/+1")).toBe(0);
  });

  it("High-Society Hunter: a token that dies doesn't make you draw", () => {
    let s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    (s.objects[bear] as { isToken: boolean }).isToken = true;
    destroy(s, bear);
    s = settle(s);
    expect(hand(s)).toBe(0);
  });

  it("Homunculus Horde: the second card drawn each turn creates a token copy", () => {
    let s = scenario({ p1: { battlefield: ["Homunculus Horde", ...lands("Island", 3)], hand: ["Quick Study"] } });
    s = settle(cast(s, "p1", "Quick Study"));
    const hordes = idsOf(s, "p1", "battlefield", "Homunculus Horde");
    expect(hordes).toHaveLength(2);
    expect(hordes.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(pt(s, hordes[1] as string)).toEqual([2, 2]);
  });

  it("Immersturm Predator: tapped, it exiles up to one card from a graveyard and gets a counter; sacrificing another creature: indestructible and tapped", () => {
    let s = scenario({
      p1: { battlefield: ["Immersturm Predator", "Bear Cub"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const pred = idOf(s, "p1", "battlefield", "Immersturm Predator");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = activateOption(s, pred);
    expect(opt?.additional?.sacrifice?.options).toEqual([bear]);
    s = act(s, "p1", { type: "activate", source: pred, ability: opt?.ability ?? -1, sacrifice: [bear] });
    s = settle(s);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[pred]?.tapped).toBe(true);
    expect(chars(s, pred).keywords).toContain("indestructible");
    expect(counterCount(s.objects[pred] as never, "+1/+1")).toBe(1);
    // The exiled card: Shivan Dragon or Bear Cub (both in a graveyard).
    expect(s.exile).toHaveLength(1);
    s = run(s, (x) => x.turn.number === 4);
    expect(chars(s, pred).keywords).not.toContain("indestructible");
  });

  it("Immersturm Predator: triggers when it attacks, even with no card in a graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Immersturm Predator"] } });
    const pred = idOf(s, "p1", "battlefield", "Immersturm Predator");
    s = attack(s, [pred]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(counterCount(s.objects[pred] as never, "+1/+1")).toBe(1);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Jazal Goldmane: {3}{W}{W}: your attacking creatures get +X/+X, X being the number of attackers", () => {
    let s = scenario({ p1: { battlefield: ["Jazal Goldmane", "Bear Cub", "Savannah Lions", ...lands("Plains", 5)] } });
    const jazal = idOf(s, "p1", "battlefield", "Jazal Goldmane");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(chars(s, jazal).keywords).toContain("firstStrike");
    s = attack(s, [jazal, bear]);
    s = settle(activate(s, jazal));
    expect(pt(s, jazal)).toEqual([6, 6]);
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, lions)).toEqual([2, 1]);
  });

  it("Kalastria Highborn: when it or another of your Vampires dies, pay {B}: the targeted player loses 2 life and you gain 2", () => {
    let s = scenario({
      p1: { battlefield: ["Kalastria Highborn", "Highborn Vampire", "Bear Cub", ...lands("Swamp", 2)] },
      p2: { battlefield: ["Highborn Vampire"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Highborn Vampire"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.intent === "triggerTarget" ? ["p2"] : undefined));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    // Neither a non-Vampire creature nor an opposing Vampire.
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    destroy(s, idOf(s, "p2", "battlefield", "Highborn Vampire"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(s.players.p2?.life).toBe(18);
    destroy(s, idOf(s, "p1", "battlefield", "Kalastria Highborn"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.intent === "triggerTarget" ? ["p2"] : undefined));
    expect(s.players.p2?.life).toBe(16);
    expect(s.players.p1?.life).toBe(24);
    expect(idsOf(s, "p1", "battlefield", "Swamp").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Lathliss, Dragon Queen: another nontoken Dragon that enters creates a 5/5 flying Dragon; {1}{R}: your Dragons +1/+0", () => {
    let s = scenario({
      p1: { battlefield: ["Lathliss, Dragon Queen", "Bear Cub", ...lands("Mountain", 8)], hand: ["Shivan Dragon"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const lathliss = idOf(s, "p1", "battlefield", "Lathliss, Dragon Queen");
    s = settle(cast(s, "p1", "Shivan Dragon"));
    const tokens = idsOf(s, "p1", "battlefield", "Dragon");
    expect(tokens).toHaveLength(1);
    expect(pt(s, tokens[0] as string)).toEqual([5, 5]);
    expect(chars(s, tokens[0] as string).keywords).toContain("flying");
    s = settle(activate(s, lathliss));
    expect(pt(s, lathliss)).toEqual([7, 6]);
    expect(pt(s, tokens[0] as string)).toEqual([6, 5]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Shivan Dragon"))).toEqual([6, 5]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Shivan Dragon"))).toEqual([5, 5]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Lathril, Blade of the Elves: as many 1/1 Elf Warriors as combat damage dealt to a player", () => {
    let s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves"] } });
    const lathril = idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves");
    expect(chars(s, lathril).keywords).toContain("menace");
    s = attack(s, [lathril]);
    s = run(s, (x) => x.turn.step === "main2");
    const elves = idsOf(s, "p1", "battlefield", "Elf Warrior");
    expect(elves).toHaveLength(2);
    expect(pt(s, elves[0] as string)).toEqual([1, 1]);
    expect(chars(s, elves[0] as string).subtypes).toEqual(expect.arrayContaining(["Elf", "Warrior"]));
  });

  it("Lathril, Blade of the Elves: {T} and tap ten other Elves: each opponent loses 10 life and you gain 10", () => {
    let s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves", ...lands("Llanowar Elves", 9)] } });
    const lathril = idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves");
    expect(activateOption(s, lathril)).toBeUndefined();
    s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves", ...lands("Llanowar Elves", 10)] } });
    s = settle(activate(s, idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves")));
    expect(s.players.p2?.life).toBe(10);
    expect(s.players.p1?.life).toBe(30);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Linden, the Steadfast Queen: 1 life for each white attacking creature you control", () => {
    let s = scenario({ p1: { battlefield: ["Linden, the Steadfast Queen", "Savannah Lions", "Bear Cub"] } });
    const linden = idOf(s, "p1", "battlefield", "Linden, the Steadfast Queen");
    expect(chars(s, linden).keywords).toContain("vigilance");
    s = settle(attack(s, [linden, idOf(s, "p1", "battlefield", "Savannah Lions"), idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Lunar Insight: a card per different mana value among your nonland permanents", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), "Bear Cub", "Swab Goblin", "Llanowar Elves", "Savannah Lions", "Shivan Dragon"],
        hand: ["Lunar Insight"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Lunar Insight"));
    // Values 2, 1 and 6: three cards (lands and the opposing creature don't count).
    expect(hand(s)).toBe(3);
  });
});

describe("Foundations, lot K8: rares (2)", () => {
  type Answer = (req: ChoiceRequest) => (string | number)[] | undefined;
  /** Plays until the condition: passes, neither attacks nor blocks, answers choices (`answer`, otherwise the suggestion). */
  const playUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  it("Temples: enter tapped, scry 1 on entering, and produce their two colors", () => {
    const temples: [string, string[]][] = [
      ["Temple of Abandon", ["G", "R"]],
      ["Temple of Enlightenment", ["U", "W"]],
      ["Temple of Epiphany", ["R", "U"]],
      ["Temple of Malady", ["B", "G"]],
      ["Temple of Malice", ["B", "R"]],
      ["Temple of Mystery", ["G", "U"]],
      ["Temple of Plenty", ["G", "W"]],
      ["Temple of Silence", ["B", "W"]],
      ["Temple of Triumph", ["R", "W"]],
    ];
    for (const [name, colors] of temples) {
      let s = scenario({ p1: { hand: [name], library: ["Shivan Dragon", "Opt", "Forest"] } });
      let asked = false;
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
      s = settle(s, (req) => {
        if (req.intent !== "scryBottom") return undefined;
        asked = true;
        return req.type === "pick" ? req.options.slice(0, 1) : undefined;
      });
      expect(asked, name).toBe(true);
      const temple = idOf(s, "p1", "battlefield", name);
      expect(s.objects[temple]?.tapped, name).toBe(true);
      expect(nameOf(s, s.players.p1?.library[0] as string), name).toBe("Opt");
      expect(nameOf(s, s.players.p1?.library.at(-1) as string), name).toBe("Shivan Dragon");
      expect(
        manaAbilitiesOf(s, temple)
          .flatMap((m) => m.produce)
          .sort(),
        name,
      ).toEqual(colors);
    }
  });

  it("Mazemind Tome: {T} and a page counter: scry 1; {2}, {T} and a counter: draw; at the fourth counter, exiled and 4 life", () => {
    let s = scenario({
      p1: { battlefield: ["Mazemind Tome", ...lands("Forest", 2)], library: ["Shivan Dragon", "Opt", "Forest"] },
    });
    const tome = idOf(s, "p1", "battlefield", "Mazemind Tome");
    let scried = false;
    s = act(s, "p1", { type: "activate", source: tome, ability: 0 });
    expect(s.objects[tome]?.tapped).toBe(true);
    expect(s.objects[tome]?.counters.page).toBe(1);
    s = settle(s, (req) => {
      if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
      scried = true;
      return req.options.slice(0, 1);
    });
    expect(scried).toBe(true);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
    expect(handSize(s)).toBe(0);
    // Second ability, with three counters already placed: the fourth triggers the exile and the gain of 4 life.
    s = scenario({ p1: { battlefield: [{ name: "Mazemind Tome", counters: { page: 3 } }, ...lands("Forest", 2)] } });
    const tome2 = idOf(s, "p1", "battlefield", "Mazemind Tome");
    expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === tome2)).toHaveLength(2);
    s = act(s, "p1", { type: "activate", source: tome2, ability: 1 });
    s = settle(s);
    expect(handSize(s)).toBe(1);
    expect(exiled(s, "Mazemind Tome")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(24);
  });

  it("Mazemind Tome: with three page counters or fewer, it stays in play", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Mazemind Tome", counters: { page: 2 } }] } });
    const tome = idOf(s, "p1", "battlefield", "Mazemind Tome");
    s = settle(act(s, "p1", { type: "activate", source: tome, ability: 0 }));
    expect(s.objects[tome]?.counters.page).toBe(3);
    expect(onBattlefield(s, tome)).toBe(true);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Mentor of the Meek: another creature with power 2 or less enters, pay {1} to draw; not for power 3 or more", () => {
    let s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Forest", 2)], hand: ["Llanowar Elves"] } });
    s = cast(s, "p1", "Llanowar Elves");
    let asked = false;
    s = settle(s, (req) => {
      if (req.type !== "yesNo") return undefined;
      asked = true;
      return [1];
    });
    expect(asked).toBe(true);
    expect(handSize(s)).toBe(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(2);
    // Refusal: no draw.
    s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Forest", 2)], hand: ["Llanowar Elves"] } });
    s = settle(cast(s, "p1", "Llanowar Elves"), no);
    expect(handSize(s)).toBe(0);
    // The Mentor itself ("another creature"): no trigger.
    s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Mentor of the Meek"] } });
    s = passBoth(cast(s, "p1", "Mentor of the Meek"));
    expect(idsOf(s, "p1", "battlefield", "Mentor of the Meek")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    expect(s.triggers).toHaveLength(0);
    // A creature with power 3: no trigger.
    s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Plains", 3)], hand: ["Cathar Commando"] } });
    s = cast(s, "p1", "Cathar Commando");
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Cathar Commando")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    expect(s.pending?.kind).toBe("priority");
  });

  it("Midnight Reaper: a nontoken creature you control dies: 1 damage and a card; not for a token nor an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Midnight Reaper", "Llanowar Elves", ...lands("Swamp", 2)], hand: ["Stab", "Stab"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(2);
    // The opposing creature that dies doesn't count.
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(1);
    // A token that dies doesn't count.
    s = scenario({
      p1: { battlefield: ["Midnight Reaper", ...lands("Mountain", 2), "Swamp"], hand: ["Dragon Fodder", "Stab"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin")] } }));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
    expect(handSize(s)).toBe(0);
    // The Reaper sees its own death.
    s = scenario({ p1: { battlefield: ["Midnight Reaper", "Swamp"], hand: ["Stab"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Midnight Reaper")] } }));
    expect(idsOf(s, "p1", "graveyard", "Midnight Reaper")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(1);
  });

  it("Mystic Archaeologist: {3}{U}{U}: draw two cards", () => {
    let s = scenario({ p1: { battlefield: ["Mystic Archaeologist", ...lands("Island", 5)] } });
    const arch = idOf(s, "p1", "battlefield", "Mystic Archaeologist");
    s = settle(act(s, "p1", { type: "activate", source: arch, ability: 0 }));
    expect(handSize(s)).toBe(2);
    expect(s.objects[arch]?.tapped).toBe(false);
  });

  it("Nullpriest of Oblivion: lifelink and menace; kicked, it reanimates a creature from your graveyard; otherwise nothing", () => {
    const setup = (n: number) =>
      scenario({
        p1: { battlefield: lands("Swamp", n), hand: ["Nullpriest of Oblivion"], graveyard: ["Shivan Dragon", "Bear Cub", "Opt"] },
        p2: { graveyard: ["Pelakka Wurm"] },
      });
    const kicked = cast(setup(6), "p1", "Nullpriest of Oblivion", { kicked: true });
    let options: (string | undefined)[] = [];
    let s = settle(kicked, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      options = namesIn(kicked, req.options);
      return pickNamed(kicked, req, "Shivan Dragon");
    });
    // Only creature cards in your graveyard are targets.
    expect(options.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    const priest = idOf(s, "p1", "battlefield", "Nullpriest of Oblivion");
    expect(chars(s, priest).keywords).toEqual(expect.arrayContaining(["lifelink", "menace"]));
    s = settle(cast(setup(2), "p1", "Nullpriest of Oblivion"));
    expect(idsOf(s, "p1", "battlefield", "Nullpriest of Oblivion")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Ovika: a noncreature spell creates X 1/1 Phyrexian Goblins with haste (X = its mana value); not a creature spell", () => {
    let s = scenario({
      p1: { battlefield: ["Ovika, Enigma Goliath", ...lands("Mountain", 3)], hand: ["Dragon Fodder", "Fire Elemental"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const gobs = idsOf(s, "p1", "battlefield", "Phyrexian Goblin");
    expect(gobs).toHaveLength(2);
    for (const g of gobs) {
      expect(pt(s, g)).toEqual([1, 1]);
      expect(chars(s, g).colors).toEqual(["R"]);
      expect(chars(s, g).keywords).toContain("haste");
    }
    // Dragon Fodder's Goblins don't have haste.
    expect(chars(s, idOf(s, "p1", "battlefield", "Goblin")).keywords).not.toContain("haste");
    const ovika = idOf(s, "p1", "battlefield", "Ovika, Enigma Goliath");
    expect(chars(s, ovika).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
    // A creature spell: nothing.
    s = scenario({ p1: { battlefield: ["Ovika, Enigma Goliath", ...lands("Mountain", 5)], hand: ["Fire Elemental"] } });
    s = settle(cast(s, "p1", "Fire Elemental"));
    expect(idsOf(s, "p1", "battlefield", "Phyrexian Goblin")).toHaveLength(0);
  });

  it("Ovika: ward - {3} and 3 life; the opponent who pays loses 3 life, otherwise their spell is countered", () => {
    const setup = (n: number) =>
      scenario({
        active: "p2",
        p1: { battlefield: ["Ovika, Enigma Goliath"] },
        p2: { battlefield: lands("Swamp", n), hand: ["Stab"] },
      });
    let s = setup(1);
    const ovika = idOf(s, "p1", "battlefield", "Ovika, Enigma Goliath");
    s = settle(cast(s, "p2", "Stab", { targets: { t: [ovika] } }));
    expect(idsOf(s, "p2", "graveyard", "Stab")).toHaveLength(1);
    expect(pt(s, ovika)).toEqual([6, 6]);
    s = setup(4);
    s = cast(s, "p2", "Stab", { targets: { t: [ovika] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    s = choose(s, [1]);
    expect(s.players.p2?.life).toBe(17);
    s = settle(s);
    expect(pt(s, ovika)).toEqual([4, 4]);
  });

  it("Predator Ooze: indestructible; a +1/+1 counter when it attacks and when a creature it damaged this turn dies", () => {
    let s = scenario({ p1: { battlefield: ["Predator Ooze"] }, p2: { battlefield: ["Bear Cub"] } });
    const ooze = idOf(s, "p1", "battlefield", "Predator Ooze");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(chars(s, ooze).keywords).toContain("indestructible");
    s = attack(s, [ooze]);
    s = playUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(plusOnes(s, ooze)).toBe(1);
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: ooze }] });
    s = playUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0);
    // The 2/2 Bear dies from the 2/2 Ooze's 2 damage; the Ooze, indestructible, survives and gets a counter.
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(onBattlefield(s, ooze)).toBe(true);
    expect(plusOnes(s, ooze)).toBe(2);
    destroy(s, ooze);
    expect(onBattlefield(s, ooze)).toBe(true);
  });

  it("Predator Ooze: a creature it didn't damage that dies gives it nothing", () => {
    let s = scenario({ p1: { battlefield: ["Predator Ooze", "Swamp"], hand: ["Stab"] }, p2: { battlefield: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Predator Ooze"))).toBe(0);
  });

  it("Preposterous Proportions: your creatures +10/+10 and vigilance until end of turn, not the opponent's", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Bear Cub", ...lands("Forest", 7)], hand: ["Preposterous Proportions"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Preposterous Proportions"));
    expect(pt(s, elf)).toEqual([11, 11]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([12, 12]);
    expect(chars(s, elf).keywords).toContain("vigilance");
    expect(pt(s, theirs)).toEqual([2, 2]);
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, elf)).toEqual([1, 1]);
    expect(chars(s, elf).keywords).not.toContain("vigilance");
  });

  it("Prime Speaker Zegana: enters with as many counters as the greatest power among your other creatures, then draws as many as its power", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 4), ...lands("Island", 2)],
        hand: ["Prime Speaker Zegana"],
      },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Prime Speaker Zegana"));
    const zegana = idOf(s, "p1", "battlefield", "Prime Speaker Zegana");
    // Greatest power among your other creatures: 2 (the Bear); the opposing Wurm doesn't count.
    expect(plusOnes(s, zegana)).toBe(2);
    expect(pt(s, zegana)).toEqual([3, 3]);
    expect(handSize(s)).toBe(3);
  });

  it("Raise the Past: returns all creature cards with mana value 2 or less from your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Raise the Past"],
        graveyard: ["Llanowar Elves", "Bear Cub", "Shivan Dragon", "Opt", "Savannah Lions"],
      },
      p2: { graveyard: ["Healer's Hawk"] },
    });
    s = settle(cast(s, "p1", "Raise the Past"));
    expect(
      namesIn(
        s,
        s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Bear Cub", "Llanowar Elves", "Savannah Lions"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Raise the Past", "Shivan Dragon"]);
    expect(idsOf(s, "p2", "graveyard", "Healer's Hawk")).toHaveLength(1);
  });

  it("Rampaging Baloths: trample; a land enters under your control: a green 4/4 Beast; not for an opposing land", () => {
    let s = scenario({ p1: { battlefield: ["Rampaging Baloths"], hand: ["Forest"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Rampaging Baloths")).keywords).toContain("trample");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const beasts = idsOf(s, "p1", "battlefield", "Beast");
    expect(beasts).toHaveLength(1);
    expect(pt(s, beasts[0] as string)).toEqual([4, 4]);
    expect(chars(s, beasts[0] as string).colors).toEqual(["G"]);
    s = scenario({ active: "p2", p1: { battlefield: ["Rampaging Baloths"] }, p2: { hand: ["Forest"] } });
    s = settle(act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Forest") }));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Beast")).toHaveLength(0);
  });

  it("Redcap Gutter-Dweller: menace; on entering, two black 1/1 Rats that can't block", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Redcap Gutter-Dweller"] } });
    s = settle(cast(s, "p1", "Redcap Gutter-Dweller"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller")).keywords).toContain("menace");
    const rats = idsOf(s, "p1", "battlefield", "Rat");
    expect(rats).toHaveLength(2);
    for (const r of rats) {
      expect(pt(s, r)).toEqual([1, 1]);
      expect(chars(s, r).colors).toEqual(["B"]);
      expect(chars(s, r).keywords).toContain("cantBlock");
    }
  });

  it("Redcap Gutter-Dweller: at your upkeep, sacrifice another creature: a +1/+1 counter and the top card exiled, playable this turn", () => {
    const setup = () =>
      scenario({
        active: "p2",
        step: "end",
        p1: {
          battlefield: ["Redcap Gutter-Dweller", "Llanowar Elves", ...lands("Forest", 2)],
          library: ["Bear Cub", ...lands("Forest", 5)],
        },
      });
    let s = setup();
    const redcap = idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    let offered: string[] = [];
    s = playUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => {
        if (req.type !== "pick" || req.intent !== "sacrifice") return undefined;
        offered = req.options;
        return [elf];
      },
    );
    // The Redcap itself isn't offered ("another creature").
    expect(offered).toEqual([elf]);
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(plusOnes(s, redcap)).toBe(1);
    const bear = exiled(s, "Bear Cub")[0] as string;
    expect(bear).toBeDefined();
    expect(castable(s, "p1", bear)).toBe(true);
    // Without a sacrifice: neither counter nor exile.
    s = playUntil(
      setup(),
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => (req.type === "pick" && req.intent === "sacrifice" ? [] : undefined),
    );
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller"))).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.exile).toHaveLength(0);
  });

  it("Regal Caracal: two 1/1 Cats with lifelink; your other Cats get +1/+1 and lifelink", () => {
    let s = scenario({
      p1: { battlefield: ["Savannah Lions", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Regal Caracal"] },
      p2: { battlefield: ["Leonin Skyhunter"] },
    });
    s = settle(cast(s, "p1", "Regal Caracal"));
    const cats = idsOf(s, "p1", "battlefield", "Cat");
    expect(cats).toHaveLength(2);
    for (const c of cats) {
      expect(pt(s, c)).toEqual([2, 2]);
      expect(chars(s, c).colors).toEqual(["W"]);
      expect(chars(s, c).keywords).toContain("lifelink");
    }
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(pt(s, lions)).toEqual([3, 2]);
    expect(chars(s, lions).keywords).toContain("lifelink");
    // Neither the Caracal itself, nor a non-Cat, nor the opposing Cat.
    const caracal = idOf(s, "p1", "battlefield", "Regal Caracal");
    expect(pt(s, caracal)).toEqual([3, 3]);
    expect(chars(s, caracal).keywords).not.toContain("lifelink");
    expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Leonin Skyhunter"))).toEqual([2, 2]);
  });

  it("Rite of Replication: a token copy of the targeted creature; five if kicked", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Island", 9), hand: ["Rite of Replication"] }, p2: { battlefield: ["Serra Angel"] } });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Rite of Replication", { targets: { t: [angel] } }));
    const copies = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(chars(s, copies[0] as string).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = setup();
    s = settle(cast(s, "p1", "Rite of Replication", { targets: { t: [angel] }, kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(5);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("River's Rebuke: returns all nonland permanents of the targeted player to hand", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["River's Rebuke"] },
      p2: { battlefield: ["Serra Angel", "Banishing Light", "Mazemind Tome", "Plains"] },
    });
    s = settle(cast(s, "p1", "River's Rebuke", { targets: { t: ["p2"] } }));
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Banishing Light", "Mazemind Tome", "Serra Angel"]);
    expect(idsOf(s, "p2", "battlefield", "Plains")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Rune-Scarred Demon: flying; on entering, searches for any card in the library and puts it into hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 7), hand: ["Rune-Scarred Demon"], library: ["Forest", "Opt", "Forest", "Forest"] },
    });
    s = settle(cast(s, "p1", "Rune-Scarred Demon"), (req) =>
      req.type === "pick" && req.intent === "search" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
    );
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Rune-Scarred Demon")).keywords).toContain("flying");
  });

  it("Scrawling Crawler: at your upkeep, each player draws; an opponent who draws loses 1 life, not you", () => {
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Scrawling Crawler"] } });
    s = playUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // p1: a card at upkeep, one at the draw step; p2: a card, 1 life lost.
    expect(handSize(s, "p1")).toBe(2);
    expect(handSize(s, "p2")).toBe(1);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(20);
    // The opponent also loses 1 life for their draw on their own turn.
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(handSize(s, "p2")).toBe(2);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Skyknight Squire: a +1/+1 counter when another of your creatures enters; at three counters, flying and Knight", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Skyknight Squire", counters: { "+1/+1": 1 } }, ...lands("Forest", 2)],
        hand: ["Llanowar Elves", "Llanowar Elves"],
      },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    const squire = idOf(s, "p1", "battlefield", "Skyknight Squire");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(plusOnes(s, squire)).toBe(2);
    expect(chars(s, squire).keywords).not.toContain("flying");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(plusOnes(s, squire)).toBe(3);
    expect(pt(s, squire)).toEqual([4, 4]);
    expect(chars(s, squire).keywords).toContain("flying");
    expect(chars(s, squire).subtypes).toEqual(expect.arrayContaining(["Cat", "Scout", "Knight"]));
  });

  it("Skyknight Squire: an opposing creature that enters doesn't count", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Skyknight Squire"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Skyknight Squire"))).toBe(0);
  });

  it("Solemn Simulacrum: on entering, may search for a basic land that enters tapped; on dying, may draw", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 5)],
        hand: ["Solemn Simulacrum", "Stab"],
        library: ["Opt", "Island", "Hallowed Fountain", "Opt"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Solemn Simulacrum"), (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(s, req.options);
      return req.options.filter((id) => nameOf(s, id) === "Island");
    });
    // Only the basic land is offered.
    expect(offered).toEqual(["Island"]);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    const solemn = idOf(s, "p1", "battlefield", "Solemn Simulacrum");
    s = settle(cast(s, "p1", "Stab", { targets: { t: [solemn] } }), yes);
    expect(idsOf(s, "p1", "graveyard", "Solemn Simulacrum")).toHaveLength(1);
    expect(handSize(s)).toBe(1);
  });

  it("Solemn Simulacrum: declining the search and the draw", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5)], hand: ["Solemn Simulacrum", "Stab"], library: ["Island", "Opt"] },
    });
    s = settle(cast(s, "p1", "Solemn Simulacrum"), no);
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(0);
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Solemn Simulacrum")] } }), no);
    expect(handSize(s)).toBe(0);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Spinner of Souls: reach; another nontoken creature dies: reveals up to one creature, into hand, the rest underneath", () => {
    let s = scenario({
      p1: {
        battlefield: ["Spinner of Souls", "Llanowar Elves", "Swamp"],
        hand: ["Stab"],
        library: ["Forest", "Opt", "Pelakka Wurm", "Island"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Spinner of Souls")).keywords).toContain("reach");
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }), yes);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Pelakka Wurm"]);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Island");
    expect(lib.slice(1).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Spinner of Souls: nothing for a token, nor for Spinner itself", () => {
    let s = scenario({
      p1: {
        battlefield: ["Spinner of Souls", ...lands("Mountain", 2), "Swamp"],
        hand: ["Dragon Fodder", "Stab"],
        library: ["Pelakka Wurm"],
      },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin")] } }), yes);
    expect(handSize(s)).toBe(0);
    s = scenario({ p1: { battlefield: ["Spinner of Souls", "Swamp"], hand: ["Stab"], library: ["Pelakka Wurm"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Spinner of Souls")] } }), yes);
    expect(handSize(s)).toBe(0);
  });

  it("Surrak: at the beginning of combat, if your creatures have total power 8 or more, a targeted creature you control gains haste", () => {
    let s = scenario({ p1: { battlefield: ["Surrak, the Hunt Caller", { name: "Fire Elemental", sick: true }] } });
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    expect(chars(s, fire).keywords).not.toContain("haste");
    s = playUntil(
      s,
      (x) => x.pending?.kind === "declareAttackers",
      (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [fire] : undefined),
    );
    expect(chars(s, fire).keywords).toContain("haste");
    // 5 + 2 = 7: no trigger.
    s = scenario({ p1: { battlefield: ["Surrak, the Hunt Caller", { name: "Bear Cub", sick: true }] } });
    s = playUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
  });

  it("Sylvan Scavenging: at your end step, a +1/+1 counter on one of your creatures, or a 3/3 Raccoon if you control a creature with power 4 or more", () => {
    const toEnd = (battlefield: string[], mode: string) => {
      const s = scenario({
        step: "main2",
        p1: { battlefield: ["Sylvan Scavenging", ...battlefield] },
        p2: { battlefield: ["Pelakka Wurm"] },
      });
      return playUntil(
        s,
        (x) => x.turn.active === "p2",
        (req) => (req.type === "pick" && req.intent === "triggerMode" ? [mode] : undefined),
      );
    };
    let s = toEnd(["Bear Cub"], "0");
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    // Mode 2 without a creature of power 4 (the opposing Wurm doesn't count): no Raccoon.
    s = toEnd(["Bear Cub"], "1");
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Raccoon")).toHaveLength(0);
    s = toEnd(["Fire Elemental"], "1");
    const raccoons = idsOf(s, "p1", "battlefield", "Raccoon");
    expect(raccoons).toHaveLength(1);
    expect(pt(s, raccoons[0] as string)).toEqual([3, 3]);
    expect(chars(s, raccoons[0] as string).colors).toEqual(["G"]);
  });

  it("Taurean Mauler: changeling; when an opponent casts a spell, may get a +1/+1 counter; not for your spells", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Taurean Mauler"] },
      p2: { battlefield: ["Island", "Island"], hand: ["Opt", "Opt"] },
    });
    const mauler = idOf(s, "p1", "battlefield", "Taurean Mauler");
    expect(chars(s, mauler).keywords).toContain("changeling");
    s = settle(cast(s, "p2", "Opt"), yes);
    expect(plusOnes(s, mauler)).toBe(1);
    s = settle(cast(s, "p2", "Opt"), no);
    expect(plusOnes(s, mauler)).toBe(1);
    s = scenario({ p1: { battlefield: ["Taurean Mauler", "Island"], hand: ["Opt"] } });
    s = settle(cast(s, "p1", "Opt"), yes);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Taurean Mauler"))).toBe(0);
  });

  it("Tempest Djinn: flying; +1/+0 for each basic Island you control", () => {
    const s = scenario({
      p1: { battlefield: ["Tempest Djinn", ...lands("Island", 3), "Hallowed Fountain", "Forest"] },
      p2: { battlefield: lands("Island", 2) },
    });
    const djinn = idOf(s, "p1", "battlefield", "Tempest Djinn");
    // Three basic Islands: the nonbasic Island and the opposing Islands don't count.
    expect(pt(s, djinn)).toEqual([3, 4]);
    expect(chars(s, djinn).keywords).toContain("flying");
  });

  it("Terror of Mount Velus: flying and double strike; on entering, your creatures gain double strike until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 7)], hand: ["Terror of Mount Velus"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Terror of Mount Velus"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const terror = idOf(s, "p1", "battlefield", "Terror of Mount Velus");
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    expect(chars(s, terror).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike"]));
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("doubleStrike");
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    expect(chars(s, terror).keywords).toContain("doubleStrike");
  });

  it("Voracious Greatshark: flash; on entering, counters a targeted artifact or creature spell", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 7), hand: ["Pelakka Wurm"] },
      p2: { battlefield: lands("Island", 5), hand: ["Voracious Greatshark"] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    const wurm = s.stack[0]?.id as string;
    s = cast(s, "p2", "Voracious Greatshark");
    s = settle(s, (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [wurm] : undefined));
    expect(idsOf(s, "p2", "battlefield", "Voracious Greatshark")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(0);
  });

  it("Voracious Greatshark: a sorcery isn't a target", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Dragon Fodder"] },
      p2: { battlefield: lands("Island", 5), hand: ["Voracious Greatshark"] },
    });
    s = cast(s, "p1", "Dragon Fodder");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Voracious Greatshark"));
    expect(idsOf(s, "p2", "battlefield", "Voracious Greatshark")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(2);
  });

  it("Wilt-Leaf Liege: your other green and white creatures get +1/+1 (+2/+2 if they are both)", () => {
    const s = scenario({
      p1: { battlefield: ["Wilt-Leaf Liege", "Bear Cub", "Savannah Lions", "Fire Elemental"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Wilt-Leaf Liege"))).toEqual([4, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Fire Elemental"))).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Wilt-Leaf Liege: discarded by an opposing spell, it enters the battlefield", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Wilt-Leaf Liege", "Opt"] },
      p2: { battlefield: lands("Swamp", 2), hand: ["Pilfer"] },
    });
    s = cast(s, "p2", "Pilfer", { targets: { t: ["p1"] } });
    s = settle(s, (req) => pickNamed(s, req, "Wilt-Leaf Liege"));
    expect(idsOf(s, "p1", "battlefield", "Wilt-Leaf Liege")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Wilt-Leaf Liege")).toHaveLength(0);
  });

  it("Wishclaw Talisman: enters with three wish counters; {1}, {T}, a counter: searches for a card, then an opponent gains control of it; only during your turn", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Wishclaw Talisman"], library: ["Forest", "Opt", "Forest"] },
      p2: { battlefield: ["Swamp"] },
    });
    s = settle(cast(s, "p1", "Wishclaw Talisman"));
    const claw = idOf(s, "p1", "battlefield", "Wishclaw Talisman");
    expect(s.objects[claw]?.counters.wish).toBe(3);
    // Activation (the talisman is already in play with its three counters).
    s = scenario({
      p1: { battlefield: [{ name: "Wishclaw Talisman", counters: { wish: 3 } }, "Swamp"], library: ["Forest", "Opt", "Forest"] },
      p2: { battlefield: ["Swamp"] },
    });
    const talisman = idOf(s, "p1", "battlefield", "Wishclaw Talisman");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === talisman);
    if (opt?.type !== "activate") throw new Error("Wishclaw Talisman: ability unavailable");
    s = act(s, "p1", { type: "activate", source: talisman, ability: opt.ability });
    expect(s.objects[talisman]?.counters.wish).toBe(2);
    s = settle(s, (req) => (req.type === "pick" && req.intent === "search" ? pickNamed(s, req, "Opt") : undefined));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(s.objects[talisman]?.controller).toBe("p2");
    // During p1's turn, p2 can't activate it.
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === talisman)).toBe(false);
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === talisman)).toBe(true);
  });

  it("Zetalpa: flying, double strike, vigilance, trample and indestructible", () => {
    const s = scenario({ p1: { battlefield: ["Zetalpa, Primal Dawn"] } });
    const z = idOf(s, "p1", "battlefield", "Zetalpa, Primal Dawn");
    expect(chars(s, z).keywords).toEqual(
      expect.arrayContaining(["flying", "doubleStrike", "vigilance", "trample", "indestructible"]),
    );
    expect(pt(s, z)).toEqual([4, 8]);
  });
});

describe("Foundations, lot K8: peu communes (1)", () => {
  const lib = (s: S, p: string, name: string) => (s.players[p]?.library ?? []).filter((id) => nameOf(s, id) === name);
  const pickIntent = (intent: string, ids: string[]) => (req: { intent?: string; type: string }) =>
    req.intent === intent ? ids : undefined;
  const pickNamedIn = (s: S, options: string[], name: string) => options.filter((id) => nameOf(s, id) === name).slice(0, 1);

  it("Balmor, Battlemage Captain: when you cast an instant or sorcery, your creatures get +1/+0 and trample", () => {
    let s = scenario({
      p1: { battlefield: ["Balmor, Battlemage Captain", "Bear Cub", ...lands("Island", 3)], hand: ["Opt"] },
      p2: { battlefield: ["Ordinary Bear", "Island"], hand: ["Opt"] },
    });
    const balmor = idOf(s, "p1", "battlefield", "Balmor, Battlemage Captain");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Ordinary Bear");
    expect(chars(s, balmor).keywords).toContain("flying");
    // The ability triggers and resolves before the instant.
    s = cast(s, "p1", "Opt");
    expect(s.stack).toHaveLength(2);
    s = settle(s);
    expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 2 });
    expect(chars(s, bear).keywords).toContain("trample");
    expect(chars(s, balmor)).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, theirs)).toMatchObject({ power: 4, toughness: 5 });
    expect(chars(s, theirs).keywords).not.toContain("trample");
    // An opponent's spell triggers nothing.
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Opt");
    expect(s.stack).toHaveLength(1);
    // Until end of turn.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Balmor, Battlemage Captain: a creature spell doesn't trigger", () => {
    let s = scenario({ p1: { battlefield: ["Balmor, Battlemage Captain", "Plains"], hand: ["Savannah Lions"] } });
    s = cast(s, "p1", "Savannah Lions");
    expect(s.stack).toHaveLength(1);
    expect(s.triggers).toHaveLength(0);
  });

  it("Battle-Rattle Shaman: at the beginning of combat on your turn, you may give +2/+0 to a targeted creature", () => {
    let s = scenario({ p1: { battlefield: ["Battle-Rattle Shaman", "Bear Cub"] }, p2: { battlefield: ["Ordinary Bear"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // Any creature, and "you may": no possible target.
    expect(req?.type === "pick" && req.min).toBe(0);
    expect(req?.type === "pick" && req.options.length).toBe(3);
    s = settle(choose(s, [bear]));
    expect(s.turn.step).toBe("beginCombat");
    expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 2 });
    // Not at the beginning of the opponent's combat.
    let t = scenario({ active: "p2", p1: { battlefield: ["Battle-Rattle Shaman", "Bear Cub"] } });
    t = advanceUntil(t, (x) => x.turn.step === "declareAttackers" || x.turn.active === "p1");
    expect(t.turn.active).toBe("p2");
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("Battlesong Berserker: whenever you attack, a targeted creature you control gains +1/+0 and menace", () => {
    let s = scenario({
      p1: { battlefield: ["Battlesong Berserker", "Bear Cub", "Savannah Lions"] },
      p2: { battlefield: ["Ordinary Bear"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    // The Berserker doesn't attack itself: "whenever you attack".
    s = attack(s, [bear]);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual([
      "Battlesong Berserker",
      "Bear Cub",
      "Savannah Lions",
    ]);
    s = settle(choose(s, [lions]));
    expect(chars(s, lions)).toMatchObject({ power: 3, toughness: 1 });
    expect(chars(s, lions).keywords).toContain("menace");
    expect(chars(s, bear).keywords).not.toContain("menace");
  });

  it("Affectionate Indrik: on entering, it may fight a targeted creature you don't control", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 6), "Savannah Lions"], hand: ["Affectionate Indrik"] },
        p2: { battlefield: ["Bear Cub", "Ordinary Bear"] },
      });
    let s = cast(setup(), "p1", "Affectionate Indrik");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Ordinary Bear"]);
    s = choose(s, [idOf(s, "p2", "battlefield", "Bear Cub")]);
    s = settle(s, (r) => (r.intent === "may" ? [1] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Affectionate Indrik")]?.damage).toBe(2);
    // It declines: no fight.
    let t = cast(setup(), "p1", "Affectionate Indrik");
    t = settle(t, (r) => (r.intent === "may" ? [0] : r.type === "pick" ? pickNamedIn(t, r.options, "Bear Cub") : undefined));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Affectionate Indrik")]?.damage).toBe(0);
  });

  it("Angel of Finality: flying; on entering, exiles the targeted player's graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 4), hand: ["Angel of Finality"], graveyard: ["Opt"] },
      p2: { graveyard: ["Bear Cub", "Forest"] },
    });
    s = cast(s, "p1", "Angel of Finality");
    s = settle(s, picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest"]);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Angel of Finality")).keywords).toContain("flying");
  });

  it("Arcane Epiphany: costs {1} less if you control a Wizard; draw three cards", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Arcane Epiphany"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Arcane Epiphany"))).toBe(false);
    s = scenario({ p1: { battlefield: [...lands("Island", 4), "Erudite Wizard"], hand: ["Arcane Epiphany"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Arcane Epiphany"))).toBe(true);
    s = settle(cast(s, "p1", "Arcane Epiphany"));
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Archway Angel: flying; on entering, 2 life per Gate you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Azorius Guildgate", "Boros Guildgate"], hand: ["Archway Angel"] },
      p2: { battlefield: ["Dimir Guildgate"] },
    });
    s = settle(cast(s, "p1", "Archway Angel"));
    expect(s.players.p1?.life).toBe(24);
    expect(chars(s, idOf(s, "p1", "battlefield", "Archway Angel")).keywords).toContain("flying");
  });

  it("Aetherize: returns all attacking creatures to their owner's hand", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions"] },
      p2: { battlefield: [...lands("Island", 4), "Ordinary Bear"], hand: ["Aetherize"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Aetherize"));
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Ordinary Bear")).toHaveLength(1);
  });

  it("Biogenic Upgrade: distributes three +1/+1 counters among one to three targets, then doubles the counters on each", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 6), { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions", "Llanowar Elves"],
        hand: ["Biogenic Upgrade"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    // At least one target.
    expect(() => cast(s, "p1", "Biogenic Upgrade", { targets: { t: [] } })).toThrow();
    s = cast(s, "p1", "Biogenic Upgrade", { targets: { t: [bear, lions] } });
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    // At least one counter per target.
    expect(() => choose(s, [3, 0])).toThrow();
    s = choose(s, [2, 1]);
    s = settle(s);
    // Bear Cub: 1 + 2 = 3, doubled to 6; Savannah Lions: 1, doubled to 2; the untargeted Elf has none.
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(6);
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(0);
  });

  it("Bloodtithe Collector: flying; on entering, if an opponent lost life this turn, each opponent discards a card", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Mountain", "Mountain"], hand: ["Bloodtithe Collector", "Burst Lightning"] },
        p2: { hand: ["Opt", "Forest"] },
      });
    let s = settle(cast(setup(), "p1", "Bloodtithe Collector"));
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bloodtithe Collector")).keywords).toContain("flying");
    s = setup();
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p1", "Bloodtithe Collector"));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(1);
  });

  it("Burnished Hart: {3}, sacrifice: up to two basic land cards, onto the battlefield tapped", () => {
    let s = scenario({
      p1: {
        battlefield: ["Burnished Hart", ...lands("Plains", 3)],
        library: ["Forest", "Shivan Dragon", "Azorius Guildgate", "Island", "Plains"],
      },
    });
    s = act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Burnished Hart"), ability: 0 });
    expect(idsOf(s, "p1", "graveyard", "Burnished Hart")).toHaveLength(1);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "search");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.max).toBe(2);
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Island", "Plains"]);
    s = settle(choose(s, [...lib(s, "p1", "Forest"), ...lib(s, "p1", "Island")]));
    for (const name of ["Forest", "Island"]) {
      const id = idOf(s, "p1", "battlefield", name);
      expect(s.objects[id]?.tapped).toBe(true);
    }
    expect(s.players.p1?.library).toHaveLength(3);
  });

  it("Chart a Course: draw two cards, then discard one unless you attacked this turn", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Chart a Course"] } });
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    // After an attack: no discard.
    s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Chart a Course"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });

  it("Circuitous Route: up to two basic land and/or Gate cards, onto the battlefield tapped", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Circuitous Route"],
        library: ["Azorius Guildgate", "Shivan Dragon", "Plains", "Thornwood Falls"],
      },
    });
    s = cast(s, "p1", "Circuitous Route");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "search");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.max).toBe(2);
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Azorius Guildgate", "Plains"]);
    s = settle(choose(s, [...lib(s, "p1", "Azorius Guildgate"), ...lib(s, "p1", "Plains")]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Azorius Guildgate")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("Claws Out: affinity for Cats; your creatures get +2/+2 until end of turn", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Claws Out"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Claws Out"))).toBe(false);
    s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Savannah Lions", "Savannah Lions"], hand: ["Claws Out"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    // Two Cats: {1}{W}{W}.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Claws Out"))).toBe(true);
    s = settle(cast(s, "p1", "Claws Out"));
    for (const id of idsOf(s, "p1", "battlefield", "Savannah Lions"))
      expect(chars(s, id)).toMatchObject({ power: 4, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).power).toBe(2);
  });

  it("Clinquant Skymage: flying; a +1/+1 counter whenever you draw a card (not the opponent)", () => {
    let s = scenario({
      p1: { battlefield: ["Clinquant Skymage", ...lands("Island", 3)], hand: ["Chart a Course"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    const mage = idOf(s, "p1", "battlefield", "Clinquant Skymage");
    expect(chars(s, mage).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(counterCount(s.objects[mage] as never, "+1/+1")).toBe(2);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Opt"));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(counterCount(s.objects[mage] as never, "+1/+1")).toBe(2);
  });

  it("Cloudblazer: flying; on entering, you gain 2 life and draw two cards", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Island"], hand: ["Cloudblazer"] } });
    s = settle(cast(s, "p1", "Cloudblazer"));
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Cloudblazer")).keywords).toContain("flying");
  });

  it("Dauntless Veteran: when it attacks, creatures you control get +1/+1 until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Dauntless Veteran", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const vet = idOf(s, "p1", "battlefield", "Dauntless Veteran");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Another creature attacks alone: nothing.
    let t = attack(s, [bear]);
    t = settle(t);
    expect(chars(t, bear).power).toBe(2);
    s = attack(s, [vet]);
    s = settle(s);
    expect(chars(s, vet)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toMatchObject({ power: 2, toughness: 1 });
  });

  it("Dawnwing Marshal: flying; {4}{W}: creatures you control get +1/+1 until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Dawnwing Marshal", "Bear Cub", ...lands("Plains", 5)] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const marshal = idOf(s, "p1", "battlefield", "Dawnwing Marshal");
    expect(chars(s, marshal).keywords).toContain("flying");
    s = settle(act(s, "p1", { type: "activate", source: marshal, ability: 0 }));
    expect(chars(s, marshal)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toMatchObject({ power: 2, toughness: 1 });
  });

  it("Deadly Brew: each player sacrifices a creature or planeswalker; if you did, another permanent card returns to hand", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Bear Cub", "Savannah Lions"],
        hand: ["Deadly Brew"],
        graveyard: ["Ordinary Bear", "Forest", "Opt"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = cast(s, "p1", "Deadly Brew");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "sacrifice");
    // The player chooses their sacrificed creature.
    s = choose(s, [bear]);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "may");
    s = choose(s, [1]);
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // "Another" permanent card: neither the sacrificed creature nor Opt.
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Ordinary Bear"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Ordinary Bear")]));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Ordinary Bear"]);
    // Without a creature to sacrifice: nothing returns.
    let t = scenario({
      p1: { battlefield: ["Swamp", "Forest"], hand: ["Deadly Brew"], graveyard: ["Ordinary Bear"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    t = settle(cast(t, "p1", "Deadly Brew"), (r) => (r.intent === "may" ? [1] : undefined));
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Deadly Plot: destroys a creature or planeswalker, or returns a Zombie creature card from your graveyard tapped", () => {
    const s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Deadly Plot"], graveyard: ["Crypt Feaster", "Bear Cub"] },
      p2: { battlefield: ["Shivan Dragon"], graveyard: ["Hungry Ghoul"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const feaster = idOf(s, "p1", "graveyard", "Crypt Feaster");
    // Mode 2: only the Zombie in your graveyard.
    expect(opt?.type === "cast" && opt.modes[1]?.targets[0]?.legal).toEqual([feaster]);
    let t = settle(cast(s, "p1", "Deadly Plot", { mode: 1, targets: { t: [feaster] } }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Crypt Feaster")]?.tapped).toBe(true);
    t = settle(cast(s, "p1", "Deadly Plot", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Devout Decree: exiles a black or red creature or planeswalker, then scry 1", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Devout Decree"] },
      p2: { battlefield: ["Shivan Dragon", "Bear Cub", "Crypt Feaster"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal.map((id) => nameOf(s, id)).sort()).toEqual([
      "Crypt Feaster",
      "Shivan Dragon",
    ]);
    s = cast(s, "p1", "Devout Decree", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("scryBottom");
    s = settle(s);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
  });

  it("Diamond Mare: the color chosen on entering; +1 life for each spell of that color you cast", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Forest"], hand: ["Diamond Mare", "Opt", "Giant Growth"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = cast(s, "p1", "Diamond Mare");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "chooseOnEnter");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
    s = choose(s, ["U"]);
    s = settle(cast(s, "p1", "Opt"));
    expect(s.players.p1?.life).toBe(21);
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Dragon Mage: when it deals combat damage to a player, each player discards their hand then draws seven cards", () => {
    let s = scenario({
      p1: { battlefield: ["Dragon Mage"], hand: ["Opt", "Opt"] },
      p2: { hand: ["Bear Cub", "Forest", "Opt"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Dragon Mage")]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p2?.hand).toHaveLength(7);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect(s.players.p2?.graveyard).toHaveLength(3);
  });

  it("Eager Trufflesnout: trample; a Food when it deals combat damage to a player", () => {
    const s = scenario({ p1: { battlefield: ["Eager Trufflesnout"] }, p2: { battlefield: ["Ordinary Bear"] } });
    const boar = idOf(s, "p1", "battlefield", "Eager Trufflesnout");
    expect(chars(s, boar).keywords).toContain("trample");
    let t = settleNoBlocks(attack(s, [boar]));
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(16);
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    // Blocked by a 4/5: no damage to the player, no Food.
    t = attack(s, [boar]);
    t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
    t = act(t, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(t, "p2", "battlefield", "Ordinary Bear"), attacker: boar }],
    });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(20);
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
  });

  it("Eaten by Piranhas: flash; the enchanted creature loses its abilities and becomes a black 1/1 Skeleton", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Eaten by Piranhas"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p2", { type: "pass" });
    s = settle(cast(s, "p1", "Eaten by Piranhas", { targets: { enchant: [dragon] } }));
    expect(chars(s, dragon)).toMatchObject({
      power: 1,
      toughness: 1,
      colors: ["B"],
      subtypes: ["Skeleton"],
      types: ["Creature"],
    });
    expect(chars(s, dragon).keywords).not.toContain("flying");
    expect(chars(s, dragon).abilities).toHaveLength(0);
  });

  it("Elspeth's Smite: 3 damage to an attacking or blocking creature, exiled if it would die this turn", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains"], hand: ["Elspeth's Smite"] },
      p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
    s = act(s, "p2", { type: "pass" });
    // Only the attacking creature is a target.
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([bear]);
    s = settle(cast(s, "p1", "Elspeth's Smite", { targets: { t: [bear] } }));
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Elvish Regrower: on entering, returns a targeted permanent card from your graveyard to hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Elvish Regrower"], graveyard: ["Opt", "Azorius Guildgate", "Bear Cub"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    s = cast(s, "p1", "Elvish Regrower");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Azorius Guildgate", "Bear Cub"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Azorius Guildgate")]));
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Azorius Guildgate"]);
  });

  it("Empyrean Eagle: the other flying creatures you control get +1/+1", () => {
    const s = scenario({
      p1: { battlefield: ["Empyrean Eagle", "Leonin Skyhunter", "Bear Cub"] },
      p2: { battlefield: ["Leonin Skyhunter"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Empyrean Eagle"))).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Leonin Skyhunter"))).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Leonin Skyhunter"))).toMatchObject({ power: 2, toughness: 2 });
  });

  it("Exclusion Mage: on entering, returns a targeted creature an opponent controls to its owner's hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Exclusion Mage"] },
      p2: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = cast(s, "p1", "Exclusion Mage");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Savannah Lions", "Shivan Dragon"]);
    s = settle(choose(s, [idOf(s, "p2", "battlefield", "Shivan Dragon")]));
    expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
  });

  it("Faebloom Trick: two 1/1 blue flying Faeries, then taps a targeted creature an opponent controls", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Faebloom Trick"] },
      p2: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = cast(s, "p1", "Faebloom Trick");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const faeries = idsOf(s, "p1", "battlefield", "Faerie");
    expect(faeries).toHaveLength(2);
    expect(chars(s, faeries[0] as string)).toMatchObject({ power: 1, toughness: 1, colors: ["U"] });
    expect(chars(s, faeries[0] as string).keywords).toContain("flying");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Savannah Lions", "Shivan Dragon"]);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = settle(choose(s, [dragon]));
    expect(s.objects[dragon]?.tapped).toBe(true);
  });

  it("Felling Blow: a +1/+1 counter on your creature, then it deals damage equal to its power to an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Felling Blow"] },
      p2: { battlefield: ["Red Tiger Mechan"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const tiger = idOf(s, "p2", "battlefield", "Red Tiger Mechan");
    expect(() => cast(s, "p1", "Felling Blow", { targets: { a: [tiger], b: [bear] } })).toThrow();
    s = settle(cast(s, "p1", "Felling Blow", { targets: { a: [bear], b: [tiger] } }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    // 3 damage (the power after the counter): the 3/3 dies; it isn't combat, the Bear isn't damaged.
    expect(idsOf(s, "p2", "graveyard", "Red Tiger Mechan")).toHaveLength(1);
    expect(s.objects[bear]?.damage).toBe(0);
  });

  it("Billowing Shriekmass: flying, mills 3 on entering, +2/+1 with seven or more cards in the graveyard", () => {
    const setup = (graveyard: string[]) =>
      scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Billowing Shriekmass"], graveyard } });
    let s = settle(cast(setup([]), "p1", "Billowing Shriekmass"));
    let id = idOf(s, "p1", "battlefield", "Billowing Shriekmass");
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(s.players.p1?.library).toHaveLength(7);
    expect(chars(s, id)).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, id).keywords).toContain("flying");
    // Four cards already in the graveyard: the mill makes seven, the threshold is reached.
    s = settle(cast(setup(lands("Plains", 4)), "p1", "Billowing Shriekmass"));
    id = idOf(s, "p1", "battlefield", "Billowing Shriekmass");
    expect(s.players.p1?.graveyard).toHaveLength(7);
    expect(chars(s, id)).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Cephalid Inkmage: surveil 3 on entering, unblockable with seven or more cards in the graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Cephalid Inkmage"], graveyard: lands("Plains", 5) },
    });
    s = cast(s, "p1", "Cephalid Inkmage");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "surveilGraveyard");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // Look at the top three cards.
    expect(req?.type === "pick" && req.options).toHaveLength(3);
    const opts = req?.type === "pick" ? req.options : [];
    // Only one in the graveyard: six cards, no threshold.
    s = settle(choose(s, opts.slice(0, 1)));
    const id = idOf(s, "p1", "battlefield", "Cephalid Inkmage");
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(chars(s, id).keywords).not.toContain("unblockable");
    // Two cards in the graveyard: seven cards, the creature becomes unblockable.
    let t = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Cephalid Inkmage"], graveyard: lands("Plains", 5) },
    });
    t = cast(t, "p1", "Cephalid Inkmage");
    t = settle(t, (r) => (r.intent === "surveilGraveyard" && r.type === "pick" ? r.options.slice(0, 2) : undefined));
    expect(t.players.p1?.graveyard).toHaveLength(7);
    expect(chars(t, idOf(t, "p1", "battlefield", "Cephalid Inkmage")).keywords).toContain("unblockable");
  });

  it("Dreadwing Scavenger: draws then discards on entering and on attacking; threshold: +1/+1 and deathtouch", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island", "Swamp"], hand: ["Dreadwing Scavenger", "Opt"], graveyard: lands("Plains", 5) },
    });
    s = cast(s, "p1", "Dreadwing Scavenger");
    s = settle(s, pickIntent("discard", [idOf(s, "p1", "hand", "Opt")]));
    const id = idOf(s, "p1", "battlefield", "Dreadwing Scavenger");
    // Draws a Forest, discards Opt: six cards in the graveyard.
    expect(s.players.p1?.hand.map((x) => nameOf(s, x))).toEqual(["Forest"]);
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(chars(s, id)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["flying"]));
    expect(chars(s, id).keywords).not.toContain("deathtouch");
    // It attacks (summoning sickness is lifted by hand): new draw, new discard, the threshold is reached.
    (s.objects[id] as { controlledSince: number }).controlledSince = 0;
    s = attack(s, [id]);
    s = settle(s, (r) => (r.intent === "discard" && r.type === "pick" ? r.options.slice(0, 1) : undefined));
    expect(s.players.p1?.graveyard).toHaveLength(7);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(chars(s, id)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, id).keywords).toContain("deathtouch");
  });

  it("Dwynen, Gilt-Leaf Daen: the other Elves you control get +1/+1; 1 life per attacking Elf", () => {
    let s = scenario({
      p1: { battlefield: ["Dwynen, Gilt-Leaf Daen", "Llanowar Elves", "Thornweald Archer", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const dwynen = idOf(s, "p1", "battlefield", "Dwynen, Gilt-Leaf Daen");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, dwynen)).toMatchObject({ power: 3, toughness: 4 });
    expect(chars(s, dwynen).keywords).toContain("reach");
    expect(chars(s, elf)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 1, toughness: 1 });
    // Dwynen and an Elf attack (the Archer stays): 2 life, Dwynen included.
    s = attack(s, [dwynen, elf, idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Cat Collector: a Food on entering; a Cat the first time you gain life during your turn", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), ...lands("Forest", 4)],
        hand: ["Cat Collector", "Sami's Curiosity", "Sami's Curiosity"],
      },
    });
    s = settle(cast(s, "p1", "Cat Collector"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(0);
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    const cats = idsOf(s, "p1", "battlefield", "Cat");
    expect(cats).toHaveLength(1);
    expect(chars(s, cats[0] as string)).toMatchObject({ power: 1, toughness: 1, colors: ["W"] });
    // Second life gain of the turn: no second Cat.
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    expect(s.players.p1?.life).toBe(24);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    // During the opponent's turn: the Food gains 3 life, without a Cat.
    let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cat Collector"] } });
    t = settle(cast(t, "p1", "Cat Collector"));
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Food"), ability: 0 });
    t = settle(t);
    expect(t.players.p1?.life).toBe(23);
    expect(idsOf(t, "p1", "battlefield", "Cat")).toHaveLength(0);
  });

  it("Fiendish Panda: a +1/+1 counter when you gain life; on dying, reanimates another non-Bear creature with mana value at most its power", () => {
    let s = scenario({
      p1: {
        battlefield: ["Fiendish Panda", "Forest"],
        hand: ["Sami's Curiosity"],
        graveyard: ["Crypt Feaster", "Shivan Dragon", "Bear Cub", "Savannah Lions"],
      },
    });
    const panda = idOf(s, "p1", "battlefield", "Fiendish Panda");
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    expect(counterCount(s.objects[panda] as never, "+1/+1")).toBe(1);
    expect(chars(s, panda).power).toBe(4);
    // Power 4 at death: Crypt Feaster (MV 4) and Savannah Lions are targets, not the Dragon (MV 6) nor Bear Cub (Bear).
    destroy(s, panda);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Crypt Feaster", "Savannah Lions"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Crypt Feaster")]));
    expect(idsOf(s, "p1", "battlefield", "Crypt Feaster")).toHaveLength(1);
  });

  it("Fiendish Panda: life gained by the opponent doesn't add a counter", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Fiendish Panda"] },
      p2: { battlefield: ["Forest"], hand: ["Sami's Curiosity"] },
    });
    s = settle(cast(s, "p2", "Sami's Curiosity"));
    expect(s.players.p2?.life).toBe(22);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Fiendish Panda")] as never, "+1/+1")).toBe(0);
  });
});

describe("Foundations, lot K8: peu communes (2)", () => {
  /** Answer that picks `id` as the target of a triggered ability and answers `yes` to yes/no questions. */
  const answer =
    (want: string[], yes = true) =>
    (req: Parameters<Parameters<typeof settle>[1] & object>[0]) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        return picked.length > 0 ? picked : undefined;
      }
      return undefined;
    };
  const declareAttack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const toBlockers = (s: S, ans: ReturnType<typeof answer> = answer([])) => {
    let cur = s;
    for (let i = 0; i < 100 && cur.pending?.kind !== "declareBlockers" && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: ans(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const block = (s: S, blocks: [string, string][]) =>
    act(s, "p2", { type: "declareBlockers", blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) });
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  /** Activates the (first) activated ability of `source`. */
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error("ability unavailable");
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };

  it("Fireshrieker: equip {2} on a creature you control gives it double strike", () => {
    let s = scenario({
      p1: { battlefield: ["Fireshrieker", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const gear = idOf(s, "p1", "battlefield", "Fireshrieker");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // An opposing creature is not a legal target.
    expect(() => activate(s, "p1", gear, { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] })).toThrow(/Illegal target/);
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    s = settle(activate(s, "p1", gear, { t: [bear] }));
    expect(s.objects[gear]?.attachedTo).toBe(bear);
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    // It deals its damage twice.
    s = toBlockers(declareAttack(s, [bear]));
    s = advanceUntil(block(s, []), (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
  });

  it("Frenzied Goblin: on attack, if it pays {R}, the targeted creature can't block this turn", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Frenzied Goblin", "Mountain"] }, p2: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    let s = setup();
    const goblin = idOf(s, "p1", "battlefield", "Frenzied Goblin");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = toBlockers(declareAttack(s, [goblin]), answer([bear]));
    expect(chars(s, bear).keywords).toContain("cantBlock");
    expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    expect(() => block(s, [[bear, goblin]])).toThrow();
    // The other creature can still block.
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Llanowar Elves"), goblin]])).not.toThrow();
    // Without paying: nothing.
    s = toBlockers(declareAttack(setup(), [goblin]), answer([bear], false));
    expect(chars(s, bear).keywords).not.toContain("cantBlock");
    expect(() => block(s, [[bear, goblin]])).not.toThrow();
  });

  it("Garna, Bloodfist of Keld: another of your creatures dies: draw if it was attacking, otherwise 1 damage to each opponent", () => {
    // Outside combat: 1 damage to the opponent, no draw.
    let s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", "Llanowar Elves", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
    });
    const hand = handSize(s);
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
    expect(s.players.p2?.life).toBe(19);
    expect(handSize(s)).toBe(hand - 1);
    // On attack: draw, no damage.
    s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", "Bear Cub"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = toBlockers(declareAttack(s, [bear]));
    s = advanceUntil(block(s, [[idOf(s, "p2", "battlefield", "Pelakka Wurm"), bear]]), (x) => x.turn.step === "main2");
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(handSize(s)).toBe(1);
    expect(s.players.p2?.life).toBe(20);
    // An opposing creature that dies doesn't count.
    s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p2?.life).toBe(20);
    expect(handSize(s)).toBe(0);
  });

  it("Garruk's Uprising: draws on entering if you have a creature with power 4+, trample, draws for each creature with power 4+ that enters", () => {
    // Without a creature with power 4 or more: no draw.
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Garruk's Uprising"] } });
    s = settle(cast(s, "p1", "Garruk's Uprising"));
    expect(handSize(s)).toBe(0);
    s = scenario({
      p1: { battlefield: ["Gnarlback Rhino", ...lands("Forest", 9)], hand: ["Garruk's Uprising", "Bear Cub", "Gnarlback Rhino"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Garruk's Uprising"));
    expect(handSize(s)).toBe(3);
    // A creature with power 2 enters: no draw; it has trample.
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(handSize(s)).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("trample");
    // A creature with power 4 enters: draw a card.
    s = settle(cast(s, "p1", "Gnarlback Rhino"));
    expect(handSize(s)).toBe(2);
  });

  it("Gate Colossus: affinity for Gates, unblockable by creatures with power 2 or less, returns from the graveyard when a Gate enters", () => {
    // Three Gates: it costs {5}.
    let s = scenario({ p1: { battlefield: [...lands("Azorius Guildgate", 3), ...lands("Plains", 2)], hand: ["Gate Colossus"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gate Colossus"))).toBe(true);
    s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Gate Colossus"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gate Colossus"))).toBe(false);
    // Blocage.
    s = scenario({ p1: { battlefield: ["Gate Colossus"] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
    const colossus = idOf(s, "p1", "battlefield", "Gate Colossus");
    s = toBlockers(declareAttack(s, [colossus]));
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Bear Cub"), colossus]])).toThrow();
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Serra Angel"), colossus]])).not.toThrow();
    // A Gate enters: it may return from the graveyard to the top of the library.
    for (const yes of [true, false]) {
      s = scenario({ p1: { hand: ["Azorius Guildgate"], graveyard: ["Gate Colossus"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Azorius Guildgate") });
      s = settle(s, answer([], yes));
      expect(nameOf(s, s.players.p1?.library[0] as string) === "Gate Colossus").toBe(yes);
      expect(idsOf(s, "p1", "graveyard", "Gate Colossus")).toHaveLength(yes ? 0 : 1);
    }
    // A land that isn't a Gate: nothing.
    s = scenario({ p1: { hand: ["Plains"], graveyard: ["Gate Colossus"] } });
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }), answer([], true));
    expect(idsOf(s, "p1", "graveyard", "Gate Colossus")).toHaveLength(1);
  });

  it("Gatekeeper of Malakir: kicked, the targeted player sacrifices a creature of their choice; otherwise nothing", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Gatekeeper of Malakir"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
    let s = settle(cast(setup(), "p1", "Gatekeeper of Malakir"));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    s = cast(setup(), "p1", "Gatekeeper of Malakir", { kicked: true });
    // The targeted player chooses the sacrificed creature.
    let chooser: string | undefined;
    s = settle(s, (req, player, cur) => {
      if (req.type === "pick" && req.options.includes("p2")) return ["p2"];
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Serra Angel")) {
        chooser = player;
        return req.options.filter((id) => nameOf(cur, id) === "Serra Angel");
      }
      return undefined;
    });
    expect(chooser).toBe("p2");
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Gatekeeper of Malakir")).toHaveLength(1);
  });

  it("Gateway Sneak: unblockable this turn when a Gate enters under your control; draws when damaging a player", () => {
    let s = scenario({ p1: { battlefield: ["Gateway Sneak"], hand: ["Dimir Guildgate"] }, p2: { battlefield: ["Bear Cub"] } });
    const sneak = idOf(s, "p1", "battlefield", "Gateway Sneak");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    // Without a Gate, it can be blocked.
    let t = toBlockers(declareAttack(s, [sneak]));
    expect(() => block(t, [[bear, sneak]])).not.toThrow();
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dimir Guildgate") }));
    expect(chars(s, sneak).keywords).toContain("unblockable");
    t = toBlockers(declareAttack(s, [sneak]));
    // No block possible (the step may be skipped for lack of blockers).
    expect(canBlock(t, bear, sneak)).toBe(false);
    if (t.pending?.kind === "declareBlockers") expect(() => block(t, [[bear, sneak]])).toThrow();
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(19);
    expect(handSize(t)).toBe(1);
    // Until end of turn only.
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, sneak).keywords).not.toContain("unblockable");
  });

  it("Gnarlback Rhino: trample; draw when you cast a spell that targets it (not an opposing spell)", () => {
    let s = scenario({
      p1: { battlefield: ["Gnarlback Rhino", "Bear Cub", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] },
      p2: { battlefield: ["Forest"], hand: ["Giant Growth"] },
    });
    const rhino = idOf(s, "p1", "battlefield", "Gnarlback Rhino");
    expect(chars(s, rhino).keywords).toContain("trample");
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [rhino] } }));
    expect(handSize(s)).toBe(2);
    // A spell that targets another creature: nothing.
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
    expect(handSize(s)).toBe(1);
    // An opposing spell that targets it: nothing.
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [rhino] } }));
    expect(handSize(s)).toBe(1);
  });

  it("Good-Fortune Unicorn: a +1/+1 counter on each other creature that enters under your control", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Plains", "Forest"], hand: ["Good-Fortune Unicorn", "Llanowar Elves"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Good-Fortune Unicorn"));
    const unicorn = idOf(s, "p1", "battlefield", "Good-Fortune Unicorn");
    expect(counterCount(s.objects[unicorn] as never, "+1/+1")).toBe(0);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")] as never, "+1/+1")).toBe(1);
    // An opposing creature: nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(counterCount(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")] as never, "+1/+1")).toBe(0);
  });

  it("Grappling Kraken: when a land enters under your control, taps an opposing creature and puts a stun counter on it", () => {
    let s = scenario({ p1: { battlefield: ["Grappling Kraken"], hand: ["Island"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), answer([bear]));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(counterCount(s.objects[bear] as never, "stun")).toBe(1);
    // At the next untap, the counter is removed instead of untapping it.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(counterCount(s.objects[bear] as never, "stun")).toBe(0);
  });

  it("Guarded Heir: lifelink; on entering, two white 3/3 Knight tokens", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Guarded Heir"] } });
    s = settle(cast(s, "p1", "Guarded Heir"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Guarded Heir")).keywords).toContain("lifelink");
    const knights = idsOf(s, "p1", "battlefield", "Knight");
    expect(knights).toHaveLength(2);
    for (const k of knights) {
      const c = chars(s, k);
      expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([3, 3, ["W"], ["Knight"]]);
    }
  });

  it("Heartfire Immolator: prowess; {R}, sacrifice: damage equal to its power to a creature or planeswalker", () => {
    let s = scenario({
      p1: { battlefield: ["Heartfire Immolator", "Island", "Mountain"], hand: ["Opt"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const imm = idOf(s, "p1", "battlefield", "Heartfire Immolator");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, imm).power).toBe(3);
    // A player is not a legal target.
    expect(() => activate(s, "p1", imm, { t: ["p2"] })).toThrow(/Illegal target/);
    s = activate(s, "p1", imm, { t: [wurm] });
    expect(idsOf(s, "p1", "graveyard", "Heartfire Immolator")).toHaveLength(1);
    s = settle(s);
    // Its last known power (3, prowess included).
    expect(s.objects[wurm]?.damage).toBe(3);
    // A planeswalker is a legal target.
    s = scenario({ p1: { battlefield: ["Heartfire Immolator", "Mountain"] }, p2: { battlefield: ["Vivien Reid"] } });
    const vivien = idOf(s, "p2", "battlefield", "Vivien Reid");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Heartfire Immolator"), { t: [vivien] }));
    expect(s.objects[vivien]?.counters.loyalty).toBe(3);
  });

  it("Herald of Faith: flying; you gain 2 life when it attacks", () => {
    let s = scenario({ p1: { battlefield: ["Herald of Faith"] } });
    const herald = idOf(s, "p1", "battlefield", "Herald of Faith");
    expect(chars(s, herald).keywords).toContain("flying");
    s = settle(declareAttack(s, [herald]));
    expect(s.players.p1?.life).toBe(22);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
  });

  it("Hero's Downfall destroys a creature or planeswalker, not another permanent", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Hero's Downfall", "Hero's Downfall"] },
      p2: { battlefield: ["Vivien Reid", "Bear Cub", "Swiftfoot Boots", "Forest"] },
    });
    for (const n of ["Swiftfoot Boots", "Forest"])
      expect(() => cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", n)] } })).toThrow(
        /Illegal target/,
      );
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Vivien Reid")] } }));
    expect(idsOf(s, "p2", "graveyard", "Vivien Reid")).toHaveLength(1);
    s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Hero's Downfall"] }, p2: { battlefield: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Heroic Reinforcements: two white 1/1 Soldiers, then your creatures get +1/+1 and haste until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2), ...lands("Plains", 2)], hand: ["Heroic Reinforcements"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Heroic Reinforcements"));
    const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
    expect(soldiers).toHaveLength(2);
    for (const id of [...soldiers, idOf(s, "p1", "battlefield", "Bear Cub")]) {
      expect(chars(s, id).keywords).toContain("haste");
    }
    expect([chars(s, soldiers[0] as string).power, chars(s, soldiers[0] as string).toughness]).toEqual([2, 2]);
    expect(chars(s, soldiers[0] as string).colors).toEqual(["W"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).keywords]).toEqual([1, []]);
    // The tokens can attack this turn.
    s = advanceUntil(declareAttack(s, soldiers), (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).power).toBe(2);
  });

  it("Hidetsugu's Second Rite: 10 damage to the targeted player if they have exactly 10 life", () => {
    for (const life of [10, 11, 9]) {
      let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Hidetsugu's Second Rite"] }, p2: { life } });
      s = settle(cast(s, "p1", "Hidetsugu's Second Rite", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(life === 10 ? 0 : life);
    }
  });

  it("Infernal Vessel: on dying, if it wasn't a Demon, returns with two +1/+1 counters and becomes a Demon", () => {
    let s = scenario({
      p1: { battlefield: ["Infernal Vessel", ...lands("Swamp", 6)], hand: ["Hero's Downfall", "Hero's Downfall"] },
    });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Infernal Vessel")] } }));
    const vessel = idOf(s, "p1", "battlefield", "Infernal Vessel");
    const c = chars(s, vessel);
    expect([c.power, c.toughness]).toEqual([4, 3]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Cleric", "Demon"]));
    // Demon, it stays in the graveyard the next time.
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [vessel] } }));
    expect(idsOf(s, "p1", "battlefield", "Infernal Vessel")).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "Infernal Vessel")).toHaveLength(1);
  });

  it("Ingenious Leonin: {3}{W}: +1/+1 counter on another of your attacking creatures; first strike if it's a Cat", () => {
    let s = scenario({
      p1: { battlefield: ["Ingenious Leonin", "Savannah Lions", "Bear Cub", "Llanowar Elves", ...lands("Plains", 8)] },
    });
    const leonin = idOf(s, "p1", "battlefield", "Ingenious Leonin");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = declareAttack(s, [leonin, lions, bear]);
    // Neither itself nor a creature that isn't attacking.
    expect(() => activate(s, "p1", leonin, { t: [leonin] })).toThrow(/Illegal target/);
    expect(() => activate(s, "p1", leonin, { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] })).toThrow(/Illegal target/);
    s = settle(activate(s, "p1", leonin, { t: [lions] }));
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(1);
    expect(chars(s, lions).keywords).toContain("firstStrike");
    s = settle(activate(s, "p1", leonin, { t: [bear] }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("firstStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, lions).keywords).not.toContain("firstStrike");
  });

  it("Inspiration from Beyond: mills three cards then returns an instant or sorcery from the graveyard to hand; flashback {5}{U}{U}", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 10),
        hand: ["Inspiration from Beyond"],
        library: ["Opt", "Giant Growth", "Shivan Dragon", "Forest"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Inspiration from Beyond"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Giant Growth");
    });
    // Only instants are offered (not the creature, nor the spell being resolved).
    expect(options).toEqual(["Giant Growth", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Giant Growth"]);
    expect(s.players.p1?.library).toHaveLength(1);
    // Flashback from the graveyard, then exile.
    const card0 = idOf(s, "p1", "graveyard", "Inspiration from Beyond");
    expect(castable(s, "p1", card0)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: card0 }));
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Inspiration from Beyond");
  });

  it("Inspiring Call: draw a card per creature of yours with a +1/+1 counter; they gain indestructible", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          { name: "Llanowar Elves", counters: { "+1/+1": 2 } },
          "Pelakka Wurm",
          ...lands("Forest", 3),
        ],
        hand: ["Inspiring Call"],
      },
      p2: { battlefield: [{ name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
    });
    s = settle(cast(s, "p1", "Inspiring Call"));
    expect(handSize(s)).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("indestructible");
  });

  it("Joust Through: 3 damage to an attacking or blocking creature, and you gain 1 life", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains"], hand: ["Joust Through"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
    s = passAccepting(s, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    // A creature outside combat is not a target.
    expect(() => cast(s, "p1", "Joust Through", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow(
      /Illegal target/,
    );
    s = settle(cast(s, "p1", "Joust Through", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.damage).toBe(3);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Knight of Malice: first strike, hexproof from white, +1/+0 as long as a player controls a white permanent", () => {
    let s = scenario({
      p1: { battlefield: ["Knight of Malice", "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Plains"], hand: ["Fleeting Flight", "Savannah Lions"] },
    });
    const knight = idOf(s, "p1", "battlefield", "Knight of Malice");
    expect(chars(s, knight).keywords).toContain("firstStrike");
    expect(chars(s, knight).power).toBe(2);
    // An opposing white spell can't target it; yours can.
    s = act(s, "p1", { type: "pass" });
    expect(() => cast(s, "p2", "Fleeting Flight", { targets: { t: [knight] } })).toThrow(/Illegal target/);
    s = scenario({
      p1: { battlefield: ["Knight of Malice", "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const k2 = idOf(s, "p1", "battlefield", "Knight of Malice");
    // Un permanent blanc adverse suffit.
    expect([chars(s, k2).power, chars(s, k2).toughness]).toEqual([3, 2]);
    s = settle(cast(s, "p1", "Fleeting Flight", { targets: { t: [k2] } }));
    expect(counterCount(s.objects[k2] as never, "+1/+1")).toBe(1);
  });

  it("Leonin Skyhunter: 2/2 Cat Knight with flying", () => {
    const s = scenario({ p1: { battlefield: ["Leonin Skyhunter"] } });
    const c = chars(s, idOf(s, "p1", "battlefield", "Leonin Skyhunter"));
    expect([c.power, c.toughness, c.subtypes, c.keywords]).toEqual([2, 2, ["Cat", "Knight"], ["flying"]]);
  });

  it("Leonin Vanguard: at the beginning of combat on your turn, with three or more creatures, +1/+1 and you gain 1 life", () => {
    for (const n of [2, 3]) {
      let s = scenario({
        p1: { battlefield: ["Leonin Vanguard", ...Array(n - 1).fill("Bear Cub")] },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      const c = chars(s, idOf(s, "p1", "battlefield", "Leonin Vanguard"));
      expect([c.power, c.toughness, s.players.p1?.life]).toEqual(n === 3 ? [2, 2, 21] : [1, 1, 20]);
    }
    // Not at the opponent's combat.
    let s = scenario({ active: "p2", p1: { battlefield: ["Leonin Vanguard", "Bear Cub", "Bear Cub"] } });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Maalfeld Twins: on dying, two black 2/2 Zombie tokens", () => {
    let s = scenario({ p1: { battlefield: ["Maalfeld Twins", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] } });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Maalfeld Twins")] } }));
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(2);
    const c = chars(s, zombies[0] as string);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([2, 2, ["B"], ["Zombie"]]);
  });

  it("Make a Stand: your creatures get +1/+0 and indestructible until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions", ...lands("Plains", 3)], hand: ["Make a Stand"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Make a Stand"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).toContain("indestructible");
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).keywords]).toEqual([1, []]);
    destroy(s, bear);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect([chars(s, bear).power, chars(s, bear).keywords]).toEqual([2, []]);
  });

  it("Meteor Golem: on entering, destroys a nonland permanent an opponent controls", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Meteor Golem"] },
      p2: { battlefield: ["Forest", "Swiftfoot Boots", "Llanowar Elves"] },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Meteor Golem"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Swiftfoot Boots");
    });
    expect(options).toEqual(["Llanowar Elves", "Swiftfoot Boots"]);
    expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
  });

  it("Micromancer: on entering, you may search for an instant or sorcery with mana value 1", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 4),
        hand: ["Micromancer"],
        library: ["Shivan Dragon", "Quick Study", "Opt", "Duress", "Swiftfoot Boots", "Llanowar Elves"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Micromancer"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Duress");
    });
    expect(options).toEqual(["Duress", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Duress"]);
    // Declined: nothing.
    s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Micromancer"], library: ["Opt", "Forest"] } });
    s = settle(cast(s, "p1", "Micromancer"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Midnight Snack: raid, a Food at your end step if you attacked; {2}{B}, sacrifice: the opponent loses the life gained this turn", () => {
    for (const attacked of [true, false]) {
      let s = scenario({ p1: { battlefield: ["Midnight Snack", "Bear Cub"] } });
      if (attacked) s = declareAttack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(attacked ? 1 : 0);
    }
    let s = scenario({
      p1: { battlefield: ["Midnight Snack", ...lands("Forest", 7), ...lands("Swamp", 3)], hand: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Pelakka Wurm"));
    expect(s.players.p1?.life).toBe(27);
    const snack = idOf(s, "p1", "battlefield", "Midnight Snack");
    // One opponent only.
    expect(() => activate(s, "p1", snack, { t: ["p1"] })).toThrow(/Illegal target/);
    s = settle(activate(s, "p1", snack, { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(13);
    expect(idsOf(s, "p1", "graveyard", "Midnight Snack")).toHaveLength(1);
  });

  it("Mindsparker: first strike; 2 damage to the opponent who casts a white or blue instant or sorcery", () => {
    let s = scenario({
      active: "p2",
      // Opt will be drawn next turn (out of Duress's reach).
      p1: { battlefield: ["Mindsparker", "Island"], library: ["Opt", ...lands("Forest", 5)] },
      p2: { battlefield: ["Island", "Plains", "Forest", "Swamp"], hand: ["Opt", "Fleeting Flight", "Giant Growth", "Duress"] },
    });
    const sparker = idOf(s, "p1", "battlefield", "Mindsparker");
    expect(chars(s, sparker).keywords).toContain("firstStrike");
    s = settle(cast(s, "p2", "Opt"));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p2", "Fleeting Flight", { targets: { t: [sparker] } }));
    expect(s.players.p2?.life).toBe(16);
    // Green or black: nothing.
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [sparker] } }));
    s = settle(cast(s, "p2", "Duress", { targets: { t: ["p1"] } }));
    expect(s.players.p2?.life).toBe(16);
    // Your own spells: nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    s = settle(cast(s, "p1", "Opt"));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 16]);
  });

  it("Mischievous Mystic: flying; a 1/1 flying Faerie token when you draw your second card of the turn", () => {
    let s = scenario({ p1: { battlefield: ["Mischievous Mystic", ...lands("Island", 4)], hand: ["Opt", "Quick Study"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Mischievous Mystic")).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Faerie")).toHaveLength(0);
    // Second and third cards: a single token.
    s = settle(cast(s, "p1", "Quick Study"));
    const faeries = idsOf(s, "p1", "battlefield", "Faerie");
    expect(faeries).toHaveLength(1);
    const c = chars(s, faeries[0] as string);
    expect([c.power, c.toughness, c.colors, c.keywords]).toEqual([1, 1, ["U"], ["flying"]]);
  });

  it("Mischievous Pup: flash; on entering, returns up to one other permanent you control to hand", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 3)], hand: ["Mischievous Pup"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "pass" });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mischievous Pup"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      return req.options.filter((id) => nameOf(cur, id) === "Llanowar Elves");
    });
    // Neither itself nor an opposing permanent.
    expect(options).not.toContain("Mischievous Pup");
    expect(options).not.toContain("Bear Cub");
    expect(options).toContain("Llanowar Elves");
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Llanowar Elves"]);
    expect(idsOf(s, "p1", "battlefield", "Mischievous Pup")).toHaveLength(1);
  });

  it("Mold Adder: you may put a +1/+1 counter when an opponent casts a blue or black spell", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Mold Adder"] },
      p2: { battlefield: ["Island", "Swamp", "Forest", "Island"], hand: ["Opt", "Duress", "Giant Growth", "Opt"] },
    });
    const adder = idOf(s, "p1", "battlefield", "Mold Adder");
    const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);
    s = settle(cast(s, "p2", "Opt"), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(1);
    s = settle(cast(s, "p2", "Duress", { targets: { t: ["p1"] } }), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [adder] } }), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
    // Refus.
    s = settle(cast(s, "p2", "Opt"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
  });

  it("Mortify destroys a creature or an enchantment, not an artifact or a land", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Swamp"], hand: ["Mortify"] },
      p2: { battlefield: ["Banishing Light", "Bear Cub", "Swiftfoot Boots", "Forest"] },
    });
    for (const n of ["Swiftfoot Boots", "Forest"])
      expect(() => cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", n)] } })).toThrow(/Illegal target/);
    const t = settle(cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", "Banishing Light")] } }));
    expect(idsOf(s, "p2", "graveyard", "Banishing Light")).toHaveLength(1);
  });

  it("Mystical Teachings: searches for an instant or a card with flash; flashback {5}{B}", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), ...lands("Swamp", 6)],
        hand: ["Mystical Teachings"],
        library: ["Shivan Dragon", "Chart a Course", "Opt", "Mischievous Pup", "Forest"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mystical Teachings"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Mischievous Pup");
    });
    expect(options).toEqual(["Mischievous Pup", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Mischievous Pup"]);
    const card0 = idOf(s, "p1", "graveyard", "Mystical Teachings");
    expect(castable(s, "p1", card0)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: card0 }));
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Mystical Teachings");
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Needletooth Pack: morbid, at your end step, two +1/+1 counters on one of your creatures if a creature died this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Needletooth Pack", "Bear Cub", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
      p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Without a death: nothing.
    let t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(counterCount(t.objects[bear] as never, "+1/+1")).toBe(0);
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
    let options: string[] = [];
    t = s;
    for (let i = 0; i < 200 && t.turn.active === "p1"; i++) {
      const p = t.pending;
      if (p?.kind === "priority") t = act(t, p.player, { type: "pass" });
      else if (p?.kind === "declareAttackers") t = act(t, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "choice" && p.request.type === "pick") {
        options = p.request.options.map((id) => nameOf(t, id) ?? "").sort();
        t = act(t, p.player, { type: "choose", values: [bear] });
      } else break;
    }
    // A creature you control only.
    expect(options).toEqual(["Bear Cub", "Needletooth Pack"]);
    expect(counterCount(t.objects[bear] as never, "+1/+1")).toBe(2);
  });

  it("Nessian Hornbeetle: at the beginning of combat on your turn, a +1/+1 counter if you control another creature with power 4 or more", () => {
    for (const [other, n] of [
      ["Pelakka Wurm", 1],
      ["Bear Cub", 0],
    ] as const) {
      let s = scenario({ p1: { battlefield: ["Nessian Hornbeetle", other] }, p2: { battlefield: ["Serra Angel"] } });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Nessian Hornbeetle")] as never, "+1/+1")).toBe(n);
    }
  });
});

describe("Foundations, lot K8: peu communes (3)", () => {
  const kw = (s: S, id: string, k: string) => (chars(s, id).keywords as string[]).includes(k);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handSize = (s: S, p: string) => s.players[p]?.hand.length ?? 0;
  const life = (s: S, p: string) => s.players[p]?.life;
  /** Options of a pending "pick" choice (trigger targets, etc.). */
  const pickOptions = (s: S) =>
    s.pending?.kind === "choice" && s.pending.request.type === "pick" ? s.pending.request.options : [];
  /** Answer: "yes" to questions, otherwise the suggestion. */
  const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);
  /** p2 passes: p1 gets priority during p2's turn (instant speed). */
  const p1Priority = (s: S) => passUntil(s, (x) => x.pending?.player === "p1");
  /** Goes until the next choice of intent `intent` (or stops). */
  const untilIntent = (s: S, intent: string) =>
    advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === intent);
  /** Plays (suggested choices, without attacking) until the next turn; also returns the intents of the choices met. */
  const toNextTurn = (s: S) => {
    const seen: string[] = [];
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.active === s.turn.active; i++) {
      if (cur.pending?.kind === "choice") seen.push(cur.pending.request.intent);
      cur = advanceUntil(cur, () => false, 1);
    }
    return { s: cur, seen };
  };

  it("Perforating Artist: deathtouch; raid at your end step, the opponent loses 3 life, sacrifices a nonland permanent or discards", () => {
    const setup = (p2: { battlefield: string[]; hand: string[] }) =>
      scenario({ p1: { battlefield: ["Perforating Artist"] }, p2: { ...p2, library: lands("Forest", 10) } });
    let s = setup({ battlefield: ["Forest"], hand: ["Opt"] });
    const artist = idOf(s, "p1", "battlefield", "Perforating Artist");
    expect(kw(s, artist, "deathtouch")).toBe(true);
    s = attack(s, [artist]);
    s = untilIntent(s, "punisher");
    expect(s.pending?.player).toBe("p2");
    // No nonland permanent: only the life loss or the discard.
    expect(pickOptions(s)).toEqual(["life", "discard"]);
    s = choose(s, ["life"]);
    expect(life(s, "p2")).toBe(14);

    let t = setup({ battlefield: ["Forest", "Llanowar Elves"], hand: ["Opt"] });
    t = attack(t, [idOf(t, "p1", "battlefield", "Perforating Artist")]);
    t = untilIntent(t, "punisher");
    expect(pickOptions(t)).toEqual(["life", "discard", "sacrifice"]);
    t = choose(t, ["sacrifice"]);
    // The only nonland permanent is sacrificed, the land stays; no life loss besides combat.
    expect(idsOf(t, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Forest")).toHaveLength(1);
    expect(life(t, "p2")).toBe(17);

    // Without an attack: nothing at the end step.
    const u = toNextTurn(setup({ battlefield: ["Llanowar Elves"], hand: ["Opt"] }));
    expect(u.seen).not.toContain("punisher");
    expect(life(u.s, "p2")).toBe(20);
    expect(idsOf(u.s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });
  it("Prayer of Binding: flash; exiles up to one opposing nonland permanent as long as it remains, and you gain 2 life", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 4), "Llanowar Elves"], hand: ["Prayer of Binding"] },
      p2: { battlefield: ["Shivan Dragon", "Forest"] },
    });
    s = p1Priority(s);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Prayer of Binding");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Only the opponent's nonland permanent is a target.
    expect(pickOptions(s)).toEqual([dragon]);
    s = settle(s, picking([dragon]));
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    expect(life(s, "p1")).toBe(22);
    destroy(s, idOf(s, "p1", "battlefield", "Prayer of Binding"));
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);

    // "Up to one": with no target, you still gain 2 life.
    let t = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Prayer of Binding"] } });
    t = settle(cast(t, "p1", "Prayer of Binding"));
    expect(life(t, "p1")).toBe(22);
  });

  it("Ravenous Amulet: sacrificing a creature draws and puts a soul counter (sorcery speed); sacrificing itself makes you lose 1 life per counter", () => {
    let s = scenario({ p1: { battlefield: ["Ravenous Amulet", "Llanowar Elves", ...lands("Swamp", 6)] } });
    const amulet = idOf(s, "p1", "battlefield", "Ravenous Amulet");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: amulet, ability: 0, sacrifice: [elf] });
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    s = passBoth(s);
    expect(handSize(s, "p1")).toBe(1);
    expect(counterCount(s.objects[amulet] as never, "soul")).toBe(1);

    // Sorcery speed: not during the opponent's turn (the second ability remains possible).
    let t = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Ravenous Amulet", counters: { soul: 3 } }, "Llanowar Elves", ...lands("Swamp", 4)] },
    });
    t = p1Priority(t);
    const am2 = idOf(t, "p1", "battlefield", "Ravenous Amulet");
    const abilities = legalActions(t, "p1").filter((a) => a.type === "activate" && a.source === am2);
    expect(abilities.map((a) => a.type === "activate" && a.ability)).toEqual([1]);
    t = act(t, "p1", { type: "activate", source: am2, ability: 1 });
    expect(idsOf(t, "p1", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    t = passBoth(t);
    expect(life(t, "p2")).toBe(17);
    expect(life(t, "p1")).toBe(20);
  });

  it("Ravenous Giant: deals you 1 damage at your upkeep only", () => {
    let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Ravenous Giant"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(life(s, "p1")).toBe(19);
    // The opponent's upkeep: nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(life(s, "p1")).toBe(19);
    expect(life(s, "p2")).toBe(20);
  });

  it("Reclamation Sage: on entering, may destroy a targeted artifact or enchantment", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 3), "Ravenous Amulet"], hand: ["Reclamation Sage"] },
        p2: { battlefield: ["Ravenous Amulet", "Bear Cub", "Forest"] },
      });
    let s = setup();
    const amulet = idOf(s, "p2", "battlefield", "Ravenous Amulet");
    s = cast(s, "p1", "Reclamation Sage");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Neither creature nor land: only artifacts (of either side) are targets.
    expect([...pickOptions(s)].sort()).toEqual([amulet, idOf(s, "p1", "battlefield", "Ravenous Amulet")].sort());
    s = choose(s, [amulet]);
    s = settle(s, yes);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    // "You may": declining leaves it in place.
    const t = settle(cast(setup(), "p1", "Reclamation Sage"), (req) =>
      req.type === "yesNo" ? [0] : picking([amulet])(req as never),
    );
    expect(idsOf(t, "p2", "battlefield", "Ravenous Amulet")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Ravenous Amulet")).toHaveLength(1);
  });

  it("Release the Dogs: creates four white 1/1 Dog tokens", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Release the Dogs"] } });
    s = settle(cast(s, "p1", "Release the Dogs"));
    const dogs = idsOf(s, "p1", "battlefield", "Dog");
    expect(dogs).toHaveLength(4);
    for (const d of dogs) {
      expect(pt(s, d)).toEqual([1, 1]);
      expect(chars(s, d).colors).toEqual(["W"]);
      expect(chars(s, d).subtypes).toContain("Dog");
    }
  });

  it("Resolute Reinforcements: flash, and creates a white 1/1 Soldier token on entering", () => {
    let s = scenario({ active: "p2", p1: { battlefield: lands("Plains", 2), hand: ["Resolute Reinforcements"] } });
    s = p1Priority(s);
    s = settle(cast(s, "p1", "Resolute Reinforcements"));
    expect(idsOf(s, "p1", "battlefield", "Resolute Reinforcements")).toHaveLength(1);
    const soldier = idOf(s, "p1", "battlefield", "Soldier");
    expect(pt(s, soldier)).toEqual([1, 1]);
    expect(chars(s, soldier).colors).toEqual(["W"]);
  });

  it("Revenge of the Rats: a tapped 1/1 Rat per creature card in your graveyard, then flashback", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 8),
        hand: ["Revenge of the Rats"],
        graveyard: ["Bear Cub", "Llanowar Elves", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Revenge of the Rats"));
    let rats = idsOf(s, "p1", "battlefield", "Rat");
    // Three creature cards on your side (neither the instant nor the opposing graveyard).
    expect(rats).toHaveLength(3);
    expect(rats.every((r) => s.objects[r]?.tapped)).toBe(true);
    expect(pt(s, rats[0] as string)).toEqual([1, 1]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Revenge of the Rats") });
    s = settle(s);
    rats = idsOf(s, "p1", "battlefield", "Rat");
    expect(rats).toHaveLength(6);
    expect(exiled(s, "Revenge of the Rats")).toHaveLength(1);
  });

  it("Ruby, Daring Tracker: haste; +2/+2 on attack if you control a creature with power 4 or more; mana {R} or {G}", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Ruby, Daring Tracker", sick: true }, "Pelakka Wurm"] } });
    const ruby = idOf(s, "p1", "battlefield", "Ruby, Daring Tracker");
    s = attack(s, [ruby]);
    s = settle(s);
    expect(pt(s, ruby)).toEqual([3, 4]);

    let t = scenario({ p1: { battlefield: ["Ruby, Daring Tracker", "Bear Cub"] } });
    const ruby2 = idOf(t, "p1", "battlefield", "Ruby, Daring Tracker");
    t = attack(t, [ruby2]);
    t = settle(t);
    expect(pt(t, ruby2)).toEqual([1, 2]);

    const m = scenario({ p1: { battlefield: ["Ruby, Daring Tracker"] } });
    const r = idOf(m, "p1", "battlefield", "Ruby, Daring Tracker");
    expect(act(m, "p1", { type: "tapForMana", source: r, ability: 0, color: "R" }).players.p1?.manaPool.R).toBe(1);
    expect(act(m, "p1", { type: "tapForMana", source: r, ability: 0, color: "G" }).players.p1?.manaPool.G).toBe(1);
  });

  it("Rune-Sealed Wall: defender; {T}: surveil 1", () => {
    let s = scenario({ p1: { battlefield: ["Rune-Sealed Wall"], library: ["Opt", ...lands("Island", 5)] } });
    const wall = idOf(s, "p1", "battlefield", "Rune-Sealed Wall");
    const atk = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(atk, "p1", { type: "declareAttackers", attackers: [{ id: wall, defender: "p2" }] })).toThrow();
    s = act(s, "p1", { type: "activate", source: wall, ability: 0 });
    let seen: string[] = [];
    s = settle(s, (req) => {
      if (req.type === "pick" && req.intent.startsWith("surveil")) {
        seen = req.options;
        return req.options;
      }
      return undefined;
    });
    expect(seen).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[wall]?.tapped).toBe(true);
  });

  it("Seismic Rupture: 2 damage to each creature without flying, on both sides", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub", "Serra Angel"], hand: ["Seismic Rupture"] },
      p2: { battlefield: ["Llanowar Elves", "Fire Elemental", "Shivan Dragon"] },
    });
    s = settle(cast(s, "p1", "Seismic Rupture"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Fire Elemental")]?.damage).toBe(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.damage).toBe(0);
    expect(life(s, "p1")).toBe(20);
    expect(life(s, "p2")).toBe(20);
  });

  it("Self-Reflection: creates a token copy of a creature you control; flashback {3}{U}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 10), "Serra Angel"], hand: ["Self-Reflection"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    expect(() => cast(s, "p1", "Self-Reflection", { targets: { t: [dragon] } })).toThrow();
    s = settle(cast(s, "p1", "Self-Reflection", { targets: { t: [angel] } }));
    let angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(2);
    expect(angels.filter((a) => s.objects[a]?.isToken)).toHaveLength(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Self-Reflection"), targets: { t: [angel] } });
    s = settle(s);
    angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(3);
    expect(exiled(s, "Self-Reflection")).toHaveLength(1);
  });

  it("Shipwreck Dowser: on entering, returns an instant or sorcery from your graveyard; prowess", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Shipwreck Dowser", "Opt"],
        graveyard: ["Release the Dogs", "Opt", "Bear Cub"],
      },
      p2: { graveyard: ["Giant Growth"] },
    });
    s = cast(s, "p1", "Shipwreck Dowser");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const dogs = idOf(s, "p1", "graveyard", "Release the Dogs");
    // Your instants and sorceries only (neither the creature card nor the opposing graveyard).
    expect([...pickOptions(s)].sort()).toEqual([dogs, idOf(s, "p1", "graveyard", "Opt")].sort());
    s = settle(s, picking([dogs]));
    expect(idsOf(s, "p1", "hand", "Release the Dogs")).toHaveLength(1);
    const dowser = idOf(s, "p1", "battlefield", "Shipwreck Dowser");
    s = cast(s, "p1", "Opt");
    s = passUntil(s, (x) => !x.stack.some((i) => i.kind === "spell"));
    s = settle(s);
    expect(pt(s, dowser)).toEqual([4, 4]);
  });

  it("Skyship Buccaneer and Storm Fleet Spy: raid, draw a card on entering only if you attacked this turn", () => {
    for (const [name, mana] of [
      ["Skyship Buccaneer", 5],
      ["Storm Fleet Spy", 3],
    ] as const) {
      let s = scenario({ p1: { battlefield: lands("Island", mana), hand: [name] } });
      s = settle(cast(s, "p1", name));
      expect(handSize(s, "p1")).toBe(0);

      let t = scenario({ p1: { battlefield: [...lands("Island", mana), "Bear Cub"], hand: [name] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
      t = advanceUntil(t, (x) => x.turn.step === "main2");
      t = settle(cast(t, "p1", name));
      expect(handSize(t, "p1")).toBe(1);
    }
    const s = scenario({ p1: { battlefield: ["Skyship Buccaneer"] } });
    expect(kw(s, idOf(s, "p1", "battlefield", "Skyship Buccaneer"), "flying")).toBe(true);
  });

  it("Slumbering Cerberus: doesn't untap during your untap step; morbid, untaps at each end step if a creature died", () => {
    // Opponent's turn: a creature dies, Cerberus untaps at the opponent's end step.
    let s = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Slumbering Cerberus", tapped: true }] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cerb = idOf(s, "p1", "battlefield", "Slumbering Cerberus");
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p1");
    expect(s.objects[cerb]?.tapped).toBe(false);

    // Without a death: it stays tapped, including during your untap step.
    let t = scenario({ active: "p2", p1: { battlefield: [{ name: "Slumbering Cerberus", tapped: true }] } });
    const c2 = idOf(t, "p1", "battlefield", "Slumbering Cerberus");
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(t.objects[c2]?.tapped).toBe(true);
  });

  it("Snakeskin Veil: a +1/+1 counter and hexproof until end of turn, on your creature", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Snakeskin Veil"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => cast(s, "p1", "Snakeskin Veil", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow();
    s = settle(cast(s, "p1", "Snakeskin Veil", { targets: { t: [bear] } }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(kw(s, bear, "hexproof")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(kw(s, bear, "hexproof")).toBe(false);
    expect(pt(s, bear)).toEqual([3, 3]);
  });

  it("Spectral Sailor: flash, flying; {3}{U}: draw a card", () => {
    let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 5), hand: ["Spectral Sailor"] } });
    s = p1Priority(s);
    s = settle(cast(s, "p1", "Spectral Sailor"));
    const sailor = idOf(s, "p1", "battlefield", "Spectral Sailor");
    expect(kw(s, sailor, "flying")).toBe(true);
    s = p1Priority(s);
    s = act(s, "p1", { type: "activate", source: sailor, ability: 0 });
    s = passBoth(s);
    expect(handSize(s, "p1")).toBe(1);
    // Less than {3} available: no second activation.
    expect(canActivate(s, "p1", sailor)).toBe(false);
  });

  it("Stasis Snare: flash; exiles a targeted opposing creature as long as it stays on the battlefield", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Stasis Snare"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Forest"] },
    });
    s = p1Priority(s);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Stasis Snare");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Opposing creatures only (neither yours nor a land).
    expect([...pickOptions(s)].sort()).toEqual([dragon, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([dragon]));
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Stasis Snare"));
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Stroke of Midnight: destroys a nonland permanent; its controller creates a white 1/1 Human", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Stroke of Midnight"] },
      p2: { battlefield: ["Ravenous Amulet", "Forest"] },
    });
    expect(() => cast(s, "p1", "Stroke of Midnight", { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = settle(cast(s, "p1", "Stroke of Midnight", { targets: { t: [idOf(s, "p2", "battlefield", "Ravenous Amulet")] } }));
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    const human = idOf(s, "p2", "battlefield", "Human");
    expect(pt(s, human)).toEqual([1, 1]);
    expect(chars(s, human).colors).toEqual(["W"]);
    expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(0);
  });

  it("Stromkirk Bloodthief: at your end step, if an opponent lost life, a +1/+1 counter on one of your Vampires", () => {
    let s = scenario({ p1: { battlefield: ["Stromkirk Bloodthief", "Vampire Nighthawk", "Bear Cub"] } });
    const thief = idOf(s, "p1", "battlefield", "Stromkirk Bloodthief");
    const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
    s = attack(s, [hawk]);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    // Only your Vampires are targets.
    expect([...pickOptions(s)].sort()).toEqual([thief, hawk].sort());
    s = settle(s, picking([thief]));
    expect(counterCount(s.objects[thief] as never, "+1/+1")).toBe(1);

    // No opponent lost life: no trigger.
    const t = scenario({ step: "main2", p1: { battlefield: ["Stromkirk Bloodthief"] } });
    const th2 = idOf(t, "p1", "battlefield", "Stromkirk Bloodthief");
    const after = toNextTurn(t);
    expect(after.seen).toEqual([]);
    expect(counterCount(after.s.objects[th2] as never, "+1/+1")).toBe(0);
  });

  it("Syr Alin, the Lion's Claw: first strike; on attack, your other creatures get +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Syr Alin, the Lion's Claw", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const alin = idOf(s, "p1", "battlefield", "Syr Alin, the Lion's Claw");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(kw(s, alin, "firstStrike")).toBe(true);
    s = attack(s, [alin]);
    s = settle(s);
    expect(pt(s, alin)).toEqual([4, 4]);
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Tatyova, Benthic Druid: when a land enters under your control, you gain 1 life and draw", () => {
    let s = scenario({ p1: { battlefield: ["Tatyova, Benthic Druid"], hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(s);
    expect(life(s, "p1")).toBe(21);
    expect(handSize(s, "p1")).toBe(1);
    // An opponent's land: nothing.
    let t = scenario({ active: "p2", p1: { battlefield: ["Tatyova, Benthic Druid"] }, p2: { hand: ["Forest"] } });
    t = settle(act(t, "p2", { type: "playLand", card: idOf(t, "p2", "hand", "Forest") }));
    expect(life(t, "p1")).toBe(20);
    expect(handSize(t, "p1")).toBe(0);
  });

  it("Thrashing Brontodon: {1}, sacrifice it: destroy a targeted artifact or enchantment", () => {
    let s = scenario({
      p1: { battlefield: ["Thrashing Brontodon", "Forest"] },
      p2: { battlefield: ["Ravenous Amulet", "Bear Cub"] },
    });
    const bronto = idOf(s, "p1", "battlefield", "Thrashing Brontodon");
    expect(() =>
      act(s, "p1", { type: "activate", source: bronto, ability: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
    ).toThrow();
    s = act(s, "p1", {
      type: "activate",
      source: bronto,
      ability: 0,
      targets: { t: [idOf(s, "p2", "battlefield", "Ravenous Amulet")] },
    });
    expect(idsOf(s, "p1", "graveyard", "Thrashing Brontodon")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
  });

  it("Tragic Banshee: -1/-1 to an opposing creature, -13/-13 instead if a creature died this turn", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Tragic Banshee"] },
        p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
      });
    let s = setup();
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = cast(s, "p1", "Tragic Banshee");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect([...pickOptions(s)].sort()).toEqual([wurm, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([wurm]));
    expect(pt(s, wurm)).toEqual([6, 6]);

    let t = setup();
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settle(cast(t, "p1", "Tragic Banshee"), picking([wurm]));
    expect(idsOf(t, "p2", "graveyard", "Pelakka Wurm")).toHaveLength(1);
  });

  it("Trygon Predator: flying; combat damage to a player, may destroy an artifact or enchantment of that player", () => {
    let s = scenario({
      p1: { battlefield: ["Trygon Predator", "Rune-Sealed Wall"] },
      p2: { battlefield: ["Ravenous Amulet"] },
    });
    const trygon = idOf(s, "p1", "battlefield", "Trygon Predator");
    expect(kw(s, trygon, "flying")).toBe(true);
    s = attack(s, [trygon]);
    s = advanceUntil(s, (x) => x.pending?.kind === "choice");
    expect(pickOptions(s)).toEqual([idOf(s, "p2", "battlefield", "Ravenous Amulet")]);
    s = settle(s, yes);
    expect(life(s, "p2")).toBe(18);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Rune-Sealed Wall")).toHaveLength(1);
  });

  it("Twinblade Blessing: flash; the enchanted creature has double strike", () => {
    let s = scenario({ active: "p2", p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Twinblade Blessing"] } });
    s = p1Priority(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Twinblade Blessing", { targets: { enchant: [bear] } }));
    expect(kw(s, bear, "doubleStrike")).toBe(true);
    destroy(s, idOf(s, "p1", "battlefield", "Twinblade Blessing"));
    expect(kw(s, bear, "doubleStrike")).toBe(false);
  });

  it("Twinblade Paladin: a +1/+1 counter when you gain life; double strike at 25 life or more", () => {
    let s = scenario({
      p1: { life: 23, battlefield: ["Twinblade Paladin", ...lands("Plains", 4)], hand: ["Prayer of Binding"] },
    });
    const paladin = idOf(s, "p1", "battlefield", "Twinblade Paladin");
    expect(kw(s, paladin, "doubleStrike")).toBe(false);
    s = settle(cast(s, "p1", "Prayer of Binding"));
    expect(life(s, "p1")).toBe(25);
    expect(counterCount(s.objects[paladin] as never, "+1/+1")).toBe(1);
    expect(kw(s, paladin, "doubleStrike")).toBe(true);
    const t = scenario({ p1: { life: 24, battlefield: ["Twinblade Paladin"] } });
    expect(kw(t, idOf(t, "p1", "battlefield", "Twinblade Paladin"), "doubleStrike")).toBe(false);
  });

  it("Unflinching Courage: the enchanted creature gets +2/+2, trample and lifelink", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Plains", "Bear Cub"], hand: ["Unflinching Courage"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Unflinching Courage", { targets: { enchant: [bear] } }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(kw(s, bear, "trample")).toBe(true);
    expect(kw(s, bear, "lifelink")).toBe(true);
    s = attack(s, [bear]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(life(s, "p2")).toBe(16);
    expect(life(s, "p1")).toBe(24);
  });

  it("Valorous Stance: makes a creature indestructible, or destroys a creature with toughness 4 or more", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Valorous Stance"] },
        p2: { battlefield: ["Fire Elemental", "Llanowar Elves"] },
      });
    let s = setup();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Valorous Stance", { mode: 0, targets: { t: [bear] } }));
    destroy(s, bear);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);

    let t = setup();
    expect(() =>
      cast(t, "p1", "Valorous Stance", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Llanowar Elves")] } }),
    ).toThrow();
    t = settle(cast(t, "p1", "Valorous Stance", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Fire Elemental")] } }));
    expect(idsOf(t, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
  });

  it("Vampire Gourmand: on attack, may sacrifice another creature; if so, draw and it can't be blocked", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Vampire Gourmand", "Llanowar Elves"] }, p2: { battlefield: ["Bear Cub"] } });
    let s = setup();
    const gourmand = idOf(s, "p1", "battlefield", "Vampire Gourmand");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attack(s, [gourmand]);
    s = passUntil(s, (x) => x.pending?.kind !== "priority");
    // The other creature only (not Gourmand itself).
    expect(pickOptions(s)).toEqual([elf]);
    s = choose(s, [elf]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: gourmand }],
      }),
    ).toThrow();

    // Without a sacrifice: neither draw nor evasion.
    let t = setup();
    t = attack(t, [gourmand]);
    t = passUntil(t, (x) => x.pending?.kind !== "priority");
    t = choose(t, []);
    t = passUntil(t, (x) => x.pending?.kind === "declareBlockers");
    expect(handSize(t, "p1")).toBe(0);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(() =>
      act(t, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(t, "p2", "battlefield", "Bear Cub"), attacker: gourmand }],
      }),
    ).not.toThrow();
  });

  it("Vampire Nighthawk: flying, deathtouch and lifelink", () => {
    let s = scenario({ p1: { battlefield: ["Vampire Nighthawk"] }, p2: { battlefield: ["Serra Angel"] } });
    const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [hawk]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: hawk }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(life(s, "p1")).toBe(22);
  });

  it("Vengeful Bloodwitch: when it or another of your creatures dies, the targeted opponent loses 1 life and you gain 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Vengeful Bloodwitch", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
    destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
    s = settle(s);
    expect(life(s, "p2")).toBe(20);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s);
    expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
    destroy(s, idOf(s, "p1", "battlefield", "Vengeful Bloodwitch"));
    s = settle(s);
    expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
  });

  it("Venom Connoisseur: deathtouch for itself when another of your creatures enters; on the second resolution of the turn, for all your creatures", () => {
    let s = scenario({
      p1: {
        battlefield: ["Venom Connoisseur", "Bear Cub", ...lands("Forest", 3)],
        hand: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves"],
      },
    });
    const venom = idOf(s, "p1", "battlefield", "Venom Connoisseur");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(kw(s, venom, "deathtouch")).toBe(true);
    expect(kw(s, bear, "deathtouch")).toBe(false);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(kw(s, bear, "deathtouch")).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").every((e) => kw(s, e, "deathtouch"))).toBe(true);
    // Third resolution: only itself; the new creature doesn't have deathtouch.
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").filter((e) => kw(s, e, "deathtouch"))).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(kw(s, venom, "deathtouch")).toBe(false);
    expect(kw(s, bear, "deathtouch")).toBe(false);
  });

  it("Vile Entomber: deathtouch; on entering, puts a card from your library into your graveyard", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Vile Entomber"], library: ["Forest", "Opt", "Forest"] } });
    s = settle(cast(s, "p1", "Vile Entomber"), (req, _p, cur) =>
      req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Opt") : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
    expect(kw(s, idOf(s, "p1", "battlefield", "Vile Entomber"), "deathtouch")).toBe(true);
  });

  it("Volley Veteran: on entering, damages an opposing creature by the number of Goblins you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Goblin Smuggler", "Bear Cub"], hand: ["Volley Veteran"] },
      p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = cast(s, "p1", "Volley Veteran");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Opposing creatures only.
    expect([...pickOptions(s)].sort()).toEqual([wurm, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([wurm]));
    // Volley Veteran and Goblin Smuggler: 2 Goblins.
    expect(s.objects[wurm]?.damage).toBe(2);
  });

  it("Wardens of the Cycle: morbid, at your end step, gain 2 life or draw and lose 1 life", () => {
    const setup = () => scenario({ p1: { battlefield: ["Wardens of the Cycle", "Bear Cub"] } });
    let s = setup();
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = untilIntent(s, "triggerMode");
    s = choose(s, ["0"]);
    s = settle(s);
    expect(life(s, "p1")).toBe(22);

    let t = setup();
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = untilIntent(t, "triggerMode");
    t = choose(t, ["1"]);
    t = settle(t);
    expect(life(t, "p1")).toBe(19);
    expect(handSize(t, "p1")).toBe(1);

    // Without a death: nothing.
    const u = toNextTurn(scenario({ step: "main2", p1: { battlefield: ["Wardens of the Cycle"] } }));
    expect(u.seen).toEqual([]);
    expect(life(u.s, "p1")).toBe(20);
    expect(handSize(u.s, "p1")).toBe(0);
  });

  it("Wildwood Scourge: enters with X counters; one more counter when you put some on another of your non-Hydra creatures", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), ...lands("Plains", 3), "Bear Cub"],
        hand: ["Wildwood Scourge", "Fleeting Flight", "Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Wildwood Scourge", { x: 3 }));
    const scourge = idOf(s, "p1", "battlefield", "Wildwood Scourge");
    expect(counterCount(s.objects[scourge] as never, "+1/+1")).toBe(3);
    let r = counterFrom(s, "p1", idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(r.s);
    expect(counterCount(s.objects[scourge] as never, "+1/+1")).toBe(4);
    expect(r.triggered).toEqual(["Wildwood Scourge"]);
    // On an opposing creature, or on itself: no trigger.
    r = counterFrom(s, "p1", idOf(s, "p2", "battlefield", "Llanowar Elves"));
    expect(r.triggered).toEqual([]);
    expect(counterCount(r.s.objects[scourge] as never, "+1/+1")).toBe(4);
    r = counterFrom(r.s, "p1", scourge);
    expect(r.triggered).toEqual([]);
    expect(counterCount(r.s.objects[scourge] as never, "+1/+1")).toBe(5);
    // On another Hydra: no trigger either.
    const h = scenario({
      p1: {
        battlefield: [
          "Plains",
          { name: "Wildwood Scourge", counters: { "+1/+1": 1 } },
          { name: "Wildwood Scourge", counters: { "+1/+1": 1 } },
        ],
        hand: ["Fleeting Flight"],
      },
    });
    expect(counterFrom(h, "p1", idsOf(h, "p1", "battlefield", "Wildwood Scourge")[0] as string).triggered).toEqual([]);
  });
});

describe("Foundations, PLAN-A A4a", () => {
  it("Trygon Predator: with several players, the destroyed artifact or enchantment is the damaged player's", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Trygon Predator"] },
      p2: { battlefield: ["Fishing Pole"] },
      p3: { battlefield: ["Leyline Axe", "Quick-Draw Katana"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Trygon Predator")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Leyline Axe", "Quick-Draw Katana"]]);
    expect(idsOf(run.s, "p2", "battlefield", "Fishing Pole")).toHaveLength(1);
  });

  it("Fishing Pole: the granted ability is the equipped creature's; it loses it with its abilities", () => {
    const s = scenario({ p1: { battlefield: ["Fishing Pole", "Llanowar Elves", "Forest"] } });
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s.objects[pole]!.attachedTo = elf;
    s.version += 1;
    const bait = (x: GameState) =>
      legalActions(x, "p1").some((a) => a.type === "activate" && a.label?.startsWith("Tap Fishing Pole"));
    expect(bait(s)).toBe(true);
    addEffect(s, [elf], { loseAllAbilities: true }, "endOfTurn");
    expect(bait(s)).toBe(false);
  });
});
