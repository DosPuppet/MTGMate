/**
 * Tests tirés des décisions officielles (rulings Scryfall et règles complètes) pour les interactions fréquentes du méta :
 * lien de vie, copies, remplacements, nettoyage (docs/plans/PLAN-R.md, lot R7).
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { eventReplacement, fx, graveyardReplacement, ref, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { counterItem } from "../src/stack";
import { changeCounters, chars } from "../src/state";
import { addPlayerEffect } from "../src/statics";
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
