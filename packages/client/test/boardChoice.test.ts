import type { CardFace, ChoiceRequest, GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  boardPick,
  choiceSource,
  type PickRequest,
  pickValid,
  shortPrompt,
  shownOptions,
  togglePick,
} from "../src/prompts/boardChoice";

const perm = (id: string, controller: string) => ({ id, controller }) as unknown as ObjectView;
const pick = (over: Partial<PickRequest> = {}): ChoiceRequest => ({
  type: "pick",
  intent: "other",
  prompt: "Choose up to two creatures",
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

describe("choice on the board", () => {
  it("is made on the board when all options are permanents (of both sides)", () => {
    expect(boardPick(view(pick()))?.options).toEqual(["a", "b"]);
  });

  it("accepts players among the options, not cards outside the battlefield", () => {
    expect(boardPick(view(pick({ options: ["a", "p2"] })))).not.toBeNull();
    expect(boardPick(view(pick({ options: ["a", "gy1"] })))).toBeNull();
  });

  it("keeps the window for a choice between players only, labels, or another player's decision", () => {
    expect(boardPick(view(pick({ options: ["p1", "p2"] })))).toBeNull();
    expect(boardPick(view(pick({ labels: { a: "Mode A" } })))).toBeNull();
    const v = view(pick());
    expect(boardPick({ ...v, viewer: "p2" })).toBeNull();
    expect(boardPick(view({ type: "yesNo", intent: "other", prompt: "?", suggested: [1] }))).toBeNull();
  });

  it("selects, removes and respects the maximum", () => {
    const req = pick() as PickRequest;
    expect(togglePick(req, [], "a")).toEqual(["a"]);
    expect(togglePick(req, ["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(req, ["a", "b"], "c")).toEqual(["a", "b"]);
    expect(togglePick(req, ["a", "b"], "a")).toEqual(["b"]);
    expect(togglePick({ ...req, max: 1 }, ["a"], "b")).toEqual(["b"]);
    expect(pickValid({ ...req, min: 1 }, [])).toBe(false);
    expect(pickValid(req, [])).toBe(true);
  });

  it("shows the resolving card as the effect's source", () => {
    expect(choiceSource(view(pick()))?.face.name).toBe("Growth");
  });

  it("removes the reminder of its source from the prompt", () => {
    const source = { face: { name: "Felidar Savior" } as CardFace, effect: "+1/+1 counters" };
    expect(shortPrompt("Felidar Savior — +1/+1 counters : choose a target", source)).toBe("choose a target");
    expect(shortPrompt("Felidar Savior: choose", { face: source.face })).toBe("choose");
    expect(shortPrompt("Sacrifice two permanents", source)).toBe("Sacrifice two permanents");
  });

  it("shows the card of the trigger whose targets are being chosen", () => {
    const v = view(pick());
    const pending = { ...v.pending, purpose: { kind: "triggerTarget" }, source: { face: { name: "Elf" }, effect: "ETB" } };
    expect(choiceSource({ ...v, pending } as unknown as GameView)?.face.name).toBe("Elf");
  });
});

describe("shownOptions: options of a choice window", () => {
  const library = Array.from({ length: 90 }, (_, i) => `o${i}`);
  // i18n-ignore: card names in both languages, the search reads the French one
  const name = (id: string) => (id === "o85" ? "Sol Ring Anneau solaire" : `Forest Forêt ${id}`);

  it("a whole library searched: every card is shown (Commander, 90 cards)", () => {
    expect(shownOptions(library, [], "", name, true)).toHaveLength(90);
  });

  it("the search reads the card's name, accents and case folded", () => {
    expect(shownOptions(library, [], "anneau", name, true)).toEqual(["o85"]);
    expect(shownOptions(library, [], "FORET o1", name, true)).toEqual(["o1", ...library.filter((id) => /^o1\d$/.test(id))]);
  });

  it("the selection comes first and stays shown", () => {
    expect(shownOptions(library, ["o40"], "anneau", name, true)).toEqual(["o40", "o85"]);
  });

  it("a long list of words is cut at 60, short lists are left alone", () => {
    expect(shownOptions(library, [], "", name, false)).toHaveLength(60);
    expect(shownOptions(["a", "b"], [], "zzz", name, false)).toEqual(["a", "b"]);
  });
});
