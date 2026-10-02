/**
 * Sauvegarde de la partie locale en cours (contre l'IA), pour la reprendre exactement où elle en était quand la page
 * est rouverte : l'enregistrement de la partie (graine, decks, décisions) suffit, le moteur étant déterministe ; le
 * worker la rejoue puis reprend la main. Le tutoriel et le bac à sable ne sont pas enregistrés, donc pas sauvegardés.
 */
import type { AiLevel } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import { type GameRecord, isGameRecord } from "@mtgx/engine";
import type { LogLine } from "./i18n";

/** Match BO3 contre l'IA en cours (même forme que `LocalMatch` du store). */
export interface SavedMatch {
  bestOf: 3;
  wins: Record<string, number>;
  game: number;
  winner: string | null;
  deck: { main: DeckEntries; sideboard: DeckEntries };
  original: { main: DeckEntries; sideboard: DeckEntries };
  aiDeck: DeckEntries;
  aiLevel?: AiLevel;
}

export interface SavedLocalGame {
  version: 1;
  record: GameRecord;
  aiLevel?: AiLevel;
  /** Match BO3 au début de la manche en cours (la manche reprise compte en se terminant), s'il y en a un. */
  match: SavedMatch | null;
  /** Journal de la partie au moment de la sauvegarde. */
  log?: LogLine[];
  savedAt: string;
}

const KEY = "mtgmate.localGame";

export function loadSavedGame(): SavedLocalGame | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SavedLocalGame> | null;
    if (raw?.version !== 1 || !isGameRecord(raw.record)) return null;
    return {
      version: 1,
      record: raw.record,
      aiLevel: raw.aiLevel,
      match: raw.match ?? null,
      log: Array.isArray(raw.log) ? raw.log : [],
      savedAt: raw.savedAt ?? "",
    };
  } catch {
    return null;
  }
}

export function storeSavedGame(game: SavedLocalGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // stockage plein ou indisponible : la partie ne pourra pas être reprise
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // stockage indisponible
  }
}

/**
 * Enregistrement tenu à jour à partir des messages du worker (`saved`) : l'en-tête une fois, puis les décisions
 * nouvelles. Les écritures sont regroupées (au plus une toutes les `delayMs`), et `flush` écrit tout de suite (fermeture
 * de la page).
 */
export class SaveWriter {
  private record: GameRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly meta: () => Omit<SavedLocalGame, "version" | "record" | "savedAt">,
    private readonly write: (g: SavedLocalGame) => void = storeSavedGame,
    private readonly delayMs = 400,
  ) {}

  /** Reprise : l'enregistrement rejoué devient le point de départ. */
  start(record: GameRecord): void {
    this.record = structuredClone(record);
  }

  apply(msg: { header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }): void {
    if (msg.header) this.record = { ...structuredClone(msg.header), decisions: [], checkpoints: [] };
    if (!this.record) return;
    this.record.decisions.push(...msg.decisions);
    this.record.checkpoints = msg.checkpoints;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.record) this.write({ version: 1, record: this.record, ...this.meta(), savedAt: new Date().toISOString() });
  }

  /** Abandon de la sauvegarde (partie quittée) : plus aucune écriture. */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.record = null;
  }
}
