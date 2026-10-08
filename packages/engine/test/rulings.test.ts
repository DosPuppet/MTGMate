/**
 * Tests tirés des décisions officielles (rulings Scryfall et règles complètes) pour les interactions fréquentes du méta :
 * lien de vie, copies, remplacements, nettoyage (docs/plans/PLAN-R.md, lot R7).
 */
import { card, nameCatalog } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, dealDamage, destroy, gainLife, sacrifice, sourceFromObject } from "../src/actions";
import { eventReplacement, fx, graveyardReplacement, ref, spell, target, triggered, when } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { RulesError } from "../src/errors";
import { fallbackDecision } from "../src/host";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { nameValidator } from "../src/names";
import { counterItem } from "../src/stack";
import { changeCounters, chars, createObject, moveObject, registerDef } from "../src/state";
import { addPlayerEffect } from "../src/statics";
import { matchesObjectFilter } from "../src/targets";
import {
  allowedDefenders,
  attackRequirements,
  blockRequirements,
  forcedAttacks,
  preferredDefenders,
  repairAttacks,
  requiredBlocks,
  stateBasedActions,
} from "../src/turn";
import { countTurnEvents } from "../src/turnlog";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, lands, passAccepting, passUntil, scenario } from "./helpers";

const ench = (name: string, ab: CardDef["abilities"][number]) =>
  customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

const resolution = (controller: string) => ({
  item: { id: "x", controller, sourceId: "none", sourceDefId: "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

/** Passe et accepte les choix suggérés jusqu'à la condition. */
const settle = (s: GameState, until: (x: GameState) => boolean) => passAccepting(s, until);

describe("lien de vie (702.15, décisions d'Ajani's Pridemate)", () => {
  const linker = (name: string) => customCard({ name, power: 2, toughness: 2, keywords: ["lifelink"] });

  it("deux sources avec le lien de vie qui blessent en même temps : deux gains de points de vie distincts", () => {
    const a = linker("Lien A");
    const b = linker("Lien B");
    let s = scenario({ p1: { battlefield: ["Ajani's Pridemate", a, b] } });
    const pridemate = idOf(s, "p1", "battlefield", "Ajani's Pridemate");
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: idOf(s, "p1", "battlefield", a.name), defender: "p2" },
        { id: idOf(s, "p1", "battlefield", b.name), defender: "p2" },
      ],
    });
    s = settle(s, (x) => x.turn.step === "endCombat" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.life).toBe(24);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });

  it("des blessures prévenues ne font pas gagner de points de vie", () => {
    const a = linker("Lien C");
    const s = scenario({ p1: { battlefield: [a] }, p2: { battlefield: ["Progenitus"] } });
    const src = idOf(s, "p1", "battlefield", a.name);
    dealDamage(
      s,
      { id: src, defId: a.id, controller: "p1", keywords: ["lifelink"] },
      idOf(s, "p2", "battlefield", "Progenitus"),
      3,
      false,
    );
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("copies de sorts (707.10)", () => {
  it("une copie n'est pas lancée : la prouesse ne se déclenche que pour les sorts lancés", () => {
    const prowler = customCard({ name: "Prouesse de test", power: 1, toughness: 1, keywords: ["prowess"] });
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", prowler, "Forest", "Forest", "Forest", "Forest"],
        hand: ["Giant Growth", "Giant Growth"],
      },
    });
    const id = idOf(s, "p1", "battlefield", prowler.name);
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    for (let i = 0; i < 2; i++) {
      const growth = idsOf(s, "p1", "hand", "Giant Growth")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: growth, targets: { t: [id] } }), empty);
    }
    // Deux Giant Growth lancés et une copie (+9), deux prouesses (+2) : 1 + 9 + 2.
    expect(chars(s, id).power).toBe(12);
  });

  it("contrecarrer l'original ne contrecarre pas la copie", () => {
    let s = scenario({
      p1: { battlefield: ["Thousand-Year Storm", "Bear Cub", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    s = settle(
      act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [bear] } }),
      empty,
    );
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [bear] } });
    const original = s.stack[0]?.id as string;
    // Le déclenchement de Thousand-Year Storm se résout : la copie est au-dessus de l'original.
    s = settle(s, (x) => x.stack.some((i) => i.copy) && x.pending?.kind === "priority");
    expect(counterItem(s, original, "test")).toBe(true);
    s = settle(s, empty);
    // Premier Giant Growth et la copie : +6.
    expect(chars(s, bear).power).toBe(2 + 6);
  });
});

