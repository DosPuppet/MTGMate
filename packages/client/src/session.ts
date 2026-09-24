import type { FromWorker, ToWorker } from "./protocol";

/** Partie locale contre l'IA : le moteur tourne dans un Web Worker. */
export class LocalSession {
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
