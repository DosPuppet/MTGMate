import type { ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  battlefieldRows,
  battlefieldSlots,
  fitBattlefield,
  MIN_W,
  type Slot,
  slotUnits,
  splitLines,
  TOKEN_GROUP_MIN,
  tokenSlots,
} from "../src/board/layout";

let next = 0;
function obj(over: Partial<ObjectView> & { types: ObjectView["types"] }): ObjectView {
  const id = `o${next++}`;
  return {
    id,
    uid: `u${id}`,
    defId: over.name ?? "x",
    name: "x",
    typeLine: "",
    manaCost: "",
    text: "",
    implemented: true,
    isToken: false,
    owner: "p1",
    controller: "p1",
    zone: "battlefield",
    subtypes: [],
    colors: [],
    tapped: false,
    damage: 0,
    counters: {},
    keywords: [],
    sick: false,
    attacking: false,
    blocking: null,
    attachedTo: null,
    chosen: null,
    ...over,
  };
}
const creature = (over: Partial<ObjectView> = {}) => obj({ types: ["Creature"], power: 2, toughness: 2, ...over });
const token = (name: string, over: Partial<ObjectView> = {}) =>
  creature({ name, defId: `token:${name}`, isToken: true, ...over });
const n = (k: number, f: () => ObjectView) => Array.from({ length: k }, f);

describe("rangées du champ de bataille", () => {
  it("créatures devant, planeswalkers au bout ; terrains puis artefacts et enchantements derrière", () => {
    const bear = creature({ name: "Bear" });
    const animatedLand = obj({ name: "Sanctuary", types: ["Land", "Creature"] });
    const vehicle = obj({ name: "Caravan", types: ["Artifact"] });
    const aura = obj({ name: "Pacifism", types: ["Enchantment"] });
    const walker = obj({ name: "Ajani", types: ["Planeswalker"] });
    const forest = obj({ name: "Forest", types: ["Land"] });
    const rows = battlefieldRows([vehicle, bear, forest, walker, animatedLand, aura]);
    expect(rows.creatures).toEqual([bear, animatedLand]);
    expect(rows.walkers).toEqual([walker]);
    expect(rows.lands).toEqual([forest]);
    expect(rows.support).toEqual([vehicle, aura]);
    const { front, back } = battlefieldSlots(rows);
    expect(front.map((s) => s.objs[0]?.name)).toEqual(["Bear", "Sanctuary", "Ajani"]);
    expect(back.map((s) => [s.objs[0]?.name, s.block])).toEqual([
      ["Forest", "lands"],
      ["Caravan", "support"],
      ["Pacifism", "support"],
    ]);
  });
});

describe("regroupement des jetons", () => {
  it(`regroupe à partir de ${TOKEN_GROUP_MIN} jetons identiques, pas en dessous`, () => {
    expect(tokenSlots(n(TOKEN_GROUP_MIN - 1, () => token("Rabbit"))).map((s) => s.kind)).toEqual(["single", "single", "single"]);
    const slots = tokenSlots(n(TOKEN_GROUP_MIN + 2, () => token("Rabbit")));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ kind: "tokens" });
    expect(slots[0]?.objs).toHaveLength(TOKEN_GROUP_MIN + 2);
  });

  it("ne regroupe pas les cartes qui ne sont pas des jetons", () => {
    expect(tokenSlots(n(6, () => creature({ name: "Bear", defId: "bear" })))).toHaveLength(6);
  });

  it("sépare les jetons dont l'état diffère (engagé, marqueurs, blessures, mal d'invocation, état d'interface)", () => {
    const base = n(4, () => token("Rabbit"));
    const odd = [
      token("Rabbit", { tapped: true }),
      token("Rabbit", { counters: { "+1/+1": 1 }, power: 3, toughness: 3 }),
      token("Rabbit", { damage: 1 }),
      token("Rabbit", { sick: true }),
    ];
    const slots = tokenSlots([...base, ...odd]);
    expect(slots.map((s) => [s.kind, s.objs.length])).toEqual([["tokens", 4], ...odd.map(() => ["single", 1])]);
    // Un attaquant choisi dans l'interface sort de la pile.
    const chosen = base[0]?.id;
    const split = tokenSlots(base, undefined, (o) => (o.id === chosen ? "attacking" : ""));
    expect(split.map((s) => s.kind)).toEqual(["single", "single", "single", "single"]);
  });

  it("un jeton qui porte une Aura ou un Équipement reste seul", () => {
    const tokens = n(5, () => token("Soldier"));
    const slots = tokenSlots(tokens, new Set([tokens[2]?.id as string]));
    expect(slots.map((s) => s.objs.length)).toEqual([4, 1]);
  });
});

describe("lignes et taille des cartes", () => {
  const singles = (k: number): Slot[] => n(k, () => creature()).map((o) => ({ kind: "single", objs: [o] }));

  it("splitLines coupe en deux lignes équilibrées, dans l'ordre", () => {
    const slots = singles(7);
    const [a, b] = splitLines(slots, 2);
    expect([a?.length, b?.length].sort()).toEqual([3, 4]);
    expect([...(a ?? []), ...(b ?? [])]).toEqual(slots);
    expect(splitLines(slots, 1)).toEqual([slots]);
    const three = splitLines(singles(9), 3);
    expect(three.map((l) => l.length)).toEqual([3, 3, 3]);
  });

  it("une seule ligne tant que les cartes tiennent en grand", () => {
    const fit = fitBattlefield(1600, 360, singles(5), singles(5));
    expect(fit).toMatchObject({ frontLines: 1, backLines: 1 });
    expect(fit.cardW).toBeGreaterThan(100);
  });

  it("passe sur 2 lignes quand cela donne des cartes plus grandes, puis rétrécit", () => {
    const one = fitBattlefield(1600, 360, singles(40), singles(2));
    expect(one.frontLines).toBe(2);
    const oneLineW = (1600 - 28 - 10 * 39) / 40;
    expect(one.cardW).toBeGreaterThan(oneLineW);
    const more = fitBattlefield(1600, 360, singles(60), singles(2));
    expect(more.frontLines).toBeGreaterThanOrEqual(2);
    expect(more.cardW).toBeLessThan(one.cardW);
    expect(more.cardW).toBeGreaterThanOrEqual(MIN_W);
  });

  it("dans une zone étroite (multijoueur), va au-delà de 2 lignes plutôt que de déborder", () => {
    const fit = fitBattlefield(420, 330, singles(30), singles(4));
    expect(fit.frontLines).toBeGreaterThan(2);
    const perLine = Math.ceil(30 / fit.frontLines);
    expect(perLine * fit.cardW + 10 * (perLine - 1)).toBeLessThanOrEqual(420 - 28);
  });

  it("une pile de jetons occupe à peine plus d'une carte", () => {
    const [stack] = tokenSlots(n(12, () => token("Goblin")));
    expect(slotUnits(stack as Slot)).toBeLessThan(1.2);
  });
});
