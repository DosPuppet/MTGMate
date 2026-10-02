/**
 * Exil face cachée (406.3 ; docs/plans/PLAN-C.md, lot C6) : une carte exilée face cachée n'est montrée qu'aux joueurs qui
 * peuvent la regarder, dans la vue comme dans les événements.
 */

import { describe, expect, it } from "vitest";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { HIDDEN_CARD_ID } from "../src/state";
import type { GameEvent, GameState } from "../src/types";
import { filterEvents, projectView } from "../src/view";
import { cast, exiled, idOf, lands, scenario, settle } from "./helpers";

const exileView = (s: GameState, viewer: string, id: string) => projectView(s, viewer).exile.find((o) => o.id === id);

describe("exil face cachée", () => {
  it("présage : seul le propriétaire voit la carte présagée (vue et événement)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Sozin's Comet"] } });
    const comet = idOf(s, "p1", "hand", "Sozin's Comet");
    const foretell = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === comet && a.label === "Présage");
    const step = submit(s, "p1", {
      type: "activate",
      source: comet,
      ability: foretell?.type === "activate" ? foretell.ability : -1,
    });
    const events: GameEvent[] = step.events;
    s = settle(step.state);
    const id = exiled(s, "Sozin's Comet")[0] as string;
    expect(exileView(s, "p1", id)?.name).toBe("Sozin's Comet");
    expect(exileView(s, "p2", id)?.defId).toBe(HIDDEN_CARD_ID);
    expect(exileView(s, "p2", id)?.name).toBe("");
    const theirs = filterEvents(events, "p2").find((e) => e.type === "foretold");
    expect(theirs).toEqual({ type: "foretold", player: "p1", defId: HIDDEN_CARD_ID });
  });

  it("Doomsday Excruciator : les bibliothèques exilées face cachée ne sont vues par personne", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 10), hand: ["Doomsday Excruciator"], library: lands("Swamp", 10) },
      p2: { library: [...Array(8).fill("Opt"), ...lands("Island", 6)] },
    });
    s = settle(cast(s, "p1", "Doomsday Excruciator"));
    expect(s.players.p2?.library).toHaveLength(6);
    const theirs = s.exile.filter((id) => s.objects[id]?.owner === "p2");
    expect(theirs).toHaveLength(8);
    for (const viewer of ["p1", "p2"]) {
      expect(theirs.every((id) => exileView(s, viewer, id)?.defId === HIDDEN_CARD_ID)).toBe(true);
    }
  });
});
