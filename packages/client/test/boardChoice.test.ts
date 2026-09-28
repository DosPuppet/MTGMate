import type { CardFace, ChoiceRequest, GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { boardPick, choiceSource, type PickRequest, pickValid, shortPrompt, togglePick } from "../src/prompts/boardChoice";

const perm = (id: string, controller: string) => ({ id, controller }) as unknown as ObjectView;
const pick = (over: Partial<PickRequest> = {}): ChoiceRequest => ({
  type: "pick",
  intent: "other",
  prompt: "Choisissez jusqu'à deux créatures",
  options: ["a", "b"],
  min: 0,
  max: 2,
  suggested: ["a"],
  ...over,
});
const view = (request: ChoiceRequest, over: Partial<GameView> = {}) =>
  ({
    viewer: "p1",
    players: { p1: {}, p2: {} },
    battlefield: [perm("a", "p1"), perm("b", "p2"), perm("c", "p2")],
    stack: [{ id: "s1", name: "Growth" }],
    pending: { kind: "choice", player: "p1", request, purpose: { kind: "effect" } },
    ...over,
  }) as unknown as GameView;

describe("choix sur le plateau", () => {
  it("se fait sur le plateau quand toutes les options sont des permanents (des deux camps)", () => {
    expect(boardPick(view(pick()))?.options).toEqual(["a", "b"]);
  });

  it("accepte des joueurs parmi les options, pas des cartes hors du champ de bataille", () => {
    expect(boardPick(view(pick({ options: ["a", "p2"] })))).not.toBeNull();
    expect(boardPick(view(pick({ options: ["a", "gy1"] })))).toBeNull();
  });

  it("garde la fenêtre pour un choix entre joueurs seuls, des libellés ou la décision d'un autre joueur", () => {
    expect(boardPick(view(pick({ options: ["p1", "p2"] })))).toBeNull();
    expect(boardPick(view(pick({ labels: { a: "Mode A" } })))).toBeNull();
    const v = view(pick());
    expect(boardPick({ ...v, viewer: "p2" })).toBeNull();
    expect(boardPick(view({ type: "yesNo", intent: "other", prompt: "?", suggested: [1] }))).toBeNull();
  });

  it("sélectionne, retire et respecte le maximum", () => {
    const req = pick() as PickRequest;
    expect(togglePick(req, [], "a")).toEqual(["a"]);
    expect(togglePick(req, ["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(req, ["a", "b"], "c")).toEqual(["a", "b"]);
    expect(togglePick(req, ["a", "b"], "a")).toEqual(["b"]);
    expect(togglePick({ ...req, max: 1 }, ["a"], "b")).toEqual(["b"]);
    expect(pickValid({ ...req, min: 1 }, [])).toBe(false);
    expect(pickValid(req, [])).toBe(true);
  });

  it("montre la carte qui se résout comme source de l'effet", () => {
    expect(choiceSource(view(pick()))?.face.name).toBe("Growth");
  });

  it("retire de la consigne le rappel de sa source", () => {
    const source = { face: { name: "Felidar Savior" } as CardFace, effect: "marqueurs +1/+1" };
    expect(shortPrompt("Felidar Savior — marqueurs +1/+1 : choisissez une cible", source)).toBe("choisissez une cible");
    expect(shortPrompt("Felidar Savior : choisissez", { face: source.face })).toBe("choisissez");
    expect(shortPrompt("Sacrifiez 2 permanents", source)).toBe("Sacrifiez 2 permanents");
  });

  it("montre la carte du déclenchement dont on choisit les cibles", () => {
    const v = view(pick());
    const pending = { ...v.pending, purpose: { kind: "triggerTarget" }, source: { face: { name: "Elf" }, effect: "ETB" } };
    expect(choiceSource({ ...v, pending } as unknown as GameView)?.face.name).toBe("Elf");
  });
});
