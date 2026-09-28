/**
 * Chaque leçon du tutoriel est rejouée sans navigateur : partie mise en scène, adversaire scripté, et pour chaque étape
 * la décision qu'elle attend (déduite de `allow`). Toutes les étapes doivent se terminer dans l'ordre : sinon,
 * un joueur qui suit le guide resterait bloqué.
 */
import { heuristicAgent } from "@mtgx/ai";
import { card } from "@mtgx/cards";
import { type GameEvent, GameHost, type GameView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { buildScenario, YOU } from "../src/scenario";
import { LESSONS } from "../src/tutorial/lessons";
import { type Ctx, inGraveyard, lifeOf, matches, onField, solve } from "../src/tutorial/runtime";

/** Ce qu'affirment les textes des leçons sur l'issue de la partie. */
const OUTCOMES: Record<string, (c: Ctx) => void> = {
  mana: (c) => {
    for (const n of ["Llanowar Elves", "Savannah Lions", "Bear Cub"]) expect(onField(n)(c), n).toBe(true);
  },
  attaque: (c) => {
    expect(lifeOf(c, "opponent")).toBe(18);
    expect(inGraveyard("Savannah Lions")(c)).toBe(true);
    expect(inGraveyard("Swab Goblin", "opponent")(c)).toBe(true);
  },
  blocage: (c) => {
    expect(lifeOf(c, "you")).toBe(18);
    expect(inGraveyard("Bear Cub")(c)).toBe(true);
    expect(inGraveyard("Goblin Boarders", "opponent")(c)).toBe(true);
  },
  sorts: (c) => expect(c.view.winner).toBe(c.view.viewer),
  pile: (c) => {
    expect(onField("Bear Cub")(c) && onField("Savannah Lions")(c)).toBe(true);
    expect(inGraveyard("Goblin Boarders", "opponent")(c)).toBe(true);
  },
  capacites: (c) => {
    expect(lifeOf(c, "you")).toBe(22);
    expect(lifeOf(c, "opponent")).toBe(14);
  },
  partie: (c) => expect(c.view.over).toBe(true),
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
    const where = `${lessonId}, étape ${i + 1}`;
    if (step.settings) host.setSettings(YOU, step.settings);
    if (step.next) continue;
    for (let n = 0; ; n++) {
      if (n > (step.free ? 3000 : 20)) throw new Error(`${where} : l'étape ne se termine pas`);
      const c = ctx();
      if (step.until?.(c)) break;
      if (c.view.over) throw new Error(`${where} : partie terminée avant la fin de l'étape`);
      if (step.free) {
        const err = await host.submitHuman(YOU, human(host.state, YOU));
        if (err) throw new Error(`${where} : ${err}`);
        continue;
      }
      const allow = (step.allow ?? []).find((a) => solve(a, c.view));
      const intent = allow ? solve(allow, c.view) : null;
      if (!allow || !intent) {
        // Étape de survol : le joueur survole la carte désignée.
        const t = step.target;
        if (typeof t === "object" && hovered !== t.card) {
          hovered = t.card;
          continue;
        }
        throw new Error(
          `${where} : rien à faire (décision en attente : ${JSON.stringify(c.view.pending)}, tour ${c.view.turn.number} ${c.view.turn.step}, main ${c.view.hand.map((o) => o.name)})`,
        );
      }
      // La décision déduite doit passer la garde du guidage.
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
    it(`leçon « ${lesson.title} » : toutes les étapes se terminent`, async () => {
      const end = await play(lesson.id);
      OUTCOMES[lesson.id]?.(end);
    });
  }

  it("les ids des leçons sont uniques", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });
});
