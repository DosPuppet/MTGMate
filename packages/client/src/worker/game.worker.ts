/**
 * Partie contre l'IA, entièrement dans le navigateur : le moteur, l'autopilot et l'IA
 * tournent ici, hors du thread de l'interface.
 */
import { heuristicAgent } from "@mtgx/ai";
import { buildDeck, deckById } from "@mtgx/cards";
import { type CardFace, cardFace, createGame, GameHost } from "@mtgx/engine";
import type { FromWorker, ToWorker } from "../protocol";

const HUMAN = "p1";
let host: GameHost | null = null;

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function faces(): Record<string, CardFace> {
  const out: Record<string, CardFace> = {};
  for (const [id, def] of Object.entries(host?.state.defs ?? {})) out[id] = cardFace(def);
  return out;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "start": {
      const { state, events } = createGame({
        seed: msg.seed,
        players: [
          { id: HUMAN, name: msg.playerName, deck: buildDeck(deckById(msg.playerDeck)) },
          ...msg.aiDecks.map((deck, i) => ({
            id: `p${i + 2}`,
            name: msg.aiDecks.length > 1 ? `IA ${i + 1}` : "IA",
            deck: buildDeck(deckById(deck)),
          })),
        ],
      });
      host = new GameHost(
        state,
        {
          agents: Object.fromEntries(msg.aiDecks.map((_, i) => [`p${i + 2}`, heuristicAgent()])),
          aiDelay: 650,
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
