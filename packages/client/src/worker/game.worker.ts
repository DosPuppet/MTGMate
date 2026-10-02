/**
 * Partie contre l'IA, entièrement dans le navigateur : le moteur, l'autopilot et l'IA
 * tournent ici, hors du thread de l'interface.
 */
import { aiAgent } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import {
  type CardDef,
  createObject,
  createRecordedGame,
  createTokens,
  GameHost,
  type GameRecord,
  type GameState,
  RULES_VERSION,
  registerDef,
  replayChecked,
  visibleFaces,
} from "@mtgx/engine";
import type { FromWorker, Sandbox, ToWorker } from "../protocol";
import { AI_BUDGET, buildScenario, OPPONENT } from "../scenario";

const HUMAN = "p1";
let host: GameHost | null = null;
/** Décisions de l'enregistrement déjà envoyées à l'interface (sauvegarde de la partie). */
let sent = 0;

/** Envoie à l'interface les décisions enregistrées depuis le dernier envoi (`header` : au départ de la partie). */
function postProgress(header?: GameRecord): void {
  const rec = host?.record;
  if (!rec || (!header && rec.decisions.length <= sent)) return;
  post({
    type: "saved",
    ...(header ? { header: { ...structuredClone(header), decisions: [], checkpoints: [] } } : {}),
    decisions: rec.decisions.slice(sent),
    checkpoints: structuredClone(rec.checkpoints ?? []),
  });
  sent = rec.decisions.length;
}

/** IA adverses d'une partie (sièges p2, p3…), avec leur graine dérivée de celle de la partie. */
function aiAgents(seed: number, opponents: number, level: Parameters<typeof aiAgent>[0] | undefined) {
  return Object.fromEntries(
    Array.from({ length: opponents }, (_, i) => [
      `p${i + 2}`,
      aiAgent(level ?? "medium", { seed: seed + i + 1, budget: AI_BUDGET, players: opponents + 1 }),
    ]),
  );
}
/** Définitions reçues avec le message « start » (par nom). */
let defs: Record<string, CardDef> = {};

function card(name: string): CardDef {
  const d = defs[name];
  if (!d) throw new Error(`Carte inconnue : ${name}`);
  return d;
}

function buildDeck(entries: DeckEntries): CardDef[] {
  return entries.flatMap(([n, name]) => Array.from({ length: n }, () => card(name)));
}

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tutoriel : l'adversaire attend pendant une explication. */
let paused = false;
const resumers: (() => void)[] = [];
const gate = () => (paused ? new Promise<void>((r) => resumers.push(r)) : null);