describe("remplacements (616, 615)", () => {
  it("616.1 : le joueur blessé applique son bouclier après le doubleur adverse (New Way Forward renvoie 6, pas 3)", () => {
    const tyrant = ench(
      "Tyran D",
      eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }),
    );
    const s = scenario({ p1: { battlefield: [tyrant, "Bear Cub"] }, p2: { library: Array(8).fill("Forest") } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    addPlayerEffect(
      s,
      "p2",
      {
        replacement: {
          event: "damage",
          to: "you",
          modify: { prevent: true },
          sourceIs: bear,
          origin: { id: bear, defId: s.objects[bear]?.defId as string },
          onPrevent: {
            reflexive: [fx.draw({ kind: "eventAmount" }), fx.damage({ kind: "eventAmount" }, { kind: "eventPlayer" })],
          },
        },
      },
      s.turn.number,
      true,
    );
    dealDamage(s, sourceFromObject(s, bear), "p2", 3, false);
    expect(s.players.p2?.life).toBe(20);
    const t = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.life).toBe(20 - 6);
  });

  it("616.1 : une prévention d'un autre joueur passe avant les doubleurs (The Mindskinner fait meuler 3, pas 6)", () => {
    const s = scenario({
      p1: { battlefield: ["The Mindskinner", "Twinflame Tyrant", "Bear Cub"] },
      p2: { library: Array(10).fill("Forest") },
    });
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 3, false);
    expect(s.players.p2?.life).toBe(20);
    expect(s.players.p2?.library).toHaveLength(7);
  });

  it("deux doubleurs de blessures se cumulent : 3 blessures en font 12", () => {
    const tyrant = (name: string) =>
      ench(name, eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }));
    const s = scenario({ p1: { battlefield: [tyrant("Tyran A"), tyrant("Tyran B"), "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      {
        ...resolution("p1"),
        item: { ...resolution("p1").item, sourceId: bear, sourceDefId: s.objects[bear]?.defId },
        targets: { t: ["p2"] },
      } as never,
      fx.damage(3, ref.target()),
    );
    expect(s.players.p2?.life).toBe(20 - 12);
  });

  it("des blessures prévenues ne sont pas doublées (615 avant 616)", () => {
    const s = scenario({
      p1: {
        battlefield: [
          ench(
            "Tyran C",
            eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }),
          ),
        ],
      },
      p2: { battlefield: ["Progenitus"] },
    });
    const progenitus = idOf(s, "p2", "battlefield", "Progenitus");
    dealDamage(s, { defId: "test", controller: "p1", keywords: [] }, progenitus, 3, false);
    expect(s.objects[progenitus]?.damage).toBe(0);
  });

  it("« exilez-la à la place » : une créature exilée au lieu d'aller au cimetière ne « meurt » pas", () => {
    const exile = ench("Exil de test", graveyardReplacement({}));
    const mourner = ench("Deuil de test", triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(5)], { label: "deuil" }));
    let s = scenario({ p1: { battlefield: [exile, mourner, "Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("remplacements des jetons et des marqueurs (R1, famille H)", () => {
  it("616.1 : un jeton d'artefact remplacé (Draconic Visitor) est aussi doublé (Doubling Season)", () => {
    const s = scenario({ p1: { battlefield: ["Doubling Season", "Draconic Visitor", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      { ...resolution("p1"), item: { ...resolution("p1").item, sourceId: bear } } as never,
      fx.createTokens({ name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"] }),
    );
    const dragons = s.battlefield.filter((id) => s.objects[id]?.isToken && chars(s, id).subtypes.includes("Dragon"));
    expect(dragons).toHaveLength(2);
  });

  it("une prévention (« on ne peut pas mettre de marqueurs ») l'emporte sur un doubleur", () => {
    const shield = ench("Sans marqueurs", eventReplacement({ event: "counters", modify: { prevent: true } }));
    const s = scenario({ p1: { battlefield: ["Doubling Season", shield, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("nettoyage (514)", () => {
  it("une défausse du nettoyage qui déclenche : priorité, puis une nouvelle étape de nettoyage (514.3a)", () => {
    const counter = ench("Défausse de test", triggered(when.discard("you"), [fx.gainLife(1)], { label: "défausse" }));
    const hand = Array(9).fill("Forest") as string[];
    let s = scenario({ p1: { battlefield: [counter], hand }, step: "end" });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p1?.life).toBe(22);
  });
});

describe("prouesse multiple (702.108b)", () => {
  it("Thor Odinson (« prowess, prowess ») : +2/+2 par sort non-créature", () => {
    let s = scenario({ p1: { battlefield: ["Thor Odinson", "Island"], hand: ["Opt"] } });
    const thor = idOf(s, "p1", "battlefield", "Thor Odinson");
    const base = chars(s, thor).power;
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    expect(chars(s, thor).power).toBe(base + 2);
  });
});

describe("Tablet of Discovery (SOS) : permissions et mana restreint", () => {
  it("un terrain meulé se joue ce tour-ci ; {R}{R} restreint paie un éphémère", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Mountain", "Mountain"],
        hand: ["Tablet of Discovery", "Lightning Strike"],
        library: ["Island", "Forest"],
      },
    });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tablet of Discovery") }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    const island = idOf(s, "p1", "graveyard", "Island");
    s = act(s, "p1", { type: "playLand", card: island });
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    // Seule source : la Tablet, dont {R}{R} (réservé aux éphémères et rituels) paie Lightning Strike ({1}{R}).
    let t = scenario({ p1: { battlefield: ["Tablet of Discovery"], hand: ["Lightning Strike"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    expect(t.stack.length).toBe(1);
  });
});

describe("Ashiok, Wicked Manipulator (rulings du 01/09/2023)", () => {
  const pricey = customCard({
    name: "Prêtre de décision",
    power: 1,
    toughness: 1,
    abilities: [{ kind: "activated", cost: { payLife: 3 }, effects: [fx.gainLife(1)], targets: [], label: "Gagnez 1 PV" }],
  });

  it("ne permet pas de payer plus de PV que son total, même avec assez de cartes", () => {
    const s = scenario({
      p1: { life: 2, battlefield: ["Ashiok, Wicked Manipulator", pricey], library: Array(10).fill("Swamp") },
    });
    const priest = idOf(s, "p1", "battlefield", pricey.name);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === priest)).toBe(false);
  });

  it("le remplacement est obligatoire : aucun PV payé tant que la bibliothèque suffit", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator", pricey], library: Array(4).fill("Swamp") } });
    const priest = idOf(s, "p1", "battlefield", pricey.name);
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === priest);
    s = act(s, "p1", { type: "activate", source: priest, ability: a?.type === "activate" ? a.ability : 0 });
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.library).toHaveLength(1);
  });
});

describe("509.1c : « doit être bloquée si possible » et la menace", () => {
  it("avec une seule créature capable de bloquer, aucun blocage n'est exigé ; avec deux, il faut bloquer avec les deux", () => {
    const lure = customCard({ name: "Appât menaçant", power: 2, toughness: 2, keywords: ["mustBeBlocked", "menace"] });
    const run = (blockers: string[]) => {
      let s = scenario({ p1: { battlefield: [lure] }, p2: { battlefield: blockers } });
      const attacker = idOf(s, "p1", "battlefield", lure.name);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: attacker, defender: "p2" }] });
      return { s: advanceUntil(s, (x) => x.pending?.kind === "declareBlockers"), attacker };
    };
    // Une seule créature : aucun blocage possible avec la menace, donc rien n'est exigé (le moteur ne demande rien).
    const one = run(["Bear Cub"]);
    if (one.s.pending?.kind === "declareBlockers")
      expect(() => act(one.s, "p2", { type: "declareBlockers", blocks: [] })).not.toThrow();
    expect(requiredBlocks(one.s, "p2")).toEqual([]);
    const two = run(["Bear Cub", "Llanowar Elves"]);
    expect(() => act(two.s, "p2", { type: "declareBlockers", blocks: [] })).toThrow();
    const [a, b] = two.s.battlefield.filter((id) => two.s.objects[id]?.controller === "p2");
    expect(() =>
      act(two.s, "p2", {
        type: "declareBlockers",
        blocks: [
          { blocker: a as string, attacker: two.attacker },
          { blocker: b as string, attacker: two.attacker },
        ],
      }),
    ).not.toThrow();
  });
});

describe("608.2h : dernières informations connues de la créature qui meurt", () => {
  it("Rakdos Joins Up : les blessures valent la force de la créature légendaire au moment de mourir, marqueurs compris", () => {
    const hero = customCard({ name: "Test Hero", supertypes: ["Legendary"], power: 2, toughness: 2 });
    let s = scenario({
      p1: { battlefield: ["Rakdos Joins Up", { name: hero, counters: { "+1/+1": 2 } }] },
      p2: { life: 20 },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Test Hero"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("« carte » : un jeton qui change de zone n'est pas une carte", () => {
  it("Moonshadow : un jeton mis au cimetière ne retire pas de marqueur -1/-1 ; une carte de permanent, si", () => {
    const token = customCard({ name: "Test Token", power: 1, toughness: 1 });
    let s = scenario({ p1: { battlefield: [{ name: "Moonshadow", counters: { "-1/-1": 6 } }, "Bear Cub", token] } });
    const shadow = idOf(s, "p1", "battlefield", "Moonshadow");
    const tok = idOf(s, "p1", "battlefield", "Test Token");
    s.objects[tok]!.isToken = true;
    destroy(s, tok);
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[shadow]?.counters["-1/-1"]).toBe(6);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[shadow]?.counters["-1/-1"]).toBe(5);
  });
});

describe("correctifs du lot A6 de Marvel Super Heroes", () => {
  it("608.2h : « quand une créature attaquante meurt » voit qu'elle attaquait (dernières informations avant 506.4)", () => {
    const mourner = ench(
      "Deuil d'attaquant",
      triggered(when.dies({ types: ["Creature"], attacking: true }), [fx.gainLife(5)], { label: "deuil" }),
    );
    let s = scenario({ p1: { battlefield: [mourner, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    destroy(s, bear);
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.life).toBe(25);
  });

  it("301.5c : un Équipement qui devient une créature se détache", () => {
    const gear = customCard({
      name: "Test Gear",
      types: ["Artifact"],
      subtypes: ["Equipment"],
      typeLine: "Artifact — Equipment",
    });
    const s = scenario({ p1: { battlefield: [gear, "Bear Cub"] } });
    const g = idOf(s, "p1", "battlefield", "Test Gear");
    s.objects[g]!.attachedTo = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      { ...resolution("p1"), item: { ...resolution("p1").item, sourceId: g } } as never,
      fx.modify(ref.self, { addTypes: ["Creature"], setPower: 2, setToughness: 2 }),
    );
    stateBasedActions(s);
    expect(s.objects[g]?.attachedTo).toBeUndefined();
  });

  it("F/E définies par une capacité : « créatures légendaires que vous contrôlez » ne compte que les légendaires", () => {
    const adaptoid = customCard({
      name: "Test Adaptoid",
      power: 0,
      toughness: 4,
      cdaPower: { kind: "count", filter: { types: ["Creature"], controller: "you", legendary: true } },
    });
    const hero = customCard({ name: "Test Legend", supertypes: ["Legendary"], power: 1, toughness: 1 });
    const s = scenario({ p1: { battlefield: [adaptoid, hero, "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Test Adaptoid")).power).toBe(1);
  });
});

describe("socle de Marvel's Spider-Man", () => {
  it("700.9 : modifié = un marqueur, un Équipement, ou une Aura contrôlée par le contrôleur de la créature", () => {
    const aura = customCard({ name: "Test Aura", types: ["Enchantment"], subtypes: ["Aura"], typeLine: "Enchantment — Aura" });
    const s = scenario({
      p1: { battlefield: ["Bear Cub", { name: "Llanowar Elves", counters: { "+1/+1": 1 } }, "Serra Angel"] },
      p2: { battlefield: [aura] },
    });
    const modified = (name: string) => matchesObjectFilter(s, "p1", idOf(s, "p1", "battlefield", name), { modified: true });
    expect(modified("Bear Cub")).toBe(false);
    expect(modified("Llanowar Elves")).toBe(true);
    // Aura de l'adversaire : la créature n'est pas modifiée.
    const a = idOf(s, "p2", "battlefield", "Test Aura");
    s.objects[a]!.attachedTo = idOf(s, "p1", "battlefield", "Serra Angel");
    bump(s);
    expect(modified("Serra Angel")).toBe(false);
    s.objects[a]!.controller = "p1";
    bump(s);
    expect(modified("Serra Angel")).toBe(true);
  });

  it("615 : Anti-Venom reçoit les marqueurs dans le remplacement même, sans capacité sur la pile", () => {
    const s = scenario({ p1: { battlefield: ["Anti-Venom, Horrifying Healer"] }, p2: { battlefield: ["Bear Cub"] } });
    const venom = idOf(s, "p1", "battlefield", "Anti-Venom, Horrifying Healer");
    dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub")), venom, 2, true);
    expect(s.objects[venom]?.damage ?? 0).toBe(0);
    expect(s.objects[venom]?.counters["+1/+1"]).toBe(2);
    expect(s.stack).toHaveLength(0);
    expect(s.triggers).toHaveLength(0);
  });

  it("305.1 : « jouez un terrain depuis l'exil » ne compte pas un terrain joué depuis la main", () => {
    const watcher = customCard({
      name: "Test Exile Watcher",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [triggered({ on: "playLand", from: ["exile"] }, [fx.addCounters(ref.self, 1)])],
    });
    let s = scenario({ p1: { battlefield: [watcher], hand: ["Forest"] } });
    const w = idOf(s, "p1", "battlefield", "Test Exile Watcher");
    s = passAccepting(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (x) => x.triggers.length === 0);
    expect(s.objects[w]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("journal du tour : un terrain joué est noté avec sa zone de départ (Spider-Man 2099)", () => {
    let s = scenario({ p1: { hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(countTurnEvents(s, { event: "playLand", who: "you", fromZone: "hand" }, "p1")).toBe(1);
    expect(countTurnEvents(s, { event: "playLand", who: "you", fromZone: "graveyard" }, "p1")).toBe(0);
    expect(countTurnEvents(s, { event: "playLand", who: "opponent" }, "p1")).toBe(0);
  });

  it("Chimil, the Inner Sun : « les sorts que vous contrôlez » couvre aussi un sort de créature", () => {
    let s = scenario({ p1: { battlefield: ["Chimil, the Inner Sun", "Forest", "Forest"], hand: ["Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const item = s.stack[0]?.id as string;
    expect(counterItem(s, item, "test")).toBe(false);
    expect(s.stack).toHaveLength(1);
  });
});

describe("correctifs du lot A de Teenage Mutant Ninja Turtles", () => {
  it("603.3d : cibles « de joueurs différents » toutes chez un même joueur — pas de cible légale, pas de choix impossible", () => {
    let s = scenario({
      p1: { battlefield: Array(6).fill("Island"), hand: ["Kitsune, Dragon's Daughter"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kitsune, Dragon's Daughter") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind !== "choice");
    expect(s.pending?.kind).toBe("priority");
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("correctifs du lot A de The Hobbit", () => {
  it("106.6 : un mana restreint produit à la main va dans la réserve restreinte, pas dans la réserve libre", () => {
    let s = scenario({ p1: { battlefield: ["Castle Doom"], hand: ["Bear Cub"] } });
    const castle = idOf(s, "p1", "battlefield", "Castle Doom");
    // Deuxième capacité de mana : une couleur, seulement pour un sort d'artefact.
    s = act(s, "p1", { type: "tapForMana", source: castle, ability: 1, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(0);
    expect(s.players.p1?.restrictedMana).toEqual([
      { type: "G", restriction: { spell: { types: ["Artifact"] } }, source: castle },
    ]);
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
  });
});

describe("correctifs de fin de The Hobbit", () => {
  it("613.1b : l'Aura qui donne le contrôle part — le contrôle revient aussitôt, avant les actions basées sur l'état", () => {
    let s = scenario({
      p1: { battlefield: [...Array(6).fill("Island")], hand: ["Confiscate"] },
      p2: { battlefield: ["Forest"] },
    });
    const forest = idOf(s, "p2", "battlefield", "Forest");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Confiscate"), targets: { enchant: [forest] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[forest]?.controller).toBe("p1");
    // Renvoyée en main au milieu d'une résolution : pas d'actions basées sur l'état entre-temps.
    moveObject(s, idOf(s, "p1", "battlefield", "Confiscate"), "hand");
    expect(s.objects[forest]?.controller).toBe("p2");
  });

  it("plafond : dix doubleurs de jetons ne créent pas 1 024 jetons, mais au plus 100 (approximation documentée)", () => {
    const doubler = customCard({
      name: "Test Token Doubler",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [eventReplacement({ event: "tokens", to: "you", modify: { times: 2 } })],
    });
    const s = scenario({ p1: { battlefield: Array(10).fill(doubler) } });
    const made = createTokens(
      s,
      "p1",
      { name: "Test Soldier", colors: ["W"], types: ["Creature"], subtypes: ["Soldier"], power: 1, toughness: 1 },
      1,
    );
    expect(made).toHaveLength(100);
  });
});

describe("509.1c et 509.1d : respecter autant d'exigences de blocage que possible (PLAN-C, lot C4)", () => {
  /** p1 attaque p2 avec `attackers` ; renvoie la position de la déclaration des bloqueurs. */
  const toBlocks = (p1: (string | CardDef)[], p2: (string | CardDef)[], extra: Partial<Parameters<typeof scenario>[0]> = {}) => {
    let s = scenario({ p1: { battlefield: p1 }, p2: { battlefield: p2 }, ...extra });
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  };
  const wolf = customCard({ name: "Loup de test", power: 2, toughness: 2, subtypes: ["Wolf"] });
  const lure = customCard({ name: "Appât de test", power: 2, toughness: 2, keywords: ["mustBeBlocked"] });
  const guard = customCard({ name: "Garde de test", power: 1, toughness: 5 });

  it("« bloque ce Loup si possible » et un attaquant « doit être bloqué » : chacun des deux blocages est accepté", () => {
    let s = toBlocks([wolf, lure], [guard]);
    const [w, l, g] = [
      idOf(s, "p1", "battlefield", wolf.name),
      idOf(s, "p1", "battlefield", lure.name),
      idOf(s, "p2", "battlefield", guard.name),
    ];
    // Tolsimir : la créature doit bloquer ce Loup si possible.
    addEffect(s, [g], { addBlockRules: [{ mustBlockAttacker: w, label: "Bloque ce Loup si possible" }] }, "endOfTurn");
    // Une seule exigence peut être respectée : bloquer le Loup ou l'appât ; ne pas bloquer en respecte zéro.
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: g, attacker: w }] })).not.toThrow();
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: g, attacker: l }] })).not.toThrow();
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow(RulesError);
    // Le blocage par défaut (repli de l'hôte, automatisme) est accepté.
    const fallback = requiredBlocks(s, "p2");
    expect(fallback).toHaveLength(1);
    s = act(s, "p2", { type: "declareBlockers", blocks: fallback });
    expect(s.pending?.kind).not.toBe("declareBlockers");
  });

  it("deux créatures qui bloquent si possible, un seul attaquant : les deux doivent bloquer", () => {
    const eager = (name: string) => customCard({ name, power: 1, toughness: 1 });
    const s = toBlocks([wolf], [eager("Zélé A"), eager("Zélé B")]);
    const [a, b] = ["Zélé A", "Zélé B"].map((n) => idOf(s, "p2", "battlefield", n)) as [string, string];
    addEffect(s, [a, b], { addBlockRules: [{ mustBlock: true, label: "Bloque si possible" }] }, "endOfTurn");
    const w = idOf(s, "p1", "battlefield", wolf.name);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: a, attacker: w }] })).toThrow(RulesError);
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [
          { blocker: a, attacker: w },
          { blocker: b, attacker: w },
        ],
      }),
    ).not.toThrow();
  });

  it("509.1d : avec une taxe de blocage, aucune exigence ne s'impose (Archangel of Tithes)", () => {
    const s = toBlocks(["Archangel of Tithes", lure], [guard]);
    expect(blockRequirements(s, "p2")).toEqual([]);
    expect(requiredBlocks(s, "p2")).toEqual([]);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).not.toThrow();
  });

  it("la déclaration d'attaque par défaut fait attaquer ce qui doit attaquer (Juggernaut : corde expirée en ligne)", () => {
    let s = scenario({ p1: { battlefield: ["Juggernaut"] }, p2: { battlefield: [guard] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const p = s.pending;
    if (p?.kind !== "declareAttackers") throw new Error("pas de déclaration des attaquants");
    const d = fallbackDecision(s, p);
    expect(d).toEqual({
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Juggernaut"), defender: "p2" }],
    });
    expect(() => act(s, "p1", d)).not.toThrow();
  });
});

describe("106.6 : mana marqué engagé à la main (PLAN-C, lot C5)", () => {
  const elf = customCard({
    name: "Elfe de test",
    power: 1,
    toughness: 1,
    subtypes: ["Elf"],
    typeLine: "Creature — Elf",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
  });
  const bear = customCard({
    name: "Ours de test",
    power: 2,
    toughness: 2,
    subtypes: ["Bear"],
    typeLine: "Creature — Bear",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
  });
  const withCavern = () => {
    const s = scenario({ p1: { battlefield: ["Cavern of Souls"], hand: [elf, bear] } });
    const cavern = idOf(s, "p1", "battlefield", "Cavern of Souls");
    const o = s.objects[cavern];
    if (o) o.chosen = { creatureType: "Elf" };
    return { s, cavern };
  };

  it("Cavern of Souls engagée à la main : son mana coloré est proposé, garde le type choisi et rend le sort incontrecarrable", () => {
    let { s, cavern } = withCavern();
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === cavern && a.ability === 1)).toBe(true);
    s = act(s, "p1", { type: "tapForMana", source: cavern, ability: 1, color: "G" });
    expect(s.players.p1?.restrictedMana?.[0]).toMatchObject({ type: "G", source: cavern, chosen: { creatureType: "Elf" } });
    // Le mana ne sert pas à l'Ours (autre type), il sert à l'Elfe.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Ours de test"))).toBe(false);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Elfe de test") });
    expect(s.players.p1?.restrictedMana).toBeUndefined();
    expect(s.stack[0]?.uncounterable).toBe(true);
  });

  it("le type reste celui choisi à la production, même si la Caverne quitte le champ de bataille", () => {
    let { s, cavern } = withCavern();
    s = act(s, "p1", { type: "tapForMana", source: cavern, ability: 1, color: "G" });
    moveObject(s, cavern, "graveyard");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Elfe de test") });
    expect(s.stack[0]?.uncounterable).toBe(true);
  });
});

describe("approximations levées (PLAN-C, lot C12)", () => {
  it("Ordeal of Nylea : sacrifiée par un autre moyen, elle cherche quand même deux terrains de base", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"], library: ["Forest", "Island", "Plains"] } });
    const def = card("Ordeal of Nylea");
    registerDef(s, def);
    const o = createObject(s, def.id, "p1", "battlefield");
    o.attachedTo = idOf(s, "p1", "battlefield", "Bear Cub");
    const ordeal = o.id;
    sacrifice(s, ordeal);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const lands = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Land"));
    expect(lands).toHaveLength(2);
  });

  it("« une ou plusieurs … » : un déclenchement par lot d'événements simultanés (un par effet d'une résolution)", () => {
    const watcher = customCard({
      name: "Veilleur de test",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [
        triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.gainLife(1)], {
          batched: true,
          label: "Des cartes quittent votre cimetière : 1 PV",
        }),
      ],
    });
    const twoEffects = customCard({
      name: "Deux exils",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell(
        [target.cardInGraveyard("a", {}, "you"), target.cardInGraveyard("b", {}, "you")],
        [fx.exileCard(ref.target("a")), fx.exileCard(ref.target("b"))],
      ),
    });
    const oneEffect = customCard({
      name: "Un exil",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell([target.upTo(2, target.cardInGraveyard("t", {}, "you"))], [fx.exileCard(ref.target())]),
    });
    const run = (sorcery: CardDef, targets: (s: GameState, gy: string[]) => Record<string, string[]>) => {
      let s = scenario({ p1: { battlefield: [watcher], hand: [sorcery], graveyard: ["Opt", "Opt"] } });
      const gy = s.players.p1?.graveyard ?? [];
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", sorcery.name), targets: targets(s, gy) });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      return s.players.p1?.life;
    };
    expect(run(twoEffects, (_s, gy) => ({ a: [gy[0] as string], b: [gy[1] as string] }))).toBe(22);
    expect(run(oneEffect, (_s, gy) => ({ t: [...gy] }))).toBe(21);
  });
});

describe("mana d'une source sacrifiée pour son coût (dernière information connue)", () => {
  it("Roxanne, Starfall Savant et un Trésor : le jeton engagé puis sacrifié produit un mana de plus (2)", async () => {
    const { TOKEN_SPECS } = await import("@mtgx/cards");
    let s = scenario({ p1: { battlefield: ["Roxanne, Starfall Savant"] } });
    s = structuredClone(s);
    createTokens(s, "p1", TOKEN_SPECS.Treasure as NonNullable<(typeof TOKEN_SPECS)["Treasure"]>, 1);
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    s = act(s, "p1", { type: "tapForMana", source: treasure, ability: 0, color: "R" });
    expect(s.players.p1?.manaPool.R).toBe(2);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
  });
});

describe("701.38 et 508.1d : provocation et exigences d'attaque (PLAN-H, lot H3)", () => {
  /** p1 contrôle un Ourson provoqué par `goaders` ; position de la déclaration des attaquants de p1. */
  const goaded = (players: number, goaders: string[], extra: Parameters<typeof scenario>[0] = {}) => {
    let s = scenario({ players, ...extra, p1: { battlefield: ["Bear Cub", ...(extra.p1?.battlefield ?? [])] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    for (const by of goaders) addEffect(s, [bear], { addBlockRules: [{ goadedBy: by, label: "Provoquée" }] }, "permanent");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return { s, bear };
  };
  const declare = (s: GameState, attackers: { id: string; defender: string }[]) =>
    act(s, "p1", { type: "declareAttackers", attackers });

  it("provoquée par un joueur : elle doit attaquer, et un autre joueur que lui si possible", () => {
    const { s, bear } = goaded(3, ["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    // La déclaration par défaut (hôte, automatisme) attaque l'autre joueur.
    expect(forcedAttacks(s, "p1")).toEqual([{ id: bear, defender: "p3" }]);
    expect(preferredDefenders(s, bear)).toEqual(["p3"]);
    expect(fallbackDecision(s, s.pending as never)).toEqual({
      type: "declareAttackers",
      attackers: [{ id: bear, defender: "p3" }],
    });
  });

  it("en duel, provoquée par le seul adversaire : elle l'attaque (exigence « attaque si possible »)", () => {
    const { s, bear } = goaded(2, ["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
  });

  it("provoquée par deux joueurs : un adversaire qui ne l'a pas provoquée, sinon l'un des deux (701.38c)", () => {
    const three = goaded(3, ["p2", "p3"]);
    expect(() => declare(three.s, [])).toThrow(RulesError);
    expect(() => declare(three.s, [{ id: three.bear, defender: "p2" }])).not.toThrow();
    expect(() => declare(three.s, [{ id: three.bear, defender: "p3" }])).not.toThrow();
    const four = goaded(4, ["p2", "p3"]);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p3" }])).toThrow(RulesError);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p4" }])).not.toThrow();
  });

  it("provoquée deux fois par le même joueur : les mêmes exigences, une seule fois", () => {
    const { s, bear } = goaded(3, ["p2", "p2"]);
    expect(attackRequirements(s, bear)).toHaveLength(2);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
  });

  it("un planeswalker ne satisfait pas « un joueur autre que vous » : attaquer ce joueur, pas son planeswalker", () => {
    const { s, bear } = goaded(3, ["p2"], { p3: { battlefield: ["Ajani Resolute"] } });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    expect(() => declare(s, [{ id: bear, defender: walker }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
  });

  it("une obligation n'impose pas de payer : l'autre joueur exige une taxe, elle peut attaquer celui qui l'a provoquée", () => {
    const { s, bear } = goaded(3, ["p2"], { p1: { battlefield: lands("Plains", 2) }, p3: { battlefield: ["Propaganda"] } });
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
    // Payer la taxe pour attaquer p3 respecte davantage d'exigences : permis.
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    expect(forcedAttacks(s, "p1")).toEqual([{ id: bear, defender: "p2" }]);
  });

  it("taxe partout : provoquée, elle n'est pas obligée d'attaquer", () => {
    const { s } = goaded(3, ["p2"], { p2: { battlefield: ["Propaganda"] }, p3: { battlefield: ["Propaganda"] } });
    expect(() => declare(s, [])).not.toThrow();
    expect(forcedAttacks(s, "p1")).toEqual([]);
  });

  it("restriction et provocation : elle ne peut pas attaquer l'autre joueur, elle attaque donc celui qui l'a provoquée", () => {
    const { s, bear } = goaded(3, ["p2"]);
    addEffect(s, [bear], { addBlockRules: [{ cantAttackPlayer: "p3", label: "Ne peut pas attaquer p3" }] }, "permanent");
    expect(allowedDefenders(s, bear)).toEqual(["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
  });

  it("« attaque ce joueur à chaque combat si possible » : seule une attaque contre ce joueur la satisfait", () => {
    const { s, bear } = goaded(3, []);
    addEffect(s, [bear], { addBlockRules: [{ mustAttackPlayer: "p3", label: "Attaque p3" }] }, "permanent");
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    // Elle ne peut pas attaquer ce joueur : aucune obligation.
    addEffect(s, [bear], { addBlockRules: [{ cantAttackPlayer: "p3", label: "Ne peut pas attaquer p3" }] }, "permanent");
    expect(() => declare(s, [])).not.toThrow();
  });

  it("508.1d : le plus d'exigences possible ; une attaque volontaire ne peut pas en faire respecter moins (Mirri)", () => {
    // Mirri, Weatherlight Duelist (p3), engagée : une seule créature peut attaquer p3 à chaque combat.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions"] },
      p3: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    // Une seule créature sur p3.
    expect(() =>
      declare(s, [
        { id: lions, defender: "p3" },
        { id: bear, defender: "p3" },
      ]),
    ).toThrow(RulesError);
    // Les Lions sur p3 obligeraient l'Ourson provoqué à attaquer p2 (une exigence au lieu de deux) : refusé.
    const wrong = [
      { id: lions, defender: "p3" },
      { id: bear, defender: "p2" },
    ];
    expect(() => declare(s, wrong)).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: lions, defender: "p2" },
        { id: bear, defender: "p3" },
      ]),
    ).not.toThrow();
    // L'IA qui voulait envoyer les Lions sur p3 voit sa déclaration réparée : l'Ourson prend p3, les Lions attaquent p2.
    const repaired = repairAttacks(s, "p1", wrong);
    expect(repaired).toEqual(
      expect.arrayContaining([
        { id: bear, defender: "p3" },
        { id: lions, defender: "p2" },
      ]),
    );
    expect(repaired).toHaveLength(2);
    expect(() => declare(s, repaired)).not.toThrow();
  });

  it("508.1d : payer une taxe pour une créature ne dispense pas une autre de ses exigences sans coût", () => {
    // Deux créatures provoquées par p2, Propaganda chez p3 : l'Ourson paie pour attaquer p3, les Lions doivent attaquer p2.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions", ...lands("Plains", 2)] },
      p3: { battlefield: ["Propaganda"] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(s, [lions], { addBlockRules: [{ goadedBy: "p2", label: "Provoquée" }] }, "permanent");
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: bear, defender: "p3" },
        { id: lions, defender: "p2" },
      ]),
    ).not.toThrow();
    // Même chose avec « attaque à chaque combat si possible ».
    const t = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions", ...lands("Plains", 2)] },
      p3: { battlefield: ["Propaganda"] },
    });
    const lions2 = idOf(t.s, "p1", "battlefield", "Savannah Lions");
    addEffect(t.s, [lions2], { addKeywords: ["mustAttack"] }, "permanent");
    expect(() => declare(t.s, [{ id: t.bear, defender: "p3" }])).toThrow(RulesError);
  });

  it("« ne peut pas attaquer seule » : provoquée, elle attaque avec une autre créature plutôt que de rester chez elle", () => {
    let s = scenario({ players: 2, p1: { battlefield: ["Bear Cub", "Savannah Lions"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(
      s,
      [bear],
      {
        addBlockRules: [
          { notAlone: true, label: "Ne peut pas attaquer seule" },
          { goadedBy: "p2", label: "Provoquée" },
        ],
      },
      "permanent",
    );
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(forcedAttacks(s, "p1")).toEqual([
      { id: bear, defender: "p2" },
      { id: lions, defender: "p2" },
    ]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, forcedAttacks(s, "p1"))).not.toThrow();
  });

  it("une règle de même forme qui n'est pas une provocation garde ses exigences à côté d'une provocation du même joueur", () => {
    // Maximum Carnage (p2) puis une provocation de p2 : quatre exigences ; une seconde provocation de p2 n'ajoute rien.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions"] },
      p3: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
    });
    addEffect(s, [bear], { addBlockRules: [{ goadedBy: "p2", label: "Maximum Carnage" }] }, "permanent");
    expect(attackRequirements(s, bear)).toHaveLength(4);
    addEffect(s, [bear], { addBlockRules: [{ goadedBy: "p2", label: "Provoquée" }] }, "permanent");
    expect(attackRequirements(s, bear)).toHaveLength(4);
    // Les Lions, provoqués par p2 (deux exigences), cèdent la seule place sur p3 (Mirri) à l'Ourson (quatre).
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(s, [lions], { addBlockRules: [{ goadedBy: "p2", label: "Provoquée" }] }, "permanent");
    expect(() =>
      declare(s, [
        { id: lions, defender: "p3" },
        { id: bear, defender: "p2" },
      ]),
    ).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: lions, defender: "p2" },
        { id: bear, defender: "p3" },
      ]),
    ).not.toThrow();
  });
});

describe("508.4 et 702.49c : joueur attaqué par un permanent mis sur le champ de bataille attaquant (PLAN-H, lot H5)", () => {
  /** Déclare les attaques de p1, puis aucun blocage. */
  const attackThenNoBlocks = (s: GameState, attacks: { id: string; defender: string }[]): GameState => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attacks });
    // Jusqu'à la priorité du joueur actif dans l'étape de déclaration des bloqueurs.
    for (let i = 0; i < 20 && !(cur.turn.step === "declareBlockers" && cur.pending?.kind === "priority"); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const ninjutsuOn = (s: GameState, returned: string): GameState => {
    const kaito = idOf(s, "p1", "hand", "Kaito, Bane of Nightmares");
    const option = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === kaito);
    const ability = option?.type === "activate" ? option.ability : -1;
    let cur = act(s, "p1", { type: "activate", source: kaito, ability, targets: {}, picks: { returnAttacker: [returned] } });
    cur = passAccepting(cur, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    return cur;
  };
  const defenderOf = (s: GameState, id: string) => s.combat?.attackers.find((a) => a.id === id)?.defender;

  it("702.49c : le ninja attaque ce qu'attaquait la créature renvoyée, pas ce qu'attaque votre première créature", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attackThenNoBlocks(s, [
      { id: bear, defender: "p2" },
      { id: elves, defender: "p3" },
    ]);
    s = ninjutsuOn(s, elves);
    expect(defenderOf(s, idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares"))).toBe("p3");
  });

  it("702.49c : la créature renvoyée attaquait un planeswalker, le ninja l'attaque aussi", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
      p2: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attackThenNoBlocks(s, [
      { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      { id: elves, defender: walker },
    ]);
    s = ninjutsuOn(s, elves);
    expect(defenderOf(s, idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares"))).toBe(walker);
  });

  it("508.4 : son contrôleur choisit ce qu'attaque le permanent mis sur le champ de bataille attaquant ; il n'a pas « attaqué »", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Kinscaer Sentry", "Bear Cub"], hand: ["Kinscaer Sentry", "Savannah Lions"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    const sentry = idOf(s, "p1", "battlefield", "Kinscaer Sentry");
    const inHand = idOf(s, "p1", "hand", "Kinscaer Sentry");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: sentry, defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      ],
    });
    const asked: string[][] = [];
    let handPrompts = 0;
    for (let i = 0; i < 60 && s.turn.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "other") {
        asked.push([...p.request.options].sort());
        expect(p.request.suggested).toEqual(["p2"]);
        s = act(s, p.player, { type: "choose", values: [walker] });
      } else if (p?.kind === "choice" && p.request.type === "pick") {
        handPrompts++;
        s = act(s, p.player, { type: "choose", values: p.request.options.includes(inHand) ? [inHand] : [] });
      } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else break;
    }
    // Ses adversaires et leurs planeswalkers ; le nouveau Kinscaer Sentry attaque le planeswalker choisi.
    expect(asked).toEqual([["p2", "p3", walker].sort()]);
    const entered = idsOf(s, "p1", "battlefield", "Kinscaer Sentry").find((id) => id !== sentry) as string;
    expect(defenderOf(s, entered)).toBe(walker);
    // Mis sur le champ de bataille attaquant, il n'a pas attaqué : sa capacité « quand elle attaque » ne se déclenche pas.
    expect(handPrompts).toBe(1);
    expect(idsOf(s, "p1", "hand", "Savannah Lions")).toHaveLength(1);
  });

  it("508.4 : une seule option (duel sans planeswalker), aucune question", () => {
    let s = scenario({ p1: { battlefield: ["Kinscaer Sentry", "Bear Cub"], hand: ["Kinscaer Sentry"] } });
    const sentry = idOf(s, "p1", "battlefield", "Kinscaer Sentry");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: sentry, defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      ],
    });
    let defenderQuestions = 0;
    for (let i = 0; i < 60 && s.turn.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        if (p.request.intent === "other") defenderQuestions++;
        const yes = p.request.type === "pick" ? p.request.options.slice(0, 1) : p.request.suggested;
        s = act(s, p.player, { type: "choose", values: yes });
      } else break;
    }
    expect(defenderQuestions).toBe(0);
    const entered = idsOf(s, "p1", "battlefield", "Kinscaer Sentry").find((id) => id !== sentry) as string;
    expect(defenderOf(s, entered)).toBe("p2");
  });
});

