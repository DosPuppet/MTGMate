import {
  type CardDef,
  type CardFace,
  filterEvents,
  type GameEvent,
  type GameRecord,
  type GameState,
  type GameView,
  projectView,
  RULES_VERSION,
  replayChecked,
  visibleFaces,
} from "@mtgx/engine";
import type { ClientMessage, ServerMessage } from "@mtgx/server/protocol";
import { hostNameCatalog } from "./names";
import type { FromWorker, ToWorker } from "./protocol";

/** Une partie en cours : locale (Web Worker, contre l'IA) ou distante (serveur, contre un joueur). */
export interface Session {
  send(m: ToWorker): void;
  close(): void;
}

/** Partie locale contre l'IA : le moteur tourne dans un Web Worker. */
export class LocalSession implements Session {
  private readonly worker: Worker;

  constructor(onMessage: (m: FromWorker) => void) {
    this.worker = new Worker(new URL("./worker/game.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
    // Erreur du moteur dans le worker : visible dans la console plutôt que silencieuse.
    this.worker.onerror = (e) => console.error("Erreur du worker de partie :", e.message);
    // Noms nommables (« choisissez un nom de carte ») : le worker n'embarque pas la base de cartes.
    this.worker.postMessage({ type: "names", catalog: hostNameCatalog() } satisfies ToWorker);
  }

  send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  close(): void {
    this.worker.terminate();
  }
}

/**
 * Production : fait télécharger le script du worker de partie (et le met en cache via le service worker) sans attendre
 * la première partie, pour qu'une partie contre l'IA puisse démarrer hors ligne.
 */
export function prefetchGameWorker(): void {
  const worker = new Worker(new URL("./worker/game.worker.ts", import.meta.url), { type: "module" });
  setTimeout(() => worker.terminate(), 10_000);
}

/** Adresse du serveur : même hôte que la page (/ws, redirigé vers le serveur par Vite en dev). */
export function serverUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

/**
 * Partie en ligne : WebSocket vers le serveur, qui fait tourner le moteur et fait autorité.
 * Les décisions et réglages partent comme pour une partie locale ; les messages du salon
 * (`room`, `opponent`, erreurs) sont remontés tels quels.
 */
export class RemoteSession implements Session {
  private readonly ws: WebSocket;
  private readonly outbox: string[] = [];
  private closing = false;

  constructor(
    onMessage: (m: ServerMessage) => void,
    /** Connexion perdue sans l'avoir demandé (réseau, serveur arrêté). */
    onLost: () => void,
  ) {
    this.ws = new WebSocket(serverUrl());
    this.ws.onopen = () => {
      for (const m of this.outbox.splice(0)) this.ws.send(m);
    };
    this.ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // message illisible : ignoré
      }
    };
    this.ws.onclose = () => {
      if (!this.closing) onLost();
    };
  }

  /** Message brut du protocole en ligne. */
  raw(m: ClientMessage): void {
    const data = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (this.ws.readyState === WebSocket.CONNECTING) this.outbox.push(data);
  }

  send(m: ToWorker): void {
    if (m.type === "decision") this.raw({ type: "decision", decision: m.decision });
    else if (m.type === "settings") this.raw({ type: "settings", settings: m.settings });
    else if (m.type === "export") this.raw({ type: "export" });
    // "start" : la partie est lancée par le serveur quand le second joueur arrive.
  }

  close(): void {
    this.closing = true;
    this.ws.close();
  }
}

/**
 * Replay d'une partie enregistrée : les états sont recalculés à l'avance (`replayChecked`), puis montrés un par un depuis
 * le point de vue choisi. Les décisions de l'interface sont ignorées. Une partie enregistrée par une autre version des
 * règles peut ne plus se rejouer à l'identique : le replay s'arrête alors à la première divergence (`warning`).
 */
export class ReplaySession implements Session {
  readonly states: GameState[] = [];
  /** Événements produits par chaque décision (`events[i]` : ceux qui mènent à `states[i]`). */
  private readonly events: GameEvent[][] = [];
  /** Avertissement à afficher : replay arrêté avant la fin, ou version des règles différente. */
  readonly warning: string | null;

  constructor(record: GameRecord, resolve: (name: string) => CardDef) {
    hostNameCatalog();
    const { divergence } = replayChecked(record, resolve, (state, events) => {
      this.states.push(state);
      this.events.push(events);
    });
    const other = (record.rules ?? 0) !== RULES_VERSION;
    const version = other ? " (partie enregistrée avec une version antérieure des règles)" : "";
    this.warning = divergence
      ? `Replay arrêté à la décision ${divergence.index} sur ${record.decisions.length}${version}.`
      : other
        ? `Partie enregistrée avec une autre version des règles (${record.rules ?? 0}, moteur : ${RULES_VERSION}).`
        : null;
  }

  /** Vue du joueur `viewer` à l'étape `i` (sans décision en attente : le replay ne se joue pas). */
  frame(
    i: number,
    viewer: string,
    withEvents: boolean,
  ): { view: GameView; events: GameEvent[]; faces: Record<string, CardFace> } {
    const state = this.states[i] as GameState;
    const events = withEvents ? filterEvents(this.events[i] ?? [], viewer) : [];
    const view = { ...projectView(state, viewer), pending: null };
    return { view, events, faces: visibleFaces(state, view, events) };
  }

  send(_m: ToWorker): void {}

  close(): void {}
}
