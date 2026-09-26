import { existsSync } from "node:fs";
import type { CardFace, GameEvent, GameView, ObjectView, StackItemView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { soundsFor } from "../src/audio/eventSounds";
import { SOUND_FILES, SOUNDS } from "../src/audio/sounds";

const land = (id: string, tapped: boolean, controller = "p1") =>
  ({ id, controller, tapped, types: ["Land"] }) as unknown as ObjectView;
const view = (over: Partial<GameView> = {}) => ({ viewer: "p1", battlefield: [], stack: [], ...over }) as unknown as GameView;
const faces: Record<string, CardFace> = {
  bear: { typeLine: "Creature — Bear" } as CardFace,
  bolt: { typeLine: "Instant" } as CardFace,
};
const keys = (events: GameEvent[], prev: GameView | null = null, v = view()) =>
  soundsFor(events, v, prev, faces).map((c) => c.key);

describe("sons des événements", () => {
  it("un son par action de jeu, du point de vue du joueur", () => {
    expect(
      keys([
        { type: "gameStart", startingPlayer: "p1" },
        { type: "turnStart", turn: 1, player: "p1" },
        { type: "draw", player: "p1" },
        { type: "draw", player: "p2" },
        { type: "playLand", player: "p1", objectId: "1", defId: "forest" },
        { type: "cast", player: "p2", stackId: "s1", defId: "bolt", targets: [] },
        { type: "activate", player: "p1", stackId: "s2", defId: "x", targets: [] },
        { type: "countered", stackId: "s1", defId: "bolt", by: "x" },
        { type: "token", objectId: "9", defId: "token:x", controller: "p1" },
        { type: "turnStart", turn: 2, player: "p2" },
      ]),
    ).toEqual(["shuffle", "turn", "draw", "land", "cast", "ability", "counter", "token"]);
  });

  it("combat : attaque, blocage, coups ; une grosse blessure et une perte de PV frappent plus fort", () => {
    expect(
      keys([
        { type: "attack", player: "p2", attackers: [{ id: "a", defId: "bear" }] },
        { type: "block", player: "p1", blocks: [] },
        { type: "damage", sourceDefId: "x", target: "a", targetDefId: "bear", amount: 2, combat: true },
        { type: "damage", sourceDefId: "x", target: "b", targetDefId: "bear", amount: 6, combat: true },
        { type: "damage", sourceDefId: "x", target: "p1", amount: 3, combat: true },
        { type: "life", player: "p1", delta: -3, life: 17 },
        { type: "life", player: "p2", delta: 2, life: 22 },
        { type: "dies", objectId: "a", defId: "bear", to: "graveyard" },
      ]),
    ).toEqual(["attack", "hit", "hitHeavy", "hitHeavy", "heal", "dies"]);
  });

  it("les délais suivent les effets visuels (0,22 s par blessure, gain ou mort)", () => {
    const cues = soundsFor(
      [
        { type: "damage", sourceDefId: "x", target: "a", targetDefId: "bear", amount: 1, combat: true },
        { type: "life", player: "p1", delta: -1, life: 19 },
        { type: "dies", objectId: "a", defId: "bear", to: "graveyard" },
      ],
      view(),
      null,
      faces,
    );
    expect(cues.map((c) => c.delay)).toEqual([0, 0.22, 0.44]);
  });

  it("un sort de permanent se pose à la résolution, pas un éphémère ni une capacité", () => {
    const prev = view({
      stack: [
        { id: "s1", kind: "spell" },
        { id: "s2", kind: "spell" },
        { id: "s3", kind: "ability" },
      ] as StackItemView[],
    });
    expect(
      keys(
        [
          { type: "resolve", stackId: "s1", defId: "bear" },
          { type: "resolve", stackId: "s2", defId: "bolt" },
          { type: "resolve", stackId: "s3", defId: "bear" },
        ],
        prev,
      ),
    ).toEqual(["resolve"]);
  });

  it("victoire ou défaite", () => {
    expect(keys([{ type: "gameOver", winner: "p1" }])).toEqual(["win"]);
    expect(keys([{ type: "gameOver", winner: "p2" }])).toEqual(["lose"]);
  });

  it("plus de 3 fois le même son : une seule lecture, plus forte", () => {
    const deaths: GameEvent[] = Array.from({ length: 12 }, (_, i) => ({
      type: "dies",
      objectId: `t${i}`,
      defId: "token:x",
      to: "graveyard",
    }));
    const cues = soundsFor(deaths, view(), null, faces);
    expect(cues).toEqual([{ key: "dies", delay: 0, gain: 1.3 }]);
    expect(keys(deaths.slice(0, 3))).toEqual(["dies", "dies", "dies"]);
  });

  it("« tap » seulement pour vos terrains qui viennent d'être engagés", () => {
    const prev = view({ battlefield: [land("a", false), land("b", true), land("c", false, "p2")] });
    expect(keys([], prev, view({ battlefield: [land("a", true), land("b", true), land("c", true, "p2")] }))).toEqual(["tap"]);
    expect(keys([], prev, view({ battlefield: [land("a", false), land("b", true), land("c", true, "p2")] }))).toEqual([]);
  });

  it("chaque couche de son désigne un son existant", () => {
    for (const def of Object.values(SOUNDS)) if ("layer" in def) expect(SOUNDS).toHaveProperty(def.layer);
  });

  it("chaque fichier de la table est présent dans public/sounds", () => {
    const missing = SOUND_FILES.filter((f) => !existsSync(new URL(`../public/sounds/${f}`, import.meta.url)));
    expect(missing).toEqual([]);
  });
});