describe("« Gardez les permanents choisis » : les choix dans l'ordre APNAP, puis le sort en même temps (PLAN-H H8a)", () => {
  /** Résout la pile en répondant aux choix par `answer`. */
  const resolveAll = (s: GameState, answer: (req: ChoiceRequest, player: string, cur: GameState) => ChoiceValue[]) => {
    let cur = s;
    for (let i = 0; i < 100; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) });
      else break;
    }
    return cur;
  };
  const nameIs = (s: GameState, id: unknown) => s.defs[s.objects[String(id)]?.defId ?? ""]?.name;

  it("Liliana, Dreadhorde General −9 à trois : chaque adversaire choisit à son tour ; un permanent compte pour chacun de ses types", () => {
    // Décisions officielles : en commençant par l'adversaire suivant dans l'ordre du tour, chaque adversaire choisit en
    // connaissant les choix précédents, puis tous sacrifient en même temps ; un artefact-créature peut être choisi à la
    // fois comme artefact et comme créature.
    let s = scenario({
      players: 3,
      p1: { battlefield: [{ name: "Liliana, Dreadhorde General", counters: { loyalty: 9 } }] },
      p2: { battlefield: ["Adaptive Automaton", "Sol Ring", "Bear Cub", "Forest"] },
      p3: { battlefield: ["Forest", "Island", "Bear Cub"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana, Dreadhorde General");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === lili && x.label?.includes("each type"));
    if (a?.type !== "activate") throw new Error("capacité −9 indisponible");
    s = act(s, "p1", { type: "activate", source: lili, ability: a.ability });
    const field = s.battlefield.length;
    const asked: string[] = [];
    s = resolveAll(s, (req, player, cur) => {
      if (req.type !== "pick") return req.suggested;
      // Rien n'est sacrifié avant la fin des choix.
      expect(cur.battlefield.length).toBe(field);
      asked.push(`${player}:${cur.objects[String(req.options[0])]?.controller}`);
      const keep = req.options.find((id) => ["Adaptive Automaton", "Island"].includes(nameIs(cur, id) ?? ""));
      return [keep ?? (req.options[0] as string)];
    });
    expect(asked).toEqual(["p2:p2", "p2:p2", "p3:p3"]);
    const left = (p: string) =>
      s.battlefield
        .filter((id) => s.objects[id]?.controller === p)
        .map((id) => nameIs(s, id))
        .sort();
    expect(left("p2")).toEqual(["Adaptive Automaton", "Forest"]);
    expect(left("p3")).toEqual(["Bear Cub", "Island"]);
  });
});

describe("PLAN-H H8b : « ne peut pas » face aux remplacements et aux préventions", () => {
  /** « Chaque fois que vous gagnez des points de vie, piochez une carte. » */
  const GAIN_DRAW = ench("Gain d'essai", triggered(when.gainLife, [fx.draw(1)], { label: "Piochez une carte" }));

  it("Grievous Wound (119.7, 101.2) : le joueur enchanté ne gagne pas de PV, même avec Angel of Vitality, et rien ne se déclenche ; les autres joueurs, si", () => {
    const s = scenario({
      players: 3,
      p2: { battlefield: ["Angel of Vitality", GAIN_DRAW] },
      p3: { battlefield: ["Angel of Vitality"] },
    });
    const def = card("Grievous Wound") as CardDef;
    registerDef(s, def);
    createObject(s, def.id, "p1", "battlefield").attachedTo = "p2";
    bump(s);
    for (const p of ["p1", "p2", "p3"]) gainLife(s, p, 3);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 20, 24]);
    expect(countTurnEvents(s, { event: "lifeGain" }, "p2", "p2")).toBe(0);
    expect(s.triggers).toHaveLength(0);
  });

  /** Prévient toutes les blessures qui seraient infligées aux créatures de son contrôleur (combat ou non). */
  const SHIELD = ench("Bouclier d'essai", { kind: "prevention", filter: { types: ["Creature"], controller: "you" } });
  const src = { defId: "test", controller: "p2", keywords: [] };

  it("Frenzied Baloth : les blessures de combat ne peuvent pas être prévenues (ni l'Immunité de Diamond Weapon, ni une prévention) ; les autres, si", () => {
    const s = scenario({ p1: { battlefield: ["Diamond Weapon", "Bear Cub", SHIELD] }, p2: { battlefield: ["Frenzied Baloth"] } });
    const dw = idOf(s, "p1", "battlefield", "Diamond Weapon");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    dealDamage(s, src, dw, 3, true);
    dealDamage(s, src, cub, 1, true);
    dealDamage(s, src, cub, 1, false);
    expect([s.objects[dw]?.damage, s.objects[cub]?.damage]).toEqual([3, 1]);
  });

  it("Sunspine Lynx : aucune blessure ne peut être prévenue, de combat ou non", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", SHIELD] }, p2: { battlefield: ["Sunspine Lynx"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    dealDamage(s, src, cub, 1, false);
    expect(s.objects[cub]?.damage).toBe(1);
  });

  it("perdre la partie (104.3) : Phyrexian Unlife n'empêche que la défaite à 0 PV ; Angel's Grace empêche aussi celle par le poison", () => {
    const poisoned = (life: number, effect?: boolean) => {
      const s = scenario({ p1: { life, battlefield: ["Phyrexian Unlife"] } });
      if (effect) addPlayerEffect(s, "p1", { cantLose: true }, s.turn.number);
      (s.players.p1 as { counters?: { poison?: number } }).counters = { poison: 10 };
      stateBasedActions(s);
      return s.players.p1?.lost;
    };
    expect(poisoned(0)).toBe(true);
    expect(poisoned(0, true)).toBe(false);
    const s = scenario({ p1: { life: 0, battlefield: ["Phyrexian Unlife"] } });
    stateBasedActions(s);
    expect(s.players.p1?.lost).toBe(false);
  });
});

