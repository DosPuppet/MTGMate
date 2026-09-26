import type { ClientMessage, ServerMessage } from "@mtgx/server/protocol";
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
  }

  send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  close(): void {
    this.worker.terminate();
  }
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
    // "start" : la partie est lancée par le serveur quand le second joueur arrive.
  }

  close(): void {
    this.closing = true;
    this.ws.close();
  }
}
