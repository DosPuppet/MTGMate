/**
 * Commander (EDH pseudo-set): rules tests for the reprints left out of the reprint sets for a Commander-only mechanic
 * (PLAN-L L2): the partners (Breeches, Dargo, Ishai, Kraum, Malcolm, Thrasios, Tymna, Vial Smasher), Inalla (eminence)
 * and Yuriko (commander ninjutsu, 702.49d). "One or more Pirates deal damage to your opponents": one trigger for the
 * batch, its players read by `ref.eventPlayers`.
 */
import { CARDS, canPair } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { sacrifice } from "../src/actions";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  castable,
  customCard,
  exiled,
  idOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

type S = GameState;
const PIRATE = customCard({ name: "Test Pirate", subtypes: ["Pirate"], power: 2, toughness: 2 });
const NINJA = customCard({ name: "Test Ninja", subtypes: ["Ninja"], power: 2, toughness: 2 });
const WIZARD = customCard({
  name: "Test Wizard",
  subtypes: ["Wizard"],
  power: 1,
  toughness: 1,
  manaCostText: "{1}",
  manaCost: { generic: 1, colored: {}, x: 0 },
});
const BEAR = customCard({ name: "Test Bear", power: 2, toughness: 2 });

const castIt = (s: S, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: S, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
const activate = (s: S, p: PlayerId, source: ObjectId, extra: object = {}) => {
  const o = activations(s, p, source)[0];
  if (!o) throw new Error(`no ability for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const tokens = (s: S, name: string, p: PlayerId = "p1") =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
const plusOne = (s: S, id: ObjectId) => s.objects[id]?.counters["+1/+1"] ?? 0;
/** Makes a card in the command zone a commander of its owner. */
function inCommand(s: S, p: PlayerId, name: string): ObjectId {
  const id = (s.players[p]?.command ?? []).find((x) => nameOf(s, x) === name) ?? "";
  if (!id) throw new Error(`${name} not in the command zone`);
  return id;
}

/** Declares the attackers, nobody blocks, then p1's priority in the declare blockers step. */
function attackNoBlocks(s: S, attacks: { id: string; defender: string }[]): S {
  let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  cur = act(cur, "p1", { type: "declareAttackers", attackers: attacks });
  for (
    let i = 0;
    i < 60 && !(cur.turn.step === "declareBlockers" && cur.pending?.kind === "priority" && !cur.stack.length);
    i++
  ) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}

describe("Commander-only reprints (EDH, PLAN-L L2)", () => {
  it("the eight partners pair with each other (Partner read from the text)", () => {
    const partners = [
      "Breeches, Brazen Plunderer",
      "Dargo, the Shipwrecker",
      "Ishai, Ojutai Dragonspeaker",
      "Kraum, Ludevic's Opus",
      "Malcolm, Keen-Eyed Navigator",
      "Thrasios, Triton Hero",
      "Tymna the Weaver",
      "Vial Smasher the Fierce",
    ].map((n) => CARDS[n]);
    for (const a of partners) {
      expect(a?.set).toBe("EDH");
      for (const b of partners) if (a && b && a !== b) expect(canPair(a, b), `${a.name} + ${b.name}`).toBe(true);
    }
    const yuriko = CARDS["Yuriko, the Tiger's Shadow"];
    const kraum = CARDS["Kraum, Ludevic's Opus"];
    expect(yuriko && kraum && canPair(yuriko, kraum)).toBe(false);
  });

  it("Ishai: whenever an opponent casts a spell, a +1/+1 counter", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Ishai, Ojutai Dragonspeaker"], hand: ["Bear Cub"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock"] },
    });
    const ishai = idOf(s, "p1", "battlefield", "Ishai, Ojutai Dragonspeaker");
    s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(plusOne(s, ishai)).toBe(1);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Kraum: only an opponent's second spell each turn draws a card", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Kraum, Ludevic's Opus"], library: lands("Island", 5) },
      p2: { battlefield: lands("Mountain", 3), hand: ["Shock", "Shock", "Shock"] },
    });
    s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.hand).toHaveLength(0);
    s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  describe("Thrasios: {4}: scry 1, then reveal the top card; a land onto the battlefield tapped, otherwise draw", () => {
    it("a land on top: onto the battlefield tapped, no draw", () => {
      let s = scenario({
        p1: { battlefield: ["Thrasios, Triton Hero", ...lands("Island", 4)], library: ["Forest", "Bear Cub", "Island"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Thrasios, Triton Hero")));
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(s.objects[forest]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("a nonland card: drawn (the revealed card itself)", () => {
      let s = scenario({
        p1: { battlefield: ["Thrasios, Triton Hero", ...lands("Island", 4)], library: ["Bear Cub", "Forest", "Island"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Thrasios, Triton Hero")));
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(s.battlefield.some((id) => nameOf(s, id) === "Forest")).toBe(false);
    });

    it("scry 1 first: the land sent to the bottom, the next card (nonland) is drawn", () => {
      let s = scenario({
        p1: { battlefield: ["Thrasios, Triton Hero", ...lands("Island", 4)], library: ["Forest", "Bear Cub", "Island"] },
      });
      const forest = s.players.p1?.library[0] as string;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Thrasios, Triton Hero")), (req) =>
        req.type === "pick" && req.intent === "scryBottom" ? [forest] : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library.at(-1)).toBe(forest);
    });
  });

  it("Tymna: postcombat main phase, pay X life (opponents dealt combat damage) to draw X cards", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Tymna the Weaver", BEAR, BEAR], library: lands("Plains", 5) },
    });
    const [b1, b2] = s.battlefield.filter((id) => nameOf(s, id) === "Test Bear");
    s = attackNoBlocks(s, [
      { id: b1 as string, defender: "p2" },
      { id: b2 as string, defender: "p3" },
    ]);
    s = throughCombat(s);
    // Two opponents dealt combat damage: pay 2 life, draw 2.
    s = passAccepting(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0);
    s = settle(s, yes);
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Vial Smasher: the first spell each turn deals its mana value to a random opponent", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Vial Smasher the Fierce", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Bear Cub"));
    const hurt = (["p2", "p3"] as const).filter((p) => (s.players[p]?.life ?? 0) < 20);
    expect(hurt).toHaveLength(1);
    expect(s.players[hurt[0] as PlayerId]?.life).toBe(18);
    s = settle(castIt(s, "p1", "Bear Cub"));
    expect((s.players.p2?.life ?? 0) + (s.players.p3?.life ?? 0)).toBe(38);
  });

  it("Vial Smasher: that player or a planeswalker they control (the controller chooses; the player is suggested)", () => {
    const walker = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 5 });
    let s = scenario({
      p1: { battlefield: ["Vial Smasher the Fierce", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
      p2: { battlefield: [walker] },
    });
    const w = idOf(s, "p2", "battlefield", "Test Walker");
    s = settle(castIt(s, "p1", "Bear Cub"), (req) => (req.type === "pick" && req.options.includes(w) ? [w] : undefined));
    expect(s.objects[w]?.counters.loyalty).toBe(3);
    expect(s.players.p2?.life).toBe(20);
  });

  it("Malcolm: Pirates deal combat damage to two opponents: one trigger, two Treasures", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Malcolm, Keen-Eyed Navigator", PIRATE, PIRATE, PIRATE] },
    });
    const pirates = s.battlefield.filter((id) => nameOf(s, id) === "Test Pirate");
    s = attackNoBlocks(s, [
      { id: pirates[0] as string, defender: "p2" },
      { id: pirates[1] as string, defender: "p2" },
      { id: pirates[2] as string, defender: "p3" },
    ]);
    s = throughCombat(s);
    expect(tokens(s, "Treasure")).toHaveLength(2);
  });

  it("Breeches: exiles the top card of each damaged opponent; may play them this turn, mana as any color", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Breeches, Brazen Plunderer", PIRATE, ...lands("Forest", 2)] },
      p2: { library: ["Shock", "Island"] },
      p3: { library: ["Swamp", "Island"] },
    });
    const pirate = idOf(s, "p1", "battlefield", "Test Pirate");
    const breeches = idOf(s, "p1", "battlefield", "Breeches, Brazen Plunderer");
    // Breeches has summoning sickness only in name: the scenario creatures can attack.
    s = attackNoBlocks(s, [
      { id: pirate, defender: "p2" },
      { id: breeches, defender: "p3" },
    ]);
    s = throughCombat(s);
    expect(exiled(s, "Shock")).toHaveLength(1);
    expect(exiled(s, "Swamp")).toHaveLength(1);
    // Shock ({R}) cast with Forests (mana as though any color); the Swamp can be played as the land of the turn.
    const shock = exiled(s, "Shock")[0] as string;
    expect(castable(s, "p1", shock)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } } as never));
    expect(s.players.p2?.life).toBe(20 - 2 - 2);
    const swamp = exiled(s, "Swamp")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === swamp)).toBe(true);
  });

  describe("Dargo: {2} less for each permanent sacrificed this way and each other one sacrificed this turn", () => {
    it("two artifacts sacrificed as it is cast: {6}{R} paid with {2}{R}", () => {
      const relic = customCard({ name: "Test Relic", types: ["Artifact"], typeLine: "Artifact" });
      let s = scenario({ p1: { battlefield: [relic, relic, ...lands("Mountain", 3)], hand: ["Dargo, the Shipwrecker"] } });
      const relics = s.battlefield.filter((id) => nameOf(s, id) === "Test Relic");
      s = settle(castIt(s, "p1", "Dargo, the Shipwrecker", { picks: { sacrificeToPay: relics } }));
      expect(s.battlefield.some((id) => nameOf(s, id) === "Dargo, the Shipwrecker")).toBe(true);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Test Relic")).toHaveLength(0);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(0);
      // A reduction: no mana left in the pool.
      expect(Object.values(s.players.p1?.manaPool ?? {}).every((n) => n === 0)).toBe(true);
    });

    it("a sacrifice worth {2} used for the last {1}: nothing floats", () => {
      const relic = customCard({ name: "Test Relic", types: ["Artifact"], typeLine: "Artifact" });
      let s = scenario({ p1: { battlefield: [relic, relic, relic, ...lands("Mountain", 2)], hand: ["Dargo, the Shipwrecker"] } });
      const relics = s.battlefield.filter((id) => nameOf(s, id) === "Test Relic");
      // {6}{R}: three sacrifices pay the {6}; two Mountains: one pays {R}.
      s = settle(castIt(s, "p1", "Dargo, the Shipwrecker", { picks: { sacrificeToPay: relics } }));
      expect(s.battlefield.some((id) => nameOf(s, id) === "Dargo, the Shipwrecker")).toBe(true);
      expect(Object.values(s.players.p1?.manaPool ?? {}).every((n) => n === 0)).toBe(true);
    });

    it("a creature sacrificed earlier this turn counts too; a land does not", () => {
      // Five Mountains: {6}{R} − {2} = {4}{R} once the Bear was sacrificed this turn.
      const s = scenario({ p1: { battlefield: [BEAR, ...lands("Mountain", 5)], hand: ["Dargo, the Shipwrecker"] } });
      sacrifice(s, idOf(s, "p1", "battlefield", "Test Bear"));
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Dargo, the Shipwrecker"))).toBe(true);
      // A land sacrificed: no reduction.
      const t = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Dargo, the Shipwrecker"] } });
      sacrifice(t, idOf(t, "p1", "battlefield", "Mountain"));
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Dargo, the Shipwrecker"))).toBe(false);
    });
  });

  describe("Inalla (eminence)", () => {
    it("from the command zone: another nontoken Wizard enters, pay {1}: a hasty token copy, exiled at the next end step", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: [WIZARD], command: ["Inalla, Archmage Ritualist"] },
      });
      s = settle(castIt(s, "p1", "Test Wizard"), yes);
      const copies = tokens(s, "Test Wizard");
      expect(copies).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Test Wizard")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(tokens(s, "Test Wizard")).toHaveLength(0);
    });

    it("tap five untapped Wizards you control (Inalla included): target player loses 7 life", () => {
      let s = scenario({
        p1: { battlefield: ["Inalla, Archmage Ritualist", WIZARD, WIZARD, WIZARD, WIZARD] },
      });
      const inalla = idOf(s, "p1", "battlefield", "Inalla, Archmage Ritualist");
      s = settle(activate(s, "p1", inalla, { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(13);
      expect(s.objects[inalla]?.tapped).toBe(true);
    });
  });

  describe("Yuriko", () => {
    it("commander ninjutsu from the command zone; a Ninja's combat damage: top card into hand, each opponent loses its mana value", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: [NINJA, "Island", "Swamp"],
          library: ["Gigantosaurus", "Island"],
          command: ["Yuriko, the Tiger's Shadow"],
        },
      });
      const yuriko = inCommand(s, "p1", "Yuriko, the Tiger's Shadow");
      const ninja = idOf(s, "p1", "battlefield", "Test Ninja");
      // Not before combat: ninjutsu needs an unblocked attacker.
      expect(activations(s, "p1", yuriko)).toHaveLength(0);
      s = attackNoBlocks(s, [{ id: ninja, defender: "p2" }]);
      expect(activations(s, "p1", yuriko)).toHaveLength(1);
      s = act(s, "p1", {
        type: "activate",
        source: yuriko,
        ability: activations(s, "p1", yuriko)[0]?.ability ?? 0,
        targets: {},
        picks: { returnAttacker: [ninja] },
      } as never);
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
      const onField = idOf(s, "p1", "battlefield", "Yuriko, the Tiger's Shadow");
      expect(s.objects[onField]?.tapped).toBe(true);
      expect(s.combat?.attackers.find((a) => a.id === onField)?.defender).toBe("p2");
      expect(handNames(s, "p1")).toEqual(["Test Ninja"]);
      s = throughCombat(s);
      // Yuriko (a Ninja) dealt 1 combat damage to p2: Gigantosaurus ({G}{G}{G}{G}{G}, 5) into hand.
      expect(handNames(s, "p1")).toEqual(["Gigantosaurus", "Test Ninja"]);
      expect(s.players.p2?.life).toBe(20 - 1 - 5);
      expect(s.players.p3?.life).toBe(15);
    });

    it("commander ninjutsu still works from the hand", () => {
      let s = scenario({ p1: { battlefield: [BEAR, "Island", "Swamp"], hand: ["Yuriko, the Tiger's Shadow"] } });
      const bear = idOf(s, "p1", "battlefield", "Test Bear");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      const yuriko = idOf(s, "p1", "hand", "Yuriko, the Tiger's Shadow");
      expect(activations(s, "p1", yuriko)).toHaveLength(1);
    });
  });
});