describe("PLAN-H H9 : « en arrivant » (614.1c, 614.12) et copies (707.9, 707.10)", () => {
  /** Joue jusqu'à une pile vide : les choix de cartes reçoivent tour à tour les réponses données, les autres la suggestion. */
  const play = (s: GameState, picks: string[][] = [], typed: string[] = []) => {
    const asked: ChoiceRequest[] = [];
    let cur = s;
    for (let i = 0; i < 200; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        asked.push(p.request);
        const r = p.request;
        const given = r.intent === "pickCards" ? picks.shift() : r.intent === "chooseOnEnter" ? typed.splice(0, 1) : undefined;
        cur = act(cur, p.player, {
          type: "choose",
          values: given?.length || r.intent === "pickCards" ? (given ?? []) : r.suggested,
        });
      } else break;
    }
    return { s: cur, asked };
  };
  const castCard = (s: GameState, name: string) => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) });

  it("707.10 : la copie d'un sort de Visage Bandit (Double Down) devient un jeton qui choisit lui-même ce qu'il copie", () => {
    const s0 = scenario({
      p1: { battlefield: ["Double Down", "Serra Angel", "Bear Cub", ...lands("Island", 4)], hand: ["Visage Bandit"] },
    });
    const angel = idOf(s0, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s0, "p1", "battlefield", "Bear Cub");
    const { s, asked } = play(castCard(s0, "Visage Bandit"), [[angel], [cub]]);
    // Deux questions : le jeton (la copie se résout d'abord), puis la carte.
    expect(asked.filter((r) => r.intent === "pickCards")).toHaveLength(2);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).name).toBe("Serra Angel");
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Angel", "Shapeshifter", "Rogue"]));
    const bandit = s.battlefield.find(
      (id) => !s.objects[id]?.isToken && s.defs[s.objects[id]?.defId ?? ""]?.name === "Visage Bandit",
    );
    expect(bandit && chars(s, bandit).name).toBe("Bear Cub");
  });

  it("707.9 et 614.12 : Phantasmal Image qui copie Adaptive Automaton fait le choix « en arrivant » du modèle", () => {
    const s0 = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Phantasmal Image"] },
      p2: { battlefield: ["Adaptive Automaton"] },
    });
    const automaton = idOf(s0, "p2", "battlefield", "Adaptive Automaton");
    const { s, asked } = play(castCard(s0, "Phantasmal Image"), [[automaton]], ["Goblin"]);
    expect(asked.map((r) => r.intent)).toEqual(["pickCards", "chooseOnEnter"]);
    const image = idOf(s, "p1", "battlefield", "Phantasmal Image");
    expect(chars(s, image).name).toBe("Adaptive Automaton");
    expect(s.objects[image]?.chosen?.creatureType).toBe("Goblin");
    expect(chars(s, image).subtypes).toEqual(expect.arrayContaining(["Construct", "Goblin", "Illusion"]));
  });

  it("708.2 : un permanent mis face cachée (cape) n'a aucun effet « en arrivant » : ni question, ni choix", () => {
    const s = scenario({ p1: { hand: ["Adaptive Automaton"] } });
    const card = idOf(s, "p1", "hand", "Adaptive Automaton");
    const r = { ...resolution("p1"), targets: { t: [card] } };
    expect(runEffect(s, r as never, fx.moveTo(ref.target(), { to: "battlefield", as: "cloak" }))).toBeUndefined();
    const id = s.battlefield.find((x) => s.objects[x]?.owner === "p1") as string;
    expect(s.objects[id]?.faceDown).toBeDefined();
    expect(s.objects[id]?.chosen).toBeUndefined();
  });

  it("un permanent mis sur le champ de bataille sous le contrôle d'un autre joueur : celui-ci choisit, parmi ses permanents", () => {
    const s = scenario({
      p1: { battlefield: ["Serra Angel"], graveyard: ["Waxen Shapethief"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const wax = idOf(s, "p1", "graveyard", "Waxen Shapethief");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const r = { ...resolution("p2"), targets: { t: [wax] } };
    const effect = fx.moveTo(ref.target(), { to: "battlefield", underYourControl: true });
    const asked = runEffect(s, r as never, effect) as { ask?: { player: string; key: string; request: ChoiceRequest } };
    expect(asked.ask?.player).toBe("p2");
    expect(asked.ask?.request.type === "pick" && asked.ask.request.options).toEqual([cub]);
    (r.vars as Record<string, ChoiceValue[]>)[asked.ask?.key ?? ""] = [cub];
    expect(runEffect(s, r as never, effect)).toBeUndefined();
    const back = s.battlefield.find((id) => s.objects[id]?.controller === "p2" && id !== cub) as string;
    expect(chars(s, back).name).toBe("Bear Cub");
  });

  it("un jeton copie d'un permanent à choix (Electroduplicate sur Adaptive Automaton) : le choix par défaut, sans question", () => {
    const s0 = scenario({
      p1: { battlefield: ["Adaptive Automaton", ...lands("Mountain", 3)], hand: ["Electroduplicate"] },
    });
    const automaton = idOf(s0, "p1", "battlefield", "Adaptive Automaton");
    const cast = act(s0, "p1", { type: "cast", card: idOf(s0, "p1", "hand", "Electroduplicate"), targets: { t: [automaton] } });
    const { s, asked } = play(cast);
    expect(asked.filter((r) => r.intent === "chooseOnEnter")).toHaveLength(0);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.objects[token]?.chosen?.creatureType).toBeDefined();
  });

  it("702.136 : une créature avec l'émeute remise sur le champ de bataille par un effet (Zombify) demande le marqueur ou la célérité", () => {
    const s0 = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Spider-Punk"] } });
    const punk = idOf(s0, "p1", "graveyard", "Spider-Punk");
    const cast = act(s0, "p1", { type: "cast", card: idOf(s0, "p1", "hand", "Zombify"), targets: { t: [punk] } });
    const { s, asked } = play(cast);
    const riot = asked.find((r) => r.type === "pick" && r.options.includes("haste"));
    expect(riot?.suggested).toEqual(["haste"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Spider-Punk")).keywords).toContain("haste");
  });

  it("Waxen Shapethief qui copie Sorcerous Spyglass nomme une carte ; les capacités activées des sources de ce nom sont interdites", () => {
    const s0 = scenario({
      p1: { battlefield: ["Sorcerous Spyglass", ...lands("Island", 6)], hand: ["Waxen Shapethief", "Waxen Shapethief"] },
    });
    const glass = idOf(s0, "p1", "battlefield", "Sorcerous Spyglass");
    const cycling = (x: GameState) =>
      legalActions(x, "p1").some((a) => a.type === "activate" && x.objects[a.source]?.zone === "hand");
    expect(cycling(s0)).toBe(true);
    const { s, asked } = play(castCard(s0, "Waxen Shapethief"), [[glass]], ["Waxen Shapethief"]);
    expect(asked.map((r) => r.intent)).toEqual(["pickCards", "chooseOnEnter"]);
    const wax = s.battlefield.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Waxen Shapethief") as string;
    expect(chars(s, wax).name).toBe("Sorcerous Spyglass");
    expect(s.objects[wax]?.chosen?.cardName).toBe("Waxen Shapethief");
    // Le recyclage de l'autre Waxen Shapethief (une capacité activée depuis la main) ne peut plus être activé.
    expect(cycling(s)).toBe(false);
  });
});

describe("201.3, 709.4, 715.4, 712.8a : noms des cartes à plusieurs faces (audit du 07/10, D1)", () => {
  /** Ancient Vendetta : p1 nomme `name` ; cartes de p2 (bibliothèque) exilées. */
  const vendetta = (name: string, library: string[]) => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] }, p2: { library } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    s = act(s, "p1", { type: "choose", values: [name] });
    s = passUntil(s, (x) => x.stack.length === 0 && x.pending?.kind !== "choice");
    return s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
  };
  const ROOM = "Dazzling Theater // Prop Room";
  const ADVENTURER = "Beanstalk Wurm // Plant Beans";
  const MODAL = "Sink into Stupor // Soporific Springs";
  const LIB = [ROOM, ADVENTURER, MODAL, "Opt", "Opt"];

  it("709.4 : une carte scindée (Salle) hors du champ de bataille a ses deux noms", () => {
    expect(vendetta("Dazzling Theater", LIB)).toEqual([ROOM]);
    expect(vendetta("Prop Room", LIB)).toEqual([ROOM]);
  });

  it("715.4 : hors de la pile, un aventurier n'a que son nom principal", () => {
    expect(vendetta("Beanstalk Wurm", LIB)).toEqual([ADVENTURER]);
    expect(vendetta("Plant Beans", LIB)).toEqual([]);
  });

  it("712.8a : hors du champ de bataille et de la pile, une carte modale à deux faces a le nom de son recto", () => {
    expect(vendetta("Sink into Stupor", LIB)).toEqual([MODAL]);
    expect(vendetta("Soporific Springs", LIB)).toEqual([]);
  });

  it("201.3 : « A // B » n'est pas un nom de carte (catalogue et noms de la partie) ; chaque face en est un", () => {
    const s = scenario({ p1: { hand: [ROOM, ADVENTURER, MODAL] } });
    const allowed = nameValidator(s, "card");
    for (const full of [ROOM, ADVENTURER, MODAL]) expect(allowed(full)).toBe(false);
    for (const face of ["Dazzling Theater", "Prop Room", "Beanstalk Wurm", "Plant Beans", "Soporific Springs"])
      expect(allowed(face)).toBe(true);
    const catalog = nameCatalog();
    expect(catalog.cards).not.toContain(ROOM);
    expect(catalog.cards).toContain("Prop Room");
    expect(catalog.lands).toContain("Soporific Springs");
  });

  it("712.8a : sur le champ de bataille, le nom de la face visible ; une Salle, ceux de ses portes déverrouillées", () => {
    const s = scenario({ p1: { battlefield: [MODAL, ADVENTURER, ROOM] } });
    const room = idOf(s, "p1", "battlefield", ROOM);
    (s.objects[room] as { unlocked?: number[] }).unlocked = [1];
    bump(s);
    expect(matchesObjectFilter(s, "p1", room, { name: "Prop Room" })).toBe(true);
    expect(matchesObjectFilter(s, "p1", room, { name: "Dazzling Theater" })).toBe(false);
    const modal = idOf(s, "p1", "battlefield", MODAL);
    expect(chars(s, modal).name).toBe("Sink into Stupor");
    expect(matchesObjectFilter(s, "p1", modal, { name: "Sink into Stupor" })).toBe(true);
    expect(matchesObjectFilter(s, "p1", idOf(s, "p1", "battlefield", ADVENTURER), { name: "Plant Beans" })).toBe(false);
  });
});

