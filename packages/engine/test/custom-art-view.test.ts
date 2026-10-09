/**
 * Custom art in the view (art sets, "custom:<set>" printings): an ability on the stack shows the art of its source's
 * printing, and the ability of a token, the art set of its owner's deck.
 */
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { legalActions } from "../src/legal";
import type { GameState, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import { act, scenario } from "./helpers";

const activate = (s: GameState, src: string) => {
  const o = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === src);
  if (o?.type !== "activate") throw new Error("no ability");
  return act(s, "p1", { type: "activate", source: src, ability: o.ability, targets: { p: ["p2"] } } as never);
};
const top = (s: GameState) => projectView(s, "p2").stack.at(-1);

describe("custom art in the view", () => {
  it("an ability on the stack shows the art set of its source (also once sacrificed)", () => {
    let s = scenario({ p1: { battlefield: ["Mishra's Bauble", "Mishra's Bauble"] } });
    const [a, b] = s.battlefield.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Mishra's Bauble");
    // The first Bauble takes the "nier" art set (as a precon would); the second has no custom printing.
    s.printings = { [s.objects[a ?? ""]?.uid ?? ""]: "custom:nier" };
    // The Bauble is sacrificed as a cost: its last known information still gives the art.
    s = activate(s, a ?? "");
    expect(top(s)?.customArt).toBe("nier");
    s = activate(s, b ?? "");
    expect(top(s)?.customArt).toBeUndefined();
  });

  it("a token's ability shows the art set of its owner's deck", () => {
    let s = scenario({ p1: { battlefield: ["Mishra's Bauble", "Island", "Island"] } });
    // p1's deck uses the "mario" set (one card is enough).
    s.printings = { [s.objects[s.battlefield[0] ?? ""]?.uid ?? ""]: "custom:mario" };
    const clue: TokenSpec = {
      name: "Clue",
      colors: [],
      types: ["Artifact"],
      subtypes: ["Clue"],
      abilities: [
        {
          kind: "activated",
          cost: { mana: { generic: 2, colored: {}, x: 0 } },
          targets: [],
          effects: [{ op: "draw", who: { kind: "you" }, amount: 1 }],
        },
      ],
    };
    const [token] = createTokens(s, "p1", clue, 1);
    s = activate(s, token ?? "");
    expect(top(s)?.customArt).toBe("mario");
  });
});
