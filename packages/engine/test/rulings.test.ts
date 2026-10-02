/**
 * Tests tirés des décisions officielles (rulings Scryfall et règles complètes) pour les interactions fréquentes du méta :
 * lien de vie, copies, remplacements, nettoyage (docs/plans/PLAN-R.md, lot R7).
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { eventReplacement, fx, graveyardReplacement, ref, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { counterItem } from "../src/stack";
import { changeCounters, chars } from "../src/state";
import { addPlayerEffect } from "../src/statics";
import { matchesObjectFilter } from "../src/targets";
import { requiredBlocks, stateBasedActions } from "../src/turn";
import type { CardDef, GameState } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, passAccepting, passUntil, scenario } from "./helpers";

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
});