describe("701.38 : la provocation n'est pas une capacité (audit du 07/10, D2)", () => {
  it("une créature provoquée qui perd ensuite toutes ses capacités reste provoquée ; ce qu'elle avait gagné est perdu", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Provoquée par p2 (effet de résolution, fx.goad), avec le vol pour la même durée ; puis « perd toutes ses capacités ».
    runEffect(
      s,
      { ...resolution("p2"), targets: { t: [bear] } } as never,
      fx.goad(ref.target(), "untilYourNextTurn", { addKeywords: ["flying"] }),
    );
    addEffect(s, [bear], { loseAllAbilities: true }, "permanent");
    expect(chars(s, bear).keywords).not.toContain("flying");
    expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p2"]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p3" }] })).not.toThrow();
  });
});

describe("702.116a et 508.5 : myriade, joueur défenseur figé au déclenchement (audit du 07/10, D4)", () => {
  /** Duel : Goldlust Triad attaque `at` ; `meanwhile` agit avant la résolution de la myriade. */
  const myriad = (at: "p2" | "walker", meanwhile: (s: GameState, triad: string, walker: string) => void) => {
    let s = scenario({ p1: { battlefield: ["Goldlust Triad"] }, p2: { battlefield: ["Ajani Resolute"] } });
    const triad = idOf(s, "p1", "battlefield", "Goldlust Triad");
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: triad, defender: at === "p2" ? "p2" : walker }] });
    s = advanceUntil(s, (x) => x.stack.length > 0 && x.pending?.kind === "priority");
    meanwhile(s, triad, walker);
    let asked = 0;
    s = passAccepting(s, (x) => {
      if (x.pending?.kind === "choice") asked++;
      return x.stack.length === 0 && x.triggers.length === 0;
    });
    const copies = s.battlefield.filter((id) => s.objects[id]?.isToken);
    return { asked, copies };
  };

  it("la créature meurt avant la résolution : en duel, aucun adversaire autre que le joueur défenseur, aucune copie", () => {
    expect(myriad("p2", (s, triad) => destroy(s, triad))).toEqual({ asked: 0, copies: [] });
  });

  it("le planeswalker attaqué est retiré avant la résolution : son contrôleur reste le joueur défenseur, aucune copie", () => {
    expect(myriad("walker", (s, _t, walker) => void moveObject(s, walker, "graveyard"))).toEqual({ asked: 0, copies: [] });
  });
});