/** Met en jeu les permanents du bac à sable, sans mal d'invocation. */
function applySandbox(s: GameState, sandbox: Sandbox): void {
  for (const [player, side] of Object.entries(sandbox)) {
    if (!s.players[player]) continue;
    for (const name of side.cards ?? []) {
      const def = card(name);
      registerDef(s, def);
      const o = createObject(s, def.id, player, "battlefield");
      o.controlledSince = 0;
      if (def.loyalty) o.counters.loyalty = def.loyalty;
    }
    for (const [zone, names] of [
      ["hand", side.hand],
      ["graveyard", side.graveyard],
    ] as const) {
      for (const name of names ?? []) {
        const def = card(name);
        registerDef(s, def);
        createObject(s, def.id, player, zone);
      }
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
  // Attachements ensuite : l'hôte peut appartenir à un autre joueur (Aura sur une créature adverse).
  for (const [player, side] of Object.entries(sandbox)) {
    for (const [name, hostName, hostPlayer] of side.attach ?? []) {
      const def = card(name);
      const host = Object.values(s.objects).find(
        (o) =>
          o.zone === "battlefield" &&
          o.controller === (hostPlayer ?? player) &&
          s.defs[o.defId]?.name === hostName &&
          !o.attachedTo,
      );
      if (!host || !s.players[player]) continue;
      registerDef(s, def);
      const o = createObject(s, def.id, player, "battlefield");
      o.controlledSince = 0;
      o.attachedTo = host.id;
      // The Aetherspark : un planeswalker-Équipement arrive avec sa loyauté.
      if (def.loyalty) o.counters.loyalty = def.loyalty;
    }
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  // Une erreur du moteur ne doit pas rester silencieuse (rejet de promesse dans le worker) : l'interface l'affiche.
  handle(e.data).catch((err: unknown) => {
    console.error(err);
    post({ type: "error", message: `Erreur du moteur : ${err instanceof Error ? err.message : String(err)}` });
  });
};

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case "start": {
      defs = msg.defs;
      paused = false;
      if (msg.scenario) {
        const { state, events, opponent } = buildScenario(msg.scenario, card, msg.seed, msg.playerName);
        host = new GameHost(
          state,
          {
            agents: { [OPPONENT]: opponent },
            // Un débutant doit pouvoir suivre chaque action de l'adversaire.
            aiDelay: msg.fast && import.meta.env.DEV ? 0 : 1400,
            sleep,
            gate,
            frames: true,
            onUpdate: (_p, view, evts) =>
              post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} }),
          },
          events,
        );
        await host.run();
        return;
      }
      const { state, events, record } = createRecordedGame({
        seed: msg.seed,
        startingPlayer: msg.startingPlayer,
        players: [
          { id: HUMAN, name: msg.playerName, deck: buildDeck(msg.playerDeck) },
          ...msg.aiDecks.map((deck, i) => ({
            id: `p${i + 2}`,
            name: msg.aiDecks.length > 1 ? `IA ${i + 1}` : "IA",
            deck: buildDeck(deck),
          })),
        ],
      });
      // Bac à sable : l'état de départ est modifié à la main, la partie ne peut pas être rejouée (pas d'enregistrement).
      const sandboxed = !!msg.sandbox && import.meta.env.DEV;
      if (sandboxed && msg.sandbox) applySandbox(state, msg.sandbox);
      sent = 0;
      host = new GameHost(
        state,
        {
          agents: aiAgents(msg.seed, msg.aiDecks.length, msg.aiLevel),
          aiDelay: msg.fast && import.meta.env.DEV ? 0 : 900,
          sleep,
          record: sandboxed ? undefined : record,
          // Sauvegarde locale : une empreinte par décision, vérifiée à la reprise (0,01 ms chacune).
          checkpointEvery: 1,
          // Mêmes faces qu'en ligne : seulement les cartes connues du joueur (pas la decklist adverse).
          frames: true,
          onUpdate: (_p, view, evts) => {
            post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} });
            postProgress();
          },
        },
        events,
      );
      if (!sandboxed) postProgress(record);
      await host.run();
      return;
    }
    case "resume": {
      defs = msg.defs;
      paused = false;
      const record = structuredClone(msg.record);
      let replayed: ReturnType<typeof replayChecked>;
      try {
        replayed = replayChecked(record, card);
      } catch (e) {
        post({ type: "resumeFailed", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      if (replayed.divergence) {
        const other = (record.rules ?? 0) !== RULES_VERSION ? " (le moteur a été mis à jour depuis)" : "";
        post({ type: "resumeFailed", message: `la partie ne se rejoue plus à l'identique${other}` });
        return;
      }
      sent = record.decisions.length;
      host = new GameHost(
        replayed.state,
        {
          agents: aiAgents(record.seed, record.players.length - 1, msg.aiLevel),
          aiDelay: msg.fast && import.meta.env.DEV ? 0 : 900,
          sleep,
          record,
          checkpointEvery: 1,
          frames: true,
          onUpdate: (_p, view, evts) => {
            post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} });
            postProgress();
          },
        },
        [],
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
    case "export": {
      post({ type: "record", record: host?.record ? structuredClone(host.record) : null });
      return;
    }
    case "pause": {
      paused = msg.paused;
      if (!paused) for (const r of resumers.splice(0)) r();
      return;
    }
    case "settings": {
      if (!host) return;
      host.setSettings(HUMAN, msg.settings);
      await host.run();
      return;
    }
  }
}
