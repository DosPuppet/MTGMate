/**
 * Audit des informations cachées (jeu en ligne) : à chaque décision de parties IA contre IA, rien de ce
 * que reçoit un joueur (vue, événements filtrés, faces) ne doit citer une carte qui n'existe que dans la
 * main ou la bibliothèque d'un adversaire et qui n'a jamais été rendue publique ni révélée à ce joueur.
 */
import { implementedCards } from "@mtgx/cards";
import {
  type CardDef,
  type Color,
  createGame,
  fallbackDecision,
  filterEvents,
  type GameState,
  projectView,
  RulesError,
  submit,
  visibleFaces,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { mulberry32, randomAgent } from "../src";

const ALL = implementedCards();
const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

function randomDeck(seed: number): CardDef[] {
  const rand = mulberry32(seed);
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, 2);
  const spells = ALL.filter((c) => !c.types.includes("Land") && c.colors.length > 0 && c.colors.every((x) => colors.includes(x)));
  const deck: CardDef[] = [];
  for (let i = 0; i < 36; i++) deck.push(spells[Math.floor(rand() * spells.length)] as CardDef);
  for (let i = 0; i < 24; i++) deck.push(ALL.find((c) => c.name === BASICS[colors[i % 2] as Color]) as CardDef);
  return deck;
}

/** Identifiants de définitions cités n'importe où dans une valeur JSON. */
function defIdsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) defIdsIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/defId$/i.test(k) && typeof v === "string") out.add(v);
      else if (k === "defIds" && Array.isArray(v)) for (const d of v) out.add(String(d));
      else defIdsIn(v, out);
    }
  }
  return out;
}

const PUBLIC_ZONES = new Set(["battlefield", "graveyard", "exile", "stack", "command"]);

function auditGame(seed: number): string[] {
  const players = ["p1", "p2"];
  let { state } = createGame({
    seed,
    players: players.map((id, i) => ({ id, name: id, deck: randomDeck(seed * 31 + i) })),
  });
  const agents = Object.fromEntries(players.map((p, i) => [p, randomAgent(seed * 7 + i)]));
  const publicSeen = new Set<string>();
  // Chaque joueur connaît sa propre decklist ; puis ce qui lui est révélé par ses propres décisions.
  const known: Record<string, Set<string>> = Object.fromEntries(
    players.map((p) => [
      p,
      new Set(
        Object.values(state.objects)
          .filter((o) => o.owner === p)
          .map((o) => o.defId),
      ),
    ]),
  );
  const leaks: string[] = [];
  const check = (s: GameState, events: Parameters<typeof filterEvents>[0]) => {
    for (const o of Object.values(s.objects)) if (PUBLIC_ZONES.has(o.zone)) publicSeen.add(o.defId);
    for (const item of s.stack) publicSeen.add(item.sourceDefId);
    for (const v of players) {
      const view = projectView(s, v);
      if (view.pending?.kind === "choice") for (const o of view.pending.objects ?? []) known[v]?.add(o.defId);
      const secret = new Set<string>();
      for (const o of Object.values(s.objects)) {
        if (o.owner === v || (o.zone !== "hand" && o.zone !== "library")) continue;
        if (!publicSeen.has(o.defId) && !known[v]?.has(o.defId)) secret.add(o.defId);
      }
      const evs = filterEvents(events, v);
      const seen = defIdsIn([view, evs, Object.keys(visibleFaces(s, view, evs)).map((defId) => ({ defId }))]);
      for (const d of seen) {
        if (secret.has(d)) leaks.push(`seed ${seed}, tour ${s.turn.number} : ${v} voit ${d}`);
      }
    }
  };
  check(state, []);
  for (let i = 0; i < 2500 && state.pending && !state.over && leaks.length === 0; i++) {
    const p = state.pending;
    let r: ReturnType<typeof submit>;
    try {
      r = submit(state, p.player, (agents[p.player] as ReturnType<typeof randomAgent>)(state, p.player));
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      r = submit(state, p.player, fallbackDecision(state, p));
    }
    state = r.state;
    check(state, r.events);
  }
  return leaks;
}

describe("informations cachées", () => {
  it("aucun joueur ne reçoit une carte cachée d'un adversaire (vue, événements, faces)", () => {
    const leaks: string[] = [];
    for (let seed = 1; seed <= 20; seed++) leaks.push(...auditGame(seed));
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 120_000);
});