describe("603.2 et 603.2e : Elesh Norn, Mother of Machines (deck Nissa)", () => {
  it("l'arrivée d'un terrain adverse fait se déclencher deux fois une capacité de votre permanent ; celle de l'adversaire, jamais", () => {
    // Décision du 2023-02-04 : seul compte le contrôleur du permanent dont la capacité se déclenche, pas celui du
    // permanent qui arrive.
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Elesh Norn, Mother of Machines", "Polluted Bonds"] },
      p2: { battlefield: ["Polluted Bonds"], hand: ["Plains"] },
    });
    s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Plains") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([24, 16]);
    // Un terrain de p1 : la Polluted Bonds de p2 (un permanent adverse pour Elesh Norn) ne se déclenche pas.
    let t = scenario({
      p1: { battlefield: ["Elesh Norn, Mother of Machines"], hand: ["Plains"] },
      p2: { battlefield: ["Polluted Bonds"] },
    });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Plains") });
    expect(t.stack).toEqual([]);
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
  });
});

describe("603.2d et 707.10 : Echoes of Eternity (deck The Vision)", () => {
  it("la capacité « quand vous lancez ce sort » d'un sort incolore se déclenche une fois de plus ; le sort est copié", () => {
    // Décision (Modern Horizons 3) : Echoes of Eternity touche aussi les capacités déclenchées des sorts incolores que vous
    // contrôlez, comme « quand vous lancez ce sort » ; la copie d'un sort de permanent devient un jeton.
    let s = scenario({
      p1: { battlefield: ["Echoes of Eternity", ...lands("Wastes", 7)], hand: ["Ugin, Eye of the Storms"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Sol Ring"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ugin, Eye of the Storms") });
    // Chaque exil vise un permanent coloré différent : Bear Cub, puis Shivan Dragon.
    const wanted = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Shivan Dragon")];
    for (let i = 0; i < 200 && !(s.stack.length === 0 && s.triggers.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        const req = p.request;
        const pick =
          req.type === "pick" && req.intent === "triggerTarget" ? wanted.find((id) => req.options.includes(id)) : undefined;
        if (pick) wanted.splice(wanted.indexOf(pick), 1);
        s = act(s, p.player, { type: "choose", values: pick ? [pick] : req.suggested });
      } else break;
    }
    // Deux exils (déclenchement doublé) : les deux permanents colorés ; Sol Ring (incolore) reste.
    expect(idsOf(s, "p2", "battlefield", "Sol Ring")).toHaveLength(1);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(2);
    // Le sort et sa copie (un jeton) : la règle des légendes n'en laisse qu'un.
    expect(s.battlefield.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Ugin, Eye of the Storms")).toHaveLength(1);
  });
});

describe("500.7 : Gerrard's Hourglass Pendant (deck The Vision)", () => {
  it("un joueur qui devrait commencer un tour supplémentaire le passe, quel que soit le contrôleur du Pendentif", () => {
    let s = scenario({
      p1: { hand: ["Temporal Manipulation"], battlefield: lands("Island", 5) },
      p2: { battlefield: ["Gerrard's Hourglass Pendant"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Temporal Manipulation") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.step === "main1");
    // Le tour supplémentaire de p1 est passé : le tour suivant est celui de p2.
    expect([s.turn.number, s.turn.active]).toEqual([4, "p2"]);
  });
});

describe("Deck Dark Leo & Shredder : rulings", () => {
  const throughCombat = (s0: GameState): GameState => {
    let s = s0;
    for (let i = 0; i < 300 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return s;
  };

  it("509.1h et 702.49c : un Ninja mis sur le champ de bataille attaquant par le ninjutsu est non bloqué (Throatseeker)", () => {
    let s = scenario({ p1: { battlefield: ["Throatseeker", "Bear Cub", ...lands("Swamp", 4)], hand: ["Okiba-Gang Shinobi"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passAccepting(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    const okiba = idOf(s, "p1", "hand", "Okiba-Gang Shinobi");
    const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === okiba);
    s = act(s, "p1", {
      type: "activate",
      source: okiba,
      ability: o?.type === "activate" ? o.ability : -1,
      targets: {},
      picks: { returnAttacker: [bear] },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const ninja = idOf(s, "p1", "battlefield", "Okiba-Gang Shinobi");
    expect(chars(s, ninja).keywords).toContain("lifelink");
    s = throughCombat(s);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Wound Reflection : les PV perdus ce tour-ci, sans compter ceux gagnés", () => {
    let s = scenario({ p1: { battlefield: ["Wound Reflection", "Bear Cub"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }] });
    s = throughCombat(s);
    gainLife(s, "p2", 5);
    expect(s.players.p2?.life).toBe(23);
    s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
    expect(s.players.p2?.life).toBe(21);
  });

  it("Akroma's Will : le commandant est vérifié au lancement ; parti ensuite, les deux modes s'appliquent", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions", ...lands("Plains", 4)], hand: ["Akroma's Will"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const o = s.objects[lions];
    if (!o) throw new Error("Savannah Lions");
    s.commander = { cards: { [o.uid]: { owner: "p1", defId: o.defId, casts: 0, damage: {} } } };
    bump(s);
    const will = idOf(s, "p1", "hand", "Akroma's Will");
    const both = legalActions(s, "p1")
      .flatMap((a) => (a.type === "cast" && a.card === will ? a.modes : []))
      .find((m) => m.label?.startsWith("Both"));
    expect(both).toBeDefined();
    s = act(s, "p1", { type: "cast", card: will, mode: both?.index } as never);
    // En réponse, le commandant meurt.
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [lions] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(0);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "lifelink", "indestructible"]));
  });

  it("Archetype of Courage : la double initiative d'une créature adverse n'est pas touchée", () => {
    const s = scenario({
      p1: { battlefield: ["Archetype of Courage"] },
      p2: { battlefield: ["Leonardo, Worldly Warrior"] },
    });
    expect(chars(s, idOf(s, "p2", "battlefield", "Leonardo, Worldly Warrior")).keywords).toContain("doubleStrike");
  });
});
