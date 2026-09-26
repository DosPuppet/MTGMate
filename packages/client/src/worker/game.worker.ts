/**
 * Partie contre l'IA, entièrement dans le navigateur : le moteur, l'autopilot et l'IA
 * tournent ici, hors du thread de l'interface.
 */
import { heuristicAgent } from "@mtgx/ai";
import { buildDeck, card, TOKEN_SPECS } from "@mtgx/cards";
import { type CardFace, cardFace, createGame, createObject, createTokens, GameHost, type GameState } from "@mtgx/engine";
import type { FromWorker, Sandbox, ToWorker } from "../protocol";

const HUMAN = "p1";
let host: GameHost | null = null;

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function faces(): Record<string, CardFace> {
  const out: Record<string, CardFace> = {};
  for (const [id, def] of Object.entries(host?.state.defs ?? {})) out[id] = cardFace(def);
  return out;
}

/** Met en jeu les permanents du bac à sable, sans mal d'invocation. */
function applySandbox(s: GameState, sandbox: Sandbox): void {
  for (const [player, side] of Object.entries(sandbox)) {
    if (!s.players[player]) continue;
    for (const name of side.cards ?? []) {
      const def = card(name);
      s.defs[def.id] ??= def;
      const o = createObject(s, def.id, player, "battlefield");
      o.controlledSince = 0;
      if (def.loyalty) o.counters.loyalty = def.loyalty;
    }
    for (const [n, name] of side.tokens ?? []) {
      const spec = TOKEN_SPECS[name];
      if (!spec) continue;
      for (const id of createTokens(s, player, spec, n)) {
        const o = s.objects[id];
        if (o) o.controlledSince = 0;
      }
    }
  }
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "start": {
      const { state, events } = createGame({
        seed: msg.seed,
        players: [
          { id: HUMAN, name: msg.playerName, deck: buildDeck({ main: msg.playerDeck }) },
          ...msg.aiDecks.map((deck, i) => ({
            id: `p${i + 2}`,
            name: msg.aiDecks.length > 1 ? `IA ${i + 1}` : "IA",
            deck: buildDeck({ main: deck }),
          })),
        ],
      });
      if (msg.sandbox && import.meta.env.DEV) applySandbox(state, msg.sandbox);
      host = new GameHost(
        state,
        {
          agents: Object.fromEntries(msg.aiDecks.map((_, i) => [`p${i + 2}`, heuristicAgent()])),
          aiDelay: 900,
          sleep,
          onUpdate: (_p, view, evts) => post({ type: "update", view, events: evts, faces: faces() }),
        },
        events,
      );
      await host.run();
      return;
    }
    case "decision": {
      if (!host) return;
      const error = await host.submitHuman(HUMAN, msg.decision);
      if (error) post({ type: "error", message: error });
      return;
    }
    case "settings": {
      if (!host) return;
      host.setSettings(HUMAN, msg.settings);
      await host.run();
      return;
    }
  }
};
