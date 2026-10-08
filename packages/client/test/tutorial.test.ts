/**
 * Each tutorial lesson is replayed without a browser: staged game, scripted opponent, and for each step
 * the decision it expects (deduced from `allow`). All the steps must finish in order: otherwise,
 * a player following the guide would be stuck.
 */
import { heuristicAgent } from "@mtgx/ai";
import { card } from "@mtgx/cards";
import { type GameEvent, GameHost, type GameView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { buildScenario, YOU } from "../src/scenario";
import { LESSONS } from "../src/tutorial/lessons";
import { type Ctx, inGraveyard, lifeOf, matches, onField, solve } from "../src/tutorial/runtime";

/** What the lesson texts claim about the outcome of the game. */
const OUTCOMES: Record<string, (c: Ctx) => void> = {
  mana: (c) => {
    for (const n of ["Llanowar Elves", "Savannah Lions", "Bear Cub"]) expect(onField(n)(c), n).toBe(true);
  },
  attack: (c) => {
    expect(lifeOf(c, "opponent")).toBe(18);
    expect(inGraveyard("Savannah Lions")(c)).toBe(true);
    expect(inGraveyard("Swab Goblin", "opponent")(c)).toBe(true);
  },
  block: (c) => {
    expect(lifeOf(c, "you")).toBe(18);
    expect(inGraveyard("Bear Cub")(c)).toBe(true);
    expect(inGraveyard("Goblin Boarders", "opponent")(c)).toBe(true);
  },
  spells: (c) => expect(c.view.winner).toBe(c.view.viewer),
  stack: (c) => {
    expect(onField("Bear Cub")(c) && onField("Savannah Lions")(c)).toBe(true);
    expect(inGraveyard("Goblin Boarders", "opponent")(c)).toBe(true);
  },
  abilities: (c) => {
    expect(lifeOf(c, "you")).toBe(22);
    expect(lifeOf(c, "opponent")).toBe(14);
  },
  game: (c) => expect(c.view.over).toBe(true),
};

async function play(lessonId: string): Promise<Ctx> {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson) throw new Error(lessonId);
  const { state, events, opponent } = buildScenario(lesson.scenario, card, 1);
  let view: GameView | null = null;
  let last: GameEvent[] = [];
  const host = new GameHost(
    state,
    {
      agents: { p2: opponent },
      onUpdate: (_p, v, e) => {
        view = v;
        last = e;
      },
    },
    events,
  );
  await host.run();
  let hovered: string | null = null;
  const ctx = (): Ctx => ({ view: view as unknown as GameView, events: last, hovered });
  const human = heuristicAgent();
  for (const [i, step] of lesson.steps.entries()) {
    const where = `${lessonId}, step ${i + 1}`;
    if (step.settings) host.setSettings(YOU, step.settings);
    if (step.next) continue;
    for (let n = 0; ; n++) {
      if (n > (step.free ? 3000 : 20)) throw new Error(`${where}: the step doesn't finish`);
      const c = ctx();
      if (step.until?.(c)) break;
      if (c.view.over) throw new Error(`${where}: game over before the end of the step`);
      if (step.free) {
        const err = await host.submitHuman(YOU, human(host.state, YOU));
        if (err) throw new Error(`${where} : ${err}`);
        continue;
      }
      const allow = (step.allow ?? []).find((a) => solve(a, c.view));
      const intent = allow ? solve(allow, c.view) : null;
      if (!allow || !intent) {
        // Hover step: the player hovers the designated card.
        const t = step.target;
        if (typeof t === "object" && hovered !== t.card) {
          hovered = t.card;
          continue;
        }
        throw new Error(
          `${where}: nothing to do (pending decision: ${JSON.stringify(c.view.pending)}, turn ${c.view.turn.number} ${c.view.turn.step}, hand ${c.view.hand.map((o) => o.name)})`,
        );
      }
      // The deduced decision must pass the guidance guard.
      expect(matches(allow, intent, c.view), where).toBe(true);
      if (intent.type === "endTurn") {
        host.setSettings(YOU, { passUntilTurn: c.view.turn.number });
        await host.run();
        continue;
      }
      const err = await host.submitHuman(YOU, intent);
      if (err) throw new Error(`${where} : ${err}`);
    }
  }
  return ctx();
}

describe("tutoriel", () => {
  for (const lesson of LESSONS) {
    it(`lesson "${lesson.title}": all the steps finish`, async () => {
      const end = await play(lesson.id);
      OUTCOMES[lesson.id]?.(end);
    });
  }

  it("lesson ids are unique", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });
});
